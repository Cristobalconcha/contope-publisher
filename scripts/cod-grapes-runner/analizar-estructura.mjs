#!/usr/bin/env node
/**
 * Lee una página del sitio y muestra su estructura como la vería el sistema:
 * sección → fila → columna → módulo.
 *
 * No modifica nada. Sirve para revisar el mapeo ANTES de aplicarlo: qué
 * elementos van a recibir identidad estructural (cod-section / cod-columns /
 * cod-column) y dónde el mapeo es dudoso y conviene decidirlo a mano.
 *
 * Uso:
 *   node analizar-estructura.mjs --page 44 --document ocd-canvas-page-14
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(here, 'cod-grapes-runner.config.json');

function fail(m) { console.error(`\n✗ ${m}\n`); process.exit(1); }

const args = {};
process.argv.slice(2).forEach((t, i, a) => { if (t.startsWith('--')) args[t.slice(2)] = a[i + 1]; });
const pageId = Number.parseInt(args.page, 10);
const documentId = args.document || '';
if (!Number.isInteger(pageId) || documentId === '') fail('Uso: --page <id> --document <documentId>');

let config = {};
if (existsSync(configPath)) config = JSON.parse(readFileSync(configPath, 'utf8'));
config.siteUrl = config.siteUrl || process.env.COD_SITE_URL;
config.username = config.username || process.env.COD_WP_USER;
config.applicationPassword = config.applicationPassword || process.env.COD_WP_APP_PASSWORD;
if (!config.siteUrl || !config.username || !config.applicationPassword) fail('Faltan credenciales (config o entorno).');

const auth = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword.replace(/\s+/g, '')}`).toString('base64');
const res = await fetch(`${config.siteUrl.replace(/\/+$/, '')}/wp-json/contope/v1/mcp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'cod_read_canvas_document', arguments: { pageId, documentId } } }),
});
const payload = JSON.parse(await res.text());
if (payload.error) fail(payload.error.message);
const doc = payload.result?.structuredContent || JSON.parse(payload.result.content[0].text);

const dom = new JSDOM(`<body>${doc.html}</body>`);
const { document } = dom.window;

// ---- Vocabulario del sistema (verificado en cod-editor-core.js / cod-behaviors.js)
const YA_TIPADO = { 'cod-section': 'SECCIÓN', 'cod-columns': 'FILA', 'cod-column': 'COLUMNA', 'cod-group': 'GRUPO' };
const MODULOS = new Set(['geo-map', 'parcel-map', 'hero-collapse', 'lightbox', 'carousel-basic', 'nav-toggle', 'anchor', 'reveal-on-scroll', 'scroll-threshold', 'chart']);

const clasesDe = (el) => Array.from(el.classList || []);
const esModulo = (el) => el.hasAttribute('data-cod-behavior') && MODULOS.has(el.getAttribute('data-cod-behavior'));
const hijosElemento = (el) => Array.from(el.children);

function tipoYaAsignado(el) {
  for (const [clase, nombre] of Object.entries(YA_TIPADO)) if (el.classList.contains(clase)) return nombre;
  return null;
}

// Contenido: acá termina el esqueleto. Dentro de una columna hay módulos y
// contenido, no más filas — salvo que haya una grilla anidada de verdad.
const CONTENIDO = new Set(['H1','H2','H3','H4','H5','H6','P','SPAN','A','IMG','UL','OL','LI','VIDEO','SVG','BUTTON','STRONG','EM','FIGURE','FIGCAPTION','TABLE','FORM','INPUT','TEXTAREA','SELECT','LABEL','BR','HR','PICTURE','SOURCE','IFRAME','CANVAS','BLOCKQUOTE','TIME','SMALL','B','I']);
const esContenedor = (el) => !CONTENIDO.has(el.tagName) && hijosElemento(el).length > 0;

/**
 * Modelo: la sección es el contenedor externo; dentro va la fila; dentro de
 * la fila, las columnas; dentro de la columna, módulos o contenido. Una
 * columna que contiene varias cajas hermanas contenedoras abre una fila
 * anidada (grilla dentro de grilla).
 */
