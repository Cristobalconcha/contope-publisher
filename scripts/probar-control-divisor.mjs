/**
 * El control del divisor en el editor.
 *
 * Comprobación estática, sin navegador: lo que se verifica es que el panel
 * exista, que sólo aparezca donde el catálogo lo declara, que abra la
 * biblioteca de Medios pidiendo SVG, y —lo que más importa— que la máscara de
 * previsualización NO termine escrita en el documento guardado.
 *
 * Esa última es la que vale. Una máscara es previsualización, no contenido: si
 * se guardara, la página publicada llevaría una regla que allá no hace falta,
 * porque ahí el dibujo es el SVG en línea que pone el servidor.
 *
 * El comportamiento en el navegador hay que mirarlo a mano: abrir el editor,
 * seleccionar una sección y elegir una forma.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (r) => readFileSync(path.join(raiz, r), 'utf8');

const insp = leer('contope-publisher/assets/js/cod-computed-inspector.js');
const beh = leer('contope-publisher/assets/js/cod-behaviors.js');
const admin = leer('contope-publisher/includes/class-cod-canvas-editor-admin.php');
const cat = JSON.parse(leer('contope-publisher/catalogo/primitivas.json'));

let fallas = 0;
const ok = (q, c) => { console.log((c ? '  ok     ' : '  FALLA  ') + q); if (!c) fallas++; };

console.log('\n== el panel del inspector ==');
ok('existe renderDivisorPanel', insp.includes('function renderDivisorPanel'));
ok('se engancha al ensamblado', insp.includes('const divisorPanel = renderDivisorPanel('));
ok('sólo aparece si el catálogo lo declara', insp.includes('function admiteDivisor'));
ok('abre la biblioteca de Medios', insp.includes('wp.media'));
ok('pide sólo SVG', insp.includes('image/svg+xml'));
ok('guarda la ruta sin el dominio', insp.includes('function rutaRelativa'));
ok('trae los controles de Divi', ['Dónde', 'Alto', 'Color', 'Repeticiones', 'Voltear'].every((c) => insp.includes(c)));
ok('permite quitarlo', insp.includes('Quitar el divisor'));

/**
 * Las capas. Lo que vale comprobar acá es que el editor y el servidor escriban
 * el MISMO marcado: si se desincronizaran, el divisor se vería de una forma al
 * componer y de otra al publicar, que es el defecto más caro de encontrar.
 */
console.log('\n== las capas ==');
ok('el panel las ofrece', insp.includes('Agregar una capa'));
ok('distingue una capa de la principal', insp.includes('function esCapa') && insp.includes('data-cod-divisor-capa'));
ok('no toma la primera pieza por principal', insp.includes('existentes.find((d) => !esCapa(d))'));
ok('escribe opacidad y desplazamiento', insp.includes('--cod-divisor-alfa:') && insp.includes('--cod-divisor-dx:'));
ok('y el sobreancho que evita el hueco', insp.includes('--cod-divisor-margen:'));
ok('las dibuja detrás de la principal', insp.includes('piezas.reverse()'));
ok('respeta el mismo tope que el servidor',
  insp.includes('DIVISOR_MAX_CAPAS = 4') && cat.familias?.divisor?.propiedades?.capas?.maximo === 4);
ok('el catálogo declara qué lleva una capa',
  ['opacidad', 'desplazamiento', 'alto'].every((c) => !!cat.familias?.divisor?.propiedades?.capas?.capa?.[c]));
ok('la previsualización del editor muestra la opacidad', beh.includes('opacity:var(--cod-divisor-alfa,1);'));
ok('y el desplazamiento', beh.includes('mask-position:var(--cod-divisor-dx,0px)'));

console.log('\n== la máscara no ensucia el documento ==');
ok('el inspector no la escribe en el estilo guardado', !insp.includes('estilo.push(`-webkit-mask-image'));
ok('la pone el runtime del editor', beh.includes('function pintarDivisores'));
ok('y sólo dentro del editor', beh.includes('if (!opts.editorPreview) return;'));
ok('se repinta al cambiar el árbol', beh.includes('MutationObserver'));
ok('se limpia al salir', beh.includes('observador.disconnect()'));

console.log('\n== lo que el panel necesita del entorno ==');
ok('se encola la biblioteca de Medios en el editor', admin.includes('wp_enqueue_media();'));
ok('el catálogo declara la familia', !!cat.familias?.divisor);
ok('la forma es un recurso, no una lista cerrada', cat.familias?.divisor?.propiedades?.forma?.control === 'recurso');
ok('se le ofrece a una sección', (cat.taxonomias?.section?.diseno || []).includes('divisor'));
ok('y a un bloque', (cat.taxonomias?.group?.diseno || []).includes('divisor'));

console.log('');
if (fallas === 0) { console.log('probar-control-divisor.mjs   TODO OK'); process.exit(0); }
console.log(`probar-control-divisor.mjs   ${fallas} falla(s)`);
process.exit(1);
