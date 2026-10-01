/**
 * Prueba en un navegador real el behavior «pestanas» (0.3.35): pincha cada
 * pestaña, mueve con el teclado, mide el alto durante el cambio y retrata cada
 * estado. Existe porque un behavior no se comprueba leyendo el HTML: hay que
 * usarlo y mirar qué quedó a la vista.
 *
 * Uso: node scripts/probar-pestanas.mjs <url> <carpeta-de-salida>
 *
 * Variables:
 *   ANCHO=1280        ancho de la ventana (por ejemplo 375 para móvil)
 *   SIN_ESTILO=1      no inyecta la hoja de ejemplo (por omisión se inyecta una
 *                     que hace lo que haría una composición: pinta la activa y
 *                     la inactiva sobre los atributos data-cod-pestanas-*)
 *   MOVIMIENTO=reduce emula prefers-reduced-motion: reduce
 *   ORIGINAL=1        en vez de probar el behavior nuevo, prueba el módulo de
 *                     pestañas de Divi que ya está en la página (para comparar)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, dormir } from './piezas/chrome.mjs';

const [url, destino] = process.argv.slice(2);
if (!url || !destino) {
  console.error('faltan argumentos: <url> <carpeta-de-salida>');
  process.exit(1);
}
mkdirSync(destino, { recursive: true });

const ANCHO = Number(process.env.ANCHO || 1280);
const ORIGINAL = process.env.ORIGINAL === '1';
const { cdp, evaluar, cerrar } = await abrirChrome({ ancho: ANCHO, alto: 900, escala: 1, movil: false });

let fallas = 0;
const comprobar = (caso, ok, detalle = '') => {
  console.log((ok ? '  ok     ' : '  FALLA  ') + caso + (detalle ? '   ' + detalle : ''));
  if (!ok) fallas += 1;
};

await cdp('Page.enable');
if (process.env.MOVIMIENTO === 'reduce') {
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
}
await cdp('Page.navigate', { url });
await dormir(1500);
await esperarLaPagina(evaluar);
await dormir(800);

const RAIZ = ORIGINAL ? '.et_pb_tabs' : '[data-cod-behavior="pestanas"]';

// Una hoja como la que pondría una composición (los colores son los de Divi en econut.cl).
const HOJA = `
[data-cod-pestanas-rol="lista"]{background-color:#fff;}
[data-cod-pestanas-rol="etiqueta"]{background-color:#fff;color:rgb(224,153,0);}
[data-cod-pestanas-rol="etiqueta"] > *{font-size:2.5rem;line-height:1.2;font-weight:700;}
[data-cod-pestanas-rol="etiqueta"][data-cod-pestanas-estado="activa"]{background-color:rgb(247,241,230);color:rgb(77,122,118);}
`;
if (!ORIGINAL && process.env.SIN_ESTILO !== '1') {
  await evaluar(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(HOJA)}; document.head.appendChild(s); })()`);
}

// Sacar del camino lo que tapa la lectura (banner de cookies, botón flotante).
await evaluar(`(() => { document.querySelectorAll('[class*="cookie"], [id*="cookie"]').forEach((e) => { e.style.display = 'none'; }); })()`);

async function retratar(nombre) {
  const c = await evaluar(`(() => {
    const e = document.querySelector(${JSON.stringify(RAIZ)});
    const r = e.getBoundingClientRect();
    return { x: Math.max(0, Math.floor(r.left + scrollX) - 10), y: Math.max(0, Math.floor(r.top + scrollY) - 10), w: Math.ceil(r.width) + 20, h: Math.ceil(r.height) + 20 };
  })()`);
  const png = await cdp('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 },
  });
  writeFileSync(path.join(destino, nombre + '.png'), Buffer.from(png.data, 'base64'));
  console.log('           captura ' + nombre + '.png  ' + c.w + 'x' + c.h);
}

// Clic real, con el ratón, en el centro del elemento.
async function pinchar(selector) {
  const p = await evaluar(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
}

const TECLAS = {
  ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35,
};
async function teclear(tecla) {
  const vk = TECLAS[tecla];
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: tecla, code: tecla, windowsVirtualKeyCode: vk });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: tecla, code: tecla, windowsVirtualKeyCode: vk });
}

if (ORIGINAL) {
  // ---- Divi: cuántas pestañas, cuál se ve, cuánto tarda y cómo cambia el alto ----
  const n = await evaluar(`document.querySelectorAll('.et_pb_tabs_controls li').length`);
  console.log('Divi: ' + n + ' pestañas');
  for (let i = 0; i < n; i += 1) {
    await evaluar(`window.__mues = []; (() => { const r = document.querySelector('.et_pb_tabs'); const t0 = performance.now(); (function f() { window.__mues.push([Math.round(performance.now() - t0), Math.round(r.getBoundingClientRect().height)]); if (performance.now() - t0 < 2500) requestAnimationFrame(f); })(); })()`);
    await pinchar(`.et_pb_tabs_controls li:nth-child(${i + 1})`);
    await dormir(2600);
    const m = await evaluar('window.__mues');
    const cambios = m.filter((x, k) => k === 0 || x[1] !== m[k - 1][1]);
    console.log('  pestaña ' + (i + 1) + ': alto durante el cambio (ms, px): ' + JSON.stringify(cambios));
    await retratar('divi-' + (i + 1));
  }
  await cerrar();
  process.exit(0);
}

// ---- Pestañas de ContOpe ----
const estado = () => evaluar(`(() => {
  const r = document.querySelector('[data-cod-behavior="pestanas"]');
  if (!r) return { hay: false };
  const et = [...r.querySelectorAll('[data-cod-pestanas-rol="etiqueta"]')];
  const pa = [...r.querySelectorAll('[data-cod-pestanas-rol="panel"]')];
  const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  return {
    hay: true, listo: r.getAttribute('data-cod-pestanas-listo'), activa: r.getAttribute('data-cod-pestanas-activa'),
    etiquetas: et.map((e) => ({ estado: e.getAttribute('data-cod-pestanas-estado'), sel: e.getAttribute('aria-selected'), tab: e.tabIndex, rol: e.getAttribute('role'), tag: e.tagName })),
    paneles: pa.map((e) => ({ visible: e.getAttribute('data-cod-pestanas-visible'), pintado: vis(e), rol: e.getAttribute('role'), lb: e.getAttribute('aria-labelledby'), id: e.id })),
    foco: document.activeElement ? document.activeElement.getAttribute('data-cod-pestanas-item') : null,
    alto: Math.round(r.getBoundingClientRect().height),
    colores: et.map((e) => getComputedStyle(e).color),
    animando: r.hasAttribute('data-cod-pestanas-animando'), estiloAlto: r.style.height,
    lista: { tag: r.firstElementChild.tagName, rol: r.firstElementChild.getAttribute('role') },
  };
})()`);

const e0 = await estado();
if (!e0.hay) throw new Error('el runtime no montó: no hay nodo con data-cod-behavior="pestanas"');
const N = e0.etiquetas.length;
console.log('montado: listo=' + e0.listo + ' activa=' + e0.activa + ' · ' + N + ' pestañas · lista=' + e0.lista.tag + '[role=' + e0.lista.rol + ']');
comprobar('al cargar queda activa la primera', e0.activa === '1' && e0.etiquetas[0].estado === 'activa');
comprobar('las etiquetas son button con role=tab', e0.etiquetas.every((e) => e.tag === 'BUTTON' && e.rol === 'tab'));
comprobar('los paneles tienen role=tabpanel y aria-labelledby', e0.paneles.every((p) => p.rol === 'tabpanel' && p.lb));
comprobar('sólo el panel 1 se ve', e0.paneles.map((p) => p.pintado).join() === [true, ...Array(N - 1).fill(false)].join());
comprobar('roving tabindex: sólo la activa tiene 0', e0.etiquetas.map((e) => e.tab).join() === [0, ...Array(N - 1).fill(-1)].join());
await retratar('pestana-1-reposo');

// Cada pestaña, pinchada de verdad. Con movimiento reducido no hay que esperar; con movimiento sí.
for (let i = 2; i <= N + 0; i += 1) {
  await evaluar(`window.__mues = []; (() => { const r = document.querySelector('[data-cod-behavior="pestanas"]'); const t0 = performance.now(); (function f() { window.__mues.push([Math.round(performance.now() - t0), Math.round(r.getBoundingClientRect().height)]); if (performance.now() - t0 < 900) requestAnimationFrame(f); })(); })()`);
  await pinchar(`[data-cod-pestanas-rol="etiqueta"][data-cod-pestanas-item="${i}"]`);
  await dormir(1000);
  const e = await estado();
  const m = await evaluar('window.__mues');
  const cambios = m.filter((x, k) => k === 0 || x[1] !== m[k - 1][1]);
  comprobar('pestaña ' + i + ': activa=' + i + ' y sólo su panel se ve',
    e.activa === String(i) && e.paneles.every((p, k) => p.pintado === (k + 1 === i) && p.visible === String(k + 1 === i)),
    'paneles pintados: ' + e.paneles.map((p) => (p.pintado ? '1' : '0')).join(''));
  comprobar('pestaña ' + i + ': aria-selected y estado de las etiquetas',
    e.etiquetas.every((t, k) => t.sel === String(k + 1 === i) && t.estado === (k + 1 === i ? 'activa' : 'inactiva')));
  comprobar('pestaña ' + i + ': el alto quedó liberado (sin height en línea, sin animando)', !e.animando && e.estiloAlto === '');
  console.log('           alto durante el cambio (ms, px): ' + JSON.stringify(cambios.slice(0, 14)) + (cambios.length > 14 ? ' …' : ''));
  console.log('           colores de las etiquetas: ' + e.colores.join(' | '));
  await retratar('pestana-' + i);
}

// Teclado: se parte del foco en la etiqueta activa (la última pinchada).
await pinchar('[data-cod-pestanas-rol="etiqueta"][data-cod-pestanas-item="1"]');
await dormir(600);
await teclear('ArrowRight'); await dormir(500);
let e = await estado();
comprobar('flecha derecha: pasa a la 2 y el foco la acompaña', e.activa === '2' && e.foco === '2');
await teclear('End'); await dormir(500);
e = await estado();
comprobar('Fin: va a la última', e.activa === String(N) && e.foco === String(N));
await teclear('ArrowRight'); await dormir(500);
e = await estado();
comprobar('flecha derecha en la última: vuelve a la primera', e.activa === '1' && e.foco === '1');
await teclear('ArrowLeft'); await dormir(500);
e = await estado();
comprobar('flecha izquierda en la primera: va a la última', e.activa === String(N) && e.foco === String(N));
await teclear('Home'); await dormir(500);
e = await estado();
comprobar('Inicio: va a la primera', e.activa === '1' && e.foco === '1');
comprobar('tras el teclado sigue habiendo un solo panel a la vista', e.paneles.filter((p) => p.pintado).length === 1);

// Estructura final del grupo.
const deshacer = await evaluar(`(() => {
  const r = document.querySelector('[data-cod-behavior="pestanas"]');
  return { botones: r.querySelectorAll('button').length, listas: r.querySelectorAll('[data-cod-pestanas-rol="lista"]').length };
})()`);
comprobar('hay exactamente ' + N + ' botones y 1 lista dentro del grupo', deshacer.botones === N && deshacer.listas === 1);

// Segundo motor (cod-behaviors.js, el del editor): se carga sobre un grupo de
// ejemplo aparte. Se comprueba que en la vista previa del editor NO monta (el
// bloque queda apilado y editable), que fuera de ella sí, y que la función que
// devuelve deja el DOM como estaba.
const motor = await evaluar(`(async () => {
  const codigo = await fetch(location.origin + '/wp-content/plugins/contope-publisher/assets/js/cod-behaviors.js').then((r) => r.text());
  const s = document.createElement('script'); s.textContent = codigo; document.head.appendChild(s);
  const Ocd = window.OcdBehaviors;
  const fx = document.createElement('div');
  fx.id = 'fx-pestanas';
  fx.setAttribute('data-cod-behavior', 'pestanas');
  fx.innerHTML = '<div><h3>A</h3><p>uno</p></div><div><h3>B</h3><p>dos</p><p>dos bis</p></div><div><h3>C</h3><p>tres</p></div>';
  document.body.appendChild(fx);
  const normal = (h) => h.replace(/ class=""/g, '').replace(/ style=""/g, '');
  const antes = normal(fx.outerHTML);
  const editor = Ocd.createRuntime({ window, document }, { editorPreview: true });
  const montoEnEditor = fx.getAttribute('data-cod-pestanas-listo') === '1';
  editor();
  const destruir = Ocd.createRuntime({ window, document }, { editorPreview: false });
  const monto = fx.getAttribute('data-cod-pestanas-listo') === '1';
  const botones = [...fx.querySelectorAll('button[role="tab"]')];
  botones[1].click();
  const activaTras = fx.getAttribute('data-cod-pestanas-activa');
  const visibles = [...fx.querySelectorAll('[data-cod-pestanas-rol="panel"]')].map((p) => p.getAttribute('data-cod-pestanas-visible')).join();
  const idsUnicos = new Set([...fx.querySelectorAll('[id]')].map((e) => e.id)).size === fx.querySelectorAll('[id]').length;
  await new Promise((r) => setTimeout(r, 400));
  destruir();
  const despues = normal(fx.outerHTML);
  fx.remove();
  return { montoEnEditor, monto, n: botones.length, activaTras, visibles, idsUnicos, igual: antes === despues, antes, despues: antes === despues ? '' : despues };
})()`);
comprobar('cod-behaviors.js: en la vista previa del editor NO monta', motor.montoEnEditor === false);
comprobar('cod-behaviors.js: fuera del editor monta ' + motor.n + ' botones', motor.monto === true && motor.n === 3);
comprobar('cod-behaviors.js: al pinchar la 2 queda activa=2 y sólo su panel visible', motor.activaTras === '2' && motor.visibles === 'false,true,false');
comprobar('cod-behaviors.js: los ids generados son únicos', motor.idsUnicos === true);
comprobar('cod-behaviors.js: destruir() deja el DOM exactamente como estaba', motor.igual === true, motor.igual ? '' : '\n' + motor.antes + '\n' + motor.despues);

await retratar('final-' + ANCHO);
await cerrar();
console.log(fallas === 0 ? '\nTODO OK' : '\n' + fallas + ' FALLA(S)');
process.exit(fallas === 0 ? 0 : 1);
