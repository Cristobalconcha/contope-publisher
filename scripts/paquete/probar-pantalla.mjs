// Fase F1b: el camino de PRODUCCIÓN, por la pantalla de wp-admin "ContOpe Design → Portabilidad" (no por función).
//
//   1. EXPORTA el WordPress local de Basis (puerto 8894) con el botón «Descargar paquete» (admin-post.php).
//   2. IMPORTA ese archivo en un WordPress LIMPIO (puerto 8895, wp-local-f1b-destino) con el botón «Importar paquete».
//   3. Compara, página por página, medio por medio y región por región, los hashes de origen y destino.
//   4. Mira el sitio importado como lo vería un visitante (HTTP) y repite el import (idempotencia) y el caso H9 por la pantalla.
//
// Basis sólo se LEE: la sesión de administrador se firma con las claves del propio sitio (sin contraseña) y se
// destruye al terminar; al final se comprueba que el contenido de Basis no cambió (huella antes == después).
// Santa Luisa (8890) y Econut (8891) no se tocan.
//
// Uso:   node scripts/paquete/probar-pantalla.mjs [--conservar]   (--conservar deja el sitio importado en el destino para mirarlo)
// Antes: node scripts/paquete/crear-destino-limpio.mjs [--sincronizar]  y  node scripts/sincronizar-plugin.mjs --a basis --aplicar

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
const DESTINO = { url: 'http://localhost:8895', wp: path.join(casa, 'wp-local-f1b-destino', 'wordpress') };
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
async function asegurarServidor(sitio, puerto) {
  if (await arriba(sitio.url)) return;
  if (puerto !== 8895) throw new Error(`${sitio.url} no responde: arráncalo antes.`);
  servidor = spawn(php, ['-c', phpIni, '-S', `localhost:${puerto}`, '-t', sitio.wp], { stdio: 'ignore', detached: false });
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    if (await arriba(sitio.url)) return;
  }
  throw new Error(`No pude arrancar ${sitio.url}`);
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

async function main() {
  console.log('\n== 0. los dos sitios están arriba y son los que deben ser ==');
  await asegurarServidor(DESTINO, 8895);
  comprobar('Basis responde en 8894', await arriba(BASIS.url));
  comprobar('el destino limpio responde en 8895', await arriba(DESTINO.url));
  if (fallas > 0) return;

  const resumenBasisAntes = correrPhp('huella-del-sitio.php', [wpLoad(BASIS), 'resumen']);
  correrPhp('vaciar-destino.php', [wpLoad(DESTINO)]);
  const resumenDestinoVacio = correrPhp('huella-del-sitio.php', [wpLoad(DESTINO), 'resumen']);

  console.log('\n== 1. EXPORTAR Basis por la pantalla de Portabilidad ==');
  const exp = await exportarPorPantalla(BASIS, true);
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
  comprobar('el destino quedó sin ADN (Basis no tiene uno activo: el paquete no inventa uno)', hDestino.adn === null && hOrigen.adn === null);
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

  console.log('\n== 7. Basis quedó intacto ==');
  const resumenBasisDespues = correrPhp('huella-del-sitio.php', [wpLoad(BASIS), 'resumen']);
  comprobar('el contenido de Basis (posts, metadatos, opciones) es el mismo antes y después', JSON.stringify(resumenBasisAntes) === JSON.stringify(resumenBasisDespues), `${JSON.stringify(resumenBasisAntes)} vs ${JSON.stringify(resumenBasisDespues)}`);
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
      correrPhp('vaciar-destino.php', [wpLoad(DESTINO)]);
    } catch (e) {
      console.error('no pude vaciar el destino:', e.message);
      fallas += 1;
    }
  }
  if (servidor) servidor.kill();
}
console.log(`\n== resultado ==\n  ${fallas === 0 ? 'TODO OK' : `${fallas} falla(s)`} (${total} comprobaciones)`);
process.exit(fallas === 0 ? 0 : 1);
