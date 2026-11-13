/**
 * Deja un párrafo de una composición SIN saltos de línea en su texto.
 *
 * Por qué: en Términos y condiciones, el párrafo `terminos-1-p2` tiene tres
 * datos separados por saltos de línea en la composición. La página publicada se
 * había compilado con una versión del plugin que no los convertía en <br>, así
 * que el cliente la recibió —y la aprobó— con los tres datos corridos en un
 * mismo párrafo. Al recompilar con el plugin actual aparecieron los <br> y el
 * párrafo cambió de alto (13-nov-2026). Como la presentación entregada manda,
 * el texto queda con espacios: se ve exactamente como antes.
 *
 *   node seo/parrafo-sin-saltos.mjs 164 terminos-1-p2 [--probar]
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [pagina, nodoId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const soloProbar = process.argv.includes('--probar');
if (!pagina || !nodoId) { console.error('uso: parrafo-sin-saltos.mjs <pageId> <id-del-nodo> [--probar]'); process.exit(1); }

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
      if (!n.content || typeof n.content.text !== 'string') { console.error('ese nodo no tiene texto; no escribo.'); process.exit(1); }
      const antes = n.content.text;
      n.content.text = antes.replace(/\s*\r?\n\s*/g, ' ');
      console.log(`nodo ${n.id}: ${antes === n.content.text ? 'ya estaba sin saltos' : 'saltos → espacios'}`);
      cambiados += 1;
    }
    recorrer(n.children);
    recorrer(n.nodes);
  }
};
recorrer(leido.composition.nodes);
if (cambiados !== 1) { console.error(`esperaba 1 nodo «${nodoId}» y encontré ${cambiados}; no escribo.`); process.exit(1); }
const receta = { pageId: leido.page.pageId, documentId: leido.page.documentId, expectedRevision: leido.revision, design: leido.design, composition: leido.composition };
const previo = llamar('cod_preview_canvas_composition', receta);
if (!previo.previewId) { console.error('la previsualización falló:\n' + (previo._texto || JSON.stringify(previo)).slice(0, 1200)); process.exit(1); }
console.log(`preview ok · ${previo.summary?.nodeCount ?? '?'} nodos · ${previo.summary?.ruleCount ?? '?'} reglas`);
if (soloProbar) { console.log('(--probar: no escribo)'); process.exit(0); }
const hecho = llamar('cod_apply_canvas_composition', { ...receta, previewId: previo.previewId });
if (!hecho?.document?.revision) { console.error('el apply falló:\n' + (hecho._texto || JSON.stringify(hecho)).slice(0, 1200)); process.exit(1); }
console.log(`aplicado · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);
