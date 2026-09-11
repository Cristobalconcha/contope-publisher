import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const asset = (relative) => pathToFileURL(path.join(repoRoot, 'contope-publisher', 'assets', relative)).href;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const temp = mkdtempSync(path.join(tmpdir(), 'cod-canvas-runtime-'));
const fixture = path.join(temp, 'index.html');

const initialHtml = `
  <body><base href="https://example.test/source/">
  <meta name="cod-source" content="desktop-export">
  <nav class="nav"><span class="logo-wrap"><img class="svg-logo" src="https://example.test/Logo.svg"></span>Menú</nav>
  <nav class="nav secondary-nav">Menú secundario</nav>
  <header class="site-header">Encabezado alternativo</header>
  <section class="hero"><video class="hero__video" autoplay loop></video><h1>Santa Luisa de Palpi</h1></section>
  <section class="details__grid">
    <article class="detail-card">Terreno</article>
    <article class="detail-card">Naturaleza</article>
    <article class="detail-card">Agua</article>
  </section></body>`;
const initialCss = `
  :root { --radius-container: 16px; --radius-card: 12px; }
  .hero { border-radius: 0 0 var(--radius-container) var(--radius-container); }
  .svg-logo { width:100px; height:40px; }
  .details__grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem; }
  .detail-card { border-radius:var(--radius-card); padding:1rem; }
  .nav--scrolled { background:#f5f0eb; }`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="${asset('vendor/grapesjs/grapes.min.css')}"><link rel="stylesheet" href="${asset('css/cod-canvas-editor.css')}">
