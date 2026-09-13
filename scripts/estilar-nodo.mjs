/**
 * Aplica estilo a un nodo en varias páginas, con el Grapes real.
 *   node scripts/estilar-nodo.mjs "<selector>" '{"color":"inherit"}' <pageId:docId>... [--aplicar]
 * Va por addStyle del componente, o sea queda en projectData y el editor lo ve.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const raíz = path.join(aquí, '..');
const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const libres = args.filter((a) => !a.startsWith('--'));
const selector = libres[0];
const estilo = JSON.parse(libres[1]);
const objetivos = libres.slice(2).map((s) => s.split(':'));
if (!selector || !estilo || !objetivos.length) {
  console.error('uso: node scripts/estilar-nodo.mjs "<selector>" \'{"prop":"valor"}\' <pageId:docId>... [--aplicar]');
  process.exit(1);
}

const config = JSON.parse(readFileSync(path.join(aquí, 'cod-grapes-runner', 'cod-grapes-runner.config.json'), 'utf8'));
const endpoint = `${config.siteUrl.replace(/\/+$/, '')}/wp-json/contope/v1/mcp`;
const auth = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword.replace(/\s+/g, '')}`).toString('base64');
let id = 0;
async function llamar(name, a) {
  id += 1;
  for (let i = 1; i <= 4; i += 1) {
    try {
      const r = await fetch(endpoint, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: a } }) });
      const t = await r.text();
      const j = JSON.parse(t.includes('event:') ? t.split('data: ').pop() : t);
      if (j.error) throw new Error(j.error.message || 'error');
      const c = j.result?.content?.[0]?.text;
      if (j.result?.isError) throw new Error(c || 'error del sitio');
      return c ? JSON.parse(c) : j.result;
    } catch (e) { if (i === 4) throw e; await new Promise((s) => setTimeout(s, 1500 * i)); }
  }
}
const respaldos = path.join(aquí, 'cod-grapes-runner', 'backups');
mkdirSync(respaldos, { recursive: true });
let fallas = 0;
for (const [pageId, documentId] of objetivos) {
  console.log(`\n── página ${pageId}`);
  const doc = await llamar('cod_read_canvas_document', { pageId: Number(pageId), documentId });
  const r = spawnSync('node', [path.join(raíz, 'contope-publisher', 'tools', 'cod-headless-node-edit.mjs')], {
    input: JSON.stringify({ document: { projectData: doc.projectData, html: doc.html, css: doc.css }, selector, mutation: { style: estilo } }),
    encoding: 'utf8', maxBuffer: 300 * 1024 * 1024 });
  const línea = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
  let s;
  try { s = JSON.parse(línea); } catch { console.log('     FALLA: ' + (r.stderr || '').slice(-200)); fallas++; continue; }
  if (!s.ok) { console.log('     FALLA: ' + s.error); fallas++; continue; }
  const props = Object.keys(estilo);
  const puestas = props.filter((p) => s.css.includes(p + ':' + estilo[p]) || s.css.includes(p + ': ' + estilo[p]));
  console.log(`     ${puestas.length === props.length ? 'ok   ' : 'FALLA'}  el estilo quedó en el CSS (${puestas.length}/${props.length})`);
  console.log(`     ${s.css.length > doc.css.length * 0.9 ? 'ok   ' : 'FALLA'}  el CSS no se encogió`);
  if (puestas.length !== props.length || s.css.length <= doc.css.length * 0.9) { fallas++; continue; }
  if (!APLICAR) { console.log('     (simulación)'); continue; }
  writeFileSync(path.join(respaldos, `estilo-${pageId}-rev${doc.revision}-${Date.now()}.json`), JSON.stringify(doc));
  const g = await llamar('cod_write_canvas_document', { pageId: Number(pageId), documentId,
    expectedRevision: doc.revision, projectData: s.projectData, html: s.html, css: s.css });
  console.log(`     guardado · revisión ${g.revision}`);
}
console.log('\n' + (fallas === 0 ? (APLICAR ? 'listo\n' : 'simulación limpia\n') : fallas + ' problemas\n'));
process.exit(fallas === 0 ? 0 : 1);
