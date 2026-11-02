<?php
/**
 * LA COMPUERTA DEL DISEÑO: una IA que usa el MCP no puede saltarse el sistema.
 *
 * Esta prueba FALLA si la compuerta no está. No comprueba que el código "exista":
 * intenta, por cada camino de escritura del MCP, meter un valor de diseño escrito
 * a mano, y exige que en `enforce` se rechace con un código estable y que en `off`
 * (el modo de Santa Luisa y Econut) se acepte exactamente como siempre.
 *
 * Qué cubre:
 *   1. Que lo instalado en el local sea lo que hay en el repositorio (si no, la
 *      prueba mediría código viejo: pasó con Econut en 0.3.36).
 *   2. Cada herramienta del servicio MCP queda clasificada: las que escriben diseño
 *      pasan por la compuerta, y una herramienta nueva sin clasificar rompe la prueba.
 *   3. Estático: el servicio no llama a repository->save() directo.
 *   4. Por camino —cod_patch_css, cod_patch_html, cod_write_canvas_document,
 *      cod_sync_project_data, cod_grapes_edit_node, cod_activate_section_whatsapp,
 *      cod_patch_geo_places, cod_preview/apply_canvas_composition—: literal →
 *      rechazado en enforce y aceptado en off; variable reservada; literal sólo en
 *      projectData; fill="#…" en un SVG; respaldo literal; una referencia válida
 *      al registro, aceptada.
 *   5. observe no rechaza; ratchet deja pasar lo heredado y rechaza lo nuevo.
 *   6. El modo NO se puede cambiar por el MCP.
 *   7. La revisión se recompara dentro del bloqueo (H5).
 *
 * Corre contra el WordPress local de Basis (puerto 8894). Sincronizar antes el
 * plugin del repo a ese local. Nunca contra wp-local (Santa Luisa) ni producción.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$fallas = 0;
$ejecutadas = 0;
$omitidas = [];
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas, &$ejecutadas) {
    ++$ejecutadas;
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? '   -> ' . $detalle : '') . "\n";
    if (!$ok) {
        ++$fallas;
    }
};

// ---------------------------------------------------------------------------
echo "\n== 1. lo instalado es lo que hay en el repositorio ==\n";
$repo_dir = realpath(__DIR__ . '/../contope-publisher');
$inst_dir = rtrim((string) COD_PUBLISHER_DIR, '/\\');
foreach (['class-cod-adn-registry.php', 'class-cod-adn-gate.php', 'class-cod-adn-gate-rest.php', 'class-cod-block-page-writer.php', 'class-cod-site-package-importer.php', 'class-cod-adn-gate-admin.php', 'class-cod-canvas-document-repository.php', 'class-cod-canvas-mcp-service.php', 'class-cod-canvas-mcp-recipe-compiler.php', 'class-cod-mcp-server.php'] as $archivo) {
    $a = $repo_dir . '/includes/' . $archivo;
    $b = $inst_dir . '/includes/' . $archivo;
    $iguales = is_file($a) && is_file($b) && md5_file($a) === md5_file($b);
    $comprobar('instalado == repo: ' . $archivo, $iguales, 'sincroniza el plugin al local de Basis antes de probar');
}
if (!class_exists('COD_ADN_Gate') || !class_exists('COD_ADN_Registry')) {
    echo "\n  FALLA  la compuerta no está cargada: sin COD_ADN_Gate nada de lo demás significa algo.\n";
    exit(1);
}

$opcion_original = get_option(COD_ADN_Gate::OPTION_MODE, null);
$modo = static function (string $m): void {
    update_option(COD_ADN_Gate::OPTION_MODE, $m, false);
};

// El servicio, armado igual que en contope-publisher.php.
$repositorio = new COD_Canvas_Document_Repository();
$resolutor = new COD_Template_Region_Resolver($repositorio);
$publicador = new COD_Canvas_Page_Publisher($repositorio, $resolutor, new COD_Dynamic_Token_Resolver());
$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$servicio = new COD_Canvas_MCP_Service($repositorio, $publicador, $resolutor, $compilador, new COD_Canvas_Asset_Resolver());

// ---------------------------------------------------------------------------
echo "\n== 2. cada herramienta del servicio MCP está clasificada ==\n";
$clasificacion = [
    // escriben diseño: TIENEN que pasar por la compuerta
    'cod_apply_canvas_composition' => 'escribe',
    'cod_patch_css' => 'escribe',
    'cod_patch_html' => 'escribe',
    'cod_write_canvas_document' => 'escribe',
    'cod_grapes_edit_node' => 'escribe',
    'cod_sync_project_data' => 'escribe',
    'cod_activate_section_whatsapp' => 'escribe',
    'cod_patch_geo_places' => 'escribe',
    // la vía oficial del contenido en bloques: pasa por la compuerta (prueba: scripts/probar-compuerta-rest.php)
    'cod_write_block_page' => 'escribe',
    'cod_read_block_page' => 'lee',
    // validan sin escribir, con el mismo criterio que apply
    'cod_preview_canvas_composition' => 'revisa',
    // no escriben diseño
    'cod_get_capabilities' => 'lee',
    // el ADN: no escriben diseño en documentos; el import cambia lo que se puede referenciar (prueba: scripts/probar-adn-almacen.php)
    'cod_adn_get' => 'lee',
    'cod_adn_export' => 'lee',
    'cod_adn_preview_import' => 'revisa',
    'cod_adn_apply_import' => 'adn',
    'cod_list_canvas_pages' => 'lee',
    'cod_get_canvas_page_state' => 'lee',
    'cod_read_canvas_composition' => 'lee',
    'cod_resolve_canvas_assets' => 'lee',
    'cod_list_canvas_forms' => 'lee',
    'cod_read_canvas_document' => 'lee',
    'cod_create_canvas_page' => 'vacio',
    'cod_create_canvas_region' => 'vacio',
    'cod_publish_canvas_page' => 'publica',
    'cod_set_whatsapp_number' => 'opcion',
    'cod_set_mapbox_token' => 'opcion',
];
$nombres_herramientas = array_map(static fn (array $t): string => $t['name'], $servicio->tool_definitions());
$sin_clasificar = array_values(array_diff($nombres_herramientas, array_keys($clasificacion)));
$comprobar('ninguna herramienta sin clasificar (si suma una, decidir si escribe diseño)', $sin_clasificar === [], implode(', ', $sin_clasificar));
$desaparecidas = array_values(array_diff(array_keys($clasificacion), $nombres_herramientas));
$comprobar('ninguna herramienta clasificada que ya no exista', $desaparecidas === [], implode(', ', $desaparecidas));

echo "\n== 3. estático: el servicio no guarda sin pasar por la compuerta ==\n";
$fuente_servicio = (string) file_get_contents($repo_dir . '/includes/class-cod-canvas-mcp-service.php');
$comprobar('el servicio no llama a repository->save() directo', preg_match('/->repository->save\s*\(/', $fuente_servicio) !== 1);
$comprobar('guarded_save existe y se usa en las herramientas crudas', substr_count($fuente_servicio, 'guarded_save(') >= 7);
$comprobar('preview y apply compilan por compile_gated', substr_count($fuente_servicio, 'compile_gated(') >= 3 && strpos($fuente_servicio, '$this->compiler->compile(') === strrpos($fuente_servicio, '$this->compiler->compile('));
$escritores_php = 0;
foreach (glob($repo_dir . '/includes/*.php') as $archivo) {
    $txt = (string) file_get_contents($archivo);
    if (strpos(basename($archivo), 'class-cod-adn-gate') !== 0 && preg_match('/update_option\s*\(\s*COD_ADN_Gate::OPTION_MODE|update_option\s*\(\s*[\'"]cod_adn_gate_mode/', $txt) === 1) {
        ++$escritores_php;
    }
}
$comprobar('nadie fuera de la compuerta escribe el modo', $escritores_php === 0);

echo "\n== 3b. completitud: cada tipo de regla del compilador está clasificado ==\n";
$catalogo = $compilador->capability_catalog();
$tipos_de_regla = array_keys($catalogo['designRuleSet']['ruleValueSchemas'] ?? []);
$sin_tipo = [];
foreach ($tipos_de_regla as $tipo) {
    if (!isset(COD_ADN_Gate::CAMPOS_DE_REGLA[$tipo]) && !isset(COD_ADN_Gate::REGLAS_EXENTAS[$tipo])) {
        $sin_tipo[] = $tipo;
    }
}
$comprobar('todo tipo de regla está en CAMPOS_DE_REGLA o REGLAS_EXENTAS (' . count($tipos_de_regla) . ' tipos)', $tipos_de_regla !== [] && $sin_tipo === [], implode(', ', $sin_tipo));

// ---------------------------------------------------------------------------
// Documento de prueba
$creada = $servicio->call_tool('cod_create_canvas_page', ['title' => 'ZZ prueba compuerta ' . gmdate('His')]);
if (is_wp_error($creada)) {
    echo '  FALLA  no pude crear la página de prueba: ' . $creada->get_error_message() . "\n";
    exit(1);
}
$page_id = (int) $creada['page']['pageId'];
$doc_id = (string) $creada['document']['documentId'];

$BASE_CSS = '.base{color:var(--wp--preset--color--ink);padding-top:var(--wp--preset--spacing--40)}';
$BASE_HTML = '<section class="base" data-wa-msg="Hola"><div class="wrap"><p>Hola</p></div><div data-cod-geo-places="[]"></div></section>';
$BASE_PD = (string) wp_json_encode(['pages' => [['name' => 'p', 'component' => ['type' => 'wrapper', 'components' => $BASE_HTML], 'styles' => $BASE_CSS]], 'assets' => []], JSON_UNESCAPED_SLASHES);

$estado = static function () use ($repositorio, $doc_id): array {
    $d = $repositorio->load_existing($doc_id);
    return ['rev' => (int) $d['revision'], 'css' => (string) $d['css'], 'html' => (string) $d['html'], 'pd' => (string) $d['projectData']];
};
/** Deja el documento en la línea base (lo hace la prueba, no el MCP) y devuelve su revisión. */
$reiniciar = static function (?string $css = null, ?string $html = null, ?string $pd = null) use ($repositorio, $doc_id, $BASE_CSS, $BASE_HTML, $BASE_PD): int {
    $r = $repositorio->save($doc_id, $pd ?? $BASE_PD, $html ?? $BASE_HTML, $css ?? $BASE_CSS);
    return (int) $r['revision'];
};
$tiene_codigo = static function ($r, string $codigo): bool {
    if (!is_wp_error($r)) {
        return false;
    }
    if ($r->get_error_code() === $codigo) {
        return true;
    }
    $d = $r->get_error_data();
    foreach (($d['violaciones'] ?? []) as $v) {
        if (($v['codigo'] ?? '') === $codigo) {
            return true;
        }
    }
    return false;
};
$tiene_ruta = static function ($r): bool {
    if (!is_wp_error($r)) {
        return false;
    }
    $d = $r->get_error_data();
    return !empty($d['violaciones'][0]['ruta']) && !empty($d['violaciones'][0]['propiedad']) && array_key_exists('valor', $d['violaciones'][0]);
};