function proponer(el, rol) {
  const ya = tipoYaAsignado(el);
  if (ya) return { tipo: ya, yaEstaba: true };
  if (esModulo(el)) return { tipo: 'MÓDULO:' + el.getAttribute('data-cod-behavior'), yaEstaba: true };
  if (['SECTION', 'HEADER', 'FOOTER', 'NAV'].includes(el.tagName)) return { tipo: 'SECCIÓN', yaEstaba: false };
  if (el.tagName === 'svg' || el.tagName === 'SVG' || el.ownerSVGElement) return null; // gráfico: pieza completa
  if (CONTENIDO.has(el.tagName)) return null;
  if (rol === 'fila') return { tipo: 'FILA', yaEstaba: false };
  if (rol === 'columna') return { tipo: 'COLUMNA', yaEstaba: false };
  return null;
}

let porAsignar = { SECCIÓN: 0, FILA: 0, COLUMNA: 0 };
const dudas = [];
const lineas = [];

function recorrer(el, rol, profundidad) {
  const prop = proponer(el, rol);
  const clases = clasesDe(el);
  const etiqueta = el.tagName.toLowerCase();
  if (prop) {
    if (!prop.yaEstaba && porAsignar[prop.tipo] !== undefined) porAsignar[prop.tipo] += 1;
    const marca = prop.yaEstaba ? '✓' : '+';
    lineas.push(`${'  '.repeat(profundidad)}${marca} ${prop.tipo.padEnd(22)} <${etiqueta}${clases.length ? ' .' + clases.join('.') : ''}>`);
  }

  if (el.tagName === 'svg' || el.tagName === 'SVG' || el.ownerSVGElement) return; // no se entra en un gráfico
  if (CONTENIDO.has(el.tagName)) return; // el contenido no contiene esqueleto
  const hijos = hijosElemento(el);
  if (hijos.length === 0) return;

  let rolHijos = null;
  if (prop && prop.tipo === 'SECCIÓN') {
    rolHijos = 'fila';
  } else if (prop && prop.tipo === 'FILA') {
    rolHijos = 'columna';
  } else if (prop && prop.tipo === 'COLUMNA') {
    // Solo se abre una fila anidada si hay VARIAS cajas contenedoras hermanas.
    const contenedores = hijos.filter(esContenedor);
    if (contenedores.length > 1) {
      rolHijos = 'fila';
    } else if (contenedores.length === 1 && hijos.length === 1) {
      rolHijos = 'fila';
    } else {
      return; // contenido y módulos: acá termina el esqueleto
    }
  } else if (prop && prop.tipo.startsWith('MÓDULO')) {
    return; // un módulo es una unidad: no se desarma
  } else if (!prop) {
    rolHijos = rol; // envoltorio sin identidad: seguimos buscando en el mismo rol
  }

  hijos.forEach((h) => recorrer(h, rolHijos, profundidad + 1));
}



console.log(`\nPágina ${pageId} · ${documentId} · revisión ${doc.revision}\n`);
Array.from(document.body.children).forEach((el) => recorrer(el, 'seccion', 0));
console.log(lineas.join('\n'));

console.log(`\n────────────────────────────────────────`);
console.log(`✓ = ya tiene identidad de sistema    + = habría que asignársela`);
console.log(`Por asignar: ${porAsignar['SECCIÓN']} sección(es), ${porAsignar.FILA} fila(s), ${porAsignar.COLUMNA} columna(s)`);
if (dudas.length) {
  console.log(`\nDudas para decidir a mano (${dudas.length}):`);
  dudas.slice(0, 10).forEach((d) => console.log('  · ' + d));
} else {
  console.log('\nSin dudas: el mapeo es directo.');
}
console.log('');
