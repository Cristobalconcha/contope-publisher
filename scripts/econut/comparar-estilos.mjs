/**
 * Compara los ESTILOS COMPUTADOS de la portada de dos sitios de Econut (el
 * espejo local y un ensayo en un servidor), nodo por nodo y en tres pantallas.
 *
 * No lee el CSS: le pregunta al navegador qué pinta de verdad cada elemento
 * `[data-cod-node]` (los nodos de la composición, que tienen el mismo id en los
 * dos sitios porque salen de la misma fuente, `componer.mjs`). Antes de medir
 * recorre la página entera, para que las animaciones de entrada ya hayan
 * ocurrido y las imágenes diferidas ya se hayan pedido; un navegador que mide
 * sin recorrer contesta cualquier cosa.
 *
 * Qué se compara por nodo: tipografía, colores, fondo, caja (márgenes, rellenos,
 * bordes, radio), disposición (display, grilla, flex, separación), y el ancho y
 * alto que ocupa. Se ignora `transform` y `opacity` mientras haya una animación
 * en curso (se avisa si quedó alguna).
 *
 * Uso:
 *   node comparar-estilos.mjs <urlA> <urlB> [ruta]      (ruta por omisión: /)
 *   node comparar-estilos.mjs http://localhost:8891 http://nuevo.econut.cl
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Cristobal concha/wp-local/node_modules/playwright-core');

const [urlA, urlB, ruta = '/'] = process.argv.slice(2);
if (!urlA || !urlB) { console.error('uso: node comparar-estilos.mjs <urlA> <urlB> [ruta]'); process.exit(1); }

const PANTALLAS = [
  { nombre: 'escritorio', ancho: 1440, alto: 900 },
  { nombre: 'tablet', ancho: 768, alto: 1024 },
  { nombre: 'celular', ancho: 393, alto: 852 },
];

const PROPIEDADES = [
  'display', 'position', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignContent',
  'gridTemplateColumns', 'gridTemplateRows', 'gridColumnStart', 'gridRowStart', 'rowGap', 'columnGap',
  'color', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'textDecorationLine',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderBottomWidth', 'borderBottomColor',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'boxShadow', 'overflowX', 'overflowY', 'objectFit', 'aspectRatio', 'zIndex', 'whiteSpace',
];

async function medir(navegador, base, pantalla) {
  const ctx = await navegador.newContext({
    viewport: { width: pantalla.ancho, height: pantalla.alto },
    ignoreHTTPSErrors: true,
    reducedMotion: 'reduce',
  });
  // El banner de cookies no es de la composición y cambia de una versión del plugin a otra.
  await ctx.addInitScript(() => {
    const ocultar = () => {
      const e = document.createElement('style');
      e.textContent = '.cookieadmin_law_container,.cookieadmin_re_consent{display:none!important}';
      (document.head || document.documentElement).appendChild(e);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ocultar); else ocultar();
  });
  const page = await ctx.newPage();
  await page.goto(base.replace(/\/+$/, '') + ruta, { waitUntil: 'load', timeout: 60000 });
  // Recorrer la página, de arriba abajo y de vuelta.
  const alto = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= alto; y += Math.max(200, pantalla.alto - 100)) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const datos = await page.evaluate((props) => {
    const salida = {};
    document.querySelectorAll('[data-cod-node]').forEach((el) => {
      const id = el.getAttribute('data-cod-node');
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const reg = { _ancho: Math.round(r.width), _alto: Math.round(r.height), _etiqueta: el.tagName.toLowerCase() };
      for (const p of props) reg[p] = cs[p];
      // `transform` sólo cuenta si no es el efecto de entrada todavía a medias.
      reg.transform = cs.transform;
      reg.opacity = cs.opacity;
      salida[id] = reg;
    });
    return {
      nodos: salida,
      anchoDoc: document.documentElement.scrollWidth,
      altoDoc: document.documentElement.scrollHeight,
      fallidas: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc),
    };
  }, PROPIEDADES);
  await ctx.close();
  return datos;
}

const navegador = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
let totalDif = 0;
try {
  for (const pantalla of PANTALLAS) {
    const [a, b] = [await medir(navegador, urlA, pantalla), await medir(navegador, urlB, pantalla)];
    const idsA = Object.keys(a.nodos), idsB = Object.keys(b.nodos);
    const soloA = idsA.filter((i) => !(i in b.nodos)), soloB = idsB.filter((i) => !(i in a.nodos));
    const comunes = idsA.filter((i) => i in b.nodos);
    const difs = [];
    for (const id of comunes) {
      for (const k of Object.keys(a.nodos[id])) {
        // Las URL de fondo llevan el servidor delante: se compara sin él.
        const sinOrigen = (v, base) => String(v).split(base.replace(/\/+$/, '')).join('ORIGEN');
        if (sinOrigen(a.nodos[id][k], urlA) !== sinOrigen(b.nodos[id][k], urlB)) {
          difs.push({ id, propiedad: k, A: a.nodos[id][k], B: b.nodos[id][k] });
        }
      }
    }
    totalDif += difs.length + soloA.length + soloB.length;
    console.log(`\n== ${pantalla.nombre} (${pantalla.ancho}px) ==`);
    console.log(`nodos: A=${idsA.length}  B=${idsB.length}  en común=${comunes.length}  sólo en A=${soloA.length}  sólo en B=${soloB.length}`);
    console.log(`alto del documento: A=${a.altoDoc}  B=${b.altoDoc} · ancho: A=${a.anchoDoc}  B=${b.anchoDoc}`);
    console.log(`imágenes que fallan: A=${a.fallidas.length}  B=${b.fallidas.length}`);
    console.log(`diferencias de estilo computado: ${difs.length}`);
    for (const d of difs.slice(0, 25)) console.log(`  ${d.id} · ${d.propiedad}: A="${String(d.A).slice(0, 60)}"  B="${String(d.B).slice(0, 60)}"`);
    if (difs.length > 25) console.log(`  … y ${difs.length - 25} más`);
    if (soloA.length) console.log('  sólo en A:', soloA.slice(0, 10).join(', '));
    if (soloB.length) console.log('  sólo en B:', soloB.slice(0, 10).join(', '));
  }
} finally {
  await navegador.close();
}
console.log(`\nTOTAL de diferencias: ${totalDif}`);
process.exit(totalDif ? 1 : 0);
