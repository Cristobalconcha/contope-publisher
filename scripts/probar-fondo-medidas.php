<?php
/**
 * Verifica 0.3.41: la imagen de fondo de una regla `surface` se coloca y
 * dimensiona con medidas, no sólo con palabras.
 *
 * Lo que se mide:
 *  - center / cover (y sin declarar nada) → idéntico a lo emitido antes, byte a byte
 *  - size `7% auto`, position `2% 50%`    → salen tal cual (el caso de econut.cl)
 *  - repeat no-repeat / repeat-x          → sale
 *  - con velo y medidas                   → tres propiedades con dos valores; la
 *                                           capa del velo en cover y 50% 50%, y la
 *                                           foto con lo que pide la regla
 *  - se rechazan nombrando el campo: calc(), var(), url(javascript:), `red; color: blue`,
 *    tres componentes, una unidad inventada (7foo), un salto de línea colado,
 *    un repeat desconocido, un size negativo
 *  - ningún caso emite la abreviada `background:`
 *
 * Corre contra el WordPress local de Econut (puerto 8891): sincronizar antes con
 *   node scripts/sincronizar-plugin.mjs --a econut --aplicar
 * Nunca contra wp-local (ése es Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$URL = '/wp-content/uploads/triangulo.svg';

$composicion = [
    'schemaVersion' => 2,
    'nodes' => [[
        'id' => 'aviso',
        'kind' => 'section',
        'ruleIds' => ['fondo'],
        'children' => [
            ['id' => 'texto', 'kind' => 'paragraph', 'content' => ['text' => 'Aviso']],
        ],
    ]],
];

/** Compila una superficie con ese valor. Devuelve el CSS completo o el WP_Error. */
$compilar = function (array $valor) use ($compilador, $composicion) {
    $diseno = [
        'schemaVersion' => 1,
        'designId' => 'prueba-041',
        'expectedDesignRevision' => 0,
        'reviewState' => 'session',
        'rules' => [[
            'id' => 'fondo',
            'kind' => 'surface',
            'scope' => ['breakpoint' => 'all', 'state' => 'default'],
            'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.41.']]],
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

$cuerpoDe = function (array $valor) use ($compilar, $cuerpo): string {
    $css = $compilar($valor);
    if (is_wp_error($css)) {
        return 'ERROR: ' . $css->get_error_message();
    }
    return (string) $cuerpo($css);
};

$fallas = 0;
$total = 0;
$verifica = function (string $nombre, bool $bien, string $detalle) use (&$fallas, &$total): void {
    $total++;
    if (!$bien) {
        $fallas++;
    }
    printf("%s  %-46s  %s\n", $bien ? 'OK  ' : 'FALLA', $nombre, $detalle);
};

$img = 'background-image:url("' . $URL . '");';

// 1. Lo de siempre, byte a byte.
$c = $cuerpoDe(['backgroundAssetUrl' => $URL]);
$verifica('sin declarar nada (no cambia)', $c === 'position:relative;' . $img . 'background-repeat:no-repeat;background-position:center;background-size:cover;', $c);
$c = $cuerpoDe(['backgroundAssetUrl' => $URL, 'backgroundPosition' => 'center', 'backgroundSize' => 'cover']);
$verifica('center / cover (no cambia)', $c === 'position:relative;' . $img . 'background-repeat:no-repeat;background-position:center;background-size:cover;', $c);
foreach (['top left', 'bottom', 'center right', 'left top'] as $p) {
    $c = $cuerpoDe(['backgroundAssetUrl' => $URL, 'backgroundPosition' => $p, 'backgroundSize' => 'contain']);
    $verifica('palabras de siempre: ' . $p, $c === 'position:relative;' . $img . 'background-repeat:no-repeat;background-position:' . $p . ';background-size:contain;', $c);
}

// 2. El caso de econut.cl.
$c = $cuerpoDe(['backgroundAssetUrl' => $URL, 'backgroundSize' => '7% auto', 'backgroundPosition' => '2% 50%', 'backgroundRepeat' => 'no-repeat']);
$verifica('econut: 7% auto / 2% 50% / no-repeat', $c === 'position:relative;' . $img . 'background-repeat:no-repeat;background-position:2% 50%;background-size:7% auto;', $c);

// 3. Otras formas válidas.
$validos = [
    ['backgroundPosition', '50%'], ['backgroundPosition', '20px 10px'], ['backgroundPosition', 'left 20px'],
    ['backgroundPosition', 'center 30%'], ['backgroundPosition', '-5px 1.5rem'], ['backgroundPosition', '10vh top'],
    ['backgroundPosition', '0 0'],
    ['backgroundSize', '200px'], ['backgroundSize', '50% 100%'], ['backgroundSize', 'auto 40px'], ['backgroundSize', 'auto'], ['backgroundSize', '12.5vw auto'],
];
foreach ($validos as [$campo, $v]) {
    $c = $cuerpoDe(['backgroundAssetUrl' => $URL, $campo => $v]);
    $prop = $campo === 'backgroundPosition' ? 'background-position' : 'background-size';
    $verifica('válido ' . $campo . ': ' . $v, strpos($c, $prop . ':' . $v . ';') !== false, $c);
}
foreach (['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round'] as $r) {
    $c = $cuerpoDe(['backgroundAssetUrl' => $URL, 'backgroundRepeat' => $r]);
    $verifica('válido backgroundRepeat: ' . $r, strpos($c, 'background-repeat:' . $r . ';') !== false, $c);
}

// 4. Con velo: tres propiedades a dos valores.
$velo = 'color-mix(in srgb,#000000 60%,transparent)';
$c = $cuerpoDe(['backgroundAssetUrl' => $URL, 'overlayColor' => '#000000', 'overlayOpacity' => 0.6,
    'backgroundSize' => '7% auto', 'backgroundPosition' => '2% 50%', 'backgroundRepeat' => 'no-repeat']);
$esperado = 'position:relative;background-image:linear-gradient(' . $velo . ',' . $velo . '),url("' . $URL . '");'
    . 'background-repeat:no-repeat,no-repeat;background-position:50% 50%,2% 50%;background-size:cover,7% auto;';
$verifica('velo + medidas: dos capas alineadas', $c === $esperado, $c);
$c = $cuerpoDe(['backgroundAssetUrl' => $URL, 'overlayColor' => '#000000', 'overlayOpacity' => 0.6, 'backgroundRepeat' => 'repeat-x', 'backgroundSize' => '200px']);
$verifica(
    'velo + repeat-x + size 200px',
    strpos($c, 'background-repeat:no-repeat,repeat-x;') !== false && strpos($c, 'background-size:cover,200px;') !== false && strpos($c, 'background-position:center,center;') !== false,
    $c
);
$c = $cuerpoDe(['backgroundAssetUrl' => $URL, 'overlayColor' => '#000000', 'overlayOpacity' => 0.6]);
$verifica('velo sin medidas: igual que 0.3.40', strpos($c, 'background-repeat:no-repeat,no-repeat;background-position:center,center;background-size:cover,cover;') !== false, $c);

// 5. Rechazos, nombrando el campo.
$error = function (string $nombre, array $valor, string $debe) use ($compilar, $verifica, $URL): void {
    $r = $compilar(['backgroundAssetUrl' => $URL] + $valor);
    $verifica($nombre, is_wp_error($r) && strpos($r->get_error_message(), $debe) !== false, is_wp_error($r) ? $r->get_error_message() : 'NO dio error');
};
foreach (['backgroundPosition', 'backgroundSize'] as $campo) {
    $error($campo . ': calc()', [$campo => 'calc(100% - 10px)'], $campo);
    $error($campo . ': var()', [$campo => 'var(--x)'], $campo);
    $error($campo . ': url(javascript:)', [$campo => 'url(javascript:alert(1))'], $campo);
    $error($campo . ': punto y coma', [$campo => 'red; color: blue'], $campo);
    $error($campo . ': tres componentes', [$campo => '1px 2px 3px'], $campo);
    $error($campo . ': unidad inventada 7foo', [$campo => '7foo'], $campo);
    $error($campo . ': salto de línea colado', [$campo => "2% 50%\n"], $campo);
    $error($campo . ': llaves', [$campo => '1px}'], $campo);
    $error($campo . ': comillas', [$campo => '"1px"'], $campo);
    $error($campo . ': dos espacios', [$campo => '1px  2px'], $campo);
    $error($campo . ': largo excesivo', [$campo => str_repeat('1', 70) . 'px'], $campo);
    $error($campo . ': no es texto', [$campo => 5], $campo);
}
$error('backgroundSize: cover con otra componente', ['backgroundSize' => 'cover auto'], 'backgroundSize');
$error('backgroundSize: negativo', ['backgroundSize' => '-5px'], 'backgroundSize');
$error('backgroundPosition: top con medida', ['backgroundPosition' => 'top 20px'], 'backgroundPosition');
$error('backgroundPosition: dos horizontales', ['backgroundPosition' => 'left right'], 'backgroundPosition');
$error('backgroundRepeat: valor desconocido', ['backgroundRepeat' => 'repeat; x:y'], 'backgroundRepeat');
$error('backgroundRepeat: no-repeat repeat', ['backgroundRepeat' => 'no-repeat repeat'], 'backgroundRepeat');

// 6. Nunca la abreviada.
$todo = '';
foreach ([
    ['backgroundAssetUrl' => $URL],
    ['backgroundAssetUrl' => $URL, 'backgroundSize' => '7% auto', 'backgroundPosition' => '2% 50%', 'backgroundRepeat' => 'no-repeat'],
    ['backgroundAssetUrl' => $URL, 'overlayColor' => '#000000', 'overlayOpacity' => 0.6, 'backgroundSize' => '7% auto', 'backgroundPosition' => '2% 50%'],
] as $v) {
    $todo .= $cuerpoDe($v);
}
$verifica('sin la abreviada «background:»', preg_match('/(?:^|[;{])\s*background\s*:/', $todo) === 0, '');

printf("\n%d de %d.\n", $total - $fallas, $total);
exit($fallas === 0 ? 0 : 1);
