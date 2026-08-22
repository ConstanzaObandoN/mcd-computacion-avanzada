import { STLExporter } from "three/addons/exporters/STLExporter.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ======================================================
// 01 — PARÁMETROS
// ======================================================

const valoresIniciales = {
  lados: 4,        // Sección de la varilla (3 = triángulo, 4 = cuadrado, etc.)
  columnas: 12,    // Cantidad de varillas en los 360°
  filas: 14,       // Altura total de la lámpara
  separacion: 1.0, // Apertura / ensanchamiento
  amplitud: 1.5,   // Curvas / ondulación
  frecuencia: 0.5, // Frecuencia de ondas
  rotacion: 0.8,   // Torsión / twist helicoidal
  aleatoriedad: 0.0,
  semilla: 42,
};

const parametros = { ...valoresIniciales };

// ======================================================
// 02 — ESCENA
// ======================================================

const viewport = document.querySelector("#viewport");

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x0e0e11);

const camara = new THREE.PerspectiveCamera(
  45,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  100
);
camara.position.set(12, 10, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

viewport.appendChild(renderer.domElement);

const controlesOrbita = new OrbitControls(camara, renderer.domElement);
controlesOrbita.enableDamping = true;
controlesOrbita.target.set(0, 4, 0);

// Iluminación general
const luzHemisferica = new THREE.HemisphereLight(0xf3efe5, 0x202229, 1.6);
escena.add(luzHemisferica);

// Luz principal directa con sombras
const luzPrincipal = new THREE.DirectionalLight(0xffffff, 2.8);
luzPrincipal.position.set(8, 14, 9);
luzPrincipal.castShadow = true;
escena.add(luzPrincipal);

// Luz secundaria de relleno
const luzRelleno = new THREE.DirectionalLight(0xc8d8ff, 0.7);
luzRelleno.position.set(-8, 6, -6);
escena.add(luzRelleno);

// Plano base / Suelo
const suelo = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({
    color: 0x101114,
    roughness: 1,
    metalness: 0,
  })
);
suelo.rotation.x = -Math.PI / 2;
suelo.position.y = -0.03;
suelo.receiveShadow = true;
escena.add(suelo);

// Base fija de la lámpara (cilindro inferior)
const RADIO_BASE = 2.0;
const ALTURA_BASE = 0.8;

const baseLampara = new THREE.Mesh(
  new THREE.CylinderGeometry(RADIO_BASE, RADIO_BASE, ALTURA_BASE, 32),
  new THREE.MeshStandardMaterial({ color: 0x24252a, roughness: 0.6 })
);
baseLampara.position.y = ALTURA_BASE / 2;
baseLampara.castShadow = true;
escena.add(baseLampara);

// Fuente cálida para leer la estructura como una lámpara.
// La bombilla queda fijada sobre la base, sin reaccionar al crecimiento de la estructura.
const luzLampara = new THREE.PointLight(0xffb45f, 28, 18, 2);
const POSICION_BOMBILLA = new THREE.Vector3(0, ALTURA_BASE + 0.9, 0);
luzLampara.position.copy(POSICION_BOMBILLA);
luzLampara.castShadow = true;
escena.add(luzLampara);

const bombilla = new THREE.Mesh(
  new THREE.SphereGeometry(0.52, 32, 32),
  new THREE.MeshStandardMaterial({
    color: 0xffd39a,
    emissive: 0xff8a30,
    emissiveIntensity: 2.2,
    roughness: 0.45,
  })
);
bombilla.scale.set(1.18, 1.75, 1.18);
bombilla.position.copy(POSICION_BOMBILLA);
escena.add(bombilla);

// ======================================================
// 03 — MATERIALES Y GRUPO
// ======================================================

const grupoCampo = new THREE.Group();
escena.add(grupoCampo);

const materialModulo = new THREE.MeshStandardMaterial({
  color: 0xf6ede0,
  roughness: 0.35,
  metalness: 0.05,
  flatShading: true,
  side: THREE.DoubleSide,
});

// ======================================================
// 04 — CURVA PARAMÉTRICA CON RUIDO
// ======================================================

class CurvaVarilla extends THREE.Curve {
  constructor(anguloBase, alturaTotal, ruidoPilar) {
    super();
    this.anguloBase = anguloBase;
    this.alturaTotal = alturaTotal;
    this.ruidoPilar = ruidoPilar;
  }

  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const y = t * this.alturaTotal;

    // Modulación de radio con onda, apertura y aleatoriedad por varilla
    const onda = Math.sin(t * Math.PI * parametros.frecuencia * 3.0) * parametros.amplitud * 0.5;
    const apertura = (parametros.separacion - 1.0) * t * 1.5;
    const ruido = this.ruidoPilar * t * parametros.aleatoriedad * 0.6;

