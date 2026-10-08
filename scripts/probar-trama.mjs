/**
 * Verifica el módulo de trama (assets/js/cod-trama.js), sin navegador.
 *
 * Lo que se mide:
 *  - un código de captura válido se decodifica; uno inválido devuelve null y
 *    nunca lanza (una sección con un código roto no debe romper la página);
 *  - DETERMINISMO: el mismo código produce exactamente los mismos puntos dos
 *    veces seguidas;
 *  - HUELLA FIJA: los puntos de un código de referencia coinciden con una
 *    huella guardada. Si el motor cambia, los códigos de captura que ya están
 *    publicados dejarían de reproducir su imagen: esta prueba lo avisa antes;
 *  - cada cuadro tiene siempre la misma cantidad de valores (5 por punto,
 *    también los que quedan detrás de la cámara), condición para interpolar
 *    entre cuadros del buffer;
 *  - el código del worker contiene el mismo motor (un solo motor, no dos).
 *
 * Uso: node scripts/probar-trama.mjs   (código de salida 0 = pasó)
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const T = require('../contope-publisher/assets/js/cod-trama.js');

let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FALLA') + ' ' + msg); if (!cond) fallas++; };

// Código de referencia: preset «Lámina plegada», tiempo 6.
const ref = { time: 6, cam: [0, 0], mouse: [0.5, 0.5], presence: 0, cfg: { ...T.engine.DEFAULTS }, dotted: true };
const code = 'SP1.' + Buffer.from(JSON.stringify(ref), 'utf8').toString('base64');

const st = T.decode(code);
ok(st && st.time === 6 && st.cfg.lineCount === 64, 'decodifica un código válido');
ok(T.decode('SP1.no-es-base64!!') === null, 'código roto → null, sin lanzar');
ok(T.decode('') === null && T.decode(null) === null, 'código vacío → null');
ok(T.decode('XX1.' + code.slice(4)) === null, 'prefijo desconocido → null');

const frame = s => T.engine.packFrame(T.engine.computeSheet({ time: s.time, cam: [0, 0], mouse: [0.5, 0.5], presence: 0, cfg: s.cfg }, 1600, 900, 1));
const a = frame(st), b = frame(st);
ok(a.length === b.length && a.every((v, i) => v === b[i]), 'determinismo: dos cálculos idénticos');
ok(a.length === st.cfg.lineCount * st.cfg.points * 5, `cuadro de tamaño fijo (${a.length} valores = líneas × puntos × 5)`);

const later = frame({ time: 9.5, cfg: st.cfg });
ok(later.length === a.length, 'otro instante, mismo tamaño: se puede interpolar');

const huella = createHash('sha256').update(Buffer.from(Float32Array.from(a, v => Math.round(v * 100) / 100).buffer)).digest('hex').slice(0, 16);
const HUELLA_REF = '9c130d7e7d11640b';
ok(huella === HUELLA_REF, `huella del código de referencia (${huella})`);

const src = require('node:fs').readFileSync(new URL('../contope-publisher/assets/js/cod-trama.js', import.meta.url), 'utf8');
ok(/'var E = \(' \+ TRAMA_ENGINE\.toString\(\) \+ '\)\(\);/.test(src), 'el worker se arma con el mismo motor (TRAMA_ENGINE)');

process.exit(fallas ? 1 : 0);
