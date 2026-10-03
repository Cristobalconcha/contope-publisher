/**
 * Prueba en un navegador real la conducta «mapa» (0.3.47): un mini mapa que, al
 * pincharlo, despliega uno grande con un marcador. Existe porque una conducta no
 * se comprueba leyendo el CSS emitido: hay que usarla y mirar qué quedó a la vista.
 *
 * Mapbox NO se descarga: no hay red hacia afuera en la prueba. Se comprueba de dos
 * maneras, las dos contra los DOS motores (que son copias separadas:
 * cod-canvas-public.js, la página publicada, y cod-behaviors.js, el editor):
 *
 *   1. CON UN DOBLE de la librería puesto en la página (window.mapboxgl): se mira
 *      con qué parámetros se la llama —la clave, el estilo, el centro, el zoom, el
 *      control de navegación, el marcador, el globo— y se disparan a mano sus
 *      eventos (load, error) para recorrer los casos de falla.
 *   2. CON LA CARGA REAL del guion y de la hoja, interceptando por el protocolo de
 *      Chrome las peticiones a api.mapbox.com (Fetch.requestPaused): se responde con
 *      el mismo doble, o se hace fallar. Así se comprueba lo más importante de la
 *      decisión: que Mapbox NO se pide al cargar la página, que se pide una sola vez
 *      al abrir, que un fallo se dice y deja salida, y que se puede reintentar.
 *
 * Qué hace:
 *   1. Compila una página con el compilador real (scripts/piezas/mapa-pagina.php,
 *      contra el WordPress local de Econut; no compone ni toca ninguna página) y
 *      la resuelve como la resolvería el sitio, con clave y sin clave.
 *   2. La sirve desde un servidor local con los dos motores.
 *   3. Maneja Chrome por su protocolo con teclas y ratón de verdad (no
 *      element.click()), salvo donde se prueba a propósito lo contrario.
 *
 * Uso: node scripts/probar-mapa.mjs [carpeta-de-capturas]
 *
 * Variables:
 *   PHP   ruta de php.exe (por omisión el de ../wp-local, que es el que corre el servidor de Econut)
 */
import http from 'node:http';
import zlib from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, dormir } from './piezas/chrome.mjs';
import { construirUrl, validar } from './generar-mini-mapa.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(aqui, '..');
const casa = path.resolve(repo, '..');
const destino = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (destino) mkdirSync(destino, { recursive: true });

// ---------------------------------------------------------------------------
// 1) La página, compilada por el compilador real.
// ---------------------------------------------------------------------------
const php = process.env.PHP || path.join(casa, 'wp-local', 'php', 'php.exe');
const ini = path.join(path.dirname(php), 'php.ini');
function compilarPagina(...argumentos) {
  const r = spawnSync(php, ['-c', ini, path.join(aqui, 'piezas', 'mapa-pagina.php'), ...argumentos], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error('No pude compilar la página de prueba:\n' + (r.stderr || r.stdout));
    process.exit(2);
  }
  return JSON.parse(r.stdout);
}
const fixtures = { base: compilarPagina(), peligroso: compilarPagina('peligroso'), pintado: compilarPagina('pintado') };
const CLAVE = fixtures.base.clave;

const JS_PUBLICO = readFileSync(path.join(repo, 'contope-publisher/assets/js/cod-canvas-public.js'));
const JS_EDITOR = readFileSync(path.join(repo, 'contope-publisher/assets/js/cod-behaviors.js'));

// El mini: un PNG de verdad (cuadrado gris de 120x120, el doble de 60 para pantallas densas).
function png(ancho, alto) {
  const tabla = (tipo, datos) => {
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(cuerpo) >>> 0);
    return Buffer.concat([largo, cuerpo, crc]);
  };
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0); cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8; cabecera[9] = 2; // 8 bits, RGB
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(ancho * 3, 0xb0)]);
  const crudo = Buffer.concat(Array.from({ length: alto }, () => fila));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), tabla('IHDR', cabecera), tabla('IDAT', zlib.deflateSync(crudo)), tabla('IEND', Buffer.alloc(0))]);
}
const MINI_PNG = png(120, 120);

// El doble de Mapbox GL. Es el mismo texto que se sirve como mapbox-gl.js cuando se
// intercepta la descarga y el que se pone directo en la página en el otro modo.
const DOBLE_GL = `(function () {
  var llamadas = window.__llamadas = window.__llamadas || [];
  var reg = function (nombre, datos) { var o = { nombre: nombre }; for (var k in (datos || {})) o[k] = datos[k]; llamadas.push(o); };
  var q = location.search;
  window.mapboxgl = {
    accessToken: null,
    supported: function () { return q.indexOf('webgl=0') < 0; },
    Map: function (o) {
      var self = this;
      reg('Map', { contenedor: o.container && o.container.className, style: o.style, center: o.center, zoom: o.zoom, claves: Object.keys(o), attributionControl: o.attributionControl, token: window.mapboxgl.accessToken, visible: !!(o.container && o.container.offsetWidth) });
      if (q.indexOf('lanza=1') >= 0) throw new Error('fallo de prueba');
      this.h = {};
      this.on = function (ev, fn) { self.h[ev] = fn; };
      this.addControl = function (c, pos) { reg('addControl', { tipo: c && c.tipo, pos: pos }); };
      this.remove = function () { reg('remove'); };
      window.__mapa = this;
    },
    NavigationControl: function () { this.tipo = 'NavigationControl'; },
    Marker: function (o) {
      reg('Marker', { conElemento: !!(o && o.element), anchor: o && o.anchor, src: o && o.element && o.element.getAttribute('src'), ancho: o && o.element && o.element.style.width });
      this.setLngLat = function (c) { reg('setLngLat', { c: c }); return this; };
      this.setPopup = function () { reg('setPopup'); return this; };
      this.addTo = function () { reg('addTo'); return this; };
      this.togglePopup = function () { reg('togglePopup'); return this; };
    },
    Popup: function (o) {
      reg('Popup', { offset: o && o.offset });
      this.setDOMContent = function (n) {
        window.__globo = n;
        reg('setDOMContent', { html: n.innerHTML, texto: n.textContent, enlaces: [].map.call(n.querySelectorAll('a'), function (a) { return { texto: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }; }), imagenes: n.querySelectorAll('img,script').length });
        return this;
      };
      this.setHTML = function () { reg('setHTML'); return this; };
      this.setText = function () { reg('setText'); return this; };
    },
  };
})();`;

