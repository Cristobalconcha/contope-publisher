/**
 * Respalda el CONTENIDO de un sitio publicado, página por página.
 *
 * POR QUÉ EXISTE. Cristóbal, el 4 de octubre de 2026, antes de llevar a
 * producción las páginas recompuestas: «¿podrías hacer antes un backup del
 * sitio así nos aseguramos de volver fácilmente?».
 *
 * QUÉ RESPALDA, Y QUÉ NO. Esto guarda lo que una recomposición puede cambiar:
 * el documento de cada página (su HTML, su CSS y su composición si la tiene),
 * las regiones del sitio y las capacidades del plugin instalado. Con eso se
 * devuelve una página a como estaba.
 *
 * NO es un respaldo del servidor. No lleva la base de datos, ni los archivos
 * subidos, ni la configuración del tema o de los plugins —ahí vive, por
 * ejemplo, el contenedor de Tag Manager—. Para eso hace falta el panel del
 * hosting, y conviene hacerlo igual antes de cualquier cambio: es la red de
 * seguridad para todo lo que no sea contenido de página.
 *
 * SÓLO LEE. No escribe nada en el sitio. Las herramientas que usa son de
 * lectura (listar páginas, leer documento, leer composición, leer regiones).
 *
 * Uso:
 *   node scripts/respaldar-sitio.mjs                  respalda el sitio publicado
 *   node scripts/respaldar-sitio.mjs --en <carpeta>   lo deja en otra parte
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tool } from './cod-grapes-runner/lib-documento.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const indiceEn = process.argv.indexOf('--en');
const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const destino = indiceEn > -1
  ? path.resolve(process.argv[indiceEn + 1])
  : path.resolve(aqui, '..', '..', 'respaldos-santaluisa', `contenido-${sello}`);

mkdirSync(destino, { recursive: true });
console.log(`respaldo en: ${destino}\n`);

const guardar = (nombre, dato) => {
  const ruta = path.join(destino, nombre);
  mkdirSync(path.dirname(ruta), { recursive: true });
  const texto = typeof dato === 'string' ? dato : JSON.stringify(dato, null, 2);
  writeFileSync(ruta, texto);
  return texto.length;
};

const resumen = [];

// 1. Qué sabe hacer el plugin instalado. Importa para saber si una receta
//    hecha acá va a entrar allá: si la versión es anterior, no.
try {
  const caps = await tool('cod_get_capabilities', {});
  const bytes = guardar('capacidades.json', caps);
  console.log(`  capacidades del sitio                    ${bytes} B`);
  const v = caps?.adapter?.version || caps?.version || '(sin versión)';
  console.log(`  versión del adaptador: ${v}`);
} catch (e) {
  console.error(`  no pude leer las capacidades: ${e.message}`);
  process.exit(1);
}

// 2. Las páginas del lienzo.
const lista = await tool('cod_list_canvas_pages', {});
const paginas = lista?.pages || lista?.items || [];
console.log(`\n${paginas.length} páginas del lienzo\n`);

for (const p of paginas) {
  const id = p.pageId ?? p.id;
  const doc = p.documentId || '';
  const nombre = (p.title || `pagina-${id}`).replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase().replace(/^-|-$/g, '');

  const entrada = { pageId: id, documentId: doc, title: p.title, status: p.status, url: p.url };

  // El documento: HTML y CSS, que es lo que se reemplaza al recomponer.
  try {
    // Las DOS cosas: la herramienta las exige juntas. Con sólo pageId responde
    // «pageId y documentId son obligatorios» y el respaldo sale vacío sin que
    // nada falle, que es la peor forma de fallar para un respaldo.
    entrada.documento = await tool('cod_read_canvas_document', { pageId: id, documentId: doc });
  } catch (e) {
    entrada.documento = { error: e.message };
  }

  // La composición, si la tiene. Las páginas heredadas del HTML no la tienen,
  // y que no la tengan es justamente el motivo de todo esto.
  try {
    const c = await tool('cod_read_canvas_composition', { pageId: id });
    entrada.composicion = c;
    entrada.tieneComposicion = c?.found === true;
  } catch (e) {
    entrada.composicion = { error: e.message };
    entrada.tieneComposicion = false;
  }

  const bytes = guardar(`paginas/${String(id).padStart(4, '0')}-${nombre}.json`, entrada);
  const html = String(entrada.documento?.document?.html ?? entrada.documento?.html ?? '');
  console.log(`  pág ${String(id).padEnd(5)} ${(p.title || '').slice(0, 28).padEnd(30)} ${String(html.length).padStart(7)} B de HTML  ${entrada.tieneComposicion ? 'con composición' : 'sin composición'}  → ${bytes} B`);
  resumen.push({ pageId: id, documentId: doc, title: p.title, html: html.length, composicion: entrada.tieneComposicion });
}

// 3. Las regiones: el encabezado y el pie del sitio, que no son de ninguna
//    página pero sí se sirven con ellas.
try {
  const regiones = await tool('cod_get_canvas_page_state', { pageId: paginas[0]?.pageId ?? paginas[0]?.id });
  guardar('regiones.json', regiones);
  console.log(`\n  regiones y estado del sitio guardados`);
} catch (e) {
  console.log(`\n  (no pude leer las regiones: ${e.message})`);
}

guardar('resumen.json', { sitio: 'santaluisadepalpi.cl', fecha: new Date().toISOString(), paginas: resumen });
guardar('LEER-PRIMERO.md', [
  '# Respaldo de contenido — ' + new Date().toISOString().slice(0, 10),
  '',
  'Qué hay acá: el documento de cada página del lienzo (HTML, CSS y composición',
  'si la tiene), más las capacidades del plugin instalado en ese momento.',
  '',
  '## Para qué sirve',
  '',
  'Para devolver una página a como estaba antes de recomponerla. Cada archivo de',
  '`paginas/` trae el `documentId`, que es lo portable entre instalaciones; el',
  'número de página NO lo es y cambia de un sitio a otro.',
  '',
  '## Qué NO hay acá',
  '',
  'No es un respaldo del servidor: no lleva la base de datos, los archivos',
  'subidos, ni la configuración del tema o de los plugins. Ahí vive, por ejemplo,',
  'el contenedor de Google Tag Manager (opción `cod_medicion`), que por eso mismo',
  'no corre riesgo al recomponer una página. Para lo demás, respaldo del hosting.',
  '',
  '## Además',
  '',
  'Cada aplicación de una composición deja su propio respaldo en el sitio',
  '(`snapshot`), así que hay dos vías de vuelta y no una.',
].join('\n'));

const vacias = resumen.filter((r) => r.html === 0);
if (vacias.length === resumen.length) {
  console.error(`
RESPALDO INÚTIL: las ${resumen.length} páginas vinieron sin HTML.`);
  console.error('No se puede confiar en esto para volver atrás. Revisar antes de seguir.');
  process.exit(1);
}
if (vacias.length > 0) {
  console.error(`
OJO: ${vacias.length} páginas vinieron sin HTML: ` + vacias.map((v) => v.pageId).join(', '));
}

const conComposicion = resumen.filter((r) => r.composicion).length;
console.log(`\n${resumen.length} páginas respaldadas · ${conComposicion} con composición, ${resumen.length - conComposicion} sin ella`);
console.log(`\n${destino}`);
