<?php
/**
 * Fase F2 (ESPEC-adn-unica-puerta-y-bloques, "Proyección única"): P2.1 a P2.4, los mapeos que F1 dejó sin
 * fijar y la prueba de PORTABILIDAD DE PRESETS que motivó la fase:
 *
 *   un sitio destino con un theme.json ATRASADO (el de producción, sin las escalas de tamaño y de espaciado ni
 *   el custom) importa un ADN derivado del theme.json actual de Basis y queda con los mismos presets que el
 *   local, SIN subir archivos de tema.
 *
 * Corre contra el WordPress LIMPIO de pruebas (puerto 8895, carpeta wp-local-f1b-destino), nunca contra Santa
 * Luisa, Econut ni Basis. Antes:   node scripts/paquete/crear-destino-limpio.mjs --sincronizar
 *
 * Puede fallar de verdad: cada "sin el ADN no se ve" tiene su CONTROL (la misma lectura sin el ADN, que sí
 * muestra el problema), y el piso de cada comparación (cuántos colores, familias, tamaños, espaciados) hace
 * fallar una comparación hecha en vacío. Al terminar deja el sitio como lo encontró (theme.json incluido).
 *
 * Con COD_F2_PAQUETE=<ruta a un .ocdsite> la importación de la sección 3 es la del PAQUETE real (el que exportó el
 * local de Basis, ver scripts/adn/probar-portabilidad-presets.mjs) en vez de importar el ADN a pelo: así lo que se mide
 * es el camino completo exportar -> importar.
 *
 * Las referencias están CONGELADAS en fixtures/adn/f2/ (con su sha256 aquí): el theme.json que sirve el local
 * de Basis en 5e118c5 y el atrasado de producción de b7b0478. No se compara contra lo regenerado.
 */
define('WP_USE_THEMES', false);
$wp_load = getenv('COD_PRUEBA_WP') ?: __DIR__ . '/../../wp-local-f1b-destino/wordpress/wp-load.php';
require $wp_load;
require __DIR__ . '/adn/lib/adn-desde-theme-json.php';

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
$FIX = $raiz . '/fixtures/adn/f2';
$F_LOCAL = $FIX . '/basis-theme.local-5e118c5.json';
$F_ATRASADO = $FIX . '/basis-theme.destino-atrasado-b7b0478.json';
$SHA = [
    $F_LOCAL => '7414ba5e8c9ac545f94c5b5f60a4ef23fdf8119e341ec0f261ccdbd9a5a355a4',
    $F_ATRASADO => '96cecdee572babea142d253ac1dad2d85a7f04ede222440aac053c27264c40ba',
];

// ---------------------------------------------------------------------------
echo "\n== 0. precondiciones ==\n";
$comprobar('el sitio de prueba es el destino limpio (puerto 8895)', strpos((string) home_url(), ':8895') !== false, (string) home_url());
$repo_dir = realpath($raiz . '/contope-publisher');
$inst_dir = rtrim((string) COD_PUBLISHER_DIR, '/\\');
$desiguales = [];
$a_comparar = glob($repo_dir . '/includes/class-cod-adn-*.php') ?: [];
foreach (['class-cod-design-core.php', 'class-cod-theme-definitions.php', 'class-cod-settings-admin.php', 'class-cod-canvas-mcp-service.php'] as $f) {
    $a_comparar[] = $repo_dir . '/includes/' . $f;
}
$a_comparar[] = $repo_dir . '/contope-publisher.php';
foreach ($a_comparar as $a) {
    $b = $inst_dir . substr($a, strlen($repo_dir));
    if (!is_file($b) || md5_file($a) !== md5_file($b)) {
        $desiguales[] = basename($a);
    }
}
$comprobar('lo instalado en el sitio de prueba es lo que hay en el repositorio', $desiguales === [], 'distintos: ' . implode(', ', $desiguales) . ' (corre: node scripts/paquete/crear-destino-limpio.mjs --sincronizar)');
foreach ($SHA as $archivo => $esperado) {
    $comprobar('la referencia congelada ' . basename($archivo) . ' existe y es la de siempre (sha256)', is_file($archivo) && hash_file('sha256', $archivo) === $esperado, is_file($archivo) ? hash_file('sha256', $archivo) : 'falta el archivo');
}
$tema_dir = rtrim((string) get_stylesheet_directory(), '/\\');
$comprobar('el tema activo del destino es contope-basis (el de producción de Basis)', basename($tema_dir) === 'contope-basis', $tema_dir);
if ($fallas > 0) {
    echo "\n  Las precondiciones no se cumplen: no se corre nada.\n";
    exit(1);
}
$vaciado = [];
exec(escapeshellarg($PHP_LOCAL) . ' -c ' . escapeshellarg('C:/Users/Cristobal concha/wp-local/php/php.ini') . ' ' . escapeshellarg($raiz . '/scripts/paquete/vaciar-destino.php') . ' ' . escapeshellarg($wp_load) . ' 2>&1', $vaciado);
wp_cache_flush();
if (COD_ADN_Store::activo()) {
    echo "\n  FALLA  este WordPress ya tiene un ADN activo: la prueba no lo pisa.\n";
    exit(1);
}