const peticiones = []; // lo que se le pidió a api.mapbox.com (sólo en el modo de carga real)
let modoRed = 'ok'; // ok | script-falla | css-falla

function paginaHtml(consulta) {
  const motor = consulta.get('motor') || 'publico'; // publico | editor
  const sinScript = consulta.get('sinscript') === '1';
  const vistaPreviaDelEditor = consulta.get('editorpreview') === '1';
  const fixture = fixtures[consulta.get('peligroso') === '1' ? 'peligroso' : consulta.get('pintado') === '1' ? 'pintado' : 'base'];
  const html = consulta.get('clave') === 'sin' ? fixture.sinClave : fixture.conClave;
  const gl = consulta.get('gl') === 'doble' ? `<script>${DOBLE_GL}</script>` : '';
  const motorScript = sinScript
    ? ''
    : motor === 'editor'
      ? `<script src="/cod-behaviors.js"></script><script>window.__destruir = OcdBehaviors.createRuntime({ window: window, document: document }, { editorPreview: ${vistaPreviaDelEditor} });</script>`
      : '<script src="/cod-canvas-public.js"></script>';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prueba del mapa</title>
<style>
body{margin:0;font:16px/1.5 sans-serif;}
.relleno{height:1200px;background-color:#eef;}
.relleno-abajo{height:700px;background-color:#efe;}
.cod-canvas-published{max-width:1280px;margin:0 auto;}
${fixture.styles}
/* El diseño del sitio pone el grupo en fila (el .cod-group base es una grilla): va DESPUÉS de las reglas base, como una regla de layout. */
.cod-mcp-page .cod-node-id-mapa-pie{display:flex;flex-wrap:wrap;align-items:center;gap:15px;}
${fixture.mapaCss}
</style>
<script>
window.__errores = [];
window.__scrolls = [];
window.addEventListener('error', function (e) { window.__errores.push(String(e.message)); });
(function () { var viejo = console.error; console.error = function () { window.__errores.push([].join.call(arguments, ' ')); viejo.apply(console, arguments); }; })();
(function () { var original = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function (o) { window.__scrolls.push(o); return original.apply(this, arguments); }; })();
${consulta.get('timer') === 'corto' ? `(function () { var original = window.setTimeout; window.setTimeout = function (fn, ms) { return original.call(window, fn, ms >= 2000 ? 400 : ms); }; })();` : ''}
</script>
${gl}
</head><body><div class="relleno"></div><div class="cod-canvas-published">${html}</div><div class="relleno-abajo"></div>${motorScript}</body></html>`;
}

const servidor = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/cod-canvas-public.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(JS_PUBLICO); return; }
  if (u.pathname === '/cod-behaviors.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(JS_EDITOR); return; }
  if (u.pathname === '/mini-mapa.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(MINI_PNG); return; }
  if (u.pathname === '/vacio.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vacío</title>'); return; }
  if (u.pathname === '/pagina.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(paginaHtml(u.searchParams)); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + servidor.address().port;

// ---------------------------------------------------------------------------
// 2) Chrome y los gestos.
// ---------------------------------------------------------------------------
const { cdp, evaluar, cerrar, alEvento } = await abrirChrome({ ancho: 1000, alto: 700, escala: 1, movil: false });
await cdp('Page.enable');
await cdp('Runtime.enable');

// Toda petición a api.mapbox.com pasa por acá: se anota y se responde según el modo, sin red.
await cdp('Fetch.enable', { patterns: [{ urlPattern: 'https://api.mapbox.com/*' }] });
alEvento((metodo, p) => {
  if (metodo !== 'Fetch.requestPaused') return;
  const url = p.request.url;
  const esJs = /\.js(\?|$)/.test(url);
  const esCss = /\.css(\?|$)/.test(url);
  peticiones.push({ url, tipo: esJs ? 'js' : esCss ? 'css' : 'otro', modo: modoRed });
  const falla = (esJs && modoRed === 'script-falla') || (esCss && modoRed === 'css-falla');
  if (falla) {
    cdp('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionRefused' }).catch(() => {});
    return;
  }
  cdp('Fetch.fulfillRequest', {
    requestId: p.requestId,
    responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: esJs ? 'text/javascript' : 'text/css' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
    body: Buffer.from(esJs ? DOBLE_GL : '.mapboxgl-map{position:relative;}').toString('base64'),
  }).catch(() => {});
});

let fallas = 0;
let total = 0;
const comprobar = (caso, ok, detalle = '') => {
  total += 1;
  console.log((ok ? '  ok     ' : '  FALLA  ') + caso + (detalle ? '   ' + detalle : ''));
  if (!ok) fallas += 1;
};

async function cargar(consulta = '') {
  await cdp('Page.navigate', { url: BASE + '/pagina.html' + (consulta ? '?' + consulta : '') });
  await dormir(500);
  await evaluar(`new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r)))`);
  await dormir(250);
}

const TECLAS = { Tab: 9, Escape: 27, Enter: 13, Space: 32 };
const TEXTO_TECLA = { Enter: '\r', Space: ' ' };
const NOMBRE_TECLA = { Space: ' ' };
async function tecla(nombre, { mayus = false } = {}) {
  const modifiers = mayus ? 8 : 0;
  const key = NOMBRE_TECLA[nombre] || nombre;
  const base = { key, code: nombre, windowsVirtualKeyCode: TECLAS[nombre], modifiers };
  await cdp('Input.dispatchKeyEvent', { type: TEXTO_TECLA[nombre] ? 'keyDown' : 'rawKeyDown', ...base, ...(TEXTO_TECLA[nombre] ? { text: TEXTO_TECLA[nombre] } : {}) });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await dormir(120);
}
async function ratonEn(x, y) {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await dormir(150);
}
const centroDe = (selector) => evaluar(`(() => {
  const e = document.querySelector(${JSON.stringify(selector)});
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
async function pincharElemento(selector) {
  await evaluar(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await dormir(80);
  const p = await centroDe(selector);
  await ratonEn(p.x, p.y);
  await dormir(150);
}
// Tab hasta que el foco llegue al elemento (tope de pasos, para no colgarse).
async function tabHasta(selector, tope = 8) {
  for (let i = 0; i < tope; i += 1) {
    const ahi = await evaluar(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`);
    if (ahi) return true;
    await tecla('Tab');
  }
  return evaluar(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`);
}
const llamadas = () => evaluar('window.__llamadas || []');
const cuenta = (ls, nombre) => ls.filter((l) => l.nombre === nombre).length;

const R = '[data-cod-node="mapa-pie"]';
const snap = () => evaluar(`(() => {
  const r = document.querySelector('${R}');
  if (!r) return { hay: false };
  const caja = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  const mini = r.querySelector('[data-cod-mapa-rol="mini"]');
  const grande = r.querySelector('[data-cod-mapa-rol="grande"]');
  const x = r.querySelector('[data-cod-mapa-rol="cerrar"]');
  const aviso = r.querySelector('.cod-mapa__estado');
  const dir = r.querySelector('[data-cod-node="direccion"]');
  const img = mini && mini.querySelector('img');
  const quien = (e) => {
    if (!e) return null;
    if (e === document.body) return 'body';
    if (e.getAttribute && e.getAttribute('data-cod-mapa-rol')) return 'mapa:' + e.getAttribute('data-cod-mapa-rol') + ':' + e.tagName.toLowerCase();
    return (e.getAttribute && (e.getAttribute('data-cod-node') || e.id)) || e.tagName;
  };
  const cs = (e, p) => (e ? getComputedStyle(e)[p] : null);
  return {
    hay: true,
    listo: r.getAttribute('data-cod-mapa-listo'),
    estado: r.getAttribute('data-cod-mapa-estado'),
    clase: r.classList.contains('cod-mapa'),
    behavior: r.getAttribute('data-cod-behavior'),
    sinClave: r.getAttribute('data-cod-mapa-sin-clave'),
    token: r.getAttribute('data-cod-mapa-token'),
    mini: mini && { tag: mini.tagName.toLowerCase(), type: mini.getAttribute('type'), href: mini.getAttribute('href'), label: mini.getAttribute('aria-label'), expanded: mini.getAttribute('aria-expanded'), controls: mini.getAttribute('aria-controls'), caja: caja(mini), display: cs(mini, 'display'), radio: cs(mini, 'borderTopLeftRadius') },
    img: img && { src: img.getAttribute('src'), alt: img.getAttribute('alt'), caja: caja(img), natural: img.naturalWidth, completa: img.complete, radio: cs(img, 'borderTopLeftRadius'), fit: cs(img, 'objectFit') },
    grande: grande && { id: grande.id, rol: grande.getAttribute('role'), label: grande.getAttribute('aria-label'), busy: grande.getAttribute('aria-busy'), display: cs(grande, 'display'), oculto: grande.hidden, caja: caja(grande), fondo: cs(grande, 'backgroundColor'), radio: cs(grande, 'borderTopLeftRadius') },
    lienzo: caja(r.querySelector('.cod-mapa__lienzo')),
    aviso: aviso && { oculto: aviso.hidden, display: cs(aviso, 'display'), rol: aviso.getAttribute('role'), texto: aviso.textContent, enlaces: [...aviso.querySelectorAll('a')].map((a) => ({ texto: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })) },
    x: x && { tag: x.tagName.toLowerCase(), type: x.getAttribute('type'), label: x.getAttribute('aria-label'), caja: caja(x), color: cs(x, 'color'), tieneSvg: !!x.querySelector('svg'), display: cs(x, 'display') },
    direccion: dir && { caja: caja(dir), display: cs(dir, 'display'), texto: dir.textContent },
    caja: caja(r),
    activo: quien(document.activeElement),
    dentroDelGrande: grande ? grande.contains(document.activeElement) : false,
    hijos: [...r.children].map((c) => quien(c)),
    errores: window.__errores,
    scrollY: Math.round(scrollY),
    vp: { w: innerWidth, h: innerHeight },
    scriptsMapbox: document.querySelectorAll('script[src*="mapbox"],link[href*="mapbox"]').length,
    recursos: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.indexOf('mapbox') >= 0),
    glGlobal: typeof window.mapboxgl,
  };
})()`);
const abiertoVisible = (s) => s.estado === 'abierto' && s.grande.display !== 'none';
const cerradoOculto = (s) => s.estado === 'cerrado' && s.grande.display === 'none' && s.mini.display !== 'none';

const foto = async (nombre) => {
  if (!destino) return;
  const png64 = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(destino, nombre + '.png'), Buffer.from(png64.data, 'base64'));
};

// ---------------------------------------------------------------------------
// 3) El mismo conjunto, contra cada motor.
// ---------------------------------------------------------------------------
async function pruebasDelMotor(motor) {
  const q = (extra = '') => 'motor=' + motor + (extra ? '&' + extra : '');
  const m = 'motor ' + motor + ': ';
  console.log('\n== ' + (motor === 'publico' ? 'MOTOR DE LA PÁGINA PUBLICADA (cod-canvas-public.js)' : 'MOTOR DEL EDITOR (cod-behaviors.js)') + ' ==');

  // ---- En reposo: nada de Mapbox ----
  console.log('\n-- en reposo: el mini es una imagen del sitio y Mapbox NO se pide --');
  peticiones.length = 0;
  modoRed = 'ok';
  await cargar(q());
  await dormir(500);
  let s = await snap();
  comprobar(m + 'se monta (clase y marca de listo; estado cerrado)', s.clase && s.listo === '1' && s.estado === 'cerrado');
  comprobar(m + 'el servidor puso la clave en la raíz (data-cod-mapa-token) y el guion la leyó de ahí', s.token === CLAVE);
  comprobar(m + 'el mini es un <button type="button"> (no un enlace) con nombre accesible', s.mini.tag === 'button' && s.mini.type === 'button' && s.mini.label === 'Abrir el mapa de la planta de Paine', JSON.stringify(s.mini));
  comprobar(m + 'el mini lleva aria-expanded="false" y aria-controls apuntando al mapa grande', s.mini.expanded === 'false' && s.mini.controls === s.grande.id && s.grande.id !== '', `controls=${s.mini.controls} grande=${s.grande.id}`);
  comprobar(m + 'el mini mide 60x60', s.mini.caja.w === 60 && s.mini.caja.h === 60, JSON.stringify(s.mini.caja));
  comprobar(m + 'la imagen del mini es un archivo del propio sitio, cargó, y se ve entera (sin recortar)', s.img.src === '/mini-mapa.png' && s.img.completa && s.img.natural === 120 && s.img.fit === 'contain' && s.img.caja.w === 60 && s.img.caja.h === 60, JSON.stringify(s.img));
  comprobar(m + 'la dirección escrita está a la vista, AL LADO del mini (no debajo)', s.direccion.caja.w > 0 && s.direccion.caja.x >= s.mini.caja.x + 60, `mini x=${s.mini.caja.x} dirección x=${s.direccion.caja.x}`);
  comprobar(m + 'el mapa grande está cerrado y no ocupa lugar', s.grande.display === 'none' && s.grande.oculto && s.grande.caja.h === 0);
  comprobar(m + 'el orden en el grupo: mini, dirección, mapa grande', JSON.stringify(s.hijos) === JSON.stringify(['mapa:mini:button', 'direccion', 'mapa:grande:div']), JSON.stringify(s.hijos));
  comprobar(m + 'NO hay ningún script ni hoja de Mapbox en la página', s.scriptsMapbox === 0 && s.glGlobal === 'undefined');
  comprobar(m + 'NO se le pidió NADA a Mapbox al cargar (ni el guion, ni la hoja, ni una imagen)', peticiones.length === 0 && s.recursos.length === 0, JSON.stringify(peticiones));
  comprobar(m + 'sin errores en la consola', s.errores.length === 0, JSON.stringify(s.errores));
  await evaluar(`document.querySelector('${R}').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await dormir(100);
  await foto(motor + '-1-reposo');

  // ---- Teclado: el mini es un control ----
  console.log('\n-- teclado: Tab llega al mini; Enter y Espacio lo abren --');
  const llego = await tabHasta('[data-cod-mapa-rol="mini"]');
  comprobar(m + 'Tab alcanza el mini (viene después del enlace anterior)', llego);
  peticiones.length = 0;
  await tecla('Enter');
  await dormir(400);
  s = await snap();
  comprobar(m + 'Enter abre el mapa grande', abiertoVisible(s), `estado=${s.estado} display=${s.grande.display}`);
  comprobar(m + 'al abrir, el mini se oculta y aria-expanded pasa a true', s.mini.display === 'none' && s.mini.expanded === 'true');
  comprobar(m + 'al abrir, el foco pasa a la X (el mini desapareció: el foco no queda en el aire)', s.activo === 'mapa:cerrar:button', 'activo=' + s.activo);
  comprobar(m + 'el mapa grande es una región con nombre', s.grande.rol === 'region' && s.grande.label === 'Mapa de ubicación');
  comprobar(m + 'el mapa grande mide 400px de alto (--cod-mapa-alto) y llena el ancho del grupo', s.grande.caja.h === 400 && s.grande.caja.w === s.caja.w && s.grande.caja.w <= 1280, JSON.stringify(s.grande.caja) + ' grupo ' + s.caja.w);
  comprobar(m + 'se despliega DEBAJO de la fila (la fila del mini y la dirección no se mueve)', s.grande.caja.y >= s.mini.caja.y, JSON.stringify(s.grande.caja));
  comprobar(m + 'la X mide al menos 44x44 y queda dentro del recuadro, arriba a la derecha', s.x.caja.w >= 44 && s.x.caja.h >= 44 && s.x.caja.x + s.x.caja.w <= s.grande.caja.x + s.grande.caja.w && s.x.caja.y >= s.grande.caja.y && s.x.caja.x > s.grande.caja.x + s.grande.caja.w / 2, JSON.stringify(s.x.caja));
  comprobar(m + 'la X es un button type=button con nombre accesible y SVG', s.x.tag === 'button' && s.x.type === 'button' && s.x.label === 'Cerrar el mapa' && s.x.tieneSvg);
  comprobar(m + 'la dirección escrita SIGUE a la vista con el mapa abierto', s.direccion.caja.w > 0 && s.direccion.display !== 'none');
  comprobar(m + 'Mapbox se pidió AHORA, no antes: un guion y una hoja, una vez cada uno',
    peticiones.length === 2 && peticiones.filter((p) => p.tipo === 'js').length === 1 && peticiones.filter((p) => p.tipo === 'css').length === 1
      && peticiones.every((p) => /^https:\/\/api\.mapbox\.com\/mapbox-gl-js\/v2\.14\.1\/mapbox-gl\.(js|css)$/.test(p.url)), JSON.stringify(peticiones.map((p) => p.url)));
  let ls = await llamadas();
  comprobar(m + 'con la librería ya llegada, se dibujó el mapa (un Map)', cuenta(ls, 'Map') === 1, JSON.stringify(ls.map((l) => l.nombre)));
  await foto(motor + '-2-abierto-cargando');

  // ---- Los parámetros con que se llama a Mapbox ----
  console.log('\n-- con qué se llama a Mapbox GL --');
  const mapa = ls.find((l) => l.nombre === 'Map');
  comprobar(m + 'la clave que recibe Mapbox es la guardada en Configuración (no la de la página guardada)', mapa && mapa.token === CLAVE);
  comprobar(m + 'el estilo del mapa grande es streets-v11 y el contenedor es el lienzo (ya visible, con tamaño)', mapa && mapa.style === 'mapbox://styles/mapbox/streets-v11' && mapa.contenedor === 'cod-mapa__lienzo' && mapa.visible);
  comprobar(m + 'el centro es [lng, lat] (Mapbox pide la longitud primero) y el zoom es 17', mapa && JSON.stringify(mapa.center) === JSON.stringify([-70.68161682, -33.80413625]) && mapa.zoom === 17, JSON.stringify(mapa && [mapa.center, mapa.zoom]));
  comprobar(m + 'NO se apaga la atribución del mapa grande (los términos de Mapbox la exigen)', mapa && mapa.attributionControl !== false && !mapa.claves.includes('attributionControl'), JSON.stringify(mapa && mapa.claves));
  const nav = ls.find((l) => l.nombre === 'addControl');
  comprobar(m + 'NavigationControl arriba a la izquierda', nav && nav.tipo === 'NavigationControl' && nav.pos === 'top-left', JSON.stringify(nav));
  const marcador = ls.find((l) => l.nombre === 'Marker');
  comprobar(m + 'marcador por omisión de Mapbox (no se configuró imagen propia) en la posición del lugar', marcador && !marcador.conElemento && JSON.stringify(ls.find((l) => l.nombre === 'setLngLat').c) === JSON.stringify([-70.68161682, -33.80413625]));
  comprobar(m + 'el marcador lleva su globo, abierto, y se agrega al mapa', ['Popup', 'setPopup', 'addTo', 'togglePopup'].every((n) => cuenta(ls, n) === 1));
  const globo = ls.find((l) => l.nombre === 'setDOMContent');
  comprobar(m + 'el globo se arma con setDOMContent y NUNCA con setHTML ni setText', cuenta(ls, 'setHTML') === 0 && cuenta(ls, 'setText') === 0 && !!globo);
  comprobar(m + 'el globo dice la dirección, tal cual, como texto', globo && globo.texto.indexOf('Av 18 de Septiembre sn Hijuela 2, Fundo San Rafael, Paine') === 0, globo && globo.texto);
  comprobar(m + 'el enlace del globo es un enlace DE VERDAD (<a href>), sin corchetes de Markdown, y abre en otra pestaña con rel seguro',
    globo && globo.enlaces.length === 1 && globo.enlaces[0].texto === 'www.econut.cl' && globo.enlaces[0].href === 'https://www.econut.cl' && globo.enlaces[0].target === '_blank' && globo.enlaces[0].rel === 'noopener noreferrer' && !/[\[\]]/.test(globo.texto), JSON.stringify(globo && globo.enlaces));

  // ---- Cargando… y listo ----
  console.log('\n-- «Cargando…» mientras llega el mapa, y se retira cuando está --');
  s = await snap();
  // El aviso de carga ofrece ADEMÁS la salida a OpenStreetMap, y por eso el
  // texto no es exactamente «Cargando el mapa…». Es a propósito: si el mapa no
  // llega, quien esperaba ya tiene por dónde salir sin haber visto un error.
  comprobar(m + 'mientras el mapa no dice «load», se ve «Cargando el mapa…» (role=status) y aria-busy=true',
    !s.aviso.oculto && s.aviso.rol === 'status' && s.aviso.texto.indexOf('Cargando el mapa…') === 0 && s.grande.busy === 'true', JSON.stringify(s.aviso));
  comprobar(m + 'y ya ofrece «Cómo llegar», para no dejar esperando a nadie sin salida',
    s.aviso.enlaces.length === 1 && s.aviso.enlaces[0].texto === 'Cómo llegar', JSON.stringify(s.aviso.enlaces));
  comprobar(m + 'el aviso de carga cubre el recuadro (no se ve un gris vacío sin explicación)', s.aviso.display !== 'none');
  await evaluar(`window.__mapa.h.load()`);
  s = await snap();
  comprobar(m + 'al llegar «load» el aviso se retira y aria-busy pasa a false', s.aviso.oculto && s.aviso.display === 'none' && s.grande.busy === 'false');

  // ---- Escape cierra, el foco vuelve ----
  console.log('\n-- Escape cierra; el foco vuelve al mini; no hay trampa de foco --');
  await tecla('Tab');
  s = await snap();
  comprobar(m + 'NO atrapa el foco: Tab desde la X sale del mapa grande', s.activo !== 'mapa:cerrar:button', 'activo=' + s.activo);
  await evaluar(`document.querySelector('[data-cod-mapa-rol="cerrar"]').focus()`);
  await tecla('Escape');
  s = await snap();
  comprobar(m + 'Escape cierra (mini visible, mapa grande oculto, aria-expanded=false)', cerradoOculto(s) && s.mini.expanded === 'false', `estado=${s.estado}`);
  comprobar(m + 'al cerrar, el foco vuelve al mini', s.activo === 'mapa:mini:button', 'activo=' + s.activo);
  ls = await llamadas();
  comprobar(m + 'al cerrar se destruye el mapa de Mapbox (map.remove) y el lienzo queda vacío', cuenta(ls, 'remove') === 1);

  // ---- Reabrir con Espacio: no vuelve a descargar nada ----
  console.log('\n-- reabrir: la librería ya está, no se vuelve a pedir --');
  peticiones.length = 0;
  await tecla('Space');
  await dormir(200);
  s = await snap();
  ls = await llamadas();
  comprobar(m + 'Espacio abre otra vez', abiertoVisible(s));
  comprobar(m + 'las veces siguientes NO se vuelve a pedir nada a Mapbox', peticiones.length === 0 && s.scriptsMapbox === 2, JSON.stringify(peticiones));
  comprobar(m + 'se dibuja un mapa NUEVO (el viejo se destruyó)', cuenta(ls, 'Map') === 2);
  await pincharElemento('[data-cod-mapa-rol="cerrar"]');
  s = await snap();
  comprobar(m + 'la X (clic real) cierra', cerradoOculto(s));
  await pincharElemento('[data-cod-mapa-rol="mini"]');
  s = await snap();
  comprobar(m + 'un clic real en el mini abre', abiertoVisible(s));
  await pincharElemento('[data-cod-mapa-rol="cerrar"]');

  // ---- Movimiento reducido ----
  console.log('\n-- el desplazamiento respeta prefers-reduced-motion --');
  await cargar(q());
  await evaluar(`window.__scrolls.length = 0`);
  await pincharElemento('[data-cod-mapa-rol="mini"]');
  let scrolls = await evaluar('window.__scrolls');
  const ultimo = scrolls[scrolls.length - 1];
  comprobar(m + 'con movimiento permitido, el desplazamiento al mapa es suave', ultimo && ultimo.behavior === 'smooth', JSON.stringify(scrolls));
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cargar(q());
  await evaluar(`window.__scrolls.length = 0`);
  await pincharElemento('[data-cod-mapa-rol="mini"]');
  scrolls = await evaluar('window.__scrolls');
  const ultimoReducido = scrolls[scrolls.length - 1];
  comprobar(m + 'con prefers-reduced-motion: reduce, salta sin animar (behavior auto)', ultimoReducido && ultimoReducido.behavior === 'auto', JSON.stringify(scrolls));
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  // ---- Fallas ----
  console.log('\n-- fallas: se dicen, dejan salida y no dejan un recuadro gris --');
  const salidaOSM = 'https://www.openstreetmap.org/?mlat=-33.804136&mlon=-70.681617#map=17/-33.804136/-70.681617';
  const verFalla = async (nombreCaso, consulta, preparar, textoEsperado) => {
    modoRed = 'ok';
    await cargar(q(consulta));
    if (preparar) await preparar();
    await pincharElemento('[data-cod-mapa-rol="mini"]');
    await dormir(consulta.indexOf('timer=corto') >= 0 ? 900 : 300);
    return { s: await snap(), caso: nombreCaso, textoEsperado };
  };
  const revisarFalla = ({ s, caso, textoEsperado }) => {
    comprobar(m + caso + ': se dice qué pasó («' + textoEsperado + '»)', !s.aviso.oculto && s.aviso.texto.indexOf(textoEsperado) === 0, JSON.stringify(s.aviso.texto));
    comprobar(m + caso + ': ofrece «Cómo llegar» como salida, un enlace de verdad a OpenStreetMap, en otra pestaña', s.aviso.enlaces.length === 1 && s.aviso.enlaces[0].texto === 'Cómo llegar' && s.aviso.enlaces[0].href === salidaOSM && s.aviso.enlaces[0].target === '_blank' && s.aviso.enlaces[0].rel === 'noopener noreferrer', JSON.stringify(s.aviso.enlaces));
    comprobar(m + caso + ': ya no dice «cargando» (aria-busy=false) y el aviso cubre el recuadro', s.grande.busy === 'false' && s.aviso.display !== 'none');
  };
  revisarFalla(await verFalla('sin WebGL', 'gl=doble&webgl=0', null, 'Este navegador no puede dibujar el mapa.'));
  revisarFalla(await verFalla('Mapbox lanza al construir el mapa', 'gl=doble&lanza=1', null, 'No se pudo cargar el mapa.'));
  let f = await verFalla('Mapbox rechaza la clave (error 401 antes de cargar)', 'gl=doble', null, 'Cargando');
  await evaluar(`window.__mapa.h.error({ error: { status: 401 } })`);
  f.s = await snap();
  f.textoEsperado = 'Mapbox rechazó la clave del sitio.';
  revisarFalla(f);
  f = await verFalla('el mapa no termina de cargar (tope de espera)', 'gl=doble&timer=corto', null, 'El mapa tarda demasiado en cargar.');
  revisarFalla(f);
  s = f.s;
  await pincharElemento('[data-cod-mapa-rol="cerrar"]');
  s = await snap();
  comprobar(m + 'tras una falla la X cierra igual, y el mini vuelve', cerradoOculto(s));
  await evaluar(`window.__llamadas.length = 0`);
  await pincharElemento('[data-cod-mapa-rol="mini"]');
  s = await snap();
  comprobar(m + 'y al abrir de nuevo se reintenta (el aviso vuelve a «Cargando…» si no hay respuesta)', abiertoVisible(s));
  await cargar(q('gl=doble'));
  await pincharElemento('[data-cod-mapa-rol="mini"]');
  await evaluar(`window.__mapa.h.load()`);
  await evaluar(`window.__mapa.h.error({ error: { status: 500 } })`);
  s = await snap();
  comprobar(m + 'un error DESPUÉS de cargar el mapa no lo tapa con un aviso (el mapa ya se usa)', s.aviso.oculto);

  // ---- La carga real de Mapbox: falla, y se reintenta ----
  console.log('\n-- la carga real de Mapbox: sin red, falla y se puede reintentar --');
  for (const modo of ['script-falla', 'css-falla']) {
    modoRed = modo;
    peticiones.length = 0;
    await cargar(q());
    await pincharElemento('[data-cod-mapa-rol="mini"]');
    await dormir(500);
    s = await snap();
    comprobar(m + modo + ': se dice «No se pudo cargar el mapa.» y se ofrece «Cómo llegar»', !s.aviso.oculto && s.aviso.texto.indexOf('No se pudo cargar el mapa.') === 0 && s.aviso.enlaces.length === 1 && s.aviso.enlaces[0].href === salidaOSM, JSON.stringify(s.aviso));
    comprobar(m + modo + ': no queda nada a medias en la página (se retiraron el guion y la hoja que fallaron)', s.scriptsMapbox === 0 && s.glGlobal === 'undefined', `etiquetas=${s.scriptsMapbox}`);
    const intento1 = peticiones.length;
    await pincharElemento('[data-cod-mapa-rol="cerrar"]');
    modoRed = 'ok';
    await pincharElemento('[data-cod-mapa-rol="mini"]');
    await dormir(500);
    s = await snap();
    ls = await llamadas();
    comprobar(m + modo + ': pinchar otra vez REINTENTA la descarga (y ahora llega y se dibuja)', peticiones.length > intento1 && cuenta(ls, 'Map') === 1 && abiertoVisible(s), `peticiones ${intento1} → ${peticiones.length}`);
  }

  // ---- El texto del globo es texto ----
  console.log('\n-- el texto del globo es texto: nada se interpreta como HTML --');
  modoRed = 'ok';
  await cargar(q('peligroso=1'));
  await pincharElemento('[data-cod-mapa-rol="mini"]');
  await dormir(300);
  ls = await llamadas();
  const gp = ls.find((l) => l.nombre === 'setDOMContent');
  const xss = await evaluar('window.__xss === 1');
  comprobar(m + 'un globo con <img onerror>, <b> y Markdown se muestra como texto literal', gp && gp.texto.indexOf('<img src=x onerror="window.__xss=1"> <b>negrita</b> & [www.econut.cl](https://www.econut.cl)') === 0, gp && gp.texto);
  comprobar(m + 'no se creó ningún <img> ni <script> dentro del globo y no corrió nada (window.__xss)', gp && gp.imagenes === 0 && !xss);
  comprobar(m + 'el enlace del globo sigue siendo un solo <a> de verdad', gp && gp.enlaces.length === 1 && gp.enlaces[0].href === 'https://www.econut.cl');
  // Un enlace javascript: que llegara al atributo por otra vía (el compilador ya no lo deja pasar) no se convierte en <a>.
  modoRed = 'ok';
  await cdp('Page.navigate', { url: BASE + '/pagina.html?' + q('gl=doble') });
  await dormir(700);
  await evaluar(`document.querySelector('${R}').setAttribute('data-cod-mapa-globo-enlace-href', 'javascript:window.__xss=1')`);
  await pincharElemento('[data-cod-mapa-rol="mini"]');
  await dormir(200);
  ls = await llamadas();
  const gj = ls.find((l) => l.nombre === 'setDOMContent');
  comprobar(m + 'un enlace javascript: en el atributo NO se convierte en <a> (defensa del guion, además de la del compilador)', gj && gj.enlaces.length === 0, JSON.stringify(gj && gj.enlaces));

  // ---- Marcador con imagen propia ----
  await cargar(q('gl=doble'));
  await evaluar(`document.querySelector('${R}').setAttribute('data-cod-mapa-marcador', '/mini-mapa.png')`);
  await pincharElemento('[data-cod-mapa-rol="mini"]');
  ls = await llamadas();
  const mc = ls.find((l) => l.nombre === 'Marker');
  comprobar(m + 'con imagen de marcador: se usa como elemento, de 50px de ancho, con el pie en el punto', mc && mc.conElemento && mc.src === '/mini-mapa.png' && mc.ancho === '50px' && mc.anchor === 'bottom', JSON.stringify(mc));

  // ---- Sin clave ----
  console.log('\n-- sin clave: el mini se ve, no se ofrece abrir lo que no se puede abrir --');
  peticiones.length = 0;
  await cargar(q('clave=sin'));
  s = await snap();
  comprobar(m + 'el servidor quitó el behavior y dejó data-cod-mapa-sin-clave; el guion no monta nada', s.behavior === null && s.sinClave === '1' && !s.clase && s.listo === null && s.estado === null);
  comprobar(m + 'el mini SIGUE siendo un enlace a «cómo llegar» (OpenStreetMap), no un botón', s.mini.tag === 'a' && s.mini.href === salidaOSM.replace(/&/g, '&'), JSON.stringify(s.mini));
  comprobar(m + 'el mini se ve igual: la imagen del sitio, 60x60, entera', s.img.completa && s.img.natural === 120 && s.img.caja.w === 60 && s.img.caja.h === 60);
  comprobar(m + 'la dirección escrita sigue a la vista', s.direccion.caja.w > 0);
  comprobar(m + 'no hay mapa grande ni se pidió nada a Mapbox', s.grande === null && peticiones.length === 0 && s.scriptsMapbox === 0);

  // ---- Sin JavaScript ----
  console.log('\n-- sin JavaScript: el mini es un enlace con su imagen --');
  await cdp('Emulation.setScriptExecutionDisabled', { value: true });
  let sinJs = null;
  try {
    await cdp('Page.navigate', { url: BASE + '/pagina.html?' + q() });
    await dormir(900);
    sinJs = await snap().catch(() => null);
    if (!sinJs) {
      // evaluar corre JavaScript; con él apagado se lee por el protocolo del DOM.
      sinJs = null;
    }
  } finally {
    await cdp('Emulation.setScriptExecutionDisabled', { value: false });
  }
  await cdp('Page.navigate', { url: BASE + '/pagina.html?' + q('sinscript=1') });
  await dormir(700);
  s = await snap();
  comprobar(m + 'sin guion el mini es un <a> con su imagen, visible, 60x60, y la dirección está a la vista', s.mini.tag === 'a' && s.mini.href === salidaOSM && s.img.completa && s.mini.caja.w > 0 && s.direccion.caja.w > 0, JSON.stringify(s.mini));
  comprobar(m + 'sin guion el mapa grande no existe y nada queda oculto', s.grande === null && !s.clase && s.errores.length === 0);

  // ---- Estilos de la marca sobre las partes ----
  console.log('\n-- las reglas de diseño sobre las partes (radio y colores de la marca) --');
  await cargar(q('pintado=1'));
  s = await snap();
  comprobar(m + 'el radio que el diseño le pone al mini lo recibe la imagen (hereda): 8px', s.mini.radio === '8px' && s.img.radio === '8px', `${s.mini.radio} / ${s.img.radio}`);
  await pincharElemento('[data-cod-mapa-rol="mini"]');
  s = await snap();
  comprobar(m + 'la regla sobre la parte grande (radio y fondo) le gana a lo por omisión', s.grande.radio === '8px', s.grande.radio);
  comprobar(m + 'la regla sobre la parte cerrar pinta la X (el SVG toma currentColor)', s.x.color === 'rgb(122, 46, 29)', s.x.color);
  await foto(motor + '-3-pintado');
}

await pruebasDelMotor('publico');
await pruebasDelMotor('editor');

console.log('\n== DENTRO DEL EDITOR (editorPreview): no se monta, el grupo queda apilado y editable ==');
modoRed = 'ok';
peticiones.length = 0;
await cargar('motor=editor&editorpreview=1');
let s = await snap();
comprobar('en el editor no se monta (sin estado ni partes fabricadas)', s.hay && s.listo === null && s.estado === null && s.grande === null && !s.clase);
comprobar('en el editor el mini sigue siendo el enlace con su imagen, y la dirección está a la vista', s.mini.tag === 'a' && s.img.completa && s.direccion.caja.w > 0);
comprobar('en el editor no se pidió nada a Mapbox', peticiones.length === 0 && s.scriptsMapbox === 0);

console.log('\n== DESTRUIR (el motor del editor devuelve la función que lo deshace todo) ==');
await cargar('motor=editor&gl=doble');
await pincharElemento('[data-cod-mapa-rol="mini"]');
await evaluar(`window.__destruir()`);
s = await snap();
const restos = await evaluar(`(() => { const r = document.querySelector('${R}'); return { hijos: [...r.children].map((c) => c.getAttribute('data-cod-node') || c.tagName.toLowerCase()), clase: r.classList.contains('cod-mapa'), estado: r.getAttribute('data-cod-mapa-estado'), listo: r.getAttribute('data-cod-mapa-listo'), botones: r.querySelectorAll('button').length, grandes: r.querySelectorAll('[data-cod-mapa-rol="grande"]').length, enlace: r.querySelector('a[data-cod-mapa-rol="mini"] img') ? 1 : 0 }; })()`);
const ls = await llamadas();
comprobar('destruir devuelve el enlace del compilador con su imagen, en su lugar (antes de la dirección)', JSON.stringify(restos.hijos) === JSON.stringify(['a', 'direccion']) && restos.enlace === 1, JSON.stringify(restos.hijos));
comprobar('destruir deja sin clase, sin atributos de estado, sin botones ni mapa grande', !restos.clase && restos.estado === null && restos.listo === null && restos.botones === 0 && restos.grandes === 0, JSON.stringify(restos));
comprobar('y destruir con el mapa abierto destruye también el mapa de Mapbox', cuenta(ls, 'remove') === 1);

console.log('\n== el guion que genera la imagen del mini ==');
const base = { lng: -70.68161681668681, lat: -33.80413624737442 };
comprobar('la dirección de la API estática: estilo claro, [lng,lat,zoom 2], 60x60 al doble (@2x) y la clave tapada si no se da',
  construirUrl(base, null) === 'https://api.mapbox.com/styles/v1/mapbox/light-v10/static/-70.68161681668681,-33.80413624737442,2/60x60@2x?access_token=pk.TAPADA', construirUrl(base, null));
comprobar('con clave la lleva codificada', construirUrl(base, 'pk.a b').endsWith('access_token=pk.a%20b'));
comprobar('un estilo propio «usuario/estilo» se respeta; --escala 1 quita @2x', construirUrl({ ...base, estilo: 'cris/ckxyz', escala: 1, ancho: 80, alto: 40, zoom: 3.5 }, null) === 'https://api.mapbox.com/styles/v1/cris/ckxyz/static/-70.68161681668681,-33.80413624737442,3.5/80x40?access_token=pk.TAPADA');
for (const [caso, entrada, campo] of [
  ['lat 91', { ...base, lat: 91 }, '--lat'], ['lng -181', { ...base, lng: -181 }, '--lng'], ['zoom 23', { ...base, zoom: 23 }, '--zoom'],
  ['ancho 1281', { ...base, ancho: 1281 }, '--ancho'], ['alto 0', { ...base, alto: 0 }, '--alto'], ['ancho decimal', { ...base, ancho: 60.5 }, '--ancho'],
  ['escala 3', { ...base, escala: 3 }, '--escala'], ['estilo con espacios', { ...base, estilo: 'a b' }, '--estilo'], ['sin lat', { lng: 1 }, '--lat'], ['lng texto', { ...base, lng: 'oeste' }, '--lng'],
]) {
  let mensaje = '';
  try { validar(entrada); } catch (e) { mensaje = e.message; }
  comprobar('el guion rechaza ' + caso + ' nombrando ' + campo, mensaje.includes(campo), mensaje);
}
const sinClave = spawnSync(process.execPath, [path.join(aqui, 'generar-mini-mapa.mjs'), '--lng', '1', '--lat', '1', '--salida', path.join(destino || aqui, 'no-debe-existir.png')], { encoding: 'utf8', env: { ...process.env, MAPBOX_TOKEN: '' } });
comprobar('sin MAPBOX_TOKEN el guion no pide nada y lo dice (y no deja archivo)', sinClave.status === 1 && /MAPBOX_TOKEN/.test(sinClave.stderr));
const secreta = spawnSync(process.execPath, [path.join(aqui, 'generar-mini-mapa.mjs'), '--lng', '1', '--lat', '1', '--salida', path.join(destino || aqui, 'no-debe-existir.png')], { encoding: 'utf8', env: { ...process.env, MAPBOX_TOKEN: 'sk.secreta' } });
comprobar('una clave secreta (sk.) en MAPBOX_TOKEN se rechaza antes de pedir nada', secreta.status === 1 && /pública|pk\./.test(secreta.stderr));

// ---------------------------------------------------------------------------
await cerrar();
servidor.close();
console.log('\n' + (fallas === 0 ? 'TODO OK' : fallas + ' FALLA(S)') + ' — ' + (total - fallas) + ' de ' + total + ' comprobaciones');
process.exit(fallas === 0 ? 0 : 1);
