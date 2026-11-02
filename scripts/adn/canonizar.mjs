#!/usr/bin/env node
// Canoniza un ADN FUERA del plugin, para que la prueba P1.2 calcule el `digest` esperado sin usar el código que prueba.
//
//   node scripts/adn/canonizar.mjs <archivo.json> [--texto]
//
// Imprime el sha256 del JSON canónico del CONTRATO (si el archivo es el envoltorio portable, el de `contract`).
// Canónico = el `stableJsonValue` del Core (claves ordenadas como texto, y luego en el orden en que V8 enumera un
// objeto) + `JSON.stringify` compacto. Con --texto imprime el canónico y no el hash.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function estable(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(estable);
  return Object.fromEntries(Object.keys(v).sort(compareText).map((k) => [k, estable(v[k])]));
}
const archivo = process.argv[2];
if (!archivo) {
  console.error('uso: node scripts/adn/canonizar.mjs <archivo.json> [--texto]');
  process.exit(2);
}
const valor = JSON.parse(readFileSync(archivo, 'utf8').replace(/^\uFEFF/, ''));
const contrato = valor && valor.kind === 'contope/design-model' ? valor.contract : valor;
const canonico = JSON.stringify(estable(contrato));
process.stdout.write(process.argv.includes('--texto') ? canonico : createHash('sha256').update(canonico, 'utf8').digest('hex'));