// --- lo que hay que dejar como estaba
$archivo_tema = $tema_dir . '/theme.json';
$tema_original = (string) file_get_contents($archivo_tema);
$opcion_def_original = get_option(COD_Theme_Definitions::OPTION_KEY, null);
$modo_original = get_option(COD_ADN_Gate::OPTION_MODE, null);
$paquete_ruta = (string) (getenv('COD_F2_PAQUETE') ?: '');
$limpiar = static function () use ($archivo_tema, $tema_original, $opcion_def_original, $modo_original, $wpdb, $paquete_ruta, $PHP_LOCAL, $raiz, $wp_load): void {
    file_put_contents($archivo_tema, $tema_original);
    if ($paquete_ruta !== '') {
        // El paquete real trae páginas, documentos y regiones: se vacía el destino como lo dejó la preparación.
        $salida_vaciado = [];
        exec(escapeshellarg($PHP_LOCAL) . ' -c ' . escapeshellarg('C:/Users/Cristobal concha/wp-local/php/php.ini') . ' ' . escapeshellarg($raiz . '/scripts/paquete/vaciar-destino.php') . ' ' . escapeshellarg($wp_load) . ' 2>&1', $salida_vaciado);
    }
    foreach (get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']) as $id) {
        wp_delete_post((int) $id, true);
    }
    foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_%'") as $nombre) {
        if (preg_match('/^cod_adn_(proj_r[0-9]+|lock_.*|activa)$/', (string) $nombre) === 1) {
            delete_option((string) $nombre);
        }
    }
    if ($opcion_def_original === null) {
        delete_option(COD_Theme_Definitions::OPTION_KEY);
    } else {
        update_option(COD_Theme_Definitions::OPTION_KEY, $opcion_def_original, false);
    }
    if ($modo_original === null) {
        delete_option(COD_ADN_Gate::OPTION_MODE);
    } else {
        update_option(COD_ADN_Gate::OPTION_MODE, $modo_original, false);
    }
    wp_cache_flush();
};
register_shutdown_function($limpiar);

/** Pone un theme.json (texto) como el del tema activo y descarta lo que WordPress recuerda de él. */
$olvidar_archivo = static function (): void {
    // WP_Theme_JSON_Resolver recuerda el contenido de cada theme.json leído durante el proceso y clean_cached_data()
    // no lo olvida: en una petición real el archivo no cambia, aquí sí.
    $p = new ReflectionProperty(WP_Theme_JSON_Resolver::class, 'theme_json_file_cache');
    $p->setAccessible(true);
    $p->setValue(null, []);
};
$poner_tema = static function (string $contenido) use ($archivo_tema, $olvidar_archivo): void {
    file_put_contents($archivo_tema, $contenido);
    clearstatcache(true, $archivo_tema);
    $olvidar_archivo();
    if (function_exists('wp_clean_theme_json_cache')) {
        wp_clean_theme_json_cache();
    }
    WP_Theme_JSON_Resolver::clean_cached_data();
    wp_cache_flush();
};
/** @return array<string, mixed> */
$ajustes = static function () use ($olvidar_archivo): array {
    $olvidar_archivo();
    if (function_exists('wp_clean_theme_json_cache')) {
        wp_clean_theme_json_cache();
    }
    WP_Theme_JSON_Resolver::clean_cached_data();
    return wp_get_global_settings();
};
/** @return array<string, array<string, string>> slug => valor, por familia de preset, del origen `theme` */
$presets = static function (array $s): array {
    $tomar = static function (array $lista, string $campo): array {
        $out = [];
        foreach ($lista as $p) {
            $out[(string) $p['slug']] = (string) ($p[$campo] ?? '');
        }
        return $out;
    };
    return [
        'paleta' => $tomar($s['color']['palette']['theme'] ?? [], 'color'),
        'familias' => $tomar($s['typography']['fontFamilies']['theme'] ?? [], 'fontFamily'),
        'tamanos' => $tomar($s['typography']['fontSizes']['theme'] ?? [], 'size'),
        'espaciados' => $tomar($s['spacing']['spacingSizes']['theme'] ?? [], 'size'),
    ];
};
/** Compara dos mapas slug => valor: cuántos iguales, cuáles faltan, cuáles difieren, cuáles sobran. */
$comparar_mapas = static function (array $ref, array $dest): array {
    $r = ['iguales' => 0, 'faltan' => [], 'distintos' => [], 'sobran' => array_values(array_diff(array_keys($dest), array_keys($ref)))];
    foreach ($ref as $slug => $valor) {
        if (!array_key_exists($slug, $dest)) {
            $r['faltan'][] = (string) $slug;
        } elseif ($dest[$slug] !== $valor) {
            $r['distintos'][] = $slug . ': «' . $valor . '» vs «' . $dest[$slug] . '»';
        } else {
            ++$r['iguales'];
        }
    }
    return $r;
};
/** @return array<int, string> las rutas hoja de un mapa, con puntos */
$hojas = static function ($valor, string $prefijo = '') use (&$hojas): array {
    if (!is_array($valor)) {
        return [$prefijo];
    }
    $out = [];
    foreach ($valor as $k => $v) {
        $out = array_merge($out, $hojas($v, $prefijo === '' ? (string) $k : $prefijo . '.' . $k));
    }
    return $out;
};
$obtener = static function (array $a, string $ruta) {
    foreach (explode('.', $ruta) as $seg) {
        if (!is_array($a) || !array_key_exists($seg, $a)) {
            return null;
        }
        $a = $a[$seg];
    }
    return $a;
};
$importar = static function (string $json, ?int $esperada = null) {
    $opciones = ['emitirPropuestas' => false] + ($esperada !== null ? ['expectedCurrentRevision' => $esperada] : []);
    $previa = COD_ADN_Store::previsualizar($json, $opciones);
    if (!$previa['ok']) {
        return new WP_Error((string) ($previa['errores'][0]['codigo'] ?? 'ADN_INVALID'), (string) ($previa['errores'][0]['mensaje'] ?? ''), $previa['errores']);
    }
    return COD_ADN_Store::aplicar($json, $opciones + ['previewId' => $previa['previewId'], 'fuente' => 'upload']);
};

// El ADN derivado del theme.json actual de Basis (lo congelado), y el theme.json que lo reproduce.
$adn_r1 = adn_desde_theme_json($F_LOCAL, ['revision' => 1]);
$ref_tema = json_decode((string) file_get_contents($F_LOCAL), true);
$GAP = array_keys(COD_ADN_Theme::fuera_del_adn());

