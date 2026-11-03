#!/usr/bin/env node
// Las barreras de NODE del validador del ADN (P0.1 y P1.1), dentro de la batería (`npm run pruebas`):
//
//   1. scripts/adn/cobertura-corpus.mjs            cada `return null` de los parsers del Core tiene un caso en core/
//   2. scripts/adn/cobertura-corpus.mjs --control  quitar un caso del corpus HACE FALLAR la cobertura (el instrumento ve)
//   3. scripts/adn/cobertura-esquemas.mjs (y --control)  la capa 4 (esquemas/ + payload-schemas.json) es coherente y corresponde al Core
//   4. scripts/adn/generar-fechas-v8.mjs --verificar  la batería de fechas coincide con el V8 de ESTE node (es la verdad
//                                                   contra la que probar-adn-validador.php mide COD_ADN_Js::fecha_valida)
//
// La comparación PHP contra el corpus (paridad exacta) vive en scripts/probar-adn-validador.php. Aquí se prueba que
// el corpus y la batería de fechas siguen siendo lo que dicen ser.
//
// Sin el repositorio del Core cerca (../ContOpeDesign-Core), la cobertura NO se aprueba a ciegas: falla (el propio
// script lo dice). Eso es a propósito.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fallas = 0;
const correr = (titulo, script, args = []) => {
  const r = spawnSync('node', [join(raiz, script), ...args], { cwd: raiz, encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) fallas += 1;
  console.log(`  ${ok ? 'ok    ' : 'FALLA '} ${titulo}`);
  if (!ok) console.log(String(r.stdout + r.stderr).split('\n').map((l) => `         | ${l}`).join('\n'));
};

console.log('\n== barreras de node del corpus del ADN ==');
correr('P0.1 cobertura: cada rama return null del Core tiene un caso', 'scripts/adn/cobertura-corpus.mjs', ['--core', resolve(raiz, '..', 'ContOpeDesign-Core')]);
correr('P0.1 control: sin un caso del corpus la cobertura FALLA', 'scripts/adn/cobertura-corpus.mjs', ['--control', '--core', resolve(raiz, '..', 'ContOpeDesign-Core')]);
correr('P1.1 la batería de fechas coincide con el V8 de este node', 'scripts/adn/generar-fechas-v8.mjs', ['--verificar']);
correr('Q1/Q3/Q4 capa 4: los 176 casos de esquemas/ son coherentes y corresponden a las huellas del Core', 'scripts/adn/cobertura-esquemas.mjs', ['--core', resolve(raiz, '..', 'ContOpeDesign-Core')]);
correr('Q1/Q3/Q4 control: un caso quitado, un veredicto volteado o una huella cambiada HACEN FALLAR la capa 4', 'scripts/adn/cobertura-esquemas.mjs', ['--control', '--core', resolve(raiz, '..', 'ContOpeDesign-Core')]);
console.log(fallas === 0 ? '\nTODO VERDE' : `\nFALLARON ${fallas}`);
process.exit(fallas === 0 ? 0 : 1);
