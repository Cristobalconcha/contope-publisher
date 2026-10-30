/**
 * Captura las dos secciones de la portada de Basis que llevan degradado (la portada
 * azul y el aviso naranja de cierre) en el sitio local y, al lado, el mismo recorte
 * del original, y mide el `background-image` computado de cada una.
 *
 *   node capturar-fondos.mjs [SITIO] [carpeta-original] [carpeta-salida]
 *
 * Salida (carpeta-salida):
 *   fondos-<portada|aviso>-<1440|393>.png               el sitio local
 *   fondos-original-<portada|aviso>-<1440|393>.png      el original (recorte de su captura de página completa)
 *   fondos-comparacion-<portada|aviso>-<1440|393>.png   original | local, lado a lado
 *   fondos-medidas.json                                  lo computado, local y original
 *
 * Sólo lee el sitio local; no envía nada.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const SITIO = (process.argv[2] || 'http://localhost:8894').replace(/\/+$/, '');
const ORIG = process.argv[3] || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/medicion-2';
const SAL = process.argv[4] || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/capturas-comparacion';
mkdirSync(SAL, { recursive: true });

// índice de la sección en la medición del original (inicio) y nombre
const SECCIONES = [['portada', 1], ['aviso', 5]];
const medidas = { local: {}, original: {} };

for (const ancho of [1440, 393]) {
  const movil = ancho < 600;
  const escala = movil ? 2 : 1;
  const orig = JSON.parse(readFileSync(path.join(ORIG, 'datos', `medida-inicio-${ancho}.json`), 'utf8'));
  const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho, alto: movil ? 852 : 950, escala, movil });
  try {
    await cdp('Page.enable');
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp('Page.navigate', { url: SITIO + '/' });
    await dormir(2500);
    await esperarLaPagina(evaluar);
    await recorrerLaPagina(evaluar);
    await dormir(1500);
    await evaluar("document.querySelectorAll('[class*=cookieadmin]').forEach(e=>{if(getComputedStyle(e).position==='fixed')e.style.display='none'}); window.scrollTo(0,0)");
    await dormir(500);
    // Las secciones con degradado, en orden de aparición.
    const locales = await evaluar(`(() => [...document.querySelectorAll('main .cod-node--section, main section')]
      .filter((e) => /gradient/.test(getComputedStyle(e).backgroundImage))
      .map((e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
        return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height, bi: c.backgroundImage, bc: c.backgroundColor, bs: c.backgroundSize, bp: c.backgroundPosition, br: c.backgroundRepeat }; }))()`);
    for (let i = 0; i < SECCIONES.length; i++) {
      const [nombre, indice] = SECCIONES[i];
      const l = locales[i];
      if (!l) { console.error(`no encontré la sección «${nombre}» con degradado a ${ancho}`); continue; }
      const o = orig.secciones.find((s) => s.indice === indice);
      medidas.local[`${nombre}-${ancho}`] = { alto: Math.round(l.h), backgroundImage: l.bi, backgroundColor: l.bc, backgroundSize: l.bs, backgroundPosition: l.bp, backgroundRepeat: l.br };
      medidas.original[`${nombre}-${ancho}`] = { alto: Math.round(o.caja.h), backgroundImage: o.imagenFondo, backgroundColor: o.fondo, backgroundSize: o.tamanoFondo, backgroundPosition: o.posicionFondo, backgroundRepeat: o.repiteFondo };
      const png = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: l.y, width: ancho, height: l.h, scale: 1 } });
      const archL = path.join(SAL, `fondos-${nombre}-${ancho}.png`);
      writeFileSync(archL, Buffer.from(png.data, 'base64'));
      // El recorte del original, de su captura de página completa (a 393 está a 2x).
      const archO = path.join(SAL, `fondos-original-${nombre}-${ancho}.png`);
      const k = escala;
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(ORIG, 'capturas', `inicio-${ancho}.png`), '-vf', `crop=${ancho * k}:${Math.round(o.caja.h * k)}:0:${Math.round(o.caja.y * k)}`, archO]);
      const alto = (p) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=height', '-of', 'csv=p=0', p], { encoding: 'utf8' }).trim());
      const H = Math.max(alto(archO), alto(archL));
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', archO, '-i', archL, '-filter_complex',
        `[0:v]pad=iw:${H}:0:0:color=white[a];[1:v]pad=iw:${H}:0:0:color=white[b];[a][b]hstack=inputs=2[o]`, '-map', '[o]',
        path.join(SAL, `fondos-comparacion-${nombre}-${ancho}.png`)]);
      console.log(`${nombre} ${ancho}: local ${Math.round(l.h)}px · original ${Math.round(o.caja.h)}px`);
    }
  } finally { await cerrar(); }
}
writeFileSync(path.join(SAL, 'fondos-medidas.json'), JSON.stringify(medidas, null, 2));
for (const k of Object.keys(medidas.local)) {
  const norm = (s) => String(s).replace(/url\("[^"]*\/([^/"]+)"\)/g, 'url($1)');
  const igual = norm(medidas.local[k].backgroundImage) === norm(medidas.original[k].backgroundImage);
  console.log(`${k}: background-image ${igual ? 'IGUAL' : 'DISTINTO'} al original\n   local    ${medidas.local[k].backgroundImage.slice(0, 160)}\n   original ${medidas.original[k].backgroundImage.slice(0, 160)}`);
}