// ---------------------------------------------------------------------------
echo "\n== 1. la referencia: lo que sirve el local de Basis (theme.json congelado de 5e118c5) ==\n";
$poner_tema((string) file_get_contents($F_LOCAL));
$REF = $ajustes();
$P_REF = $presets($REF);
$comprobar('la referencia tiene paleta, 4 familias, 20 tamaños y 31+ espaciados (piso: no se compara en vacío)',
    count($P_REF['paleta']) >= 12 && count($P_REF['familias']) === 4 && count($P_REF['tamanos']) === 20 && count($P_REF['espaciados']) >= 31,
    json_encode(array_map('count', $P_REF)));
$comprobar('la referencia trae el custom (radius, border, typography, layout, blur, form)', isset($REF['custom']['radius']['m'], $REF['custom']['border'], $REF['custom']['typography'], $REF['custom']['layout'], $REF['custom']['blur'], $REF['custom']['form']));

// ---------------------------------------------------------------------------
echo "\n== 2. CONTROL: el destino atrasado (theme.json de producción de b7b0478) sin ADN muestra el problema ==\n";
$poner_tema((string) file_get_contents($F_ATRASADO));
$S0 = $ajustes();
$P0 = $presets($S0);
$comprobar('atrasado y sin ADN: 4 tamaños (los de fábrica del tema viejo), no los 20', count($P0['tamanos']) === 4 && count($P_REF['tamanos']) === 20, json_encode(array_map('count', $P0)));
$comprobar('atrasado y sin ADN: sin escala de espaciado ni custom', count($P0['espaciados']) === 0 && !isset($S0['custom']['radius']) && !isset($S0['custom']['border']));
$comprobar('atrasado y sin ADN: el registro de diseño no conoce --wp--preset--font-size--170 (el compilador de producción lo rechazaría)', (function () {
    COD_ADN_Registry::reiniciar();
    return !COD_ADN_Registry::tiene('--wp--preset--font-size--170') && !COD_ADN_Registry::tiene('--wp--custom--radius--m');
})());
remove_filter('wp_theme_json_data_theme', [COD_ADN_Theme::class, 'filtrar'], COD_ADN_Theme::PRIORIDAD);
$S0b = $ajustes();
add_filter('wp_theme_json_data_theme', [COD_ADN_Theme::class, 'filtrar'], COD_ADN_Theme::PRIORIDAD);
$comprobar('sin ADN el filtro no hace nada (con y sin el filtro, el mismo theme.json)', wp_json_encode($S0) === wp_json_encode($S0b));
$comprobar('sin ADN, el núcleo no sale del ADN y sigue como antes (origen distinto de adn)', (function () {
    foreach (COD_Design_Core::estado() as $r) {
        if ($r['origen'] === 'adn') {
            return false;
        }
    }
    return true;
})());

