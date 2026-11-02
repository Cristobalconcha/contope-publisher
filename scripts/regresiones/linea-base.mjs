/**
 * Líneas base de Santa Luisa y Econut (P0.5 de docs/ESPEC-adn-unica-puerta-y-bloques.md, H12).
 *
 * Probar sólo Basis no prueba que Santa Luisa y Econut sigan iguales (regla 12 de CLAUDE.md). Este guion guarda, de cada
 * uno de esos sitios EN LOCAL, el HTML y el CSS que sirve en sus páginas clave, y después compara contra lo guardado:
 * CUALQUIER diferencia es fallo (código 1). Se corre en cada fase que toque el plugin (F1-F4b).
 *
 *   node scripts/regresiones/linea-base.mjs guardar   <santaluisa|econut|todos> [opciones]
 *   node scripts/regresiones/linea-base.mjs verificar <santaluisa|econut|todos> [opciones]
 *
 * Opciones:
 *   --base-url <url>   sustituye la dirección local del sitio (para probar el mecanismo con otro sitio local)
 *   --dir <carpeta>    dónde viven las líneas base (por omisión scripts/regresiones/linea-base/)
 *   --con-auditoria    además corre la auditoría propia del sitio (hoy: scripts/santaluisa/auditoria-sitio.cjs) y exige
 *                      «SIN HALLAZGOS» (ese guion termina siempre con código 0, así que aquí se lee su salida)
 *
 * Cómo se guarda: las páginas salen del mapa del sitio (wp-sitemap-posts-page-1.xml) más la portada y las `rutasExtra` de
 * sitios.json; quedan fijadas en `manifest.json` junto con el sha256 del HTML y del CSS de cada una. El HTML y las hojas de
 * estilo del mismo origen se guardan completos (carpeta <sitio>/), normalizados sólo en lo que cambia solo (la dirección del
 * sitio, los nonces de WordPress y los finales de línea). Al guardar, cada página se baja DOS veces: si las dos no son
 * idénticas, el guion falla en vez de guardar una línea base que se movería sola (hay que normalizar esa parte a propósito).
 *
 * Códigos de salida: 0 todo igual; 1 hubo diferencias o no se pudo comprobar; 2 configuración mal (sitio desconocido,
 * falta la línea base, etc.). Un sitio apagado NO es «igual»: es fallo (1) en `verificar` y error (2) en `guardar`.
 * Sólo lee (GET) y sólo guarda sitios locales (localhost).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizRepo = path.resolve(aqui, '..', '..');
const args = process.argv.slice(2);
const banderas = new Map(); const posicionales = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i].startsWith('--')) { const k = args[i].slice(2); banderas.set(k, ['base-url', 'dir'].includes(k) ? args[++i] : 'si'); } else posicionales.push(args[i]);
}
const abortar = (msg) => { console.error('ERROR: ' + msg); process.exit(2); };
const [modo, cual] = posicionales;
if (!['guardar', 'verificar'].includes(modo) || !cual) abortar('uso: linea-base.mjs <guardar|verificar> <santaluisa|econut|todos> [--base-url URL] [--dir CARPETA] [--con-auditoria]');
const CFG = JSON.parse(readFileSync(path.join(aqui, 'sitios.json'), 'utf8')).sitios;
const nombres = cual === 'todos' ? Object.keys(CFG) : [cual];
for (const n of nombres) if (!CFG[n]) abortar(`el sitio «${n}» no está en sitios.json (${Object.keys(CFG).join(', ')})`);
if (banderas.has('base-url') && nombres.length > 1) abortar('--base-url vale para un solo sitio');
const DIR = path.resolve(banderas.get('dir') || path.join(aqui, 'linea-base'));
const ES_LOCAL = (u) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u);

const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const slugDe = (ruta) => (ruta === '/' ? 'inicio' : ruta.replace(/^\/|\/$/g, '').replace(/[^a-zA-Z0-9._-]+/g, '__'));

/** Lo único que cambia solo entre dos bajadas: la dirección del sitio, los nonces y los finales de línea. */
function normalizar(texto, base) {
  return texto
    .replace(/\r\n/g, '\n')
    .split(base).join('{{BASE}}')
    .split(base.replace(/^https?:/, '')).join('{{BASE_SIN_PROTOCOLO}}')
    .replace(/(nonce["']?\s*[:=]\s*["'])[A-Za-z0-9]+(["'])/gi, '$1{{NONCE}}$2')
    .replace(/(_wpnonce=)[A-Za-z0-9]+/gi, '$1{{NONCE}}');
}

