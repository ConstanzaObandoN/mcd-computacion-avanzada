# Generador de lámparas

Guía para **Clase 02 — Computación Avanzada**  
Magíster en Ciencias del Diseño · Universidad Adolfo Ibáñez

## Objetivo

> **Diseñar un sistema no significa dibujar una única forma. Significa definir las reglas que producen un espacio de posibilidades.**

Esta exploración genera una pantalla de lámpara mediante varillas curvas. Las
reglas modifican la cantidad de elementos, su apertura, ondulación, torsión y
variación para producir una familia de objetos tridimensionales.

## Parámetros

### Sistema
- Lados: definición facetada de cada varilla
- Columnas: cantidad de varillas en 360°
- Altura: longitud de la pantalla
- Separación: apertura de la pantalla

### Comportamiento
- Amplitud: intensidad de la ondulación
- Frecuencia: cantidad de ondas a lo largo de la varilla
- Rotación: torsión helicoidal

### Variación
- Aleatoriedad
- Semilla

## Estructura

```text
campo-generativo-guia/
├── README.md
├── index.html
├── style.css
├── main.js
└── assets/
    └── models/
```

## Cómo ejecutarlo

Este proyecto utiliza módulos JavaScript, por lo que debe abrirse mediante un servidor local.

### Opción recomendada — VS Code + Live Server

1. Abre esta carpeta en VS Code.
2. Instala la extensión **Live Server**.
3. Haz click derecho sobre `index.html`.
4. Selecciona **Open with Live Server**.

## Qué mirar en `main.js`

```text
01 — PARÁMETROS
02 — ESCENA
03 — OBJETO GENERATIVO
04 — REGLAS GENERATIVAS
05 — GENERAR CAMPO
06 — ALEATORIEDAD CONTROLADA
07 — INTERFAZ
08 — BUCLE DE ANIMACIÓN
```

Para LAB02 concéntrate inicialmente en la clase:

```js
class CurvaVarilla extends THREE.Curve
```

y dentro de ella:

```js
const radio = Math.max(0.3, RADIO_BASE * 0.9 + onda + apertura + ruido);
```

Estas reglas representan **decisiones de diseño**: cada una modifica la silueta
de la pantalla sin dibujarla manualmente.

## Primeros experimentos

### 1 — Cambia la amplitud

```js
amplitud: 3.0
```

### 2 — Cambia la frecuencia

```js
frecuencia: 1.0
```

### 3 — Cambia la regla

Dentro de `CurvaVarilla.getPoint()`, reemplaza:

```js
Math.sin(t * Math.PI * parametros.frecuencia * 3.0)
```

por:

```js
Math.cos(t * Math.PI * parametros.frecuencia * 3.0)
```

### 4 — Cambia la cantidad de varillas

```js
columnas: 24
```

### 5 — Prueba aleatoriedad + semilla

La misma **semilla** produce siempre la misma variación.

## GitHub Pages

El proyecto usa rutas relativas y puede publicarse directamente en GitHub Pages.

## Extensión opcional — Rhino → GLB

La carpeta:

```text
assets/models/
```

queda preparada para una etapa posterior donde `BoxGeometry` podrá reemplazarse por una geometría propia exportada desde Rhino como `.glb`.

## Pregunta guía

> **¿Qué relaciones entre luz, estructura y variación producen una lámpara?**
