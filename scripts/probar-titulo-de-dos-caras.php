<?php
/**
 * Un encabezado puede llevar dos caras tipográficas sin dejar de ser UNO.
 *
 * DE DÓNDE SALE. El 4 de octubre de 2026 Cristóbal reclamó, con razón, que
 * Santa Luisa se hubiera subido como HTML en vez de construirse por el
 * constructor: «Tenemos un MCP hecho especialmente para poder intervenir con
 * nuestro Page Builder, tenemos un editor de plantillas, tenemos unos módulos
 * que permiten construir las piezas de la página. ¿Y por qué lo subimos como
 * HTML?».
 *
 * Al ir a recomponer la primera página apareció el motivo técnico, que no
 * excusa el método pero sí explica el atajo: los títulos de ese sitio mezclan
 * una cara script y una de caja alta —«Agenda» + «tu visita»— y un `heading`
 * sólo aceptaba texto plano. Eso no se podía decir en el vocabulario del
 * constructor, así que alguien lo escribió a mano en HTML y el sitio quedó
 * fuera del sistema.
 *
 * Lo que se comprueba:
 *  - que un título de dos tramos compile y salga como UN encabezado con dos
 *    spans, cada uno con la clase de su regla;
 *  - que el texto completo se derive de los tramos, para que nada que lea
 *    `text` tenga que saber de esto y para que no pueda divergir;
 *  - que la ida y vuelta funcione: lo que se lee se puede reenviar tal cual
 *    (el issue #8, que esta misma función podía reabrir);
 *  - que un tramo con una regla inexistente se rechace en vez de salir sin
 *    tipografía y en silencio.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

/** Las dos reglas tipográficas del título, como en Santa Luisa. */
$diseno = [
    'schemaVersion' => 1,
    'designId' => 'prueba-dos-caras',
    'expectedDesignRevision' => 0,
    'reviewState' => 'session',
    'rules' => [
        [
            'id' => 't-script', 'kind' => 'typography',
            'scope' => ['breakpoint' => 'all', 'state' => 'default'],
            'provenance' => ['sources' => [['kind' => 'reference', 'reference' => 'santaluisadepalpi.cl', 'rationale' => 'Cara script del título, medida del sitio.']]],
            'status' => 'reviewed',
            'value' => ['role' => 'titulo-script', 'fontSize' => '58px', 'fontWeight' => 400, 'lineHeight' => 1],
        ],
        [
            'id' => 't-caps', 'kind' => 'typography',
            'scope' => ['breakpoint' => 'all', 'state' => 'default'],
            'provenance' => ['sources' => [['kind' => 'reference', 'reference' => 'santaluisadepalpi.cl', 'rationale' => 'Cara de caja alta del título.']]],
            'status' => 'reviewed',
            'value' => ['role' => 'titulo-caps', 'fontSize' => '46px', 'fontWeight' => 600, 'transform' => 'uppercase'],
        ],
    ],
];

$componer = static function (array $contenido) use ($diseno): array {
    return [
        'composicion' => [
            'schemaVersion' => 2,
            'nodes' => [[
                'id' => 'titulo', 'kind' => 'heading', 'ruleIds' => [], 'content' => $contenido,
            ]],
        ],
        'diseno' => $diseno,
    ];
};

echo "\n== un título de dos tramos ==\n";
$receta = $componer([
    'level' => 2,
    'segments' => [
        ['text' => 'Agenda', 'ruleIds' => ['t-script']],
        ['text' => 'tu visita', 'ruleIds' => ['t-caps']],
    ],
]);
$r = $compilador->compile($receta['composicion'], $receta['diseno']);
$comprobar('compila', !is_wp_error($r), is_wp_error($r) ? $r->get_error_message() : '');
$html = is_wp_error($r) ? '' : (string) $r['storage']['markup'];

$comprobar('sale UN solo encabezado', substr_count($html, '<h2') === 1 && substr_count($html, '</h2>') === 1);
$comprobar('con dos spans dentro', substr_count($html, '<span') === 2);
$comprobar('  el primero con la clase de su regla', strpos($html, 'cod-rule--t-script') !== false);
$comprobar('  el segundo con la de la suya', strpos($html, 'cod-rule--t-caps') !== false);
$comprobar('y los textos en orden',
    strpos($html, 'Agenda') !== false && strpos($html, 'tu visita') !== false
    && strpos($html, 'Agenda') < strpos($html, 'tu visita'));
// Que el h2 no quede con el texto suelto ADEMÁS de los spans: se vería doble.
$comprobar('el texto no sale además suelto en el h2',
    preg_match('/<h2[^>]*>\s*<span/', $html) === 1, 'el h2 abre directo en un span');

