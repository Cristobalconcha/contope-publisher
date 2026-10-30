/**
 * Imprime la caja y el estilo de los elementos que calzan con un selector (o, con --local, con una lista de texto).
 *
 *   node sondear-elementos.mjs <url> <ancho> "<selector css>" [propiedades,css,separadas]
 */
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const [url, ancho, selector, props] = process.argv.slice(2);
const lista = (props || 'display,position,width,height,margin-left,margin-right,padding-left,padding-right,font-size,line-height').split(',');
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: Number(ancho), alto: 900, escala: 1, movil: Number(ancho) < 600 });
try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url });
  await dormir(3000); await esperarLaPagina(evaluar); await recorrerLaPagina(evaluar); await dormir(800);
  const guion = `(() => [...document.querySelectorAll(${JSON.stringify(selector)})].slice(0, 12).map((e) => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    const o = { el: e.tagName.toLowerCase() + '.' + String(e.className).split(/\\s+/).slice(0, 3).join('.'), x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    for (const p of ${JSON.stringify(lista)}) o[p] = s.getPropertyValue(p);
    return o;
  }))()`;
  for (const o of await evaluar(guion)) console.log(JSON.stringify(o));
} finally { await cerrar(); }
