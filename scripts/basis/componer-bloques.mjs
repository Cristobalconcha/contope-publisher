/**
 * Rearma las cinco páginas de Basis como BLOQUES DE WORDPRESS, escribiendo SÓLO por la vía oficial del MCP
 * (`cod_write_block_page`), con la compuerta del diseño en `enforce`.
 *
 *   node scripts/basis/componer-bloques.mjs [--solo=pagina[,pagina]] [--seco] [--sin-tema]
 *
 * Qué hace, en orden:
 *   1. Lee los `salida/<pagina>.componer.json` (los de siempre: textos, imágenes y correcciones de `correcciones.json` ya
 *      aplicadas) y las escalas (`escalas.json`).
 *   2. Traduce cada nodo a un bloque (`lib/nodos-a-bloques.mjs`); cada valor de diseño queda como una referencia a las escalas
 *      o al registro. Lo que no tiene atributo ni escala se anota en `salida/bloques/perdidas.json`: no se rodea con CSS.
 *   3. Los degradados que el sitio usa y la variante del formulario (`settings.custom.form`) se declaran en el theme.json del
 *      tema (el lugar donde vive el set); se copia al local si cambió.
 *   4. Serializa el árbol con el EDITOR REAL de WordPress (Chrome sin ventana: `wp.blocks.createBlock` + `serialize`), de modo
 *      que el HTML guardado de cada bloque sea el que el editor espera y nunca salga «bloque no válido».
 *   5. Escribe cada página por `cod_write_block_page` (revisión esperada, compuerta del diseño). Si la compuerta rechaza algo, el
 *      defecto es del sistema y se amplía el sistema: este guion no tiene ninguna vía para saltársela.
 *
 * Entorno: SITIO (http://localhost:8894), AUTH_FILE (usuario:contraseña de aplicación; nunca se imprime). Para abrir el editor
 * hace falta una sesión de persona: se toma de wp-local-basis/ACCESO-LOCAL.md (CLAVE_HUMANA / USUARIO_HUMANO lo reemplazan).
 * Sólo toca el WordPress local de Basis.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome } from '../piezas/chrome.mjs';
import { crearTraductor } from './lib/bloques.mjs';
import { convertirPagina, crearRegistroDeGradientes } from './lib/nodos-a-bloques.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(aqui, '../..');
const SITIO = (process.env.SITIO || 'http://localhost:8894').replace(/\/+$/, '');
const AUTH_FILE = process.env.AUTH_FILE || 'C:/Users/Cristobal concha/wp-local-basis/.credencial-mcp-local.txt';
const SECO = process.argv.includes('--seco');
const SIN_TEMA = process.argv.includes('--sin-tema');
const SOLO = (process.argv.find((a) => a.startsWith('--solo=')) || '').slice(7).split(',').filter(Boolean);
const PAGINAS = ['inicio', 'basis-carpas-industriales', 'preguntas-frecuentes', 'contactos', 'terminos-y-privacidad'];
const SAL = path.join(aqui, 'salida', 'bloques');
mkdirSync(SAL, { recursive: true });

const [usuario, ...resto] = readFileSync(AUTH_FILE, 'utf8').trim().split(':');
const AUTH = 'Basic ' + Buffer.from(usuario + ':' + resto.join(':').replace(/\s+/g, '')).toString('base64');
const perfil = JSON.parse(readFileSync(path.join(aqui, 'perfil.json'), 'utf8'));
const escalas = JSON.parse(readFileSync(path.join(aqui, 'escalas.json'), 'utf8'));
const uploads = perfil.carpetaUploads;

// ------------------------------------------------------------------------------------------ medios e íconos
const medios = new Map();
{
  const r = await fetch(`${SITIO}/wp-json/wp/v2/media?per_page=100&_fields=id,source_url`, { headers: { Authorization: AUTH } });
  for (const m of await r.json()) medios.set(new URL(m.source_url).pathname, { id: m.id });
}
const iconos = new Map();
const cargarIcono = (forma) => {
  if (iconos.has(forma)) return;
  const arch = path.join(uploads, forma.replace(/^\/wp-content\/uploads\//, ''));
  if (existsSync(arch)) iconos.set(forma, readFileSync(arch, 'utf8'));
};

// ------------------------------------------------------------------------------------------ árboles
const T = crearTraductor({ escalas, medios, iconos });
const gradientes = crearRegistroDeGradientes();
const arboles = {};
let formularioTema = null;
for (const slug of PAGINAS) {
  if (SOLO.length && !SOLO.includes(slug)) continue;
  const d = JSON.parse(readFileSync(path.join(aqui, 'salida', `${slug}.componer.json`), 'utf8'));
  for (const r of d.design.rules) if (r.kind === 'icono' && r.value.forma) cargarIcono(r.value.forma);
  if (slug === 'contactos') formularioTema = d.design.rules.find((r) => r.kind === 'form')?.value.theme ?? null;
  const antes = T.perdidas.length;
  const bloques = convertirPagina({ nodos: d.composition.nodes, reglas: d.design.rules }, T, { gradientes });
  arboles[slug] = { titulo: d.titulo, bloques: [{ name: 'contope/lienzo', attrs: { documentId: '' }, inner: bloques }], perdidas: T.perdidas.length - antes };
  writeFileSync(path.join(SAL, `${slug}.arbol.json`), JSON.stringify(arboles[slug].bloques, null, 2));
  console.log(`${slug}: ${JSON.stringify(arboles[slug].bloques).match(/"name"/g).length} bloques, ${arboles[slug].perdidas} diferencias anotadas`);
}

// ------------------------------------------------------------------------------------------ el tema (degradados y variante del formulario)
function actualizarTema() {
  const ruta = path.join(repo, 'contope-basis', 'theme.json');
  const crudo = readFileSync(ruta, 'utf8');
  const crlf = crudo.includes('\r\n');
  const tema = JSON.parse(crudo);
  tema.settings.color.gradients = [...gradientes.usados.values()].sort((a, b) => a.slug.localeCompare(b.slug)).map((g) => ({ slug: g.slug, name: g.name, gradient: g.gradient }));
  if (formularioTema) {
    const trad = (v) => String(v)
      .replace(/var\(--cod-color-surface\)/g, 'var(--wp--preset--color--fondo-pagina)')
      .replace(/var\(--cod-color-accent\)/g, 'var(--wp--preset--color--accent)')
      .replace(/var\(--cod-color-ink\)/g, 'var(--wp--preset--color--texto-cuerpo)')
      .replace(/var\(--cod-font-body\)/g, 'var(--wp--preset--font-family--body)');
    tema.settings.custom = tema.settings.custom || {};
    tema.settings.custom.form = Object.fromEntries(Object.entries(formularioTema).map(([k, v]) => [k, trad(v)]));
  }
  let json = JSON.stringify(tema, null, 2);
  if (crlf) json = json.replace(/\n/g, '\r\n');
  if (json + (crlf ? '\r\n' : '\n') === crudo || json === crudo) return false;
  writeFileSync(ruta, json + (crlf ? '\r\n' : '\n'));
  return true;
}
if (!SIN_TEMA && !SOLO.length) {
  if (actualizarTema()) {
    console.log('theme.json actualizado (degradados y variante del formulario) → se copia al local');
    const r = spawnSync('node', [path.join(aqui, 'sincronizar-local.mjs')], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stdout + r.stderr); process.exit(1); }
  }
}

// ------------------------------------------------------------------------------------------ serializar con el editor real
async function serializarConElEditor(trabajos) {
  const clave = process.env.CLAVE_HUMANA || (readFileSync('C:/Users/Cristobal concha/wp-local-basis/ACCESO-LOCAL.md', 'utf8').match(/Contraseña:\s*(\S+)/) || [])[1];
  const usuarioH = process.env.USUARIO_HUMANO || 'cristobal';
  const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: 1400, alto: 900, escala: 1, movil: false });
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.navigate', { url: `${SITIO}/wp-login.php` });
    await dormir(2000);
    await evaluar(`(() => { document.querySelector('#user_login').value = ${JSON.stringify(usuarioH)}; document.querySelector('#user_pass').value = ${JSON.stringify(clave)}; document.querySelector('#wp-submit').click(); })()`);
    await dormir(3500);
    await cdp('Page.navigate', { url: `${SITIO}/wp-admin/post-new.php?post_type=page` });
    for (let i = 0; i < 60; i += 1) {
      await dormir(1000);
      const listo = await evaluar(`!!(window.wp && wp.blocks && wp.blocks.getBlockTypes && wp.blocks.getBlockType('core/accordion') && wp.blocks.getBlockType('core/cover') && wp.blocks.getBlockType('contope/mapa'))`).catch(() => false);
      if (listo) break;
      if (i === 59) throw new Error('el editor no cargó (¿sesión?)');
    }
    const salida = {};
    for (const [slug, bloques] of Object.entries(trabajos)) {
      const r = await evaluar(`(() => {
        const descartados = [];
        const mk = (n) => {
          const tipo = wp.blocks.getBlockType(n.name);
          if (!tipo) throw new Error('bloque no registrado: ' + n.name);
          for (const k of Object.keys(n.attrs || {})) if (!(k in tipo.attributes)) descartados.push(n.name + '.' + k);
          return wp.blocks.createBlock(n.name, n.attrs || {}, (n.inner || []).map(mk));
        };
        const arbol = ${JSON.stringify(bloques)};
        const bs = arbol.map(mk);
        const contenido = wp.blocks.serialize(bs);
        // lo que el editor leería de vuelta: parsear lo serializado y revisar que cada bloque sea válido
        const invalidos = [];
        const revisar = (b, ruta) => { if (!b.isValid) invalidos.push(ruta + ' ' + b.name); (b.innerBlocks || []).forEach((h, i) => revisar(h, ruta + '.' + i)); };
        wp.blocks.parse(contenido).forEach((b, i) => revisar(b, String(i)));
        return { contenido, descartados: [...new Set(descartados)], invalidos };
      })()`);
      salida[slug] = r;
    }
    return salida;
  } finally { await cerrar(); }
}

const trabajos = Object.fromEntries(Object.entries(arboles).map(([s, a]) => [s, a.bloques]));
const serializados = await serializarConElEditor(trabajos);
for (const [slug, r] of Object.entries(serializados)) {
  writeFileSync(path.join(SAL, `${slug}.html`), r.contenido);
  console.log(`${slug}: serializada (${r.contenido.length} bytes)${r.descartados.length ? '; atributos que el editor descartó: ' + r.descartados.join(', ') : ''}${r.invalidos.length ? '; BLOQUES NO VÁLIDOS al releerla: ' + r.invalidos.join(', ') : ''}`);
}
writeFileSync(path.join(SAL, 'perdidas.json'), JSON.stringify({ perdidas: T.perdidas, avisos: T.avisos }, null, 2));
console.log(`diferencias anotadas: ${T.perdidas.length}; avisos: ${T.avisos.length} → salida/bloques/perdidas.json`);
if (Object.values(serializados).some((r) => r.invalidos.length)) { console.error('hay bloques no válidos: no se escribe'); process.exit(1); }
if (SECO) { console.log('--seco: no se escribió nada'); process.exit(0); }

// ------------------------------------------------------------------------------------------ escribir por el MCP (la compuerta decide)
let n = 0;
async function llamar(name, args) {
  const r = await fetch(`${SITIO}/wp-json/contope/v1/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }) });
  const j = await r.json();
  if (!j.result) throw new Error('respuesta sin result: ' + JSON.stringify(j).slice(0, 300));
  return { error: j.result.isError === true, datos: j.result.structuredContent };
}
let fallas = 0;
for (const slug of Object.keys(serializados)) {
  const ids = await (await fetch(`${SITIO}/wp-json/wp/v2/pages?slug=${slug}&status=any&_fields=id`, { headers: { Authorization: AUTH } })).json();
  const pageId = ids[0]?.id;
  if (!pageId) { console.error(`FALLA ${slug}: la página no existe`); fallas += 1; continue; }
  const lee = await llamar('cod_read_block_page', { pageId });
  const r = await llamar('cod_write_block_page', { pageId, expectedRevision: lee.datos.revision, content: serializados[slug].contenido });
  if (r.error) {
    fallas += 1;
    const v = r.datos?.details?.violaciones || [];
    console.error(`FALLA ${slug}: ${r.datos?.code} — ${String(r.datos?.message).slice(0, 300)}`);
    for (const x of v.slice(0, 8)) console.error(`   ${x.codigo} ${x.ruta}  ${x.propiedad}: ${x.valor}`);
    writeFileSync(path.join(SAL, `${slug}.rechazo.json`), JSON.stringify(r.datos, null, 2));
  } else {
    console.log(`ok ${slug}: página ${pageId}, revisión ${r.datos.revision}, ${r.datos.blocks} bloque(s) raíz, ${r.datos.bytes} bytes, compuerta ${r.datos.adnGate?.modo}: revisadas ${r.datos.adnGate?.revisadas}, nuevas ${r.datos.adnGate?.nuevas}`);
  }
}
process.exit(fallas ? 1 : 0);
