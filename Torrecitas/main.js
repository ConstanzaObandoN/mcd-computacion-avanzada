import * as THREE from "three";

// ======================================================
// CONFIGURACIÓN Y ESTADO DEL JUEGO
// ======================================================

const ALTURA_PISO = 1.0;
const ANCHO_INICIAL = 3.0;
const VELOCIDAD = 0.05;

let puntos = 0;
let juegoTerminado = false;

// Dirección del movimiento: 'x' o 'z'
let ejeActual = "x";
let direccion = 1;

// Pila de pisos colocados
const pisos = [];

// ======================================================
// ESCENA, CÁMARA Y LUCES
// ======================================================

const viewport = document.querySelector("#viewport");
const elemPuntos = document.querySelector("#puntos");
const elemMensaje = document.querySelector("#mensaje");

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x18191d);

// Cámara ortográfica o en perspectiva elevada
const camara = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camara.position.set(8, 12, 8);
camara.lookAt(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

// Iluminación
const luzAmbiente = new THREE.AmbientLight(0xffffff, 0.7);
escena.add(luzAmbiente);

const luzDir = new THREE.DirectionalLight(0xffffff, 1.5);
luzDir.position.set(10, 20, 10);
luzDir.castShadow = true;
escena.add(luzDir);

// ======================================================
// LÓGICA DE PISOS Y CORTES
// ======================================================

function obtenerColorPiso(indice) {
  // Paleta de color degradada según la altura
  const hue = (indice * 18) % 360;
  return new THREE.Color(`hsl(${hue}, 70%, 65%)`);
}

function crearCubo(x, y, z, ancho, profundidad, color) {
  const geo = new THREE.BoxGeometry(ancho, ALTURA_PISO, profundidad);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.4,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  escena.add(mesh);
  return { mesh, ancho, profundidad };
}

// 1. Piso Base
const base = crearCubo(0, ALTURA_PISO / 2, 0, ANCHO_INICIAL, ANCHO_INICIAL, 0x4a4d58);
pisos.push(base);

// 2. Piso en movimiento activo
let pisoActivo = null;

function agregarSiguientePiso() {
  const pisoPrevio = pisos[pisos.length - 1];
  const nivelY = pisos.length * ALTURA_PISO + ALTURA_PISO / 2;

  // Alternar eje de oscilación (primero X, luego Z, etc.)
  ejeActual = ejeActual === "x" ? "z" : "x";

  const nuevoColor = obtenerColorPiso(pisos.length);
  pisoActivo = crearCubo(
    ejeActual === "x" ? -5 : pisoPrevio.mesh.position.x,
    nivelY,
    ejeActual === "z" ? -5 : pisoPrevio.mesh.position.z,
    pisoPrevio.ancho,
    pisoPrevio.profundidad,
    nuevoColor
  );
}

agregarSiguientePiso();

// ======================================================
// INTERACCIÓN: COLOCAR PISO
// ======================================================

function colocarPiso() {
  if (juegoTerminado) {
    location.reload();
    return;
  }

  const pisoPrevio = pisos[pisos.length - 1];
  const posActiva = pisoActivo.mesh.position[ejeActual];
  const posPrevia = pisoPrevio.mesh.position[ejeActual];

  const desfase = posActiva - posPrevia;
  const dimension = ejeActual === "x" ? pisoActivo.ancho : pisoActivo.profundidad;
  const solapamiento = dimension - Math.abs(desfase);

  // Si cayó completamente por fuera: Game Over
  if (solapamiento <= 0) {
    juegoTerminado = true;
    elemMensaje.textContent = "¡Torre caída! Haz clic para reiniciar";
    return;
  }

  // Ajustar tamaño y posición del bloque que se queda
  const nuevoAncho = ejeActual === "x" ? solapamiento : pisoActivo.ancho;
  const nuevaProfundidad = ejeActual === "z" ? solapamiento : pisoActivo.profundidad;
  const nuevaPos = posPrevia + desfase / 2;

  escena.remove(pisoActivo.mesh);
  pisoActivo.mesh.geometry.dispose();

  const pisoFinal = crearCubo(
    ejeActual === "x" ? nuevaPos : pisoActivo.mesh.position.x,
    pisoActivo.mesh.position.y,
    ejeActual === "z" ? nuevaPos : pisoActivo.mesh.position.z,
    nuevoAncho,
    nuevaProfundidad,
    obtenerColorPiso(pisos.length)
  );

  pisos.push(pisoFinal);

  // Actualizar UI
  puntos++;
  elemPuntos.textContent = puntos;

  // Subir la cámara suavemente
  camara.position.y += ALTURA_PISO;
  camara.lookAt(0, pisoFinal.mesh.position.y, 0);

  agregarSiguientePiso();
}

window.addEventListener("pointerdown", colocarPiso);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") colocarPiso();
});

// ======================================================
// BUCLE DE ANIMACIÓN
// ======================================================

function animar() {
  requestAnimationFrame(animar);

  if (!juegoTerminado && pisoActivo) {
    pisoActivo.mesh.position[ejeActual] += VELOCIDAD * direccion;

    // Invertir sentido al llegar a los límites
    if (pisoActivo.mesh.position[ejeActual] > 5) direccion = -1;
    if (pisoActivo.mesh.position[ejeActual] < -5) direccion = 1;
  }

  renderer.render(escena, camara);
}

window.addEventListener("resize", () => {
  camara.aspect = window.innerWidth / window.innerHeight;
  camara.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animar();