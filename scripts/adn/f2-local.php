<?php
/**
 * Pasos de la prueba de portabilidad de presets (F2) que corren en el WordPress LOCAL de Basis (puerto 8894).
 * Los orquesta scripts/adn/probar-portabilidad-presets.mjs; no es una prueba por sí mismo.
 *
 *   php f2-local.php importar-r1              importa el ADN derivado del theme.json de Basis (r1)
 *   php f2-local.php exportar-paquete <zip>   exporta el sitio (sin medios) a un .ocdsite
 *   php f2-local.php importar-r2 <hex>        importa la revisión 2 con otro accent (para medir el cambio en el navegador)
 *   php f2-local.php quitar                   quita todo lo que se importó y deja el modo de la compuerta como estaba
 *
 * SOLO Basis local. Se niega a correr en otro sitio. Imprime una línea JSON por paso.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../../wp-local-basis/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require __DIR__ . '/lib/adn-desde-theme-json.php';

$accion = $argv[1] ?? '';
$salida = static function (array $d): void {
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
};
$falla = static function (string $m) use ($salida): void {
    $salida(['ok' => false, 'error' => $m]);
    exit(1);
};
if (strpos((string) home_url(), ':8894') === false) {
    $falla('esto sólo corre en el local de Basis (8894): ' . home_url());
}
$ESTADO = sys_get_temp_dir() . '/f2-local-estado.json';
$fixture = __DIR__ . '/../../fixtures/adn/f2/basis-theme.local-5e118c5.json';
$importar = static function (string $json, ?int $esperada) {
    $opciones = ['emitirPropuestas' => false] + ($esperada !== null ? ['expectedCurrentRevision' => $esperada] : []);
    $previa = COD_ADN_Store::previsualizar($json, $opciones);
    if (!$previa['ok']) {
        return new WP_Error((string) ($previa['errores'][0]['codigo'] ?? 'ADN_INVALID'), (string) ($previa['errores'][0]['mensaje'] ?? ''));
    }
    return COD_ADN_Store::aplicar($json, $opciones + ['previewId' => $previa['previewId'], 'fuente' => 'upload']);
};

if ($accion === 'importar-r1') {
    if (COD_ADN_Store::activo()) {
        $falla('el local de Basis ya tiene un ADN activo: no se pisa');
    }
    file_put_contents($ESTADO, json_encode(['modo' => get_option(COD_ADN_Gate::OPTION_MODE, null), 'definiciones' => get_option(COD_Theme_Definitions::OPTION_KEY, null)]));
    $json = adn_desde_theme_json($fixture, ['revision' => 1]);
    $r = $importar($json, null);
    if (is_wp_error($r)) {
        $falla($r->get_error_code() . ': ' . $r->get_error_message());
    }
    $salida(['ok' => true, 'revision' => $r['revision'], 'digest' => $r['digest'], 'themeJson' => COD_ADN_Store::resumen()['proyeccion']['themeJson']]);
} elseif ($accion === 'exportar-paquete') {
    $destino = (string) ($argv[2] ?? '');
    if ($destino === '' || !COD_ADN_Store::activo()) {
        $falla('falta la ruta de salida o no hay ADN activo');
    }
    $repositorio = new COD_Canvas_Document_Repository();
    $zip = (new COD_Site_Package_Exporter($repositorio))->export(false);
    if (is_wp_error($zip)) {
        $falla($zip->get_error_code() . ': ' . $zip->get_error_message());
    }
    copy($zip, $destino);
    @unlink($zip);
    $salida(['ok' => true, 'zip' => $destino, 'bytes' => filesize($destino), 'digest' => COD_ADN_Store::puntero()['digest']]);
} elseif ($accion === 'importar-r2') {
    $hex = (string) ($argv[2] ?? '#123456');
    $r2 = json_decode(adn_desde_theme_json($fixture, ['revision' => 2]), false);
    foreach ($r2->definitions as $d) {
        if ($d->id === 'dim1.req01.def1') {
            foreach ($d->value->institucionales as $c) {
                if ($c->name === 'Accent') {
                    $c->value = $hex;
                }
            }
        }
    }
    $r = $importar((string) json_encode($r2, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION), 1);
    if (is_wp_error($r)) {
        $falla($r->get_error_code() . ': ' . $r->get_error_message());
    }
    $salida(['ok' => true, 'revision' => $r['revision']]);
} elseif ($accion === 'quitar') {
    global $wpdb;
    $estado = is_file($ESTADO) ? json_decode((string) file_get_contents($ESTADO), true) : [];
    foreach (get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']) as $id) {
        wp_delete_post((int) $id, true);
    }
    foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_%'") as $nombre) {
        if (preg_match('/^cod_adn_(proj_r[0-9]+|lock_.*|activa)$/', (string) $nombre) === 1) {
            delete_option((string) $nombre);
        }
    }
    if (array_key_exists('modo', $estado ?? []) && $estado['modo'] === null) {
        delete_option(COD_ADN_Gate::OPTION_MODE);
    } elseif (isset($estado['modo'])) {
        update_option(COD_ADN_Gate::OPTION_MODE, $estado['modo'], false);
    }
    wp_cache_flush();
    @unlink($ESTADO);
    $salida(['ok' => true, 'activo' => COD_ADN_Store::activo(), 'modo' => get_option(COD_ADN_Gate::OPTION_MODE, null)]);
} else {
    $falla('acción desconocida: ' . $accion);
}
