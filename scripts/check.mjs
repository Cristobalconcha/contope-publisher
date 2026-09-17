import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import parser from 'php-parser';
import { runCanvasEditorChecks } from './check-canvas-editor.mjs';

const pluginRoot = fileURLToPath(new URL('../contope-publisher/', import.meta.url));
const themeRoots = [
  fileURLToPath(new URL('../contope-canvas/', import.meta.url)),
  fileURLToPath(new URL('../contope-santa-luisa/', import.meta.url)),
];
const engine = new parser.Engine({
  parser: { extractDoc: true, php7: true },
  ast: { withPositions: true },
});

async function filesUnder(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path, extension)));
    else if (entry.name.endsWith(extension)) files.push(path);
  }
  return files;
}

const phpFiles = await filesUnder(pluginRoot, '.php');
for (const themeRoot of themeRoots) {
  phpFiles.push(...(await filesUnder(themeRoot, '.php')));
}
for (const file of phpFiles) {
  const source = await readFile(file, 'utf8');
  engine.parseCode(source, file);
}

const fixturePath = new URL('../fixtures/minimal-project.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
if (fixture.schemaVersion !== 0) throw new Error('Unexpected fixture schema version.');
if (fixture.project?.id !== 'santa-luisa-de-palpi') throw new Error('Unexpected project ID.');
if (!Array.isArray(fixture.pages) || fixture.pages.length !== 3) {
  throw new Error('The vertical fixture must contain exactly three pages.');
}
const ids = new Set();
for (const page of fixture.pages) {
  if (ids.has(page.id)) throw new Error(`Duplicate page ID: ${page.id}`);
  ids.add(page.id);
}

const main = await readFile(new URL('../contope-publisher/contope-publisher.php', import.meta.url), 'utf8');
if (!main.includes('Plugin Name: ContOpe Publisher')) {
  throw new Error('WordPress plugin header is missing.');
}

const complexFixture = JSON.parse(
  await readFile(new URL('../fixtures/complex-layout-project.json', import.meta.url), 'utf8'),
);
if (complexFixture.pages?.[0]?.nodes?.length < 4) {
  throw new Error('Complex fixture does not contain the expected top-level structure.');
}

const realFixture = JSON.parse(
  await readFile(new URL('../fixtures/santa-luisa-project.json', import.meta.url), 'utf8'),
);
if (realFixture.pages?.length !== 3 || realFixture.project?.id !== 'santa-luisa-de-palpi-real') {
  throw new Error('Santa Luisa fixture must contain the three real project pages.');
}

const childThemeJson = JSON.parse(
  await readFile(new URL('../contope-santa-luisa/theme.json', import.meta.url), 'utf8'),
);
if (childThemeJson.version !== 3 || childThemeJson.settings?.layout?.wideSize !== '1360px') {
  throw new Error('Santa Luisa block theme configuration is incomplete.');
}

const parentThemeJson = JSON.parse(
  await readFile(new URL('../contope-canvas/theme.json', import.meta.url), 'utf8'),
);
if (parentThemeJson.version !== 3 || parentThemeJson.settings?.layout?.wideSize !== '1360px') {
  throw new Error('ContOpe Canvas block theme configuration is incomplete.');
}

const childStylesheet = await readFile(
  new URL('../contope-santa-luisa/style.css', import.meta.url),
  'utf8',
);
if (!childStylesheet.includes('Template: contope-canvas')) {
  throw new Error('Santa Luisa must declare ContOpe Canvas as its parent theme.');
}

// El set de diseño es cerrado: lo declarado es todo lo que hay. Un valor de
// respaldo invisible hace lo contrario —rellena sin declarar— y el resultado se
// ve razonable, que es lo peor: un sitio con el azul de WordPress no parece
// roto, parece decidido.
//
// Esta comprobación existe porque el defecto ya ocurrió: durante meses el
// compilador escribía var(--cod-color-accent,#2271b1) y nadie lo vio. Una nota
// depende de que alguien la recuerde; esto no.
const TINTAS_DEL_PANEL = ['#2271b1', '#1d2327', '#f0f0f1'];
const rolesDelNucleo = ['--cod-color-accent', '--cod-color-ink', '--cod-color-surface'];
const reincidentes = [];
for (const file of phpFiles) {
  const source = await readFile(file, 'utf8');
  for (const token of rolesDelNucleo) {
    if (source.includes(token + ',')) {
      reincidentes.push(`${file}: ${token} lleva un valor de respaldo dentro de var()`);
    }
  }
  // El compilador es el que pinta el sitio: ahí ningún color del panel de
  // WordPress tiene nada que hacer. En las pantallas de administración son
  // legítimos, porque ahí SÍ se está dibujando la interfaz de WordPress.
  if (file.includes('recipe-compiler')) {
    for (const tinta of TINTAS_DEL_PANEL) {
      if (source.toLowerCase().includes(tinta)) {
        reincidentes.push(`${file}: escribe ${tinta}, un color del panel de WordPress`);
      }
    }
  }
}
if (reincidentes.length > 0) {
  throw new Error('Valores de respaldo no declarados:\n  ' + reincidentes.join('\n  '));
}

const nucleoSource = await readFile(
  new URL('../contope-publisher/includes/class-cod-design-core.php', import.meta.url),
  'utf8',
);
for (const rol of ['accent', 'ink', 'surface', 'heading', 'body', 'measure']) {
  if (!nucleoSource.includes(`'${rol}' =>`)) {
    throw new Error(`El núcleo del mundo web no declara el rol ${rol}.`);
  }
}

const canvasEditorSummary = await runCanvasEditorChecks();

console.log(
  `OK: parsed ${phpFiles.length} PHP files and validated three fixtures (${fixture.pages.length + complexFixture.pages.length + realFixture.pages.length} pages).`,
);
console.log(`OK: ${canvasEditorSummary}`);
