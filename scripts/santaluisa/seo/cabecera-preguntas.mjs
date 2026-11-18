/**
 * Cabecera de Preguntas frecuentes, en el ESPEJO (8890). 18-nov-2026.
 *
 * Pedido de Cristóbal: hay demasiado blanco arriba de las preguntas y por eso
 * en la primera vista no se alcanza a ver el personaje que acompaña la página.
 *
 *  - La bajada pierde «en Santa Luisa de Palpi»: se gana una línea.
 *  - Entre la bajada y la primera pregunta había 59 px (15 del párrafo + 28 del
 *    encabezado + 16 de la tarjeta); quedan 20.
 *  - El blanco de ARRIBA se ajusta con ARRIBA, abajo: los píxeles que se le
 *    quitan al margen superior de la tarjeta, medidos contra su dibujo.
 *
 *   node seo/cabecera-preguntas.mjs [--probar]
 */
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const soloProbar = process.argv.includes('--probar');
const llamar = (herramienta, datos) => {
  const archivo = `.seo-${herramienta}.json`;
  writeFileSync(path.join(carpeta, archivo), JSON.stringify(datos));
  const salida = execFileSync('node', ['lienzo.mjs', herramienta, archivo], { cwd: carpeta, encoding: 'utf8', maxBuffer: 1e8 });
  rmSync(path.join(carpeta, archivo), { force: true });
  const cuerpo = salida.split('\n').slice(1).join('\n').trim();
  try { return JSON.parse(cuerpo); } catch { return { _texto: cuerpo }; }
};
const buscar = (nodos, id) => { for (const n of nodos || []) { if (n.id === id) return n; const h = buscar(n.children, id); if (h) return h; } return null; };
const regla = (design, id) => { const r = design.rules.find((x) => x.id === id); if (!r) throw new Error('no existe la regla ' + id); return r; };

// Valores del ajuste. null = no tocar.
const AJUSTE = {
  // margen superior de la tarjeta (hoy 48px) y relleno superior del marco (hoy 40px)
  tarjetaMargenArriba: null,
  marcoRellenoArriba: null,
};

const leido = llamar('cod_read_canvas_composition', { pageId: 61 });
if (!leido.found) { console.error('la página no es una composición; no la toco.'); process.exit(1); }
const { composition, design } = leido;

buscar(composition.nodes, 'faq-bajada').content.text = 'Todo lo que necesitas saber antes de reservar tu parcela.';

// 59 → 20: el encabezado deja de empujar (28 → 0) y el párrafo baja su margen
// inferior (15 → 4); los 16 de separación de la tarjeta se quedan.
regla(design, 'sl-faq-encabezado').value.declarations['padding-block-end'] = '0';
if (!design.rules.some((r) => r.id === 'sl-faq-bajada-aire')) {
  design.rules.push({
    id: 'sl-faq-bajada-aire', label: '', kind: 'properties', scope: { breakpoint: 'all', state: 'default', roles: [] },
    provenance: { sources: [{ kind: 'reference', label: '', reference: 'pedido de Cristóbal, 18-nov-2026', rationale: 'El espacio bajo la bajada baja de unos 60 px a 20.' }], confidence: null },
    status: 'reviewed', value: { declarations: { 'margin-block-end': '4px' } },
  });
}
// Dibujo de Cristóbal (18-nov): la bajada sube hacia el título. Entre «TUS
// DUDAS» y la bajada había 49 px (18 del título + 16 de separación + 15 del
// párrafo); quedan 20: el párrafo pierde su margen superior y el título de
// ESTA página deja 4 px en vez de 18. La regla general de títulos no se toca.
regla(design, 'sl-faq-bajada-aire').value.declarations['margin-block-start'] = '0';
if (!design.rules.some((r) => r.id === 'sl-faq-titulo-aire')) {
  design.rules.push({
    id: 'sl-faq-titulo-aire', label: '', kind: 'properties', scope: { breakpoint: 'all', state: 'default', roles: [] },
    provenance: { sources: [{ kind: 'reference', label: '', reference: 'dibujo de Cristóbal, 18-nov-2026', rationale: 'El título de Preguntas frecuentes queda más cerca de su bajada.' }], confidence: null },
    status: 'reviewed', value: { declarations: { 'margin-block-end': '4px' } },
  });
}
const titulo = buscar(composition.nodes, 'faq-titulo');
if (!titulo.ruleIds.includes('sl-faq-titulo-aire')) titulo.ruleIds.push('sl-faq-titulo-aire');
const bajada = buscar(composition.nodes, 'faq-bajada');
if (!bajada.ruleIds.includes('sl-faq-bajada-aire')) bajada.ruleIds.push('sl-faq-bajada-aire');

// Todas las preguntas cerradas al cargar (pedido de Cristóbal, 18-nov): con la
// primera abierta la página es más larga y del personaje, apoyado en el piso,
// asomaba sólo la cabeza en la primera vista.
regla(design, 'sl-faq-acordeon').value.startClosed = true;

if (AJUSTE.tarjetaMargenArriba !== null) regla(design, 'sl-faq-tarjeta').value.declarations['margin-block-start'] = AJUSTE.tarjetaMargenArriba;
if (AJUSTE.marcoRellenoArriba !== null) regla(design, 'sl-faq-marco').value.declarations['padding-block-start'] = AJUSTE.marcoRellenoArriba;

const receta = { pageId: leido.page.pageId, documentId: leido.page.documentId, expectedRevision: leido.revision, design, composition };
const previo = llamar('cod_preview_canvas_composition', receta);
if (!previo.previewId) { console.error('la previsualización falló:\n' + (previo._texto || JSON.stringify(previo)).slice(0, 1500)); process.exit(1); }
console.log(`preview ok · ${previo.summary?.nodeCount ?? '?'} nodos · ${previo.summary?.ruleCount ?? '?'} reglas`);
if (soloProbar) { console.log('(--probar: no escribo)'); process.exit(0); }
const hecho = llamar('cod_apply_canvas_composition', { ...receta, previewId: previo.previewId });
if (!hecho?.document?.revision) { console.error('el apply falló:\n' + (hecho._texto || JSON.stringify(hecho)).slice(0, 1500)); process.exit(1); }
console.log(`aplicado en el espejo · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);
