/**
 * Pasa a H1 el título principal de una página interior del ESPEJO (8890).
 *
 * Contacto y Preguntas frecuentes no tenían H1: su título era un H2. Esto lee
 * la composición que está AHORA en la página, cambia sólo el nivel de ese nodo
 * y la vuelve a entregar completa (previsualizar → aplicar con el previewId).
 * No regenera nada desde los guiones `componer-*`: así no pisa nada que la
 * página tenga y el guion no.
 *
 *   node seo/titulo-a-h1.mjs 60 contacto-titulo [--probar]
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [pagina, nodoId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const soloProbar = process.argv.includes('--probar');
if (!pagina || !nodoId) { console.error('uso: titulo-a-h1.mjs <pageId> <id-del-nodo> [--probar]'); process.exit(1); }

const llamar = (herramienta, datos) => {
  const archivo = `.seo-${herramienta}.json`;
  writeFileSync(path.join(carpeta, archivo), JSON.stringify(datos));
  const salida = execFileSync('node', ['lienzo.mjs', herramienta, archivo], { cwd: carpeta, encoding: 'utf8', maxBuffer: 1e8 });
  const cuerpo = salida.split('\n').slice(1).join('\n').trim();
  try { return JSON.parse(cuerpo); } catch { return { _texto: cuerpo }; }
};

const leido = llamar('cod_read_canvas_composition', { pageId: Number(pagina) });
if (!leido.found) { console.error('la página no es una composición; no la toco.'); process.exit(1); }

let cambiados = 0;
const recorrer = (nodos) => {
  for (const n of nodos || []) {
    if (n.id === nodoId) {
      const donde = n.content;
      if (n.kind !== 'heading' || !donde || typeof donde.level !== 'number') { console.error('ese nodo no es un título con nivel; no escribo.'); process.exit(1); }
      console.log(`nodo ${n.id}: nivel ${donde.level} → 1`);
      donde.level = 1;
      cambiados += 1;
    }
    recorrer(n.children);
    recorrer(n.nodes);
  }
};
recorrer(leido.composition.nodes);
if (cambiados !== 1) { console.error(`esperaba 1 nodo «${nodoId}» y encontré ${cambiados}; no escribo.`); process.exit(1); }

const receta = {
  pageId: leido.page.pageId,
  documentId: leido.page.documentId,
  expectedRevision: leido.revision,
  design: leido.design,
  composition: leido.composition,
};
const previo = llamar('cod_preview_canvas_composition', receta);
if (!previo.previewId) { console.error('la previsualización falló:\n' + (previo._texto || JSON.stringify(previo)).slice(0, 1200)); process.exit(1); }
console.log(`preview ok · ${previo.summary?.nodeCount ?? '?'} nodos · ${previo.summary?.ruleCount ?? '?'} reglas`);
if (soloProbar) { console.log('(--probar: no escribo)'); process.exit(0); }

const hecho = llamar('cod_apply_canvas_composition', { ...receta, previewId: previo.previewId });
if (!hecho?.document?.revision) { console.error('el apply falló:\n' + (hecho._texto || JSON.stringify(hecho)).slice(0, 1200)); process.exit(1); }
console.log(`aplicado · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);