echo "\n== el texto completo se deriva, y no puede divergir ==\n";
$guardado = is_wp_error($r) ? [] : (array) $r['storage'];
$comp = (array) ($r['compositionSnapshot'] ?? []);
$nodo = $comp['nodes'][0] ?? [];
$comprobar('el nodo guardado trae text derivado', ($nodo['content']['text'] ?? '') === 'Agenda tu visita',
    (string) ($nodo['content']['text'] ?? '(sin text)'));
$comprobar('  y conserva sus tramos', count($nodo['content']['segments'] ?? []) === 2);

// Un text que contradice a los tramos NO gana: se recalcula. Es la razón por
// la que esto no puede desincronizarse con el tiempo.
$receta2 = $componer([
    'level' => 2,
    'text' => 'un texto que dice otra cosa',
    'segments' => [
        ['text' => 'Agenda', 'ruleIds' => ['t-script']],
        ['text' => 'tu visita', 'ruleIds' => ['t-caps']],
    ],
]);
$r2 = $compilador->compile($receta2['composicion'], $receta2['diseno']);
$comprobar('un text que contradice a los tramos no se acepta a ciegas', !is_wp_error($r2),
    is_wp_error($r2) ? $r2->get_error_message() : '');
if (!is_wp_error($r2)) {
    $c2 = (array) $r2['compositionSnapshot'];
    $t2 = $c2['nodes'][0]['content']['text'] ?? '';
    $comprobar('  manda el de los tramos', $t2 === 'Agenda tu visita', $t2);
    $comprobar('  y el otro no aparece en la página',
        strpos((string) $r2['storage']['markup'], 'un texto que dice otra cosa') === false);
}

echo "\n== la ida y vuelta: lo leído se reenvía tal cual ==\n";
// ESTA es la que importa. La primera versión de esta función rechazaba que
// vinieran text y segments juntos, que es exactamente lo que devuelve una
// lectura; reenviarla habría fallado, igual que en el issue #8.
if (!is_wp_error($r)) {
    // Como lo devuelve cod_read_canvas_composition: sólo lo reenviable. Los
    // campos derivados del snapshot (nodeIds, markers, nodeCount) los rechaza
    // el validador, y eso es de siempre: es el issue #8 y la lectura los filtra.
    $reenviable = array_intersect_key($comp, array_flip(['schemaVersion', 'label', 'nodes']));
    $deVuelta = $compilador->compile($reenviable, $diseno);
    $comprobar('la composición guardada se puede recompilar', !is_wp_error($deVuelta),
        is_wp_error($deVuelta) ? $deVuelta->get_error_message() : '');
    if (!is_wp_error($deVuelta)) {
        $comprobar('  y da el mismo HTML', $deVuelta['storage']['markup'] === $r['storage']['markup']);
    }
}

echo "\n== lo que se rechaza, en vez de salir mal en silencio ==\n";
$casos = [
    'un tramo con una regla que no existe' => ['level' => 2, 'segments' => [
        ['text' => 'Agenda', 'ruleIds' => ['t-que-no-existe']],
        ['text' => 'tu visita', 'ruleIds' => ['t-caps']]]],
    'un solo tramo (para eso está text)' => ['level' => 2, 'segments' => [
        ['text' => 'Agenda', 'ruleIds' => ['t-script']]]],
    'ni text ni segments' => ['level' => 2],
    'un tramo sin texto' => ['level' => 2, 'segments' => [
        ['ruleIds' => ['t-script']], ['text' => 'tu visita', 'ruleIds' => ['t-caps']]]],
    'un campo de más en el tramo' => ['level' => 2, 'segments' => [
        ['text' => 'Agenda', 'ruleIds' => ['t-script'], 'kind' => 'heading'],
        ['text' => 'tu visita', 'ruleIds' => ['t-caps']]]],
];
foreach ($casos as $caso => $contenido) {
    $receta3 = $componer($contenido);
    $r3 = $compilador->compile($receta3['composicion'], $receta3['diseno']);
    $comprobar($caso, is_wp_error($r3), is_wp_error($r3) ? '' : 'LO ACEPTÓ');
}

echo "\n== un título normal sigue funcionando igual ==\n";
$receta4 = $componer(['level' => 2, 'text' => 'Un título de siempre']);
$r4 = $compilador->compile($receta4['composicion'], $receta4['diseno']);
$comprobar('compila', !is_wp_error($r4), is_wp_error($r4) ? $r4->get_error_message() : '');
if (!is_wp_error($r4)) {
    $comprobar('sin ningún span', strpos((string) $r4['storage']['markup'], '<span') === false);
    $comprobar('con su texto', strpos((string) $r4['storage']['markup'], 'Un título de siempre') !== false);
}

echo "\n";
if ($fallas === 0) { echo "probar-titulo-de-dos-caras.php   TODO OK\n"; exit(0); }
echo "probar-titulo-de-dos-caras.php   $fallas falla(s)\n";
exit(1);