/**
 * Un intento: en enforce se rechaza con $codigo y NO cambia el documento; en off
 * se acepta. Devuelve el resultado de enforce para mirar la ruta del error.
 */
$intento = static function (string $nombre, string $herramienta, callable $args, string $codigo, ?callable $preparar = null)
    use ($servicio, $modo, $reiniciar, $estado, $comprobar, $tiene_codigo) {
    $modo('enforce');
    $rev = $reiniciar();
    if ($preparar) {
        $preparar();
        $rev = $estado()['rev'];
    }
    $antes = $estado();
    $r = $servicio->call_tool($herramienta, $args($rev));
    $despues = $estado();
    $comprobar($nombre . ' · enforce rechaza con ' . $codigo, $tiene_codigo($r, $codigo), is_wp_error($r) ? $r->get_error_code() . ' ' . substr($r->get_error_message(), 0, 200) : 'se aceptó');
    $comprobar($nombre . ' · enforce no escribió nada', $despues === $antes);
    $modo('off');
    $rev = $reiniciar();
    if ($preparar) {
        $preparar();
        $rev = $estado()['rev'];
    }
    $ok = $servicio->call_tool($herramienta, $args($rev));
    $comprobar($nombre . ' · off acepta (comportamiento de siempre)', !is_wp_error($ok) && !isset($ok['adnGate']), is_wp_error($ok) ? $ok->get_error_code() . ' ' . $ok->get_error_message() : (isset($ok['adnGate']) ? 'off no debe agregar adnGate' : ''));
    return $r;
};
$valido = static function (string $nombre, string $herramienta, callable $args) use ($servicio, $modo, $reiniciar, $comprobar) {
    $modo('enforce');
    $rev = $reiniciar();
    $r = $servicio->call_tool($herramienta, $args($rev));
    $comprobar($nombre . ' · enforce ACEPTA una referencia válida al registro', !is_wp_error($r) && isset($r['adnGate']) && ($r['adnGate']['violaciones'] ?? ['x']) === [], is_wp_error($r) ? $r->get_error_code() . ' ' . substr($r->get_error_message(), 0, 300) : json_encode($r['adnGate'] ?? null));
    return $r;
};

