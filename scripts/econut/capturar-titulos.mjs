/**
 * Mide y recorta cada título de la portada de Econut (espejo local, 8891), para
 * comparar antes y después de unificar los tamaños.
 *
 *   node capturar-titulos.mjs <etiqueta>      → comparacion-titulos-econut/<etiqueta>/
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, recorrerLaPagina, dormir } from '../piezas/chrome.mjs';

const etiqueta = process.argv[2] || 'antes';
const SALIDA = `C:/Users/Cristobal concha/Sesión Claude/comparacion-titulos-econut/${etiqueta}`;
mkdirSync(SALIDA, { recursive: true });
const TITULOS = ['Servicio de verdad', 'Nuestra historia', 'Procesamos con pasión', 'Instalaciones de Vanguardia', 'Garantía de calidad', 'Certificaciones', 'Compromiso con el Futuro', '2005', '12.000'];

const { cdp, evaluar, cerrar } = await abrirChrome({ ancho: 1440, alto: 900, escala: 1 });
await cdp('Page.enable');
await cdp('Page.navigate', { url: 'http://localhost:8891/' });
await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);
await dormir(1500);
// Mismo estado de página para ambos: «antes» se obtiene inyectando los valores antiguos sobre la hoja nueva.
if (etiqueta === 'antes') {
  await evaluar(`(() => { const s = document.createElement('style'); s.textContent = '.cod-rule--t-seccion-46,.cod-rule--t-certificaciones{font-size:clamp(30px, 2.5vw, 46px) !important}.cod-rule--t-cifra{font-size:clamp(38px, 4.6vw, 62px) !important}.cod-rule--t-etiqueta-cifra{font-size:clamp(32px, 4.4vw, 63px) !important}'; document.head.appendChild(s); })()`);
  await dormir(800);
}

const medidas = [];
for (let i = 0; i < TITULOS.length; i++) {
  const t = TITULOS[i];
  const m = JSON.parse(await evaluar(`JSON.stringify((() => {
    const e = [...document.querySelectorAll('h1,h2,h3,h4,p,div,span')].filter((x) => x.children.length === 0 && x.textContent.trim() === ${JSON.stringify(t)}).pop();
    if (!e) return null;
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, fontSize: s.fontSize, lineHeight: s.lineHeight, weight: s.fontWeight };
  })())`));
  if (!m) { medidas.push({ titulo: t, falta: true }); continue; }
  const pad = 28;
  const x = Math.max(0, m.x - pad - 120), w = Math.min(1440 - x, m.w + 2 * pad + 240);
  const png = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x, y: Math.max(0, m.y - pad), width: w, height: m.h + 2 * pad, scale: 1 } });
  writeFileSync(`${SALIDA}/${i}.png`, Buffer.from(png.data, 'base64'));
  medidas.push({ titulo: t, ...m, archivo: `${i}.png` });
}
const alto = await evaluar('document.documentElement.scrollHeight');
writeFileSync(`${SALIDA}/medidas.json`, JSON.stringify({ alto, medidas }, null, 1));
console.log(`alto de página ${alto}`);
medidas.forEach((m) => console.log(`${m.titulo.padEnd(30)} ${m.falta ? 'NO ENCONTRADO' : `${m.fontSize} · caja ${Math.round(m.w)}×${Math.round(m.h)}`}`));
await cerrar();
