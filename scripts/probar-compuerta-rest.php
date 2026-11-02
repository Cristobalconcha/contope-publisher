<?php
/**
 * LAS PUERTAS QUE QUEDARON ABIERTAS: la REST de WordPress con contraseña de aplicación, la vía
 * oficial de contenido en bloques (`cod_write_block_page`) y el importador de paquetes.
 *
 * Esta prueba FALLA si la compuerta no está en esos caminos. Cada intento de saltarse el sistema
 * se hace de verdad (una petición REST despachada por el servidor de WordPress, una llamada a la
 * herramienta del MCP, un ZIP de paquete real) y se exige:
 *   - en `enforce`: rechazado, con el código y la ruta de lo rechazado, y SIN escribir nada;
 *   - en `off`: aceptado, exactamente como siempre;
 *   - una referencia válida al registro (un slug de preset, `var:preset|…`): aceptada;
 *   - una persona con sesión en el editor (sin contraseña de aplicación): NO se bloquea, aunque el modo
 *     sea `enforce` (la espec lo deja fuera a propósito).
 *
 * Corre contra el WordPress local de Basis (puerto 8894), con el plugin del repo ya sincronizado.
 * Nunca contra otro sitio.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$fallas = 0;
$ejecutadas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas, &$ejecutadas) {
    ++$ejecutadas;
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? '   -> ' . $detalle : '') . "\n";
    if (!$ok) {
        ++$fallas;
    }
};

echo "\n== 0. lo instalado es lo que hay en el repositorio ==\n";
$repo_dir = realpath(__DIR__ . '/../contope-publisher');
$inst_dir = rtrim((string) COD_PUBLISHER_DIR, '/\\');
foreach (['class-cod-adn-gate.php', 'class-cod-adn-gate-rest.php', 'class-cod-block-page-writer.php', 'class-cod-canvas-mcp-service.php', 'class-cod-site-package-importer.php'] as $archivo) {
    $a = $repo_dir . '/includes/' . $archivo;
    $b = $inst_dir . '/includes/' . $archivo;
    $comprobar('instalado == repo: ' . $archivo, is_file($a) && is_file($b) && md5_file($a) === md5_file($b), 'sincroniza el plugin al local de Basis antes de probar');
}
if (!class_exists('COD_ADN_Gate_Rest') || !class_exists('COD_Block_Page_Writer')) {
    echo "\n  FALLA  las clases de las puertas no están cargadas.\n";
    exit(1);
}

$admin = get_user_by('login', 'cristobal');
if (!$admin) {
    echo "\n  FALLA  no encuentro el usuario administrador del local.\n";
    exit(1);
}
wp_set_current_user((int) $admin->ID);

$opcion_original = get_option(COD_ADN_Gate::OPTION_MODE, null);
$modo = static function (string $m): void {
    update_option(COD_ADN_Gate::OPTION_MODE, $m, false);
};
// Registro fijo: la prueba no depende de qué escalas tenga el sitio hoy.
COD_ADN_Registry::fijar_para_prueba([
    'designId' => 'prueba', 'revision' => 1, 'fuente' => 'prueba',
    'nombres' => [
        '--wp--preset--color--accent' => ['clase' => 'color', 'estado' => 'confirmed', 'origen' => 'prueba', 'valor' => '#f26621'],
        '--wp--preset--color--ink' => ['clase' => 'color', 'estado' => 'confirmed', 'origen' => 'prueba', 'valor' => '#0e0c19'],
        '--wp--preset--font-size--m' => ['clase' => 'tamano', 'estado' => 'confirmed', 'origen' => 'prueba', 'valor' => '1rem'],
        '--wp--preset--spacing--m' => ['clase' => 'espaciado', 'estado' => 'confirmed', 'origen' => 'prueba', 'valor' => '16px'],
        '--wp--custom--radius--m' => ['clase' => 'radio', 'estado' => 'confirmed', 'origen' => 'prueba', 'valor' => '8px'],
    ],
]);

$creados = [];
$limpiar = static function () use (&$creados): void {
    foreach ($creados as $id) {
        wp_delete_post((int) $id, true);
    }
    $creados = [];
};
/** Cuántas páginas/entradas/patrones hay con ese título (para comprobar que NO se escribió). */
$cuantos = static function (string $tipo, string $titulo): int {
    $q = get_posts(['post_type' => $tipo, 'post_status' => 'any', 'title' => $titulo, 'numberposts' => -1, 'fields' => 'ids']);
    return count($q);
};

