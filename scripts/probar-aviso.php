<?php
/**
 * Verifica el behavior «aviso» de 0.3.46 (lado servidor):
 *  - el compilador acepta un group con al menos 1 hijo y emite data-cod-behavior="aviso"
 *    (y NADA más: el velo, el panel y la X los arma el runtime)
 *  - 0 hijos y un nodo que no es group devuelven WP_Error con mensaje claro
 *  - la regla no admite parámetros conocidos (threshold, visible, ...) ni inventados: error que
 *    NOMBRA el parámetro, no se ignora en silencio
 *  - dos comportamientos runtime en un mismo nodo siguen siendo un conflicto
 *  - las partes panel, velo y cerrar se pueden estilar; una parte inventada se rechaza nombrando las válidas
 *  - las variables --cod-aviso-* salen por una regla properties (con scope.breakpoint)
 *  - un marcador sale como id de HTML (es lo que permite reabrir el aviso con un enlace #id)
 *  - el catálogo de capacidades lista «aviso» en los lugares donde corresponde
 *  - aviso_css(): vacío si la página no lo declara; existe la regla de prefers-reduced-motion
 *    (la animación sólo vive dentro de no-preference); TODA regla cuelga de .cod-aviso, que sólo pone
 *    el runtime (si el guion no corre, el contenido queda legible en el flujo normal); sin colores
 *    ni tipografías de marca; sin degradados; sin abreviadas con variable.
 *
 * Corre contra el WordPress local de Econut (puerto 8891), que ya tiene el
 * plugin cargado: hay que sincronizar repo -> wp-local-econut antes.
 * Nunca contra wp-local (ése es Santa Luisa).
 *
 * El comportamiento en el navegador (aparece, se cierra, no vuelve, foco) lo
 * prueba scripts/probar-aviso.mjs.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$regla = function (string $id, string $kind, array $valor, string $breakpoint = 'all'): array {
    return [
        'id' => $id,
        'kind' => $kind,
        'scope' => ['breakpoint' => $breakpoint, 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.46.']]],
        'status' => 'reviewed',
        'value' => $valor,
    ];
};
$diseno = function (array $reglas): array {
    return ['schemaVersion' => 1, 'designId' => 'prueba-046', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas];
};
$composicion = function (array $hijos): array {
    return ['schemaVersion' => 2, 'nodes' => [['id' => 'seccion-prueba', 'kind' => 'section', 'children' => $hijos]]];
};
// El contenido de un aviso: un título y un párrafo (en el caso real, además los enlaces a las cuentas oficiales).
$contenido = function (int $cuantos): array {
    $hijos = [];
    for ($i = 1; $i <= $cuantos; $i++) {
        $hijos[] = $i === 1
            ? ['id' => 'titulo-' . $i, 'kind' => 'heading', 'content' => ['text' => 'Cuidado con las estafas', 'level' => 2]]
            : ['id' => 'parrafo-' . $i, 'kind' => 'paragraph', 'content' => ['text' => 'Verifica la cuenta antes de pagar.']];
    }
    return $hijos;
};
$aviso = function (int $cuantos, array $reglaIds = ['r-aviso'], string $kind = 'group', array $extra = []) use ($contenido): array {
    return array_merge(['id' => 'aviso-estafas', 'kind' => $kind, 'ruleIds' => $reglaIds, 'children' => $contenido($cuantos)], $extra);
};

$fallas = 0;
$comprobar = function (string $caso, bool $ok) use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . "\n";
    if (!$ok) { $fallas++; }
};
$reglaAviso = $regla('r-aviso', 'interaction', ['behavior' => 'aviso']);

echo "\n== compilador: cantidad de hijos ==\n";
foreach ([1, 2, 6] as $cuantos) {
    $r = $compilador->compile($composicion([$aviso($cuantos)]), $diseno([$reglaAviso]));
    $ok = !is_wp_error($r) && strpos($r['storage']['markup'], 'data-cod-behavior="aviso"') !== false;
    $comprobar($cuantos . ' hijo(s): compila y emite data-cod-behavior="aviso"', $ok);
    if (is_wp_error($r)) { echo '           ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n"; }
    if ($cuantos === 2 && !is_wp_error($r)) {
        // El compilador sólo emite el atributo de comportamiento: el velo, el panel, la X y el resto los arma el runtime.
        $comprobar('2 hijos: sólo emite data-cod-behavior (ningún otro data-cod-aviso-*)', strpos($r['storage']['markup'], 'data-cod-aviso') === false);
    }
}
$r = $compilador->compile($composicion([$aviso(0)]), $diseno([$reglaAviso]));
$comprobar('0 hijos: cod_mcp_aviso_children_invalid', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_aviso_children_invalid');
if (is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }

echo "\n== compilador: destino y parámetros ==\n";
$r = $compilador->compile($composicion([$aviso(2, ['r-aviso'], 'section')]), $diseno([$reglaAviso]));
$comprobar('en una section (no group): cod_mcp_aviso_target_invalid', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_aviso_target_invalid');
if (is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }

foreach (['threshold' => 10, 'toggleClass' => 'abierto', 'mode' => 'single', 'visible' => 2, 'visibleMobile' => 1] as $clave => $valor) {
    $r = $compilador->compile(
        $composicion([$aviso(2, ['r-con-parametro'])]),
        $diseno([$regla('r-con-parametro', 'interaction', ['behavior' => 'aviso', $clave => $valor])])
    );
    $comprobar('parámetro ' . $clave . ' rechazado y nombrado en el mensaje', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_interaction_rule_invalid' && strpos($r->get_error_message(), 'se recibió: ' . $clave) !== false);
    if ($clave === 'visible' && is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
}
foreach (['dias' => 7, 'vuelve' => 7, 'delay' => 3000, 'ancho' => '30rem'] as $clave => $valor) {
    $r = $compilador->compile(
        $composicion([$aviso(2, ['r-inventado'])]),
        $diseno([$regla('r-inventado', 'interaction', ['behavior' => 'aviso', $clave => $valor])])
    );
    $comprobar('parámetro inventado «' . $clave . '» rechazado nombrándolo', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_interaction_rule_invalid' && strpos($r->get_error_message(), '"' . $clave . '"') !== false);
    if ($clave === 'dias' && is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
}
foreach (['pestanas', 'marquesina', 'cuadrantes'] as $otro) {
    $r = $compilador->compile(
        $composicion([$aviso(4, ['r-aviso', 'r-otro'])]),
        $diseno([$reglaAviso, $regla('r-otro', 'interaction', ['behavior' => $otro])])
    );
    $comprobar('aviso + ' . $otro . ' en el mismo nodo: cod_mcp_behavior_conflict', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_behavior_conflict');
}
$r = $compilador->compile(
    $composicion([$aviso(2, ['r-aviso', 'r-aviso-2'])]),
    $diseno([$reglaAviso, $regla('r-aviso-2', 'interaction', ['behavior' => 'aviso'])])
);
$comprobar('dos avisos en el mismo nodo: cod_mcp_behavior_conflict', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_behavior_conflict');
$r = $compilador->compile(
    $composicion([$aviso(2, ['r-otro'])]),
    $diseno([$regla('r-otro', 'interaction', ['behavior' => 'avisos'])])
);
$comprobar('un behavior inventado sigue rechazado', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_interaction_rule_invalid');

echo "\n== variables por regla properties (con breakpoint), marcador y partes ==\n";
$medidas = $regla('r-medidas', 'properties', ['declarations' => [
    '--cod-aviso-vuelve-dias' => '7',
    '--cod-aviso-ancho-maximo' => '36rem',
]]);
$angosto = $regla('r-movil', 'properties', ['declarations' => ['--cod-aviso-ancho-maximo' => '100%']], 'mobile');
$r = $compilador->compile(
    $composicion([$aviso(3, ['r-aviso', 'r-medidas', 'r-movil'], 'group', ['marker' => 'aviso-estafas'])]),
    $diseno([$reglaAviso, $medidas, $angosto])
);
$comprobar('las variables --cod-aviso-* compilan por properties, con scope.breakpoint', !is_wp_error($r));
if (is_wp_error($r)) { echo '           ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n"; }
else {
    $estilos = $r['storage']['styles'];
    $comprobar('emite vuelve-dias y ancho-maximo en la regla del nodo', preg_match('/\.cod-rule--r-medidas\{[^}]*--cod-aviso-vuelve-dias:\s*7;[^}]*--cod-aviso-ancho-maximo:\s*36rem/', $estilos) === 1);
    $comprobar('el ancho por breakpoint sale del @media del compilador (móvil)', preg_match('/@media\(max-width:767px\)\{\.cod-rule--r-movil\{[^}]*--cod-aviso-ancho-maximo:\s*100%/', $estilos) === 1);
    $comprobar('el marcador sale como id de HTML (con él un enlace #id reabre el aviso)', strpos($r['storage']['markup'], 'id="aviso-estafas"') !== false);
}

$reglaPanel = $regla('r-panel', 'spacing', ['paddingBlock' => '24px', 'paddingInline' => '24px']);
$reglaVelo = $regla('r-velo', 'surface', ['backgroundColor' => '#000000']);
$reglaX = $regla('r-x', 'properties', ['declarations' => ['width' => '3rem', 'height' => '3rem']]);
$r = $compilador->compile(
    $composicion([$aviso(2, ['r-aviso'], 'group', ['partes' => ['panel' => ['r-panel'], 'velo' => ['r-velo'], 'cerrar' => ['r-x']]])]),
    $diseno([$reglaAviso, $reglaPanel, $reglaVelo, $reglaX])
);
$comprobar('partes panel, velo y cerrar aceptan reglas', !is_wp_error($r));
if (is_wp_error($r)) { echo '           ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n"; }
else {
    $estilos = $r['storage']['styles'];
    foreach (['panel', 'velo', 'cerrar'] as $parte) {
        $comprobar('la regla de ' . $parte . ' se emite como descendiente anclado al nodo', strpos($estilos, '.cod-node-id-aviso-estafas [data-cod-aviso-rol="' . $parte . '"]') !== false);
    }
}
$r = $compilador->compile(
    $composicion([$aviso(2, ['r-aviso'], 'group', ['partes' => ['titulo' => ['r-panel']]])]),
    $diseno([$reglaAviso, $reglaPanel])
);
$comprobar('una parte inventada se rechaza nombrando las válidas', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_composition_partes_invalid' && strpos($r->get_error_message(), 'velo, panel, cerrar') !== false);
if (is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
$actual = array_replace($reglaPanel, ['scope' => ['breakpoint' => 'all', 'state' => 'current']]);
$r = $compilador->compile(
    $composicion([$aviso(2, ['r-aviso'], 'group', ['partes' => ['panel' => ['r-panel']]])]),
    $diseno([$reglaAviso, $actual])
);
$comprobar('scope.state="current" sobre el panel: cod_mcp_current_state_target_invalid (no hay elegido)', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_current_state_target_invalid');

echo "\n== catálogo de capacidades ==\n";
$json = wp_json_encode($compilador->capability_catalog(), JSON_UNESCAPED_UNICODE);
$comprobar('safeRuntimeBehaviors incluye aviso', preg_match('/safeRuntimeBehaviors.{0,300}"aviso"/s', $json) === 1);
$comprobar('interaction.behavior incluye aviso', preg_match('/"behavior":\[[^\]]*"marquesina","aviso"[,\]]/', $json) === 1);
$comprobar('constraints describe aviso', strpos($json, 'aviso sólo en un nodo group con al menos 1 hijo') !== false);
$comprobar('constraints dice que no admite parámetros de la regla', strpos($json, 'aviso no admite threshold, targetId, toggleClass, mode, visible ni visibleMobile') !== false);
$comprobar('behaviorContracts lista las partes velo, panel y cerrar', preg_match('/"aviso":\{"atributoRol":"data-cod-aviso-rol","partes":\{"velo":.*"panel":.*"cerrar":/s', $json) === 1);
$comprobar('la descripción de «partes» menciona aviso', strpos($json, 'hoy pestanas, cuadrantes, marquesina, aviso') !== false);

echo "\n== aviso_css() ==\n";
$css = COD_Canvas_Page_Publisher::aviso_css();
$comprobar('con html null emite la hoja', $css !== '');
$comprobar('sin mención en la página no emite nada', COD_Canvas_Page_Publisher::aviso_css('<div>hola</div>') === '');
$comprobar('la palabra «aviso» en un texto no basta: hace falta declarar el behavior', COD_Canvas_Page_Publisher::aviso_css('<p>Aviso importante</p>') === '');
$comprobar('con el behavior declarado emite la hoja', COD_Canvas_Page_Publisher::aviso_css('<div data-cod-behavior="aviso"></div>') === $css);

// Todo lo que NO es @keyframes ni @media/@supports (que sólo envuelven reglas) se mira regla por regla.
$sinKeyframes = (string) preg_replace('/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})+\}/', '', $css);
preg_match_all('/([^{}@]+)\{([^{}]*)\}/', $sinKeyframes, $reglas, PREG_SET_ORDER);
$sinAnclar = [];
foreach ($reglas as $parte) {
    if (strpos($parte[1], '.cod-aviso') === false) { $sinAnclar[] = trim($parte[1]); }
}
$comprobar('hay reglas que mirar (' . count($reglas) . ')', count($reglas) >= 8);
$comprobar('TODA regla cuelga de .cod-aviso (que sólo pone el runtime): sin guion el contenido queda en el flujo normal', $sinAnclar === []);
if ($sinAnclar !== []) { echo '           sueltas: ' . implode(' | ', $sinAnclar) . "\n"; }
$ocultan = [];
foreach ($reglas as $parte) {
    if (preg_match('/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0\b/', $parte[2]) === 1) { $ocultan[] = trim($parte[1]); }
}
$comprobar('lo único que oculta es el estado «cerrado» (que pone el runtime)', count($ocultan) === 1 && strpos($ocultan[0], '[data-cod-aviso-estado="cerrado"]') !== false);
$comprobar('«cerrado» no se ve (display:none !important)', strpos($css, '[data-cod-aviso-estado="cerrado"]{display:none !important;}') !== false);
$comprobar('«abierto» es una capa fija a pantalla completa', preg_match('/\[data-cod-aviso-estado="abierto"\]\{position:fixed;top:0;right:0;bottom:0;left:0;display:flex;/', $css) === 1);
$comprobar('el panel hace scroll por dentro (el aviso nunca excede la ventana)', strpos($css, 'overflow-y:auto') !== false && strpos($css, 'max-height:calc(100dvh - 2rem)') !== false);
$comprobar('la X es sticky (queda a la vista si el contenido es largo)', strpos($css, 'position:sticky;top:0') !== false);
$comprobar('no se bloquea el scroll de la página (ningún overflow sobre body/html)', preg_match('/\b(body|html)\b/', $css) === 0);
$comprobar('la X mide al menos 44px (2.75rem) por omisión', strpos($css, 'width:2.75rem;height:2.75rem') !== false);

$comprobar('existe @media (prefers-reduced-motion:no-preference)', strpos($css, '@media (prefers-reduced-motion:no-preference){') !== false);
$sinMovimiento = (string) preg_replace('/@media \(prefers-reduced-motion:no-preference\)\{.*\}$/s', '', $css);
$comprobar('toda animación vive dentro de no-preference (con movimiento reducido el aviso aparece sin animar)', stripos($sinMovimiento, 'animation') === false && stripos($sinMovimiento, '@keyframes') === false && stripos($sinMovimiento, 'transition') === false);
$comprobar('la animación usa el token --cod-motion-enter (no inventa duraciones)', substr_count($css, 'var(--cod-motion-enter)') === 2 && !preg_match('/\d+m?s\b/', $css));
$comprobar('sin colores de marca (ningún #hex ni rgb/hsl)', preg_match('/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/', $css) === 0);
$comprobar('sin var(--cod-color-*, respaldo): el set de diseño es cerrado y lo no declarado no se inventa', strpos($css, '--cod-color-') === false);
$comprobar('el panel usa colores del sistema (Canvas y CanvasText), no uno de marca', strpos($css, 'background-color:Canvas;color:CanvasText') !== false);
$comprobar('sin tipografía (ningún font-*)', strpos($css, 'font') === false);
$comprobar('sin degradados', stripos($css, 'gradient') === false);
$comprobar('sin abreviadas con variable (background/border/font/margin/padding: ... var())', preg_match('/(?<![-\w])(background|border|font|margin|padding)\s*:[^;}]*var\(/', $css) === 0);
$comprobar('valores por omisión con especificidad cero (:where)', strpos($css, ':where(') !== false);
$comprobar('el ancho máximo sale de --cod-aviso-ancho-maximo (32rem por omisión)', strpos($css, 'max-width:var(--cod-aviso-ancho-maximo,32rem)') !== false);
$comprobar('el velo sólo se pinta si el navegador sabe mezclar colores (@supports color-mix)', strpos($css, '@supports (background-color:color-mix(in srgb,red 50%,transparent)){:where(.cod-aviso[data-cod-behavior="aviso"] > .cod-aviso__velo){background-color:color-mix(in srgb,CanvasText 55%,transparent);}}') !== false);
echo '           tamaño de la hoja: ' . strlen($css) . " bytes\n";

echo "\n== la hoja llega a la página ==\n";
$fuente = file_get_contents(__DIR__ . '/../contope-publisher/includes/class-cod-canvas-page-publisher.php');
$comprobar('aviso_css() se emite en las dos rutas (plantilla y shortcode)', substr_count($fuente, 'self::aviso_css($header_html . $body_html . $footer_html)') === 2);
$comprobar('la versión del plugin es 0.3.46 o posterior', version_compare(COD_PUBLISHER_VERSION, '0.3.46', '>='));

echo $fallas === 0 ? "\nTODO OK\n" : "\n" . $fallas . " FALLA(S)\n";
exit($fallas === 0 ? 0 : 1);
