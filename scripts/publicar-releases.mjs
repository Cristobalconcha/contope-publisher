/**
 * Publica en GitHub una release por cada versión del CHANGELOG que todavía no
 * la tenga.
 *
 * Existe porque el plugin es software libre y hay forks: quien lo usa desde
 * GitHub se guía por las releases, no por el árbol. El 3 de octubre de 2026 se
 * descubrió que la última publicada era la 0.3.24 y el plugin iba en la 0.3.45:
 * veinte versiones documentadas en el CHANGELOG que nadie podía ver ni usar.
 *
 * Cada etiqueta apunta al commit que introdujo esa versión, no a la punta de la
 * rama. Varias etiquetas pueden compartir commit —hubo tandas donde se
 * subieron ocho versiones juntas— y eso está bien: refleja lo que pasó.
 *
 * Uso:
 *   node scripts/publicar-releases.mjs            lista lo que haría
 *   node scripts/publicar-releases.mjs --publicar  crea las que falten
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const publicar = process.argv.includes('--publicar');
// fileURLToPath y no url.pathname: en Windows el pathname deja sin decodificar
// el %20 de los espacios de la ruta, y entonces el archivo «no existe».
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();
const gh = (...args) => execFileSync('gh', args, { cwd: raiz, encoding: 'utf8' }).trim();

// ------------------------------------------------- las versiones del CHANGELOG
const texto = readFileSync(path.join(raiz, 'CHANGELOG.md'), 'utf8');
const versiones = [];
let actual = null;
for (const linea of texto.split('\n')) {
  const m = linea.match(/^## (\d+\.\d+\.\d+)\s*[—-]\s*(.*)$/);
  if (m) {
    if (actual) versiones.push(actual);
    actual = { version: m[1], fecha: m[2].trim(), cuerpo: [] };
  } else if (actual && !/^---\s*$/.test(linea)) {
    actual.cuerpo.push(linea);
  }
}
if (actual) versiones.push(actual);

// ------------------------------------------- las que ya están publicadas
const publicadas = new Set(
  gh('release', 'list', '--limit', '300').split('\n')
    .map((l) => (l.split('\t')[2] || '').trim().replace(/^v/, ''))
    .filter(Boolean)
);

/**
 * El commit que introdujo una versión. Se busca primero por la entrada del
 * CHANGELOG, que es lo más fiable: el número de versión en el archivo del
 * plugin se puede haber tocado más de una vez, pero la entrada del registro
 * se escribe una sola.
 */
const commitDe = (version) => {
  for (const [args, aguja] of [
    [['--', 'CHANGELOG.md'], `## ${version}`],
    [['--', 'contope-publisher/contope-publisher.php'], `define('COD_PUBLISHER_VERSION', '${version}')`],
  ]) {
    const salida = git('log', '--reverse', '--format=%H', `-S${aguja}`, ...args).split('\n')[0];
    if (salida) return salida;
  }
  return '';
};

/**
 * El título: la primera cosa en negrita del cuerpo, que es como está escrito
 * el titular de cada cambio en el registro. Si esa entrada no la trae, se usa
 * el asunto del commit, quitándole el número de versión que ya va delante.
 */
const tituloDe = (cuerpo, commit) => {
  // El `s` importa: un titular en negrita puede ocupar dos líneas, porque el
  // registro va envuelto a 79 columnas. Sin él, el punto no cruza el salto de
  // línea, esta primera entrada no calzaba y el guion se iba en silencio a la
  // siguiente negrita que cupiera en una línea —que es cualquier otra cosa—.
  // La 0.3.48 salió así titulada «Sin gestor de consentimiento, el sitio queda
  // como estaba», que es una nota al pie de la versión, no lo que cambió.
  const m = cuerpo.match(/^- \*\*([\s\S]+?)\*\*/m);
  if (m) return m[1].replace(/\s+/g, ' ').replace(/[.:]$/, '').slice(0, 70);
  if (!commit) return '';
  const asunto = git('log', '--format=%s', '-1', commit);
  return asunto.replace(/^(ContOpe Publisher\s+)?\d+\.\d+\.\d+\s*[:—-]\s*/, '').slice(0, 70);
};

// Sólo de la 0.3.25 en adelante: lo anterior a eso o ya está publicado, o
// quedó sin publicar en su momento por una razón que no conozco, y no es este
// el momento de decidirlo.
const desde = (v) => {
  const [a, b, c] = v.split('.').map(Number);
  return a > 0 || b > 3 || (b === 3 && c >= 25);
};
const pendientes = versiones.filter((v) => !publicadas.has(v.version) && desde(v.version));
if (pendientes.length === 0) {
  console.log('No hay versiones pendientes de publicar.');
  process.exit(0);
}

const carpeta = mkdtempSync(path.join(tmpdir(), 'notas-'));
console.log(`${pendientes.length} versión(es) pendiente(s)${publicar ? '' : ' — en seco, nada se publica'}\n`);

for (const v of pendientes.reverse()) {
  const cuerpo = v.cuerpo.join('\n').trim();
  const commit = commitDe(v.version);
  const titulo = `${v.version} — ${tituloDe(cuerpo, commit) || v.fecha}`;
  if (!commit) {
    console.log(`${v.version}  SIN COMMIT — la salto`);
    continue;
  }
  console.log(`${v.version}  ${commit.slice(0, 8)}  ${titulo}`);
  if (!publicar) continue;

  const archivo = path.join(carpeta, `${v.version}.md`);
  writeFileSync(archivo, `${cuerpo}\n`);
  try {
    gh('release', 'create', `v${v.version}`, '--target', commit, '--title', titulo, '--notes-file', archivo);
    console.log(`          publicada`);
  } catch (e) {
    console.log(`          FALLÓ: ${String(e.stderr || e.message).split('\n')[0]}`);
  }
}
