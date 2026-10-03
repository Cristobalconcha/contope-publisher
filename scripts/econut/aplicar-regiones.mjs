/**
 * El ciclo completo para una REGIÓN compartida: encabezado y pie.
 *
 * Es el hermano de `aplicar.mjs`, que hace lo mismo con la página 20. Están
 * separados porque una región no se escribe igual: va con `pageId: 0` —la
 * única forma de escribir una región por MCP— y su revisión se lee por
 * `documentId`, no por número de página.
 *
 * Y están los mismos cuatro pasos encadenados por la misma razón: el apply
 * exige el previewId exacto de SU preview y la revisión que está en ese
 * momento, así que hacerlo a mano es donde se cuelan los errores.
 *
 * Uso:
 *   node aplicar-regiones.mjs              las dos regiones
 *   node aplicar-regiones.mjs pie          sólo el pie
 *   node aplicar-regiones.mjs --probar     genera y previsualiza, sin escribir
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const soloProbar = process.argv.includes('--probar');
const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const REGIONES = {
  encabezado: { archivo: 'region-header.json', documentId: 'cod-region-header', variable: 'REV_HEADER' },
  pie: { archivo: 'region-footer.json', documentId: 'cod-region-footer', variable: 'REV_FOOTER' },
};

const cuales = pedidas.length ? pedidas : Object.keys(REGIONES);
for (const c of cuales) {
  if (!REGIONES[c]) {
    console.error(`no conozco la región "${c}". Las que hay: ${Object.keys(REGIONES).join(', ')}`);
    process.exit(1);
  }
}

const llamar = (herramienta, archivo) => {
  const args = ['lienzo.mjs', herramienta];
  if (archivo) args.push(archivo);
  const salida = execFileSync('node', args, { cwd: aqui, encoding: 'utf8', maxBuffer: 1e8, env: process.env });
  const cuerpo = salida.split('\n').slice(1).join('\n').trim();
  try { return JSON.parse(cuerpo); } catch { return { _texto: cuerpo }; }
};

let fallo = false;

for (const nombre of cuales) {
  const { archivo, documentId, variable } = REGIONES[nombre];
  console.log(`\n── ${nombre} (${documentId})`);

  // 1. La revisión que está ahora. Nunca suponerla: el apply la compara.
  writeFileSync(`${aqui}/.estado-region.json`, JSON.stringify({ pageId: 0, documentId }));
  const estado = llamar('cod_get_canvas_page_state', '.estado-region.json');
  const revision = estado?.document?.revision;
  if (typeof revision !== 'number') {
    console.error(`   no pude leer la revisión: ${JSON.stringify(estado).slice(0, 280)}`);
    fallo = true;
    continue;
  }
  console.log(`   revisión actual: ${revision}`);

  // 2. Generar las dos regiones con esa revisión para la que toca. El guion
  //    genera ambas de una vez; la que no se aplica queda con una revisión que
  //    no se usa, y no estorba porque sólo se envía la de este ciclo.
  execFileSync('node', ['componer-regiones.mjs'], {
    cwd: aqui, encoding: 'utf8', env: { ...process.env, [variable]: String(revision) },
  });

  // 3. Previsualizar.
  const previo = llamar('cod_preview_canvas_composition', archivo);
  if (!previo?.previewId) {
    console.error(`   la previsualización falló: ${(previo?._texto || JSON.stringify(previo)).slice(0, 400)}`);
    fallo = true;
    continue;
  }
  console.log('   preview ok');

  if (soloProbar) {
    console.log('   (--probar: no escribo)');
    continue;
  }

  // 4. Aplicar. Sólo las claves que el servidor espera: cualquier otra lo hace
  //    rechazar el payload entero.
  const receta = JSON.parse(readFileSync(`${aqui}/${archivo}`, 'utf8'));
  receta.previewId = previo.previewId;
  const salida = `aplicar-region-${nombre}.json`;
  writeFileSync(`${aqui}/${salida}`, JSON.stringify(receta, null, 2));
  const hecho = llamar('cod_apply_canvas_composition', salida);
  if (!hecho?.document?.revision) {
    console.error(`   el apply falló: ${(hecho?._texto || JSON.stringify(hecho)).slice(0, 400)}`);
    fallo = true;
    continue;
  }
  console.log(`   aplicado · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);
}

console.log('');
process.exit(fallo ? 1 : 0);
