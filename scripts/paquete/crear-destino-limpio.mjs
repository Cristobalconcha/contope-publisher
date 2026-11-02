// Crea (o rehace) un WordPress LIMPIO de prueba para el paquete .ocdsite (fase F1b): el destino al
// que se importa lo que sale del local de Basis.
//
// Es un sitio aparte de Santa Luisa (8890), Econut (8891) y Basis (8894): carpeta propia
// (`wp-local-f1b-destino`), base SQLite propia, puerto 8895. No toca ninguno de los otros.
// Con `OCD_DESTINO_PUERTO=8896` crea OTRO destino independiente (`wp-local-f1b-destino-8896`): sirve cuando
// otra persona o proceso está usando el 8895.
//
// Qué lleva: el núcleo de WordPress (copiado de la carpeta de Basis, sólo lectura), la integración
// de SQLite (copiada de Econut), el plugin contope-publisher y los temas contope-canvas y
// contope-basis DEL REPOSITORIO (no los de otro local), y nada más: sin medios, sin páginas, sin ADN.
//
// Uso:
//   node scripts/paquete/crear-destino-limpio.mjs            crea el sitio si no existe
//   node scripts/paquete/crear-destino-limpio.mjs --rehacer  lo borra y lo crea de cero
//   node scripts/paquete/crear-destino-limpio.mjs --sincronizar  sólo vuelve a copiar plugin y temas
//
// Arranque del servidor (en otra terminal o en segundo plano):
//   php -c <php.ini> -S localhost:8895 -t <carpeta>\wordpress

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const casa = path.resolve(repo, '..');
const PUERTO = Number(process.env.OCD_DESTINO_PUERTO ?? 8895);
const carpeta = path.join(casa, PUERTO === 8895 ? 'wp-local-f1b-destino' : `wp-local-f1b-destino-${PUERTO}`);
const wp = path.join(carpeta, 'wordpress');
const php = path.join(casa, 'wp-local', 'php', 'php.exe');
const phpIni = path.join(casa, 'wp-local', 'php', 'php.ini');
const wpCli = path.join(casa, 'wp-local', 'wp-cli.phar');
const nucleo = path.join(casa, 'wp-local-basis', 'wordpress');
const sqlite = path.join(casa, 'wp-local-econut', 'wordpress', 'wp-content', 'plugins', 'sqlite-database-integration');
const dbPhpOrigen = path.join(casa, 'wp-local-econut', 'wordpress', 'wp-content', 'db.php');

const args = process.argv.slice(2);
const rehacer = args.includes('--rehacer');
const soloSincronizar = args.includes('--sincronizar');

const copiar = (de, a, filtro) => cpSync(de, a, { recursive: true, force: true, filter: filtro });

function sincronizar() {
  const plugins = path.join(wp, 'wp-content', 'plugins');
  const temas = path.join(wp, 'wp-content', 'themes');
  rmSync(path.join(plugins, 'contope-publisher'), { recursive: true, force: true });
  copiar(path.join(repo, 'contope-publisher'), path.join(plugins, 'contope-publisher'), (f) => !/node_modules|[\\/]\.git([\\/]|$)/.test(f));
  for (const tema of ['contope-canvas', 'contope-basis']) {
    rmSync(path.join(temas, tema), { recursive: true, force: true });
    copiar(path.join(repo, tema), path.join(temas, tema), (f) => !/node_modules|[\\/]\.git([\\/]|$)/.test(f));
  }
  console.log('plugin contope-publisher y temas contope-canvas/contope-basis copiados desde el repositorio.');
}

if (soloSincronizar) {
  if (!existsSync(wp)) {
    console.error('El destino no existe: corre sin --sincronizar primero.');
    process.exit(1);
  }
  sincronizar();
  process.exit(0);
}

if (existsSync(wp) && !rehacer) {
  console.log(`El destino ya existe: ${wp}`);
  sincronizar();
  process.exit(0);
}
if (rehacer && existsSync(carpeta)) {
  rmSync(carpeta, { recursive: true, force: true });
}
for (const requerido of [nucleo, sqlite, dbPhpOrigen, php, wpCli]) {
  if (!existsSync(requerido)) {
    console.error(`Falta ${requerido}`);
    process.exit(1);
  }
}

