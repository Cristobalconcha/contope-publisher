#!/usr/bin/env node
/**
 * probar-compuerta-real.mjs — intentos de saltarse el sistema, por el MCP REAL.
 *
 * `scripts/probar-compuerta-adn.php` prueba la compuerta llamando al servicio por
 * dentro de PHP. Esto la prueba como la usa una IA: el endpoint HTTP
 * `contope/v1/mcp` del local de Basis, con la contraseña de aplicación. Imprime la
 * respuesta del servidor de cada intento (código, motivo, ruta), para que quede a la
 * vista qué se le dijo a quien intentó.
 *
 * El local tiene que estar en modo `enforce` (la administración de WordPress, o
 * `wp option update cod_adn_gate_mode enforce`). Crea UNA página de prueba y la deja
 * (el nombre empieza con «ZZ»); no toca ninguna página de Basis.
 *
 *   AUTH_FILE=C:\...\.credencial-mcp-local.txt  node scripts/basis/probar-compuerta-real.mjs
 *
 * Nunca imprime la credencial. Sale con código distinto de cero si algún intento
 * que debía rechazarse se aceptó, o si el válido se rechazó.
 */
import { readFileSync } from 'node:fs';

const SITIO = (process.env.SITIO || 'http://localhost:8894').replace(/\/+$/, '');
const AUTH_FILE = process.env.AUTH_FILE || 'C:/Users/Cristobal concha/wp-local-basis/.credencial-mcp-local.txt';
const [usuario, ...resto] = readFileSync(AUTH_FILE, 'utf8').trim().split(':');
const auth = 'Basic ' + Buffer.from(usuario + ':' + resto.join(':').replace(/\s+/g, '')).toString('base64');
const ENDPOINT = SITIO + '/wp-json/contope/v1/mcp';

let n = 0;
async function llamar(name, args) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }),
  });
  const j = await r.json();
  if (!j.result) throw new Error('respuesta sin result: ' + JSON.stringify(j).slice(0, 300));
  return { error: j.result.isError === true, datos: j.result.structuredContent };
}

let fallas = 0;
function mostrar(titulo, esperaRechazo, codigoEsperado, r) {
  const rechazado = r.error;
  const codigo = r.datos?.code ?? '';
  const ok = esperaRechazo ? rechazado && (codigoEsperado ? codigo === codigoEsperado : true) : !rechazado;
  if (!ok) fallas += 1;
  console.log(`\n${ok ? 'ok    ' : 'FALLA '} ${titulo}`);
  console.log(`   servidor: isError=${rechazado}${codigo ? '  code=' + codigo : ''}`);
  const v = r.datos?.details?.violaciones?.[0];
  if (v) {
    console.log(`   ruta:     ${v.ruta}`);
    console.log(`   valor:    ${v.propiedad}: ${v.valor}`);
    if (v.sugerencias?.length) console.log(`   sugiere:  ${v.sugerencias.map((s) => s.variable + (s.valorResuelto ? ' = ' + s.valorResuelto : '')).join('  |  ')}`);
  } else if (r.datos?.message) {
    console.log(`   mensaje:  ${String(r.datos.message).slice(0, 260)}`);
  }
  if (!rechazado && r.datos?.adnGate) console.log(`   adnGate:  modo=${r.datos.adnGate.modo} nuevas=${r.datos.adnGate.nuevas} heredadas=${r.datos.adnGate.heredadas}`);
  if (!rechazado && r.datos?.evidence?.adnGate) console.log(`   adnGate:  modo=${r.datos.evidence.adnGate.modo} nuevas=${r.datos.evidence.adnGate.nuevas}`);
  return r;
}

const cap = await llamar('cod_get_capabilities', {});
const gate = cap.datos.adnGate;
console.log(`Compuerta del local: modo=${gate.modo}  registro: ${gate.registro.totalNombres} nombres (fuente ${gate.registro.fuente})`);
if (gate.modo !== 'enforce') {
  console.log('Este guion espera el modo enforce. Pónlo desde la administración de WordPress.');
  process.exit(2);
}

