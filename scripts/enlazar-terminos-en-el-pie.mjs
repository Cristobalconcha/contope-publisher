/**
 * Agrega el enlace a Términos y condiciones en el pie de las páginas armadas a
 * mano (43, 44, 45, 46). El pie NO es región compartida: viaja dentro de cada
 * página, así que hay que tocarlas una por una.
 *
 * La página 164 tiene composición MCP y se edita con
 * editar-texto-composicion.mjs, no con esto.
 *
 *   node scripts/enlazar-terminos-en-el-pie.mjs [--aplicar]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const raíz = path.join(aquí, '..');
const APLICAR = process.argv.includes('--aplicar');

const PAGINAS = [
  [43, 'ocd-canvas-page-7'],
  [44, 'ocd-canvas-page-14'],
  [45, 'ocd-canvas-page-12'],
  [46, 'ocd-canvas-page-10'],
];
// Dos líneas, no una. En una sola el pie queda apretado y en móvil se parte
// en un lugar arbitrario. Separado, la marca y el enlace legal son dos cosas
// distintas y se leen como tales.
const LINEA_MARCA = 'Santa Luisa de Palpi · Paine, Región Metropolitana, Chile';
const PIE = '<div class="pie__marca">' + LINEA_MARCA + '</div>' +
            '<div class="pie__legal"><a href="/terminos-y-condiciones/">Términos y condiciones</a></div>';

const config = JSON.parse(readFileSync(path.join(aquí, 'cod-grapes-runner', 'cod-grapes-runner.config.json'), 'utf8'));
const endpoint = `${config.siteUrl.replace(/\/+$/, '')}/wp-json/contope/v1/mcp`;
const auth = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword.replace(/\s+/g, '')}`).toString('base64');
let id = 0;
async function llamar(name, args) {
  id += 1;
  for (let i = 1; i <= 4; i += 1) {
    try {
      const r = await fetch(endpoint, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) });
      const t = await r.text();
      const j = JSON.parse(t.includes('event:') ? t.split('data: ').pop() : t);
      if (j.error) throw new Error(j.error.message || 'error');
      const c = j.result?.content?.[0]?.text;
      if (j.result?.isError) throw new Error(c || 'error del sitio');
      return c ? JSON.parse(c) : j.result;
    } catch (e) { if (i === 4) throw e; console.log(`     reintento ${i + 1}…`); await new Promise((s) => setTimeout(s, 1500 * i)); }
  }
}

const respaldos = path.join(aquí, 'cod-grapes-runner', 'backups');
mkdirSync(respaldos, { recursive: true });
let fallas = 0;

for (const [pageId, documentId] of PAGINAS) {
  console.log(`\n── página ${pageId}`);
  const doc = await llamar('cod_read_canvas_document', { pageId, documentId });

  if (doc.html.includes('pie__legal')) {
    console.log('     ya está en dos líneas, se salta');
    continue;
  }
  const actual = doc.html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/);
  if (!actual) { console.log('     FALLA: no encontré el pie'); fallas++; continue; }
  const texto = actual[1].replace(/\s+/g, ' ').trim();
  console.log(`     pie actual: ${texto.slice(0, 60)}`);

  const nuevo = PIE;
  const r = spawnSync('node', [path.join(raíz, 'contope-publisher', 'tools', 'cod-headless-node-edit.mjs')], {
    input: JSON.stringify({
      document: { projectData: doc.projectData, html: doc.html, css: doc.css },
      selector: 'footer',
      mutation: { content: nuevo },
    }),
    encoding: 'utf8', maxBuffer: 300 * 1024 * 1024,
  });
  const línea = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
  let salida;
  try { salida = JSON.parse(línea); } catch { console.log('     FALLA: sin respuesta del puente: ' + (r.stderr || '').slice(-200)); fallas++; continue; }
  if (!salida.ok) { console.log('     FALLA: ' + salida.error); fallas++; continue; }

  const pruebas = [
    ['el enlace quedó en el pie', /<footer[^>]*>[\s\S]*?terminos-y-condiciones[\s\S]*?<\/footer>/.test(salida.html)],
    ['una sola vez', (salida.html.match(/terminos-y-condiciones/g) || []).length === 1],
    ['el texto anterior sigue', salida.html.includes('Región Metropolitana')],
    ['el CSS no se encogió', salida.css.length > doc.css.length * 0.9],
    ['el HTML no se encogió', salida.html.length > doc.html.length * 0.9],
  ];
  let malas = 0;
  for (const [caso, ok] of pruebas) { console.log(`     ${ok ? 'ok   ' : 'FALLA'}  ${caso}`); if (!ok) malas++; }
  if (malas) { fallas += malas; continue; }
  if (!APLICAR) { console.log('     (simulación)'); continue; }

  writeFileSync(path.join(respaldos, `pie-${pageId}-rev${doc.revision}-${Date.now()}.json`), JSON.stringify(doc));
  const g = await llamar('cod_write_canvas_document', {
    pageId, documentId, expectedRevision: doc.revision,
    projectData: salida.projectData, html: salida.html, css: salida.css });
  console.log(`     guardado · revisión ${g.revision}`);
}

console.log('\n' + (fallas === 0 ? (APLICAR ? 'listo\n' : 'simulación limpia; corré con --aplicar\n') : fallas + ' problemas\n'));
process.exit(fallas === 0 ? 0 : 1);
