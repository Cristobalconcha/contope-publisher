<?php
/**
 * Una barra que pide quedarse pegada, se queda pegada.
 *
 * DE DÓNDE SALE. El 4 de octubre de 2026, al componer la barra de navegación de
 * Santa Luisa, aparecieron DOS defectos que fallaban de la peor manera posible:
 * sin error en ninguna parte, con la regla guardada, aplicada por el navegador y
 * visible en la evidencia, y el resultado en pantalla equivocado igual.
 *
 *  1. `surface` emitía `position:relative` SIEMPRE, con la misma especificidad
 *     que el resto de la regla. Una barra con un fondo y una posición pegada
 *     tenía las dos reglas correctas y computaba `relative`. Ahora esa posición
 *     sale envuelta en `:where()`, con especificidad cero, así que la que
 *     declare el nodo gana y lo que ya dependía de ella la sigue teniendo.
 *
 *  2. El plugin envuelve cada región en DOS cajas —`.cod-canvas-region` y, dentro,
 *     `.cod-mcp-page`—, y las dos miden lo que mide su contenido. Un elemento con
 *     `position:sticky` sólo puede viajar dentro de su contenedor, así que
 *     encerrado en una caja de su propio alto no tiene por dónde viajar: computa
 *     `sticky` y se va con la página. Ahora, cuando la raíz de una composición
 *     pide `sticky` o `fixed`, el compilador saca los dos envoltorios del árbol
 *     de cajas con `display:contents`, apuntándoles con `:has()` al nodo concreto
 *     para no tocar las regiones de las demás páginas.
 *
 * La primera versión del arreglo apuntaba con `:has(> …)` sólo al envoltorio de
 * afuera, cuyo hijo directo es el `main` y no el nodo: no alcanzaba a nada y la
 * barra seguía yéndose. De ahí que esta prueba mire los DOS selectores por
 * separado y no se conforme con que exista `display:contents`.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local ni contra el
 * sitio de un cliente.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

/**
 * Una composición mínima: una barra que pide fondo y posición pegada.
 */
$receta = static function (string $position): array {
    return [
        'design' => [
            'schemaVersion' => 1,
            'designId' => 'prueba-barra-pegada',
            'expectedDesignRevision' => 0,
            'reviewState' => 'session',
            'rules' => [
                ['id' => 'b-pos', 'kind' => 'properties', 'scope' => ['breakpoint' => 'all', 'state' => 'default'], 'provenance' => ['sources' => [['kind' => 'reference', 'reference' => 'prueba', 'rationale' => 'Fija el defecto del sticky ahogado.']]], 'status' => 'reviewed', 'value' => ['declarations' => ['position' => $position, 'top' => '0px']]],
                ['id' => 'b-fondo', 'kind' => 'surface', 'scope' => ['breakpoint' => 'all', 'state' => 'default'], 'provenance' => ['sources' => [['kind' => 'reference', 'reference' => 'prueba', 'rationale' => 'Fija el defecto del sticky ahogado.']]], 'status' => 'reviewed', 'value' => ['backgroundColor' => '#ffffff']],
            ],
        ],
        'composition' => [
            'schemaVersion' => 2,
            'label' => 'Barra de prueba',
            'nodes' => [[
                'id' => 'barra', 'kind' => 'header', 'ruleIds' => ['b-pos', 'b-fondo'],
                'children' => [['id' => 'barra-texto', 'kind' => 'paragraph', 'ruleIds' => [], 'content' => ['text' => 'Marca']]],
            ]],
        ],
    ];
};

$compilar = static function (array $r) use ($compilador) {
    $salida = $compilador->compile($r['composition'], $r['design']);
    if (is_wp_error($salida)) {
        echo '  FALLA  no compiló: ' . $salida->get_error_message() . "\n";
        exit(1);
    }
    return (string) ($salida['storage']['styles'] ?? '');
};

echo "\n== la superficie no pisa la posición ==\n";
$css = $compilar($receta('sticky'));

$comprobar('la posición de la superficie sale con :where()',
    str_contains($css, ':where(.cod-rule--b-fondo){position:relative;}'),
    str_contains($css, ':where(.cod-rule--b-fondo){position:relative;}') ? '' : 'no está');
$comprobar('y NO dentro del cuerpo de la regla, donde pisaría',
    !preg_match('/\.cod-rule--b-fondo\{[^}]*position:relative/', $css),
    preg_match('/\.cod-rule--b-fondo\{([^}]*)\}/', $css, $m) ? 'cuerpo: ' . substr($m[1], 0, 90) : '');
$comprobar('la superficie sigue pintando su fondo',
    (bool) preg_match('/\.cod-rule--b-fondo\{[^}]*background-color:#ffffff/', $css));
$comprobar('y el sticky del nodo está ahí',
    (bool) preg_match('/\.cod-rule--b-pos\{[^}]*position:sticky/', $css));

echo "\n== y los dos envoltorios se neutralizan ==\n";
/*
 * Los dos, por separado y con el selector que de verdad alcanza a cada uno: el
 * de afuera por descendiente (su hijo directo es el main) y el de adentro por
 * hijo directo. Con uno solo, la barra se sigue yendo.
 */
$comprobar('el envoltorio de la región, por descendiente',
    str_contains($css, '.cod-canvas-region:has([data-cod-node="barra"]){display:contents;}'));
$comprobar('el main de adentro, por hijo directo',
    str_contains($css, '.cod-mcp-page:has(> [data-cod-node="barra"]){display:contents;}'));
$comprobar('apuntan al NODO y no a la clase de la región',
    !preg_match('/\.cod-canvas-region\{/', $css),
    'neutralizar la clase a secas cambiaría el pie y las regiones de las demás páginas');

echo "\n== fixed también lo necesita ==\n";
$comprobar('una raíz fixed destraba igual',
    str_contains($compilar($receta('fixed')), '.cod-mcp-page:has(> [data-cod-node="barra"]){display:contents;}'));

echo "\n== y una barra que NO lo pide no se toca ==\n";
/*
 * Lo importante del arreglo es que no se desborde. Una región normal —sin
 * posición pegada— tiene que seguir dentro de sus cajas: sacarla del árbol
 * cambiaría la maquetación de cualquier encabezado o pie que ya exista.
 */
$quieta = $receta('static');
$cssQuieta = $compilar($quieta);
$comprobar('sin sticky ni fixed, ningún display:contents',
    !str_contains($cssQuieta, 'display:contents'),
    str_contains($cssQuieta, 'display:contents') ? 'lo emitió y no debería' : '');

echo "\n== un sticky anidado no destraba nada ==\n";
/*
 * Un sticky DENTRO de una sección viaja dentro de ella, que es su
 * comportamiento correcto. Sólo la raíz está ahogada por los envoltorios de la
 * región, así que sólo la raíz se mira.
 */
$anidado = $receta('static');
$anidado['design']['rules'][] = ['id' => 'hijo-pos', 'kind' => 'properties', 'scope' => ['breakpoint' => 'all', 'state' => 'default'], 'provenance' => ['sources' => [['kind' => 'reference', 'reference' => 'prueba', 'rationale' => 'Fija el defecto del sticky ahogado.']]], 'status' => 'reviewed', 'value' => ['declarations' => ['position' => 'sticky', 'top' => '0px']]];
$anidado['composition']['nodes'][0]['children'][0]['ruleIds'] = ['hijo-pos'];
$comprobar('un hijo sticky no saca la región del árbol',
    !str_contains($compilar($anidado), 'display:contents'));

echo "\n" . ($fallas === 0 ? "todo en orden\n" : "$fallas fallas\n");
exit($fallas === 0 ? 0 : 1);
