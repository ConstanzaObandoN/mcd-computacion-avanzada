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
  },
  layers: [{ id: "esri-satellite", type: "raster", source: "esriWorldImagery" }],
};

let map;
let hospitals = [];
let pulsePhase = 0;

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

  map.on("click", "hospital-circles", openPopup);
  map.on("mouseenter", "hospital-circles", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "hospital-circles", () => { map.getCanvas().style.cursor = ""; });
}

function openPopup(event) {
  const feature = event.features[0];
  const { name, city, wait_time_minutes: wait } = feature.properties;
  const status = getStatus(Number(wait));
  new maplibregl.Popup({ offset: 18, closeButton: true, maxWidth: "280px" })
    .setLngLat(feature.geometry.coordinates)
    .setHTML(`<article class="info-card ${status.key}"><p class="info-kicker">${city}</p><h2>${name}</h2><p class="info-wait">${formatWait(Number(wait))}</p><p class="info-status"><i></i>${status.label}</p></article>`)
    .addTo(map);
}

function applyCityView(city) {
  const cityFilter = city === "all" ? null : ["==", ["get", "city"], city];
  const pulseFilter = city === "all"
    ? ["==", ["get", "status"], "critical"]
    : ["all", ["==", ["get", "status"], "critical"], cityFilter];
  map.setFilter("hospital-circles", cityFilter);
  map.setFilter("hospital-pulse", pulseFilter);
  map.flyTo({ ...CITY_VIEWS[city], duration: 1750, essential: true });
}

function refreshHospitalSource() {
  map.getSource("hospitals").setData(hospitalsToGeoJSON());
}

function simulateWaitTimes() {
  hospitals.forEach((hospital) => {
    hospital.wait_time_minutes = Math.max(15, Math.min(285, hospital.wait_time_minutes + Math.floor(Math.random() * 19) - 9));
  });
  refreshHospitalSource();
  updateTimestamp();
}

function animateCriticalPulse() {
  pulsePhase = (pulsePhase + 0.045) % 1;
  refreshHospitalSource();
}

function updateTimestamp() {
  document.querySelector("#last-update").textContent = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

document.querySelector("#city-filter").addEventListener("change", (event) => applyCityView(event.target.value));
init();
