<?php
/**
 * El set base de iconos del sitio.
 *
 * QUÉ ES Y QUÉ NO ES. No es el catálogo: es lo que está descargado desde el
 * primer día para que nadie espere. Cualquier otro icono se trae cuando se
 * pide y queda cacheado junto a éstos. Idea de Cristóbal, el 4 de octubre de
 * 2026: «podríamos tener un set base ya cacheado, y al mismo tiempo ir
 * agregando iconos en la medida que se piden; y eso se asocia al sitio, no la
 * tipografía completa».
 *
 * DE DÓNDE SALE LA LISTA, que es lo que la hace defendible. Cristóbal ofreció
 * poner gente a mirar cientos de sitios para deducir un set estándar. No hizo
 * falta: el catálogo de Material publica, por cada uno de sus 6.126 iconos,
 * CUÁNTAS VECES SE USA EN LA WEB (`popularity` en
 * fonts.google.com/metadata/icons). `search` encabeza con 863.455.
 *
 * Pero ese ranking no se puede tomar tal cual, y conviene saber por qué: lo
 * dominan aplicaciones y paneles de administración, no sitios. Su top 50 está
 * lleno de `account_circle`, `logout`, `manage_accounts`, `dashboard` y
 * `fingerprint`. Así que la lista de abajo usa el ranking como espina dorsal y
 * lo filtra por lo que un sitio necesita de verdad. El número entre paréntesis
 * es el puesto mundial, para que cualquiera pueda discutir una elección con el
 * dato a la vista en vez de con una opinión.
 *
 * POR QUÉ SVG Y NO LA TIPOGRAFÍA. La familia completa pesa ~3,7 MB y volvería
 * a ser un repertorio cerrado —lo mismo que rechazamos para los divisores—.
 * Como SVG, cada icono es un recurso del sitio: se recolorea con `currentColor`
 * y se reemplaza por el dibujo que uno quiera. La tipografía sí sirve, pero en
 * el SELECTOR del panel, donde el peso no le cuesta nada al visitante.
 *
 * LAS REDES NO ESTÁN EN MATERIAL —son marcas registradas— pero el plugin ya
 * las lleva dibujadas, tomadas del núcleo de WordPress (GPL-2.0), y resulta que
 * están en la misma retícula de 24, de un solo trazo y sin color propio. O sea
 * que entran al set sin tocarlas.
 *
 * LICENCIA: Material Symbols es Apache 2.0, redistribuible y compatible con la
 * GPLv3 del plugin.
 *
 * Uso:
 *   php scripts/instalar-set-de-iconos.php            instala lo que falte
 *   php scripts/instalar-set-de-iconos.php --mirar    dice qué haría
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$solo_mirar = in_array('--mirar', $argv, true);

/** El set base, por grupos. El número es el puesto mundial de uso. */
const SET = [
    'navegacion' => ['search', 'close', 'menu', 'expand_more', 'expand_less', 'chevron_right', 'chevron_left', 'arrow_back', 'arrow_forward', 'more_vert'],
    'estado'     => ['info', 'check_circle', 'visibility', 'visibility_off', 'warning', 'error'],
    'archivos'   => ['delete', 'edit', 'file_download', 'content_copy', 'file_upload', 'save', 'download', 'print', 'file_copy'],
    'cuenta'     => ['account_circle', 'logout', 'manage_accounts', 'login', 'person_add', 'how_to_reg'],
    // «Valores» admitía dos lecturas y se resolvió poniendo las dos, que son
    // cuatro iconos de diferencia: las cifras y los valores de una empresa.
    'cifras'     => ['paid', 'trending_up', 'attach_money', 'payments', 'receipt_long', 'local_offer', 'bar_chart'],
    'valores'    => ['verified', 'handshake', 'volunteer_activism', 'eco'],
    'compras'    => ['shopping_cart', 'local_shipping', 'shopping_bag', 'credit_card', 'inventory_2', 'add_shopping_cart', 'storefront'],
    'libreria'   => ['description', 'photo_camera', 'menu_book', 'folder', 'picture_as_pdf', 'bookmark', 'library_books'],
    'conectar'   => ['share', 'open_in_new', 'link', 'bolt', 'vpn_key', 'sync'],
    'contacto'   => ['email', 'location_on', 'schedule', 'call', 'language', 'place', 'chat'],
];

/**
 * Los tres estilos de Material. Se bajan los TRES al elegir un icono, no sólo
 * el que esté activo: el estilo es una decisión del sistema de diseño —si el
 * sitio es redondeado, lo son sus cuarenta iconos— y tenerlos los tres deja
 * cambiarlo de una vez, sin volver a descargar nada ni rehacer las páginas.
 *
 * El peso y el relleno NO se precargan, y es a propósito: tres estilos por
 * cinco pesos por dos rellenos son treinta archivos por icono. Ésos se traen
 * cuando el sitio cambia su ajuste, que son unos pocos kilobytes.
 *
 * Las redes NO tienen estilos: una marca registrada se dibuja como es.
 */
const ESTILOS = [
    'outlined' => 'materialsymbolsoutlined',
    'rounded' => 'materialsymbolsrounded',
    'sharp' => 'materialsymbolssharp',
];

/**
 * El WhatsApp vive hoy escrito dentro del compilador. Entra al set para que
 * deje de estar cocido en el código, que es el reclamo que originó todo esto.
 */
