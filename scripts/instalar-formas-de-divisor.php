<?php
/**
 * Instala en Medios las formas que genera `generar-formas-divisor.mjs`, pasando
 * por la misma limpieza (COD_SVG) que cualquier SVG subido.
 *
 * Son las formas del divisor y, desde 0.3.83, también las de la máscara y la
 * trama de la regla `surface`: un solo juego, elegido siempre por la ruta de su
 * archivo en Medios (`/wp-content/uploads/formas/onda.svg`).
 *
 * Uso:
 *   node scripts/generar-formas-divisor.mjs --destino "<carpeta-temporal>"
 *   php scripts/instalar-formas-de-divisor.php <carpeta-temporal> [<ruta-de-wp-load.php>]
 *
 * Sin la segunda ruta se instala en el WordPress local de Basis (puerto 8894).
 * Instalar de nuevo reemplaza el archivo, así que una forma corregida llega a
 * todo lo que la usa sin tocar ninguna página.
 */
$origen = $argv[1] ?? '';
if ($origen === '' || !is_dir($origen)) {
    fwrite(STDERR, "uso: php instalar-formas-de-divisor.php <carpeta con los .svg> [<wp-load.php>]\n");
    exit(1);
}
define('WP_USE_THEMES', false);
require $argv[2] ?? __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$subida = wp_upload_dir();
if (!empty($subida['error'])) {
    fwrite(STDERR, "No se pudo leer la carpeta de subidas: {$subida['error']}\n");
    exit(1);
}
$carpeta = trailingslashit($subida['basedir']) . 'formas';
wp_mkdir_p($carpeta);

$archivos = glob(rtrim($origen, '/\\') . '/*.svg') ?: [];
$hechos = 0;
foreach ($archivos as $archivo) {
    $nombre = basename($archivo);
    $limpio = COD_SVG::limpiar((string) file_get_contents($archivo));
    if ($limpio === null) {
        fwrite(STDERR, "  rechazado por la limpieza: $nombre\n");
        continue;
    }
    $ruta = $carpeta . '/' . $nombre;
    if (file_put_contents($ruta, $limpio) === false) {
        fwrite(STDERR, "  no se pudo escribir: $ruta\n");
        continue;
    }
    $url = trailingslashit($subida['baseurl']) . 'formas/' . $nombre;
    if (attachment_url_to_postid($url) === 0) {
        $id = wp_insert_attachment([
            'guid' => $url,
            'post_mime_type' => 'image/svg+xml',
            'post_title' => ucfirst(str_replace('-', ' ', basename($nombre, '.svg'))),
            'post_status' => 'inherit',
        ], $ruta);
        if (is_wp_error($id) || $id === 0) {
            fwrite(STDERR, "  no se pudo registrar en Medios: $nombre\n");
            continue;
        }
    }
    echo '  ok  ' . wp_make_link_relative($url) . "\n";
    ++$hechos;
}
echo "\n$hechos formas en Medios.\n";
exit($hechos === count($archivos) && $hechos > 0 ? 0 : 1);