async function bajar(url) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'linea-base/1 (regresiones locales)' } });
  return { estado: r.status, urlFinal: r.url, texto: await r.text() };
}

async function listarRutas(base, extra) {
  const rutas = new Set(['/']);
  const m = await bajar(`${base}/wp-sitemap-posts-page-1.xml`).catch(() => null);
  if (m && m.estado === 200) {
    for (const x of m.texto.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      try { const u = new URL(x[1]); rutas.add(u.pathname + (u.search || '')); } catch { /* ignora */ }
    }
  }
  for (const e of extra || []) rutas.add(e);
  return { rutas: [...rutas].sort(), sitemap: !!(m && m.estado === 200) };
}

/** Baja una página y sus hojas de estilo del mismo origen. Devuelve { html, css, hojas } normalizados. */
async function capturar(base, ruta) {
  const p = await bajar(base + ruta);
  if (p.estado !== 200) throw new Error(`${ruta} respondió HTTP ${p.estado}`);
  const origen = new URL(base).origin;
  const hrefs = [];
  for (const m of p.texto.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["'][^"']*stylesheet/i.test(tag)) continue;
    const h = /href=["']([^"']+)["']/i.exec(tag);
    if (!h) continue;
    try { const u = new URL(h[1].replace(/&#038;/g, '&').replace(/&amp;/g, '&'), p.urlFinal); if (u.origin === origen) hrefs.push(u.href); } catch { /* ignora */ }
  }
  const css = []; const hojas = [];
  for (const href of hrefs) {
    const c = await bajar(href);
    if (c.estado !== 200) throw new Error(`la hoja ${href} respondió HTTP ${c.estado}`);
    const rel = normalizar(href, base);
    hojas.push(rel);
    css.push(`/* ==== ${rel} ==== */\n${normalizar(c.texto, base)}`);
  }
  return { html: normalizar(p.texto, base), css: css.join('\n'), hojas, urlFinal: normalizar(p.urlFinal, base) };
}

function primerasDiferencias(a, b, max = 3) {
  const A = a.split('\n'); const B = b.split('\n'); const out = [];
  for (let i = 0; i < Math.max(A.length, B.length) && out.length < max; i += 1) {
    if (A[i] !== B[i]) out.push(`    línea ${i + 1}\n      guardado: ${(A[i] ?? '(no existe)').slice(0, 160)}\n      actual:   ${(B[i] ?? '(no existe)').slice(0, 160)}`);
  }
  return out;
}

let fallos = 0;
for (const nombre of nombres) {
  const sitio = CFG[nombre];
  const base = (banderas.get('base-url') || sitio.base).replace(/\/+$/, '');
  const carpeta = path.join(DIR, nombre);
  const manifiestoRuta = path.join(carpeta, 'manifest.json');
  console.log(`\n=== ${nombre} (${base}) — ${modo}`);

  // ¿está arriba? Un sitio apagado no se da por «igual».
  const arriba = await bajar(base + '/').then((r) => r.estado, () => 0);
  if (arriba !== 200) {
    const msg = `${nombre}: el sitio local no responde en ${base} (HTTP ${arriba || 'sin conexión'}). Levantarlo: ${sitio.como_levantarlo || 'ver sitios.json'}`;
    if (modo === 'guardar') abortar(msg + ' — no se guardó nada.');
    console.log('FALLA ' + msg); fallos += 1; continue;
  }

  if (modo === 'guardar') {
    if (!ES_LOCAL(base)) abortar(`${nombre}: sólo se guarda la línea base de un sitio LOCAL (${base})`);
    const { rutas, sitemap } = await listarRutas(base, sitio.rutasExtra);
    if (!sitemap) console.log('   (el sitio no entregó wp-sitemap-posts-page-1.xml: se guardan sólo la portada y las rutasExtra)');
    mkdirSync(carpeta, { recursive: true });
    const filas = [];
    for (const ruta of rutas) {
      let a; let b;
      try { a = await capturar(base, ruta); b = await capturar(base, ruta); } catch (e) { console.log(`FALLA ${ruta}: ${e.message}`); fallos += 1; continue; }
      if (a.html !== b.html || a.css !== b.css) {
        fallos += 1;
        console.log(`FALLA ${ruta}: dos bajadas seguidas NO son idénticas; una línea base así se movería sola. Parte que cambia:`);
        for (const l of primerasDiferencias(a.html, b.html)) console.log(l);
        if (a.css !== b.css) for (const l of primerasDiferencias(a.css, b.css)) console.log(l);
        continue;
      }
      const slug = slugDe(ruta);
      writeFileSync(path.join(carpeta, `${slug}.html`), a.html);
      writeFileSync(path.join(carpeta, `${slug}.css`), a.css);
      filas.push({ ruta, slug, urlFinal: a.urlFinal, htmlSha256: sha(a.html), cssSha256: sha(a.css), hojas: a.hojas });
      console.log(`ok    ${ruta}  html ${a.html.length} B · css ${a.css.length} B · ${a.hojas.length} hoja(s)`);
    }
    if (!filas.length) { console.log('FALLA no se guardó ninguna página'); fallos += 1; continue; }
    writeFileSync(manifiestoRuta, JSON.stringify({ sitio: nombre, base: '{{BASE}}', baseAlGuardar: base, generado: new Date().toISOString(), normalizaciones: ['dirección del sitio → {{BASE}}', 'valores de nonce → {{NONCE}}', 'CRLF → LF'], paginas: filas }, null, 2) + '\n');
    console.log(`línea base guardada: ${filas.length} página(s) en ${carpeta}`);
    continue;
  }

  // verificar
  if (!existsSync(manifiestoRuta)) { console.log(`FALLA ${nombre}: no hay línea base guardada en ${carpeta} (correr «guardar» con el sitio arriba)`); fallos += 1; continue; }
  const man = JSON.parse(readFileSync(manifiestoRuta, 'utf8'));
  if (!man.paginas?.length) { console.log(`FALLA ${nombre}: el manifiesto no tiene páginas`); fallos += 1; continue; }
  const actual = path.join(carpeta, '_actual');
  rmSync(actual, { recursive: true, force: true });
  let difs = 0;
  for (const p of man.paginas) {
    let g; let hGuardado; let cGuardado;
    try {
      hGuardado = readFileSync(path.join(carpeta, `${p.slug}.html`), 'utf8');
      cGuardado = readFileSync(path.join(carpeta, `${p.slug}.css`), 'utf8');
      g = await capturar(base, p.ruta);
    } catch (e) { console.log(`FALLA ${p.ruta}: ${e.message}`); difs += 1; continue; }
    // lo guardado también debe seguir siendo lo que dice el manifiesto (nadie tocó la línea base)
    if (sha(hGuardado) !== p.htmlSha256 || sha(cGuardado) !== p.cssSha256) { console.log(`FALLA ${p.ruta}: los archivos de la línea base no coinciden con su manifiesto (se tocó la línea base)`); difs += 1; continue; }
    const mismos = g.html === hGuardado && g.css === cGuardado;
    if (mismos) { console.log(`ok    ${p.ruta}`); continue; }
    difs += 1;
    mkdirSync(actual, { recursive: true });
    writeFileSync(path.join(actual, `${p.slug}.html`), g.html); writeFileSync(path.join(actual, `${p.slug}.css`), g.css);
    console.log(`FALLA ${p.ruta}: ${g.html !== hGuardado ? 'HTML distinto' : ''}${g.html !== hGuardado && g.css !== cGuardado ? ' y ' : ''}${g.css !== cGuardado ? 'CSS distinto' : ''} (lo actual queda en ${path.join(actual, p.slug)}.*)`);
    if (g.html !== hGuardado) for (const l of primerasDiferencias(hGuardado, g.html)) console.log(l);
    if (g.css !== cGuardado) for (const l of primerasDiferencias(cGuardado, g.css)) console.log(l);
  }
  fallos += difs;
  console.log(difs ? `${nombre}: ${difs} página(s) con diferencias` : `${nombre}: igual a su línea base (${man.paginas.length} página(s))`);

  if (banderas.has('con-auditoria')) {
    if (!sitio.auditoria) { console.log(`FALLA ${nombre}: se pidió --con-auditoria y este sitio no declara una auditoría propia en sitios.json`); fallos += 1; continue; }
    const r = spawnSync(process.execPath, [path.join(raizRepo, sitio.auditoria), base, man.paginas.map((p) => p.ruta).join(',')], { encoding: 'utf8', timeout: 900000 });
    const salida = `${r.stdout || ''}${r.stderr || ''}`.trim();
    if (r.status !== 0 || salida !== 'SIN HALLAZGOS') { fallos += 1; console.log(`FALLA auditoría propia de ${nombre} (${sitio.auditoria}):\n${salida.split('\n').map((l) => '    ' + l).join('\n')}`); } else console.log(`ok    auditoría propia de ${nombre}: SIN HALLAZGOS`);
  }
}
console.log(fallos ? `\nREGRESIONES: ${fallos} fallo(s) → código 1` : '\nREGRESIONES: todo igual a su línea base → código 0');
process.exit(fallos ? 1 : 0);
