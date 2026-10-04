<?php
/**
 * Lo que el constructor PUBLICA como posible es lo que de verdad acepta.
 *
 * DE DÓNDE SALE. El 4 de octubre de 2026, buscando por qué el sitio de Santa
 * Luisa había terminado subido como HTML en vez de construido por el
 * constructor, aparecieron dos desajustes de vocabulario. El segundo fue éste:
 * el behavior `preferencias-cookies` funcionaba desde siempre, pero la lista
 * que `cod_get_capabilities` publica no lo mencionaba. Había dos listas —la
 * que valida y la que se publica— y no coincidían.
 *
 * Eso no es un detalle de documentación. Un cliente —una IA, o una persona
 * leyendo el catálogo— concluye que la pieza no existe y la resuelve a mano en
 * HTML. Un catálogo que miente empuja exactamente a lo que el catálogo existe
 * para evitar. Por eso ahora hay UNA constante y esta prueba, que compara lo
 * publicado contra lo aceptado behavior por behavior, probándolos de verdad.
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

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

echo "\n== la lista publicada y la que valida son la misma ==\n";
$capacidades = $compilador->capability_catalog();
$publicada = $capacidades['designRuleSet']['ruleValueSchemas']['interaction']['fields']['behavior'] ?? null;
$comprobar('el catálogo publica la lista de behaviors', is_array($publicada), is_array($publicada) ? count($publicada) . ' behaviors' : 'no la publica');
$comprobar('y es exactamente la constante del compilador',
    $publicada === COD_Canvas_MCP_Recipe_Compiler::INTERACTION_BEHAVIORS,
    is_array($publicada) ? implode(', ', array_diff(
        array_merge($publicada, COD_Canvas_MCP_Recipe_Compiler::INTERACTION_BEHAVIORS),
        array_intersect($publicada, COD_Canvas_MCP_Recipe_Compiler::INTERACTION_BEHAVIORS)
    )) : '');

/**
 * El que destapó todo esto. Se comprueba por su nombre y no sólo por la
 * comparación de arriba, porque la comparación pasaría igual si los dos lados
 * se olvidaran de él.
 */
$comprobar('preferencias-cookies está en la lista',
    in_array('preferencias-cookies', COD_Canvas_MCP_Recipe_Compiler::INTERACTION_BEHAVIORS, true));

echo "\n== y cada behavior publicado se acepta de verdad ==\n";
/*
 * Que los nombres calcen no basta: el validador podría anunciar uno y
 * rechazarlo por otro camino. Se prueba cada uno pidiéndolo, sobre el nodo que
 * le corresponde, y lo que se mira es el MOTIVO del rechazo: si el error dice
 * que el behavior no existe, el catálogo miente. Si dice cualquier otra cosa
 * —«lightbox sólo en gallery», «nav-toggle necesita targetId»— es una
 * restricción legítima y documentada, no una mentira.
 */
$nodoPara = [
    'lightbox' => ['kind' => 'gallery', 'content' => ['items' => []]],
    'carousel-basic' => ['kind' => 'gallery', 'content' => ['items' => []]],
    'preferencias-cookies' => ['kind' => 'button', 'content' => ['label' => 'Preferencias de cookies', 'href' => '/terminos-y-condiciones/']],
];

foreach (COD_Canvas_MCP_Recipe_Compiler::INTERACTION_BEHAVIORS as $behavior) {
    $base = $nodoPara[$behavior] ?? ['kind' => 'group', 'children' => [
        ['id' => 'hijo', 'kind' => 'paragraph', 'ruleIds' => [], 'content' => ['text' => 'x']],
    ]];
    $nodo = array_merge(['id' => 'n', 'ruleIds' => ['i']], $base);

    $r = $compilador->compile(
        ['schemaVersion' => 2, 'nodes' => [$nodo]],
        ['schemaVersion' => 1, 'designId' => 'prueba-catalogo', 'expectedDesignRevision' => 0,
         'reviewState' => 'session', 'rules' => [[
            'id' => 'i', 'kind' => 'interaction',
            'scope' => ['breakpoint' => 'all', 'state' => 'default'],
            'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba del catálogo.']]],
            'status' => 'reviewed',
            'value' => ['behavior' => $behavior],
         ]]]
    );

    $mensaje = is_wp_error($r) ? $r->get_error_message() : '';
    // «no existe» se reconoce por el mensaje del validador de interaction, que
    // es el único que nombra la lista de behaviors permitidos.
    $desconocido = $mensaje !== '' && stripos($mensaje, 'behavior') !== false
        && (stripos($mensaje, 'no permitid') !== false || stripos($mensaje, 'desconocid') !== false
            || stripos($mensaje, 'inválid') !== false || stripos($mensaje, 'invalid') !== false);

    $comprobar(
        sprintf('%-22s %s', $behavior, $mensaje === '' ? 'compila' : 'restricción propia'),
        !$desconocido,
        $desconocido ? 'EL CATÁLOGO LO ANUNCIA Y EL VALIDADOR NO LO CONOCE: ' . $mensaje : ''
    );
}

