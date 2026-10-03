<?php
/**
 * Iconos: un dibujo pequeño que acompaña a un texto.
 *
 * Lo que se comprueba, en orden de importancia:
 *  - UN ICONO NO SE DEFORMA. Es la decisión contraria a la del divisor y es la
 *    razón de que sean dos clases y no una: el divisor lleva
 *    preserveAspectRatio="none" porque estirarse es lo que se le pide; un
 *    icono estirado se lee como un error;
 *  - el documento guarda la RUTA, no el dibujo, igual que el divisor;
 *  - se limpia otra vez al inyectarlo;
 *  - el color se hereda del texto si no se declara, que es lo que hace que
 *    cambiar la tinta del sistema lo arrastre;
 *  - va donde se pidió: antes o después del contenido del nodo.
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

// Un icono de verdad en uploads: una flecha con trazo y sin relleno propio.
$subida = wp_upload_dir();
$carpeta = $subida['basedir'] . '/contope-pruebas';
wp_mkdir_p($carpeta);
$iconoRuta = $carpeta . '/flecha.svg';
file_put_contents($iconoRuta, '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    . '<path d="M4 12h14M13 6l6 6-6 6"/></svg>');
$marcaRuta = $carpeta . '/marca.svg';
file_put_contents($marcaRuta, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    . '<script>alert(1)</script><circle cx="12" cy="12" r="10" fill="#DC4017" onclick="alert(2)"/></svg>');
$rel = static fn (string $ruta): string => (string) parse_url(str_replace($subida['basedir'], $subida['baseurl'], $ruta), PHP_URL_PATH);
$flecha = $rel($iconoRuta);
$marca = $rel($marcaRuta);
register_shutdown_function(static function () use ($iconoRuta, $marcaRuta) {
    @unlink($iconoRuta);
    @unlink($marcaRuta);
});

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$regla = static function (array $valor): array {
    return [
        'id' => 'r-ico', 'kind' => 'icono',
        'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba de iconos.']]],
        'status' => 'reviewed', 'value' => $valor,
    ];
};
$diseno = static function (array $reglas): array {
    return ['schemaVersion' => 1, 'designId' => 'prueba-ico', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas];
};
$componer = static function (string $kind = 'button'): array {
    $contenido = $kind === 'button' || $kind === 'link'
        ? ['label' => 'Seguir', 'href' => 'https://econut.cl/']
        : ['text' => 'Seguir'];
    return ['schemaVersion' => 2, 'nodes' => [[
        'id' => 'b', 'kind' => $kind, 'ruleIds' => ['r-ico'], 'content' => $contenido,
    ]]];
};

echo "\n== el caso bueno ==\n";
$r = $compilador->compile($componer(), $diseno([$regla(['forma' => $flecha, 'tamano' => '1.25em', 'separacion' => '.4em'])]));
$comprobar('un icono con una forma del sitio compila', !is_wp_error($r), $mensaje($r));
if (is_wp_error($r)) { exit(1); }
$html = $r['storage']['markup'];
$comprobar('emite el marcador', strpos($html, 'class="cod-icono"') !== false);
$comprobar('guarda la RUTA, no el dibujo', strpos($html, $flecha) !== false && strpos($html, '<path') === false);
$comprobar('por omisión va antes del texto', strpos($html, 'data-cod-icono-donde="antes"') !== false);
$comprobar('lleva el tamaño como variable', strpos($html, '--cod-icono-tamano:1.25em') !== false);
$comprobar('y la separación', strpos($html, '--cod-icono-separacion:.4em') !== false);
$comprobar('va DENTRO del nodo, no fuera', strpos($html, '><span class="cod-icono"') !== false);
$comprobar('antes del texto en el marcado', strpos($html, 'cod-icono') < strpos($html, 'Seguir'));

$r2 = $compilador->compile($componer(), $diseno([$regla(['forma' => $flecha, 'donde' => 'despues'])]));
$html2 = is_wp_error($r2) ? '' : $r2['storage']['markup'];
$comprobar('«después» lo pone al final', strpos($html2, 'Seguir') < strpos($html2, 'cod-icono'));
$comprobar('  y sigue dentro del nodo', substr_count($html2, "</a>") === 1 && strpos($html2, "</span></a>") !== false);

echo "\n== el dibujo se pone al MOSTRAR, no al componer ==\n";
$servido = COD_Icono::resolver_en_html($html);
$comprobar('aparece el svg', strpos($servido, '<svg') !== false);
$comprobar('con su trazo', strpos($servido, '<path') !== false);
$comprobar('sin la declaración XML', strpos($servido, '<?xml') === false);
$comprobar('no se anuncia a un lector de pantalla', strpos($servido, 'aria-hidden="true"') !== false);

/**
 * La comprobación que justifica que ésta sea una clase aparte y no el divisor
 * con otro nombre.
 */
