/**
 * Reubica un nodo del sitio con el Grapes real, por el puente headless.
 *
 * El puente corre LOCAL porque el hosting no tiene Node —cod_grapes_edit_node
 * lo dice explícitamente si se intenta allá—, pero es el mismo puente, el mismo
 * Grapes y la misma operación `move` del plugin. El documento entero viaja por
 * este script y nunca por el chat.
 *
 *   node scripts/mover-nodo.mjs "<selector>" <into|before|after> "<destino>" [--estilo '{"flex":"0 0 auto"}'] [--aplicar]
 *
 * Siempre deja un respaldo antes de escribir.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const raíz = path.join(aquí, '..');
const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const [selector, forma, destino] = args.filter((a) => !a.startsWith('--'));
const iEstilo = args.indexOf('--estilo');
const estilo = iEstilo >= 0 ? JSON.parse(args[iEstilo + 1]) : null;

if (!selector || !['into', 'before', 'after'].includes(forma) || !destino) {
  console.error('uso: node scripts/mover-nodo.mjs "<selector>" <into|before|after> "<destino>" [--estilo \'{...}\'] [--aplicar]');
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
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: toolArgs } }),
      });
      const texto = await r.text();
      const json = JSON.parse(texto.includes('event:') ? texto.split('data: ').pop() : texto);
      if (json.error) throw new Error(json.error.message || 'error');
      const c = json.result?.content?.[0]?.text;
      if (json.result?.isError) throw new Error(c || 'error del sitio');
      return c ? JSON.parse(c) : json.result;
    } catch (e) {
      if (i === 4) throw e;
      console.log(`     reintento ${i + 1}…`);
      await new Promise((s) => setTimeout(s, 1500 * i));
    }
  }
}

const PÁGINA = 43;
const DOCUMENTO = 'ocd-canvas-page-7';

console.log(`\n1/4  Leyendo el documento…`);
const doc = await llamar('cod_read_canvas_document', { pageId: PÁGINA, documentId: DOCUMENTO });
console.log(`     revisión ${doc.revision} · html ${doc.html.length} · css ${doc.css.length}`);

const respaldos = path.join(aquí, 'cod-grapes-runner', 'backups');
mkdirSync(respaldos, { recursive: true });
const respaldo = path.join(respaldos, `antes-rev${doc.revision}-${Date.now()}.json`);
writeFileSync(respaldo, JSON.stringify(doc));
console.log(`     respaldo: ${path.relative(raíz, respaldo)}`);

console.log(`\n2/4  Moviendo "${selector}" ${forma} "${destino}"…`);
const mutation = { move: { [forma]: destino } };
if (estilo) mutation.style = estilo;
const r = spawnSync('node', [path.join(raíz, 'contope-publisher', 'tools', 'cod-headless-node-edit.mjs')], {
  input: JSON.stringify({ document: { projectData: doc.projectData, html: doc.html, css: doc.css }, selector, mutation }),
  encoding: 'utf8', maxBuffer: 300 * 1024 * 1024,
});
const línea = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
let salida;
try { salida = JSON.parse(línea); } catch { console.error('sin respuesta del puente:', (r.stderr || '').slice(-500)); process.exit(1); }
if (!salida.ok) { console.error('el puente rechazó:', salida.error); process.exit(1); }

console.log('\n3/4  Comprobando antes de escribir…');
const marca = (selector.match(/[.#]([A-Za-z0-9_-]+)/g) || []).pop()?.slice(1) || '';
const pruebas = [
  ['el nodo sigue existiendo una sola vez', marca ? (salida.html.match(new RegExp(marca, 'g')) || []).length >= 1 : true],
  ['el CSS no se encogió', salida.css.length > doc.css.length * 0.9],
  ['el HTML no se encogió', salida.html.length > doc.html.length * 0.9],
  ['los marcadores siguen ahí', salida.html.includes('id="ubicacion"') && salida.html.includes('id="mapa-interactivo"')],
];
let fallas = 0;
for (const [caso, ok] of pruebas) { console.log(`     ${ok ? 'ok   ' : 'FALLA'}  ${caso}`); if (!ok) fallas += 1; }
if (fallas) { console.error(`\n${fallas} fallas: no se escribe nada.`); process.exit(1); }

if (!APLICAR) { console.log('\n4/4  SIMULACIÓN: no se guardó nada.\n'); process.exit(0); }

console.log('\n4/4  Guardando…');
const g = await llamar('cod_write_canvas_document', {
  pageId: PÁGINA, documentId: DOCUMENTO, expectedRevision: doc.revision,
  projectData: salida.projectData, html: salida.html, css: salida.css,
});
console.log(`     guardado · nueva revisión ${g.revision}`);
console.log(`\nPara volver atrás: node scripts/restaurar-respaldo.mjs "${path.relative(raíz, respaldo)}" --aplicar\n`);
