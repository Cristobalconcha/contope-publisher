/**
 * Captura una pantalla completa en formato de historia: 1080 x 1920.
 *
 * Instagram no pasa de 1080 px de ancho, así que ése es el piso y el techo.
 * Se maqueta como teléfono y se rinde al triple, que es lo que da nitidez sin
 * inventar píxeles.
 *
 * Se captura la VENTANA, no un bloque: una historia es una pantalla, y lo que
 * importa es cómo queda encuadrado lo que se ve.
 *
 * El ALTO importa tanto como el ancho: la foto de fondo va en cover, así que
 * una ventana más baja recorta más y se come los pies de la familia.
 * 440x956 es un iPhone 16 Pro Max de verdad.
 *
 * Uso:
 *   node historia.mjs <url> <salida.png> [quitar,...] [desplazamiento]
 */
import { writeFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, quitar } from './chrome.mjs';

const [url, salida, quitarArg, desplazArg] = process.argv.slice(2);
if (!url || !salida) {
  console.error('faltan argumentos: <url> <salida.png> [quitar,...] [desplazamiento]');
  process.exit(1);
}
const ANCHO = Number(process.env.ANCHO || 440);
const ALTO = Number(process.env.ALTO || 956);
const ESCALA = Number(process.env.ESCALA || 3);
const desplaz = Number(desplazArg || 0);

// ventanaPx: la ventana se abre del tamaño en PÍXELES y se le fija la densidad
// desde la línea de comandos. Si la superficie de dibujo midiera 440x956 de
// verdad, pedir una captura al triple devolvería una ampliación y no detalle:
// ahí estaba la falta de resolución.
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({
  ancho: ANCHO, alto: ALTO, escala: ESCALA, movil: true, ventanaPx: true,
});

await cdp('Page.enable');
await cdp('Page.navigate', { url });
await dormir(1500);

await esperarLaPagina(evaluar);
await dormir(3000); // el vídeo de la familia necesita pintar su primer cuadro

await quitar(evaluar, (quitarArg || '').split(',').map((s) => s.trim()).filter(Boolean));
if (desplaz) { await evaluar('scrollTo(0,' + desplaz + ')'); await dormir(800); }

const png = await cdp('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 0, y: desplaz, width: ANCHO, height: ALTO, scale: 1 },
});
writeFileSync(salida, Buffer.from(png.data, 'base64'));
const b = Buffer.from(png.data, 'base64');
console.log('guardado ' + salida);
console.log('  ' + b.readUInt32BE(16) + '×' + b.readUInt32BE(20) + ' px · ' + (b.length / 1024).toFixed(0) + ' KB');

await cerrar();
