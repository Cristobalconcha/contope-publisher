/**
 * Trae un formulario publicado de un sitio y lo instala en el espejo local.
 *
 * POR QUÉ EXISTE. El espejo de Santa Luisa no tenía el formulario de contacto,
 * así que su tarjeta salía vacía, y yo lo reporté como una limitación de la
 * receta. Cristóbal, el 4 de octubre de 2026: *«el hecho de que no exista no
 * significa que no tengas cómo acceder a él… siempre te quedas pegado en cosas
 * que no necesitas resolver»*. Tenía razón: el formulario estaba publicado y su
 * definición se pide por una ruta REST pública, la misma que usa el runtime para
 * dibujarlo. No había nada que resolver, había que ir a buscarlo.
 *
 * El runtime lo pide así, y por eso no hace falta ninguna credencial:
 *   GET /wp-json/orugantt-forms/v1/forms?slug=<slug>
 *
 * SÓLO LEE DEL SITIO DE ORIGEN. Lo único que escribe es la base local.
 *
 * Uso:
 *   node traer-formulario.mjs contacto-santa-luisa
 *   node traer-formulario.mjs <slug> --de https://otro.cl --a <ruta a wordpress>
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, omision) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : omision; };

const slug = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!slug) { console.error('falta el slug del formulario'); process.exit(1); }

const ORIGEN = arg('de', 'https://santaluisadepalpi.cl').replace(/\/+$/, '');
const DESTINO = arg('a', 'C:/Users/Cristobal concha/wp-local/wordpress');
const PHP = arg('php', 'C:/Users/Cristobal concha/wp-local/php/php.exe');

console.log(`trayendo «${slug}» de ${ORIGEN}\n`);

const r = await fetch(`${ORIGEN}/wp-json/orugantt-forms/v1/forms?slug=${encodeURIComponent(slug)}`);
if (!r.ok) { console.error(`el sitio respondió ${r.status}`); process.exit(1); }
const datos = await r.json();
if (!datos?.module) { console.error('la respuesta no trae el módulo del formulario'); process.exit(1); }

const campos = (items, nivel = 0) => items.flatMap((i) => [
  `${'  '.repeat(nivel + 1)}${(i.type || '?').padEnd(16)} ${i.id || ''}${i.obligatorio ? '  (obligatorio)' : ''}`,
  ...(i.items ? campos(i.items, nivel + 1) : []),
]);
console.log(`  «${datos.module.name}» · versión ${datos.version}`);
console.log(campos(datos.module.items || []).join('\n'));

const json = JSON.stringify(datos.module);
writeFileSync(path.join(aqui, '.formulario.json'), json);

/*
 * La escritura va por PHP y no por SQL a mano: el espejo corre sobre SQLite con
 * una capa de compatibilidad, y armar el INSERT a mano es la forma de que una
 * comilla o una tilde rompan algo en silencio. `$wpdb->insert` escapa solo.
 */
const guion = `<?php
define('WP_USE_THEMES', false);
require ${JSON.stringify(DESTINO + '/wp-load.php')};
global $wpdb;

$slug = ${JSON.stringify(slug)};
$titulo = ${JSON.stringify(String(datos.module.name || slug))};
$json = file_get_contents(${JSON.stringify(path.join(aqui, '.formulario.json'))});
$ahora = current_time('mysql');

$id = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$wpdb->prefix}orugantt_forms WHERE slug = %s", $slug));
if ($id) {
    $wpdb->update("{$wpdb->prefix}orugantt_forms", ['title' => $titulo, 'status' => 'published', 'updated_at' => $ahora], ['id' => $id]);
    echo "  el formulario ya estaba (id $id): actualizado\\n";
} else {
    $wpdb->insert("{$wpdb->prefix}orugantt_forms", [
        'slug' => $slug, 'title' => $titulo, 'status' => 'published',
        'created_at' => $ahora, 'updated_at' => $ahora,
    ]);
    $id = (int) $wpdb->insert_id;
    echo "  formulario creado con id $id\\n";
}

// Una sola versión vigente: las demás dejan de serlo.
$wpdb->update("{$wpdb->prefix}orugantt_form_versions", ['is_current' => 0], ['form_id' => $id]);
$wpdb->insert("{$wpdb->prefix}orugantt_form_versions", [
    'form_id' => $id,
    'version_number' => ${Number(datos.version) || 1},
    'json' => $json,
    'is_current' => 1,
    'changelog' => 'Traído del sitio publicado con traer-formulario.mjs.',
    'created_at' => $ahora,
]);
echo "  versión ${Number(datos.version) || 1} instalada y marcada como vigente\\n";
`;

const tmp = path.join(aqui, '.instalar-formulario.php');
writeFileSync(tmp, guion);
console.log('\ninstalando en el espejo:');
console.log(execFileSync(PHP, [tmp], { encoding: 'utf8' }).trim());
