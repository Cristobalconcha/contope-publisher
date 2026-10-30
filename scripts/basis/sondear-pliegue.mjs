/** Sondea el pliegue de Divi (título, ::before, abierto/cerrado). Uso: node sondear-pliegue.mjs <url> <ancho> */
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';
const [url, ancho] = process.argv.slice(2);
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: Number(ancho), alto: 900, escala: 1, movil: Number(ancho) < 600 });
try {
  await cdp('Page.enable'); await cdp('Page.navigate', { url }); await dormir(3000); await esperarLaPagina(evaluar); await recorrerLaPagina(evaluar); await dormir(1000);
  console.log(JSON.stringify(await evaluar(`(() => {
    const out = [];
    for (const t of document.querySelectorAll('.et_pb_toggle')) {
      const ti = t.querySelector('.et_pb_toggle_title'); const c = t.querySelector('.et_pb_toggle_content');
      const g = (e, p) => { const s = getComputedStyle(e, p); return { color: s.color, bg: s.backgroundColor, fs: s.fontSize, ff: s.fontFamily.slice(0,30), fw: s.fontWeight, content: s.content, w: s.width, h: s.height, pos: s.position, top: s.top, right: s.right, left: s.left, br: s.borderRadius, lh: s.lineHeight, ta: s.textAlign, disp: s.display, mt: s.marginTop, pr: s.paddingRight, pl: s.paddingLeft, pt: s.paddingTop, pb: s.paddingBottom, border: s.borderTopWidth+' '+s.borderTopStyle+' '+s.borderTopColor, bbw: s.borderBottomWidth, bbc: s.borderBottomColor, tf: s.transform }; };
      const r = t.getBoundingClientRect(); const rt = ti.getBoundingClientRect();
      out.push({ abierto: t.classList.contains('et_pb_toggle_open'), cls: t.className.slice(0, 80), toggle: Object.assign(g(t), { y: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width), mb: getComputedStyle(t).marginBottom }), titulo: Object.assign(g(ti), { th: Math.round(rt.height) }), antes: g(ti, '::before'), contenido: g(c), txt: ti.textContent.trim().slice(0, 40) });
    }
    return out;
  })()`), null, 1));
} finally { await cerrar(); }
