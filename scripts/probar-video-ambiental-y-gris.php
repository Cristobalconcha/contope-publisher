<?php
/**
 * Verifica las dos capacidades de 0.3.34:
 *  - video ambiental: content.ambient (autoplay loop muted playsinline, sin controls;
 *    matte gana sobre ambient; valor no booleano -> WP_Error)
 *  - regla media con filter (none|grayscale): grayscale emite filter:grayscale(1);
 *    valor fuera de lista -> WP_Error con las opciones
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
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.34.']]],
        'status' => 'reviewed',
        'value' => $valor,
    ];
};
$diseno = function (array $reglas): array {
    return ['schemaVersion' => 1, 'designId' => 'prueba-034', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas];
};
$composicion = function (array $hijos): array {
    return ['schemaVersion' => 2, 'nodes' => [['id' => 'seccion-prueba', 'kind' => 'section', 'children' => $hijos]]];
};
$video = function (string $id, array $extra, array $reglas = []): array {
    $n = ['id' => $id, 'kind' => 'video', 'content' => array_merge(['sourceUrl' => 'https://example.com/v.mp4'], $extra)];
    if ($reglas) { $n['ruleIds'] = $reglas; }
    return $n;
};
$img = function (string $id, array $reglas): array {
    return ['id' => $id, 'kind' => 'image', 'ruleIds' => $reglas, 'content' => ['assetUrl' => 'https://example.com/logo.png', 'alt' => 'Logo']];
};

$fallas = 0;
$comprobar = function (string $caso, bool $ok) use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . "\n";
    if (!$ok) { $fallas++; }
};

echo "\n== video: ambient ==\n";
$r = $compilador->compile($composicion([
    $video('v-normal', []),
    $video('v-false', ['ambient' => false]),
    $video('v-ambient', ['ambient' => true]),
    $video('v-matte', ['matte' => true]),
    $video('v-matte-ambient', ['matte' => true, 'ambient' => true]),
]), $diseno([]));
if (is_wp_error($r)) {
    echo '  FALLA  ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n";
    $fallas++;
} else {
    $m = $r['storage']['markup'];
    // Cada video se ubica por su id de nodo; se corta el markup en el <figure>/<div> de ese nodo.
    $trozo = function (string $id) use ($m): string {
        $p = strpos($m, $id);
        if ($p === false) { return ''; }
        $ini = max(strrpos(substr($m, 0, $p), '<figure'), strrpos(substr($m, 0, $p), '<div'));
        $fin = strpos($m, '</video>', $p);
        $fin2 = strpos($m, '</canvas>', $p);
        if ($fin2 !== false && ($fin === false || $fin2 < $fin + 300)) { $fin = $fin2; }
        return substr($m, (int) $ini, (int) $fin - (int) $ini + 9);
    };
    $n = $trozo('v-normal');
    echo '           v-normal:  ' . $n . "\n";
    $comprobar('sin ambient: emite controls', strpos($n, '<video controls') !== false);
    $comprobar('sin ambient: NO emite autoplay', strpos($n, 'autoplay') === false);
    $f = $trozo('v-false');
    $comprobar('ambient:false: emite controls y no autoplay', strpos($f, '<video controls') !== false && strpos($f, 'autoplay') === false);
    $a = $trozo('v-ambient');
    echo '           v-ambient: ' . $a . "\n";
    $comprobar('ambient:true: emite autoplay', strpos($a, 'autoplay') !== false);
    $comprobar('ambient:true: emite loop', preg_match('/<video[^>]*\bloop\b/', $a) === 1);
    $comprobar('ambient:true: emite muted', preg_match('/<video[^>]*\bmuted\b/', $a) === 1);
    $comprobar('ambient:true: emite playsinline', preg_match('/<video[^>]*\bplaysinline\b/', $a) === 1);
    $comprobar('ambient:true: NO emite controls', strpos($a, 'controls') === false);
    $comprobar('ambient:true: sin boton de sonido', stripos($a, '<button') === false && stripos($a, 'sound') === false);
    $comprobar('matte:true: sale por el compositor (data-cod-luma-matte)', substr_count($m, 'data-cod-luma-matte="1"') >= 1);
    $comprobar('matte:true + ambient:true: son 2 wrappers matte (manda matte)', substr_count($m, 'data-cod-luma-matte="1"') === 2);
    $comprobar('solo v-normal y v-false llevan controls (matte+ambient no)', substr_count($m, '<video controls') === 2);
    $comprobar('el unico video ambiental es v-ambient: 1 <video autoplay loop muted playsinline', substr_count($m, '<video autoplay loop muted playsinline') === 1);
}

echo "\n== video: ambient invalido -> WP_Error ==\n";
foreach (['true', 1, 'si', [], 0, 'false'] as $malo) {
    $rm = $compilador->compile($composicion([$video('v-malo', ['ambient' => $malo])]), $diseno([]));
    $comprobar('ambient=' . json_encode($malo) . ' da WP_Error', is_wp_error($rm));
    if (is_wp_error($rm)) { echo '           -> ' . $rm->get_error_code() . ': ' . $rm->get_error_message() . "\n"; }
}

echo "\n== media: filter ==\n";
$r2 = $compilador->compile(
    $composicion([
        $img('i-gris', ['m-gris']), $img('i-none', ['m-none']), $img('i-dim', ['m-dim']),
        $video('v-gris', [], ['m-gris']),
    ]),
    $diseno([
        $regla('m-gris', 'media', ['filter' => 'grayscale']),
        $regla('m-none', 'media', ['filter' => 'none', 'fit' => 'cover']),
        $regla('m-dim', 'media', ['filter' => 'grayscale', 'hover' => 'dim']),
    ])
);
if (is_wp_error($r2)) {
    echo '  FALLA  ' . $r2->get_error_code() . ': ' . $r2->get_error_message() . "\n";
    $fallas++;
} else {
    $css = str_replace(' ', '', $r2['storage']['styles']);
    $comprobar('grayscale emite filter:grayscale(1);', strpos($css, 'filter:grayscale(1);') !== false);
    $comprobar('grayscale cubre img, video y canvas de la regla m-gris', preg_match('/\.cod-rule--m-gris[^{]*img[^{]*video[^{]*canvas[^{]*\{[^}]*filter:grayscale\(1\);/', $css) === 1);
    $comprobar('filter:none no emite filter (solo fit)', preg_match('/\.cod-rule--m-none[^{]*\{[^}]*filter:/', $css) !== 1 && strpos($css, 'object-fit:cover;') !== false);
    $comprobar('grayscale + hover dim conserva el gris al oscurecer', strpos($css, 'filter:grayscale(1)brightness(.78);') !== false);
    preg_match_all('/[^}]*filter:[^}]*\}/', $css, $ms);
    foreach ($ms[0] as $linea) { echo '           css: ' . $linea . "\n"; }
}

echo "\n== media: filter invalido -> WP_Error ==\n";
foreach (['sepia', 'Grayscale', '', 1, true, ['grayscale']] as $malo) {
    $rm = $compilador->compile($composicion([$img('i-malo', ['m-malo'])]), $diseno([$regla('m-malo', 'media', ['filter' => $malo])]));
    $comprobar('filter=' . json_encode($malo) . ' da WP_Error', is_wp_error($rm));
    if (is_wp_error($rm)) { echo '           -> ' . $rm->get_error_code() . ': ' . $rm->get_error_message() . "\n"; }
}
$rs = $compilador->compile($composicion([$img('i-solo', ['m-solo'])]), $diseno([$regla('m-solo', 'media', [])]));
$comprobar('media vacia sigue rechazada', is_wp_error($rs));

echo "\n== catalogo de capacidades ==\n";
$json = json_encode($compilador->capability_catalog(), JSON_UNESCAPED_UNICODE);
$comprobar('el catalogo describe ambient', is_string($json) && strpos($json, 'ambient') !== false);
$comprobar('el catalogo describe filter none|grayscale', is_string($json) && strpos($json, '"filter":["none","grayscale"]') !== false);
$comprobar('atLeastOneOf de media incluye filter', is_string($json) && strpos($json, '"caption","filter"]') !== false);

echo "\n" . ($fallas === 0 ? "todo en orden\n" : $fallas . " comprobaciones fallaron\n");
exit($fallas === 0 ? 0 : 1);
