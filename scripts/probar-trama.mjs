/**
 * Verifica el reproductor de tramas y el motor traído de core, sin navegador.
 *
 * Lo que se mide:
 *  - EL MOTOR ES EL DE CORE: los sha256 y tamaños de
 *    `assets/vendor/contope-trama/` coinciden con su MOTOR.json (lo escribió
 *    scripts/traer-motor-trama.mjs; nadie lo editó a mano);
 *  - HUELLA FIJA: el cuadro de referencia (la trama por defecto, evolución 6,
 *    1600×900) da `9c130d7e7d11640b`, la misma huella que fijaba la primera
 *    versión con su motor embebido. Si cambiara, toda trama publicada se
 *    vería distinta. También a través de un SP1 viejo;
 *  - el reproductor (`cod-trama.js`) NO contiene el motor: ni el TRAMA_ENGINE
 *    de antes ni un decodificador propio, y el worker es un ARCHIVO del
 *    plugin, nunca `blob:` ni `Function.toString()`;
 *  - lectura: JSON, CT1 y SP1 se leen; algo roto devuelve errores y no lanza;
 *  - determinismo y tamaño fijo de cada cuadro (condición para interpolar);
 *  - el worker de líneas (`cod-trama-tiras-worker.js`), corrido en una
 *    sandbox de Node con el motor de vendor, entrega cuadros con sus tiras.
 *
 * Uso: node scripts/probar-trama.mjs   (código de salida 0 = pasó)
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const raiz = new URL('../contope-publisher/assets/', import.meta.url);
const leerArchivo = (ruta) => readFileSync(new URL(ruta, raiz));
const texto = (ruta) => leerArchivo(ruta).toString('utf8');

let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FALLA') + ' ' + msg); if (!cond) fallas++; };
const sha = (b) => createHash('sha256').update(b).digest('hex');

// 1. El motor de vendor es el de core, sin tocar.
const motor = JSON.parse(texto('vendor/contope-trama/MOTOR.json'));
for (const nombre of ['contope-trama.js', 'contope-trama-worker.js']) {
  const b = leerArchivo('vendor/contope-trama/' + nombre);
  ok(sha(b) === motor.archivos[nombre].sha256 && b.length === motor.archivos[nombre].bytes, `vendor/${nombre}: sha256 y bytes = MOTOR.json`);
}
ok(/^[0-9a-f]{40}$/.test(motor.origen?.commit || ''), `MOTOR.json anota el commit de core (${(motor.origen?.commit || '?').slice(0, 7)})`);

const T = require('../contope-publisher/assets/vendor/contope-trama/contope-trama.js');
const O = require('../contope-publisher/assets/js/cod-trama.js');
ok(O.motor === T, 'el reproductor usa ContopeTrama de vendor');
ok(motor.motor.version === T.MOTOR_VERSION && motor.formato.version === T.FORMATO_VERSION, `motor ${T.MOTOR_VERSION}, formato v${T.FORMATO_VERSION}`);

// 2. Huella de referencia, con el motor de vendor.
const HUELLA_REF = '9c130d7e7d11640b';
const huella = (cuadro) => sha(Buffer.from(Float32Array.from(cuadro, (v) => Math.round(v * 100) / 100).buffer)).slice(0, 16);
const porDefecto = T.leerTrama({ kind: 'contope/trama', version: 1, motor: { id: 'superficie-de-puntos', version: '1.0.0' } });
const ref = T.cuadroEn(porDefecto.trama, 0, 1600, 900, 1).cuadro;
ok(huella(ref) === HUELLA_REF, `huella del cuadro de referencia (${huella(ref)})`);

const sp1 = 'SP1.' + Buffer.from(JSON.stringify({ time: 6, cam: [0, 0], mouse: [0.5, 0.5], presence: 0, cfg: {}, dotted: true }), 'utf8').toString('base64');
const lSp1 = O.leer(sp1);
ok(lSp1.ok && lSp1.origen === 'sp1' && huella(T.cuadroEn(lSp1.trama, 0, 1600, 900, 1).cuadro) === HUELLA_REF, 'un SP1 viejo da la misma huella');
ok(lSp1.ok && lSp1.compat?.sinFondo === true && lSp1.trama.lienzo.tipo === 'libre', 'SP1: sin fondo y lienzo libre, como se dibujaba antes');

// 3. El reproductor no trae motor y el worker es un archivo.
const fuente = texto('js/cod-trama.js');
// Sin comentarios: los comentarios explican que NO se usa `blob:`, y eso no es código.
const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
ok(!/TRAMA_ENGINE|computeSheet|packFrame|PERM\b|function noise|atob\(/.test(codigo), 'cod-trama.js no contiene el motor ni un decodificador propio');
ok(!/blob:|createObjectURL|new\s+(win\.)?Blob|\.toString\(\)/.test(codigo), 'cod-trama.js no arma workers con blob: ni toString()');
ok(/new win\.Worker\(url\)/.test(codigo) && /contope-trama-worker\.js/.test(codigo), 'el worker se crea desde la URL de un archivo');
const tiras = texto('js/cod-trama-tiras-worker.js');
ok(/importScripts\(new URL\('\.\.\/vendor\/contope-trama\/contope-trama\.js'/.test(tiras) && !/calcularLamina\s*\(|function ruido/.test(tiras),
  'el worker de líneas carga el motor de vendor y no trae uno propio');

// 4. Lectura: JSON, CT1, SP1 y lo roto.
const doc = { kind: 'contope/trama', version: 1, motor: { id: 'superficie-de-puntos', version: '1.0.0' }, dibujo: { modo: 'mixto' } };
const lJson = O.leer(JSON.stringify(doc));
ok(lJson.ok && lJson.origen === 'json' && lJson.trama.dibujo.modo === 'mixto', 'lee un archivo de trama en JSON');
const ct1 = T.codificarTrama(lJson.trama);
const lCt1 = O.leer(ct1);
ok(ct1.startsWith('CT1.') && lCt1.ok && lCt1.origen === 'ct1' && JSON.stringify(lCt1.trama) === JSON.stringify(lJson.trama), 'lee un CT1 (ida y vuelta)');
let lanzó = false, rotos = [];
try { rotos = [O.leer('CT1.no-es-base64!!'), O.leer('SP1.xx'), O.leer(''), O.leer(null), O.leer('{"kind":"otra"}'), O.leer('XX1.abc')]; } catch { lanzó = true; }
ok(!lanzó && rotos.every((r) => r.ok === false && r.errores.length > 0), 'algo roto devuelve errores y nunca lanza');

// 5. Determinismo y tamaño fijo.
const a = T.cuadroEn(lJson.trama, 1.5, 1200, 700).cuadro, b = T.cuadroEn(lJson.trama, 1.5, 1200, 700).cuadro;
ok(a.length === b.length && a.every((v, i) => v === b[i]), 'determinismo: dos cálculos idénticos');
const d = T.dimensionesDeLamina(lJson.trama.configuracion, 1);
ok(a.length === d.lineas * d.puntos * 5 && T.cuadroEn(lJson.trama, 9.5, 1200, 700).cuadro.length === a.length, 'cuadros de tamaño fijo: se pueden interpolar');

// 6. El worker de líneas, en una sandbox con el motor de vendor.
const mensajes = [];
const ambito = {
  self: null,
  location: { href: 'https://ejemplo.test/wp-content/plugins/contope-publisher/assets/js/cod-trama-tiras-worker.js?ver=1', search: '?ver=1' },
  URL,
  setTimeout: (fn) => setImmediate(fn),
  postMessage: (m) => mensajes.push(m),
  importScripts: (url) => {
    ok(url === 'https://ejemplo.test/wp-content/plugins/contope-publisher/assets/vendor/contope-trama/contope-trama.js?ver=1', 'el worker de líneas pide el motor a la carpeta vendor del plugin');
    vm.runInContext(texto('vendor/contope-trama/contope-trama.js'), ambito);
  },
};
ambito.self = ambito;
vm.createContext(ambito);
vm.runInContext(tiras, ambito);
ambito.self.onmessage({ data: { tipo: 'configurar', gen: 1, trama: ct1, ancho: 800, alto: 450, fps: 12 } });
ambito.self.onmessage({ data: { tipo: 'pedir', gen: 1, hasta: 1 } });
await new Promise((r) => setTimeout(r, 300));
const cuadros = mensajes.filter((m) => m.tipo === 'cuadro');
ok(mensajes[0]?.tipo === 'configurado' && cuadros.length === 2, `el worker de líneas responde (${mensajes.map((m) => m.tipo).join(', ')})`);
ok(cuadros.every((m) => m.tiras && m.tiras.length === m.vertices * 6 && m.vertices > 0), `cada cuadro trae sus tiras (${cuadros[0]?.vertices} vértices)`);
const esperado = (() => {
  const c = T.cuadroEn(lJson.trama, 0, 800, 450).cuadro, cfg = lJson.trama.configuracion;
  const tr = T.tramosDeLinea(c, T.dimensionesDeLamina(cfg, 1).puntos, { grosorLinea: cfg.grosorLinea, opacidadLinea: cfg.opacidadLinea });
  return T.tirasDeTramos(c, tr, T.tonosPorProfundidad(lJson.trama.color.lejos.hex, lJson.trama.color.cerca.hex)).vertices;
})();
ok(cuadros[0] && cuadros[0].tiras.length === esperado.length && cuadros[0].tiras.every((v, i) => v === esperado[i]), 'las tiras son las de tirasDeTramos del motor, valor a valor');

process.exit(fallas ? 1 : 0);
