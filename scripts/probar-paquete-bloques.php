<?php
/**
 * Fase F1b (ESPEC-adn-unica-puerta-y-bloques): el paquete `.ocdsite` v1 con ADN, páginas en bloques,
 * medios y regiones. Pruebas P1b.1, P1b.2 y P1b.3 con sus controles, más el lector del manifiesto, los
 * paquetes del esquema anterior, el ZIP hostil y la ida y vuelta del ADN.
 *
 * Corre contra el WordPress LIMPIO de prueba (puerto 8895, carpeta wp-local-f1b-destino), nunca contra
 * Santa Luisa, Econut ni Basis. Lo crea:  node scripts/paquete/crear-destino-limpio.mjs
 * Después de tocar el plugin:               node scripts/paquete/crear-destino-limpio.mjs --sincronizar
 *
 * Esta prueba puede fallar de verdad: cada afirmación de "no se escribió nada" o "quedó intacto" tiene
 * su CONTROL (la misma operación con la salvaguarda levantada, que sí cambia lo observado).
 *
 * Al terminar deja el sitio como lo encontró (posts, opciones y archivos de uploads de antes se conservan).
 */
define('WP_USE_THEMES', false);
// El destino limpio: 8895 por omisión; `OCD_DESTINO_PUERTO=8896` usa otro independiente (crear-destino-limpio.mjs).
$puerto_destino = (int) (getenv('OCD_DESTINO_PUERTO') ?: 8895);
$wp_load = getenv('COD_PRUEBA_WP') ?: __DIR__ . '/../../wp-local-f1b-destino' . ($puerto_destino === 8895 ? '' : '-' . $puerto_destino) . '/wordpress/wp-load.php';
require $wp_load;
require_once ABSPATH . 'wp-admin/includes/file.php'; // wp_tempnam(): el exportador la usa y en CLI no se carga sola
require __DIR__ . '/adn/lib/contrato-de-prueba.php';

$fallas = 0;
$ejecutadas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas, &$ejecutadas): void {
    ++$ejecutadas;
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? '   -> ' . $detalle : '') . "\n";
    if (!$ok) {
        ++$fallas;
    }
};
$codigo = static function ($r): string {
    return is_wp_error($r) ? $r->get_error_code() : 'sin error';
};

global $wpdb;
$raiz = realpath(__DIR__ . '/..');
$PHP_LOCAL = 'C:/Users/Cristobal concha/wp-local/php/php.exe';

// ---------------------------------------------------------------------------
echo "\n== 0. precondiciones ==\n";
$comprobar('el sitio de prueba es un destino limpio (carpeta wp-local-f1b-destino*)', strpos(str_replace('\\', '/', (string) ABSPATH), '/wp-local-f1b-destino') !== false, (string) home_url() . ' ' . ABSPATH);
$repo_dir = realpath($raiz . '/contope-publisher');
$inst_dir = rtrim((string) COD_PUBLISHER_DIR, '/\\');
$desiguales = [];
foreach (array_merge(glob($repo_dir . '/includes/class-cod-site-package-*.php') ?: [], glob($repo_dir . '/includes/class-cod-adn-*.php') ?: [], [$repo_dir . '/contope-publisher.php']) as $a) {
    $b = $inst_dir . substr($a, strlen($repo_dir));
    if (!is_file($b) || md5_file($a) !== md5_file($b)) {
        $desiguales[] = basename($a);
    }
}
$comprobar('lo instalado en el sitio de prueba es lo que hay en el repositorio', $desiguales === [], 'distintos: ' . implode(', ', $desiguales) . ' (corre: node scripts/paquete/crear-destino-limpio.mjs --sincronizar)');
if ($fallas > 0) {
    echo "\n  Las precondiciones no se cumplen: no se corre nada.\n";
    exit(1);
}
// El destino es de pruebas y se vacía de contenido de ContOpe antes de empezar (lo deja así la pantalla de la
// prueba de Basis, que importa un sitio entero): las cuentas de esta prueba parten de un sitio limpio.
$vaciado = [];
exec(escapeshellarg($PHP_LOCAL) . ' -c ' . escapeshellarg('C:/Users/Cristobal concha/wp-local/php/php.ini') . ' ' . escapeshellarg($raiz . '/scripts/paquete/vaciar-destino.php') . ' ' . escapeshellarg($wp_load) . ' 2>&1', $vaciado);
$comprobar('(preparación) el destino de pruebas se vació de contenido de ContOpe', strpos(implode('', $vaciado), 'borrados') !== false, implode(' ', $vaciado));
wp_cache_flush();
if (COD_ADN_Store::activo()) {
    echo "\n  FALLA  este WordPress ya tiene un ADN activo: la prueba no lo pisa.\n";
    exit(1);
}

// --- foto del estado de antes, para dejarlo igual
$fotos = [
    'posts' => array_map('intval', (array) $wpdb->get_col("SELECT ID FROM {$wpdb->posts}")),
    'opciones' => (array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options}"),
    'show_on_front' => get_option('show_on_front'),
    'page_on_front' => get_option('page_on_front'),
    'page_for_posts' => get_option('page_for_posts'),
    'modo' => get_option(COD_ADN_Gate::OPTION_MODE, null),
];
$upload = wp_get_upload_dir();
$archivos_antes = [];
$recorrer = static function (string $dir) use (&$recorrer, &$archivos_antes): void {
    foreach (glob($dir . '/*') ?: [] as $f) {
        if (is_dir($f)) {
            $recorrer($f);
        } else {
            $archivos_antes[wp_normalize_path($f)] = true;
        }
    }
};
$recorrer(rtrim($upload['basedir'], '/\\'));

$borrar_adn = static function () use ($wpdb): void {
    foreach (get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']) as $id) {
        wp_delete_post((int) $id, true);
    }
    foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_%'") as $nombre) {
        if (preg_match('/^cod_adn_(proj_r[0-9]+|lock_.*|activa)$/', (string) $nombre) === 1) {
            delete_option((string) $nombre);
        }
    }
};
$temporales = [];
$limpiar = static function () use (&$fotos, &$archivos_antes, &$temporales, $borrar_adn, $wpdb, $upload): void {
    $borrar_adn();
    foreach ((array) $wpdb->get_col("SELECT ID FROM {$wpdb->posts}") as $id) {
        if (!in_array((int) $id, $fotos['posts'], true)) {
            wp_delete_post((int) $id, true);
        }
    }
    foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options}") as $nombre) {
        if (!in_array($nombre, $fotos['opciones'], true) && strpos((string) $nombre, '_transient') === false) {
            delete_option((string) $nombre);
        }
    }
    foreach (['show_on_front', 'page_on_front', 'page_for_posts'] as $o) {
        update_option($o, $fotos[$o]);
    }
    if ($fotos['modo'] === null) {
        delete_option(COD_ADN_Gate::OPTION_MODE);
    } else {
        update_option(COD_ADN_Gate::OPTION_MODE, $fotos['modo'], false);
    }
    $rec = static function (string $dir) use (&$rec, &$archivos_antes): void {
        foreach (glob($dir . '/*') ?: [] as $f) {
            if (is_dir($f)) {
                $rec($f);
                @rmdir($f);
            } elseif (!isset($archivos_antes[wp_normalize_path($f)])) {
                @unlink($f);
            }
        }
    };
    $rec(rtrim($upload['basedir'], '/\\'));
    foreach ($temporales as $t) {
        if (is_file($t)) {
            @unlink($t);
        }
    }
};
register_shutdown_function(static function () use (&$limpiar): void {
    $limpiar();
});