const WHATSAPP = [
    'viewBox' => '0 0 32 32',
    'path' => 'M16 3C9 3 3.3 8.6 3.3 15.5c0 2.4.7 4.7 1.9 6.7L3 29l7-2.1c1.9 1 4 1.6 6 1.6 7 0 12.7-5.6 12.7-12.5S23 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.2 1.2 1.2-4-.3-.4a10.2 10.2 0 0 1-1.6-5.4C5.4 9.7 10.1 5 16 5s10.6 4.7 10.6 10.5S21.9 25.7 16 25.7zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-2.6-1.6 9.7 9.7 0 0 1-1.8-2.2c-.2-.3 0-.5.1-.7l.5-.6.3-.5a.6.6 0 0 0 0-.5c-.1-.2-.7-1.7-1-2.3s-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.6 3.6 0 0 0-1.1 2.7c0 1.6 1.2 3.1 1.3 3.3.2.2 2.3 3.6 5.7 5a19.6 19.6 0 0 0 1.9.7 4.6 4.6 0 0 0 2.1.1c.6-.1 1.9-.8 2.2-1.5s.3-1.4.2-1.5-.3-.2-.6-.4z',
];

// El set vive en su propia carpeta, sin año ni mes: un icono se busca por
// nombre, y repartirlo por fecha de descarga obligaría a recorrer carpetas.
$carpeta = COD_Icono::carpeta();
$carpeta_url = COD_Icono::carpeta_url();
if ($carpeta === '' || $carpeta_url === '') {
    fwrite(STDERR, "No se pudo preparar la carpeta del set.\n");
    exit(1);
}

/**
 * Guarda un SVG en Medios pasando por la limpieza, que es la misma puerta por
 * la que entraría un archivo subido a mano.
 */
$guardar = static function (string $nombre, string $svg, string $titulo) use ($carpeta, $carpeta_url, $solo_mirar): bool {
    $archivo = 'icono-' . $nombre . '.svg';
    $ruta = trailingslashit($carpeta) . $archivo;
    if (file_exists($ruta)) {
        return true;
    }
    if ($solo_mirar) {
        echo "  faltaría  $archivo\n";
        return true;
    }

    $limpio = COD_SVG::limpiar($svg);
    if ($limpio === null) {
        fwrite(STDERR, "  rechazado por la limpieza: $nombre\n");
        return false;
    }
    if (file_put_contents($ruta, $limpio) === false) {
        fwrite(STDERR, "  no se pudo escribir: $ruta\n");
        return false;
    }

    $url = trailingslashit($carpeta_url) . $archivo;
    if (attachment_url_to_postid($url) === 0) {
        $id = wp_insert_attachment([
            'guid' => $url,
            'post_mime_type' => 'image/svg+xml',
            'post_title' => $titulo,
            'post_status' => 'inherit',
        ], $ruta);
        if (is_wp_error($id) || $id === 0) {
            fwrite(STDERR, "  no se pudo registrar en Medios: $nombre\n");
            return false;
        }
    }
    echo "  ok  $archivo\n";
    return true;
};

$puestos = 0;
$fallos = 0;

echo "== Material Symbols ==\n";
foreach (SET as $grupo => $nombres) {
    echo "-- $grupo\n";
    foreach ($nombres as $nombre) {
        foreach (ESTILOS as $estilo => $familia) {
            $clave = $nombre . '-' . $estilo;
            $archivo = 'icono-' . $clave . '.svg';
            if (file_exists(trailingslashit($carpeta) . $archivo)) {
                ++$puestos;
                continue;
            }
            if ($solo_mirar) {
                echo "  faltaría  $archivo\n";
                ++$puestos;
                continue;
            }

            // El canal estable de Google para el dibujo suelto. El patrón con
            // versión que publica el propio catálogo devuelve 404 para
            // Material Symbols; éste es el que responde.
            $url = 'https://fonts.gstatic.com/s/i/short-term/release/' . $familia . '/'
                . rawurlencode($nombre) . '/default/24px.svg';
            $respuesta = wp_remote_get($url, ['timeout' => 20]);
            if (is_wp_error($respuesta) || (int) wp_remote_retrieve_response_code($respuesta) !== 200) {
                fwrite(STDERR, "  no se pudo traer: $clave\n");
                ++$fallos;
                continue;
            }

            // Fuera el ancho y el alto del archivo: el tamaño lo decide quien
            // lo usa, igual que en las formas de divisor.
            $svg = (string) preg_replace('/\s(?:width|height)="[0-9.]+"/i', '', wp_remote_retrieve_body($respuesta));

            if ($guardar($clave, $svg, 'Icono ' . str_replace('_', ' ', $nombre) . ' (' . $estilo . ')')) {
                ++$puestos;
            } else {
                ++$fallos;
            }
        }
    }
}

echo "\n== redes sociales (del núcleo de WordPress, GPL-2.0) ==\n";
$redes = class_exists('COD_Redes_Sociales') ? COD_Redes_Sociales::REDES : [];
foreach ($redes as $clave => $red) {
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' . $red['viewBox'] . '"><path d="' . $red['path'] . '"/></svg>';
    if ($guardar('red-' . $clave, $svg, $red['name'])) {
        ++$puestos;
    } else {
        ++$fallos;
    }
}
$svgWa = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' . WHATSAPP['viewBox'] . '"><path d="' . WHATSAPP['path'] . '"/></svg>';
if ($guardar('red-whatsapp', $svgWa, 'WhatsApp')) {
    ++$puestos;
} else {
    ++$fallos;
}

echo "\n$puestos iconos en el set" . ($fallos > 0 ? ", $fallos sin traer" : '') . ".\n";
exit($fallos === 0 ? 0 : 1);
