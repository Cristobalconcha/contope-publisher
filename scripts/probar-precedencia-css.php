<?php
/**
 * Verifica el arreglo de 0.3.42: lo que declara una regla de diseño manda sobre
 * el CSS base del canvas.
 *
 * El defecto: cada documento compilado (cabecera, cuerpo, pie) lleva el CSS base
 * al comienzo de su hoja, y la página concatenaba las tres hojas tal cual. El
 * `.cod-group{display:grid;gap:16px}` del pie caía DESPUÉS de las reglas del
 * cuerpo y, con la misma especificidad (una clase), les ganaba: una regla de
 * disposición con `gap:165px` sobre un grupo computaba 16px.
 *
 * Lo que se mide:
 *  1. el compilador: la regla `layout` con `gap` sobre un `group` emite su gap,
 *     después de la regla base `.cod-group`, y el selector base no se repite
 *  2. el publicador: al juntar cabecera, cuerpo y pie, el base sale UNA vez y
 *     antes de toda regla `.cod-rule--*`, y las reglas conservan su orden
 *  3. un documento que no empieza por el base (reexportado por el editor) se
 *     deja como está, sin perder nada
 *
 * Corre contra el WordPress local de Econut (puerto 8891): sincronizar antes con
 *   node scripts/sincronizar-plugin.mjs --a econut --aplicar
 * Nunca contra wp-local (ése es Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$fallas = 0;
$total = 0;
$verifica = function (string $nombre, bool $bien, string $detalle = '') use (&$fallas, &$total): void {
    $total++;
    if (!$bien) {
        $fallas++;
    }
    printf("%s  %-52s  %s\n", $bien ? 'OK  ' : 'FALLA', $nombre, $detalle);
};

/** Compila un grupo con una regla layout y devuelve el CSS. */
$compilar = function (string $id, string $gap) use ($compilador): string {
    $composicion = [
        'schemaVersion' => 2,
        'nodes' => [[
            'id' => 'seccion-' . $id,
            'kind' => 'section',
            'children' => [[
                'id' => 'grupo-' . $id,
                'kind' => 'group',
                'ruleIds' => ['disp-' . $id],
                'children' => [
                    ['id' => 'a-' . $id, 'kind' => 'paragraph', 'content' => ['text' => 'A']],
                    ['id' => 'b-' . $id, 'kind' => 'paragraph', 'content' => ['text' => 'B']],
                ],
            ]],
        ]],
    ];
    $diseno = [
        'schemaVersion' => 1,
        'designId' => 'prueba-042-' . $id,
        'expectedDesignRevision' => 0,
        'reviewState' => 'session',
        'rules' => [[
            'id' => 'disp-' . $id,
            'kind' => 'layout',
            'scope' => ['breakpoint' => 'all', 'state' => 'default'],
            'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.42.']]],
            'status' => 'reviewed',
            'value' => ['mode' => 'stack', 'gap' => $gap],
        ]],
    ];
    $salida = $compilador->compile($composicion, $diseno);
    if (is_wp_error($salida)) {
        fwrite(STDERR, 'ERROR: ' . $salida->get_error_message() . "\n");
        exit(2);
    }
    return (string) ($salida['storage']['styles'] ?? '');
};

// 1. Compilador.
$css = $compilar('uno', '165px');
$verifica(
    'la regla layout emite su gap',
    preg_match('/\.cod-rule--disp-uno\{[^}]*gap:165px/', $css) === 1
);
/*
 * DESDE LA 0.3.63 EL DOCUMENTO YA NO LLEVA EL BASE DENTRO.
 *
 * Esta prueba nació en la 0.3.42, cuando cada documento empezaba con una copia
 * de la hoja base y el problema era el ORDEN entre esa copia y las reglas. La
 * 0.3.63 quitó la copia: la hoja base es del motor, viaja con el plugin y se
 * encola antes que nada. O sea que el defecto original ya no puede ocurrir
 * —no hay dos copias que ordenar—, y lo que hay que comprobar es que el
 * documento salga limpio.
 */
$verifica('el documento NO lleva la hoja base dentro', strpos($css, '.cod-group{') === false);
$verifica('  y sí lleva su regla', strpos($css, '.cod-rule--disp-uno{') !== false);

// 2. Publicador: juntar tres documentos no reintroduce el base ni pierde reglas.
$cabecera = $compilar('cab', '10px');
$cuerpo = $compilar('cuerpo', '165px');
$pie = $compilar('pie', '30px');
$unido = COD_Canvas_Page_Publisher::unir_css_de_documentos([$cabecera, $cuerpo, $pie]);

