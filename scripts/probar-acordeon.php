<?php
/**
 * El acordeón: una lista de pliegues que se abren de a uno.
 *
 * DE DÓNDE SALE. Al recomponer el sitio de Santa Luisa por el constructor, dos
 * de sus cuatro páginas interiores resultaron ser acordeón casi enteras: 9
 * pliegues en Preguntas frecuentes y 27 en Términos y condiciones, 36 en total.
 * No había cómo decirlo en el vocabulario del constructor, así que estaban
 * escritas a mano con `<details>` y su propio CSS, fuera del sistema.
 *
 * Es el tercer agujero de vocabulario del mismo día, después del título de dos
 * caras y la ventana de WhatsApp. Cristóbal, sobre el conjunto: «simplemente se
 * trata de desactualizaciones». Éste no lo era —el acordeón no existía—, pero
 * la causa de fondo es la misma: lo que el constructor no sabe decir, alguien
 * termina escribiéndolo a mano.
 *
 * Lo que se comprueba: que acepte la forma correcta, que la rechace nombrando
 * el problema cuando no calza, que sus partes se puedan estilar, y que la
 * mecánica de abrir y cerrar la ponga el plugin y no la composición.
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

/** Un pliegue bien formado: lo que se pincha y lo que se despliega. */
$pliegue = static function (int $n, int $hijos = 2): array {
    $propios = [['id' => "q$n", 'kind' => 'paragraph', 'ruleIds' => [], 'content' => ['text' => "¿Pregunta $n?"]]];
    for ($i = 1; $i < $hijos; $i++) {
        $propios[] = ['id' => "r$n-$i", 'kind' => 'paragraph', 'ruleIds' => [], 'content' => ['text' => "Respuesta $n parte $i."]];
    }
    return ['id' => "p$n", 'kind' => 'group', 'ruleIds' => [], 'children' => $propios];
};

/** Compila un acordeón con los pliegues y las partes que se le pasen. */
$compilar = static function (array $pliegues, array $partes = [], string $kind = 'group') use ($compilador) {
    $nodo = ['id' => 'faq', 'kind' => $kind, 'ruleIds' => ['acc']];
    if ($partes !== []) { $nodo['partes'] = $partes; }
    if ($kind === 'group') { $nodo['children'] = $pliegues; }
    else { $nodo['content'] = ['text' => 'x']; }

    $reglas = [[
        'id' => 'acc', 'kind' => 'interaction', 'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba del acordeón.']]],
        'status' => 'reviewed', 'value' => ['behavior' => 'acordeon'],
    ]];
    foreach (['t-resumen' => 'pregunta', 't-panel' => 'respuesta', 't-abierto' => 'abierta'] as $id => $rol) {
        $reglas[] = [
            'id' => $id, 'kind' => 'typography',
            'scope' => ['breakpoint' => 'all', 'state' => $id === 't-abierto' ? 'current' : 'default'],
            'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba.']]],
            'status' => 'reviewed', 'value' => ['role' => $rol, 'fontSize' => '15px'],
        ];
    }
    return $compilador->compile(
        ['schemaVersion' => 2, 'nodes' => [$nodo]],
        ['schemaVersion' => 1, 'designId' => 'prueba-acordeon', 'expectedDesignRevision' => 0,
         'reviewState' => 'session', 'rules' => $reglas]
    );
};

echo "\n== un acordeón bien formado ==\n";
$r = $compilar([$pliegue(1), $pliegue(2), $pliegue(3)]);
$comprobar('compila', !is_wp_error($r), is_wp_error($r) ? $r->get_error_message() : '');
$html = is_wp_error($r) ? '' : (string) $r['storage']['markup'];
$comprobar('emite su behavior', strpos($html, 'data-cod-behavior="acordeon"') !== false);
$comprobar('y nada más: el resto lo arma el runtime',
    strpos($html, 'data-cod-acordeon-rol') === false,
    'el compilador no debe emitir los roles; los pone el navegador');
