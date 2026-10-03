/**
 * Coteja los textos de las dos páginas, palabra por palabra.
 *
 * Existe porque la revisión del 3 de octubre encontró que casi todos los
 * textos estaban recortados —faltaban frases enteras, no matices— y eso no se
 * ve mirando la página: se ve comparando. Un párrafo al que le falta la mitad
 * se lee perfectamente bien; sólo al ponerlo al lado del original aparece.
 *
 * No compara el orden ni el dibujo: sólo si cada frase del original está, y si
 * hay frases nuestras que allá no existen.
 *
 * Uso:
 *   node cotejar-textos.mjs https://econut.cl "http://localhost:8891/?page_id=20"
 */
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const [origen, destino] = process.argv.slice(2);
if (!origen || !destino) {
  console.error('uso: node cotejar-textos.mjs <url original> <url nuestra>');
  process.exit(1);
}

const GUION = `(() => {
  const limpiar = (t) => t.split(/[ \\t\\n\\r\\u00a0]+/).join(' ').trim();
  const frases = [];
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,li,div,a,button')) {
    const propio = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => limpiar(n.textContent))
      .filter(Boolean)
      .join(' ');
    if (propio.length > 25) frases.push(propio);
  }
  return [...new Set(frases)];
})()`;

async function textosDe(url) {
  const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: 1900, alto: 950, escala: 1 });
  await cdp('Page.enable');
  await cdp('Page.navigate', { url });
  await dormir(2500);
  await esperarLaPagina(evaluar);
  await recorrerLaPagina(evaluar);
  await dormir(1200);
  const r = await evaluar(GUION);
  await cerrar();
  return r;
}

/** Normaliza para comparar: sin tildes, sin signos, en minúscula. */
const clave = (t) => t.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ')
  .split(/\s+/).join(' ')
  .trim();

const alla = await textosDe(origen);
const aca = await textosDe(destino);

const clavesAca = aca.map(clave);
const clavesAlla = alla.map(clave);

// ¿Alguna frase del original está acá recortada o ausente?
const faltan = [];
for (const t of alla) {
  const k = clave(t);
  if (clavesAca.includes(k)) continue;
  // ¿está pero cortada? Busca si alguna nuestra es un prefijo de la de allá.
  const parcial = clavesAca.find((c) => c.length > 30 && k.startsWith(c.slice(0, Math.min(c.length, 60))));
  faltan.push({ texto: t, estado: parcial ? 'RECORTADA' : 'FALTA' });
}

const sobran = aca.filter((t) => !clavesAlla.includes(clave(t)));

console.log(`\noriginal: ${alla.length} frases · nuestra: ${aca.length}\n`);
if (faltan.length === 0) console.log('Ninguna frase del original falta ni está recortada.');
for (const f of faltan) console.log(`${f.estado}  ${f.texto.slice(0, 120)}`);

if (sobran.length) {
  console.log(`\n${sobran.length} frase(s) nuestras que no existen en el original —puede ser a propósito—:`);
  for (const t of sobran) console.log(`  ${t.slice(0, 110)}`);
}
