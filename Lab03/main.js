const CITY_VIEWS = {
  all: { center: [-113.82, 52.36], zoom: 6.5, pitch: 32, bearing: 8 },
  Calgary: { center: [-114.0719, 51.0447], zoom: 10.7, pitch: 50, bearing: 18 },
  Edmonton: { center: [-113.4938, 53.5461], zoom: 10.6, pitch: 50, bearing: -16 },
};

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    esriWorldImagery: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
    esriTransportation: {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
    },
    esriLabels: {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
    },
  },
  layers: [
    { id: "esri-satellite", type: "raster", source: "esriWorldImagery" },
    { id: "esri-transportation", type: "raster", source: "esriTransportation", minzoom: 12 },
    { id: "esri-labels", type: "raster", source: "esriLabels", minzoom: 10 },
  ],
};

let map;
let hospitals = [];
let pulsePhase = 0;
let activeCity = "all";
let selectedHospitalId = null;

async function init() {
  const message = document.querySelector("#map-message");
  if (!window.maplibregl) {
    message.hidden = false;
    message.textContent = "No se pudo cargar MapLibre GL JS. Comprueba tu conexión a internet.";
    return;
  }

  map = new maplibregl.Map({
    container: "map",
    style: SATELLITE_STYLE,
    ...CITY_VIEWS.all,
    minZoom: 3,
    maxZoom: 18,
    maxPitch: 75,
    dragRotate: true,
    pitchWithRotate: true,
    touchPitch: true,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

  map.on("load", async () => {
    try {
      const response = await fetch("./hospitals.json");
      if (!response.ok) throw new Error("No se pudo cargar hospitals.json");
      hospitals = await response.json();
      addHospitalLayers();
      updateNetworkStress();
      updateTimestamp();
      setInterval(simulateWaitTimes, 4000);
      setInterval(animateCriticalPulse, 70);
    } catch (error) {
      console.error(error);
      message.hidden = false;
      message.textContent = "No fue posible cargar los datos locales de hospitales.";
    }
  });
  map.on("error", (event) => console.warn("MapLibre:", event.error));
}

function getStatus(minutes) {
  if (minutes < 60) return { key: "optimal", label: "Estado óptimo" };
  if (minutes <= 180) return { key: "moderate", label: "Demanda moderada" };
  return { key: "critical", label: "Saturación crítica" };
}

function formatWait(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} h ${remainder ? `${remainder} min` : ""}`.trim() : `${remainder} min`;
}

// GeoJSON y MapLibre usan siempre [longitud, latitud].
function hospitalsToGeoJSON() {
  return {
    type: "FeatureCollection",
    features: hospitals.map((hospital) => ({
      type: "Feature",
      id: hospital.id,
      geometry: { type: "Point", coordinates: [hospital.lon, hospital.lat] },
      properties: {
        id: hospital.id,
        name: hospital.name,
        city: hospital.city,
        wait_time_minutes: hospital.wait_time_minutes,
        patients_waiting: hospital.patients_waiting,
        capacity: hospital.capacity,
        status: getStatus(hospital.wait_time_minutes).key,
        pulse: pulsePhase,
      },
    })),
  };
}

function addHospitalLayers() {
  map.addSource("hospitals", { type: "geojson", data: hospitalsToGeoJSON() });
  const radius = ["interpolate", ["linear"], ["get", "wait_time_minutes"], 0, 7, 60, 11, 180, 17, 285, 24];
  const color = ["match", ["get", "status"], "optimal", "#63d49a", "moderate", "#ffbd4a", "critical", "#ff5a61", "#ffffff"];

  map.addLayer({
    id: "hospital-pulse", type: "circle", source: "hospitals", minzoom: 3, maxzoom: 18,
    filter: ["==", ["get", "status"], "critical"],
    paint: {
      "circle-color": "#ff5a61",
      "circle-radius": ["+", radius, ["*", ["get", "pulse"], 25]],
      "circle-opacity": ["-", 0.62, ["*", ["get", "pulse"], 0.62]],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ff5a61",
      "circle-stroke-opacity": ["-", 0.55, ["*", ["get", "pulse"], 0.55]],
    },
  });
  map.addLayer({
    id: "hospital-circles", type: "circle", source: "hospitals", minzoom: 3, maxzoom: 18,
    paint: { "circle-color": color, "circle-radius": radius, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-stroke-opacity": 0.9 },
  });
  map.addLayer({
    id: "hospital-highlight", type: "circle", source: "hospitals", minzoom: 3, maxzoom: 18,
    filter: ["==", ["get", "id"], ""],
    paint: { "circle-color": "#ffffff", "circle-radius": ["+", radius, 10], "circle-opacity": 0.15, "circle-stroke-width": 3, "circle-stroke-color": "#ffffff", "circle-stroke-opacity": 0.95 },
  });

  map.on("click", "hospital-circles", openPopup);
  map.on("mouseenter", "hospital-circles", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "hospital-circles", () => { map.getCanvas().style.cursor = ""; });
}

function openPopup(event) {
  const feature = event.features[0];
  const hospital = hospitals.find((item) => item.id === feature.properties.id);
  showInspector(hospital);
  highlightHospital(hospital.id);
  flyToHospital(hospital);
}

function applyCityView(city) {
  activeCity = city;
  const cityFilter = city === "all" ? null : ["==", ["get", "city"], city];
  const pulseFilter = city === "all"
    ? ["==", ["get", "status"], "critical"]
    : ["all", ["==", ["get", "status"], "critical"], cityFilter];
  map.setFilter("hospital-circles", cityFilter);
  map.setFilter("hospital-pulse", pulseFilter);
  map.flyTo({ ...CITY_VIEWS[city], duration: 1750, essential: true });
  updateNetworkStress();
}

function refreshHospitalSource() {
  map.getSource("hospitals").setData(hospitalsToGeoJSON());
}

function simulateWaitTimes() {
  hospitals.forEach((hospital) => {
    hospital.wait_time_minutes = Math.max(15, Math.min(285, hospital.wait_time_minutes + Math.floor(Math.random() * 19) - 9));
  });
  refreshHospitalSource();
  if (selectedHospitalId) showInspector(hospitals.find((hospital) => hospital.id === selectedHospitalId));
  updateNetworkStress();
  updateTimestamp();
}

function animateCriticalPulse() {
  pulsePhase = (pulsePhase + 0.045) % 1;
  refreshHospitalSource();
}

function updateTimestamp() {
  document.querySelector("#last-update").textContent = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function visibleHospitals() {
  return hospitals.filter((hospital) => activeCity === "all" || hospital.city === activeCity);
}

function updateNetworkStress() {
  const visible = visibleHospitals();
  if (!visible.length) return;
  const averageWait = visible.reduce((total, hospital) => total + hospital.wait_time_minutes, 0) / visible.length;
  const percent = Math.round(Math.min(100, (averageWait / 240) * 100));
  const status = percent >= 60 ? "critical" : percent >= 25 ? "moderate" : "optimal";
  const label = status === "critical" ? "Crítico" : status === "moderate" ? "Moderado" : "Óptimo";
  const badge = document.querySelector("#network-stress");
  badge.className = `stress-badge ${status}`;
  badge.textContent = `Estrés de la Red: ${label} (${percent}%)`;
}

function highlightHospital(id) {
  map.setFilter("hospital-highlight", ["==", ["get", "id"], id]);
}

function showInspector(hospital) {
  selectedHospitalId = hospital.id;
  const status = getStatus(hospital.wait_time_minutes);
  const ratio = Math.min(100, Math.round((hospital.patients_waiting / hospital.capacity) * 100));
  document.querySelector("#inspector-city").textContent = hospital.city;
  document.querySelector("#inspector-name").textContent = hospital.name;
  document.querySelector("#inspector-wait").textContent = formatWait(hospital.wait_time_minutes);
  const state = document.querySelector("#inspector-status");
  state.className = `inspector-status ${status.key}`;
  state.textContent = status.label;
  document.querySelector("#inspector-patients").textContent = hospital.patients_waiting;
  document.querySelector("#inspector-capacity").textContent = hospital.capacity;
  document.querySelector("#capacity-fill").className = status.key;
  document.querySelector("#capacity-fill").style.width = `${ratio}%`;
  document.querySelector("#inspector-coordinates").textContent = `${hospital.lat.toFixed(6)}, ${hospital.lon.toFixed(6)}`;
  document.querySelector("#google-maps-link").href = `https://www.google.com/maps/dir/?api=1&destination=${hospital.lat},${hospital.lon}`;
  document.querySelector("#inspector").hidden = false;
}

function flyToHospital(hospital) {
  map.flyTo({
    center: [hospital.lon, hospital.lat],
    zoom: 16,
    pitch: 55,
    bearing: 20,
    duration: 1750,
    essential: true,
  });
}

function recommendOptimalCenter() {
  const best = [...visibleHospitals()].sort((a, b) => a.wait_time_minutes - b.wait_time_minutes)[0];
  if (!best) return;
  highlightHospital(best.id);
  showInspector(best);
  flyToHospital(best);
}

document.querySelector("#city-filter").addEventListener("change", (event) => applyCityView(event.target.value));
document.querySelector("#recommend-button").addEventListener("click", recommendOptimalCenter);
document.querySelector("#close-inspector").addEventListener("click", () => {
  document.querySelector("#inspector").hidden = true;
  selectedHospitalId = null;
  map.setFilter("hospital-highlight", ["==", ["get", "id"], ""]);
});
init();
