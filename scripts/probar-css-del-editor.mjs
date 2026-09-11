import { readFileSync } from 'node:fs';

// Se extraen las funciones TAL COMO quedaron en el archivo que se despliega,
// no una copia escrita para la prueba: si el archivo cambia, la prueba lo ve.
const fuente = readFileSync(
  'C:/Users/Cristobal concha/open-codesign-wordpress/contope-publisher/assets/js/cod-editor-core.js',
  'utf8'
);

const SALTO = new RegExp('\\r?\\n');
function extraer(nombre) {
  const lineas = fuente.split(SALTO);
  const i = lineas.findIndex((l) => l.includes('function ' + nombre + '('));
  if (i < 0) throw new Error('no está ' + nombre);
  const sangria = lineas[i].match(new RegExp('^\\s*'))[0];
  for (let j = i + 1; j < lineas.length; j++) {
    if (lineas[j] === sangria + '}') return lineas.slice(i, j + 1).join('\n');
  }
  throw new Error('no encontré el cierre de ' + nombre);
}

const codigo = ['bloquesDeCss', 'claveDeRegla', 'dedupeCssRules', 'restarReglasConocidas']
  .map(extraer)
  .join('\n');
const api = new Function(
  codigo + '\nreturn {bloquesDeCss, claveDeRegla, dedupeCssRules, restarReglasConocidas};'
)();
const { dedupeCssRules, restarReglasConocidas } = api;

let fallos = 0;
const prueba = (nombre, ok, detalle = '') => {
  if (ok) console.log('  ✓ ' + nombre);
  else {
    console.log('  ✗ ' + nombre + (detalle ? '  → ' + detalle : ''));
    fallos++;
  }
};
const llaves = (s) => [(s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length];
const sinEspacios = (s) => s.replace(/\s+/g, '');

console.log('\n── 1 · un @media sobrevive intacto (el defecto que rompía el móvil) ──');
{
  const entrada = '.a{color:red}@media (max-width:900px){.b{color:blue}}.c{color:green}';
  const salida = dedupeCssRules(entrada);
  const [ab, ce] = llaves(salida);
  prueba('llaves equilibradas', ab === ce, ab + '/' + ce);
  prueba('.c queda FUERA del @media', sinEspacios(salida).endsWith('}}.c{color:green}'), salida);
}

console.log('\n── 2 · los cuatro documentos reales no pierden ni una llave ──');
{
  const base = 'C:/Users/Cristobal concha/respaldo-santaluisa-2026-09-11T14-33-37-758Z/';
  for (const n of ['inicio', 'diferenciales', 'preguntas', 'contacto']) {
    const css = JSON.parse(readFileSync(base + n + '.json', 'utf8')).css;
    const salida = dedupeCssRules(css);
    const [a1, c1] = llaves(css);
    const [a2, c2] = llaves(salida);
    prueba(n.padEnd(14) + a1 + '/' + c1 + ' → ' + a2 + '/' + c2, a2 === c2);
    prueba(
      '   ' + n + ': los @media siguen ahí',
      (css.match(/@media/g) || []).length === (salida.match(/@media/g) || []).length
    );
  }
}

console.log('\n── 3 · duplicados exactos sí se colapsan ──');
{
  const salida = dedupeCssRules('.a{color:red}.a{color:red}.b{x:1}');
  prueba('una sola copia de .a', (salida.match(/\.a\{/g) || []).length === 1, salida);
  prueba('.b intacta', sinEspacios(salida).includes('.b{x:1}'), salida);
}

console.log('\n── 4 · el mismo selector en dos anchos NO es duplicado ──');
{
  const salida = dedupeCssRules('.a{color:red}@media (max-width:600px){.a{color:red}}');
  prueba('las dos sobreviven', (sinEspacios(salida).match(/\.a\{color:red\}/g) || []).length === 2, salida);
}

console.log('\n── 5 · restar lo que Grapes ya conoce (la duplicación al abrir) ──');
{
  const guardado = '* { box-sizing: border-box; } body {margin: 0;}*{box-sizing:border-box;}.hero{color:red}';
  const deGrapes = '*{box-sizing:border-box;}.hero{color:red}';
  const real = restarReglasConocidas(guardado, deGrapes);
  prueba('el reset repetido se va', (sinEspacios(real).match(/box-sizing/g) || []).length === 0, real);
  prueba('la regla que Grapes ya tiene se va', !real.includes('.hero'), real);
  prueba('la regla escrita a mano se queda', sinEspacios(real).includes('body{margin:0;}'), real);
}

console.log('\n── 6 · ciclo completo abrir→guardar sobre el documento real ──');
{
  const base = 'C:/Users/Cristobal concha/respaldo-santaluisa-2026-09-11T14-33-37-758Z/';
  const guardado = JSON.parse(readFileSync(base + 'preguntas.json', 'utf8')).css;
  const MARCA = '/* COD-CANVAS-EDITABLE-OVERRIDES */';
  // Grapes reexporta desde projectData: en la práctica, la misma hoja.
  const deGrapes = guardado;
  const real = restarReglasConocidas(guardado, deGrapes);
  const nuevo = real.trimEnd() + '\n\n' + MARCA + '\n' + dedupeCssRules(deGrapes);
  const [a, c] = llaves(nuevo);
  console.log('     antes ' + guardado.length + ' bytes  →  después ' + nuevo.length);
  prueba('no crece', nuevo.length <= guardado.length + MARCA.length + 4, guardado.length + ' → ' + nuevo.length);
  prueba('llaves equilibradas', a === c, a + '/' + c);

  // segunda vuelta: ya con marcador, tiene que quedar igual
  const i = nuevo.indexOf(MARCA);
  const fuente2 = nuevo.slice(0, i).trimEnd();
  const overrides2 = dedupeCssRules(nuevo.slice(i + MARCA.length).trim());
  const tercero = fuente2 + '\n\n' + MARCA + '\n' + dedupeCssRules(overrides2);
  prueba('la segunda vuelta no cambia nada', tercero.length === nuevo.length, nuevo.length + ' → ' + tercero.length);
}

console.log('\n── 7 · las reglas base de los módulos no se acumulan ──');
{
  // serializedCss() vuelve a pegar collectDynamicGroupCss() en CADA guardado,
  // encima de un sourceCss que ya trae la copia anterior. Se simulan cinco
  // ciclos de abrir→guardar con la misma regla base.
  const MARCA = '/* COD-CANVAS-EDITABLE-OVERRIDES */';
  const BASE = '.cod-dynamic-group{display:grid;gap:16px}';
  const deGrapes = '.hero{color:red}';
  let hoja = '.escrita-a-mano{color:blue}';
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const i = hoja.indexOf(MARCA);
    const fuente = i === -1 ? hoja : hoja.slice(0, i).trimEnd();
    // así compone serializedCss(), con el prefijo ya deduplicado
    hoja = dedupeCssRules(fuente.trimEnd() + '\n' + BASE) + '\n\n' + MARCA + '\n' + dedupeCssRules(deGrapes);
  }
  const copias = (sinEspacios(hoja).match(/\.cod-dynamic-group\{/g) || []).length;
  prueba('una sola copia tras cinco guardados', copias === 1, copias + ' copias');
  prueba('la regla escrita a mano sobrevive', hoja.includes('.escrita-a-mano'), hoja);
  prueba('la regla de Grapes sobrevive', hoja.includes('.hero'), hoja);
}

console.log('\n' + '─'.repeat(52));
console.log(fallos === 0 ? 'TODAS LAS PRUEBAS PASAN' : fallos + ' PRUEBA(S) FALLARON');
process.exit(fallos === 0 ? 0 : 1);
