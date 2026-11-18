/**
 * Lleva a PRODUCCIÓN la composición de una página tal como está en el ESPEJO.
 *
 * Antes de escribir compara, nodo por nodo, el texto publicado en producción
 * con el de la composición que se va a subir, y muestra qué se pierde, qué
 * cambia y qué se agrega. Sale de la lección del 11-nov-2026: reaplicar sobre
 * una página viva sin comparar borró nodos que el guion no conocía.
 *
 *   node seo/subir-composicion.mjs <slug> <pageId-espejo> <pageId-producción> [--aplicar]
 *
 * Sin --aplicar sólo compara y previsualiza. Usa la credencial de producción de
 * cod-grapes-runner.config.json y la del espejo de lienzo.mjs.
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [slug, idEspejo, idProd] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const aplicar = process.argv.includes('--aplicar');
if (!slug || !idEspejo || !idProd) { console.error('uso: subir-composicion.mjs <slug> <pageId-espejo> <pageId-producción> [--aplicar]'); process.exit(1); }

const c = JSON.parse(readFileSync(path.join(carpeta, '..', 'cod-grapes-runner', 'cod-grapes-runner.config.json'), 'utf8'));
const authProd = path.join(tmpdir(), `.auth-prod-${process.pid}.txt`);
writeFileSync(authProd, `${c.username}:${c.applicationPassword}`);
const entornoProd = { ...process.env, ENDPOINT: `${c.siteUrl}/wp-json/contope/v1/mcp`, AUTH_FILE: authProd };

const llamar = (herramienta, datos, env = process.env) => {
  const archivo = `.seo-${herramienta}.json`;
  writeFileSync(path.join(carpeta, archivo), JSON.stringify(datos));
  const salida = execFileSync('node', ['lienzo.mjs', herramienta, archivo], { cwd: carpeta, encoding: 'utf8', maxBuffer: 1e8, env });
  rmSync(path.join(carpeta, archivo), { force: true });
  const cuerpo = salida.split('\n').slice(1).join('\n').trim();
  try { return JSON.parse(cuerpo); } catch { return { _texto: cuerpo }; }
};
const limpiar = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/\s+/g, ' ').trim();

try {
  const espejo = llamar('cod_read_canvas_composition', { pageId: Number(idEspejo) });
  if (!espejo.found) throw new Error('la página del espejo no es una composición');
  const estado = llamar('cod_get_canvas_page_state', { pageId: Number(idProd) }, entornoProd);
  const revision = estado?.document?.revision;
  const documentId = estado?.document?.documentId;
  if (typeof revision !== 'number' || !documentId) throw new Error('no pude leer el estado de producción: ' + JSON.stringify(estado).slice(0, 300));
  if (documentId !== espejo.page.documentId) throw new Error(`los documentos no calzan: espejo ${espejo.page.documentId}, producción ${documentId}`);

  // Texto por nodo: lo publicado hoy en producción contra lo que se sube.
  const html = await (await fetch(`${c.siteUrl}/${slug}/?n=${Date.now()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const publicado = new Map();
  for (const m of html.matchAll(/<(p|h[1-6]|a|button|figcaption)\b[^>]*data-cod-node="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) publicado.set(m[2], limpiar(m[3]));
  const nuevo = new Map();
  const recorrer = (ns) => { for (const n of ns || []) { const k = n.content || {}; const t = k.segments ? k.segments.map((s) => s.text).join(' ') : (k.text ?? k.label ?? null); if (typeof t === 'string' && ['paragraph', 'heading', 'button', 'link'].includes(n.kind)) nuevo.set(n.id, limpiar(t)); recorrer(n.children); } };
  recorrer(espejo.composition.nodes);
  let pierde = 0, cambia = 0, agrega = 0;
  for (const [id, t] of publicado) {
    if (!nuevo.has(id)) { pierde += 1; console.log(`  SE PIERDE  ${id}: ${t.slice(0, 110)}`); } else if (nuevo.get(id) !== t) { cambia += 1; console.log(`  cambia     ${id}:\n      hoy:   ${t.slice(0, 150)}\n      nuevo: ${nuevo.get(id).slice(0, 150)}`); }
  }
  for (const [id, t] of nuevo) if (!publicado.has(id)) { agrega += 1; console.log(`  se agrega  ${id}: ${t.slice(0, 110)}`); }
  console.log(`${espejo.page.title}: ${publicado.size} textos publicados · se pierden ${pierde} · cambian ${cambia} · se agregan ${agrega}`);

  const receta = { pageId: Number(idProd), documentId, expectedRevision: revision, design: espejo.design, composition: espejo.composition };
  const previo = llamar('cod_preview_canvas_composition', receta, entornoProd);
  if (!previo.previewId) throw new Error('la previsualización en producción falló:\n' + (previo._texto || JSON.stringify(previo)).slice(0, 1500));
  console.log(`preview en producción ok · ${previo.summary?.nodeCount ?? '?'} nodos · ${previo.summary?.ruleCount ?? '?'} reglas (espejo: ${espejo.resumen?.nodeCount} nodos)`);
  if (!aplicar) { console.log('(sin --aplicar: no escribo)'); } else {
    const hecho = llamar('cod_apply_canvas_composition', { ...receta, previewId: previo.previewId }, entornoProd);
    if (!hecho?.document?.revision) throw new Error('el apply falló:\n' + (hecho._texto || JSON.stringify(hecho)).slice(0, 1500));
    console.log(`APLICADO EN PRODUCCIÓN · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);
  }
} catch (e) {
  console.error('✗ ' + e.message);
  process.exitCode = 1;
} finally {
  rmSync(authProd, { force: true });
}
