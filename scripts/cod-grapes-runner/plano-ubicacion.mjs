/**
 * Reemplaza el precio de cada parcela por su ubicación (Central / Perimetral)
 * en el mapa de lotes, y cambia el rótulo del panel de «Valor» a «Ubicación».
 *
 * POR QUÉ ESTE CONDUCTOR Y NO 23 LLAMADAS AL RUNNER. El puente headless edita
 * UN nodo por llamada, y el runner guarda el documento después de cada una:
 * 23 ediciones serían 23 revisiones y 23 guardados de medio mega, con el
 * riesgo de quedar a medio camino si uno falla. El puente, en cambio, es una
 * función pura —documento entra, documento sale— así que acá se encadenan las
 * 23 mutaciones en memoria y se guarda UNA vez, con UN respaldo previo.
 *
 * Uso:
 *   node plano-ubicacion.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bridge = path.join(repoRoot, 'contope-publisher', 'tools', 'cod-headless-node-edit.mjs');
const config = JSON.parse(readFileSync(path.join(here, 'cod-grapes-runner.config.json'), 'utf8'));
const backupsDir = path.join(here, 'backups');
const dryRun = process.argv.includes('--dry-run');

const PAGE_ID = 43;
const DOCUMENT_ID = 'ocd-canvas-page-7';

/* Clasificación confirmada por Cristóbal el 2026-09-14.
   Centrales: la hilera del medio, la única sin deslinde con el exterior;
   queda entre el camino interior y la hilera de la derecha. */
const CENTRALES = [65, 66, 69, 70, 71, 75];
const TODOS = [54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66,
               67, 68, 69, 70, 71, 72, 73, 74, 75];

const ediciones = TODOS.map((n) => ({
  que: 'lote ' + n,
  selector: '#lote-' + n,
  mutation: {
    attributes: {
      'data-cod-parcel-valor': CENTRALES.includes(n) ? 'Central' : 'Perimetral',
    },
  },
}));
/* El rótulo del panel: tercera fila, su <span>. */
ediciones.push({
  que: 'rótulo del panel',
  selector: '.lote-ficha__row span',
  mutation: { index: 2, content: 'Ubicación' },
});

const endpoint = `${config.siteUrl.replace(/\/+$/, '')}/wp-json/contope/v1/mcp`;
const auth = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');

async function callTool(name, args, intentos = 4) {
  for (let i = 1; i <= intentos; i += 1) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
      const texto = json.result?.content?.[0]?.text;
      return texto ? JSON.parse(texto) : json.result;
    } catch (e) {
      if (i === intentos) throw e;
      console.log(`     (reintento ${i}/${intentos - 1}: ${e.message})`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

console.log(`\n▸ Página ${PAGE_ID} · ${DOCUMENT_ID}`);
console.log(`▸ ${ediciones.length} ediciones, un solo guardado${dryRun ? '   [SIMULACIÓN]' : ''}`);
console.log(`▸ Centrales: ${CENTRALES.join(', ')}`);
console.log(`▸ Perimetrales: ${TODOS.filter((n) => !CENTRALES.includes(n)).join(', ')}\n`);

console.log('1/3  Pidiendo el documento real al sitio…');
const doc = await callTool('cod_read_canvas_document', { pageId: PAGE_ID, documentId: DOCUMENT_ID });
if (typeof doc?.projectData !== 'string') throw new Error('El sitio no devolvió projectData.');
console.log(`     revisión ${doc.revision} · projectData ${doc.projectData.length} B · html ${doc.html.length} B · css ${doc.css.length} B`);

if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupsDir, `${DOCUMENT_ID}-rev${doc.revision}-ubicacion-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify(doc, null, 1), 'utf8');
console.log(`     respaldo: ${path.relative(process.cwd(), backupPath)}`);

console.log('\n2/3  Encadenando las ediciones por el motor real de GrapesJS…');
let actual = { projectData: doc.projectData, html: doc.html, css: doc.css };
for (const e of ediciones) {
  const entrada = JSON.stringify({ document: actual, selector: e.selector, mutation: e.mutation });
  const r = spawnSync(process.execPath, [bridge], { input: entrada, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${e.que}: el puente salió con ${r.status}\n${r.stderr}`);
  const linea = String(r.stdout).trim().split('\n').filter(Boolean).pop();
  let out;
  try { out = JSON.parse(linea); } catch { throw new Error(`${e.que}: salida ilegible del puente:\n${linea}`); }
  if (!out.ok) throw new Error(`${e.que}: ${out.error}`);
  actual = { projectData: out.projectData, html: out.html, css: out.css };
  const v = e.mutation.attributes ? e.mutation.attributes['data-cod-parcel-valor'] : e.mutation.content;
  console.log(`     ✓ ${e.que.padEnd(20)} → ${v}`);
}

/* Comprobación antes de guardar: contar lo que quedó escrito. */
const cuenta = (t) => (actual.html.match(new RegExp(`data-cod-parcel-valor="${t}"`, 'g')) || []).length;
console.log(`\n     en el HTML resultante: ${cuenta('Central')} centrales · ${cuenta('Perimetral')} perimetrales`);
const restos = actual.html.match(/data-cod-parcel-valor="[^"]*UF[^"]*"/g);
console.log(`     precios que quedan: ${restos ? restos.length + ' — ' + restos.join(', ') : 'ninguno'}`);
console.log(`     rótulo «Ubicación»: ${actual.html.includes('>Ubicación<') ? 'sí' : 'NO'}`);
console.log(`     rótulo «Valor» todavía: ${/<span>Valor<\/span>/.test(actual.html) ? 'SÍ — revisar' : 'no'}`);

if (dryRun) {
  const previewPath = path.join(backupsDir, `simulacion-ubicacion-${stamp}.json`);
  writeFileSync(previewPath, JSON.stringify(actual, null, 1), 'utf8');
  console.log(`\n3/3  SIMULACIÓN: no se guardó nada.`);
  console.log(`     Resultado completo: ${path.relative(process.cwd(), previewPath)}\n`);
  process.exit(0);
}

console.log('\n3/3  Guardando en el sitio…');
const saved = await callTool('cod_write_canvas_document', {
  pageId: PAGE_ID,
  documentId: DOCUMENT_ID,
  expectedRevision: doc.revision,
  projectData: actual.projectData,
  html: actual.html,
  css: actual.css,
});
console.log(`     guardado · nueva revisión ${saved.revision}`);
console.log(`\n✓ Listo. Estado anterior en ${path.relative(process.cwd(), backupPath)}\n`);
