/** Sondea las secciones de Divi de una página (fondo, tamaño, posición, paralaje) y saca una captura del viewport. Uso: node sondear-secciones.mjs <url> <ancho> <salida.png> */
import { writeFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina } from '../piezas/chrome.mjs';
const [url, ancho, out] = process.argv.slice(2);
const movil = Number(ancho) < 600;
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: Number(ancho), alto: movil ? 852 : 950, escala: 1, movil });
try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url });
  await dormir(4000); await esperarLaPagina(evaluar); await dormir(2000);
  const info = await evaluar(`(() => {
    const s = document.querySelector('.et_pb_section_1') || document.querySelectorAll('.et_pb_section')[1];
    const o = [];
    for (const el of document.querySelectorAll('.et_pb_section')) {
      const c = getComputedStyle(el); const r = el.getBoundingClientRect();
      o.push({ cls: el.className.slice(0,90), y: Math.round(r.top+scrollY), h: Math.round(r.height), bgi: c.backgroundImage.slice(0,200), size: c.backgroundSize, pos: c.backgroundPosition, att: c.backgroundAttachment, rep: c.backgroundRepeat, par: !!el.querySelector('.et_parallax_bg'), bef: getComputedStyle(el,'::before').backgroundImage.slice(0,100) , aft: getComputedStyle(el,'::after').backgroundImage.slice(0,100)});
    }
    return { o, vh: innerHeight, dpr: devicePixelRatio, sy: scrollY };
  })()`);
  console.log(JSON.stringify(info, null, 1));
  const png = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(png.data, 'base64'));
} finally { await cerrar(); }
