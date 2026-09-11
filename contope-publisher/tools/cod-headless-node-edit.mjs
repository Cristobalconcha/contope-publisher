/**
 * Puente headless a Grapes: edita UN nodo dentro de un documento Canvas real
 * usando el editor real (grapes.min.js + cod-editor-core.js, los mismos
 * bundles que corren en wp-admin), no una reimplementación en PHP.
 *
 * Copia adaptada de scripts/cod-headless-node-edit.mjs (repo raíz) para vivir
 * DENTRO del plugin (assets ahora son hermanos directos, no bajo
 * contope-publisher/) y así viajar en el zip de despliegue — el
 * servicio MCP (class-cod-canvas-mcp-service.php) lo invoca por proc_open.
 *
 * Uso:
 *   echo '{"document":{"projectData":"...","html":"...","css":"..."},
 *          "selector":".hero-family","mutation":{"attributes":{"data-foo":"1"}}}' \
 *     | node cod-headless-node-edit.mjs
 *
 * mutation admite: remove (elimina el nodo), attributes (merge), content (texto, solo nodos de texto),
 * addClass/removeClass (arrays de string), style (merge de reglas CSS).
 * Todo pasa por la API real de componentes de Grapes (component.addAttributes/
 * removeClass/addStyle/etc.), nunca por manipulación directa de HTML.
 *
 * Salida por stdout: una sola línea JSON {"ok":true,"projectData":...,
 * "html":...,"css":...} o {"ok":false,"error":...}.
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
const asset = (relative) => pathToFileURL(path.join(pluginRoot, 'assets', relative)).href;

// Candidatos de navegador: Windows (Edge, dev local) y Linux (hosting real —
// nombres habituales de Chrome/Chromium en distros/gestores comunes). El
// primero que exista en disco gana; se puede forzar con COD_HEADLESS_BROWSER.
// Chrome va PRIMERO a propósito: Edge 152 (2026-09) dejó de emitir nada con
// --dump-dom — sale con código 0 y stdout vacío, sin ningún error. Aun así se
// prueban todos los presentes hasta que uno responda.
const BROWSER_CANDIDATES = [
  process.env.COD_HEADLESS_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
].filter(Boolean);

function findBrowsers() {
  return BROWSER_CANDIDATES.filter((candidate) => existsSync(candidate));
}

function findBrowser() {
  return findBrowsers()[0] || null;
}

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

const browser = findBrowser();
if (!browser) {
  console.log(JSON.stringify({
    ok: false,
    error: 'No se encontró un navegador headless en este servidor (probé: ' + BROWSER_CANDIDATES.join(', ') + '). El puente necesita Chrome, Chromium o Edge instalado en la máquina donde corre este script.',
  }));
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
  function done(payload){document.documentElement.dataset.ocdResult=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));}
  try{
    const wait=(predicate,timeout=8000)=>new Promise((resolve,reject)=>{const start=Date.now();const tick=()=>{if(predicate())return resolve();if(Date.now()-start>timeout)return reject(new Error('timeout esperando '+predicate));setTimeout(tick,50)};tick()});
    await wait(()=>window.ocdCanvas?.editor?.Canvas?.getDocument());
    const editor=window.ocdCanvas.editor;
    const wrapper=editor.getWrapper();
    // find() de Grapes resuelve una clase sólo si está registrada como selector
    // suyo; en documentos importados la clase vive nada más en el atributo. Por
    // eso, si find() no da nada, se recorre el árbol comparando atributos.
    // Soporta: "tag", ".clase", "tag.clase", "#id" y combinaciones de clases.
    const mutation=JSON.parse(fromB64(B64_MUTATION));
    const buscarNodo=function(sel){
      const indice=Number.isInteger(mutation.index)?mutation.index:0;
      const porSelector=wrapper.find(sel);
      if(porSelector&&porSelector.length>indice) return porSelector[indice];

      const limpio=String(sel||'').trim();
      if(limpio==='') return null;
      const id=(limpio.match(/#([A-Za-z0-9_\-]+)/)||[])[1]||'';
      const clases=(limpio.match(/\.[A-Za-z0-9_\-]+/g)||[]).map(function(c){return c.slice(1)});
      const etiqueta=(limpio.match(/^[A-Za-z][A-Za-z0-9]*/)||[''])[0].toLowerCase();

      const encontrados=[];
      (function recorrer(comp){
        if(!comp) return;
        const attrs=(typeof comp.getAttributes==='function'?comp.getAttributes():{})||{};
        const clasesNodo=String(attrs.class||'').split(/\s+/).filter(Boolean)
          .concat(typeof comp.getClasses==='function'?(comp.getClasses()||[]):[]);
        const tagNodo=String(comp.get&&comp.get('tagName')||'').toLowerCase();
        const calza=(etiqueta===''||etiqueta===tagNodo)
          &&(id===''||String(attrs.id||'')===id)
          &&clases.every(function(c){return clasesNodo.indexOf(c)>=0});
        if(calza&&(etiqueta!==''||id!==''||clases.length>0)) encontrados.push(comp);
        const hijos=typeof comp.components==='function'?comp.components():null;
        if(hijos&&typeof hijos.forEach==='function') hijos.forEach(recorrer);
      })(wrapper);
      // --index elige entre varias coincidencias (p. ej. la 2ª tarjeta igual).
      return encontrados[indice]||null;
    };

    let target=buscarNodo(SELECTOR);
    if(!target) throw new Error('selector no encontró ningún nodo: '+SELECTOR);

    // "closest": aplicar la mutación al ANCESTRO más cercano que calce, no al
    // nodo encontrado. Sirve cuando lo único identificable de forma única está
    // dentro de lo que se quiere tocar — p. ej. quitar una pregunta entera de
    // un acordeón partiendo de una etiqueta que vive en su interior.
    if(typeof mutation.closest==='string'&&mutation.closest!==''){
      const calza=(comp)=>{
        if(!comp) return false;
        const attrs=(typeof comp.getAttributes==='function'?comp.getAttributes():{})||{};
        const clases=String(attrs.class||'').split(/\s+/).filter(Boolean)
          .concat(typeof comp.getClasses==='function'?(comp.getClasses()||[]):[]);
        const tag=String(comp.get&&comp.get('tagName')||'').toLowerCase();
        const sel=mutation.closest.trim();
        const id=(sel.match(/#([A-Za-z0-9_-]+)/)||[])[1]||'';
        const pedidas=(sel.match(/\.[A-Za-z0-9_-]+/g)||[]).map(c=>c.slice(1));
        const etiqueta=(sel.match(/^[A-Za-z][A-Za-z0-9]*/)||[''])[0].toLowerCase();
        return (etiqueta===''||etiqueta===tag)
          &&(id===''||String(attrs.id||'')===id)
          &&pedidas.every(c=>clases.indexOf(c)>=0);
      };
      let arriba=typeof target.parent==='function'?target.parent():null;
      while(arriba&&!calza(arriba)) arriba=typeof arriba.parent==='function'?arriba.parent():null;
      if(!arriba) throw new Error('no encontré un ancestro que calce con "'+mutation.closest+'" sobre '+SELECTOR);
      target=arriba;
    }
    if(mutation.attributes){
      target.addAttributes(mutation.attributes);
      // Un componente de tipo imagen guarda su fuente como PROPIEDAD del
      // modelo, no como atributo: si solo se cambia el atributo, Grapes vuelve
      // a escribir la anterior al renderizar y el cambio se pierde en silencio
      // (pasó con el fondo del banner, 2026-09-08). Se escriben las dos.
      if(typeof mutation.attributes.src==='string'&&typeof target.set==='function'){
        const tipo=String(target.get&&target.get('type')||'').toLowerCase();
        const etiqueta=String(target.get&&target.get('tagName')||'').toLowerCase();
        if(tipo==='image'||etiqueta==='img'||etiqueta==='source'||etiqueta==='video'){
          target.set('src',mutation.attributes.src);
        }
      }
    }
    if(typeof mutation.content==='string') target.components(mutation.content);
    if(Array.isArray(mutation.addClass)) mutation.addClass.forEach(c=>target.addClass(c));
    if(Array.isArray(mutation.removeClass)) mutation.removeClass.forEach(c=>target.removeClass(c));
    if(mutation.style) target.addStyle(mutation.style);
    // Eliminar de verdad: component.remove() de Grapes, no ocultar con CSS.
    if(mutation.remove===true){ target.remove(); }
    await new Promise(r=>setTimeout(r,50));
    // Guardián de integridad: si entró un documento con CSS y sale con una
    // fracción de él, algo se perdió por el camino (típicamente: projectData
    // ilegible, el lienzo se reconstruyó plano y el CSS quedó fuera del gestor
    // de estilos). Antes de devolver un documento mutilado, se falla claro.
    const cssEntrada=fromB64(B64_CSS);
    const cssSalida=editor.getCss({keepUnusedStyles:true});
    if(cssEntrada.length>2000&&cssSalida.length<cssEntrada.length*0.5){
      done({ok:false,error:'El CSS exportado ('+cssSalida.length+' bytes) es mucho menor que el del documento de entrada ('
        +cssEntrada.length+' bytes). Probable projectData dañado: el lienzo se reconstruyó plano y el CSS quedó fuera del gestor de estilos. '
        +'Reparalo con cod_sync_project_data antes de editar.'});
      return;
    }

    done({ok:true,projectData:JSON.stringify(editor.getProjectData()),html:editor.getHtml(),css:cssSalida});
  }catch(error){
    done({ok:false,error:String(error && error.message || error)});
  }
})();
</script></body></html>`;

/**
 * Corre el fixture en UN navegador y devuelve lo que haya dumpeado.
 *
 * --user-data-dir no es cosmético: sin un perfil propio, si el usuario ya tiene
 * el navegador abierto, este proceso se engancha a esa sesión y termina sin
 * imprimir nada.
 */
function ejecutarEnNavegador(ejecutable) {
  const result = spawnSync(ejecutable, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--allow-file-access-from-files',
    '--user-data-dir=' + path.join(temp, 'perfil'),
    '--virtual-time-budget=12000', '--dump-dom', pathToFileURL(fixture).href,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) return { salida: '', detalle: String(result.error.message || result.error) };
  return { salida: result.stdout || '', detalle: (result.stderr || '').slice(0, 300) };
}

try {
  writeFileSync(fixture, pageHtml, 'utf8');
  // Se prueban todos los navegadores presentes, no solo el primero: Edge 152
  // sale con código 0 y stdout VACÍO ante --dump-dom, sin ningún error, así que
  // "el primero que exista" no alcanza — hay que exigir resultado de verdad.
  const intentos = [];
  let decoded = null;
  for (const candidato of findBrowsers()) {
    const { salida, detalle } = ejecutarEnNavegador(candidato);
    const match = salida.match(/data-cod-result="([^"]+)"/);
    if (match) {
      decoded = Buffer.from(match[1].replaceAll('&quot;', '"'), 'base64').toString('utf8');
      break;
    }
    intentos.push(path.basename(candidato) + ': ' + (salida.length === 0 ? 'no imprimió nada' : 'imprimió ' + salida.length + ' bytes sin resultado') + (detalle ? ' — ' + detalle : ''));
  }
  if (decoded === null) {
    console.log(JSON.stringify({
      ok: false,
      error: 'Ningún navegador headless devolvió resultado.',
      intentos,
      ayuda: 'Instalá Chrome, o apuntá COD_HEADLESS_BROWSER a un navegador cuyo --dump-dom funcione.',
    }));
    process.exit(1);
  }
  process.stdout.write(decoded + '\n');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
