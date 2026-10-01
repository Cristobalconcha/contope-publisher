<?php
/**
 * Verifica el behavior «pestanas» de 0.3.35 (lado servidor):
 *  - el compilador acepta un group con 2 a 8 hijos y emite data-cod-behavior="pestanas"
 *  - 1 hijo, 9 hijos y un nodo que no es group devuelven WP_Error con mensaje claro
 *  - la regla no admite parámetros (threshold, targetId, ...): error, no se ignoran en silencio
 *  - dos comportamientos runtime en un mismo nodo siguen siendo un conflicto
 *  - el catálogo de capacidades lista «pestanas» en las tres partes donde corresponde
 *  - pestanas_css(): vacío si la página no lo menciona; sin colores ni tipografía de marca;
 *    sin abreviadas con variable (background, border, font, margin, padding)
 *
 * Corre contra el WordPress local de Econut (puerto 8891), que ya tiene el
 * plugin cargado: hay que sincronizar repo -> wp-local-econut antes.
 * Nunca contra wp-local (ése es Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$regla = function (string $id, string $kind, array $valor): array {
    return [
        'id' => $id,
        'kind' => $kind,
        'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.35.']]],
        'status' => 'reviewed',
        'value' => $valor,
    ];
};
$diseno = function (array $reglas): array {
    return ['schemaVersion' => 1, 'designId' => 'prueba-035', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas];
};
$composicion = function (array $hijos): array {
    return ['schemaVersion' => 2, 'nodes' => [['id' => 'seccion-prueba', 'kind' => 'section', 'children' => $hijos]]];
};
// Una pestaña: un group con la etiqueta (heading) y el panel (heading + paragraph).
$pestana = function (int $n): array {
    return [
        'id' => 'pestana-' . $n,
        'kind' => 'group',
        'children' => [
            ['id' => 'etiqueta-' . $n, 'kind' => 'heading', 'content' => ['text' => 'Etiqueta ' . $n, 'level' => 3]],
            ['id' => 'titulo-' . $n, 'kind' => 'heading', 'content' => ['text' => 'Título del panel ' . $n, 'level' => 2]],
            ['id' => 'texto-' . $n, 'kind' => 'paragraph', 'content' => ['text' => 'Texto del panel ' . $n]],
        ],
    ];
};
$juego = function (int $cuantas, array $reglaIds = ['r-pestanas'], string $kind = 'group') use ($pestana): array {
    $hijos = [];
    for ($i = 1; $i <= $cuantas; $i++) {
        $hijos[] = $pestana($i);
    }
    return ['id' => 'juego', 'kind' => $kind, 'ruleIds' => $reglaIds, 'children' => $hijos];
};

$fallas = 0;
$comprobar = function (string $caso, bool $ok) use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . "\n";
    if (!$ok) { $fallas++; }
};
$reglaPestanas = $regla('r-pestanas', 'interaction', ['behavior' => 'pestanas']);

echo "\n== compilador: cantidad de hijos ==\n";
foreach ([2, 4, 8] as $cuantas) {
    $r = $compilador->compile($composicion([$juego($cuantas)]), $diseno([$reglaPestanas]));
    $ok = !is_wp_error($r) && strpos($r['storage']['markup'], 'data-cod-behavior="pestanas"') !== false;
    $comprobar($cuantas . ' hijos: compila y emite data-cod-behavior="pestanas"', $ok);
    if (is_wp_error($r)) { echo '           ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n"; }
    if ($cuantas === 4 && !is_wp_error($r)) {
        $m = $r['storage']['markup'];
        // El compilador sólo emite el atributo de comportamiento: nada más de pestanas.
        $comprobar('4 hijos: sólo emite data-cod-behavior (ningún otro data-cod-pestanas-*)', strpos($m, 'data-cod-pestanas') === false);
    }
}
foreach ([1, 9] as $cuantas) {
    $r = $compilador->compile($composicion([$juego($cuantas)]), $diseno([$reglaPestanas]));
    $ok = is_wp_error($r) && $r->get_error_code() === 'cod_mcp_pestanas_children_invalid';
    $comprobar($cuantas . ' hijo(s): cod_mcp_pestanas_children_invalid', $ok);
    if (is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
}

echo "\n== compilador: destino y parámetros ==\n";
$r = $compilador->compile($composicion([$juego(3, ['r-pestanas'], 'section')]), $diseno([$reglaPestanas]));
$comprobar('en una section (no group): cod_mcp_pestanas_target_invalid', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_pestanas_target_invalid');
if (is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }

foreach (['threshold' => 10, 'toggleClass' => 'abierto', 'mode' => 'single', 'visible' => 2] as $clave => $valor) {
    $r = $compilador->compile(
        $composicion([$juego(3, ['r-con-parametro'])]),
        $diseno([$regla('r-con-parametro', 'interaction', ['behavior' => 'pestanas', $clave => $valor])])
    );
    $comprobar('parámetro ' . $clave . ' rechazado (no se ignora en silencio)', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_interaction_rule_invalid');
    if ($clave === 'threshold' && is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
}
$r = $compilador->compile(
    $composicion([$juego(3, ['r-pestanas', 'r-cuad'])]),
    $diseno([$reglaPestanas, $regla('r-cuad', 'interaction', ['behavior' => 'cuadrantes'])])
);
$comprobar('pestanas + cuadrantes en el mismo nodo: cod_mcp_behavior_conflict', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_behavior_conflict');
$r = $compilador->compile(
    $composicion([$juego(3, ['r-otro'])]),
    $diseno([$regla('r-otro', 'interaction', ['behavior' => 'pestanas-inventadas'])])
);
$comprobar('un behavior inventado sigue rechazado', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_interaction_rule_invalid');

echo "\n== catálogo de capacidades ==\n";
$ref = new ReflectionClass($compilador);
$json = '';
foreach (['capabilities', 'get_capabilities', 'capability_catalog', 'catalog'] as $nombre) {
    if ($ref->hasMethod($nombre) && $ref->getMethod($nombre)->isPublic()) {
        $json = wp_json_encode($compilador->$nombre(), JSON_UNESCAPED_UNICODE);
        break;
    }
}
if ($json === '') {
    echo "  (no encontré el método público del catálogo; se revisa el código fuente)\n";
    $json = (string) file_get_contents(__DIR__ . '/../contope-publisher/includes/class-cod-canvas-mcp-recipe-compiler.php');
}
$comprobar('safeRuntimeBehaviors incluye pestanas', preg_match("/safeRuntimeBehaviors.{0,300}pestanas/s", $json) === 1);
$comprobar('interaction.behavior incluye pestanas', preg_match("/behavior.{0,200}cuadrantes.{0,10}pestanas/s", $json) === 1);
$comprobar('constraints describe pestanas', strpos($json, 'pestanas sólo en un nodo group con 2 a 8 hijos') !== false);

echo "\n== scope.state = current (0.3.36) ==\n";
$color = fn(string $id, string $hex, string $estado) => array_replace(
    $regla($id, 'color', ['role' => 'etiqueta', 'color' => $hex, 'apply' => 'text']),
    ['scope' => ['breakpoint' => 'all', 'state' => $estado]]
);
$juegoConEtiquetas = function (array $ruleIdsEtiqueta) use ($juego): array {
    $nodo = $juego(3);
    foreach ($nodo['children'] as $k => $hijo) {
        $nodo['children'][$k]['children'][0]['ruleIds'] = $ruleIdsEtiqueta;
    }
    return $nodo;
};
$disenoColor = $diseno([$reglaPestanas, $color('c-etiqueta', '#E09900', 'default'), $color('c-etiqueta-activa', '#4D7A76', 'current')]);
$r = $compilador->compile($composicion([$juegoConEtiquetas(['c-etiqueta', 'c-etiqueta-activa'])]), $disenoColor);
$comprobar('etiqueta con regla default + regla current compila', !is_wp_error($r));
if (is_wp_error($r)) { echo '           ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n"; }
else {
    $estilos = $r['storage']['styles'];
    $comprobar('emite la regla default sobre la clase de la regla', strpos($estilos, '.cod-rule--c-etiqueta{') !== false && strpos($estilos, '#E09900') !== false);
    $comprobar('emite la regla current con :is() y el atributo del runtime, para el nodo y para sus descendientes',
        strpos($estilos, ':is(.cod-rule--c-etiqueta-activa[data-cod-pestanas-estado="activa"],[data-cod-pestanas-estado="activa"] .cod-rule--c-etiqueta-activa') !== false && strpos($estilos, '#4D7A76') !== false);
    $comprobar('la regla current también sirve para cuadrantes', strpos($estilos, '[data-cod-cuadrantes-rol="activa"] .cod-rule--c-etiqueta-activa') !== false);
}
$r = $compilador->compile($composicion([['id' => 'suelto', 'kind' => 'heading', 'ruleIds' => ['c-etiqueta-activa'], 'content' => ['text' => 'Fuera', 'level' => 3]]]), $disenoColor);
$comprobar('current fuera de un pestanas/cuadrantes: cod_mcp_current_state_target_invalid', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_current_state_target_invalid');
if (is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
$dr = $disenoColor; $dr['rootRuleIds'] = ['c-etiqueta-activa'];
$r = $compilador->compile($composicion([$juegoConEtiquetas(['c-etiqueta'])]), $dr);
$comprobar('current en rootRuleIds: cod_mcp_current_state_target_invalid', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_current_state_target_invalid');
$r = $compilador->compile($composicion([$juegoConEtiquetas(['c-etiqueta'])]), $diseno([$reglaPestanas, $color('c-x', '#123456', 'inventado')]));
$comprobar('un state inventado sigue rechazado', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_design_scope_invalid');
$json2 = wp_json_encode($compilador->capability_catalog(), JSON_UNESCAPED_UNICODE);
$comprobar('el catálogo lista current y explica qué significa', strpos($json2, '"current"') !== false && strpos($json2, 'stateCurrent') !== false);

echo "\n== pestanas_css() ==\n";
$css = COD_Canvas_Page_Publisher::pestanas_css();
$comprobar('con html null emite la hoja', $css !== '');
$comprobar('sin mención en la página no emite nada', COD_Canvas_Page_Publisher::pestanas_css('<div>hola</div>') === '');
$comprobar('con mención emite la hoja', COD_Canvas_Page_Publisher::pestanas_css('<div data-cod-behavior="pestanas"></div>') === $css);
$comprobar('usa --cod-motion-enter y --cod-motion-response', strpos($css, 'var(--cod-motion-enter)') !== false && strpos($css, 'var(--cod-motion-response)') !== false);
$comprobar('el movimiento va dentro de prefers-reduced-motion:no-preference', preg_match('/@media \(prefers-reduced-motion:no-preference\)\{[^@]*transition:height var\(--cod-motion-response\)/', $css) === 1);
$comprobar('sin colores de marca (ningún #hex ni rgb/hsl)', preg_match('/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/', $css) === 0);
$comprobar('sin degradados', stripos($css, 'gradient') === false);
$comprobar('sin abreviadas con variable (background/border/font/margin/padding: ... var())', preg_match('/(?<![-\w])(background|border|font|margin|padding)\s*:[^;}]*var\(/', $css) === 0);
$comprobar('el inactivo se oculta y no se puede pisar (display:none !important)', strpos($css, '[data-cod-pestanas-visible="false"]{display:none !important;}') !== false);
$comprobar('valores por omisión con especificidad cero (:where)', strpos($css, ':where(') !== false);
// Lo que NO está dentro de :where() tiene especificidad real. Sólo puede haber lo estructural
// (display, appearance, el panel inactivo, el alto en viaje, la aparición del panel) y la regla
// del nodo de la etiqueta, que va con una sola clase. Lo demás (color, margen, relleno,
// alineación, envoltura…) tiene que ser pisable por la composición.
preg_match_all('/([^{}]+)\{([^{}]*)\}/', preg_replace('/@media[^{]*\{/', '', $css), $reglas, PREG_SET_ORDER);
$fueraDeWhere = [];
foreach ($reglas as $rg) {
    if (strpos(trim($rg[1]), ':where(') === 0) { continue; }
    $fueraDeWhere[] = trim($rg[1]) . '{' . $rg[2] . '}';
}
$comprobar('reglas fuera de :where(): sólo estructura (' . count($fueraDeWhere) . ')', count($fueraDeWhere) === 9); // 7 reglas + los 2 pasos (from, to) del keyframe
foreach ($fueraDeWhere as $rg) { echo '             ' . $rg . "\n"; }
$comprobar('el nodo de la etiqueta se pisa con UNA clase (sin prefijo de la raíz)',
    strpos($css, '.cod-pestanas__etiqueta > *{color:inherit;margin-top:0;margin-bottom:0;}') !== false
    && strpos($css, '.cod-pestanas__lista > .cod-pestanas__etiqueta > *{') === false);
echo '           tamaño de la hoja: ' . strlen($css) . " bytes\n";

echo $fallas === 0 ? "\nTODO OK\n" : "\n" . $fallas . " FALLA(S)\n";
exit($fallas === 0 ? 0 : 1);