    const radio = Math.max(0.3, RADIO_BASE * 0.9 + onda + apertura + ruido);

    // Torsión angular
    const torsion = t * parametros.rotacion * 3.0;
    const angulo = this.anguloBase + torsion;

    const x = Math.cos(angulo) * radio;
    const z = Math.sin(angulo) * radio;

    return optionalTarget.set(x, ALTURA_BASE + y, z);
  }
}

// ======================================================
// 05 — GENERAR CAMPO
// ======================================================

// Función que sella tanto la tapa inferior (t=0) como la superior (t=1)
function taparExtremosTubo(tuboGeo, lados, segmentosTubo) {
  const pos = tuboGeo.attributes.position;
  const verticesTubo = [];

  for (let i = 0; i < pos.count; i++) {
    verticesTubo.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }

  const indicesOriginales = Array.from(tuboGeo.index.array);

  // 1. TAPA INFERIOR (Inicio del tubo, t = 0)
  const inicioAroInferior = 0;
  let centroInfX = 0, centroInfY = 0, centroInfZ = 0;

  for (let j = 0; j < lados; j++) {
    const idx = inicioAroInferior + j;
    centroInfX += pos.getX(idx);
    centroInfY += pos.getY(idx);
    centroInfZ += pos.getZ(idx);
  }
  centroInfX /= lados;
  centroInfY /= lados;
  centroInfZ /= lados;

  const indiceCentroInf = verticesTubo.length / 3;
  verticesTubo.push(centroInfX, centroInfY, centroInfZ);

  for (let j = 0; j < lados; j++) {
    const v1 = inicioAroInferior + j;
    const v2 = inicioAroInferior + ((j + 1) % (lados + 1));
    indicesOriginales.push(indiceCentroInf, v2, v1);
  }

  // 2. TAPA SUPERIOR (Punta del tubo, t = 1)
  const inicioAroSuperior = segmentosTubo * (lados + 1);
  let centroSupX = 0, centroSupY = 0, centroSupZ = 0;

  for (let j = 0; j < lados; j++) {
    const idx = inicioAroSuperior + j;
    centroSupX += pos.getX(idx);
    centroSupY += pos.getY(idx);
    centroSupZ += pos.getZ(idx);
  }
  centroSupX /= lados;
  centroSupY /= lados;
  centroSupZ /= lados;

  const indiceCentroSup = verticesTubo.length / 3;
  verticesTubo.push(centroSupX, centroSupY, centroSupZ);

  for (let j = 0; j < lados; j++) {
    const v1 = inicioAroSuperior + j;
    const v2 = inicioAroSuperior + ((j + 1) % (lados + 1));
    indicesOriginales.push(indiceCentroSup, v1, v2);
  }

  // Geometría hermética cerrada
  const geoSellada = new THREE.BufferGeometry();
  geoSellada.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(verticesTubo, 3)
  );
  geoSellada.setIndex(indicesOriginales);

  return geoSellada;
}

function generarCampo() {
  limpiarCampo();

  const cantidadVarillas = Math.max(3, parametros.columnas);
  const alturaTotal = Math.max(1.0, parametros.filas * 0.4);
  const radioTubo = 0.14;
  const segmentosTubo = 64;

  for (let i = 0; i < cantidadVarillas; i++) {
    const anguloBase = (i / cantidadVarillas) * Math.PI * 2;
    const ruidoPilar = aleatoriedadConSemilla(i, parametros.semilla, parametros.semilla);

    const curva = new CurvaVarilla(anguloBase, alturaTotal, ruidoPilar);

    // 1. Crear el tubo
    const geometriaTubo = new THREE.TubeGeometry(
      curva,
      segmentosTubo,
      radioTubo,
      parametros.lados,
      false
    );

    // 2. Sellar ambos extremos (base y punta)
    const geoTapada = taparExtremosTubo(geometriaTubo, parametros.lados, segmentosTubo);

    // 3. Facetado con caras planas limpias
    const geoPlana = geoTapada.toNonIndexed();
    geoPlana.computeVertexNormals();

    const varilla = new THREE.Mesh(geoPlana, materialModulo);
    varilla.castShadow = true;
    varilla.receiveShadow = true;

    grupoCampo.add(varilla);
  }

  // La bombilla queda fija sobre la base de la lámpara y no depende de los parámetros.
  luzLampara.position.copy(POSICION_BOMBILLA);
  bombilla.position.copy(POSICION_BOMBILLA);
}

