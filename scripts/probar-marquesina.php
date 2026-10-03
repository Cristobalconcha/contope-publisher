<?php
/**
 * Verifica el behavior «marquesina» de 0.3.39 (lado servidor):
 *  - el compilador acepta un group con 2 a 24 hijos y emite data-cod-behavior="marquesina"
 *  - 1 hijo, 25 hijos y un nodo que no es group devuelven WP_Error con mensaje claro
 *  - la regla no admite parámetros conocidos (threshold, visible, ...) ni inventados: error que
 *    NOMBRA el parámetro, no se ignora en silencio
 *  - dos comportamientos runtime en un mismo nodo siguen siendo un conflicto
 *  - las partes pista y pieza se pueden estilar; una parte inventada se rechaza nombrando las válidas
 *  - las variables --cod-marquesina-* salen por una regla properties (con scope.breakpoint)
 *  - el catálogo de capacidades lista «marquesina» en las tres partes donde corresponde
 *  - marquesina_css(): vacío si la página no lo menciona; existe la regla de
 *    prefers-reduced-motion que detiene la animación; sin colores ni tipografía de marca;
 *    sin degradados; sin abreviadas con variable (background, border, font, margin, padding)
 *
 * Corre contra el WordPress local de Econut (puerto 8891), que ya tiene el
 * plugin cargado: hay que sincronizar repo -> wp-local-econut antes.
 * Nunca contra wp-local (ése es Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$regla = function (string $id, string $kind, array $valor, string $breakpoint = 'all'): array {
    return [
        'id' => $id,
        'kind' => $kind,
        'scope' => ['breakpoint' => $breakpoint, 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.39.']]],
        'status' => 'reviewed',
        'value' => $valor,
    ];
};
$diseno = function (array $reglas): array {
    return ['schemaVersion' => 1, 'designId' => 'prueba-039', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas];
};
$composicion = function (array $hijos): array {
    return ['schemaVersion' => 2, 'nodes' => [['id' => 'seccion-prueba', 'kind' => 'section', 'children' => $hijos]]];
};
// Una pieza: un heading (en la landing real serían los logos).
$pieza = function (int $n): array {
    return ['id' => 'pieza-' . $n, 'kind' => 'heading', 'content' => ['text' => 'Pieza ' . $n, 'level' => 3]];
};
$fila = function (int $cuantas, array $reglaIds = ['r-marquesina'], string $kind = 'group', array $extra = []) use ($pieza): array {
    $hijos = [];
    for ($i = 1; $i <= $cuantas; $i++) {
        $hijos[] = $pieza($i);
    }
    return array_merge(['id' => 'fila', 'kind' => $kind, 'ruleIds' => $reglaIds, 'children' => $hijos], $extra);
};

$fallas = 0;
$comprobar = function (string $caso, bool $ok) use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . "\n";
    if (!$ok) { $fallas++; }
};
$reglaMarquesina = $regla('r-marquesina', 'interaction', ['behavior' => 'marquesina']);

echo "\n== compilador: cantidad de hijos ==\n";
foreach ([2, 4, 24] as $cuantas) {
    $r = $compilador->compile($composicion([$fila($cuantas)]), $diseno([$reglaMarquesina]));
    $ok = !is_wp_error($r) && strpos($r['storage']['markup'], 'data-cod-behavior="marquesina"') !== false;
    $comprobar($cuantas . ' hijos: compila y emite data-cod-behavior="marquesina"', $ok);
    if (is_wp_error($r)) { echo '           ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n"; }
    if ($cuantas === 4 && !is_wp_error($r)) {
        // El compilador sólo emite el atributo de comportamiento: la pista, las copias y el resto los arma el runtime.
        $comprobar('4 hijos: sólo emite data-cod-behavior (ningún otro data-cod-marquesina-*)', strpos($r['storage']['markup'], 'data-cod-marquesina') === false);
    }
}
foreach ([1, 25] as $cuantas) {
    $r = $compilador->compile($composicion([$fila($cuantas)]), $diseno([$reglaMarquesina]));
    $ok = is_wp_error($r) && $r->get_error_code() === 'cod_mcp_marquesina_children_invalid';
    $comprobar($cuantas . ' hijo(s): cod_mcp_marquesina_children_invalid', $ok);
    if (is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
}

echo "\n== compilador: destino y parámetros ==\n";
$r = $compilador->compile($composicion([$fila(3, ['r-marquesina'], 'section')]), $diseno([$reglaMarquesina]));
$comprobar('en una section (no group): cod_mcp_marquesina_target_invalid', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_marquesina_target_invalid');
if (is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }

foreach (['threshold' => 10, 'toggleClass' => 'abierto', 'mode' => 'single', 'visible' => 2, 'visibleMobile' => 1] as $clave => $valor) {
    $r = $compilador->compile(
        $composicion([$fila(3, ['r-con-parametro'])]),
        $diseno([$regla('r-con-parametro', 'interaction', ['behavior' => 'marquesina', $clave => $valor])])
    );
    $comprobar('parámetro ' . $clave . ' rechazado y nombrado en el mensaje', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_interaction_rule_invalid' && strpos($r->get_error_message(), 'se recibió: ' . $clave) !== false);
    if ($clave === 'visible' && is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
}
foreach (['velocidad' => 30, 'speed' => 8000, 'direction' => 'rtl'] as $clave => $valor) {
    $r = $compilador->compile(
        $composicion([$fila(3, ['r-inventado'])]),
        $diseno([$regla('r-inventado', 'interaction', ['behavior' => 'marquesina', $clave => $valor])])
    );
    $comprobar('parámetro inventado «' . $clave . '» rechazado nombrándolo', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_interaction_rule_invalid' && strpos($r->get_error_message(), '"' . $clave . '"') !== false);
    if ($clave === 'velocidad' && is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
}
$r = $compilador->compile(
    $composicion([$fila(3, ['r-marquesina', 'r-pest'])]),
    $diseno([$reglaMarquesina, $regla('r-pest', 'interaction', ['behavior' => 'pestanas'])])
);
$comprobar('marquesina + pestanas en el mismo nodo: cod_mcp_behavior_conflict', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_behavior_conflict');
$r = $compilador->compile(
    $composicion([$fila(3, ['r-marquesina', 'r-cuad'])]),
    $diseno([$reglaMarquesina, $regla('r-cuad', 'interaction', ['behavior' => 'cuadrantes'])])
);
$comprobar('marquesina + cuadrantes en el mismo nodo: cod_mcp_behavior_conflict', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_behavior_conflict');
$r = $compilador->compile(
    $composicion([$fila(3, ['r-marquesina', 'r-marquesina-2'])]),
    $diseno([$reglaMarquesina, $regla('r-marquesina-2', 'interaction', ['behavior' => 'marquesina'])])
);
$comprobar('dos marquesinas en el mismo nodo: cod_mcp_behavior_conflict', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_behavior_conflict');
$r = $compilador->compile(
    $composicion([$fila(3, ['r-otro'])]),
    $diseno([$regla('r-otro', 'interaction', ['behavior' => 'marquesinas'])])
);
$comprobar('un behavior inventado sigue rechazado', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_interaction_rule_invalid');

echo "\n== variables por regla properties (con breakpoint) y partes ==\n";
$visibles = fn(string $id, string $n, string $bp) => $regla($id, 'properties', ['declarations' => ['--cod-marquesina-visibles' => $n]], $bp);
$medidas = $regla('r-medidas', 'properties', ['declarations' => [
    '--cod-marquesina-visibles' => '4',
    '--cod-marquesina-separacion' => '60px',
    '--cod-marquesina-duracion-pieza' => '8s',
]]);
$r = $compilador->compile(
    $composicion([$fila(4, ['r-marquesina', 'r-medidas', 'r-tablet', 'r-movil'])]),
    $diseno([$reglaMarquesina, $medidas, $visibles('r-tablet', '2', 'tablet'), $visibles('r-movil', '1', 'mobile')])
);
$comprobar('las variables --cod-marquesina-* compilan por properties, con scope.breakpoint', !is_wp_error($r));
if (is_wp_error($r)) { echo '           ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n"; }
else {
    $estilos = $r['storage']['styles'];
    $comprobar('emite visibles/separacion/duracion en la regla del nodo', preg_match('/\.cod-rule--r-medidas\{[^}]*--cod-marquesina-visibles:\s*4;[^}]*--cod-marquesina-separacion:\s*60px;[^}]*--cod-marquesina-duracion-pieza:\s*8s/', $estilos) === 1);
    $comprobar('el número de visibles por ancho sale del @media del compilador (tablet)', preg_match('/@media\(min-width:768px\) and \(max-width:1023px\)\{\.cod-rule--r-tablet\{[^}]*--cod-marquesina-visibles:\s*2/', $estilos) === 1);
    $comprobar('el número de visibles por ancho sale del @media del compilador (móvil)', preg_match('/@media\(max-width:767px\)\{\.cod-rule--r-movil\{[^}]*--cod-marquesina-visibles:\s*1/', $estilos) === 1);
}

$reglaPista = $regla('r-pista', 'properties', ['declarations' => ['--cod-marquesina-duracion-pieza' => '12s']]);
$reglaPieza = $regla('r-pieza', 'spacing', ['paddingBlock' => '8px', 'paddingInline' => '8px']);
$r = $compilador->compile(
    $composicion([$fila(3, ['r-marquesina'], 'group', ['partes' => ['pista' => ['r-pista'], 'pieza' => ['r-pieza']]])]),
    $diseno([$reglaMarquesina, $reglaPista, $reglaPieza])
);
$comprobar('partes pista y pieza aceptan reglas', !is_wp_error($r));
if (is_wp_error($r)) { echo '           ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n"; }
else {
    $estilos = $r['storage']['styles'];
    $comprobar('la regla de la pista se emite como descendiente anclado al nodo', strpos($estilos, '.cod-node-id-fila [data-cod-marquesina-rol="pista"]') !== false);
    $comprobar('la regla de la pieza se emite como descendiente anclado al nodo', strpos($estilos, '.cod-node-id-fila [data-cod-marquesina-rol="pieza"]') !== false);
}
$r = $compilador->compile(
    $composicion([$fila(3, ['r-marquesina'], 'group', ['partes' => ['etiqueta' => ['r-pista']]])]),
    $diseno([$reglaMarquesina, $reglaPista])
);
$comprobar('una parte inventada se rechaza nombrando las válidas', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_composition_partes_invalid' && strpos($r->get_error_message(), 'pista, pieza') !== false);
if (is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
$actual = array_replace($reglaPista, ['scope' => ['breakpoint' => 'all', 'state' => 'current']]);
$r = $compilador->compile(
    $composicion([$fila(3, ['r-marquesina'], 'group', ['partes' => ['pista' => ['r-pista']]])]),
    $diseno([$reglaMarquesina, $actual])
);
$comprobar('scope.state="current" sobre la pista: cod_mcp_current_state_target_invalid (no hay elegido)', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_current_state_target_invalid');

echo "\n== catálogo de capacidades ==\n";
$json = wp_json_encode($compilador->capability_catalog(), JSON_UNESCAPED_UNICODE);
$comprobar('safeRuntimeBehaviors incluye marquesina', preg_match('/safeRuntimeBehaviors.{0,300}marquesina/s', $json) === 1);
$comprobar('interaction.behavior incluye marquesina', preg_match('/"behavior":\[[^\]]*"pestanas","marquesina"[,\]]/', $json) === 1);
$comprobar('constraints describe marquesina', strpos($json, 'marquesina sólo en un nodo group con 2 a 24 hijos') !== false);
$comprobar('behaviorContracts lista las partes pista y pieza', preg_match('/"marquesina":\{"atributoRol":"data-cod-marquesina-rol","partes":\{"pista":.*"pieza":/s', $json) === 1);

echo "\n== marquesina_css() ==\n";
$css = COD_Canvas_Page_Publisher::marquesina_css();
$comprobar('con html null emite la hoja', $css !== '');
$comprobar('sin mención en la página no emite nada', COD_Canvas_Page_Publisher::marquesina_css('<div>hola</div>') === '');
$comprobar('con mención emite la hoja', COD_Canvas_Page_Publisher::marquesina_css('<div data-cod-behavior="marquesina"></div>') === $css);
$comprobar('la pista se desplaza con @keyframes y translateX(-50%) corregido por media separación', strpos($css, '@keyframes cod-marquesina-desplazar{from{transform:translateX(0);}to{transform:translateX(calc(-50% - var(--cod-marquesina-separacion,0px) / 2));}}') !== false);
$comprobar('la animación es lineal e infinita', strpos($css, 'animation-timing-function:linear') !== false && strpos($css, 'animation-iteration-count:infinite') !== false);
$comprobar('la velocidad por pieza es 8s por omisión', strpos($css, 'var(--cod-marquesina-duracion-pieza,8s)') !== false);
$comprobar('existe @media (prefers-reduced-motion:reduce)', strpos($css, '@media (prefers-reduced-motion:reduce){') !== false);
// Lo que va dentro del bloque de movimiento reducido: detiene la animación y esconde las copias.
$comprobar('con movimiento reducido la pista se detiene (animation:none)', preg_match('/@media \(prefers-reduced-motion:reduce\)\{[^@]*\.cod-marquesina__pista\{animation:none;/', $css) === 1);
$comprobar('con movimiento reducido las copias desaparecen', preg_match('/@media \(prefers-reduced-motion:reduce\)\{[^@]*\[data-cod-marquesina-copia\]\{display:none;\}/', $css) === 1);
$comprobar('la animación sólo se declara fuera del bloque reducido una vez (el bucle) y nunca dentro de no-preference', substr_count($css, 'animation-name:cod-marquesina-desplazar') === 1 && strpos($css, 'prefers-reduced-motion:no-preference') === false);
$comprobar('sin colores de marca (ningún #hex ni rgb/hsl)', preg_match('/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/', $css) === 0);
$comprobar('sin tipografía (ningún font-*)', strpos($css, 'font') === false);
$comprobar('sin degradados', stripos($css, 'gradient') === false);
$comprobar('sin abreviadas con variable (background/border/font/margin/padding: ... var())', preg_match('/(?<![-\w])(background|border|font|margin|padding)\s*:[^;}]*var\(/', $css) === 0);
$comprobar('ni siquiera `animation:` con variable (sólo `animation:none`)', preg_match('/(?<![-\w])animation\s*:(?!none)/', $css) === 0);
$comprobar('valores por omisión con especificidad cero (:where)', strpos($css, ':where(') !== false);
$comprobar('la pieza mide 1/visibles del contenedor (cqw), no del viewport', strpos($css, 'flex-basis:calc((100cqw - (var(--cod-marquesina-visibles,4) - 1) * var(--cod-marquesina-separacion,0px)) / var(--cod-marquesina-visibles,4))') !== false && strpos($css, '100vw') === false);
$comprobar('la raíz recorta y es contenedor de tamaño en línea', strpos($css, 'overflow:hidden;container-type:inline-size;') !== false);
echo '           tamaño de la hoja: ' . strlen($css) . " bytes\n";

echo $fallas === 0 ? "\nTODO OK\n" : "\n" . $fallas . " FALLA(S)\n";
exit($fallas === 0 ? 0 : 1);
