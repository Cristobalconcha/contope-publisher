/**
 * Exporta una página completa a PDF, en una sola hoja larga.
 *
 * Para qué: abrirlo en Illustrator y recortar de ahí las piezas. Un PDF de
 * Chrome conserva el texto y los SVG como VECTORES, así que lo que llega a
 * Illustrator es editable —tipografía viva, trazos, formas— y no una imagen.
 *
 * Una sola hoja del alto de la página, para que nada quede partido entre
 * páginas y los bloques se puedan seleccionar enteros.
 *
 * OJO: una página de teléfono entera da una tira larguísima —salió una de
 * 440×10.718— que en Illustrator no sirve de nada. Para una pieza de redes,
 * usar pieza-pdf.mjs o bloque-pdf.mjs. Éste es para recortar a mano.
 *
 * Uso:
 *   node pagina-a-pdf.mjs <url> <salida.pdf> [ancho] [quitar,...]
 */
import { writeFileSync } from 'node:fs';
import {
  abrirChrome, esperarLaPagina, recorrerLaPagina, fijarLasAnimaciones, quitar,
} from './chrome.mjs';

const [url, salida, anchoArg, quitarArg] = process.argv.slice(2);
if (!url || !salida) {
  console.error('faltan argumentos: <url> <salida.pdf> [ancho] [quitar,...]');
  process.exit(1);
}
const ancho = Number(anchoArg || 1200);

const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho, alto: 1200 });

await cdp('Page.enable');
await cdp('Page.navigate', { url });
await dormir(1200);

await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);
await dormir(2500);

await quitar(evaluar, (quitarArg || '').split(',').map((s) => s.trim()).filter(Boolean));
await fijarLasAnimaciones(evaluar);
await dormir(600);

const alto = await evaluar('Math.ceil(document.documentElement.scrollHeight)');
const px = (v) => v / 96; // Chrome mide el papel en pulgadas, a 96 px por pulgada

// Antes de imprimir se guarda una foto de lo mismo que va a salir. Un PDF
// que no se puede abrir acá igual se puede evaluar: es el mismo motor, el
// mismo DOM y el mismo momento.
const foto = await cdp('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: ancho, height: alto, scale: 0.35 },
});
writeFileSync(salida.replace(/\.pdf$/i, '') + '-comprobacion.png', Buffer.from(foto.data, 'base64'));

const pdf = await cdp('Page.printToPDF', {
  printBackground: true,
  preferCSSPageSize: false,
  marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
  paperWidth: px(ancho),
  paperHeight: px(alto),
  scale: 1,
});
writeFileSync(salida, Buffer.from(pdf.data, 'base64'));
const b = Buffer.from(pdf.data, 'base64');
console.log('guardado ' + salida);
console.log('  página ' + ancho + '×' + alto + ' px · una sola hoja · ' + (b.length / 1024 / 1024).toFixed(1) + ' MB');

await cerrar();