// ---------------------------------------------------------------------------
// Utilitarios de paquetes
$tmp = static function (string $sufijo = '.zip') use (&$temporales): string {
    $ruta = tempnam(sys_get_temp_dir(), 'zzf1b');
    @unlink($ruta);
    $ruta .= $sufijo;
    $temporales[] = $ruta;
    return $ruta;
};
$leer_zip = static function (string $ruta): array {
    $zip = new ZipArchive();
    $zip->open($ruta);
    $salida = ['nombres' => [], 'contenidos' => []];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $n = (string) $zip->getNameIndex($i);
        $salida['nombres'][] = $n;
        $salida['contenidos'][$n] = (string) $zip->getFromIndex($i);
    }
    $zip->close();
    return $salida;
};
/** Escribe un ZIP con los archivos dados (nombre => contenido). */
$escribir_zip = static function (array $archivos) use ($tmp): string {
    $ruta = $tmp();
    $zip = new ZipArchive();
    $zip->open($ruta, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    foreach ($archivos as $nombre => $contenido) {
        $zip->addFromString($nombre, $contenido);
    }
    $zip->close();
    return $ruta;
};
$repositorio = new COD_Canvas_Document_Repository();
$exportador = new COD_Site_Package_Exporter($repositorio);
$importador = new COD_Site_Package_Importer($repositorio, new COD_Canvas_Document_Sanitizer(), new COD_Media_Attachment_Sync());
$sha = static function (string $s): string {
    return hash('sha256', $s);
};
$contenido_de = static function (int $id): string {
    return (string) get_post_field('post_content', $id, 'raw');
};
/** Escribe un post_content CRUDO en un post (sin kses): es la preparación de la prueba, no lo que se mide. */
$poner_contenido = static function (int $id, string $contenido): void {
    $kses = function_exists('kses_remove_filters') && has_filter('content_save_pre', 'wp_filter_post_kses');
    if ($kses) {
        kses_remove_filters();
    }
    try {
        wp_update_post(['ID' => $id, 'post_content' => wp_slash($contenido)]);
    } finally {
        if ($kses) {
            kses_init_filters();
        }
    }
};
$pagina_por_slug = static function (string $slug): ?int {
    $ids = get_posts(['post_type' => 'page', 'post_status' => 'any', 'name' => $slug, 'numberposts' => 1, 'fields' => 'ids', 'no_found_rows' => true]);
    return $ids === [] ? null : (int) $ids[0];
};
$cantidad_por_slug = static function (string $slug): int {
    return count(get_posts(['post_type' => 'page', 'post_status' => 'any', 'name' => $slug, 'numberposts' => -1, 'fields' => 'ids', 'no_found_rows' => true]));
};
$ajv = static function (string $manifest_json) use ($PHP_LOCAL, $raiz, $tmp): array {
    $archivo = $tmp('.json');
    file_put_contents($archivo, $manifest_json);
    $salida = [];
    $codigo_salida = 0;
    exec('node ' . escapeshellarg($raiz . '/scripts/paquete/validar-manifiesto-ajv.mjs') . ' ' . escapeshellarg($archivo) . ' 2>&1', $salida, $codigo_salida);
    $json = json_decode(implode("\n", $salida), true);
    return is_array($json) ? $json : ['ok' => false, 'codes' => ['SIN_RESPUESTA'], 'detalle' => $salida];
};
$core = static function (string $json) use ($raiz, $tmp): array {
    $archivo = $tmp('.json');
    file_put_contents($archivo, $json);
    $salida = [];
    $codigo_salida = 0;
    exec('node ' . escapeshellarg($raiz . '/scripts/adn/modelo-portable-core.mjs') . ' validar ' . escapeshellarg($archivo) . ' 2>&1', $salida, $codigo_salida);
    return ['ok' => $codigo_salida === 0, 'salida' => implode("\n", $salida)];
};

// ---------------------------------------------------------------------------
echo "\n== 1. el lector del manifiesto: los 34 fixtures de package-v1 dan los mismos códigos que Ajv ==\n";
$casos = [];
$buscar = static function (string $dir) use (&$buscar, &$casos): void {
    foreach (glob($dir . '/*') ?: [] as $f) {
        if (is_dir($f)) {
            if (is_file($f . '/manifest.json') && is_file($f . '/case.json')) {
                $casos[] = $f;
            } else {
                $buscar($f);
            }
        }
    }
};
$buscar($raiz . '/fixtures/package-v1');
$comprobar('hay 34 fixtures (piso: si faltan, el cruce no mide)', count($casos) === 34, 'hay ' . count($casos));
$no_coinciden = [];
foreach ($casos as $dir) {
    $caso = json_decode((string) file_get_contents($dir . '/case.json'), true);
    $manifiesto = json_decode((string) file_get_contents($dir . '/manifest.json'), true);
    $codigos = $manifiesto === null ? ['INVALID_JSON'] : array_values(array_unique(array_column(COD_Site_Package_Format::validar_manifiesto($manifiesto), 'code')));
    $esperados = ($caso['expect'] ?? '') === 'valid' ? [] : (array) ($caso['expectedErrors'] ?? []);
    sort($codigos);
    sort($esperados);
    if ($codigos !== $esperados) {
        $no_coinciden[] = basename($dir) . ' esperaba [' . implode(',', $esperados) . '] dio [' . implode(',', $codigos) . ']';
    }
}
$comprobar('cada fixture: mismos códigos que Ajv (válidos sin error, inválidos con exactamente los suyos)', $no_coinciden === [], implode(' | ', $no_coinciden));

// ---------------------------------------------------------------------------
echo "\n== 2. P1b.1 — el fixture desktop-interchange con su design/model.json deja un ADN activo ==\n";
$fixture = $raiz . '/fixtures/package-v1/valid/desktop-interchange';
$zip_fixture = static function (bool $con_modelo, ?callable $tocar = null) use ($fixture, $escribir_zip): string {
    $archivos = [];
    foreach (['manifest.json', 'content/pages.json', 'wordpress/state.json', 'design/model.json'] as $ruta) {
        if (!$con_modelo && $ruta === 'design/model.json') {
            continue;
        }
        $archivos[$ruta] = (string) file_get_contents($fixture . '/' . $ruta);
    }
    if ($tocar !== null) {
        $archivos = $tocar($archivos);
    }
    return $escribir_zip($archivos);
};
$modelo_fixture = (string) file_get_contents($fixture . '/design/model.json');
$core_fixture = $core($modelo_fixture);
$comprobar('el design/model.json del fixture lo acepta parsePortableDesignModel DEL CORE', $core_fixture['ok'], $core_fixture['salida']);
$analisis = COD_ADN_Parser::analizar_portable(json_decode($modelo_fixture));
$comprobar('…y también el puerto de PHP del plugin', $analisis['valido'], implode(',', $analisis['traza']));

$r = $importador->import($zip_fixture(true));
$comprobar('importar el fixture completo: sin error', !is_wp_error($r), is_wp_error($r) ? $r->get_error_code() . ': ' . $r->get_error_message() : '');
$p = COD_ADN_Store::puntero();
$comprobar('queda un ADN activo con el design.id del fixture (desktop-interchange-sample, r1)', $p !== null && $p['designId'] === 'desktop-interchange-sample' && (int) $p['revision'] === 1, json_encode($p));
$comprobar('…reportado por el importador como aplicado, por la misma puerta del almacén', !is_wp_error($r) && ($r['adn']['resultado'] ?? '') === 'aplicado' && ($r['formato'] ?? '') === 'v1');
$comprobar('…y el digest activo es el del contrato que viaja en el archivo', $p !== null && hash_equals((string) $p['digest'], (string) COD_ADN_Validator::validar($modelo_fixture, ['emitirPropuestas' => false])['digest']));
$fixture_sin = $zip_fixture(false);
$antes = COD_ADN_Store::puntero();
$borrar_adn();
$r2 = $importador->import($fixture_sin);
$comprobar('CONTROL: el mismo fixture SIN design/model.json falla (el manifiesto lo declara)', is_wp_error($r2) && $r2->get_error_code() === 'cod_package_file_missing', $codigo($r2));
$comprobar('…y no deja ADN', COD_ADN_Store::puntero() === null);
$tocado = $zip_fixture(true, static function (array $a): array {
    $a['design/model.json'] = str_replace('desktop-interchange-sample', 'desktop-interchange-samplf', $a['design/model.json']);
    return $a;
});
$r3 = $importador->import($tocado);
$comprobar('CONTROL: un byte cambiado en design/model.json rompe el sha256 del manifiesto', is_wp_error($r3) && $r3->get_error_code() === 'cod_package_hash_mismatch', $codigo($r3));
$comprobar('…y tampoco deja ADN', COD_ADN_Store::puntero() === null);
$r4 = $importador->import($zip_fixture(true));
$comprobar('reimportar el fixture otra vez: aplicado de nuevo (el ADN se había quitado)', !is_wp_error($r4) && ($r4['adn']['resultado'] ?? '') === 'aplicado');
$r5 = $importador->import($zip_fixture(true));
$comprobar('reimportar con el mismo ADN ya activo: unchanged, sin error', !is_wp_error($r5) && ($r5['adn']['resultado'] ?? '') === 'unchanged', is_wp_error($r5) ? $codigo($r5) : json_encode($r5['adn'] ?? null));
$borrar_adn();

// ---------------------------------------------------------------------------
echo "\n== 3. P1b.2 — migrar a bloques, editar, exportar, importar en limpio: post_content idéntico y medios con el mismo hash ==\n";
$png_a = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$png_b = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
$dir_medios = rtrim($upload['basedir'], '/\\') . '/zz-f1b';
wp_mkdir_p($dir_medios);
file_put_contents($dir_medios . '/ñandú@2x.png', $png_a);
file_put_contents($dir_medios . '/fondo-region.png', $png_b);
$sha_a = hash('sha256', $png_a);
$sha_b = hash('sha256', $png_b);

$doc_a = 'zz-f1b-pagina-a';
$doc_b = 'zz-f1b-pagina-b';
$doc_region = 'zz-f1b-region-encabezado';
$contenido_a = "<!-- wp:contope/lienzo -->\n"
    . "<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">Título con ñ, \"comillas\" y \\ barra</h2>\n<!-- /wp:heading -->\n\n"
    . "<!-- wp:image {\"sizeSlug\":\"full\",\"linkDestination\":\"none\"} -->\n<figure class=\"wp-block-image size-full\"><img src=\"/wp-content/uploads/zz-f1b/%C3%B1and%C3%BA@2x.png\" alt=\"Ñandú \\u003cprueba\\u003e\"/></figure>\n<!-- /wp:image -->\n\n"
    . "<!-- wp:paragraph -->\n<p>Texto con emoji 😀 y saltos\r\nde línea CRLF dentro.</p>\n<!-- /wp:paragraph -->\n"
    . "<!-- /wp:contope/lienzo -->";
$editado_a = str_replace('Texto con emoji', 'Texto EDITADO en Gutenberg con emoji', $contenido_a);
$editado_a = str_replace("<!-- /wp:contope/lienzo -->", "<!-- wp:paragraph -->\n<p>Un bloque agregado a mano.</p>\n<!-- /wp:paragraph -->\n<!-- /wp:contope/lienzo -->", $editado_a);

// 3.a la página nace del lienzo y se migra a bloques (conserva su metadato), después se edita en Gutenberg
$repositorio->save($doc_a, '{}', '<section class="zz-a"><p>Hola</p></section>', '.zz-a{display:block}');
$id_a = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'ZZ F1b A', 'post_name' => 'zz-f1b-a', 'post_content' => '[contope_canvas document_id="' . $doc_a . '"]', 'meta_input' => ['_cod_canvas_document_id' => $doc_a]], true);
$comprobar('(preparación) la página de prueba A se creó como página del lienzo', is_int($id_a) && $id_a > 0);
$poner_contenido($id_a, $contenido_a);
update_post_meta($id_a, '_cod_content_revision', 1);
$poner_contenido($id_a, $editado_a);
update_post_meta($id_a, '_cod_content_revision', 2);
$hash_origen_a = $sha($contenido_de($id_a));
$comprobar('(preparación) quedó guardada la versión editada, tal cual', $contenido_de($id_a) === $editado_a);

// una página que sigue siendo del lienzo, y una región (encabezado global) con una imagen en su HTML
$repositorio->save($doc_b, '{}', '<section class="zz-b"><p>Página del lienzo B</p></section>', '.zz-b{color:var(--wp--preset--color--ink)}');
$id_b = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'ZZ F1b B', 'post_name' => 'zz-f1b-b', 'post_content' => '[contope_canvas document_id="' . $doc_b . '"]', 'meta_input' => ['_cod_canvas_document_id' => $doc_b]], true);
$repositorio->save($doc_region, '{}', '<header class="zz-hdr"><img src="/wp-content/uploads/zz-f1b/fondo-region.png" alt="">Encabezado</header>', '.zz-hdr{display:block}');
$repositorio->save_region($doc_region, 'header', 'global', []);