$verifica('juntar documentos nuevos no mete ningún base', strpos($unido, '.cod-group{') === false);
$verifica('y las tres reglas llegan',
    strpos($unido, '.cod-rule--disp-cab{') !== false
    && strpos($unido, '.cod-rule--disp-cuerpo{') !== false
    && strpos($unido, '.cod-rule--disp-pie{') !== false);

$orden = [];
foreach (['cab', 'cuerpo', 'pie'] as $id) {
    $orden[$id] = strpos($unido, '.cod-rule--disp-' . $id . '{');
}
$verifica(
    'las reglas conservan el orden cabecera, cuerpo, pie',
    !in_array(false, $orden, true) && $orden['cab'] < $orden['cuerpo'] && $orden['cuerpo'] < $orden['pie']
);
$verifica(
    'cada regla conserva su gap',
    preg_match('/\.cod-rule--disp-cab\{[^}]*gap:10px/', $unido) === 1
        && preg_match('/\.cod-rule--disp-cuerpo\{[^}]*gap:165px/', $unido) === 1
        && preg_match('/\.cod-rule--disp-pie\{[^}]*gap:30px/', $unido) === 1
);
// Nada del base vigente queda dentro de una hoja de documento: la copia única es la primera.
// Un documento ANTIGUO sí lo trae, y ahí el descarte tiene que seguir actuando.
$con_base = COD_Canvas_MCP_Recipe_Compiler::base_styles() . ".cod-rule--vieja{color:red;}
";
$mezcla_vieja = COD_Canvas_Page_Publisher::unir_css_de_documentos([$con_base, $cuerpo]);
$verifica('de un documento antiguo, el base sale UNA vez', substr_count($mezcla_vieja, '.cod-group{') === 1);
$verifica('  y va antes de toda regla de diseño',
    strrpos($mezcla_vieja, '.cod-group{') < strpos($mezcla_vieja, '.cod-rule--'));

// 3. Un documento que no empieza por el base se deja como está.
$ajeno = ".mi-regla{color:red;}\n.cod-group{gap:99px;}\n";
$mezcla = COD_Canvas_Page_Publisher::unir_css_de_documentos([$ajeno]);
$verifica('un documento sin base queda intacto', strpos($mezcla, ".mi-regla{color:red;}") !== false && strpos($mezcla, '.cod-group{gap:99px;}') !== false);
$verifica('…y no se le antepone un base', strpos($mezcla, '.cod-section{width:100%') === false);
$verifica('sin documentos no sale nada', COD_Canvas_Page_Publisher::unir_css_de_documentos(['', '']) === "\n\n");

/**
 * 4. Una base de una versión ANTERIOR también se descarta.
 *
 * Ésta es la que importa y la que faltaba. El deduplicador comparaba la línea
 * entera, así que bastaba cambiar una declaración de la hoja base —pasó el 4
 * de octubre de 2026 al añadirle `height:auto` a las imágenes— para que la
 * copia guardada en un documento viejo dejara de coincidir, sobreviviera, y al
 * quedar DESPUÉS en la hoja pisara todas las reglas de diseño anteriores.
 *
 * Se vio en el encabezado de Econut: `.cod-group{display:grid}` de una base
 * vieja ganaba sobre la regla que ponía los iconos de redes en fila, y los
 * dejaba apilados en vertical. La hoja servida traía TRES copias de la base.
 */
$base = COD_Canvas_MCP_Recipe_Compiler::base_styles();
$vieja = str_replace('.cod-group{display:grid;gap:16px;}', '.cod-group{display:grid;gap:99px;}', $base);
$verifica('la base de prueba quedó distinta de la actual', $vieja !== $base);

$conVieja = COD_Canvas_Page_Publisher::unir_css_de_documentos([
    $base . ".cod-rule--mia{display:flex;}\n",
    $vieja . ".cod-rule--otra{color:red;}\n",
]);
$verifica('una base anterior no sobrevive', strpos($conVieja, 'gap:99px') === false);
$verifica('la base actual sale UNA sola vez', substr_count($conVieja, '.cod-group{display:grid') === 1);
$verifica('y va ANTES que las reglas de diseño, para no pisarlas',
    strpos($conVieja, '.cod-group{display:grid') < strpos($conVieja, '.cod-rule--mia'));
$verifica('las reglas de los dos documentos se conservan',
    strpos($conVieja, '.cod-rule--mia{display:flex;}') !== false
    && strpos($conVieja, '.cod-rule--otra{color:red;}') !== false);

printf("\n%d de %d.\n", $total - $fallas, $total);
exit($fallas === 0 ? 0 : 1);