try {
    // =====================================================================
    echo "\n== 4a. cod_patch_css ==\n";
    $args_css = static fn (string $busca, string $pone): callable => static fn (int $rev): array => [
        'pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'search' => $busca, 'replace' => $pone,
    ];
    $r = $intento('color literal', 'cod_patch_css', $args_css('color:var(--wp--preset--color--ink)', 'color:#123456'), 'ADN_LITERAL_COLOR');
    $comprobar('el error trae la ruta exacta, la propiedad y el valor', $tiene_ruta($r));
    $comprobar('el error sugiere con qué reemplazarlo', is_wp_error($r) && !empty($r->get_error_data()['violaciones'][0]['sugerencias']));
    $intento('espaciado literal', 'cod_patch_css', $args_css('padding-top:var(--wp--preset--spacing--40)', 'padding-top:9.8px'), 'ADN_LITERAL_SPACING');
    $intento('variable reservada redefinida', 'cod_patch_css', $args_css('.base{', '.base{--wp--preset--color--accent:var(--wp--preset--color--ink);'), 'ADN_VAR_RESERVED');
    $intento('variable reservada --cod-* dentro de @media', 'cod_patch_css', $args_css('.base{', '@media (max-width:600px){.x{--cod-color-accent:red}}.base{'), 'ADN_VAR_RESERVED');
    $intento('--* local con color literal', 'cod_patch_css', $args_css('.base{', '.base{--mio:#123456;'), 'ADN_LITERAL_COLOR');
    $intento('fallback literal en var()', 'cod_patch_css', $args_css('color:var(--wp--preset--color--ink)', 'color:var(--wp--preset--color--ink,#fff)'), 'ADN_LITERAL_COLOR');
    $intento('var() a un nombre fuera del registro', 'cod_patch_css', $args_css('color:var(--wp--preset--color--ink)', 'color:var(--no-existe)'), 'ADN_VAR_UNKNOWN');
    $intento('sombra literal', 'cod_patch_css', $args_css('.base{', '.base{box-shadow:0 8px 24px rgba(0,0,0,.16);'), 'ADN_LITERAL_SHADOW');
    $intento('familia literal', 'cod_patch_css', $args_css('.base{', ".base{font-family:'Roboto',sans-serif;"), 'ADN_LITERAL_FONT');
    $intento('tamaño de letra literal', 'cod_patch_css', $args_css('.base{', '.base{font-size:17px;'), 'ADN_LITERAL_SIZE');
    $intento('peso e interlineado literales', 'cod_patch_css', $args_css('.base{', '.base{font-weight:700;'), 'ADN_LITERAL_FINE');
    $intento('radio literal', 'cod_patch_css', $args_css('.base{', '.base{border-radius:12px;'), 'ADN_LITERAL_RADIUS');
    $intento('grosor de borde literal', 'cod_patch_css', $args_css('.base{', '.base{border-width:3px;'), 'ADN_LITERAL_BORDER');
    $intento('movimiento literal', 'cod_patch_css', $args_css('.base{', '.base{transition:opacity .3s ease;'), 'ADN_LITERAL_MOTION');
    $intento('ancho de caja absoluto', 'cod_patch_css', $args_css('.base{', '.base{max-width:1200px;'), 'ADN_LITERAL_MEASURE');
    $intento('escape CSS que esconde la propiedad (\63olor)', 'cod_patch_css', $args_css('.base{', '.base{\63olor:#123456;'), 'ADN_SCAN_FAILED');
    $intento('propiedad con prefijo de navegador (-webkit-text-fill-color)', 'cod_patch_css', $args_css('.base{', '.base{-webkit-text-fill-color:#123456;'), 'ADN_LITERAL_COLOR');
    $r = $valido('cambiar color por otro del registro', 'cod_patch_css', $args_css('color:var(--wp--preset--color--ink)', 'color:var(--wp--preset--color--accent)'));
    $valido('palabras neutras y 0', 'cod_patch_css', $args_css('.base{', '.base{margin:0 auto;border:none;background-color:transparent;color:inherit;'));

    // =====================================================================
    echo "\n== 4b. cod_patch_html (style=\"\" y atributos SVG) ==\n";
    $args_html = static fn (string $busca, string $pone): callable => static fn (int $rev): array => [
        'pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'search' => $busca, 'replace' => $pone,
    ];
    $r = $intento('style="" con color literal', 'cod_patch_html', $args_html('<p>Hola</p>', '<p style="color:#123456">Hola</p>'), 'ADN_LITERAL_COLOR');
    $intento('style="" con espaciado literal', 'cod_patch_html', $args_html('<p>Hola</p>', '<p style="margin-top:13px">Hola</p>'), 'ADN_LITERAL_SPACING');
    $intento('fill="#123456" en un SVG', 'cod_patch_html', $args_html('<p>Hola</p>', '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#123456"/></svg>'), 'ADN_LITERAL_COLOR');
    $intento('stop-color literal en un degradado SVG', 'cod_patch_html', $args_html('<p>Hola</p>', '<svg><defs><linearGradient id="g"><stop offset="0" stop-color="#abcdef"/></linearGradient></defs></svg>'), 'ADN_LITERAL_COLOR');
    $intento('font-size literal en un <text> SVG', 'cod_patch_html', $args_html('<p>Hola</p>', '<svg><text font-size="14" fill="currentColor">x</text></svg>'), 'ADN_LITERAL_SIZE');
    $intento('variable reservada en style=""', 'cod_patch_html', $args_html('<p>Hola</p>', '<p style="--wp--preset--color--ink:var(--wp--preset--color--accent)">Hola</p>'), 'ADN_VAR_RESERVED');
    $intento('<style> metido en el HTML', 'cod_patch_html', $args_html('<p>Hola</p>', '<p>Hola</p><style>.x{color:#123456}</style>'), 'ADN_LITERAL_COLOR');
    $intento('hoja de estilos externa enlazada desde el HTML', 'cod_patch_html', $args_html('<p>Hola</p>', '<p>Hola</p><link rel="stylesheet" href="https://ejemplo.invalid/x.css">'), 'ADN_EXTERNAL_STYLE');
    $valido('style="" con var() del registro', 'cod_patch_html', $args_html('<p>Hola</p>', '<p style="color:var(--wp--preset--color--accent)">Hola</p>'));
    $valido('SVG con fill="currentColor"', 'cod_patch_html', $args_html('<p>Hola</p>', '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="currentColor"/></svg>'));

    // =====================================================================
    echo "\n== 4c. cod_write_canvas_document (CSS, HTML y projectData) ==\n";
    $args_write = static fn (string $pd, string $html, string $css): callable => static fn (int $rev): array => [
        'pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'projectData' => $pd, 'html' => $html, 'css' => $css,
    ];
    $pd_de = static fn (string $html, string $css): string => (string) wp_json_encode(['pages' => [['name' => 'p', 'component' => ['type' => 'wrapper', 'components' => $html], 'styles' => $css]], 'assets' => []], JSON_UNESCAPED_SLASHES);
    $css_ok = $BASE_CSS;
    $r = $intento('+1 literal en el CSS', 'cod_write_canvas_document', $args_write($pd_de($BASE_HTML, $css_ok . '.n{color:#123456}'), $BASE_HTML, $css_ok . '.n{color:#123456}'), 'ADN_LITERAL_COLOR');
    $html_lit = str_replace('<p>Hola</p>', '<p style="padding:7px">Hola</p>', $BASE_HTML);
    $intento('+1 literal en style=""', 'cod_write_canvas_document', $args_write($pd_de($html_lit, $css_ok), $html_lit, $css_ok), 'ADN_LITERAL_SPACING');
    $html_svg = str_replace('<p>Hola</p>', '<svg><path d="M0 0h1v1z" fill="#123456"/></svg>', $BASE_HTML);
    $intento('fill="#123456" en el SVG del HTML', 'cod_write_canvas_document', $args_write($pd_de($html_svg, $css_ok), $html_svg, $css_ok), 'ADN_LITERAL_COLOR');
    // El literal SÓLO en projectData: el CSS y el HTML enviados están limpios.
    $pd_oculto = (string) wp_json_encode(['pages' => [['name' => 'p', 'component' => ['type' => 'wrapper', 'components' => $BASE_HTML], 'styles' => $css_ok . '.oculto{color:#abcdef}']], 'assets' => []], JSON_UNESCAPED_SLASHES);
    $r = $intento('literal SÓLO en projectData (styles como texto)', 'cod_write_canvas_document', $args_write($pd_oculto, $BASE_HTML, $css_ok), 'ADN_PROJECT_DATA_MISMATCH');
    $pd_grapes = (string) wp_json_encode(['assets' => [], 'styles' => [['selectors' => ['.base'], 'style' => ['color' => 'var(--wp--preset--color--ink)', 'padding-left' => '11px']]], 'pages' => [['frames' => [['component' => ['type' => 'wrapper', 'components' => [['tagName' => 'p', 'attributes' => ['style' => 'color:#fedcba']]]]]]]]], JSON_UNESCAPED_SLASHES);
    $intento('literal SÓLO en projectData (reglas de GrapesJS)', 'cod_write_canvas_document', $args_write($pd_grapes, $BASE_HTML, $css_ok), 'ADN_PROJECT_DATA_MISMATCH');
    $pd_attr = (string) wp_json_encode(['pages' => [['frames' => [['component' => ['tagName' => 'svg', 'components' => [['tagName' => 'path', 'attributes' => ['fill' => '#123456']]]]]]]]], JSON_UNESCAPED_SLASHES);
    $intento('fill="#…" SÓLO en un atributo de projectData', 'cod_write_canvas_document', $args_write($pd_attr, $BASE_HTML, $css_ok), 'ADN_PROJECT_DATA_MISMATCH');
    $intento('variable reservada en el CSS', 'cod_write_canvas_document', $args_write($pd_de($BASE_HTML, ':root{--wp--preset--color--accent:var(--wp--preset--color--ink)}' . $css_ok), $BASE_HTML, ':root{--wp--preset--color--accent:var(--wp--preset--color--ink)}' . $css_ok), 'ADN_VAR_RESERVED');
    $css_nuevo_ok = $css_ok . '.n{color:var(--wp--preset--color--accent);padding:var(--wp--preset--spacing--50)}';
    $valido('documento limpio (CSS+HTML+projectData coherentes)', 'cod_write_canvas_document', $args_write($pd_de($BASE_HTML, $css_nuevo_ok), $BASE_HTML, $css_nuevo_ok));

    // =====================================================================
    echo "\n== 4d. cod_sync_project_data ==\n";
    // Sincronizar no puede introducir nada: empaqueta lo ya guardado. Lo que se comprueba
    // es que pasa por la compuerta (informa) y que lo HEREDADO no se vuelve a contar como nuevo.
    $modo('enforce');
    $rev = $reiniciar('.viejo{color:#123456}' . $BASE_CSS, null, '{}');
    $r = $servicio->call_tool('cod_sync_project_data', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev]);
    $comprobar('sync_project_data pasa por la compuerta y lo heredado no es nuevo', !is_wp_error($r) && isset($r['adnGate']) && $r['adnGate']['nuevas'] === 0 && $r['adnGate']['heredadas'] >= 1, is_wp_error($r) ? $r->get_error_code() . ' ' . $r->get_error_message() : json_encode($r['adnGate'] ?? null));
    $modo('off');
    $rev = $reiniciar('.viejo{color:#123456}' . $BASE_CSS, null, '{}');
    $r = $servicio->call_tool('cod_sync_project_data', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev]);
    $comprobar('sync_project_data · off responde como siempre', !is_wp_error($r) && !isset($r['adnGate']) && ($r['synced'] ?? false) === true);

    // =====================================================================
    echo "\n== 4e. cod_grapes_edit_node (puente headless de Grapes) ==\n";
    $modo('off');
    $rev = $reiniciar();
    $prueba_puente = $servicio->call_tool('cod_grapes_edit_node', [
        'pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'selector' => '.wrap',
        'mutation' => ['attributes' => ['data-prueba' => '1']],
    ]);
    if (is_wp_error($prueba_puente)) {
        $omitidas[] = 'cod_grapes_edit_node: el puente headless no corre aquí (' . $prueba_puente->get_error_code() . '); la compuerta de ese camino se ejercita por el endpoint real (ver informe).';
        echo '  omitida  ' . end($omitidas) . "\n";
    } else {
        $args_g = static fn (array $mut): callable => static fn (int $rev): array => [
            'pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'selector' => '.wrap', 'mutation' => $mut,
        ];
        $intento('mutation.style con color literal', 'cod_grapes_edit_node', $args_g(['style' => ['color' => '#123456']]), 'ADN_LITERAL_COLOR');
        $intento('mutation.attributes.style con espaciado literal', 'cod_grapes_edit_node', $args_g(['attributes' => ['style' => 'padding:9px']]), 'ADN_LITERAL_SPACING');
        $intento('mutation.style con variable reservada', 'cod_grapes_edit_node', $args_g(['style' => ['--wp--preset--color--accent' => 'var(--wp--preset--color--ink)']]), 'ADN_VAR_RESERVED');
        $valido('mutation.style con var() del registro', 'cod_grapes_edit_node', $args_g(['style' => ['color' => 'var(--wp--preset--color--accent)']]));
    }

    // =====================================================================
    echo "\n== 4f. cod_activate_section_whatsapp ==\n";
    $numero_original = get_option('cod_whatsapp_number', null);
    update_option('cod_whatsapp_number', '56912345678', false);
    $args_wa = static fn (array $style): callable => static fn (int $rev): array => [
        'pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'position' => 'bottom-right', 'anchorSelector' => '.wrap', 'style' => $style,
    ];
    $intento('style.iconColor literal', 'cod_activate_section_whatsapp', $args_wa(['iconColor' => '#123456']), 'ADN_LITERAL_COLOR');
    $intento('style.backgroundColor literal', 'cod_activate_section_whatsapp', $args_wa(['backgroundColor' => 'rgb(1,2,3)']), 'ADN_LITERAL_COLOR');
    $intento('style.borderRadius literal', 'cod_activate_section_whatsapp', $args_wa(['borderRadius' => '8px']), 'ADN_LITERAL_RADIUS');
    $valido('style con var() del registro', 'cod_activate_section_whatsapp', $args_wa(['iconColor' => 'var(--wp--preset--color--fondo-pagina)', 'backgroundColor' => 'var(--wp--preset--color--accent)']));
    if ($numero_original === null) {
        delete_option('cod_whatsapp_number');
    } else {
        update_option('cod_whatsapp_number', $numero_original, false);
    }

    // =====================================================================
    echo "\n== 4g. cod_patch_geo_places ==\n";
    $modo('enforce');
    $rev = $reiniciar();
    $lugares = [['nombre' => 'Plaza', 'categoria' => 'plaza', 'x' => 10, 'y' => 20]];
    $r = $servicio->call_tool('cod_patch_geo_places', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'places' => $lugares]);
    $comprobar('patch_geo_places pasa por la compuerta (informa) y se acepta', !is_wp_error($r) && isset($r['adnGate']) && $r['adnGate']['nuevas'] === 0, is_wp_error($r) ? $r->get_error_code() . ' ' . $r->get_error_message() : json_encode($r['adnGate'] ?? null));
    $modo('off');
    $rev = $reiniciar();
    $r = $servicio->call_tool('cod_patch_geo_places', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'places' => $lugares]);
    $comprobar('patch_geo_places · off responde como siempre', !is_wp_error($r) && !isset($r['adnGate']));

    // =====================================================================
    echo "\n== 4h. cod_preview_canvas_composition y cod_apply_canvas_composition ==\n";
    $regla = static fn (string $id, string $kind, array $valor): array => [
        'id' => $id, 'kind' => $kind,
        'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba de la compuerta.']]],
        'status' => 'reviewed', 'value' => $valor,
    ];
    $diseno = static fn (array $reglas): array => ['schemaVersion' => 1, 'designId' => 'prueba-compuerta', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas];
    $composicion = static fn (array $ids): array => ['schemaVersion' => 2, 'nodes' => [['id' => 'seccion-prueba', 'kind' => 'section', 'ruleIds' => $ids, 'children' => [
        ['id' => 'titulo-1', 'kind' => 'heading', 'ruleIds' => $ids, 'content' => ['level' => 2, 'text' => 'Titulo']],
    ]]]];
    $casos = [
        ['regla color con #F26621 literal', [$regla('c-1', 'color', ['role' => 'titulo', 'color' => '#F26621'])], 'ADN_LITERAL_COLOR'],
        ['regla spacing con 24px literal', [$regla('s-1', 'spacing', ['paddingBlock' => '24px'])], 'ADN_LITERAL_SPACING'],
        ['regla typography con tamaño literal', [$regla('t-1', 'typography', ['role' => 'cuerpo', 'fontSize' => '18px'])], 'ADN_LITERAL_SIZE'],
        ['regla typography con familia literal', [$regla('t-2', 'typography', ['role' => 'cuerpo', 'family' => "'Roboto', sans-serif"])], 'ADN_LITERAL_FONT'],
        ['regla shape con radio literal', [$regla('sh-1', 'shape', ['radius' => '12px'])], 'ADN_LITERAL_RADIUS'],
        ['regla surface con borde literal', [$regla('su-1', 'surface', ['borderWidth' => '2px'])], 'ADN_LITERAL_BORDER'],
        ['regla surface con degradado de colores literales', [$regla('su-2', 'surface', ['backgroundGradient' => ['type' => 'linear', 'stops' => [['color' => '#ff0000', 'at' => '0%'], ['color' => '#0000ff', 'at' => '100%']]]])], 'ADN_LITERAL_COLOR'],
        ['regla surface.shadow con nombre del motor', [$regla('su-3', 'surface', ['shadow' => 'md'])], 'ADN_NO_DEFINITION'],
        ['regla properties con color literal', [$regla('p-1', 'properties', ['declarations' => ['background-color' => '#123456']])], 'ADN_LITERAL_COLOR'],
        ['regla properties que redefine una variable reservada', [$regla('p-2', 'properties', ['declarations' => ['--wp--preset--color--accent' => 'var(--wp--preset--color--ink)']])], 'ADN_VAR_RESERVED'],
        ['regla properties con --cod-* reservada', [$regla('p-3', 'properties', ['declarations' => ['--cod-color-accent' => 'var(--wp--preset--color--ink)']])], 'ADN_VAR_RESERVED'],
        ['regla properties con --x local de color literal', [$regla('p-4', 'properties', ['declarations' => ['--x' => '#123456']])], 'ADN_LITERAL_COLOR'],
        ['regla properties con --x:8px local usada en padding', [$regla('p-5', 'properties', ['declarations' => ['--x' => '8px', 'padding-top' => 'var(--x)']])], 'ADN_LITERAL_SPACING'],
        ['regla properties con padding-top:9.8px', [$regla('p-6', 'properties', ['declarations' => ['padding-top' => '9.8px']])], 'ADN_LITERAL_SPACING'],
        ['regla properties con var(--a, #123) de respaldo literal', [$regla('p-7', 'properties', ['declarations' => ['color' => 'var(--wp--preset--color--ink, #123)']])], 'ADN_LITERAL_COLOR'],
        ['regla properties con var() a un nombre fuera del registro', [$regla('p-8', 'properties', ['declarations' => ['color' => 'var(--no-existe)']])], 'ADN_VAR_UNKNOWN'],
        ['regla properties con sombra literal', [$regla('p-9', 'properties', ['declarations' => ['box-shadow' => '0 8px 24px rgba(0,0,0,.16)']])], 'ADN_LITERAL_SHADOW'],
    ];
    foreach ($casos as [$nombre, $reglas, $codigo]) {
        $ids = array_map(static fn (array $r): string => $r['id'], $reglas);
        $modo('off');
        $rev = $reiniciar();
        $ok_off = $servicio->call_tool('cod_preview_canvas_composition', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'composition' => $composicion($ids), 'design' => $diseno($reglas)]);
        $preview_id_off = is_wp_error($ok_off) ? '' : (string) $ok_off['previewId'];
        $comprobar($nombre . ' · off acepta la previsualización', !is_wp_error($ok_off) && !isset($ok_off['adnGate']), is_wp_error($ok_off) ? $ok_off->get_error_code() . ' ' . $ok_off->get_error_message() : '');
        $modo('enforce');
        $antes = $estado();
        $r = $servicio->call_tool('cod_preview_canvas_composition', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'composition' => $composicion($ids), 'design' => $diseno($reglas)]);
        $comprobar($nombre . ' · preview en enforce rechaza con ' . $codigo, $tiene_codigo($r, $codigo), is_wp_error($r) ? $r->get_error_code() . ' ' . substr($r->get_error_message(), 0, 160) : 'se aceptó');
        if ($preview_id_off !== '') {
            // El previewId se obtuvo en off. Aplicar en enforce con ese id no puede saltarse la compuerta.
            $a = $servicio->call_tool('cod_apply_canvas_composition', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'previewId' => $preview_id_off, 'composition' => $composicion($ids), 'design' => $diseno($reglas)]);
            $comprobar($nombre . ' · apply en enforce rechaza con ' . $codigo . ' (aunque el previewId sea válido)', $tiene_codigo($a, $codigo), is_wp_error($a) ? $a->get_error_code() : 'se aplicó');
            $comprobar($nombre . ' · apply en enforce no escribió nada', $estado() === $antes);
        }
        if ($nombre === $casos[0][0]) {
            $comprobar('el error de la receta trae ruta (design.rules[…].value.…)', $tiene_ruta($r) && strpos((string) $r->get_error_data()['violaciones'][0]['ruta'], 'design.rules[c-1].value.color') === 0);
        }
    }
    // Referencias válidas al registro: preview Y apply se aceptan, y se ve en el CSS guardado.
    $modo('enforce');
    $rev = $reiniciar();
    $reglas_ok = [
        $regla('c-ok', 'color', ['role' => 'titulo', 'color' => 'var(--wp--preset--color--accent)']),
        $regla('s-ok', 'spacing', ['paddingBlock' => 'var(--wp--preset--spacing--40)', 'bleed' => 'calc(-1 * var(--wp--preset--spacing--20))']),
        $regla('t-ok', 'typography', ['role' => 'cuerpo', 'family' => 'var(--wp--preset--font-family--body)', 'fontSize' => 'var(--wp--preset--font-size--40)']),
        $regla('p-ok', 'properties', ['declarations' => ['margin-top' => '0', 'color' => 'inherit', 'border-top-width' => '0', '--mi-espacio' => 'var(--wp--preset--spacing--30)', 'padding-left' => 'var(--mi-espacio)']]),
    ];
    $ids_ok = array_map(static fn (array $r): string => $r['id'], $reglas_ok);
    $pv = $servicio->call_tool('cod_preview_canvas_composition', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'composition' => $composicion($ids_ok), 'design' => $diseno($reglas_ok)]);
    $comprobar('receta válida: preview en enforce la acepta', !is_wp_error($pv) && ($pv['adnGate']['violaciones'] ?? ['x']) === [], is_wp_error($pv) ? $pv->get_error_code() . ' ' . $pv->get_error_message() : '');
    if (!is_wp_error($pv)) {
        $ap = $servicio->call_tool('cod_apply_canvas_composition', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'previewId' => $pv['previewId'], 'composition' => $composicion($ids_ok), 'design' => $diseno($reglas_ok)]);
        $comprobar('receta válida: apply en enforce la guarda', !is_wp_error($ap) && isset($ap['evidence']['adnGate']) && $ap['evidence']['adnGate']['nuevas'] === 0, is_wp_error($ap) ? $ap->get_error_code() . ' ' . $ap->get_error_message() : '');
        $css_guardado = $estado()['css'];
        $comprobar('y el CSS guardado usa la variable, no el valor', strpos($css_guardado, 'var(--wp--preset--color--accent)') !== false && strpos($css_guardado, '#F26621') === false);
    }

    // Registro fijo: nombres de las clases que Basis todavía no declara (peso, interlineado).
    COD_ADN_Registry::fijar_para_prueba(['designId' => 'prueba', 'revision' => 1, 'fuente' => 'adn', 'nombres' => [
        '--wp--custom--typography--bold' => ['clase' => 'tipografia-fina', 'estado' => 'confirmed', 'origen' => 'prueba', 'valor' => '700'],
        '--wp--custom--typography--lh-body' => ['clase' => 'tipografia-fina', 'estado' => 'confirmed', 'origen' => 'prueba', 'valor' => '1.5'],
        '--wp--preset--color--ink' => ['clase' => 'color', 'estado' => 'confirmed', 'origen' => 'prueba', 'valor' => '#0e0c19'],
    ]]);
    $rev = $reiniciar();
    $reglas_f = [$regla('t-fino', 'typography', ['role' => 'cuerpo', 'fontWeight' => 'var(--wp--custom--typography--bold)', 'lineHeight' => 'var(--wp--custom--typography--lh-body)'])];
    $pv = $servicio->call_tool('cod_preview_canvas_composition', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'composition' => $composicion(['t-fino']), 'design' => $diseno($reglas_f)]);
    $comprobar('peso e interlineado por nombre del registro: aceptados', !is_wp_error($pv), is_wp_error($pv) ? $pv->get_error_message() : '');
    $reglas_f2 = [$regla('t-fino', 'typography', ['role' => 'cuerpo', 'fontWeight' => 700, 'lineHeight' => 1.5])];
    $pv = $servicio->call_tool('cod_preview_canvas_composition', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'composition' => $composicion(['t-fino']), 'design' => $diseno($reglas_f2)]);
    $comprobar('peso 700 e interlineado 1.5 literales: rechazados con ADN_LITERAL_FINE', $tiene_codigo($pv, 'ADN_LITERAL_FINE'));
    COD_ADN_Registry::fijar_para_prueba(null);

    // =====================================================================
    echo "\n== 5. observe y ratchet ==\n";
    $modo('observe');
    $rev = $reiniciar();
    $r = $servicio->call_tool('cod_patch_css', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'search' => 'color:var(--wp--preset--color--ink)', 'replace' => 'color:#123456']);
    $comprobar('observe NO rechaza', !is_wp_error($r));
    $comprobar('observe informa el literal en adnGate', !is_wp_error($r) && ($r['adnGate']['modo'] ?? '') === 'observe' && ($r['adnGate']['violaciones'][0]['codigo'] ?? '') === 'ADN_LITERAL_COLOR');
    $comprobar('observe lo escribe de verdad', strpos($estado()['css'], '#123456') !== false);
    $log = get_option(COD_ADN_Gate::OPTION_LOG, []);
    $comprobar('observe deja registro', is_array($log) && $log !== [] && !empty(end($log)['violaciones']));

    $modo('ratchet');
    $rev = $reiniciar('.viejo{color:#123456}' . $BASE_CSS);
    $r = $servicio->call_tool('cod_patch_css', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'search' => '.base{', 'replace' => '.base{margin-top:var(--wp--preset--spacing--30);']);
    $comprobar('ratchet: tocar un documento con deuda heredada pasa y la cuenta', !is_wp_error($r) && ($r['adnGate']['heredadas'] ?? 0) >= 1 && $r['adnGate']['nuevas'] === 0, is_wp_error($r) ? $r->get_error_message() : json_encode($r['adnGate'] ?? null));
    $rev = $estado()['rev'];
    $r = $servicio->call_tool('cod_patch_css', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'search' => '.base{', 'replace' => '.base{background-color:#654321;']);
    $comprobar('ratchet: agregar un literal NUEVO se rechaza', $tiene_codigo($r, 'ADN_LITERAL_COLOR'));
    $rev = $estado()['rev'];
    $r = $servicio->call_tool('cod_patch_css', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $rev, 'search' => '.base{', 'replace' => '.base{border-color:#123456;']);
    $comprobar('ratchet: repetir un valor heredado en otra propiedad también es nuevo', $tiene_codigo($r, 'ADN_LITERAL_COLOR'));

    // =====================================================================
    echo "\n== 6. el modo NO se cambia por el MCP ==\n";
    $modo('enforce');
    foreach ($servicio->tool_definitions() as $t) {
        $props = array_keys($t['inputSchema']['properties'] ?? []);
        // `model` es el ADN que se importa (cod_adn_preview_import / cod_adn_apply_import), no un modo: calza con /mode/ por casualidad.
        $roza = array_filter($props, static fn (string $p): bool => $p !== 'model' && preg_match('/mode|modo|gate|adn/i', $p) === 1);
        $comprobar('la herramienta ' . $t['name'] . ' no tiene un parámetro de modo y rechaza argumentos de más', $roza === [] && ($t['inputSchema']['additionalProperties'] ?? true) === false);
    }
    $r = $servicio->call_tool('cod_get_capabilities', ['modo' => 'off']);
    $comprobar('pasarle "modo" a una herramienta no hace nada', is_wp_error($r) && COD_ADN_Gate::modo() === 'enforce');
    $r = $servicio->call_tool('cod_patch_css', ['pageId' => $page_id, 'documentId' => $doc_id, 'expectedRevision' => $estado()['rev'], 'search' => 'x', 'replace' => 'y', 'modo' => 'off']);
    $comprobar('ni siquiera dentro de una escritura', is_wp_error($r) && COD_ADN_Gate::modo() === 'enforce');
    COD_ADN_Gate::entrar_en_mcp();
    $r = COD_ADN_Gate::set_modo('off');
    COD_ADN_Gate::salir_de_mcp();
    $comprobar('set_modo se niega mientras atiende al MCP', is_wp_error($r) && COD_ADN_Gate::modo() === 'enforce');
    $r = COD_ADN_Gate::set_modo('off');
    $comprobar('set_modo se niega sin administrador con sesión', is_wp_error($r) && COD_ADN_Gate::modo() === 'enforce');
    $registradas = function_exists('get_registered_settings') ? get_registered_settings() : [];
    $comprobar('la opción no está registrada para REST (/wp/v2/settings)', !isset($registradas[COD_ADN_Gate::OPTION_MODE]));
    $admins = get_users(['role' => 'administrator', 'number' => 1]);
    if ($admins) {
        wp_set_current_user((int) $admins[0]->ID);
        $peticion = new WP_REST_Request('POST', '/wp/v2/settings');
        $peticion->set_body_params([COD_ADN_Gate::OPTION_MODE => 'off']);
        rest_do_request($peticion);
        $comprobar('un administrador por REST /wp/v2/settings tampoco lo cambia', get_option(COD_ADN_Gate::OPTION_MODE) === 'enforce');
        // set_modo desde "la administración" (administrador con sesión, sin MCP ni REST) sí funciona.
        $r = COD_ADN_Gate::set_modo('observe');
        $comprobar('desde la administración (admin, sin MCP) sí se cambia', $r === true && COD_ADN_Gate::modo() === 'observe');
        wp_set_current_user(0);
    } else {
        $omitidas[] = 'no hay administrador en el local para probar el cambio de modo desde la administración';
    }
    $comprobar('el servidor MCP marca la entrada y la salida', strpos((string) file_get_contents($repo_dir . '/includes/class-cod-mcp-server.php'), 'entrar_en_mcp') !== false);

    // =====================================================================
    echo "\n== 7. la revisión se recompara DENTRO del bloqueo (H5) ==\n";
    $modo('off');
    $rev = $reiniciar();
    $r = $repositorio->save_if_revision($doc_id, $rev - 1, $BASE_PD, $BASE_HTML, '.otro{margin:0}');
    $comprobar('save_if_revision con una revisión vieja se rechaza', is_wp_error($r) && $r->get_error_code() === 'cod_canvas_revision_conflict');
    $comprobar('y no escribió', $estado()['css'] === $BASE_CSS);
    $guardia_corrio = false;
    $r = $repositorio->save_if_revision($doc_id, $rev, $BASE_PD, $BASE_HTML, '.otro{margin:0}', static function (array $guardado) use (&$guardia_corrio, $BASE_CSS) {
        $guardia_corrio = $guardado['css'] === $BASE_CSS;
        return null;
    });
    $comprobar('el guard recibe lo guardado en ese instante', !is_wp_error($r) && $guardia_corrio);
    $rev = $estado()['rev'];
    $r = $repositorio->save_if_revision($doc_id, $rev, $BASE_PD, $BASE_HTML, '.mas{margin:0}', static fn (array $g) => new WP_Error('x_rechazo', 'no'));
    $comprobar('si el guard rechaza, no se escribe', is_wp_error($r) && $r->get_error_code() === 'x_rechazo' && $estado()['css'] === '.otro{margin:0}');
} finally {
    // Limpieza: ni la página ni el documento de prueba se quedan, y el modo vuelve a como estaba.
    COD_ADN_Registry::fijar_para_prueba(null);
    if ($opcion_original === null) {
        delete_option(COD_ADN_Gate::OPTION_MODE);
    } else {
        update_option(COD_ADN_Gate::OPTION_MODE, $opcion_original, false);
    }
    $post_doc = $repositorio->find_post_id($doc_id);
    if ($post_doc) {
        wp_delete_post($post_doc, true);
    }
    wp_delete_post($page_id, true);
}

echo "\n";
foreach ($omitidas as $o) {
    echo '  omitida: ' . $o . "\n";
}
echo $fallas === 0 ? "TODO OK ({$ejecutadas} comprobaciones)\n" : "{$fallas} comprobaciones fallaron de {$ejecutadas}\n";
exit($fallas === 0 ? 0 : 1);
