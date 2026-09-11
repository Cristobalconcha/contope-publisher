#!/usr/bin/env node
/**
 * build-fonts.mjs — materializa las tipografías autocontenidas del sitio.
 *
 * El diseño de Santa Luisa usa variables propias en `:root`:
 *
 *     --font-hero:  'Birthstone', cursive;
 *     --font-body:  'Montserrat', sans-serif;
 *     --font-quote: 'Lora', serif;
 *
 * pero nadie carga los webfonts (ni la página publicada ni el lienzo). Este
 * script descarga los .woff2 de Google Fonts (API css2, User-Agent de Chrome
 * para recibir woff2) y genera un `fonts.css` autocontenido, de modo que el
 * sitio no dependa de fuentes de red en tiempo de ejecución (AGENTS.md).
 *
 * El set de pesos surge del análisis del CSS publicado (page_id=10):
 *   - Montserrat (body): 400, 500, 600, 700 y 800 (todos usados en el diseño).
 *   - Birthstone (hero): 400 (es una familia de un solo peso).
 *   - Lora (quote): 400 normal + 400 italic.
 *
 * Montserrat y Lora son fuentes variables en Google Fonts: los pesos discretos
 * comparten un único .woff2 por subset, por lo que el script descarga una sola
 * vez cada URL (mapa url→archivo) aunque genere un @font-face por peso.
 *
 * Las URLs de los `src` se escriben con el placeholder `{FONTS_BASE_URL}`, que
 * el plugin reemplaza en runtime con `wp_get_upload_dir()['baseurl'] .
 * '/contope/fonts'`. Así el CSS sigue siendo portátil entre instalaciones
 * (los archivos viven en uploads, no en rutas absolutas hardcodeadas).
 *
 * Uso:
 *   node scripts/build-fonts.mjs --out-dir=/ruta/a/wp-content/uploads/contope/fonts
 *
 * Salida (en --out-dir):
 *   <familia>-<peso>[-italic]-<subset>.woff2   archivos de fuente (latin/latin-ext)
 *   fonts.css                                  @font-face para inyectar inline
 *   <familia>-OFL.txt                          licencia OFL de cada familia
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FONTS_BASE_URL_PLACEHOLDER = '{FONTS_BASE_URL}';

/** Fuente de verdad del set de pesos/estilos (justificado en el docblock). */
const FAMILIES = [
  { name: 'Montserrat', axes: 'wght@400;500;600;700;800' },
  { name: 'Birthstone', axes: null },
  { name: 'Lora', axes: 'ital,wght@0,400;1,400' },
];

/** Solo latin y latin-ext: cobertura completa para el contenido en español. */
const KEPT_SUBSETS = new Set(['latin', 'latin-ext']);

function printUsage() {
  console.log(`Uso:
  node scripts/build-fonts.mjs --out-dir=<dir>

Escribe los .woff2, fonts.css y las licencias OFL de las tipografías del sitio
en <dir> (crea el directorio si no existe).`);
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function css2Url(family) {
  const name = encodeURIComponent(family.name);
  const axes = family.axes ? `:${family.axes}` : '';
  return `https://fonts.googleapis.com/css2?family=${name}${axes}&display=swap`;
}

function field(body, name) {
  const match = body.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match ? match[1].trim() : '';
}

/**
 * Devuelve los bloques `/* subset *\/ @font-face {...}` de la respuesta css2.
 * El comentario de subset es la forma más fiable de distinguir latin/latin-ext.
 */
function parseBlocks(css) {
  const blocks = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    blocks.push({ subset: match[1], body: match[2] });
  }
  return blocks;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': CHROME_UA } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} para ${url}`);
  }
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'User-Agent': CHROME_UA } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} para ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const cli = parseArgs({
    options: {
      'out-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (cli.values.help) {
    printUsage();
    return;
  }

  const outDir = resolve(process.cwd(), cli.values['out-dir'] || '.');
  mkdirSync(outDir, { recursive: true });

  const downloaded = new Map(); // srcUrl -> local filename
  const faces = [];

  for (const family of FAMILIES) {
    const css = await fetchText(css2Url(family));

    for (const block of parseBlocks(css)) {
      if (!KEPT_SUBSETS.has(block.subset)) {
        continue;
      }

      const familyName = field(block.body, 'font-family').replace(/^['"]|['"]$/g, '');
      const weight = field(block.body, 'font-weight');
      const style = field(block.body, 'font-style');
      const srcMatch = block.body.match(/url\((https:[^)]+)\)\s*format\(['"]woff2['"]\)/);
      if (!srcMatch) {
        throw new Error(`No se pudo extraer el src woff2 de ${family.name} (${block.subset}).`);
      }
      const srcUrl = srcMatch[1];

      let localName = downloaded.get(srcUrl);
      if (!localName) {
        const styleSuffix = style === 'italic' ? '-italic' : '';
        localName = `${slug(familyName || family.name)}-${weight}${styleSuffix}-${block.subset}.woff2`;
        writeFileSync(join(outDir, localName), await fetchBytes(srcUrl));
        downloaded.set(srcUrl, localName);
      }

      const rewritten = block.body.replace(
        srcMatch[0],
        `url(${FONTS_BASE_URL_PLACEHOLDER}/${localName}) format('woff2')`,
      );
      faces.push(`/* ${block.subset} */\n@font-face {\n  ${rewritten.trim()}\n}`);
    }

    // Licencia OFL de la familia (permite redistribución autocontenida).
    const oflUrl = `https://raw.githubusercontent.com/google/fonts/main/ofl/${slug(family.name)}/OFL.txt`;
    writeFileSync(join(outDir, `${slug(family.name)}-OFL.txt`), await fetchText(oflUrl));
  }

  const header = [
    '/* Tipografías autocontenidas del sitio — generado por scripts/build-fonts.mjs. */',
    '/* Fuente de verdad: scripts/build-fonts.mjs. Re-ejecutalo para regenerar. */',
    `/* {${FONTS_BASE_URL_PLACEHOLDER.replace(/[{}]/g, '')}} lo reemplaza el plugin con uploads/contope/fonts. */`,
    '',
  ].join('\n');

  writeFileSync(join(outDir, 'fonts.css'), header + faces.join('\n\n') + '\n');

  console.log(`OK: ${downloaded.size} .woff2 escritos, ${FAMILIES.length} licencias OFL y fonts.css en ${outDir}`);
  for (const [src, name] of downloaded) {
    console.log(`  ${name}  <-  ${src}`);
  }
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
