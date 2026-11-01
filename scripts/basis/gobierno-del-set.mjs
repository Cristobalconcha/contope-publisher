/**
 * ¿El sitio está GOBERNADO por el set de diseño? Se comprueba leyendo lo que el sitio SIRVE, por HTTP.
 *
 * Un sitio gobernado por el set cambia cuando cambia el set. Si el diseño lleva copiados los colores
 * y las tipografías (`#F26621`, `'Open Sans', sans-serif`), cambiar el set no cambia nada y nadie se
 * entera: parece decidido, y está duplicado. Cuatro comprobaciones, cada una un PROBLEMA (no un aviso):
 *
 *   1. La hoja del diseño que carga la página (`uploads/contope-disenos/*.css`, o el <style> con
 *      las reglas `cod-rule--` si el plugin las pone en línea) no tiene colores hex/rgb/hsl ni
 *      `font-family` literales. Sólo se admite un literal donde SE DECLARA el set: una propiedad
 *      personalizada de la paleta o de las familias (`--wp--preset--color--*`, `--wp--preset--font-family--*`,
 *      `--cod-color-*`, `--cod-font-*`).
 *   2. El núcleo del set (COD_Design_Core) no tiene ningún rol «sin declarar»: las ocho variables
 *      del núcleo salen declaradas en la página; y, si hay credencial del canal MCP, también lo
 *      dice el propio plugin (`cod_get_capabilities` › designCore › faltantes).
 *   3. La página emite las variables de las DEFINICIONES DE ESTILO del tema (`--cod-color-bg`,
 *      `--cod-color-text`, `--cod-color-primary`, `--cod-mode`…, que sólo salen de esa opción): con la
 *      opción vacía no hay ninguna.
 *   4. El favicon sale de las definiciones del plugin (lleva su marca «definido en ContOpe») y no del
 *      «ícono del sitio» de WordPress.
 *
 * Sólo lee. Para un sitio remoto sin credencial se hacen las cuatro menos la consulta MCP del punto 2.
 *
 * Como módulo: `auditarGobierno({ sitio, rutas, authFile })` → [{ ruta, problemas[], notas[] }].
 * Suelto:      `node gobierno-del-set.mjs [SITIO]` (AUTH_FILE opcional) → código de salida 1 si hay problemas.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { conectar } from '../divi-a-contope/lib/mcp.mjs';

const RUTAS = ['/', '/basis-carpas-industriales/', '/preguntas-frecuentes/', '/contactos/', '/terminos-y-privacidad/'];

/** Las variables del núcleo (COD_Design_Core::roles): si falta alguna, ese rol está «sin declarar». */
const NUCLEO = ['--cod-color-accent', '--cod-color-ink', '--cod-color-surface', '--cod-font-heading', '--cod-font-body', '--cod-layout-max-width', '--cod-motion-enter', '--cod-motion-response'];
/** Variables que SÓLO emiten las definiciones de estilo (COD_Theme_Definitions::css): prueba de que la opción no está vacía. */
const DE_DEFINICIONES = ['--cod-mode', '--cod-color-bg', '--cod-color-text', '--cod-color-primary', '--cod-font-accent', '--cod-size-base', '--cod-radius'];
/** Dónde se DECLARA el set: ahí un literal es lo correcto. */
const DECLARA_EL_SET = /^--(?:wp--preset--(?:color|font-family)--|cod-(?:color|font)-)/;

const LITERAL_COLOR = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\b(?:rgba?|hsla?)\(/g;

/** Literales (colores y font-family) de una hoja, fuera de donde se declara el set. */
export function literalesDeHoja(css) {
  const limpio = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\)/gi, 'url()'); // un SVG en línea trae sus propios fills: no son del diseño
  const colores = []; const familias = [];
  for (const m of limpio.matchAll(/([a-zA-Z-]+|--[\w-]+)\s*:\s*([^;{}]+?)\s*(?=;|\})/g)) {
    const [, prop, valor] = m;
    if (DECLARA_EL_SET.test(prop)) continue;
    // `@media(max-width:767px)` y `:where(...)` también calzan con «algo : algo»; sólo importa si el valor trae un literal.
    for (const c of valor.match(LITERAL_COLOR) || []) colores.push(c.endsWith('(') ? c + '…)' : c.toUpperCase());
    if (/^font-family$/i.test(prop) && !/^var\(/.test(valor.trim())) familias.push(valor.trim());
  }
  return { colores, familias };
}

const cuenta = (lista) => { const n = new Map(); for (const x of lista) n.set(x, (n.get(x) || 0) + 1); return [...n].sort((a, b) => b[1] - a[1]); };

