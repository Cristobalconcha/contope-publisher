// Fase F1b: el camino de PRODUCCIÓN, por la pantalla de wp-admin "ContOpe Design → Portabilidad" (no por función).
//
//   1. EXPORTA el WordPress local de Basis (puerto 8894) con el botón «Descargar paquete» (admin-post.php).
//   2. IMPORTA ese archivo en un WordPress LIMPIO (puerto 8895, wp-local-f1b-destino) con el botón «Importar paquete».
//   3. Compara, página por página, medio por medio y región por región, los hashes de origen y destino.
//   4. Mira el sitio importado como lo vería un visitante (HTTP) y repite el import (idempotencia) y el caso H9 por la pantalla.
//   5. El ESTADO DEL SITIO (COD_Site_Package_Sitio): mismo título, mismo ícono, mismo logo del encabezado (sha256), mismo set de
//      íconos, mismas hojas de diseño, mismos enlaces de menú (texto y destino relativo) y mismos menús y navegaciones; y los
//      enlaces del menú llegan a páginas DEL DESTINO. Para tener un menú y una navegación de verdad (Basis no tiene ninguno: su
//      menú está dentro del documento del encabezado) se siembran en Basis unos segundos, antes de exportar, y se retiran
//      enseguida. CONTROLES: se rehace el paquete sin una parte (menús, ajustes, ícono, set de íconos, destinos de región) y la
//      misma comparación TIENE que fallar.
//
// Basis sólo se LEE —salvo el menú de prueba, que se siembra para exportar y se retira enseguida—: la sesión de
// administrador se firma con las claves del propio sitio (sin contraseña) y se destruye al terminar; al final se
// comprueba que el contenido de Basis no cambió (huella antes == después).
// Santa Luisa (8890) y Econut (8891) no se tocan.
//
// Uso:   node scripts/paquete/probar-pantalla.mjs [--conservar]   (--conservar deja el sitio importado en el destino para mirarlo)
// Antes: node scripts/paquete/crear-destino-limpio.mjs [--sincronizar]  y  node scripts/paquete/instalar-paquete-en-basis.mjs
//        (o node scripts/sincronizar-plugin.mjs --a basis --aplicar, que copia el plugin entero)
// Otro destino: OCD_DESTINO_PUERTO=8896 (ver crear-destino-limpio.mjs).

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const casa = path.resolve(repo, '..');
const php = path.join(casa, 'wp-local', 'php', 'php.exe');
const phpIni = path.join(casa, 'wp-local', 'php', 'php.ini');
const BASIS = { url: 'http://localhost:8894', wp: path.join(casa, 'wp-local-basis', 'wordpress') };
// El destino limpio: 8895 por omisión; `OCD_DESTINO_PUERTO=8896` usa otro independiente (ver crear-destino-limpio.mjs).
const PUERTO_DESTINO = Number(process.env.OCD_DESTINO_PUERTO ?? 8895);
const DESTINO = { url: `http://localhost:${PUERTO_DESTINO}`, wp: path.join(casa, PUERTO_DESTINO === 8895 ? 'wp-local-f1b-destino' : `wp-local-f1b-destino-${PUERTO_DESTINO}`, 'wordpress') };
const tmp = path.join(os.tmpdir(), 'f1b-pantalla');
mkdirSync(tmp, { recursive: true });

let fallas = 0;
let total = 0;
const comprobar = (caso, ok, detalle = '') => {
  total += 1;
  console.log(`  ${ok ? 'ok    ' : 'FALLA '} ${caso}${!ok && detalle ? `   -> ${detalle}` : ''}`);
  if (!ok) fallas += 1;
};

