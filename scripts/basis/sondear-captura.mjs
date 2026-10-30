/** Prueba de método de captura: guarda el sitio completo con dos técnicas para ver si una diferencia es real o un artefacto. Uso: node sondear-captura.mjs <url> <ancho> <prefijo-salida> */
import { writeFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';
const [url, ancho, pref] = process.argv.slice(2);
const movil = Number(ancho) < 600;
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: Number(ancho), alto: movil ? 852 : 950, escala: 1, movil });
try {
  await cdp('Page.enable');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp('Page.navigate', { url });
  await dormir(3500); await esperarLaPagina(evaluar); await recorrerLaPagina(evaluar, 0.6); await dormir(1500);
  await evaluar("document.querySelectorAll('img[loading=lazy]').forEach((i)=>{i.loading='eager'})"); await dormir(1500);
  const alto = await evaluar('Math.ceil(document.documentElement.scrollHeight)');
  let png = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: Number(ancho), height: alto, scale: 1 } });
  writeFileSync(pref + '-beyond.png', Buffer.from(png.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: Number(ancho), height: alto, deviceScaleFactor: 1, mobile: movil });
  await dormir(2000); await evaluar('scrollTo(0,0)'); await dormir(800);
  png = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(pref + '-alto.png', Buffer.from(png.data, 'base64'));
  console.log('alto', alto, 'tras redimensionar', await evaluar('document.documentElement.scrollHeight'));
} finally { await cerrar(); }
