<?php
/**
 * Compila, con el compilador real del plugin, una página mínima con un aviso
 * (el caso de las estafas: un título, el texto y los enlaces a las cuentas
 * oficiales) y escribe en la salida estándar, como JSON, lo que hace falta para
 * armar una página de prueba: el marcado, los estilos de las reglas y la hoja
 * del behavior (aviso_css).
 *
 * Lo usa scripts/probar-aviso.mjs. NO compone ni toca ninguna página del sitio:
 * sólo carga WordPress para tener las clases del plugin.
 *
 * Corre contra el WordPress local de Econut (puerto 8891), nunca contra wp-local.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../../wp-local-econut/wordpress/wp-load.php';

$regla = function (string $id, string $kind, array $valor): array {
    return [
        'id' => $id,
        'kind' => $kind,
        'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Página de prueba del aviso.']]],
        'status' => 'reviewed',
        'value' => $valor,
    ];
};

$diseno = [
    'schemaVersion' => 1,
    'designId' => 'prueba-aviso',
    'expectedDesignRevision' => 0,
    'reviewState' => 'session',
    'rules' => [
        $regla('r-aviso', 'interaction', ['behavior' => 'aviso']),
        // Un diseño mínimo del panel, como lo escribiría el sitio: sólo para que la página de prueba se vea como un aviso real.
        $regla('r-ancho', 'properties', ['declarations' => ['--cod-aviso-ancho-maximo' => '30rem']]),
        $regla('r-panel-aire', 'spacing', ['paddingBlock' => '28px', 'paddingInline' => '28px']),
    ],
];

// Con el argumento «pintado», el sitio pone los colores de su marca sobre las tres
// partes (panel, velo y X) con reglas de superficie: la prueba comprueba que esas
// reglas, tal como las emite el compilador, le ganan a los valores por omisión.
$pintado = in_array('pintado', $argv ?? [], true);
$partes = ['panel' => ['r-panel-aire']];
if ($pintado) {
    $diseno['rules'][] = $regla('r-panel-color', 'surface', ['backgroundColor' => '#faf5eb', 'foregroundColor' => '#28321e']);
    $diseno['rules'][] = $regla('r-velo-color', 'surface', ['backgroundColor' => '#0a141e']);
    $diseno['rules'][] = $regla('r-x-color', 'surface', ['foregroundColor' => '#7a2e1d']);
    $partes = ['panel' => ['r-panel-aire', 'r-panel-color'], 'velo' => ['r-velo-color'], 'cerrar' => ['r-x-color']];
}

$composicion = [
    'schemaVersion' => 2,
    'nodes' => [[
        'id' => 'pagina',
        'kind' => 'section',
        'children' => [
            ['id' => 'enlace-reabrir', 'kind' => 'link', 'content' => ['label' => 'Cómo verificar nuestras cuentas', 'href' => '#aviso-estafas']],
            ['id' => 'boton-pagina', 'kind' => 'button', 'content' => ['label' => 'Pedir cotización', 'href' => '#cotizar']],
            ['id' => 'texto-pagina', 'kind' => 'paragraph', 'content' => ['text' => 'Contenido de la página, detrás del aviso.']],
            [
                'id' => 'aviso-estafas',
                'kind' => 'group',
                'marker' => 'aviso-estafas',
                'ruleIds' => ['r-aviso', 'r-ancho'],
                'partes' => $partes,
                'children' => [
                    ['id' => 'aviso-titulo', 'kind' => 'heading', 'content' => ['text' => 'Cuidado: están vendiendo a nuestro nombre', 'level' => 2]],
                    ['id' => 'aviso-texto', 'kind' => 'paragraph', 'content' => ['text' => 'No tenemos tienda en línea. Verifica la cuenta antes de pagar: estas son las únicas oficiales.']],
                    ['id' => 'aviso-ig', 'kind' => 'social', 'content' => ['network' => 'instagram', 'url' => 'https://www.instagram.com/econutchile.oficial/']],
                    ['id' => 'aviso-fb', 'kind' => 'social', 'content' => ['network' => 'facebook', 'url' => 'https://www.facebook.com/econutchile']],
                ],
            ],
        ],
    ]],
];

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$salida = $compilador->compile($composicion, $diseno);
if (is_wp_error($salida)) {
    fwrite(STDERR, $salida->get_error_code() . ': ' . $salida->get_error_message() . "\n");
    exit(1);
}
$markup = (string) $salida['storage']['markup'];
echo wp_json_encode([
    'markup' => $markup,
    'styles' => (string) $salida['storage']['styles'],
    'avisoCss' => COD_Canvas_Page_Publisher::aviso_css($markup),
]);