$bloque = static function (string $nombre, array $attrs, string $html): string {
    $json = $attrs === [] ? '' : ' ' . wp_json_encode($attrs, JSON_UNESCAPED_SLASHES);
    return '<!-- wp:' . $nombre . $json . ' -->' . $html . '<!-- /wp:' . $nombre . ' -->';
};
$CON_LITERAL = $bloque('paragraph', ['style' => ['color' => ['text' => '#123456']]], '<p class="has-text-color" style="color:#123456">Hola</p>');
$CON_PRESET = $bloque('paragraph', ['textColor' => 'accent', 'fontSize' => 'm', 'style' => ['spacing' => ['padding' => ['top' => 'var:preset|spacing|m']], 'border' => ['radius' => 'var(--wp--custom--radius--m)']]], '<p class="has-accent-color has-text-color has-m-font-size" style="border-radius:var(--wp--custom--radius--m);padding-top:var(--wp--preset--spacing--m)">Hola</p>');

/** Despacha una petición REST de verdad (rutas, permisos y ganchos de WordPress incluidos). */
$rest = static function (string $metodo, string $ruta, array $cuerpo): WP_REST_Response {
    $req = new WP_REST_Request($metodo, $ruta);
    $req->set_header('content-type', 'application/json');
    $req->set_body((string) wp_json_encode($cuerpo));
    return rest_do_request($req);
};
$codigo = static function (WP_REST_Response $r): string {
    $d = $r->get_data();
    return is_array($d) && isset($d['code']) ? (string) $d['code'] : '';
};
/** Simula que la petición se autenticó con una contraseña de aplicación (lo mismo que hace WordPress). */
$con_contrasena = static function (bool $si): void {
    COD_ADN_Gate::marcar_contrasena_de_aplicacion(false);
    if ($si) {
        do_action('application_password_did_authenticate', wp_get_current_user(), ['uuid' => 'prueba']);
    }
};

// ---------------------------------------------------------------------------
echo "\n== 1. wp/v2/pages con contraseña de aplicación ==\n";
$modo('enforce');
$con_contrasena(true);
$r = $rest('POST', '/wp/v2/pages', ['title' => 'ZZ rest literal', 'status' => 'draft', 'content' => $CON_LITERAL]);
$comprobar('enforce: style.color.text:"#123456" por contraseña de aplicación → rechazado', $r->get_status() === 400 && $codigo($r) === 'ADN_LITERAL_COLOR', 'status=' . $r->get_status() . ' code=' . $codigo($r));
$datos = $r->get_data();
$ruta_err = $datos['data']['violaciones'][0]['ruta'] ?? '';
$comprobar('el error trae la ruta exacta de lo rechazado', strpos((string) $ruta_err, 'style.color.text') !== false, (string) $ruta_err);
$comprobar('y NO escribió la página', $cuantos('page', 'ZZ rest literal') === 0);

$r = $rest('POST', '/wp/v2/pages', ['title' => 'ZZ rest preset', 'status' => 'draft', 'content' => $CON_PRESET]);
$comprobar('enforce: el mismo bloque con presets del registro → aceptado', $r->get_status() === 201, 'status=' . $r->get_status() . ' code=' . $codigo($r));
$d = $r->get_data();
if (is_array($d) && isset($d['id'])) {
    $creados[] = (int) $d['id'];
}

