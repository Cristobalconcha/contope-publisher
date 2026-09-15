/**
 * Quita la casilla de consentimiento de la ventana de WhatsApp en las cuatro
 * páginas que la tienen.
 *
 * POR QUÉ. La casilla pedía «quiero recibir novedades» y ese consentimiento no
 * se guardaba en ninguna parte: viajaba como un sí/no suelto a Tag Manager, sin
 * nombre, sin teléfono y sin fecha. Un consentimiento que no se puede demostrar
 * ni honrar es peor que no pedirlo. Decisión de Cristóbal, 2026-09-14:
 * «deberíamos sacar esa aceptación si no sabemos quién la da».
 *
 * Dos mutaciones por página, encadenadas en memoria y con UN solo guardado:
 *   1. quitar el nodo .wa-ventana__consent (la casilla y su texto)
 *   2. vaciar los dos atributos que la apuntaban, para no dejar el documento
 *      señalando algo que ya no existe
 *
 * Uso:  node quitar-consentimiento-wsp.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bridge = path.join(repoRoot, 'contope-publisher', 'tools', 'cod-headless-node-edit.mjs');
const config = JSON.parse(readFileSync(path.join(here, 'cod-grapes-runner.config.json'), 'utf8'));
const backupsDir = path.join(here, 'backups');
const dryRun = process.argv.includes('--dry-run');

/* Términos y condiciones no tiene la ventana: no aparece acá. */
const PAGINAS = [
  { pageId: 43, documentId: 'ocd-canvas-page-7', titulo: 'Inicio' },
  { pageId: 44, documentId: 'ocd-canvas-page-14', titulo: 'Contacto' },
  { pageId: 45, documentId: 'ocd-canvas-page-12', titulo: 'Preguntas frecuentes' },
  { pageId: 46, documentId: 'ocd-canvas-page-10', titulo: 'Diferenciales' },
];

const MUTACIONES = [
  { que: 'quitar la casilla', selector: '.wa-ventana__consent', mutation: { remove: true } },
  {
    que: 'vaciar los atributos',
    selector: '#wa-ventana',
    mutation: { attributes: { 'data-cod-wa-consent': '', 'data-cod-wa-consent-text': '' } },
  },
];

const endpoint = `${config.siteUrl.replace(/\/+$/, '')}/wp-json/contope/v1/mcp`;
const auth = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');

async function callTool(name, args, intentos = 4) {
  for (let i = 1; i <= intentos; i += 1) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
      const texto = json.result?.content?.[0]?.text;
      return texto ? JSON.parse(texto) : json.result;
    } catch (e) {
      if (i === intentos) throw e;
      console.log(`       (reintento ${i}/${intentos - 1}: ${e.message})`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
console.log(`\n▸ ${PAGINAS.length} páginas · ${MUTACIONES.length} mutaciones cada una${dryRun ? '   [SIMULACIÓN]' : ''}\n`);

for (const pag of PAGINAS) {
  console.log(`— ${pag.titulo} (página ${pag.pageId})`);
  const doc = await callTool('cod_read_canvas_document', { pageId: pag.pageId, documentId: pag.documentId });
  if (typeof doc?.projectData !== 'string') throw new Error(`${pag.titulo}: el sitio no devolvió projectData.`);
  console.log(`    revisión ${doc.revision} · html ${doc.html.length} B`);

  const backupPath = path.join(backupsDir, `${pag.documentId}-rev${doc.revision}-consent-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify(doc, null, 1), 'utf8');

  let actual = { projectData: doc.projectData, html: doc.html, css: doc.css };
  const cssAntes = doc.css;
  for (const m of MUTACIONES) {
    const entrada = JSON.stringify({ document: actual, selector: m.selector, mutation: m.mutation });
    const r = spawnSync(process.execPath, [bridge], { input: entrada, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`${pag.titulo}/${m.que}: el puente salió con ${r.status}\n${r.stderr}`);
    const linea = String(r.stdout).trim().split('\n').filter(Boolean).pop();
    let out;
    try { out = JSON.parse(linea); } catch { throw new Error(`${pag.titulo}/${m.que}: salida ilegible:\n${linea}`); }
    if (!out.ok) throw new Error(`${pag.titulo}/${m.que}: ${out.error}`);
    actual = { projectData: out.projectData, html: out.html, css: out.css };
    console.log(`    ✓ ${m.que}`);
  }

  /* Rescate a mano: el conductor no lleva el del runner, así que se compara. */
  const sel = (css) => new Set((css.match(/[^{}]+(?=\s*\{)/g) || []).map((s) => s.trim()).filter(Boolean));
  const perdidos = [...sel(cssAntes)].filter((s) => !sel(actual.css).has(s));
  console.log(`    css: ${sel(cssAntes).size} → ${sel(actual.css).size} selectores` +
    (perdidos.length ? `  ATENCIÓN, faltan: ${perdidos.slice(0, 6).join(' | ')}` : '  sin pérdidas'));
  const quedan = (actual.html.match(/wa-ventana__consent|Quiero recibir novedades/g) || []).length;
  console.log(`    rastros de la casilla que quedan: ${quedan}`);
  if (perdidos.length) throw new Error(`${pag.titulo}: se perdieron reglas de estilo, no guardo nada.`);

  if (dryRun) { console.log('    (simulación: no se guardó)\n'); continue; }
  const saved = await callTool('cod_write_canvas_document', {
    pageId: pag.pageId,
    documentId: pag.documentId,
    expectedRevision: doc.revision,
    projectData: actual.projectData,
    html: actual.html,
    css: actual.css,
  });
  console.log(`    guardado · nueva revisión ${saved.revision}\n`);
}

console.log(dryRun ? '✓ Simulación completa, nada guardado.\n' : '✓ Listo en las cuatro páginas.\n');