/** CSS que carga una página y es «del diseño»: las hojas de contope-disenos y los <style> con reglas cod-rule--. */
async function cssDelDiseno(html, base) {
  const partes = [];
  for (const m of html.matchAll(/<link[^>]+href=['"]([^'"]*contope-disenos\/[^'"]+\.css[^'"]*)['"]/gi)) {
    const url = new URL(m[1].replace(/&#038;|&amp;/g, '&'), base).href;
    const r = await fetch(url);
    if (r.ok) partes.push({ origen: url.split('/').pop().replace(/\?.*$/, ''), css: await r.text() });
    else partes.push({ origen: url, css: '', error: `HTTP ${r.status}` });
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (/\.cod-rule--/.test(m[1])) partes.push({ origen: '<style> en la página', css: m[1] });
  }
  return partes;
}

export async function auditarGobierno({ sitio, rutas = RUTAS, authFile = process.env.AUTH_FILE } = {}) {
  const SITIO = sitio.replace(/\/+$/, '');
  const salida = [];
  let faltantesMcp = null; let mcpNota = '';
  if (authFile) {
    try {
      const mcp = conectar({ endpoint: process.env.ENDPOINT || `${SITIO}/index.php?rest_route=/contope/v1/mcp`, authFile });
      const caps = await mcp.herramienta('cod_get_capabilities', {});
      if (caps && caps.designCore) faltantesMcp = caps.designCore.faltantes || [];
      else mcpNota = `el plugin no contestó el núcleo del set (${caps?._error || 'sin designCore'})`;
    } catch (e) { mcpNota = `no se pudo consultar el plugin: ${e.message.slice(0, 80)}`; }
  } else mcpNota = 'sin credencial del canal MCP: el núcleo se comprueba sólo por lo que la página declara';

  for (const ruta of rutas) {
    const caso = { ruta, problemas: [], notas: [] };
    try {
      const r = await fetch(SITIO + ruta);
      if (!r.ok) { caso.problemas.push(`la página responde HTTP ${r.status}`); salida.push(caso); continue; }
      const html = await r.text();

      // 1. literales en la hoja del diseño
      const hojas = await cssDelDiseno(html, SITIO + ruta);
      if (!hojas.length) caso.problemas.push('no encuentro la hoja del diseño (contope-disenos/*.css ni un <style> con reglas cod-rule--)');
      let hex = 0; let fam = 0; let vars = 0; const ejC = []; const ejF = [];
      for (const h of hojas) {
        if (h.error) caso.problemas.push(`la hoja ${h.origen} no se pudo leer: ${h.error}`);
        const l = literalesDeHoja(h.css);
        hex += l.colores.length; fam += l.familias.length;
        vars += (h.css.match(/var\(/g) || []).length;
        ejC.push(...l.colores); ejF.push(...l.familias);
      }
      if (hex) caso.problemas.push(`${hex} color(es) literal(es) (hex/rgb/hsl) en la hoja del diseño, fuera de la declaración de la paleta${ejC.length ? ' — p. ej. ' + cuenta(ejC).slice(0, 3).map(([v, n]) => `${v} ×${n}`).join(', ') : ''}`);
      if (fam) caso.problemas.push(`${fam} font-family literal(es) en la hoja del diseño — ${cuenta(ejF).slice(0, 4).map(([v, n]) => `${v} ×${n}`).join(' · ')}`);
      caso.notas.push(`hoja del diseño: ${hojas.map((h) => h.origen).join(', ')} · ${vars} var() · ${hex} colores y ${fam} font-family literales`);

      // 2. núcleo sin declarar
      const declaradas = (v) => new RegExp(v.replace(/[-]/g, '\\-') + '\\s*:').test(html);
      const sinVariable = NUCLEO.filter((v) => !declaradas(v));
      if (sinVariable.length) caso.problemas.push(`el núcleo del set tiene ${sinVariable.length} rol(es) sin declarar (la página no emite ${sinVariable.join(', ')})`);
      if (faltantesMcp && faltantesMcp.length) caso.problemas.push(`COD_Design_Core::faltantes() no está vacío: ${faltantesMcp.map((f) => f.rol).join(', ')}`);

      // 3. variables de las definiciones de estilo
      const deDef = DE_DEFINICIONES.filter(declaradas);
      if (!deDef.length) caso.problemas.push('la página no emite ninguna variable de las definiciones de estilo del tema (--cod-mode, --cod-color-bg, --cod-color-primary…): la opción está vacía');
      else caso.notas.push(`definiciones de estilo emitidas: ${deDef.join(', ')}`);

      // 4. favicon desde las definiciones
      const marca = /Ícono del sitio — definido en ContOpe/.test(html);
      const iconos = [...html.matchAll(/<link[^>]+rel=['"](?:icon|apple-touch-icon)['"][^>]*>/gi)].map((m) => (m[0].match(/href=['"]([^'"]+)['"]/) || [])[1]).filter(Boolean);
      if (!marca) caso.problemas.push(`el favicon no sale de las definiciones del plugin (sin la marca «definido en ContOpe»; íconos: ${[...new Set(iconos)].map((u) => u.split('/').pop()).join(', ') || 'ninguno'})`);
      else if (new Set(iconos).size > 1) caso.problemas.push(`hay más de un ícono distinto (${[...new Set(iconos)].map((u) => u.split('/').pop()).join(', ')}): el de WordPress sigue emitiéndose junto al de las definiciones`);
      else caso.notas.push(`favicon de las definiciones: ${(iconos[0] || '').split('/').pop()}`);
    } catch (e) { caso.problemas.push('la comprobación se cortó: ' + e.message); }
    salida.push(caso);
  }
  if (mcpNota) salida.nota = mcpNota;
  return salida;
}

// ---- suelto ------------------------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sitio = process.argv[2] || 'http://localhost:8894';
  const r = await auditarGobierno({ sitio });
  let n = 0;
  for (const c of r) {
    n += c.problemas.length;
    console.log(`${c.problemas.length ? 'FALLA' : 'ok   '} gobierno ${c.ruta}${c.problemas.length ? '\n   - ' + c.problemas.join('\n   - ') : ''}`);
    for (const nota of c.notas) console.log(`   · ${nota}`);
  }
  if (r.nota) console.log(`(${r.nota})`);
  console.log(n ? `\n${n} problema(s) de gobierno` : '\nel set gobierna el sitio');
  process.exit(n ? 1 : 0);
}
