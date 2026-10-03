<?php
/**
 * Que un SVG se pueda subir y que lo que quede guardado no ejecute nada.
 *
 * Las dos mitades importan. Si sólo se comprueba que un SVG limpio pase, se
 * está probando que la puerta abre; lo que hay que probar es que el guardia
 * está en la puerta.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local (Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};

/** El pin real del sitio, que es el caso bueno. */
$pin = file_get_contents(__DIR__ . '/../contope-econut/imagenes/pin-econut.svg');

echo "\n== el caso bueno: el pin de Econut ==\n";
$limpio = COD_SVG::limpiar((string) $pin);
$comprobar('se puede leer y limpiar', is_string($limpio));
$comprobar('sigue siendo un <svg>', is_string($limpio) && stripos($limpio, '<svg') !== false);
$comprobar('conserva el dibujo (los <path>)', is_string($limpio) && substr_count($limpio, '<path') === substr_count((string) $pin, '<path'));
$comprobar('conserva el viewBox', is_string($limpio) && strpos($limpio, 'viewBox="0 0 109.11 154.73"') !== false);
$comprobar('conserva los colores del <style>', is_string($limpio) && strpos($limpio, '#fff') !== false);

echo "\n== lo que tiene que desaparecer ==\n";

$casos = [
    'un <script> dentro' =>
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>',
    'un onload en el <svg>' =>
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>',
    'un onclick en un <path>' =>
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" onclick="alert(1)"/></svg>',
    'un onmouseover' =>
        '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" onmouseover="alert(1)"/></svg>',
    'un <foreignObject> con HTML' =>
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">hola</div></foreignObject></svg>',
    'un enlace javascript:' =>
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><path d="M0 0"/></a></svg>',
    'un <use> de otro servidor' =>
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://malo.example/x.svg#a"/></svg>',
    'una <image> de otro servidor' =>
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://malo.example/x.png"/></svg>',
    'un style con url() externa' =>
        '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://malo.example/x)"/></svg>',
    'un <animate> que cambia un href' =>
        '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" to="javascript:alert(1)"/></svg>',
];

$prohibido = static function (string $svg): array {
    $s = strtolower($svg);
    $malos = [];
    foreach (['<script', 'onload=', 'onclick=', 'onmouseover=', '<foreignobject', 'javascript:', 'malo.example'] as $aguja) {
        if (strpos($s, $aguja) !== false) { $malos[] = $aguja; }
    }
    return $malos;
};

foreach ($casos as $nombre => $svg) {
    $limpio = COD_SVG::limpiar($svg);
    if ($limpio === null) {
        // Rechazarlo entero también es una respuesta correcta.
        $comprobar($nombre, true, '(rechazado entero)');
        continue;
    }
    $quedan = $prohibido($limpio);
    $comprobar($nombre, $quedan === [], $quedan === [] ? '' : 'quedó: ' . implode(', ', $quedan));
}

echo "\n== lo que NO se puede romper ==\n";
$conservar = [
    'un href interno (#)' => ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#pieza"/></svg>', '#pieza'],
    'una imagen incrustada en base64' => ['<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo="/></svg>', 'base64'],
    'una ruta relativa del propio sitio' => ['<svg xmlns="http://www.w3.org/2000/svg"><image href="/wp-content/uploads/x.png"/></svg>', '/wp-content/'],
    'un gradiente con url(#…)' => ['<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(#g)"/></svg>', 'url(#g)'],
];
foreach ($conservar as $nombre => [$svg, $aguja]) {
    $limpio = COD_SVG::limpiar($svg);
    $comprobar($nombre, is_string($limpio) && strpos($limpio, $aguja) !== false, is_string($limpio) ? '' : '(se rechazó entero)');
}

echo "\n== lo que no se puede leer, se rechaza ==\n";
foreach ([
    'no es XML' => 'esto no es un svg',
    'XML roto' => '<svg xmlns="http://www.w3.org/2000/svg"><path',
    'no es un <svg>' => '<html xmlns="http://www.w3.org/1999/xhtml"><body>hola</body></html>',
    'vacío' => '',
] as $nombre => $svg) {
    $comprobar($nombre, COD_SVG::limpiar($svg) === null);
}

echo "\n== permisos ==\n";
$comprobar('el sitio acepta SVG', COD_SVG::permitido());
// Sin usuario conectado no hay unfiltered_html, así que no se puede subir.
wp_set_current_user(0);
$comprobar('un visitante no puede subir', !COD_SVG::puede_subir());
$admin = get_users(['role' => 'administrator', 'number' => 1]);
if ($admin) {
    wp_set_current_user($admin[0]->ID);
    $comprobar('un administrador sí puede', COD_SVG::puede_subir());
    $tipos = apply_filters('upload_mimes', [], null);
    $comprobar('  y el tipo queda permitido', ($tipos['svg'] ?? '') === COD_SVG::MIME);
    $d = apply_filters('wp_check_filetype_and_ext', ['ext' => '', 'type' => '', 'proper_filename' => false], '/tmp/x.svg', 'x.svg', null);
    $comprobar('  y la extensión se reconoce', ($d['type'] ?? '') === COD_SVG::MIME);
}
wp_set_current_user(0);

// Y que se pueda apagar entero.
add_filter('cod_permitir_svg', '__return_false');
$comprobar('el filtro cod_permitir_svg lo desactiva', !COD_SVG::permitido());
remove_filter('cod_permitir_svg', '__return_false');

echo "\n";
if ($fallas === 0) { echo "probar-svg.php   TODO OK\n"; exit(0); }
echo "probar-svg.php   $fallas falla(s)\n";
exit(1);
