<?php
/**
 * Posición, desborde y transformación: las tres familias que Divi reparte
 * entre su pestaña «Avanzado» y su subsistema de sticky, y que acá son lo que
 * son —propiedades visuales del objeto, en diseño—.
 *
 * Lo que se comprueba, en orden de importancia:
 *  - una posición pegada dentro de un contenedor que RECORTA se rechaza al
 *    componer, nombrando los dos nodos: es el motivo número uno de «el sticky
 *    no funciona» y la causa está siempre en un antepasado, no donde se mira;
 *  - `pegada` sin distancia se resuelve sola, porque sin distancia no se pega
 *    nunca y parece que la propiedad estuviera rota;
 *  - una transformación con `state: hover` sale gratis de que cualquier regla
 *    tenga alcance: Divi necesita para eso un subsistema aparte;
 *  - el orden de `transform` no es arbitrario: mover y después girar no es lo
 *    mismo que girar y después mover.
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

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$regla = static function (string $id, string $kind, array $valor, string $state = 'default'): array {
    return [
        'id' => $id, 'kind' => $kind,
        'scope' => ['breakpoint' => 'all', 'state' => $state],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba de posición.']]],
        'status' => 'reviewed', 'value' => $valor,
    ];
};
$diseno = static function (array $reglas): array {
    return ['schemaVersion' => 1, 'designId' => 'prueba-pos', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas];
};
/** Un contenedor con un hijo; cada uno recibe las reglas que se le pasen. */
$componer = static function (array $deFuera = [], array $deDentro = []): array {
    return ['schemaVersion' => 2, 'nodes' => [[
        'id' => 'caja', 'kind' => 'section', 'ruleIds' => $deFuera, 'children' => [
            ['id' => 'pieza', 'kind' => 'group', 'ruleIds' => $deDentro, 'children' => [
                ['id' => 'p', 'kind' => 'paragraph', 'content' => ['text' => 'Contenido']],
            ]],
        ],
    ]]];
};
$css = static fn ($r): string => is_wp_error($r) ? '' : ($r['storage']['styles'] ?? $r['storage']['css'] ?? '');

echo "\n== posición ==\n";
$r = $compilador->compile($componer([], ['r-pos']), $diseno([
    $regla('r-pos', 'posicion', ['modo' => 'absoluta', 'arriba' => '-24px', 'derecha' => '0px', 'capa' => 3]),
]));
$comprobar('compila', !is_wp_error($r), $mensaje($r));
$hoja = $css($r);
$comprobar('  escribe la posición', strpos($hoja, 'position:absolute') !== false);
$comprobar('  admite una distancia negativa, para asomar fuera de la caja', strpos($hoja, 'top:-24px') !== false);
$comprobar('  y el orden de capas', strpos($hoja, 'z-index:3') !== false);

$r = $compilador->compile($componer([], ['r-pos']), $diseno([$regla('r-pos', 'posicion', ['modo' => 'pegada'])]));
$comprobar('una pegada sin distancia se resuelve sola', !is_wp_error($r) && strpos($css($r), 'top:0px') !== false, $mensaje($r));
$comprobar('  y queda pegada de verdad', strpos($css($r), 'position:sticky') !== false);

foreach ([
    'modo inventado'            => ['modo' => 'flotante'],
    'distancia insegura'        => ['modo' => 'absoluta', 'arriba' => 'calc(url(x))'],
    'capa desmesurada'          => ['capa' => 9999],
    'capa con decimales'        => ['capa' => 1.5],
    'clave inventada'           => ['modo' => 'fija', 'profundidad' => '2'],
    'una regla vacía'           => [],
    'distancias en modo normal' => ['modo' => 'normal', 'arriba' => '10px'],
] as $nombre => $malo) {
    $rr = $compilador->compile($componer([], ['r-pos']), $diseno([$regla('r-pos', 'posicion', $malo)]));
    $comprobar("rechaza $nombre", is_wp_error($rr));
}

echo "\n== desborde ==\n";
$r = $compilador->compile($componer(['r-des'], []), $diseno([
    $regla('r-des', 'desborde', ['horizontal' => 'oculto', 'vertical' => 'auto']),
]));
$comprobar('compila', !is_wp_error($r), $mensaje($r));
$comprobar('  recorta a lo ancho', strpos($css($r), 'overflow-x:hidden') !== false);
$comprobar('  y deja desplazar a lo alto', strpos($css($r), 'overflow-y:auto') !== false);

foreach ([
    'valor inventado' => ['horizontal' => 'recortado'],
    'eje inventado'   => ['diagonal' => 'oculto'],
    'regla vacía'     => [],
] as $nombre => $malo) {
    $rr = $compilador->compile($componer(['r-des'], []), $diseno([$regla('r-des', 'desborde', $malo)]));
    $comprobar("rechaza $nombre", is_wp_error($rr));
}

/**
 * La comprobación que justifica construir las dos familias juntas. Un sticky
 * dentro de algo que recorta no se pega y el navegador no avisa: la pieza
 * simplemente se queda quieta. Se pierden horas mirando el elemento pegado,
 * cuando la causa está en un antepasado.
 */
