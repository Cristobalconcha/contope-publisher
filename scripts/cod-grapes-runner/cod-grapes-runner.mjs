#!/usr/bin/env node
/**
 * Editor de nodos por el motor REAL de GrapesJS, corriendo en esta máquina.
 *
 * Por qué existe: el hosting del sitio no tiene Node ni navegador headless, así
 * que el puente (tools/cod-headless-node-edit.mjs) no puede correr allá. Este
 * programa hace el circuito completo desde acá:
 *
 *   1. Pide el documento real al sitio      (MCP: cod_read_canvas_document)
 *   2. Se lo entrega al motor real de Grapes (puente headless, API de componentes)
 *   3. Guarda de vuelta lo que Grapes produjo (MCP: cod_write_canvas_document)
 *
 * El contenido del documento NUNCA pasa por el chat: va del sitio a Grapes y de
 * vuelta al sitio, en disco y memoria local. Eso garantiza fidelidad (nada se
 * reescribe ni se abrevia) y no consume contexto.
 *
 * Credenciales: se leen de cod-grapes-runner.config.json (ver .example).
 * Ese archivo NO debe subirse al repositorio.
 *
 * Uso:
 *   node cod-grapes-runner.mjs --page 44 --document ocd-canvas-page-14 \
 *     --selector "#iktkn" --set-content "Escríbenos directo y te respondemos a la brevedad."
 *
 *   node cod-grapes-runner.mjs --page 44 --document ocd-canvas-page-14 \
 *     --selector ".wa-bubble" --add-class "destacado" --style '{"bottom":"40px"}'
 *
 *   # Ver qué cambiaría, sin guardar:
 *   node cod-grapes-runner.mjs ... --dry-run
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bridgeScript = path.join(repoRoot, 'contope-publisher', 'tools', 'cod-headless-node-edit.mjs');
const buildScript = path.join(repoRoot, 'contope-publisher', 'tools', 'cod-headless-build.mjs');
const configPath = path.join(here, 'cod-grapes-runner.config.json');
const backupsDir = path.join(here, 'backups');

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- argumentos
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
  process.exit(0);
}

const pageId = Number.parseInt(args.page, 10);
const documentId = typeof args.document === 'string' ? args.document : '';
const selector = typeof args.selector === 'string' ? args.selector : '';

if (!Number.isInteger(pageId) || pageId < 0) fail('Falta --page <id> (número de página).');
if (documentId === '') fail('Falta --document <documentId> (ej. ocd-canvas-page-14).');
const buildSpecPath = typeof args.build === 'string' ? args.build : '';
const isBuild = buildSpecPath !== '';
if (!isBuild && selector === '') fail('Falta --selector <selector CSS>, o bien --build <archivo.json> para construir.');

// Mutación: al menos una acción real.
const mutation = {};
if (args.remove === true) mutation.remove = true;
if (typeof args['set-content'] === 'string') mutation.content = args['set-content'];
// --set-content-file: el contenido se lee de un archivo. Existe porque hay
// contenidos que no caben en una línea de comandos — la geometría de un mapa
// generado desde OpenStreetMap son cientos de kilobytes.
if (typeof args['set-content-file'] === 'string') {
  if (!existsSync(args['set-content-file'])) fail(`No existe el archivo de contenido: ${args['set-content-file']}`);
  mutation.content = readFileSync(args['set-content-file'], 'utf8');
}
if (args.index !== undefined) mutation.index = Number.parseInt(args.index, 10) || 0;
if (typeof args.closest === 'string' && args.closest !== '') mutation.closest = args.closest;
if (typeof args['add-class'] === 'string') mutation.addClass = args['add-class'].split(',').map((s) => s.trim()).filter(Boolean);
if (typeof args['remove-class'] === 'string') mutation.removeClass = args['remove-class'].split(',').map((s) => s.trim()).filter(Boolean);
// --attributes-file: los atributos se leen de un archivo. Existe por lo mismo
// que --set-content-file: el listado de lugares de un mapa son miles de
// caracteres y no caben en una línea de comandos.
if (typeof args['attributes-file'] === 'string') {
  if (!existsSync(args['attributes-file'])) fail(`No existe el archivo de atributos: ${args['attributes-file']}`);
  try { mutation.attributes = JSON.parse(readFileSync(args['attributes-file'], 'utf8')); }
  catch (e) { fail(`El archivo de atributos no es JSON válido: ${e.message}`); }
}
if (typeof args.attributes === 'string') {
  try { mutation.attributes = JSON.parse(args.attributes); } catch (e) { fail(`--attributes no es JSON válido: ${e.message}`); }
}
if (typeof args.style === 'string') {
  try { mutation.style = JSON.parse(args.style); } catch (e) { fail(`--style no es JSON válido: ${e.message}`); }
}
// "closest" solo redirige la mutación a un ancestro: no es una acción en sí,
// así que no cuenta para decidir si hay algo que hacer.
if (!isBuild && Object.keys(mutation).filter((k) => k !== 'closest' && k !== 'index').length === 0) {
  fail('No indicaste ninguna mutación. Usá --remove, --set-content, --add-class, --remove-class, --attributes o --style; o --build <archivo.json>.');
}

// Receta de construcción: { mode?, styles?: [...], structure?: [...] }
let buildSpec = null;
if (isBuild) {
  if (!existsSync(buildSpecPath)) fail(`No existe el archivo de construcción: ${buildSpecPath}`);
  try {
    buildSpec = JSON.parse(readFileSync(buildSpecPath, 'utf8'));
  } catch (e) {
    fail(`El archivo de construcción no es JSON válido: ${e.message}`);
  }
  const tieneEstructura = Array.isArray(buildSpec.structure) && buildSpec.structure.length > 0;
  const tieneEstilos = Array.isArray(buildSpec.styles) && buildSpec.styles.length > 0;
  if (!tieneEstructura && !tieneEstilos) fail('El archivo de construcción no trae "structure" ni "styles".');
}

const dryRun = args['dry-run'] === true;
// --sin-rescate: no repone lo que Grapes no conoce. Se usa al MIGRAR reglas
// hacia el JSON: si se repusieran, quedarían duplicadas con las nuevas.
const sinRescate = args['sin-rescate'] === true;

// ------------------------------------------------------------- configuración
// Las credenciales se buscan en dos lugares, en este orden. La segunda vía
// existe porque una contraseña de aplicación de WordPress se muestra UNA sola
// vez: si ya vive en el entorno, no hay que pedirle otra a nadie.
//   1. cod-grapes-runner.config.json (lo habitual)
//   2. variables de entorno COD_SITE_URL / COD_WP_USER / COD_WP_APP_PASSWORD
let config = {};
let origenConfig = '';
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
    origenConfig = path.basename(configPath);
  } catch (e) {
    fail(`${path.basename(configPath)} no es JSON válido: ${e.message}`);
  }
}
const desdeEntorno = {
  siteUrl: process.env.COD_SITE_URL,
  username: process.env.COD_WP_USER,
  applicationPassword: process.env.COD_WP_APP_PASSWORD,
};
for (const [key, value] of Object.entries(desdeEntorno)) {
  if (typeof config[key] !== 'string' || config[key].trim() === '') {
    if (typeof value === 'string' && value.trim() !== '') {
      config[key] = value;
      origenConfig = origenConfig ? `${origenConfig} + entorno` : 'variables de entorno';
    }
  }
}
const faltantes = ['siteUrl', 'username', 'applicationPassword']
  .filter((key) => typeof config[key] !== 'string' || config[key].trim() === '');
if (faltantes.length > 0) {
  fail(
    `Faltan credenciales: ${faltantes.join(', ')}.
` +
    `  Opción A — archivo: copiá cod-grapes-runner.config.example.json a
` +
    `             ${path.basename(configPath)} y completalo (se guarda, es una sola vez).
` +
    `  Opción B — entorno: definí COD_SITE_URL, COD_WP_USER y COD_WP_APP_PASSWORD.`
  );
}
const endpoint = `${config.siteUrl.replace(/\/+$/, '')}/wp-json/contope/v1/mcp`;
const authHeader = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword.replace(/\s+/g, '')}`).toString('base64');

// ------------------------------------------------------------------ MCP call
let rpcId = 0;
async function callTool(name, toolArgs) {
  rpcId += 1;
  // Un corte de conexión no es una negativa del sitio: se vuelve a intentar.
  const INTENTOS = 4;
  let response = null;
  let text = null;
  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: rpcId,
          method: 'tools/call',
          params: { name, arguments: toolArgs },
        }),
      });
      text = await response.text();
      break;
    } catch (e) {
      const corte = e.cause?.code || e.message || "";
      if (intento === INTENTOS) fail(`No se pudo hablar con el sitio tras ${INTENTOS} intentos (${corte}).`);
      console.log(`     la conexión se cortó (${corte}) — reintento ${intento + 1} de ${INTENTOS}…`);
      await new Promise((r) => setTimeout(r, 1500 * intento));
    }
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    fail(`Respuesta no-JSON del sitio (HTTP ${response.status}). ¿URL o credenciales mal?\n  ${text.slice(0, 300)}`);
  }
  if (payload.error) {
    fail(`El sitio rechazó "${name}": ${payload.error.message || JSON.stringify(payload.error)}`);
  }
  const result = payload.result;
  if (result?.isError) {
    const detail = result.content?.[0]?.text || JSON.stringify(result);
    fail(`La herramienta "${name}" falló: ${detail}`);
  }
  if (result?.structuredContent) return result.structuredContent;
  if (result?.content?.[0]?.text) {
    try { return JSON.parse(result.content[0].text); } catch { return result.content[0].text; }
  }
  return result;
}

// --------------------------------------------------------------------- flujo
console.log(`\n▸ Sitio:     ${config.siteUrl}`);
console.log(`▸ Página:    ${pageId} (${documentId})`);
if (isBuild) {
  const n = Array.isArray(buildSpec.structure) ? buildSpec.structure.length : 0;
  const r = Array.isArray(buildSpec.styles) ? buildSpec.styles.length : 0;
  const modo = buildSpec.mode === 'replace' ? 'reemplazar todo el contenido' : 'agregar al final';
  console.log(`▸ Construir: ${n} nodo(s) raíz, ${r} regla(s) de estilo — ${modo}${dryRun ? '   [SIMULACIÓN, no guarda]' : ''}
`);
} else {
  console.log(`▸ Nodo:      ${selector}`);
  console.log(`▸ Mutación:  ${JSON.stringify(mutation)}${dryRun ? '   [SIMULACIÓN, no guarda]' : ''}\n`);
}

console.log('1/3  Pidiendo el documento real al sitio…');
const doc = await callTool('cod_read_canvas_document', { pageId, documentId });
if (typeof doc?.projectData !== 'string') {
  fail('El sitio no devolvió projectData. ¿Existe esa página/documento?');
}
console.log(`     revisión ${doc.revision} · projectData ${doc.projectData.length} bytes · html ${doc.html.length} bytes · css ${doc.css.length} bytes`);

// Respaldo local antes de tocar nada.
if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupsDir, `${documentId}-rev${doc.revision}-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify(doc, null, 1), 'utf8');
console.log(`     respaldo guardado: ${path.relative(process.cwd(), backupPath)}`);

console.log('\n2/3  Editando con el motor real de GrapesJS (headless)…');
const bridgeInput = JSON.stringify(
  isBuild
    ? {
        document: { projectData: doc.projectData, html: doc.html, css: doc.css },
        mode: buildSpec.mode === 'replace' ? 'replace' : 'append',
        styles: Array.isArray(buildSpec.styles) ? buildSpec.styles : [],
        structure: Array.isArray(buildSpec.structure) ? buildSpec.structure : [],
      }
    : {
        document: { projectData: doc.projectData, html: doc.html, css: doc.css },
        selector,
        mutation,
      }
);
const bridge = spawnSync(process.execPath, [isBuild ? buildScript : bridgeScript], {
  input: bridgeInput,
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
  timeout: 120000,
});
if (bridge.error) fail(`No se pudo ejecutar el puente: ${bridge.error.message}`);
const bridgeOut = (bridge.stdout || '').trim();
if (bridgeOut === '') fail(`El puente no devolvió salida.\n  stderr: ${(bridge.stderr || '').slice(0, 500)}`);
let edited;
try {
  edited = JSON.parse(bridgeOut);
} catch (e) {
  fail(`El puente devolvió algo que no es JSON:\n  ${bridgeOut.slice(0, 500)}`);
}
if (!edited.ok) fail(`El motor de Grapes rechazó la edición: ${edited.error}`);
console.log(`     ok${isBuild ? ` · ${edited.creados} nodo(s) creado(s) · ${edited.reglas} regla(s) aplicada(s)` : ''} · html ${edited.html.length} bytes · css ${edited.css.length} bytes · projectData ${edited.projectData.length} bytes`);

// Comparación honesta de lo que importa: qué REGLAS de estilo desaparecieron.
// El tamaño en bytes engaña — Grapes reescribe el CSS compacto, sin comentarios
// ni indentación, así que puede encoger 25% sin perder nada.
function selectoresDe(css) {
  const set = new Set();
  String(css || '')
    .split('/*').map((parte, i) => (i === 0 ? parte : parte.slice(parte.indexOf('*/') + 2))).join(' ')
    .split('}')
    .forEach((chunk) => {
      // OJO con el escape: /s+/ (sin barra) parte por la LETRA "s" y convierte
      // .site-nav en ". ite-nav" y .cls-1 en ".cl -1". El informe de pérdidas
      // queda lleno de reglas fantasma. Pasó de verdad (2026-09-08).
      const sel = chunk.split('{')[0].trim().split(/\s+/).join(' ');
      if (sel && !sel.startsWith('@') && sel.length < 160) set.add(sel);
    });
  return set;
}
const selAntes = selectoresDe(doc.css);
const selDespues = selectoresDe(edited.css);
// Declaraciones abreviadas con variable: Grapes las expande a sus partes y,
// al no poder resolver la variable, las DESCARTA. Pasó de verdad el
// 2026-09-05: se perdieron 8 fondos (incluido el de un bloque con texto
// blanco, que quedó ilegible) y la comparación por selectores no lo vio,
// porque el selector seguía existiendo, vacío de esa declaración.
const ABREVIADAS = ['background', 'border', 'margin', 'padding', 'font', 'transition', 'box-shadow', 'border-bottom', 'border-top', 'border-left', 'border-right', 'flex', 'outline'];
function declaracionesConVariable(css) {
  const fuera = [];
  const limpio = String(css || '').split('/*').map((parte, k) => (k === 0 ? parte : parte.slice(parte.indexOf('*/') + 2))).join(' ');
  const bloques = limpio.match(/[^{}]+\{[^}]*\}/g) || [];
  for (const b of bloques) {
    const sel = b.split('{')[0].trim().split(/\s+/).join(' ');
    if (!sel || sel.startsWith('@')) continue;
    const cuerpo = b.slice(b.indexOf('{') + 1, b.lastIndexOf('}'));
    for (const d of cuerpo.split(';')) {
      const j = d.indexOf(':');
      if (j < 0) continue;
      const prop = d.slice(0, j).trim();
      const valor = d.slice(j + 1).trim();
      if (ABREVIADAS.includes(prop) && valor.includes('var(')) fuera.push({ sel, prop, valor });
    }
  }
  return fuera;
}
const escaparRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const declaracionesEnRiesgo = declaracionesConVariable(doc.css).filter(({ sel, prop, valor }) => {
  const variable = (valor.match(/var\(\s*(--[\w-]+)/) || [])[1];
  const m = edited.css.match(new RegExp(escaparRe(sel) + "\\s*\\{([^}]*)\\}", "i"));
  if (!m) return true;
  if (variable && m[1].includes(variable)) return false;
  return !m[1].includes(prop);
});
if (declaracionesEnRiesgo.length > 0) {
  console.log(`
     ⚠ ATENCIÓN: ${declaracionesEnRiesgo.length} declaración(es) con variable se perderían:`);
  declaracionesEnRiesgo.slice(0, 12).forEach((d) => console.log(`       · ${d.sel} → ${d.prop}: ${d.valor}`));
  console.log(`       Grapes descarta las abreviadas con var() al expandirlas.`);
  console.log(`       Reponelas en forma expandida (background-color, border-bottom-color, …).`);
} else {
  console.log(`     sin pérdida de declaraciones con variable`);
}
// --------------------------------------------------- rescate de datos (HTML)
//
// Mismo problema que el del CSS, con otra cara. Hay herramientas que escriben
// directo en el HTML guardado sin tocar projectData — cod_patch_geo_places,
// por ejemplo, que carga el listado de lugares del mapa. Grapes reconstruye
// el HTML desde projectData, así que esos datos desaparecen al guardar.
//
// Pasó de verdad el 2026-09-09: se cargaron diez colegios al directorio y la
// edición siguiente (agregar una opción a un selector) los borró.
//
// Se reponen SOLO los atributos que esta mutación no está tocando: si el
// usuario pidió cambiar ese atributo, manda lo que pidió.
const ATRIBUTOS_DE_DATOS = [
  'data-cod-geo-places',
  'data-cod-shortcode-atts',
  'data-cod-chart-data',
  'data-cod-parcel-data',
];
const tocadosPorLaMutacion = new Set(Object.keys(mutation.attributes || {}));
const datosRepuestos = [];
for (const attr of ATRIBUTOS_DE_DATOS) {
  if (tocadosPorLaMutacion.has(attr)) continue;
  const patron = new RegExp(`${attr}="([^"]*)"`, 'g');
  const antes = [...String(doc.html || '').matchAll(patron)].map((m) => m[1]);
  if (antes.length === 0) continue;
  let i = 0;
  edited.html = String(edited.html || '').replace(patron, (completo, valorNuevo) => {
    const valorViejo = antes[i];
    i += 1;
    if (valorViejo === undefined || valorViejo === valorNuevo) return completo;
    datosRepuestos.push(`${attr} (${valorViejo.length} vs ${valorNuevo.length} caracteres)`);
    return `${attr}="${valorViejo}"`;
  });
}
if (datosRepuestos.length > 0 && !sinRescate) {
  console.log(`     ↻ ${datosRepuestos.length} atributo(s) de datos REPUESTOS:`);
  datosRepuestos.forEach((d) => console.log(`       · ${d}`));
  console.log(`       (viven en el HTML guardado, no en projectData)`);
}

// ------------------------------------------------------------- rescate CSS
//
// GrapesJS reexporta TODO el CSS desde projectData. Cualquier regla que viva
// solo en la hoja guardada —las que se agregaron por cod_patch_css, por
// ejemplo— desaparece en silencio al guardar.
//
// Avisar no alcanzó: el aviso salía y el CSS se perdía igual. Así que acá se
// REPONE. Se recuperan únicamente las reglas cuyo selector NO aparece en el
// resultado de Grapes: si el selector sigue existiendo, Grapes tiene la
// versión buena y reponer la vieja la pisaría, que sería peor.
function reglasPorSelector(css) {
  const mapa = new Map();
  const texto = String(css || '');
  let i = 0;
  while (i < texto.length) {
    const abre = texto.indexOf('{', i);
    if (abre < 0) break;
    const selector = texto.slice(i, abre).trim();
    // Bloque con llaves anidadas (@media, @supports): hay que contarlas.
    let profundidad = 1;
    let j = abre + 1;
    while (j < texto.length && profundidad > 0) {
      if (texto[j] === '{') profundidad += 1;
      else if (texto[j] === '}') profundidad -= 1;
      j += 1;
    }
    if (selector !== '') {
      const clave = selector.replace(/\s+/g, ' ');
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave).push(texto.slice(i, j).trim());
    }
    i = j;
  }
  return mapa;
}

