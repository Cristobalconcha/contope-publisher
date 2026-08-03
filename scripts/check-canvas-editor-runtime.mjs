import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const asset = (relative) => pathToFileURL(path.join(repoRoot, 'open-codesign-publisher', 'assets', relative)).href;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const temp = mkdtempSync(path.join(tmpdir(), 'ocd-canvas-runtime-'));
const fixture = path.join(temp, 'index.html');

const initialHtml = `
  <nav class="nav">Menú</nav>
  <section class="hero"><h1>Santa Luisa de Palpi</h1></section>
  <section class="details__grid">
    <article class="detail-card">Terreno</article>
    <article class="detail-card">Naturaleza</article>
    <article class="detail-card">Agua</article>
  </section>`;
const initialCss = `
  :root { --radius-container: 16px; --radius-card: 12px; }
  .hero { border-radius: 0 0 var(--radius-container) var(--radius-container); }
  .details__grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem; }
  .detail-card { border-radius:var(--radius-card); padding:1rem; }
  .nav--scrolled { background:#f5f0eb; }`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="${asset('vendor/grapesjs/grapes.min.css')}">
<style>html,body{height:100%;margin:0}.ocd-canvas-workspace{display:grid;grid-template-columns:1fr 320px;height:700px}.ocd-canvas-editor-root{height:700px}.ocd-canvas-inspector.ocd-ci{position:relative!important;inset:auto!important;width:auto!important;height:700px}</style>
</head><body>
<button id="ocd-canvas-save">Guardar</button><button id="ocd-canvas-reload">Recargar</button>
<button id="ocd-canvas-export-html">Exportar HTML</button><button id="ocd-canvas-export-css">Exportar CSS</button>
<button id="ocd-canvas-toggle-import">Importar</button><button id="ocd-canvas-import-apply">Aplicar</button>
<span id="ocd-canvas-status"></span><span id="ocd-canvas-revision"></span><span id="ocd-canvas-updated"></span>
<div id="ocd-canvas-import" hidden><textarea id="ocd-canvas-import-html"></textarea><textarea id="ocd-canvas-import-css"></textarea></div>
<div class="ocd-canvas-workspace"><div id="ocd-canvas-editor-root" class="ocd-canvas-editor-root"></div><aside id="ocd-canvas-inspector" class="ocd-canvas-inspector"></aside></div>
<script>
window.confirm=()=>true;
window.ocdCanvasEditor={ajaxUrl:'mock',nonce:'nonce',loadAction:'load',saveAction:'save',documentId:'runtime-test',document:{documentId:'runtime-test',projectData:'{}',html:${JSON.stringify(initialHtml)},css:${JSON.stringify(initialCss)},revision:0,updatedAt:''},loadError:''};
let stored=structuredClone(window.ocdCanvasEditor.document);
window.fetch=async(_url,options)=>{const body=new URLSearchParams(options.body);if(body.get('action')==='save'){stored={...stored,projectData:body.get('project_data'),html:body.get('html'),css:body.get('css'),revision:stored.revision+1,updatedAt:new Date().toISOString()};}return {text:async()=>JSON.stringify({success:true,data:structuredClone(stored)})};};
</script>
<script src="${asset('vendor/grapesjs/grapes.min.js')}"></script>
<script src="${asset('js/ocd-computed-inspector.js')}"></script>
<script src="${asset('js/ocd-canvas-grid.global.js')}"></script>
<script src="${asset('js/ocd-grid-controls.js')}"></script>
<script src="${asset('js/ocd-behaviors.js')}"></script>
<script src="${asset('js/ocd-canvas-editor.js')}"></script>
<script>
(async()=>{try{
  const wait=(predicate,timeout=8000)=>new Promise((resolve,reject)=>{const start=Date.now();const tick=()=>{if(predicate())return resolve();if(Date.now()-start>timeout)return reject(new Error('timeout'));setTimeout(tick,50)};tick()});
  await wait(()=>window.ocdCanvas?.editor?.Canvas?.getDocument());
  const api=window.ocdCanvas;
  const hero=api.editor.getWrapper().find('.hero')[0];
  api.editor.select(hero);
  await wait(()=>api.inspector.refresh(hero)?.values?.['border-bottom-left-radius']?.computedValue==='16px');
  const heroRadius=api.inspector.refresh(hero).values['border-bottom-left-radius'].computedValue;
  const card=api.editor.getWrapper().find('.detail-card')[0];
  const grid=card.parent();
  api.grid.applyPreset(grid,'1/2/1',{breakpoint:'desktop',gap:'2rem'});
  document.getElementById('ocd-canvas-save').click();
  await wait(()=>stored.revision===1);
  api.grid.applyPreset(grid,'1/1/1',{breakpoint:'desktop'});
  document.getElementById('ocd-canvas-reload').click();
  await wait(()=>document.getElementById('ocd-canvas-status').textContent.includes('recargado'));
  const restoredCard=api.editor.getWrapper().find('.detail-card')[0];
  const restoredGrid=restoredCard.parent();
  const restored=api.grid.getConfig(restoredGrid).desktop;
  api.editor.select(restoredCard);
  await new Promise(r=>setTimeout(r,100));
  const cardRadius=api.inspector.refresh(restoredCard).values['border-bottom-left-radius'].computedValue;
  const behavior=api.behaviors.attached();
  const ok=heroRadius==='16px'&&cardRadius==='12px'&&restored.template===api.grid.presets['1/2/1']&&restored.gap==='2rem'&&behavior.length===1&&stored.projectData.includes('ocdGridConfig');
  document.documentElement.dataset.ocdRuntime=ok?'passed':'failed';
  document.documentElement.dataset.ocdRuntimeDetails=JSON.stringify({heroRadius,cardRadius,template:restored.template,gap:restored.gap,behavior:behavior.length,revision:stored.revision});
}catch(error){document.documentElement.dataset.ocdRuntime='failed';document.documentElement.dataset.ocdRuntimeDetails=error.message;}})();
</script></body></html>`;

try {
  writeFileSync(fixture, html, 'utf8');
  const result = spawnSync(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files',
    '--virtual-time-budget=12000', '--dump-dom', pathToFileURL(fixture).href,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 12 * 1024 * 1024 });
  if (result.error) throw result.error;
  const output = result.stdout || '';
  const match = output.match(/data-ocd-runtime="([^"]+)"[^>]*data-ocd-runtime-details="([^"]*)"/);
  if (!match || match[1] !== 'passed') {
    throw new Error(`Canvas runtime no pasó: ${match?.[2] || result.stderr || 'sin resultado'}`);
  }
  console.log(`OK: Canvas runtime WordPress pasó (${match[2].replaceAll('&quot;', '"')}).`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
