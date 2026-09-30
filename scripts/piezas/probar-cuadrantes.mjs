/**
 * Retrata el módulo de cuadrantes en reposo y con cada uno activo.
 *
 * Existe porque un behavior no se comprueba leyendo el HTML: hay que pincharlo
 * y mirar dónde quedó cada cosa. El informe de quien lo construye no es prueba.
 *
 * Uso: node probar-cuadrantes.mjs <url> <selector-seccion> <carpeta>
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from './chrome.mjs';

const [url, selector, destino] = process.argv.slice(2);
if (!url || !selector || !destino) {
  console.error('faltan argumentos: <url> <selector-seccion> <carpeta>');
  process.exit(1);
}
mkdirSync(destino, { recursive: true });

const ANCHO = Number(process.env.ANCHO || 1280);
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: ANCHO, alto: 1000, escala: 2 });

await cdp('Page.enable');
// Sin movimiento. Chrome sin ventana no avanza las transiciones entre cuadros:
// al capturar deja las imágenes a medio camino (miniaturas más anchas que altas
// que parecen montarse sobre el texto) y da por medida el estado final. Lo que
// se retrata acá es la disposición final, así que se pide reduced-motion, que
// es un estado real del módulo (cambia igual, sin animar).
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await cdp('Page.navigate', { url });
await dormir(1500);
await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);
await dormir(1800);

async function retratar(nombre) {
  const c = await evaluar(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: Math.floor(r.left + scrollX), y: Math.floor(r.top + scrollY), w: Math.ceil(r.width), h: Math.ceil(r.height) };
  })()`);
  if (!c) throw new Error('no encontré ' + selector);
  const png = await cdp('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 },
  });
  const salida = path.join(destino, nombre + '.png');
  writeFileSync(salida, Buffer.from(png.data, 'base64'));
  console.log(nombre.padEnd(16) + c.w + '×' + c.h);
}

// Lo que el runtime dice de sí mismo, que es más fiable que mirar clases.
const estado = () => evaluar(`(() => {
  const r = document.querySelector('[data-cod-behavior="cuadrantes"]');
  if (!r) return { hay: false };
  const d = (k) => r.getAttribute('data-cod-cuadrantes-' + k);
  const minis = [...r.querySelectorAll('[data-cod-cuadrantes-rol]')].map((e) => ({
    item: e.getAttribute('data-cod-cuadrantes-item'),
    rol: e.getAttribute('data-cod-cuadrantes-rol'),
    caja: (() => { const b = e.getBoundingClientRect(); return Math.round(b.width) + '×' + Math.round(b.height) + ' @ ' + Math.round(b.left) + ',' + Math.round(b.top); })(),
  }));
  return { hay: true, listo: d('listo'), estado: d('estado'), activo: d('activo'), lado: d('lado'), esquina: d('esquina'), minis };
})()`);

const e0 = await estado();
if (!e0.hay) throw new Error('el runtime no montó: no hay nodo con data-cod-behavior="cuadrantes"');
console.log('montado:', e0.listo, '· estado inicial:', e0.estado);
await retratar('reposo');

for (const n of [1, 2, 3, 4]) {
  await evaluar(`(() => {
    const r = document.querySelector('[data-cod-behavior="cuadrantes"]');
    const b = r.querySelectorAll('button.cod-cuadrantes__disparador')[${n - 1}];
    if (b) b.click();
  })()`);
  await dormir(1100);
  const e = await estado();
  console.log('activo ' + n + ' →  estado:' + e.estado + ' activo:' + e.activo + ' lado:' + e.lado + ' esquina:' + e.esquina);
  e.minis.filter((m) => m.rol === 'miniatura').forEach((m) => console.log('      mini ' + m.item + '  ' + m.caja));
  await retratar('activo-' + n);
}

await cerrar();
