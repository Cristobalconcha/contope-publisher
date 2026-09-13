/**
 * Restaura un documento Canvas desde un respaldo del runner.
 *   node scripts/restaurar-respaldo.mjs <archivo.json> [--aplicar]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const archivo = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
if (!archivo) { console.error('falta el archivo de respaldo'); process.exit(1); }

const config = JSON.parse(readFileSync(path.join(aquí, 'cod-grapes-runner', 'cod-grapes-runner.config.json'), 'utf8'));
const endpoint = `${config.siteUrl.replace(/\/+$/, '')}/wp-json/contope/v1/mcp`;
const auth = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword.replace(/\s+/g, '')}`).toString('base64');

let id = 0;
async function llamar(name, args) {
  id += 1;
  for (let i = 1; i <= 4; i += 1) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
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

const bueno = JSON.parse(readFileSync(archivo, 'utf8'));
console.log(`\nRespaldo: revisión ${bueno.revision} · html ${bueno.html.length} · css ${bueno.css.length}`);
const actual = await llamar('cod_get_canvas_page_state', { pageId: 43 });
console.log(`En el sitio ahora: revisión ${actual.document.revision}`);
if (!APLICAR) { console.log('\nSIMULACIÓN. Corré con --aplicar para restaurar.\n'); process.exit(0); }
const g = await llamar('cod_write_canvas_document', {
  pageId: 43, documentId: 'ocd-canvas-page-7', expectedRevision: actual.document.revision,
  projectData: bueno.projectData, html: bueno.html, css: bueno.css,
});
console.log(`\nRestaurado · nueva revisión ${g.revision}\n`);
