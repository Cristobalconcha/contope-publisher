/**
 * Mueve los selectores del mapa de ubicación adentro del recuadro, entre el
 * encabezado y el mapa — lo que Cristóbal marcó con una flecha.
 *
 * Todo el documento (≈870 KB) viaja por acá y nunca por el chat. El puente a
 * Grapes corre LOCAL porque el hosting no tiene Node: el servidor lo dice
 * explícitamente al intentar cod_grapes_edit_node. Es el mismo puente, el
 * mismo Grapes y la misma operación `move` que correría allá.
 *
 *   node scripts/mover-filtros-ubicacion.mjs          (simulación, no escribe)
 *   node scripts/mover-filtros-ubicacion.mjs --aplicar
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const raíz = path.join(aquí, '..');
const APLICAR = process.argv.includes('--aplicar');

const config = JSON.parse(readFileSync(path.join(aquí, 'cod-grapes-runner', 'cod-grapes-runner.config.json'), 'utf8'));
const endpoint = `${config.siteUrl.replace(/\/+$/, '')}/wp-json/contope/v1/mcp`;
const auth = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword.replace(/\s+/g, '')}`).toString('base64');

let id = 0;
async function llamar(name, args) {
  id += 1;
  for (let intento = 1; intento <= 4; intento += 1) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
      });
      const texto = await r.text();
      const json = JSON.parse(texto.includes('event:') ? texto.split('data: ').pop() : texto);
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
      const contenido = json.result?.content?.[0]?.text;
      if (json.result?.isError) throw new Error(contenido || 'el sitio devolvió un error');
      return contenido ? JSON.parse(contenido) : json.result;
    } catch (e) {
      if (intento === 4) throw e;
      console.log(`     la conexión falló (${e.message.slice(0, 80)}) — reintento ${intento + 1}…`);
      await new Promise((s) => setTimeout(s, 1500 * intento));
    }
  }
}

const PÁGINA = 43;
const DOCUMENTO = 'ocd-canvas-page-7';

console.log('\n1/4  Leyendo el documento del sitio…');
const doc = await llamar('cod_read_canvas_document', { pageId: PÁGINA, documentId: DOCUMENTO });
console.log(`     revisión ${doc.revision} · html ${doc.html.length} · css ${doc.css.length}`);

const respaldos = path.join(aquí, 'cod-grapes-runner', 'backups');
mkdirSync(respaldos, { recursive: true });
const respaldo = path.join(respaldos, `ubicacion-antes-rev${doc.revision}-${Date.now()}.json`);
writeFileSync(respaldo, JSON.stringify(doc));
console.log(`     respaldo: ${path.relative(raíz, respaldo)}`);

console.log('\n2/4  Moviendo con el Grapes real…');
const r = spawnSync('node', [path.join(raíz, 'contope-publisher', 'tools', 'cod-headless-node-edit.mjs')], {
  input: JSON.stringify({
    document: { projectData: doc.projectData, html: doc.html, css: doc.css },
    selector: '#ubicacion .ubicacion__filters',
    // El flex de los filtros era 0 1 100%: piden el alto COMPLETO del
    // contenedor. Fuera del recuadro daba lo mismo; adentro, el recuadro es una
    // columna flex de alto fijo donde el mapa toma lo que sobra — y no sobraba
    // nada. Entran pidiendo solo su altura natural.
    mutation: {
      style: { flex: '0 0 auto' },
      move: { before: '#ubicacion .plano-frame__body' },
    },
  }),
  encoding: 'utf8',
  maxBuffer: 300 * 1024 * 1024,
});
const línea = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
let salida;
try { salida = JSON.parse(línea); } catch { console.error('sin respuesta del puente:', (r.stderr || '').slice(-500)); process.exit(1); }
if (!salida.ok) { console.error('el puente rechazó:', salida.error); process.exit(1); }

console.log('\n3/4  Comprobando antes de escribir…');
const sec = salida.html.slice(salida.html.indexOf('id="ubicacion"'));
const pos = (c) => sec.indexOf(c);
const pruebas = [
  ['los filtros existen una sola vez', (sec.match(/ubicacion__filters/g) || []).length === 1],
  ['quedaron adentro del recuadro', pos('ubicacion__filters') > pos('plano-frame__content')],
  ['después del encabezado', pos('ubicacion__filters') > pos('plano-frame__header-body')],
  ['antes del mapa', pos('ubicacion__filters') < pos('plano-frame__body')],
  ['el selector de categoría viajó con ellos', sec.indexOf('filtroCategoria') > pos('plano-frame__content')],
  ['el CSS no se encogió', salida.css.length > doc.css.length * 0.9],
  ['el HTML no se encogió', salida.html.length > doc.html.length * 0.9],
  ['el marcador #ubicacion sigue ahí', salida.html.includes('id="ubicacion"')],
  ['el marcador #mapa-interactivo sigue ahí', salida.html.includes('id="mapa-interactivo"')],
];
let fallas = 0;
for (const [caso, ok] of pruebas) { console.log(`     ${ok ? 'ok   ' : 'FALLA'}  ${caso}`); if (!ok) fallas += 1; }
if (fallas) { console.error(`\n${fallas} fallas: no se escribe nada.`); process.exit(1); }

if (!APLICAR) {
  console.log('\n4/4  SIMULACIÓN: no se guardó nada. Corré con --aplicar para escribir.\n');
  process.exit(0);
}

console.log('\n4/4  Guardando en el sitio…');
const guardado = await llamar('cod_write_canvas_document', {
  pageId: PÁGINA, documentId: DOCUMENTO, expectedRevision: doc.revision,
  projectData: salida.projectData, html: salida.html, css: salida.css,
});
console.log(`     guardado · nueva revisión ${guardado.revision}`);
console.log(`\nListo. Para volver atrás está el respaldo, o el mismo move al revés:`);
console.log(`  selector "#ubicacion .ubicacion__filters", move: {before: "#ubicacion .plano-frame"}\n`);
