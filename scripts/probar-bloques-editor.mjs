/**
 * Los tres bloques propios (contope/formulario, contope/mapa, contope/whatsapp), lado archivos y editor:
 *  - block.json válido, con el nombre, apiVersion 3 y los archivos que declara (render, editor, estilos);
 *  - el JavaScript del editor compila (sin build tools: JS plano con wp.*) y registra el bloque con su nombre;
 *  - todos son dinámicos (save devuelve null) y no llevan la clave, el número ni valores de diseño;
 *  - cada bloque está en el registro del plugin (contope-publisher.php);
 *  - las hojas no traen hex, rgb/hsl ni font-family literales (la marca de WhatsApp es el único color literal, y vive en un SVG).
 *
 * No necesita WordPress: lee los archivos. El render y los atributos se prueban en probar-bloques-formulario-mapa-whatsapp.php.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'contope-publisher');
let fallas = 0;
let total = 0;
const comprobar = (caso, ok, detalle = '') => {
  total += 1;
  console.log(`${ok ? '  ok     ' : '  FALLA  '}${caso}${!ok && detalle ? `   ${detalle}` : ''}`);
  if (!ok) fallas += 1;
};

const bloques = [
  ['cod-formulario', 'contope/formulario', 'COD_Block_Formulario'],
  ['cod-mapa', 'contope/mapa', 'COD_Block_Mapa'],
  ['cod-whatsapp', 'contope/whatsapp', 'COD_Block_Whatsapp'],
];
const principal = readFileSync(path.join(raiz, 'contope-publisher.php'), 'utf8');

for (const [carpeta, nombre, clase] of bloques) {
  console.log(nombre);
  const dir = path.join(raiz, 'blocks', carpeta);
  let json;
  try {
    json = JSON.parse(readFileSync(path.join(dir, 'block.json'), 'utf8'));
  } catch (e) {
    comprobar('block.json es JSON válido', false, String(e));
    continue;
  }
  comprobar('block.json: nombre y apiVersion 3', json.name === nombre && json.apiVersion === 3);
  comprobar('block.json: dinámico (render) y con script de editor', json.render === 'file:./render.php' && json.editorScript === 'file:./index.js');
  for (const f of ['render.php', 'index.js', 'index.asset.php', 'style.css']) {
    comprobar(`existe ${f}`, existsSync(path.join(dir, f)));
  }
  const estilos = [].concat(json.style ?? [], json.editorStyle ?? []).filter((s) => String(s).startsWith('file:'));
  comprobar('los archivos de estilo que declara existen', estilos.every((s) => existsSync(path.join(dir, String(s).slice(5)))));

  const js = readFileSync(path.join(dir, 'index.js'), 'utf8');
  let compila = true;
  try {
    new vm.Script(js, { filename: `${carpeta}/index.js` });
  } catch (e) {
    compila = false;
    comprobar('index.js compila', false, String(e));
  }
  if (compila) comprobar('index.js compila', true);
  comprobar(`index.js registra ${nombre}`, js.includes(`registerBlockType('${nombre}'`));
  comprobar('index.js: save devuelve null (dinámico)', /save:\s*function\s*\(\)\s*\{[^}]*return null;/s.test(js));
  comprobar('index.js no usa módulos ni build (sin import/export)', !/^\s*(import|export)\s/m.test(js));

  const asset = readFileSync(path.join(dir, 'index.asset.php'), 'utf8');
  comprobar('index.asset.php declara wp-blocks, wp-element y wp-block-editor', ['wp-blocks', 'wp-element', 'wp-block-editor'].every((d) => asset.includes(`'${d}'`)));

  comprobar(`${clase} está registrada en contope-publisher.php`, principal.includes(`class-cod-block-${carpeta.slice(4)}.php`) && principal.includes(`new ${clase}()`));

  const atributos = Object.keys(json.attributes ?? {}).join(' ').toLowerCase();
  comprobar('sin atributos de clave, token, número o URL de teléfono', !/token|clave|apikey|numero|phone|telefono|href|url/.test(atributos), atributos);

  for (const f of ['style.css', 'editor.css']) {
    const ruta = path.join(dir, f);
    if (!existsSync(ruta)) continue;
    const css = readFileSync(ruta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    comprobar(`${f}: sin hex, rgb/hsl ni font-family literal`, !/#[0-9a-fA-F]{3,8}\b/.test(css) && !/\b(rgba?|hsla?|hwb)\(/i.test(css) && !/font-family\s*:(?![^;]*var\()/i.test(css));
  }
}

console.log(`\n${total} comprobaciones, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
