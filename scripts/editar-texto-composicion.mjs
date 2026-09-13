/**
 * Cambia el texto de uno o más nodos DENTRO de la composición guardada, y la
 * vuelve a aplicar por el camino normal (preview + apply).
 *
 * Por qué así y no editando el HTML: el documento guarda la composición que lo
 * produjo. Si se parcha el HTML por fuera, el HTML y la composición dejan de
 * coincidir, y la próxima edición por MCP reconstruye desde la composición
 * vieja y se lleva por delante el parche. Acá se edita la fuente.
 *
 *   node scripts/editar-texto-composicion.mjs <pageId> <documentId> cambios.json [--aplicar]
 *
 * cambios.json: { "id-del-nodo": "texto nuevo" }  ó
 *               { "id-del-nodo": ["párrafo 1", "párrafo 2"] }  para richText/list
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const [pageId, documentId, archivoCambios] = args.filter((a) => !a.startsWith('--'));
if (!pageId || !documentId || !archivoCambios) {
  console.error('uso: node scripts/editar-texto-composicion.mjs <pageId> <documentId> cambios.json [--aplicar]');
  process.exit(1);
}

const config = JSON.parse(readFileSync(path.join(aquí, 'cod-grapes-runner', 'cod-grapes-runner.config.json'), 'utf8'));
const endpoint = `${config.siteUrl.replace(/\/+$/, '')}/wp-json/contope/v1/mcp`;
const auth = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword.replace(/\s+/g, '')}`).toString('base64');

let id = 0;
async function llamar(name, toolArgs) {
  id += 1;
  for (let i = 1; i <= 4; i += 1) {
    try {
      const r = await fetch(endpoint, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: toolArgs } }) });
      const texto = await r.text();
      const json = JSON.parse(texto.includes('event:') ? texto.split('data: ').pop() : texto);
      if (json.error) throw new Error(json.error.message || 'error');
      const c = json.result?.content?.[0]?.text;
      if (json.result?.isError) throw new Error(c || 'error del sitio');
      return c ? JSON.parse(c) : json.result;
    } catch (e) { if (i === 4) throw e; console.log(`     reintento ${i + 1}…`); await new Promise((s) => setTimeout(s, 1500 * i)); }
  }
}


// Lo que devuelve cod_read_canvas_composition NO es reenviable tal cual: trae
// campos derivados (nodeIds, markers, nodeCount) que el validador rechaza, y
// los nodos estructurales vuelven con un content vacío que también rechaza.
// Esto es un defecto del plugin —el flujo documentado dice "conservá el resto
// tal cual"— y mientras no se arregle, se limpia acá.
function limpiar(composicion) {
  const estructurales = ['section', 'header', 'footer', 'navigation', 'group', 'layout'];
  const nodo = (n) => {
    const salida = { id: n.id, kind: n.kind };
    if (n.role) salida.role = n.role;
    if (n.marker) salida.marker = n.marker;
    if (Array.isArray(n.ruleIds) && n.ruleIds.length) salida.ruleIds = n.ruleIds;
    if (n.cadenceRuleId) salida.cadenceRuleId = n.cadenceRuleId;
    if (estructurales.includes(n.kind)) {
      salida.children = (n.children || []).map(nodo);
    } else if (n.content && Object.keys(n.content).length) {
      salida.content = n.content;
    }
    return salida;
  };
  const salida = { schemaVersion: composicion.schemaVersion, nodes: composicion.nodes.map(nodo) };
  if (composicion.label) salida.label = composicion.label;
  return salida;
}

console.log('\n1/4  Leyendo la composición guardada…');
const guardada = await llamar('cod_read_canvas_composition', { pageId: Number(pageId) });
if (!guardada.found) { console.error('Esta página no tiene composición MCP registrada; no se puede editar así.'); process.exit(1); }
const composicion = guardada.composition;
const diseno = guardada.design;
const revision = guardada.revision ?? guardada.target?.revision;
console.log(`     revisión ${revision} · ${JSON.stringify(composicion).length} bytes de composición`);

console.log('\n2/4  Cambiando los textos…');
const cambios = JSON.parse(readFileSync(archivoCambios, 'utf8'));
const pendientes = new Set(Object.keys(cambios));
function recorrer(nodos) {
  for (const n of nodos) {
    if (Object.prototype.hasOwnProperty.call(cambios, n.id)) {
      const nuevo = cambios[n.id];
      if (Array.isArray(nuevo)) {
        if (n.content && Array.isArray(n.content.paragraphs)) n.content.paragraphs = nuevo;
        else if (n.content && Array.isArray(n.content.items)) n.content.items = nuevo;
        else { console.error(`  el nodo ${n.id} no admite una lista de textos`); process.exit(1); }
      } else {
        if (!n.content || typeof n.content.text !== 'string') { console.error(`  el nodo ${n.id} no tiene un texto simple`); process.exit(1); }
        n.content.text = nuevo;
      }
      console.log(`     ok  ${n.id}`);
      pendientes.delete(n.id);
    }
    if (Array.isArray(n.children) && n.children.length) recorrer(n.children);
  }
}
recorrer(composicion.nodes);

// Además de cambiar textos, el archivo puede traer "__agregar": [nodos] para
// sumarlos al final de la raíz. Sirve para lo que falta, no sólo para lo que
// está mal escrito.
if (Array.isArray(cambios.__agregar)) {
  for (const n of cambios.__agregar) { composicion.nodes.push(n); console.log(`     + ${n.id}`); }
  pendientes.delete("__agregar");
}

// __reglas: reglas nuevas para el conjunto de diseño.
// __ruleIds: qué reglas aplicar a qué nodos, { "id-del-nodo": ["id-regla"] }.
// Con esto la herramienta cubre las tres cosas que hacen falta para arreglar
// una página: cambiar lo que dice, sumar lo que falta y vestir lo que quedó
// desnudo — todo por la composición, nunca parchando el HTML.
if (Array.isArray(cambios.__reglas)) {
  for (const r of cambios.__reglas) {
    const i = diseno.rules.findIndex((x) => x.id === r.id);
    if (i >= 0) { diseno.rules[i] = r; console.log(`     ~ regla ${r.id} (reemplazada)`); }
    else { diseno.rules.push(r); console.log(`     + regla ${r.id}`); }
  }
  pendientes.delete('__reglas');
}
if (cambios.__ruleIds && typeof cambios.__ruleIds === 'object') {
  const asignar = (nodos) => {
    for (const n of nodos) {
      if (cambios.__ruleIds[n.id]) {
        n.ruleIds = cambios.__ruleIds[n.id];
        console.log(`     = ${n.id} usa ${n.ruleIds.join(', ')}`);
      }
      if (Array.isArray(n.children) && n.children.length) asignar(n.children);
    }
  };
  asignar(composicion.nodes);
  pendientes.delete('__ruleIds');
}

if (pendientes.size) { console.error(`\nNo encontré estos nodos: ${[...pendientes].join(', ')}`); process.exit(1); }

console.log('\n3/4  Validando contra el sitio…');
const limpia = limpiar(composicion);
const previa = await llamar('cod_preview_canvas_composition', {
  pageId: Number(pageId), documentId, expectedRevision: revision, design: diseno, composition: limpia });
console.log(`     ok · ${previa.summary.nodeCount} nodos, ${previa.summary.ruleCount} reglas`);

if (!APLICAR) { console.log('\n4/4  SIMULACIÓN: no se guardó nada.\n'); process.exit(0); }

const respaldos = path.join(aquí, 'cod-grapes-runner', 'backups');
mkdirSync(respaldos, { recursive: true });
const respaldo = path.join(respaldos, `composicion-${pageId}-rev${revision}-${Date.now()}.json`);
writeFileSync(respaldo, JSON.stringify(guardada));
console.log(`\n4/4  Aplicando… (respaldo en ${path.relative(path.join(aquí, '..'), respaldo)})`);
const r = await llamar('cod_apply_canvas_composition', {
  pageId: Number(pageId), documentId, expectedRevision: revision,
  previewId: previa.previewId, design: diseno, composition: limpia });
console.log(`     guardado · nueva revisión ${r.document.revision}\n`);
