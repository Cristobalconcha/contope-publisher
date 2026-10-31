/**
 * Mide, EN VIVO y sólo leyendo, lo que el contrato ampliado de Orugantt Forms (segunda parte, 30-oct) necesita del formulario de
 * Gravity Forms —rellenos, márgenes, separaciones y la casilla propia— y lo guarda en `forma.extra` de cada
 * `datos/medida-<pagina>-<ancho>.json` de la medición (sin tocar nada más de esos archivos).
 *
 *   node medir-formulario.mjs <carpeta-de-medicion> [pagina=contactos] [anchos=1440,768,393]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../../piezas/chrome.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const [carpeta, pagina = 'contactos', anchosArg = '1440,768,393'] = process.argv.slice(2);
if (!carpeta) { console.error('uso: node medir-formulario.mjs <carpeta-de-medicion> [pagina] [anchos]'); process.exit(1); }
const guion = readFileSync(path.join(aqui, 'medir-forma-extra.js'), 'utf8');
const porAncho = {};
for (const ancho of anchosArg.split(',').map(Number)) {
  const movil = ancho < 600;
  const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho, alto: movil ? 852 : 950, escala: movil ? 2 : 1, movil });
  try {
    await cdp('Page.enable');
    await cdp('Page.navigate', { url: `https://basisbodegas.com/${pagina}/` });
    await dormir(3500); await esperarLaPagina(evaluar); await recorrerLaPagina(evaluar); await dormir(800);
    const extra = await evaluar(guion);
    const arch = path.join(carpeta, 'datos', `medida-${pagina}-${ancho}.json`);
    const med = JSON.parse(readFileSync(arch, 'utf8'));
    const forma = med.formularios?.[0]?.forma;
    if (!forma || !extra) { console.log(`${ancho}: sin formulario`); continue; }
    forma.extra = extra;
    porAncho[ancho] = { arch, med, extra };
    writeFileSync(arch, JSON.stringify(med));
    console.log(`${ancho}:`, JSON.stringify(extra));
  } finally { await cerrar(); }
}
// Las separaciones entre columnas sólo se miden cuando las columnas están lado a lado (escritorio) y la vertical sólo cuando se apilan
// (celular): el transcriptor lee el tema de la medición de escritorio, así que se juntan ahí.
const anchosOrden = Object.keys(porAncho).map(Number).sort((a, b) => b - a);
const mayor = porAncho[anchosOrden[0]];
if (mayor) {
  for (const a of anchosOrden) for (const k of ['rejillaSeparacion', 'rejillaSubSeparacion', 'rejillaFilaSeparacion']) {
    if (porAncho[a].extra[k] !== undefined && mayor.extra[k] === undefined) mayor.extra[k] = porAncho[a].extra[k];
  }
  writeFileSync(mayor.arch, JSON.stringify(mayor.med));
  console.log('escritorio, completado:', JSON.stringify({ c: mayor.extra.rejillaSeparacion, s: mayor.extra.rejillaSubSeparacion, f: mayor.extra.rejillaFilaSeparacion }));
}
