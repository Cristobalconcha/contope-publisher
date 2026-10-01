/**
 * El ciclo completo de una corrección: leer la revisión actual, generar,
 * previsualizar y aplicar.
 *
 * Existe porque el circuito son cuatro pasos encadenados —el apply exige el
 * previewId exacto de SU preview y la revisión que está en ese momento— y
 * hacerlo a mano en cada iteración es donde se cuelan los errores: una
 * revisión vieja, un previewId de otra corrida, una clave de más en el
 * payload (el servidor rechaza cualquier campo que no espere).
 *
 * Uso:
 *   node aplicar.mjs            genera, previsualiza y aplica
 *   node aplicar.mjs --probar   sólo genera y previsualiza, sin escribir
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const soloProbar = process.argv.includes('--probar');
// fileURLToPath y no url.pathname: en Windows el pathname deja el %20 de los
// espacios sin decodificar y la ruta no existe.
const aqui = path.dirname(fileURLToPath(import.meta.url));

const llamar = (herramienta, archivo) => {
  const args = ['lienzo.mjs', herramienta];
  if (archivo) args.push(archivo);
  const salida = execFileSync('node', args, { cwd: aqui, encoding: 'utf8', maxBuffer: 1e8, env: process.env });
  const cuerpo = salida.split('\n').slice(1).join('\n').trim();
  try { return JSON.parse(cuerpo); } catch { return { _texto: cuerpo }; }
};

// 1. La revisión que está ahora. Nunca suponerla: el apply la compara.
writeFileSync(`${aqui}/.estado.json`, JSON.stringify({ pageId: 20 }));
const estado = llamar('cod_get_canvas_page_state', '.estado.json');
const revision = estado?.document?.revision;
if (typeof revision !== 'number') {
  console.error('no pude leer la revisión actual:', JSON.stringify(estado).slice(0, 300));
  process.exit(1);
}
console.log(`revisión actual: ${revision}`);

// 2. Generar con esa revisión.
execFileSync('node', ['componer.mjs'], { cwd: aqui, encoding: 'utf8', env: { ...process.env, REV: String(revision) } });

// 3. Previsualizar.
const previo = llamar('cod_preview_canvas_composition', 'composicion-fiel.json');
if (!previo?.previewId) {
  console.error('la previsualización falló:', (previo?._texto || JSON.stringify(previo)).slice(0, 400));
  process.exit(1);
}
console.log(`preview ok`);

if (soloProbar) {
  console.log('(--probar: no escribo)');
  process.exit(0);
}

// 4. Aplicar. Sólo las claves que el servidor espera: cualquier otra lo hace
//    rechazar el payload entero.
const receta = JSON.parse(readFileSync(`${aqui}/composicion-fiel.json`, 'utf8'));
receta.previewId = previo.previewId;
writeFileSync(`${aqui}/aplicar-fiel.json`, JSON.stringify(receta, null, 2));
const hecho = llamar('cod_apply_canvas_composition', 'aplicar-fiel.json');
if (!hecho?.document?.revision) {
  console.error('el apply falló:', (hecho?._texto || JSON.stringify(hecho)).slice(0, 400));
  process.exit(1);
}
console.log(`aplicado · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);
