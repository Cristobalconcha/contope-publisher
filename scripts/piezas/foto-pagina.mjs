/**
 * Foto de página completa, HONESTA: recorre la página entera primero para que
 * las animaciones de entrada ya hayan ocurrido, y recién ahí captura.
 *
 * Existe porque capturar sin recorrer deja los bloques con animación en
 * opacidad 0 y la foto miente: parecen vacíos cuando tienen todo su contenido.
 *
 * Uso: node foto-pagina.mjs <url> <salida.png> [ancho]
 */
import { writeFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from './chrome.mjs';

const [url, salida, anchoArg] = process.argv.slice(2);
if (!url || !salida) { console.error('faltan argumentos: <url> <salida.png> [ancho]'); process.exit(1); }
const ancho = Number(anchoArg || 1440);

const escala = Number(process.env.ESCALA || 1);
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho, alto: 950, escala });
await cdp('Page.enable');
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await cdp('Page.navigate', { url });
await dormir(2500);
await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);
await dormir(2500);
await evaluar('window.scrollTo(0, 0)');
await dormir(600);

const alto = await evaluar('Math.ceil(document.documentElement.scrollHeight)');
const png = await cdp('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: ancho, height: alto, scale: 1 },
});
writeFileSync(salida, Buffer.from(png.data, 'base64'));
console.log(salida + '  ' + ancho + '×' + alto);
await cerrar();
