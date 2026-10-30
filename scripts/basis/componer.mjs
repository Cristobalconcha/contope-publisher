/**
 * Basis sobre ContOpe: genera las composiciones de todo el sitio.
 *
 * No hay nada compuesto a mano acá: TODO sale del transcriptor Divi → ContOpe
 * (scripts/divi-a-contope) leyendo las mediciones del sitio original. Lo que es
 * decisión de este sitio vive en `perfil.json` (medios de reemplazo, formulario,
 * mapa, rutas).
 *
 *   node componer.mjs [carpeta-original]
 *
 * Deja en `salida/`:
 *   <pagina>.componer.json, region-header.componer.json, region-footer.componer.json,
 *   INFORME.md / informe.json (lo que el transcriptor no supo convertir), ajustes.json.
 * El texto legal lo compone `componer-legal.mjs`; se aplica todo con `aplicar.mjs`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transcribirSitio, disenoDe, informeMarkdown } from '../divi-a-contope/transcribir.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const original = process.argv[2] || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/original';
const perfil = JSON.parse(readFileSync(path.join(aqui, 'perfil.json'), 'utf8'));
const salida = path.join(aqui, 'salida');
mkdirSync(salida, { recursive: true });

const r = transcribirSitio({ original, perfil, paginas: perfil.paginasReales });
for (const [slug, p] of Object.entries(r.paginas)) {
  writeFileSync(path.join(salida, `${slug}.componer.json`), JSON.stringify({ titulo: p.titulo, slug, design: disenoDe(r.reg, p.nodos, perfil.designId), composition: { schemaVersion: 2, nodes: p.nodos } }, null, 2));
  console.log(`${slug}: ${p.nodos.length} secciones`);
}
// Encabezado y pie son globales: salen de la primera página (en Divi son una plantilla única).
const primera = Object.values(r.paginas)[0];
writeFileSync(path.join(salida, 'region-header.componer.json'), JSON.stringify({ design: disenoDe(r.reg, primera.encabezado, perfil.designId), composition: { schemaVersion: 2, nodes: primera.encabezado } }, null, 2));
writeFileSync(path.join(salida, 'region-footer.componer.json'), JSON.stringify({ design: disenoDe(r.reg, primera.pie, perfil.designId), composition: { schemaVersion: 2, nodes: primera.pie } }, null, 2));
writeFileSync(path.join(salida, 'informe.json'), JSON.stringify(r.informe, null, 2));
writeFileSync(path.join(salida, 'INFORME.md'), informeMarkdown(r.informe, 'Basis · informe del transcriptor Divi → ContOpe'));
writeFileSync(path.join(salida, 'ajustes.json'), JSON.stringify(r.ajustes, null, 2));
console.log(`reglas: ${r.reg.reglas.length} · avisos: ${r.informe.length}`);
