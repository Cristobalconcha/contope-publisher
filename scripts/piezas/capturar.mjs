/**
 * Captura un bloque del sitio tal como se ve, en alta resolución.
 *
 * Por qué así y no reconstruyendo el bloque en un documento aparte: se intentó,
 * y el aislamiento pierde CSS —el título se montaba y la tipografía cambiaba—.
 * Acá se carga la PÁGINA REAL en Chrome, se le quitan en vivo los elementos que
 * sólo tienen sentido en pantalla, y se recorta exactamente el bloque. Nada se
 * reconstruye, así que nada se puede perder.
 *
 * Uso:
 *   node capturar.mjs <url> <selector> <salida.png> [ancho] [escala] [quitar,...]
 */
import { writeFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, quitar } from './chrome.mjs';

const [url, selector, salida, anchoArg, escalaArg, quitarArg] = process.argv.slice(2);
if (!url || !selector || !salida) {
  console.error('faltan argumentos: <url> <selector> <salida.png> [ancho] [escala] [quitar,...]');
  process.exit(1);
}
const ancho = Number(anchoArg || 1200);
const escala = Number(escalaArg || 3);

// El ancho manda la forma, así que se fija antes de cargar.
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho, alto: 1200, escala });

await cdp('Page.enable');
await cdp('Page.navigate', { url });
await dormir(1000);

await esperarLaPagina(evaluar);
await dormir(2500); // el runtime del plugin pinta el plano y sus estados

await quitar(evaluar, (quitarArg || '').split(',').map((s) => s.trim()).filter(Boolean));
await dormir(400);

const caja = await evaluar(`(() => {
  const e = document.querySelector(${JSON.stringify(selector)});
  if (!e) return null;
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
})()`);
if (!caja) throw new Error('no encontré ' + selector);

const png = await cdp('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
  // La escala ya la aplica la densidad de la ventana; ponerla también acá la
  // elevaría al cuadrado (una captura salió 9x en vez de 3x).
  clip: { x: caja.x, y: caja.y, width: caja.w, height: caja.h, scale: 1 },
});
writeFileSync(salida, Buffer.from(png.data, 'base64'));

const b = Buffer.from(png.data, 'base64');
console.log('guardado ' + salida);
console.log('  bloque ' + Math.round(caja.w) + '×' + Math.round(caja.h) + ' css · imagen ' + b.readUInt32BE(16) + '×' + b.readUInt32BE(20) + ' px · ' + (b.length / 1024).toFixed(0) + ' KB');

await cerrar();
