/**
 * Recompila una página interior del ESPEJO (8890) sin cambiarle nada: lee su
 * composición, la previsualiza y la aplica tal cual. Sirve cuando el
 * compilador del plugin cambió y el HTML guardado quedó viejo.
 *
 *   node seo/recompilar.mjs 60 [--probar]
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [pagina] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const soloProbar = process.argv.includes('--probar');
if (!pagina) { console.error('uso: recompilar.mjs <pageId> [--probar]'); process.exit(1); }

const llamar = (herramienta, datos) => {
  const archivo = `.seo-${herramienta}.json`;
  writeFileSync(path.join(carpeta, archivo), JSON.stringify(datos));
  const salida = execFileSync('node', ['lienzo.mjs', herramienta, archivo], { cwd: carpeta, encoding: 'utf8', maxBuffer: 1e8 });
  const cuerpo = salida.split('\n').slice(1).join('\n').trim();
  try { return JSON.parse(cuerpo); } catch { return { _texto: cuerpo }; }
};

const leido = llamar('cod_read_canvas_composition', { pageId: Number(pagina) });
if (!leido.found) { console.error('la página no es una composición; no la toco.'); process.exit(1); }
const receta = {
  pageId: leido.page.pageId,
  documentId: leido.page.documentId,
  expectedRevision: leido.revision,
  design: leido.design,
  composition: leido.composition,
};
const previo = llamar('cod_preview_canvas_composition', receta);
if (!previo.previewId) { console.error('la previsualización falló:\n' + (previo._texto || JSON.stringify(previo)).slice(0, 1200)); process.exit(1); }
console.log(`${leido.page.title}: preview ok · ${previo.summary?.nodeCount ?? '?'} nodos · ${previo.summary?.ruleCount ?? '?'} reglas`);
if (soloProbar) { console.log('(--probar: no escribo)'); process.exit(0); }
const hecho = llamar('cod_apply_canvas_composition', { ...receta, previewId: previo.previewId });
if (!hecho?.document?.revision) { console.error('el apply falló:\n' + (hecho._texto || JSON.stringify(hecho)).slice(0, 1200)); process.exit(1); }
console.log(`aplicado · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);
