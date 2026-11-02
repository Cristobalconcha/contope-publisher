#!/usr/bin/env node
// P2.6 (H11) de docs/ESPEC-adn-unica-puerta-y-bloques.md: las hojas del tema contope-basis leen DIRECTO las variables de
// WordPress (--wp--preset--*, --wp--custom--*) y no las --cod-* que sólo define el plugin. Con el plugin apagado, una
// propiedad que dependía de --cod-* quedaba sin valor y, con la misma especificidad, anulaba también el fondo, el texto y la
// fuente que da theme.json.
//
//   1. grep -c "var(--cod-" contope-basis/*.css  = 0, y ninguna hoja declara una propiedad --cod-*.
//   2. CONTROL: la misma búsqueda sobre las hojas de b7b0478 da 12; si diera 0, la búsqueda estaría mal.
//   3. Las hojas del tema que corren en los locales de Basis (8894) y en el destino limpio (8895) son las del repositorio.
//
//   node scripts/adn/probar-hojas-del-tema.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const casa = path.resolve(raiz, '..');
const HOJAS = ['style.css', 'cookies.css'];
let malos = 0;
const paso = (ok, texto, detalle = '') => {
  console.log(`  ${ok ? 'ok    ' : 'FALLA '} ${texto}${!ok && detalle ? '   -> ' + detalle : ''}`);
  if (!ok) malos += 1;
};
const lineasConUso = (css) => css.split(/\r?\n/).filter((l) => l.includes('var(--cod-')).length;
const declaraCod = (css) => css.split(/\r?\n/).filter((l) => /(^|[;{\s])--cod-[a-z0-9-]+\s*:/.test(l)).length;

console.log('\n== P2.6 las hojas del tema leen --wp--*, no --cod-* ==');
const dirTema = path.join(raiz, 'contope-basis');
const hojas = readdirSync(dirTema).filter((f) => f.endsWith('.css'));
paso(HOJAS.every((h) => hojas.includes(h)), `el tema trae sus hojas (${hojas.join(', ')})`);
let usos = 0;
let declaraciones = 0;
for (const h of hojas) {
  const css = readFileSync(path.join(dirTema, h), 'utf8');
  usos += lineasConUso(css);
  declaraciones += declaraCod(css);
}
paso(usos === 0, `grep -c "var(--cod-" contope-basis/*.css = 0 (hay ${usos})`);
paso(declaraciones === 0, `ninguna hoja del tema declara una propiedad --cod-* (hay ${declaraciones})`);

console.log('\n== CONTROL: las hojas de b7b0478 tenían 12 líneas con var(--cod- ==');
let anteriores = 0;
let leidas = 0;
for (const h of HOJAS) {
  const r = spawnSync('git', ['show', `b7b0478:contope-basis/${h}`], { cwd: raiz, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status === 0) {
    leidas += 1;
    anteriores += lineasConUso(r.stdout);
  }
}
paso(leidas === 2, 'se leyeron las dos hojas de b7b0478 (si falta el commit, la prueba no vale)', `leídas ${leidas}`);
paso(anteriores === 12, 'la misma búsqueda sobre b7b0478 da 12 (si diera 0, el grep estaría mal)', `dio ${anteriores}`);

console.log('\n== las hojas que corren en los sitios de prueba son las del repositorio ==');
for (const [nombre, base] of [['Basis local (8894)', 'wp-local-basis'], ['destino limpio (8895)', 'wp-local-f1b-destino']]) {
  const dir = path.join(casa, base, 'wordpress', 'wp-content', 'themes', 'contope-basis');
  if (!existsSync(dir)) {
    paso(false, `${nombre}: no encuentro el tema`, dir);
    continue;
  }
  const iguales = HOJAS.every((h) => readFileSync(path.join(dir, h), 'utf8').replace(/\r\n/g, '\n') === readFileSync(path.join(dirTema, h), 'utf8').replace(/\r\n/g, '\n'));
  paso(iguales, `${nombre}: style.css y cookies.css son las del repositorio`);
}

console.log(malos === 0 ? '\nTODO VERDE' : `\nFALLARON ${malos}`);
process.exit(malos === 0 ? 0 : 1);
