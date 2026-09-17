/**
 * Agrega «Preferencias de cookies» al pie y renombra el enlace legal.
 *
 * Por qué
 * -------
 * La página legal declara, en su propio texto, que la persona «podrá modificar
 * o retirar posteriormente su autorización mediante el enlace Preferencias de
 * cookies disponible en el pie del sitio». Ese enlace no existía: el documento
 * prometía algo que el sitio no hacía. Ahora que el banner está activo, se
 * puede cumplir en vez de borrar la frase.
 *
 * El botón declara la conducta `preferencias-cookies` del propio ContOpe, y el
 * runtime publicado le reenvía el clic al disparador de CookieAdmin.
 *
 * Se probó primero ponerle al botón la clase `cookieadmin_re_consent`, que es
 * la que ese plugin escucha. No sirve: esa clase no es un gancho, es su ícono
 * flotante. Trae `position:fixed`, 50×50 y su color, y además su JavaScript le
 * cambia el `display` al PRIMER elemento que la tenga. El enlace del pie se
 * habría arrancado del pie y habría aparecido y desaparecido solo.
 *
 * Es un <button> y no un <a> a propósito. No navega a ninguna parte: ejecuta
 * una acción en esta misma página. Un <a href="#"> saltaría al inicio del
 * documento y no se anunciaría bien a quien navegue con teclado o lector.
 *
 * El enlace existente pasa de «Términos y condiciones» a «Términos y
 * privacidad», que es el rótulo que Cristóbal dejó escrito en su instrucción y
 * que además calza con el nombre actual de la página.
 *
 * Los dos van separados por «·», igual que la línea de marca de arriba.
 *
 * Uso:
 *   node scripts/preferencias-de-cookies-en-el-pie.mjs --config <archivo> [--aplicar]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const raíz = path.join(aquí, '..');
const APLICAR = process.argv.includes('--aplicar');
const configElegida = (() => {
  const k = process.argv.indexOf('--config');
  return k !== -1 && process.argv[k + 1] ? process.argv[k + 1] : 'cod-grapes-runner.config.json';
})();

// Las cuatro páginas armadas a mano, nombradas por su DOCUMENTO y no por su
// número de página. El número cambia de una instalación a otra —el espejo
// local no tiene los mismos que el sitio publicado— y un script que lo fija
// funciona en un lado y falla en el otro. El identificador de documento sí
// viaja. El número se busca al empezar.
//
// El pie NO es región compartida: viaja dentro de cada documento, así que hay
// que tocarlos uno por uno. La página legal tiene composición MCP y su pie es
// un párrafo; va aparte.
const DOCUMENTOS = [
  'ocd-canvas-page-7',
  'ocd-canvas-page-14',
  'ocd-canvas-page-12',
  'ocd-canvas-page-10',
];

const LINEA_MARCA = 'Santa Luisa de Palpi · Paine, Región Metropolitana, Chile';
const PIE =
  '<div class="pie__marca">' + LINEA_MARCA + '</div>' +
  '<div class="pie__legal">' +
    '<a href="/terminos-y-condiciones/">Términos y privacidad</a>' +
    ' · ' +
    '<button type="button" class="pie__preferencias" data-cod-behavior="preferencias-cookies">Preferencias de cookies</button>' +
  '</div>';

const config = JSON.parse(readFileSync(path.join(aquí, 'cod-grapes-runner', configElegida), 'utf8'));
const endpoint = config.mcpEndpoint && config.mcpEndpoint.trim() !== ''
  ? config.mcpEndpoint.trim()
  : config.siteUrl.replace(/\/+$/, '') + '/wp-json/contope/v1/mcp';
const auth = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword.replace(/\s+/g, '')}`).toString('base64');

let id = 0;
async function llamar(name, args) {
  id += 1;
  let último;
  for (let i = 1; i <= 4; i += 1) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
      });
      const t = await r.text();
      const j = JSON.parse(t.includes('event:') ? t.split('data: ').pop() : t);
      if (j.error) throw new Error(j.error.message || 'error');
      const c = j.result?.content?.[0]?.text;
      if (j.result?.isError) throw new Error(c || 'error del sitio');
      return c ? JSON.parse(c) : j.result;
    } catch (e) {
      último = e;
      if (i < 4) { console.log(`     reintento ${i + 1}…`); await new Promise((s) => setTimeout(s, 1500 * i)); }
    }
  }
  throw último;
}

const respaldos = path.join(aquí, 'cod-grapes-runner', 'backups');
mkdirSync(respaldos, { recursive: true });

console.log(`\n▸ ${config.siteUrl}   ${APLICAR ? 'APLICAR' : 'simulación'}\n`);
let fallas = 0;

// Se resuelve el número de página de cada documento contra esta instalación.
const { pages } = await llamar('cod_list_canvas_pages', {});
const PAGINAS = [];
for (const documentId of DOCUMENTOS) {
  const p = pages.find((x) => String(x.documentId) === documentId);
  if (!p) { console.log(`FALLA: este sitio no tiene el documento ${documentId}`); fallas++; continue; }
  PAGINAS.push([p.pageId, documentId, p.title]);
}

for (const [pageId, documentId, título] of PAGINAS) {
  console.log(`── ${título} (página ${pageId})`);
  const doc = await llamar('cod_read_canvas_document', { pageId, documentId });

  if (doc.html.includes('preferencias-cookies')) {
    console.log('     ya lo tiene, se salta');
    continue;
  }
  if (!/<footer[^>]*>[\s\S]*?<\/footer>/.test(doc.html)) {
    console.log('     FALLA: no encontré el pie'); fallas++; continue;
  }

  const r = spawnSync('node', [path.join(raíz, 'contope-publisher', 'tools', 'cod-headless-node-edit.mjs')], {
    input: JSON.stringify({
      document: { projectData: doc.projectData, html: doc.html, css: doc.css },
      selector: 'footer',
      mutation: { content: PIE },
    }),
    encoding: 'utf8', maxBuffer: 300 * 1024 * 1024,
  });
  const línea = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
  let salida;
  try { salida = JSON.parse(línea); }
  catch { console.log('     FALLA: sin respuesta del puente: ' + (r.stderr || '').slice(-200)); fallas++; continue; }
  if (!salida.ok) { console.log('     FALLA: ' + salida.error); fallas++; continue; }

  // Comprobaciones antes de escribir. Importan dos cosas: que lo nuevo esté y
  // que lo viejo no se haya ido por delante.
  const enPie = salida.html.match(/<footer[^>]*>[\s\S]*?<\/footer>/)?.[0] || '';
  const pruebas = [
    ['el botón de preferencias quedó en el pie', /data-cod-behavior="preferencias-cookies"/.test(enPie)],
    ['una sola vez', (salida.html.match(/preferencias-cookies/g) || []).length === 1],
    ['el enlace legal sigue, y renombrado', /terminos-y-condiciones\/">Términos y privacidad</.test(enPie)],
    ['un solo enlace legal', (salida.html.match(/terminos-y-condiciones/g) || []).length === 1],
    ['el separador · está entre los dos', /<\/a> · <button/.test(enPie)],
    ['la línea de marca sigue', enPie.includes('Región Metropolitana')],
    ['el CSS no se encogió', salida.css.length > doc.css.length * 0.9],
    ['el HTML no se encogió', salida.html.length > doc.html.length * 0.9],
  ];
  let malas = 0;
  for (const [caso, ok] of pruebas) { console.log(`     ${ok ? 'ok   ' : 'FALLA'}  ${caso}`); if (!ok) malas++; }
  if (malas) { fallas += malas; continue; }
  if (!APLICAR) { console.log('     (simulación)\n'); continue; }

  writeFileSync(path.join(respaldos, `pie-pref-${pageId}-rev${doc.revision}-${Date.now()}.json`), JSON.stringify(doc));
  const g = await llamar('cod_write_canvas_document', {
    pageId, documentId, expectedRevision: doc.revision,
    projectData: salida.projectData, html: salida.html, css: salida.css,
  });
  console.log(`     guardado · revisión ${g.revision}\n`);
}

console.log(fallas === 0
  ? (APLICAR ? 'listo\n' : 'simulación limpia; corré con --aplicar\n')
  : fallas + ' problemas\n');
process.exit(fallas === 0 ? 0 : 1);
