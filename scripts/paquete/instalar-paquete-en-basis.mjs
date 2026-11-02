// Lleva a Basis (8894) SÓLO los archivos del paquete portable (`class-cod-site-package-*.php`), no el plugin entero.
//
// La prueba de la pantalla (`probar-pantalla.mjs`) exporta Basis con el exportador que corre DENTRO de Basis, así que ese
// exportador tiene que ser el del repositorio. `scripts/sincronizar-plugin.mjs --a basis --aplicar` lo hace copiando el plugin
// completo, con lo que haya a medias en otras partes del repositorio; esto copia sólo lo del paquete.
//
// Uso: node scripts/paquete/instalar-paquete-en-basis.mjs [--solo-ver]

import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const casa = path.resolve(repo, '..');
const origen = path.join(repo, 'contope-publisher', 'includes');
const destino = path.join(casa, 'wp-local-basis', 'wordpress', 'wp-content', 'plugins', 'contope-publisher', 'includes');
const soloVer = process.argv.includes('--solo-ver');
if (!existsSync(destino)) {
  console.error(`No encuentro el plugin de Basis: ${destino}`);
  process.exit(1);
}
const md5 = (f) => (existsSync(f) ? createHash('md5').update(readFileSync(f)).digest('hex') : null);
let distintos = 0;
for (const nombre of readdirSync(origen).filter((n) => /^class-cod-site-package-.*\.php$/.test(n))) {
  const igual = md5(path.join(origen, nombre)) === md5(path.join(destino, nombre));
  console.log(`${igual ? 'igual   ' : soloVer ? 'DISTINTO' : 'copiado '} ${nombre}`);
  if (!igual) {
    distintos += 1;
    if (!soloVer) copyFileSync(path.join(origen, nombre), path.join(destino, nombre));
  }
}
console.log(soloVer ? `${distintos} archivo(s) distinto(s)` : `${distintos} archivo(s) copiado(s)`);
process.exit(soloVer && distintos > 0 ? 1 : 0);
