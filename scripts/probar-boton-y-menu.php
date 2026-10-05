<?php
/**
 * Un botón que actúa es un botón, y un menú replegable se puede componer.
 *
 * DE DÓNDE SALEN LOS DOS. El 4 de octubre de 2026, componiendo la barra de
 * navegación de Santa Luisa —la última pieza del sitio que seguía escrita como
 * HTML suelto—, el canal rechazó la receta dos veces, y las dos por un hueco del
 * catálogo y no por un error de la receta. Es el patrón que Cristóbal ya había
 * señalado: *«que no exista en el catálogo es la causa real del atajo»*. Un
 * hueco no se documenta, se cierra.
 *
 * 1. UN BOTÓN EXIGÍA DESTINO. `button` y `link` eran la misma cosa y los dos
 *    salían como `<a href>`. El botón de las tres rayas no va a ninguna parte, y
 *    el de «Preferencias de cookies» —cuyo trabajo es abrir el panel del
 *    plugin— ya llevaba en este sitio un href a la página de términos sólo para
 *    pasar la validación. No es incomodidad: un lector de pantalla anuncia un
 *    enlace, el teclado lo activa con Enter y no con espacio, y pulsarlo navega.
 *    Un href inventado le miente a quien no ve la pantalla.
 *
 * 2. UN MENÚ REPLEGABLE ERA INEXPRESABLE. `nav-toggle` sólo ponía una clase en
 *    un elemento y dejaba el mostrar y ocultar a quien compusiera. Pero una
 *    regla de diseño describe un nodo, no la relación «cuando mi antepasado
 *    tenga tal clase, aparezco». Se podía marcar la barra y no había forma de
 *    reaccionar a la marca. Eso es exactamente lo que obligaba a escribir el
 *    encabezado a mano.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local ni contra el
 * sitio de un cliente.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$R = static fn(string $id, string $kind, array $value): array => [
    'id' => $id, 'kind' => $kind,
    'scope' => ['breakpoint' => 'all', 'state' => 'default'],
    'provenance' => ['sources' => [['kind' => 'reference', 'reference' => 'prueba', 'rationale' => 'Fija los dos huecos del catálogo que destapó la barra de navegación.']]],
    'status' => 'reviewed', 'value' => $value,
];

$compilar = static function (array $nodos, array $reglas) use ($compilador) {
    return $compilador->compile(
        ['schemaVersion' => 2, 'label' => 'Prueba', 'nodes' => $nodos],
        ['schemaVersion' => 1, 'designId' => 'prueba-boton-menu', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas]
    );
};

echo "\n== un botón sin destino es un <button> ==\n";

$salida = $compilar([['id' => 'abrir', 'kind' => 'button', 'ruleIds' => [], 'content' => ['label' => 'Menú']]], []);
$comprobar('se acepta sin href', !is_wp_error($salida),
    is_wp_error($salida) ? $salida->get_error_message() : '');
$markup = is_wp_error($salida) ? '' : (string) ($salida['storage']['markup'] ?? '');
$comprobar('y sale como <button type="button">',
    str_contains($markup, '<button type="button"'),
    $markup === '' ? '' : substr($markup, 0, 110));
$comprobar('sin un href inventado',
    !str_contains($markup, 'href='),
    str_contains($markup, 'href=') ? 'metió un href' : '');

echo "\n== con destino sigue siendo un enlace, como siempre ==\n";
/*
 * Lo que ya existe no cambia. Hay páginas compuestas con botones que SÍ
 * navegan; si esto se rompiera, el arreglo habría costado más de lo que
 * resolvió.
 */
$conDestino = $compilar([['id' => 'ir', 'kind' => 'button', 'ruleIds' => [], 'content' => ['label' => 'Hablemos', 'href' => '/contacto/']]], []);
$m2 = is_wp_error($conDestino) ? '' : (string) ($conDestino['storage']['markup'] ?? '');
$comprobar('un botón con href se dibuja como enlace', str_contains($m2, '<a ') && str_contains($m2, 'href="/contacto/"'),
    is_wp_error($conDestino) ? $conDestino->get_error_message() : substr($m2, 0, 110));

echo "\n== un enlace SIN destino sigue rechazándose ==\n";
/*
 * Abrir la puerta no es quitarla. Un enlace sin destino no significa nada, y
 * aceptarlo dejaría pasar la errata que el validador existe para atajar.
 */
$enlaceMudo = $compilar([['id' => 'e', 'kind' => 'link', 'ruleIds' => [], 'content' => ['label' => 'A ningún lado']]], []);
$comprobar('un link sin href se rechaza', is_wp_error($enlaceMudo),
    is_wp_error($enlaceMudo) ? $enlaceMudo->get_error_message() : 'lo aceptó, y no debería');

