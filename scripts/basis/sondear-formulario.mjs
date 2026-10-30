/**
 * Vuelca el estilo computado y la caja de los elementos del formulario (etiquetas, campos, ayuda, botón…) de la
 * página de contacto, del original o del local, para comparar lado a lado.
 *
 *   node sondear-formulario.mjs <url> <ancho> [selector-raiz]
 *
 * Con raíz `.gform_wrapper` (original) o `.ofr-form` (local). Sólo lee.
 */
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const [url, ancho, raizArg] = process.argv.slice(2);
const raiz = raizArg || (/localhost/.test(url) ? '.ofr-form' : '.gform_wrapper');
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: Number(ancho), alto: 900, escala: 1, movil: Number(ancho) < 600 });
try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url });
  await dormir(3500); await esperarLaPagina(evaluar); await recorrerLaPagina(evaluar); await dormir(800);
  const guion = `(() => {
    const raiz = document.querySelector(${JSON.stringify(raiz)});
    if (!raiz) return { error: 'sin raíz' };
    const out = [];
    const rr = raiz.getBoundingClientRect();
    out.push({ el: 'RAÍZ ' + ${JSON.stringify(raiz)}, x: Math.round(rr.left), y: Math.round(rr.top + scrollY), w: Math.round(rr.width), h: Math.round(rr.height), bg: getComputedStyle(raiz).backgroundColor, pad: getComputedStyle(raiz).padding });
    for (const e of raiz.querySelectorAll('label, legend, input:not([type=hidden]), textarea, select, button, .gfield_description, .ginput_counter, .ofr-help, .ofr-counter, .gfield, .ofr-field, .gform_footer, .ofr-form-footer')) {
      const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue;
      const s = getComputedStyle(e);
      const txt = (e.value || e.textContent || e.placeholder || '').replace(/\\s+/g, ' ').trim().slice(0, 28);
      out.push({ el: e.tagName.toLowerCase() + (e.type ? '[' + e.type + ']' : '') + '.' + String(e.className).split(/\\s+/).slice(0, 2).join('.'), txt, x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), fs: s.fontSize, fw: s.fontWeight, lh: s.lineHeight, color: s.color, bg: s.backgroundColor, border: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor, radius: s.borderTopLeftRadius, pad: s.padding, mb: s.marginBottom, ff: s.fontFamily.slice(0, 20), shadow: s.boxShadow === 'none' ? '' : 'sombra' });
    }
    return out;
  })()`;
  const filas = await evaluar(guion);
  if (filas.error) { console.log(filas.error); } else {
    for (const f of filas) console.log(`${String(f.y).padStart(5)} x${String(f.x).padStart(4)} ${String(f.w).padStart(4)}x${String(f.h).padEnd(4)} ${f.el.slice(0, 34).padEnd(34)} «${f.txt || ''}» fs=${f.fs} fw=${f.fw} lh=${f.lh} color=${f.color} bg=${f.bg} border=${f.border} r=${f.radius} pad=${f.pad} mb=${f.mb} ${f.shadow || ''}`);
  }
} finally { await cerrar(); }