$modo('off');
$r = $rest('POST', '/wp/v2/pages', ['title' => 'ZZ rest off', 'status' => 'draft', 'content' => $CON_LITERAL]);
$comprobar('off: el literal se acepta (el comportamiento de siempre)', $r->get_status() === 201, 'status=' . $r->get_status() . ' code=' . $codigo($r));
$d = $r->get_data();
if (is_array($d) && isset($d['id'])) {
    $creados[] = (int) $d['id'];
}

$modo('enforce');
$con_contrasena(false);
$r = $rest('POST', '/wp/v2/pages', ['title' => 'ZZ rest persona', 'status' => 'draft', 'content' => $CON_LITERAL]);
$comprobar('una persona con sesión en el editor NO se bloquea (aunque sea enforce)', $r->get_status() === 201, 'status=' . $r->get_status() . ' code=' . $codigo($r));
$d = $r->get_data();
if (is_array($d) && isset($d['id'])) {
    $creados[] = (int) $d['id'];
}

echo "\n== 2. las demás superficies del bloque (HTML guardado, SVG, <style>, clases, atributos antiguos) ==\n";
$con_contrasena(true);
$intentos = [
    'style="" con color' => $bloque('paragraph', [], '<p style="color:#123456">x</p>'),
    'style="" con padding literal' => $bloque('group', [], '<div class="wp-block-group" style="padding-top:30px"></div>'),
    'SVG con fill="#…"' => $bloque('html', [], '<svg viewBox="0 0 8 8"><path d="M0 0h8v8z" fill="#123456"/></svg>'),
    '<style> incrustado' => $bloque('html', [], '<style>.x{color:#f00}</style>'),
    'clase has-* con slug que no existe' => $bloque('paragraph', [], '<p class="has-inventado-color has-text-color">x</p>'),
    'slug de backgroundColor que no existe' => $bloque('group', ['backgroundColor' => 'inventado'], '<div class="wp-block-group"></div>'),
    'fontSize literal (customFontSize)' => $bloque('paragraph', ['customFontSize' => 18], '<p>x</p>'),
    'customTextColor' => $bloque('paragraph', ['customTextColor' => '#abcdef'], '<p>x</p>'),
    'style.typography.fontSize literal' => $bloque('paragraph', ['style' => ['typography' => ['fontSize' => '18px']]], '<p style="font-size:18px">x</p>'),
    'style.spacing.padding literal' => $bloque('group', ['style' => ['spacing' => ['padding' => ['top' => '30px']]]], '<div class="wp-block-group" style="padding-top:30px"></div>'),
    'style.border.radius literal' => $bloque('group', ['style' => ['border' => ['radius' => '8px']]], '<div class="wp-block-group" style="border-radius:8px"></div>'),
    'style.shadow literal' => $bloque('group', ['style' => ['shadow' => '0 4px 10px #000']], '<div class="wp-block-group"></div>'),
    'style.css con un literal' => $bloque('group', ['style' => ['css' => 'color:#123456']], '<div class="wp-block-group"></div>'),
    'layout.contentSize literal' => $bloque('group', ['layout' => ['type' => 'constrained', 'contentSize' => '700px']], '<div class="wp-block-group"></div>'),
    'dentro de un bloque anidado' => $bloque('group', [], '<div class="wp-block-group">' . '<!-- wp:paragraph {"style":{"color":{"background":"#fff"}}} --><p>x</p><!-- /wp:paragraph -->' . '</div>'),
];
foreach ($intentos as $nombre => $contenido) {
    $r = $rest('POST', '/wp/v2/posts', ['title' => 'ZZ rest ' . $nombre, 'status' => 'draft', 'content' => $contenido]);
    $c = $codigo($r);
    $comprobar('enforce: ' . $nombre . ' → rechazado', $r->get_status() === 400 && strpos($c, 'ADN_') === 0, 'status=' . $r->get_status() . ' code=' . $c);
    $comprobar('   …y no escribió', $cuantos('post', 'ZZ rest ' . $nombre) === 0);
}

