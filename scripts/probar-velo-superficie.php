<?php
/**
 * Verifica el velo plano de 0.3.40: una regla `surface` con `backgroundAssetUrl`
 * más `overlayColor`/`overlayOpacity` emite el velo como una capa de
 * background-image, y nada más cambia.
 *
 * Lo que se mide:
 *  - imagen sin velo       → idéntico a lo que se emitía antes (esto protege lo
 *                            que ya funciona)
 *  - imagen con velo       → DOS capas: linear-gradient(V,V) arriba y la foto
 *                            debajo; size y position con dos valores; el mismo
 *                            color en los dos extremos (opacidad pareja, nunca
 *                            un degradado); sin el ::before de antes
 *  - velo sin imagen       → sigue saliendo por el ::before de siempre (esa
 *                            ruta ya existía antes de 0.3.40 y no se rompe)
 *  - overlayOpacity sola   → error que nombra el campo (antes se descartaba)
 *  - opacidad 1.5 y -0.1   → error
 *  - color inválido        → error
 *  - ningún caso emite la abreviada `background:`
 *
 * Corre contra el WordPress local de Econut (puerto 8891): sincronizar antes con
 *   node scripts/sincronizar-plugin.mjs --a econut --aplicar
 * Nunca contra wp-local (ése es Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$URL = '/wp-content/uploads/portada-1600x1080.jpg';

$composicion = [
    'schemaVersion' => 2,
    'nodes' => [[
        'id' => 'portada',
        'kind' => 'section',
        'ruleIds' => ['fondo'],
        'children' => [
            ['id' => 'titulo', 'kind' => 'paragraph', 'content' => ['text' => 'Titulo']],
        ],
    ]],
];

/** Compila una superficie con ese valor. Devuelve el CSS completo o el WP_Error. */
$compilar = function (array $valor) use ($compilador, $composicion) {
    $diseno = [
        'schemaVersion' => 1,
        'designId' => 'prueba-040',
        'expectedDesignRevision' => 0,
        'reviewState' => 'session',
        'rules' => [[
            'id' => 'fondo',
            'kind' => 'surface',
            'scope' => ['breakpoint' => 'all', 'state' => 'default'],
            'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.40.']]],
            'status' => 'reviewed',
            'value' => $valor,
        ]],
    ];
    $salida = $compilador->compile($composicion, $diseno);
    if (is_wp_error($salida)) {
        return $salida;
    }
    return (string) ($salida['storage']['styles'] ?? '');
};

/** El cuerpo de la regla .cod-rule--fondo (las reglas base declaran las mismas propiedades). */
$cuerpo = function (string $css): ?string {
    return preg_match('/\.cod-rule--fondo\{([^}]*)\}/', $css, $m) === 1 ? $m[1] : null;
};

$fallas = 0;
$total = 0;
$verifica = function (string $nombre, bool $bien, string $detalle) use (&$fallas, &$total): void {
    $total++;
    if (!$bien) {
        $fallas++;
    }
    printf("%s  %-44s  %s\n", $bien ? 'OK  ' : 'FALLA', $nombre, $detalle);
};

// 1. Imagen sin velo: lo de siempre, byte a byte.
$css = $compilar(['backgroundAssetUrl' => $URL]);
$c = is_string($css) ? $cuerpo($css) : null;
$esperado = 'position:relative;background-image:url("' . $URL . '");background-repeat:no-repeat;background-position:center;background-size:cover;';
$verifica('imagen sin velo (no cambia nada)', $c === $esperado, (string) $c);

// 2. Imagen con velo.
$css = $compilar(['backgroundAssetUrl' => $URL, 'overlayColor' => '#000000', 'overlayOpacity' => 0.75]);
$c = is_string($css) ? $cuerpo($css) : null;
$velo = 'color-mix(in srgb,#000000 75%,transparent)';
$esperado = 'position:relative;background-image:linear-gradient(' . $velo . ',' . $velo . '),url("' . $URL . '");'
    . 'background-repeat:no-repeat,no-repeat;background-position:center,center;background-size:cover,cover;';
$verifica('imagen con velo: dos capas', $c === $esperado, (string) $c);
$verifica('velo: sin ::before duplicado', is_string($css) && strpos($css, '.cod-rule--fondo::before') === false, '');
// El mismo valor (con paréntesis anidados) en los dos extremos: opacidad pareja.
$verifica('velo: mismo color en los dos extremos', preg_match('/linear-gradient\((color-mix\([^)]*\))\s*,\s*\1\)/', (string) $c) === 1, '');

// 2b. Con tamaño y posición propios, y sin opacidad (por omisión 1).
$css = $compilar(['backgroundAssetUrl' => $URL, 'overlayColor' => 'rgb(0 0 0)', 'backgroundSize' => 'contain', 'backgroundPosition' => 'top left']);
$c = is_string($css) ? $cuerpo($css) : null;
$verifica(
    'velo: size y position a dos valores',
    $c !== null && strpos($c, 'background-position:top left,top left;background-size:contain,contain;') !== false
        && strpos($c, 'linear-gradient(rgb(0 0 0),rgb(0 0 0)),url(') !== false,
    (string) $c
);

// 3. Velo sin imagen: la ruta de antes (::before), intacta.
$css = $compilar(['backgroundColor' => '#ffffff', 'overlayColor' => '#000000', 'overlayOpacity' => 0.5]);
$verifica(
    'velo sin imagen: sigue por ::before',
    is_string($css) && strpos($css, '.cod-rule--fondo::before{content:"";position:absolute;inset:0;background-color:#000000;opacity:0.5;') !== false,
    is_wp_error($css) ? $css->get_error_message() : 'ok'
);

// 4. Errores.
$error = function (string $nombre, array $valor, string $debe) use ($compilar, $verifica): void {
    $r = $compilar($valor);
    $verifica($nombre, is_wp_error($r) && strpos($r->get_error_message(), $debe) !== false, is_wp_error($r) ? $r->get_error_message() : 'NO dio error');
};
$error('overlayOpacity sin overlayColor', ['backgroundAssetUrl' => $URL, 'overlayOpacity' => 0.5], 'overlayOpacity');
$error('opacidad 1.5', ['backgroundAssetUrl' => $URL, 'overlayColor' => '#000', 'overlayOpacity' => 1.5], 'overlayOpacity');
$error('opacidad -0.1', ['backgroundAssetUrl' => $URL, 'overlayColor' => '#000', 'overlayOpacity' => -0.1], 'overlayOpacity');
$error('color inválido', ['backgroundAssetUrl' => $URL, 'overlayColor' => 'rojo; x:y', 'overlayOpacity' => 0.5], 'overlayColor');

// 5. Nunca la abreviada.
$todo = '';
foreach ([
    ['backgroundAssetUrl' => $URL],
    ['backgroundAssetUrl' => $URL, 'overlayColor' => '#000000', 'overlayOpacity' => 0.6],
    ['backgroundColor' => '#fff', 'overlayColor' => '#000'],
] as $v) {
    $r = $compilar($v);
    $c = is_string($r) ? $cuerpo($r) : null;
    $todo .= (string) $c;
}
$verifica('sin la abreviada «background:»', preg_match('/(?:^|[;{])\s*background\s*:/', $todo) === 0, '');

printf("\n%d de %d.\n", $total - $fallas, $total);
exit($fallas === 0 ? 0 : 1);
