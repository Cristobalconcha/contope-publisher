<?php
/**
 * Una regla de diseño puede REFERENCIAR la identidad del tema, no copiarla.
 *
 * DE DÓNDE SALE. En este sistema la identidad vive en el tema: el tema declara
 * la paleta y las tipografías como variables y el lienzo las extiende. Pero
 * hasta el 4 de octubre de 2026 las reglas semánticas —typography, color,
 * surface— rechazaban `var()`, y eso dejaba sólo dos salidas, las dos malas:
 *
 *  - copiar los valores de la marca como literales dentro del diseño, y que se
 *    desincronicen en cuanto el tema cambie un tono;
 *  - escribirlo todo con reglas `properties`, que sí aceptan var() pero pierden
 *    el rol y la procedencia que hacen reutilizable al set de diseño.
 *
 * Se encontró al ir a recomponer el sitio de Santa Luisa por el constructor:
 * su paleta entera está en variables del tema (`--dorado-600`, `--oliva-700`,
 * `--font-hero`…), así que sin esto la recomposición fiel era imposible.
 *
 * Lo que se comprueba: que la referencia funcione en los tres tipos, que
 * conserve el rol semántico, y —la mitad que importa— que lo peligroso siga
 * rechazándose. El respaldo de una variable no puede llevar paréntesis, que es
 * lo que impide anidar otra función o colar `url(` o `expression(`.
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

/** Compila una sola regla y devuelve su CSS, o el mensaje de rechazo. */
$css_de = static function (string $kind, array $value) use ($compilador) {
    $r = $compilador->compile(
        ['schemaVersion' => 2, 'nodes' => [['id' => 'n', 'kind' => 'paragraph', 'ruleIds' => ['r'], 'content' => ['text' => 'x']]]],
        ['schemaVersion' => 1, 'designId' => 'prueba-var', 'expectedDesignRevision' => 0, 'reviewState' => 'session',
         'rules' => [[
            'id' => 'r', 'kind' => $kind, 'scope' => ['breakpoint' => 'all', 'state' => 'default'],
            'provenance' => ['sources' => [['kind' => 'reference', 'reference' => 'tema contope-santa-luisa', 'rationale' => 'La identidad vive en el tema.']]],
            'status' => 'reviewed', 'value' => $value,
         ]]]
    );
    return is_wp_error($r) ? ['error' => $r->get_error_message()] : ['css' => (string) $r['storage']['styles']];
};

echo "\n== la referencia funciona en los tres tipos semánticos ==\n";
$t = $css_de('typography', ['role' => 'titulo', 'family' => 'var(--font-hero)']);
$comprobar('typography.family', isset($t['css']) && strpos($t['css'], 'font-family:var(--font-hero)') !== false,
    $t['error'] ?? '');

$c = $css_de('color', ['role' => 'titulo', 'color' => 'var(--dorado-600)']);
$comprobar('color.color', isset($c['css']) && strpos($c['css'], 'color:var(--dorado-600)') !== false, $c['error'] ?? '');
// El rol semántico es lo que se perdía al escribirlo con properties: se conserva.
$comprobar('  y conserva el rol como variable propia',
    isset($c['css']) && strpos($c['css'], '--cod-color-titulo:var(--dorado-600)') !== false);

$s = $css_de('surface', ['backgroundColor' => 'var(--tierra-50)']);
$comprobar('surface.backgroundColor', isset($s['css']) && strpos($s['css'], 'background-color:var(--tierra-50)') !== false,
    $s['error'] ?? '');

$b = $css_de('surface', ['borderColor' => 'var(--slp-border)', 'borderWidth' => '1px']);
$comprobar('surface.borderColor', isset($b['css']) && strpos($b['css'], 'var(--slp-border)') !== false, $b['error'] ?? '');

echo "\n== con respaldo, que es texto llano ==\n";
$r1 = $css_de('color', ['role' => 'titulo', 'color' => 'var(--dorado-600, #cda23c)']);
$comprobar('var(--x, #hex)', isset($r1['css']) && strpos($r1['css'], 'var(--dorado-600, #cda23c)') !== false, $r1['error'] ?? '');
$r2 = $css_de('typography', ['role' => 't', 'family' => "var(--font-body, 'Montserrat', sans-serif)"]);
$comprobar("var(--x, 'Familia', sans-serif)", isset($r2['css']), $r2['error'] ?? '');

echo "\n== y lo peligroso sigue rechazándose ==\n";
/*
 * La mitad que importa. El respaldo no admite paréntesis: ahí se cierra la
 * puerta a anidar otra función. Si alguna de éstas pasa, la lista blanca se
 * abrió de más.
 */