const creada = await llamar('cod_create_canvas_page', { title: 'ZZ compuerta MCP real ' + new Date().toISOString().slice(11, 19) });
const pageId = creada.datos.page.pageId;
const documentId = creada.datos.document.documentId;
let rev = creada.datos.document.revision;
console.log(`Página de prueba: pageId=${pageId} documentId=${documentId} revision=${rev}`);

const html = '<section class="zz"><p>Hola</p></section>';
const css = '.zz{color:var(--wp--preset--color--ink);padding-top:var(--wp--preset--spacing--40)}';
const pd = (h, c) => JSON.stringify({ pages: [{ name: 'p', component: { type: 'wrapper', components: h }, styles: c }], assets: [] });
const escribir = (h, c, p) => llamar('cod_write_canvas_document', { pageId, documentId, expectedRevision: rev, projectData: p ?? pd(h, c), html: h, css: c });

// 0) El válido primero: referencias al registro.
let r = mostrar('VÁLIDO · cod_write_canvas_document con var() del registro', false, '', await escribir(html, css));
if (!r.error) rev = r.datos.revision;

// 1) Intento: un color literal en el CSS.
mostrar('INTENTO 1 · color literal en el CSS (cod_write_canvas_document, color:#F26621)', true, 'ADN_LITERAL_COLOR',
  await escribir(html, css + '.zz h2{color:#F26621}'));

// 2) Intento: redefinir una variable del registro (cambia el color de todo el sitio).
mostrar('INTENTO 2 · redefinir --wp--preset--color--accent con cod_patch_css', true, 'ADN_VAR_RESERVED',
  await llamar('cod_patch_css', { pageId, documentId, expectedRevision: rev, search: '.zz{', replace: '.zz{--wp--preset--color--accent:var(--wp--preset--color--ink);' }));

// 3) Intento: el literal escondido SÓLO en projectData (el CSS y el HTML enviados están limpios).
mostrar('INTENTO 3 · literal sólo en projectData (el editor lo sacaría de ahí)', true, 'ADN_PROJECT_DATA_MISMATCH',
  await escribir(html, css, pd(html, css + '.oculto{background-color:#abcdef}')));

// 4) Intento: un fill="#…" en un SVG pegado por cod_patch_html.
mostrar('INTENTO 4 · fill="#123456" en un SVG (cod_patch_html)', true, 'ADN_LITERAL_COLOR',
  await llamar('cod_patch_html', { pageId, documentId, expectedRevision: rev, search: '<p>Hola</p>', replace: '<svg viewBox="0 0 8 8"><path d="M0 0h8v8z" fill="#123456"/></svg>' }));

// 5) Intento: una receta con un valor literal (preview).
const regla = { id: 'c-1', kind: 'color', scope: { breakpoint: 'all', state: 'default' }, provenance: { sources: [{ kind: 'user', rationale: 'intento' }] }, status: 'reviewed', value: { role: 'titulo', color: '#F26621' } };
const comp = (ids) => ({ schemaVersion: 2, nodes: [{ id: 'seccion', kind: 'section', ruleIds: ids, children: [{ id: 'titulo', kind: 'heading', ruleIds: ids, content: { level: 2, text: 'Titulo' } }] }] });
const dis = (reglas) => ({ schemaVersion: 1, designId: 'zz-compuerta', expectedDesignRevision: 0, reviewState: 'session', rules: reglas });
mostrar('INTENTO 5 · receta con color:#F26621 (cod_preview_canvas_composition)', true, 'ADN_LITERAL_COLOR',
  await llamar('cod_preview_canvas_composition', { pageId, documentId, expectedRevision: rev, composition: comp(['c-1']), design: dis([regla]) }));

// 6) Intento: apagar la compuerta por el MCP.
mostrar('INTENTO 6 · pedirle a una herramienta que cambie el modo ("modo":"off")', true, 'cod_mcp_invalid_arguments',
  await llamar('cod_patch_css', { pageId, documentId, expectedRevision: rev, search: 'x', replace: 'y', modo: 'off' }));
const cap2 = await llamar('cod_get_capabilities', {});
const sigue = cap2.datos.adnGate.modo === 'enforce';
if (!sigue) fallas += 1;
console.log(`\n${sigue ? 'ok    ' : 'FALLA '} después de todo, la compuerta sigue en modo=${cap2.datos.adnGate.modo}`);