// Se compara por TEXTO EXACTO del bloque, no por selector.
//
// La primera versión de esto comparaba selectores: "si el selector sigue
// existiendo, Grapes tiene la versión buena". Sonaba prudente y estaba mal —
// las reglas escritas a mano suelen ser una CAPA ENCIMA de un selector que
// Grapes también usa (.modelos-incluye li, por ejemplo, existe en las dos
// partes: una pone el ✓ y la otra la animación). Con esa regla se saltaban
// justo las que había que salvar, y el defecto seguía vivo aunque el programa
// dijera que había repuesto cosas.
//
// Riesgo conocido: si la mutación cambió un estilo con --style, la versión
// vieja de esa regla volvería y pisaría la nueva. Por eso lo que se repone se
// lista siempre en pantalla, y --style avisa aparte.
function bloquesDe(css) {
  const salida = [];
  const texto = String(css || '');
  let i = 0;
  while (i < texto.length) {
    const abre = texto.indexOf('{', i);
    if (abre < 0) break;
    let profundidad = 1;
    let j = abre + 1;
    while (j < texto.length && profundidad > 0) {
      if (texto[j] === '{') profundidad += 1;
      else if (texto[j] === '}') profundidad -= 1;
      j += 1;
    }
    const bloque = texto.slice(i, j).trim();
    if (bloque !== '' && bloque.includes('{')) salida.push(bloque);
    i = j;
  }
  return salida;
}