echo "\n== 3. patrones, plantillas, partes y navegación ==\n";
foreach ([
    ['POST', '/wp/v2/blocks', ['title' => 'ZZ patrón literal', 'status' => 'publish', 'content' => $CON_LITERAL]],
    ['POST', '/wp/v2/templates', ['slug' => 'zz-prueba', 'theme' => get_stylesheet(), 'title' => 'ZZ', 'status' => 'publish', 'content' => $CON_LITERAL]],
    ['POST', '/wp/v2/template-parts', ['slug' => 'zz-parte', 'theme' => get_stylesheet(), 'title' => 'ZZ', 'status' => 'publish', 'area' => 'header', 'content' => $CON_LITERAL]],
    ['POST', '/wp/v2/navigation', ['title' => 'ZZ nav', 'status' => 'publish', 'content' => $CON_LITERAL]],
] as [$m, $ruta, $cuerpo]) {
    $r = $rest($m, $ruta, $cuerpo);
    $c = $codigo($r);
    $comprobar($ruta . ' con un literal → rechazado', $r->get_status() === 400 && $c === 'ADN_LITERAL_COLOR', 'status=' . $r->get_status() . ' code=' . $c);
}
$r = $rest('POST', '/wp/v2/blocks', ['title' => 'ZZ patrón preset', 'status' => 'publish', 'content' => $CON_PRESET]);
$comprobar('/wp/v2/blocks con presets del registro → aceptado', $r->get_status() === 201, 'status=' . $r->get_status() . ' code=' . $codigo($r));
$d = $r->get_data();
if (is_array($d) && isset($d['id'])) {
    $creados[] = (int) $d['id'];
}

echo "\n== 4. global-styles y plugins ==\n";
$gs_id = class_exists('WP_Theme_JSON_Resolver') ? (int) WP_Theme_JSON_Resolver::get_user_global_styles_post_id() : 0;
$comprobar('hay un post de estilos globales del usuario para probar', $gs_id > 0);
$antes_gs = (string) get_post_field('post_content', $gs_id);
$r = $rest('POST', '/wp/v2/global-styles/' . $gs_id, ['styles' => ['color' => ['background' => '#000000']]]);
$comprobar('enforce: global-styles por contraseña de aplicación → rechazado', $r->get_status() === 403 && $codigo($r) === 'ADN_GLOBAL_STYLES_BLOCKED', 'status=' . $r->get_status() . ' code=' . $codigo($r));
$comprobar('   …y no cambió los estilos globales', (string) get_post_field('post_content', $gs_id) === $antes_gs);
$r = $rest('POST', '/wp/v2/global-styles/' . $gs_id, ['settings' => ['color' => ['palette' => ['theme' => []]]]]);
$comprobar('enforce: global-styles › settings también', $r->get_status() === 403 && $codigo($r) === 'ADN_GLOBAL_STYLES_BLOCKED');
$modo('ratchet');
$r = $rest('POST', '/wp/v2/global-styles/' . $gs_id, ['styles' => ['color' => ['background' => '#000000']]]);
$comprobar('ratchet: global-styles también se rechaza', $r->get_status() === 403 && $codigo($r) === 'ADN_GLOBAL_STYLES_BLOCKED');
$modo('enforce');
$r = $rest('PUT', '/wp/v2/plugins/contope-publisher/contope-publisher', ['status' => 'inactive']);
$comprobar('enforce: desactivar el plugin por contraseña de aplicación → rechazado', $r->get_status() === 403 && $codigo($r) === 'ADN_PLUGIN_CHANGE_BLOCKED', 'status=' . $r->get_status() . ' code=' . $codigo($r));
$comprobar('   …y el plugin sigue activo', is_plugin_active('contope-publisher/contope-publisher.php'));

