<?php
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local/wordpress/wp-load.php';
$casos = json_decode(file_get_contents(__DIR__ . '/.casos.json'), true);
$opcion = COD_Theme_Definitions::OPTION_KEY;
$antes = get_option($opcion, '');
$salida = [];
foreach ($casos as $nombre => $valores) {
    update_option($opcion, wp_json_encode($valores));
    $salida[$nombre] = COD_Theme_Definitions::css();
}
update_option($opcion, $antes);
echo wp_json_encode($salida, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
