/**
 * Trae el motor de tramas desde contopedesign-core, sin copiarlo a mano.
 *
 * POR QUÉ. Decisión 36 (vault, 2026-10-09): «Core genera las tramas. El
 * reproductor solo los muestra». El motor existe UNA vez, en
 * `contopedesign-core/packages/trama/`, y Publisher lo trae tal cual. Hasta
 * 0.3.79 `cod-trama.js` llevaba una copia del motor pegada adentro, que podía
 * divergir del generador sin que nadie lo notara.
 *
 * QUÉ HACE.
 *   1. Lee `packages/trama/dist/` de una copia local de core.
 *   2. Verifica el sha256 y el tamaño de `contope-trama.js` y
 *      `contope-trama-worker.js` contra el `MOTOR.json` de esa misma carpeta.
 *      Si uno no calza, no escribe nada y sale con código 1.
 *   3. Escribe los dos .js, sin tocarlos, en
 *      `contope-publisher/assets/vendor/contope-trama/`, y un `MOTOR.json` que
 *      es el de core más `origen` (el commit de core del que salieron y si su
 *      `dist/` tenía cambios sin commit).
 *
 * Esos tres archivos se versionan: son los que viajan en el zip del plugin.
 * `scripts/probar-trama.mjs` vuelve a comprobar los sha256 y la huella.
 *
 * Uso:
 *   node scripts/traer-motor-trama.mjs [ruta-a-contopedesign-core]
 *   CONTOPE_CORE=/ruta/a/core node scripts/traer-motor-trama.mjs
 * Por omisión, la carpeta hermana `../contopedesign-core`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const core = resolve(process.argv[2] || process.env.CONTOPE_CORE || join(repo, '..', 'contopedesign-core'));
const dist = join(core, 'packages', 'trama', 'dist');
const destino = join(repo, 'contope-publisher', 'assets', 'vendor', 'contope-trama');
const ARCHIVOS = ['contope-trama.js', 'contope-trama-worker.js'];

const salir = (mensaje) => { console.error('ERROR: ' + mensaje); process.exit(1); };

if (!existsSync(join(dist, 'MOTOR.json'))) {
  salir(`no encuentro ${join(dist, 'MOTOR.json')}. Pasa la ruta de contopedesign-core como argumento o en CONTOPE_CORE.`);
}
const motor = JSON.parse(readFileSync(join(dist, 'MOTOR.json'), 'utf8'));

const contenidos = {};
for (const nombre of ARCHIVOS) {
  const ruta = join(dist, nombre);
  if (!existsSync(ruta)) salir(`falta ${ruta}`);
  const bytes = readFileSync(ruta);
  const esperado = motor.archivos?.[nombre];
  if (!esperado) salir(`MOTOR.json no declara ${nombre}`);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== esperado.sha256 || bytes.length !== esperado.bytes) {
    salir(`${nombre}: sha256 ${sha} (${bytes.length} bytes) no calza con MOTOR.json (${esperado.sha256}, ${esperado.bytes} bytes). `
      + 'Reconstruye dist/ en core (`pnpm trama:construir`) antes de traerlo.');
  }
  contenidos[nombre] = bytes;
}

// De qué commit de core salió. Si git no está o la carpeta no es un repo, se
// anota y se sigue: los sha256 ya garantizan qué bytes son.
const git = (...args) => {
  try { return execFileSync('git', ['-C', core, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
};
const commit = git('rev-parse', 'HEAD');
const rama = git('rev-parse', '--abbrev-ref', 'HEAD');
const sucio = git('status', '--porcelain', '--', 'packages/trama/dist');

mkdirSync(destino, { recursive: true });
for (const nombre of ARCHIVOS) writeFileSync(join(destino, nombre), contenidos[nombre]);
const vendor = {
  ...motor,
  origen: {
    repositorio: 'contopedesign-core',
    ruta: 'packages/trama/dist',
    commit: commit || 'desconocido',
    rama: rama || 'desconocida',
    distConCambiosSinCommit: sucio === null ? null : sucio !== '',
  },
};
writeFileSync(join(destino, 'MOTOR.json'), JSON.stringify(vendor, null, 2) + '\n');

console.log(`OK: motor ${motor.motor.id} ${motor.motor.version} (formato ${motor.formato.kind} v${motor.formato.version}) `
  + `traído de core ${vendor.origen.commit.slice(0, 7)} (${vendor.origen.rama}) a contope-publisher/assets/vendor/contope-trama/.`);
if (vendor.origen.distConCambiosSinCommit) console.warn('AVISO: el dist/ de core tiene cambios sin commit.');
