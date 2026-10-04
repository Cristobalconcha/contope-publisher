<?php
/**
 * La hoja base del lienzo vive en el plugin, no dentro de los documentos.
 *
 * DE DÓNDE SALE ESTA PRUEBA. Hasta la 0.3.62 `compile()` guardaba una copia de
 * la hoja base dentro de cada documento, así que una página con encabezado,
 * cuerpo y pie servía TRES copias —de versiones distintas, porque cada
 * documento conservaba la del día en que se compiló— y la última ganaba y
 * pisaba el diseño. Se tapaba descartando las repetidas al servir.
 *
 * Cristóbal, el 4 de octubre de 2026: «el proceso de deduplicación es como que
 * hubieras pinchado un neumático y después lo tuvieras que parchar. Lo que
 * necesitamos es que el neumático no se pinche. No tiene por qué generarse una
 * hoja de estilo por cada página de un sitio; la hoja tiene que ser
 * centralizada».
 *
 * Lo que se comprueba:
 *  - que el archivo y la función digan lo mismo (hay una sola fuente, y el
 *    archivo se genera de ella con `scripts/generar-css-base.php`);
 *  - que un documento recién compilado NO la lleve dentro;
 *  - que el descarte de copias viejas siga ahí, porque los documentos de antes
 *    todavía la traen hasta que se recompilen.
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

$archivo = __DIR__ . '/../contope-publisher/assets/css/cod-canvas-base.css';
$base = COD_Canvas_MCP_Recipe_Compiler::base_styles();

echo "\n== el archivo y la función dicen lo mismo ==\n";
$comprobar('el archivo existe', is_readable($archivo), $archivo);
$contenido = is_readable($archivo) ? (string) file_get_contents($archivo) : '';
$comprobar('contiene la hoja base entera', strpos($contenido, $base) !== false,
    'si falla: php scripts/generar-css-base.php');
$comprobar('y nada más que la cabecera', strlen($contenido) - strlen($base) < 400);
$comprobar('avisa de que no se edita a mano', strpos($contenido, 'No editar a mano') !== false);

echo "\n== un documento recién compilado NO la lleva dentro ==\n";
$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$r = $compilador->compile(
    ['schemaVersion' => 2, 'nodes' => [['id' => 'p', 'kind' => 'paragraph', 'ruleIds' => ['r'], 'content' => ['text' => 'Hola']]]],
    ['schemaVersion' => 1, 'designId' => 'prueba-base', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => [[
        'id' => 'r', 'kind' => 'surface', 'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba.']]],
        'status' => 'reviewed', 'value' => ['backgroundColor' => '#FFFFFF'],
    ]]]
);
$comprobar('compila', !is_wp_error($r), is_wp_error($r) ? $r->get_error_message() : '');
$css = is_wp_error($r) ? '' : (string) $r['storage']['styles'];
$comprobar('el documento NO trae la hoja base', strpos($css, '.cod-group{display:grid') === false);
$comprobar('  y sí trae su propia regla', strpos($css, 'cod-rule--r') !== false);
$comprobar('  así que pesa lo que pesa su diseño', strlen($css) < strlen($base), strlen($css) . ' bytes');

echo "\n== el descarte sigue, para los documentos de antes ==\n";
// Un documento compilado con una versión anterior todavía la lleva adentro.
$viejo = $base . ".cod-rule--vieja{color:red;}\n";
$unido = COD_Canvas_Page_Publisher::unir_css_de_documentos([$viejo, ".cod-rule--nueva{color:blue;}\n"]);
$comprobar('la base de un documento viejo se descarta', substr_count($unido, '.cod-group{display:grid') <= 1);
$comprobar('  conservando sus reglas', strpos($unido, '.cod-rule--vieja{color:red;}') !== false
    && strpos($unido, '.cod-rule--nueva{color:blue;}') !== false);

echo "\n== el editor carga la misma hoja ==\n";
// Los dos motores tienen que mostrar lo mismo: si el editor no la cargara, el
// lienzo se vería sin los estilos del motor y nadie podría componer.
$nucleo = (string) file_get_contents(__DIR__ . '/../contope-publisher/assets/js/cod-editor-core.js');
$admin = (string) file_get_contents(__DIR__ . '/../contope-publisher/includes/class-cod-canvas-editor-admin.php');
$comprobar('el editor la carga en su lienzo', strpos($nucleo, 'canvas: options.baseCssUrl') !== false);
$comprobar('y el panel le pasa la dirección', strpos($admin, "'baseCssUrl'") !== false);
$comprobar('  del propio plugin, no de un CDN', strpos($admin, "plugins_url('assets/css/cod-canvas-base.css'") !== false);

echo "\n";
if ($fallas === 0) { echo "probar-css-base.php   TODO OK\n"; exit(0); }
echo "probar-css-base.php   $fallas falla(s)\n";
exit(1);