// Un bloque viejo solo se repone si su selector NO figura en el CSS nuevo.
// Si figura, la versión que vale es la nueva: reponer la vieja al final la
// haría ganar por orden y el cambio no se vería.
//
// Excepción: un selector que ESTE pedido nombra a propósito (para fijarlo
// o para quitarlo, via --build) nunca se repone aunque haya desaparecido —
// desaparecer era el punto. El rescate sigue protegiendo todo lo demás,
// que es lo que se pierde como efecto secundario de una edición ajena.
const tocadosAProposito = isBuild && Array.isArray(buildSpec.styles)
  ? new Set(buildSpec.styles.map((s) => (s && typeof s.selector === 'string' ? s.selector.trim() : '')).filter(Boolean))
  : new Set();

// Un bloque @media envuelve sus reglas: sus selectores reales viven ADENTRO,
// y selectoresDe() descarta a propósito todo lo que empieza con "@". Sin
// desenvolverlo, un @media quedaba con CERO selectores — y con cero,
// `propios.size > 0` daba falso, así que nunca llegaba al `continue` y se
// reponía SIEMPRE, existiera ya o no. Cada guardado sumaba una copia más:
// la hoja de la portada llegó a 204 copias, el 27,6% de su peso (2026-09-10).
function selectoresReales(bloque) {
  const t = String(bloque || '').trim();
  if (!t.startsWith('@')) return selectoresDe(t);
  const abre = t.indexOf('{');
  const cierra = t.lastIndexOf('}');
  if (abre < 0 || cierra <= abre) return new Set();
  return selectoresDe(t.slice(abre + 1, cierra));
}