$comprobar('los tres pliegues están, con su contenido',
    substr_count($html, '¿Pregunta') === 3 && substr_count($html, 'Respuesta') === 3);

echo "\n== las partes se pueden estilar ==\n";
$r2 = $compilar([$pliegue(1), $pliegue(2)], [
    'resumen' => ['t-resumen'], 'panel' => ['t-panel'], 'item' => ['t-abierto'],
]);
$comprobar('compila con partes', !is_wp_error($r2), is_wp_error($r2) ? $r2->get_error_message() : '');
$css = is_wp_error($r2) ? '' : (string) $r2['storage']['styles'];
/*
 * EL SELECTOR ALCANZA LAS DOS FORMAS, y eso es el punto.
 *
 * Cristóbal, el 4 de octubre de 2026: «no es que no tengamos que tener un
 * módulo de pestañas en nuestro Grapes; lo que te digo es que nuestro módulo
 * tiene que ser coherente con el de WordPress… vamos a tomar esas familias de
 * bloques y les vamos a dar formato».
 *
 * Por eso cada parte apunta a nuestro atributo Y a la clase del bloque de core:
 * una página armada con `core/accordion` en Gutenberg recibe el mismo formato
 * que una compuesta en el lienzo, sin escribir dos veces el diseño. Comprobar
 * sólo la mitad nuestra dejaría pasar justo la regresión que importa.
 */
$comprobar('la parte resumen alcanza nuestro atributo',
    strpos($css, '[data-cod-acordeon-rol="resumen"]') !== false);
$comprobar('  y también el bloque de WordPress',
    strpos($css, '.wp-block-accordion-heading__toggle') !== false,
    'sin esto, un acordeón hecho con core/accordion no recibiría el diseño');
$comprobar('la parte panel alcanza nuestro atributo',
    strpos($css, '[data-cod-acordeon-rol="panel"]') !== false);
$comprobar('  y también el de WordPress',
    strpos($css, '.wp-block-accordion-panel') !== false);
$comprobar('las dos van en el MISMO selector, no en reglas aparte',
    preg_match('/:is\\([^)]*data-cod-acordeon-rol="resumen"[^)]*wp-block-accordion-heading__toggle[^)]*\\)/', $css) === 1,
    'duplicar la regla haría que el CSS pese el doble y que una se olvide');
// El pliegue abierto: scope.state="current" se combina con la marca del elegido.
$comprobar('y el pliegue ABIERTO se puede estilar con state current',
    strpos($css, '[data-cod-acordeon-estado="abierto"]') !== false,
    'sin esto no habría forma de destacar el que está abierto');

echo "\n== las dos opciones del bloque core/accordion de WordPress ==\n";
/*
 * POR QUÉ ESTÁN. Cristóbal, el 4 de octubre de 2026, al ver el módulo nuevo:
 * «debería ser coherente con el acordeón de WordPress… supongo que lo que
 * estás haciendo es adecuar la página al plugin y no modificar el plugin para
 * perder una característica».
 *
 * Al medir el bloque `core/accordion` de este WordPress resultó que la
 * ESTRUCTURA ya coincidía —botón con aria-expanded y aria-controls, panel con
 * aria-labelledby, estado abierto en el ítem—, pero que al nuestro le faltaban
 * dos capacidades suyas: `autoclose` (poder tener varios abiertos a la vez) y
 * `openByDefault` (elegir cuál nace abierto). Tenía razón: eran una
 * característica de menos.
 */
$conOpciones = static function (array $opciones) use ($compilador, $pliegue) {
    return $compilador->compile(
        ['schemaVersion' => 2, 'nodes' => [['id' => 'faq', 'kind' => 'group', 'ruleIds' => ['acc'],
            'children' => [$pliegue(1), $pliegue(2), $pliegue(3)]]]],
        ['schemaVersion' => 1, 'designId' => 'prueba-acordeon', 'expectedDesignRevision' => 0,
         'reviewState' => 'session', 'rules' => [[
            'id' => 'acc', 'kind' => 'interaction', 'scope' => ['breakpoint' => 'all', 'state' => 'default'],
            'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba.']]],
            'status' => 'reviewed', 'value' => array_merge(['behavior' => 'acordeon'], $opciones),
         ]]]
    );
};