$puerta = new COD_ADN_Gate_Rest();
$con_contrasena(false);
$req = new WP_REST_Request('POST', '/wp/v2/global-styles/' . $gs_id);
$req->set_header('content-type', 'application/json');
$req->set_body((string) wp_json_encode(['styles' => ['color' => ['background' => '#000000']]]));
$comprobar('una persona con sesión: global-styles no se bloquea', $puerta->revisar($req) === null);
$req = new WP_REST_Request('PUT', '/wp/v2/plugins/contope-publisher/contope-publisher');
$comprobar('una persona con sesión: plugins no se bloquea', $puerta->revisar($req) === null);
$con_contrasena(true);
$modo('off');
$req = new WP_REST_Request('POST', '/wp/v2/global-styles/' . $gs_id);
$req->set_header('content-type', 'application/json');
$req->set_body((string) wp_json_encode(['styles' => ['color' => ['background' => '#000000']]]));
$comprobar('off: global-styles no se bloquea (el comportamiento de siempre)', $puerta->revisar($req) === null);

echo "\n== 5. observe registra y no rechaza; ratchet deja pasar lo heredado y rechaza lo nuevo ==\n";
$modo('observe');
delete_option(COD_ADN_Gate::OPTION_LOG);
$r = $rest('POST', '/wp/v2/pages', ['title' => 'ZZ rest observe', 'status' => 'draft', 'content' => $CON_LITERAL]);
$comprobar('observe: el literal se acepta', $r->get_status() === 201, 'status=' . $r->get_status());
$d = $r->get_data();
if (is_array($d) && isset($d['id'])) {
    $creados[] = (int) $d['id'];
}
$log = get_option(COD_ADN_Gate::OPTION_LOG, []);
$comprobar('observe: lo dejó en el registro de la compuerta', is_array($log) && $log !== [] && strpos((string) ($log[count($log) - 1]['herramienta'] ?? ''), 'REST POST /wp/v2/pages') === 0);

