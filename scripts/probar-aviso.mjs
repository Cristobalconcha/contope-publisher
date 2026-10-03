/**
 * Prueba en un navegador real el behavior «aviso» (0.3.46): que aparece, que se
 * cierra con la X, con Escape y con el velo, que NO vuelve a aparecer al
 * recargar, que el foco entra, queda atrapado y vuelve, y que con el
 * almacenamiento bloqueado sigue funcionando. Existe porque un behavior no se
 * comprueba leyendo el CSS emitido: hay que usarlo y mirar qué quedó a la vista.
 *
 * Qué hace:
 *   1. Compila una página con el compilador real (scripts/piezas/aviso-pagina.php,
 *      contra el WordPress local de Econut; no compone ni toca ninguna página).
 *   2. La sirve desde un servidor local con los DOS motores, que son copias
 *      separadas: cod-canvas-public.js (página publicada) y cod-behaviors.js
 *      (editor). El mismo conjunto de pruebas corre contra cada uno.
 *   3. Maneja Chrome por su protocolo con teclas y ratón de verdad (no
 *      element.click()), salvo donde se prueba a propósito el clic sintético.
 *
 * Uso: node scripts/probar-aviso.mjs [carpeta-de-capturas]
 *
 * Variables:
 *   PHP   ruta de php.exe (por omisión el de ../wp-local, que es el que corre el servidor de Econut)
 */
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, dormir } from './piezas/chrome.mjs';

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
  const r = spawnSync(php, ['-c', ini, path.join(aqui, 'piezas', 'aviso-pagina.php'), ...argumentos], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error('No pude compilar la página de prueba:\n' + (r.stderr || r.stdout));
    process.exit(2);
  }
  return JSON.parse(r.stdout);
}
const fixtureBase = compilarPagina();
const fixturePintado = compilarPagina('pintado');

const JS_PUBLICO = readFileSync(path.join(repo, 'contope-publisher/assets/js/cod-canvas-public.js'));
const JS_EDITOR = readFileSync(path.join(repo, 'contope-publisher/assets/js/cod-behaviors.js'));

