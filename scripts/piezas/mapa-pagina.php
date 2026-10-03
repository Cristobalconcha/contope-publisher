<?php
/**
 * Compila, con el compilador real del plugin, una página mínima con un mapa
 * (el caso del pie de Econut: el mini mapa y la dirección escrita al lado) y escribe
 * en la salida estándar, como JSON, lo que hace falta para armar una página de prueba:
 *   - markup        el HTML GUARDADO (sin la clave)
 *   - conClave      ese HTML tal como se MUESTRA con la clave configurada (COD_Mapa::resolver_en_html)
 *   - sinClave      ese HTML tal como se muestra SIN clave
 *   - styles        los estilos de las reglas
 *   - mapaCss       la hoja del behavior (mapa_css)
 *   - clave         la clave de prueba, para comprobar que llega al runtime
 *
 * Argumentos: «peligroso» pone HTML y un enlace en el texto del globo (el compilador debe
 * escaparlos); «pintado» pone el radio y los colores de la marca sobre las partes.
 *
 * Lo usa scripts/probar-mapa.mjs. NO compone ni toca ninguna página del sitio: sólo carga
 * WordPress para tener las clases del plugin. Guarda y RESTAURA la opción de la clave del
 * WordPress de pruebas. Corre contra el WordPress local de Econut, nunca contra wp-local.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../../wp-local-econut/wordpress/wp-load.php';

$CLAVE = 'pk.eyJ1IjoicHJ1ZWJhIiwiYSI6ImNsYXZlZGVwcnVlYmEifQ.AbCdEfGhIjKlMnOpQrStUv';
$previa = get_option(COD_Mapa::OPTION_KEY, null);

$regla = function (string $id, string $kind, array $valor): array {
    return [
        'id' => $id,
        'kind' => $kind,
        'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Página de prueba del mapa.']]],
        'status' => 'reviewed',
        'value' => $valor,
    ];
};

$peligroso = in_array('peligroso', $argv ?? [], true);
$pintado = in_array('pintado', $argv ?? [], true);

$diseno = [
    'schemaVersion' => 1,
    'designId' => 'prueba-mapa',
    'expectedDesignRevision' => 0,
    'reviewState' => 'session',
    'rules' => [
        $regla('r-mapa', 'interaction', ['behavior' => 'mapa']),
        $regla('r-alto', 'properties', ['declarations' => ['--cod-mapa-alto' => '400px', '--cod-mapa-ancho-maximo' => '1280px']]),
    ],
];
$partes = [];
if ($pintado) {
    $diseno['rules'][] = $regla('r-radio', 'shape', ['radius' => '8px']);
    $diseno['rules'][] = $regla('r-grande-color', 'surface', ['backgroundColor' => '#faf5eb', 'foregroundColor' => '#28321e']);
    $diseno['rules'][] = $regla('r-x-color', 'surface', ['foregroundColor' => '#7a2e1d']);
    $partes = ['mini' => ['r-radio'], 'grande' => ['r-radio', 'r-grande-color'], 'cerrar' => ['r-x-color']];
}

$globo = $peligroso
    ? '<img src=x onerror="window.__xss=1"> <b>negrita</b> & [www.econut.cl](https://www.econut.cl)'
    : 'Av 18 de Septiembre sn Hijuela 2, Fundo San Rafael, Paine';

$composicion = [
    'schemaVersion' => 2,
    'nodes' => [[
        'id' => 'pagina',
        'kind' => 'section',
        'children' => [
            ['id' => 'enlace-antes', 'kind' => 'link', 'content' => ['label' => 'Un enlace antes del mapa', 'href' => '#cotizar']],
            [
                'id' => 'mapa-pie',
                'kind' => 'group',
                'ruleIds' => ['r-mapa', 'r-alto'],
                'partes' => $partes,
                'content' => [
                    'lat' => -33.80413624737442,
                    'lng' => -70.68161681668681,
                    'zoom' => 17,
                    'mini' => '/mini-mapa.png',
                    'etiqueta' => 'Abrir el mapa de la planta de Paine',
                    'globo' => $globo,
                    'globoEnlaceTexto' => 'www.econut.cl',
                    'globoEnlaceHref' => 'https://www.econut.cl',
                ],
                'children' => [
                    ['id' => 'direccion', 'kind' => 'paragraph', 'content' => ['text' => 'Av 18 de Septiembre sn Hijuela 2, Fundo San Rafael - Sector Nuevo Sendero, Paine, Región Metropolitana']],
                ],
            ],
            ['id' => 'enlace-despues', 'kind' => 'link', 'content' => ['label' => 'Un enlace después del mapa', 'href' => '#fin']],
        ],
    ]],
];

update_option(COD_Mapa::OPTION_KEY, $CLAVE, false);
$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$salida = $compilador->compile($composicion, $diseno);
if (is_wp_error($salida)) {
    fwrite(STDERR, $salida->get_error_code() . ': ' . $salida->get_error_message() . "\n");
    exit(1);
}
$markup = (string) $salida['storage']['markup'];
$con = COD_Mapa::resolver_en_html($markup);
update_option(COD_Mapa::OPTION_KEY, '', false);
$sin = COD_Mapa::resolver_en_html($markup);
if ($previa === null) { delete_option(COD_Mapa::OPTION_KEY); } else { update_option(COD_Mapa::OPTION_KEY, $previa, false); }

echo wp_json_encode([
    'markup' => $markup,
    'conClave' => $con,
    'sinClave' => $sin,
    'styles' => (string) $salida['storage']['styles'],
    'mapaCss' => COD_Canvas_Page_Publisher::mapa_css($markup),
    'clave' => $CLAVE,
]);
