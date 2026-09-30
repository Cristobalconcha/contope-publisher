/**
 * Hoja de contactos de las imágenes del sitio: cada una con su nombre debajo.
 *
 * Existe porque asignar una foto por el nombre del archivo ya falló dos veces
 * (un logotipo de certificación que era una fotografía, y una nuez en una rama
 * puesta como «interior de la planta»). Las fotos se eligen mirándolas.
 */
import { writeFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina } from '../piezas/chrome.mjs';
import path from 'node:path';

const M = 'http://localhost:8891/wp-content/uploads/2026/09/';
const archivos = [
  'Linea-de-seleccion-manual-limpia-scaled-1.jpg', 'Aerea-Econut-01.jpg',
  'Aerea-Econut-01-scaled-1.jpg', 'Plantaciones-1-scaled-1.jpg', 'Perspectiva-2.jpg',
  '1F6A0347_7-scaled-1.jpg', 'Nuez-en-saco.avif', 'partido-manual-2.avif',
  'Partido-Mecanico.avif', 'Control-de-huertos.avif',
  'd514ce_bd4f58c2fb644112944735865054300fmv2.avif', 'Sag.avif',
  'd514ce_2e9d60bac05b4469aaf35aef477c5f69mv2.avif',
  'Logo-BRC-2019.avif', 'Isotipos-Kosher.avif', 'Halal-Logo.avif', 'Made-in-Chile-log.avif',
  'd514ce_32d33a9f611747499c605679f39275f7mv2.avif',
];

const html = '<!doctype html><meta charset="utf-8"><style>' +
  'body{margin:0;background:#fff;font:12px/1.3 system-ui;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:14px}' +
  'figure{margin:0}img{width:100%;height:200px;object-fit:cover;background:#eee;display:block}' +
  'figcaption{padding:4px 0;word-break:break-all}</style>' +
  archivos.map((a) => '<figure><img src="' + M + a + '"><figcaption>' + a + '</figcaption></figure>').join('');
writeFileSync('hoja.html', html, 'utf8');

const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: 1200, alto: 900 });
await cdp('Page.enable');
await cdp('Page.navigate', { url: 'file:///' + path.resolve('hoja.html').split(path.sep).join('/') });
await dormir(2500);
await esperarLaPagina(evaluar);
await dormir(1500);
const alto = await evaluar('Math.ceil(document.documentElement.scrollHeight)');
const png = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: 1200, height: alto, scale: 1 } });
writeFileSync('hoja-contactos.png', Buffer.from(png.data, 'base64'));
console.log('hoja-contactos.png  1200×' + alto);
await cerrar();
