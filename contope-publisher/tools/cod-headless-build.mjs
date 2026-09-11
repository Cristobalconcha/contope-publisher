/**
 * CREAR con el motor real de GrapesJS (headless).
 *
 * Hermano de cod-headless-node-edit.mjs. Aquel MUTA un nodo que ya existe;
 * este CONSTRUYE: agrega secciones, anida contenido y define reglas de estilo,
 * llamando a la API real de Grapes — `wrapper.append(definición)` y
 * `editor.Css.setRule(...)` — nunca pegando HTML como texto.
 *
 * La diferencia importa: al pasar DEFINICIONES de componente (objetos), y no
 * cadenas de HTML, Grapes crea componentes de verdad — incluidos los tipos
 * propios registrados por el plugin (p. ej. `cod-luma-matte`, el video con
 * transparencia). El resultado es una página nativa que después una persona
 * puede abrir en el editor visual y seguir refinando a mano, indistinguible de
 * una hecha clic a clic.
 *
 * Entrada por stdin (JSON):
 * {
 *   "document": { "projectData": "...", "html": "", "css": "" },  // opcional; vacío = página nueva
 *   "mode": "replace" | "append",                                  // por defecto "append"
 *   "styles": [                                                    // reglas de estilo, opcional
 *     { "selector": ".hero", "style": { "padding": "80px 0" } },
 *     { "selector": ".hero", "style": { "padding": "40px 0" }, "media": "(max-width: 860px)" }
 *   ],
 *   "structure": [                                                 // nodos a construir
 *     { "tag": "section", "classes": ["hero"], "children": [
 *         { "tag": "h1", "classes": ["hero__title"], "text": "Santa Luisa" },
 *         { "type": "video", "attributes": { "src": "…" } }
 *     ] },
 *     // "parent" (selector CSS) inserta DENTRO de un contenedor ya existente
 *     // en vez de al final del documento; "at" elige la posición entre sus
 *     // hijos (0 = primero; omitido = último).
 *     { "tag": "a", "classes": ["header-cta"], "parent": ".header-nav__inner", "at": 2 }
 *   ]
 * }
 *
 * Salida: {"ok":true,"projectData":…,"html":…,"css":…} o {"ok":false,"error":…}
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { aplicarSalvaguardas } from './cod-salvaguardas.mjs';

const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
const asset = (relative) => pathToFileURL(path.join(pluginRoot, 'assets', relative)).href;

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
    error: 'No se encontró un navegador headless (probé: ' + BROWSER_CANDIDATES.join(', ') + ').',
  }));
  process.exit(1);
}

const doc = input.document || {};
const projectData = typeof doc.projectData === 'string' && doc.projectData !== '' ? doc.projectData : '{}';
const html = typeof doc.html === 'string' ? doc.html : '';
const css = typeof doc.css === 'string' ? doc.css : '';
const structure = Array.isArray(input.structure) ? input.structure : [];
const styles = Array.isArray(input.styles) ? input.styles : [];
const mode = input.mode === 'replace' ? 'replace' : 'append';

if (structure.length === 0 && styles.length === 0) {
  console.log(JSON.stringify({ ok: false, error: 'Nada que construir: "structure" y "styles" vienen vacíos.' }));
  process.exit(1);
}

const temp = mkdtempSync(path.join(tmpdir(), 'cod-headless-build-'));
const fixture = path.join(temp, 'index.html');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

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
<input id="cod-canvas-page-title" value="headless-build"><button id="cod-canvas-publish">Publicar</button><a id="cod-canvas-view-page" hidden></a>
<span id="cod-canvas-status"></span><span id="cod-canvas-revision"></span><span id="cod-canvas-updated"></span>
<div id="cod-canvas-import" hidden><textarea id="cod-canvas-import-html"></textarea><textarea id="cod-canvas-import-css"></textarea></div>
<div class="cod-canvas-side-tabs"><button data-cod-side-panel="components">Componentes</button><button data-cod-side-panel="inspector">Inspector</button></div>
<div class="cod-canvas-workspace" data-cod-active-panel="inspector"><div id="cod-canvas-editor-root" class="cod-canvas-editor-root"></div><aside id="cod-canvas-inspector" class="cod-canvas-inspector"></aside></div>
<script>
window.confirm=()=>true;
const B64_PROJECT=${JSON.stringify(b64(projectData))};
const B64_HTML=${JSON.stringify(b64(html))};
const B64_CSS=${JSON.stringify(b64(css))};
const B64_STRUCTURE=${JSON.stringify(b64(JSON.stringify(structure)))};
const B64_STYLES=${JSON.stringify(b64(JSON.stringify(styles)))};
const MODE=${JSON.stringify(mode)};
function fromB64(s){return decodeURIComponent(escape(atob(s)));}
window.ocdCanvasEditor={ajaxUrl:'mock',nonce:'nonce',loadAction:'load',saveAction:'save',resolveAssetsAction:'resolve',publishAction:'publish',publishedPage:null,documentId:'headless-build',document:{documentId:'headless-build',projectData:fromB64(B64_PROJECT),html:fromB64(B64_HTML),css:fromB64(B64_CSS),revision:0,updatedAt:''},loadError:''};
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

  // nodo del pedido -> definición de componente de Grapes.
  // Se pasa como OBJETO, no como HTML: así Grapes crea componentes reales y
  // respeta los tipos propios registrados por el plugin.
  function toDefinition(node){
    if(node===null||typeof node!=='object') throw new Error('nodo inválido: '+JSON.stringify(node));
    const def={};
    if(typeof node.type==='string'&&node.type!=='') def.type=node.type;
    if(typeof node.tag==='string'&&node.tag!=='') def.tagName=node.tag;
    if(Array.isArray(node.classes)&&node.classes.length) def.classes=node.classes.slice();
    if(node.attributes&&typeof node.attributes==='object') def.attributes=Object.assign({},node.attributes);
    if(node.style&&typeof node.style==='object') def.style=Object.assign({},node.style);

    const kids=[];
    if(typeof node.text==='string'&&node.text!==''){
      if(!def.type) def.type='text';
      kids.push({type:'textnode',content:node.text});
    }
    if(Array.isArray(node.children)) node.children.forEach(function(child){kids.push(toDefinition(child));});
    if(kids.length) def.components=kids;
    return def;
  }

  try{
    const wait=(predicate,timeout=8000)=>new Promise((resolve,reject)=>{const start=Date.now();const tick=()=>{if(predicate())return resolve();if(Date.now()-start>timeout)return reject(new Error('timeout esperando el editor'));setTimeout(tick,50)};tick()});
    await wait(()=>window.ocdCanvas?.editor?.Canvas?.getDocument());
    const editor=window.ocdCanvas.editor;
    const wrapper=editor.getWrapper();

    // find() de Grapes resuelve una clase sólo si está registrada como selector
    // suyo; en documentos importados la clase vive nada más en el atributo. Por
    // eso, si find() no da nada, se recorre el árbol comparando atributos.
    // Soporta: "tag", ".clase", "tag.clase", "#id" y combinaciones de clases.
    const buscarNodo=function(sel){
      const porSelector=wrapper.find(sel);
      if(porSelector&&porSelector.length) return porSelector[0];

      const limpio=String(sel||'').trim();
      if(limpio==='') return null;
      const id=(limpio.match(/#([A-Za-z0-9_\-]+)/)||[])[1]||'';
      const clases=(limpio.match(/\.[A-Za-z0-9_\-]+/g)||[]).map(function(c){return c.slice(1)});
      const etiqueta=(limpio.match(/^[A-Za-z][A-Za-z0-9]*/)||[''])[0].toLowerCase();

      let hallado=null;
      (function recorrer(comp){
        if(hallado||!comp) return;
        const attrs=(typeof comp.getAttributes==='function'?comp.getAttributes():{})||{};
        const clasesNodo=String(attrs.class||'').split(/\s+/).filter(Boolean)
          .concat(typeof comp.getClasses==='function'?(comp.getClasses()||[]):[]);
        const tagNodo=String(comp.get&&comp.get('tagName')||'').toLowerCase();
        const calza=(etiqueta===''||etiqueta===tagNodo)
          &&(id===''||String(attrs.id||'')===id)
          &&clases.every(function(c){return clasesNodo.indexOf(c)>=0});
        if(calza&&(etiqueta!==''||id!==''||clases.length>0)){hallado=comp;return;}
        const hijos=typeof comp.components==='function'?comp.components():null;
        if(hijos&&typeof hijos.forEach==='function') hijos.forEach(recorrer);
      })(wrapper);
      return hallado;
    };

    // 1) Estructura, por la API real de componentes.
    const structure=JSON.parse(fromB64(B64_STRUCTURE));
    if(MODE==='replace') wrapper.components().reset();
    let creados=0;
    structure.forEach(function(node){
      // Por defecto el nodo se agrega al final del documento. Con "parent"
      // (selector CSS) se inserta DENTRO de un contenedor que ya existe, y con
      // "at" en qué posición entre sus hijos — que es lo que hace falta para
      // sumar algo a un header ya armado sin rehacerlo. Se resuelve con la API
      // real de Grapes (find + append), no pegando HTML.
      let destino=wrapper;
      if(typeof node.parent==='string'&&node.parent!==''){
        const encontrado=buscarNodo(node.parent);
        if(!encontrado) throw new Error('No existe el contenedor indicado en "parent": '+node.parent);
        destino=encontrado;
      }
      const opciones={};
      if(Number.isInteger(node.at)) opciones.at=node.at;
      destino.append(toDefinition(node),opciones);
      creados++;
    });

    // 2) Reglas de estilo, por el gestor de estilos real (no CSS pegado).
    const styles=JSON.parse(fromB64(B64_STYLES));
    let reglas=0;
    styles.forEach(function(rule){
      if(!rule||typeof rule.selector!=='string'||rule.selector==='') return;
      const opts={};
      if(typeof rule.media==='string'&&rule.media!==''){
        opts.atRuleType='media';
        opts.atRuleParams=rule.media;
      }
      if(rule.remove===true){
        // Quita la regla por la API real: getRule puede devolver un solo
        // modelo o una colección según cómo calce el selector.
        const hallada=editor.Css.getRule(rule.selector,opts);
        if(hallada&&typeof hallada.forEach==='function') hallada.forEach(function(r){editor.Css.remove(r);});
        else if(hallada) editor.Css.remove(hallada);
        reglas++;
        return;
      }
      if(!rule.style) return;
      editor.Css.setRule(rule.selector,rule.style,opts);
      reglas++;
    });

    await new Promise(r=>setTimeout(r,80));
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

    done({ok:true,creados:creados,reglas:reglas,projectData:JSON.stringify(editor.getProjectData()),html:editor.getHtml(),css:cssSalida});
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
    '--virtual-time-budget=15000', '--dump-dom', pathToFileURL(fixture).href,
  ], { encoding: 'utf8', timeout: 40000, maxBuffer: 64 * 1024 * 1024 });
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
  // Salvaguardas: GrapesJS reexporta la hoja completa y en esa reexportación
  // puede perder reglas que no conoce. Acá se repone lo reponible y se mide lo
  // que igual se perdería, para que quien llama pueda decidir si guarda o si
  // aparta la versión. Ver cod-salvaguardas.mjs.
  process.stdout.write(conSalvaguardas(decoded, css, styles.map((s) => (s && typeof s.selector === 'string' ? s.selector : ''))) + '\n');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

/**
 * Pasa el resultado del navegador por las salvaguardas y lo devuelve con el
 * informe adjunto. Si el resultado no es un guardado válido, lo deja intacto:
 * un error del motor no debe convertirse en un error del módulo.
 */
function conSalvaguardas(crudo, cssOriginal, selectoresTocados) {
  let payload;
  try {
    payload = JSON.parse(crudo);
  } catch {
    return crudo;
  }
  if (!payload || payload.ok !== true || typeof payload.css !== 'string') return crudo;

  const { css: cssSeguro, informe } = aplicarSalvaguardas(cssOriginal, payload.css, {
    selectoresTocados,
  });
  payload.css = cssSeguro;
  payload.salvaguardas = informe;
  return JSON.stringify(payload);
}