// Comparar sin espacios: Grapes reserializa con otro formato al reimportar,
// así que el mismo bloque vuelve escrito distinto y una comparación literal
// no lo reconocería.
const aplanar = (t) => String(t || '').replace(/\s+/g, '');
const cssNuevoPlano = aplanar(edited.css);

const yaDeclarados = selectoresDe(edited.css);
const rescatadas = [];
const yaRepuesto = new Set();
for (const bloque of bloquesDe(doc.css)) {
  const propios = selectoresReales(bloque);
  let tocado = false;
  for (const s of propios) if (tocadosAProposito.has(s)) { tocado = true; break; }
  if (tocado) continue;

  // Si el bloque ya está —textualmente— en el CSS nuevo, reponerlo es
  // duplicarlo. Y si ya se repuso uno idéntico en esta misma pasada, tampoco:
  // así las copias acumuladas se colapsan a una sola en el próximo guardado.
  const plano = aplanar(bloque);
  if (plano === '' || cssNuevoPlano.includes(plano) || yaRepuesto.has(plano)) continue;

  // Para las reglas normales se mantiene el criterio de siempre: si su
  // selector ya figura en el CSS nuevo, la versión que vale es la nueva. No
  // se aplica a @media, porque su selector interior suele existir también
  // como regla base y eso haría descartar la variante responsive.
  if (!String(bloque).trim().startsWith('@')) {
    let todosPresentes = propios.size > 0;
    for (const s of propios) if (!yaDeclarados.has(s)) { todosPresentes = false; break; }
    if (todosPresentes) continue;
  }

  yaRepuesto.add(plano);
  rescatadas.push(bloque);
}

