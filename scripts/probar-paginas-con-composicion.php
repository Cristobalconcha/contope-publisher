<?php
/**
 * Toda página Y TODA REGIÓN del lienzo tiene que tener su COMPOSICIÓN registrada.
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
 * LAS REGIONES TAMBIÉN CUENTAN, y hubo que agregarlas. Esta prueba miraba sólo
 * las páginas, así que el encabezado compartido de Santa Luisa —14.688 B de
 * HTML suelto, con el logo incrustado como un <symbol> de 13 KB y los enlaces
 * apuntando a ?page_id=— estuvo semanas fuera del tablero. El trinquete decía
 * «todo en orden» con la pieza que aparece en TODAS las páginas interiores
 * construida por fuera del constructor. Una deuda que el medidor no mira es
 * una deuda que no existe, y ésta se arregló el 4 de octubre de 2026.
 *
 *   php scripts/probar-paginas-con-composicion.php
 *   php scripts/probar-paginas-con-composicion.php <ruta a wp-load.php>   (un sitio)
 */

/** Sitios y su deuda aceptada hoy. Al recomponer una página, BAJAR el techo. */
$SITIOS = [
    'Econut (local, el que se construye por el MCP)' => [
        'wp' => __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php',
        'sin_composicion_aceptadas' => 0,
        'regiones_sin_composicion_aceptadas' => 0,
    ],
    'Santa Luisa (espejo local, heredado del HTML)' => [
        'wp' => __DIR__ . '/../../wp-local/wordpress/wp-load.php',
        // 4, y vuelve a ser 4 a propósito.
        //
        // Llegó a 3 el 4 de octubre al componer la portada. Al día siguiente esa
        // composición se descartó entera —no reproducía el diseño, lo
        // reinterpretaba— y se restauró la portada original, que no tiene
        // composición. Las otras 3 son páginas de prueba (f3b-legacy-doc,
        // Prueba WhatsApp CTA y Prueba viewport y animación).
        //
        // La portada baja a 0 cuando se normalice como corresponde: ver
        // Sesión Claude/MIGRACION-normalizar-paginas.md. Bajar el techo antes
        // sería esconder deuda, que es justo lo que este trinquete evita.
        'sin_composicion_aceptadas' => 4,
        // 1 al 2026-10-04, tras componer la BARRA DE NAVEGACIÓN. Era 2. La que
        // queda es un encabezado de plantilla vacío y duplicado que sobró de
        // una prueba («Landing», 0 B); no se borra acá porque borrar es del
        // dueño del sitio, y mientras esté se cuenta.
        'regiones_sin_composicion_aceptadas' => 1,
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

    /*
     * Y LAS REGIONES, que son documentos del lienzo sin página propia. Se
     * enumeran preguntándole al repositorio por su regionKind, igual que lo
     * hacen el resolvedor y el canal MCP: una lista de nombres escrita a mano
     * se queda fuera de los encabezados de plantilla, que es justo el caso que
     * se nos escapó.
     */
    $regionesCon = 0;
    $regionesSin = [];
    foreach ($repo->list_region_documents() as $region) {
        $id = (string) $region['documentId'];
        $cargado = $repo->load($id);
        $comp = is_array($cargado) ? json_decode((string) ($cargado['composition'] ?? ''), true) : null;
        $nodos = is_array($comp) ? count($comp['composition']['nodes'] ?? []) : 0;
        if ($nodos > 0) {
            $regionesCon++;
            continue;
        }
        $html = is_array($cargado) ? (string) ($cargado['html'] ?? '') : '';
        $regionesSin[] = sprintf('región %s «%s» (%d B de HTML, %d clases del sistema)',
            (string) $region['regionKind'], $id, strlen($html),
            preg_match_all('/cod-rule--[a-z0-9-]+/i', $html));
    }

    echo json_encode([
        'con' => $con, 'sin' => $sin,
        'regionesCon' => $regionesCon, 'regionesSin' => $regionesSin,
    ], JSON_UNESCAPED_UNICODE);
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

    /*
     * Y LAS REGIONES, con su propio techo. Van aparte y no sumadas a las
     * páginas porque son otra cosa: una región aparece en TODAS las páginas que
     * la usan, así que una región sin composición pesa mucho más que una página
     * suelta y merece su propia cuenta.
     */
    $regionesSin = $datos['regionesSin'] ?? [];
    $techoRegiones = (int) ($sitio['regiones_sin_composicion_aceptadas'] ?? 0);
    $regionesCon = (int) ($datos['regionesCon'] ?? 0);

    $comprobar(sprintf('%d regiones, %d con composición', $regionesCon + count($regionesSin), $regionesCon), true);
    $comprobar(
        sprintf('regiones sin composición: %d, techo %d', count($regionesSin), $techoRegiones),
        count($regionesSin) <= $techoRegiones,
        count($regionesSin) > $techoRegiones ? 'APARECIÓ UNA NUEVA: se construyó por fuera del constructor' : ''
    );
    if (count($regionesSin) < $techoRegiones) {
        $comprobar('  el techo de regiones quedó alto: bajarlo a ' . count($regionesSin) . ' en este archivo', false);
    }
    foreach ($regionesSin as $linea) {
        echo "           · $linea\n";
    }
}

echo "\n";
if ($fallas === 0) { echo "probar-paginas-con-composicion.php   TODO OK\n"; exit(0); }
echo "probar-paginas-con-composicion.php   $fallas falla(s)\n";
exit(1);
