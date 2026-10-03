/**
 * La ventana contextual del lápiz.
 *
 * Comprobación estática, sin navegador. Lo que verifica:
 *  - que el disparador sea un LÁPIZ y no un engranaje —Cristóbal, 2026-10-03:
 *    «prefiero un lápiz, no un engranaje, porque son las características
 *    visuales»—;
 *  - que las pestañas sean dos, Configuración y Diseño, sin la tercera de
 *    «Avanzado» que tiene Divi;
 *  - que las familias nuevas del catálogo tengan control en la ventana, que es
 *    lo que separa «existe la regla» de «se puede usar sin componer a mano»;
 *  - que girar y escalar se escriban JUNTOS, porque `transform` es una sola
 *    propiedad y escribir uno por su lado borra al otro.
 *
 * El comportamiento en el navegador hay que mirarlo a mano: abrir el editor,
 * seleccionar un objeto y pinchar el lápiz.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modal = readFileSync(path.join(raiz, 'contope-publisher/assets/js/cod-inspector-modal.js'), 'utf8');
const cat = JSON.parse(readFileSync(path.join(raiz, 'contope-publisher/catalogo/primitivas.json'), 'utf8'));

let fallas = 0;
const ok = (q, c) => { console.log((c ? '  ok     ' : '  FALLA  ') + q); if (!c) fallas++; };

console.log('\n== el disparador ==');
ok('es un lápiz, no un engranaje', modal.includes('LAPIZ_SVG') && !modal.includes('GEAR_SVG'));
ok('se abre para cualquier objeto', modal.includes('function llevaEngranaje'));

console.log('\n== las pestañas ==');
ok('Configuración', modal.includes("'Configuración'"));
ok('Diseño', modal.includes("'Diseño'"));
ok('y NO una tercera de «Avanzado», que es el cajón de CSS de Divi', !modal.includes("'Avanzado'"));

console.log('\n== posición ==');
ok('ofrece pegada como un modo más y no como un sistema aparte', modal.includes("['sticky', 'Pegada al desplazar']"));
ok('una pegada sin distancia se resuelve sola', modal.includes("posSelect.value === 'sticky' && !desdeInput.value.trim()"));
ok('tiene orden de capas', modal.includes("applyDesignStyle(target, 'z-index'"));

console.log('\n== desborde ==');
ok('tiene control', modal.includes("applyDesignStyle(target, 'overflow'"));
ok('y avisa de que recortar rompe una pegada, que es donde nunca se mira',
  modal.includes('function avisarRecorte'));

console.log('\n== transformación ==');
ok('ofrece girar', modal.includes("'Girar'"));
ok('y escalar', modal.includes("'Escalar'"));
ok('los escribe juntos, porque transform es UNA propiedad',
  modal.includes('function aplicarTransformacion') && modal.includes("partes.join(' ')"));
ok('y lee lo que ya hubiera puesto', modal.includes('/rotate\\(([^)]+)\\)/') || modal.includes('rotate\\(([^)]+)\\)'));

console.log('\n== lo que el catálogo declara y la ventana todavía no ==');
// No es una falla: deja a la vista qué familias sólo se alcanzan componiendo.
const CON_CONTROL = ['posicion', 'desborde', 'transformacion'];
const sinControl = Object.keys(cat.familias)
  .filter((k) => k !== '_' && !CON_CONTROL.includes(k));
console.log('  (sólo por composición o por el panel lateral: ' + sinControl.join(', ') + ')');

console.log('');
if (fallas === 0) { console.log('probar-inspector-modal.mjs   TODO OK'); process.exit(0); }
console.log(`probar-inspector-modal.mjs   ${fallas} falla(s)`);
process.exit(1);