// 7) El válido por la vía de la receta: preview + apply con referencias al registro.
const reglaOk = { ...regla, id: 'c-ok', value: { role: 'titulo', color: 'var(--wp--preset--color--accent)' } };
const pv = mostrar('VÁLIDO · receta con var(--wp--preset--color--accent) (preview)', false, '',
  await llamar('cod_preview_canvas_composition', { pageId, documentId, expectedRevision: rev, composition: comp(['c-ok']), design: dis([reglaOk]) }));
if (!pv.error) {
  mostrar('VÁLIDO · la misma receta (cod_apply_canvas_composition)', false, '',
    await llamar('cod_apply_canvas_composition', { pageId, documentId, expectedRevision: rev, previewId: pv.datos.previewId, composition: comp(['c-ok']), design: dis([reglaOk]) }));
}

// ---------------------------------------------------------------------------------------------
// Las otras puertas: la REST de WordPress con la misma contraseña de aplicación, y cod_write_block_page.
// ---------------------------------------------------------------------------------------------
console.log('\n== REST de WordPress con contraseña de aplicación, y la vía oficial de bloques ==');
const nombres = cap2.datos.adnGate.nombresPorClase || {};
const unoDe = (clase, preferido) => { const l = nombres[clase] || []; return l.find((n) => n.endsWith('--' + preferido)) || l[0] || ''; };
const slug = (nombre) => nombre.replace(/^--wp--(?:preset|custom)--[a-z-]+?--/, '');
const colorSlug = slug(unoDe('color', 'accent'));
const tamanoSlug = slug(unoDe('tamano', 'm'));
const espSlug = slug(unoDe('espaciado', 'm'));
const radio = unoDe('radio', 'm');
const par = (nombre, attrs, html) => `<!-- wp:${nombre}${attrs ? ' ' + JSON.stringify(attrs) : ''} -->${html}<!-- /wp:${nombre} -->`;
const CON_LITERAL = par('paragraph', { style: { color: { text: '#123456' } } }, '<p class="has-text-color" style="color:#123456">Hola</p>');
const CON_PRESET = par('paragraph', { textColor: colorSlug, ...(tamanoSlug ? { fontSize: tamanoSlug } : {}), style: { ...(espSlug ? { spacing: { padding: { top: 'var:preset|spacing|' + espSlug } } } : {}), ...(radio ? { border: { radius: 'var(' + radio + ')' } } : {}) } },
  `<p class="has-${colorSlug}-color has-text-color${tamanoSlug ? ' has-' + tamanoSlug + '-font-size' : ''}" style="${radio ? 'border-radius:var(' + radio + ');' : ''}${espSlug ? 'padding-top:var(--wp--preset--spacing--' + espSlug + ')' : ''}">Hola</p>`);
