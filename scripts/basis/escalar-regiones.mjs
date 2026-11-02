/**
 * Lleva el encabezado y el pie de Basis (regiones del lienzo) a REFERENCIAS del sistema, para que la compuerta del diseño
 * (`enforce`) los acepte: ningún espaciado, tamaño, peso, interlineado, radio ni ancho de caja literal.
 *
 *   node scripts/basis/escalar-regiones.mjs
 *
 * Entrada: salida/region-header.componer.json y salida/region-footer.componer.json (los escribe `componer.mjs`, con los valores
 * medidos; de ellos salen las escalas) y escalas.json. Salida: salida/bloques/region-<header|footer>.escalada.json, que es lo que
 * `aplicar.mjs` manda al sitio. Lo que el sistema no expresa se anota (nunca se rodea con un literal).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearTraductor } from './lib/bloques.mjs';
import { escalarDiseno } from './lib/regiones.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const escalas = JSON.parse(readFileSync(path.join(aqui, 'escalas.json'), 'utf8'));
mkdirSync(path.join(aqui, 'salida', 'bloques'), { recursive: true });

for (const k of ['header', 'footer']) {
  const base = JSON.parse(readFileSync(path.join(aqui, 'salida', `region-${k}.componer.json`), 'utf8'));
  const T = crearTraductor({ escalas });
  const design = escalarDiseno(base.design, T, `region-${k}`);
  writeFileSync(path.join(aqui, 'salida', 'bloques', `region-${k}.escalada.json`), JSON.stringify({ ...base, design }, null, 2));
  console.log(`region-${k}: ${design.rules.length} reglas escaladas · fuera del sistema: ${T.perdidas.length}`);
  for (const p of T.perdidas) console.log(`   ${p.donde} ${p.prop}: ${p.valor} — ${p.motivo}`);
}