// Por omisión: se cierra el anterior y nace abierto el primero, igual que core.
$porOmision = $conOpciones([]);
$comprobar('por omisión se cierra el anterior', !is_wp_error($porOmision)
    && strpos((string) $porOmision['storage']['markup'], 'data-cod-acordeon-autoclose="1"') !== false,
    is_wp_error($porOmision) ? $porOmision->get_error_message() : '');

$varios = $conOpciones(['autoclose' => false]);
$comprobar('se pueden tener varios abiertos a la vez', !is_wp_error($varios)
    && strpos((string) $varios['storage']['markup'], 'data-cod-acordeon-autoclose="0"') !== false,
    is_wp_error($varios) ? $varios->get_error_message() : '');

$otro = $conOpciones(['openNodeId' => 'p2']);
$comprobar('se puede elegir cuál nace abierto', !is_wp_error($otro)
    && strpos((string) $otro['storage']['markup'], 'data-cod-acordeon-abre="p2"') !== false,
    is_wp_error($otro) ? $otro->get_error_message() : '');

$cerrado = $conOpciones(['startClosed' => true]);
$comprobar('y que empiece todo cerrado', !is_wp_error($cerrado)
    && strpos((string) $cerrado['storage']['markup'], 'data-cod-acordeon-abre="ninguno"') !== false,
    is_wp_error($cerrado) ? $cerrado->get_error_message() : '');

// Lo que no puede pasar: pedir un pliegue que no existe, o contradecirse.
$inexistente = $conOpciones(['openNodeId' => 'no-existe']);
$comprobar('un pliegue inexistente se rechaza', is_wp_error($inexistente),
    is_wp_error($inexistente) ? '' : 'LO ACEPTÓ');
$contradictorio = $conOpciones(['openNodeId' => 'p2', 'startClosed' => true]);
$comprobar('abrir uno y empezar cerrado se rechaza', is_wp_error($contradictorio),
    is_wp_error($contradictorio) ? '' : 'LO ACEPTÓ');

// Y la paridad estructural con el bloque de core, que es lo que hace que un
// lector de pantalla y un tema se comporten igual con los dos.
$comprobar('el runtime emite aria-expanded, como core',
    strpos($publico ?? (string) file_get_contents(__DIR__ . '/../contope-publisher/assets/js/cod-canvas-public.js'), "setAttribute('aria-expanded'") !== false);

echo "\n== lo que se rechaza, nombrando el problema ==\n";
$casos = [
    'un pliegue con un solo hijo' => [[$pliegue(1), $pliegue(2, 1)], 'group'],
    'sin ningún pliegue' => [[], 'group'],
    'sobre algo que no es un grupo' => [[$pliegue(1)], 'paragraph'],
];
foreach ($casos as $caso => [$pliegues, $kind]) {
    $x = $compilar($pliegues, [], $kind);
    $comprobar($caso, is_wp_error($x), is_wp_error($x) ? '' : 'LO ACEPTÓ');
    if (is_wp_error($x)) {
        $m = $x->get_error_message();
        $comprobar('  y el mensaje dice qué pasa', stripos($m, 'acorde') !== false || stripos($m, 'pliegue') !== false, $m);
    }
}

echo "\n== la mecánica la pone el plugin, no la composición ==\n";
/*
 * Una regla de diseño no puede expresar «cuando el runtime lo marque abierto»,
 * y no tiene por qué: mostrar y ocultar es mecánica del behavior. Va en la hoja
 * del plugin, y con especificidad cero en lo que es decisión de diseño, para
 * que cualquier regla de la composición le gane.
 */
