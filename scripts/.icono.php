<?php
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
