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
  <body><base href="https://example.test/source/">
  <meta name="ocd-source" content="desktop-export">
  <nav class="nav"><span class="logo-wrap"><img class="svg-logo" src="https://example.test/Logo.svg"></span>Menú</nav>
  <section class="hero"><video class="hero__video" autoplay loop></video><h1>Santa Luisa de Palpi</h1></section>
  <section class="details__grid">
    <article class="detail-card">Terreno</article>
    <article class="detail-card">Naturaleza</article>
    <article class="detail-card">Agua</article>
  </section></body>`;
const initialCss = `
  :root { --radius-container: 16px; --radius-card: 12px; }
  .hero { border-radius: 0 0 var(--radius-container) var(--radius-container); }
  .details__grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem; }
  .detail-card { border-radius:var(--radius-card); padding:1rem; }
  .nav--scrolled { background:#f5f0eb; }`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="${asset('vendor/grapesjs/grapes.min.css')}"><link rel="stylesheet" href="${asset('css/ocd-canvas-editor.css')}">
<style>html,body{height:100%;margin:0}.ocd-canvas-workspace{display:grid;grid-template-columns:1fr 320px;height:700px}.ocd-canvas-editor-root{height:700px}.ocd-canvas-inspector.ocd-ci{position:relative!important;inset:auto!important;width:auto!important;height:700px}</style>
</head><body class="admin-bar">
<div id="wpadminbar" style="height:32px"></div>
<div class="ocd-canvas-published"><nav id="published-fixed" style="position:fixed;top:0"></nav><video id="published-video" autoplay></video></div>
<button id="ocd-canvas-save">Guardar</button><button id="ocd-canvas-reload">Recargar</button>
<button id="ocd-canvas-export-html">Exportar HTML</button><button id="ocd-canvas-export-css">Exportar CSS</button>
<button id="ocd-canvas-toggle-import">Importar</button><button id="ocd-canvas-import-apply">Aplicar</button>
<input id="ocd-canvas-page-title" value="Santa Luisa Canvas"><button id="ocd-canvas-publish">Publicar</button><a id="ocd-canvas-view-page" hidden></a>
<span id="ocd-canvas-status"></span><span id="ocd-canvas-revision"></span><span id="ocd-canvas-updated"></span>
<div id="ocd-canvas-import" hidden><textarea id="ocd-canvas-import-html"></textarea><textarea id="ocd-canvas-import-css"></textarea></div>
<div class="ocd-canvas-side-tabs"><button data-ocd-side-panel="components">Componentes</button><button data-ocd-side-panel="inspector">Inspector</button></div>
<div class="ocd-canvas-workspace" data-ocd-active-panel="inspector"><div id="ocd-canvas-editor-root" class="ocd-canvas-editor-root"></div><aside id="ocd-canvas-inspector" class="ocd-canvas-inspector"></aside></div>
<script>
window.confirm=()=>true;
window.ocdCanvasEditor={ajaxUrl:'mock',nonce:'nonce',loadAction:'load',saveAction:'save',resolveAssetsAction:'resolve',publishAction:'publish',publishedPage:null,documentId:'runtime-test',document:{documentId:'runtime-test',projectData:'{}',html:${JSON.stringify(initialHtml)},css:${JSON.stringify(initialCss)},revision:0,updatedAt:''},loadError:''};
let stored=structuredClone(window.ocdCanvasEditor.document);
window.fetch=async(_url,options)=>{const body=new URLSearchParams(options.body);const action=body.get('action');let data=structuredClone(stored);if(action==='save'){stored={...stored,projectData:body.get('project_data'),html:body.get('html'),css:body.get('css'),revision:stored.revision+1,updatedAt:new Date().toISOString()};data=structuredClone(stored);}else if(action==='resolve'){const refs=JSON.parse(body.get('asset_refs'));data={mapping:Object.fromEntries(refs.map(ref=>[ref,'https://example.test/uploads/'+ref.split('/').pop()])),missing:[]};}else if(action==='publish'){stored={...stored,projectData:body.get('project_data'),html:body.get('html'),css:body.get('css'),revision:stored.revision+1,updatedAt:new Date().toISOString()};data={pageId:42,title:body.get('title'),status:'publish',url:'https://example.test/santa-luisa-canvas/',editUrl:'https://example.test/wp-admin/post.php?post=42',revision:stored.revision,updatedAt:stored.updatedAt};}return {text:async()=>JSON.stringify({success:true,data})};};
</script>
<script src="${asset('vendor/grapesjs/grapes.min.js')}"></script>
<script src="${asset('js/ocd-computed-inspector.js')}"></script>
<script src="${asset('js/ocd-canvas-grid.global.js')}"></script>
<script src="${asset('js/ocd-grid-controls.js')}"></script>
<script src="${asset('js/ocd-behaviors.js')}"></script>
<script src="${asset('js/ocd-canvas-editor.js')}"></script>
<script src="${asset('js/ocd-canvas-public.js')}"></script>
<script>
(async()=>{let phase='inicio';try{
  const wait=(predicate,timeout=8000)=>new Promise((resolve,reject)=>{const start=Date.now();const tick=()=>{if(predicate())return resolve();if(Date.now()-start>timeout)return reject(new Error('timeout'));setTimeout(tick,50)};tick()});
  phase='montaje del editor';
  await wait(()=>window.ocdCanvas?.editor?.Canvas?.getDocument());
  document.querySelector('[data-ocd-side-panel="components"]').click();
  await wait(()=>document.querySelector('.ocd-canvas-workspace').getAttribute('data-ocd-active-panel')==='components'&&window.getComputedStyle(document.getElementById('ocd-canvas-inspector')).display==='none');
  document.querySelector('[data-ocd-side-panel="inspector"]').click();
  await wait(()=>document.querySelector('.ocd-canvas-workspace').getAttribute('data-ocd-active-panel')==='inspector'&&window.getComputedStyle(document.getElementById('ocd-canvas-inspector')).display!=='none');
  const sidePanelTabs=true;
  const inspectorCanvasTop=window.getComputedStyle(document.querySelector('.gjs-cv-canvas')).top;
  phase='compensación de barra WordPress';
  await wait(()=>document.getElementById('published-fixed').getAttribute('data-ocd-admin-bar-offset')==='32');
  const api=window.ocdCanvas;
  const svgImage=api.editor.getWrapper().find('.svg-logo')[0];
  api.editor.select(svgImage.parent());
  await wait(()=>document.querySelector('.ocd-ci__svg-title')?.textContent==='Logotipo SVG detectado');
  await api.inspector.applySvgMask('#123456','#fefefe','brand-mark');
  const svgMaskCss=api.editor.getCss();
  const svgMaskApplied=svgMaskCss.includes('mask-image')&&svgMaskCss.includes('--ocd-svg-color-dark')&&svgMaskCss.includes('prefers-color-scheme');
  const video=api.editor.getWrapper().find('.hero__video')[0];
  const videoType=video.get('type');
  const videoControls=video.getEl().hasAttribute('controls');
  const hero=api.editor.getWrapper().find('.hero')[0];
  api.editor.select(hero);
  phase='inspector computado';
  await wait(()=>api.inspector.refresh(hero)?.values?.['border-bottom-left-radius']?.computedValue==='16px');
  const heroRadius=api.inspector.refresh(hero).values['border-bottom-left-radius'].computedValue;
  const card=api.editor.getWrapper().find('.detail-card')[0];
  const grid=card.parent();
  api.grid.applyPreset(grid,'1/2/1',{breakpoint:'desktop',gap:'2rem'});
  document.getElementById('ocd-canvas-save').click();
  phase='primer guardado';
  await wait(()=>stored.revision===1);
  api.grid.applyPreset(grid,'1/1/1',{breakpoint:'desktop'});
  document.getElementById('ocd-canvas-reload').click();
  phase='recarga';
  await wait(()=>{const currentCard=api.editor.getWrapper().find('.detail-card')[0];return currentCard&&api.grid.getConfig(currentCard.parent()).desktop.template===api.grid.presets['1/2/1'];});
  const restoredCard=api.editor.getWrapper().find('.detail-card')[0];
  const restoredGrid=restoredCard.parent();
  const restored=api.grid.getConfig(restoredGrid).desktop;
  api.editor.select(restoredCard);
  await new Promise(r=>setTimeout(r,100));
  const cardRadius=api.inspector.refresh(restoredCard).values['border-bottom-left-radius'].computedValue;
  const behavior=api.behaviors.attached();
  document.getElementById('ocd-canvas-publish').click();
  phase='publicación';
  await wait(()=>document.getElementById('ocd-canvas-view-page').href.includes('/santa-luisa-canvas/'));
  const gridPersisted=stored.projectData.includes('ocdGridConfig');
  document.getElementById('ocd-canvas-import-html').value='<img class="resolved-image" src="file:///G:/assets/BannerFamilia.jpg">';
  document.getElementById('ocd-canvas-import-css').value='.resolved-image{width:100%}';
  document.getElementById('ocd-canvas-import-apply').click();
  phase='resolución de activo';
  await wait(()=>api.editor.getWrapper().find('.resolved-image')[0]?.getAttributes().src.startsWith('https://example.test/uploads/'));
  phase='autoguardado de importación';
  await wait(()=>stored.html.includes('resolved-image'));
  const resolvedSrc=api.editor.getWrapper().find('.resolved-image')[0].getAttributes().src;
  const headTagsStripped=!/<(?:base|meta)\b/i.test(stored.html);
  const publicHeaderTop=window.getComputedStyle(document.getElementById('published-fixed')).top;
  const publicVideo=document.getElementById('published-video');
  const publicVideoMuted=publicVideo.muted;
  const soundToggle=publicVideo.parentElement.querySelector('.ocd-video-sound-toggle');
  soundToggle.click();
  const publicVideoSoundEnabled=!publicVideo.muted&&soundToggle.getAttribute('aria-pressed')==='true';
  const ok=heroRadius==='16px'&&cardRadius==='12px'&&restored.template===api.grid.presets['1/2/1']&&restored.gap==='2rem'&&behavior.length===1&&gridPersisted&&svgMaskApplied&&sidePanelTabs&&inspectorCanvasTop==='0px'&&videoType==='ocd-video'&&!videoControls&&resolvedSrc.startsWith('https://example.test/uploads/')&&stored.revision>=3&&headTagsStripped&&publicHeaderTop==='32px'&&publicVideoMuted&&publicVideoSoundEnabled;
  document.documentElement.dataset.ocdRuntime=ok?'passed':'failed';
  document.documentElement.dataset.ocdRuntimeDetails=JSON.stringify({heroRadius,cardRadius,template:restored.template,gap:restored.gap,behavior:behavior.length,revision:stored.revision,headTagsStripped,svgMaskApplied,sidePanelTabs,inspectorCanvasTop,publicHeaderTop,publicVideoMuted,publicVideoSoundEnabled,videoType,videoControls,resolvedSrc,published:document.getElementById('ocd-canvas-view-page').href});
}catch(error){document.documentElement.dataset.ocdRuntime='failed';document.documentElement.dataset.ocdRuntimeDetails=phase+': '+error.message;}})();
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
