/**
 * Aplica al sitio (por el canal MCP) lo que generó el transcriptor.
 *
 *   node aplicar.mjs pagina <archivo.componer.json> [--titulo "Inicio"] [--probar] [--sin-publicar]
 *   node aplicar.mjs region <header|footer> <archivo.componer.json> [--probar]
 *
 * El ciclo es el de siempre: leer la revisión que hay ahora (nunca suponerla),
 * previsualizar, aplicar con el previewId EXACTO de esa previsualización y
 * publicar. La página se busca por título y se crea si falta.
 *
 *   ENDPOINT, AUTH_FILE: ver lib/mcp.mjs
 */
import { readFileSync } from 'node:fs';
import { conectar } from './lib/mcp.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const [modo, a, b] = args.filter((x, i) => !x.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && ['titulo'].includes(args[i - 1].slice(2))));
const { herramienta } = conectar();

const falla = (msg, dato) => { console.error('✗ ' + msg, dato ? JSON.stringify(dato).slice(0, 900) : ''); process.exit(1); };

async function aplicarComposicion({ pageId, documentId, archivo }) {
  const estado = await herramienta('cod_get_canvas_page_state', { pageId, ...(pageId === 0 ? { documentId } : {}) });
  if (estado._error) falla('no pude leer el estado', estado);
  const revision = estado?.document?.revision;
  if (typeof revision !== 'number') falla('sin revisión', estado);
  const base = JSON.parse(readFileSync(archivo, 'utf8'));
  const receta = {
    pageId, documentId, expectedRevision: revision,
    design: { ...base.design, expectedDesignRevision: estado?.design?.revision ?? estado?.designRevision ?? base.design.expectedDesignRevision },
    composition: base.composition,
  };
  const previo = await herramienta('cod_preview_canvas_composition', receta);
  if (previo._error || !previo.previewId) falla('la previsualización falló', previo);
  console.log(`  preview ok (revisión ${revision}, ${base.design.rules.length} reglas)`);
  if (flag('probar')) return { revision };
  const hecho = await herramienta('cod_apply_canvas_composition', { ...receta, previewId: previo.previewId });
  if (hecho._error || !hecho?.document?.revision) falla('el apply falló', hecho);
  console.log(`  aplicado · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);
  return { revision: hecho.document.revision };
}

if (modo === 'pagina') {
  const archivo = a;
  const base = JSON.parse(readFileSync(archivo, 'utf8'));
  const titulo = val('titulo') || base.titulo;
  const lista = await herramienta('cod_list_canvas_pages', {});
  let pagina = (lista?.pages || []).find((p) => p.title === titulo);
  if (!pagina) {
    if (flag('probar')) falla(`no existe la página «${titulo}» y con --probar no la creo`);
    const creada = await herramienta('cod_create_canvas_page', { title: titulo });
    const id = creada?.pageId ?? creada?.page?.pageId ?? creada?.page?.id ?? creada?.id;
    if (!id) falla('no pude crear la página', creada);
    pagina = { pageId: id };
    console.log(`página «${titulo}» creada: #${id}`);
  }
  const pageId = pagina.pageId;
  console.log(`«${titulo}» #${pageId}`);
  const { revision } = await aplicarComposicion({ pageId, documentId: 'cod-canvas-page-' + pageId, archivo });
  if (!flag('probar') && !flag('sin-publicar')) {
    const pub = await herramienta('cod_publish_canvas_page', { pageId, documentId: 'cod-canvas-page-' + pageId, expectedRevision: revision });
    if (pub._error) falla('publicar falló', pub);
    console.log(`  publicada · ${pub?.page?.url || ''}`);
  }
} else if (modo === 'region') {
  const documentId = a === 'header' ? 'cod-region-header' : a === 'footer' ? 'cod-region-footer' : null;
  if (!documentId) falla('región: header o footer');
  console.log(`región ${a}`);
  // La región se crea si falta (idempotente: si ya existe, el servidor lo dice y se sigue).
  const cr = await herramienta('cod_create_canvas_region', { kind: a });
  if (cr._error && !/exist|ya /i.test(cr._error)) console.log('  (crear región: ' + cr._error.slice(0, 160) + ')');
  await aplicarComposicion({ pageId: 0, documentId, archivo: b });
} else {
  console.error('uso: node aplicar.mjs pagina <archivo> [--titulo T] [--probar] [--sin-publicar]\n     node aplicar.mjs region <header|footer> <archivo> [--probar]');
  process.exit(1);
}