// ---------------------------------------------------------------------------
echo "\n== 3. el ADN derivado se importa en el destino atrasado (P2.1, portabilidad de presets) ==\n";
if ($paquete_ruta !== '') {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    $repositorio_p = new COD_Canvas_Document_Repository();
    $importador_p = new COD_Site_Package_Importer($repositorio_p, new COD_Canvas_Document_Sanitizer(), new COD_Media_Attachment_Sync());
    $comprobar('el paquete .ocdsite que exportó el local de Basis existe', is_file($paquete_ruta), $paquete_ruta);
    $r_paquete = $importador_p->import($paquete_ruta);
    $comprobar('el paquete real se importa en el destino atrasado', !is_wp_error($r_paquete), $codigo($r_paquete) . (is_wp_error($r_paquete) ? ' ' . $r_paquete->get_error_message() : ''));
    $digest_esperado = COD_ADN_Validator::validar($adn_r1, ['emitirPropuestas' => false])['digest'];
    $p_activo = COD_ADN_Store::puntero();
    $comprobar('el ADN que quedó activo es el del local (mismo designId, revisión y digest)', $p_activo !== null && $p_activo['designId'] === 'basis-web' && (int) $p_activo['revision'] === 1 && $p_activo['digest'] === $digest_esperado, json_encode($p_activo));
    $r1 = ['resultado' => 'aplicado', 'revision' => 1];
} else {
    $r1 = $importar($adn_r1);
}
$comprobar('el ADN derivado de Basis se importa (nuevo, r1)', !is_wp_error($r1) && $r1['resultado'] === 'aplicado' && $r1['revision'] === 1, $codigo($r1) . (is_wp_error($r1) ? ' ' . $r1->get_error_message() : ''));
$S1 = $ajustes();
$P1 = $presets($S1);
$alfa = ['fondo-pagina-88', 'ink-15']; // color-mix(): no caben en el color-css del Core
$cmp = $comparar_mapas($P_REF['paleta'], $P1['paleta']);
$comprobar('PALETA: los 12 colores de la referencia llegan con su hex (piso 12)', $cmp['iguales'] >= 12 && $cmp['distintos'] === [] && array_diff($cmp['faltan'], $alfa) === [], json_encode($cmp));
$comprobar('PALETA: lo único que falta son las 2 transparencias color-mix (fuera del ADN, declaradas)', array_values(array_diff($cmp['faltan'], $alfa)) === [] && count($cmp['faltan']) === 2 && $cmp['sobran'] === []);
$cmp = $comparar_mapas($P_REF['familias'], $P1['familias']);
$comprobar('FAMILIAS: las 4 familias llegan con su pila completa (piso 4)', $cmp['iguales'] === 4 && $cmp['faltan'] === [] && $cmp['distintos'] === [] && $cmp['sobran'] === [], json_encode($cmp));
$cmp = $comparar_mapas($P_REF['tamanos'], $P1['tamanos']);
$comprobar('TAMAÑOS: los 20 tamaños de letra 10–200 llegan con su valor (piso 20)', $cmp['iguales'] === 20 && $cmp['faltan'] === [] && $cmp['distintos'] === [], json_encode($cmp));
$comprobar('TAMAÑOS: lo único que sobra son los roles display y cuerpo del Core (los pide dim2.req07)', $cmp['sobran'] === ['display', 'cuerpo'], json_encode($cmp['sobran']));
$cmp = $comparar_mapas($P_REF['espaciados'], $P1['espaciados']);
$comprobar('ESPACIADOS: los 31 pasos numéricos 10–310 llegan con su valor (piso 31)', $cmp['iguales'] === 31 && $cmp['distintos'] === [] && $cmp['faltan'] === ['gutter'], json_encode($cmp));
$comprobar('ESPACIADOS: lo único que falta es «gutter» (max()/calc(): fuera del ADN, declarado)', $cmp['faltan'] === ['gutter'] && $cmp['sobran'] === []);
$comprobar('LAYOUT: contentSize y wideSize son los de la referencia', ($S1['layout']['contentSize'] ?? '') === '1080px' && ($S1['layout']['wideSize'] ?? '') === '1440px');
$comprobar('CUSTOM.RADIUS: los 6 radios (xs s m l circle pill) son idénticos, con pill=9999px y circle=50%', ($S1['custom']['radius'] ?? null) === $REF['custom']['radius'] && count($REF['custom']['radius']) === 6, json_encode($S1['custom']['radius'] ?? null));
// El resto del custom de la referencia: lo que no llega TIENE que estar declarado como "fuera del ADN".
$perdido = [];
foreach ($hojas($REF['custom']) as $ruta) {
    if ($obtener($S1['custom'] ?? [], $ruta) !== $obtener($REF['custom'], $ruta)) {
        $perdido[] = 'custom.' . $ruta;
    }
}
// Cada entrada de fuera_del_adn() que empieza por settings.custom. es un prefijo de custom (con «a|b» = dos alternativas).
$prefijos_declarados = [];
foreach ($GAP as $g) {
    if (strpos($g, 'settings.custom.') !== 0) {
        continue;
    }
    $ruta_g = substr($g, strlen('settings.'));
    $partes = explode('.', $ruta_g);
    $ultimo = array_pop($partes);
    foreach (explode('|', $ultimo) as $alt) {
        $prefijos_declarados[] = implode('.', array_merge($partes, [$alt])) . '.';
    }
}
$cubre = static function (string $ruta) use ($prefijos_declarados): bool {
    foreach ($prefijos_declarados as $pre) {
        if (strpos($ruta . '.', $pre) === 0) {
            return true;
        }
    }
    return false;
};
$sin_declarar = array_values(array_filter($perdido, static function (string $r) use ($cubre): bool {
    return !$cubre($r);
}));
$comprobar('CUSTOM: lo del custom de la referencia que no llega (' . count($perdido) . ' valores) está TODO declarado en fuera_del_adn()', $perdido !== [] && $sin_declarar === [], json_encode(array_slice($sin_declarar, 0, 8)));
$comprobar('sin los tamaños de fábrica de WordPress (defaultFontSizes y defaultSpacingSizes apagados, como la referencia)', ($S1['typography']['defaultFontSizes'] ?? null) === false && ($S1['spacing']['defaultSpacingSizes'] ?? null) === false && ($REF['typography']['defaultFontSizes'] ?? null) === false);
$comprobar('los tamaños proyectados no son fluidos (fluid:false), como en la referencia', (function () use ($S1) {
    foreach ($S1['typography']['fontSizes']['theme'] ?? [] as $t) {
        if (($t['fluid'] ?? null) !== false) {
            return false;
        }
    }
    return true;
})());
$comprobar('el registro de diseño del destino ya conoce --wp--preset--font-size--170 y --wp--custom--radius--m (el compilador lo acepta)', (function () {
    COD_ADN_Registry::reiniciar();
    return COD_ADN_Registry::tiene('--wp--preset--font-size--170') && COD_ADN_Registry::tiene('--wp--custom--radius--m') && COD_ADN_Registry::tiene('--wp--preset--spacing--310');
})());
$comprobar('CONTROL del control: lo mismo ANTES de importar daba menos (la prueba sabe ver el cambio)', count($P1['tamanos']) > count($P0['tamanos']) && count($P1['espaciados']) > count($P0['espaciados']) && isset($S1['custom']['radius']) && !isset($S0['custom']['radius']));
$estilos = wp_get_global_styles();
$comprobar('ESTILOS: el botón y los enlaces siguen el rol accent (var del preset), el fondo y el texto la página', ($estilos['elements']['button']['color']['background'] ?? '') === 'var(--wp--preset--color--accent)' && ($estilos['elements']['link']['color']['text'] ?? '') === 'var(--wp--preset--color--accent)' && ($estilos['color']['background'] ?? '') === 'var(--wp--preset--color--fondo-pagina)' && ($estilos['color']['text'] ?? '') === 'var(--wp--preset--color--texto-cuerpo)', json_encode([$estilos['elements']['button']['color'] ?? null, $estilos['color'] ?? null]));
$comprobar('ESTILOS: la familia del cuerpo y de los títulos son las de la referencia', ($estilos['typography']['fontFamily'] ?? '') === 'var(--wp--preset--font-family--body)' && ($estilos['elements']['heading']['typography']['fontFamily'] ?? '') === 'var(--wp--preset--font-family--display)');
$comprobar('el archivo del tema sigue atrasado y cod_adn_get lo dice (themeJson: ausente)', COD_ADN_Store::resumen()['proyeccion']['themeJson'] === 'ausente');
$ref_hoja_dest = (string) file_get_contents($archivo_tema);
$comprobar('no se subió ni se tocó ningún archivo de tema (el theme.json del destino es el atrasado, byte a byte)', $ref_hoja_dest === (string) file_get_contents($F_ATRASADO));

