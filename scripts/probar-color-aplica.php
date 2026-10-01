<?php
/**
 * Verifica que la regla `color` pinte de verdad, con cualquier nombre de rol:
 *  - un rol inventado ("titulo") sin apply pinta como texto (color:)
 *  - los atajos por nombre se conservan (background/surface/canvas -> fondo,
 *    text/ink -> texto) cuando no viene apply
 *  - apply explícito manda, sea cual sea el nombre del rol
 *  - un apply distinto de "text"/"background" es rechazado con error claro
 *
 * Corre contra el WordPress local de Econut (puerto 8891), que ya tiene el
 * plugin cargado: hay que sincronizar repo -> wp-local-econut antes.
 * Nunca contra wp-local (ése es Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$regla = function (string $id, array $valor): array {
    return [
        'id' => $id,
        'kind' => 'color',
        'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba de la regla color.']]],
        'status' => 'reviewed',
        'value' => $valor,
    ];
};

$diseno = function (array $reglas): array {
    return [
        'schemaVersion' => 1,
        'designId' => 'prueba-color-aplica',
        'expectedDesignRevision' => 0,
        'reviewState' => 'session',
        'rules' => $reglas,
    ];
};

$composicion = function (array $ids): array {
    $hijos = [];
    foreach ($ids as $i => $id) {
        $hijos[] = ['id' => 'titulo-' . $i, 'kind' => 'heading', 'ruleIds' => [$id],
            'content' => ['level' => 2, 'text' => 'Titulo ' . $i]];
    }
    return ['schemaVersion' => 2, 'nodes' => [['id' => 'seccion-prueba', 'kind' => 'section', 'children' => $hijos]]];
};

$fallas = 0;
$comprobar = function (string $caso, bool $ok) use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . "\n";
    if (!$ok) { $fallas++; }
};

/** Devuelve el cuerpo de la regla `.cod-rule--<id>` sin espacios, o '' si no existe. */
$cuerpo = function (string $css, string $id): string {
    $css = str_replace(' ', '', $css);
    return preg_match('/\.cod-rule--' . preg_quote($id, '/') . '\{([^}]*)\}/', $css, $m) ? $m[1] : '';
};

echo "\n== compilacion con roles inventados, atajos y apply explicito ==\n";
$reglas = [
    $regla('c-titulo', ['role' => 'titulo', 'color' => '#DC4017']),
    $regla('c-acento', ['role' => 'acento', 'color' => '#112233']),
    $regla('c-fondo-atajo', ['role' => 'background', 'color' => '#eeeeee']),
    $regla('c-surface-atajo', ['role' => 'surface', 'color' => '#dddddd']),
    $regla('c-ink-atajo', ['role' => 'ink', 'color' => '#111111']),
    $regla('c-titulo-fondo', ['role' => 'titulo', 'color' => '#00aa00', 'apply' => 'background']),
    $regla('c-fondo-texto', ['role' => 'background', 'color' => '#0000ff', 'apply' => 'text']),
    $regla('c-explicito-texto', ['role' => 'acento', 'color' => '#ff00ff', 'apply' => 'text']),
];
$ids = array_map(function ($r) { return $r['id']; }, $reglas);
$r = $compilador->compile($composicion($ids), $diseno($reglas));
if (is_wp_error($r)) {
    echo '  FALLA  el compilador rechazo una composicion valida: ' . $r->get_error_message() . "\n";
    $fallas++;
} else {
    $css = $r['storage']['styles'];
    $c = function (string $id) use ($cuerpo, $css) { return $cuerpo($css, $id); };
    $comprobar('rol "titulo" sin apply: emite la variable', strpos($c('c-titulo'), '--cod-color-titulo:#DC4017;') !== false);
    $comprobar('rol "titulo" sin apply: PINTA como texto (color:#DC4017)', strpos($c('c-titulo'), ';color:#DC4017;') !== false);
    $comprobar('rol "titulo" sin apply: no toca el fondo', strpos($c('c-titulo'), 'background-color') === false);
    $comprobar('rol "acento" sin apply: pinta como texto', strpos($c('c-acento'), ';color:#112233;') !== false);
    $comprobar('atajo background sin apply: sigue pintando fondo', strpos($c('c-fondo-atajo'), 'background-color:#eeeeee;') !== false);
    $comprobar('atajo background sin apply: no pinta texto', strpos($c('c-fondo-atajo'), ';color:') === false);
    $comprobar('atajo surface sin apply: sigue pintando fondo', strpos($c('c-surface-atajo'), 'background-color:#dddddd;') !== false);
    $comprobar('atajo ink sin apply: sigue pintando texto', strpos($c('c-ink-atajo'), ';color:#111111;') !== false);
    $comprobar('apply=background en rol "titulo": pinta fondo', strpos($c('c-titulo-fondo'), 'background-color:#00aa00;') !== false);
    $comprobar('apply=background en rol "titulo": no pinta texto', strpos($c('c-titulo-fondo'), ';color:') === false);
    $comprobar('apply=text en rol "background": pinta texto', strpos($c('c-fondo-texto'), ';color:#0000ff;') !== false);
    $comprobar('apply=text en rol "background": no pinta fondo', strpos($c('c-fondo-texto'), 'background-color') === false);
    $comprobar('apply=text en rol "acento": pinta texto', strpos($c('c-explicito-texto'), ';color:#ff00ff;') !== false);
}

echo "\n== apply invalido: tiene que ser rechazado ==\n";
foreach (['border', 'Text', '', 5, true] as $malo) {
    $rm = $compilador->compile(
        $composicion(['c-malo']),
        $diseno([$regla('c-malo', ['role' => 'titulo', 'color' => '#DC4017', 'apply' => $malo])])
    );
    $comprobar('apply=' . var_export($malo, true) . ' da error',
        is_wp_error($rm));
    if (is_wp_error($rm)) {
        echo '           -> ' . $rm->get_error_code() . ': ' . $rm->get_error_message() . "\n";
    }
}

echo "\n== clave desconocida sigue rechazada ==\n";
$rk = $compilador->compile(
    $composicion(['c-k']),
    $diseno([$regla('c-k', ['role' => 'titulo', 'color' => '#DC4017', 'foo' => 'x'])])
);
$comprobar('una clave que no es role/color/apply da error', is_wp_error($rk));

echo "\n== catalogo de capacidades ==\n";
$cat = $compilador->capability_catalog();
$json = json_encode($cat, JSON_UNESCAPED_UNICODE);
$comprobar('el catalogo menciona apply en la regla color', is_string($json) && strpos($json, 'apply') !== false);

echo "\n" . ($fallas === 0 ? "todo en orden\n" : $fallas . " comprobaciones fallaron\n");
exit($fallas === 0 ? 0 : 1);
