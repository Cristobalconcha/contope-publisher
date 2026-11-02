<?php
/**
 * P1.2, P1.3, P1.5, P1.7, P1.9 (ESPEC-adn-unica-puerta-y-bloques, F1): el almacén del ADN, el
 * puntero único y la integridad referencial, contra el WordPress LOCAL de Basis (puerto 8894).
 *
 * Nunca contra Santa Luisa, Econut ni producción. Si el local ya tiene un ADN activo, la prueba
 * se NIEGA a correr (no pisa lo de nadie). Al terminar borra todo lo que creó (revisiones,
 * proyecciones, puntero, documentos y archivos temporales) y restaura el modo de la compuerta.
 *
 * Esta prueba puede fallar de verdad: cada comprobación de "no pasó nada" tiene su CONTROL (la
 * misma operación sin la falla inyectada, que sí debe cambiar lo observado), y el instrumento
 * que mira lo servido demuestra que ve un cambio.
 *
 * Antes de correrla: sincronizar el plugin del repo al local (la prueba lo exige):
 *   robocopy contope-publisher <local>\wp-content\plugins\contope-publisher /MIR /XD node_modules .git
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';
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

global $wpdb;
$raiz = realpath(__DIR__ . '/..');
$PHP_LOCAL = 'C:/Users/Cristobal concha/wp-local/php/php.exe';

// ---------------------------------------------------------------------------
echo "\n== 0. precondiciones ==\n";
$repo_dir = realpath($raiz . '/contope-publisher');
$inst_dir = rtrim((string) COD_PUBLISHER_DIR, '/\\');
$desiguales = [];
foreach (array_merge(glob($repo_dir . '/includes/class-cod-adn-*.php') ?: [], [$repo_dir . '/includes/class-cod-canvas-document-repository.php', $repo_dir . '/includes/class-cod-canvas-mcp-service.php', $repo_dir . '/contope-publisher.php']) as $a) {
    $b = $inst_dir . substr($a, strlen($repo_dir));
    if (!is_file($b) || md5_file($a) !== md5_file($b)) {
        $desiguales[] = basename($a);
    }
}
$comprobar('lo instalado en el local es lo que hay en el repositorio', $desiguales === [], 'distintos: ' . implode(', ', $desiguales));
$comprobar('el sitio de prueba es el WordPress local de Basis (puerto 8894)', strpos((string) home_url(), '8894') !== false, (string) home_url());
if ($fallas > 0 || !class_exists('COD_ADN_Store')) {
    echo "\n  Las precondiciones no se cumplen: no se corre nada.\n";
    exit(1);
}
if (COD_ADN_Store::activo()) {
    echo "\n  FALLA  este WordPress ya tiene un ADN activo (" . json_encode(COD_ADN_Store::descriptor()) . "): la prueba no lo pisa.\n";
    exit(1);
}
$modo_original = get_option(COD_ADN_Gate::OPTION_MODE, null);
$nombre_original = get_option('blogname');
$modo = static function (string $m): void {
    update_option(COD_ADN_Gate::OPTION_MODE, $m, false);
};

$creado = ['docs' => [], 'paginas' => [], 'archivos' => [], 'hojas' => []];
$limpiar = static function () use (&$creado, $modo_original, $nombre_original, $wpdb): void {
    foreach (get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']) as $id) {
        wp_delete_post((int) $id, true);
    }
    foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_%'") as $nombre) {
        if (preg_match('/^cod_adn_(proj_r[0-9]+|lock_.*|activa)$/', (string) $nombre) === 1) {
            delete_option((string) $nombre);
        }
    }
    foreach ($creado['docs'] as $post_id) {
        wp_delete_post((int) $post_id, true);
    }
    foreach ($creado['paginas'] as $post_id) {
        wp_delete_post((int) $post_id, true);
    }
    foreach ($creado['archivos'] as $archivo) {
        if (is_file($archivo)) {
            unlink($archivo);
        }
    }
    if ($creado['hojas'] !== []) {
        $hojas = get_option(COD_Diseno_Hoja::OPTION_KEY, []);
        foreach ($creado['hojas'] as $d) {
            unset($hojas[$d]);
        }
        update_option(COD_Diseno_Hoja::OPTION_KEY, $hojas, false);
    }
    update_option('blogname', $nombre_original);
    if ($modo_original === null) {
        delete_option(COD_ADN_Gate::OPTION_MODE);
    } else {
        update_option(COD_ADN_Gate::OPTION_MODE, $modo_original, false);
    }
    wp_cache_flush();
};
register_shutdown_function($limpiar);

/** Lo SERVIDO: el HTML de las 5 páginas y el contenido de cada hoja de estilos que enlazan. */
$paginas = ['', 'basis-carpas-industriales/', 'preguntas-frecuentes/', 'contactos/', 'terminos-y-privacidad/'];
$servido = static function () use ($paginas): array {
    $ctx = stream_context_create(['http' => ['timeout' => 60, 'ignore_errors' => true]]);
    $out = [];
    foreach ($paginas as $slug) {
        $html = @file_get_contents('http://localhost:8894/' . $slug, false, $ctx);
        if (!is_string($html) || $html === '') {
            $out[$slug] = 'SIN-RESPUESTA';
            continue;
        }
        $css = '';
        if (preg_match_all('/<link[^>]+href=["\']([^"\']+\.css[^"\']*)["\']/i', $html, $m) > 0) {
            foreach (array_unique($m[1]) as $url) {
                $css .= '|' . $url . '=' . md5((string) @file_get_contents(strpos($url, 'http') === 0 ? $url : 'http://localhost:8894' . $url, false, $ctx));
            }
        }
        $out[$slug] = md5($html) . md5($css);
    }
    return $out;
};

