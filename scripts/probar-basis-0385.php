<?php
/**
 * Las ampliaciones del plugin de la 0.3.85 (Basis, segunda pasada):
 *
 *  1. BLOQUE NATIVO: el nodo `block` pone dentro de la composición un bloque de Gutenberg (core/search, core/latest-posts,
 *     core/latest-comments…) que dibuja WordPress al mostrar la página. Se valida, se compila a un marcador que conserva su caja,
 *     se rellena con lo que WordPress produce, sus partes reciben reglas, y lo que no está en la lista permitida no se dibuja.
 *  2. CONTRATO DEL FORMULARIO, segunda parte: el tipo `keyword` (lista cerrada de valores) y las variables de rellenos,
 *     separaciones, casilla propia y contador.
 *
 * Corre contra el WordPress local de Basis (puerto 8894, con el plugin del repositorio copiado: `node scripts/basis/sincronizar-local.mjs`).
 * Nunca contra wp-local ni contra Econut.
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
    'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.85.']]], 'status' => 'reviewed', 'value' => $value,
];
$compilar = static function (array $nodos, array $reglas) use ($compilador) {
    return $compilador->compile(['schemaVersion' => 2, 'nodes' => $nodos], [
        'schemaVersion' => 1, 'designId' => 'prueba-0385', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas,
    ]);
};
$estilos = static fn ($r): string => is_wp_error($r) ? 'ERROR: ' . $r->get_error_message() : (string) $r['storage']['styles'];
$marcado = static fn ($r): string => is_wp_error($r) ? 'ERROR: ' . $r->get_error_message() : (string) $r['storage']['markup'];
$error = static fn ($r): string => is_wp_error($r) ? $r->get_error_message() : '';

// ---------------------------------------------------------------------------
echo "== 1. el nodo block (bloque nativo de Gutenberg) ==\n";
$bloque = static fn (array $contenido, array $reglas = [], array $partes = []) => [[
    'id' => 'b', 'kind' => 'block', 'ruleIds' => $reglas, 'content' => $contenido,
] + ($partes === [] ? [] : ['partes' => $partes])];

$comprobar('block figura entre los tipos de nodo', in_array('block', COD_Canvas_MCP_Recipe_Compiler::NODE_KINDS, true));
$r = $compilar($bloque(['name' => 'core/search', 'attrs' => ['label' => 'Buscar', 'buttonText' => 'Buscar']]), []);
$comprobar('core/search con atributos se acepta', !is_wp_error($r), $error($r));
$m = $marcado($r);
$comprobar('compila a un marcador vacío que conserva su caja y nombra el bloque', strpos($m, 'data-cod-bloque="core/search"') !== false && strpos($m, 'cod-bloque') !== false, $m);
$comprobar('…con los atributos en JSON', strpos($m, 'data-cod-bloque-atts=') !== false && strpos($m, 'buttonText') !== false, $m);
$r = $compilar($bloque(['name' => 'core/latest-posts']), []);
$comprobar('un bloque sin attrs se acepta', !is_wp_error($r), $error($r));
$comprobar('…y no lleva data-cod-bloque-atts', strpos($marcado($r), 'data-cod-bloque-atts') === false);

foreach ([
    'un bloque fuera de la lista permitida se rechaza nombrándolo' => [['name' => 'core/html'], 'core/html'],
    'un bloque de otro plugin que no está en la lista se rechaza' => [['name' => 'acme/mortal'], 'acme/mortal'],
    'sin name se rechaza' => [['attrs' => []], 'name'],
    'una clave que no es name ni attrs se rechaza' => [['name' => 'core/search', 'html' => '<b>x</b>'], 'block'],
    'un atributo con guion en el nombre se rechaza' => [['name' => 'core/search', 'attrs' => ['mi-atributo' => 'x']], 'attrs'],
    'un atributo que es un arreglo se rechaza' => [['name' => 'core/search', 'attrs' => ['a' => ['x']]], 'texto, número o booleano'],
    'un atributo con HTML se rechaza' => [['name' => 'core/search', 'attrs' => ['label' => '<script>x</script>']], 'label'],
] as $caso => [$contenido, $pista]) {
    $mal = $compilar($bloque($contenido), []);
    $comprobar($caso, is_wp_error($mal) && stripos($error($mal), $pista) !== false, $error($mal) ?: 'se aceptó');
}

// Las partes: reglas sobre el buscador y sus elementos internos (clases de Gutenberg)
$reglas = [
    $regla('caja', 'properties', ['declarations' => ['position' => 'relative', 'margin-block-end' => '30px']]),
    $regla('ent', 'properties', ['declarations' => ['padding-top' => '9.8px', 'border-top-width' => '1px']]),
    $regla('bot', 'properties', ['declarations' => ['position' => 'absolute', 'right' => '0px']]),
    $regla('lis', 'properties', ['declarations' => ['list-style-type' => 'none']]),
];
$r = $compilar($bloque(['name' => 'core/search'], ['caja'], ['entrada' => ['ent'], 'boton' => ['bot'], 'lista' => ['lis']]), $reglas);
$comprobar('las partes del bloque (entrada, boton, lista) se aceptan', !is_wp_error($r), $error($r));
$css = $estilos($r);
$comprobar('la parte entrada se emite sobre .wp-block-search__input, anclada al nodo', preg_match('/\.cod-node-id-b\s+\.wp-block-search__input\s*\{[^}]*padding-top:9\.8px/', $css) === 1, $css);
$comprobar('la parte boton se emite sobre .wp-block-search__button', preg_match('/\.cod-node-id-b\s+\.wp-block-search__button\s*\{[^}]*position:absolute/', $css) === 1, $css);
$mal = $compilar($bloque(['name' => 'core/search'], [], ['inexistente' => ['ent']]), $reglas);
$comprobar('una parte que el bloque no tiene se rechaza', is_wp_error($mal), 'se aceptó');

// ---------------------------------------------------------------------------
echo "\n== 2. el renderizador: WordPress dibuja adentro del marcador ==\n";
$renderer = new COD_Canvas_Bloque_Renderer();
$html = $renderer->render('<div class="cod-node cod-node--block" data-cod-bloque="core/search" data-cod-bloque-atts="{&quot;label&quot;:&quot;Buscar&quot;,&quot;buttonText&quot;:&quot;Ir&quot;}"></div>');
$comprobar('el div se conserva (es el que recibe las reglas)', strpos($html, '<div class="cod-node cod-node--block" data-cod-bloque="core/search"') === 0 && substr($html, -6) === '</div>', $html);
$comprobar('core/search dibuja su formulario de WordPress', strpos($html, 'class="wp-block-search') !== false && strpos($html, 'role="search"') !== false, $html);
$comprobar('…con los atributos que se le pasaron (el texto del botón)', strpos($html, '>Ir</button>') !== false, $html);

$titulo = 'Entrada de prueba 0385 ' . wp_generate_password(6, false);
$id = wp_insert_post(['post_title' => $titulo, 'post_status' => 'publish', 'post_type' => 'post', 'post_content' => 'x']);
$html = $renderer->render('<div data-cod-bloque="core/latest-posts"></div>');
$comprobar('latest-posts: la entrada nueva aparece (no hay nada copiado a mano)', strpos($html, $titulo) !== false && strpos($html, 'wp-block-latest-posts__list') !== false, $html);
// OJO: ni wp_delete_post() ni el id que devolvió wp_insert_post(). En el SQLite local ese id quedó UNO por debajo del real y el borrado se
// llevó OTRA entrada (la anterior, «Hello world!»): medido el 30-oct-2026 en cuatro corridas; es del entorno de pruebas, no del lienzo.
// Se borra por el título, que es único.
global $wpdb;
$wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->posts} WHERE post_title = %s", $titulo));
wp_cache_flush(); // otra visita: el caché de consultas vive sólo dentro de una petición
$html = $renderer->render('<div data-cod-bloque="core/latest-posts"></div>');
$comprobar('…y al borrarla desaparece sola', strpos($html, $titulo) === false, $html);

$html = $renderer->render('<div data-cod-bloque="core/latest-comments"></div>');
$comprobar('latest-comments dibuja su salida (lista o el aviso de que no hay)', strpos($html, 'wp-block-latest-comments') !== false, $html);

$html = $renderer->render('<div data-cod-bloque="core/html"></div>');
$comprobar('un bloque fuera de la lista no se dibuja ni se muestra', strpos($html, 'ocd: bloque no permitido') !== false, $html);
$html = $renderer->render('<p>[ver planos] y data-cod-bloque en un texto</p>');
$comprobar('el texto del diseño no dispara nada', $html === '<p>[ver planos] y data-cod-bloque en un texto</p>');
$html = $renderer->render('<div data-cod-bloque="core/search" data-cod-bloque-atts="{&quot;noExiste&quot;:&quot;x&quot;,&quot;a-b&quot;:1}"></div>');
$dentro = substr($html, (int) strpos($html, '><form') + 1);
$comprobar('un atributo que el bloque no conoce se descarta sin romper nada', strpos($dentro, 'wp-block-search') !== false && strpos($dentro, 'noExiste') === false, $html);

add_filter('cod_canvas_bloques_permitidos', static fn (array $l) => array_merge($l, ['core/rss']));
$comprobar('el filtro cod_canvas_bloques_permitidos amplía la lista', COD_Canvas_Bloque_Renderer::es_permitido('core/rss'));
remove_all_filters('cod_canvas_bloques_permitidos');
$comprobar('…y sin él, core/rss no está', !COD_Canvas_Bloque_Renderer::es_permitido('core/rss'));

// De punta a punta por la publicación de una página: el marcador se rellena al MOSTRAR (no al compilar).
$comprobar('la hoja del editor trae el rótulo del marcador vacío', strpos(COD_Canvas_Page_Publisher::bloque_marker_css(), '[data-cod-bloque]:empty') !== false);

// ---------------------------------------------------------------------------
echo "\n== 3. el contrato del formulario, segunda parte ==\n";
$formulario = static fn (array $tema) => $compilar([['id' => 'f', 'kind' => 'form', 'ruleIds' => ['t'], 'content' => ['formSlug' => 'contacto-basis']]], [$regla('t', 'form', ['theme' => $tema])]);
$segunda = [
    'grupoTituloSeparacion' => '10px', 'etiquetaSeparacion' => '5px', 'etiquetaRellenoSuperior' => '5px', 'opcionEtiquetaRellenoSuperior' => '0px',
    'controlSeparacion' => '0px', 'ayudaRellenoY' => '10px', 'ayudaSeparacion' => '8px', 'contadorRellenoY' => '10px', 'contadorSeparacion' => '8px',
    'contadorInterlineado' => '1.43', 'contadorAlineacion' => 'left', 'pieRellenoY' => '16px', 'pieSeparacion' => '6px',
    'casillaApariencia' => 'none', 'casillaTamano' => '18px', 'casillaFondo' => '#EEEEEE', 'casillaMarca' => '#2EA3F2', 'casillaMargenSuperior' => '0px',
    'opcionSangria' => '12px', 'opcionSeparacion' => '6px', 'opcionAlineacion' => 'center', 'opcionesRellenoY' => '1.23px',
    'rejillaSeparacion' => '16px', 'rejillaFilaSeparacion' => '16px', 'rejillaSubSeparacion' => '12px',
];
$r = $formulario($segunda);
$comprobar('las variables de la segunda parte del contrato se aceptan', !is_wp_error($r), $error($r));
foreach (['--ofr-help-pad-y:10px', '--ofr-counter-align:left', '--ofr-counter-line:1.43', '--ofr-check-appearance:none', '--ofr-check-bg:#EEEEEE', '--ofr-footer-gap:6px', '--ofr-grid-sub-gap:12px', '--ofr-option-align:center'] as $v) {
    $comprobar("emite $v", strpos($estilos($r), $v) !== false, $estilos($r));
}
foreach ([['contadorAlineacion', 'justify'], ['contadorAlineacion', 'derecha'], ['casillaApariencia', 'checkbox'], ['opcionAlineacion', 'top'], ['ayudaRellenoY', 'calc(1px + 2px)'], ['contadorInterlineado', 'normal'], ['casillaFondo', 'url(x)']] as [$clave, $valor]) {
    $mal = $formulario([$clave => $valor]);
    $comprobar("el valor «{$valor}» de {$clave} se rechaza", is_wp_error($mal) && stripos($error($mal), $clave) !== false, $error($mal));
}
$respaldo = (new ReflectionMethod($compilador, 'form_theme_tokens_respaldo'));
$respaldo->setAccessible(true);
$lista = $respaldo->invoke(null);
$sinValores = array_filter($lista, static fn ($d) => $d['type'] === 'keyword' && (empty($d['values']) || !is_array($d['values'])));
$comprobar('en la lista de respaldo toda variable keyword declara sus valores', $sinValores === [], implode(',', array_keys($sinValores)));
$desdeRuntime = [];
foreach (OFR_Design_Tokens::advanced() as $clave => $def) {
    $desdeRuntime[$clave] = $def['token'] . '|' . $def['type'];
}
$desalineadas = [];
foreach ($lista as $clave => $def) {
    if (isset($desdeRuntime[$clave]) && $desdeRuntime[$clave] !== $def['token'] . '|' . $def['type']) {
        $desalineadas[] = $clave;
    }
}
$comprobar('la lista de respaldo coincide con la del runtime de formularios (mismo token y tipo)', $desalineadas === [], implode(',', $desalineadas));
$faltan = array_values(array_diff(array_keys($desdeRuntime), array_keys($lista), ['surfaceAlt']));
$comprobar('…y no le falta ninguna variable que el runtime sí tiene', $faltan === [], implode(',', $faltan));

echo "\n" . ($fallas === 0 ? "TODO OK ($total comprobaciones)" : "$fallas de $total FALLARON") . "\n";
exit($fallas === 0 ? 0 : 1);
