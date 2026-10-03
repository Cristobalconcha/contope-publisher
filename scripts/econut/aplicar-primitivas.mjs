/**
 * El ciclo completo para la página de muestra de primitivas.
 * Hermano de aplicar.mjs y aplicar-legal.mjs: leer revisión, generar,
 * previsualizar y aplicar con el previewId de ESA previsualización.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PAGE_ID = 107;
const DOCUMENT_ID = 'cod-canvas-page-107';
const soloProbar = process.argv.includes('--probar');

const llamar = (h, a) => {
  const args = ['lienzo.mjs', h];
  if (a) args.push(a);
  const s = execFileSync('node', args, { cwd: aqui, encoding: 'utf8', maxBuffer: 1e8, env: process.env });
  try { return JSON.parse(s.split('\n').slice(1).join('\n').trim()); } catch { return { _texto: s }; }
};

writeFileSync(`${aqui}/.estado-prim.json`, JSON.stringify({ pageId: PAGE_ID }));
const estado = llamar('cod_get_canvas_page_state', '.estado-prim.json');
const revision = estado?.document?.revision;
if (typeof revision !== 'number') { console.error('sin revisión:', JSON.stringify(estado).slice(0, 300)); process.exit(1); }
console.log(`revisión actual: ${revision}`);

execFileSync('node', ['componer-primitivas.mjs'], {
  cwd: aqui, encoding: 'utf8',
  env: { ...process.env, PAGE_PRIMITIVAS: String(PAGE_ID), DOC_PRIMITIVAS: DOCUMENT_ID, REV_PRIMITIVAS: String(revision) },
});

const previo = llamar('cod_preview_canvas_composition', 'primitivas.json');
if (!previo?.previewId) { console.error('preview falló:', (previo?._texto || JSON.stringify(previo)).slice(0, 600)); process.exit(1); }
console.log('preview ok');
if (soloProbar) { console.log('(--probar)'); process.exit(0); }

const receta = JSON.parse(readFileSync(`${aqui}/primitivas.json`, 'utf8'));
receta.previewId = previo.previewId;
writeFileSync(`${aqui}/aplicar-prim.json`, JSON.stringify(receta, null, 2));
const hecho = llamar('cod_apply_canvas_composition', 'aplicar-prim.json');
if (!hecho?.document?.revision) { console.error('apply falló:', (hecho?._texto || JSON.stringify(hecho)).slice(0, 600)); process.exit(1); }
console.log(`aplicado · revisión ${hecho.document.revision}`);

writeFileSync(`${aqui}/.publicar-prim.json`, JSON.stringify({ pageId: PAGE_ID, documentId: DOCUMENT_ID, expectedRevision: hecho.document.revision }));
const pub = llamar('cod_publish_canvas_page', '.publicar-prim.json');
console.log(`publicada · ${pub?.page?.url || '(sin url)'}`);