// ---------------------------------------------------------------------------
echo "\n== 4. P2.2  COD_Design_Core lee sólo el ADN ==\n";
$nucleo = COD_Design_Core::estado();
$comprobar('faltantes() == []', COD_Design_Core::faltantes() === [], json_encode(COD_Design_Core::faltantes()));
$origenes = array_unique(array_column($nucleo, 'origen'));
$comprobar('estado() devuelve los 8 roles del núcleo, todos con origen adn (así no pasa en vacío)', count($nucleo) === 8 && $origenes === ['adn'], json_encode(array_column($nucleo, 'origen')));
$comprobar('los valores salen de la proyección: accent es una referencia al preset y enter conserva duración y curva', $nucleo['accent']['valor'] === 'var(--wp--preset--color--accent)' && $nucleo['enter']['valor'] === '420ms cubic-bezier(.34,1.56,.64,1)' && $nucleo['response']['valor'] === '160ms ease' && $nucleo['measure']['valor'] === '1080px', json_encode(array_column($nucleo, 'valor')));
$css_nucleo = COD_Design_Core::css();
$comprobar('el :root del núcleo emite los alias --cod-* de la proyección (color, tipografía, ancho, movimiento)', strpos($css_nucleo, '--cod-color-accent:var(--wp--preset--color--accent)') !== false && strpos($css_nucleo, '--cod-color-surface:var(--wp--preset--color--fondo-pagina)') !== false && strpos($css_nucleo, '--cod-font-heading:var(--wp--preset--font-family--display)') !== false && strpos($css_nucleo, '--cod-layout-max-width:1080px') !== false && strpos($css_nucleo, '--cod-motion-enter:420ms cubic-bezier(.34,1.56,.64,1)') !== false, $css_nucleo);
// Un theme.json con otro acento NO le tapa el hueco al ADN: se quita el rol accent del ADN y el núcleo lo ve faltante.
$poner_tema(str_replace('"color": "#F26621"', '"color": "#00FF00"', (string) file_get_contents($F_ATRASADO)));
$comprobar('un theme.json del archivo no vuelve a tapar al ADN (el núcleo sigue leyendo el accent del ADN)', COD_Design_Core::estado()['accent']['origen'] === 'adn' && COD_Design_Core::estado()['accent']['valor'] === 'var(--wp--preset--color--accent)');
$poner_tema((string) file_get_contents($F_ATRASADO));

// ---------------------------------------------------------------------------
echo "\n== 5. el archivo exportado (cod_adn_export) y el filtro dicen lo mismo ==\n";
$repositorio = new COD_Canvas_Document_Repository();
$resolutor = new COD_Template_Region_Resolver($repositorio);
$servicio = new COD_Canvas_MCP_Service($repositorio, new COD_Canvas_Page_Publisher($repositorio, $resolutor, new COD_Dynamic_Token_Resolver()), $resolutor, new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer()), new COD_Canvas_Asset_Resolver());
$exp = COD_ADN_Theme::exportar_theme_json();
$comprobar('exportar_theme_json() genera el theme.json con el sello {designId, revision, digest}', !is_wp_error($exp) && ($exp['datos']['settings']['custom']['adn']['digest'] ?? '') === COD_ADN_Store::puntero()['digest'] && ($exp['datos']['settings']['custom']['adn']['revision'] ?? 0) === 1 && ($exp['datos']['settings']['custom']['adn']['designId'] ?? '') === 'basis-web', $codigo($exp));
$S_filtro = $ajustes();
$styles_filtro = wp_get_global_styles();
if (!is_wp_error($exp)) {
    $poner_tema($exp['json']);
    $comprobar('con el archivo exportado cod_adn_get dice sincronizado y el filtro no superpone nada', COD_ADN_Store::resumen()['proyeccion']['themeJson'] === 'sincronizado');
    $S_archivo = $ajustes();
    $comprobar('LOS MISMOS ajustes con el archivo exportado (sincronizado) que con el filtro sobre el archivo atrasado', wp_json_encode($S_archivo) === wp_json_encode($S_filtro), 'difieren: ' . implode(', ', array_slice(array_keys(array_diff_assoc(array_map('wp_json_encode', $S_archivo), array_map('wp_json_encode', $S_filtro))), 0, 6)));
    $comprobar('LOS MISMOS estilos globales con el archivo exportado que con el filtro', wp_json_encode(wp_get_global_styles()) === wp_json_encode($styles_filtro));
    $sobre_local = COD_ADN_Theme::exportar_theme_json($F_LOCAL);
    $comprobar('el archivo exportado conserva lo que el ADN no toca: sobre la base completa de Basis quedan las sombras, los degradados y el custom.form', !is_wp_error($sobre_local) && $sobre_local['datos']['settings']['shadow'] === $ref_tema['settings']['shadow'] && $sobre_local['datos']['settings']['color']['gradients'] === $ref_tema['settings']['color']['gradients'] && $sobre_local['datos']['settings']['custom']['form'] === $ref_tema['settings']['custom']['form'] && $sobre_local['datos']['settings']['custom']['border'] === $ref_tema['settings']['custom']['border'], $codigo($sobre_local));
    $comprobar('y sobre la base completa los presets del ADN reemplazan a los del archivo (no se duplican): 22 tamaños (20 + display + cuerpo) y 12 colores (las 2 transparencias salen de Configuración, no del ADN)', !is_wp_error($sobre_local) && count($sobre_local['datos']['settings']['typography']['fontSizes']) === 22 && count($sobre_local['datos']['settings']['color']['palette']) === 12);
    // CONTROL: un archivo con el sello de OTRA revisión se considera adelantado y el filtro superpone.
    $falso = $exp['datos'];
    $falso['settings']['custom']['adn']['digest'] = str_repeat('0', 64);
    $poner_tema((string) wp_json_encode($falso));
    $comprobar('CONTROL: un archivo con el sello de otra revisión es "adelantado" y el filtro lo superpone', COD_ADN_Store::resumen()['proyeccion']['themeJson'] === 'adelantado');
}
$poner_tema((string) file_get_contents($F_ATRASADO));
$via_mcp = $servicio->call_tool('cod_adn_export', ['formato' => 'theme-json']);
$comprobar('cod_adn_export (MCP, formato theme-json) devuelve el mismo archivo que exportar_theme_json()', !is_wp_error($via_mcp) && !is_wp_error($exp) && $via_mcp['json'] === $exp['json'], $codigo($via_mcp));
$via_contrato = $servicio->call_tool('cod_adn_export', ['formato' => 'contract']);
$comprobar('cod_adn_export (MCP, formato contract) devuelve el contrato de la revisión activa', !is_wp_error($via_contrato) && $via_contrato['revision'] === 1 && strpos($via_contrato['json'], '"dim4.req02.def1"') !== false, $codigo($via_contrato));
$comprobar('cod_adn_export rechaza un formato desconocido y argumentos de más', $codigo($servicio->call_tool('cod_adn_export', ['formato' => 'xml'])) === 'cod_mcp_invalid_arguments' && $codigo($servicio->call_tool('cod_adn_export', ['formato' => 'contract', 'x' => 1])) === 'cod_mcp_invalid_arguments');
$comprobar('cod_adn_export no escribe nada: la herramienta está clasificada de lectura', (function () use ($servicio) {
    foreach ($servicio->tool_definitions() as $t) {
        if ($t['name'] === 'cod_adn_export') {
            return !empty($t['annotations']['readOnlyHint']);
        }
    }
    return false;
})());

