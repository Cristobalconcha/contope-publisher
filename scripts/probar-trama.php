<?php
/**
 * Que a Medios y a la página sólo llegue un archivo de trama válido.
 *
 * Las dos mitades importan, como en probar-svg.php: no basta con que una
 * trama buena pase; hay que probar que cualquier otro JSON, un código roto o
 * un texto con marcado se queden afuera, y que una sección con un archivo
 * malo se publique sin trama y con su contenido intacto.
 *
 * Cómo se corre:
 *   - Con el WordPress local de Econut (como las demás probar-*.php), desde
 *     la raíz del repo: `node scripts/correr-pruebas.mjs trama`, o con
 *     cualquier PHP 8: `php scripts/probar-trama.php`. Si encuentra
 *     `../wp-local-econut/wordpress/wp-load.php`, carga WordPress y prueba
 *     además la regla `trama` del compilador MCP.
 *   - Sin ese WordPress (una máquina sin wp-local, CI), define lo mínimo de
 *     WordPress que usan COD_Trama y COD_Divisor y prueba la validación y la
 *     resolución en la página, que son puras. Nunca contra wp-local (Santa Luisa).
 */
$wp = __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';
$conWordPress = is_readable($wp);
$raizSitio = sys_get_temp_dir() . '/probar-trama-' . getmypid();

if ($conWordPress) {
    define('WP_USE_THEMES', false);
    require $wp;
    $raizSitio = rtrim(ABSPATH, '/\\');
} else {
    @mkdir($raizSitio, 0777, true);
    define('ABSPATH', $raizSitio . '/');
    define('COD_PUBLISHER_VERSION', 'prueba');
    define('COD_PUBLISHER_FILE', __DIR__ . '/../contope-publisher/contope-publisher.php');
    function home_url($ruta = '') { return 'http://ejemplo.test' . $ruta; }
    function apply_filters($nombre, $valor) { return $valor; }
    function current_user_can($capacidad) { return true; }
    require __DIR__ . '/../contope-publisher/includes/class-cod-divisor.php';
    require __DIR__ . '/../contope-publisher/includes/class-cod-trama.php';
}

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};
echo $conWordPress ? "(con el WordPress local de Econut)\n" : "(sin WordPress: funciones mínimas de prueba)\n";

$cabecera = ['kind' => 'contope/trama', 'version' => 1, 'motor' => ['id' => 'superficie-de-puntos', 'version' => '1.0.0']];
$json = static fn (array $d): string => json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$completa = $cabecera + [
    'nombre' => 'Portada Nocturno',
    'procedencia' => ['kind' => 'contope/celula-madre', 'sistema' => ['id' => 'nocturno'], 'vacio' => new stdClass()],
    'lienzo' => ['tipo' => 'proporcion', 'proporcion' => 1.7778],
    'dibujo' => ['modo' => 'mixto', 'tinta' => 'auto'],
    'color' => ['lejos' => ['hex' => '#1d3fb8', 'origen' => 'adn', 'rol' => 'dim1.req02:primario'], 'cerca' => '#3bb8a8', 'fondo' => '#000000'],
    'configuracion' => ['lineas' => 44, 'puntosPorLinea' => 300, 'grosorLinea' => 0.45],
    'tiempo' => ['modo' => 'secuencia', 'inicio' => 6, 'duracion' => 8, 'cerrarCiclo' => true,
        'escenas' => [['id' => 1, 't' => 0, 'captura' => ['evolucion' => 6]]], 'pistas' => new stdClass()],
    'interaccion' => ['cursor' => true, 'paralaje' => false],
    'cuadroQuieto' => 4,
];

