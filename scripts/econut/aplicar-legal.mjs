/**
 * El ciclo completo para la página de términos y privacidad.
 *
 * Hermano de `aplicar.mjs` (la portada) y `aplicar-regiones.mjs` (encabezado y
 * pie). Son los mismos cuatro pasos encadenados: leer la revisión, generar,
 * previsualizar con esa revisión y aplicar con el previewId de ESA
 * previsualización.
 *
 * Uso:
 *   node aplicar-legal.mjs            genera, previsualiza, aplica y publica
 *   node aplicar-legal.mjs --probar    sólo genera y previsualiza
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const soloProbar = process.argv.includes('--probar');
const PAGE_ID = 55;
const DOCUMENT_ID = 'cod-canvas-page-55';

const llamar = (herramienta, archivo) => {
  const args = ['lienzo.mjs', herramienta];
  if (archivo) args.push(archivo);
  const salida = execFileSync('node', args, { cwd: aqui, encoding: 'utf8', maxBuffer: 1e8, env: process.env });
  const cuerpo = salida.split('\n').slice(1).join('\n').trim();
  try { return JSON.parse(cuerpo); } catch { return { _texto: cuerpo }; }
};

writeFileSync(`${aqui}/.estado-legal.json`, JSON.stringify({ pageId: PAGE_ID }));
const estado = llamar('cod_get_canvas_page_state', '.estado-legal.json');
const revision = estado?.document?.revision;
if (typeof revision !== 'number') {
  console.error('no pude leer la revisión:', JSON.stringify(estado).slice(0, 300));
  process.exit(1);
}
console.log(`revisión actual: ${revision}`);

execFileSync('node', ['componer-legal.mjs'], {
  cwd: aqui, encoding: 'utf8', env: { ...process.env, REV_LEGAL: String(revision) },
});

const previo = llamar('cod_preview_canvas_composition', 'legal.json');
if (!previo?.previewId) {
  console.error('la previsualización falló:', (previo?._texto || JSON.stringify(previo)).slice(0, 600));
  process.exit(1);
}
console.log('preview ok');

if (soloProbar) {
  console.log('(--probar: no escribo)');
  process.exit(0);
}

const receta = JSON.parse(readFileSync(`${aqui}/legal.json`, 'utf8'));
receta.previewId = previo.previewId;
writeFileSync(`${aqui}/aplicar-legal.json`, JSON.stringify(receta, null, 2));
const hecho = llamar('cod_apply_canvas_composition', 'aplicar-legal.json');
if (!hecho?.document?.revision) {
  console.error('el apply falló:', (hecho?._texto || JSON.stringify(hecho)).slice(0, 600));
  process.exit(1);
}
console.log(`aplicado · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);

// Publicar. La página se creó como borrador, y una página legal en borrador no
// sirve de nada: el enlace del pie daría 404 para cualquiera que no sea
// administrador.
writeFileSync(`${aqui}/.publicar-legal.json`, JSON.stringify({
  pageId: PAGE_ID, documentId: DOCUMENT_ID, expectedRevision: hecho.document.revision,
}));
const publicado = llamar('cod_publish_canvas_page', '.publicar-legal.json');
if (publicado?.page?.status === 'publish' || publicado?.page?.url) {
  console.log(`publicada · ${publicado.page.url || ''} · estado ${publicado.page.status || '(sin estado)'}`);
} else {
  console.error('ojo: el publish no confirmó:', (publicado?._texto || JSON.stringify(publicado)).slice(0, 400));
  process.exit(1);
}
