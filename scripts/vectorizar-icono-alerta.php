<?php
/**
 * El triángulo de alerta, en vector, trazado desde la geometría MEDIDA del PNG
 * original (`Icono-alerta@2x.png`, 1170×1073).
 *
 * POR QUÉ VECTORIZARLO Y NO SEGUIR CON EL PNG. Porque el PNG sólo puede ir de
 * fondo, y de fondo no participa de la línea de texto: queda detrás, hay que
 * reservarle sitio a mano y, en cuanto el texto se acomoda, se le mete debajo.
 * Cristóbal, el 4 de octubre de 2026: «me refiero al icono de alerta, que se
 * repite y queda metido bajo el texto… no lo pongas como fondo, agrégalo como
 * ícono dentro del texto». Como SVG entra en el párrafo con la familia `icono`,
 * se mide en `em` contra la línea que acompaña y se recolorea desde el panel.
 *
 * LO QUE SE MIDIÓ, y es lo que hace que esto sea una copia y no un dibujo
 * parecido. Leyendo el canal alfa del PNG fila por fila:
 *
 *  - es de UN SOLO COLOR: #E5007E con alfa 77/255 (30%). Lo que parecía un
 *    signo de exclamación blanco es en realidad un HUECO —se ve el amarillo de
 *    la franja a través—, así que acá son dos contornos vacíos con `evenodd` y
 *    no dos formas blancas encima;
 *  - el borde izquierdo cae con pendiente −0,5654 por píxel y el derecho sube
 *    con +0,5667: las rectas salen de ajustar las filas y=120, 500 y 900;
 *  - las esquinas están redondeadas, y con radios DISTINTOS: ~68 en la cumbre
 *    y ~88 abajo. Se dedujeron del punto en que cada arco deja de tocar su
 *    recta (la fila más ancha, y=1000, llega a x=1).
 *
 * Los vértices resultantes caen FUERA del lienzo —la cumbre en y=−71, las
 * bases en x=−63 y x=1232— porque el original está encuadrado a ras del
 * redondeo. Eso es correcto y hay que dejarlo: encajar los vértices dentro de
 * la caja afinaría el triángulo y cambiaría la silueta.
 *
 * Uso:  php scripts/vectorizar-icono-alerta.php
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

// El contorno, con las esquinas redondeadas por una cuadrática cuyo punto de
// control es el vértice: a estos radios es indistinguible de un arco.
$triangulo = 'M524 39'
    . 'Q583.8-70.8 643.6 39'      // cumbre
    . 'L1161.1 943'
    . 'Q1232 1073 1084 1073'      // base derecha
    . 'L85.1 1073'
    . 'Q-62.9 1073 8 943'         // base izquierda
    . 'Z';

// Los dos huecos del signo. La barra se estrecha hacia abajo, como el original.
$barra = 'M511 228H654L644 690H522Z';
$punto = 'M521 835H644V965H521Z';

// Sin `fill` propio: el color lo pone la regla, y así cambiar la tinta del
// sistema lo arrastra. El original es #E5007E al 30%.
$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1170 1073">'
    . '<path fill-rule="evenodd" d="' . $triangulo . $barra . $punto . '"/></svg>';

$limpio = COD_SVG::limpiar($svg);
if ($limpio === null) {
    fwrite(STDERR, "La limpieza rechazó el SVG.\n");
    exit(1);
}

$subida = wp_upload_dir();
$archivo = 'icono-alerta.svg';
$ruta = trailingslashit($subida['path']) . $archivo;
if (file_put_contents($ruta, $limpio) === false) {
    fwrite(STDERR, "No se pudo escribir $ruta\n");
    exit(1);
}

$url = trailingslashit($subida['url']) . $archivo;
if (attachment_url_to_postid($url) === 0) {
    $id = wp_insert_attachment([
        'guid' => $url,
        'post_mime_type' => 'image/svg+xml',
        'post_title' => 'Icono de alerta',
        'post_status' => 'inherit',
    ], $ruta);
    if (is_wp_error($id) || $id === 0) {
        fwrite(STDERR, "No se pudo registrar en Medios.\n");
        exit(1);
    }
}

echo str_replace($subida['basedir'], '', $ruta) . "\n";