const REST = SITIO + '/wp-json';
async function rest(metodo, ruta, cuerpo, cabeceras) {
  const r = await fetch(REST + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...cabeceras }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = {}; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { estado: r.status, codigo: j.code ?? '', datos: j };
}
function verRest(titulo, ok, r) {
  if (!ok) fallas += 1;
  console.log(`\n${ok ? 'ok    ' : 'FALLA '} ${titulo}\n   servidor: HTTP ${r.estado}${r.codigo ? '  code=' + r.codigo : ''}`);
  const v = r.datos?.data?.violaciones?.[0];
  if (v) console.log(`   ruta:     ${v.ruta}\n   valor:    ${v.propiedad}: ${v.valor}`);
}
const conClave = { Authorization: auth };
let rr = await rest('POST', '/wp/v2/pages', { title: 'ZZ REST literal', status: 'draft', content: CON_LITERAL }, conClave);
verRest('INTENTO REST 1 · POST /wp/v2/pages con style.color.text:#123456 (contraseña de aplicación)', rr.estado === 400 && rr.codigo === 'ADN_LITERAL_COLOR', rr);
rr = await rest('POST', '/wp/v2/pages', { title: 'ZZ REST preset', status: 'draft', content: CON_PRESET }, conClave);
verRest('VÁLIDO · POST /wp/v2/pages con presets del registro', rr.estado === 201, rr);
const idPreset = rr.datos?.id;
const lista = await rest('GET', '/wp/v2/global-styles/themes/' + encodeURIComponent(process.env.TEMA || 'contope-basis'), null, conClave);
void lista;
rr = await rest('POST', '/wp/v2/global-styles/' + (Number(process.env.ID_ESTILOS_GLOBALES) || 1), { styles: { color: { background: '#000000' } } }, conClave);
verRest('INTENTO REST 2 · POST /wp/v2/global-styles (cambiar los valores del registro)', rr.estado === 403 && rr.codigo === 'ADN_GLOBAL_STYLES_BLOCKED', rr);
rr = await rest('PUT', '/wp/v2/plugins/contope-publisher/contope-publisher', { status: 'inactive' }, conClave);
verRest('INTENTO REST 3 · desactivar el plugin (apagar la compuerta)', rr.estado === 403 && rr.codigo === 'ADN_PLUGIN_CHANGE_BLOCKED', rr);
mostrar('INTENTO 8 · cod_write_block_page con style.color.text:#123456', true, 'ADN_LITERAL_COLOR',
  await llamar('cod_write_block_page', { pageId: 0, title: 'ZZ MCP bloques literal', content: CON_LITERAL }));
const bo = mostrar('VÁLIDO · cod_write_block_page con presets del registro', false, '',
  await llamar('cod_write_block_page', { pageId: 0, title: 'ZZ MCP bloques preset', content: CON_PRESET }));

// Una persona con sesión en el editor: cookie + nonce (sin contraseña de aplicación) no se bloquea.
const claveLocal = process.env.CLAVE_HUMANA || (readFileSync('C:/Users/Cristobal concha/wp-local-basis/ACCESO-LOCAL.md', 'utf8').match(/Contraseña:\s*(\S+)/) || [])[1];
const usuarioLocal = process.env.USUARIO_HUMANO || 'cristobal';
if (claveLocal) {
  const jar = new Map();
  const guardar = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
  const cookie = () => [...jar].map(([k, v]) => k + '=' + v).join('; ');
  guardar(await fetch(SITIO + '/wp-login.php'));
  jar.set('wordpress_test_cookie', 'WP%20Cookie%20check');
  const login = await fetch(SITIO + '/wp-login.php', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() }, body: new URLSearchParams({ log: usuarioLocal, pwd: claveLocal, 'wp-submit': 'Acceder', redirect_to: SITIO + '/wp-admin/', testcookie: '1' }) });
  guardar(login);
  const nonce = (await (await fetch(SITIO + '/wp-admin/admin-ajax.php?action=rest-nonce', { headers: { Cookie: cookie() } })).text()).trim();
  if (nonce && nonce.length < 20) {
    rr = await rest('POST', '/wp/v2/pages', { title: 'ZZ REST persona', status: 'draft', content: CON_LITERAL }, { Cookie: cookie(), 'X-WP-Nonce': nonce });
    verRest('PERSONA · POST /wp/v2/pages con el mismo literal, con sesión y nonce (no se bloquea)', rr.estado === 201, rr);
    if (rr.datos?.id) await rest('DELETE', '/wp/v2/pages/' + rr.datos.id + '?force=true', null, { Cookie: cookie(), 'X-WP-Nonce': nonce });
  } else {
    fallas += 1;
    console.log('\nFALLA  no pude abrir sesión de persona para la prueba (revisa USUARIO_HUMANO / CLAVE_HUMANA o ACCESO-LOCAL.md)');
  }
}
if (idPreset) await rest('DELETE', '/wp/v2/pages/' + idPreset + '?force=true', null, conClave);
if (bo?.datos?.pageId) await rest('DELETE', '/wp/v2/pages/' + bo.datos.pageId + '?force=true', null, conClave);

console.log(`\n${fallas === 0 ? 'TODO COMO SE ESPERABA' : fallas + ' intento(s) no se comportaron como se esperaba'}`);
process.exit(fallas === 0 ? 0 : 1);