echo "\n== lo que tiene que pasar ==\n";
$r = COD_Trama::validar($json($cabecera), true);
$comprobar('la cabecera sola (el mínimo del formato)', $r['ok'], implode('; ', $r['errores']));
$r = COD_Trama::validar($json($completa), true);
$comprobar('una trama completa, con secuencia y procedencia', $r['ok'], implode('; ', $r['errores']));
$comprobar('la receta en línea no lleva < > & literales (no puede cerrar el <script>)', $r['ok'] && strpbrk($r['receta'], '<>&') === false);
$comprobar('y un {} vacío sigue siendo objeto, no []', strpos($r['receta'], '"vacio":{}') !== false && strpos($r['receta'], '"pistas":{}') !== false);
$ct1 = 'CT1.' . rtrim(strtr(base64_encode($json($cabecera)), '+/', '-_'), '=');
$r = COD_Trama::validar($ct1);
$comprobar('un código CT1', $r['ok'] && $r['origen'] === 'ct1' && $r['receta'] === $ct1, implode('; ', $r['errores']));
$sp1 = 'SP1.' . base64_encode('{"time":6,"cam":[0,0],"mouse":[0.5,0.5],"presence":0,"cfg":{"lineCount":64},"dotted":true}');
$r = COD_Trama::validar($sp1);
$comprobar('un código SP1 viejo (compatibilidad)', $r['ok'] && $r['origen'] === 'sp1', implode('; ', $r['errores']));
$comprobar('el motor 1.4.2 también se lee (misma versión mayor)', COD_Trama::validar($json(['motor' => ['id' => 'superficie-de-puntos', 'version' => '1.4.2']] + $cabecera), true)['ok']);

echo "\n== lo que tiene que quedar afuera ==\n";
$malos = [
    'otro JSON cualquiera (un package.json)' => '{"name":"x","version":"1.0.0","dependencies":{}}',
    'un JSON que es una lista' => '[1,2,3]',
    'JSON roto' => '{"kind":"contope/trama",',
    'vacío' => '',
    'kind equivocado' => $json(['kind' => 'contope/otra'] + $cabecera),
    'versión de formato 2' => $json(['version' => 2] + $cabecera),
    'motor 2.0.0 (otra imagen)' => $json(['motor' => ['id' => 'superficie-de-puntos', 'version' => '2.0.0']] + $cabecera),
    'otro motor' => $json(['motor' => ['id' => 'otro', 'version' => '1.0.0']] + $cabecera),
    'un campo desconocido' => $json($cabecera + ['guion' => 'x']),
    'marcado en el nombre' => $json($cabecera + ['nombre' => '<script>alert(1)</script>']),
    'javascript: escondido en la procedencia' => $json($cabecera + ['procedencia' => ['enlace' => 'javascript:alert(1)']]),
    '</script> en la procedencia' => $json($cabecera + ['procedencia' => ['x' => '</script><img src=x onerror=alert(1)>']]),
    'un color que no es #rrggbb' => $json($cabecera + ['color' => ['fondo' => 'red;background:url(x)']]),
    'un número que no es número' => $json($cabecera + ['configuracion' => ['lineas' => '64']]),
    '1001 líneas' => $json($cabecera + ['configuracion' => ['lineas' => 1001]]),
    'más de 500.000 puntos por cuadro' => $json($cabecera + ['configuracion' => ['lineas' => 1000, 'puntosPorLinea' => 4000]]),
    'secuencia sin duración' => $json($cabecera + ['tiempo' => ['modo' => 'secuencia']]),
    'secuencia de 601 s' => $json($cabecera + ['tiempo' => ['modo' => 'secuencia', 'duracion' => 601]]),
    'interacción que no es booleana' => $json($cabecera + ['interaccion' => ['cursor' => 'si']]),
    'demasiado grande' => $json($cabecera + ['nombre' => str_repeat('a', COD_Trama::TAMANO_MAXIMO)]),
];
foreach ($malos as $caso => $texto) {
    $r = COD_Trama::validar($texto, true);
    $comprobar($caso, !$r['ok'] && $r['receta'] === '', $r['ok'] ? 'PASÓ Y NO DEBÍA' : $r['errores'][0]);
}
$comprobar('un CT1 no se acepta como archivo de Medios (sólo JSON)', !COD_Trama::validar($ct1, true)['ok']);
$comprobar('un CT1 roto', !COD_Trama::validar('CT1.no-es-base64!!')['ok']);
$comprobar('un SP1 sin instante', !COD_Trama::validar('SP1.' . base64_encode('{"cfg":{}}'))['ok']);
$comprobar('un CT1 con un documento inválido adentro', !COD_Trama::validar('CT1.' . base64_encode('{"kind":"x"}'))['ok']);

echo "\n== al servir la página ==\n";
$carpeta = $raizSitio . '/wp-content/uploads/probar-trama';
@mkdir($carpeta, 0777, true);
file_put_contents($carpeta . '/buena.trama.json', $json($completa));
file_put_contents($carpeta . '/otro.json', '{"name":"x"}');
$url = '/wp-content/uploads/probar-trama/buena.trama.json';
$seccion = static fn (string $fuente): string => '<section class="s" data-cod-trama="" data-cod-trama-fuente="' . $fuente . '" data-cod-trama-modo="vivo"><h2>Título</h2></section>';