$heredada = wp_insert_post(['post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'ZZ rest heredada', 'post_content' => wp_slash($CON_LITERAL)]);
$creados[] = (int) $heredada;
$modo('ratchet');
$r = $rest('POST', '/wp/v2/pages/' . $heredada, ['content' => $CON_LITERAL . "\n\n" . $bloque('paragraph', [], '<p>otro</p>')]);
$comprobar('ratchet: conservar el literal que ya estaba (más un párrafo limpio) → aceptado', $r->get_status() === 200, 'status=' . $r->get_status() . ' code=' . $codigo($r));
$r = $rest('POST', '/wp/v2/pages/' . $heredada, ['content' => $CON_LITERAL . "\n\n" . $bloque('paragraph', ['style' => ['color' => ['text' => '#abcdef']]], '<p style="color:#abcdef">nuevo</p>')]);
$comprobar('ratchet: agregar un literal nuevo → rechazado', $r->get_status() === 400 && $codigo($r) === 'ADN_LITERAL_COLOR', 'status=' . $r->get_status() . ' code=' . $codigo($r));

echo "\n== 6. XML-RPC ==\n";
$modo('enforce');
$comprobar('enforce: XML-RPC desactivado', apply_filters('xmlrpc_enabled', true) === false);
$modo('off');
$comprobar('off: XML-RPC como siempre', apply_filters('xmlrpc_enabled', true) === true);

// ---------------------------------------------------------------------------
echo "\n== 7. cod_write_block_page (la vía oficial) ==\n";
$limpiar();
$repositorio = new COD_Canvas_Document_Repository();
$resolutor = new COD_Template_Region_Resolver($repositorio);
$publicador = new COD_Canvas_Page_Publisher($repositorio, $resolutor, new COD_Dynamic_Token_Resolver());
$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$servicio = new COD_Canvas_MCP_Service($repositorio, $publicador, $resolutor, $compilador, new COD_Canvas_Asset_Resolver());
$nombres = array_map(static fn (array $t): string => $t['name'], $servicio->tool_definitions());
$comprobar('las dos herramientas están en el catálogo', in_array('cod_write_block_page', $nombres, true) && in_array('cod_read_block_page', $nombres, true));

COD_ADN_Gate::entrar_en_mcp();
$modo('enforce');
$e = $servicio->call_tool('cod_write_block_page', ['pageId' => 0, 'title' => 'ZZ bloques literal', 'content' => $CON_LITERAL]);
$comprobar('enforce: crear con un literal → rechazado con ADN_LITERAL_COLOR', is_wp_error($e) && $e->get_error_code() === 'ADN_LITERAL_COLOR', is_wp_error($e) ? $e->get_error_code() : 'se aceptó');
$comprobar('   …y no creó la página', $cuantos('page', 'ZZ bloques literal') === 0);
$ok = $servicio->call_tool('cod_write_block_page', ['pageId' => 0, 'title' => 'ZZ bloques preset', 'content' => $CON_PRESET]);
$comprobar('enforce: crear con presets del registro → aceptado', !is_wp_error($ok) && !empty($ok['pageId']) && ($ok['revision'] ?? 0) === 1, is_wp_error($ok) ? $ok->get_error_code() . ' ' . $ok->get_error_message() : '');
if (!is_wp_error($ok)) {
    $pid = (int) $ok['pageId'];
    $creados[] = $pid;
    $comprobar('   …la respuesta trae el informe de la compuerta', isset($ok['adnGate']) && ($ok['adnGate']['nuevas'] ?? -1) === 0);
    $lee = $servicio->call_tool('cod_read_block_page', ['pageId' => $pid]);
    $comprobar('cod_read_block_page devuelve contenido y revisión', !is_wp_error($lee) && $lee['revision'] === 1 && strpos($lee['content'], 'wp:paragraph') !== false);
    $viejo = $servicio->call_tool('cod_write_block_page', ['pageId' => $pid, 'expectedRevision' => 0, 'content' => $CON_PRESET]);
    $comprobar('revisión equivocada → conflicto, sin escribir', is_wp_error($viejo) && $viejo->get_error_code() === 'cod_mcp_revision_conflict');
    $malo = $servicio->call_tool('cod_write_block_page', ['pageId' => $pid, 'expectedRevision' => 1, 'content' => $CON_LITERAL]);
    $comprobar('reemplazar con un literal → rechazado', is_wp_error($malo) && $malo->get_error_code() === 'ADN_LITERAL_COLOR');
    $comprobar('   …y el contenido guardado sigue siendo el limpio', strpos((string) get_post_field('post_content', $pid), '#123456') === false);
    $buena = $servicio->call_tool('cod_write_block_page', ['pageId' => $pid, 'expectedRevision' => 1, 'content' => $bloque('paragraph', ['textColor' => 'ink'], '<p class="has-ink-color has-text-color">Otro</p>')]);
    $comprobar('reemplazar con la revisión correcta y presets → aceptado y sube la revisión', !is_wp_error($buena) && $buena['revision'] === 2, is_wp_error($buena) ? $buena->get_error_code() : '');
    update_post_meta($pid, '_cod_canvas_document_id', 'cod-zz-prueba');
    $sin_lienzo = $servicio->call_tool('cod_write_block_page', ['pageId' => $pid, 'expectedRevision' => 2, 'content' => $CON_PRESET]);
    $comprobar('una página con encabezado y pie por el lienzo exige el envoltorio contope/lienzo', is_wp_error($sin_lienzo) && $sin_lienzo->get_error_code() === 'cod_mcp_block_needs_lienzo');
    $con_lienzo = $servicio->call_tool('cod_write_block_page', ['pageId' => $pid, 'expectedRevision' => 2, 'content' => $bloque('contope/lienzo', ['documentId' => ''], $CON_PRESET)]);
    $comprobar('…y con el envoltorio entra', !is_wp_error($con_lienzo), is_wp_error($con_lienzo) ? $con_lienzo->get_error_code() . ' ' . $con_lienzo->get_error_message() : '');
}
$suelto = $servicio->call_tool('cod_write_block_page', ['pageId' => 0, 'title' => 'ZZ suelto', 'content' => "Hola suelto\n" . $CON_PRESET]);
$comprobar('texto suelto fuera de bloques → rechazado', is_wp_error($suelto) && $suelto->get_error_code() === 'cod_mcp_block_loose_html');
$desconocido = $servicio->call_tool('cod_write_block_page', ['pageId' => 0, 'title' => 'ZZ desconocido', 'content' => $bloque('inventado/bloque', [], '<div></div>')]);
$comprobar('un bloque que no existe → rechazado', is_wp_error($desconocido) && $desconocido->get_error_code() === 'cod_mcp_block_unknown');
$modo('off');
$off = $servicio->call_tool('cod_write_block_page', ['pageId' => 0, 'title' => 'ZZ bloques off', 'content' => $CON_LITERAL]);
$comprobar('off: el literal se acepta (como siempre)', !is_wp_error($off), is_wp_error($off) ? $off->get_error_code() : '');
if (!is_wp_error($off)) {
    $creados[] = (int) $off['pageId'];
}
COD_ADN_Gate::salir_de_mcp();

// ---------------------------------------------------------------------------
echo "\n== 8. el importador de paquetes ==\n";
$importador = new COD_Site_Package_Importer($repositorio, new COD_Canvas_Document_Sanitizer(), new COD_Media_Attachment_Sync());
$zip_de = static function (string $doc_id, string $css): string {
    $ruta = tempnam(sys_get_temp_dir(), 'zzpaq');
    $zip = new ZipArchive();
    $zip->open($ruta, ZipArchive::OVERWRITE);
    $zip->addFromString('manifest.json', (string) wp_json_encode([
        'schemaVersion' => COD_Site_Package_Exporter::PACKAGE_SCHEMA_VERSION,
        'sourceSiteUrl' => home_url('/'),
        'pages' => [],
        'documents' => [$doc_id => ['title' => 'ZZ paquete', 'html' => '<section class="zz"><p>Hola</p></section>', 'css' => $css, 'projectData' => '{}']],
    ]));
    $zip->close();
    return $ruta;
};
$doc_literal = 'zz-paquete-literal';
$doc_limpio = 'zz-paquete-limpio';
$zip_literal = $zip_de($doc_literal, '.zz{color:#123456;padding-top:30px}');
$zip_limpio = $zip_de($doc_limpio, '.zz{color:var(--wp--preset--color--ink);padding-top:var(--wp--preset--spacing--m)}');

$modo('enforce');
$con_contrasena(true);
$r = $importador->import($zip_literal);
$comprobar('enforce, petición no humana: un paquete con un literal → rechazado', is_wp_error($r) && strpos($r->get_error_code(), 'ADN_LITERAL_') === 0, is_wp_error($r) ? $r->get_error_code() : 'se importó');
$comprobar('   …y no escribió el documento', is_wp_error($repositorio->load_existing($doc_literal)));
$r = $importador->import($zip_limpio);
$comprobar('enforce, petición no humana: un paquete con variables del registro → importado', !is_wp_error($r), is_wp_error($r) ? $r->get_error_code() . ' ' . $r->get_error_message() : '');
$con_contrasena(false);
$r = $importador->import($zip_literal);
$comprobar('una persona en la administración (sin contraseña de aplicación): no se bloquea', !is_wp_error($r), is_wp_error($r) ? $r->get_error_code() : '');
foreach ([$doc_literal, $doc_limpio] as $doc) {
    $d = $repositorio->load_existing($doc);
    if (is_array($d) && !empty($d['postId'])) {
        wp_delete_post((int) $d['postId'], true);
    }
}
@unlink($zip_literal);
@unlink($zip_limpio);

// ---------------------------------------------------------------------------
echo "\n== 9. el registro es lo que define el sitio, no lo que WordPress trae de fábrica ==\n";
COD_ADN_Registry::fijar_para_prueba(null);
COD_ADN_Registry::reiniciar();
$modo('enforce');
foreach (['--wp--preset--color--vivid-red', '--wp--preset--color--luminous-vivid-orange', '--wp--preset--gradient--midnight', '--wp--preset--shadow--deep', '--wp--preset--shadow--natural', '--wp--preset--font-size--large'] as $n) {
    $comprobar('el registro no trae el preset de fábrica ' . $n, !COD_ADN_Registry::tiene($n));
}
$comprobar('el registro trae las escalas del sitio (espaciado, tamaños, radios, pesos, interlineados)', COD_ADN_Registry::tiene('--wp--preset--spacing--gutter') && COD_ADN_Registry::tiene('--wp--preset--font-size--40') && COD_ADN_Registry::tiene('--wp--custom--radius--m') && COD_ADN_Registry::tiene('--wp--custom--typography--font-weight--medium') && COD_ADN_Registry::tiene('--wp--custom--typography--line-height--normal'));
$real = static function (string $contenido): array {
    return COD_ADN_Gate::revisar_contenido('', $contenido, 'prueba')['violaciones'];
};
$comprobar('backgroundColor:"vivid-red" (preset de WordPress) → rechazado', $real($bloque('group', ['backgroundColor' => 'vivid-red'], '<div class="wp-block-group has-vivid-red-background-color has-background"></div>')) !== []);
$comprobar('style.shadow:"var:preset|shadow|deep" (sombra de WordPress; el sitio no tiene escala de sombras) → rechazado', $real($bloque('group', ['style' => ['shadow' => 'var:preset|shadow|deep']], '<div class="wp-block-group"></div>')) !== []);
$comprobar('un bloque con escalas del sitio (espaciado, tamaño, radio, peso) → limpio', $real($bloque('group', ['fontSize' => '40', 'style' => ['spacing' => ['padding' => ['top' => 'var:preset|spacing|60', 'left' => 'var:preset|spacing|gutter']], 'border' => ['radius' => 'var(--wp--custom--radius--m)', 'width' => 'var(--wp--custom--border--hairline)'], 'typography' => ['fontWeight' => 'var(--wp--custom--typography--font-weight--medium)', 'lineHeight' => 'var(--wp--custom--typography--line-height--tight)']]], '<div class="wp-block-group has-40-font-size" style="border-width:var(--wp--custom--border--hairline);border-radius:var(--wp--custom--radius--m);padding-top:var(--wp--preset--spacing--60);padding-left:var(--wp--preset--spacing--gutter);font-weight:var(--wp--custom--typography--font-weight--medium);line-height:var(--wp--custom--typography--line-height--tight)"></div>')) === []);
$hoja_global = (string) wp_get_global_stylesheet();
$comprobar('la hoja global no define .has-text-color ni .has-background-color (el choque de slugs «text» y «background»)', preg_match('/\.has-text-color\s*\{|\.has-background-color\s*\{/', $hoja_global) !== 1);
$paleta = [];
foreach ((wp_get_global_settings()['color']['palette']['theme'] ?? []) as $c) {
    $paleta[] = (string) $c['slug'];
}
$comprobar('la paleta del tema no tiene colores con slug «text» ni «background»', !in_array('text', $paleta, true) && !in_array('background', $paleta, true));

// ---------------------------------------------------------------------------
$limpiar();
COD_ADN_Gate::marcar_contrasena_de_aplicacion(false);
COD_ADN_Registry::fijar_para_prueba(null);
if ($opcion_original === null) {
    delete_option(COD_ADN_Gate::OPTION_MODE);
} else {
    update_option(COD_ADN_Gate::OPTION_MODE, $opcion_original, false);
}
echo "\n" . ($fallas === 0 ? 'TODO COMO SE ESPERABA' : $fallas . ' comprobaciones fallaron') . ' de ' . $ejecutadas . "\n";
exit($fallas === 0 ? 0 : 1);
