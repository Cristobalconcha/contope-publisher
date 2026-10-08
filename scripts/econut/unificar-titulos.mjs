/**
 * Unifica los tamaños de los títulos de Econut a tres niveles, tocando SÓLO el
 * fontSize de las reglas de tipografía en la composición guardada.
 *
 *   portada (hero)  clamp(46px, 6vw, 88px)   NO SE TOCA: es una clase aparte
 *   sección         clamp(34px, 4.4vw, 58px) t-seccion, t-seccion-centro (ya), + t-etiqueta-cifra, t-cifra
 *   subsección      clamp(32px, 2.7vw, 50px) t-instalaciones, t-compromiso (ya), + t-seccion-46, t-certificaciones
 *
 * Interlineado, peso y alineación no se tocan. Espejo local de Econut (8891).
 *   node unificar-titulos.mjs [--aplicar]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const APLICAR = process.argv.includes('--aplicar');
const ENDPOINT = 'http://localhost:8891/index.php?rest_route=/contope/v1/mcp';
const AUTH = 'Basic ' + Buffer.from(readFileSync('C:/Users/Cristobal concha/wp-local-econut/.credencial-mcp-local.txt', 'utf8').trim().replace(/\s+(?=[^:]*$)/g, '')).toString('base64');
const PAGINA = 20, DOCUMENTO = 'cod-canvas-page-20';
const SECCION = 'clamp(34px, 4.4vw, 58px)', SUBSECCION = 'clamp(32px, 2.7vw, 50px)';
const NUEVO = { 't-etiqueta-cifra': SECCION, 't-cifra': SECCION, 't-seccion-46': SUBSECCION, 't-certificaciones': SUBSECCION };

let id = 0;
async function llamar(name, args) {
  id += 1;
  const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) });
  const t = await r.text();
  const j = JSON.parse(t.includes('event:') ? t.split('data: ').pop() : t);
  if (j.error) throw new Error(j.error.message);
  if (j.result?.isError) throw new Error(j.result.content?.[0]?.text);
  const c = j.result?.content?.[0]?.text; return c ? JSON.parse(c) : j.result;
}
const limpiar = (comp) => {
  const est = ['section', 'header', 'footer', 'navigation', 'group', 'layout'];
  const nodo = (n) => {
    const o = { id: n.id, kind: n.kind };
    if (n.role) o.role = n.role; if (n.marker) o.marker = n.marker;
    if (Array.isArray(n.ruleIds) && n.ruleIds.length) o.ruleIds = n.ruleIds;
    if (n.cadenceRuleId) o.cadenceRuleId = n.cadenceRuleId;
    if (n.partes && Object.keys(n.partes).length) o.partes = n.partes; // sin esto se pierden las reglas de pestañas y aviso
    if (est.includes(n.kind)) o.children = (n.children || []).map(nodo);
    else if (n.kind === 'video' && n.content) {
      // La lectura devuelve cadenas vacías que el validador no acepta como URL.
      const c = { ...n.content };
      for (const k of Object.keys(c)) if (c[k] === '') delete c[k];
      o.content = c;
    } else if (n.content && !Array.isArray(n.content) && Object.keys(n.content).length) o.content = n.content;
    else o.content = {}; // separator y similares: la lectura da [], la escritura pide un objeto
    return o;
  };
  const s = { schemaVersion: comp.schemaVersion, nodes: comp.nodes.map(nodo) };
  if (comp.label) s.label = comp.label; return s;
};

const g = await llamar('cod_read_canvas_composition', { pageId: PAGINA });
if (!g.found) throw new Error('sin composición');
const revision = g.revision ?? g.target?.revision;
const respaldos = 'C:/Users/Cristobal concha/open-codesign-wordpress/scripts/cod-grapes-runner/backups';
mkdirSync(respaldos, { recursive: true });
const respaldo = `${respaldos}/composicion-econut-${PAGINA}-rev${revision}-${Date.now()}.json`;
writeFileSync(respaldo, JSON.stringify(g));
for (const r of g.design.rules) {
  if (NUEVO[r.id]) { console.log(`${r.id}: ${r.value.fontSize} → ${NUEVO[r.id]}`); r.value.fontSize = NUEVO[r.id]; }
}
const limpia = limpiar(g.composition);
const previa = await llamar('cod_preview_canvas_composition', { pageId: PAGINA, documentId: DOCUMENTO, expectedRevision: revision, design: g.design, composition: limpia });
console.log(`preview ok · ${previa.summary.nodeCount} nodos, ${previa.summary.ruleCount} reglas · respaldo ${respaldo}`);
if (!APLICAR) process.exit(0);
const r = await llamar('cod_apply_canvas_composition', { pageId: PAGINA, documentId: DOCUMENTO, expectedRevision: revision, previewId: previa.previewId, design: g.design, composition: limpia });
console.log('aplicado · revisión', r.document.revision);