echo "\n== una pegada dentro de algo que recorta ==\n";
$rr = $compilador->compile(
    $componer(['r-des'], ['r-pos']),
    $diseno([
        $regla('r-des', 'desborde', ['vertical' => 'oculto']),
        $regla('r-pos', 'posicion', ['modo' => 'pegada', 'arriba' => '16px']),
    ])
);
$comprobar('se rechaza al componer', is_wp_error($rr));
$comprobar('  nombrando el nodo pegado', strpos($mensaje($rr), '"pieza"') !== false, $mensaje($rr));
$comprobar('  y el que lo recorta, que es donde está la causa', strpos($mensaje($rr), '"caja"') !== false);

$ok = $compilador->compile(
    $componer([], ['r-des', 'r-pos']),
    $diseno([
        $regla('r-des', 'desborde', ['vertical' => 'oculto']),
        $regla('r-pos', 'posicion', ['modo' => 'pegada', 'arriba' => '16px']),
    ])
);
$comprobar('pero recortarse a SÍ MISMO no estorba: lo que impide pegarse es un antepasado',
    !is_wp_error($ok), $mensaje($ok));

$ok2 = $compilador->compile(
    $componer(['r-des'], ['r-pos']),
    $diseno([
        $regla('r-des', 'desborde', ['vertical' => 'auto']),
        $regla('r-pos', 'posicion', ['modo' => 'pegada']),
    ])
);
$comprobar('y un contenedor que deja desplazar tampoco', !is_wp_error($ok2), $mensaje($ok2));

echo "\n== transformación ==\n";
$r = $compilador->compile($componer([], ['r-tr']), $diseno([
    $regla('r-tr', 'transformacion', ['moverX' => '-12px', 'rotar' => '-6deg', 'escalar' => 1.05, 'origen' => 'left center']),
]));
$comprobar('compila', !is_wp_error($r), $mensaje($r));
$hoja = $r ? $css($r) : '';
$comprobar('  mueve antes de girar, que es lo que casi siempre se quiere',
    preg_match('/transform:translate\([^)]*\) rotate\([^)]*\) scale\([^)]*\)/', $hoja) === 1);
$comprobar('  rellena el eje que no se declaró', strpos($hoja, 'translate(-12px,0px)') !== false);
$comprobar('  escribe el número sin ceros de relleno', strpos($hoja, 'scale(1.05)') !== false);
$comprobar('  y el origen, que decide si gira o da un volantín', strpos($hoja, 'transform-origin:left center') !== false);

/**
 * Lo mejor de que sea una regla y no un efecto: el hover no necesita nada
 * nuevo. Divi, en cambio, declara un gemelo de hover por cada campo
 * transformable.
 */
$r = $compilador->compile($componer([], ['r-tr', 'r-tr-h']), $diseno([
    $regla('r-tr', 'transformacion', ['escalar' => 1]),
    $regla('r-tr-h', 'transformacion', ['escalar' => 1.04], 'hover'),
]));
$comprobar('el hover sale gratis del alcance de la regla', !is_wp_error($r), $mensaje($r));
$comprobar('  y se escribe como tal', strpos($css($r), ':hover') !== false);

foreach ([
    'ángulo sin unidad'       => ['rotar' => '15'],
    'escala desmesurada'      => ['escalar' => 40],
    'escala negativa'         => ['escalar' => -1],
    'escalar junto a escalarX' => ['escalar' => 1.1, 'escalarX' => 2],
    'origen con una función'  => ['rotar' => '5deg', 'origen' => 'url(x)'],
    'medida insegura'         => ['moverX' => 'expression(1)'],
    'clave inventada'         => ['voltear' => true],
    'regla vacía'             => [],
] as $nombre => $malo) {
    $rr = $compilador->compile($componer([], ['r-tr']), $diseno([$regla('r-tr', 'transformacion', $malo)]));
    $comprobar("rechaza $nombre", is_wp_error($rr));
}

echo "\n== el catálogo las declara ==\n";
$cat = COD_Catalogo::todo();
foreach (['posicion' => 'posicion', 'desborde' => 'desborde', 'transformacion' => 'transformacion'] as $familia => $kind) {
    $comprobar("la familia $familia existe", isset($cat['familias'][$familia]));
    $comprobar("  con su clase de regla propia, ya no por properties", ($cat['familias'][$familia]['kind'] ?? '') === $kind);
}
$comprobar('se le ofrecen a una sección',
    count(array_intersect(['posicion', 'desborde', 'transformacion'], $cat['taxonomias']['section']['diseno'] ?? [])) === 3);

/**
 * El contrato del catálogo: propone, no prohíbe. Una taxonomía a la que el
 * panel no le ofrece una familia tiene que poder usarla igual, porque «el
 * diseño funciona sobre la base de excepciones».
 */
echo "\n== propone, no prohíbe ==\n";
$rr = $compilador->compile(
    ['schemaVersion' => 2, 'nodes' => [['id' => 'h', 'kind' => 'heading', 'ruleIds' => ['r-tr'], 'content' => ['text' => 'Título', 'level' => 2]]]],
    $diseno([$regla('r-tr', 'transformacion', ['rotar' => '-2deg'])])
);
$comprobar('un título girado SE PUEDE componer aunque el panel no lo ofrezca', !is_wp_error($rr), $mensaje($rr));

echo "\n";
if ($fallas === 0) { echo "probar-posicion.php   TODO OK\n"; exit(0); }
echo "probar-posicion.php   $fallas falla(s)\n";
exit(1);
