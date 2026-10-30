/**
 * Medición completa de un sitio Divi público, SÓLO LECTURA (peticiones GET).
 *
 * Por cada página y cada ancho: carga la página en Chrome sin ventana, la
 * RECORRE (las animaciones de entrada de Divi dejan bloques en opacidad 0 si
 * no), mide con estilos computados, registra la red (qué se descarga y de
 * dónde) y saca una captura de página completa.
 *
 * Uso: node medir.mjs <carpeta-salida> [archivo-paginas.json] [anchos=1440,393]
 *   salida/datos/medida-<archivo>-<ancho>.json   mediciones
 *   salida/datos/red-<archivo>-<ancho>.json      peticiones de red
 *   salida/capturas/<archivo>-<ancho>.png        captura completa
 *
 * No inicia sesión, no envía formularios, no escribe nada en el servidor.
 * Pausa entre cargas para no cargar el hosting compartido.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const salida = process.argv[2];
const paginas = JSON.parse(readFileSync(process.argv[3] || path.join(salida, 'datos', 'paginas-base.json'), 'utf8'));
const anchos = (process.argv[4] || '1440,393').split(',').map(Number);
const soloUna = process.env.SOLO || '';
const guion = readFileSync(path.join(aqui, 'medir-pagina.js'), 'utf8');
mkdirSync(path.join(salida, 'datos'), { recursive: true });
mkdirSync(path.join(salida, 'capturas'), { recursive: true });

for (const pg of paginas) {
  if (soloUna && pg.archivo !== soloUna) continue;
  for (const ancho of anchos) {
    const movil = ancho < 600;
    const escala = movil ? 2 : 1;
    const { cdp, evaluar, dormir, cerrar, alEvento } = await abrirChrome({ ancho, alto: movil ? 852 : 950, escala, movil });
    const red = new Map();
    alEvento((metodo, p) => {
      if (metodo === 'Network.requestWillBeSent') red.set(p.requestId, { url: p.request.url, tipo: p.type || '', iniciador: (p.initiator && p.initiator.url) || p.initiator?.type || '', estado: 0, mime: '', bytes: 0 });
      if (metodo === 'Network.responseReceived') { const r = red.get(p.requestId); if (r) { r.estado = p.response.status; r.mime = p.response.mimeType; r.largo = Number((p.response.headers || {})['content-length'] || (p.response.headers || {})['Content-Length'] || 0); } }
      if (metodo === 'Network.loadingFinished') { const r = red.get(p.requestId); if (r) r.bytes = p.encodedDataLength; }
    });
    try {
      await cdp('Page.enable');
      await cdp('Network.enable');
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await cdp('Page.navigate', { url: pg.url });
      await dormir(3000);
      await esperarLaPagina(evaluar);
      await recorrerLaPagina(evaluar, 0.6);
      await dormir(2500);
      await recorrerLaPagina(evaluar, 0.6);
      await dormir(1500);
      const datos = await evaluar(guion);
      writeFileSync(path.join(salida, 'datos', `medida-${pg.archivo}-${ancho}.json`), JSON.stringify(datos, null, 2));
      writeFileSync(path.join(salida, 'datos', `red-${pg.archivo}-${ancho}.json`), JSON.stringify([...red.values()], null, 2));
      await evaluar('window.scrollTo(0, 0)');
      await dormir(700);
      const alto = await evaluar('Math.ceil(document.documentElement.scrollHeight)');
      const png = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: ancho, height: alto, scale: movil ? 1 : 1 } });
      const archivo = path.join(salida, 'capturas', `${pg.archivo}-${ancho}.png`);
      writeFileSync(archivo, Buffer.from(png.data, 'base64'));
      console.log(`${pg.archivo} @${ancho}: ${datos.secciones.length} secciones · alto ${alto}px · ${red.size} peticiones`);
    } catch (e) {
      console.error(`FALLÓ ${pg.archivo} @${ancho}: ${e.message}`);
    } finally {
      await cerrar();
    }
    await new Promise((r) => setTimeout(r, 4000)); // pausa cortés con el hosting
  }
}