if (rescatadas.length > 0 && mutation.style) {
  console.log(`     ⚠ Se usó --style Y hay reglas a reponer: revisá que la repuesta`);
  console.log(`       no pise el estilo nuevo (lo repuesto va al final y gana).`);
}
if (rescatadas.length > 0 && !sinRescate) {
  edited.css = String(edited.css || '') + rescatadas.join('');
  console.log(`     ↻ ${rescatadas.length} regla(s) que Grapes no conoce fueron REPUESTAS`);
  console.log(`       (viven en la hoja guardada, no en projectData; sin esto se perderían)`);
}

const selDespuesFinal = selectoresDe(edited.css);
const perdidosTotal = [...selAntes].filter((s) => !selDespuesFinal.has(s));
// Lo que el propio pedido mandó quitar no es sospechoso: separarlo evita que
// una remoción intencional se vea igual que una pérdida accidental.
const perdidosAPropósito = perdidosTotal.filter((s) => tocadosAProposito.has(s));
const perdidos = perdidosTotal.filter((s) => !tocadosAProposito.has(s));
const agregados = [...selDespuesFinal].filter((s) => !selAntes.has(s));
if (agregados.length > 0) {
  console.log(`     reglas nuevas: ${agregados.length}`);
}
if (perdidosAPropósito.length > 0) {
  console.log(`     quitadas a propósito: ${perdidosAPropósito.length} → ${perdidosAPropósito.join(", ")}`);
}
if (perdidos.length > 0) {
  console.log(`
     ⚠ ATENCIÓN: ${perdidos.length} regla(s) de estilo desaparecerían SIN que se pidieran:`);
  perdidos.slice(0, 12).forEach((s) => console.log(`       · ${s}`));
  if (perdidos.length > 12) console.log(`       … y ${perdidos.length - 12} más`);
  console.log(`       Revisá antes de publicar. Estado anterior completo en:`);
  console.log(`       ${path.relative(process.cwd(), backupPath)}`);
} else {
  console.log(`     sin pérdida de reglas de estilo no pedidas (${selAntes.size} → ${selDespuesFinal.size})`);
}

if (dryRun) {
  const previewPath = path.join(backupsDir, `${documentId}-PREVIEW-${stamp}.json`);
  writeFileSync(previewPath, JSON.stringify(edited, null, 1), 'utf8');
  console.log(`\n3/3  SIMULACIÓN: no se guardó nada.`);
  console.log(`     Resultado completo para revisar: ${path.relative(process.cwd(), previewPath)}\n`);
  process.exit(0);
}

console.log('\n3/3  Guardando en el sitio…');
const saved = await callTool('cod_write_canvas_document', {
  pageId,
  documentId,
  expectedRevision: doc.revision,
  projectData: edited.projectData,
  html: edited.html,
  css: edited.css,
});
console.log(`     guardado · nueva revisión ${saved.revision}`);
console.log(`\n✓ Listo. Estado anterior respaldado en ${path.relative(process.cwd(), backupPath)}\n`);
