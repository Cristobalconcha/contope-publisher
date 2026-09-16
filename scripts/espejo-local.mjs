/**
 * Pone el WordPress local como espejo del sitio publicado.
 *
 * Existe porque probar el plugin contra el sitio en producción es probar contra
 * algo aprobado que el cliente está mirando. El plugin se prueba acá.
 *
 * Hace tres cosas, en este orden:
 *   1. Copia el plugin del repo al WordPress local (queda en la misma versión).
 *   2. Trae los documentos del sitio publicado y los escribe en la base local,
 *      emparejando por `_cod_canvas_document_id` — nunca por id numérico, que
 *      no es portable entre instalaciones.
 *   3. Baja las imágenes y videos que la portada usa y el local no tiene.
 *
 * Antes de tocar la base hace un respaldo con fecha.
 *
 * Para levantar el sitio local (el puerto lo exige la propia instalación):
 *   cd wp-local/wordpress
 *   ../php/php.exe -S localhost:8890 -t .
 *
 * Uso:
 *   node scripts/espejo-local.mjs              (simulación)
 *   node scripts/espejo-local.mjs --aplicar
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tool } from './cod-grapes-runner/lib-documento.mjs';

const aplicar = process.argv.includes('--aplicar');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const casa = path.resolve(repoRoot, '..');
const local = path.join(casa, 'wp-local', 'wordpress');
const php = path.join(casa, 'wp-local', 'php', 'php.exe');
const baseDatos = path.join(local, 'wp-content', 'database', 'database.sqlite');
const uploads = path.join(local, 'wp-content', 'uploads');
const sitio = 'https://www.santaluisadepalpi.cl';

for (const [que, donde] of [['el WordPress local', local], ['el PHP local', php], ['la base local', baseDatos]]) {
  if (!existsSync(donde)) { console.error(`No encuentro ${que}: ${donde}`); process.exit(1); }
}
console.log(`\n▸ Local: ${local}`);
console.log(aplicar ? '▸ Modo:  APLICAR\n' : '▸ Modo:  simulación\n');

// ---------------------------------------------------------------- 1. plugin
const origen = path.join(repoRoot, 'contope-publisher');
const destino = path.join(local, 'wp-content', 'plugins', 'contope-publisher');
const version = (s) => (readFileSync(path.join(s, 'contope-publisher.php'), 'utf8').match(/Version:\s*([\d.]+)/) || [])[1];
console.log(`1. Plugin: repo ${version(origen)}  ·  local ${existsSync(destino) ? version(destino) : '(no instalado)'}`);
if (aplicar) { cpSync(origen, destino, { recursive: true }); console.log(`   copiado → local ${version(destino)}`); }

// ------------------------------------------------------------ 2. documentos
const { pages } = await tool('cod_list_canvas_pages', {});
console.log(`\n2. Documentos publicados: ${pages.length}`);
const datos = {};
for (const p of pages) {
  const d = await tool('cod_read_canvas_document', { pageId: p.pageId, documentId: p.documentId });
  if (typeof d?.css !== 'string') continue;
  datos[p.documentId] = { projectData: d.projectData, html: d.html, css: d.css, revision: d.revision };
  console.log(`   ${p.documentId}  rev ${d.revision}  css ${d.css.length.toLocaleString('es-CL')}`);
}
if (aplicar) {
  const respaldo = baseDatos + '.antes-espejo-' + new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(baseDatos, respaldo);
  console.log(`   respaldo de la base: ${path.basename(respaldo)}`);
  const tmp = path.join(repoRoot, 'espejo-datos-temporal.json');
  writeFileSync(tmp, JSON.stringify(datos));
  const guion = `
    $datos = json_decode(file_get_contents($argv[1]), true);
    $db = new PDO("sqlite:" . $argv[2]);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $campos = ["_cod_canvas_project_data"=>"projectData","_cod_canvas_html"=>"html","_cod_canvas_css"=>"css","_cod_canvas_revision"=>"revision"];
    foreach ($datos as $doc => $d) {
      $s = $db->prepare("SELECT post_id FROM wp_postmeta WHERE meta_key = ? AND meta_value = ?");
      $s->execute(["_cod_canvas_document_id", $doc]);
      $posts = $s->fetchAll(PDO::FETCH_COLUMN);
      if (!$posts) { echo "   SIN PAREJA LOCAL: $doc\n"; continue; }
      foreach ($posts as $pid) foreach ($campos as $clave => $k) {
        $q = $db->prepare("SELECT meta_id FROM wp_postmeta WHERE post_id = ? AND meta_key = ?");
        $q->execute([$pid, $clave]);
        $mid = $q->fetchColumn();
        if ($mid) { $u = $db->prepare("UPDATE wp_postmeta SET meta_value = ? WHERE meta_id = ?"); $u->execute([(string)$d[$k], $mid]); }
        else { $i = $db->prepare("INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (?,?,?)"); $i->execute([$pid, $clave, (string)$d[$k]]); }
      }
      echo "   $doc → " . count($posts) . " entrada(s)\n";
    }`;
  const guionPath = path.join(repoRoot, 'espejo-guion-temporal.php');
  writeFileSync(guionPath, '<?php' + guion);
  process.stdout.write(execFileSync(php, [guionPath, tmp, baseDatos]).toString());
  execFileSync(process.execPath, ['-e', `require('fs').unlinkSync(${JSON.stringify(tmp)});require('fs').unlinkSync(${JSON.stringify(guionPath)})`]);
}

// ----------------------------------------------------------------- 3. medios
const portada = await (await fetch(sitio + '/?espejo=' + Date.now())).text();
const refs = [...new Set((portada.match(/\/wp-content\/uploads\/[^"' )]+/g) || []).map((r) => r.split('?')[0]))]
  .filter((r) => !r.includes('*') && /\.[a-z0-9]{2,5}$/i.test(r));
const faltan = refs.filter((r) => !existsSync(path.join(uploads, r.replace('/wp-content/uploads/', ''))));
console.log(`\n3. Medios que usa la portada: ${refs.length}  ·  faltan en local: ${faltan.length}`);
if (aplicar) {
  let mb = 0;
  for (const r of faltan) {
    const rel = r.replace('/wp-content/uploads/', '');
    const dst = path.join(uploads, rel);
    mkdirSync(path.dirname(dst), { recursive: true });
    const res = await fetch(sitio + r);
    if (!res.ok) { console.log(`   FALLÓ ${rel}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dst, buf);
    mb += buf.length;
    console.log(`   ${String(Math.round(buf.length / 1024)).padStart(6)} KB  ${rel}`);
  }
  console.log(`   bajados: ${(mb / 1048576).toFixed(1)} MB`);
} else if (faltan.length) {
  faltan.slice(0, 8).forEach((r) => console.log(`   falta: ${r}`));
}

console.log(aplicar ? '\n✓ Espejo al día.\n' : '\n(simulación: no se tocó nada)\n');
