/**
 * Pregunta al navegador con qué colores y tipografías PINTA de verdad un
 * sitio, en vez de deducirlos leyendo su hoja de estilos.
 *
 * Por qué: leyendo el CSS de econut.cl saqué la paleta equivocada — los
 * colores más repetidos eran los de Divi, no los del diseño. Lo que manda es
 * lo que se ve.
 */
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const URL_SITIO = process.argv[2] || 'https://econut.cl/';
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: 1280, alto: 900 });

await cdp('Page.enable');
await cdp('Page.navigate', { url: URL_SITIO });
await dormir(1500);
await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);
await dormir(1500);

const informe = await evaluar(`(() => {
  const cuenta = (mapa, clave) => { if (!clave) return; mapa[clave] = (mapa[clave] || 0) + 1; };
  const fondos = {}, textos = {}, familias = {};

  // Fondos: sólo de bloques grandes, que son los que dan el tono de la página.
  for (const e of document.querySelectorAll('section, div, header, footer')) {
    const r = e.getBoundingClientRect();
    if (r.width < 600 || r.height < 200) continue;
    const s = getComputedStyle(e);
    if (s.backgroundColor && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(s.backgroundColor)) cuenta(fondos, s.backgroundColor);
  }

  // Títulos: color y familia, que es donde vive el carácter.
  const titulos = [];
  for (const e of document.querySelectorAll('h1, h2, h3')) {
    const t = (e.textContent || '').replace(/\\s+/g, ' ').trim();
    if (t.length < 3 || t.length > 60) continue;
    const s = getComputedStyle(e);
    cuenta(textos, s.color);
    cuenta(familias, s.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
    if (titulos.length < 12) titulos.push({ t: t.slice(0, 42), color: s.color, fam: s.fontFamily.split(',')[0].replace(/['"]/g, ''), tam: s.fontSize, peso: s.fontWeight });
  }

  const cuerpo = getComputedStyle(document.body);
  const orden = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { fondos: orden(fondos), colorTitulos: orden(textos), familias: orden(familias), titulos,
           cuerpoFondo: cuerpo.backgroundColor, cuerpoColor: cuerpo.color, cuerpoFam: cuerpo.fontFamily.split(',')[0] };
})()`);

const hex = (c) => {
  const m = c.match(/\\d+/g);
  if (!m) return c;
  return '#' + m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
};

console.log('=== FONDOS de bloques grandes ===');
informe.fondos.forEach(([c, n]) => console.log('  ' + hex(c).padEnd(10) + String(n).padStart(3) + '   ' + c));
console.log('\n=== COLOR de los títulos ===');
informe.colorTitulos.forEach(([c, n]) => console.log('  ' + hex(c).padEnd(10) + String(n).padStart(3) + '   ' + c));
console.log('\n=== FAMILIAS de los títulos ===');
informe.familias.forEach(([f, n]) => console.log('  ' + String(n).padStart(3) + '  ' + f));
console.log('\n=== CUERPO ===');
console.log('  fondo ' + hex(informe.cuerpoFondo) + ' · texto ' + hex(informe.cuerpoColor) + ' · ' + informe.cuerpoFam);
console.log('\n=== TÍTULOS, uno por uno ===');
informe.titulos.forEach((t) => console.log('  ' + t.t.padEnd(44) + hex(t.color).padEnd(9) + t.fam.padEnd(22) + t.tam.padEnd(7) + t.peso));

await cerrar();
