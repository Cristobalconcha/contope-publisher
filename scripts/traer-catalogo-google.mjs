/**
 * Rehace `contope-publisher/catalogo/familias-google.json`: las familias de Google Fonts y su categoría.
 *
 * POR QUÉ. Las definiciones de estilo del tema (Títulos / Cuerpo / Acento) aceptan cualquier familia de Google,
 * y para saber cuáles existen el plugin lee este catálogo (COD_Theme_Definitions::google_font_families()).
 * La fuente son los metadatos públicos de fonts.google.com, que no piden clave.
 *
 *   node scripts/traer-catalogo-google.mjs
 *
 * Sólo lee de Google; escribe un archivo del repositorio. Google renombra familias de vez en cuando
 * (Big Shoulders Display pasó a «Big Shoulders»): los sitios que usan el nombre viejo lo declaran en el
 * theme.json de su tema, que el plugin también lee.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../contope-publisher/catalogo/familias-google.json');
const r = await fetch('https://fonts.google.com/metadata/fonts');
if (!r.ok) { console.error(`Google respondió HTTP ${r.status}`); process.exit(1); }
const lista = (await r.json()).familyMetadataList;
if (!Array.isArray(lista) || lista.length < 1000) { console.error('la respuesta no trae la lista de familias que se esperaba'); process.exit(1); }
const familias = {};
for (const f of [...lista].sort((a, b) => a.family.localeCompare(b.family))) familias[f.family] = f.category || '';
const hoy = new Date().toISOString().slice(0, 10);
writeFileSync(destino, JSON.stringify({
  _fuente: 'https://fonts.google.com/metadata/fonts (familyMetadataList), leído el ' + hoy,
  _nota: 'Familias de Google Fonts y su categoría. Las usa COD_Theme_Definitions para aceptar cualquier familia de Google en Títulos / Cuerpo / Acento. Se rehace con scripts/traer-catalogo-google.mjs.',
  familias,
}));
console.log(`${Object.keys(familias).length} familias → ${destino}`);
