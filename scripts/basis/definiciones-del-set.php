<?php
/**
 * Las DEFINICIONES DE ESTILO del tema de Basis (ContOpe → Configuración), declaradas desde
 * el propio tema y no a mano en la pantalla.
 *
 * POR QUÉ EXISTE. El sitio de Basis se compone con variables del set (`var(--cod-color-accent)`,
 * `var(--cod-font-body)`…): el transcriptor ya no copia colores ni tipografías literales. Esas
 * variables las emite el plugin desde la opción `cod_theme_definitions`; si la opción está vacía,
 * el sitio queda con propiedades sin resolver. Este guion la llena, de forma reproducible:
 *
 *   - los COLORES salen de la paleta del `theme.json` del tema activo, por slug (una sola fuente:
 *     si el naranja cambia en el tema, se vuelve a correr esto y las definiciones lo siguen);
 *   - el ancho máximo sale del `contentSize` del mismo `theme.json`;
 *   - el ícono del sitio es el adjunto que hoy es `site_icon`;
 *   - las tipografías son las del sitio original (Google Fonts) y el movimiento usa los valores de
 *     ejemplo del propio esquema (`placeholder`).
 *
 * Es idempotente: correrlo dos veces deja lo mismo. Sólo toca esa opción.
 *
 *   php -c <php.ini> scripts/basis/definiciones-del-set.php [--solo-ver] [--acento=#RRGGBB]
 *
 *   --solo-ver        calcula e imprime, no guarda.
 *   --acento=#RRGGBB  fuerza otro color de acento (la prueba de gobierno); sin esto vale el del theme.json.
 *   --titulos=Familia fuerza otra familia para Títulos (la prueba de gobierno); sin esto, Big Shoulders Display.
 *
 * Corre contra el WordPress local de Basis (`WP_LOAD` para apuntar a otro). Nunca al de Santa Luisa.
 */
define('WP_USE_THEMES', false);
require getenv('WP_LOAD') ?: 'C:/Users/Cristobal concha/wp-local-basis/wordpress/wp-load.php';

$soloVer = in_array('--solo-ver', $argv, true);
$acentoForzado = '';
$titulosForzado = '';
foreach ($argv as $a) {
    if (strpos($a, '--acento=') === 0) {
        $acentoForzado = substr($a, 9);
    }
    if (strpos($a, '--titulos=') === 0) {
        $titulosForzado = substr($a, 10);
    }
}

// ---- lo que declara el tema -------------------------------------------------------------------
$ajustes = wp_get_global_settings();
$paleta = [];
foreach (($ajustes['color']['palette']['theme'] ?? []) as $c) {
    $paleta[(string) $c['slug']] = strtoupper((string) $c['color']);
}
$exigir = static function (string $slug) use ($paleta): string {
    if (!isset($paleta[$slug])) {
        fwrite(STDERR, "el theme.json del tema activo no declara el color «$slug»\n");
        exit(1);
    }
    return $paleta[$slug];
};
$ancho = (string) ($ajustes['layout']['contentSize'] ?? '');
$anchoPx = preg_match('/^(\d+)px$/', $ancho, $m) === 1 ? $m[1] : '';

// ---- el esquema manda: los movimientos de ejemplo salen de sus placeholders -------------------
$ejemplo = [];
foreach (COD_Theme_Definitions::schema() as $grupo) {
    foreach ($grupo['fields'] as $campo) {
        if (($campo['type'] ?? '') === 'motion') {
            $ejemplo[$campo['id']] = (string) ($campo['placeholder'] ?? '');
        }
    }
}

$icono = (int) get_option('site_icon');
$urlIcono = $icono > 0 ? (string) wp_get_attachment_url($icono) : '';

$valores = [
    'favicon' => $urlIcono,
    'mode' => 'light',
    'color_bg' => $exigir('background'),
    'color_text' => $exigir('text'),
    // «Primario»: el gris del encabezado y el pie (slug `gris`).
    'color_primary' => $exigir('gris'),
    'color_accent' => $acentoForzado !== '' ? strtoupper($acentoForzado) : $exigir('accent'),
    'font_heading' => $titulosForzado !== '' ? $titulosForzado : 'Big Shoulders Display',
    'font_body' => 'Open Sans',
    'font_accent' => 'Montserrat',
    // El ancho es el rol «medida» del núcleo. NO se activa el modo «enclaustrado»: ese modo
    // encierra el lienzo entero en la caja y los fondos de sección dejarían de ir de borde a borde.
    'layout_max_width' => $anchoPx,
    'motion_enter' => $ejemplo['motion_enter'] ?? '',
    'motion_response' => $ejemplo['motion_response'] ?? '',
];

$limpios = COD_Theme_Definitions::sanitize($valores);
$perdidos = [];
foreach ($valores as $k => $v) {
    if ($v !== '' && ($limpios[$k] ?? '') !== $v) {
        $perdidos[] = $k . ' (pedido «' . $v . '», el esquema dejó «' . ($limpios[$k] ?? '') . '»)';
    }
}
if ($perdidos) {
    fwrite(STDERR, "el esquema descartó valores:\n  - " . implode("\n  - ", $perdidos) . "\n");
    exit(1);
}

$guardar = array_filter($limpios, static fn ($v) => $v !== '');
echo wp_json_encode($guardar, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n";
if ($soloVer) {
    echo "(solo-ver: no se guardó)\n";
    exit(0);
}
update_option(COD_Theme_Definitions::OPTION_KEY, wp_json_encode($guardar));

// ---- comprobación: el núcleo no debe tener nada sin declarar ------------------------------------
$faltan = COD_Design_Core::faltantes();
echo $faltan === []
    ? "COD_Design_Core::estado(): todos los roles declarados.\n"
    : 'FALTAN: ' . implode(', ', array_map(static fn ($f) => $f['rol'], $faltan)) . "\n";
exit($faltan === [] ? 0 : 2);
