<?php
/**
 * Pasos de la prueba de portabilidad (F2) que corren en el WordPress LIMPIO de pruebas (carpeta wp-local-f1b-destino*; puerto 8895 u otro,
 * ver OCD_DESTINO_PUERTO) y que el navegador necesita ver ENTRE medio: el sitio importado, con el theme.json ATRASADO de producción.
 * Los orquesta scripts/adn/probar-portabilidad-presets.mjs; no es una prueba por sí mismo.
 *
 *   php f2-destino.php <wp-load.php> importar <paquete.ocdsite> [--tema=declarado|atrasado]
 *                                                                 deja el theme.json atrasado, vacía el destino e importa el paquete.
 *                                                                 `declarado` (por omisión): el atrasado MÁS lo único que el ADN no lleva y
 *                                                                 COD_ADN_Theme::fuera_del_adn() declara (el relleno del grupo y el CSS de los estilos de
 *                                                                 bloque por quiebre); `atrasado`: tal cual está en producción
 *   php f2-destino.php <wp-load.php> quitar-adn                   quita sólo el ADN (el contenido queda): el CONTROL de lo que se ve
 *   php f2-destino.php <wp-load.php> limpiar                      vacía el destino y devuelve el theme.json del repositorio
 *
 * Se niega a correr en cualquier otro sitio. Imprime una línea JSON por paso.
 */
define('WP_USE_THEMES', false);
require $argv[1] ?? '';
require_once ABSPATH . 'wp-admin/includes/file.php';

$accion = $argv[2] ?? '';
$salida = static function (array $d): void {
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
};
$falla = static function (string $m) use ($salida): void {
    $salida(['ok' => false, 'error' => $m]);
    exit(1);
};
if (strpos(str_replace('\\', '/', (string) ABSPATH), '/wp-local-f1b-destino') === false) {
    $falla('esto sólo corre en el destino limpio (wp-local-f1b-destino*): ' . ABSPATH);
}
$repo = realpath(__DIR__ . '/../..');
$tema_dir = rtrim((string) get_stylesheet_directory(), '/\\');
if (basename($tema_dir) !== 'contope-basis') {
    $falla('el tema activo del destino no es contope-basis: ' . $tema_dir);
}
$archivo_tema = $tema_dir . '/theme.json';
$vaciar = static function () use ($argv): array {
    $php = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
    $salida = [];
    $codigo = 0;
    exec(escapeshellarg($php) . ' -c ' . escapeshellarg('C:/Users/Cristobal concha/wp-local/php/php.ini') . ' ' . escapeshellarg(__DIR__ . '/../paquete/vaciar-destino.php') . ' ' . escapeshellarg((string) $argv[1]) . ' 2>&1', $salida, $codigo);
    return ['codigo' => $codigo, 'salida' => implode("\n", $salida)];
};

if ($accion === 'importar') {
    $zip = (string) ($argv[3] ?? '');
    if (!is_file($zip)) {
        $falla('falta el paquete: ' . $zip);
    }
    $v = $vaciar();
    if ($v['codigo'] !== 0) {
        $falla('no pude vaciar el destino: ' . $v['salida']);
    }
    // El theme.json ATRASADO de producción (b7b0478): el destino recibe el diseño sólo por el ADN.
    $tema = json_decode((string) file_get_contents($repo . '/fixtures/adn/f2/basis-theme.destino-atrasado-b7b0478.json'), true);
    if (!in_array('--tema=atrasado', $argv, true)) {
        // ...más lo único que el ADN no lleva (COD_ADN_Theme::fuera_del_adn()), tal como lo trae el theme.json de Basis.
        $local = json_decode((string) file_get_contents($repo . '/fixtures/adn/f2/basis-theme.local-5e118c5.json'), true);
        $tema['styles']['blocks']['core/group'] = $local['styles']['blocks']['core/group'];
        if (preg_match('#/\*cod-estilos-responsivos\*/.*?/\*/cod-estilos-responsivos\*/#s', (string) $local['styles']['css'], $bloque) !== 1) {
            $falla('el theme.json de Basis no trae el bloque cod-estilos-responsivos');
        }
        $tema['styles']['css'] = $bloque[0];
    }
    file_put_contents($archivo_tema, json_encode($tema, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION) . "\n");
    $repositorio = new COD_Canvas_Document_Repository();
    $importador = new COD_Site_Package_Importer($repositorio, new COD_Canvas_Document_Sanitizer(), new COD_Media_Attachment_Sync());
    $r = $importador->import($zip);
    if (is_wp_error($r)) {
        $falla($r->get_error_code() . ': ' . $r->get_error_message());
    }
    $puntero = COD_ADN_Store::puntero();
    $salida(['ok' => true, 'adn' => $puntero === null ? null : ['designId' => $puntero['designId'], 'revision' => $puntero['revision']], 'themeJson' => COD_ADN_Store::resumen()['proyeccion']['themeJson']]);
} elseif ($accion === 'quitar-adn') {
    global $wpdb;
    foreach (get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']) as $id) {
        wp_delete_post((int) $id, true);
    }
    foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_%'") as $nombre) {
        if (preg_match('/^cod_adn_(proj_r[0-9]+|lock_.*|activa)$/', (string) $nombre) === 1) {
            delete_option((string) $nombre);
        }
    }
    wp_cache_flush();
    $salida(['ok' => true, 'activo' => COD_ADN_Store::activo()]);
} elseif ($accion === 'limpiar') {
    copy($repo . '/contope-basis/theme.json', $archivo_tema);
    $v = $vaciar();
    $salida(['ok' => $v['codigo'] === 0, 'vaciado' => $v['codigo'], 'themeJson' => hash_file('sha256', $archivo_tema) === hash_file('sha256', $repo . '/contope-basis/theme.json')]);
} else {
    $falla('acción desconocida: ' . $accion);
}
