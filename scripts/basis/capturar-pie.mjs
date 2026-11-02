/**
 * Capturas del PIE de Basis (sólo el pie, no la página) a 1440 y 393, y la lámina «antes | después» lado a lado.
 *
 *   node scripts/basis/capturar-pie.mjs antes      → <salida>/antes/pie-<ancho>.png
 *   node scripts/basis/capturar-pie.mjs despues    → <salida>/despues/pie-<ancho>.png
 *   node scripts/basis/capturar-pie.mjs comparar   → <salida>/pie-<ancho>.png (antes | después)
 *
 * Salida por omisión: C:/Users/Cristobal concha/Sesión Claude/entregables/basis/bloques/
 * SITIO y ANCHOS=1440,393 acotan la corrida. El banner de cookies se oculta SÓLO para la captura. Sólo lee el sitio local.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const modo = process.argv[2];
if (!['antes', 'despues', 'comparar'].includes(modo || '')) {
  console.error('uso: capturar-pie.mjs antes|despues|comparar');
  process.exit(2);
}
const SITIO = (process.env.SITIO || 'http://localhost:8894').replace(/\/+$/, '');
const SAL = process.env.SALIDA || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/bloques';
const ANCHOS = (process.env.ANCHOS || '1440,393').split(',').map(Number);
mkdirSync(path.join(SAL, 'antes'), { recursive: true });
mkdirSync(path.join(SAL, 'despues'), { recursive: true });

async function capturarPie(url, ancho, arch) {
  const movil = ancho < 600;
  const escala = movil ? 2 : 1;
  const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho, alto: movil ? 852 : 950, escala, movil });
  try {
    await cdp('Page.enable'); await cdp('Network.enable');
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp('Page.navigate', { url });
    await dormir(3000);
    await esperarLaPagina(evaluar);
    await recorrerLaPagina(evaluar, 0.6);
    await dormir(1500);
    await evaluar("document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; })");
    await dormir(1000); await esperarLaPagina(evaluar);
    await evaluar("document.querySelectorAll('[class*=cookieadmin]').forEach(e=>{if(getComputedStyle(e).position==='fixed')e.style.display='none'}); document.querySelector('footer.cod-canvas-region-footer').scrollIntoView({block:'end'})");
    await dormir(600);
    const r = await evaluar("(() => { const b = document.querySelector('footer.cod-canvas-region-footer').getBoundingClientRect(); return { x: 0, y: b.top + window.scrollY, h: b.height }; })()");
    const png = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: Math.floor(r.y), width: ancho, height: Math.ceil(r.h), scale: 1 } });
    writeFileSync(arch, Buffer.from(png.data, 'base64'));
    return Math.ceil(r.h);
  } finally { await cerrar(); }
}

for (const ancho of ANCHOS) {
  const a = path.join(SAL, 'antes', `pie-${ancho}.png`);
  const d = path.join(SAL, 'despues', `pie-${ancho}.png`);
  if (modo === 'antes' || modo === 'despues') {
    const alto = await capturarPie(SITIO + '/', ancho, modo === 'antes' ? a : d);
    console.log(`${modo} pie ${ancho}: ${alto}px de alto`);
  } else {
    if (!existsSync(a) || !existsSync(d)) { console.log(`falta pie ${ancho}`); continue; }
    const escala = ancho < 600 ? 2 : 1;
    const dim = (p) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=height', '-of', 'csv=p=0', p], { encoding: 'utf8' }).trim());
    const H = Math.max(dim(a), dim(d));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', a, '-i', d,
      '-filter_complex', `[0:v]scale=${ancho * escala}:-1,pad=iw:${H}:0:0:color=white[a];[1:v]scale=${ancho * escala}:-1,pad=iw:${H}:0:0:color=white[b];[a][b]hstack=inputs=2[o]`, '-map', '[o]', path.join(SAL, `pie-${ancho}.png`)]);
    console.log(`lámina pie ${ancho}: antes ${dim(a)}px | después ${dim(d)}px`);
  }
}
