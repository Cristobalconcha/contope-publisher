<?php
/**
 * Las ampliaciones del plugin que pidió la transcripción de Basis (0.3.84).
 *
 *  1. LISTA: partes `sublista` e `item` (la sangría de cada nivel se estila por separado).
 *  2. ACORDEÓN: `showIcon` / `iconPosition` de core/accordion-heading, `iconoCerrado` / `iconoAbierto` (SVG de Medios)
 *     y la parte `icono`; lo que no los pide sale idéntico a antes.
 *  3. WHATSAPP: `iconStyle: logo` (la marca con su degradado verde) y que el degradado sobreviva al sanitizador.
 *  4. CATÁLOGO CONTRA VALIDADOR: `icono.donde` publica lo mismo que acepta (sin `fondo`), `icono` sin `required` falso.
 *  5. RUNTIME: el JavaScript público fabrica la parte `icono`.
 *
 * Corre contra el WordPress local de Basis (puerto 8894, con el plugin del repositorio copiado). Nunca contra wp-local
 * ni contra Econut.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$fallas = 0;
$total = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas, &$total) {
    $total++;
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? "   $detalle" : '') . "\n";
    if (!$ok) {
        $fallas++;
    }
};

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$regla = static fn (string $id, string $kind, array $value, string $estado = 'default') => [
    'id' => $id, 'kind' => $kind, 'scope' => ['breakpoint' => 'all', 'state' => $estado],
    'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.84.']]], 'status' => 'reviewed', 'value' => $value,
];
$compilar = static function (array $nodos, array $reglas) use ($compilador) {
    return $compilador->compile(['schemaVersion' => 2, 'nodes' => $nodos], [
        'schemaVersion' => 1, 'designId' => 'prueba-0384', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas,
    ]);
};
$estilos = static fn ($r): string => is_wp_error($r) ? 'ERROR: ' . $r->get_error_message() : (string) $r['storage']['styles'];
$marcado = static fn ($r): string => is_wp_error($r) ? 'ERROR: ' . $r->get_error_message() : (string) $r['storage']['markup'];
$error = static fn ($r): string => is_wp_error($r) ? $r->get_error_message() : '';

// ---------------------------------------------------------------------------
echo "\n== 1. lista: partes sublista e item ==\n";
$lista = static fn (array $partes) => [[
    'id' => 'lista', 'kind' => 'list', 'ruleIds' => ['base'], 'partes' => $partes,
    'content' => ['ordered' => false, 'items' => ['uno', ['text' => 'dos', 'items' => ['dos-a', 'dos-b']], 'tres']],
]];
$reglasLista = [
    $regla('base', 'properties', ['declarations' => ['padding-inline-start' => '14px']]),
    $regla('sub', 'properties', ['declarations' => ['padding-inline-start' => '20px']]),
    $regla('it', 'properties', ['declarations' => ['line-height' => '34px']]),
];
$r = $compilar($lista(['sublista' => ['sub'], 'item' => ['it']]), $reglasLista);
$css = $estilos($r);
$comprobar('se acepta la parte sublista', !is_wp_error($r), $error($r));
$comprobar('la sublista sale como descendiente del nodo: .cod-node-id-lista :is(ul, ol)',
    strpos($css, '.cod-node-id-lista :is(ul, ol){padding-inline-start:20px;}') !== false, $css);
$comprobar('el ítem sale como .cod-node-id-lista li', strpos($css, '.cod-node-id-lista li{line-height:34px;}') !== false, $css);
$comprobar('el marcado trae la lista anidada que esas partes alcanzan', preg_match('#<ul [^>]*>.*<li>dos<ul>.*</ul></li>#s', $marcado($r)) === 1, $marcado($r));
$r = $compilar($lista(['viñeta' => ['sub']]), $reglasLista);
$comprobar('una parte que no existe se rechaza nombrándola', is_wp_error($r) && stripos($error($r), 'viñeta') !== false, $error($r));
$r = $compilar($lista([]), $reglasLista);
$comprobar('sin partes la lista sale como siempre', !is_wp_error($r) && strpos($estilos($r), ':is(ul, ol)') === false);
$cat = $compilador->capability_catalog();
$contratos = $cat['composition']['behaviorContracts'] ?? $cat['behaviorContracts'] ?? null;
$json = json_encode($cat);
$comprobar('el catálogo publica las partes de la lista', is_string($json) && strpos($json, 'sublista') !== false);

// ---------------------------------------------------------------------------
echo "\n== 2. acordeón: showIcon, iconoCerrado, iconoAbierto y la parte icono ==\n";
$SVG_A = '/wp-content/uploads/iconos-divi/etmodules-e050.svg';
$SVG_B = '/wp-content/uploads/iconos-divi/etmodules-e04f.svg';
$acordeon = static fn (array $interaccion, array $partes = []) => [[
    'id' => 'acordeon', 'kind' => 'group', 'ruleIds' => ['acordeon'], 'partes' => $partes,
    'children' => [
        ['id' => 'p1', 'kind' => 'group', 'children' => [
            ['id' => 't1', 'kind' => 'paragraph', 'content' => ['text' => '¿Primera?']],
            ['id' => 'r1', 'kind' => 'paragraph', 'content' => ['text' => 'Respuesta uno.']],
        ]],
        ['id' => 'p2', 'kind' => 'group', 'children' => [
            ['id' => 't2', 'kind' => 'paragraph', 'content' => ['text' => '¿Segunda?']],
            ['id' => 'r2', 'kind' => 'paragraph', 'content' => ['text' => 'Respuesta dos.']],
        ]],
    ],
]];
$reglasAc = static fn (array $interaccion) => [
    $regla('acordeon', 'interaction', array_merge(['behavior' => 'acordeon'], $interaccion)),
    $regla('ic', 'properties', ['declarations' => ['background-color' => '#CCCCCC', 'width' => '16px', 'height' => '16px']]),
    $regla('ic-a', 'properties', ['declarations' => ['background-color' => '#333333']], 'current'),
];
$r = $compilar($acordeon([]), $reglasAc(['showIcon' => true, 'iconoCerrado' => $SVG_A, 'iconoAbierto' => 'ninguno']));
$comprobar('showIcon con el dibujo de cada estado se acepta', !is_wp_error($r), $error($r));
$comprobar('el marcado declara dónde va el ícono (derecha por omisión)', strpos($marcado($r), 'data-cod-acordeon-icono="derecha"') !== false, $marcado($r));
$css = $estilos($r);
$comprobar('el compilador emite la máscara del estado cerrado desde el SVG de Medios',
    strpos($css, '[data-cod-node="acordeon"] [data-cod-acordeon-rol="icono"]{-webkit-mask-image:url("' . $SVG_A . '");mask-image:url("' . $SVG_A . '");}') !== false, $css);
$comprobar('«ninguno» esconde el ícono con el pliegue abierto',
    strpos($css, '[data-cod-acordeon-rol="icono"][data-cod-acordeon-estado="abierto"]{visibility:hidden;}') !== false, $css);
$r = $compilar($acordeon([], ['icono' => ['ic', 'ic-a']]), $reglasAc(['showIcon' => true, 'iconPosition' => 'left', 'iconoCerrado' => $SVG_A, 'iconoAbierto' => $SVG_B]));
$css = $estilos($r);
$comprobar('la parte icono acepta reglas, también la del pliegue abierto (scope.state=current)', !is_wp_error($r), $error($r));
$comprobar('iconPosition left se declara izquierda', strpos($marcado($r), 'data-cod-acordeon-icono="izquierda"') !== false);
$comprobar('la regla de la parte icono apunta al span que fabrica el runtime',
    strpos($css, '[data-cod-acordeon-rol="icono"], .wp-block-accordion-heading__toggle-icon)') !== false || strpos($css, ':is([data-cod-acordeon-rol="icono"]') !== false, $css);
$comprobar('el estado abierto emite su propia máscara', strpos($css, '[data-cod-acordeon-estado="abierto"]{-webkit-mask-image:url("' . $SVG_B . '")') !== false, $css);

$sin = $compilar($acordeon([]), $reglasAc([]));
$comprobar('un acordeón que no pide ícono no cambia: ni atributo ni máscara',
    !is_wp_error($sin) && strpos($marcado($sin), 'data-cod-acordeon-icono') === false && strpos($estilos($sin), 'data-cod-acordeon-rol="icono"') === false, $error($sin));
$caso = static function (string $nombre, array $interaccion, string $busca) use ($compilar, $acordeon, $reglasAc, $comprobar, $error) {
    $r = $compilar($acordeon([]), $reglasAc($interaccion));
    $comprobar($nombre, is_wp_error($r) && stripos($error($r), $busca) !== false, is_wp_error($r) ? 'mensaje: ' . $error($r) : 'se aceptó');
};
$caso('un SVG de otro servidor se rechaza', ['showIcon' => true, 'iconoCerrado' => 'https://ejemplo.com/x.svg'], 'iconoCerrado');
$caso('un archivo que no es SVG se rechaza', ['showIcon' => true, 'iconoCerrado' => '/wp-content/uploads/x.png'], 'iconoCerrado');
$caso('iconPosition inventada se rechaza', ['showIcon' => true, 'iconPosition' => 'arriba'], 'iconPosition');
$caso('iconoCerrado sin showIcon se rechaza (no se queda ignorado en silencio)', ['iconoCerrado' => $SVG_A], 'showIcon');
$caso('«ninguno» sólo vale para el estado abierto', ['showIcon' => true, 'iconoCerrado' => 'ninguno'], 'iconoCerrado');
$r = $compilar([['id' => 'g', 'kind' => 'group', 'ruleIds' => ['x'], 'children' => [['id' => 'a', 'kind' => 'paragraph', 'content' => ['text' => 'a']]]]],
    [$regla('x', 'interaction', ['behavior' => 'nav-toggle', 'targetId' => 'a', 'showIcon' => true])]);
$comprobar('showIcon en otro behavior se rechaza', is_wp_error($r) && stripos($error($r), 'showIcon') !== false, $error($r));

// ---------------------------------------------------------------------------
echo "\n== 3. whatsapp: iconStyle logo ==\n";
$wa = static fn (array $contenido) => [['id' => 'wa', 'kind' => 'whatsapp', 'ruleIds' => [], 'content' => array_merge(['message' => 'Hola'], $contenido)]];
update_option('cod_whatsapp_number', '56900000000');
$mono = $compilar($wa([]), []);
$comprobar('el de siempre: un solo color y sin degradado', !is_wp_error($mono) && strpos($marcado($mono), 'linearGradient') === false && strpos($marcado($mono), 'fill="currentColor"') !== false, $error($mono));
$logo = $compilar($wa(['iconStyle' => 'logo', 'iconColor' => '#ffffff', 'backgroundColor' => '#000000', 'size' => 60, 'iconPadding' => 9]), []);
$m = $marcado($logo);
$comprobar('logo: el degradado verde con los dos colores de la marca', !is_wp_error($logo) && strpos($m, '#57d163') !== false && strpos($m, '#23b33a') !== false, $error($logo));
$comprobar('logo: la burbuja se rellena con ese degradado (y su id lleva el del nodo)', strpos($m, 'fill="url(#cod-wa-wa)"') !== false && strpos($m, 'id="cod-wa-wa"') !== false, $m);
$comprobar('logo: el contorno y el teléfono son del color del ícono', substr_count($m, 'fill="currentColor"') === 2, $m);
$sanea = (new COD_Canvas_Document_Sanitizer())->sanitize_html($m);
$comprobar('el sanitizador del lienzo deja pasar el degradado (no lo recorta al guardar)', is_string($sanea) && stripos($sanea, 'lineargradient') !== false && stripos($sanea, 'stop-color') !== false, is_wp_error($sanea) ? $sanea->get_error_message() : substr((string) $sanea, 0, 300));
$peligroso = (new COD_Canvas_Document_Sanitizer())->sanitize_html('<svg><script>alert(1)</script><linearGradient id="a"><stop offset="0" stop-color="red"/></linearGradient></svg>');
$comprobar('…pero sigue sin admitir etiquetas peligrosas (un script dentro del svg se rechaza o se quita)',
    is_wp_error($peligroso) || (is_string($peligroso) && stripos($peligroso, '<script') === false), is_string($peligroso) ? $peligroso : '');
$mal = $compilar($wa(['iconStyle' => 'neon']), []);
$comprobar('un estilo inventado se rechaza nombrándolo', is_wp_error($mal) && stripos($error($mal), 'iconStyle') !== false, $error($mal));
$cat = json_encode($compilador->capability_catalog());
$comprobar('el catálogo publica iconStyle', is_string($cat) && strpos($cat, 'iconStyle') !== false);

// ---------------------------------------------------------------------------
echo "\n== 4. el catálogo dice lo mismo que el validador (icono) ==\n";
$cap = $compilador->capability_catalog();
$esquema = $cap['designRuleSet']['ruleValueSchemas']['icono'] ?? null;
$comprobar('el catálogo publica la regla icono', is_array($esquema));
$comprobar('icono.donde publica exactamente lo que acepta', ($esquema['fields']['donde'] ?? '') === implode(' | ', COD_Icono::DONDE), (string) ($esquema['fields']['donde'] ?? ''));
$comprobar('…y eso ya no incluye «fondo»', strpos((string) ($esquema['fields']['donde'] ?? ''), 'fondo') === false);
$comprobar('icono no se publica con un required que el validador no exige', !isset($esquema['required']) && ($esquema['atLeastOneOf'] ?? []) === ['forma', 'nombre'], json_encode($esquema));
$probarDonde = static function (string $donde) use ($compilar, $regla) {
    return $compilar([['id' => 'p', 'kind' => 'paragraph', 'ruleIds' => ['i'], 'content' => ['text' => 'x']]],
        [$regla('i', 'icono', ['nombre' => 'help', 'donde' => $donde])]);
};
foreach (COD_Icono::DONDE as $d) {
    $comprobar("icono.donde «{$d}» (publicado) se acepta", !is_wp_error($probarDonde($d)), $error($probarDonde($d)));
}
$comprobar('icono.donde «fondo» (no publicado) se rechaza', is_wp_error($probarDonde('fondo')));
$sinDonde = $compilar([['id' => 'p', 'kind' => 'paragraph', 'ruleIds' => ['i'], 'content' => ['text' => 'x']]], [$regla('i', 'icono', ['nombre' => 'help'])]);
$comprobar('icono sin donde se acepta (por omisión «antes»), como dice el catálogo', !is_wp_error($sinDonde), $error($sinDonde));

// ---------------------------------------------------------------------------
echo "\n== 5. el runtime público y la hoja base ==\n";
$js = (string) file_get_contents(__DIR__ . '/../contope-publisher/assets/js/cod-canvas-public.js');
$comprobar('cod-canvas-public.js fabrica el span de la parte icono', strpos($js, "'data-cod-acordeon-rol', 'icono'") !== false && strpos($js, 'data-cod-acordeon-icono') !== false);
$comprobar('…y le pasa el estado abierto/cerrado', strpos($js, 'sincronizarIconos') !== false);
$base = COD_Canvas_Page_Publisher::acordeon_css('<div data-cod-behavior="acordeon"></div>');
$comprobar('la hoja base trae el ícono por omisión (un «+» que pasa a «−») con especificidad cero', strpos($base, ':where([data-cod-behavior="acordeon"] [data-cod-acordeon-rol="icono"])') !== false && strpos($base, 'M5 11h14v2H5z') !== false);

echo "\n" . ($fallas === 0 ? "TODO OK ($total comprobaciones)" : "$fallas de $total FALLARON") . "\n";
exit($fallas === 0 ? 0 : 1);
