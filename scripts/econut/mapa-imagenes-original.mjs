/** Qué imagen usa el original en cada bloque, con su encabezado como referencia. */
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: 1440, alto: 950 });
await cdp('Page.enable');
await cdp('Page.navigate', { url: 'https://econut.cl/' });
await dormir(2500);
await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);
await dormir(2000);

const r = await evaluar(`(() => {
  const salida = [];
  for (const s of document.querySelectorAll('.et_pb_section')) {
    const titulo = s.querySelector('h1,h2,h3');
    const imgs = [...s.querySelectorAll('img')].map((i) => ({
      archivo: (i.currentSrc || i.src || '').split('/').pop(),
      caja: Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height),
    })).filter((i) => i.archivo);
    // También los fondos, que en Divi llevan mucha foto.
    const fondos = [];
    for (const e of [s, ...s.querySelectorAll('.et_pb_row, .et_pb_column, .et_pb_module')]) {
      const bi = getComputedStyle(e).backgroundImage;
      if (bi && bi !== 'none' && bi.includes('url(')) {
        const m = bi.match(/url\\(["']?([^"')]+)/);
        if (m) fondos.push(m[1].split('/').pop());
      }
    }
    if (!imgs.length && !fondos.length) continue;
    salida.push({
      titulo: titulo ? titulo.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40) : '(sin título)',
      imgs, fondos: [...new Set(fondos)],
    });
  }
  return salida;
})()`);

for (const s of r) {
  console.log('\n=== ' + s.titulo);
  s.imgs.forEach((i) => console.log('   img    ' + i.caja.padEnd(11) + i.archivo));
  s.fondos.forEach((f) => console.log('   fondo  ' + ' '.repeat(11) + f));
}
await cerrar();