echo "\n== y ninguna lista del catálogo se queda atrás del código ==\n";
/*
 * Cristóbal, el 4 de octubre de 2026, mirando la lista de desajustes:
 * «simplemente se trata de desactualizaciones». Tenía razón, y es mejor
 * diagnóstico que llamarlos defectos de diseño: ninguna de estas listas
 * estaba mal pensada, sólo se quedaron atrás del código.
 *
 * El caso que lo probó: las cinco familias de regla que se sumaron el 3 y 4
 * de octubre —divisor, posicion, desborde, transformacion e icono— existían y
 * funcionaban, pero el catálogo no publicaba su esquema. Quien lo leyera no
 * tenía cómo saber que existían.
 *
 * Cada comprobación de acá declara la RELACIÓN correcta, que no siempre es la
 * igualdad: hay listas que son superconjunto de otra y listas que son
 * subconjunto, y confundirlas da falsos positivos que después nadie mira.
 */
$cat = $compilador->capability_catalog();

// 1. IGUALDAD. Todo tipo de regla que el código acepta tiene su esquema
//    publicado, y no se publica un esquema de algo que no existe.
$kinds = COD_Canvas_MCP_Recipe_Compiler::RULE_KINDS;
$esquemas = array_keys($cat['designRuleSet']['ruleValueSchemas']);
sort($kinds); sort($esquemas);
$comprobar('cada tipo de regla tiene su esquema publicado', $kinds === $esquemas,
    implode(', ', array_merge(array_diff($kinds, $esquemas), array_diff($esquemas, $kinds))));

// 2. SUPERCONJUNTO. safeRuntimeBehaviors es todo lo que sabe hacer el
//    runtime, así que contiene a los que se piden con una regla interaction y
//    además los que se piden con una motion (reveal-on-scroll y compañía).
$safe = $cat['realization']['safeRuntimeBehaviors'];
$faltan = array_values(array_diff(COD_Canvas_MCP_Recipe_Compiler::INTERACTION_BEHAVIORS, $safe));
$comprobar('safeRuntimeBehaviors contiene a todos los de interaction', $faltan === [],
    $faltan === [] ? '' : 'faltan: ' . implode(', ', $faltan));

// 3. SUBCONJUNTO. Sólo algunos behaviors fabrican partes en el navegador, así
//    que los contratos son unos pocos de los de interaction. Lo que no puede
//    pasar es que haya un contrato de un behavior que ya no existe.
$contratos = array_keys($cat['composition']['behaviorContracts']);
$huerfanos = array_values(array_diff($contratos, COD_Canvas_MCP_Recipe_Compiler::INTERACTION_BEHAVIORS));
$comprobar('ningún contrato de partes sobra', $huerfanos === [],
    $huerfanos === [] ? '' : 'sobran: ' . implode(', ', $huerfanos));

// 4. COBERTURA. Los esquemas de contenido de nodo agrupan nombres en una sola
//    clave («button|link», «section|header|footer|navigation|layout»), así que
//    la comparación tiene que partir por la barra. Sin eso daba siete falsos
//    desfases y la prueba no habría servido para nada.
$cubiertos = [];
foreach (array_keys($cat['composition']['nodeContentSchemas']) as $clave) {
    foreach (explode('|', (string) $clave) as $parte) {
        $cubiertos[] = trim(explode('+', $parte)[0]);
    }
}
$sinEsquema = array_values(array_diff($cat['composition']['nodeKinds'], $cubiertos));
$comprobar('cada tipo de nodo tiene su esquema de contenido', $sinEsquema === [],
    $sinEsquema === [] ? '' : 'sin esquema: ' . implode(', ', $sinEsquema));

// 5. Las cinco familias nuevas, por su nombre. La comparación de arriba
//    pasaría igual si el código y el catálogo se olvidaran de las dos a la vez.
foreach (['divisor', 'posicion', 'desborde', 'transformacion', 'icono'] as $familia) {
    $comprobar('  ' . $familia . ' está publicada',
        isset($cat['designRuleSet']['ruleValueSchemas'][$familia])
        && in_array($familia, COD_Canvas_MCP_Recipe_Compiler::RULE_KINDS, true));
}
echo "\n";
if ($fallas === 0) { echo "probar-catalogo-no-miente.php   TODO OK\n"; exit(0); }
echo "probar-catalogo-no-miente.php   $fallas falla(s)\n";
exit(1);