$malos = [
    'una función anidada' => 'var(--x, url(http://malo/a.png))',
    'url() pelado' => 'url(http://malo/a.png)',
    'expression()' => 'var(--x, expression(alert(1)))',
    'javascript: en el respaldo' => 'var(--x, javascript:alert(1))',
    'un punto y coma' => 'var(--x); color: red',
    'una llave' => 'var(--x}{color:red)',
    'dos variables pegadas' => 'var(--a) var(--b)',
    'un nombre que no es propiedad personalizada' => 'var(dorado-600)',
    'un comentario de CSS' => 'var(--x) /* ',
    'una variable sin cerrar' => 'var(--x',
    'mayúsculas en el nombre' => 'var(--Dorado-600)',
    'un nombre vacío' => 'var(--)',
];
foreach ($malos as $caso => $valor) {
    $r = $css_de('color', ['role' => 'titulo', 'color' => $valor]);
    $comprobar($caso, isset($r['error']), isset($r['error']) ? '' : 'LO ACEPTÓ: ' . trim($r['css']));
}

echo "\n== y NINGUNA regla emite una abreviada con var() ==\n";
/*
 * LA MITAD QUE DE VERDAD IMPORTA, y la que casi se me pasa.
 *
 * Cristóbal lo precisó el 4 de octubre de 2026, corrigiéndome el motivo de la
 * restricción: «lo que rechaza son las abreviaciones, pero no las variables».
 * Exacto. Admitir var() es seguro SÓLO si lo que se emite va en forma larga,
 * porque GrapesJS descarta en silencio una abreviada que lleva una variable y
 * la declaración se pierde al guardar.
 *
 * Y al admitirlas apareció justo ese caso: surface con borderColor emitía
 * `border-color:var(--x)`, que es una abreviada de las cuatro
 * border-<lado>-color. Se validaba, se guardaba y no pintaba. Por eso esto se
 * comprueba sobre la SALIDA y no sobre la entrada: lo que hay que vigilar no
 * es qué se acepta, es qué se escribe.
 */
$ABREVIADAS = ['background', 'border', 'border-width', 'border-style', 'border-color',
    'border-radius', 'font', 'margin', 'padding', 'transition', 'animation',
    'grid', 'flex', 'gap', 'overflow', 'inset', 'place-items', 'place-content'];

$conVariable = [
    'surface borde' => ['surface', ['borderColor' => 'var(--slp-border)', 'borderWidth' => '1px']],
    'surface fondo' => ['surface', ['backgroundColor' => 'var(--tierra-50)']],
    'surface fondo y velo' => ['surface', ['backgroundColor' => 'var(--tierra-50)', 'overlayColor' => 'var(--oliva-700)', 'overlayOpacity' => 0.3]],
    'surface fondo y sombra' => ['surface', ['backgroundColor' => 'var(--slp-surface)', 'shadow' => 'md']],
    'surface texto' => ['surface', ['foregroundColor' => 'var(--oliva-700)']],
    'typography familia' => ['typography', ['role' => 't', 'family' => 'var(--font-hero)']],
    'color' => ['color', ['role' => 'titulo', 'color' => 'var(--dorado-600)']],
];
foreach ($conVariable as $nombre => [$kind, $value]) {
    $r = $css_de($kind, $value);
    if (isset($r['error'])) { $comprobar($nombre, false, $r['error']); continue; }
    $culpables = [];
    foreach ($ABREVIADAS as $a) {
        if (preg_match('/(?:^|;|\{)\s*' . preg_quote($a, '/') . ':[^;]*var\(/', $r['css'])) {
            $culpables[] = $a;
        }
    }
    $comprobar($nombre, $culpables === [],
        $culpables === [] ? '' : 'ABREVIADA CON VAR: ' . implode(', ', $culpables));
}
echo "\n== lo de siempre sigue igual ==\n";
$lit = $css_de('color', ['role' => 'titulo', 'color' => '#A98143']);
$comprobar('un color literal', isset($lit['css']) && strpos($lit['css'], '#A98143') !== false, $lit['error'] ?? '');
$fam = $css_de('typography', ['role' => 't', 'family' => "'Bodoni Moda', Georgia, serif"]);
$comprobar('una familia literal', isset($fam['css']) && strpos($fam['css'], 'Bodoni Moda') !== false, $fam['error'] ?? '');
$mal = $css_de('color', ['role' => 'titulo', 'color' => 'rgb(229 0 126 / 0.3)']);
$comprobar('la forma con barra sigue rechazada (WordPress la descarta)', isset($mal['error']),
    isset($mal['error']) ? '' : 'LO ACEPTÓ');

echo "\n";
if ($fallas === 0) { echo "probar-variables-del-tema.php   TODO OK\n"; exit(0); }
echo "probar-variables-del-tema.php   $fallas falla(s)\n";
exit(1);