const correrPhp = (script, args) => {
  const r = spawnSync(php, ['-c', phpIni, path.join(repo, 'scripts', 'paquete', script), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${script} ${args.join(' ')} -> ${r.status}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
};
const wpLoad = (sitio) => path.join(sitio.wp, 'wp-load.php');
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function arriba(url) {
  try {
    const r = await fetch(`${url}/wp-login.php`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    return r.status === 200;
  } catch {
    return false;
  }
}

let servidor = null;
async function arrancarServidor(sitio, puerto) {
  servidor = spawn(php, ['-c', phpIni, '-S', `localhost:${puerto}`, '-t', sitio.wp], { stdio: 'ignore', detached: false });
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    if (await arriba(sitio.url)) return;
  }
  throw new Error(`No pude arrancar ${sitio.url}`);
}
async function asegurarServidor(sitio, puerto) {
  if (await arriba(sitio.url)) return;
  if (puerto !== PUERTO_DESTINO) throw new Error(`${sitio.url} no responde: arráncalo antes.`);
  await arrancarServidor(sitio, puerto);
}
/**
 * Vacía el destino. El servidor de desarrollo de PHP en Windows deja abierto el último archivo que sirvió, y mientras
 * esté abierto no se puede reescribir: si el servidor es de esta prueba se reinicia antes de vaciar; si es de otra
 * persona, vaciar-destino.php reintenta unos segundos y avisa (código 3) si algo queda.
 */
async function vaciarDestino({ soloEstado = false } = {}) {
  if (servidor) {
    servidor.kill();
    await new Promise((r) => setTimeout(r, 600));
    await arrancarServidor(DESTINO, PUERTO_DESTINO);
  }
  return correrPhp('vaciar-destino.php', [wpLoad(DESTINO), ...(soloEstado ? ['--solo-estado'] : [])]);
}

const cabeceraCookie = (cookies) => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

/** Entra como administrador (cookie + nonce firmados con las claves del sitio) y devuelve cómo hablarle. */
function abrirSesion(sitio, acciones) {
  const s = correrPhp('sesion-de-prueba.php', [wpLoad(sitio), 'crear', acciones.join(',')]);
  return {
    ...s,
    cookie: cabeceraCookie(s.cookies),
    cerrar: () => correrPhp('sesion-de-prueba.php', [wpLoad(sitio), 'cerrar', s.token]),
  };
}

const EXPORTAR = 'cod_export_site_package';
const IMPORTAR = 'cod_import_site_package';

async function exportarPorPantalla(sitio, completo) {
  const sesion = abrirSesion(sitio, [EXPORTAR]);
  try {
    const cuerpo = new URLSearchParams({ action: EXPORTAR, _wpnonce: sesion.nonces[EXPORTAR], cod_include_media: completo ? '1' : '0' });
    const r = await fetch(`${sitio.url}/wp-admin/admin-post.php`, { method: 'POST', headers: { cookie: sesion.cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: cuerpo, redirect: 'manual' });
    const bytes = Buffer.from(await r.arrayBuffer());
    return { status: r.status, tipo: r.headers.get('content-type') ?? '', disposicion: r.headers.get('content-disposition') ?? '', bytes, ubicacion: r.headers.get('location') ?? '' };
  } finally {
    sesion.cerrar();
  }
}

async function importarPorPantalla(sitio, bytes, { reemplazar = false } = {}) {
  const sesion = abrirSesion(sitio, [IMPORTAR]);
  try {
    const form = new FormData();
    form.set('action', IMPORTAR);
    form.set('_wpnonce', sesion.nonces[IMPORTAR]);
    if (reemplazar) form.set('cod_replace_edited_blocks', '1');
    form.set('cod_site_package', new Blob([bytes], { type: 'application/zip' }), 'paquete.zip');
    const r = await fetch(`${sitio.url}/wp-admin/admin-post.php`, { method: 'POST', headers: { cookie: sesion.cookie }, body: form, redirect: 'manual' });
    const ubicacion = r.headers.get('location') ?? '';
    let pagina = '';
    if (ubicacion) {
      const g = await fetch(ubicacion, { headers: { cookie: sesion.cookie }, redirect: 'manual' });
      pagina = await g.text();
    }
    return { status: r.status, ubicacion, pagina };
  } finally {
    sesion.cerrar();
  }
}

const textoVisible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#8217;|&rsquo;/g, "'").replace(/\s+/g, ' ');

// ---- el estado del sitio: qué se mira y cómo se compara
const PAGINAS = ['', 'basis-carpas-industriales', 'preguntas-frecuentes', 'contactos', 'terminos-y-privacidad'];
const sinSitio = (url, sitio) => (url.startsWith(sitio.url) ? url.slice(sitio.url.length) || '/' : url);
const entidades = (s) => s.replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/&#8211;/g, '–').replace(/&#8217;/g, "'");

/** El HTML de una región (encabezado o pie) de ContOpe, con sus etiquetas anidadas bien cerradas. */
function regionHtml(html, tipo) {
  const inicio = html.indexOf(`<${tipo} class="cod-canvas-region cod-canvas-region-${tipo}"`);
  if (inicio < 0) return '';
  const patron = new RegExp(`<${tipo}\\b|</${tipo}>`, 'g');
  patron.lastIndex = inicio;
  let profundidad = 0;
  for (let m = patron.exec(html); m; m = patron.exec(html)) {
    profundidad += m[0].startsWith('</') ? -1 : 1;
    if (profundidad === 0) return html.slice(inicio, patron.lastIndex);
  }
  return html.slice(inicio);
}
const enlacesEn = (html, sitio) =>
  [...html.matchAll(/<a\b[^>]*\shref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ texto: textoVisible(entidades(m[3])).trim(), href: sinSitio(entidades(m[2]), sitio) }))
    // (el aviso de cookies de Basis lo pinta OTRO plugin, CookieAdmin, que el destino no tiene: su enlace de pie no es del paquete)
    .filter((e) => !/cookieadmin\.net/.test(e.href));

/** Lo que un visitante ve de una ruta: título, enlaces, logo del encabezado, íconos y hojas de diseño. */
async function mirar(sitio, ruta) {
  const r = await fetch(`${sitio.url}${ruta}`, { redirect: 'follow' });
  const html = await r.text();
  const cuerpo = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  // el menú del sitio son SUS REGIONES (encabezado y pie): todos sus enlaces tienen que ser los mismos. Del contenido de la página sólo
  // cuentan los enlaces a las páginas que viajan (el resto, como un bloque de «últimas entradas», depende de entradas que el paquete no lleva).
  const enlaces = [...enlacesEn(regionHtml(cuerpo, 'header'), sitio), ...enlacesEn(regionHtml(cuerpo, 'footer'), sitio)];
  const enlacesAPaginas = enlacesEn(cuerpo, sitio).filter((e) => PAGINAS.some((p) => e.href === (p === '' ? '/' : `/${p}/`)));
  const regionEncabezado = html.indexOf('cod-canvas-region-header');
  const logo = regionEncabezado >= 0 ? (html.slice(regionEncabezado).match(/<img[^>]*\ssrc="([^"]+)"/) ?? [])[1] ?? null : null;
  const iconos = [...html.matchAll(/<link[^>]*\srel="(?:icon|apple-touch-icon)"[^>]*>/gi)].map((m) => sinSitio((m[0].match(/href="([^"]+)"/) ?? [])[1] ?? '', sitio));
  const hojas = [...html.matchAll(/href=['"]([^'"]*\/contope-disenos\/[^'"?]+\.css)(?:\?[^'"]*)?['"]/gi)].map((m) => sinSitio(m[1], sitio));
  return { status: r.status, titulo: entidades(textoVisible((html.match(/<title>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '')).trim(), h1: textoVisible((cuerpo.match(/<h1[\s\S]*?<\/h1>/i) ?? [''])[0]).trim(), enlaces, enlacesAPaginas, logo, iconos: [...new Set(iconos)], hojas: [...new Set(hojas)] };
}
const shaDe = async (sitio, ruta) => {
  const r = await fetch(ruta.startsWith('http') ? ruta : `${sitio.url}${ruta}`);
  return r.status === 200 ? sha(Buffer.from(await r.arrayBuffer())) : `HTTP ${r.status}`;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** La huella del estado del sitio (sin páginas): lista de lo que NO coincide entre origen y destino. */
function compararEstado(o, d) {
  const mal = [];
  if (o.blogname !== d.blogname) mal.push(`título «${o.blogname}» → «${d.blogname}»`);
  if (o.blogdescription !== d.blogdescription) mal.push('descripción del sitio');
  if (o.permalink_structure !== d.permalink_structure) mal.push(`enlaces permanentes «${o.permalink_structure}» → «${d.permalink_structure}»`);
  for (const k of ['siteIcon', 'siteLogo', 'customLogo']) {
    if (!igual(o[k] && { path: o[k].path, sha256: o[k].sha256 }, d[k] && { path: d[k].path, sha256: d[k].sha256 })) mal.push(`marca: ${k}`);
  }
  if (!igual(o.iconos, d.iconos)) mal.push(`set de íconos (estilo «${o.iconos.estilo}» → «${d.iconos.estilo}», ${Object.keys(o.iconos.archivos).length} → ${Object.keys(d.iconos.archivos).length} archivos)`);
  for (const [diseno, h] of Object.entries(d.hojas)) if (!igual(o.hojas[diseno], h)) mal.push(`hoja de diseño «${diseno}» distinta`);
  if (!d.hojas['basis-web']) mal.push('falta la hoja de diseño «basis-web»');
  if (!igual(o.menus, d.menus)) mal.push('menús clásicos (texto y destino de cada enlace)');
  if (!igual(o.ubicaciones, d.ubicaciones)) mal.push('ubicaciones de menú');
  if (!igual(o.navegaciones, d.navegaciones)) mal.push('navegaciones de bloques (enlaces pintados)');
  return mal;
}

/** Lo que ve un visitante en las 5 páginas (y en los destinos de sus enlaces) de origen y de destino. */
async function compararVisitante(origen, destino) {
  const mal = [];
  const rutas = new Set(PAGINAS.map((p) => (p === '' ? '/' : `/${p}/`)));
  const delOrigen = {};
  for (const ruta of rutas) delOrigen[ruta] = await mirar(origen, ruta);
  // además de las 5 páginas, adonde llevan los enlaces internos del menú (encabezado y pie)
  for (const ruta of [...rutas]) for (const e of delOrigen[ruta].enlaces) if (e.href.startsWith('/') && !e.href.startsWith('/wp-') && !e.href.startsWith('//')) rutas.add(e.href.split('#')[0] || '/');
  for (const ruta of rutas) delOrigen[ruta] ??= await mirar(origen, ruta);
  const iconoOrigen = delOrigen['/'].iconos[0] ?? '';
  const tallo = (u) => u.replace(/-\d+x\d+(?=\.\w+$)/, '');
  for (const ruta of rutas) {
    const o = delOrigen[ruta];
    const d = await mirar(destino, ruta);
    if (d.status !== 200) {
      mal.push(`${ruta}: el destino responde ${d.status}`);
      continue;
    }
    if (d.titulo !== o.titulo) mal.push(`${ruta}: título «${o.titulo}» → «${d.titulo}»`);
    if (d.h1 !== o.h1) mal.push(`${ruta}: el encabezado principal cambió (¿el enlace llega a otra página?)`);
    if (!igual(o.enlaces, d.enlaces)) mal.push(`${ruta}: los enlaces del encabezado y del pie (el menú) no son los mismos: faltan ${JSON.stringify(o.enlaces.filter((e) => !d.enlaces.some((x) => igual(x, e))).slice(0, 3))}, sobran ${JSON.stringify(d.enlaces.filter((e) => !o.enlaces.some((x) => igual(x, e))).slice(0, 3))}`);
    if (!igual(o.enlacesAPaginas, d.enlacesAPaginas)) mal.push(`${ruta}: los enlaces del contenido a las páginas del sitio no son los mismos`);
    if (o.enlaces.length === 0) mal.push(`${ruta}: (piso) Basis no tiene enlaces en su encabezado/pie que comparar`);
    if (!igual(o.hojas, d.hojas)) mal.push(`${ruta}: hojas de diseño servidas ${JSON.stringify(o.hojas)} → ${JSON.stringify(d.hojas)}`);
  }
  // el logo del encabezado: el MISMO archivo (sha256)
  const o0 = delOrigen['/'];
  const d0 = await mirar(destino, '/');
  if (!o0.logo) mal.push('(piso) el encabezado de Basis no tiene logo que comparar');
  else if ((await shaDe(origen, o0.logo)) !== (await shaDe(destino, d0.logo ?? '/sin-logo'))) mal.push(`logo del encabezado (${o0.logo}) distinto en el destino (${d0.logo})`);
  // el ícono del sitio: la misma imagen (aunque WordPress sirva un tamaño recortado), servida por el destino
  if (!d0.iconos.length) mal.push('el destino no declara ícono del sitio');
  for (const u of d0.iconos) {
    if (tallo(u).split('?')[0] !== tallo(iconoOrigen).split('?')[0]) mal.push(`ícono ${u} no es el del origen (${iconoOrigen})`);
    const s = await shaDe(destino, u);
    if (s.startsWith('HTTP')) mal.push(`ícono ${u}: ${s}`);
  }
  // las hojas de diseño y un ícono del set, servidos por el destino con los mismos bytes
  for (const h of o0.hojas) if ((await shaDe(origen, h)) !== (await shaDe(destino, h))) mal.push(`hoja ${h} distinta en el destino`);
  const svg = '/wp-content/uploads/contope-iconos/icono-account_circle-rounded.svg';
  if ((await shaDe(origen, svg)) !== (await shaDe(destino, svg))) mal.push('un ícono del set (account_circle) se sirve distinto en el destino');
  return mal;
}

async function main() {
  console.log('\n== 0. los dos sitios están arriba y son los que deben ser ==');
  await asegurarServidor(DESTINO, PUERTO_DESTINO);
  comprobar('Basis responde en 8894', await arriba(BASIS.url));
  comprobar(`el destino limpio responde en ${PUERTO_DESTINO}`, await arriba(DESTINO.url));
  const instalado = spawnSync(process.execPath, [path.join(repo, 'scripts', 'paquete', 'instalar-paquete-en-basis.mjs'), '--solo-ver'], { encoding: 'utf8' });
  comprobar('el exportador que corre DENTRO de Basis es el del repositorio (node scripts/paquete/instalar-paquete-en-basis.mjs)', instalado.status === 0, instalado.stdout);
  if (fallas > 0) return;

  const resumenBasisAntes = correrPhp('huella-del-sitio.php', [wpLoad(BASIS), 'resumen']);
  await vaciarDestino();
  const resumenDestinoVacio = correrPhp('huella-del-sitio.php', [wpLoad(DESTINO), 'resumen']);

  console.log('\n== 1. EXPORTAR Basis por la pantalla de Portabilidad ==');
  // Basis no tiene menús ni navegaciones propios: se siembran unos segundos (cinco páginas reales + un enlace externo) y se
  // retiran apenas sale el paquete, pase lo que pase.
  // (Otros procesos pueden estar escribiendo en Basis mientras tanto: lo que se mide es el rastro de ESTA siembra y las páginas
  // y documentos que se exportan, no el recuento total de la base.)
  const rastroAntes = correrPhp('sembrar-menus-basis.php', [wpLoad(BASIS), 'rastro']);
  const baseDeBasis = correrPhp('huella-del-sitio.php', [wpLoad(BASIS), 'paquete', (() => {
    const e = path.join(tmp, 'entrada-basis-antes.json');
    writeFileSync(e, JSON.stringify({ media: [], documents: ['cod-region-header', 'cod-region-footer'] }));
    return e;
  })()]);
  const archivoSiembra = path.join(tmp, 'siembra-basis.json');
  writeFileSync(archivoSiembra, JSON.stringify(correrPhp('sembrar-menus-basis.php', [wpLoad(BASIS), 'sembrar'])));
  let exp;
  let estadoBasis;
  try {
    estadoBasis = correrPhp('huella-del-sitio.php', [wpLoad(BASIS), 'sitio']);
    exp = await exportarPorPantalla(BASIS, true);
  } finally {
    correrPhp('sembrar-menus-basis.php', [wpLoad(BASIS), 'limpiar', archivoSiembra]);
  }
  const rastroDespues = correrPhp('sembrar-menus-basis.php', [wpLoad(BASIS), 'rastro']);
  comprobar('(Basis) la siembra de prueba se retiró: ninguna navegación, enlace de menú ni menú de más, y las opciones del tema como estaban', JSON.stringify(rastroAntes) === JSON.stringify(rastroDespues), `${JSON.stringify(rastroAntes)} vs ${JSON.stringify(rastroDespues)}`);
  comprobar('(piso) lo sembrado estaba en Basis al exportar: un menú de 6 enlaces y una navegación de bloques', Object.keys(estadoBasis.menus).includes('ocd-prueba-menu') && estadoBasis.menus['ocd-prueba-menu'].items.length === 6 && Object.keys(estadoBasis.navegaciones).includes('ocd-prueba-navegacion'), JSON.stringify(Object.keys(estadoBasis.menus)));
  comprobar('el botón «Descargar paquete» responde 200 con un ZIP', exp.status === 200 && /application\/zip/.test(exp.tipo) && exp.bytes.length > 1000, `status ${exp.status} tipo ${exp.tipo} ${exp.bytes.length} bytes ${exp.ubicacion}`);
  const archivoZip = path.join(tmp, 'basis.ocdsite.zip');
  writeFileSync(archivoZip, exp.bytes);
  const extraer = (nombre) => spawnSync(php, ['-c', phpIni, path.join(repo, 'scripts', 'paquete', 'extraer-del-zip.php'), archivoZip, nombre], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 }).stdout;
  const manifiesto = JSON.parse(extraer('manifest.json').toString('utf8'));
  const contenido = JSON.parse(extraer('content/pages.json').toString('utf8'));
  writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifiesto));
  const ajv = spawnSync(process.execPath, [path.join(repo, 'scripts', 'paquete', 'validar-manifiesto-ajv.mjs'), path.join(tmp, 'manifest.json')], { encoding: 'utf8' });
  comprobar('el manifiesto exportado de Basis cumple el esquema real (Ajv + referencias cruzadas)', ajv.status === 0, ajv.stdout);
  const bloques = contenido.pages.filter((p) => p.kind === 'blocks');
  const lienzo = contenido.pages.filter((p) => p.kind === 'canvas');
  console.log(`      paquete: ${bloques.length} páginas en bloques (${bloques.map((p) => p.slug).join(', ')}), ${lienzo.length} del lienzo (${lienzo.map((p) => p.slug).join(', ')}), ${Object.keys(contenido.documents).length} documentos, ${contenido.media.length} medios, ${manifiesto.assets.length} activos`);
  comprobar('las 5 páginas en bloques de Basis viajan como páginas en bloques', ['inicio', 'basis-carpas-industriales', 'preguntas-frecuentes', 'contactos', 'terminos-y-privacidad'].every((s) => bloques.some((p) => p.slug === s)));
  comprobar('el encabezado y el pie globales viajan', ['cod-region-header', 'cod-region-footer'].every((d) => contenido.documents[d]?.regionScope === 'global'));
  comprobar('la lista de medios incluye los de las páginas en bloques (p. ej. aBlanco@4x.png, el PDF y el video)', ['2025/07/aBlanco@4x.png', '2025/07/Flame-retardant-B1-Europe.pdf', '2025/07/Video-Aereo-Carpas.mp4'].every((m) => contenido.media.some((x) => x.path === m && x.asset)));

  console.log('\n== 2. IMPORTAR ese archivo en el WordPress limpio por la pantalla de Portabilidad ==');
  const imp = await importarPorPantalla(DESTINO, exp.bytes);
  comprobar('el botón «Importar paquete» redirige a «importado correctamente»', imp.status === 302 && /cod_status=import_success/.test(imp.ubicacion), `status ${imp.status} ${imp.ubicacion}`);
  comprobar('la pantalla muestra el aviso y el resumen', /Paquete importado correctamente/.test(imp.pagina) && /páginas \(/.test(imp.pagina), textoVisible(imp.pagina).slice(0, 300));

  console.log('\n== 3. la huella del destino es la del origen ==');
  const entrada = path.join(tmp, 'entrada.json');
  writeFileSync(entrada, JSON.stringify({ media: contenido.media.map((m) => m.path), documents: Object.keys(contenido.documents) }));
  const hOrigen = correrPhp('huella-del-sitio.php', [wpLoad(BASIS), 'paquete', entrada]);
  const hDestino = correrPhp('huella-del-sitio.php', [wpLoad(DESTINO), 'paquete', entrada]);
  for (const p of bloques) {
    const o = hOrigen.pages[p.slug];
    const d = hDestino.pages[p.slug];
    comprobar(`página «${p.slug}»: post_content idéntico (sha256 y largo) y en bloques`, !!d && d.sha === o.sha && d.len === o.len && d.enBloques === true, d ? `origen ${o.sha.slice(0, 12)}/${o.len} destino ${d.sha.slice(0, 12)}/${d.len}` : 'no existe en el destino');
    comprobar(`   …«${p.slug}» conserva su estado (${o.status}) y su metadato de documento`, !!d && d.status === o.status && d.docId === o.docId, JSON.stringify([o.status, o.docId, d?.status, d?.docId]));
  }
  for (const p of lienzo) {
    const d = hDestino.pages[p.slug];
    comprobar(`página del lienzo «${p.slug}» llega, como shortcode`, !!d && d.docId === p.documentId && !d.enBloques);
  }
  const mediosMal = contenido.media.filter((m) => hOrigen.media[m.path] === null || hDestino.media[m.path] !== hOrigen.media[m.path]).map((m) => m.path);
  comprobar(`los ${contenido.media.length} medios llegan con el mismo sha256`, mediosMal.length === 0, mediosMal.slice(0, 5).join(', '));
  const mediosSinOrigen = contenido.media.filter((m) => hOrigen.media[m.path] === null);
  comprobar('(piso) todos los medios listados existen en Basis', mediosSinOrigen.length === 0, mediosSinOrigen.join(', '));
  for (const id of ['cod-region-header', 'cod-region-footer']) {
    const o = hOrigen.documents[id];
    const d = hDestino.documents[id];
    // Los documentos pasan por el saneador de la importación y la URL del origen se cambia por la del destino:
    // si el HTML o el CSS tuvieran la URL absoluta de Basis, el hash cambiaría a propósito. Se informa cuál de las dos cosas pasó.
    const mismoHtml = !!d && d.htmlSha === o.htmlSha;
    const mismoCss = !!d && d.cssSha === o.cssSha;
    comprobar(`región «${id}»: llega con su tipo (${o.regionKind}) y alcance (${o.regionScope})`, !!d && d.regionKind === o.regionKind && d.regionScope === o.regionScope);
    comprobar(`   …«${id}»: html y css iguales (sha256)`, mismoHtml && mismoCss, `html ${mismoHtml ? '=' : `${o.htmlLen}→${d?.htmlLen}`} css ${mismoCss ? '=' : `${o.cssLen}→${d?.cssLen}`}`);
  }
  comprobar('el ADN del destino es el que tenía Basis al exportar (ninguno, si Basis no tenía: el paquete no inventa uno)', JSON.stringify(hDestino.adn === null ? null : [hDestino.adn.designId, hDestino.adn.revision, hDestino.adn.digest]) === JSON.stringify(estadoBasis.adn === null ? null : [estadoBasis.adn.designId, estadoBasis.adn.revision, estadoBasis.adn.digest]), JSON.stringify([estadoBasis.adn, hDestino.adn]));
  console.log(`      portada: origen ${JSON.stringify(hOrigen.reading)} → destino ${JSON.stringify(hDestino.reading)}`);
  comprobar('la portada del origen quedó igual en el destino', hOrigen.reading.showOnFront !== 'page' || (hDestino.reading.showOnFront === 'page' && hDestino.reading.pageOnFront === hOrigen.reading.pageOnFront), JSON.stringify([hOrigen.reading, hDestino.reading]));

  console.log('\n== 4. lo que ve un visitante en el destino ==');
  for (const p of bloques) {
    const d = hDestino.pages[p.slug];
    if (d.status !== 'publish') continue;
    const r = await fetch(`${DESTINO.url}/?page_id=${d.id}`);
    const html = await r.text();
    const o = hOrigen.pages[p.slug];
    const ro = await fetch(`${BASIS.url}/?page_id=${o.id}`);
    const htmlOrigen = await ro.text();
    const titulos = (h) => [...h.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)].map((m) => textoVisible(m[1]).trim()).filter(Boolean);
    const tOrigen = titulos(htmlOrigen);
    const tDestino = titulos(html);
    comprobar(`«${p.slug}» responde 200 sin el shortcode a la vista y con los mismos títulos que en Basis`, r.status === 200 && !html.includes('[contope_canvas') && tOrigen.length > 0 && JSON.stringify(tOrigen) === JSON.stringify(tDestino), `${r.status} origen ${JSON.stringify(tOrigen).slice(0, 120)} destino ${JSON.stringify(tDestino).slice(0, 120)}`);
  }
  const rHome = await fetch(`${DESTINO.url}/`);
  const hHome = await rHome.text();
  comprobar('la portada del destino (/) responde 200', rHome.status === 200);
  const imgs = [...new Set([...(await (await fetch(`${DESTINO.url}/?page_id=${hDestino.pages['inicio'].id}`)).text()).matchAll(/(?:src|data-src)="([^"]*\/wp-content\/uploads\/[^"]+)"/g)].map((m) => m[1]))];
  let mal = [];
  for (const u of imgs.slice(0, 12)) {
    const abs = u.startsWith('http') ? u : `${DESTINO.url}${u}`;
    const r = await fetch(abs, { method: 'HEAD' });
    if (r.status !== 200) mal.push(`${r.status} ${u}`);
  }
  comprobar(`las ${Math.min(imgs.length, 12)} imágenes de «inicio» (de ${imgs.length}) se sirven desde el destino`, imgs.length > 0 && mal.length === 0, mal.join(' | '));
  void hHome;

  console.log('\n== 4b. el ESTADO DEL SITIO en el destino: título, ícono, logo, menús, set de íconos, hojas y enlaces ==');
  const estadoDestino = correrPhp('huella-del-sitio.php', [wpLoad(DESTINO), 'sitio']);
  const malEstado = compararEstado(estadoBasis, estadoDestino);
  comprobar('título, descripción, enlaces permanentes, ícono y logos, set de íconos, hojas, menús, ubicaciones y navegaciones: iguales a los de Basis', malEstado.length === 0, malEstado.join(' | '));
  console.log(`      menú sembrado: ${JSON.stringify(estadoBasis.menus['ocd-prueba-menu'].items.map((i) => i.texto + ' ' + i.href))}`);
  console.log(`      set de íconos: ${Object.keys(estadoDestino.iconos.archivos).length} archivos, estilo «${estadoDestino.iconos.estilo}»; hojas: ${Object.keys(estadoDestino.hojas).join(', ')}; título «${estadoDestino.blogname}»`);
  comprobar('(piso) el destino tiene el set completo (233 íconos como Basis), un ícono de sitio y los enlaces del menú sembrado apuntan a SUS páginas', Object.keys(estadoDestino.iconos.archivos).length === Object.keys(estadoBasis.iconos.archivos).length && Object.keys(estadoBasis.iconos.archivos).length > 100 && estadoDestino.siteIcon !== null && estadoDestino.menus['ocd-prueba-menu'].items.every((i) => !i.href.startsWith('/?page_id=') && (i.href.startsWith('http') || i.href.startsWith('/'))), JSON.stringify(estadoDestino.menus['ocd-prueba-menu']?.items));
  const idsDeMenu = estadoDestino.menus['ocd-prueba-menu']?.items.filter((i) => i.href.startsWith('/')).map((i) => i.href) ?? [];
  let enlacesRotos = [];
  for (const h of idsDeMenu) {
    const r = await fetch(`${DESTINO.url}${h}`);
    if (r.status !== 200) enlacesRotos.push(`${r.status} ${h}`);
  }
  comprobar(`los ${idsDeMenu.length} enlaces internos del menú sembrado llegan a páginas del destino (HTTP 200)`, idsDeMenu.length === 5 && enlacesRotos.length === 0, enlacesRotos.join(', '));
  const malVisitante = await compararVisitante(BASIS, DESTINO);
  comprobar('lo que ve un visitante en las 5 páginas del destino: mismo título, mismos enlaces de menú y pie (texto y destino), mismo logo (sha256), mismo ícono, mismas hojas de diseño y mismo set de íconos', malVisitante.length === 0, malVisitante.slice(0, 4).join(' | '));

  console.log('\n== 5. reimportar por la pantalla: no duplica ni cambia ==');
  const imp2 = await importarPorPantalla(DESTINO, exp.bytes);
  const hDestino2 = correrPhp('huella-del-sitio.php', [wpLoad(DESTINO), 'paquete', entrada]);
  comprobar('el segundo import también termina bien', imp2.status === 302 && /import_success/.test(imp2.ubicacion));
  comprobar('mismas páginas, mismos ids y mismo contenido', JSON.stringify(Object.values(hDestino2.pages).map((p) => [p.id, p.sha])) === JSON.stringify(Object.values(hDestino.pages).map((p) => [p.id, p.sha])));

  console.log('\n== 6. H9 por la pantalla: una página editada aquí no se pisa ==');
  const editar = path.join(tmp, 'editar.php');
  writeFileSync(editar, `<?php define('WP_USE_THEMES', false); require ${JSON.stringify(wpLoad(DESTINO).replace(/\\/g, '/'))};
$id = (int) get_posts(['post_type'=>'page','name'=>'contactos','post_status'=>'any','numberposts'=>1,'fields'=>'ids'])[0];
kses_remove_filters();
wp_update_post(['ID'=>$id, 'post_content'=>wp_slash(get_post_field('post_content',$id,'raw') . "\\n<!-- wp:paragraph --><p>EDITADA EN PRODUCCION</p><!-- /wp:paragraph -->")]);
echo json_encode(['id'=>$id]);`);
  const rEd = spawnSync(php, ['-c', phpIni, editar], { encoding: 'utf8' });
  comprobar('(preparación) se edita «contactos» en el destino', rEd.status === 0, rEd.stdout + rEd.stderr);
  const antesH9 = correrPhp('huella-del-sitio.php', [wpLoad(DESTINO), 'paquete', entrada]);
  const imp3 = await importarPorPantalla(DESTINO, exp.bytes);
  const despuesH9 = correrPhp('huella-del-sitio.php', [wpLoad(DESTINO), 'paquete', entrada]);
  comprobar('la pantalla muestra el error explícito (página en bloques con ediciones)', /cod_status=error/.test(imp3.ubicacion) && /contactos/.test(imp3.pagina) && /no se escribió nada/.test(textoVisible(imp3.pagina)) && /ediciones/.test(textoVisible(imp3.pagina)), textoVisible(imp3.pagina).slice(0, 400));
  comprobar('…y NINGUNA página cambió (ni «contactos», ni las demás): mismos hashes', JSON.stringify(Object.entries(despuesH9.pages).map(([k, v]) => [k, v.sha])) === JSON.stringify(Object.entries(antesH9.pages).map(([k, v]) => [k, v.sha])));
  comprobar('…y «contactos» sigue teniendo su edición (CONTROL de que el hash ve el cambio: difiere del de Basis)', despuesH9.pages['contactos'].sha !== hOrigen.pages['contactos'].sha);
  const imp4 = await importarPorPantalla(DESTINO, exp.bytes, { reemplazar: true });
  const hFinal = correrPhp('huella-del-sitio.php', [wpLoad(DESTINO), 'paquete', entrada]);
  comprobar('con la casilla «reemplazar las páginas en bloques editadas» marcada, el import pasa', imp4.status === 302 && /import_success/.test(imp4.ubicacion), imp4.ubicacion);
  comprobar('…y «contactos» vuelve a ser idéntica a la de Basis', hFinal.pages['contactos'].sha === hOrigen.pages['contactos'].sha);

  console.log('\n== 6b. CONTROLES: se rompe a propósito una parte del transporte y la misma comparación TIENE que fallar ==');
  const romper = async (partes) => {
    const roto = path.join(tmp, `roto-${partes.replace(/,/g, '-')}.zip`);
    correrPhp('romper-paquete.php', [archivoZip, roto, partes, '--aligerar']);
    // sólo se vacía el ESTADO del sitio: las páginas y los medios ya están (se importaron arriba) y no hace falta reescribirlos
    await vaciarDestino({ soloEstado: true });
    const imp = await importarPorPantalla(DESTINO, readFileSync(roto));
    const mal = [...compararEstado(estadoBasis, correrPhp('huella-del-sitio.php', [wpLoad(DESTINO), 'sitio'])), ...(await compararVisitante(BASIS, DESTINO))];
    return { importo: imp.status === 302 && /import_success/.test(imp.ubicacion), mal };
  };
  const sinMenus = await romper('menus');
  comprobar('CONTROL: sin el transporte de menús, el paquete importa pero el destino NO sale igual (menús, ubicaciones y navegaciones)', sinMenus.importo && sinMenus.mal.some((m) => /menús clásicos/.test(m)) && sinMenus.mal.some((m) => /navegaciones/.test(m)) && sinMenus.mal.some((m) => /ubicaciones/.test(m)), sinMenus.mal.join(' | '));
  const sinAjustes = await romper('ajustes');
  comprobar('CONTROL: sin título ni enlaces permanentes, la comparación lo ve (título, enlaces /contactos/ que ya no llegan a su página)', sinAjustes.importo && sinAjustes.mal.some((m) => /título/.test(m)) && sinAjustes.mal.some((m) => /enlaces permanentes/.test(m)) && sinAjustes.mal.some((m) => /encabezado principal|responde|título «/.test(m)), sinAjustes.mal.slice(0, 5).join(' | '));
  const sinMarca = await romper('branding');
  comprobar('CONTROL: sin el transporte del ícono del sitio, el destino NO sale igual (marca) y no declara ícono', sinMarca.importo && sinMarca.mal.some((m) => /marca: siteIcon/.test(m)) && sinMarca.mal.some((m) => /no declara ícono/.test(m)), sinMarca.mal.join(' | '));
  const sinIconos = await romper('iconos,hojas');
  comprobar('CONTROL: sin el set de íconos ni las hojas, el destino NO sale igual (set de íconos, hoja «basis-web»)', sinIconos.importo && sinIconos.mal.some((m) => /set de íconos/.test(m)) && sinIconos.mal.some((m) => /hoja de diseño «basis-web»|hoja .* distinta|hojas de diseño servidas/.test(m)), sinIconos.mal.join(' | '));
  // (Los destinos de región por número del origen se controlan en scripts/probar-paquete-bloques.php: Basis no tiene regiones locales.)

  console.log('\n== 7. Basis quedó intacto ==');
  const resumenBasisDespues = correrPhp('huella-del-sitio.php', [wpLoad(BASIS), 'resumen']);
  const entradaDespues = path.join(tmp, 'entrada-basis-despues.json');
  writeFileSync(entradaDespues, JSON.stringify({ media: [], documents: ['cod-region-header', 'cod-region-footer'] }));
  const baseDespues = correrPhp('huella-del-sitio.php', [wpLoad(BASIS), 'paquete', entradaDespues]);
  const cambiadas = [...new Set([...Object.keys(baseDeBasis.pages), ...Object.keys(baseDespues.pages)])].filter((s) => JSON.stringify(baseDeBasis.pages[s]) !== JSON.stringify(baseDespues.pages[s]));
  const docsCambiados = ['cod-region-header', 'cod-region-footer'].filter((d) => JSON.stringify(baseDeBasis.documents[d]) !== JSON.stringify(baseDespues.documents[d]));
  comprobar('las páginas y los documentos de Basis (contenido, estado, metadatos de documento, encabezado y pie) son los mismos antes y después', cambiadas.length === 0 && docsCambiados.length === 0, `páginas distintas: ${cambiadas.map((s) => `${s} ${JSON.stringify(baseDeBasis.pages[s])} → ${JSON.stringify(baseDespues.pages[s])}`).join(' | ')}; documentos: ${docsCambiados.join(', ')}`);
  const igualResumen = JSON.stringify(resumenBasisAntes) === JSON.stringify(resumenBasisDespues);
  console.log(`      (informativo) recuento total de la base de Basis: ${igualResumen ? 'idéntico' : 'distinto — otro proceso escribió en Basis durante la prueba (' + JSON.stringify(resumenBasisAntes) + ' → ' + JSON.stringify(resumenBasisDespues) + ')'}`);
  void resumenDestinoVacio;
}

try {
  await main();
} catch (e) {
  console.error(e);
  fallas += 1;
} finally {
  if (!process.argv.includes('--conservar')) {
    try {
      await vaciarDestino();
    } catch (e) {
      console.error('no pude vaciar el destino:', e.message);
      fallas += 1;
    }
  }
  if (servidor) servidor.kill();
}
console.log(`\n== resultado ==\n  ${fallas === 0 ? 'TODO OK' : `${fallas} falla(s)`} (${total} comprobaciones)`);
process.exit(fallas === 0 ? 0 : 1);
