/**
 * Muda al JSON (projectData) el CSS que hoy vive sólo en la hoja plana.
 *
 * La fuente del CSS es projectData y ninguna otra (decisión del 2026-09-16).
 * Para poder cortar la hoja plana hay que asegurarse primero de que el JSON lo
 * tenga todo: si no, cortar pierde estilos de un sitio publicado.
 *
 * Cómo se comprueba: se le entrega el documento al puente dos veces, una con la
 * hoja y otra con el css vacío, y se comparan los DOS RESULTADOS — qué valor
 * termina teniendo cada propiedad. Comparar el texto de los bloques da falsos
 * positivos apenas se fusionan dos @media de la misma condición.
 *
 * Si la comparación no da cero diferencias, no escribe nada.
 *
 * Uso:
 *   node migrar-css-al-json.mjs <pageId> <documentId>              (simulación)
 *   node migrar-css-al-json.mjs <pageId> <documentId> --aplicar    (guarda)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tool, repo, bloques, internas, condicion, selectorDe, declaraciones, resolver, comparar } from './lib-documento.mjs';

const aplicar = process.argv.includes('--aplicar');
const pageId = Number(process.argv[2]);
const documentId = process.argv[3];
const tmp = path.dirname(fileURLToPath(import.meta.url));
const bridge = path.join(repo, 'contope-publisher/tools/cod-headless-node-edit.mjs');

/** Un selector suelto de clase o id va en `selectors`; cualquier otra cosa, en `selectorsAdd`. */
function aRegla(selector, style, mediaText) {
  const t = selector.trim();
  const base = mediaText ? { style, mediaText, atRuleType: 'media' } : { style };
  if (/^\.[A-Za-z0-9_-]+$/.test(t)) return { selectors: [t.slice(1)], ...base };
  if (/^#[A-Za-z0-9_-]+$/.test(t)) return { selectors: [t], ...base };
  return { selectors: [], selectorsAdd: t, ...base };
}

// Una mutación inofensiva y real: al primer elemento con id se le reescribe
// su propio id. El puente rechaza una mutación vacía, y el selector tiene que
// existir en ESTE documento — uno fijo sólo sirve para una página.
let sondaSelector = null, sondaMutacion = null;
function prepararSonda(html) {
  const m = html.match(new RegExp('[ ]id="([A-Za-z][A-Za-z0-9_-]*)"'));
  if (m) {
    sondaSelector = '#' + m[1];
    sondaMutacion = { attributes: { id: m[1] } };
    return;
  }
  // Sin ids, se apoya en la primera clase: se le vuelve a poner la que ya tiene.
  const c = html.match(new RegExp('[ ]class="([A-Za-z][A-Za-z0-9_-]*)'));
  if (!c) throw new Error('el documento no tiene ningún id ni clase donde apoyar la sonda');
  sondaSelector = '.' + c[1];
  sondaMutacion = { addClass: [c[1]] };
}

function puente(doc, css) {
  const entrada = path.join(tmp, 'in.json');
  writeFileSync(entrada, JSON.stringify({
    selector: sondaSelector,
    mutation: sondaMutacion,
    document: { projectData: doc.projectData, html: doc.html, css },
  }));
  const out = execFileSync('node', [bridge], { input: readFileSync(entrada), maxBuffer: 128 * 1024 * 1024 }).toString();
  const r = JSON.parse(out);
  if (!r.ok || typeof r.css !== 'string') throw new Error('el puente falló: ' + String(r.error).slice(0, 200));
  return r;
}

const doc = await tool('cod_read_canvas_document', { pageId, documentId });
console.log(`▸ ${documentId}  rev ${doc.revision}  ·  css ${doc.css.length.toLocaleString('es-CL')} bytes`);

// 1. Qué se pierde hoy si sólo se lee el JSON. Esta es la medición que manda.
prepararSonda(doc.html);
const antes = puente(doc, doc.css);
const soloJson = puente(doc, '');
const setB = new Set(bloques(soloJson.css));
const huérfanos = bloques(antes.css).filter((b) => !setB.has(b));
console.log(`    con hoja ${antes.css.length.toLocaleString('es-CL')}  ·  sólo JSON ${soloJson.css.length.toLocaleString('es-CL')}  ·  huérfanos ${huérfanos.length}`);
if (huérfanos.length === 0) { console.log('    nada que mudar: el JSON ya lo tiene todo.\n'); process.exit(0); }
// Los huérfanos que no son @media se mudan igual, como reglas sin condición.
// Suelen ser CSS base de módulos del plugin que quedó dentro del documento
// (grupo dinámico, galería, tabla). Que el plugin sea su dueño es otra tarea;
// acá lo que importa es que el JSON quede completo, sin cambiar la página.
const sinMedia = huérfanos.filter((b) => !b.startsWith('@media') && !b.startsWith('@'));
const raros = huérfanos.filter((b) => b.startsWith('@') && !b.startsWith('@media'));
if (raros.length > 0) {
  console.log('    ✗ DETENIDO: hay reglas @ que no son @media y no sé representarlas:');
  raros.slice(0, 5).forEach((b) => console.log('      ' + b.slice(0, 100)));
  process.exit(1);
}

// 2. Fusionar los huérfanos que comparten condición, en orden: el último manda.
const porCondición = new Map();
for (const b of huérfanos.filter((x) => x.startsWith('@media'))) {
  const c = condicion(b);
  if (!porCondición.has(c)) porCondición.set(c, new Map());
  const mapa = porCondición.get(c);
  for (const r of internas(b)) {
    const sel = selectorDe(r);
    mapa.set(sel, { ...(mapa.get(sel) || {}), ...declaraciones(r) });
  }
}
const nuevas = [];
for (const [cond, mapa] of porCondición) {
  console.log(`    @media ${cond} → ${mapa.size} reglas`);
  for (const [sel, style] of mapa) nuevas.push(aRegla(sel, style, cond));
}
for (const b of sinMedia) {
  nuevas.push(aRegla(selectorDe(b), declaraciones(b), undefined));
}
if (sinMedia.length) console.log(`    sin condición → ${sinMedia.length} reglas`);
console.log(`    reglas a agregar al JSON: ${nuevas.length}`);

// 3. Verificar ANTES de escribir: el CSS que sale sólo del JSON debe dar lo mismo que hoy.
const pd = JSON.parse(doc.projectData);
pd.styles = [...(pd.styles || []), ...nuevas];
const docAumentado = { ...doc, projectData: JSON.stringify(pd) };
const después = puente(docAumentado, '');

const dif = comparar(resolver(antes.css), resolver(después.css));
const faltan = dif.filter((d) => d.tipo !== 'propiedad de más' && d.tipo !== 'selector de más');
console.log(`
    comprobación por RESULTADO (qué valor gana cada propiedad):`);
console.log(`    diferencias: ${dif.length}   ·   de ellas, pérdidas o cambios: ${faltan.length}`);
dif.slice(0, 10).forEach((d) => console.log(`      ${d.tipo}: ${d.k.slice(0, 70)}${d.p ? ' → ' + d.p : ''}${d.otro !== undefined ? ` (${d.v} → ${d.otro})` : ''}`));

if (faltan.length > 0) { console.log('\n    ✗ DETENIDO: se perdería CSS. No se escribe nada.\n'); process.exit(1); }
if (!aplicar) { console.log('\n    (simulación: no se guardó)\n'); process.exit(0); }

const saved = await tool('cod_write_canvas_document', {
  pageId, documentId,
  expectedRevision: doc.revision,
  projectData: después.projectData,
  html: después.html,
  css: después.css,
});
console.log(`\n    guardado · nueva revisión ${saved.revision}  ·  css ${después.css.length.toLocaleString('es-CL')} bytes\n`);