function limpiarCampo() {
  while (grupoCampo.children.length > 0) {
    const hijo = grupoCampo.children[0];
    if (hijo.geometry) hijo.geometry.dispose();
    grupoCampo.remove(hijo);
  }
}

// ======================================================
// 06 — ALEATORIEDAD CONTROLADA
// ======================================================

function aleatoriedadConSemilla(x, z, semilla) {
  const valor =
    Math.sin(
      x * 12.9898 +
      z * 78.233 +
      semilla * 37.719
    ) * 43758.5453;

  const normalizado = valor - Math.floor(valor);
  return normalizado * 2 - 1;
}

// ======================================================
// 07 — INTERFAZ Y EXPORTACIÓN
// ======================================================

const controles = {
  lados: document.querySelector("#lados"),
  columnas: document.querySelector("#columnas"),
  filas: document.querySelector("#filas"),
  separacion: document.querySelector("#separacion"),
  amplitud: document.querySelector("#amplitud"),
  frecuencia: document.querySelector("#frecuencia"),
  rotacion: document.querySelector("#rotacion"),
  aleatoriedad: document.querySelector("#aleatoriedad"),
  semilla: document.querySelector("#semilla"),
};

const valoresVisibles = {
  lados: document.querySelector("#lados-valor"),
  columnas: document.querySelector("#columnas-valor"),
  filas: document.querySelector("#filas-valor"),
  separacion: document.querySelector("#separacion-valor"),
  amplitud: document.querySelector("#amplitud-valor"),
  frecuencia: document.querySelector("#frecuencia-valor"),
  rotacion: document.querySelector("#rotacion-valor"),
  aleatoriedad: document.querySelector("#aleatoriedad-valor"),
  semilla: document.querySelector("#semilla-valor"),
};

function actualizarParametro(nombre, valor) {
  const parametrosEnteros = ["lados", "columnas", "filas", "semilla"];

  parametros[nombre] = parametrosEnteros.includes(nombre)
    ? Number.parseInt(valor, 10)
    : Number.parseFloat(valor);

  if (valoresVisibles[nombre]) {
    valoresVisibles[nombre].value = parametrosEnteros.includes(nombre)
      ? parametros[nombre]
      : parametros[nombre].toFixed(2);
  }

  generarCampo();
}

Object.entries(controles).forEach(([nombre, control]) => {
  if (control) {
    control.addEventListener("input", (event) => {
      actualizarParametro(nombre, event.target.value);
    });
  }
});

document.querySelector("#regenerar").addEventListener("click", () => {
  parametros.semilla = Math.floor(Math.random() * 100) + 1;

  if (controles.semilla) controles.semilla.value = parametros.semilla;
  if (valoresVisibles.semilla) valoresVisibles.semilla.value = parametros.semilla;

  generarCampo();
});

document.querySelector("#restablecer").addEventListener("click", () => {
  Object.assign(parametros, valoresIniciales);

  const parametrosEnteros = ["lados", "columnas", "filas", "semilla"];

  Object.entries(controles).forEach(([nombre, control]) => {
    if (control) {
      control.value = parametros[nombre];
      if (valoresVisibles[nombre]) {
        valoresVisibles[nombre].value = parametrosEnteros.includes(nombre)
          ? parametros[nombre]
          : parametros[nombre].toFixed(2);
      }
    }
  });

  generarCampo();
});

// Descargar STL con Base + Varillas sólidas (excluye la bombilla visual)
const botonDescargar = document.querySelector("#descargar-stl");

if (botonDescargar) {
  botonDescargar.addEventListener("click", () => {
    const exporter = new STLExporter();
    
    // Grupo que solo suma la base física y los fideos
    const modeloCompleto = new THREE.Group();
    modeloCompleto.add(baseLampara.clone());
    modeloCompleto.add(grupoCampo.clone());

    const stlData = exporter.parse(modeloCompleto, { binary: true });

    const blob = new Blob([stlData], { type: "application/octet-stream" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `lampara-completa-lados-${parametros.lados}-semilla-${parametros.semilla}.stl`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

// ======================================================
// 08 — BUCLE DE ANIMACIÓN
// ======================================================

function animar() {
  requestAnimationFrame(animar);

  controlesOrbita.update();
  renderer.render(escena, camara);
}

function ajustarVentana() {
  const ancho = viewport.clientWidth;
  const altura = viewport.clientHeight;

  camara.aspect = ancho / altura;
  camara.updateProjectionMatrix();

  renderer.setSize(ancho, altura);
}

window.addEventListener("resize", ajustarVentana);

generarCampo();
animar();