function paginaHtml(consulta) {
  const motor = consulta.get('motor') || 'publico'; // publico | editor
  const sinScript = consulta.get('sinscript') === '1';
  const vistaPreviaDelEditor = consulta.get('editorpreview') === '1';
  const dias = consulta.get('dias');
  const fixture = consulta.get('pintado') === '1' ? fixturePintado : fixtureBase;
  const extra = [];
  if (dias) extra.push(`.cod-node-id-aviso-estafas{--cod-aviso-vuelve-dias:${dias};}`);
  const script = sinScript
    ? ''
    : motor === 'editor'
      ? `<script src="/cod-behaviors.js"></script><script>window.__destruir = OcdBehaviors.createRuntime({ window: window, document: document }, { editorPreview: ${vistaPreviaDelEditor} });</script>`
      : '<script src="/cod-canvas-public.js"></script>';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prueba del aviso</title>
<style>
:root{--cod-motion-enter:300ms ease-out;}
body{margin:0;font:16px/1.5 sans-serif;}
.relleno{height:1600px;background-color:#eef;}
${fixture.styles}
${fixture.avisoCss}
${extra.join('\n')}
</style>
<script>
window.__errores = [];
window.addEventListener('error', function (e) { window.__errores.push(String(e.message)); });
(function () { var viejo = console.error; console.error = function () { window.__errores.push([].join.call(arguments, ' ')); viejo.apply(console, arguments); }; })();
${consulta.get('bloqueo') === 'lectura' ? `Object.defineProperty(window, 'localStorage', { get: function () { throw new DOMException('bloqueado', 'SecurityError'); } }); Object.defineProperty(window, 'sessionStorage', { get: function () { throw new DOMException('bloqueado', 'SecurityError'); } });` : ''}
${consulta.get('bloqueo') === 'escritura' ? `Storage.prototype.setItem = function () { throw new DOMException('lleno', 'QuotaExceededError'); };` : ''}
</script>
</head><body><div class="relleno"></div><div class="cod-canvas-published">${fixture.markup}</div>${script}</body></html>`;
}

const servidor = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/cod-canvas-public.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(JS_PUBLICO); return; }
  if (u.pathname === '/cod-behaviors.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(JS_EDITOR); return; }
  if (u.pathname === '/vacio.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vacío</title>'); return; }
  if (u.pathname === '/pagina.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(paginaHtml(u.searchParams)); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + servidor.address().port;

// ---------------------------------------------------------------------------
// 2) Chrome y los gestos.
// ---------------------------------------------------------------------------
const { cdp, evaluar, cerrar } = await abrirChrome({ ancho: 1000, alto: 700, escala: 1, movil: false });
await cdp('Page.enable');
await cdp('Runtime.enable');

let fallas = 0;
let total = 0;
const comprobar = (caso, ok, detalle = '') => {
  total += 1;
  console.log((ok ? '  ok     ' : '  FALLA  ') + caso + (detalle ? '   ' + detalle : ''));
  if (!ok) fallas += 1;
};

async function cargar(consulta = '', hash = '') {
  await cdp('Page.navigate', { url: BASE + '/pagina.html' + (consulta ? '?' + consulta : '') + hash });
  await dormir(700);
  await evaluar(`new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r)))`);
  await dormir(450); // que termine la animación de entrada
}
async function recargar() {
  await cdp('Page.reload');
  await dormir(700);
  await evaluar(`new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r)))`);
  await dormir(450);
}
async function almacenamientoLimpio() {
  await cdp('Page.navigate', { url: BASE + '/vacio.html' });
  await dormir(300);
  await evaluar(`(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} return 1; })()`);
}
async function limpioYCargar(consulta = '', hash = '') {
  await almacenamientoLimpio();
  await cargar(consulta, hash);
}

const TECLAS = { Tab: 9, Escape: 27 };
async function tecla(nombre, { mayus = false } = {}) {
  const modifiers = mayus ? 8 : 0;
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: nombre, code: nombre, windowsVirtualKeyCode: TECLAS[nombre], modifiers });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: nombre, code: nombre, windowsVirtualKeyCode: TECLAS[nombre], modifiers });
  await dormir(80);
}
async function ratonEn(x, y, { soltarEn } = {}) {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  const fin = soltarEn || { x, y };
  if (soltarEn) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fin.x, y: fin.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fin.x, y: fin.y, button: 'left', clickCount: 1 });
  await dormir(150);
}
const centroDe = (selector) => evaluar(`(() => {
  const e = document.querySelector(${JSON.stringify(selector)});
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
async function pincharElemento(selector, { traerALaVista = false } = {}) {
  if (traerALaVista) await evaluar(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`);
  const p = await centroDe(selector);
  await ratonEn(p.x, p.y);
}

const R = '[data-cod-behavior="aviso"]';
const snap = () => evaluar(`(() => {
  const r = document.querySelector('${R}');
  if (!r) return { hay: false };
  const p = r.querySelector('[data-cod-aviso-rol="panel"]');
  const v = r.querySelector('[data-cod-aviso-rol="velo"]');
  const x = r.querySelector('[data-cod-aviso-rol="cerrar"]');
  const caja = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  const quien = (e) => {
    if (!e) return null;
    if (e === document.body) return 'body';
    if (e.getAttribute && e.getAttribute('data-cod-aviso-rol')) return 'aviso:' + e.getAttribute('data-cod-aviso-rol');
    return (e.getAttribute && (e.getAttribute('data-cod-node') || e.id)) || e.tagName;
  };
  const cs = getComputedStyle(r);
  const rotulo = p && p.getAttribute('aria-labelledby') ? document.getElementById(p.getAttribute('aria-labelledby')) : null;
  return {
    hay: true,
    listo: r.getAttribute('data-cod-aviso-listo'),
    estado: r.getAttribute('data-cod-aviso-estado'),
    display: cs.display, position: cs.position,
    caja: caja(r),
    panel: p && {
      rol: p.getAttribute('role'), modal: p.getAttribute('aria-modal'), tabindex: p.getAttribute('tabindex'),
      labelledby: p.getAttribute('aria-labelledby'), label: p.getAttribute('aria-label'),
      nombre: rotulo ? rotulo.textContent : null, caja: caja(p), animacion: getComputedStyle(p).animationName,
      maxWidth: getComputedStyle(p).maxWidth, fondo: getComputedStyle(p).backgroundColor, overflowY: getComputedStyle(p).overflowY,
      hijos: [...p.children].map((c) => quien(c)),
    },
    velo: v && { aria: v.getAttribute('aria-hidden'), caja: caja(v), fondo: getComputedStyle(v).backgroundColor },
    x: x && { tag: x.tagName, type: x.getAttribute('type'), label: x.getAttribute('aria-label'), caja: caja(x), color: getComputedStyle(x).color, tieneSvg: !!x.querySelector('svg'), posicion: getComputedStyle(x).position },
    activo: quien(document.activeElement),
    dentro: p ? p.contains(document.activeElement) : false,
    scrollY: Math.round(scrollY), bodyOverflow: getComputedStyle(document.body).overflow, htmlOverflow: getComputedStyle(document.documentElement).overflow,
    errores: window.__errores,
    vp: { w: innerWidth, h: innerHeight },
  };
})()`);
const estaAbierto = (s) => s.hay && s.estado === 'abierto' && s.display !== 'none';
const estaCerrado = (s) => s.hay && s.estado === 'cerrado' && s.display === 'none';
const reglas = (m) => (m ? 'motor ' + m + ': ' : '');

const foto = async (nombre) => {
  if (!destino) return;
  const png = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(destino, nombre + '.png'), Buffer.from(png.data, 'base64'));
};

// ---------------------------------------------------------------------------
// 3) El mismo conjunto, contra cada motor.
// ---------------------------------------------------------------------------
async function pruebasDelMotor(motor) {
  const q = (extra = '') => 'motor=' + motor + (extra ? '&' + extra : '');
  const m = reglas(motor);
  console.log('\n== ' + (motor === 'publico' ? 'MOTOR DE LA PÁGINA PUBLICADA (cod-canvas-public.js)' : 'MOTOR DEL EDITOR (cod-behaviors.js)') + ' ==');

  // ---- La marca la pone el sitio, sobre las partes ----
  console.log('\n-- los colores de la marca sobre las partes (reglas compiladas) --');
  await limpioYCargar(q('pintado=1'));
  const t0 = await snap();
  comprobar(m + 'una regla de superficie sobre la parte panel le gana al valor por omisión', t0.panel.fondo === 'rgb(250, 245, 235)', t0.panel.fondo);
  comprobar(m + 'la regla sobre la parte velo le gana al valor por omisión', t0.velo.fondo === 'rgb(10, 20, 30)', t0.velo.fondo);
  comprobar(m + 'la regla sobre la parte cerrar pinta la X (el SVG toma currentColor)', t0.x.color === 'rgb(122, 46, 29)', t0.x.color);

  // ---- Primera visita ----
  console.log('\n-- primera visita --');
  await limpioYCargar(q());
  let s = await snap();
  comprobar(m + 'aparece solo al cargar (estado abierto, capa visible)', estaAbierto(s), `estado=${s.estado} display=${s.display}`);
  comprobar(m + 'la raíz es una capa fija a pantalla completa', s.position === 'fixed' && s.caja.w === s.vp.w && s.caja.h === s.vp.h, JSON.stringify(s.caja));
  comprobar(m + 'el panel es role="dialog" aria-modal="true"', s.panel.rol === 'dialog' && s.panel.modal === 'true');
  comprobar(m + 'el panel tiene nombre: el título del aviso', s.panel.nombre === 'Cuidado: están vendiendo a nuestro nombre' && s.panel.labelledby !== null, 'aria-labelledby → «' + s.panel.nombre + '»');
  comprobar(m + 'el velo está aria-hidden y cubre la ventana', s.velo.aria === 'true' && s.velo.caja.w === s.vp.w && s.velo.caja.h === s.vp.h);
  comprobar(m + 'el velo separa el aviso de la página (está pintado)', s.velo.fondo !== 'rgba(0, 0, 0, 0)' && s.velo.fondo !== 'transparent', s.velo.fondo);
  comprobar(m + 'el panel usa los colores del sistema (no inventa uno de marca)', s.panel.fondo === 'rgb(255, 255, 255)', s.panel.fondo);
  comprobar(m + 'la X es un button type=button con nombre accesible y SVG', s.x.tag === 'BUTTON' && s.x.type === 'button' && s.x.label === 'Cerrar aviso' && s.x.tieneSvg);
  comprobar(m + 'la X mide al menos 44x44', s.x.caja.w >= 44 && s.x.caja.h >= 44, `${s.x.caja.w}x${s.x.caja.h}`);
  comprobar(m + 'los hijos del grupo pasaron al panel (X primero, luego el contenido original, en orden)',
    JSON.stringify(s.panel.hijos) === JSON.stringify(['aviso:cerrar', 'aviso-titulo', 'aviso-texto', 'aviso-ig', 'aviso-fb']), JSON.stringify(s.panel.hijos));
  comprobar(m + 'el ancho máximo viene de --cod-aviso-ancho-maximo (30rem = 480px)', s.panel.maxWidth === '480px' && s.panel.caja.w <= 480, `${s.panel.maxWidth} · caja ${s.panel.caja.w}`);
  comprobar(m + 'el panel está centrado en la ventana', Math.abs((s.panel.caja.x + s.panel.caja.w / 2) - s.vp.w / 2) <= 1 && s.panel.caja.y >= 0 && s.panel.caja.y + s.panel.caja.h <= s.vp.h);
  comprobar(m + 'el foco entró al panel', s.activo === 'aviso:panel', 'activo=' + s.activo);
  comprobar(m + 'sin errores en la consola', s.errores.length === 0, JSON.stringify(s.errores));
  comprobar(m + 'la animación de entrada corre con movimiento permitido (cod-aviso-aparecer)', s.panel.animacion === 'cod-aviso-aparecer', s.panel.animacion);
  await foto(motor + '-1-abierto');

  // ---- No bloquea la página ----
  console.log('\n-- no bloquea la página --');
  await evaluar(`window.scrollTo(0, 600)`);
  await dormir(100);
  s = await snap();
  comprobar(m + 'el scroll de la página sigue libre mientras está abierto', s.scrollY === 600 && s.bodyOverflow === 'visible' && s.htmlOverflow === 'visible', `scrollY=${s.scrollY} body.overflow=${s.bodyOverflow}`);
  await evaluar(`window.scrollTo(0, 0)`);

  // ---- Teclado: el foco queda atrapado ----
  console.log('\n-- foco atrapado --');
  const recorrido = [];
  for (let i = 0; i < 7; i += 1) {
    await tecla('Tab');
    const t = await snap();
    recorrido.push(t.activo);
    if (!t.dentro) break;
  }
  comprobar(m + 'Tab recorre X → enlaces del aviso y da la vuelta, sin salirse a la página', recorrido.length === 7 && recorrido.slice(0, 3).join() === 'aviso:cerrar,aviso-ig,aviso-fb' && recorrido[3] === 'aviso:cerrar', recorrido.join(' → '));
  await tecla('Tab', { mayus: true });
  s = await snap();
  comprobar(m + 'Mayús+Tab desde la X va al último enlace (da la vuelta hacia atrás)', s.activo === 'aviso-fb' && s.dentro, 'activo=' + s.activo);
  await evaluar(`document.querySelector('[data-cod-node="boton-pagina"]').focus()`);
  await dormir(80);
  s = await snap();
  comprobar(m + 'si algo intenta llevar el foco a la página de atrás, vuelve al aviso', s.dentro, 'activo=' + s.activo);

  // ---- Cerrar con Escape ----
  console.log('\n-- cerrar con Escape --');
  await tecla('Escape');
  s = await snap();
  comprobar(m + 'Escape cierra (estado cerrado, display none)', estaCerrado(s), `estado=${s.estado} display=${s.display}`);
  comprobar(m + 'al cerrar, el foco no queda dentro de lo oculto', !s.dentro);

  // ---- No vuelve ----
  console.log('\n-- no vuelve --');
  await recargar();
  s = await snap();
  comprobar(m + 'al recargar NO reaparece (una vez por visitante)', estaCerrado(s), `estado=${s.estado} display=${s.display}`);
  const almacenado = await evaluar(`Object.keys(localStorage).filter((k) => k.indexOf('cod-aviso:') === 0)`);
  comprobar(m + 'el navegador recordó la visita (una clave cod-aviso:<nodo> en localStorage)', almacenado.length === 1 && almacenado[0] === 'cod-aviso:aviso-estafas', JSON.stringify(almacenado));
  await cargar(q('x=2'));
  s = await snap();
  comprobar(m + 'tampoco reaparece al entrar de nuevo por otra dirección de la misma página', estaCerrado(s));
  const textoOculto = await evaluar(`(() => { const r = document.querySelector('${R}'); return r.getBoundingClientRect().width; })()`);
  comprobar(m + 'cerrado no ocupa lugar en la página', textoOculto === 0);

  // ---- Reabrir desde un enlace; el foco vuelve ----
  console.log('\n-- reabrir con un enlace y devolver el foco --');
  await pincharElemento('[data-cod-node="enlace-reabrir"]', { traerALaVista: true });
  s = await snap();
  comprobar(m + 'un enlace a #aviso-estafas lo reabre aunque ya se haya visto', estaAbierto(s), `estado=${s.estado}`);
  comprobar(m + 'al abrir por el enlace, el foco entra al panel', s.activo === 'aviso:panel', 'activo=' + s.activo);
  await pincharElemento('[data-cod-aviso-rol="cerrar"]');
  s = await snap();
  comprobar(m + 'la X (clic real) cierra', estaCerrado(s), `estado=${s.estado}`);
  comprobar(m + 'al cerrar, el foco vuelve al enlace que lo abrió', s.activo === 'enlace-reabrir', 'activo=' + s.activo);

  // ---- Velo ----
  console.log('\n-- cerrar con el velo --');
  await pincharElemento('[data-cod-node="enlace-reabrir"]');
  s = await snap();
  comprobar(m + 'se reabre otra vez', estaAbierto(s));
  await ratonEn(8, 8);
  s = await snap();
  comprobar(m + 'pinchar el velo (clic real) cierra', estaCerrado(s), `estado=${s.estado}`);
  comprobar(m + 'y el foco vuelve al enlace', s.activo === 'enlace-reabrir', 'activo=' + s.activo);

  await pincharElemento('[data-cod-node="enlace-reabrir"]');
  const caja = (await snap()).panel.caja;
  await ratonEn(caja.x + caja.w / 2, caja.y + 60);
  s = await snap();
  comprobar(m + 'pinchar DENTRO del panel no cierra', estaAbierto(s));
  await ratonEn(caja.x + caja.w / 2, caja.y + 60, { soltarEn: { x: 8, y: 8 } });
  s = await snap();
  comprobar(m + 'arrastrar desde dentro del panel y soltar en el velo (seleccionar texto) NO cierra', estaAbierto(s));
  await evaluar(`document.querySelector('[data-cod-aviso-rol="velo"]').click()`);
  s = await snap();
  comprobar(m + 'un clic sin presionar antes (teclado asistido, lector de pantalla) en el velo sí cierra', estaCerrado(s));

  // ---- X con Enter/Espacio por teclado (es un button de verdad) ----
  await pincharElemento('[data-cod-node="enlace-reabrir"]');
  await evaluar(`document.querySelector('[data-cod-aviso-rol="cerrar"]').focus()`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await dormir(120);
  s = await snap();
  comprobar(m + 'la X cierra también con Enter', estaCerrado(s), `estado=${s.estado}`);

  // ---- Cada vía de cierre, desde una primera visita ----
  console.log('\n-- cada vía de cierre desde una primera visita, y que no vuelva --');
  for (const via of ['x', 'velo']) {
    await limpioYCargar(q());
    s = await snap();
    if (!estaAbierto(s)) { comprobar(m + 'primera visita abre (' + via + ')', false); continue; }
    if (via === 'x') await pincharElemento('[data-cod-aviso-rol="cerrar"]');
    else await ratonEn(8, 8);
    s = await snap();
    comprobar(m + 'cerrar con ' + via + ' en la primera visita', estaCerrado(s));
    await recargar();
    s = await snap();
    comprobar(m + 'y tras cerrar con ' + via + ', recargar no lo trae de vuelta', estaCerrado(s));
  }

  // ---- Por la dirección ----
  console.log('\n-- por la dirección (#aviso-estafas) --');
  await cargar(q(), '#aviso-estafas');
  s = await snap();
  comprobar(m + 'entrar con #aviso-estafas lo abre aunque ya se haya visto', estaAbierto(s), `estado=${s.estado}`);
  await tecla('Escape');
  const hash = await evaluar('location.hash');
  comprobar(m + 'al cerrar se limpia el # de la dirección (recargar no lo reabre)', hash === '', 'hash=«' + hash + '»');
  await recargar();
  s = await snap();
  comprobar(m + 'y recargar después de cerrar no lo reabre', estaCerrado(s));

  // ---- Cada cuánto vuelve ----
  console.log('\n-- cada cuánto vuelve (--cod-aviso-vuelve-dias) --');
  await limpioYCargar(q('dias=1'));
  s = await snap();
  comprobar(m + 'con vuelve-dias=1, la primera visita abre', estaAbierto(s));
  await tecla('Escape');
  await recargar();
  s = await snap();
  comprobar(m + 'con vuelve-dias=1, a los pocos segundos NO vuelve', estaCerrado(s));
  await evaluar(`localStorage.setItem('cod-aviso:aviso-estafas', String(Date.now() - 12 * 3600 * 1000))`);
  await recargar();
  s = await snap();
  comprobar(m + 'con vuelve-dias=1, a las 12 horas NO vuelve', estaCerrado(s));
  await evaluar(`localStorage.setItem('cod-aviso:aviso-estafas', String(Date.now() - 36 * 3600 * 1000))`);
  await recargar();
  s = await snap();
  comprobar(m + 'con vuelve-dias=1, a las 36 horas SÍ vuelve', estaAbierto(s));
  await tecla('Escape');
  await evaluar(`localStorage.setItem('cod-aviso:aviso-estafas', String(Date.now() - 400 * 24 * 3600 * 1000))`);
  await recargar();
  s = await snap();
  comprobar(m + 'sin vuelve-dias (por omisión 0), ni a los 400 días vuelve', estaCerrado(await (async () => { await limpioYCargar(q()); await tecla('Escape'); await evaluar(`localStorage.setItem('cod-aviso:aviso-estafas', String(Date.now() - 400 * 24 * 3600 * 1000))`); await recargar(); return snap(); })()));

  // ---- Almacenamiento bloqueado ----
  console.log('\n-- almacenamiento bloqueado --');
  for (const bloqueo of ['lectura', 'escritura']) {
    const nombre = bloqueo === 'lectura' ? 'localStorage y sessionStorage lanzan SecurityError al leerlos (navegación privada, cookies rechazadas)' : 'setItem lanza QuotaExceededError (almacenamiento lleno)';
    await limpioYCargar(q('bloqueo=' + bloqueo));
    s = await snap();
    comprobar(m + nombre + ' → el aviso aparece igual', estaAbierto(s), `estado=${s.estado}`);
    comprobar(m + '   …sin errores en la consola', s.errores.length === 0, JSON.stringify(s.errores));
    comprobar(m + '   …el foco entró al panel', s.activo === 'aviso:panel');
    await tecla('Tab');
    s = await snap();
    comprobar(m + '   …el foco sigue atrapado', s.dentro);
    await pincharElemento('[data-cod-aviso-rol="cerrar"]');
    s = await snap();
    comprobar(m + '   …se cierra con la X', estaCerrado(s));
    await cargar(q('bloqueo=' + bloqueo));
    s = await snap();
    comprobar(m + '   …y en la visita siguiente vuelve (no hay dónde recordarlo), pero se puede cerrar de nuevo', estaAbierto(s));
    await tecla('Escape');
    s = await snap();
    comprobar(m + '   …y Escape lo cierra', estaCerrado(s));
  }

  // ---- Contenido largo en pantalla chica ----
  console.log('\n-- contenido más alto que la ventana --');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 500, deviceScaleFactor: 1, mobile: true });
  await limpioYCargar(q());
  await evaluar(`(() => {
    const p = document.querySelector('[data-cod-aviso-rol="panel"]');
    for (let i = 0; i < 25; i++) { const e = document.createElement('p'); e.textContent = 'Línea de relleno número ' + i + ' del aviso largo.'; p.appendChild(e); }
  })()`);
  await dormir(100);
  s = await snap();
  comprobar(m + 'en 375x500 el panel cabe en la ventana y hace scroll por dentro', estaAbierto(s) && s.panel.caja.h <= s.vp.h && s.panel.caja.w <= s.vp.w && s.panel.overflowY === 'auto', JSON.stringify(s.panel.caja));
  await evaluar(`document.querySelector('[data-cod-aviso-rol="panel"]').scrollTop = 400`);
  await dormir(100);
  s = await snap();
  comprobar(m + 'con el panel desplazado, la X sigue a la vista (sticky)', s.x.posicion === 'sticky' && s.x.caja.y >= s.panel.caja.y - 1 && s.x.caja.y < s.panel.caja.y + 60, JSON.stringify(s.x.caja) + ' vs panel ' + JSON.stringify(s.panel.caja));
  await foto(motor + '-2-largo-movil');
  await pincharElemento('[data-cod-aviso-rol="cerrar"]');
  s = await snap();
  comprobar(m + 'y la X cierra aunque el contenido esté desplazado', estaCerrado(s));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });

  // ---- Movimiento reducido ----
  console.log('\n-- movimiento reducido --');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await limpioYCargar(q());
  s = await snap();
  comprobar(m + 'con prefers-reduced-motion: reduce aparece sin animar (animation-name none)', estaAbierto(s) && s.panel.animacion === 'none', 'animación=' + s.panel.animacion);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
}

await pruebasDelMotor('publico');
await pruebasDelMotor('editor');

// ---------------------------------------------------------------------------
// 4) Lo que NO debe hacer: sin guion, y dentro del editor.
// ---------------------------------------------------------------------------
console.log('\n== SIN GUION: el contenido no puede depender del JavaScript ==');
await almacenamientoLimpio();
await cargar('sinscript=1');
let s = await snap();
const visible = await evaluar(`(() => {
  const r = document.querySelector('${R}');
  const h = r.querySelector('h2');
  const enlaces = [...r.querySelectorAll('a[href^="https://"]')];
  const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
  r.scrollIntoView({ block: 'center' });
  return { raiz: vis(r), titulo: vis(h), enlaces: enlaces.map(vis), hijosDirectos: [...r.children].map((c) => c.getAttribute('data-cod-node')), rol: !!r.querySelector('[role="dialog"]'), partes: r.querySelectorAll('[data-cod-aviso-rol]').length };
})()`);
comprobar('sin el guion: el grupo no está montado (sin clase ni estado)', s.hay && s.listo === null && s.estado === null);
comprobar('sin el guion: sigue en el flujo normal (position static, y se muestra)', s.position === 'static' && s.display !== 'none', `position=${s.position} display=${s.display}`);
comprobar('sin el guion: el título y los enlaces a las cuentas oficiales se ven', visible.raiz && visible.titulo && visible.enlaces.length === 2 && visible.enlaces.every(Boolean), JSON.stringify(visible));
comprobar('sin el guion: sus hijos siguen siendo hijos directos del grupo (nada se movió)', JSON.stringify(visible.hijosDirectos) === JSON.stringify(['aviso-titulo', 'aviso-texto', 'aviso-ig', 'aviso-fb']));
comprobar('sin el guion: no hay ningún role=dialog ni parte fabricada', !visible.rol && visible.partes === 0);
await foto('sin-guion');

console.log('\n== SIN GUION de verdad (el navegador con JavaScript desactivado) ==');
await cdp('Emulation.setScriptExecutionDisabled', { value: true });
await cdp('Page.navigate', { url: BASE + '/pagina.html?motor=publico' });
await dormir(900);
let sinJs = null;
try {
  sinJs = await evaluar(`(() => { const r = document.querySelector('${R}'); const b = r.getBoundingClientRect(); const cs = getComputedStyle(r); return { w: Math.round(b.width), h: Math.round(b.height), position: cs.position, display: cs.display, montado: r.hasAttribute('data-cod-aviso-listo') }; })()`);
} finally {
  await cdp('Emulation.setScriptExecutionDisabled', { value: false });
}
comprobar('con JavaScript desactivado el aviso queda como un bloque legible en la página', sinJs !== null && !sinJs.montado && sinJs.w > 0 && sinJs.h > 0 && sinJs.position === 'static', JSON.stringify(sinJs));

console.log('\n== DENTRO DEL EDITOR (editorPreview): no se monta, el bloque queda apilado y editable ==');
await almacenamientoLimpio();
await cargar('motor=editor&editorpreview=1');
s = await snap();
comprobar('en el editor no se monta (sin estado ni partes fabricadas)', s.hay && s.listo === null && s.estado === null && s.panel === null);
comprobar('en el editor el grupo sigue en el flujo y con su contenido a la vista', s.position === 'static' && s.display !== 'none' && s.caja.w > 0 && s.caja.h > 0, `position=${s.position} ${JSON.stringify(s.caja)}`);
const almacenEditor = await evaluar(`Object.keys(localStorage).filter((k) => k.indexOf('cod-aviso:') === 0).length`);
comprobar('en el editor no se anota ninguna visita (editar no gasta el «una vez»)', almacenEditor === 0);

console.log('\n== DESTRUIR (el motor del editor devuelve la función que lo deshace todo) ==');
await almacenamientoLimpio();
await cargar('motor=editor');
const antes = await evaluar(`window.__antes = 1, document.querySelector('${R}') ? 1 : 0`);
await evaluar(`window.__destruir()`);
s = await snap();
const restos = await evaluar(`(() => { const r = document.querySelector('${R}'); return { hijos: [...r.children].map((c) => c.getAttribute('data-cod-node')), clase: r.className.indexOf('cod-aviso') >= 0, estado: r.getAttribute('data-cod-aviso-estado'), listo: r.getAttribute('data-cod-aviso-listo'), partes: document.querySelectorAll('[data-cod-aviso-rol]').length, idTitulo: document.querySelector('[data-cod-node="aviso-titulo"]').getAttribute('id') }; })()`);
comprobar('destruir devuelve los hijos al grupo en su orden', JSON.stringify(restos.hijos) === JSON.stringify(['aviso-titulo', 'aviso-texto', 'aviso-ig', 'aviso-fb']), JSON.stringify(restos.hijos));
comprobar('destruir deja sin clase, sin atributos de estado, sin velo/panel/X y sin el id que se le puso al título', !restos.clase && restos.estado === null && restos.listo === null && restos.partes === 0 && restos.idTitulo === null, JSON.stringify(restos));
comprobar('y el contenido vuelve a estar a la vista, en el flujo', s.position === 'static' && s.display !== 'none' && s.caja.h > 0);

// ---------------------------------------------------------------------------
await cerrar();
servidor.close();
console.log('\n' + (fallas === 0 ? 'TODO OK' : fallas + ' FALLA(S)') + ' — ' + (total - fallas) + ' de ' + total + ' comprobaciones');
process.exit(fallas === 0 ? 0 : 1);
