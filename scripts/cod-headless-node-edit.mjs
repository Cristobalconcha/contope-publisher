/**
 * Puente headless a Grapes: edita UN nodo dentro de un documento Canvas real
 * usando el editor real (grapes.min.js + cod-editor-core.js, los mismos
 * bundles que corren en wp-admin), no una reimplementación en PHP.
 *
 * Reusa exactamente el patrón de scripts/check-canvas-editor-runtime.mjs
 * (boot del editor real en Edge headless, --dump-dom) — la única diferencia
 * es que en vez de un fixture fijo con aserciones de test, recibe el
 * documento real por stdin y devuelve {projectData, html, css} recompilados
 * por el propio Grapes.
 *
 * Uso:
 *   echo '{"document":{"projectData":"...","html":"...","css":"..."},
 *          "selector":".hero-family","mutation":{"attributes":{"data-foo":"1"}}}' \
 *     | node cod-headless-node-edit.mjs
 *
 * mutation admite: attributes (merge), content (texto, solo nodos de texto),
 * addClass/removeClass (arrays de string). Todo pasa por la API real de
 * componentes de Grapes (component.addAttributes/removeClass/etc.), nunca
 * por manipulación directa de HTML.
 *
 * Salida por stdout: una sola línea JSON {"ok":true,"projectData":...,
 * "html":...,"css":...} o {"ok":false,"error":...}.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const asset = (relative) => pathToFileURL(path.join(repoRoot, 'contope-publisher', 'assets', relative)).href;
const edge = process.env.COD_HEADLESS_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function readStdin() {
  const chunks = [];
  return new Promise((resolve, reject) => {
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

const raw = await readStdin();
let input;
try {
  input = JSON.parse(raw);
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: `entrada no es JSON válido: ${error.message}` }));
  process.exit(1);
}

const doc = input.document || {};
const projectData = typeof doc.projectData === 'string' && doc.projectData !== '' ? doc.projectData : '{}';
const html = typeof doc.html === 'string' ? doc.html : '';
const css = typeof doc.css === 'string' ? doc.css : '';
const selector = typeof input.selector === 'string' ? input.selector : '';
const mutation = input.mutation && typeof input.mutation === 'object' ? input.mutation : {};

if (selector === '') {
  console.log(JSON.stringify({ ok: false, error: 'selector es obligatorio (selector CSS del nodo a editar, ej. ".hero-family" o "[data-cod-node=\'hero-family\']").' }));
  process.exit(1);
}

const temp = mkdtempSync(path.join(tmpdir(), 'cod-headless-edit-'));
const fixture = path.join(temp, 'index.html');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// El documento real llega como base64 embebido en JS (no interpolado directo
// en el HTML) para que ningún carácter de comillas/ángulo del contenido real
// rompa el fixture — se decodifica adentro con atob().
const pageHtml = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="${asset('vendor/grapesjs/grapes.min.css')}">
<link rel="stylesheet" href="${asset('css/cod-canvas-editor.css')}">
<style>html,body{height:100%;margin:0}.cod-canvas-workspace{display:grid;grid-template-columns:1fr 320px;height:900px}.cod-canvas-editor-root{height:900px}.cod-canvas-inspector.cod-ci{position:relative!important;inset:auto!important;width:auto!important;height:900px}</style>
</head><body class="admin-bar">
<div id="wpadminbar" style="height:32px"></div>
<div class="cod-canvas-published"><nav id="published-fixed" style="position:fixed;top:0"></nav></div>
<button id="cod-canvas-save">Guardar</button><button id="cod-canvas-reload">Recargar</button>
<button id="cod-canvas-export-html">Exportar HTML</button><button id="cod-canvas-export-css">Exportar CSS</button>
<button id="cod-canvas-toggle-import">Importar</button><button id="cod-canvas-import-apply">Aplicar</button>
<input id="cod-canvas-page-title" value="headless-edit"><button id="cod-canvas-publish">Publicar</button><a id="cod-canvas-view-page" hidden></a>
<span id="cod-canvas-status"></span><span id="cod-canvas-revision"></span><span id="cod-canvas-updated"></span>
<div id="cod-canvas-import" hidden><textarea id="cod-canvas-import-html"></textarea><textarea id="cod-canvas-import-css"></textarea></div>
<div class="cod-canvas-side-tabs"><button data-cod-side-panel="components">Componentes</button><button data-cod-side-panel="inspector">Inspector</button></div>
<div class="cod-canvas-workspace" data-cod-active-panel="inspector"><div id="cod-canvas-editor-root" class="cod-canvas-editor-root"></div><aside id="cod-canvas-inspector" class="cod-canvas-inspector"></aside></div>
<script>
window.confirm=()=>true;
const B64_PROJECT=${JSON.stringify(b64(projectData))};
const B64_HTML=${JSON.stringify(b64(html))};
const B64_CSS=${JSON.stringify(b64(css))};
const B64_MUTATION=${JSON.stringify(b64(JSON.stringify(mutation)))};
const SELECTOR=${JSON.stringify(selector)};
function fromB64(s){return decodeURIComponent(escape(atob(s)));}
window.ocdCanvasEditor={ajaxUrl:'mock',nonce:'nonce',loadAction:'load',saveAction:'save',resolveAssetsAction:'resolve',publishAction:'publish',publishedPage:null,documentId:'headless-edit',document:{documentId:'headless-edit',projectData:fromB64(B64_PROJECT),html:fromB64(B64_HTML),css:fromB64(B64_CSS),revision:0,updatedAt:''},loadError:''};
window.fetch=async(_url,options)=>{const body=new URLSearchParams(options.body);const action=body.get('action');if(action==='resolve'){const refs=JSON.parse(body.get('asset_refs'));return {text:async()=>JSON.stringify({success:true,data:{mapping:Object.fromEntries(refs.map(r=>[r,r])),missing:[]}})};}return {text:async()=>JSON.stringify({success:true,data:{}})};};
</script>
<script src="${asset('vendor/grapesjs/grapes.min.js')}"></script>
<script src="${asset('js/cod-computed-inspector.js')}"></script>
<script src="${asset('js/cod-canvas-grid.global.js')}"></script>
<script src="${asset('js/cod-grid-controls.js')}"></script>
<script src="${asset('js/cod-behaviors.js')}"></script>
<script src="${asset('js/cod-editor-core.js')}"></script>
<script src="${asset('js/cod-canvas-editor.js')}"></script>
<script>
(async()=>{
  function done(payload){document.documentElement.dataset.codResult=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));}
  try{
    const wait=(predicate,timeout=8000)=>new Promise((resolve,reject)=>{const start=Date.now();const tick=()=>{if(predicate())return resolve();if(Date.now()-start>timeout)return reject(new Error('timeout esperando '+predicate));setTimeout(tick,50)};tick()});
    await wait(()=>window.ocdCanvas?.editor?.Canvas?.getDocument());
    const editor=window.ocdCanvas.editor;
    const target=editor.getWrapper().find(SELECTOR)[0];
    if(!target) throw new Error('selector no encontró ningún nodo: '+SELECTOR);
    const mutation=JSON.parse(fromB64(B64_MUTATION));
    if(mutation.attributes) target.addAttributes(mutation.attributes);
    if(typeof mutation.content==='string') target.components(mutation.content);
    if(Array.isArray(mutation.addClass)) mutation.addClass.forEach(c=>target.addClass(c));
    if(Array.isArray(mutation.removeClass)) mutation.removeClass.forEach(c=>target.removeClass(c));
    if(mutation.style) target.addStyle(mutation.style);
    await new Promise(r=>setTimeout(r,50));
    done({ok:true,projectData:JSON.stringify(editor.getProjectData()),html:editor.getHtml(),css:editor.getCss()});
  }catch(error){
    done({ok:false,error:String(error && error.message || error)});
  }
})();
</script></body></html>`;

try {
  writeFileSync(fixture, pageHtml, 'utf8');
  const result = spawnSync(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files',
    '--virtual-time-budget=12000', '--dump-dom', pathToFileURL(fixture).href,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  const output = result.stdout || '';
  const match = output.match(/data-cod-result="([^"]+)"/);
  if (!match) {
    console.log(JSON.stringify({ ok: false, error: 'El editor headless no devolvió resultado.', stderr: result.stderr || '' }));
    process.exit(1);
  }
  const decoded = Buffer.from(match[1].replaceAll('&quot;', '"'), 'base64').toString('utf8');
  process.stdout.write(decoded + '\n');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