mkdirSync(wp, { recursive: true });
// Núcleo: todo menos wp-content y la configuración de Basis.
for (const nombre of readdirSync(nucleo)) {
  if (nombre === 'wp-content' || nombre === 'wp-config.php' || nombre.startsWith('wp-config.php.')) continue;
  if (/^(mask-|prueba-mascara)/.test(nombre)) continue; // restos de otras pruebas, no son del núcleo
  copiar(path.join(nucleo, nombre), path.join(wp, nombre));
}
const contenido = path.join(wp, 'wp-content');
mkdirSync(path.join(contenido, 'plugins'), { recursive: true });
mkdirSync(path.join(contenido, 'themes'), { recursive: true });
mkdirSync(path.join(contenido, 'uploads'), { recursive: true });
mkdirSync(path.join(contenido, 'database'), { recursive: true });
writeFileSync(path.join(contenido, 'index.php'), '<?php // Silence is golden.\n');
copiar(sqlite, path.join(contenido, 'plugins', 'sqlite-database-integration'));
// El db.php de Econut apunta a una ruta absoluta de OTRO local: aquí apunta al plugin de este.
const dbPhp = readFileSync(dbPhpOrigen, 'utf8').replace(
  /\$sqlite_plugin_implementation_folder_path = '[^']*';/,
  `$sqlite_plugin_implementation_folder_path = '${path.join(contenido, 'plugins', 'sqlite-database-integration').replace(/\\/g, '/')}';`,
);
writeFileSync(path.join(contenido, 'db.php'), dbPhp);
const temaBase = path.join(nucleo, 'wp-content', 'themes', 'twentytwentyfive');
if (existsSync(temaBase)) copiar(temaBase, path.join(contenido, 'themes', 'twentytwentyfive'));
sincronizar();

const sal = () => randomBytes(48).toString('base64');
const claves = ['AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY', 'AUTH_SALT', 'SECURE_AUTH_SALT', 'LOGGED_IN_SALT', 'NONCE_SALT']
  .map((k) => `define( '${k}', '${sal()}' );`)
  .join('\n');
writeFileSync(
  path.join(wp, 'wp-config.php'),
  `<?php
define( 'DB_NAME', 'wordpress' );
define( 'DB_USER', 'root' );
define( 'DB_PASSWORD', '' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8' );
define( 'DB_COLLATE', '' );
${claves}
$table_prefix = 'wp_';
define( 'WP_DEBUG', false );
define( 'WP_ENVIRONMENT_TYPE', 'local' );
define( 'DB_ENGINE', 'sqlite' );
define( 'DB_DIR', __DIR__ . '/wp-content/database' );
define( 'DB_FILE', 'database.sqlite' );
if ( ! defined( 'ABSPATH' ) ) {
\tdefine( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
`,
);

const clave = randomBytes(18).toString('base64url');
const r = spawnSync(
  php,
  ['-c', phpIni, wpCli, `--path=${wp}`, 'core', 'install', `--url=http://localhost:${PUERTO}`, '--title=Destino limpio F1b (prueba)', '--admin_user=prueba-f1b', `--admin_password=${clave}`, '--admin_email=prueba-f1b@example.invalid', '--skip-email'],
  { encoding: 'utf8' },
);
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
if (r.status !== 0) process.exit(r.status ?? 1);
for (const orden of [['plugin', 'activate', 'contope-publisher'], ['theme', 'activate', 'contope-basis']]) {
  const a = spawnSync(php, ['-c', phpIni, wpCli, `--path=${wp}`, ...orden], { encoding: 'utf8' });
  process.stdout.write(a.stdout ?? '');
  process.stderr.write(a.stderr ?? '');
  if (a.status !== 0) process.exit(a.status ?? 1);
}
writeFileSync(
  path.join(carpeta, 'ACCESO-LOCAL.md'),
  `# Destino limpio de la fase F1b\n\nSitio de prueba, NO es Santa Luisa, Econut ni Basis.\n\n- URL: http://localhost:${PUERTO}\n- Usuario: prueba-f1b\n- Contraseña: la que se generó al crearlo (no se guarda; las pruebas entran con una cookie firmada, sin contraseña).\n\nArrancar:\n\n    "${php}" -c "${phpIni}" -S localhost:${PUERTO} -t "${wp}"\n\nRehacer de cero: \`node scripts/paquete/crear-destino-limpio.mjs --rehacer\` (desde el repositorio).\n`,
);
console.log(`Listo: ${wp}`);
