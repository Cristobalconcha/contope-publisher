<?php
/**
 * Toda página publicada por el lienzo tiene que tener su COMPOSICIÓN registrada.
 *
 * POR QUÉ EXISTE. El 4 de octubre de 2026 medí el espejo de Santa Luisa y
 * encontré sus 8 páginas con documento pero SIN composición: la portada son
 * 281 KB de HTML con cero clases `cod-rule--` y cero `data-cod-node-id`. Lo
 * anoté como un comentario al pasar dentro de otra prueba y seguí.
 *
 * Cristóbal, el mismo día: «yo pedí que esto fuera, se usara el constructor, no
 * que fuera una copia de una página hecha en el escritorio… recuerdo que le
 * indicaba que pusiera las clases correspondientes para que el sistema las
 * considerara esas páginas como parte de su constructo».
 *
 * Tiene razón, y el defecto de fondo no es que falten esas composiciones: es
 * que faltaban EN SILENCIO. Una página sin composición no se puede editar por
 * el constructor, no tiene reglas de diseño, y arrastra su propia hoja de
 * estilo plana —justo el neumático pinchado del que hablaba esa mañana—. Nada
 * en el proyecto lo decía en voz alta.
 *
 * CÓMO FUNCIONA. Es un trinquete, no un semáforo. Cada sitio declara cuántas
 * páginas sin composición se le aceptan HOY. Si aparece una más, falla. Cuando
 * se recompone una, el número baja y hay que bajar el techo. Así la deuda sólo
 * puede ir en una dirección y no se puede volver a esconder en un comentario.
 *
 *   php scripts/probar-paginas-con-composicion.php
 *   php scripts/probar-paginas-con-composicion.php <ruta a wp-load.php>   (un sitio)
 */

/** Sitios y su deuda aceptada hoy. Al recomponer una página, BAJAR el techo. */
$SITIOS = [
    'Econut (local, el que se construye por el MCP)' => [
        'wp' => __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php',
        'sin_composicion_aceptadas' => 0,
    ],
    'Santa Luisa (espejo local, heredado del HTML)' => [
        'wp' => __DIR__ . '/../../wp-local/wordpress/wp-load.php',
        // 8 al 2026-10-04. Es deuda conocida, no un permiso: ver el encabezado.
        'sin_composicion_aceptadas' => 8,
    ],
];

// ---------------------------------------------------------------- un sitio ---
if ($argc > 1) {
    define('WP_USE_THEMES', false);
    require $argv[1];

    $repo = new COD_Canvas_Document_Repository();
    $sin = [];
    $con = 0;

    foreach (get_posts(['post_type' => 'page', 'numberposts' => -1, 'post_status' => 'any']) as $p) {
        $doc = COD_Canvas_Page_Publisher::documento_del_contenido((string) $p->post_content);
        if ($doc === '') {
            continue; // No es una página del lienzo.
        }
        $cargado = $repo->load($doc);
        $comp = is_array($cargado) ? json_decode((string) ($cargado['composition'] ?? ''), true) : null;
        $nodos = is_array($comp) ? count($comp['composition']['nodes'] ?? []) : 0;

        if ($nodos > 0) {
            $con++;
            continue;
        }
        $html = is_array($cargado) ? (string) ($cargado['html'] ?? '') : '';
        $sin[] = sprintf('pág %d «%s» (%s · %d B de HTML, %d clases del sistema)',
            $p->ID, $p->post_title, $doc, strlen($html),
            preg_match_all('/cod-rule--[a-z0-9-]+/i', $html));
    }

    echo json_encode(['con' => $con, 'sin' => $sin], JSON_UNESCAPED_UNICODE);
    exit(0);
}

// ------------------------------------------------------------- la batería ---
$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};

foreach ($SITIOS as $nombre => $sitio) {
    echo "\n== $nombre ==\n";

    if (!is_readable($sitio['wp'])) {
        // Un sitio que no está levantado no es un fallo de esta prueba.
        echo "  (no está en este equipo: " . $sitio['wp'] . ")\n";
        continue;
    }

    $salida = shell_exec(sprintf('%s %s %s 2>&1',
        escapeshellarg(PHP_BINARY), escapeshellarg(__FILE__), escapeshellarg($sitio['wp'])));
    $datos = json_decode((string) $salida, true);

    if (!is_array($datos)) {
        $comprobar('el sitio responde', false, trim((string) $salida));
        continue;
    }

    $sin = $datos['sin'];
    $techo = (int) $sitio['sin_composicion_aceptadas'];

    $comprobar(sprintf('%d páginas del lienzo, %d con composición', $datos['con'] + count($sin), $datos['con']), true);
    $comprobar(
        sprintf('sin composición: %d, techo %d', count($sin), $techo),
        count($sin) <= $techo,
        count($sin) > $techo ? 'APARECIÓ UNA NUEVA: se construyó por fuera del constructor' : ''
    );

    if (count($sin) < $techo) {
        $comprobar('  el techo quedó alto: bajarlo a ' . count($sin) . ' en este archivo', false);
    }

    foreach ($sin as $linea) {
        echo "           · $linea\n";
    }
}

echo "\n";
if ($fallas === 0) { echo "probar-paginas-con-composicion.php   TODO OK\n"; exit(0); }
echo "probar-paginas-con-composicion.php   $fallas falla(s)\n";
exit(1);
