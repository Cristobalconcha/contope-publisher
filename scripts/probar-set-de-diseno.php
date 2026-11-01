<?php
/**
 * El set de diseño gobierna un sitio sólo si el plugin deja ESCRIBIRLO con variables: lo que esta prueba cubre.
 *
 * DE DÓNDE SALE. El transcriptor de Divi (scripts/divi-a-contope/lib/tokens.mjs) ya no copia colores ni
 * tipografías: traduce cada valor al set. Eso exige tres cosas del plugin, y las tres se comprueban acá:
 *
 *  1. Un color con alfa se escribe como `color-mix(in srgb, var(--token) N%, transparent)` y las reglas semánticas
 *     (color, surface, degradado) lo aceptan. Sólo esa forma exacta: no se anidan funciones, ni otro espacio de
 *     color, ni un segundo color, ni un porcentaje fuera de 0–100, ni nada que cierre la declaración.
 *  2. Las definiciones de estilo aceptan CUALQUIER familia de Google Fonts (catálogo de fonts.google.com), más las
 *     que el tema declara en su theme.json (Basis tiene 'Big Shoulders Display', que Google ya renombró), y siguen
 *     descartando lo que no es una familia.
 *  3. Nada de lo anterior cambia lo que ya emitían las definiciones: el CSS de una configuración con las familias de
 *     siempre sale idéntico.
 *
 * Corre contra el WordPress local de Basis (banco de pruebas). Nunca contra wp-local (espejo de Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$css_de = static function (string $kind, array $value) use ($compilador) {
    $r = $compilador->compile(
        ['schemaVersion' => 2, 'nodes' => [['id' => 'n', 'kind' => 'paragraph', 'ruleIds' => ['r'], 'content' => ['text' => 'x']]]],
        ['schemaVersion' => 1, 'designId' => 'prueba-set', 'expectedDesignRevision' => 0, 'reviewState' => 'session',
         'rules' => [[
            'id' => 'r', 'kind' => $kind, 'scope' => ['breakpoint' => 'all', 'state' => 'default'],
            'provenance' => ['sources' => [['kind' => 'reference', 'reference' => 'set de diseño', 'rationale' => 'Un color con alfa del set.']]],
            'status' => 'reviewed', 'value' => $value,
         ]]]
    );
    return is_wp_error($r) ? ['error' => $r->get_error_message()] : ['css' => (string) $r['storage']['styles']];
};

echo "\n== un color con alfa del set se acepta ==\n";
$mix = 'color-mix(in srgb, var(--wp--preset--color--accent) 20%, transparent)';
$c = $css_de('color', ['role' => 'velo', 'color' => $mix, 'apply' => 'background']);
$comprobar('color.color', isset($c['css']) && strpos($c['css'], 'background-color:' . $mix) !== false, $c['error'] ?? '');
$s = $css_de('surface', ['backgroundColor' => $mix]);
$comprobar('surface.backgroundColor', isset($s['css']) && strpos($s['css'], $mix) !== false, $s['error'] ?? '');
$g = $css_de('surface', ['backgroundGradient' => ['type' => 'linear', 'stops' => [['color' => 'var(--wp--preset--color--ink)', 'at' => '0%'], ['color' => 'color-mix(in srgb, var(--wp--preset--color--ink) 0%, transparent)', 'at' => '100%']]]]);
$comprobar('parada de degradado', isset($g['css']) && strpos($g['css'], 'color-mix(in srgb, var(--wp--preset--color--ink) 0%, transparent)') !== false, $g['error'] ?? '');
foreach (['12.5%' => 'color-mix(in srgb, var(--cod-color-accent) 12.5%, transparent)', 'hex' => 'color-mix(in srgb, #F26621 40%, transparent)', 'rgb' => 'color-mix(in srgb, rgb(0, 0, 0) 14%, transparent)'] as $nombre => $valor) {
    $r = $css_de('color', ['role' => 'velo', 'color' => $valor]);
    $comprobar("variante $nombre", isset($r['css']), $r['error'] ?? '');
}

echo "\n== y lo que no es esa forma exacta se rechaza ==\n";
$malos = [
    'otro espacio de color' => 'color-mix(in oklab, var(--a) 20%, transparent)',
    'un segundo color' => 'color-mix(in srgb, var(--a) 20%, red)',
    'más de 100%' => 'color-mix(in srgb, var(--a) 101%, transparent)',
    'función anidada' => 'color-mix(in srgb, color-mix(in srgb, var(--a) 50%, transparent) 20%, transparent)',
    'cierra la declaración' => 'color-mix(in srgb, var(--a) 20%, transparent);color:red',
    'url() en el respaldo' => 'color-mix(in srgb, var(--a, url(x)) 20%, transparent)',
    'sin porcentaje' => 'color-mix(in srgb, var(--a), transparent)',
    'expression' => 'color-mix(in srgb, expression(alert(1)) 20%, transparent)',
];
foreach ($malos as $nombre => $valor) {
    $r = $css_de('color', ['role' => 'velo', 'color' => $valor]);
    $comprobar("rechaza: $nombre", isset($r['error']));
}

echo "\n== las definiciones aceptan cualquier familia de Google ==\n";
$opcion = COD_Theme_Definitions::OPTION_KEY;
$antes = get_option($opcion, '');
// Aunque la prueba se corte a la mitad, las definiciones del sitio vuelven a como estaban.
register_shutdown_function(static function () use ($opcion, $antes) { update_option($opcion, $antes); });
$catalogo = COD_Theme_Definitions::google_font_families();
$comprobar('el catálogo de Google se lee', count($catalogo) > 1500, count($catalogo) . ' familias');
foreach (['Roboto', 'Montserrat', 'Open Sans', 'Lora', 'Birthstone'] as $f) {
    $comprobar("el catálogo trae $f", isset($catalogo[$f]));
}
$s = COD_Theme_Definitions::sanitize(['font_heading' => 'Lora', 'font_body' => 'Roboto', 'font_accent' => 'Montserrat']);
$comprobar('acepta Lora / Roboto / Montserrat en los tres roles', $s['font_heading'] === 'Lora' && $s['font_body'] === 'Roboto' && $s['font_accent'] === 'Montserrat');
$tema = COD_Theme_Definitions::theme_font_families();
$comprobar('lee las familias del theme.json del tema', in_array('Big Shoulders Display', $tema, true) && in_array('Roboto', $tema, true), implode(', ', $tema));
$s = COD_Theme_Definitions::sanitize(['font_heading' => 'Big Shoulders Display']);
$comprobar('acepta una familia del tema que Google ya no lista (Big Shoulders Display)', $s['font_heading'] === 'Big Shoulders Display');
$s = COD_Theme_Definitions::sanitize(['font_heading' => 'Esta Familia No Existe', 'font_body' => "x'; } body { display:none", 'font_accent' => 'lora']);
$comprobar('descarta lo que no es una familia (ni inventada, ni inyección, ni minúsculas)', $s['font_heading'] === '' && $s['font_body'] === '' && $s['font_accent'] === '');

echo "\n== el lienzo del editor recibe las variables del set ==\n";
$vars = COD_Design_Core::variables_del_tema();
$comprobar('variables_del_tema() trae la paleta y las familias del theme.json', strpos($vars, '--wp--preset--color--accent') !== false && strpos($vars, '--wp--preset--font-family--boton') !== false);

echo "\n== y lo que ya emitían las definiciones no cambia ==\n";
update_option($opcion, wp_json_encode(['font_heading' => 'Montserrat', 'font_body' => 'Lora', 'color_bg' => '#F6F6F3']));
$esperado = "/* Definiciones del tema — generado desde Configuración */\n:root{--cod-color-bg:#F6F6F3;--cod-font-heading:'Montserrat';--cod-font-body:'Lora';}\nbody{background-color:var(--cod-color-bg);font-family:var(--cod-font-body);}\nh1,h2,h3,h4,h5,h6{font-family:var(--cod-font-heading);}";
$comprobar('css() idéntico para las familias de siempre', COD_Theme_Definitions::css() === $esperado);
update_option($opcion, $antes);

echo "\n" . ($fallas === 0 ? 'todo ok' : "$fallas falla(s)") . "\n";
exit($fallas === 0 ? 0 : 1);
