/**
 * Captura el sitio local de Basis en 1440, 768 y 393 (recorriendo cada página
 * antes, por las animaciones de entrada), revisa que ninguna imagen, video o
 * fuente falle y arma las láminas «original | local» lado a lado.
 *
 * El ORIGINAL se captura EN VIVO con el mismo procedimiento que el local (30-oct:
 * las capturas viejas guardadas del original salieron con la foto de la portada
 * cortada al 84%, un defecto de aquella captura —el sitio real la dibuja entera—,
 * y comparar contra ellas inventaba una diferencia que no existe).
 *
 *   node capturar-comparar.mjs [SITIO] [carpeta-salida] [--sin-original]
 *
 * Salida (carpeta-salida):
 *   original-<pagina>-<ancho>.png       captura del original en vivo
 *   local-<pagina>-<ancho>.png          captura del sitio local
 *   comparacion-<pagina>-<ancho>.png    original (izquierda) | local (derecha)
 *   red-local.json                      peticiones fallidas o con error
 *
 * El banner de cookies se oculta SOLO para la captura (el original no lo tiene y
 * taparía el contenido); en el sitio queda como corresponde.
 * Sólo lee el sitio local; no envía formularios.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const SITIO = (process.argv[2] || 'http://localhost:8894').replace(/\/+$/, '');
const SAL = process.argv.slice(3).find((a) => !a.startsWith('--')) || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/capturas-comparacion';
const SIN_ORIGINAL = process.argv.includes('--sin-original');
const ORIGINAL = 'https://basisbodegas.com';
mkdirSync(SAL, { recursive: true });
const PAGINAS = [['inicio', '/'], ['basis-carpas-industriales', '/basis-carpas-industriales/'], ['preguntas-frecuentes', '/preguntas-frecuentes/'], ['contactos', '/contactos/'], ['terminos-y-privacidad', '/terminos-y-privacidad/']];
const fallos = [];

/** Captura de página completa de un sitio (el banner de cookies sólo se oculta para la captura). */
async function capturarPagina(url, ancho, arch, registrarRed) {
  const movil = ancho < 600;
  const escala = movil ? 2 : 1;
  const { cdp, evaluar, dormir, cerrar, alEvento } = await abrirChrome({ ancho, alto: movil ? 852 : 950, escala, movil });
  const reqs = new Map();
  if (registrarRed) alEvento((m, p) => {
    if (m === 'Network.requestWillBeSent') reqs.set(p.requestId, { url: p.request.url, tipo: p.type });
    if (m === 'Network.responseReceived') { const r = reqs.get(p.requestId); if (r) { r.estado = p.response.status; } }
    if (m === 'Network.loadingFailed') { const r = reqs.get(p.requestId); if (r) r.error = p.errorText; }
  });
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
    return { alto, reqs };
  } finally { await cerrar(); }
}

for (const ancho of [1440, 768, 393]) {
  for (const [slug, ruta] of PAGINAS) {
    const arch = path.join(SAL, `local-${slug}-${ancho}.png`);
    const { alto, reqs } = await capturarPagina(SITIO + ruta, ancho, arch, true);
    for (const r of reqs.values()) {
      if (/^data:/.test(r.url) || /cookieadmin|googletagmanager|google-analytics/.test(r.url)) continue;
      if (r.error || (r.estado && r.estado >= 400)) fallos.push({ pagina: slug, ancho, ...r });
    }
    console.log(`${slug} ${ancho}: ${alto}px`);
    const orig = path.join(SAL, `original-${slug}-${ancho}.png`);
    const escala = ancho < 600 ? 2 : 1;
    if (!SIN_ORIGINAL && slug !== 'terminos-y-privacidad') {
      const o = await capturarPagina(ORIGINAL + ruta, ancho, orig, false);
      console.log(`  original ${o.alto}px`);
    }
    // lámina original | local
    try {
      readFileSync(orig);
      const out = path.join(SAL, `comparacion-${slug}-${ancho}.png`);
      const dim = (p) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=height', '-of', 'csv=p=0', p], { encoding: 'utf8' }).trim();
      const H = Math.max(Number(dim(orig)), Number(dim(arch)));
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', orig, '-i', arch,
        '-filter_complex', `[0:v]scale=${ancho * escala}:-1,pad=iw:${H}:0:0:color=white[a];[1:v]scale=${ancho * escala}:-1,pad=iw:${H}:0:0:color=white[b];[a][b]hstack=inputs=2[o]`, '-map', '[o]', out]);
    } catch { /* sin original (p. ej. términos) */ }
  }
}
writeFileSync(path.join(SAL, 'red-local.json'), JSON.stringify(fallos, null, 2));
console.log(fallos.length ? `PETICIONES FALLIDAS: ${fallos.length} (ver red-local.json)` : 'ninguna petición fallida');