$servicio_nuevo = static function (): COD_Canvas_MCP_Service {
    $repositorio = new COD_Canvas_Document_Repository();
    $resolutor = new COD_Template_Region_Resolver($repositorio);
    $publicador = new COD_Canvas_Page_Publisher($repositorio, $resolutor, new COD_Dynamic_Token_Resolver());
    return new COD_Canvas_MCP_Service($repositorio, $publicador, $resolutor, new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer()), new COD_Canvas_Asset_Resolver());
};

/** preview + apply con el previewId que devuelve el propio preview. */
$importar = static function (string $json, array $opciones = []): array {
    $previa = COD_ADN_Store::previsualizar($json, $opciones);
    $res = COD_ADN_Store::aplicar($json, $opciones + ['previewId' => $previa['previewId']]);
    return ['previa' => $previa, 'res' => $res];
};
$codigo = static function ($r): string {
    return is_wp_error($r) ? (string) $r->get_error_code() : 'ok';
};

try {
    // ---------------------------------------------------------------------
    echo "\n== 1. P1.2 — import de r1: revisión y huella calculadas FUERA del plugin ==\n";
    $modo('enforce');
    $base_servido = $servido();
    $comprobar('piso: se pudo leer lo servido de las 5 páginas', count(array_filter($base_servido, static function ($h) {
        return $h !== 'SIN-RESPUESTA';
    })) === 5, json_encode($base_servido));
    $r1_json = adn_de_prueba(['revision' => 1]);
    $archivo_r1 = sys_get_temp_dir() . '/adn-prueba-r1.json';
    file_put_contents($archivo_r1, $r1_json);
    $creado['archivos'][] = $archivo_r1;
    $esperado = trim((string) shell_exec('node ' . escapeshellarg($raiz . '/scripts/adn/canonizar.mjs') . ' ' . escapeshellarg($archivo_r1)));
    $comprobar('el canonizador externo (node) dio un sha256 (' . substr($esperado, 0, 12) . '…)', preg_match('/^[a-f0-9]{64}$/', $esperado) === 1, $esperado);
    $texto_ext = (string) shell_exec('node ' . escapeshellarg($raiz . '/scripts/adn/canonizar.mjs') . ' ' . escapeshellarg($archivo_r1) . ' --texto');
    $archivo_can = sys_get_temp_dir() . '/adn-prueba-r1.canonico.txt';
    file_put_contents($archivo_can, $texto_ext);
    $creado['archivos'][] = $archivo_can;
    $sha_sistema = '';
    $salida_sha = @shell_exec('sha256sum ' . escapeshellarg($archivo_can) . ' 2>NUL');
    if (is_string($salida_sha) && preg_match('/^([a-f0-9]{64})/', $salida_sha, $m)) {
        $sha_sistema = $m[1];
    }
    $comprobar('control: sha256sum sobre el archivo canonizado coincide con el hash de node' . ($sha_sistema === '' ? ' (sha256sum no disponible: se omite)' : ''), $sha_sistema === '' || $sha_sistema === $esperado);

    $previa = COD_ADN_Store::previsualizar($r1_json);
    $comprobar('preview de r1: ok, estado "nuevo", sin errores', $previa['ok'] && $previa['estado'] === 'nuevo' && $previa['errores'] === [], json_encode($previa['errores']));
    $comprobar('preview de r1 no escribió nada (sin puntero, sin revisiones)', !COD_ADN_Store::activo() && get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => 1]) === []);
    $falso = COD_ADN_Store::aplicar($r1_json, ['previewId' => str_repeat('0', 64)]);
    $comprobar('apply con un previewId que no es el exacto → rechazado (ADN_PREVIEW_MISMATCH) y no escribe', $codigo($falso) === 'ADN_PREVIEW_MISMATCH' && !COD_ADN_Store::activo());
    $r = $importar($r1_json);
    $comprobar('apply de r1 → aplicado', !is_wp_error($r['res']) && $r['res']['resultado'] === 'aplicado', is_wp_error($r['res']) ? $r['res']->get_error_message() : '');
    $p = COD_ADN_Store::puntero();
    $comprobar('el puntero dice revisión 1', $p !== null && (int) $p['revision'] === 1 && $p['designId'] === 'basis-web');
    $comprobar('el digest del puntero == sha256 del JSON canónico calculado fuera del plugin', $p !== null && $p['digest'] === $esperado, ($p['digest'] ?? '-') . ' vs ' . $esperado);
    $post = get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'name' => 'basis-web-r1', 'post_status' => 'any', 'numberposts' => 1]);
    $comprobar('existe el registro "basis-web-r1" y su contenido ES el JSON canónico', $post !== [] && $post[0]->post_content === $texto_ext, $post === [] ? 'no existe' : 'contenido distinto');
    $comprobar('el digest guardado en el registro == el esperado', $post !== [] && get_post_meta($post[0]->ID, COD_ADN_Store::META_DIGEST, true) === $esperado);
    $proy1 = COD_ADN_Store::proyeccion_vigente();
    $comprobar('la proyección vigente (por el puntero) tiene variables de color, familia, tamaño, espacio y movimiento', $proy1 !== null
        && isset($proy1['registro']['--wp--preset--color--prueba-a'], $proy1['registro']['--wp--preset--font-family--titulos'], $proy1['registro']['--wp--preset--font-size--display'], $proy1['registro']['--wp--preset--spacing--2'], $proy1['registro']['--wp--custom--motion--rapido'])
        && $proy1['registro']['--wp--preset--color--prueba-a']['valor'] === '#112233', $proy1 === null ? 'sin proyección' : implode(',', array_slice(array_keys($proy1['registro']), 0, 6)));
    $comprobar('el alias del núcleo "--cod-color-surface" sale de la referencia (var del preset)', ($proy1['registro']['--cod-color-surface']['valor'] ?? '') !== '' && strpos((string) $proy1['registro']['--cod-color-surface']['valor'], 'var(--wp--preset--color--') === 0, (string) ($proy1['registro']['--cod-color-surface']['valor'] ?? '-'));
    $comprobar('la restricción legal confirmada queda guardada y NO emitida (ignored[] R4)', in_array('R4-no-proyectada', array_column($proy1['ignoradas'], 'motivo'), true));
    $get1 = COD_ADN_Store::resumen(['definiciones']);
    $comprobar('cod_adn_get: activo, revisión 1, conteos coherentes', $get1['activo'] && $get1['revision'] === 1 && $get1['conteos']['confirmed'] === 7 && $get1['conteos']['emitidas'] >= 5, json_encode($get1['conteos']));
    $servido_r1 = $servido();
    $comprobar('F1 no cambia lo servido: las 5 páginas son idénticas tras importar r1 (nadie consume todavía la proyección)', $servido_r1 === $base_servido);

    // ---------------------------------------------------------------------
    echo "\n== 2. P1.3 — idempotencia, revisión y identidad ==\n";
    $n_posts = count(get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']));
    $r = $importar($r1_json);
    $comprobar('el mismo archivo otra vez → unchanged', !is_wp_error($r['res']) && $r['res']['resultado'] === 'unchanged', $codigo($r['res']));
    $comprobar('unchanged no crea otra revisión', count(get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids'])) === $n_posts);
    $mismo_rev_otro = adn_de_prueba(['revision' => 1, 'extras_color' => ['Otro' => '#010203']]);
    $r = $importar($mismo_rev_otro);
    $comprobar('misma revisión con otro contenido → ADN_REVISION_NOT_NEWER', $codigo($r['res']) === 'ADN_REVISION_NOT_NEWER', $codigo($r['res']));
    $r = $importar(adn_de_prueba(['revision' => 2, 'designId' => 'otro-sitio']));
    $comprobar('otro design.id → ADN_DESIGN_ID_MISMATCH', $codigo($r['res']) === 'ADN_DESIGN_ID_MISMATCH', $codigo($r['res']));
    $r = $importar(adn_de_prueba(['revision' => 2]), ['expectedCurrentRevision' => 7]);
    $comprobar('expectedCurrentRevision distinto de la activa → ADN_STALE_BASE', $codigo($r['res']) === 'ADN_STALE_BASE', $codigo($r['res']));
    $comprobar('control: con la base correcta (1) la misma revisión 2 SÍ pasa el preview', COD_ADN_Store::previsualizar(adn_de_prueba(['revision' => 2]), ['expectedCurrentRevision' => 1])['ok']);
    $comprobar('nada de lo rechazado movió el puntero', COD_ADN_Store::revision_activa() === 1);

    // ---------------------------------------------------------------------
    echo "\n== 3. P1.9 — pendientes de Desktop (value: {}) ==\n";
    $r2_json = adn_de_prueba(['revision' => 2, 'roles' => 'pendiente', 'tipografia' => 'pendiente']);
    $previa2 = COD_ADN_Store::previsualizar($r2_json);
    $comprobar('el import con una pendiente de color y una de tipografía (value {}) PASA el preview', $previa2['ok'], json_encode($previa2['errores']));
    $motivos = array_column($previa2['ignoradas'], 'motivo', 'definicion');
    $comprobar('las dos quedan en ignored[] como R2-sin-resolver', ($motivos['dim1.req02.def1'] ?? '') === 'R2-sin-resolver' && ($motivos['dim2.req02.def1'] ?? '') === 'R2-sin-resolver', json_encode($motivos));
    $sin_roles_en_r1 = isset($proy1['registro']['--cod-color-surface']);
    // Las pendientes quitan los alias de los roles (--cod-color-*) y los tamaños de los roles tipográficos:
    // el Basis local los USA en sus documentos, y el inventario sobre lo servido lo ve. Es la integridad
    // referencial funcionando sobre un sitio de verdad; se aplica con el permiso de wp-admin.
    $sin_permiso = $importar($r2_json, ['expectedCurrentRevision' => 1]);
    $en_uso = array_column($previa2['rompe'], 'variable');
    $comprobar('quitar los roles que el Basis local usa se rechaza sin permiso (ADN_REF_BROKEN, ' . count($en_uso) . ' variable/s en uso)', $codigo($sin_permiso['res']) === 'ADN_REF_BROKEN' && $en_uso !== [] && COD_ADN_Store::revision_activa() === 1, $codigo($sin_permiso['res']) . ' ' . json_encode($en_uso));
    $r = $importar($r2_json, ['expectedCurrentRevision' => 1, 'permitirRuptura' => true]);
    $comprobar('el apply de r2 con pendientes (con el permiso de wp-admin) → aplicado', !is_wp_error($r['res']) && ($r['res']['resultado'] ?? '') === 'aplicado', $codigo($r['res']) . (is_wp_error($r['res']) ? ' ' . $r['res']->get_error_message() : ''));
    $get2 = COD_ADN_Store::resumen(['definiciones']);
    $comprobar('cod_adn_get las cuenta como sin resolver (2) y no como emitidas', $get2['conteos']['sinResolver'] === 2 && empty($get2['definiciones']['dim1.req02.def1']['emitida']) && empty($get2['definiciones']['dim2.req02.def1']['emitida']), json_encode($get2['conteos']));
    $proy2 = COD_ADN_Store::proyeccion_vigente();
    $colores = static function (array $reg): array {
        $c = array_filter($reg, static function ($e, $k) {
            return strpos($k, '--wp--preset--color--') === 0;
        }, ARRAY_FILTER_USE_BOTH);
        ksort($c);
        return $c;
    };
    $comprobar('la paleta proyectada NO cambia por las pendientes (mismos colores, mismos valores)', $colores($proy2['registro']) === $colores($proy1['registro']));
    $comprobar('el rol de color pendiente no emite su alias (control: en r1, con el rol resuelto, sí existía)', $sin_roles_en_r1 && !isset($proy2['registro']['--cod-color-surface']));
    $confirmada_vacia = json_decode(adn_de_prueba(['revision' => 3]), false);
    foreach ($confirmada_vacia->definitions as $d) {
        if ($d->id === 'dim1.req01.def1') {
            $d->value = new stdClass();
        }
    }
    $pv = COD_ADN_Store::previsualizar(json_encode($confirmada_vacia));
    $comprobar('una confirmed con {} → rechazada (ADN_PAYLOAD_SHAPE)', !$pv['ok'] && ($pv['errores'][0]['codigo'] ?? '') === 'ADN_PAYLOAD_SHAPE', json_encode($pv['errores']));
    $propuesta_mala = json_decode(adn_de_prueba(['revision' => 3]), false);
    foreach ($propuesta_mala->definitions as $d) {
        if ($d->id === 'dim3.req01.def1') {
            $d->state = 'proposed';
            $d->authority = 'model-proposal';
            unset($d->reviewedAt);
            $d->value = (object) ['unidad' => '4px'];
        }
    }
    $pv = COD_ADN_Store::previsualizar(json_encode($propuesta_mala), ['emitirPropuestas' => true]);
    $comprobar('una proposed con forma incorrecta + emitirPropuestas → el import pasa; esa definición no se emite', $pv['ok'] && ($pv['definiciones']['dim3.req01.def1']['emitida'] ?? true) === false && ($pv['definiciones']['dim3.req01.def1']['ignorada'] ?? '') === 'ADN_PAYLOAD_SHAPE', json_encode($pv['errores']));
    $comprobar('…y las demás sí se emiten', ($pv['definiciones']['dim1.req01.def1']['emitida'] ?? false) === true && ($pv['definiciones']['dim8.req03.def1']['emitida'] ?? false) === true);

    // ---------------------------------------------------------------------
    echo "\n== 4. P1.7 — integridad referencial sobre lo SERVIDO ==\n";
    // r3 (la base para esta sección) trae las seis variables "Prueba A..F".
    $r = $importar(adn_de_prueba(['revision' => 3]), ['expectedCurrentRevision' => 2]);
    $comprobar('base: r3 aplicado (trae --wp--preset--color--prueba-a … prueba-f)', !is_wp_error($r['res']) && COD_ADN_Store::revision_activa() === 3, $codigo($r['res']));
    $repo = new COD_Canvas_Document_Repository();
    $sin_a = static function (string $letra): string {
        return adn_de_prueba(['revision' => 4, 'sin_color' => ['Prueba ' . $letra]]);
    };
    $nuevo_doc = static function (string $id) use ($repo, &$creado): int {
        $post_id = $repo->ensure_post_id($id);
        $creado['docs'][] = (int) $post_id;
        return (int) $post_id;
    };
    $rompe_de = static function (string $json) {
        return COD_ADN_Store::previsualizar($json);
    };
    $esperar_rotura = static function (string $titulo, string $json, string $variable, string $origen) use ($comprobar, $rompe_de): array {
        $pv = $rompe_de($json);
        $vars = array_column($pv['rompe'], 'variable');
        $item = null;
        foreach ($pv['rompe'] as $x) {
            if ($x['variable'] === $variable) {
                $item = $x;
            }
        }
        $comprobar($titulo . ' → el import se rechaza al aplicar (ADN_REF_BROKEN) con {variable, origen, documentId}', $pv['ok'] && $item !== null && $item['origen'] === $origen && $item['documentId'] !== '' && $vars === [$variable], json_encode($pv['rompe']));
        return $pv;
    };
    $aplicar_rechazado = static function (string $json, string $variable) use ($comprobar, $codigo): void {
        $previa = COD_ADN_Store::previsualizar($json);
        $res = COD_ADN_Store::aplicar($json, ['previewId' => $previa['previewId']]);
        $rev = COD_ADN_Store::revision_activa();
        $comprobar('   y apply realmente lo rechaza con ADN_REF_BROKEN, sin mover el puntero (activa ' . $rev . ')', $codigo($res) === 'ADN_REF_BROKEN' && $rev === 3, $codigo($res));
    };

    // (0) composición con una variable → un cod_patch_css legítimo (que VACÍA META_COMPOSITION) → import que la quita.
    $post_a = $nuevo_doc('adn-prueba-a');
    $css_a = '.zz-a{color:var(--wp--preset--color--prueba-a);}';
    update_post_meta($post_a, COD_Canvas_Document_Repository::META_CSS, wp_slash($css_a));
    update_post_meta($post_a, COD_Canvas_Document_Repository::META_COMPOSITION, wp_slash('{"composition":{"nodes":[]},"design":{"designId":"basis-web","rules":[{"id":"r"}]}}'));
    $comp_antes = (string) get_post_meta($post_a, COD_Canvas_Document_Repository::META_COMPOSITION, true);
    $g = $repo->save_if_revision('adn-prueba-a', 0, '{}', '<p class="zz-a">x</p>', $css_a);
    $comp_despues = (string) get_post_meta($post_a, COD_Canvas_Document_Repository::META_COMPOSITION, true);
    $comprobar('el parche legítimo VACÍA la composición (el defecto que dejaba ciego al inventario anterior)', $comp_antes !== '' && $comp_despues === '' && !is_wp_error($g), $codigo($g));
    $esperar_rotura('(0) variable declarada en la composición, ya parchada', $sin_a('A'), '--wp--preset--color--prueba-a', 'css');
    $aplicar_rechazado($sin_a('A'), '--wp--preset--color--prueba-a');
    wp_delete_post($post_a, true);
    $pv = $rompe_de($sin_a('A'));
    $comprobar('   CONTROL (a): sin ese uso, el mismo import no rompe nada y pasa', $pv['ok'] && $pv['rompe'] === [], json_encode($pv['rompe']));

    // (a) sólo en un style="".
    $post_b = $nuevo_doc('adn-prueba-b');
    $repo->save_if_revision('adn-prueba-b', 0, '{}', '<div style="background:var(--wp--preset--color--prueba-b)">x</div>', '/* sin variables */');
    $esperar_rotura('(a) variable usada sólo en un style=""', $sin_a('B'), '--wp--preset--color--prueba-b', 'style');
    wp_delete_post($post_b, true);
    $comprobar('   CONTROL (b): sin ese uso, pasa', $rompe_de($sin_a('B'))['rompe'] === []);

    // (b) sólo en los styles de projectData.
    $post_c = $nuevo_doc('adn-prueba-c');
    $pd = json_encode(['styles' => [['selectors' => ['.zz-c'], 'style' => ['color' => 'var(--wp--preset--color--prueba-c)']]], 'pages' => []]);
    $repo->save_if_revision('adn-prueba-c', 0, (string) $pd, '<p>x</p>', '');
    $esperar_rotura('(b) variable usada sólo en projectData', $sin_a('C'), '--wp--preset--color--prueba-c', 'projectData');
    wp_delete_post($post_c, true);
    $comprobar('   CONTROL (c): sin ese uso, pasa', $rompe_de($sin_a('C'))['rompe'] === []);

    // (c) un attr de bloque en post_content de una página BORRADOR.
    $borrador = wp_insert_post([
        'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'ADN prueba borrador',
        'post_content' => '<!-- wp:paragraph {"style":{"color":{"text":"var:preset|color|prueba-d"}}} --><p>x</p><!-- /wp:paragraph -->',
    ]);
    $creado['paginas'][] = (int) $borrador;
    $esperar_rotura('(c) variable usada sólo en un attr de bloque de una página BORRADOR', $sin_a('D'), '--wp--preset--color--prueba-d', 'bloques');
    wp_delete_post((int) $borrador, true);
    $comprobar('   CONTROL (d): sin ese uso, pasa', $rompe_de($sin_a('D'))['rompe'] === []);

    // (d) una parte del tema.
    $parte = rtrim((string) get_stylesheet_directory(), '/\\') . '/parts/zz-adn-prueba.html';
    $existia_parts = is_dir(dirname($parte));
    if (!$existia_parts) {
        mkdir(dirname($parte), 0777, true);
    }
    file_put_contents($parte, '<!-- wp:group {"backgroundColor":"prueba-e"} --><div class="wp-block-group has-prueba-e-background-color has-background">x</div><!-- /wp:group -->');
    $creado['archivos'][] = $parte;
    $esperar_rotura('(d) variable usada sólo en una parte del tema', $sin_a('E'), '--wp--preset--color--prueba-e', 'tema');
    unlink($parte);
    $comprobar('   CONTROL (e): sin ese uso, pasa', $rompe_de($sin_a('E'))['rompe'] === []);
    if (!$existia_parts) {
        @rmdir(dirname($parte));
    }

    // (e) la hoja generada.
    $dir_hojas = COD_Diseno_Hoja::carpeta();
    $comprobar('existe la carpeta de hojas generadas', $dir_hojas !== '');
    $archivo_hoja = trailingslashit($dir_hojas) . 'adn-prueba-hoja.css';
    file_put_contents($archivo_hoja, '.zz-f{color:var(--wp--preset--color--prueba-f);}');
    $creado['archivos'][] = $archivo_hoja;
    $hojas = get_option(COD_Diseno_Hoja::OPTION_KEY, []);
    $hojas['adn-prueba'] = ['archivo' => 'adn-prueba-hoja.css', 'sello' => 'x'];
    update_option(COD_Diseno_Hoja::OPTION_KEY, $hojas, false);
    $creado['hojas'][] = 'adn-prueba';
    $esperar_rotura('(e) variable usada sólo en la hoja generada', $sin_a('F'), '--wp--preset--color--prueba-f', 'hoja');
    unlink($archivo_hoja);
    $comprobar('   CONTROL (f): sin ese uso, pasa', $rompe_de($sin_a('F'))['rompe'] === []);

    // Degradar a proposed una variable en uso.
    $post_g = $nuevo_doc('adn-prueba-g');
    $repo->save_if_revision('adn-prueba-g', 0, '{}', '<p>x</p>', '.zz-g{color:var(--wp--preset--color--prueba-a);}');
    $degradado = adn_de_prueba(['revision' => 4, 'estado_paleta' => 'proposed']);
    $pv = COD_ADN_Store::previsualizar($degradado, ['emitirPropuestas' => true]);
    $deg = array_column($pv['diff']['variables']['degradadas'] ?? [], 'variable');
    $rompe_vars = array_column($pv['rompe'], 'variable');
    $comprobar('un import que DEGRADA a proposed una variable en uso → rompe (ADN_REF_BROKEN)', $pv['ok'] && in_array('--wp--preset--color--prueba-a', $deg, true) && in_array('--wp--preset--color--prueba-a', $rompe_vars, true), json_encode($pv['rompe']));
    $res = COD_ADN_Store::aplicar($degradado, ['emitirPropuestas' => true, 'previewId' => $pv['previewId']]);
    $comprobar('   y apply lo rechaza (ADN_REF_BROKEN) sin mover el puntero', $codigo($res) === 'ADN_REF_BROKEN' && COD_ADN_Store::revision_activa() === 3, $codigo($res));
    $res = COD_ADN_Store::aplicar($degradado, ['emitirPropuestas' => true, 'previewId' => $pv['previewId'], 'permitirRuptura' => true]);
    $comprobar('   con permitirRuptura (wp-admin, fuera del MCP) sí se aplica', !is_wp_error($res) && COD_ADN_Store::revision_activa() === 4, $codigo($res));
    wp_delete_post($post_g, true);

    // El MCP NO puede pedir permitirRuptura: ni como argumento ni por la vía interna.
    $servicio = $servicio_nuevo();
    $err = $servicio->call_tool('cod_adn_apply_import', ['model' => adn_de_prueba(['revision' => 5]), 'previewId' => 'x', 'permitirRuptura' => true]);
    $comprobar('el MCP rechaza el argumento permitirRuptura (no existe en la herramienta)', is_wp_error($err) && $err->get_error_code() === 'cod_mcp_invalid_arguments', $codigo($err));
    COD_ADN_Gate::entrar_en_mcp();
    $post_h = $nuevo_doc('adn-prueba-h');
    $repo->save_if_revision('adn-prueba-h', 0, '{}', '<p>x</p>', '.zz-h{color:var(--wp--preset--color--prueba-b);}');
    $quita_b = adn_de_prueba(['revision' => 5, 'sin_color' => ['Prueba B'], 'estado_paleta' => 'proposed']);
    $quita_b = adn_de_prueba(['revision' => 5, 'sin_color' => ['Prueba B']]);
    $pv_b = COD_ADN_Store::previsualizar($quita_b);
    $res = COD_ADN_Store::aplicar($quita_b, ['previewId' => $pv_b['previewId'], 'permitirRuptura' => true]);
    COD_ADN_Gate::salir_de_mcp();
    $comprobar('aunque el código interno reciba permitirRuptura, dentro de una llamada del MCP se ignora', $codigo($res) === 'ADN_REF_BROKEN', $codigo($res));
    wp_delete_post($post_h, true);

    // ---------------------------------------------------------------------
    echo "\n== 5. P1.5 — atomicidad: un fallo a mitad de camino no deja nada a medias ==\n";
    // Se limpia el estado de las secciones anteriores para partir de una base conocida: r? activa.
    $base_rev = COD_ADN_Store::revision_activa();
    $siguiente = $base_rev + 1;
    $json_sig = adn_de_prueba(['revision' => $siguiente, 'extras_color' => ['Nuevo color' => '#0A0B0C']]);
    $foto = static function () use ($servido): array {
        $get = COD_ADN_Store::resumen(['definiciones', 'registro']);
        return [
            'get' => md5((string) json_encode($get)),
            'puntero' => md5((string) json_encode(COD_ADN_Store::puntero())),
            'servido' => $servido(),
            'posts' => count(get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids'])),
        ];
    };
    $antes = $foto();
    $existe_proy = static function (int $rev): bool {
        return COD_ADN_Store::proyeccion($rev) !== null;
    };
    foreach (['tras-cpt' => '(a) tras escribir el registro', 'tras-proyeccion' => '(b) tras escribir cod_adn_proj_r<N>', 'antes-del-puntero' => '(c) justo antes de mover el puntero'] as $punto => $titulo) {
        $inyectar = static function (string $p) use ($punto): void {
            if ($p === $punto) {
                throw new RuntimeException('falla inyectada en ' . $punto);
            }
        };
        add_action('cod_adn_import_punto', $inyectar);
        $previa = COD_ADN_Store::previsualizar($json_sig);
        $res = COD_ADN_Store::aplicar($json_sig, ['previewId' => $previa['previewId']]);
        remove_action('cod_adn_import_punto', $inyectar);
        $despues = $foto();
        $comprobar("$titulo: el import falla con ADN_IMPORT_FAILED", $codigo($res) === 'ADN_IMPORT_FAILED', $codigo($res));
        $comprobar('   cod_adn_get, el puntero y lo servido de las 5 páginas son los de la revisión anterior (hash igual)', $despues['get'] === $antes['get'] && $despues['puntero'] === $antes['puntero'] && $despues['servido'] === $antes['servido'], json_encode(array_keys(array_filter(['get' => $despues['get'] !== $antes['get'], 'puntero' => $despues['puntero'] !== $antes['puntero'], 'servido' => $despues['servido'] !== $antes['servido']]))));
        $comprobar('   no queda un puntero a medias, ni una revisión huérfana, ni una proyección de la revisión fallida', COD_ADN_Store::revision_activa() === $base_rev && $despues['posts'] === $antes['posts'] && !$existe_proy($siguiente), json_encode(['rev' => COD_ADN_Store::revision_activa(), 'base' => $base_rev, 'posts' => $despues['posts'], 'antes' => $antes['posts'], 'proy' => $existe_proy($siguiente)]));
        $lock = $wpdb->get_var("SELECT option_name FROM {$wpdb->options} WHERE option_name = '" . COD_ADN_Lock::OPCION_EXCLUSIVO . "'");
        $comprobar('   y el bloqueo exclusivo se soltó', $lock === null);
    }
    // CONTROL: sin inyección el mismo import pasa y lo observado CAMBIA.
    $previa = COD_ADN_Store::previsualizar($json_sig);
    $res = COD_ADN_Store::aplicar($json_sig, ['previewId' => $previa['previewId']]);
    $despues = $foto();
    $comprobar('CONTROL: sin inyección el import pasa', !is_wp_error($res) && COD_ADN_Store::revision_activa() === $siguiente, $codigo($res));
    $comprobar('CONTROL: …y cod_adn_get y el puntero CAMBIAN (la prueba sabe ver un cambio)', $despues['get'] !== $antes['get'] && $despues['puntero'] !== $antes['puntero'] && $despues['posts'] === $antes['posts'] + 1);
    $comprobar('F1 no consume la proyección: lo servido sigue igual aunque el puntero se movió', $despues['servido'] === $antes['servido']);
    // CONTROL del instrumento que mira lo servido: un cambio real SE VE en el hash.
    update_option('blogname', 'Cambio de prueba del hash');
    $cambiado = $servido();
    update_option('blogname', $nombre_original);
    $comprobar('CONTROL del instrumento: cambiar el nombre del sitio SÍ cambia el hash de las páginas servidas', $cambiado !== $antes['servido'] && $servido() === $antes['servido']);

    // ---------------------------------------------------------------------
    echo "\n== 6. herramientas del MCP y capacidades honestas ==\n";
    $servicio = $servicio_nuevo();
    $get = $servicio->call_tool('cod_adn_get', []);
    $comprobar('cod_adn_get por el servicio MCP responde el resumen', !is_wp_error($get) && $get['activo'] === true && $get['revision'] === $siguiente, $codigo($get));
    $comprobar('cod_adn_get con incluir:["registro"] trae el registro', !is_wp_error($servicio->call_tool('cod_adn_get', ['incluir' => ['registro']])) && !empty($servicio->call_tool('cod_adn_get', ['incluir' => ['registro']])['registro']));
    $comprobar('cod_adn_get rechaza un argumento desconocido', $codigo($servicio->call_tool('cod_adn_get', ['x' => 1])) === 'cod_mcp_invalid_arguments');
    $pv = $servicio->call_tool('cod_adn_preview_import', ['model' => adn_de_prueba(['revision' => $siguiente + 1]), 'expectedCurrentRevision' => $siguiente]);
    $comprobar('cod_adn_preview_import por el MCP: ok y con previewId', !is_wp_error($pv) && $pv['ok'] === true && strlen($pv['previewId']) === 64, $codigo($pv));
    $malo = $servicio->call_tool('cod_adn_preview_import', ['model' => '{"esto no es un contrato": true}']);
    $comprobar('un ADN inválido da errores con código (ADN_INVALID) y no escribe', !is_wp_error($malo) && $malo['ok'] === false && $malo['errores'][0]['codigo'] === 'ADN_INVALID');
    $ap = $servicio->call_tool('cod_adn_apply_import', ['model' => adn_de_prueba(['revision' => $siguiente + 1]), 'previewId' => $pv['previewId'], 'expectedCurrentRevision' => $siguiente]);
    $comprobar('cod_adn_apply_import por el MCP aplica con el previewId exacto', !is_wp_error($ap) && $ap['resultado'] === 'aplicado' && COD_ADN_Store::revision_activa() === $siguiente + 1, $codigo($ap));
    $caps = $servicio->capabilities();
    $comprobar('cod_get_capabilities: adn activo con designId y revisión; portableContractPersisted true; importsPortableModel true; readsDesktopContract sigue false',
        ($caps['adn']['activo'] ?? false) === true && ($caps['adn']['revision'] ?? 0) === $siguiente + 1 && $caps['designRuleSet']['portableContractPersisted'] === true && $caps['designRuleSet']['importsPortableModel'] === true && $caps['designRuleSet']['readsDesktopContract'] === false, json_encode($caps['adn'] ?? null));

    // La composición debe ser contra la revisión activa (ADN_REVISION_STALE); en off sigue libre.
    // (En observe: el Basis local todavía tiene literales de espaciado y enforce rechazaría por ellos.)
    $modo('observe');
    $pagina = get_page_by_path('contactos');
    $leida = $pagina ? $servicio->read_canvas_composition((int) $pagina->ID) : null;
    if (is_array($leida) && !empty($leida['found'])) {
        $estado = $servicio->canvas_page_state((int) $pagina->ID);
        $doc_id = (string) ($estado['documentId'] ?? $estado['document']['documentId'] ?? '');
        $rev_doc = (int) ($estado['revision'] ?? $estado['document']['revision'] ?? 0);
        $dis = $leida['design'];
        $activa = COD_ADN_Store::revision_activa();
        $dis['expectedDesignRevision'] = $activa;
        $ok = $servicio->preview_canvas_composition((int) $pagina->ID, $doc_id, $rev_doc, $leida['composition'], $dis);
        $comprobar('CONTROL: una composición con expectedDesignRevision == la activa (' . $activa . ') se previsualiza', !is_wp_error($ok), $codigo($ok) . (is_wp_error($ok) ? ' ' . $ok->get_error_message() : ''));
        $dis['expectedDesignRevision'] = $activa - 1;
        $viejo = $servicio->preview_canvas_composition((int) $pagina->ID, $doc_id, $rev_doc, $leida['composition'], $dis);
        $comprobar('con una revisión del ADN vieja → ADN_REVISION_STALE, que dice cuál es la activa', $codigo($viejo) === 'ADN_REVISION_STALE' && ($viejo->get_error_data()['revisionActiva'] ?? 0) === $activa, $codigo($viejo));
        $modo('off');
        $libre = $servicio->preview_canvas_composition((int) $pagina->ID, $doc_id, $rev_doc, $leida['composition'], $dis);
        $comprobar('en modo off sigue libre (la misma revisión vieja se previsualiza)', !is_wp_error($libre), $codigo($libre));
        $modo('enforce');
    } else {
        $comprobar('la página "contactos" tiene composición legible para probar ADN_REVISION_STALE', false, 'sin composición');
    }

    echo "\n== 7. wp-admin: la pantalla existe y exige permiso ==\n";
    $comprobar('la clase de la pantalla y sus dos acciones existen', class_exists('COD_ADN_Admin') && COD_ADN_Admin::ACCION_REVISAR !== COD_ADN_Admin::ACCION_APLICAR && COD_ADN_Admin::CAPABILITY === 'manage_options');
    $fuente_admin = (string) file_get_contents($repo_dir . '/includes/class-cod-adn-admin.php');
    $comprobar('cada acción comprueba capacidad y nonce (check_admin_referer) antes de tocar nada', substr_count($fuente_admin, 'check_admin_referer(') >= 2 && substr_count($fuente_admin, "current_user_can(self::CAPABILITY)") >= 3);
    // La pantalla se DIBUJA de verdad (como administrador), con el estado, el formulario y una revisión pendiente.
    $admins = get_users(['role' => 'administrator', 'number' => 1]);
    $comprobar('hay un administrador en el local para dibujar la pantalla', $admins !== []);
    if ($admins !== []) {
        wp_set_current_user((int) $admins[0]->ID);
        // submit_button() vive en wp-admin/includes/template.php, que sólo carga el panel.
        require_once ABSPATH . 'wp-admin/includes/template.php';
        $pantalla = new COD_ADN_Admin();
        $dibujar = static function () use ($pantalla): string {
            ob_start();
            $pantalla->render_page();
            return (string) ob_get_clean();
        };
        $html = $dibujar();
        $comprobar('la pantalla muestra el ADN activo (designId y revisión) y el formulario de subida', strpos($html, 'basis-web') !== false && strpos($html, 'revisión <strong>' . COD_ADN_Store::revision_activa()) !== false && strpos($html, 'name="adn_archivo"') !== false && strpos($html, 'name="_wpnonce"') !== false);
        $clave = new ReflectionMethod($pantalla, 'clave_del_transitorio');
        $clave->setAccessible(true);
        $token = 'abcdef0123456789';
        set_transient($clave->invoke($pantalla, $token), ['texto' => adn_de_prueba(['revision' => COD_ADN_Store::revision_activa() + 1]), 'emitirPropuestas' => false, 'fuente' => 'upload'], 300);
        $_GET['cod_adn_token'] = $token;
        $html = $dibujar();
        $comprobar('con una revisión pendiente la pantalla muestra el diff y el botón "Aplicar este ADN" con el previewId', strpos($html, 'Aplicar este ADN') !== false && preg_match('/name="preview_id" value="[a-f0-9]{64}"/', $html) === 1);
        set_transient($clave->invoke($pantalla, $token), ['texto' => '{"no": "es un contrato"}', 'emitirPropuestas' => false, 'fuente' => 'upload'], 300);
        $html = $dibujar();
        $comprobar('un ADN inválido se muestra con su código y SIN botón de aplicar', strpos($html, 'ADN_INVALID') !== false && strpos($html, 'Aplicar este ADN') === false);
        delete_transient($clave->invoke($pantalla, $token));
        unset($_GET['cod_adn_token']);
        wp_set_current_user(0);
    }
} finally {
    $limpiar();
}
$resto = 0;
foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_%'") as $nombre) {
    if (preg_match('/^cod_adn_(proj_r[0-9]+|lock_.*|activa)$/', (string) $nombre) === 1) {
        ++$resto;
    }
}
echo "\n== limpieza ==\n";
$comprobar('no queda ninguna proyección, bloqueo ni puntero del ADN', $resto === 0 && !COD_ADN_Store::activo() && get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => 1]) === [], "opciones: $resto");

echo "\n" . ($fallas === 0 ? "TODO VERDE ($ejecutadas comprobaciones)" : "FALLARON $fallas de $ejecutadas comprobaciones") . "\n";
exit($fallas === 0 ? 0 : 1);
