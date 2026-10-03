<?php
/**
 * El catálogo de primitivas, verificado contra el sistema real.
 *
 * POR QUÉ ESTA PRUEBA ES LA QUE IMPORTA. Cristóbal, el 3 de octubre de 2026,
 * dejó clara la división de tareas: «mi tarea es recordar, empujar hacia dónde
 * tiene que ir la aplicación y sugerir caminos. No me pidas que haga tu trabajo
 * porque no voy a poder hacerlo». Tiene razón: nadie puede revisar a ojo un
 * catálogo de 25 taxonomías por 14 familias.
 *
 * Así que el catálogo no se sostiene en que alguien lo lea, sino en que cada
 * cosa que declara EXISTA de verdad: que la clase de regla exista, que la
 * taxonomía exista, que el rol del que hereda exista. Lo que esta prueba
 * impide es el error silencioso — declarar una familia contra un `kind`
 * inventado y descubrirlo meses después, cuando un panel salga vacío.
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

$ruta = __DIR__ . '/../contope-publisher/catalogo/primitivas.json';
$crudo = file_get_contents($ruta);
$cat = json_decode($crudo, true);

echo "\n== el archivo ==\n";
$comprobar('es JSON válido', is_array($cat), json_last_error_msg());
if (!is_array($cat)) { exit(1); }
$comprobar('declara su versión', ($cat['version'] ?? null) === 1);
$comprobar('trae familias y taxonomías', isset($cat['familias'], $cat['taxonomias']));

$familias = array_filter($cat['familias'], static fn ($k) => $k !== '_', ARRAY_FILTER_USE_KEY);
$taxonomias = array_filter($cat['taxonomias'], static fn ($k) => $k !== '_', ARRAY_FILTER_USE_KEY);
$controles = array_keys(array_filter($cat['controles'], static fn ($k) => $k !== '_', ARRAY_FILTER_USE_KEY));

printf("  (%d familias, %d taxonomías, %d controles)\n", count($familias), count($taxonomias), count($controles));

echo "\n== cada familia se expresa con una clase de regla QUE EXISTE ==\n";
$kinds = COD_Canvas_MCP_Recipe_Compiler::RULE_KINDS;
foreach ($familias as $nombre => $familia) {
    $kind = $familia['kind'] ?? '';
    $comprobar(
        "familia «{$nombre}» → kind «{$kind}»",
        in_array($kind, $kinds, true),
        in_array($kind, $kinds, true) ? '' : 'ese kind no existe en el compilador'
    );
}

echo "\n== cada taxonomía es un tipo de nodo QUE EXISTE ==\n";
$nodos = COD_Canvas_MCP_Recipe_Compiler::NODE_KINDS;
foreach (array_keys($taxonomias) as $tax) {
    $comprobar("taxonomía «{$tax}»", in_array($tax, $nodos, true), in_array($tax, $nodos, true) ? '' : 'ese nodo no existe');
}

echo "\n== cada taxonomía sólo nombra familias QUE EXISTEN ==\n";
$huerfanas = [];
foreach ($taxonomias as $tax => $def) {
    foreach (['configuracion', 'diseno'] as $pestana) {
        foreach ($def[$pestana] ?? [] as $fam) {
            if (!isset($familias[$fam])) { $huerfanas[] = "$tax.$pestana → $fam"; }
        }
    }
}
$comprobar('ninguna familia huérfana', $huerfanas === [], implode(' · ', $huerfanas));

echo "\n== ninguna familia queda sin usar ==\n";
$usadas = [];
foreach ($taxonomias as $def) {
    foreach (array_merge($def['configuracion'] ?? [], $def['diseno'] ?? []) as $fam) { $usadas[$fam] = true; }
}
$sinUsar = array_diff(array_keys($familias), array_keys($usadas));
$comprobar('todas se le ofrecen a alguien', $sinUsar === [], implode(', ', $sinUsar));

echo "\n== cada propiedad usa un control QUE EXISTE ==\n";
$malControl = [];
foreach ($familias as $nombre => $familia) {
    foreach ($familia['propiedades'] ?? [] as $prop => $def) {
        if (!in_array($def['control'] ?? '', $controles, true)) {
            $malControl[] = "$nombre.$prop → " . ($def['control'] ?? '(ninguno)');
        }
    }
}
$comprobar('ningún control inventado', $malControl === [], implode(' · ', $malControl));

echo "\n== lo que hereda del set de diseño apunta a un rol QUE EXISTE ==\n";
$roles = array_keys(COD_Design_Core::roles());
$malRol = [];
$conHerencia = 0;
foreach ($familias as $nombre => $familia) {
    foreach ($familia['propiedades'] ?? [] as $prop => $def) {
        if (!isset($def['heredaDe']['rol'])) { continue; }
        $conHerencia++;
        if (!in_array($def['heredaDe']['rol'], $roles, true)) {
            $malRol[] = "$nombre.$prop → rol «{$def['heredaDe']['rol']}»";
        }
    }
}
$comprobar("ningún rol inventado ($conHerencia propiedades heredan)", $malRol === [], implode(' · ', $malRol));
$comprobar('al menos una propiedad hereda del set', $conHerencia > 0);

echo "\n== el criterio de reparto se respeta ==\n";
// Lo que NO es aspecto no puede estar en «diseño», y al revés.
$deConfiguracion = ['conducta', 'enlace'];
$mal = [];
foreach ($taxonomias as $tax => $def) {
    foreach ($def['diseno'] ?? [] as $fam) {
        if (in_array($fam, $deConfiguracion, true)) { $mal[] = "$tax: «$fam» está en diseño y no es aspecto"; }
    }
    foreach ($def['configuracion'] ?? [] as $fam) {
        if (!in_array($fam, $deConfiguracion, true)) { $mal[] = "$tax: «$fam» está en configuración y sí es aspecto"; }
    }
}
$comprobar('aspecto en diseño, lo demás en configuración', $mal === [], implode(' · ', $mal));

echo "\n== los dos ejemplos que puso Cristóbal ==\n";
$comprobar(
    'un texto NO lleva puntas redondeadas',
    !in_array('forma', $taxonomias['paragraph']['diseno'] ?? [], true)
    && !in_array('forma', $taxonomias['heading']['diseno'] ?? [], true)
);
$comprobar(
    'un contenedor NO lleva tamaños de texto',
    !in_array('tipografia', $taxonomias['group']['diseno'] ?? [], true)
);
// Y la corrección que él mismo hizo después.
$comprobar(
    'un contenedor SÍ lleva tamaño y alineación (vía disposición)',
    in_array('disposicion', $taxonomias['group']['diseno'] ?? [], true)
    && isset($familias['disposicion']['propiedades']['ancho'], $familias['disposicion']['propiedades']['alineacion'])
);
$comprobar(
    'una imagen SÍ lleva puntas redondeadas',
    in_array('forma', $taxonomias['image']['diseno'] ?? [], true)
);
$comprobar(
    'una imagen NO lleva tipografía',
    !in_array('tipografia', $taxonomias['image']['diseno'] ?? [], true)
);

echo "\n== lo que las páginas reales piden está cubierto ==\n";
// Las escapadas medidas en los guiones de Econut el 2026-10-03.
$escapadas = [
    'alineación (26 veces)'   => ['disposicion', 'alineacion'],
    'rejilla (18 veces)'      => ['disposicion', 'columnas'],
    'separación (15 veces)'   => ['disposicion', 'separacion'],
    'relleno/margen (39)'     => ['espaciado', 'relleno'],
    'ancho máximo (11)'       => ['disposicion', 'anchoMaximo'],
    'fondo (6)'               => ['superficie', 'fondo'],
    'puntas (3)'              => ['forma', 'radio'],
    'capas / z-index (2)'     => ['posicion', 'capa'],
];
foreach ($escapadas as $nombre => [$fam, $prop]) {
    $comprobar("«{$nombre}» tiene dónde vivir", isset($familias[$fam]['propiedades'][$prop]), "$fam.$prop");
}

echo "\n== las disposiciones de columnas ==\n";
$col = $familias['disposicion']['columnas'] ?? [];
$comprobar('el catálogo las trae', isset($col['grupos']) && is_array($col['grupos']));
$total = 0;
foreach ($col['grupos'] ?? [] as $g) { $total += count($g['variantes'] ?? []); }
$comprobar('trae las 15 que tenía el editor en el código', $total === 15, (string) $total);

$malPeso = [];
foreach ($col['grupos'] ?? [] as $g) {
    foreach ($g['variantes'] ?? [] as $v) {
        if (count($v['pesos'] ?? []) !== (int) $g['columnas']) {
            $malPeso[] = ($v['rotulo'] ?? '?') . ': dice ' . $g['columnas'] . ' columnas y trae ' . count($v['pesos'] ?? []);
        }
        foreach ($v['pesos'] ?? [] as $peso) {
            if (!is_int($peso) || $peso < 1) { $malPeso[] = ($v['rotulo'] ?? '?') . ': peso inválido'; }
        }
    }
}
$comprobar('cada variante tiene tantos pesos como columnas dice', $malPeso === [], implode(' · ', $malPeso));

echo "\n== el techo por breakpoint ==\n";
// En un teléfono una fila de seis columnas no es una opción, es una trampa.
$comprobar('en escritorio caben los 5 grupos', count(COD_Catalogo::columnas('desktop')) === 5);
$comprobar('en tablet se recorta a 3', count(COD_Catalogo::columnas('tablet')) === 3);
$comprobar('en móvil se recorta a 2', count(COD_Catalogo::columnas('mobile')) === 2);
$comprobar('un breakpoint desconocido cae en escritorio', count(COD_Catalogo::columnas('reloj')) === 5);

echo "\n== se puede AMPLIAR sin tocar el editor ==\n";
// Ésta es la razón de ser del catálogo. Si esto falla, haberlo sacado del
// código no sirvió de nada.
add_filter('cod_catalogo', static function (array $c): array {
    $c['familias']['disposicion']['columnas']['techoPorBreakpoint']['desktop'] = 7;
    $c['familias']['disposicion']['columnas']['grupos'][] = [
        'columnas' => 7,
        'variantes' => [['rotulo' => 'Siete iguales', 'pesos' => [1, 1, 1, 1, 1, 1, 1]]],
    ];
    return $c;
});
COD_Catalogo::olvidar();
$comprobar('una disposición nueva aparece', count(COD_Catalogo::columnas('desktop')) === 6);
$alEditor = array_column(COD_Catalogo::para_el_editor()['familias']['disposicion']['columnas']['grupos'], 'columnas');
$comprobar('  y llega al editor', in_array(7, $alEditor, true));
remove_all_filters('cod_catalogo');
COD_Catalogo::olvidar();
$comprobar('al quitar el filtro vuelve a lo de fábrica', count(COD_Catalogo::columnas('desktop')) === 5);

echo "\n== lo que el editor recibe ==\n";
$paraEditor = COD_Catalogo::para_el_editor();
$comprobar('lleva familias, taxonomías y controles', isset($paraEditor['familias'], $paraEditor['taxonomias'], $paraEditor['controles']));
$deUnTitulo = COD_Catalogo::para('heading');
$comprobar('pedir por taxonomía devuelve las familias resueltas', isset($deUnTitulo['diseno']['tipografia']['propiedades']));
$comprobar('  una taxonomía inventada no revienta', COD_Catalogo::para('inventada')['diseno'] === []);


echo "\n== el catálogo propone, no prohíbe ==\n";
// Un texto con puntas redondeadas no está en el catálogo, pero el compilador
// debe seguir aceptándolo: «el diseño funciona sobre la base de excepciones».
$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$regla = [
    'id' => 'r-excepcion', 'kind' => 'shape',
    'scope' => ['breakpoint' => 'all', 'state' => 'default'],
    'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'La quinta paralela.']]],
    'status' => 'reviewed', 'value' => ['radius' => '8px'],
];
$r = $compilador->compile(
    ['schemaVersion' => 2, 'nodes' => [['id' => 's', 'kind' => 'section', 'children' => [
        ['id' => 't', 'kind' => 'paragraph', 'ruleIds' => ['r-excepcion'], 'content' => ['text' => 'Con puntas']],
    ]]]],
    ['schemaVersion' => 1, 'designId' => 'p', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => [$regla]]
);
$comprobar('un texto con puntas redondeadas SE PUEDE componer igual', !is_wp_error($r),
    is_wp_error($r) ? $r->get_error_message() : '');

echo "\n";
if ($fallas === 0) { echo "probar-catalogo-primitivas.php   TODO OK\n"; exit(0); }
echo "probar-catalogo-primitivas.php   $fallas falla(s)\n";
exit(1);
