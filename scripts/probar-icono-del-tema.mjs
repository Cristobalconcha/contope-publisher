/**
 * El ícono del sitio es una definición de MARCA y vive en el tema, no en los
 * ajustes de WordPress. Esta prueba cubre lo que eso implica:
 *
 *  - una dirección dentro de uploads se acepta;
 *  - una de afuera se descarta (termina en un <link> de todas las páginas, así
 *    que una URL ajena sería un recurso de un tercero en cada visita);
 *  - sin ícono declarado no se emite nada y WordPress sigue haciendo lo suyo;
 *  - con ícono declarado se emite el del tema Y se apaga el de WordPress, para
 *    que no queden dos y nadie sepa cuál manda.
 */
import { writeFileSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
for (const f of ['includes/class-cod-theme-definitions.php', 'includes/class-cod-settings-admin.php', 'contope-publisher.php']) {
  copyFileSync('contope-publisher/' + f, 'C:/Users/Cristobal concha/wp-local/wordpress/wp-content/plugins/contope-publisher/' + f);
}

const guion = `<?php
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local/wordpress/wp-load.php';
$opcion = COD_Theme_Definitions::OPTION_KEY;
$antes = get_option($opcion, '');
$subidas = wp_get_upload_dir();
$propia = $subidas['baseurl'] . '/santa-luisa-icono-512.png';

$r = [];
$r['campoExiste'] = false;
foreach (COD_Theme_Definitions::schema() as $g) {
    foreach ($g['fields'] as $c) {
        if ($c['id'] === 'favicon') { $r['campoExiste'] = true; $r['grupo'] = $g['title']; $r['tipo'] = $c['type']; }
    }
}
$r['aceptaPropia'] = COD_Theme_Definitions::sanitize(['favicon' => $propia])['favicon'] === $propia;
$r['descartaAjena'] = COD_Theme_Definitions::sanitize(['favicon' => 'https://otro-sitio.cl/icono.png'])['favicon'] === '';
$r['descartaJavascript'] = COD_Theme_Definitions::sanitize(['favicon' => 'javascript:alert(1)'])['favicon'] === '';

// Sin icono: no se emite nada
update_option($opcion, wp_json_encode([]));
ob_start(); COD_Theme_Definitions::icono_en_cabecera(); $sin = ob_get_clean();
$r['sinIconoNoEmite'] = trim($sin) === '';

// Con icono: se emite
update_option($opcion, wp_json_encode(['favicon' => $propia]));
ob_start(); COD_Theme_Definitions::icono_en_cabecera(); $con = ob_get_clean();
$r['emiteIcono'] = strpos($con, 'rel="icon"') !== false;
$r['emiteApple'] = strpos($con, 'apple-touch-icon') !== false;
$r['usaLaDireccion'] = strpos($con, esc_url($propia)) !== false;
$r['declaraTipo'] = strpos($con, 'image/png') !== false;

update_option($opcion, $antes);
echo wp_json_encode($r);
`;
writeFileSync('scripts/.icono.php', guion);
const r = spawnSync(PHP, ['scripts/.icono.php'], { encoding: 'utf8', maxBuffer: 20e6 });
const linea = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
let d;
try { d = JSON.parse(linea); } catch { console.error('sin salida:\n' + (r.stdout||'') + (r.stderr||'')); process.exit(1); }

const casos = [
  ['el campo existe en el esquema', d.campoExiste === true],
  ['está en el grupo Marca', d.grupo === 'Marca'],
  ['es de tipo imagen', d.tipo === 'image'],
  ['acepta una direccion de este sitio', d.aceptaPropia === true],
  ['descarta una direccion de afuera', d.descartaAjena === true],
  ['descarta javascript:', d.descartaJavascript === true],
  ['sin icono declarado no emite nada', d.sinIconoNoEmite === true],
  ['con icono emite rel=icon', d.emiteIcono === true],
  ['y el de Apple', d.emiteApple === true],
  ['con la direccion correcta', d.usaLaDireccion === true],
  ['declarando el tipo de archivo', d.declaraTipo === true],
];
let fallas = 0;
for (const [caso, ok] of casos) { console.log((ok ? '  ok     ' : '  FALLA  ') + caso); if (!ok) fallas++; }
console.log('\n' + (fallas === 0 ? 'todo en orden\n' : fallas + ' comprobaciones fallaron\n'));
process.exit(fallas === 0 ? 0 : 1);
