/**
 * Arma la tabla de «qué queda» a partir de los `comparacion-estilos-<pagina>-<ancho>.json` que deja comparar-vivo.mjs:
 * cuántas diferencias hay por página y ancho y de qué clase, y las lista (agrupadas, sin repetir).
 *
 *   node resumen-comparacion.mjs [carpeta] > tabla.md
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const carpeta = process.argv[2] || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/capturas-comparacion';
const orden = ['inicio', 'basis-carpas-industriales', 'preguntas-frecuentes', 'contactos'];
const anchos = [1440, 768, 393];
const filas = [];
const detalle = new Map();
for (const p of orden) {
  for (const a of anchos) {
    const f = path.join(carpeta, `comparacion-estilos-${p}-${a}.json`);
    let r;
    try { r = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    const t = r.totales;
    filas.push(`| ${p} | ${a} | ${r.altoOriginal} / ${r.altoLocal} (${r.altoLocal - r.altoOriginal >= 0 ? '+' : ''}${r.altoLocal - r.altoOriginal}) | **${t.total}** | ${t.textosConDiferencia} | ${t.textosFaltan + t.textosSobran} | ${t.imagenes} | ${t.cajas} |`);
    const nota = (clave, texto) => { const e = detalle.get(clave) || { texto, donde: [] }; e.donde.push(`${p} ${a}`); detalle.set(clave, e); };
    for (const x of r.textos.dif) nota('T|' + x.texto.slice(0, 40) + '|' + x.diferencias.map((d) => d.replace(/[-+]?\d+/g, '#')).join(','), `«${x.texto.slice(0, 44)}» (${x.tag}): ${x.diferencias.join(' · ')}`);
    for (const x of r.textos.faltan) nota('F|' + x.texto.slice(0, 40), `falta en el local: «${x.texto.slice(0, 50)}»`);
    for (const x of r.textos.sobran) nota('S|' + x.texto.slice(0, 40), `sobra en el local: «${x.texto.slice(0, 50)}»`);
    for (const x of r.imagenes) nota('I|' + x.archivo, `imagen ${x.archivo}: ${x.problema}`);
  }
}
console.log('| página | ancho | alto original / local | diferencias | textos con diferencia | textos que faltan o sobran | imágenes | cajas |');
console.log('|---|---|---|---|---|---|---|---|');
console.log(filas.join('\n'));
console.log('\nDiferencias de texto e imagen (sin las de cajas, que son sobre todo emparejamientos imposibles de implementación), agrupadas:\n');
for (const [, e] of detalle) console.log(`- ${e.texto} — ${[...new Set(e.donde)].join(', ')}`);
