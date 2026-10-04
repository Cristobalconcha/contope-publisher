<?php
/**
 * Cómo se descargan las imágenes de una página: el equivalente del «streaming»
 * de un mapa.
 *
 * DE DÓNDE SALE. Medido en la portada de Econut el 4 de octubre de 2026: 33
 * imágenes, **ninguna** con `srcset`, **ninguna** diferida y **una sola** con
 * alto y ancho. La página pedía siempre el archivo original —la línea de
 * selección venía de 2560×1707 para mostrarse a 400×300— y sumaba 6,6 MB.
 * WordPress ya tenía generados los tamaños intermedios; no los usábamos.
 *
 * Cristóbal lo planteó con la analogía justa: «pienso en lo que pesa un mapa y
 * cómo se hace streaming para que la descarga sea gradual a medida que se
 * navega o se hace zoom». Son las mismas dos ideas: `srcset` es el nivel de
 * zoom —la resolución que de verdad se va a dibujar— y `loading="lazy"` es el
 * encuadre —lo de fuera de pantalla no se baja hasta acercarse—.
 *
 * Y una tercera que no se ve pero que Google sí mide: declarar alto y ancho
 * reserva el hueco, así la página no salta cuando cada foto llega.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};
$mensaje = static fn ($r): string => is_wp_error($r) ? $r->get_error_message() : '';

// Una foto de verdad en Medios: sin un adjunto real no hay tamaños que ofrecer
// y la prueba no probaría nada.
$foto = '';
foreach (['/wp-content/uploads/2026/09/Aerea-Econut-01.jpg', '/wp-content/uploads/2026/09/Perspectiva-2.jpg'] as $candidata) {
    if (attachment_url_to_postid(home_url($candidata)) > 0) { $foto = $candidata; break; }
}
if ($foto === '') {
    echo "No hay una foto de prueba en Medios; no se puede comprobar.\n";
    exit(1);
}

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$diseno = ['schemaVersion' => 1, 'designId' => 'prueba-img', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => []];
$img = static fn (string $id, string $url): array => ['id' => $id, 'kind' => 'image', 'content' => ['assetUrl' => $url, 'alt' => 'Una foto']];

$r = $compilador->compile(
    ['schemaVersion' => 2, 'nodes' => [[
        'id' => 'sec', 'kind' => 'section',
        'children' => [$img('i1', $foto), $img('i2', $foto), $img('i3', $foto)],
    ]]],
    $diseno
);
$comprobar('compila', !is_wp_error($r), $mensaje($r));
if (is_wp_error($r)) { exit(1); }
$html = $r['storage']['markup'];

echo "\n== el nivel de zoom: se pide la resolución que se va a dibujar ==\n";
$comprobar('ofrece los tamaños que WordPress ya generó', substr_count($html, 'srcset=') === 3);
$comprobar('  con más de uno donde elegir', preg_match('/srcset="[^"]*,[^"]*"/', $html) === 1);
$comprobar('dice cuánto espacio va a ocupar, o el navegador baja de más', strpos($html, 'sizes=') !== false);

echo "\n== el encuadre: lo que no se ve, no se baja ==\n";
$comprobar('las de abajo se difieren', substr_count($html, 'loading="lazy"') === 2);
$comprobar('la PRIMERA no, porque es la que mide la carga de la página',
    substr_count($html, 'loading="eager"') === 1 && strpos($html, 'fetchpriority="high"') !== false);
$comprobar('  y va antes que las diferidas', strpos($html, 'loading="eager"') < strpos($html, 'loading="lazy"'));

echo "\n== el hueco reservado: la página no salta ==\n";
$comprobar('cada foto declara su alto y su ancho', substr_count($html, ' width="') === 3 && substr_count($html, ' height="') === 3);
$comprobar('se descodifica sin bloquear', substr_count($html, 'decoding="async"') === 3);

/**
 * El documento guarda rutas relativas a propósito —para que sobreviva a un
 * cambio de dominio—, y la búsqueda en Medios sólo entiende la dirección
 * completa. Ése fue el fallo que dejaba el `srcset` vacío en las 33 imágenes.
 */
echo "\n== una ruta relativa encuentra su foto en Medios ==\n";
$comprobar('la ruta del documento sigue siendo relativa', strpos($html, 'src="' . $foto . '"') !== false);
$comprobar('  y aun así trajo los tamaños', strpos($html, 'srcset=') !== false);

echo "\n== una imagen que no está en Medios no estorba ==\n";
$r2 = $compilador->compile(
    ['schemaVersion' => 2, 'nodes' => [$img('i1', '/wp-content/uploads/no-existe-esta-foto.jpg')]],
    $diseno
);
$h2 = is_wp_error($r2) ? '' : $r2['storage']['markup'];
$comprobar('compila igual', !is_wp_error($r2), $mensaje($r2));
$comprobar('  sin srcset inventado', strpos($h2, 'srcset=') === false);
$comprobar('  pero con prioridad, que no depende de Medios', strpos($h2, 'loading="eager"') !== false);

echo "\n== cada página empieza de nuevo ==\n";
$r3 = $compilador->compile(['schemaVersion' => 2, 'nodes' => [$img('i1', $foto)]], $diseno);
$comprobar('la primera imagen de la SIGUIENTE página también es la prioritaria',
    !is_wp_error($r3) && strpos($r3['storage']['markup'], 'loading="eager"') !== false, $mensaje($r3));

echo "\n== el saneador lo deja pasar ==\n";
$limpio = (new COD_Canvas_Document_Sanitizer())->sanitize_html($html);
$comprobar('conserva srcset', is_string($limpio) && strpos($limpio, 'srcset=') !== false,
    is_wp_error($limpio) ? $limpio->get_error_message() : '');
$comprobar('conserva la carga diferida', is_string($limpio) && strpos($limpio, 'loading="lazy"') !== false);
$comprobar('conserva el alto y el ancho', is_string($limpio) && strpos($limpio, ' width="') !== false);

echo "\n";
if ($fallas === 0) { echo "probar-carga-de-imagenes.php   TODO OK\n"; exit(0); }
echo "probar-carga-de-imagenes.php   $fallas falla(s)\n";
exit(1);