<style>html,body{height:100%;margin:0}.cod-canvas-workspace{display:grid;grid-template-columns:1fr 320px;height:700px}.cod-canvas-editor-root{height:700px}.cod-canvas-inspector.cod-ci{position:relative!important;inset:auto!important;width:auto!important;height:700px}</style>
</head><body class="admin-bar">
<div id="wpadminbar" style="height:32px"></div>
<div class="cod-canvas-published"><nav id="published-fixed" style="position:fixed;top:0"></nav><video id="published-video" autoplay></video></div>
<button id="cod-canvas-save">Guardar</button><button id="cod-canvas-reload">Recargar</button>
<button id="cod-canvas-export-html">Exportar HTML</button><button id="cod-canvas-export-css">Exportar CSS</button>
<button id="cod-canvas-toggle-import">Importar</button><button id="cod-canvas-import-apply">Aplicar</button>
<input id="cod-canvas-page-title" value="Santa Luisa Canvas"><button id="cod-canvas-publish">Publicar</button><a id="cod-canvas-view-page" hidden></a>
<span id="cod-canvas-status"></span><span id="cod-canvas-revision"></span><span id="cod-canvas-updated"></span>
<div id="cod-canvas-import" hidden><textarea id="cod-canvas-import-html"></textarea><textarea id="cod-canvas-import-css"></textarea></div>
<div class="cod-canvas-side-tabs"><button data-cod-side-panel="components">Componentes</button><button data-cod-side-panel="inspector">Inspector</button></div>
<div class="cod-canvas-workspace" data-cod-active-panel="inspector"><div id="cod-canvas-editor-root" class="cod-canvas-editor-root"></div><aside id="cod-canvas-inspector" class="cod-canvas-inspector"></aside></div>
<script>
window.confirm=()=>true;
window.ocdCanvasEditor={ajaxUrl:'mock',nonce:'nonce',loadAction:'load',saveAction:'save',resolveAssetsAction:'resolve',publishAction:'publish',publishedPage:null,documentId:'runtime-test',document:{documentId:'runtime-test',projectData:'{}',html:${JSON.stringify(initialHtml)},css:${JSON.stringify(initialCss)},revision:0,updatedAt:''},loadError:''};
let stored=structuredClone(window.ocdCanvasEditor.document);
window.fetch=async(_url,options)=>{if(String(_url).endsWith('/Logo.svg'))return {ok:true,text:async()=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><style>.mark{fill:#a7641a;fill-rule:evenodd}</style><path class="mark" d="M0 0h100v40H0z"/></svg>'};const body=new URLSearchParams(options.body);const action=body.get('action');let data=structuredClone(stored);if(action==='save'){stored={...stored,projectData:body.get('project_data'),html:body.get('html'),css:body.get('css'),revision:stored.revision+1,updatedAt:new Date().toISOString()};data=structuredClone(stored);}else if(action==='resolve'){const refs=JSON.parse(body.get('asset_refs'));data={mapping:Object.fromEntries(refs.map(ref=>[ref,'https://example.test/uploads/'+ref.split('/').pop()])),missing:[]};}else if(action==='publish'){stored={...stored,projectData:body.get('project_data'),html:body.get('html'),css:body.get('css'),revision:stored.revision+1,updatedAt:new Date().toISOString()};data={pageId:42,title:body.get('title'),status:'publish',url:'https://example.test/santa-luisa-canvas/',editUrl:'https://example.test/wp-admin/post.php?post=42',revision:stored.revision,updatedAt:stored.updatedAt};}return {text:async()=>JSON.stringify({success:true,data})};};
</script>
<script src="${asset('vendor/grapesjs/grapes.min.js')}"></script>
<script src="${asset('js/cod-computed-inspector.js')}"></script>
<script src="${asset('js/cod-canvas-grid.global.js')}"></script>
<script src="${asset('js/cod-grid-controls.js')}"></script>
<script src="${asset('js/cod-behaviors.js')}"></script>
<script src="${asset('js/cod-editor-core.js')}"></script>
<script src="${asset('js/cod-canvas-editor.js')}"></script>
<script src="${asset('js/cod-canvas-public.js')}"></script>
<script>
(async()=>{let phase='inicio';try{
  const wait=(predicate,timeout=8000)=>new Promise((resolve,reject)=>{const start=Date.now();const tick=()=>{if(predicate())return resolve();if(Date.now()-start>timeout)return reject(new Error('timeout'));setTimeout(tick,50)};tick()});
  const waitForSelector=(selector)=>new Promise(resolve=>{const current=document.querySelector(selector);if(current)return resolve(current);const observer=new MutationObserver(()=>{const node=document.querySelector(selector);if(node){observer.disconnect();resolve(node)}});observer.observe(document.documentElement,{childList:true,subtree:true})});
  phase='montaje del editor';
  await wait(()=>window.ocdCanvas?.editor?.Canvas?.getDocument());
  phase='pestaña componentes';
  document.querySelector('[data-cod-side-panel="components"]').click();
  const componentsHidden=document.querySelector('.cod-canvas-workspace').getAttribute('data-cod-active-panel')==='components'&&window.getComputedStyle(document.getElementById('cod-canvas-inspector')).display==='none';
  phase='pestaña inspector';
  document.querySelector('[data-cod-side-panel="inspector"]').click();
  const inspectorVisible=document.querySelector('.cod-canvas-workspace').getAttribute('data-cod-active-panel')==='inspector'&&window.getComputedStyle(document.getElementById('cod-canvas-inspector')).display!=='none';
  const sidePanelTabs=componentsHidden&&inspectorVisible;
  const inspectorCanvasTop=window.getComputedStyle(document.querySelector('.gjs-cv-canvas')).top;
  const api=window.ocdCanvas;
  const svgImage=api.editor.getWrapper().find('.svg-logo')[0];
  const nav=api.editor.getWrapper().find('.nav')[0];
  const logoWrap=svgImage.parent();
  const logoToolbarBefore=JSON.stringify(logoWrap.get('toolbar')??null);
  api.editor.select(logoWrap);
  phase='inspector desde hijo del header';
  await wait(()=>document.querySelector('.cod-ci__svg-title')?.textContent==='Brand · logotipo vectorial');
  phase='toolbar de estados sobre el objeto';
  await waitForSelector('[data-cod-header-tool="pin"]');
  await waitForSelector('[data-cod-header-tool="scroll"]');
  const headerPanelFromChild=!!document.querySelector('.cod-ci__header-state');
  const headerToolsOnObject=!!document.querySelector('[data-cod-header-tool="entry"]')&&!!document.querySelector('[data-cod-header-tool="scroll"]');
  phase='cambio de estado desde el objeto';
  const toolbarCommand=api.editor.getSelected().get('toolbar').find(tool=>tool.attributes?.['data-cod-header-tool']==='scroll')?.command;
  api.editor.runCommand(toolbarCommand);
  await wait(()=>nav.getEl().classList.contains('nav--scrolled'));
  const objectStateSwitch=nav.getEl().classList.contains('nav--scrolled');
  const entryCommand=api.editor.getSelected().get('toolbar').find(tool=>tool.attributes?.['data-cod-header-tool']==='entry')?.command;
  api.editor.runCommand(entryCommand);
  await wait(()=>!nav.getEl().classList.contains('nav--scrolled'));
  phase='restauración al salir del header';
  const canvasWindow=nav.getEl().ownerDocument.defaultView;
  Object.defineProperty(canvasWindow,'scrollY',{value:80,configurable:true});
  const hero=api.editor.getWrapper().find('.hero')[0];
  api.editor.select(hero);
  await wait(()=>nav.getEl().classList.contains('nav--scrolled'));
  const toolbarRestored=JSON.stringify(logoWrap.get('toolbar')??null)===logoToolbarBefore&&!JSON.stringify(hero.get('toolbar')??null).includes('cod-header-state');
  const runtimeRestoredAfterExit=nav.getEl().classList.contains('nav--scrolled')&&!nav.getEl().hasAttribute('data-cod-preview-scroll-state');
  Object.defineProperty(canvasWindow,'scrollY',{value:0,configurable:true});
  canvasWindow.dispatchEvent(new Event('resize'));
  await api.inspector.applySvgMask('#123456','#fefefe','brand-mark');
  const brandVectorCss=api.editor.getCss();
  const brandVectorApplied=api.editor.getHtml().includes('data-cod-brand-logo="primary"')&&brandVectorCss.includes('--cod-brand-color-dark')&&brandVectorCss.includes('prefers-color-scheme')&&!brandVectorCss.includes('mask-image');
  const brandVector=api.editor.getWrapper().find('[data-cod-brand-logo]')[0];
  const brandVectorBounds=brandVector.getEl().getBoundingClientRect();
  const brandVectorSizePreserved=brandVectorBounds.width===100&&brandVectorBounds.height===40;
  api.editor.select(nav);
  phase='estados del encabezado';
  await wait(()=>document.querySelector('.cod-ci__header-state'));
  const scrolledTab=Array.from(document.querySelectorAll('.cod-ci__header-tabs button')).find(button=>button.textContent==='Con scroll');
  scrolledTab.click();
  await wait(()=>scrolledTab.classList.contains('is-active')||Array.from(document.querySelectorAll('.cod-ci__header-tabs button')).some(button=>button.textContent==='Con scroll'&&button.classList.contains('is-active')));
  const headerInput=(label)=>{const node=Array.from(document.querySelectorAll('.cod-ci__header-grid label')).find(item=>item.textContent.startsWith(label));return node&&node.querySelector('input')};
  const scrolledBackground=headerInput('Fondo');
  scrolledBackground.value='#123456';
  scrolledBackground.dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>api.editor.getCss().includes('data-cod-header-id')&&api.editor.getCss().includes('nav--scrolled')&&api.editor.getCss().includes('#123456'));
  const threshold=headerInput('Cambio desde');
  threshold.value='72';
  threshold.dispatchEvent(new Event('change',{bubbles:true}));
  nav.getEl().ownerDocument.defaultView.dispatchEvent(new Event('resize'));
  await wait(()=>nav.getEl().classList.contains('nav--scrolled'));
  const headerStatePreviewed=nav.getEl().classList.contains('nav--scrolled');
  const headerThreshold=nav.getAttributes()['data-cod-scroll-threshold'];
  const secondaryNav=api.editor.getWrapper().find('.secondary-nav')[0];
  const secondaryStyle=secondaryNav.getEl().ownerDocument.defaultView.getComputedStyle(secondaryNav.getEl());
  const headerStateIsLocal=!secondaryNav.getEl().classList.contains('nav--scrolled')&&secondaryStyle.backgroundColor!=='rgb(18, 52, 86)';
  const plainHeader=api.editor.getWrapper().find('.site-header')[0];
  api.editor.select(plainHeader);
  phase='activación con pin sobre el objeto';
  await wait(()=>document.querySelector('[data-cod-header-tool="pin"]'));
  document.querySelector('[data-cod-header-tool="pin"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  await wait(()=>plainHeader.getAttributes()['data-cod-behavior']==='scroll-threshold');
  const headerWithoutNavClass=plainHeader.getAttributes()['data-cod-behavior']==='scroll-threshold'&&!plainHeader.getClasses().includes('nav');
  let headerStatesPersisted=false;
  const video=api.editor.getWrapper().find('.hero__video')[0];
  const videoType=video.get('type');
  const videoControls=video.getEl().hasAttribute('controls');
  api.editor.select(hero);
  phase='inspector computado';
  await wait(()=>api.inspector.refresh(hero)?.values?.['border-bottom-left-radius']?.computedValue==='16px');
  const heroRadius=api.inspector.refresh(hero).values['border-bottom-left-radius'].computedValue;
  const card=api.editor.getWrapper().find('.detail-card')[0];
  const grid=card.parent();
  api.grid.applyPreset(grid,'1/2/1',{breakpoint:'desktop',gap:'2rem'});
  document.getElementById('cod-canvas-save').click();
  phase='primer guardado';
  await wait(()=>stored.revision===1);
  api.grid.applyPreset(grid,'1/1/1',{breakpoint:'desktop'});
  document.getElementById('cod-canvas-reload').click();
  phase='recarga';
  await wait(()=>{const currentCard=api.editor.getWrapper().find('.detail-card')[0];return currentCard&&api.grid.getConfig(currentCard.parent()).desktop.template===api.grid.presets['1/2/1'];});
  headerStatesPersisted=stored.css.includes('data-cod-header-id')&&stored.css.includes('nav--scrolled')&&stored.css.includes('#123456')&&stored.html.includes('data-cod-scroll-threshold="72"');
  const restoredCard=api.editor.getWrapper().find('.detail-card')[0];
  const restoredGrid=restoredCard.parent();
  const restored=api.grid.getConfig(restoredGrid).desktop;
  api.editor.select(restoredCard);
  await new Promise(r=>setTimeout(r,100));
  const cardRadius=api.inspector.refresh(restoredCard).values['border-bottom-left-radius'].computedValue;
  const behavior=api.behaviors.attached();
  document.getElementById('cod-canvas-publish').click();
  phase='publicación';
  await wait(()=>document.getElementById('cod-canvas-view-page').href.includes('/santa-luisa-canvas/'));
  const gridPersisted=stored.projectData.includes('ocdGridConfig');
  const toolbarNotSerialized=!stored.projectData.includes('cod-header-state')&&!stored.projectData.includes('data-cod-header-tool');
  document.getElementById('cod-canvas-import-html').value='<img class="resolved-image" src="file:///G:/assets/BannerFamilia.jpg">';
  document.getElementById('cod-canvas-import-css').value='.resolved-image{width:100%}';
  document.getElementById('cod-canvas-import-apply').click();
  phase='resolución de activo';
  await wait(()=>api.editor.getWrapper().find('.resolved-image')[0]?.getAttributes().src.startsWith('https://example.test/uploads/'));
  phase='autoguardado de importación';
  await wait(()=>stored.html.includes('resolved-image'));
  const resolvedSrc=api.editor.getWrapper().find('.resolved-image')[0].getAttributes().src;
  const headTagsStripped=!/<(?:base|meta)\b/i.test(stored.html);
  const publicHeaderTop=window.getComputedStyle(document.getElementById('published-fixed')).top;
  const publicVideo=document.getElementById('published-video');
  const publicVideoMuted=publicVideo.muted;
  const soundToggle=publicVideo.parentElement.querySelector('.cod-video-sound-toggle');
  soundToggle.click();
  const publicVideoSoundEnabled=!publicVideo.muted&&soundToggle.getAttribute('aria-pressed')==='true';
  const ok=heroRadius==='16px'&&cardRadius==='12px'&&restored.template===api.grid.presets['1/2/1']&&restored.gap==='2rem'&&behavior.length===3&&gridPersisted&&brandVectorApplied&&brandVectorSizePreserved&&headerPanelFromChild&&headerToolsOnObject&&objectStateSwitch&&toolbarRestored&&runtimeRestoredAfterExit&&toolbarNotSerialized&&headerStatePreviewed&&headerThreshold==='72'&&headerStateIsLocal&&headerWithoutNavClass&&headerStatesPersisted&&sidePanelTabs&&inspectorCanvasTop==='0px'&&videoType==='cod-video'&&!videoControls&&resolvedSrc.startsWith('https://example.test/uploads/')&&stored.revision>=3&&headTagsStripped&&publicHeaderTop==='32px'&&publicVideoMuted&&publicVideoSoundEnabled;
  document.documentElement.dataset.ocdRuntime=ok?'passed':'failed';
  document.documentElement.dataset.ocdRuntimeDetails=JSON.stringify({heroRadius,cardRadius,template:restored.template,gap:restored.gap,behavior:behavior.length,revision:stored.revision,headTagsStripped,brandVectorApplied,brandVectorSizePreserved,headerPanelFromChild,headerToolsOnObject,objectStateSwitch,toolbarRestored,runtimeRestoredAfterExit,toolbarNotSerialized,headerStatePreviewed,headerThreshold,headerStateIsLocal,headerWithoutNavClass,headerStatesPersisted,sidePanelTabs,inspectorCanvasTop,publicHeaderTop,publicVideoMuted,publicVideoSoundEnabled,videoType,videoControls,resolvedSrc,published:document.getElementById('cod-canvas-view-page').href});
}catch(error){document.documentElement.dataset.ocdRuntime='failed';document.documentElement.dataset.ocdRuntimeDetails=phase+': '+error.message+' '+JSON.stringify({readyState:document.readyState,publishedRoots:document.querySelectorAll('.cod-canvas-published').length,adminOffset:document.getElementById('published-fixed')?.getAttribute('data-cod-admin-bar-offset'),canvas:!!window.ocdCanvas?.editor,selectedAttributes:window.ocdCanvas?.editor?.getSelected()?.getAttributes?.(),navAttributes:window.ocdCanvas?.editor?.getWrapper?.().find?.('.nav')?.[0]?.getAttributes?.(),selectedToolbar:window.ocdCanvas?.editor?.getSelected()?.get?.('toolbar'),toolbarItems:document.querySelectorAll('.gjs-toolbar-item').length,toolbarHtml:document.querySelector('.gjs-toolbar')?.outerHTML,activePanel:document.querySelector('.cod-canvas-workspace')?.getAttribute('data-cod-active-panel'),inspectorDisplay:window.getComputedStyle(document.getElementById('cod-canvas-inspector')).display,publicScript:Array.from(document.scripts).some(script=>script.src.includes('cod-canvas-public.js'))});}})();
</script></body></html>`;

try {
  writeFileSync(fixture, html, 'utf8');
  const result = spawnSync(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files',
    '--virtual-time-budget=12000', '--dump-dom', pathToFileURL(fixture).href,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 12 * 1024 * 1024 });
  if (result.error) throw result.error;
  const output = result.stdout || '';
  const match = output.match(/data-cod-runtime="([^"]+)"[^>]*data-cod-runtime-details="([^"]*)"/);
  if (!match || match[1] !== 'passed') {
    throw new Error(`Canvas runtime no pasó: ${match?.[2] || result.stderr || 'sin resultado'}`);
  }
  console.log(`OK: Canvas runtime WordPress pasó (${match[2].replaceAll('&quot;', '"')}).`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