$mecanica = COD_Canvas_Page_Publisher::acordeon_css('<div data-cod-behavior="acordeon">');
$comprobar('hay hoja para el acordeón', $mecanica !== '');
$comprobar('el panel cerrado no se ve', strpos($mecanica, 'data-cod-acordeon-visible="false"') !== false
    && strpos($mecanica, 'display:none') !== false);
$comprobar('el botón se neutraliza', strpos($mecanica, 'cursor:pointer') !== false);
$comprobar('  y con especificidad cero, para que el diseño le gane',
    strpos($mecanica, ':where(') !== false);
$comprobar('hay foco visible por teclado', strpos($mecanica, 'focus-visible') !== false);
$comprobar('no se emite en una página que no lo usa',
    COD_Canvas_Page_Publisher::acordeon_css('<div>nada</div>') === '');

echo "\n== los DOS motores lo conocen ==\n";
/*
 * `cod-behaviors.js` (el editor) y `cod-canvas-public.js` (la página publicada)
 * son copias separadas. Agregar algo a una sola es un error que esta base de
 * código ya cometió, y por eso se comprueba acá y no se confía en la memoria.
 */
$publico = (string) file_get_contents(__DIR__ . '/../contope-publisher/assets/js/cod-canvas-public.js');
$editor = (string) file_get_contents(__DIR__ . '/../contope-publisher/assets/js/cod-behaviors.js');
$comprobar('el motor de la página lo monta', strpos($publico, 'function montarAcordeon') !== false);
$comprobar('  y lo despacha', strpos($publico, "behavior === 'acordeon'") !== false);
$comprobar('el motor del editor lo conoce', strpos($editor, "BEHAVIOR_ACORDEON = 'acordeon'") !== false);
$comprobar('  y lo describe en su catálogo', strpos($editor, 'BEHAVIORS[BEHAVIOR_ACORDEON]') !== false);

echo "\n== está en el catálogo que se publica ==\n";
$comprobar('en la lista de behaviors',
    in_array('acordeon', COD_Canvas_MCP_Recipe_Compiler::INTERACTION_BEHAVIORS, true));
$cat = $compilador->capability_catalog();
$comprobar('con su contrato de partes',
    isset($cat['composition']['behaviorContracts']['acordeon']['partes']['resumen']));
$comprobar('y su restricción explicada',
    // JSON_UNESCAPED_UNICODE: sin esto la tilde de «sólo» viaja escapada y la
    // búsqueda no calza, que es lo que hacía fallar esta prueba estando el
    // catálogo correcto. Un falso positivo de prueba cuesta igual que un fallo.
    strpos(wp_json_encode($cat['designRuleSet']['ruleValueSchemas']['interaction'], JSON_UNESCAPED_UNICODE), 'acordeon sólo en un nodo group') !== false);

echo "\n== la correspondencia con Gutenberg está declarada ==\n";
/*
 * Declarada en el código Y publicada en el catálogo, para que quien vaya a
 * construir un módulo nuevo vea primero si Gutenberg ya tiene esa familia. Ese
 * es el mecanismo que impide repetir el error de construir el acordeón de nuevo
 * por haber mirado sólo la lista de behaviors.
 */
$eq = COD_Canvas_MCP_Recipe_Compiler::EQUIVALENCIA_GUTENBERG;
$comprobar('el acordeón declara su bloque equivalente', ($eq['acordeon']['bloque'] ?? '') === 'core/accordion');
$comprobar('  y la correspondencia de sus partes',
    strpos($eq['acordeon']['partes']['resumen'] ?? '', 'core/accordion-heading') === 0);
$comprobar('las pestañas también', ($eq['pestanas']['bloque'] ?? '') === 'core/tabs');
$comprobar('y el catálogo la publica',
    isset($cat['composition']['equivalenciaGutenberg']['acordeon']['bloque']));

echo "\n";
if ($fallas === 0) { echo "probar-acordeon.php   TODO OK\n"; exit(0); }
echo "probar-acordeon.php   $fallas falla(s)\n";
exit(1);
