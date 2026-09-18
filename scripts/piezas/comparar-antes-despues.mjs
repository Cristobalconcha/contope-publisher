/**
 * Retrata un elemento del sitio ANTES y DESPUÉS de aplicarle un CSS de prueba.
 *
 * Para qué: la regla de Cristóbal es «no quiero hacer un cambio sin verlo».
 * Esto deja verlo antes de tocar nada — ni el espejo, ni el documento, ni el
 * sitio. El CSS se inyecta en vivo en el navegador y se va cuando se cierra.
 *
 * Cuando el resultado convence, ese mismo CSS se traduce a una receta de
 * cod-grapes-runner y ahí sí queda guardado en el JSON del documento, que es
 * el único lugar donde el editor visual lo puede ver.
 *
 * Uso:
 *   node comparar-antes-despues.mjs <url> <selector> <prueba.css> <carpeta>
 *
 * Variables: ANCHO (390, un teléfono) · ALTO (900) · ESCALA (3)
 *
 * Deja un par de imágenes por cada elemento que calce con el selector:
 *   <carpeta>/antes-1.png · <carpeta>/despues-1.png · -2, -3…
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from './chrome.mjs';

const [url, selector, cssPath, destino] = process.argv.slice(2);
if (!url || !selector || !cssPath || !destino) {
  console.error('faltan argumentos: <url> <selector> <prueba.css> <carpeta>');
  process.exit(1);
}
const ANCHO = Number(process.env.ANCHO || 390);
const ALTO = Number(process.env.ALTO || 900);
const ESCALA = Number(process.env.ESCALA || 3);

mkdirSync(destino, { recursive: true });
const CSS = readFileSync(cssPath, 'utf8');

const { cdp, evaluar, dormir, cerrar } = await abrirChrome({
  ancho: ANCHO, alto: ALTO, escala: ESCALA, movil: ANCHO < 600,
});

await cdp('Page.enable');
await cdp('Page.navigate', { url });
await dormir(1500);

await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);
await dormir(2500);

async function retratar(nombre) {
  const cajas = await evaluar(`(() => [...document.querySelectorAll(${JSON.stringify(selector)})].map(e => {
    const r = e.getBoundingClientRect();
    return { x: Math.floor(r.left + scrollX), y: Math.floor(r.top + scrollY), w: Math.ceil(r.width), h: Math.ceil(r.height) };
  }))()`);
  if (!cajas.length) throw new Error('no encontré ' + selector);
  for (let i = 0; i < cajas.length; i += 1) {
    const c = cajas[i];
    const png = await cdp('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 },
    });
    const salida = path.join(destino, nombre + '-' + (i + 1) + '.png');
    writeFileSync(salida, Buffer.from(png.data, 'base64'));
    console.log(nombre + ' ' + (i + 1) + ': ' + c.w + '×' + c.h + ' css → ' + path.basename(salida));
  }
}

await retratar('antes');

await evaluar(`(() => {
  const h = document.createElement('style');
  h.textContent = ${JSON.stringify(CSS)};
  document.head.appendChild(h);
})()`);
await dormir(600);

await retratar('despues');

await cerrar();
