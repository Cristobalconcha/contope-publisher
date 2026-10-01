/**
 * Lleva el plugin del repo a un WordPress local.
 *
 * Existe porque hasta ahora el plugin se copiaba a mano a cada local, y eso ya
 * costó una confusión real: el local de Econut se quedó en 0.3.36 mientras el
 * repo iba en 0.3.37, así que una prueba corrió contra código viejo sin que
 * nada lo dijera. El script imprime las dos versiones antes de tocar nada,
 * justamente para que esa diferencia se vea.
 *
 * Son dos instalaciones distintas y no hay que confundirlas:
 *   santaluisa → wp-local         · puerto 8890
 *   econut     → wp-local-econut  · puerto 8891
 *
 * Esto copia el plugin y nada más. Para poner el local de Santa Luisa como
 * espejo del sitio publicado (documentos e imágenes incluidos) está
 * `espejo-local.mjs`, que hace esto como primer paso.
 *
 * Uso:
 *   node scripts/sincronizar-plugin.mjs --a econut              (simulación)
 *   node scripts/sincronizar-plugin.mjs --a econut --aplicar
 */
import { readFileSync, existsSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DESTINOS = {
  santaluisa: { carpeta: 'wp-local', puerto: 8890 },
  econut: { carpeta: 'wp-local-econut', puerto: 8891 },
};

const argv = process.argv.slice(2);
const aplicar = argv.includes('--aplicar');
const nombre = argv[argv.indexOf('--a') + 1];

if (!nombre || !DESTINOS[nombre]) {
  console.error(`Falta el destino. Uso: node scripts/sincronizar-plugin.mjs --a ${Object.keys(DESTINOS).join('|')} [--aplicar]`);
  process.exit(1);
}

const { carpeta, puerto } = DESTINOS[nombre];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const casa = path.resolve(repoRoot, '..');
const local = path.join(casa, carpeta, 'wordpress');
const origen = path.join(repoRoot, 'contope-publisher');
const destino = path.join(local, 'wp-content', 'plugins', 'contope-publisher');

if (!existsSync(local)) {
  console.error(`No encuentro el WordPress de ${nombre}: ${local}`);
  process.exit(1);
}

const version = (s) => (readFileSync(path.join(s, 'contope-publisher.php'), 'utf8').match(/Version:\s*([\d.]+)/) || [])[1];
const antes = existsSync(destino) ? version(destino) : '(no instalado)';

console.log(`\n▸ Destino: ${nombre}  ·  ${local}  ·  http://localhost:${puerto}`);
console.log(`▸ Plugin:  repo ${version(origen)}  ·  local ${antes}`);
console.log(aplicar ? '▸ Modo:    APLICAR\n' : '▸ Modo:    simulación (agregar --aplicar)\n');

if (!aplicar) process.exit(0);

cpSync(origen, destino, { recursive: true });
console.log(`Copiado. El local de ${nombre} quedó en ${version(destino)}.`);
