<?php
/**
 * Divisores: el borde no recto entre una sección y la siguiente.
 *
 * Lo que se comprueba, en orden de importancia:
 *  - la forma es un recurso DEL SITIO y no una lista cerrada (la diferencia
 *    con Divi, que trae 27 y ahí se acaba);
 *  - el documento guarda la RUTA, no el dibujo: reemplazar el archivo llega a
 *    todas las páginas sin recomponer;
 *  - el SVG se limpia otra vez al inyectarlo, aunque ya se hubiera limpiado al
 *    subirlo: un archivo puede haber llegado a uploads por FTP o por una
 *    migración sin pasar nunca por nuestra subida;
 *  - una forma de otro servidor se rechaza nombrando el porqué;
 *  - el color se hereda, que es lo que permite recolorearlo.
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

// Una forma de verdad en uploads, para no probar contra un archivo imaginario.
$subida = wp_upload_dir();
$carpeta = $subida['basedir'] . '/contope-pruebas';
wp_mkdir_p($carpeta);
$ondaRuta = $carpeta . '/onda.svg';
file_put_contents($ondaRuta, '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 80">'
    . '<path d="M0 40 Q 300 0 600 40 T 1200 40 V80 H0 Z"/></svg>');
$maloRuta = $carpeta . '/con-guion.svg';
file_put_contents($maloRuta, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
    . '<script>alert(1)</script><path d="M0 0h10v10H0z" onclick="alert(2)"/></svg>');
$ondaUrl = str_replace($subida['basedir'], $subida['baseurl'], $ondaRuta);
$ondaRel = (string) parse_url($ondaUrl, PHP_URL_PATH);
$maloRel = (string) parse_url(str_replace($subida['basedir'], $subida['baseurl'], $maloRuta), PHP_URL_PATH);
register_shutdown_function(static function () use ($ondaRuta, $maloRuta) {
    @unlink($ondaRuta);
    @unlink($maloRuta);
});

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$regla = static function (array $valor): array {
    return [
        'id' => 'r-div', 'kind' => 'divisor',
        'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba de divisores.']]],
        'status' => 'reviewed', 'value' => $valor,
    ];
};
$componer = static function (array $reglaIds = ['r-div']): array {
    return ['schemaVersion' => 2, 'nodes' => [['id' => 'sec', 'kind' => 'section', 'children' => [
        ['id' => 'g', 'kind' => 'group', 'ruleIds' => $reglaIds, 'children' => [
            ['id' => 'p', 'kind' => 'paragraph', 'content' => ['text' => 'Contenido']],
        ]],
    ]]]];
};
$diseno = static function (array $reglas): array {
    return ['schemaVersion' => 1, 'designId' => 'prueba-div', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas];
};

echo "\n== el caso bueno ==\n";
$r = $compilador->compile($componer(), $diseno([$regla(['forma' => $ondaRel, 'alto' => '80px'])]));
$comprobar('un divisor con una forma del sitio compila', !is_wp_error($r), $mensaje($r));
if (is_wp_error($r)) { exit(1); }
$html = $r['storage']['markup'];
$comprobar('emite el marcador', strpos($html, 'class="cod-divisor"') !== false);
$comprobar('guarda la RUTA, no el dibujo', strpos($html, $ondaRel) !== false && strpos($html, '<path') === false);
$comprobar('por omisión va abajo', strpos($html, 'data-cod-divisor-donde="abajo"') !== false);
$comprobar('lleva el alto como variable', strpos($html, '--cod-divisor-alto:80px') !== false);

echo "\n== el dibujo se pone al MOSTRAR, no al componer ==\n";
$servido = COD_Divisor::resolver_en_html($html);
$comprobar('aparece el svg', strpos($servido, '<svg') !== false);
$comprobar('con su trazo', strpos($servido, '<path') !== false);
$comprobar('hereda el color', strpos($servido, 'fill="currentColor"') !== false);
$comprobar('se estira a lo ancho', strpos($servido, 'preserveAspectRatio="none"') !== false);
$comprobar('sin la declaración XML', strpos($servido, '<?xml') === false);
$comprobar('no se anuncia a un lector de pantalla', strpos($servido, 'aria-hidden="true"') !== false);

echo "\n== se limpia OTRA VEZ al inyectarlo ==\n";
// Aunque COD_SVG lo limpie al subir, un archivo puede llegar a uploads por FTP.
$r2 = $compilador->compile($componer(), $diseno([$regla(['forma' => $maloRel])]));
$comprobar('un svg con guion compila (la ruta es válida)', !is_wp_error($r2), $mensaje($r2));
$servido2 = COD_Divisor::resolver_en_html(is_wp_error($r2) ? '' : $r2['storage']['markup']);
$comprobar('pero el <script> NO llega a la página', stripos($servido2, '<script') === false);
$comprobar('ni el onclick', stripos($servido2, 'onclick') === false);
$comprobar('y el dibujo sí se conserva', strpos($servido2, '<path') !== false);

echo "\n== una forma que no es del sitio se rechaza ==\n";
foreach ([
    'otro servidor (https)' => 'https://ajeno.example/onda.svg',
    'otro servidor (//)'    => '//ajeno.example/onda.svg',
    'subir de carpeta'      => '/wp-content/uploads/../../../etc/passwd.svg',
] as $nombre => $mala) {
    $rr = $compilador->compile($componer(), $diseno([$regla(['forma' => $mala])]));
    $comprobar("rechaza $nombre", is_wp_error($rr));
}
$rr = $compilador->compile($componer(), $diseno([$regla(['forma' => 'https://ajeno.example/onda.svg'])]));
$comprobar('  y explica por qué', strpos($mensaje($rr), 'propio sitio') !== false);

echo "\n== lo que no es un SVG tampoco ==\n";
$rr = $compilador->compile($componer(), $diseno([$regla(['forma' => '/wp-content/uploads/foto.png'])]));
$comprobar('rechaza un PNG', is_wp_error($rr));
$comprobar('  diciendo que tiene que ser .svg', strpos($mensaje($rr), '.svg') !== false);

echo "\n== los controles ==\n";
$r3 = $compilador->compile($componer(), $diseno([$regla([
    'forma' => $ondaRel, 'donde' => 'ambos', 'alto' => '120px', 'repeticion' => 3, 'voltear' => true,
])]));
$comprobar('«ambos» compila', !is_wp_error($r3), $mensaje($r3));
$h3 = is_wp_error($r3) ? '' : $r3['storage']['markup'];
$comprobar('  dibuja dos piezas', substr_count($h3, 'class="cod-divisor"') === 2);
$comprobar('  una arriba y una abajo', strpos($h3, 'donde="arriba"') !== false && strpos($h3, 'donde="abajo"') !== false);
$comprobar('  con la repetición', strpos($h3, '--cod-divisor-repeticion:3') !== false);
$comprobar('  y volteado', strpos($h3, 'data-cod-divisor-voltear="1"') !== false);

foreach ([
    'donde inventado'      => ['forma' => $ondaRel, 'donde' => 'al-medio'],
    'repetición de cero'   => ['forma' => $ondaRel, 'repeticion' => 0],
    'repetición de 99'     => ['forma' => $ondaRel, 'repeticion' => 99],
    'voltear con un texto' => ['forma' => $ondaRel, 'voltear' => 'si'],
    'alto inseguro'        => ['forma' => $ondaRel, 'alto' => 'calc(100% + url(x))'],
    'clave inventada'      => ['forma' => $ondaRel, 'brillo' => '2'],
    'sin forma'            => ['donde' => 'abajo'],
] as $nombre => $malo) {
    $rr = $compilador->compile($componer(), $diseno([$regla($malo)]));
    $comprobar("rechaza $nombre", is_wp_error($rr));
}

echo "\n== dos divisores en un nodo ==\n";
$dos = [$regla(['forma' => $ondaRel]), array_merge($regla(['forma' => $ondaRel, 'donde' => 'arriba']), ['id' => 'r-div2'])];
$rr = $compilador->compile($componer(['r-div', 'r-div2']), $diseno($dos));
$comprobar('se rechaza y manda a usar «ambos»', is_wp_error($rr) && strpos($mensaje($rr), 'ambos') !== false, $mensaje($rr));

echo "\n== el CSS ==\n";
$css = COD_Divisor::css($html);
$comprobar('sale sólo si hay divisor en la página', COD_Divisor::css('<div>nada</div>') === '');
$comprobar('no empuja el contenido', strpos($css, 'position:absolute') !== false);
$comprobar('no se come los clics', strpos($css, 'pointer-events:none') !== false);
$comprobar('el de arriba va espejado', strpos($css, 'scaleY(-1)') !== false);
$comprobar('no fija colores de marca', stripos($css, '#') === false);

echo "\n== el saneador del documento lo deja pasar ==\n";
$limpio = (new COD_Canvas_Document_Sanitizer())->sanitize_html($html);
$comprobar('conserva el marcador', is_string($limpio) && strpos($limpio, COD_Divisor::ATRIBUTO_FORMA) !== false,
    is_wp_error($limpio) ? $limpio->get_error_message() : '');

echo "\n== el catálogo lo declara ==\n";
$cat = COD_Catalogo::todo();
$comprobar('la familia existe', isset($cat['familias']['divisor']));
$comprobar('con su clase de regla', ($cat['familias']['divisor']['kind'] ?? '') === 'divisor');
$comprobar('la forma es un recurso, no una lista', ($cat['familias']['divisor']['propiedades']['forma']['control'] ?? '') === 'recurso');
$comprobar('se le ofrece a una sección', in_array('divisor', $cat['taxonomias']['section']['diseno'] ?? [], true));

echo "\n";
if ($fallas === 0) { echo "probar-divisor.php   TODO OK\n"; exit(0); }
echo "probar-divisor.php   $fallas falla(s)\n";
exit(1);
