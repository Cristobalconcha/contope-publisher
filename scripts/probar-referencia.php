<?php
/**
 * Verifica el referenciado por id y la medida de aterrizaje:
 *  - un nodo con referenceId emite id="..." en el HTML publicado
 *  - spacing.landing emite scroll-margin-block-start en el CSS
 *  - dos nodos con el mismo referenceId son rechazados
 *  - el saneador de Canvas no descarta ninguna de las dos cosas
 *
 * Corre contra el WordPress local, que ya tiene el plugin cargado: hay que
 * sincronizar repo -> wp-local antes, nunca al revés.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$diseno = [
    'schemaVersion' => 1,
    'designId' => 'prueba-referencia',
    'expectedDesignRevision' => 0,
    'reviewState' => 'session',
    'rules' => [[
        'id' => 'aterrizaje-bajo-header',
        'kind' => 'spacing',
        'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Alto del header fijo del sitio.']]],
        'status' => 'reviewed',
        'value' => ['landing' => '96px', 'paddingBlock' => '48px'],
    ]],
];

$composicion = function (string $ref1, string $ref2): array {
    return ['schemaVersion' => 2, 'nodes' => [
        ['id' => 'seccion-plano', 'kind' => 'section', 'referenceId' => $ref1,
         'ruleIds' => ['aterrizaje-bajo-header'], 'children' => [
            ['id' => 'titulo-plano', 'kind' => 'heading', 'content' => ['level' => 2, 'text' => 'Plano de loteo']],
        ]],
        ['id' => 'seccion-ubicacion', 'kind' => 'section', 'referenceId' => $ref2,
         'ruleIds' => ['aterrizaje-bajo-header'], 'children' => [
            ['id' => 'titulo-ubicacion', 'kind' => 'heading', 'content' => ['level' => 2, 'text' => 'Ubicacion']],
        ]],
    ]];
};

$fallas = 0;
$comprobar = function (string $caso, bool $ok) use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . "\n";
    if (!$ok) { $fallas++; }
};

echo "\n== caso normal: dos destinos distintos ==\n";
$r = $compilador->compile($composicion('plano', 'ubicacion'), $diseno);
if (is_wp_error($r)) {
    echo '  FALLA  el compilador rechazo una composicion valida: ' . $r->get_error_message() . "\n";
    $fallas++;
} else {
    $html = $r['storage']['markup'];
    $css = str_replace(' ', '', $r['storage']['styles']);
    $comprobar('el HTML trae id="plano"', strpos($html, 'id="plano"') !== false);
    $comprobar('el HTML trae id="ubicacion"', strpos($html, 'id="ubicacion"') !== false);
    $comprobar('el CSS trae scroll-margin-block-start:96px', strpos($css, 'scroll-margin-block-start:96px') !== false);
    $comprobar('sigue emitiendo el padding de la misma regla', strpos($css, 'padding-block:48px') !== false);
    $comprobar('la composicion declara los referenceIds', ($r['compositionSnapshot']['referenceIds'] ?? []) === ['plano', 'ubicacion']);
}

echo "\n== id repetido: tiene que ser rechazado ==\n";
$r2 = $compilador->compile($composicion('plano', 'plano'), $diseno);
$comprobar('dos nodos con el mismo referenceId dan error',
    is_wp_error($r2) && $r2->get_error_code() === 'cod_mcp_composition_reference_duplicate');

echo "\n== id invalido: tiene que ser rechazado ==\n";
$r3 = $compilador->compile($composicion('con espacio', 'ubicacion'), $diseno);
$comprobar('un referenceId con espacios da error', is_wp_error($r3));

echo "\n== sin referenceId: nada cambia ==\n";
$sin = ['schemaVersion' => 2, 'nodes' => [
    ['id' => 'seccion-suelta', 'kind' => 'section', 'children' => [
        ['id' => 'titulo-suelto', 'kind' => 'heading', 'content' => ['level' => 2, 'text' => 'Hola']],
    ]],
]];
$r4 = $compilador->compile($sin, $diseno);
$comprobar('compila igual que antes', !is_wp_error($r4));
if (!is_wp_error($r4)) {
    $comprobar('no inventa ningun id', strpos($r4['storage']['markup'], ' id="') === false);
}

echo "\n" . ($fallas === 0 ? "todo en orden\n" : $fallas . " comprobaciones fallaron\n");
exit($fallas === 0 ? 0 : 1);
