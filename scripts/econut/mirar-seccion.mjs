/**
 * Mira UNA sección por dentro: qué piezas tiene, dónde está cada una y cuánto
 * mide. Sirve para reconstruir una sección del original pieza por pieza en vez
 * de aproximarla mirando una captura.
 *
 * Uso:
 *   node mirar-seccion.mjs <url> <texto que identifica la sección>
 *   node mirar-seccion.mjs https://econut.cl Certificaciones
 */
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const [url, aguja] = process.argv.slice(2);
if (!url || !aguja) {
  console.error('uso: node mirar-seccion.mjs <url> <texto de la sección>');
  process.exit(1);
}

const ANCHO = Number(process.env.ANCHO || 1900);
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: ANCHO, alto: 950, escala: 1 });
await cdp('Page.enable');
await cdp('Page.navigate', { url });
await dormir(2500);
await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);
await dormir(1200);

const guion = `(() => {
  const aguja = ${JSON.stringify(aguja)}.toLowerCase();
  const todas = document.querySelectorAll('.et_pb_section, .cod-section, section');
  let sec = null;
  for (const s of todas) {
    if ((s.textContent || '').toLowerCase().indexOf(aguja) !== -1) { sec = s; break; }
  }
  if (!sec) return { error: 'no encontré una sección que contenga ese texto' };
  const R = sec.getBoundingClientRect();
  const cs = getComputedStyle(sec);
  const limpiar = (t) => t.split(/[ \\t\\n\\r]+/).join(' ').trim();
  // Con --todo mira CUALQUIER elemento con tamaño, no sólo los conocidos. Hace
  // falta porque un módulo de Divi puede estar dentro de un bloque de código
  // con sus propias clases, y entonces la lista de siempre no lo ve: la
  // sección parecía tener nada más que su título.
  const todo = ${JSON.stringify(process.argv.includes('--todo'))};
  const piezas = [];
  const lista = todo
    ? sec.querySelectorAll('*')
    : sec.querySelectorAll('h1,h2,h3,h4,p,li,img,video,.swiper,.et_pb_module,.cod-node');
  for (const el of lista) {
    const r = el.getBoundingClientRect();
    if (r.height < 10 || r.width < 10) continue;
    const ecs = getComputedStyle(el);
    if (todo) {
      // Sin filtro saldrían cientos de envoltorios vacíos: quedarse con lo que
      // pinta algo (fondo, borde, imagen) o es medio o texto propio.
      const pinta = ecs.backgroundColor !== 'rgba(0, 0, 0, 0)'
        || ecs.backgroundImage !== 'none'
        || parseFloat(ecs.borderTopWidth) > 0;
      const esMedio = el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'svg';
      const tieneTextoPropio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!pinta && !esMedio && !tieneTextoPropio) continue;
    }
    const esMedia = el.tagName === 'IMG' || el.tagName === 'VIDEO';
    piezas.push({
      tag: el.tagName,
      clase: String(el.className).split(' ').slice(0, 2).join('.').slice(0, 40),
      que: esMedia ? ((el.currentSrc || el.src || '').split('/').pop() || '').slice(0, 44)
                   : limpiar(el.textContent || '').slice(0, 44),
      x: Math.round(r.left - R.left) + '→' + Math.round(r.right - R.left),
      y: Math.round(r.top - R.top),
      alto: Math.round(r.height),
      size: Math.round(parseFloat(ecs.fontSize) || 0),
      fondo: ecs.backgroundColor === 'rgba(0, 0, 0, 0)' ? '' : ecs.backgroundColor
    });
  }
  return {
    alto: Math.round(R.height),
    ancho: Math.round(R.width),
    fondo: cs.backgroundColor,
    tieneFoto: cs.backgroundImage.indexOf('url(') !== -1,
    fondoImagen: cs.backgroundImage.slice(0, 150),
    fondoSize: cs.backgroundSize,
    fondoPos: cs.backgroundPosition,
    fondoRepeat: cs.backgroundRepeat,
    padding: cs.padding,
    piezas: piezas.slice(0, 40)
  };
})()`;

const r = await evaluar(guion);
if (r.error) {
  console.log(r.error);
} else {
  console.log(`\nsección: ${r.ancho}x${r.alto}  ·  fondo ${r.fondo}${r.tieneFoto ? ' + FOTO' : ''}  ·  padding ${r.padding}`);
  if (r.tieneFoto) console.log(`  ${r.fondoImagen}
  size ${r.fondoSize} · pos ${r.fondoPos} · repeat ${r.fondoRepeat}`);
  console.log('');
  console.log(`${'tag'.padEnd(7)} ${'clase'.padEnd(26)} ${'x'.padEnd(13)} ${'y'.padEnd(6)} ${'alto'.padEnd(6)} ${'px'.padEnd(4)} ${'fondo'.padEnd(22)} qué`);
  console.log('-'.repeat(112));
  for (const p of r.piezas) {
    console.log(`${p.tag.padEnd(7)} ${p.clase.padEnd(26)} ${p.x.padEnd(13)} ${String(p.y).padEnd(6)} ${String(p.alto).padEnd(6)} ${String(p.size).padEnd(4)} ${(p.fondo||"").padEnd(22)} ${p.que}`);
  }
}
await cerrar();