// ---------------------------------------------------------------------------
echo "\n== 6. P2.3  cambiar accent en el ADN (r2) cambia todo de una vez ==\n";
$r2 = json_decode($adn_r1, false);
$r2->design->revision = 2;
foreach ($r2->definitions as $d) {
    if ($d->id === 'dim1.req01.def1') {
        foreach ($d->value->institucionales as $c) {
            if ($c->name === 'Accent') {
                $c->value = '#123456';
            }
        }
    }
}
$json_r2 = (string) json_encode($r2, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
$antes_ajustes = $ajustes();
$antes_plano = COD_Theme_Definitions::get()['color_accent'];
$antes_css = COD_Design_Core::css() . COD_Theme_Definitions::css();
$rr = $importar($json_r2, 1);
$comprobar('la revisión 2 (con otro accent) se importa en una sola operación', !is_wp_error($rr) && $rr['revision'] === 2, $codigo($rr));
$despues = $ajustes();
$pal = $presets($despues)['paleta'];
$comprobar('--wp--preset--color--accent cambió en el theme.json que sirve WordPress', ($pal['accent'] ?? '') === '#123456' && ($presets($antes_ajustes)['paleta']['accent'] ?? '') === '#F26621', json_encode([$presets($antes_ajustes)['paleta']['accent'] ?? null, $pal['accent'] ?? null]));
$comprobar('color_accent (almacén plano) cambió a #123456', COD_Theme_Definitions::get()['color_accent'] === '#123456' && $antes_plano === '#F26621', $antes_plano . ' -> ' . COD_Theme_Definitions::get()['color_accent']);
$comprobar('--cod-color-accent sigue siendo el alias del preset (así que cambia con él) y el botón del theme.json lo usa', strpos(COD_Design_Core::css(), '--cod-color-accent:var(--wp--preset--color--accent)') !== false && (wp_get_global_styles()['elements']['button']['color']['background'] ?? '') === 'var(--wp--preset--color--accent)');
$comprobar('el :root de Configuración emite el acento nuevo y no el viejo', strpos(COD_Theme_Definitions::css(), '--cod-color-accent:#123456') !== false && strpos($antes_css, '--cod-color-accent:#F26621') !== false);
$comprobar('lo demás no se movió (las otras 11 paletas, los 20 tamaños, los 31 espaciados)', (function () use ($despues, $antes_ajustes, $presets) {
    $a = $presets($antes_ajustes);
    $d = $presets($despues);
    unset($a['paleta']['accent'], $d['paleta']['accent']);
    return $a === $d;
})());
$comprobar('CONTROL: sin importar la revisión nueva el valor no habría cambiado (r1 daba #F26621)', ($presets($antes_ajustes)['paleta']['accent'] ?? '') === '#F26621');

// ---------------------------------------------------------------------------
echo "\n== 7. P2.4  toda escritura de cod_theme_definitions distinta de la proyección falla ==\n";
// La opción se prepara SIN ADN activo (ahí se escribe libre) y se vuelve a activar el ADN.
$puntero_guardado = get_option(COD_ADN_Store::OPCION_PUNTERO);
delete_option(COD_ADN_Store::OPCION_PUNTERO);
$pantalla = static function (): string {
    wp_set_current_user(1);
    ob_start();
    (new COD_Settings_Admin())->render_page();
    return (string) ob_get_clean();
};
$html_sin_adn = $pantalla();
$comprobar('CONTROL: sin ADN la pantalla de Configuración no deshabilita ningún campo ni dice "Gobernado por"', substr_count($html_sin_adn, 'fieldset disabled') === 0 && strpos($html_sin_adn, 'Gobernado por') === false && strpos($html_sin_adn, 'id="cod-settings-color_accent"') !== false);
$base_def = ['color_accent' => '#F26621', 'color_bg' => '#FFFFFF', 'scale_border' => 'hairline=1px', 'radius' => ''];
$comprobar('CONTROL: sin ADN, escribir color_accent directo funciona (el candado no bloquea todo)', update_option(COD_Theme_Definitions::OPTION_KEY, wp_json_encode($base_def), false) === true || get_option(COD_Theme_Definitions::OPTION_KEY) === wp_json_encode($base_def));
$cambiado = $base_def;
$cambiado['color_accent'] = '#000000';
$comprobar('CONTROL: sin ADN el cambio de color_accent queda guardado', update_option(COD_Theme_Definitions::OPTION_KEY, wp_json_encode($cambiado), false) === true && json_decode((string) get_option(COD_Theme_Definitions::OPTION_KEY), true)['color_accent'] === '#000000');
update_option(COD_Theme_Definitions::OPTION_KEY, wp_json_encode($base_def), false);
update_option(COD_ADN_Store::OPCION_PUNTERO, $puntero_guardado, true);
$guardado0 = get_option(COD_Theme_Definitions::OPTION_KEY);
$comprobar('con ADN, la pantalla muestra los campos gobernados (gobernados() trae el accent del ADN)', (COD_Theme_Definitions::gobernados()['color_accent'] ?? '') === '#123456' && COD_Theme_Definitions::rotulo_de_gobierno() === 'ADN `basis-web` r2', COD_Theme_Definitions::rotulo_de_gobierno());
$html_adn = $pantalla();
$comprobar('con ADN la pantalla de Configuración es de sólo lectura en los campos gobernados: «Gobernado por ADN `basis-web` r2» y un fieldset deshabilitado por campo', substr_count($html_adn, 'fieldset disabled') === count(COD_Theme_Definitions::gobernados()) && substr_count($html_adn, 'Gobernado por ADN `basis-web` r2') >= count(COD_Theme_Definitions::gobernados()) && strpos($html_adn, 'id="cod-settings-scale_border"') !== false, 'fieldsets ' . substr_count($html_adn, 'fieldset disabled') . ' vs ' . count(COD_Theme_Definitions::gobernados()));
$comprobar('con ADN la tabla del núcleo muestra el origen adn y ningún faltante', strpos($html_adn, '<td>adn</td>') !== false && strpos($html_adn, 'sin declarar') === false);
$comprobar('a) update_option directo con otro color_accent falla y la opción queda igual', update_option(COD_Theme_Definitions::OPTION_KEY, wp_json_encode($cambiado), false) === false && get_option(COD_Theme_Definitions::OPTION_KEY) === $guardado0);
$cambiado_bg = $base_def;
$cambiado_bg['color_bg'] = '#abcdef';
$comprobar('b) lo mismo con color_bg (otro campo gobernado)', update_option(COD_Theme_Definitions::OPTION_KEY, wp_json_encode($cambiado_bg), false) === false && get_option(COD_Theme_Definitions::OPTION_KEY) === $guardado0);
$comprobar('c) el formulario de Configuración (respetar_gobierno) no cambia un campo gobernado aunque lo mande', (function () use ($base_def) {
    $enviado = COD_Theme_Definitions::sanitize(['color_accent' => '#000000', 'color_bg' => '#111111', 'scale_border' => 'hairline=1px; thick=2px']);
    $resultado = COD_Theme_Definitions::respetar_gobierno($enviado);
    return $resultado['color_accent'] === '#F26621' && $resultado['color_bg'] === '#FFFFFF' && $resultado['scale_border'] === 'hairline=1px; thick=2px';
})());
$otro = $base_def;
$otro['scale_border'] = 'hairline=1px; thick=2px';
$comprobar('d) lo que el ADN NO gobierna sí se escribe (scale_border)', update_option(COD_Theme_Definitions::OPTION_KEY, wp_json_encode($otro), false) === true && json_decode((string) get_option(COD_Theme_Definitions::OPTION_KEY), true)['scale_border'] === 'hairline=1px; thick=2px');
$comprobar('e) COD_Theme_Definitions::get() devuelve el valor del ADN, no el de la opción guardada', COD_Theme_Definitions::get()['color_accent'] === '#123456' && json_decode((string) get_option(COD_Theme_Definitions::OPTION_KEY), true)['color_accent'] === '#F26621');
delete_option(COD_Theme_Definitions::OPTION_KEY);
$comprobar('f) borrar la opción no cambia lo servido: los campos gobernados siguen saliendo de la proyección', COD_Theme_Definitions::get()['color_accent'] === '#123456' && COD_Theme_Definitions::get()['color_bg'] === '#FFFFFF' && COD_Theme_Definitions::get()['font_body'] === 'Open Sans');
$escritores = [];
foreach (glob($repo_dir . '/includes/*.php') as $archivo) {
    if (preg_match('/update_option\s*\(\s*COD_Theme_Definitions::OPTION_KEY|update_option\s*\(\s*[\'"]cod_theme_definitions[\'"]/', (string) file_get_contents($archivo)) === 1) {
        $escritores[] = basename($archivo);
    }
}
$comprobar('g) estático: el único código del plugin que escribe la opción es el formulario de Configuración, y pasa por respetar_gobierno', $escritores === ['class-cod-settings-admin.php'] && strpos((string) file_get_contents($repo_dir . '/includes/class-cod-settings-admin.php'), 'respetar_gobierno(') !== false, implode(', ', $escritores));

// ---------------------------------------------------------------------------
echo "\n== 8. mapeos que F1 dejó sin fijar (documentados en ESPEC 3.6) ==\n";
$contrato_de = static function (callable $retoque): array {
    global $adn_r1;
    $c = json_decode($adn_r1, false);
    $retoque($c);
    $json = (string) json_encode($c, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    $v = COD_ADN_Validator::validar($json, ['emitirPropuestas' => false]);
    if (!$v['ok']) {
        return ['error' => json_encode($v['errores'][0] ?? 'inválido')];
    }
    $p = COD_ADN_Projection::construir($v['contrato'], $v);
    return is_wp_error($p) ? ['error' => $p->get_error_message()] : $p;
};
$p = $contrato_de(static function ($c) {
    foreach ($c->definitions as $d) {
        if ($d->id === 'dim1.req02.def1') {
            $d->value->roleColors[] = (object) ['role' => 'border', 'color' => (object) ['refReqId' => 'dim1.req01', 'refPath' => ['neutros', 0, 'value']], 'source' => 'prueba', 'derivation' => (object) ['of' => 'dim1.req01']];
            $d->value->roleColors[] = (object) ['role' => 'error', 'color' => '#E02B20', 'source' => 'prueba', 'derivation' => (object) ['of' => 'direct', 'rule' => 'literal de prueba']];
        }
    }
});
$reg = $p['registro'] ?? [];
$comprobar('rol de color Core `surface` -> --cod-color-primary (no pisa --cod-color-surface, que es el fondo)', ($reg['--cod-color-primary']['valor'] ?? '') === 'var(--wp--preset--color--gris)' && ($reg['--cod-color-surface']['valor'] ?? '') === 'var(--wp--preset--color--fondo-pagina)', json_encode([$reg['--cod-color-primary']['valor'] ?? null, $reg['--cod-color-surface']['valor'] ?? null]) . ($p['error'] ?? ''));
$comprobar('roles de color fuera de los tres alias: border -> --cod-color-border, error -> --cod-color-error', ($reg['--cod-color-border']['valor'] ?? '') !== '' && ($reg['--cod-color-error']['valor'] ?? '') === '#E02B20', json_encode([$reg['--cod-color-border'] ?? null, $reg['--cod-color-error'] ?? null]));
$comprobar('roles de color: background/text/accent -> surface/ink/accent', ($reg['--cod-color-ink']['valor'] ?? '') === 'var(--wp--preset--color--texto-cuerpo)' && ($reg['--cod-color-accent']['valor'] ?? '') === 'var(--wp--preset--color--accent)');
$comprobar('forma con rol = referencia genérica a dim4.req01: el nombre sale de lo que la ruta alcanza (--wp--custom--radius--xs…pill)', isset($reg['--wp--custom--radius--xs'], $reg['--wp--custom--radius--m'], $reg['--wp--custom--radius--pill'], $reg['--wp--custom--radius--circle']));
$comprobar('pill -> 9999px, circle -> 50%, longitud -> su radioValor', ($reg['--wp--custom--radius--pill']['valor'] ?? '') === '9999px' && ($reg['--wp--custom--radius--circle']['valor'] ?? '') === '50%' && ($reg['--wp--custom--radius--m']['valor'] ?? '') === '8px');
$c_nombres = json_decode($adn_r1, false);
$ref_a = static function (array $ruta): stdClass {
    return (object) ['refReqId' => 'dim4.req01', 'refPath' => $ruta];
};
$comprobar('nombre de una forma: la ruta alcanza un texto -> ese texto', COD_ADN_Projection::nombre_de_ref($c_nombres, $ref_a(['roles', 2, 'nombre'])) === 'm');
$comprobar('nombre de una forma: la ruta termina en un objeto y en un índice -> null (quien llama pone forma-<n>), nunca el número', COD_ADN_Projection::nombre_de_ref($c_nombres, $ref_a(['roles', 2])) === null);
$comprobar('nombre de una forma: ruta que no existe y termina en una palabra de estructura (nombre) -> null', COD_ADN_Projection::nombre_de_ref($c_nombres, $ref_a(['roles', 99, 'nombre'])) === null);
$comprobar('nombre de una forma: ruta que no existe pero termina en un nombre propio -> ese nombre', COD_ADN_Projection::nombre_de_ref($c_nombres, $ref_a(['roles', 'pill-grande'])) === 'pill-grande');
$comprobar('nombre de una forma: la referencia puede ser a CUALQUIER requisito del contrato, no sólo a los proyectados', COD_ADN_Projection::nombre_de_ref($c_nombres, (object) ['refReqId' => 'dim1.req01', 'refPath' => ['neutros', 1, 'name']]) === 'Gris');
$p = $contrato_de(static function ($c) {
    foreach ($c->definitions as $d) {
        if ($d->id === 'dim4.req02.def1') {
            unset($d->value->formas[3]->radioValor);
        }
    }
});
$reg = $p['registro'] ?? [];
$comprobar('radio "longitud" sin radioValor: se omite y avisa ADN_RADIO_SIN_VALOR (no inventa un valor)', in_array('ADN_RADIO_SIN_VALOR', array_column($p['avisos'] ?? [], 'codigo'), true) && !isset($reg['--wp--custom--radius--l']) && isset($reg['--wp--custom--radius--m']), ($p['error'] ?? '') . json_encode(array_column($p['avisos'] ?? [], 'codigo')));

// ---------------------------------------------------------------------------
echo "\n== 9. Q1(a): roles tipográficos abiertos, con control ==\n";
$comprobar('un rol con nombre libre ("10", "display") cumple la forma; uno vacío o con símbolos no', COD_ADN_Requisitos::slug_de_rol('10') === '10' && COD_ADN_Requisitos::slug_de_rol('Título grande') === 'titulo-grande' && COD_ADN_Requisitos::slug_de_rol('') === '' && COD_ADN_Requisitos::slug_de_rol('!!!') === '' && COD_ADN_Requisitos::slug_de_rol('a;b') === '');
$p = $contrato_de(static function ($c) {
    foreach ($c->definitions as $d) {
        if ($d->id === 'dim2.req02.def1') {
            $d->value->roleStyles[] = (object) ['role' => '!!!', 'family' => 'X', 'fontSize' => '10px', 'fontWeight' => 400, 'lineHeight' => 1.2, 'source' => 'p', 'derivation' => (object) ['of' => 'direct']];
        }
    }
});
$comprobar('CONTROL: un rol cuyo nombre no da slug se rechaza con ADN_PAYLOAD_SHAPE', isset($p['error']) && strpos($p['error'], 'ADN_PAYLOAD_SHAPE') !== false, $p['error'] ?? 'no falló');
$p = $contrato_de(static function ($c) {
    foreach ($c->definitions as $d) {
        if ($d->id === 'dim2.req02.def1') {
            $d->value->roleStyles[] = (object) ['role' => 'Display', 'family' => 'X', 'fontSize' => '10px', 'fontWeight' => 400, 'lineHeight' => 1.2, 'source' => 'p', 'derivation' => (object) ['of' => 'direct']];
        }
    }
});
$comprobar('dos roles que dan el mismo slug (display / Display) no se pisan: el segundo queda display-2 y se avisa (R3)', isset($p['registro']['--wp--preset--font-size--display-2']) && in_array('ADN_SLUG_COLLISION', array_column($p['avisos'] ?? [], 'codigo'), true), json_encode(array_column($p['avisos'] ?? [], 'codigo')) . ($p['error'] ?? ''));

echo "\n";
echo $fallas === 0 ? "TODO VERDE ($ejecutadas comprobaciones)\n" : "FALLARON $fallas de $ejecutadas\n";
exit($fallas === 0 ? 0 : 1);
