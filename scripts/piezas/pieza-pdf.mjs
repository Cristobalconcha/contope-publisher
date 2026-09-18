/**
 * Exporta UNA pantalla a PDF del tamaño exacto de la pieza.
 *
 * Para qué: trabajar en Illustrator. Un PNG, por muchos píxeles que tenga, se
 * pixela al acercarse; un PDF de Chrome trae el TEXTO COMO VECTOR —tipografía
 * viva, escalable a cualquier tamaño— y la foto incrustada a su resolución de
 * origen (la de portada mide 2880x1800).
 *
 * Se imprime sólo la PRIMERA página, del alto de la ventana: así sale la
 * pantalla que se ve y no la página entera.
 *
 * Uso:
 *   node pieza-pdf.mjs <url> <salida.pdf> [quitar,...]
 *   ANCHO=360 ALTO=640 node pieza-pdf.mjs ...
 */
import { writeFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, quitar } from './chrome.mjs';

const [url, salida, quitarArg] = process.argv.slice(2);
if (!url || !salida) {
  console.error('faltan argumentos: <url> <salida.pdf> [quitar,...]');
  process.exit(1);
}
const ANCHO = Number(process.env.ANCHO || 360);
const ALTO = Number(process.env.ALTO || 640);
// Tamaño que tendrá la mesa de trabajo, en puntos. Por defecto, el de una
// historia de Instagram.
const PUNTOS_ANCHO = Number(process.env.PT_ANCHO || 1080);
const PUNTOS_ALTO = Number(process.env.PT_ALTO || 1920);

const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: ANCHO, alto: ALTO, movil: true });

// Sin esto, Chrome imprime con los estilos de impresión y el sitio se ve distinto.
await cdp('Emulation.setEmulatedMedia', { media: 'screen' });
await cdp('Page.enable');
await cdp('Page.navigate', { url });
await dormir(1500);

await esperarLaPagina(evaluar);
await dormir(3000); // el vídeo de la familia necesita pintar su primer cuadro

await quitar(evaluar, (quitarArg || '').split(',').map((s) => s.trim()).filter(Boolean));
await dormir(500);

// Foto de lo que se va a imprimir, para poder evaluarlo sin abrir el PDF.
const foto = await cdp('Page.captureScreenshot', {
  format: 'png', clip: { x: 0, y: 0, width: ANCHO, height: ALTO, scale: 3 },
});
writeFileSync(salida.replace(/\.pdf$/i, '') + '-comprobacion.png', Buffer.from(foto.data, 'base64'));

// Chrome mide el papel en PULGADAS y en impresión 1 px de CSS es 1/96 de
// pulgada; un punto de PDF, en cambio, es 1/72. Si se pasa ANCHO/96 el
// documento abre a 3/4 del tamaño esperado: 360 llegan como 270. Por eso el
// papel se pide en PUNTOS y el contenido se escala para llenarlo.
//
// Pero Chrome TOPA la escala en 2. Con maquetación de teléfono (360) el
// máximo es 540 pt de ancho: pedir los 1080 de Instagram da escala 4 y el
// guion se caía con «scale is outside of [0.1 - 2] range». Así que en vez de
// fallar se hace la mesa más chica en la misma proporción y se avisa. No se
// pierde nada: el PDF es vectorial y se amplía al 200% sin tocar la calidad,
// porque lo que manda es la resolución de lo incrustado.
const escalaPedida = (PUNTOS_ANCHO / 72) / (ANCHO / 96);
const escala = Math.min(2, escalaPedida);
const mesaAncho = Math.round(PUNTOS_ANCHO * (escala / escalaPedida));
const mesaAlto = Math.round(PUNTOS_ALTO * (escala / escalaPedida));

const pdf = await cdp('Page.printToPDF', {
  printBackground: true,
  preferCSSPageSize: false,
  marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
  paperWidth: mesaAncho / 72,
  paperHeight: mesaAlto / 72,
  pageRanges: '1',
  scale: escala,
});
writeFileSync(salida, Buffer.from(pdf.data, 'base64'));
const b = Buffer.from(pdf.data, 'base64');
console.log('guardado ' + salida);
console.log('  mesa de trabajo ' + mesaAncho + '×' + mesaAlto + ' pt · maquetado a ' + ANCHO + '×' + ALTO + ' · ' + (b.length / 1024 / 1024).toFixed(1) + ' MB');
if (mesaAncho !== PUNTOS_ANCHO) {
  const veces = (PUNTOS_ANCHO / mesaAncho).toFixed(2).replace(/\.?0+$/, '');
  console.log('  ojo: Chrome topa la escala en 2, así que la mesa salió a la ' + (mesaAncho / PUNTOS_ANCHO === 0.5 ? 'mitad' : 'fracción') + ' de los ' + PUNTOS_ANCHO + ' pt pedidos.');
  console.log('  amplíalo ' + veces + '× en Illustrator: es vectorial, no pierde nada.');
}
console.log('  comprobación: ' + salida.replace(/\.pdf$/i, '') + '-comprobacion.png');

await cerrar();
