/**
 * Corre toda la batería y dice qué pasó, por CÓDIGO DE SALIDA.
 *
 * POR QUÉ EXISTE. Venía resumiendo a mano con `tail -1` y un filtro de texto, y
 * eso falló dos veces el mismo día, 4 de octubre de 2026:
 *
 *  - un filtro pensado para esconder líneas de ruido —`de 17`— tapó justamente
 *    el resultado de `probar-precedencia-css.php`, que llevaba dos versiones
 *    fallando sin que nadie lo viera;
 *  - tres pruebas que terminan con una línea en blanco aparecían en blanco en
 *    el resumen, indistinguibles de un fallo.
 *
 * Un resumen que puede esconder un fallo es peor que no resumir. El código de
 * salida no se puede confundir: cero es que pasó, cualquier otra cosa es que
 * no.
 *
 * Uso:
 *   node scripts/correr-pruebas.mjs            todas
 *   node scripts/correr-pruebas.mjs divisor    las que calcen con «divisor»
 *   node scripts/correr-pruebas.mjs --ver      imprime la salida de las que fallan
 */
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';

const args = process.argv.slice(2);
const verSalida = args.includes('--ver');
const filtro = args.find((a) => !a.startsWith('--')) || '';

/**
 * Las que piden argumentos y no son de la batería: son herramientas que se
 * invocan a mano. Correrlas sin argumentos no prueba nada y ensucia el informe.
 */
const HERRAMIENTAS = new Set(['probar-pestanas.mjs']);

const pruebas = readdirSync(path.join(aquí))
  .filter((f) => /^probar-.*\.(php|mjs)$/.test(f))
  .filter((f) => !HERRAMIENTAS.has(f))
  .filter((f) => filtro === '' || f.includes(filtro))
  .sort();

if (!existsSync(PHP)) {
  console.error(`No encuentro PHP en ${PHP}`);
  process.exit(2);
}

let fallaron = 0;
const empezó = Date.now();

for (const prueba of pruebas) {
  const esPhp = prueba.endsWith('.php');
  const r = spawnSync(esPhp ? PHP : 'node', [path.join(aquí, prueba)], {
    encoding: 'utf8',
    maxBuffer: 1e8,
  });
  const bien = r.status === 0;
  if (!bien) fallaron += 1;

  // El resumen que imprime la propia prueba, si lo tiene: la última línea NO
  // vacía. Es informativo; quien manda es el código de salida.
  const resumen = String(r.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .pop() || '';

  console.log(`${bien ? '  ok   ' : '  FALLA'}  ${prueba.padEnd(34)} ${resumen.slice(0, 62)}`);

  if (!bien && verSalida) {
    const salida = (String(r.stdout || '') + String(r.stderr || '')).trim();
    console.log(salida.split('\n').map((l) => '         │ ' + l).join('\n'));
  }
}

const segundos = Math.round((Date.now() - empezó) / 1000);
console.log(`\n${pruebas.length} pruebas · ${segundos}s · ${fallaron === 0 ? 'todas pasan' : fallaron + ' fallan'}`);
process.exit(fallaron === 0 ? 0 : 1);
