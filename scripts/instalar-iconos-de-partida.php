<?php
/**
 * Un puñado de iconos de partida, instalados en Medios pasando por la limpieza
 * de COD_SVG —la misma puerta por la que entraría cualquier archivo subido—.
 *
 * NO SON EL CATÁLOGO. Igual que con los divisores: cualquier SVG del sitio
 * sirve como icono, y éstos existen sólo para que la biblioteca no esté vacía
 * el primer día. Divi trae su propia fuente de iconos y lo que hay es lo que
 * hay; acá el repertorio es el que el sitio tenga.
 *
 * CÓMO ESTÁN HECHOS, que es lo que los hace servir:
 *  - Formas MACIZAS y sin `fill` propio, para que el plugin les ponga
 *    `fill="currentColor"` y hereden el color del texto que acompañan. Un
 *    icono de contorno tendría que declarar él mismo `fill="none"` y
 *    `stroke="currentColor"`, porque el relleno por omisión de SVG es negro.
 *  - `viewBox` cuadrado de 24, que es la medida con la que se dibujan los
 *    iconos de interfaz, y sin `width`/`height`: el tamaño lo decide quien lo
 *    usa.
 *
 * Uso:  php scripts/instalar-iconos-de-partida.php
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$ICONOS = [
    // Una flecha maciza: el icono de «seguir» o «ver más».
    'flecha' => 'M3 10.5h11.2L9.6 5.9 11 4.5l7 7-7 7-1.4-1.4 4.6-4.6H3z',
    // Una hoja, que es la marca de Econut y sirve de ejemplo de icono propio.
    'hoja' => 'M20 4c0 9-5.5 14-12 14-1.1 0-2.1-.1-3-.4C6.6 10.9 11.9 6.4 20 4z'
        . 'M4.6 19.4C6 15.6 8.8 12.6 12.5 11c-3.3 2.2-5.6 5.3-6.6 9z',
    // Un reloj: plazos, horarios, «cuánto demora». Las agujas son un HUECO en
    // el disco, no una forma encima: con el relleno normal se fundirían con él
    // y el icono se vería como un círculo macizo. De ahí el fill-rule de abajo.
    'reloj' => 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 10.6V6h-2v7.4l5 3 1-1.7z',
    // Un alfiler de mapa: dónde queda.
    'ubicacion' => 'M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z',
    // Un sobre: escribir, contactar.
    'correo' => 'M2 5h20v14H2zm2 2v.3l8 5 8-5V7z',
];

$subida = wp_upload_dir();
if (!empty($subida['error'])) {
    fwrite(STDERR, "No se pudo leer la carpeta de subidas: {$subida['error']}\n");
    exit(1);
}

$hechos = 0;
foreach ($ICONOS as $nombre => $d) {
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill-rule="evenodd" d="' . $d . '"/></svg>';

    // Por la misma puerta que un archivo subido a mano: si la limpieza lo
    // rechazara, es que el icono está mal hecho y no que la limpieza estorbe.
    $limpio = COD_SVG::limpiar($svg);
    if ($limpio === null) {
        fwrite(STDERR, "  rechazado por la limpieza: $nombre\n");
        continue;
    }

    $archivo = 'icono-' . $nombre . '.svg';
    $ruta = trailingslashit($subida['path']) . $archivo;
    if (file_put_contents($ruta, $limpio) === false) {
        fwrite(STDERR, "  no se pudo escribir: $ruta\n");
        continue;
    }

    $url = trailingslashit($subida['url']) . $archivo;
    $existente = attachment_url_to_postid($url);
    if ($existente === 0) {
        $id = wp_insert_attachment([
            'guid' => $url,
            'post_mime_type' => 'image/svg+xml',
            'post_title' => 'Icono ' . $nombre,
            'post_status' => 'inherit',
        ], $ruta);
        if (is_wp_error($id) || $id === 0) {
            fwrite(STDERR, "  no se pudo registrar en Medios: $nombre\n");
            continue;
        }
    }

    echo "  ok  " . str_replace($subida['basedir'], '', $ruta) . "\n";
    ++$hechos;
}

echo "\n$hechos iconos en Medios.\n";
exit($hechos === count($ICONOS) ? 0 : 1);
