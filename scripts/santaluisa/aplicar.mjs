/**
 * El ciclo completo para una página de Santa Luisa en el ESPEJO LOCAL.
 *
 * Los cuatro pasos encadenados, que es donde se cuelan los errores si se hacen
 * a mano: leer la revisión que está AHORA, generar la receta con esa revisión,
 * previsualizar, y aplicar con el previewId exacto de ESA previsualización.
 *
 * NUNCA toca santaluisadepalpi.cl. El destino lo fija `lienzo.mjs` de esta
 * carpeta y es el espejo del puerto 8890.
 *
 *   node aplicar.mjs contacto            genera, previsualiza y aplica
 *   node aplicar.mjs contacto --probar   sólo hasta la previsualización
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const soloProbar = process.argv.includes('--probar');
const cual = process.argv.slice(2).find((a) => !a.startsWith('--'));

const PAGINAS = {
  contacto: { guion: 'componer-contacto.mjs', archivo: 'contacto.json', pageId: 60, documentId: 'ocd-canvas-page-14', variable: 'REV_CONTACTO' },
  diferenciales: { guion: 'componer-diferenciales.mjs', archivo: 'diferenciales.json', pageId: 62, documentId: 'ocd-canvas-page-10', variable: 'REV_DIFERENCIALES' },
  preguntas: { guion: 'componer-preguntas.mjs', archivo: 'preguntas.json', pageId: 61, documentId: 'ocd-canvas-page-12', variable: 'REV_PREGUNTAS' },
  terminos: { guion: 'componer-terminos.mjs', archivo: 'terminos.json', pageId: 630, documentId: 'cod-canvas-page-164', variable: 'REV_TERMINOS' },

  /*
   * La barra de navegación NO es una página: es una región global, compartida
   * por las cuatro interiores. Se identifica con pageId 0 y su documentId, y
   * su revisión se lee por el mismo cod_get_canvas_page_state pero pasándole
   * las dos cosas. El resto del ciclo —previsualizar y aplicar con el
   * previewId exacto— es idéntico, que es justamente la razón de que el canal
   * devuelva la misma clave `document` en los dos casos.
   */
  portada: { guion: 'componer-portada.mjs', archivo: 'portada.json', pageId: 308, documentId: 'ocd-canvas-page-7', variable: 'REV_PORTADA' },
  encabezado: { guion: 'componer-encabezado.mjs', archivo: 'encabezado.json', pageId: 0, documentId: 'ocd-template-d5a667af-b7aa-498f-a986-bbe61a63add6', variable: 'REV_ENCABEZADO' },
};

if (!cual || !PAGINAS[cual]) {
  console.error(`falta la página. Las que hay: ${Object.keys(PAGINAS).join(', ')}`);
  process.exit(1);
}
const { guion, archivo, pageId, documentId, variable } = PAGINAS[cual];

const llamar = (herramienta, nombreArchivo) => {
  const args = ['lienzo.mjs', herramienta];
  if (nombreArchivo) args.push(nombreArchivo);
  const salida = execFileSync('node', args, { cwd: aqui, encoding: 'utf8', maxBuffer: 1e8, env: process.env });
  const cuerpo = salida.split('\n').slice(1).join('\n').trim();
  try { return JSON.parse(cuerpo); } catch { return { _texto: cuerpo }; }
};

// 1. La revisión que está ahora. Nunca suponerla: el apply la compara y, si no
//    calza, rechaza — que es justamente lo que protege de pisar un cambio ajeno.
writeFileSync(`${aqui}/.estado.json`, JSON.stringify(pageId === 0 ? { pageId, documentId } : { pageId }));
const estado = llamar('cod_get_canvas_page_state', '.estado.json');
const revision = estado?.document?.revision;
if (typeof revision !== 'number') {
  console.error('no pude leer la revisión:', JSON.stringify(estado).slice(0, 300));
  process.exit(1);
}
console.log(`revisión actual de ${cual}: ${revision}`);

// 2. Generar con esa revisión.
const receta = execFileSync('node', [guion], {
  cwd: aqui, encoding: 'utf8', maxBuffer: 1e8,
  env: { ...process.env, [variable]: String(revision) },
});
writeFileSync(`${aqui}/${archivo}`, receta);

// 3. Previsualizar.
const previo = llamar('cod_preview_canvas_composition', archivo);
if (!previo?.previewId) {
  console.error('la previsualización falló:\n' + (previo?._texto || JSON.stringify(previo)).slice(0, 900));
  process.exit(1);
}
console.log(`preview ok · ${previo.summary?.nodeCount ?? '?'} nodos · ${previo.summary?.ruleCount ?? '?'} reglas`);

if (soloProbar) {
  console.log('(--probar: no escribo)');
  process.exit(0);
}

// 4. Aplicar con el previewId de ESA previsualización.
const conPreview = JSON.parse(receta);
conPreview.previewId = previo.previewId;
writeFileSync(`${aqui}/.aplicar-${cual}.json`, JSON.stringify(conPreview, null, 2));
const hecho = llamar('cod_apply_canvas_composition', `.aplicar-${cual}.json`);
if (!hecho?.document?.revision) {
  console.error('el apply falló:\n' + (hecho?._texto || JSON.stringify(hecho)).slice(0, 900));
  process.exit(1);
}
console.log(`aplicado · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);
