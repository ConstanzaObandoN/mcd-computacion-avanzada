const REGIONAL_VIEW = { center: [-111.3, 52.35], zoom: 4.9, pitch: 25, bearing: 8 };
const DISTRICT_VIEWS = {
  Calgary: { center: [-114.0719, 51.0447], zoom: 11, pitch: 45, bearing: -15, duration: 3000, essential: true },
  Edmonton: { center: [-113.4938, 53.5461], zoom: 11, pitch: 45, bearing: 18, duration: 3000, essential: true },
};
const BOTH_DISTRICTS_BOUNDS = [[-114.28, 50.82], [-113.25, 53.7]];
const HOURS = Array.from({ length: 17 }, (_, index) => index + 8);
const SPECIALTIES = { general: "Atención general", pediatrics: "🩺 Pediatría", trauma: "🦴 Trauma / cirugía", obstetrics: "♀ Gineco-obstétrica" };
const CRITICAL_SERVICES = [
  ["pediatrics", "🩺", "Pediatría"], ["trauma", "🦴", "Pabellón / cirugía"], ["imaging", "☢", "Imagenología"], ["laboratory", "🧪", "Laboratorio"],
];
const SATELLITE_STYLE = {
  version: 8,
  projection: { type: "globe" },
  sources: {
    imagery: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Tiles © Esri" },
    transport: { type: "raster", tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"], tileSize: 256 },
    labels: { type: "raster", tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256 },
  },
  layers: [{ id: "imagery", type: "raster", source: "imagery" }, { id: "transport", type: "raster", source: "transport", minzoom: 12 }, { id: "labels", type: "raster", source: "labels", minzoom: 10 }],
};

let map, hospitals = [], patientLocation = null, selectedHospital = null, currentHour = 8, isPlaying = false, criticalEvent = false, activeDistrict = "all";

const $ = (selector) => document.querySelector(selector);

async function init() {
  if (!window.maplibregl) return showMessage("No se pudo cargar MapLibre GL JS.");
  map = new maplibregl.Map({ container: "map", style: SATELLITE_STYLE, ...REGIONAL_VIEW, minZoom: 3, maxZoom: 18, maxPitch: 75, dragRotate: true, pitchWithRotate: true, touchPitch: true });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.on("load", loadData);
  map.on("click", handleMapClick);
  bindUI();
}

async function loadData() {
  try {
    const response = await fetch("./hospitals.json");
    if (!response.ok) throw new Error("Dataset no disponible");
    hospitals = await response.json();
    addMapLayers();
    refreshDashboard();
  } catch (error) { console.error(error); showMessage("No fue posible cargar los centros de salud."); }
}

function addMapLayers() {
  map.addSource("hospitals", { type: "geojson", data: hospitalGeoJSON() });
  map.addSource("patient", { type: "geojson", data: emptyCollection() });
  map.addSource("route", { type: "geojson", lineMetrics: true, data: emptyCollection() });
  const radius = ["interpolate", ["linear"], ["get", "wait"], 0, 7, 60, 11, 180, 17, 300, 24];
  const color = ["match", ["get", "status"], "optimal", "#4ade80", "moderate", "#fbbf24", "critical", "#fb4f5d", "#ffffff"];
  map.addLayer({ id: "hospital-pulse", type: "circle", source: "hospitals", filter: ["==", ["get", "status"], "critical"], paint: { "circle-color": "#fb4f5d", "circle-radius": ["+", radius, 11], "circle-opacity": .22, "circle-blur": .35 } });
  map.addLayer({ id: "hospital-circles", type: "circle", source: "hospitals", paint: { "circle-color": color, "circle-radius": radius, "circle-stroke-width": 2, "circle-stroke-color": "#f8fafc", "circle-stroke-opacity": .9 } });
  map.addLayer({ id: "hospital-selected", type: "circle", source: "hospitals", filter: ["==", ["get", "id"], ""], paint: { "circle-radius": ["+", radius, 10], "circle-color": "#fff", "circle-opacity": .16, "circle-stroke-width": 2.5, "circle-stroke-color": "#fff" } });
  map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": 6, "line-opacity": .92, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "#22d3ee", 1, "#2563eb"] } });
  map.addLayer({ id: "patient-pin", type: "circle", source: "patient", paint: { "circle-radius": 9, "circle-color": "#38bdf8", "circle-stroke-width": 3, "circle-stroke-color": "#e0f2fe" } });
  map.on("click", "hospital-circles", (event) => selectHospital(byId(event.features[0].properties.id), true));
  map.on("mouseenter", "hospital-circles", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseleave", "hospital-circles", () => map.getCanvas().style.cursor = "");
  applyDistrictFilter();
}

function hospitalGeoJSON() {
  return { type: "FeatureCollection", features: hospitals.map((hospital) => ({ type: "Feature", geometry: { type: "Point", coordinates: [hospital.lon, hospital.lat] }, properties: { id: hospital.id, wait: getWait(hospital), status: getStatus(getWait(hospital)).key } })) };
}
function emptyCollection() { return { type: "FeatureCollection", features: [] }; }
function byId(id) { return hospitals.find((hospital) => hospital.id === id); }
function getWait(hospital) {
  const multiplier = hospital.hourly_curve[currentHour - 8];
  // Evento masivo: Foothills llega al 200% de su carga estimada y la red vecina absorbe demanda adicional.
  const eventLoad = criticalEvent && hospital.id === "calgary-foothills" ? 2 : criticalEvent ? 1.12 : 1;
  return Math.round(Math.max(15, Math.min(360, hospital.base_wait_minutes * multiplier * eventLoad)));
}
function getStatus(wait) { return wait < 60 ? { key: "optimal", label: "Óptimo" } : wait <= 180 ? { key: "moderate", label: "Moderado" } : { key: "critical", label: "Crítico" }; }
function formatWait(minutes) { const h = Math.floor(minutes / 60); return h ? `${h} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim() : `${minutes} min`; }

function handleMapClick(event) {
  const point = map.project(event.lngLat);
  if (map.queryRenderedFeatures(point, { layers: ["hospital-circles"] }).length) return;
  if (!$("#map-origin-button").classList.contains("armed")) return;
  setPatientLocation([event.lngLat.lng, event.lngLat.lat], "Origen marcado en el mapa.");
  $("#map-origin-button").classList.remove("armed");
}
function setPatientLocation(coordinates, note) {
  patientLocation = coordinates;
  map.getSource("patient").setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates }, properties: {} }] });
  $("#origin-status").textContent = note;
  $("#origin-status").classList.add("ready");
}

function calculateOptimalCenter() {
  if (!patientLocation) return showMessage("Marca el origen del paciente o usa tu ubicación actual.");
  const emergency = $("#emergency-type").value;
  const candidates = hospitals.filter((hospital) => hospital.specialties.includes(emergency));
  const ranked = candidates.map((hospital) => ({ hospital, travel: estimateTravel(patientLocation, [hospital.lon, hospital.lat]), wait: getWait(hospital) })).map((item) => ({ ...item, cost: item.travel + item.wait })).sort((a, b) => a.cost - b.cost);
  const best = ranked[0];
  if (!best) return showMessage("No hay centros activos para esa especialidad.");
  drawRoute(patientLocation, [best.hospital.lon, best.hospital.lat]);
  selectHospital(best.hospital, false);
  map.fitBounds([patientLocation, [best.hospital.lon, best.hospital.lat]], { padding: { top: 150, right: 390, bottom: 180, left: 370 }, duration: 1500, maxZoom: 14 });
  $("#recommendation").hidden = false;
  $("#recommendation").innerHTML = `<span>RECOMENDADO · ${SPECIALTIES[emergency]}</span><strong>${best.hospital.name}</strong><p>${formatWait(best.travel)} traslado + ${formatWait(best.wait)} espera</p><b>Costo estimado: ${formatWait(best.cost)}</b>`;
}
function estimateTravel(from, to) { return Math.round((distanceKm(from, to) / 35) * 60 + 4); }
function distanceKm([lon1, lat1], [lon2, lat2]) { const rad = Math.PI / 180, a = Math.sin((lat2-lat1)*rad/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); }
function drawRoute(start, end) { map.getSource("route").setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [start, [(start[0]+end[0])/2, (start[1]+end[1])/2 + .003], end] }, properties: {} }] }); }

function selectHospital(hospital, fly) {
  selectedHospital = hospital;
  map.setFilter("hospital-selected", ["==", ["get", "id"], hospital.id]);
  renderDrawer(hospital);
  if (fly) map.flyTo({ center: [hospital.lon, hospital.lat], zoom: 15.5, pitch: 55, bearing: 20, duration: 1350, essential: true });
}
function renderDrawer(hospital) {
  const wait = getWait(hospital), status = getStatus(wait);
  $("#drawer-city").textContent = hospital.city.toUpperCase(); $("#drawer-name").textContent = hospital.name; $("#drawer-type").textContent = hospital.type;
  $("#drawer-wait").textContent = formatWait(wait); $("#drawer-patients").textContent = Math.round(hospital.capacity * Math.min(1.15, wait / 210)); $("#drawer-capacity").textContent = hospital.capacity;
  const badge = $("#drawer-status"); badge.className = `status-badge ${status.key}`; badge.textContent = status.label;
  $("#maps-link").href = `https://www.google.com/maps/dir/?api=1&destination=${hospital.lat},${hospital.lon}`;
  $("#specialty-badges").innerHTML = CRITICAL_SERVICES.map(([key, icon, label]) => `<span class="${hospital.services[key] ? "available" : "unavailable"}">${icon} ${label} <b>${hospital.services[key] ? "✓" : "✕"}</b></span>`).join("");
  drawTrend(hospital); $("#telemetry-drawer").hidden = false;
}
function drawTrend(hospital) {
  const canvas = $("#trend-chart"), ctx = canvas.getContext("2d"), values = [-6,-5,-4,-3,-2,-1,0,1,2].map((offset) => Math.max(20, Math.min(100, Math.round(getCurveValue(hospital, currentHour + offset) * 100 / 1.7))));
  const w = canvas.width, h = canvas.height, pad = 11; ctx.clearRect(0,0,w,h); ctx.strokeStyle = "rgba(148,163,184,.18)"; ctx.lineWidth = 1;
  [25,50,75].forEach((level) => { const y = h-pad-(level/100)*(h-pad*2); ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke(); });
  const gradient = ctx.createLinearGradient(0,0,w,0); gradient.addColorStop(0,"#22d3ee"); gradient.addColorStop(1,"#818cf8"); ctx.strokeStyle=gradient;ctx.lineWidth=2.5;ctx.beginPath();
  values.forEach((value,index)=>{const x=pad+index*(w-pad*2)/(values.length-1),y=h-pad-(value/100)*(h-pad*2);index?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
  const nowX=pad+6*(w-pad*2)/8;ctx.strokeStyle="#f8fafc";ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(nowX,pad);ctx.lineTo(nowX,h-pad);ctx.stroke();ctx.setLineDash([]);
}
function getCurveValue(hospital, hour) { return hospital.hourly_curve[Math.max(0, Math.min(16, hour - 8))]; }

function refreshDashboard() {
  if (!map.getSource("hospitals")) return;
  map.getSource("hospitals").setData(hospitalGeoJSON());
  const visible = hospitals.filter((hospital) => activeDistrict === "all" || hospital.city === activeDistrict);
  const waits = visible.map(getWait), avg = waits.reduce((sum, wait) => sum + wait, 0) / waits.length, level = avg > 180 ? "critical" : avg >= 60 ? "moderate" : "optimal";
  const badge = $("#network-stress"); badge.className = `stress-badge ${level}`; badge.textContent = `Estrés de la red: ${getStatus(avg).label} (${Math.round(Math.min(100,avg/2.4))}%)`;
  $("#time-label").textContent = `${String(currentHour).padStart(2,"0")}:00`;
  if (selectedHospital) renderDrawer(selectedHospital);
}
function toggleCriticalEvent() { criticalEvent = !criticalEvent; $("#critical-event-button").classList.toggle("active", criticalEvent); $("#critical-event-button").textContent = criticalEvent ? "✓ Evento crítico activo" : "⚠ Simular evento crítico"; refreshDashboard(); }
function togglePlayback() { isPlaying=!isPlaying; $("#play-button").textContent=isPlaying?"Ⅱ":"▶"; }
function showMessage(message) { const el=$("#map-message");el.textContent=message;el.hidden=false;setTimeout(()=>el.hidden=true,3400); }
function applyDistrictFilter() {
  if (!map.getLayer("hospital-circles")) return;
  const filter = activeDistrict === "all" ? null : ["==", ["get", "city"], activeDistrict];
  const pulseFilter = activeDistrict === "all" ? ["==", ["get", "status"], "critical"] : ["all", ["==", ["get", "status"], "critical"], filter];
  map.setFilter("hospital-circles", filter); map.setFilter("hospital-pulse", pulseFilter);
  map.setFilter("hospital-selected", selectedHospital && (activeDistrict === "all" || selectedHospital.city === activeDistrict) ? ["==", ["get", "id"], selectedHospital.id] : ["==", ["get", "id"], ""]);
  refreshDashboard();
}
function selectDistrict(district, fromOnboarding = false) {
  activeDistrict = district;
  $("#district-select").value = district;
  applyDistrictFilter();
  if (district === "all") map.fitBounds(BOTH_DISTRICTS_BOUNDS, { padding: 80, pitch: 35, duration: 2500 });
  else map.flyTo(DISTRICT_VIEWS[district]);
  if (fromOnboarding) closeOnboarding();
}
function openOnboarding() { $("#onboarding").classList.remove("is-hidden"); }
function closeOnboarding() { $("#onboarding").classList.add("is-hidden"); }
function bindUI() {
  $("#map-origin-button").addEventListener("click", () => { $("#map-origin-button").classList.toggle("armed"); $("#origin-status").textContent=$("#map-origin-button").classList.contains("armed")?"Haz clic en el mapa para fijar el origen.":"Selecciona una ubicación o haz clic en el mapa."; });
  $("#geolocate-button").addEventListener("click", () => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p)=>setPatientLocation([p.coords.longitude,p.coords.latitude],"Ubicación actual establecida."),()=>showMessage("No fue posible obtener tu ubicación."),{enableHighAccuracy:true,timeout:10000}) : showMessage("Tu navegador no permite geolocalización."));
  $("#calculate-button").addEventListener("click", calculateOptimalCenter); $("#critical-event-button").addEventListener("click",toggleCriticalEvent); $("#play-button").addEventListener("click",togglePlayback);
  $("#time-range").addEventListener("input",(e)=>{currentHour=Number(e.target.value);refreshDashboard();});
  $("#district-select").addEventListener("change", (event) => selectDistrict(event.target.value));
  $("#open-onboarding").addEventListener("click", openOnboarding);
  document.querySelectorAll("[data-district]").forEach((button) => button.addEventListener("click", () => selectDistrict(button.dataset.district, true)));
  $("#close-drawer").addEventListener("click",()=>{$("#telemetry-drawer").hidden=true;selectedHospital=null;map.setFilter("hospital-selected",["==",["get","id"],""]);});
  setInterval(()=>{if(!isPlaying)return;currentHour=currentHour===24?8:currentHour+1;$("#time-range").value=currentHour;refreshDashboard();},1300);
}
init();
