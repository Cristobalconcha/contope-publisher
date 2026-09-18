/**
 * Exporta UN bloque del sitio a PDF, del alto exacto de ese bloque.
 *
 * Para trabajar en Illustrator: el texto y los trazos llegan como VECTORES
 * —tipografía viva, escalable— y las fotos incrustadas a su resolución de
 * origen.
 *
 * Cómo se aísla el bloque: Chrome imprime siempre desde el comienzo del
 * documento, así que no basta con desplazarse. Se ocultan todos los hermanos
 * ANTERIORES del bloque, subiendo nivel por nivel hasta el cuerpo; así el
 * bloque queda arriba del todo y la primera página es él.
 *
 * Sobre el tamaño de la mesa de trabajo: Chrome mide el papel en pulgadas, en
 * impresión 1 px de CSS es 1/96 de pulgada y un punto de PDF es 1/72. Además
 * limita el factor de escala a 2. De ahí sale la cuenta: puntos = css x 1,5.
 * Con maquetación de teléfono (360) el máximo es 540 pt de ancho, o sea la
 * mitad justa de los 1080 de Instagram: se amplía al 200% y queda en medida,
 * sin perder nada, porque lo que manda es la resolución de lo incrustado.
 *
 * Uso:
 *   SELECTOR=".pilares" node bloque-pdf.mjs <url> <salida.pdf> [quitar,...]
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  abrirChrome, esperarLaPagina, recorrerLaPagina, fijarLasAnimaciones, quitar,
} from './chrome.mjs';

const [url, salida, quitarArg] = process.argv.slice(2);
if (!url || !salida) {
  console.error('faltan argumentos: <url> <salida.pdf> [quitar,...]');
  process.exit(1);
}
const ANCHO = Number(process.env.ANCHO || 360);
const SELECTOR = process.env.SELECTOR || '';
const ESCALA = 2; // el tope que admite Chrome

const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: ANCHO, alto: 800, movil: true });

await cdp('Emulation.setEmulatedMedia', { media: 'screen' });
await cdp('Page.enable');
await cdp('Page.navigate', { url });
await dormir(1500);

await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);
await dormir(2200);

await quitar(evaluar, (quitarArg || '').split(',').map((s) => s.trim()).filter(Boolean));
await fijarLasAnimaciones(evaluar);

let alto;
let DESDE = 0;
if (SELECTOR) {
  // Primero se sube el bloque al tope ocultando los hermanos anteriores en cada
  // nivel: Chrome imprime desde el comienzo del documento y desplazarse no sirve.
  const hay = await evaluar(`(() => {
    const el = document.querySelector(${JSON.stringify(SELECTOR)});
    if (!el) return false;
    let n = el;
    while (n && n.parentElement && n !== document.body) {
      for (const h of [...n.parentElement.children]) {
        if (h === n) break;
        if (getComputedStyle(h).position !== 'fixed') h.style.setProperty('display', 'none', 'important');
      }
      n = n.parentElement;
    }
    scrollTo(0, 0);
    return true;
  })()`);
  if (!hay) throw new Error('no encontré ' + SELECTOR);

  // Y RECIÉN AHÍ se mide. Ocultar cambia el diseño, y medir en el mismo
  // instante devuelve el alto anterior: el bloque salía cortado abajo.
  await dormir(900);
  const caja = await evaluar(`(() => {
    const r = document.querySelector(${JSON.stringify(SELECTOR)}).getBoundingClientRect();
    return { arriba: Math.max(0, Math.floor(r.top + scrollY)), alto: Math.ceil(r.height) };
  })()`);
  DESDE = caja.arriba;
  alto = caja.alto;
} else {
  await dormir(700);
  alto = await evaluar('Math.ceil(document.documentElement.scrollHeight)');
}

const ptAncho = Math.round(ANCHO * ESCALA * 0.75);
const ptAlto = Math.round(alto * ESCALA * 0.75);

// Foto de lo mismo que va a imprimirse: un PDF no se puede abrir desde acá,
// pero esto sí, y es el mismo motor, el mismo DOM y el mismo momento.
const foto = await cdp('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: DESDE, width: ANCHO, height: alto, scale: 3 },
});
writeFileSync(salida.replace(/\.pdf$/i, '') + '-comprobacion.png', Buffer.from(foto.data, 'base64'));

const pdf = await cdp('Page.printToPDF', {
  printBackground: true,
  preferCSSPageSize: false,
  marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
  paperWidth: ptAncho / 72,
  paperHeight: ptAlto / 72,
  pageRanges: '1',
  scale: ESCALA,
});
writeFileSync(salida, Buffer.from(pdf.data, 'base64'));
const b = Buffer.from(pdf.data, 'base64');
console.log(path.basename(salida) + '  mesa ' + ptAncho + '×' + ptAlto + ' pt  ·  bloque ' + ANCHO + '×' + alto + '  ·  ' + (b.length / 1024 / 1024).toFixed(1) + ' MB');

await cerrar();
