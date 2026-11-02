#!/usr/bin/env node
// "Sin ADN el plugin se comporta idéntico" (ESPEC F1, regla 12 de CLAUDE.md), MEDIDO en vez de afirmado.
//
// Los locales de Santa Luisa (8890) y Econut (8891) corren versiones viejas del plugin (0.3.82 / 0.3.83), así que
// `scripts/regresiones/linea-base.mjs verificar todos` no ejercita el código del repositorio. Este guion hace la
// comparación que SÍ lo ejercita, en el WordPress local de Basis (8894), que corre el plugin del repositorio:
//
//   1. instala en el local el plugin tal como está en el último commit (git archive HEAD) y guarda el HTML y las
//      hojas de estilo servidos de las páginas de Basis, dos veces (si no son estables, falla);
//   2. instala el plugin del árbol de trabajo (con lo que se esté probando) y los vuelve a guardar;
//   3. exige que sean IDÉNTICOS. Y deja el local con el plugin del árbol de trabajo, como estaba.
//
// Control: con --provocar-diferencia cambia el nombre del sitio entre las dos tomas y exige que el guion FALLE.
// Se niega a correr si el local tiene un ADN activo (con ADN las cosas SÍ pueden cambiar en F2 en adelante).
//
// Por omisión la base es el último commit (HEAD) y debe ser anterior al almacén del ADN. Con `--base <commit>` se compara
// contra otro: por ejemplo la fase F1b se mide contra el commit de F1 (el árbol de trabajo trae el paquete .ocdsite,
// la base no) o contra el último commit anterior a F1, que es la promesa original de F1.
//
//   node scripts/adn/sin-adn-identico.mjs [--provocar-diferencia] [--base <commit>]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCAL = 'C:/Users/Cristobal concha/wp-local-basis/wordpress';
const PLUGIN_LOCAL = `${LOCAL}/wp-content/plugins/contope-publisher`;
const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
const BASE = 'http://localhost:8894';
const PAGINAS = ['', 'basis-carpas-industriales/', 'preguntas-frecuentes/', 'contactos/', 'terminos-y-privacidad/'];
const provocar = process.argv.includes('--provocar-diferencia');
const iBase = process.argv.indexOf('--base');
const base = iBase >= 0 ? process.argv[iBase + 1] : 'HEAD';
if (!base) {
  console.error('ERROR: --base necesita un commit.');
  process.exit(2);
}
const aWin = (p) => p.split('/').join('\\');

const robocopia = (origen) => {
  const r = spawnSync('robocopy', [aWin(origen), aWin(PLUGIN_LOCAL), '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XD', 'node_modules', '.git', '/XF', '*.log'], { encoding: 'utf8' });
  if (r.status === null || r.status >= 8) throw new Error(`robocopy falló (${r.status}): ${r.stdout}${r.stderr}`);
};
const php = (codigo) => {
  const r = spawnSync(PHP, ['-r', `define('WP_USE_THEMES', false); require '${LOCAL}/wp-load.php'; ${codigo}`], { encoding: 'utf8' });
  return `${r.stdout}${r.stderr}`.trim();
};
const crudo = {};
async function tomar(etiqueta) {
  const out = {};
  for (const ruta of PAGINAS) {
    const resp = await fetch(`${BASE}/${ruta}`);
    const html = (await resp.text()).split('\r\n').join('\n'); // los finales de línea no son comportamiento
    const hojas = [...new Set([...html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi)].map((m) => m[1]))].sort();
    let css = '';
    for (const url of hojas) {
      const h = await fetch(url.startsWith('http') ? url : `${BASE}${url}`);
      css += `|${url}=${createHash('sha256').update((await h.text()).split('\r\n').join('\n')).digest('hex')}`;
    }
    out[ruta || '/'] = createHash('sha256').update(html + css).digest('hex');
    crudo[`${etiqueta}:${ruta || '/'}`] = html + css;
    if (resp.status !== 200 || html.length < 500) throw new Error(`/${ruta} respondió ${resp.status} con ${html.length} bytes`);
  }
  return out;
}

