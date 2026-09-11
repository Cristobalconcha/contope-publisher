/**
 * Pruebas de las salvaguardas del guardado.
 *
 * Correr con:  node contope-publisher/tools/cod-salvaguardas.test.mjs
 *
 * Las pruebas 2, 5 y 7 son regresiones: cubren defectos que ocurrieron de
 * verdad en producción y costaron horas. Si alguna vuelve a fallar, el
 * defecto volvió.
 */
import { aplicarSalvaguardas, selectoresDe, bloquesDe } from './cod-salvaguardas.mjs';

let fallos = 0;
const prueba = (nombre, condicion, detalle = '') => {
  if (condicion) console.log('  ✓ ' + nombre);
  else { console.log('  ✗ ' + nombre + (detalle ? '  → ' + detalle : '')); fallos++; }
};

console.log('\n── 1 · Rescate: una regla que Grapes no conoce vuelve ──');
{
  const antes = '.hero{color:red}.fuera-del-editor{padding:10px}';
  const despues = '.hero{color:blue}';
  const { css, informe } = aplicarSalvaguardas(antes, despues);
  prueba('repone la regla ajena', css.includes('.fuera-del-editor'));
  prueba('cuenta 1 repuesta', informe.repuestas === 1, 'fueron ' + informe.repuestas);
  prueba('respeta el cambio pedido', css.includes('color:blue'));
  prueba('no revive la versión vieja', !css.includes('color:red'));
}

console.log('\n── 2 · El defecto de los @media: no debe duplicar ──');
{
  const media = '@media (max-width: 900px){.a{color:red}}';
  const antes = media;
  const despues = media;
  const { css, informe } = aplicarSalvaguardas(antes, despues);
  const copias = (css.match(/@media/g) || []).length;
  prueba('no repone un @media que ya está', copias === 1, copias + ' copias');
  prueba('informa 0 repuestas', informe.repuestas === 0);
}

console.log('\n── 3 · Copias ya acumuladas se colapsan a una ──');
{
  const media = '@media (max-width: 900px){.a{color:red}}';
  const antes = media + media + media;
  const despues = '.otra{color:blue}';
  const { css } = aplicarSalvaguardas(antes, despues);
  const copias = (css.match(/@media/g) || []).length;
  prueba('tres copias entran, una sale', copias === 1, copias + ' copias');
}

console.log('\n── 4 · Un selector quitado a propósito NO se repone ──');
{
  const antes = '.vieja{color:red}.otra{color:blue}';
  const despues = '.otra{color:blue}';
  const { css, informe } = aplicarSalvaguardas(antes, despues, { selectoresTocados: ['.vieja'] });
  prueba('la regla quitada se queda quitada', !css.includes('.vieja'));
  prueba('no la cuenta como pérdida', informe.selectoresPerdidos.length === 0, JSON.stringify(informe.selectoresPerdidos));
}

console.log('\n── 5 · Abreviada con variable: detecta el fondo que se perdería ──');
{
  const antes = '.contacto{background: var(--oliva-700);color:#fff}';
  const despues = '.contacto{color:#fff}';
  const { informe } = aplicarSalvaguardas(antes, despues);
  prueba('detecta 1 en riesgo', informe.abreviadasEnRiesgo.length === 1, JSON.stringify(informe.abreviadasEnRiesgo));
  prueba('nombra la propiedad', (informe.abreviadasEnRiesgo[0] || {}).prop === 'background');
  prueba('marca que hay pérdida', informe.hayPerdida === true);
}

console.log('\n── 6 · La forma larga NO se marca como riesgo ──');
{
  const antes = '.contacto{background-color: var(--oliva-700)}';
  const despues = '.contacto{background-color: var(--oliva-700)}';
  const { informe } = aplicarSalvaguardas(antes, despues);
  prueba('no hay falsos positivos', informe.abreviadasEnRiesgo.length === 0);
  prueba('no marca pérdida', informe.hayPerdida === false);
}

console.log('\n── 7 · El escape que rompía los nombres con punto ──');
{
  const s = selectoresDe('.site-nav{color:red}.cls-1{color:blue}');
  prueba('.site-nav entero', s.has('.site-nav'), [...s].join(' | '));
  prueba('.cls-1 entero', s.has('.cls-1'), [...s].join(' | '));
}

console.log('\n── 8 · Un guardado sin pérdidas no inventa ninguna ──');
{
  const css = '.a{color:red}.b{color:blue}@media (max-width:900px){.a{color:green}}';
  const { informe } = aplicarSalvaguardas(css, css);
  prueba('cero repuestas', informe.repuestas === 0);
  prueba('cero perdidas', informe.selectoresPerdidos.length === 0);
  prueba('hayPerdida es falso', informe.hayPerdida === false);
}

console.log('\n── 9 · Anidamiento profundo no descuadra los bloques ──');
{
  const b = bloquesDe('@media (min-width:861px){.a{color:red}.b{color:blue}}.c{color:green}');
  prueba('dos bloques de primer nivel', b.length === 2, b.length + ' bloques');
  prueba('el @media viaja entero', b[0].includes('.a') && b[0].includes('.b'));
}

console.log('\n' + '─'.repeat(50));
console.log(fallos === 0 ? 'TODAS LAS PRUEBAS PASAN' : fallos + ' PRUEBA(S) FALLARON');
process.exit(fallos === 0 ? 0 : 1);
