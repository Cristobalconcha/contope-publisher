/**
 * Capturas ANTES / DESPUÉS del paso de las cinco páginas de Basis a bloques de WordPress, a 1440, 768 y 393, y las láminas
 * «antes | después» lado a lado.
 *
 *   node scripts/basis/capturar-bloques.mjs antes      captura el sitio como está ahora → <salida>/antes/<pagina>-<ancho>.png
 *   node scripts/basis/capturar-bloques.mjs despues    captura el sitio → <salida>/despues/<pagina>-<ancho>.png
 *   node scripts/basis/capturar-bloques.mjs comparar   arma <salida>/<pagina>-<ancho>.png (antes | después)
 *
 * Salida por omisión: C:/Users/Cristobal concha/Sesión Claude/entregables/basis/bloques/
 * SITIO, SOLO=pagina[,pagina] y ANCHOS=1440,768 acotan la corrida. El banner de cookies se oculta SÓLO para la captura.
 * Sólo lee el sitio local; no envía formularios.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const modo = process.argv[2];
if (!['antes', 'despues', 'comparar'].includes(modo || '')) {
  console.error('uso: capturar-bloques.mjs antes|despues|comparar');
  process.exit(2);
}
const SITIO = (process.env.SITIO || 'http://localhost:8894').replace(/\/+$/, '');
const SAL = process.env.SALIDA || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/bloques';
const PAGINAS = [['inicio', '/'], ['basis-carpas-industriales', '/basis-carpas-industriales/'], ['preguntas-frecuentes', '/preguntas-frecuentes/'], ['contactos', '/contactos/'], ['terminos-y-privacidad', '/terminos-y-privacidad/']];
const SOLO = (process.env.SOLO || '').split(',').filter(Boolean);
const ANCHOS = (process.env.ANCHOS || '1440,768,393').split(',').map(Number);
mkdirSync(path.join(SAL, 'antes'), { recursive: true });
mkdirSync(path.join(SAL, 'despues'), { recursive: true });

async function capturarPagina(url, ancho, arch) {
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
    await dormir(2000);
    await evaluar("document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; })");
    await dormir(1500); await esperarLaPagina(evaluar);
    await evaluar("document.querySelectorAll('[class*=cookieadmin]').forEach(e=>{if(getComputedStyle(e).position==='fixed')e.style.display='none'}); window.scrollTo(0,0)");
    await dormir(600);
    const alto = await evaluar('Math.ceil(document.documentElement.scrollHeight)');
    const png = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: ancho, height: alto, scale: 1 } });
    writeFileSync(arch, Buffer.from(png.data, 'base64'));
    return alto;
  } finally { await cerrar(); }
}

for (const ancho of ANCHOS) {
  for (const [slug, ruta] of PAGINAS) {
    if (SOLO.length && !SOLO.includes(slug)) continue;
    const a = path.join(SAL, 'antes', `${slug}-${ancho}.png`);
    const d = path.join(SAL, 'despues', `${slug}-${ancho}.png`);
    if (modo === 'antes' || modo === 'despues') {
      const alto = await capturarPagina(SITIO + ruta, ancho, modo === 'antes' ? a : d);
      console.log(`${modo} ${slug} ${ancho}: ${alto}px`);
    } else {
      if (!existsSync(a) || !existsSync(d)) { console.log(`falta ${slug} ${ancho}`); continue; }
      const escala = ancho < 600 ? 2 : 1;
      const dim = (p) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=height', '-of', 'csv=p=0', p], { encoding: 'utf8' }).trim());
      const H = Math.max(dim(a), dim(d));
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', a, '-i', d,
        '-filter_complex', `[0:v]scale=${ancho * escala}:-1,pad=iw:${H}:0:0:color=white[a];[1:v]scale=${ancho * escala}:-1,pad=iw:${H}:0:0:color=white[b];[a][b]hstack=inputs=2[o]`, '-map', '[o]', path.join(SAL, `${slug}-${ancho}.png`)]);
      console.log(`lámina ${slug} ${ancho}: antes ${dim(a)}px | después ${dim(d)}px`);
    }
  }
}