const activo = php(`echo COD_ADN_Store::activo() ? 'SI' : 'NO';`);
if (activo !== 'NO') {
  console.error(`ERROR: el local de Basis tiene un ADN activo o no responde (${activo}). No se compara nada.`);
  process.exit(2);
}
const tmp = mkdtempSync(join(tmpdir(), 'plugin-head-'));
let codigoSalida = 0;
try {
  const tar = spawnSync('git', ['-C', repo, 'archive', '--format=tar', '-o', join(tmp, 'head.tar'), base, 'contope-publisher'], { encoding: 'utf8' });
  if (tar.status !== 0) throw new Error(`git archive falló: ${tar.stderr}`);
  const x = spawnSync('tar', ['-xf', 'head.tar'], { cwd: tmp, encoding: 'utf8' }); // cwd en la carpeta: GNU tar toma «C:» por un servidor
  if (x.status !== 0) throw new Error(`tar falló: ${x.stderr}`);

  // git archive entrega los .php con LF; el árbol de trabajo los tiene con CRLF (así los guarda este repo) y el HTML
  // en línea de un .php sale con esos finales de línea. Se igualan para comparar comportamiento y no finales de línea.
  const aCrlf = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) aCrlf(ruta);
      else if (nombre.endsWith('.php')) writeFileSync(ruta, readFileSync(ruta, 'utf8').split('\r\n').join('\n').split('\n').join('\r\n'));
    }
  };
  aCrlf(join(tmp, 'contope-publisher'));
  robocopia(`${tmp.split('\\').join('/')}/contope-publisher`);
  const sinF1 = php(`echo class_exists('COD_ADN_Store') ? 'CON' : 'SIN';`);
  if (sinF1 !== 'SIN' && iBase < 0) throw new Error('el plugin del último commit ya trae el almacén del ADN: no hay con qué comparar (usa --base <commit> con otro commit)');
  console.log(`  base: ${base} (${sinF1 === 'SIN' ? 'sin' : 'con'} almacén del ADN)`);
  const a1 = await tomar('a');
  const a2 = await tomar('a2');
  const estable = JSON.stringify(a1) === JSON.stringify(a2);
  console.log(`  ${estable ? 'ok    ' : 'FALLA '} la toma del plugin del último commit es estable (dos tomas iguales, ${PAGINAS.length} páginas)`);
  if (!estable) throw new Error('la línea de comparación se mueve sola; no se puede comparar');

  robocopia(repo.split('\\').join('/') + '/contope-publisher');
  const conF1 = php(`echo class_exists('COD_ADN_Store') ? 'CON' : 'SIN';`);
  if (conF1 !== 'CON') throw new Error('el plugin del árbol de trabajo no trae el almacén del ADN');
  const nombre = php(`echo get_option('blogname');`);
  if (provocar) php(`update_option('blogname', 'DIFERENCIA PROVOCADA');`);
  const b = await tomar('b');
  if (provocar) php(`update_option('blogname', ${JSON.stringify(nombre)});`);

  const distintas = Object.keys(a1).filter((k) => a1[k] !== b[k]);
  for (const k of distintas.slice(0, 1)) {
    const x = crudo[`a:${k}`].split('>'); const y = crudo[`b:${k}`].split('>');
    const dif = [];
    for (let i = 0; i < Math.max(x.length, y.length) && dif.length < 4; i += 1) {
      if (x[i] !== y[i]) dif.push("    - " + JSON.stringify(String(x[i]).slice(0, 160)) + "\n    + " + String(y[i]).slice(0, 160));
    }
    console.log("  primeras diferencias en " + k + ":\n" + dif.join("\n"));
  }
  const iguales = distintas.length === 0;
  console.log(`  ${iguales ? 'ok    ' : 'FALLA '} con el plugin del árbol de trabajo (F1 instalada, sin ADN) las ${PAGINAS.length} páginas se sirven idénticas${iguales ? '' : ': distintas ' + distintas.join(', ')}`);
  if (provocar) {
    console.log(`  ${iguales ? 'FALLA ' : 'ok    '} control: con un cambio provocado entre tomas el guion lo ve (${iguales ? 'NO LO VIO' : distintas.length + ' páginas distintas'})`);
    codigoSalida = iguales ? 1 : 0; // con --provocar-diferencia, "no ver la diferencia" es el fallo
  } else if (!iguales) {
    codigoSalida = 1;
  }
} catch (e) {
  console.error('ERROR: ' + e.message);
  codigoSalida = 1;
} finally {
  // Pase lo que pase, el local queda con el plugin del árbol de trabajo (como lo deja el flujo de pruebas).
  try { robocopia(repo.split('\\').join('/') + '/contope-publisher'); } catch (e) { console.error('no se pudo restaurar el plugin del árbol de trabajo: ' + e.message); codigoSalida = 1; }
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(codigoSalida);
