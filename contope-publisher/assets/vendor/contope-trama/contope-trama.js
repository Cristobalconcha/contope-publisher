/* @contope/trama 0.1.0 — motor, línea de tiempo y formato de las tramas
 * Generado desde packages/trama/src con `pnpm trama:construir` (contopedesign-core). No editar a mano:
 * Publisher lo trae tal cual y verifica su sha256 contra MOTOR.json. */
"use strict";
var ContopeTrama = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/entradas/global.ts
  var global_exports = {};
  __export(global_exports, {
    ALFA_MINIMO_PUNTO: () => ALFA_MINIMO_PUNTO,
    ALFA_MINIMO_TRAMO: () => ALFA_MINIMO_TRAMO,
    CIERRE_POR_DEFECTO: () => CIERRE_POR_DEFECTO,
    CLAVES_DE_COLOR: () => CLAVES_DE_COLOR,
    COLOR_CERCA_POR_DEFECTO: () => COLOR_CERCA_POR_DEFECTO,
    COLOR_FONDO_POR_DEFECTO: () => COLOR_FONDO_POR_DEFECTO,
    COLOR_LEJOS_POR_DEFECTO: () => COLOR_LEJOS_POR_DEFECTO,
    CONFIGURACION_POR_DEFECTO: () => CONFIGURACION_POR_DEFECTO,
    CUADROS_POR_SEGUNDO_LINEA: () => CUADROS_POR_SEGUNDO_LINEA,
    CURSOR_EN_REPOSO: () => CURSOR_EN_REPOSO,
    CURSOR_POR_DEFECTO: () => CURSOR_POR_DEFECTO,
    CURVAS: () => CURVAS,
    CURVA_SUAVE: () => CURVA_SUAVE,
    DURACION_DE_ESCENA_POR_DEFECTO: () => DURACION_DE_ESCENA_POR_DEFECTO,
    ErrorDeTrama: () => ErrorDeTrama,
    FORMATO_VERSION: () => FORMATO_VERSION,
    ID_ESCENA_DE_CIERRE: () => ID_ESCENA_DE_CIERRE,
    INICIO_POR_DEFECTO: () => INICIO_POR_DEFECTO,
    LIMITES: () => LIMITES,
    MODOS: () => MODOS,
    MOTOR_ID: () => MOTOR_ID,
    MOTOR_VERSION: () => MOTOR_VERSION,
    NIVELES_DE_ALFA: () => NIVELES_DE_ALFA,
    NOMBRE_V7: () => NOMBRE_V7,
    OPACIDAD_MINIMA_LINEAS: () => OPACIDAD_MINIMA_LINEAS,
    OPACIDAD_MINIMA_PUNTOS: () => OPACIDAD_MINIMA_PUNTOS,
    PARAMETROS_ANIMABLES: () => PARAMETROS_ANIMABLES,
    PARAMETROS_ENTEROS: () => PARAMETROS_ENTEROS,
    PARAMETROS_MOTOR: () => PARAMETROS_MOTOR,
    PARAMETRO_ANIMABLE: () => PARAMETRO_ANIMABLE,
    PATRON_HEX: () => PATRON_HEX,
    PERMUTACION: () => PERMUTACION,
    PREFIJO_CODIGO: () => PREFIJO_CODIGO,
    PREFIJO_SP1: () => PREFIJO_SP1,
    PUNTOS_POR_TRAMO: () => PUNTOS_POR_TRAMO,
    SUAVIZADO: () => SUAVIZADO,
    SUAVIZADOS: () => SUAVIZADOS,
    TINTAS: () => TINTAS,
    TONOS: () => TONOS,
    TRAMA_KIND: () => TRAMA_KIND,
    UMBRAL_TINTA: () => UMBRAL_TINTA,
    VALORES_POR_PUNTO: () => VALORES_POR_PUNTO,
    VALORES_POR_VERTICE: () => VALORES_POR_VERTICE,
    ajustarAGrilla: () => ajustarAGrilla,
    alfaDeNivel: () => alfaDeNivel,
    base64ABytes: () => base64ABytes,
    bezierCubica: () => bezierCubica,
    bytesABase64: () => bytesABase64,
    bytesAUtf8: () => bytesAUtf8,
    calcularLamina: () => calcularLamina,
    capturaEn: () => capturaEn,
    capturaV7ATrama: () => capturaV7ATrama,
    codificarTrama: () => codificarTrama,
    compactarTrama: () => compactarTrama,
    conLineas: () => conLineas,
    conPuntos: () => conPuntos,
    configuracionPorDefecto: () => configuracionPorDefecto,
    crearAtendedor: () => crearAtendedor,
    cuadroASvg: () => cuadroASvg,
    cuadroDeEstado: () => cuadroDeEstado,
    cuadroEn: () => cuadroEn,
    cuadrosDeSecuencia: () => cuadrosDeSecuencia,
    describirErrores: () => describirErrores,
    dimensionesDeLamina: () => dimensionesDeLamina,
    documentoDeTrama: () => documentoDeTrama,
    empaquetar: () => empaquetar,
    esModo: () => esModo,
    esRutaAnimable: () => esRutaAnimable,
    escribirLamina: () => escribirLamina,
    escribirTrama: () => escribirTrama,
    estadoDeDocumento: () => estadoDeDocumento,
    estadoEn: () => estadoEn,
    evolucionEn: () => evolucionEn,
    grupoDePunto: () => grupoDePunto,
    hexARgb: () => hexARgb,
    instanteDeCuadro: () => instanteDeCuadro,
    interpolar: () => interpolar,
    leerTrama: () => leerTrama,
    luminancia: () => luminancia,
    mezclarCuadros: () => mezclarCuadros,
    mezclarHex: () => mezclarHex,
    mismoValor: () => mismoValor,
    modoDe: () => modoDe,
    modoDeTinta: () => modoDeTinta,
    multiplicar: () => multiplicar,
    nivelDeAlfa: () => nivelDeAlfa,
    normalizarTrama: () => normalizarTrama,
    recorrerPuntos: () => recorrerPuntos,
    regenerarPistas: () => regenerarPistas,
    rotacionX: () => rotacionX,
    rotacionY: () => rotacionY,
    rotacionZ: () => rotacionZ,
    ruido: () => ruido,
    suavizado: () => suavizado,
    suavizadoDe: () => suavizadoDe,
    tamanoDeCuadro: () => tamanoDeCuadro,
    tirasDeTramos: () => tirasDeTramos,
    tonoDeCercania: () => tonoDeCercania,
    tonosPorProfundidad: () => tonosPorProfundidad,
    tramaPorDefecto: () => tramaPorDefecto,
    tramosDeLinea: () => tramosDeLinea,
    traslacion: () => traslacion,
    trazosDeTramo: () => trazosDeTramo,
    utf8ABytes: () => utf8ABytes,
    validarTrama: () => validarTrama,
    valorDeCaptura: () => valorDeCaptura,
    valorEn: () => valorEn,
    valorFijo: () => valorFijo
  });

  // src/motor/ruido.ts
  var PERMUTACION = (() => {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let semilla = 795580957;
    for (let i = 255; i > 0; i--) {
      semilla = Math.imul(semilla, 1664525) + 1013904223 >>> 0;
      const j = semilla % (i + 1);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    const salida = new Uint8Array(512);
    for (let i = 0; i < 512; i++) salida[i] = p[i & 255];
    return salida;
  })();
  function gradiente(h, x, y, z) {
    switch (h & 15) {
      case 0:
        return x + y;
      case 1:
        return -x + y;
      case 2:
        return x - y;
      case 3:
        return -x - y;
      case 4:
        return x + z;
      case 5:
        return -x + z;
      case 6:
        return x - z;
      case 7:
        return -x - z;
      case 8:
        return y + z;
      case 9:
        return -y + z;
      case 10:
        return y - z;
      case 11:
        return -y - z;
      case 12:
        return x + y;
      case 13:
        return -y + z;
      case 14:
        return -x + y;
      default:
        return -y - z;
    }
  }
  function ruido(x, y, z) {
    const P2 = PERMUTACION;
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const X = fx & 255, Y = fy & 255, Z = fz & 255;
    x -= fx;
    y -= fy;
    z -= fz;
    const u = x * x * x * (x * (x * 6 - 15) + 10), v = y * y * y * (y * (y * 6 - 15) + 10), w = z * z * z * (z * (z * 6 - 15) + 10);
    const A = P2[X] + Y, AA = P2[A] + Z, AB = P2[A + 1] + Z, B = P2[X + 1] + Y, BA = P2[B] + Z, BB = P2[B + 1] + Z;
    const a = gradiente(P2[AA], x, y, z), b = gradiente(P2[BA], x - 1, y, z), c = gradiente(P2[AB], x, y - 1, z), d = gradiente(P2[BB], x - 1, y - 1, z);
    const e = gradiente(P2[AA + 1], x, y, z - 1), f = gradiente(P2[BA + 1], x - 1, y, z - 1), g = gradiente(P2[AB + 1], x, y - 1, z - 1), h = gradiente(P2[BB + 1], x - 1, y - 1, z - 1);
    const ab = a + u * (b - a), cd = c + u * (d - c), ef = e + u * (f - e), gh = g + u * (h - g);
    const l1 = ab + v * (cd - ab), l2 = ef + v * (gh - ef);
    return (l1 + w * (l2 - l1)) * 0.7;
  }

  // src/motor/camara.ts
  function multiplicar(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  }
  function rotacionX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  }
  function rotacionY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  }
  function rotacionZ(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }
  function traslacion(x, y, z) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  }
  function suavizado(a, b, x) {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  }

  // src/motor/configuracion.ts
  var CONFIGURACION_POR_DEFECTO = Object.freeze({
    lineas: 64,
    puntosPorLinea: 480,
    anchoLamina: 4,
    largoLamina: 13,
    serpenteo: 1,
    torsion: 0.5,
    pliegues: 1.8,
    frecuenciaPliegues: 2,
    curvatura: 1.8,
    ondulacion: 0.22,
    frecuenciaOndulacion: 1.3,
    velocidad: 0.25,
    grosor: 1.6,
    crecimientoPorCercania: 1,
    inclinacion: 18,
    giro: -6,
    distancia: 5,
    desplazamientoX: 0,
    desplazamientoY: 0,
    brillo: 1.1,
    apagadoPorDistancia: 1,
    paralaje: 1,
    deformacionCursor: 0.5,
    radioCursor: 0.22,
    opacidadPunto: 1,
    grosorLinea: 1.4,
    opacidadLinea: 0.4
  });
  var PARAMETROS_MOTOR = Object.keys(CONFIGURACION_POR_DEFECTO);
  var PARAMETROS_ENTEROS = ["lineas", "puntosPorLinea"];
  var NOMBRE_V7 = Object.freeze({
    lineas: "lineCount",
    puntosPorLinea: "points",
    anchoLamina: "sheetWidth",
    largoLamina: "sheetLength",
    serpenteo: "meander",
    torsion: "twist",
    pliegues: "fold",
    frecuenciaPliegues: "foldFreq",
    curvatura: "curl",
    ondulacion: "wave",
    frecuenciaOndulacion: "waveFreq",
    velocidad: "speed",
    grosor: "size",
    crecimientoPorCercania: "perspectiveSize",
    inclinacion: "tilt",
    giro: "roll",
    distancia: "distance",
    desplazamientoX: "offsetX",
    desplazamientoY: "offsetY",
    brillo: "intensity",
    apagadoPorDistancia: "depthFade",
    paralaje: "parallax",
    deformacionCursor: "mouseForm",
    radioCursor: "mouseRadius",
    opacidadPunto: "dotAlpha",
    grosorLinea: "lineWeight",
    opacidadLinea: "lineAlpha"
  });
  function configuracionPorDefecto() {
    return { ...CONFIGURACION_POR_DEFECTO };
  }

  // src/motor/lamina.ts
  var MOTOR_ID = "superficie-de-puntos";
  var MOTOR_VERSION = "1.0.0";
  var VALORES_POR_PUNTO = 5;
  function dimensionesDeLamina(cfg, calidad = 1) {
    return {
      lineas: Math.max(2, Math.round(cfg.lineas * Math.min(1, calidad * 1.2))),
      puntos: Math.max(8, Math.round(cfg.puntosPorLinea * calidad))
    };
  }
  function tamanoDeCuadro(cfg, calidad = 1) {
    const d = dimensionesDeLamina(cfg, calidad);
    return d.lineas * d.puntos * VALORES_POR_PUNTO;
  }
  function escribirLamina(estado, W, H, calidad, destino) {
    const cfg = estado.configuracion, t = estado.tiempo * cfg.velocidad;
    const { lineas: N, puntos: M } = dimensionesDeLamina(cfg, calidad);
    if (destino.length !== N * M * VALORES_POR_PUNTO) throw new RangeError(`el destino mide ${destino.length} y el cuadro ${N * M * VALORES_POR_PUNTO}`);
    const aspect = W / H, d2r = Math.PI / 180;
    const f = 1 / Math.tan((aspect < 1 ? 60 : 42) * d2r / 2);
    let view = traslacion(0, 0, -cfg.distancia * (aspect < 1 ? 1.25 : 1));
    view = multiplicar(view, rotacionZ(cfg.giro * d2r));
    view = multiplicar(view, rotacionX((cfg.inclinacion + estado.camara[1] * 6 * cfg.paralaje) * d2r));
    view = multiplicar(view, rotacionY(estado.camara[0] * 10 * cfg.paralaje * d2r));
    const v0 = view[0], v1 = view[1], v2 = view[2], v4 = view[4], v5 = view[5], v6 = view[6];
    const v8 = view[8], v9 = view[9], v10 = view[10], v12 = view[12], v13 = view[13], v14 = view[14];
    const scalePx = H / 1080;
    const mx = estado.cursor[0], my = estado.cursor[1], mForce = cfg.deformacionCursor * estado.presencia, mr2 = cfg.radioCursor * cfg.radioCursor;
    const axis = new Float32Array(M * 3);
    for (let j = 0; j < M; j++) {
      const u = j / (M - 1), x = (u - 0.5) * cfg.largoLamina;
      axis[j * 3] = cfg.serpenteo * (Math.sin(x * 0.35 + t * 0.5) * 0.45 + ruido(x * 0.16 + 3.1, t * 0.18, 1.7) * 1.3);
      axis[j * 3 + 1] = cfg.serpenteo * ruido(x * 0.14 + 7.3, t * 0.15, 4.2) * 1.4;
      axis[j * 3 + 2] = cfg.torsion * x * 0.28 + cfg.pliegues * ruido(x * 0.22 * cfg.frecuenciaPliegues + 11, t * 0.12, 8.6) * 3.2 + t * 0.15;
    }
    const half = cfg.anchoLamina / 2, curl = cfg.curvatura;
    let o = 0;
    for (let i = 0; i < N; i++) {
      const v = i / (N - 1) * 2 - 1;
      const edge = 1 - suavizado(0.82, 1, Math.abs(v)) * 0.85;
      for (let j = 0; j < M; j++) {
        const u = j / (M - 1), x = (u - 0.5) * cfg.largoLamina;
        const th = axis[j * 3 + 2];
        let oy, oz;
        if (Math.abs(curl) < 1e-3) {
          oy = Math.sin(th) * v * half;
          oz = Math.cos(th) * v * half;
        } else {
          const R = half / curl, a2 = v * curl;
          oy = R * (Math.sin(th + a2) - Math.sin(th));
          oz = R * (Math.cos(th) - Math.cos(th + a2));
        }
        const px = x;
        let py = axis[j * 3] + oy, pz = axis[j * 3 + 1] + oz;
        const wv = cfg.ondulacion * ruido(x * cfg.frecuenciaOndulacion * 0.6, v * cfg.frecuenciaOndulacion * 1.4 + 20, t * 0.4);
        py += wv * Math.cos(th + v * curl);
        pz -= wv * Math.sin(th + v * curl);
        const cx = v0 * px + v4 * py + v8 * pz + v12;
        const cy = v1 * px + v5 * py + v9 * pz + v13;
        let cz = v2 * px + v6 * py + v10 * pz + v14;
        if (cz > -0.15) {
          destino[o] = 0;
          destino[o + 1] = 0;
          destino[o + 2] = 0;
          destino[o + 3] = 0;
          destino[o + 4] = 0;
          o += 5;
          continue;
        }
        let nx = f / aspect * cx / -cz, ny = f * cy / -cz - cfg.desplazamientoY * 2;
        nx -= cfg.desplazamientoX * 2;
        if (mForce) {
          const dx = (nx - (mx * 2 - 1)) * aspect, dy = ny - (my * 2 - 1);
          const k = mForce * Math.exp(-(dx * dx + dy * dy) / mr2);
          if (k > 1e-3) {
            const dd = Math.hypot(dx, dy) || 1;
            cz += k * 0.7;
            nx += dx / dd / aspect * k * 0.02;
            ny += dy / dd * k * 0.02;
          }
        }
        const depth = -cz;
        const sx = (nx + 1) / 2 * W, sy = (1 - ny) / 2 * H;
        const near = suavizado(cfg.distancia + 2.5, cfg.distancia - 1.5, depth);
        const persp = Math.pow(cfg.distancia / depth, cfg.crecimientoPorCercania);
        const r = Math.max(0.25, cfg.grosor * 0.5 * persp * scalePx);
        const ends = suavizado(0, 0.08, u) * suavizado(1, 0.92, u);
        const a = cfg.brillo * ends * edge * (1 - cfg.apagadoPorDistancia * 0.8 * (1 - near));
        destino[o] = sx;
        destino[o + 1] = sy;
        destino[o + 2] = r;
        destino[o + 3] = near;
        destino[o + 4] = a;
        o += 5;
      }
    }
    return destino;
  }
  function calcularLamina(estado, W, H, calidad = 1) {
    return escribirLamina(estado, W, H, calidad, new Float32Array(tamanoDeCuadro(estado.configuracion, calidad)));
  }
  function empaquetar(lineas) {
    let n = 0;
    for (const l of lineas) n += l.length;
    const salida = new Float32Array(n);
    let o = 0;
    for (const l of lineas) {
      salida.set(l, o);
      o += l.length;
    }
    return salida;
  }
  function cuadroDeEstado(estado, W, H, calidad = 1) {
    if (!estado.mezcla) return calcularLamina(estado, W, H, calidad);
    const n = tamanoDeCuadro(estado.configuracion, calidad);
    const A = escribirLamina(estado, W, H, calidad, new Float64Array(n));
    const otro = estado.mezcla.estado;
    const cfgB = { ...otro.configuracion, lineas: estado.configuracion.lineas, puntosPorLinea: estado.configuracion.puntosPorLinea };
    const B = escribirLamina({ ...otro, configuracion: cfgB }, W, H, calidad, new Float64Array(n));
    const e = estado.mezcla.e, salida = new Float32Array(n);
    for (let k = 0; k < n; k++) salida[k] = A[k] + (B[k] - A[k]) * e;
    return salida;
  }

  // src/dibujo/color.ts
  var TONOS = 12;
  var NIVELES_DE_ALFA = 4;
  var UMBRAL_TINTA = 0.4;
  var ALFA_MINIMO_PUNTO = 0.02;
  function hexARgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function mezclarHex(a, b, k) {
    const A = hexARgb(a), B = hexARgb(b);
    return "#" + A.map((x, i) => Math.min(255, Math.max(0, Math.round(x + (B[i] - x) * k))).toString(16).padStart(2, "0")).join("");
  }
  function luminancia(hex) {
    const [r, g, b] = hexARgb(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  var TINTAS = ["luz", "tinta", "auto"];
  function modoDeTinta(tinta, fondo) {
    if (tinta === "luz" || tinta === "tinta") return tinta;
    return luminancia(fondo || "#000000") > UMBRAL_TINTA ? "tinta" : "luz";
  }
  function tonosPorProfundidad(lejos, cerca) {
    const D = hexARgb(lejos), A = hexARgb(cerca);
    return Array.from({ length: TONOS }, (_, b) => {
      const k = b / (TONOS - 1);
      return D.map((d, i) => Math.round(d + (A[i] - d) * k));
    });
  }
  function tonoDeCercania(cercania) {
    return Math.min(TONOS - 1, Math.round(cercania * (TONOS - 1)));
  }
  function nivelDeAlfa(alfa) {
    return Math.min(NIVELES_DE_ALFA - 1, Math.floor(alfa * NIVELES_DE_ALFA));
  }
  function alfaDeNivel(nivel) {
    return (nivel + 0.5) / NIVELES_DE_ALFA;
  }

  // src/dibujo/modo.ts
  var MODOS = ["puntos", "lineas", "mixto"];
  function esModo(x) {
    return typeof x === "string" && MODOS.includes(x);
  }
  function modoDe(o, porDefecto = "puntos") {
    if (o == null) return porDefecto;
    if (typeof o === "string") return esModo(o) ? o : porDefecto;
    if (typeof o === "boolean") return o ? "puntos" : "lineas";
    if (typeof o !== "object") return porDefecto;
    const r = o;
    if (esModo(r.render)) return r.render;
    if (esModo(r.modo)) return r.modo;
    if (r.dotted === false) return "lineas";
    if (r.dotted === true) return "puntos";
    return porDefecto;
  }
  var conPuntos = (m) => m !== "lineas";
  var conLineas = (m) => m !== "puntos";

  // src/dibujo/puntos.ts
  var OPACIDAD_MINIMA_PUNTOS = 5e-3;
  function recorrerPuntos(cuadro, opacidadPunto, fn) {
    const da = opacidadPunto;
    if (da <= OPACIDAD_MINIMA_PUNTOS) return;
    for (let k = 0; k < cuadro.length; k += 5) {
      const a = cuadro[k + 4] * da;
      if (a < ALFA_MINIMO_PUNTO) continue;
      fn(k, tonoDeCercania(cuadro[k + 3]), nivelDeAlfa(a));
    }
  }
  var grupoDePunto = (tono, nivel) => tono * 4 + nivel;

  // src/dibujo/tramos.ts
  var PUNTOS_POR_TRAMO = 6;
  var OPACIDAD_MINIMA_LINEAS = 2e-3;
  var ALFA_MINIMO_TRAMO = 8e-3;
  function tramosDeLinea(cuadro, puntosPorLinea, opciones) {
    const la = opciones.opacidadLinea, lw = opciones.grosorLinea;
    const salida = [];
    if (la <= OPACIDAD_MINIMA_LINEAS) return salida;
    const largo = puntosPorLinea * 5;
    for (let base = 0; base + largo <= cuadro.length; base += largo) {
      for (let k = 0; k + 5 < largo; k += 5 * PUNTOS_POR_TRAMO) {
        const end = Math.min(largo - 5, k + 5 * PUNTOS_POR_TRAMO), mid = base + k + Math.floor((end - k) / 10) * 5;
        const a = cuadro[mid + 4] * la;
        if (a < ALFA_MINIMO_TRAMO) continue;
        salida.push({ inicio: base + k, fin: base + end, tono: tonoDeCercania(cuadro[mid + 3]), alfa: a, grosor: Math.max(0.2, cuadro[mid + 2] * lw) });
      }
    }
    return salida;
  }
  function trazosDeTramo(cuadro, tramo) {
    const trazos = [];
    let actual = [];
    for (let q = tramo.inicio; q <= tramo.fin; q += 5) {
      if (cuadro[q + 2] === 0) {
        if (actual.length > 1) trazos.push(actual);
        actual = [];
        continue;
      }
      actual.push(q);
    }
    if (actual.length > 1) trazos.push(actual);
    return trazos;
  }

  // src/dibujo/tiras.ts
  var VALORES_POR_VERTICE = 6;
  var INGLETE_MAXIMO = 2;
  function tirasDeTramos(cuadro, tramos, tonos, opciones = {}) {
    var _a;
    const escala = (_a = opciones.escala) != null ? _a : 1;
    const salida = [];
    const trazoActual = [];
    const vertice = (x, y, c, a) => {
      trazoActual.push(x, y, c[0] / 255, c[1] / 255, c[2] / 255, a);
    };
    for (const tramo of tramos) {
      const color2 = tonos[tramo.tono];
      const alfa = Math.min(1, Math.max(0, tramo.alfa));
      const h = tramo.grosor * escala / 2;
      for (const trazo of trazosDeTramo(cuadro, tramo)) {
        const xs = [], ys = [];
        for (const q of trazo) {
          const x = cuadro[q] * escala, y = cuadro[q + 1] * escala;
          const n2 = xs.length;
          if (n2 && Math.abs(x - xs[n2 - 1]) < 1e-6 && Math.abs(y - ys[n2 - 1]) < 1e-6) continue;
          xs.push(x);
          ys.push(y);
        }
        const n = xs.length;
        if (n < 2) continue;
        const dx = [], dy = [];
        for (let i = 0; i < n - 1; i++) {
          const ex = xs[i + 1] - xs[i], ey = ys[i + 1] - ys[i], l = Math.hypot(ex, ey);
          dx.push(ex / l);
          dy.push(ey / l);
        }
        trazoActual.length = 0;
        for (let i = 0; i < n; i++) {
          let px = xs[i], py = ys[i], nx, ny, largo = h;
          if (i === 0 || i === n - 1) {
            const s = i === 0 ? 0 : n - 2;
            nx = -dy[s];
            ny = dx[s];
            const sentido = i === 0 ? -1 : 1;
            px += dx[s] * h * sentido;
            py += dy[s] * h * sentido;
          } else {
            const tx = dx[i - 1] + dx[i], ty = dy[i - 1] + dy[i], tl = Math.hypot(tx, ty);
            const n0x = -dy[i - 1], n0y = dx[i - 1];
            if (tl < 1e-6) {
              nx = n0x;
              ny = n0y;
            } else {
              nx = -ty / tl;
              ny = tx / tl;
              const coseno = nx * n0x + ny * n0y;
              largo = h / Math.max(coseno, 1 / INGLETE_MAXIMO);
            }
          }
          vertice(px + nx * largo, py + ny * largo, color2, alfa);
          vertice(px - nx * largo, py - ny * largo, color2, alfa);
        }
        if (salida.length) {
          const fin = salida.length;
          for (let j = fin - VALORES_POR_VERTICE; j < fin; j++) salida.push(salida[j]);
          for (let j = 0; j < VALORES_POR_VERTICE; j++) salida.push(trazoActual[j]);
        }
        for (const v of trazoActual) salida.push(v);
      }
    }
    return { vertices: Float32Array.from(salida), cantidad: salida.length / VALORES_POR_VERTICE };
  }

  // src/dibujo/mezcla.ts
  function mezclarCuadros(a, b, u, destino) {
    if (a.length !== b.length) throw new RangeError(`no se pueden mezclar cuadros de ${a.length} y ${b.length} valores`);
    const o = destino && destino.length === a.length ? destino : new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * u;
    return o;
  }

  // src/dibujo/svg.ts
  function cuadroASvg(e) {
    const { cuadro, ancho: W, alto: H } = e;
    const cols = tonosPorProfundidad(e.colores.lejos, e.colores.cerca);
    let body = "";
    if (conLineas(e.modo)) {
      let ls = "";
      for (const tr of tramosDeLinea(cuadro, e.puntosPorLinea, e)) {
        let d = "", pen = false;
        for (let q = tr.inicio; q <= tr.fin; q += 5) {
          if (cuadro[q + 2] === 0) {
            pen = false;
            continue;
          }
          d += (pen ? "L" : "M") + cuadro[q].toFixed(1) + " " + cuadro[q + 1].toFixed(1);
          pen = true;
        }
        if (d) ls += `<path d="${d}" stroke="rgb(${cols[tr.tono].join(",")})" stroke-opacity="${Math.min(1, tr.alfa).toFixed(3)}" stroke-width="${tr.grosor.toFixed(2)}"/>`;
      }
      if (ls) body += `<g id="lineas" fill="none" stroke-linecap="round" stroke-linejoin="round">${ls}</g>`;
    }
    if (conPuntos(e.modo) && e.opacidadPunto > OPACIDAD_MINIMA_PUNTOS) {
      const grupos = Array.from({ length: 48 }, () => []);
      recorrerPuntos(cuadro, e.opacidadPunto, (k, tono, nivel) => {
        grupos[grupoDePunto(tono, nivel)].push(`<circle cx="${cuadro[k].toFixed(1)}" cy="${cuadro[k + 1].toFixed(1)}" r="${cuadro[k + 2].toFixed(2)}"/>`);
      });
      let ds = "";
      grupos.forEach((g, gi) => {
        if (g.length) ds += `<g fill="rgb(${cols[Math.floor(gi / 4)].join(",")})" fill-opacity="${alfaDeNivel(gi % 4)}">${g.join("")}</g>`;
      });
      if (ds) body += `<g id="puntos">${ds}</g>`;
    }
    const mezcla = modoDeTinta(e.tinta, e.colores.fondo) === "tinta" ? "multiply" : "screen";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>circle,path{mix-blend-mode:${mezcla}}</style><rect width="${W}" height="${H}" fill="${e.colores.fondo || "#000000"}"/>${body}</svg>`;
  }

  // src/linea-de-tiempo/suavizados.ts
  var SUAVIZADO = Object.freeze({
    lineal: (u) => u,
    suave: (u) => u * u * (3 - 2 * u),
    entrada: (u) => u * u,
    salida: (u) => 1 - (1 - u) * (1 - u),
    mantener: () => 0
  });
  var CURVAS = Object.freeze({
    lineal: { etiqueta: "Lineal", c: [0, 0, 1, 1] },
    suave: { etiqueta: "Suave", c: [0.42, 0, 0.58, 1] },
    entrada: { etiqueta: "Acelera (entrada lenta)", c: [0.42, 0, 1, 1] },
    salida: { etiqueta: "Frena (salida lenta)", c: [0, 0, 0.58, 1] },
    golpe: { etiqueta: "Golpe (llega de inmediato)", c: [0.05, 0.9, 0.1, 1] },
    respiro: { etiqueta: "Respiro (lento · rápido · lento)", c: [0.75, 0, 0.25, 1] },
    anticipa: { etiqueta: "Anticipación (retrocede y parte)", c: [0.36, -0.45, 0.6, 1] },
    rebote: { etiqueta: "Se pasa y vuelve", c: [0.3, 1.45, 0.6, 1] }
  });
  var CURVA_SUAVE = [0.42, 0, 0.58, 1];
  function bezierCubica(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t, dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (u) => {
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      let t = u;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - u, d = dx(t);
        if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      if (t < 0 || t > 1 || Math.abs(sx(t) - u) > 1e-4) {
        let lo = 0, hi = 1;
        t = u;
        for (let i = 0; i < 30; i++) {
          if (sx(t) < u) lo = t;
          else hi = t;
          t = (lo + hi) / 2;
        }
      }
      return sy(t);
    };
  }
  var cache = /* @__PURE__ */ new Map();
  function suavizadoDe(k) {
    var _a;
    if (k.ease === "curva") {
      if (!k.curva) return SUAVIZADO.lineal;
      const clave = k.curva.join(",");
      let f = cache.get(clave);
      if (!f) {
        f = bezierCubica(...k.curva);
        cache.set(clave, f);
      }
      return f;
    }
    return (_a = SUAVIZADO[k.ease]) != null ? _a : SUAVIZADO.lineal;
  }

  // src/linea-de-tiempo/parametros.ts
  var P = (grupo, ruta, etiqueta, min, max, paso, extra = {}) => ({ ruta, grupo, etiqueta, min, max, paso, ...extra });
  var PARAMETROS_ANIMABLES = Object.freeze([
    P("Tiempo", "evolucion", "Evolución", 0, 1e3, 0.01),
    P("Lámina", "anchoLamina", "Ancho de la lámina", 0.3, 6, 0.05),
    P("Lámina", "largoLamina", "Largo", 4, 24, 0.5),
    P("Lámina", "serpenteo", "Serpenteo del eje", 0, 2.5, 0.05),
    P("Lámina", "torsion", "Torsión", -2, 2, 0.05),
    P("Lámina", "pliegues", "Pliegues", 0, 2.5, 0.05),
    P("Lámina", "frecuenciaPliegues", "Frecuencia de pliegues", 0.2, 4, 0.05),
    P("Lámina", "curvatura", "Curvatura (enrollar)", -3, 3, 0.05),
    P("Lámina", "ondulacion", "Ondulación fina", 0, 1, 0.01),
    P("Lámina", "frecuenciaOndulacion", "Frecuencia de ondulación", 0.2, 5, 0.05),
    P("Trazo", "grosor", "Tamaño de punto / grosor", 0.3, 6, 0.05),
    P("Trazo", "crecimientoPorCercania", "Crecimiento por cercanía", 0, 2, 0.05),
    P("Trazo", "opacidadPunto", "Opacidad de punto", 0, 1.5, 0.01),
    P("Trazo", "grosorLinea", "Grosor de línea", 0.1, 5, 0.05),
    P("Trazo", "opacidadLinea", "Opacidad de línea", 0, 1.5, 0.01),
    P("Trazo", "lineas", "Líneas", 10, 220, 1, { entero: true }),
    P("Trazo", "puntosPorLinea", "Puntos por línea", 30, 600, 1, { entero: true }),
    P("Cámara", "inclinacion", "Inclinación", -60, 60, 1),
    P("Cámara", "giro", "Giro", -90, 90, 1),
    P("Cámara", "distancia", "Distancia", 2.5, 12, 0.1),
    P("Cámara", "desplazamientoX", "Desplazamiento H", -0.5, 0.5, 0.01),
    P("Cámara", "desplazamientoY", "Desplazamiento V", -0.5, 0.5, 0.01),
    P("Cursor", "cursor.x", "Posición X del cursor", 0, 1, 0.01),
    P("Cursor", "cursor.y", "Posición Y del cursor", 0, 1, 0.01),
    P("Cursor", "cursor.presencia", "Presencia del cursor", 0, 1, 0.01),
    P("Cursor", "deformacionCursor", "Deformación del cursor", 0, 2, 0.05),
    P("Cursor", "radioCursor", "Radio del cursor", 0.05, 0.6, 0.01),
    P("Luz y color", "brillo", "Brillo", 0.1, 2, 0.01),
    P("Luz y color", "apagadoPorDistancia", "Apagado por distancia", 0, 1, 0.01),
    P("Luz y color", "color.lejos", "Color lejos", 0, 0, 0, { color: true }),
    P("Luz y color", "color.cerca", "Color cerca", 0, 0, 0, { color: true }),
    P("Luz y color", "color.fondo", "Fondo", 0, 0, 0, { color: true })
  ]);
  var PARAMETRO_ANIMABLE = Object.freeze(
    Object.fromEntries(PARAMETROS_ANIMABLES.map((p) => [p.ruta, p]))
  );
  function esRutaAnimable(x) {
    return Object.prototype.hasOwnProperty.call(PARAMETRO_ANIMABLE, x);
  }
  var CUADROS_POR_SEGUNDO_LINEA = 24;
  var ajustarAGrilla = (t) => Math.round(t * CUADROS_POR_SEGUNDO_LINEA) / CUADROS_POR_SEGUNDO_LINEA;

  // src/linea-de-tiempo/evaluar.ts
  var CURSOR_EN_REPOSO = Object.freeze({ x: 0.5, y: 0.5, presencia: 0 });
  function documentoDeTrama(trama) {
    const tiempo2 = trama.tiempo;
    return {
      configuracion: trama.configuracion,
      colores: { lejos: trama.color.lejos.hex, cerca: trama.color.cerca.hex, fondo: trama.color.fondo.hex },
      pistas: tiempo2.modo === "secuencia" ? tiempo2.pistas : {},
      inicio: tiempo2.inicio,
      cursor: tiempo2.modo === "secuencia" ? tiempo2.cursor : { ...CURSOR_EN_REPOSO }
    };
  }
  function valorFijo(doc, ruta, t) {
    if (ruta === "evolucion") return doc.inicio + t;
    if (ruta === "cursor.x") return doc.cursor.x;
    if (ruta === "cursor.y") return doc.cursor.y;
    if (ruta === "cursor.presencia") return doc.cursor.presencia;
    if (ruta === "color.lejos") return doc.colores.lejos;
    if (ruta === "color.cerca") return doc.colores.cerca;
    if (ruta === "color.fondo") return doc.colores.fondo;
    return doc.configuracion[ruta];
  }
  function interpolar(keys, t, p) {
    const primero = keys[0];
    if (t <= primero.t) return primero.v;
    const ultimo = keys[keys.length - 1];
    if (t >= ultimo.t) return ultimo.v;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
    const a = keys[i], b = keys[i + 1];
    if (a.ease === "mantener" || (p == null ? void 0 : p.entero)) return a.v;
    const u = suavizadoDe(a)((t - a.t) / (b.t - a.t));
    return (p == null ? void 0 : p.color) ? mezclarHex(String(a.v), String(b.v), u) : a.v + (b.v - a.v) * u;
  }
  function valorEn(doc, ruta, t) {
    const k = doc.pistas[ruta];
    return k && k.length ? interpolar(k, t, PARAMETRO_ANIMABLE[ruta]) : valorFijo(doc, ruta, t);
  }
  function evolucionEn(doc, t) {
    const keys = doc.pistas.evolucion;
    if (!keys || !keys.length) return { tiempo: valorEn(doc, "evolucion", t) };
    const primero = keys[0], ultimo = keys[keys.length - 1];
    const v = (k) => k.v;
    if (t <= primero.t) return { tiempo: v(primero) - (primero.t - t) };
    if (t >= ultimo.t) return { tiempo: ultimo.ease === "mantener" ? v(ultimo) : v(ultimo) + (t - ultimo.t) };
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
    const a = keys[i], b = keys[i + 1], u = (t - a.t) / (b.t - a.t);
    if (a.ease === "mantener") return { tiempo: v(a) };
    if (a.ease === "lineal") return { tiempo: v(a) + (v(b) - v(a)) * u };
    return { tiempo: v(a) + (t - a.t), tiempoB: v(b) - (b.t - t), mezcla: suavizadoDe(a)(u) };
  }
  function estadoDeDocumento(doc, t) {
    const configuracion = { ...doc.configuracion };
    const colores = { ...doc.colores };
    for (const p of PARAMETROS_ANIMABLES) {
      if (p.ruta === "evolucion" || p.ruta.startsWith("cursor.")) continue;
      const keys = doc.pistas[p.ruta];
      if (!keys || !keys.length) continue;
      const v = interpolar(keys, t, p);
      if (p.color) colores[p.ruta.slice(6)] = v;
      else configuracion[p.ruta] = p.entero ? Math.round(v) : v;
    }
    const evo = evolucionEn(doc, t);
    const cursor = [valorEn(doc, "cursor.x", t), valorEn(doc, "cursor.y", t)];
    const presencia = valorEn(doc, "cursor.presencia", t);
    const motor = { tiempo: evo.tiempo, camara: [0, 0], cursor, presencia, configuracion };
    if (evo.mezcla != null && evo.mezcla !== 0 && evo.mezcla !== 1) {
      motor.mezcla = { e: evo.mezcla, estado: { tiempo: evo.tiempoB, camara: [0, 0], cursor, presencia, configuracion } };
    }
    return { motor, colores };
  }
  function estadoEn(trama, t, entorno = {}) {
    var _a;
    const { motor, colores } = estadoDeDocumento(documentoDeTrama(trama), t);
    if (trama.tiempo.modo === "vivo") {
      if (trama.interaccion.cursor && entorno.cursor) {
        motor.cursor = [entorno.cursor[0], entorno.cursor[1]];
        motor.presencia = (_a = entorno.presencia) != null ? _a : 1;
      }
      if (trama.interaccion.paralaje && entorno.camara) motor.camara = [entorno.camara[0], entorno.camara[1]];
    }
    return { motor, colores, modo: trama.dibujo.modo, tinta: trama.dibujo.tinta };
  }

  // src/linea-de-tiempo/escenas.ts
  var ID_ESCENA_DE_CIERRE = 0;
  function valorDeCaptura(c, ruta) {
    var _a, _b, _c, _d, _e;
    if (ruta === "evolucion") return c.evolucion;
    if (ruta === "cursor.x") return (_a = c.cursor) == null ? void 0 : _a.x;
    if (ruta === "cursor.y") return (_b = c.cursor) == null ? void 0 : _b.y;
    if (ruta === "cursor.presencia") return (_c = c.cursor) == null ? void 0 : _c.presencia;
    if (ruta.startsWith("color.")) return (_d = c.color) == null ? void 0 : _d[ruta.slice(6)];
    return (_e = c.configuracion) == null ? void 0 : _e[ruta];
  }
  function mismoValor(a, b, p) {
    return p.color ? String(a).toLowerCase() === String(b).toLowerCase() : Math.abs(+a - +b) < Math.max(p.paso / 2, 1e-6);
  }
  function capturaEn(doc, t) {
    const configuracion = {};
    const color2 = {};
    const cursor = {};
    for (const p of PARAMETROS_ANIMABLES) {
      if (p.ruta === "evolucion") continue;
      const v = valorEn(doc, p.ruta, t);
      if (p.ruta.startsWith("cursor.")) cursor[p.ruta.slice(7)] = v;
      else if (p.color) color2[p.ruta.slice(6)] = v;
      else configuracion[p.ruta] = p.entero ? Math.round(v) : v;
    }
    return { evolucion: evolucionEn(doc, t).tiempo, cursor, configuracion, color: color2 };
  }
  function regenerarPistas(tiempo2, base) {
    const fr = 1 / CUADROS_POR_SEGUNDO_LINEA;
    const pistas = {};
    for (const [ruta, keys] of Object.entries(tiempo2.pistas)) {
      const manuales = keys.filter((k) => k.escena === void 0).map((k) => ({ ...k }));
      if (manuales.length) pistas[ruta] = manuales;
    }
    const doc = { ...base, pistas, inicio: tiempo2.inicio, cursor: tiempo2.cursor };
    let lista = tiempo2.escenas.slice().sort((a, b) => a.t - b.t);
    const fin = ajustarAGrilla(tiempo2.duracion);
    if (tiempo2.cerrarCiclo) lista = lista.filter((sc) => Math.abs(ajustarAGrilla(sc.t) - fin) >= fr / 2);
    let prevT = -Infinity;
    const aplicar = (sc) => {
      var _a;
      const t = ajustarAGrilla(sc.t), corte = sc.transicion === "corte";
      const espacio = Number.isFinite(prevT) ? Math.max(0, t - prevT - fr) : t;
      const dur = corte ? 0 : Math.min(sc.duracion, espacio);
      const t0 = ajustarAGrilla(Math.max(0, t - Math.max(dur, fr)));
      for (const p of PARAMETROS_ANIMABLES) {
        if (p.ruta === "evolucion" && !sc.evolucion) continue;
        const destino = valorDeCaptura(sc.captura, p.ruta);
        if (destino === void 0 || destino === null) continue;
        const antes = p.ruta === "evolucion" ? evolucionEn(doc, t0).tiempo : valorEn(doc, p.ruta, t0);
        if (mismoValor(antes, destino, p)) continue;
        const keys = (_a = pistas[p.ruta]) != null ? _a : pistas[p.ruta] = [];
        const poner = (k) => {
          const i = keys.findIndex((x) => Math.abs(x.t - k.t) < fr / 2);
          if (i >= 0) keys[i] = k;
          else keys.push(k);
        };
        if (t < fr) {
          poner({ t: 0, v: destino, ease: "lineal", escena: sc.id });
          continue;
        }
        if (corte || p.entero || dur < fr) {
          poner({ t: ajustarAGrilla(t - fr), v: antes, ease: "mantener", escena: sc.id });
          poner({ t, v: destino, ease: "lineal", escena: sc.id });
        } else {
          poner({ t: t0, v: antes, ease: "curva", curva: [...sc.curva], escena: sc.id });
          poner({ t, v: destino, ease: "lineal", escena: sc.id });
        }
        keys.sort((a, b) => a.t - b.t);
      }
      prevT = t;
    };
    for (const sc of lista) aplicar(sc);
    if (tiempo2.cerrarCiclo) {
      aplicar({
        id: ID_ESCENA_DE_CIERRE,
        t: fin,
        captura: capturaEn(doc, 0),
        evolucion: true,
        transicion: tiempo2.cierre.transicion,
        duracion: tiempo2.cierre.duracion,
        curva: tiempo2.cierre.curva
      });
    }
    return pistas;
  }

  // src/formato/tipos.ts
  var TRAMA_KIND = "contope/trama";
  var FORMATO_VERSION = 1;
  var CLAVES_DE_COLOR = ["lejos", "cerca", "fondo"];
  var SUAVIZADOS = ["lineal", "suave", "entrada", "salida", "mantener", "curva"];

  // src/formato/limites.ts
  var LIMITES = Object.freeze({
    /** Tamaño máximo del texto que `leerTrama` acepta (JSON o código). */
    textoMaximo: 2e6,
    lineasMin: 2,
    lineasMax: 1e3,
    puntosMin: 8,
    puntosMax: 4e3,
    /** Puntos por cuadro (líneas × puntos por línea). 500.000 puntos = 10 MB por cuadro en Float32. */
    puntosPorCuadroMax: 5e5,
    /** Cota para cualquier otro número de la configuración, en valor absoluto. */
    numeroMax: 1e6,
    duracionMax: 600,
    keyframesPorPistaMax: 5e3,
    keyframesMax: 5e4,
    escenasMax: 1e3,
    textoCortoMax: 200,
    /** Bytes de `procedencia` serializada. */
    procedenciaMax: 65536,
    procedenciaProfundidadMax: 32,
    proporcionMin: 0.05,
    proporcionMax: 20,
    medidaMax: 16384,
    duracionTransicionMin: 0.04,
    duracionTransicionMax: 30
  });

  // src/formato/por-defecto.ts
  var COLOR_LEJOS_POR_DEFECTO = "#2a52d6";
  var COLOR_CERCA_POR_DEFECTO = "#3dd6c0";
  var COLOR_FONDO_POR_DEFECTO = "#000000";
  var INICIO_POR_DEFECTO = 6;
  var CIERRE_POR_DEFECTO = Object.freeze({ transicion: "morph", duracion: 1, curva: CURVA_SUAVE });
  var CURSOR_POR_DEFECTO = Object.freeze({ x: 0.5, y: 0.5, presencia: 0 });
  var DURACION_DE_ESCENA_POR_DEFECTO = 1;
  function tramaPorDefecto() {
    return {
      kind: TRAMA_KIND,
      version: FORMATO_VERSION,
      motor: { id: MOTOR_ID, version: MOTOR_VERSION },
      lienzo: { tipo: "libre" },
      dibujo: { modo: "puntos", tinta: "auto" },
      color: {
        lejos: { hex: COLOR_LEJOS_POR_DEFECTO, origen: "manual" },
        cerca: { hex: COLOR_CERCA_POR_DEFECTO, origen: "manual" },
        fondo: { hex: COLOR_FONDO_POR_DEFECTO, origen: "manual" }
      },
      configuracion: configuracionPorDefecto(),
      tiempo: { modo: "vivo", inicio: INICIO_POR_DEFECTO },
      interaccion: { cursor: true, paralaje: false },
      cuadroQuieto: 0
    };
  }

  // src/formato/validar.ts
  var PATRON_HEX = /^#[0-9a-fA-F]{6}$/;
  var PATRON_SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
  var esObjeto = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
  var unir = (base, clave) => typeof clave === "number" ? `${base}[${clave}]` : base ? `${base}.${clave}` : clave;
  var Revision = class {
    constructor() {
      __publicField(this, "errores", []);
    }
    error(ruta, mensaje) {
      this.errores.push({ ruta, mensaje });
    }
    objeto(x, ruta, permitidas) {
      if (!esObjeto(x)) {
        this.error(ruta, "debe ser un objeto");
        return false;
      }
      for (const k of Object.keys(x)) if (!permitidas.includes(k)) this.error(unir(ruta, k), "campo desconocido");
      return true;
    }
    numero(x, ruta, min = -LIMITES.numeroMax, max = LIMITES.numeroMax, entero = false) {
      if (typeof x !== "number" || !Number.isFinite(x)) {
        this.error(ruta, "debe ser un número finito");
        return false;
      }
      if (entero && !Number.isInteger(x)) {
        this.error(ruta, "debe ser un número entero");
        return false;
      }
      if (x < min || x > max) {
        this.error(ruta, `debe estar entre ${min} y ${max}`);
        return false;
      }
      return true;
    }
    booleano(x, ruta) {
      if (typeof x !== "boolean") {
        this.error(ruta, "debe ser verdadero o falso (true/false)");
        return false;
      }
      return true;
    }
    texto(x, ruta, max = LIMITES.textoCortoMax) {
      if (typeof x !== "string") {
        this.error(ruta, "debe ser un texto");
        return false;
      }
      if (x.length > max) {
        this.error(ruta, `es demasiado largo (máximo ${max} caracteres)`);
        return false;
      }
      return true;
    }
    opcion(x, ruta, opciones) {
      if (typeof x !== "string" || !opciones.includes(x)) {
        this.error(ruta, `debe ser uno de: ${opciones.join(", ")}`);
        return false;
      }
      return true;
    }
    hex(x, ruta) {
      if (typeof x !== "string" || !PATRON_HEX.test(x)) {
        this.error(ruta, "debe ser un color #rrggbb (seis cifras hexadecimales)");
        return false;
      }
      return true;
    }
    curva(x, ruta) {
      if (!Array.isArray(x) || x.length !== 4) {
        this.error(ruta, "debe ser una curva [x1, y1, x2, y2]");
        return;
      }
      x.forEach((v, i) => this.numero(v, unir(ruta, i), i % 2 === 0 ? 0 : -10, i % 2 === 0 ? 1 : 10));
    }
  };
  function revisarProcedencia(r, x, ruta) {
    if (!esObjeto(x)) {
      r.error(ruta, "debe ser un objeto");
      return;
    }
    let malo = null;
    const recorrer = (v, rr, prof) => {
      if (malo) return;
      if (prof > LIMITES.procedenciaProfundidadMax) {
        malo = rr;
        return;
      }
      if (v === null || typeof v === "string" || typeof v === "boolean") return;
      if (typeof v === "number") {
        if (!Number.isFinite(v)) malo = rr;
        return;
      }
      if (Array.isArray(v)) {
        v.forEach((w, i) => recorrer(w, unir(rr, i), prof + 1));
        return;
      }
      if (esObjeto(v)) {
        const proto = Object.getPrototypeOf(v);
        if (proto === Object.prototype || proto === null) {
          for (const [k, w] of Object.entries(v)) recorrer(w, unir(rr, k), prof + 1);
          return;
        }
      }
      malo = rr;
    };
    recorrer(x, ruta, 0);
    if (malo) {
      r.error(malo, "sólo puede contener datos JSON (textos, números, booleanos, listas, objetos), con a lo más 32 niveles");
      return;
    }
    if (JSON.stringify(x).length > LIMITES.procedenciaMax) r.error(ruta, `es demasiado grande (máximo ${LIMITES.procedenciaMax} bytes)`);
  }
  function revisarConfiguracion(r, x, ruta) {
    if (!r.objeto(x, ruta, PARAMETROS_MOTOR)) return;
    for (const [k, v] of Object.entries(x)) {
      const p = k;
      if (!PARAMETROS_MOTOR.includes(p)) continue;
      if (p === "lineas") r.numero(v, unir(ruta, k), LIMITES.lineasMin, LIMITES.lineasMax, true);
      else if (p === "puntosPorLinea") r.numero(v, unir(ruta, k), LIMITES.puntosMin, LIMITES.puntosMax, true);
      else r.numero(v, unir(ruta, k));
    }
    const l = x["lineas"], m = x["puntosPorLinea"];
    if (typeof l === "number" && typeof m === "number" && l * m > LIMITES.puntosPorCuadroMax) {
      r.error(ruta, `líneas × puntos por línea no puede pasar de ${LIMITES.puntosPorCuadroMax}`);
    }
  }
  function revisarColor(r, x, ruta) {
    if (typeof x === "string") {
      r.hex(x, ruta);
      return;
    }
    if (!r.objeto(x, ruta, ["hex", "origen", "rol", "huella"])) return;
    if (!("hex" in x)) r.error(unir(ruta, "hex"), "falta el color");
    else r.hex(x["hex"], unir(ruta, "hex"));
    if ("origen" in x) r.opcion(x["origen"], unir(ruta, "origen"), ["adn", "manual"]);
    if ("rol" in x) r.texto(x["rol"], unir(ruta, "rol"));
    if ("huella" in x) r.texto(x["huella"], unir(ruta, "huella"));
    if (x["origen"] !== "adn" && ("rol" in x || "huella" in x)) r.error(ruta, "rol y huella sólo tienen sentido con origen «adn»");
  }
  function revisarFormatoAdn(r, x, ruta) {
    if (!r.objeto(x, ruta, ["id", "requisito", "nombre", "huella"])) return;
    if (!("id" in x)) r.error(unir(ruta, "id"), "falta el id del formato");
    for (const k of ["id", "requisito", "nombre", "huella"]) if (k in x) r.texto(x[k], unir(ruta, k));
  }
  function revisarLienzo(r, x, ruta) {
    if (!esObjeto(x)) {
      r.error(ruta, "debe ser un objeto");
      return;
    }
    const tipo = x["tipo"];
    if (!r.opcion(tipo, unir(ruta, "tipo"), ["libre", "proporcion", "medida"])) return;
    const propios = tipo === "libre" ? [] : tipo === "proporcion" ? ["proporcion"] : ["ancho", "alto"];
    r.objeto(x, ruta, ["tipo", "formatoAdn", ...propios]);
    if (tipo === "proporcion") {
      if (!("proporcion" in x)) r.error(unir(ruta, "proporcion"), "falta la proporción (ancho / alto)");
      else r.numero(x["proporcion"], unir(ruta, "proporcion"), LIMITES.proporcionMin, LIMITES.proporcionMax);
    }
    if (tipo === "medida") {
      for (const k of ["ancho", "alto"]) {
        if (!(k in x)) r.error(unir(ruta, k), `falta el ${k} en px`);
        else r.numero(x[k], unir(ruta, k), 1, LIMITES.medidaMax, true);
      }
    }
    if ("formatoAdn" in x) revisarFormatoAdn(r, x["formatoAdn"], unir(ruta, "formatoAdn"));
  }
  function revisarCaptura(r, x, ruta) {
    if (!r.objeto(x, ruta, ["evolucion", "cursor", "configuracion", "color"])) return;
    if ("evolucion" in x) r.numero(x["evolucion"], unir(ruta, "evolucion"));
    if ("cursor" in x && r.objeto(x["cursor"], unir(ruta, "cursor"), ["x", "y", "presencia"])) {
      for (const [k, v] of Object.entries(x["cursor"])) r.numero(v, unir(unir(ruta, "cursor"), k), -10, 10);
    }
    if ("configuracion" in x) revisarConfiguracion(r, x["configuracion"], unir(ruta, "configuracion"));
    if ("color" in x && r.objeto(x["color"], unir(ruta, "color"), CLAVES_DE_COLOR)) {
      for (const [k, v] of Object.entries(x["color"])) r.hex(v, unir(unir(ruta, "color"), k));
    }
  }
  function revisarTransicion(r, x, ruta) {
    if ("transicion" in x) r.opcion(x["transicion"], unir(ruta, "transicion"), ["morph", "corte"]);
    if ("duracion" in x) r.numero(x["duracion"], unir(ruta, "duracion"), LIMITES.duracionTransicionMin, LIMITES.duracionTransicionMax);
    if ("curva" in x) r.curva(x["curva"], unir(ruta, "curva"));
  }
  function revisarTiempo(r, x, ruta, cuenta) {
    var _a, _b;
    if (!esObjeto(x)) {
      r.error(ruta, "debe ser un objeto");
      return null;
    }
    const modo = (_a = x["modo"]) != null ? _a : "vivo";
    if (!r.opcion(modo, unir(ruta, "modo"), ["vivo", "secuencia"])) return null;
    if (modo === "vivo") {
      r.objeto(x, ruta, ["modo", "inicio"]);
      if ("inicio" in x) r.numero(x["inicio"], unir(ruta, "inicio"));
      return null;
    }
    r.objeto(x, ruta, ["modo", "inicio", "duracion", "pistas", "escenas", "cerrarCiclo", "cierre", "cursor", "alTerminar"]);
    if ("inicio" in x) r.numero(x["inicio"], unir(ruta, "inicio"));
    let duracion = null;
    if (!("duracion" in x)) r.error(unir(ruta, "duracion"), "una secuencia necesita duración (segundos)");
    else if (r.numero(x["duracion"], unir(ruta, "duracion"), 0, LIMITES.duracionMax)) {
      if (x["duracion"] === 0) r.error(unir(ruta, "duracion"), "debe ser mayor que 0");
      else duracion = x["duracion"];
    }
    const tMax = duracion != null ? duracion : LIMITES.duracionMax;
    if ("pistas" in x) {
      const rp = unir(ruta, "pistas");
      if (!esObjeto(x["pistas"])) r.error(rp, "debe ser un objeto: ruta → lista de keyframes");
      else for (const [nombre, keys] of Object.entries(x["pistas"])) {
        const rk = unir(rp, nombre);
        if (!esRutaAnimable(nombre)) {
          const v7 = (_b = Object.entries(NOMBRE_V7).find(([, n]) => n === nombre)) == null ? void 0 : _b[0];
          r.error(rk, nombre === "velocidad" || nombre === "paralaje" ? "no es animable" : `no es una ruta animable${v7 ? ` (en este formato se llama «${v7}»)` : ""}`);
          continue;
        }
        const p = PARAMETRO_ANIMABLE[nombre];
        if (!Array.isArray(keys) || keys.length === 0) {
          r.error(rk, "debe ser una lista con al menos un keyframe");
          continue;
        }
        if (keys.length > LIMITES.keyframesPorPistaMax) {
          r.error(rk, `tiene demasiados keyframes (máximo ${LIMITES.keyframesPorPistaMax})`);
          continue;
        }
        cuenta.keyframes += keys.length;
        let previo = -Infinity;
        keys.forEach((k, i) => {
          const ri = unir(rk, i);
          if (!r.objeto(k, ri, ["t", "v", "ease", "curva", "escena"])) return;
          if (!("t" in k)) r.error(unir(ri, "t"), "falta el instante");
          else if (r.numero(k["t"], unir(ri, "t"), 0, tMax)) {
            if (k["t"] <= previo) r.error(unir(ri, "t"), "los keyframes deben ir en orden de t, sin repetir instantes");
            previo = k["t"];
          }
          if (!("v" in k)) r.error(unir(ri, "v"), "falta el valor");
          else if (p.color) r.hex(k["v"], unir(ri, "v"));
          else if (p.ruta === "lineas") r.numero(k["v"], unir(ri, "v"), LIMITES.lineasMin, LIMITES.lineasMax);
          else if (p.ruta === "puntosPorLinea") r.numero(k["v"], unir(ri, "v"), LIMITES.puntosMin, LIMITES.puntosMax);
          else r.numero(k["v"], unir(ri, "v"));
          if ("ease" in k) r.opcion(k["ease"], unir(ri, "ease"), SUAVIZADOS);
          if (k["ease"] === "curva" && !("curva" in k)) r.error(unir(ri, "curva"), "un keyframe con ease «curva» necesita su curva");
          if ("curva" in k) r.curva(k["curva"], unir(ri, "curva"));
          if ("escena" in k) r.numero(k["escena"], unir(ri, "escena"), 0, Number.MAX_SAFE_INTEGER, true);
        });
      }
    }
    if ("escenas" in x) {
      const re = unir(ruta, "escenas");
      const escenas = x["escenas"];
      if (!Array.isArray(escenas)) r.error(re, "debe ser una lista");
      else if (escenas.length > LIMITES.escenasMax) r.error(re, `tiene demasiadas escenas (máximo ${LIMITES.escenasMax})`);
      else {
        const ids = /* @__PURE__ */ new Set();
        escenas.forEach((sc, i) => {
          const ri = unir(re, i);
          if (!r.objeto(sc, ri, ["id", "t", "captura", "transicion", "duracion", "curva", "evolucion", "nombre"])) return;
          if (!("id" in sc)) r.error(unir(ri, "id"), "falta el id");
          else if (r.numero(sc["id"], unir(ri, "id"), 1, Number.MAX_SAFE_INTEGER, true)) {
            if (ids.has(sc["id"])) r.error(unir(ri, "id"), "id repetido");
            ids.add(sc["id"]);
          }
          if (!("t" in sc)) r.error(unir(ri, "t"), "falta el instante");
          else r.numero(sc["t"], unir(ri, "t"), 0, tMax);
          if (!("captura" in sc)) r.error(unir(ri, "captura"), "falta la captura");
          else revisarCaptura(r, sc["captura"], unir(ri, "captura"));
          revisarTransicion(r, sc, ri);
          if ("evolucion" in sc) r.booleano(sc["evolucion"], unir(ri, "evolucion"));
          if ("nombre" in sc) r.texto(sc["nombre"], unir(ri, "nombre"));
        });
      }
    }
    if ("cerrarCiclo" in x) r.booleano(x["cerrarCiclo"], unir(ruta, "cerrarCiclo"));
    if ("cierre" in x && r.objeto(x["cierre"], unir(ruta, "cierre"), ["transicion", "duracion", "curva"])) revisarTransicion(r, x["cierre"], unir(ruta, "cierre"));
    if ("cursor" in x && r.objeto(x["cursor"], unir(ruta, "cursor"), ["x", "y", "presencia"])) {
      for (const [k, v] of Object.entries(x["cursor"])) r.numero(v, unir(unir(ruta, "cursor"), k), -10, 10);
    }
    if ("alTerminar" in x) r.opcion(x["alTerminar"], unir(ruta, "alTerminar"), ["repetir", "detener"]);
    return duracion;
  }
  function validarTrama(x) {
    const r = new Revision();
    if (!r.objeto(x, "", ["kind", "version", "motor", "nombre", "procedencia", "lienzo", "dibujo", "color", "configuracion", "tiempo", "interaccion", "cuadroQuieto"])) return r.errores;
    if (x["kind"] !== TRAMA_KIND) r.error("kind", `debe ser «${TRAMA_KIND}»`);
    if (x["version"] !== FORMATO_VERSION) {
      r.error("version", typeof x["version"] === "number" ? `versión de formato ${x["version"]} no soportada: este lector entiende la ${FORMATO_VERSION}` : `debe ser ${FORMATO_VERSION}`);
    }
    if (!("motor" in x)) r.error("motor", "falta el motor ({ id, version })");
    else if (r.objeto(x["motor"], "motor", ["id", "version"])) {
      const m = x["motor"];
      if (m["id"] !== MOTOR_ID) r.error("motor.id", `motor desconocido: este lector sólo tiene «${MOTOR_ID}»`);
      const v = typeof m["version"] === "string" ? PATRON_SEMVER.exec(m["version"]) : null;
      if (!v) r.error("motor.version", "debe ser una versión x.y.z");
      else if (v[1] !== "1") r.error("motor.version", `motor ${String(m["version"])} no soportado: este lector tiene la versión 1.x`);
    }
    if ("nombre" in x) r.texto(x["nombre"], "nombre");
    if ("procedencia" in x) revisarProcedencia(r, x["procedencia"], "procedencia");
    if ("lienzo" in x) revisarLienzo(r, x["lienzo"], "lienzo");
    if ("dibujo" in x && r.objeto(x["dibujo"], "dibujo", ["modo", "tinta"])) {
      const d = x["dibujo"];
      if ("modo" in d) r.opcion(d["modo"], "dibujo.modo", MODOS);
      if ("tinta" in d) r.opcion(d["tinta"], "dibujo.tinta", TINTAS);
    }
    if ("color" in x && r.objeto(x["color"], "color", CLAVES_DE_COLOR)) {
      for (const [k, v] of Object.entries(x["color"])) revisarColor(r, v, unir("color", k));
    }
    if ("configuracion" in x) revisarConfiguracion(r, x["configuracion"], "configuracion");
    const cuenta = { keyframes: 0 };
    const duracion = "tiempo" in x ? revisarTiempo(r, x["tiempo"], "tiempo", cuenta) : null;
    if (cuenta.keyframes > LIMITES.keyframesMax) r.error("tiempo.pistas", `demasiados keyframes en total (máximo ${LIMITES.keyframesMax})`);
    if ("interaccion" in x && r.objeto(x["interaccion"], "interaccion", ["cursor", "paralaje"])) {
      for (const [k, v] of Object.entries(x["interaccion"])) r.booleano(v, unir("interaccion", k));
    }
    if ("cuadroQuieto" in x) r.numero(x["cuadroQuieto"], "cuadroQuieto", 0, duracion != null ? duracion : LIMITES.numeroMax);
    return r.errores;
  }
  function describirErrores(errores) {
    return errores.map((e) => `${e.ruta || "(documento)"}: ${e.mensaje}`).join("\n");
  }

  // src/formato/normalizar.ts
  var ErrorDeTrama = class extends Error {
    constructor(errores) {
      super("archivo de trama inválido:\n" + describirErrores(errores));
      __publicField(this, "errores");
      this.name = "ErrorDeTrama";
      this.errores = errores;
    }
  };
  var comoObjeto = (x) => typeof x === "object" && x !== null ? x : {};
  var copiaJson = (x) => JSON.parse(JSON.stringify(x));
  function color(x, porDefecto) {
    if (x === void 0) return { ...porDefecto };
    if (typeof x === "string") return { hex: x.toLowerCase(), origen: "manual" };
    const o = comoObjeto(x);
    const c = { hex: String(o["hex"]).toLowerCase(), origen: o["origen"] === "adn" ? "adn" : "manual" };
    if (typeof o["rol"] === "string") c.rol = o["rol"];
    if (typeof o["huella"] === "string") c.huella = o["huella"];
    return c;
  }
  function captura(x) {
    const o = copiaJson(comoObjeto(x));
    if (o.color) {
      for (const k of CLAVES_DE_COLOR) if (o.color[k]) o.color[k] = o.color[k].toLowerCase();
    }
    return o;
  }
  function tiempo(x, base) {
    var _a;
    const o = comoObjeto(x);
    const inicio = typeof o["inicio"] === "number" ? o["inicio"] : tramaPorDefecto().tiempo.inicio;
    if (((_a = o["modo"]) != null ? _a : "vivo") === "vivo") return { modo: "vivo", inicio };
    const cierre = comoObjeto(o["cierre"]);
    const cursor = comoObjeto(o["cursor"]);
    const pistas = {};
    for (const [ruta, keys] of Object.entries(comoObjeto(o["pistas"]))) {
      pistas[ruta] = keys.map((k) => {
        var _a2;
        const kf = { t: k["t"], v: typeof k["v"] === "string" ? k["v"].toLowerCase() : k["v"], ease: (_a2 = k["ease"]) != null ? _a2 : "lineal" };
        if (k["curva"]) kf.curva = [...k["curva"]];
        if (typeof k["escena"] === "number") kf.escena = k["escena"];
        return kf;
      });
    }
    const escenas = (Array.isArray(o["escenas"]) ? o["escenas"] : []).map((sc) => {
      const e = {
        id: sc["id"],
        t: sc["t"],
        captura: captura(sc["captura"]),
        transicion: sc["transicion"] === "corte" ? "corte" : "morph",
        duracion: typeof sc["duracion"] === "number" ? sc["duracion"] : DURACION_DE_ESCENA_POR_DEFECTO,
        curva: sc["curva"] ? [...sc["curva"]] : [...CURVA_SUAVE],
        evolucion: sc["evolucion"] !== false
      };
      if (typeof sc["nombre"] === "string") e.nombre = sc["nombre"];
      return e;
    }).sort((a, b) => a.t - b.t);
    const secuencia = {
      modo: "secuencia",
      inicio,
      duracion: o["duracion"],
      pistas,
      escenas,
      cerrarCiclo: o["cerrarCiclo"] === true,
      cierre: {
        transicion: cierre["transicion"] === "corte" ? "corte" : CIERRE_POR_DEFECTO.transicion,
        duracion: typeof cierre["duracion"] === "number" ? cierre["duracion"] : CIERRE_POR_DEFECTO.duracion,
        curva: cierre["curva"] ? [...cierre["curva"]] : [...CIERRE_POR_DEFECTO.curva]
      },
      cursor: {
        x: typeof cursor["x"] === "number" ? cursor["x"] : CURSOR_POR_DEFECTO.x,
        y: typeof cursor["y"] === "number" ? cursor["y"] : CURSOR_POR_DEFECTO.y,
        presencia: typeof cursor["presencia"] === "number" ? cursor["presencia"] : CURSOR_POR_DEFECTO.presencia
      },
      alTerminar: o["alTerminar"] === "detener" ? "detener" : "repetir"
    };
    secuencia.pistas = regenerarPistas(secuencia, {
      configuracion: base.configuracion,
      colores: { lejos: base.color.lejos.hex, cerca: base.color.cerca.hex, fondo: base.color.fondo.hex }
    });
    return secuencia;
  }
  function normalizarTrama(x) {
    var _a, _b;
    const errores = validarTrama(x);
    if (errores.length) throw new ErrorDeTrama(errores);
    const o = comoObjeto(x);
    const d = tramaPorDefecto();
    const trama = { ...d, motor: { id: d.motor.id, version: String(comoObjeto(o["motor"])["version"]) } };
    if (typeof o["nombre"] === "string") trama.nombre = o["nombre"];
    if (o["procedencia"] !== void 0) trama.procedencia = copiaJson(o["procedencia"]);
    if (o["lienzo"] !== void 0) trama.lienzo = copiaJson(o["lienzo"]);
    const dibujo = comoObjeto(o["dibujo"]);
    trama.dibujo = { modo: (_a = dibujo["modo"]) != null ? _a : d.dibujo.modo, tinta: (_b = dibujo["tinta"]) != null ? _b : d.dibujo.tinta };
    const c = comoObjeto(o["color"]);
    trama.color = { lejos: color(c["lejos"], d.color.lejos), cerca: color(c["cerca"], d.color.cerca), fondo: color(c["fondo"], d.color.fondo) };
    const cfg = comoObjeto(o["configuracion"]);
    for (const p of PARAMETROS_MOTOR) if (typeof cfg[p] === "number") trama.configuracion[p] = cfg[p];
    trama.tiempo = tiempo(o["tiempo"], trama);
    const i = comoObjeto(o["interaccion"]);
    trama.interaccion = {
      cursor: typeof i["cursor"] === "boolean" ? i["cursor"] : d.interaccion.cursor,
      paralaje: typeof i["paralaje"] === "boolean" ? i["paralaje"] : d.interaccion.paralaje
    };
    if (typeof o["cuadroQuieto"] === "number") trama.cuadroQuieto = o["cuadroQuieto"];
    return trama;
  }

  // src/formato/base64.ts
  var ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var ALFABETO_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var VALOR = {};
  for (let i = 0; i < 64; i++) {
    VALOR[ALFABETO[i]] = i;
    VALOR[ALFABETO_URL[i]] = i;
  }
  function utf8ABytes(texto) {
    const salida = [];
    for (const caracter of texto) {
      const c = caracter.codePointAt(0);
      if (c < 128) salida.push(c);
      else if (c < 2048) salida.push(192 | c >> 6, 128 | c & 63);
      else if (c < 65536) salida.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
      else salida.push(240 | c >> 18, 128 | c >> 12 & 63, 128 | c >> 6 & 63, 128 | c & 63);
    }
    return Uint8Array.from(salida);
  }
  function bytesAUtf8(b) {
    let s = "";
    for (let i = 0; i < b.length; ) {
      const c = b[i];
      let cp, n;
      if (c < 128) {
        cp = c;
        n = 0;
      } else if (c >= 194 && c < 224) {
        cp = c & 31;
        n = 1;
      } else if (c >= 224 && c < 240) {
        cp = c & 15;
        n = 2;
      } else if (c >= 240 && c < 245) {
        cp = c & 7;
        n = 3;
      } else throw new Error("UTF-8 inválido");
      for (let j = 1; j <= n; j++) {
        const d = b[i + j];
        if (d === void 0 || (d & 192) !== 128) throw new Error("UTF-8 inválido");
        cp = cp << 6 | d & 63;
      }
      i += n + 1;
      s += String.fromCodePoint(cp);
    }
    return s;
  }
  function bytesABase64(b, url = false) {
    var _a, _b;
    const A = url ? ALFABETO_URL : ALFABETO;
    let s = "";
    for (let i = 0; i < b.length; i += 3) {
      const n = b[i] << 16 | ((_a = b[i + 1]) != null ? _a : 0) << 8 | ((_b = b[i + 2]) != null ? _b : 0);
      s += A[n >> 18 & 63] + A[n >> 12 & 63];
      s += i + 1 < b.length ? A[n >> 6 & 63] : url ? "" : "=";
      s += i + 2 < b.length ? A[n & 63] : url ? "" : "=";
    }
    return s;
  }
  function base64ABytes(s) {
    const limpio = s.replace(/=+$/, "");
    if (limpio.length % 4 === 1) throw new Error("base64 inválido");
    const salida = [];
    let acumulado = 0, bits = 0;
    for (const ch of limpio) {
      const v = VALOR[ch];
      if (v === void 0) throw new Error("base64 inválido");
      acumulado = (acumulado << 6 | v) & 16777215;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        salida.push(acumulado >> bits & 255);
      }
    }
    return Uint8Array.from(salida);
  }

  // src/formato/codigo.ts
  var PREFIJO_CODIGO = "CT1.";
  var PREFIJO_SP1 = "SP1.";
  var esObjeto2 = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
  var falla = (mensaje, origen) => origen ? { ok: false, errores: [{ ruta: "", mensaje }], origen } : { ok: false, errores: [{ ruta: "", mensaje }] };
  function capturaV7ATrama(st) {
    const avisos = [];
    const cfg = esObjeto2(st["cfg"]) ? st["cfg"] : {};
    const configuracion = {};
    for (const p of PARAMETROS_MOTOR) {
      const v = cfg[NOMBRE_V7[p]];
      if (typeof v === "number" && Number.isFinite(v)) configuracion[p] = v;
    }
    const hex = (v, porDefecto) => typeof v === "string" && PATRON_HEX.test(v) ? v.toLowerCase() : porDefecto;
    const tinta = cfg["inkMode"] === "luz" || cfg["inkMode"] === "tinta" ? cfg["inkMode"] : "auto";
    const documento = {
      kind: TRAMA_KIND,
      version: FORMATO_VERSION,
      motor: { id: MOTOR_ID, version: MOTOR_VERSION },
      dibujo: { modo: modoDe(st, "puntos"), tinta },
      color: {
        lejos: hex(cfg["colorDeep"], COLOR_LEJOS_POR_DEFECTO),
        cerca: hex(cfg["colorAccent"], COLOR_CERCA_POR_DEFECTO),
        fondo: hex(cfg["colorBg"], COLOR_FONDO_POR_DEFECTO)
      },
      configuracion,
      tiempo: { modo: "vivo", inicio: st["time"] }
    };
    const formato = typeof st["format"] === "string" ? /^(\d+)x(\d+)$/.exec(st["format"]) : null;
    if (formato) documento["lienzo"] = { tipo: "medida", ancho: Number(formato[1]), alto: Number(formato[2]) };
    if (st["blend"]) avisos.push("la captura se tomó a mitad de un morf: se usó el momento de partida");
    return { documento, avisos };
  }
  function lecturaDeDocumento(doc, origen, avisos = []) {
    const errores = validarTrama(doc);
    if (errores.length) return { ok: false, errores, origen };
    return { ok: true, trama: normalizarTrama(doc), origen, avisos };
  }
  function leerTrama(entrada) {
    if (typeof entrada !== "string") {
      return esObjeto2(entrada) ? lecturaDeDocumento(entrada, "objeto") : falla("se esperaba un texto o un objeto");
    }
    if (entrada.length > LIMITES.textoMaximo) return falla(`el texto es demasiado grande (máximo ${LIMITES.textoMaximo} caracteres)`);
    const texto = entrada.trim();
    if (texto.startsWith(PREFIJO_SP1)) {
      let st;
      try {
        st = JSON.parse(bytesAUtf8(base64ABytes(texto.slice(4))));
      } catch (e) {
        return falla("código SP1 ilegible (base64 o JSON roto)", "sp1");
      }
      if (!esObjeto2(st) || typeof st["time"] !== "number" || !Number.isFinite(st["time"]) || !esObjeto2(st["cfg"])) {
        return falla("código SP1 sin instante (time) o sin configuración (cfg)", "sp1");
      }
      const { documento, avisos } = capturaV7ATrama(st);
      return lecturaDeDocumento(documento, "sp1", avisos);
    }
    if (texto.startsWith(PREFIJO_CODIGO)) {
      let doc;
      try {
        doc = JSON.parse(bytesAUtf8(base64ABytes(texto.slice(4))));
      } catch (e) {
        return falla("código CT1 ilegible (base64 o JSON roto)", "ct1");
      }
      return lecturaDeDocumento(doc, "ct1");
    }
    if (texto.startsWith("{")) {
      let doc;
      try {
        doc = JSON.parse(texto);
      } catch (e) {
        return falla(`JSON inválido: ${e.message}`, "json");
      }
      return lecturaDeDocumento(doc, "json");
    }
    return falla("no se reconoce: se esperaba un archivo de trama en JSON o un código CT1. o SP1.");
  }
  function compactarTrama(trama) {
    const d = tramaPorDefecto();
    const o = { kind: trama.kind, version: trama.version, motor: { ...trama.motor } };
    if (trama.nombre !== void 0) o["nombre"] = trama.nombre;
    if (trama.procedencia !== void 0) o["procedencia"] = trama.procedencia;
    if (trama.lienzo.tipo !== "libre" || trama.lienzo.formatoAdn) o["lienzo"] = trama.lienzo;
    const dibujo = {};
    if (trama.dibujo.modo !== d.dibujo.modo) dibujo["modo"] = trama.dibujo.modo;
    if (trama.dibujo.tinta !== d.dibujo.tinta) dibujo["tinta"] = trama.dibujo.tinta;
    if (Object.keys(dibujo).length) o["dibujo"] = dibujo;
    const color2 = {};
    for (const k of CLAVES_DE_COLOR) {
      const c = trama.color[k];
      const simple = c.origen === "manual" && c.rol === void 0 && c.huella === void 0;
      if (simple && c.hex === d.color[k].hex) continue;
      color2[k] = simple ? c.hex : c;
    }
    if (Object.keys(color2).length) o["color"] = color2;
    const cfg = {};
    for (const p of PARAMETROS_MOTOR) if (trama.configuracion[p] !== CONFIGURACION_POR_DEFECTO[p]) cfg[p] = trama.configuracion[p];
    if (Object.keys(cfg).length) o["configuracion"] = cfg;
    const t = trama.tiempo;
    if (t.modo === "vivo") {
      if (t.inicio !== d.tiempo.inicio) o["tiempo"] = { modo: "vivo", inicio: t.inicio };
    } else {
      const pistas = {};
      for (const [ruta, keys] of Object.entries(t.pistas)) {
        const manuales = keys.filter((k) => k.escena === void 0);
        if (manuales.length) pistas[ruta] = manuales;
      }
      o["tiempo"] = { ...t, pistas };
    }
    if (trama.interaccion.cursor !== d.interaccion.cursor || trama.interaccion.paralaje !== d.interaccion.paralaje) o["interaccion"] = trama.interaccion;
    if (trama.cuadroQuieto !== d.cuadroQuieto) o["cuadroQuieto"] = trama.cuadroQuieto;
    return o;
  }
  function codificarTrama(trama) {
    return PREFIJO_CODIGO + bytesABase64(utf8ABytes(JSON.stringify(compactarTrama(trama))), true);
  }
  function escribirTrama(trama) {
    return JSON.stringify(trama, null, 2) + "\n";
  }

  // src/reproduccion.ts
  function instanteDeCuadro(trama, k, fps) {
    const t = trama.tiempo;
    if (t.modo === "vivo") return k / fps;
    if (t.alTerminar === "detener") return Math.min(k / fps, t.duracion);
    const total = Math.max(1, Math.round(t.duracion * fps));
    return (k % total + total) % total / fps;
  }
  function cuadrosDeSecuencia(trama, fps) {
    return trama.tiempo.modo === "vivo" ? null : Math.max(1, Math.round(trama.tiempo.duracion * fps));
  }
  function cuadroEn(trama, t, ancho, alto, calidad = 1, entorno = {}) {
    const estado = estadoEn(trama, t, entorno);
    return { cuadro: cuadroDeEstado(estado.motor, ancho, alto, calidad), estado };
  }

  // src/worker/atendedor.ts
  function crearAtendedor(enviar, programar) {
    let trabajo = null;
    let gen = -1, siguiente = 0, hasta = -1, ocupado = false;
    const bombear = () => {
      if (!trabajo || siguiente > hasta) {
        ocupado = false;
        return;
      }
      ocupado = true;
      const k = siguiente++, g = gen, { trama, ancho, alto, fps, calidad } = trabajo;
      const t = instanteDeCuadro(trama, k, fps);
      const estado = estadoEn(trama, t);
      const datos = cuadroDeEstado(estado.motor, ancho, alto, calidad);
      enviar({ tipo: "cuadro", gen: g, k, t, datos, colores: estado.colores }, [datos.buffer]);
      programar(bombear);
    };
    return (m) => {
      if (typeof m !== "object" || m === null) return;
      const msg = m;
      if (msg.tipo === "configurar") {
        const c = msg;
        gen = c.gen;
        siguiente = 0;
        hasta = -1;
        trabajo = null;
        const lectura = leerTrama(c.trama);
        const medidas = [c.ancho, c.alto, c.fps].every((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
        if (!lectura.ok || !medidas) {
          enviar({ tipo: "error", gen, errores: lectura.ok ? [{ ruta: "", mensaje: "ancho, alto y fps deben ser números positivos" }] : lectura.errores });
          return;
        }
        const calidad = typeof c.calidad === "number" && c.calidad > 0 && c.calidad <= 1 ? c.calidad : 1;
        trabajo = { trama: lectura.trama, ancho: c.ancho, alto: c.alto, fps: c.fps, calidad };
        const d = dimensionesDeLamina(lectura.trama.configuracion, calidad);
        enviar({ tipo: "configurado", gen, lineas: d.lineas, puntos: d.puntos, avisos: lectura.avisos });
      } else if (msg.tipo === "pedir" && trabajo && msg.gen === gen && typeof msg.hasta === "number") {
        hasta = Math.max(hasta, msg.hasta);
      }
      if (!ocupado) bombear();
    };
  }
  return __toCommonJS(global_exports);
})();
if (typeof module === "object" && module && module.exports) module.exports = ContopeTrama;
