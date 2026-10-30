/**
 * Sondea el estilo computado de los elementos que llevan un fragmento de texto, con la cadena de
 * ancestros y su peso de letra: sirve para ver DE DÓNDE viene una diferencia de tipografía.
 *
 *   node sondear-texto.mjs <url> <ancho> "<fragmento>"
 */
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const [url, ancho, frag] = process.argv.slice(2);
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: Number(ancho), alto: 900, escala: 1, movil: Number(ancho) < 600 });
try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url });
  await dormir(3000); await esperarLaPagina(evaluar); await recorrerLaPagina(evaluar); await dormir(800);
  const guion = `(() => {
    const frag = ${JSON.stringify(frag)};
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const propio = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\\s+/g, ' ').trim();
      if (!propio.includes(frag)) continue;
      const s = getComputedStyle(el);
      const cadena = [];
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        cadena.push(e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(/\\s+/).slice(0, 2).join('.') : '') + '[' + getComputedStyle(e).fontWeight + ']');
      }
      out.push({ tag: el.tagName, fw: s.fontWeight, ff: s.fontFamily.slice(0, 30), fs: s.fontSize, color: s.color, lh: s.lineHeight, cadena: cadena.slice(0, 7) });
    }
    return out;
  })()`;
  console.log(JSON.stringify(await evaluar(guion), null, 1));
} finally { await cerrar(); }