echo "\n== la mecánica del menú replegable ==\n";

$nodos = [[
    'id' => 'barra', 'kind' => 'header', 'ruleIds' => [],
    'children' => [
        ['id' => 'menu', 'kind' => 'navigation', 'ruleIds' => [], 'children' => [
            ['id' => 'uno', 'kind' => 'link', 'ruleIds' => [], 'content' => ['label' => 'Inicio', 'href' => '/']],
        ]],
        ['id' => 'boton', 'kind' => 'button', 'ruleIds' => ['abrir'], 'content' => ['label' => 'Menú']],
    ],
]];
$reglas = [$R('abrir', 'interaction', ['behavior' => 'nav-toggle', 'targetId' => 'barra', 'panelId' => 'menu', 'toggleClass' => 'is-menu-open'])];
$conMenu = $compilar($nodos, $reglas);
$comprobar('nav-toggle acepta panelId', !is_wp_error($conMenu),
    is_wp_error($conMenu) ? $conMenu->get_error_message() : '');
$css = is_wp_error($conMenu) ? '' : (string) ($conMenu['storage']['styles'] ?? '');

$comprobar('cerrado, el panel no se ve',
    str_contains($css, '[data-cod-node="menu"]{display:none;}'));
$comprobar('abierto, vuelve a mostrarse',
    str_contains($css, '.is-menu-open [data-cod-node="menu"]{display:var(--cod-nav-panel-display, flex);}'));
/*
 * La mecánica fija el ESTADO, no la forma: `var(--cod-nav-panel-display, flex)`
 * deja que el set de diseño pida grid o cualquier otra cosa declarando esa
 * variable. Una mecánica que impusiera `flex` a secas estaría decidiendo diseño,
 * que no es su trabajo.
 */
$comprobar('y lo hace por variable, para no decidir la forma',
    str_contains($css, '--cod-nav-panel-display'));
/*
 * El corte va en el mismo máximo que el breakpoint mobile del sistema. No en
 * una medida propia: un iPhone Pro Max apaisado mide 932, así que un corte en
 * 900 deja el menú replegado en una pantalla ancha. Ya pasó en este sitio.
 */
$comprobar('sólo en teléfono, y con el corte del sistema',
    str_contains($css, '@media (max-width:767px){'));

echo "\n== panelId es opcional y acotado ==\n";
/*
 * Opcional, porque los nav-toggle que ya existen no lo tienen y tienen que
 * seguir funcionando igual: sin panelId no se emite mecánica ninguna.
 */
$sinPanel = $compilar($nodos, [$R('abrir', 'interaction', ['behavior' => 'nav-toggle', 'targetId' => 'barra'])]);
$cssSinPanel = is_wp_error($sinPanel) ? '' : (string) ($sinPanel['storage']['styles'] ?? '');
$comprobar('sin panelId no se emite mecánica',
    !is_wp_error($sinPanel) && !str_contains($cssSinPanel, '--cod-nav-panel-display'),
    is_wp_error($sinPanel) ? $sinPanel->get_error_message() : '');

$panelFantasma = $compilar($nodos, [$R('abrir', 'interaction', ['behavior' => 'nav-toggle', 'targetId' => 'barra', 'panelId' => 'no-existe'])]);
$comprobar('un panelId que no está en la composición se rechaza', is_wp_error($panelFantasma),
    is_wp_error($panelFantasma) ? $panelFantasma->get_error_message() : 'lo aceptó, y no debería');

$ajeno = $compilar(
    [['id' => 'g', 'kind' => 'gallery', 'ruleIds' => ['car'], 'content' => ['items' => []]]],
    [$R('car', 'interaction', ['behavior' => 'carousel-basic', 'panelId' => 'g'])]
);
$comprobar('panelId sólo lo admite nav-toggle', is_wp_error($ajeno),
    is_wp_error($ajeno) ? $ajeno->get_error_message() : 'lo aceptó en carousel-basic');

echo "\n== y el catálogo lo publica ==\n";
/*
 * Lo que el constructor acepta y lo que publica como posible tienen que ser lo
 * mismo. Un catálogo que no menciona panelId empuja a resolver el menú a mano,
 * que es justo de donde venimos.
 */
$catalogo = wp_json_encode($compilador->capability_catalog());
$comprobar('panelId figura en el catálogo', is_string($catalogo) && str_contains($catalogo, 'panelId'));
$comprobar('y el botón dice que el href es opcional',
    is_string($catalogo) && str_contains($catalogo, 'enlace seguro (opcional)'));

echo "\n" . ($fallas === 0 ? "todo en orden\n" : "$fallas fallas\n");
exit($fallas === 0 ? 0 : 1);