echo "\n== un icono NO se deforma, al revés que un divisor ==\n";
$comprobar('no lleva preserveAspectRatio="none"', strpos($servido, 'preserveAspectRatio="none"') === false);
$comprobar('y el divisor sí lo lleva, que es lo contrario a propósito',
    strpos(COD_Divisor::svg_de($flecha), 'preserveAspectRatio="none"') !== false);

echo "\n== el color ==\n";
$comprobar('sin declararlo, lo hereda del texto', strpos($servido, 'fill="currentColor"') !== false);
$conMarca = COD_Icono::svg_de($marca);
$comprobar('pero un dibujo con relleno propio conserva el suyo',
    strpos($conMarca, 'fill="currentColor"') === false && strpos($conMarca, '#DC4017') !== false);
$r3 = $compilador->compile($componer(), $diseno([$regla(['forma' => $flecha, 'color' => '#2E594A'])]));
$comprobar('declarado, se escribe en el marcador',
    !is_wp_error($r3) && strpos($r3['storage']['markup'], 'color:#2E594A') !== false, $mensaje($r3));

echo "\n== se limpia OTRA VEZ al inyectarlo ==\n";
$comprobar('fuera el script', strpos($conMarca, '<script') === false);
$comprobar('fuera el manejador de clic', stripos($conMarca, 'onclick') === false);
$comprobar('pero el dibujo llega', strpos($conMarca, '<circle') !== false);

echo "\n== lo que se rechaza ==\n";
foreach ([
    'forma de otro servidor' => ['forma' => 'https://otro.cl/x.svg'],
    'forma que sube de carpeta' => ['forma' => '/wp-content/../../x.svg'],
    'un PNG' => ['forma' => '/wp-content/uploads/foto.png'],
    'sin forma' => ['donde' => 'antes'],
    'donde inventado' => ['forma' => $flecha, 'donde' => 'encima'],
    'tamaño inseguro' => ['forma' => $flecha, 'tamano' => 'url(x)'],
    'color inseguro' => ['forma' => $flecha, 'color' => 'expression(1)'],
    'clave inventada' => ['forma' => $flecha, 'girar' => '90deg'],
] as $nombre => $malo) {
    $rr = $compilador->compile($componer(), $diseno([$regla($malo)]));
    $comprobar("rechaza $nombre", is_wp_error($rr));
}

$dos = [$regla(['forma' => $flecha]), array_merge($regla(['forma' => $flecha, 'donde' => 'despues']), ['id' => 'r-ico2'])];
$comp = $componer();
$comp['nodes'][0]['ruleIds'] = ['r-ico', 'r-ico2'];
$rr = $compilador->compile($comp, $diseno($dos));
$comprobar('rechaza dos iconos en un nodo', is_wp_error($rr), $mensaje($rr));

echo "\n== el CSS ==\n";
$css = COD_Icono::css($html);
$comprobar('sale sólo si hay icono en la página', COD_Icono::css('<div>nada</div>') === '');
$comprobar('no empuja la línea de texto', strpos($css, 'vertical-align') !== false);
$comprobar('se separa del texto según dónde esté',
    strpos($css, 'margin-inline-end') !== false && strpos($css, 'margin-inline-start') !== false);
$comprobar('no fija colores de marca', stripos($css, '#') === false);

echo "\n== el saneador del documento lo deja pasar ==\n";
$limpio = (new COD_Canvas_Document_Sanitizer())->sanitize_html($html);
$comprobar('conserva el marcador', is_string($limpio) && strpos($limpio, COD_Icono::ATRIBUTO_FORMA) !== false,
    is_wp_error($limpio) ? $limpio->get_error_message() : '');

echo "\n== el catálogo lo declara ==\n";
$cat = COD_Catalogo::todo();
$comprobar('la familia existe', isset($cat['familias']['icono']));
$comprobar('con su clase de regla', ($cat['familias']['icono']['kind'] ?? '') === 'icono');
$comprobar('la forma es un recurso, no una lista cerrada', ($cat['familias']['icono']['propiedades']['forma']['control'] ?? '') === 'recurso');
$comprobar('se le ofrece a un botón', in_array('icono', $cat['taxonomias']['button']['diseno'] ?? [], true));
$comprobar('y a un enlace', in_array('icono', $cat['taxonomias']['link']['diseno'] ?? [], true));

echo "\n";
if ($fallas === 0) { echo "probar-icono.php   TODO OK\n"; exit(0); }
echo "probar-icono.php   $fallas falla(s)\n";
exit(1);