$zip1 = $exportador->export(true);
$comprobar('exportar el sitio completo: sin error', !is_wp_error($zip1), is_wp_error($zip1) ? $zip1->get_error_code() . ': ' . $zip1->get_error_message() : '');
if (is_wp_error($zip1)) {
    echo "\n  No se puede seguir sin paquete.\n";
    exit(1);
}
$temporales[] = $zip1;
$z1 = $leer_zip($zip1);
$manifiesto1 = json_decode($z1['contenidos']['manifest.json'], true);
$comprobar('el paquete trae manifest.json con formatVersion 1 y entrypoints', ($manifiesto1['formatVersion'] ?? null) === 1 && isset($manifiesto1['entrypoints']['content'], $manifiesto1['entrypoints']['theme']));
$comprobar('el manifiesto que EXPORTA el plugin lo valida el lector del plugin', COD_Site_Package_Format::validar_manifiesto($manifiesto1) === [], COD_Site_Package_Format::describir_errores(COD_Site_Package_Format::validar_manifiesto($manifiesto1)));
$resp_ajv = $ajv($z1['contenidos']['manifest.json']);
$comprobar('…y lo valida el esquema real (Ajv draft 2020-12 + referencias cruzadas)', $resp_ajv['ok'] === true, json_encode($resp_ajv['detalle'] ?? $resp_ajv));
$archivo_a = null;
foreach ($manifiesto1['files'] as $f) {
    if (strpos($f['path'], 'content/pages/') === 0 && strpos($f['path'], 'zz-f1b-a') !== false) {
        $archivo_a = $f;
    }
}
$comprobar('la página en bloques viaja como su propio archivo, con el sha256 de su post_content', $archivo_a !== null && $archivo_a['sha256'] === $hash_origen_a && $z1['contenidos'][$archivo_a['path']] === $editado_a, $archivo_a === null ? 'no hay archivo de la página' : '');
$contenido_json = json_decode($z1['contenidos']['content/pages.json'], true);
$tipos = [];
foreach ($contenido_json['pages'] as $pg) {
    $tipos[$pg['slug']] = $pg['kind'];
}
$comprobar('el paquete distingue página en bloques de página del lienzo', ($tipos['zz-f1b-a'] ?? '') === 'blocks' && ($tipos['zz-f1b-b'] ?? '') === 'canvas', json_encode($tipos));
$comprobar('la región (encabezado global) viaja aunque ninguna página ni plantilla la cite', isset($contenido_json['documents'][$doc_region]) && ($contenido_json['documents'][$doc_region]['regionKind'] ?? '') === 'header');
$activos = [];
foreach ($manifiesto1['assets'] as $as) {
    $activos[$as['sha256']] = $as;
}
$comprobar('los dos medios viajan con su sha256 (el del nombre con ñ y @, citado desde un bloque; el de la región, desde un documento)', isset($activos[$sha_a], $activos[$sha_b]));
$rutas_medios = array_column($contenido_json['media'], 'path');
$comprobar('…y la ruta real (con ñ y @) viaja en el contenido, no en el nombre del ZIP', in_array('zz-f1b/ñandú@2x.png', $rutas_medios, true) && in_array('zz-f1b/fondo-region.png', $rutas_medios, true), json_encode($rutas_medios));
$comprobar('requiredBlocks lista los bloques que las páginas usan', in_array('core/heading', $manifiesto1['capabilities']['requiredBlocks'], true) && in_array('core/image', $manifiesto1['capabilities']['requiredBlocks'], true) && in_array('contope/lienzo', $manifiesto1['capabilities']['requiredBlocks'], true), json_encode($manifiesto1['capabilities']['requiredBlocks']));
$comprobar('un sitio sin ADN no lleva design/model.json (no se inventa)', !isset($manifiesto1['entrypoints']['designModel']) && !isset($z1['contenidos']['design/model.json']));

// 3.b se deja el sitio limpio de lo que el paquete trae
$vaciar_prueba = static function () use ($repositorio, $doc_a, $doc_b, $doc_region, $dir_medios, $wpdb): void {
    foreach (get_posts(['post_type' => 'page', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids', 's' => '']) as $id) {
        if (strpos((string) get_post_field('post_name', $id), 'zz-f1b') === 0) {
            wp_delete_post((int) $id, true);
        }
    }
    foreach ([$doc_a, $doc_b, $doc_region] as $d) {
        $e = $repositorio->load_existing($d);
        if (is_array($e)) {
            wp_delete_post((int) $e['postId'], true);
        }
    }
    foreach (glob($dir_medios . '/*') ?: [] as $f) {
        @unlink($f);
    }
    foreach ((array) $wpdb->get_col("SELECT ID FROM {$wpdb->posts} WHERE post_type='attachment' AND guid LIKE '%zz-f1b%'") as $att) {
        wp_delete_post((int) $att, true);
    }
};
$vaciar_prueba();
$comprobar('(preparación) el sitio queda sin la página, sin sus documentos y sin sus medios', $pagina_por_slug('zz-f1b-a') === null && !is_array($repositorio->load_existing($doc_region)) && !is_file($dir_medios . '/ñandú@2x.png'));

$ri = $importador->import($zip1);
$comprobar('importar el paquete en el sitio limpio: sin error', !is_wp_error($ri), is_wp_error($ri) ? $ri->get_error_code() . ': ' . $ri->get_error_message() : '');
$nuevo_a = $pagina_por_slug('zz-f1b-a');
$comprobar('la página en bloques existe, publicada, con su metadato', $nuevo_a !== null && get_post_status($nuevo_a) === 'publish' && get_post_meta($nuevo_a, '_cod_canvas_document_id', true) === $doc_a);
$comprobar('post_content IDÉNTICO byte a byte (mismo sha256, mismo largo)', $nuevo_a !== null && $sha($contenido_de($nuevo_a)) === $hash_origen_a && strlen($contenido_de($nuevo_a)) === strlen($editado_a), $nuevo_a === null ? '' : 'largo ' . strlen($contenido_de($nuevo_a)) . ' vs ' . strlen($editado_a));
$comprobar('…y NO es el shortcode del lienzo', $nuevo_a !== null && strpos($contenido_de($nuevo_a), '[contope_canvas') === false);
$m_a = $dir_medios . '/ñandú@2x.png';
$m_b = $dir_medios . '/fondo-region.png';
$comprobar('los medios llegan con el mismo hash', is_file($m_a) && hash_file('sha256', $m_a) === $sha_a && is_file($m_b) && hash_file('sha256', $m_b) === $sha_b);
$reg = $repositorio->load_existing($doc_region);
$comprobar('la región llega con su tipo, su alcance y su HTML', is_array($reg) && $reg['regionKind'] === 'header' && $reg['regionScope'] === 'global' && strpos($reg['html'], 'fondo-region.png') !== false);
$id_b2 = $pagina_por_slug('zz-f1b-b');
$comprobar('la página del lienzo B vuelve como página del lienzo (shortcode)', $id_b2 !== null && $contenido_de($id_b2) === '[contope_canvas document_id="' . $doc_b . '"]');
$comprobar('el importador contó la página en bloques', !is_wp_error($ri) && (int) $ri['blockPages'] === 1 && (int) $ri['mediaCopied'] === 2, json_encode(is_wp_error($ri) ? null : [$ri['blockPages'], $ri['mediaCopied']]));
$rev1 = (int) get_post_meta((int) $nuevo_a, '_cod_content_revision', true);
$rj = $importador->import($zip1);
$comprobar('reimportar el mismo paquete no duplica la página ni cambia su contenido', !is_wp_error($rj) && $cantidad_por_slug('zz-f1b-a') === 1 && $sha($contenido_de((int) $pagina_por_slug('zz-f1b-a'))) === $hash_origen_a, $codigo($rj));
$comprobar('…y como no cambió nada, no sube la revisión de contenido', (int) get_post_meta((int) $pagina_por_slug('zz-f1b-a'), '_cod_content_revision', true) === $rev1);
$comprobar('…y los medios ya iguales no se vuelven a copiar', !is_wp_error($rj) && (int) $rj['mediaCopied'] === 0 && (int) $rj['mediaUnchanged'] === 2, json_encode(is_wp_error($rj) ? null : [$rj['mediaCopied'], $rj['mediaUnchanged']]));

// ---------------------------------------------------------------------------
echo "\n== 4. P1b.3 — una página en bloques con ediciones no se sobrescribe con el shortcode ==\n";
$vaciar_prueba();
// sitio donde A ya está en bloques, con ediciones DISTINTAS a las del paquete (nadie la importó nunca)
$propia = str_replace('EDITADO en Gutenberg', 'EDITADO AQUÍ, en este sitio', $editado_a);
$id_p = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'ZZ F1b A', 'post_name' => 'zz-f1b-a', 'post_content' => '', 'meta_input' => ['_cod_canvas_document_id' => $doc_a]], true);
$poner_contenido((int) $id_p, $propia);
$hash_propio = $sha($contenido_de((int) $id_p));
$comprobar('(preparación) la página A de este sitio está en bloques y es distinta de la del paquete', $hash_propio !== $hash_origen_a && $contenido_de((int) $id_p) === $propia);

$rr = $importador->import($zip1);
$comprobar('importar el paquete: RECHAZO con error explícito (cod_package_block_page_edited)', is_wp_error($rr) && $rr->get_error_code() === 'cod_package_block_page_edited', $codigo($rr));
$comprobar('…el mensaje nombra la página y dice que no se escribió nada', is_wp_error($rr) && strpos($rr->get_error_message(), 'zz-f1b-a') !== false && strpos($rr->get_error_message(), 'no se escribió nada') !== false);
$comprobar('…post_content INTACTO (mismo hash)', $sha($contenido_de((int) $id_p)) === $hash_propio);
$comprobar('…no quedó el shortcode', strpos($contenido_de((int) $id_p), '[contope_canvas') === false);
$comprobar('…y NADA más se escribió: ni la página B, ni la región, ni los documentos, ni los medios', $pagina_por_slug('zz-f1b-b') === null && !is_array($repositorio->load_existing($doc_region)) && !is_array($repositorio->load_existing($doc_b)) && !is_file($m_a) && !is_file($m_b));
$restos = glob($dir_medios . '/*.cod-part') ?: [];
$comprobar('…ni archivos temporales a medio copiar', $restos === []);

$rf = $importador->import($zip1, ['replace_edited_blocks' => true]);
$comprobar('CONTROL: con el reemplazo pedido expresamente, el mismo paquete SÍ pisa la página (el hash cambia)', !is_wp_error($rf) && $sha($contenido_de((int) $id_p)) === $hash_origen_a, $codigo($rf));
$comprobar('…y aun así jamás con el shortcode', strpos($contenido_de((int) $id_p), '[contope_canvas') === false);

