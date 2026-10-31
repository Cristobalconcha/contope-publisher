/**
 * Mide, EN VIVO y sólo leyendo, la barra lateral que el tema de Divi pone en una página que no usa el constructor (buscador,
 * entradas y comentarios recientes) y lo guarda en `contenidoPlano.lateral` de cada `datos/medida-<pagina>-<ancho>.json`
 * (sin tocar nada más de esos archivos). El transcriptor la lleva a bloques nativos de Gutenberg.
 *
 *   node medir-barra-lateral.mjs <carpeta-de-medicion> [pagina=basis-carpas-industriales] [anchos=1440,768,393]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../../piezas/chrome.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const [carpeta, pagina = 'basis-carpas-industriales', anchosArg = '1440,768,393'] = process.argv.slice(2);
if (!carpeta) { console.error('uso: node medir-barra-lateral.mjs <carpeta-de-medicion> [pagina] [anchos]'); process.exit(1); }
const guion = readFileSync(path.join(aqui, 'medir-barra-lateral.js'), 'utf8');
for (const ancho of anchosArg.split(',').map(Number)) {
  const movil = ancho < 600;
  const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho, alto: movil ? 852 : 950, escala: movil ? 2 : 1, movil });
  try {
    await cdp('Page.enable');
    await cdp('Page.navigate', { url: `https://basisbodegas.com/${pagina}/` });
    await dormir(3500); await esperarLaPagina(evaluar); await recorrerLaPagina(evaluar); await dormir(800);
    const lateral = await evaluar(guion);
    const arch = path.join(carpeta, 'datos', `medida-${pagina}-${ancho}.json`);
    const med = JSON.parse(readFileSync(arch, 'utf8'));
    if (!lateral || !med.contenidoPlano) { console.log(`${ancho}: sin barra lateral`); continue; }
    med.contenidoPlano.lateral = lateral;
    writeFileSync(arch, JSON.stringify(med));
    console.log(`${ancho}: ${lateral.widgets.length} widgets, lateral ${JSON.stringify(lateral.lateral.caja)}`);
  } finally { await cerrar(); }
}