$html = COD_Trama::resolver_en_html($seccion($url));
$comprobar('un archivo válido se pone en línea junto al elemento', strpos($html, '<script type="application/json" data-cod-trama-receta>{') !== false);
$comprobar('el contenido de la sección sigue ahí', strpos($html, '<h2>Título</h2>') !== false);
$comprobar('resolver dos veces no duplica la receta', substr_count(COD_Trama::resolver_en_html($html), 'data-cod-trama-receta') === 1);
$comprobar('también con la URL completa del sitio', strpos(COD_Trama::resolver_en_html($seccion(rtrim(home_url('/'), '/') . $url)), 'data-cod-trama-receta') !== false);
foreach ([
    'un JSON que no es trama' => '/wp-content/uploads/probar-trama/otro.json',
    'un archivo que no existe' => '/wp-content/uploads/probar-trama/no-existe.json',
    'otro servidor' => 'https://malo.example/x.trama.json',
    'una ruta que se sale del sitio' => '/wp-content/uploads/../../../etc/passwd.json',
    'algo que no es .json' => '/wp-content/uploads/probar-trama/buena.trama.json.php',
] as $caso => $fuente) {
    $h = COD_Trama::resolver_en_html($seccion($fuente));
    $comprobar($caso . ': la sección queda sin trama y con su contenido',
        strpos($h, 'data-cod-trama-receta') === false && strpos($h, 'data-cod-trama-fuente') === false && strpos($h, '<h2>Título</h2>') !== false);
}
$sin = '<section data-cod-trama="CT1.abc"><p>x</p></section>';
$comprobar('una trama en línea (sin fuente) no se toca', COD_Trama::resolver_en_html($sin) === $sin);
$comprobar('hay_trama decide el encolado', COD_Trama::hay_trama($sin) && !COD_Trama::hay_trama('<section><p>x</p></section>'));

if ($conWordPress && class_exists('COD_Canvas_MCP_Recipe_Compiler')) {
    echo "\n== la regla trama del compilador MCP ==\n";
    $compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
    $compilar = static function (array $valor, string $kind = 'section') use ($compilador) {
        return $compilador->compile(
            ['schemaVersion' => 2, 'nodes' => [['id' => 'n', 'kind' => $kind, 'ruleIds' => ['t'], 'children' => []]]],
            ['schemaVersion' => 1, 'designId' => 'prueba-trama', 'expectedDesignRevision' => 0, 'reviewState' => 'session',
             'rules' => [['id' => 't', 'kind' => 'trama', 'scope' => ['breakpoint' => 'all', 'state' => 'default'],
                'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba de la trama.']]], 'status' => 'reviewed', 'value' => $valor]]]
        );
    };
    $cat = $compilador->capability_catalog();
    $comprobar('el catálogo publica el esquema de trama', isset($cat['designRuleSet']['ruleValueSchemas']['trama']['fields']['fuente']));
    $r = $compilar(['fuente' => $ct1, 'modo' => 'estatico', 'interaccion' => 'ninguna']);
    $html = is_wp_error($r) ? '' : wp_json_encode($r);
    $comprobar('un CT1 compila a atributos del nodo', !is_wp_error($r) && strpos($html, 'data-cod-trama-modo') !== false, is_wp_error($r) ? $r->get_error_message() : '');
    $r = $compilar(['fuente' => $url]);
    $comprobar('un archivo de Medios válido compila', !is_wp_error($r), is_wp_error($r) ? $r->get_error_message() : '');
    $r = $compilar(['fuente' => $ct1, 'variante' => 'oscura']);
    $comprobar('variante se rechaza explicando que es otro archivo', is_wp_error($r) && stripos($r->get_error_message(), 'otro archivo') !== false);
    $r = $compilar(['fuente' => '/wp-content/uploads/probar-trama/otro.json']);
    $comprobar('un JSON que no es trama se rechaza al compilar', is_wp_error($r));
    $r = $compilar(['fuente' => $ct1], 'paragraph');
    $comprobar('trama en un párrafo se rechaza', is_wp_error($r));
}

@unlink($carpeta . '/buena.trama.json');
@unlink($carpeta . '/otro.json');
@rmdir($carpeta);

echo "\n";
if ($fallas === 0) { echo "probar-trama.php   TODO OK\n"; exit(0); }
echo "probar-trama.php   $fallas falla(s)\n";
exit(1);
