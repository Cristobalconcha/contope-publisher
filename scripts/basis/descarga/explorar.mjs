/**
 * Carga una URL pública (GET), la recorre y evalúa un archivo JS en la página.
 * Uso: node explorar.mjs <url> <archivo.js> [ancho]   (imprime el resultado como JSON)
 * Sólo lectura: no inicia sesión, no envía formularios.
 */
import { readFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const [url, js, anchoArg] = process.argv.slice(2);
const ancho = Number(anchoArg || 1440);
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho, alto: 950 });
try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url });
  await dormir(2500);
  await esperarLaPagina(evaluar);
  await recorrerLaPagina(evaluar);
  await dormir(2000);
  const r = await evaluar(readFileSync(js, 'utf8'));
  console.log(JSON.stringify(r, null, 2));
} finally { await cerrar(); }