// la página que nadie editó desde la última importación se actualiza sin pedir nada
$zip_v2 = $escribir_zip((function () use ($z1, $manifiesto1, $archivo_a, $editado_a): array {
    $archivos = $z1['contenidos'];
    $nuevo_texto = str_replace('Un bloque agregado a mano.', 'Un bloque agregado a mano, versión 2.', $editado_a);
    $archivos[$archivo_a['path']] = $nuevo_texto;
    $m = json_decode($archivos['manifest.json'], true);
    foreach ($m['files'] as $i => $f) {
        if ($f['path'] === $archivo_a['path']) {
            $m['files'][$i]['size'] = strlen($nuevo_texto);
            $m['files'][$i]['sha256'] = hash('sha256', $nuevo_texto);
        }
    }
    $archivos['manifest.json'] = json_encode($m, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $c = json_decode($archivos['content/pages.json'], true);
    foreach ($c['pages'] as $i => $pg) {
        if (($pg['content']['path'] ?? '') === $archivo_a['path']) {
            $c['pages'][$i]['content']['sha256'] = hash('sha256', $nuevo_texto);
        }
    }
    $json_c = json_encode($c, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $archivos['content/pages.json'] = $json_c;
    $m['files'] = array_map(static function (array $f) use ($json_c): array {
        if ($f['path'] === 'content/pages.json') {
            $f['size'] = strlen($json_c);
            $f['sha256'] = hash('sha256', $json_c);
        }
        return $f;
    }, $m['files']);
    $archivos['manifest.json'] = json_encode($m, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return $archivos;
})());
$rv2 = $importador->import($zip_v2);
$comprobar('una página que nadie tocó desde la última importación se actualiza sin pedir permiso', !is_wp_error($rv2) && strpos($contenido_de((int) $id_p), 'versión 2') !== false, $codigo($rv2));
// …y en cuanto alguien la edita aquí, vuelve a protegerse
$poner_contenido((int) $id_p, $contenido_de((int) $id_p) . "\n<!-- wp:paragraph --><p>editada después</p><!-- /wp:paragraph -->");
$hash_tras_edicion = $sha($contenido_de((int) $id_p));
$rv3 = $importador->import($zip1);
$comprobar('en cuanto se edita aquí, el siguiente import se rechaza otra vez y la deja intacta', is_wp_error($rv3) && $rv3->get_error_code() === 'cod_package_block_page_edited' && $sha($contenido_de((int) $id_p)) === $hash_tras_edicion, $codigo($rv3));

// el shortcode jamás pisa bloques: un paquete del esquema anterior (página del lienzo) sobre la página que ya es de bloques
$paquete_anterior = static function (array $paginas, array $documentos, string $origen = '') use ($escribir_zip): string {
    return $escribir_zip(['manifest.json' => (string) wp_json_encode([
        'schemaVersion' => COD_Site_Package_Exporter::PACKAGE_SCHEMA_VERSION,
        'sourceSiteUrl' => $origen !== '' ? $origen : home_url('/'),
        'pages' => $paginas,
        'documents' => $documentos,
    ])]);
};
$doc_vieja = ['title' => 'ZZ vieja', 'html' => '<section class="zz-v"><p>vieja</p></section>', 'css' => '.zz-v{display:block}', 'projectData' => '{}'];
$zip_vieja = $paquete_anterior([['documentId' => $doc_a, 'title' => 'ZZ F1b A', 'slug' => 'zz-f1b-a', 'status' => 'publish']], [$doc_a => $doc_vieja]);
$antes_vieja = $sha($contenido_de((int) $id_p));
$rs = $importador->import($zip_vieja);
$comprobar('un paquete que trae la página como página del lienzo sobre una página en bloques: RECHAZO (cod_package_would_revert_block_page)', is_wp_error($rs) && $rs->get_error_code() === 'cod_package_would_revert_block_page', $codigo($rs));
$comprobar('…y post_content queda intacto, sin shortcode', $sha($contenido_de((int) $id_p)) === $antes_vieja && strpos($contenido_de((int) $id_p), '[contope_canvas') === false);
$rs_forzado = $importador->import($zip_vieja, ['replace_edited_blocks' => true]);
$comprobar('…y ni siquiera pidiendo el reemplazo se escribe el shortcode sobre bloques', is_wp_error($rs_forzado) && $rs_forzado->get_error_code() === 'cod_package_would_revert_block_page' && strpos($contenido_de((int) $id_p), '[contope_canvas') === false, $codigo($rs_forzado));
$comprobar('…y el documento del paquete tampoco se escribió', !is_array($repositorio->load_existing($doc_a)) || (string) ($repositorio->load_existing($doc_a)['html'] ?? '') !== $doc_vieja['html']);
// control: la misma entrada sobre una página que SÍ es del lienzo se importa
$poner_contenido((int) $id_p, '[contope_canvas document_id="' . $doc_a . '"]');
$rs_ok = $importador->import($zip_vieja);
$comprobar('CONTROL: la misma entrada sobre una página del lienzo se importa y deja el shortcode', !is_wp_error($rs_ok) && $contenido_de((int) $id_p) === '[contope_canvas document_id="' . $doc_a . '"]', $codigo($rs_ok));

// la migración: dest es del lienzo, el paquete trae bloques
$rm = $importador->import($zip1);
$comprobar('migración: sobre una página del lienzo, el paquete en bloques la reemplaza por sus bloques (sin pedir permiso)', !is_wp_error($rm) && $sha($contenido_de((int) $id_p)) === $hash_origen_a, $codigo($rm));

// URL del origen distinta de la de este sitio: se reescribe (también escapada dentro de un JSON) y el resto queda igual
$origen = 'http://origen-ficticio.test';
$cuerpo_url = "<!-- wp:image {\"url\":\"http:\\/\\/origen-ficticio.test\\/wp-content\\/uploads\\/x.png\"} -->\n<figure class=\"wp-block-image\"><img src=\"http://origen-ficticio.test/wp-content/uploads/x.png\" alt=\"\"/></figure>\n<!-- /wp:image -->";
$pagina_url = ['kind' => 'blocks', 'title' => 'ZZ F1b URL', 'slug' => 'zz-f1b-url', 'status' => 'draft', 'documentId' => '', 'postContent' => $cuerpo_url];
$ru = $importador->import($paquete_anterior([$pagina_url], [], $origen));
$id_u = $pagina_por_slug('zz-f1b-url');
$esperado_u = str_replace(['http://origen-ficticio.test', 'http:\\/\\/origen-ficticio.test'], [untrailingslashit(home_url('/')), str_replace('/', '\\/', untrailingslashit(home_url('/')))], $cuerpo_url);
$comprobar('una página en bloques con la URL de otro sitio llega con la URL de éste (plana y escapada) y nada más cambiado', !is_wp_error($ru) && $id_u !== null && $contenido_de($id_u) === $esperado_u && strpos($contenido_de($id_u), 'origen-ficticio') === false, $codigo($ru));
$comprobar('…y queda en borrador, como decía el paquete', $id_u !== null && get_post_status($id_u) === 'draft');
$rn = $importador->import($paquete_anterior([['kind' => 'blocks', 'title' => 'ZZ F1b NoB', 'slug' => 'zz-f1b-nob', 'status' => 'draft', 'postContent' => '[contope_canvas document_id="x"]']], []));
$comprobar('una entrada "en bloques" cuyo contenido es un shortcode se rechaza (cod_package_page_not_blocks)', is_wp_error($rn) && $rn->get_error_code() === 'cod_package_page_not_blocks' && $pagina_por_slug('zz-f1b-nob') === null, $codigo($rn));

// ---------------------------------------------------------------------------
echo "\n== 5. los paquetes del esquema anterior se siguen importando ==\n";
$vaciar_prueba();
foreach (get_posts(['post_type' => 'page', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']) as $id) {
    if (strpos((string) get_post_field('post_name', $id), 'zz-f1b') === 0) {
        wp_delete_post((int) $id, true);
    }
}
$zip_vieja2 = $paquete_anterior([['documentId' => $doc_b, 'title' => 'ZZ F1b B', 'slug' => 'zz-f1b-b', 'status' => 'publish']], [$doc_b => ['title' => 'ZZ B', 'html' => '<section class="zz-b"><p>B vieja</p></section>', 'css' => '.zz-b{display:block}', 'projectData' => '{}']]);
$rv = $importador->import($zip_vieja2);
$id_bv = $pagina_por_slug('zz-f1b-b');
$comprobar('importar un paquete del esquema anterior: página del lienzo con su shortcode y su documento', !is_wp_error($rv) && $id_bv !== null && $contenido_de($id_bv) === '[contope_canvas document_id="' . $doc_b . '"]' && is_array($repositorio->load_existing($doc_b)), $codigo($rv));
$comprobar('…y lo reporta como del esquema anterior', !is_wp_error($rv) && ($rv['formato'] ?? '') === 'anterior' && (int) $rv['blockPages'] === 0);
$rv_mal = $importador->import($escribir_zip(['manifest.json' => '{"schemaVersion":9,"pages":[],"documents":[]}']));
$comprobar('una versión de esquema que no es la conocida se rechaza como antes', is_wp_error($rv_mal) && $rv_mal->get_error_code() === 'cod_package_schema_mismatch', $codigo($rv_mal));
$rv_sin = $importador->import($escribir_zip(['manifest.json' => '{"foo":1}']));
$comprobar('un manifiesto sin forma conocida se rechaza como antes', is_wp_error($rv_sin) && $rv_sin->get_error_code() === 'cod_package_manifest_shape', $codigo($rv_sin));

// ---------------------------------------------------------------------------
echo "\n== 6. el ZIP hostil y el paquete alterado ==\n";
$vaciar_prueba();
$r_ruta = $importador->import($escribir_zip(['manifest.json' => '{}', '../fuera.txt' => 'x']));
$comprobar('una entrada con ".." sale del paquete: rechazada antes de leer nada', is_wp_error($r_ruta) && $r_ruta->get_error_code() === 'cod_package_zip_unsafe_path', $codigo($r_ruta));
$r_abs = $importador->import($escribir_zip(['manifest.json' => '{}', '/etc/passwd' => 'x']));
$comprobar('una entrada con ruta absoluta: rechazada', is_wp_error($r_abs) && $r_abs->get_error_code() === 'cod_package_zip_unsafe_path', $codigo($r_abs));
$r_inv = $importador->import($escribir_zip(['manifest.json' => '{}', 'a\\b.txt' => 'x']));
$comprobar('una entrada con barra invertida: rechazada', is_wp_error($r_inv) && $r_inv->get_error_code() === 'cod_package_zip_unsafe_path', $codigo($r_inv));
$comprobar('CONTROL: sin la entrada hostil, el mismo manifiesto vacío llega al lector (y falla por su forma, no por el ZIP)', ($codigo($importador->import($escribir_zip(['manifest.json' => '{}'])))) === 'cod_package_manifest_shape');

$tocar_zip = static function (callable $f) use ($z1, $escribir_zip): string {
    return $escribir_zip($f($z1['contenidos']));
};
$r_pag = $importador->import($tocar_zip(static function (array $a) use ($archivo_a): array {
    $a[$archivo_a['path']] .= ' ';
    return $a;
}));
$comprobar('una página en bloques alterada (un espacio) no coincide con su sha256: se rechaza', is_wp_error($r_pag) && in_array($r_pag->get_error_code(), ['cod_package_hash_mismatch', 'cod_package_size_mismatch'], true), $codigo($r_pag));
$comprobar('…y no se escribió nada', $pagina_por_slug('zz-f1b-a') === null && !is_array($repositorio->load_existing($doc_region)));
// un medio con extensión ejecutable (el sha256 y el resto del paquete son legítimos: lo que se rechaza es el tipo)
$r_php = $importador->import($tocar_zip(static function (array $a): array {
    $c = json_decode($a['contenidos_pages'] ?? $a['content/pages.json'], true);
    $c['media'][0]['path'] = 'zz-f1b/puerta-trasera.php';
    $json_c = json_encode($c, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $a['content/pages.json'] = $json_c;
    $m = json_decode($a['manifest.json'], true);
    foreach ($m['files'] as $i => $f) {
        if ($f['path'] === 'content/pages.json') {
            $m['files'][$i]['size'] = strlen($json_c);
            $m['files'][$i]['sha256'] = hash('sha256', $json_c);
        }
    }
    $a['manifest.json'] = json_encode($m, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return $a;
}));
$comprobar('un medio con extensión ejecutable (.php) se rechaza antes de escribir nada (cod_package_media_path)', is_wp_error($r_php) && $r_php->get_error_code() === 'cod_package_media_path' && !is_file($dir_medios . '/puerta-trasera.php') && $pagina_por_slug('zz-f1b-a') === null, $codigo($r_php));
$comprobar('…y la misma regla vale para un paquete del esquema anterior (media/….php)', ($codigo($importador->import($escribir_zip(['manifest.json' => (string) wp_json_encode(['schemaVersion' => 1, 'sourceSiteUrl' => home_url('/'), 'pages' => [], 'documents' => []]), 'media/zz-f1b/otra.php' => '<?php echo 1;'])))) === 'cod_package_media_path' && !is_file($dir_medios . '/otra.php'));
$nombre_activo = $manifiesto1['assets'][0]['path'];
$r_med = $importador->import($tocar_zip(static function (array $a) use ($nombre_activo): array {
    $a[$nombre_activo] .= 'x';
    return $a;
}));
$comprobar('un medio alterado: se rechaza (cod_package_media_hash)', is_wp_error($r_med) && $r_med->get_error_code() === 'cod_package_media_hash', $codigo($r_med));
$comprobar('…y ningún medio ni página quedó escrito, ni temporal a medias', $pagina_por_slug('zz-f1b-a') === null && !is_file($m_a) && !is_file($m_b) && (glob($dir_medios . '/*') ?: []) === []);
$r_blk = $importador->import($tocar_zip(static function (array $a): array {
    $m = json_decode($a['manifest.json'], true);
    $m['capabilities']['requiredBlocks'][] = 'zz/bloque-que-no-existe';
    $a['manifest.json'] = json_encode($m, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return $a;
}));
$comprobar('un bloque requerido que este sitio no tiene: se rechaza con su nombre (cod_package_blocks_missing)', is_wp_error($r_blk) && $r_blk->get_error_code() === 'cod_package_blocks_missing' && strpos($r_blk->get_error_message(), 'zz/bloque-que-no-existe') !== false, $codigo($r_blk));
$r_cam = $importador->import($tocar_zip(static function (array $a): array {
    $m = json_decode($a['manifest.json'], true);
    $m['campoDesconocido'] = 1;
    $a['manifest.json'] = json_encode($m, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return $a;
}));
$comprobar('un campo desconocido en el manifiesto: se rechaza (cod_package_manifest_invalid, UNKNOWN_FIELD)', is_wp_error($r_cam) && $r_cam->get_error_code() === 'cod_package_manifest_invalid' && strpos($r_cam->get_error_message(), 'UNKNOWN_FIELD') !== false, $codigo($r_cam));
$r_req = $importador->import($tocar_zip(static function (array $a): array {
    $m = json_decode($a['manifest.json'], true);
    $m['requirements']['publisher'] = '99.0.0';
    $a['manifest.json'] = json_encode($m, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return $a;
}));
$comprobar('un paquete que pide un plugin más nuevo que el instalado: se rechaza (cod_package_requirements)', is_wp_error($r_req) && $r_req->get_error_code() === 'cod_package_requirements', $codigo($r_req));

// ---------------------------------------------------------------------------
echo "\n== 7. el ADN viaja en el paquete y vuelve igual ==\n";
$vaciar_prueba();
$modelo_json = adn_de_prueba(['designId' => 'zz-f1b-adn', 'revision' => 2]);
$previa = COD_ADN_Store::previsualizar($modelo_json);
$aplic = COD_ADN_Store::aplicar($modelo_json, ['previewId' => $previa['previewId'], 'fuente' => 'upload']);
$comprobar('(preparación) un ADN de prueba activo en el sitio de origen', !is_wp_error($aplic), is_wp_error($aplic) ? $aplic->get_error_code() . ': ' . $aplic->get_error_message() : '');
$digest_origen = (string) (COD_ADN_Store::puntero()['digest'] ?? '');
// una página en bloques para que el paquete tenga contenido
$id_adn_pag = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'ZZ F1b ADN', 'post_name' => 'zz-f1b-adn-pag', 'post_content' => '', 'meta_input' => ['_cod_canvas_document_id' => 'zz-f1b-adn-doc']], true);
$poner_contenido((int) $id_adn_pag, "<!-- wp:contope/lienzo -->\n<!-- wp:paragraph -->\n<p>Con ADN</p>\n<!-- /wp:paragraph -->\n<!-- /wp:contope/lienzo -->");
$zip_adn = $exportador->export(false);
$comprobar('exportar con ADN activo (solo estructura): sin error', !is_wp_error($zip_adn), is_wp_error($zip_adn) ? $zip_adn->get_error_code() . ': ' . $zip_adn->get_error_message() : '');
$temporales[] = is_wp_error($zip_adn) ? '' : $zip_adn;
$z_adn = $leer_zip($zip_adn);
$m_adn = json_decode($z_adn['contenidos']['manifest.json'], true);
$comprobar('el manifiesto apunta entrypoints.designModel a design/model.json con rol design-model', ($m_adn['entrypoints']['designModel'] ?? '') === 'design/model.json' && isset($z_adn['contenidos']['design/model.json']));
$comprobar('…y el manifiesto con ADN también pasa el esquema real', ($ajv($z_adn['contenidos']['manifest.json']))['ok'] === true);
$core_adn = $core($z_adn['contenidos']['design/model.json']);
$comprobar('design/model.json (envoltorio contope/design-model) lo acepta parsePortableDesignModel DEL CORE', $core_adn['ok'], $core_adn['salida']);
$modelo_exportado = json_decode($z_adn['contenidos']['design/model.json'], true);
$comprobar('…con el mismo diseño (id y revisión) que el activo', ($modelo_exportado['design']['id'] ?? '') === 'zz-f1b-adn' && ($modelo_exportado['design']['revision'] ?? 0) === 2);
$comprobar('"solo estructura": sin archivos de medios en el ZIP pero con la lista', !array_filter($z_adn['nombres'], static function (string $n): bool {
    return strpos($n, 'assets/') === 0;
}));

$borrar_adn();
$comprobar('(preparación) el sitio queda sin ADN', COD_ADN_Store::puntero() === null);
wp_delete_post((int) $id_adn_pag, true);
$r_adn = $importador->import($zip_adn);
$p_adn = COD_ADN_Store::puntero();
$comprobar('importar en un sitio sin ADN: queda activo el MISMO diseño, misma revisión y MISMO digest', !is_wp_error($r_adn) && $p_adn !== null && $p_adn['designId'] === 'zz-f1b-adn' && (int) $p_adn['revision'] === 2 && hash_equals($digest_origen, (string) $p_adn['digest']), is_wp_error($r_adn) ? $r_adn->get_error_code() . ': ' . $r_adn->get_error_message() : json_encode($p_adn));
$comprobar('…y la página en bloques llegó con él', $pagina_por_slug('zz-f1b-adn-pag') !== null);

// un ADN más viejo que el activo: el paquete entero se rechaza ANTES de escribir la página
$nuevo_modelo = adn_de_prueba(['designId' => 'zz-f1b-adn', 'revision' => 3, 'extras_color' => ['Prueba Z' => '#778899']]);
$previa3 = COD_ADN_Store::previsualizar($nuevo_modelo);
COD_ADN_Store::aplicar($nuevo_modelo, ['previewId' => $previa3['previewId'], 'fuente' => 'upload']);
wp_delete_post((int) $pagina_por_slug('zz-f1b-adn-pag'), true);
$r_viejo = $importador->import($zip_adn);
$comprobar('un paquete con un ADN más viejo que el activo se rechaza (ADN_REVISION_NOT_NEWER)', is_wp_error($r_viejo) && $r_viejo->get_error_code() === 'ADN_REVISION_NOT_NEWER', $codigo($r_viejo));
$comprobar('…y NO escribió la página (el ADN se revisa antes que nada)', $pagina_por_slug('zz-f1b-adn-pag') === null);
$comprobar('…ni tocó el ADN activo (sigue en r3)', (int) (COD_ADN_Store::puntero()['revision'] ?? 0) === 3);
$borrar_adn();

// ---------------------------------------------------------------------------
echo "\n== 8. la compuerta del diseño también cubre las páginas en bloques que llegan por un paquete ==\n";
$vaciar_prueba();
$modo_original = get_option(COD_ADN_Gate::OPTION_MODE, null);
$bloque_con_literal = "<!-- wp:paragraph {\"style\":{\"color\":{\"text\":\"#123456\"}}} -->\n<p class=\"has-text-color\" style=\"color:#123456\">literal</p>\n<!-- /wp:paragraph -->";
$zip_literal = $paquete_anterior([['kind' => 'blocks', 'title' => 'ZZ F1b Lit', 'slug' => 'zz-f1b-lit', 'status' => 'draft', 'postContent' => $bloque_con_literal]], []);
update_option(COD_ADN_Gate::OPTION_MODE, 'enforce', false);
COD_ADN_Gate::marcar_contrasena_de_aplicacion(true);
$r_lit = $importador->import($zip_literal);
$comprobar('enforce y petición no humana: una página en bloques con un literal de color se rechaza', is_wp_error($r_lit) && strpos($r_lit->get_error_code(), 'ADN_LITERAL_') === 0, $codigo($r_lit));
$comprobar('…y no se escribió', $pagina_por_slug('zz-f1b-lit') === null);
COD_ADN_Gate::marcar_contrasena_de_aplicacion(false);
$r_lit2 = $importador->import($zip_literal);
$comprobar('CONTROL: una persona en la administración (sin contraseña de aplicación) lo importa', !is_wp_error($r_lit2) && $pagina_por_slug('zz-f1b-lit') !== null, $codigo($r_lit2));
if ($modo_original === null) {
    delete_option(COD_ADN_Gate::OPTION_MODE);
} else {
    update_option(COD_ADN_Gate::OPTION_MODE, $modo_original, false);
}
COD_ADN_Gate::marcar_contrasena_de_aplicacion(false);

// ---------------------------------------------------------------------------
echo "\n== 9. P1b.4 — el estado del SITIO viaja: título, enlaces permanentes, logo, ícono, menús, íconos, hojas y destinos de región ==\n";
// El destino se deja de fábrica y se arma ahí un sitio con todo lo que un paquete tiene que llevar. Se exporta,
// se vacía (los números de página cambian: WordPress no reutiliza ids) y se importa: lo que apunte a un número
// del origen quedaría roto, y la prueba lo ve.
$vaciar_destino = static function () use ($PHP_LOCAL, $raiz, $wp_load): void {
    $salida = [];
    exec(escapeshellarg($PHP_LOCAL) . ' -c ' . escapeshellarg('C:/Users/Cristobal concha/wp-local/php/php.ini') . ' ' . escapeshellarg($raiz . '/scripts/paquete/vaciar-destino.php') . ' ' . escapeshellarg($wp_load) . ' 2>&1', $salida);
    wp_cache_flush();
};
$vaciar_destino();
$vaciar_prueba();

$hacer_png = static function (int $r, int $g, int $b): string {
    $im = imagecreatetruecolor(48, 48);
    imagefill($im, 0, 0, (int) imagecolorallocate($im, $r, $g, $b));
    ob_start();
    imagepng($im);
    return (string) ob_get_clean();
};
$sincronizador = new COD_Media_Attachment_Sync();
$adjunto = static function (string $nombre, string $bytes) use ($dir_medios, $sincronizador): int {
    wp_mkdir_p($dir_medios);
    file_put_contents($dir_medios . '/' . $nombre, $bytes);
    $id = $sincronizador->sync_file($dir_medios . '/' . $nombre);
    return is_wp_error($id) ? 0 : (int) $id;
};
$base_subidas = rtrim($upload['basedir'], '/\\');

// ---- el sitio de origen
$cat_vieja = get_term_by('slug', 'zz-f1b-cat', 'category');
if ($cat_vieja instanceof WP_Term) {
    wp_delete_term($cat_vieja->term_id, 'category');
}
$cat_id = (int) wp_insert_term('ZZ F1b Categoría', 'category', ['slug' => 'zz-f1b-cat'])['term_id'];
$contenido_nav_ref = static function (int $nav): string {
    return "<!-- wp:contope/lienzo -->\n<!-- wp:navigation {\"ref\":" . $nav . ",\"overlayMenu\":\"never\"} /-->\n<!-- /wp:contope/lienzo -->";
};
$crear_pagina = static function (string $slug, string $titulo, string $contenido) use ($poner_contenido): int {
    $id = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => $titulo, 'post_name' => $slug, 'post_content' => '[contope_canvas document_id="' . $slug . '"]', 'meta_input' => ['_cod_canvas_document_id' => $slug]], true);
    $poner_contenido((int) $id, $contenido);
    update_post_meta((int) $id, '_cod_content_revision', 1);
    return (int) $id;
};
$home = untrailingslashit((string) home_url('/'));
$id_p1 = $crear_pagina('zz-f1b-nav-inicio', 'ZZ Inicio', "<!-- wp:contope/lienzo -->\n<!-- wp:paragraph -->\n<p>Inicio</p>\n<!-- /wp:paragraph -->\n<!-- /wp:contope/lienzo -->");
$id_p2 = $crear_pagina('zz-f1b-nav-contacto', 'ZZ Contacto', "<!-- wp:contope/lienzo -->\n<!-- wp:paragraph -->\n<p>Contacto</p>\n<!-- /wp:paragraph -->\n<!-- /wp:contope/lienzo -->");
$contenido_navegacion = "<!-- wp:navigation-link {\"label\":\"Inicio\",\"type\":\"page\",\"id\":" . $id_p1 . ",\"url\":\"" . $home . "/zz-f1b-nav-inicio/\",\"kind\":\"post-type\",\"isTopLevelLink\":true} /-->\n"
    . "<!-- wp:navigation-submenu {\"label\":\"Más\",\"type\":\"page\",\"id\":" . $id_p2 . ",\"url\":\"" . $home . "/zz-f1b-nav-contacto/\",\"kind\":\"post-type\",\"isTopLevelLink\":true} -->\n"
    . "<!-- wp:navigation-link {\"label\":\"Categoría\",\"type\":\"category\",\"id\":" . $cat_id . ",\"url\":\"" . $home . "/category/zz-f1b-cat/\",\"kind\":\"taxonomy\"} /-->\n"
    . "<!-- /wp:navigation-submenu -->\n"
    . "<!-- wp:navigation-link {\"label\":\"Externo\",\"url\":\"https://example.org/zz\",\"kind\":\"custom\",\"isTopLevelLink\":true} /-->";
$nav_id = (int) wp_insert_post(['post_type' => 'wp_navigation', 'post_status' => 'publish', 'post_title' => 'ZZ Navegación principal', 'post_name' => 'zz-f1b-navegacion', 'post_content' => $contenido_navegacion]);
$id_p3 = $crear_pagina('zz-f1b-nav-citante', 'ZZ Citante', $contenido_nav_ref($nav_id));

$menu_id = (int) wp_create_nav_menu('ZZ Menú clásico');
wp_update_term($menu_id, 'nav_menu', ['slug' => 'zz-f1b-menu']);
$item1 = (int) wp_update_nav_menu_item($menu_id, 0, ['menu-item-title' => 'Inicio & más', 'menu-item-type' => 'post_type', 'menu-item-object' => 'page', 'menu-item-object-id' => $id_p1, 'menu-item-status' => 'publish', 'menu-item-position' => 1, 'menu-item-classes' => 'zz-clase otra']);
wp_update_nav_menu_item($menu_id, 0, ['menu-item-title' => 'Contacto', 'menu-item-type' => 'post_type', 'menu-item-object' => 'page', 'menu-item-object-id' => $id_p2, 'menu-item-parent-id' => $item1, 'menu-item-status' => 'publish', 'menu-item-position' => 2, 'menu-item-target' => '_blank']);
wp_update_nav_menu_item($menu_id, 0, ['menu-item-title' => 'Temas', 'menu-item-type' => 'taxonomy', 'menu-item-object' => 'category', 'menu-item-object-id' => $cat_id, 'menu-item-status' => 'publish', 'menu-item-position' => 3]);
wp_update_nav_menu_item($menu_id, 0, ['menu-item-title' => 'Afuera', 'menu-item-type' => 'custom', 'menu-item-url' => 'https://example.org/afuera?x=1', 'menu-item-status' => 'publish', 'menu-item-position' => 4]);
set_theme_mod('nav_menu_locations', ['primary' => $menu_id, 'footer' => $menu_id]);

update_option('blogname', 'ZZ Título & prueba');
update_option('blogdescription', 'ZZ descripción del sitio');
global $wp_rewrite;
$wp_rewrite->set_permalink_structure('/%postname%/');
$wp_rewrite->set_category_base('temas-zz');

$adj_icono = $adjunto('zz-icono.png', $hacer_png(200, 30, 30));
$adj_logo_sitio = $adjunto('zz-logo-sitio.png', $hacer_png(30, 200, 30));
$adj_logo_tema = $adjunto('zz-logo-tema.png', $hacer_png(30, 30, 200));
update_option('site_icon', $adj_icono);
set_theme_mod('custom_logo', $adj_logo_tema);
update_option('site_logo', $adj_logo_sitio); // WordPress sincroniza custom_logo y site_logo: quedan los dos en este último
$comprobar('(preparación) tres adjuntos distintos para ícono, logo del sitio y logo del tema', $adj_icono > 0 && $adj_logo_sitio > 0 && $adj_logo_tema > 0 && count(array_unique([$adj_icono, $adj_logo_sitio, $adj_logo_tema])) === 3);

$carpeta_iconos = $base_subidas . '/contope-iconos';
wp_mkdir_p($carpeta_iconos);
$svg = static function (string $trazo): string {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="' . $trazo . '"/></svg>';
};
file_put_contents($carpeta_iconos . '/icono-zzf1b-outlined.svg', $svg('M1 1h22v22H1z'));
file_put_contents($carpeta_iconos . '/icono-zzf1b-rounded.svg', $svg('M2 2h20v20H2z'));
file_put_contents($carpeta_iconos . '/icono-red-zzf1b.svg', $svg('M3 3h18v18H3z'));
update_option('cod_icono_estilo', 'rounded');

$diseno_zz = 'zz-f1b-diseno';
$doc_con_diseno = 'zz-f1b-region-diseno';
$repositorio->save($doc_con_diseno, '{}', '<header class="zz-d"><p>Con diseño</p></header>', '.zz-d{display:block}');
$post_diseno = (int) ($repositorio->load_existing($doc_con_diseno)['postId'] ?? 0);
update_post_meta($post_diseno, COD_Canvas_Document_Repository::META_COMPOSITION, wp_slash(json_encode(['composition' => ['nodes' => []], 'design' => ['designId' => $diseno_zz]])));
$repositorio->save_region($doc_con_diseno, 'footer', 'global', []);
$carpeta_hojas = $base_subidas . '/contope-disenos';
wp_mkdir_p($carpeta_hojas);
file_put_contents($carpeta_hojas . '/' . $diseno_zz . '-0123456789ab.css', '.zz-d{display:block}' . "\n");
update_option('cod_disenos_hojas', [$diseno_zz => ['archivo' => $diseno_zz . '-0123456789ab.css', 'sello' => '0123456789ab']], false);

$doc_local = 'zz-f1b-region-local';
$repositorio->save($doc_local, '{}', '<header class="zz-l"><p>Local</p></header>', '.zz-l{display:block}');
$repositorio->save_region($doc_local, 'header', 'local', [['type' => 'post', 'id' => $id_p1], ['type' => 'category', 'id' => $cat_id]], [['type' => 'children_of', 'id' => $id_p2]]);

// ---- qué se ve del sitio, en forma portable y comparable entre dos sitios
$foto_del_sitio = static function () use ($repositorio): array {
    $avisos = [];
    $documentos = [];
    foreach ($repositorio->list_region_documents() as $d) {
        $documentos[(string) $d['documentId']] = $d;
    }
    $documentos = COD_Site_Package_Sitio::documentos_portables($documentos, $avisos);
    $captura = COD_Site_Package_Sitio::capturar($documentos, $avisos);
    $reglas = [];
    foreach ($documentos as $id => $d) {
        $reglas[(string) $id] = [$d['regionTargets'], $d['regionExcludes']];
    }
    $archivos = [];
    foreach ($captura['medios'] as $ruta => $m) {
        $archivos[$ruta] = hash_file('sha256', $m['abs']);
    }
    ksort($archivos);
    ksort($reglas);
    // los números de WordPress no se comparan: se comparan las identidades
    return ['estado' => $captura['estado'], 'reglas' => $reglas, 'archivos' => $archivos];
};
/** Qué secciones del sitio no son iguales (vacío = el destino es igual al origen). */
$diferencias = static function (array $origen, array $destino): array {
    $mal = [];
    foreach ($origen['estado'] as $seccion => $valor) {
        if (json_encode($valor) !== json_encode($destino['estado'][$seccion] ?? null)) {
            $mal[] = $seccion;
        }
    }
    foreach (['reglas', 'archivos'] as $seccion) {
        if (json_encode($origen[$seccion]) !== json_encode($destino[$seccion])) {
            $mal[] = $seccion;
        }
    }
    return $mal;
};
$foto_origen = $foto_del_sitio();
$ids_origen = ['p1' => $id_p1, 'p2' => $id_p2, 'p3' => $id_p3, 'nav' => $nav_id, 'cat' => $cat_id];
$comprobar('(preparación) la foto del origen trae menús, navegación, marca, íconos, hojas y reglas', count($foto_origen['estado']['menus']) === 1 && count($foto_origen['estado']['navigation']) === 1 && $foto_origen['estado']['branding']['siteIcon'] !== null && $foto_origen['estado']['branding']['customLogo'] !== null && $foto_origen['estado']['iconSet']['files'] === 3 && isset($foto_origen['estado']['designSheets'][$diseno_zz]) && isset($foto_origen['reglas'][$doc_local]), json_encode(array_keys($foto_origen['estado'])));

// ---- exportar
$zip9 = $exportador->export(true);
$comprobar('exportar el sitio con menús, marca, íconos y hojas: sin error', !is_wp_error($zip9), is_wp_error($zip9) ? $zip9->get_error_code() . ': ' . $zip9->get_error_message() : '');
if (is_wp_error($zip9)) {
    echo "\n  No se puede seguir sin paquete.\n";
    exit(1);
}
$temporales[] = $zip9;
$z9 = $leer_zip($zip9);
$manifiesto9 = json_decode($z9['contenidos']['manifest.json'], true);
$comprobar('el manifiesto del paquete lo valida el lector del plugin y el esquema real (Ajv)', COD_Site_Package_Format::validar_manifiesto($manifiesto9) === [] && $ajv($z9['contenidos']['manifest.json'])['ok'] === true);
$estado9 = json_decode($z9['contenidos']['wordpress/state.json'], true);
$comprobar('state.json trae las secciones del sitio (versión 2)', ($estado9['version'] ?? 0) === 2 && isset($estado9['site'], $estado9['branding'], $estado9['navigation'], $estado9['menus'], $estado9['menuLocations'], $estado9['iconSet'], $estado9['designSheets']));
$documentos9 = json_decode($z9['contenidos']['content/pages.json'], true)['documents'];
$portable = $estado9['navigation'][0]['content'] . "
" . json_encode($estado9['menus']) . "
" . json_encode([$documentos9[$doc_local]['regionTargets'], $documentos9[$doc_local]['regionExcludes']]);
$numeros_viajan = [];
foreach ([$id_p1 => 'p1', $id_p2 => 'p2', $cat_id => 'cat'] as $numero => $nombre) {
    if (preg_match('/"(id|object_id)":' . $numero . '(?!\d)/', $portable) === 1) {
        $numeros_viajan[] = $nombre . '=' . $numero;
    }
}
$comprobar('(piso) lo portable sí trae las referencias por nombre (ocdRef, ref/slug)', strpos($portable, 'ocdRef') !== false && strpos($portable, '"slug":"zz-f1b-nav-inicio"') !== false && strpos($portable, '"slug":"zz-f1b-cat"') !== false);
$comprobar('NINGÚN número de página ni de categoría viaja en menús, navegación ni destinos de región', $numeros_viajan === [], implode(', ', $numeros_viajan));
$pagina_citante = null;
foreach (json_decode($z9['contenidos']['content/pages.json'], true)['pages'] as $pg) {
    if ($pg['slug'] === 'zz-f1b-nav-citante') {
        $pagina_citante = (string) $z9['contenidos'][$pg['content']['path']];
    }
}
$comprobar('…ni el número de la navegación citada por una página (viaja por slug)', $pagina_citante !== null && strpos($pagina_citante, '"ocdNavRef":"zz-f1b-navegacion"') !== false && strpos($pagina_citante, '"ref":' . $nav_id) === false, (string) $pagina_citante);
$comprobar('el set de íconos y la hoja viajan como archivos sueltos (sin adjunto)', count(array_filter($manifiesto9['assets'], static function (array $a): bool {
    return $a['mime'] === 'image/svg+xml' || $a['mime'] === 'text/css';
})) >= 4);

// ---- importar en el sitio vaciado: los números de página son otros
$vaciar_destino();
$vaciar_prueba();
foreach (['wp_navigation', 'nav_menu_item'] as $tipo) {
    $comprobar('(preparación) el destino quedó sin ' . $tipo, get_posts(['post_type' => $tipo, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']) === []);
}
$comprobar('(preparación) el título del destino volvió a ser el de fábrica', get_option('blogname') === 'WordPress' && get_option('permalink_structure') === '' && (int) get_option('site_icon') === 0);
$r9 = $importador->import($zip9);
$comprobar('importar el paquete en el destino vaciado: sin error', !is_wp_error($r9), is_wp_error($r9) ? $r9->get_error_code() . ': ' . $r9->get_error_message() : '');
if (is_wp_error($r9)) {
    echo "\n  No se puede seguir sin importar.\n";
    exit(1);
}
$foto_destino = $foto_del_sitio();
$mal = $diferencias($foto_origen, $foto_destino);
$comprobar('el destino es IGUAL al origen: ajustes, marca, navegación, menús, ubicaciones, íconos, hojas y destinos de región', $mal === [], 'distintos: ' . implode(', ', $mal));
$p1 = $pagina_por_slug('zz-f1b-nav-inicio');
$p2 = $pagina_por_slug('zz-f1b-nav-contacto');
$p3 = $pagina_por_slug('zz-f1b-nav-citante');
$comprobar('…y los números de página CAMBIARON (si no, la prueba no mediría el remapeo)', $p1 !== null && $p2 !== null && $p1 !== $id_p1 && $p2 !== $id_p2 && $p3 !== $id_p3, json_encode([$id_p1, $p1, $id_p2, $p2]));
$term_menu = get_term_by('slug', 'zz-f1b-menu', 'nav_menu');
$items_destino = $term_menu instanceof WP_Term ? wp_get_nav_menu_items($term_menu->term_id) : [];
$objetos = [];
foreach ((array) $items_destino as $it) {
    $objetos[html_entity_decode((string) $it->title)] = (int) $it->object_id;
}
$comprobar('los enlaces del menú clásico apuntan a las páginas y a la categoría DEL DESTINO', ($objetos['Inicio & más'] ?? 0) === $p1 && ($objetos['Contacto'] ?? 0) === $p2 && ($objetos['Temas'] ?? 0) === (int) (get_term_by('slug', 'zz-f1b-cat', 'category')->term_id ?? -1), json_encode($objetos));
$comprobar('…con su jerarquía, destino de apertura y clases', count($items_destino) === 4 && (int) $items_destino[1]->menu_item_parent === (int) $items_destino[0]->ID && $items_destino[1]->target === '_blank' && in_array('zz-clase', (array) $items_destino[0]->classes, true));
$ubicaciones_destino = get_nav_menu_locations();
$comprobar('las ubicaciones del menú (primary, footer) apuntan al menú del destino', term_exists((int) ($ubicaciones_destino['primary'] ?? 0), 'nav_menu') !== null && (int) ($ubicaciones_destino['primary'] ?? 0) === (int) ($term_menu->term_id ?? -1) && (int) ($ubicaciones_destino['footer'] ?? 0) === (int) ($term_menu->term_id ?? -1), json_encode($ubicaciones_destino));
$nav_post = get_posts(['post_type' => 'wp_navigation', 'name' => 'zz-f1b-navegacion', 'post_status' => 'any', 'numberposts' => 1])[0] ?? null;
$cont_nav = $nav_post instanceof WP_Post ? (string) $nav_post->post_content : '';
$comprobar('la navegación de bloques enlaza a las páginas del destino (id y ref nuevos, ninguno del origen)', $nav_post instanceof WP_Post && strpos($cont_nav, '"id":' . $p1) !== false && strpos($cont_nav, '"id":' . $p2) !== false && strpos($cont_nav, '"id":' . $id_p1) === false && strpos($cont_nav, 'ocdRef') === false, $cont_nav);
$comprobar('…y la página que la cita apunta a la navegación del destino', $p3 !== null && $nav_post instanceof WP_Post && strpos($contenido_de($p3), '"ref":' . $nav_post->ID) !== false && strpos($contenido_de($p3), 'ocdNavRef') === false, $p3 !== null ? $contenido_de($p3) : 'sin página');
$cat_dest = (int) (get_term_by('slug', 'zz-f1b-cat', 'category')->term_id ?? 0);
$reglas_dest = $repositorio->load_existing($doc_local);
$comprobar('los destinos de la región local son las páginas y la categoría DEL DESTINO', is_array($reglas_dest) && $reglas_dest['regionTargets'] === [['type' => 'post', 'id' => $p1], ['type' => 'category', 'id' => $cat_dest]] && $reglas_dest['regionExcludes'] === [['type' => 'children_of', 'id' => $p2]], json_encode(is_array($reglas_dest) ? [$reglas_dest['regionTargets'], $reglas_dest['regionExcludes']] : $reglas_dest));
$comprobar('el título, la descripción y los enlaces permanentes quedaron igual (y las reglas de enlace se regeneraron)', get_option('blogname') === 'ZZ Título &amp; prueba' || get_option('blogname') === 'ZZ Título & prueba', (string) get_option('blogname'));
$comprobar('…enlaces permanentes y base de categorías', get_option('permalink_structure') === '/%postname%/' && get_option('category_base') === 'temas-zz', (string) get_option('permalink_structure') . ' ' . (string) get_option('category_base'));
$sha_origen_marca = [$foto_origen['archivos'][$foto_origen['estado']['branding']['siteIcon']['path']] ?? '', $foto_origen['archivos'][$foto_origen['estado']['branding']['siteLogo']['path']] ?? '', $foto_origen['archivos'][$foto_origen['estado']['branding']['customLogo']['path']] ?? ''];
$sha_destino_marca = [];
foreach ([(int) get_option('site_icon'), (int) get_option('site_logo'), (int) get_theme_mod('custom_logo')] as $adjunto_id) {
    $archivo_destino = get_attached_file($adjunto_id);
    $sha_destino_marca[] = is_string($archivo_destino) && is_file($archivo_destino) ? hash_file('sha256', $archivo_destino) : 'sin archivo (adjunto ' . $adjunto_id . ')';
}
// (WordPress mantiene site_logo y custom_logo en el mismo valor: hay dos archivos distintos, ícono y logo)
$comprobar('el ícono y los dos logos son los MISMOS ARCHIVOS (sha256) en adjuntos del destino', $sha_origen_marca === $sha_destino_marca && !in_array('', $sha_origen_marca, true) && count(array_unique($sha_destino_marca)) === 2, json_encode([$sha_origen_marca, $sha_destino_marca]));
$comprobar('…y el estilo de íconos, el set (3 archivos, sin adjuntos) y la hoja de diseño llegaron', get_option('cod_icono_estilo') === 'rounded' && count(glob($base_subidas . '/contope-iconos/*.svg') ?: []) === 3 && is_file($base_subidas . '/contope-disenos/' . $diseno_zz . '-0123456789ab.css') && (get_option('cod_disenos_hojas')[$diseno_zz]['archivo'] ?? '') === $diseno_zz . '-0123456789ab.css' && get_posts(['post_type' => 'attachment', 'post_status' => 'inherit', 'numberposts' => -1, 'fields' => 'ids', 'meta_key' => '_wp_attached_file', 'meta_value' => 'contope-iconos/icono-zzf1b-outlined.svg']) === []);
$comprobar('…y la composición del documento viajó: el destino sabe de qué diseño es (de ahí sale su hoja)', (json_decode((string) ($repositorio->load_existing($doc_con_diseno)['composition'] ?? ''), true)['design']['designId'] ?? '') === $diseno_zz);

// ---- idempotencia: reimportar no duplica nada
$cuentas = static function (): array {
    $c = [];
    foreach (['page', 'wp_navigation', 'nav_menu_item', 'attachment', 'cod_canvas_doc'] as $tipo) {
        $c[$tipo] = count(get_posts(['post_type' => $tipo, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids', 'no_found_rows' => true]));
    }
    $c['menus'] = count(wp_get_nav_menus());
    $c['ids_menu'] = array_map(static function ($i): int {
        return (int) $i->ID;
    }, (array) wp_get_nav_menu_items((int) (get_term_by('slug', 'zz-f1b-menu', 'nav_menu')->term_id ?? 0)));
    return $c;
};
$cuentas1 = $cuentas();
$r9b = $importador->import($zip9);
$cuentas2 = $cuentas();
$comprobar('reimportar el mismo paquete: sin error, sin menús, navegaciones, adjuntos ni páginas de más', !is_wp_error($r9b) && $cuentas1 === $cuentas2, is_wp_error($r9b) ? $codigo($r9b) : json_encode([$cuentas1, $cuentas2]));
$comprobar('…los archivos no se vuelven a copiar y el destino sigue igual al origen', !is_wp_error($r9b) && (int) $r9b['mediaCopied'] === 0 && $diferencias($foto_origen, $foto_del_sitio()) === [], is_wp_error($r9b) ? '' : (string) $r9b['mediaCopied']);

// ---- no se pisa lo editado en el destino (el mismo mecanismo que H9)
update_option('blogname', 'Título editado en producción');
$ed_item = (int) $items_destino[3]->ID;
wp_update_nav_menu_item((int) $term_menu->term_id, $ed_item, ['menu-item-title' => 'Afuera EDITADO', 'menu-item-type' => 'custom', 'menu-item-url' => 'https://example.org/afuera?x=1', 'menu-item-status' => 'publish', 'menu-item-position' => 4]);
$antes_ed = [get_option('blogname'), json_encode($cuentas()['ids_menu'])];
$r9c = $importador->import($zip9);
$comprobar('un título y un menú editados en el destino rechazan el paquete entero (cod_package_settings_edited)', is_wp_error($r9c) && $r9c->get_error_code() === 'cod_package_settings_edited', $codigo($r9c));
$comprobar('…con los nombres de lo editado en el mensaje', is_wp_error($r9c) && strpos($r9c->get_error_message(), 'el título del sitio') !== false && strpos($r9c->get_error_message(), 'zz-f1b-menu') !== false && strpos($r9c->get_error_message(), 'no se escribió nada') !== false, is_wp_error($r9c) ? $r9c->get_error_message() : '');
$comprobar('…y no se escribió NADA: el título y el menú siguen como los dejó el destino', [get_option('blogname'), json_encode($cuentas()['ids_menu'])] === $antes_ed && (string) get_post_field('post_title', $ed_item) === 'Afuera EDITADO');
$r9d = $importador->import($zip9, ['replace_edited_blocks' => true]);
$comprobar('CONTROL: con el reemplazo expreso el mismo paquete entra', !is_wp_error($r9d) && $diferencias($foto_origen, $foto_del_sitio()) === [], $codigo($r9d));

// ---- el paquete "solo estructura" (se exporta ahora, mientras el sitio está armado; se importa al final)
$zip_liviano = $exportador->export(false);
$comprobar('exportar solo estructura con estado del sitio: sin error', !is_wp_error($zip_liviano));
if (!is_wp_error($zip_liviano)) {
    $temporales[] = $zip_liviano;
}

// ---- controles: si el transporte se rompe, la prueba lo ve
/** Rehace un paquete cambiando state.json (y la entrada del manifiesto que lo cuenta). */
$reempaquetar = static function (string $origen, callable $cambiar_estado, ?callable $cambiar_contenido = null) use ($tmp): string {
    $z = new ZipArchive();
    $z->open($origen);
    $archivos = [];
    for ($i = 0; $i < $z->numFiles; $i++) {
        $archivos[(string) $z->getNameIndex($i)] = (string) $z->getFromIndex($i);
    }
    $z->close();
    $manifiesto = json_decode($archivos['manifest.json'], true);
    $tocar = static function (string $ruta, callable $f) use (&$archivos, &$manifiesto): void {
        $dato = json_decode($archivos[$ruta], true);
        $nuevo = (string) json_encode($f($dato), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $archivos[$ruta] = $nuevo;
        foreach ($manifiesto['files'] as $i => $fila) {
            if ($fila['path'] === $ruta) {
                $manifiesto['files'][$i]['size'] = strlen($nuevo);
                $manifiesto['files'][$i]['sha256'] = hash('sha256', $nuevo);
            }
        }
    };
    $tocar('wordpress/state.json', $cambiar_estado);
    if ($cambiar_contenido !== null) {
        $tocar('content/pages.json', $cambiar_contenido);
    }
    $archivos['manifest.json'] = (string) json_encode($manifiesto, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $ruta = $tmp();
    $nuevo = new ZipArchive();
    $nuevo->open($ruta, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    foreach ($archivos as $nombre => $contenido) {
        $nuevo->addFromString($nombre, $contenido);
    }
    $nuevo->close();
    return $ruta;
};
$importar_en_vacio = static function (string $zip) use ($vaciar_destino, $vaciar_prueba, $importador): array {
    $vaciar_destino();
    $vaciar_prueba();
    return [$importador->import($zip)];
};

$roto_menus = $reempaquetar($zip9, static function (array $e): array {
    unset($e['menus'], $e['navigation'], $e['menuLocations']);
    return $e;
});
[$rm] = $importar_en_vacio($roto_menus);
$mal_menus = !is_wp_error($rm) ? $diferencias($foto_origen, $foto_del_sitio()) : ['no importó'];
$comprobar('CONTROL: sin el transporte de menús el destino NO sale igual y el instrumento lo dice (menus, navigation, ubicaciones)', in_array('menus', $mal_menus, true) && in_array('navigation', $mal_menus, true) && in_array('menuLocations', $mal_menus, true), implode(', ', $mal_menus));

$roto_marca = $reempaquetar($zip9, static function (array $e): array {
    $e['branding'] = ['siteIcon' => null, 'siteLogo' => null, 'customLogo' => null];
    return $e;
});
[$rb] = $importar_en_vacio($roto_marca);
$mal_marca = !is_wp_error($rb) ? $diferencias($foto_origen, $foto_del_sitio()) : ['no importó'];
$comprobar('CONTROL: sin el transporte de logo e ícono el destino NO sale igual (branding)', in_array('branding', $mal_marca, true), implode(', ', $mal_marca));

$roto_regiones = $reempaquetar($zip9, static function (array $e): array {
    return $e;
}, static function (array $c) use ($doc_local, $ids_origen): array {
    // el defecto de antes: los destinos de la región viajan POR NÚMERO del origen
    $c['documents'][$doc_local]['regionTargets'] = [['type' => 'post', 'id' => $ids_origen['p1']], ['type' => 'category', 'id' => $ids_origen['cat']]];
    $c['documents'][$doc_local]['regionExcludes'] = [['type' => 'children_of', 'id' => $ids_origen['p2']]];
    return $c;
});
[$rr] = $importar_en_vacio($roto_regiones);
$mal_regiones = !is_wp_error($rr) ? $diferencias($foto_origen, $foto_del_sitio()) : ['no importó'];
$comprobar('CONTROL: con los destinos de región por número del origen, el destino queda apuntando a otras páginas y el instrumento lo ve (reglas)', in_array('reglas', $mal_regiones, true), implode(', ', $mal_regiones));

$roto_iconos = $reempaquetar($zip9, static function (array $e): array {
    $e['iconSet'] = ['style' => '', 'files' => 0];
    $e['designSheets'] = [];
    return $e;
});
[$ri] = $importar_en_vacio($roto_iconos);
$mal_iconos = !is_wp_error($ri) ? $diferencias($foto_origen, $foto_del_sitio()) : ['no importó'];
$comprobar('CONTROL: sin el estilo de íconos ni las hojas el destino NO sale igual (iconSet, designSheets)', in_array('iconSet', $mal_iconos, true) && in_array('designSheets', $mal_iconos, true), implode(', ', $mal_iconos));

// ---- lo inválido se rechaza ANTES de escribir
$vaciar_destino();
$vaciar_prueba();
$sin_resolver = $reempaquetar($zip9, static function (array $e): array {
    return $e;
}, static function (array $c) use ($doc_local): array {
    $c['documents'][$doc_local]['regionTargets'] = [['type' => 'post', 'ref' => ['postType' => 'page', 'slug' => 'una-pagina-que-no-existe-en-ningun-lado']]];
    return $c;
});
$estado_antes = [get_option('blogname'), count(get_posts(['post_type' => 'page', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']))];
$rs = $importador->import($sin_resolver);
$comprobar('un destino de región que ni el paquete ni el sitio tienen rechaza el paquete (cod_package_region_target_unresolved)', is_wp_error($rs) && $rs->get_error_code() === 'cod_package_region_target_unresolved', $codigo($rs));
$comprobar('…sin escribir nada (ni el título, ni las páginas)', [get_option('blogname'), count(get_posts(['post_type' => 'page', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']))] === $estado_antes);
$estado_malo = $reempaquetar($zip9, static function (array $e): array {
    $e['menus'][0]['items'][0]['type'] = 'tipo-inventado';
    return $e;
});
$rm2 = $importador->import($estado_malo);
$comprobar('un menú con un tipo de enlace inventado rechaza el paquete (cod_package_site_shape) y no escribe nada', is_wp_error($rm2) && $rm2->get_error_code() === 'cod_package_site_shape' && get_option('blogname') === $estado_antes[0], $codigo($rm2));
$ruta_mala = $reempaquetar($zip9, static function (array $e): array {
    $e['branding']['siteIcon']['path'] = '../../wp-config.php';
    return $e;
});
$rp = $importador->import($ruta_mala);
$comprobar('un ícono con una ruta que sale de uploads rechaza el paquete', is_wp_error($rp) && $rp->get_error_code() === 'cod_package_site_shape', $codigo($rp));

// ---- el paquete "solo estructura" sigue entrando (los archivos que faltan no son un error)
if (!is_wp_error($zip_liviano)) {
    $vaciar_destino();
    $vaciar_prueba();
    $rl = $importador->import($zip_liviano);
    $comprobar('…y se importa sin error aunque no traiga los archivos (avisa de los que faltan)', !is_wp_error($rl), $codigo($rl));
}

$vaciar_destino();
$vaciar_prueba();
foreach (['zz-f1b-cat'] as $slug_termino) {
    $termino = get_term_by('slug', $slug_termino, 'category');
    if ($termino instanceof WP_Term) {
        wp_delete_term($termino->term_id, 'category');
    }
}

// ---------------------------------------------------------------------------
echo "\n== resultado ==\n";
$vaciar_prueba();
echo ($fallas === 0 ? "  TODO OK ($ejecutadas comprobaciones)\n" : "  $fallas falla(s) de $ejecutadas\n");
exit($fallas === 0 ? 0 : 1);
