<?php
/**
 * Candado de escritura de una página en bloques (COD_Block_Page_Writer::write), con DOS O TRES PROCESOS PHP
 * sincronizados por archivos de barrera, contra el WordPress LOCAL de Basis (puerto 8894).
 *
 * Defecto que cubre: el candado `cod_bp_lock_<pageId>` se tomaba con get_option() + update_option() (comprobar y
 * escribir en dos pasos, con una ventana en medio): dos procesos podían pasar a la vez y escribir la misma página.
 * Y la revisión esperada se comparaba ANTES del candado, así que una escritura con una revisión vieja que esperaba
 * el candado lo pisaba al entrar (actualización perdida).
 *
 *   (a) DETERMINISTA, sin azar: A se detiene en la ventana exacta entre «miré si el candado existe» y «lo escribí»
 *       (gancho `add_option` con el código viejo, `cod_mutex_punto` con COD_Mutex); mientras tanto B toma el candado
 *       de verdad, lee la revisión y se detiene DENTRO de la sección crítica (filtro `wp_insert_post_data`). Cuando
 *       A sigue, NO debe obtener el candado (cod_mcp_page_busy). Con el código viejo los dos obtienen el candado y
 *       los dos escriben: LA PRUEBA FALLA si las dos escrituras con la misma revisión base tienen éxito.
 *   (b) DETERMINISTA: A pasó la primera comparación de revisión (0) y se detiene antes de tomar el candado; otro
 *       proceso escribe y suelta (revisión 1); A sigue, toma el candado libre y debe ser RECHAZADA por conflicto de
 *       revisión (la revisión se recompara dentro del candado), sin pisar lo escrito.
 *   (c) Compatibilidad con candados guardados en el formato antiguo (un entero `time()` pelado en la opción): uno
 *       vencido se recupera y la escritura pasa; uno vigente la deja «ocupada» y no se toca; y el valor nuevo se lee
 *       con `(int)` como la hora de la toma, igual que lo leía el código antiguo.
 *   (d) COD_Mutex::tomar_o_recuperar_vencido: sin TTL de marca de tiempo conserva su comportamiento (un entero
 *       pelado nunca vence); con TTL, vence por edad; el JSON con `expiresAt` sigue igual.
 *
 * Es INDEPENDIENTE del ADN: fija COD_ADN_GATE_MODE='off' en cada proceso (no toca la opción del modo ni el puntero,
 * que otros scripts comparten en la misma base). Nunca corre contra Santa Luisa, Econut ni producción.
 *
 * Uso:  php scripts/probar-bloqueo-pagina-bloques.php
 *       COD_PRUEBA_CODIGO_VIEJO=1 php scripts/probar-bloqueo-pagina-bloques.php   (omite la precondición de
 *       «lo instalado es lo del repositorio», para demostrar que la prueba FALLA contra el código anterior)
 *       (los hijos los lanza el propio script: --hijo <rol> <carpeta-de-barreras> <pageId> <revisión-esperada>)
 */
if (!defined('COD_ADN_GATE_MODE')) {
    define('COD_ADN_GATE_MODE', 'off');
}
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

const PREFIJO_CANDADO = 'cod_bp_lock_';

function barrera_poner(string $dir, string $nombre): void
{
    file_put_contents($dir . '/' . $nombre, (string) microtime(true));
}

function barrera_esperar(string $dir, string $nombre, float $segundos = 40.0): bool
{
    $fin = microtime(true) + $segundos;
    while (microtime(true) < $fin) {
        if (is_file($dir . '/' . $nombre)) {
            return true;
        }
        usleep(40000);
    }
    return false;
}

function contenido_de_prueba(string $texto): string
{
    return '<!-- wp:paragraph --><p>' . $texto . '</p><!-- /wp:paragraph -->';
}

function resultado_de($r): array
{
    if (is_wp_error($r)) {
        return ['ok' => false, 'codigo' => $r->get_error_code()];
    }
    return ['ok' => true, 'codigo' => 'ok', 'revision' => (int) ($r['revision'] ?? -1)];
}

// ---------------------------------------------------------------------------
// MODO HIJO
// ---------------------------------------------------------------------------
$hijo = array_search('--hijo', $argv, true);
if ($hijo !== false) {
    $rol = (string) ($argv[$hijo + 1] ?? '');
    $dir = (string) ($argv[$hijo + 2] ?? '');
    $page_id = (int) ($argv[$hijo + 3] ?? 0);
    $esperada = (int) ($argv[$hijo + 4] ?? 0);
    $salida = ['rol' => $rol, 'ok' => false, 'codigo' => 'sin-ejecutar'];
    try {
        $escritor = new COD_Block_Page_Writer();
        $args = ['pageId' => $page_id, 'expectedRevision' => $esperada, 'content' => contenido_de_prueba('escritor ' . $rol)];
        if ($rol === 'ventana') {
            // Se detiene en la VENTANA de la toma del candado (después de mirar, antes de escribir).
            $una_vez = false;
            $ventana = static function (...$a) use ($dir, &$una_vez): void {
                $nombre = (string) ($a[0] ?? '');
                if ($nombre === 'antes-de-insertar') {
                    $nombre = (string) ($a[1] ?? ''); // cod_mutex_punto(punto, opción)
                }
                if ($una_vez || strpos($nombre, PREFIJO_CANDADO) !== 0) {
                    return;
                }
                $una_vez = true;
                barrera_poner($dir, 'en-ventana');
                barrera_esperar($dir, 'sigue-ventana');
            };
            add_action('add_option', $ventana, 10, 2);      // código viejo: update_option() -> add_option()
            add_action('cod_mutex_punto', $ventana, 10, 2); // código nuevo: COD_Mutex::tomar()
            $salida = resultado_de($escritor->write($args));
        } elseif ($rol === 'guardia') {
            // Ya TIENE el candado y leyó la revisión; se detiene justo antes de guardar la página.
            add_filter('wp_insert_post_data', static function ($datos) use ($dir) {
                barrera_poner($dir, 'dentro-guardia');
                barrera_esperar($dir, 'soltar-guardia');
                return $datos;
            });
            $salida = resultado_de($escritor->write($args));
        } else { // 'rapido': escribe y listo
            $salida = resultado_de($escritor->write($args));
        }
    } catch (Throwable $e) {
        $salida = ['ok' => false, 'codigo' => 'EXCEPCION: ' . $e->getMessage()];
    }
    file_put_contents($dir . '/resultado-' . $rol . '.json', json_encode($salida));
    exit(0);
}

// ---------------------------------------------------------------------------
// MODO PADRE
// ---------------------------------------------------------------------------
global $wpdb;
$fallas = 0;
$ejecutadas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas, &$ejecutadas): void {
    ++$ejecutadas;
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? '   -> ' . $detalle : '') . "\n";
    if (!$ok) {
        ++$fallas;
    }
};

echo "\n== 0. precondiciones ==\n";
$repo_dir = realpath(__DIR__ . '/../contope-publisher');
$inst_dir = rtrim((string) COD_PUBLISHER_DIR, '/\\');
$viejo = getenv('COD_PRUEBA_CODIGO_VIEJO') === '1';
$desiguales = [];
foreach (['includes/class-cod-mutex.php', 'includes/class-cod-block-page-writer.php'] as $rel) {
    $a = $repo_dir . '/' . $rel;
    $b = $inst_dir . substr($a, strlen($repo_dir));
    if (!is_file($b) || md5_file($a) !== md5_file($b)) {
        $desiguales[] = basename($a);
    }
}
if ($viejo) {
    echo "  AVISO  COD_PRUEBA_CODIGO_VIEJO=1: no se exige que lo instalado sea lo del repositorio (" . ($desiguales === [] ? 'pero es igual' : 'difiere: ' . implode(', ', $desiguales)) . ")\n";
} else {
    $comprobar('lo instalado en el local es lo que hay en el repositorio', $desiguales === [], implode(', ', $desiguales));
    if ($desiguales !== []) {
        echo "\n  No se corre: el plugin instalado no es el del repositorio.\n";
        exit(1);
    }
}
$comprobar('este proceso tiene la compuerta del ADN apagada por constante (la prueba no depende del ADN)', COD_ADN_Gate::modo() === 'off', COD_ADN_Gate::modo());

$dir = sys_get_temp_dir() . '/bp-lock-' . bin2hex(random_bytes(4));
mkdir($dir, 0777, true);
$paginas = [];
$limpiar = static function () use (&$paginas, $dir): void {
    foreach ($paginas as $id) {
        if (COD_Mutex::leer(PREFIJO_CANDADO . $id) !== null) {
            delete_option(PREFIJO_CANDADO . $id);
        }
        wp_delete_post((int) $id, true);
    }
    $paginas = [];
    foreach ((array) glob($dir . '/*') as $f) {
        @unlink($f);
    }
    @rmdir($dir);
};
register_shutdown_function($limpiar);

$lanzar = static function (string $rol, int $page_id, int $esperada) use ($dir) {
    $cmd = [PHP_BINARY];
    $ini = php_ini_loaded_file();
    if (is_string($ini) && $ini !== '') {
        array_push($cmd, '-c', $ini);
    }
    array_push($cmd, __FILE__, '--hijo', $rol, $dir, (string) $page_id, (string) $esperada);
    $proc = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['file', $dir . '/salida-' . $rol . '.txt', 'w'], 2 => ['file', $dir . '/error-' . $rol . '.txt', 'w']], $pipes);
    if (!is_resource($proc)) {
        throw new RuntimeException('no se pudo lanzar el hijo ' . $rol);
    }
    fclose($pipes[0]);
    return $proc;
};
$esperar_hijo = static function ($proc, string $rol) use ($dir): array {
    proc_close($proc);
    $archivo = $dir . '/resultado-' . $rol . '.json';
    $dato = is_file($archivo) ? json_decode((string) file_get_contents($archivo), true) : null;
    return is_array($dato) ? $dato : ['ok' => false, 'codigo' => 'el hijo no dejó resultado: ' . substr((string) @file_get_contents($dir . '/error-' . $rol . '.txt'), 0, 300)];
};
$limpiar_barreras = static function () use ($dir): void {
    foreach ((array) glob($dir . '/*') as $f) {
        @unlink($f);
    }
};
$nueva_pagina = static function (string $titulo) use (&$paginas): int {
    $id = (int) wp_insert_post(['post_type' => 'page', 'post_status' => 'draft', 'post_title' => $titulo, 'post_content' => contenido_de_prueba('inicial')]);
    $paginas[] = $id;
    return $id;
};
// Directo de la base: la caché de metadatos de ESTE proceso no ve lo que escribió otro.
$rev_de = static function (int $id) use ($wpdb): int {
    return (int) $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s", $id, COD_Block_Page_Writer::META_REVISION));
};
$contenido_de = static function (int $id) use ($wpdb): string {
    return (string) $wpdb->get_var($wpdb->prepare("SELECT post_content FROM {$wpdb->posts} WHERE ID = %d", $id));
};
$candado_de = static function (int $id): ?string {
    return COD_Mutex::leer(PREFIJO_CANDADO . $id);
};

try {
    // -----------------------------------------------------------------
    echo "\n== (a) DETERMINISTA: A detenido entre «miré» y «escribí» del candado; B ya lo tiene ==\n";
    $pa = $nueva_pagina('prueba candado a');
    $limpiar_barreras();
    $ha = $lanzar('ventana', $pa, 0);
    $comprobar('A está detenido EN LA VENTANA del candado de la página (miró, aún no escribió)', barrera_esperar($dir, 'en-ventana'));
    $hb = $lanzar('guardia', $pa, 0);
    $comprobar('B toma el candado, LEYÓ la revisión 0 y está detenido antes de guardar', barrera_esperar($dir, 'dentro-guardia'));
    $valor_b = $candado_de($pa);
    $comprobar('el candado de la base es de B y su valor se lee con (int) como la hora de la toma (compatible con el lector antiguo)', $valor_b !== null && abs((int) $valor_b - time()) <= 10, var_export($valor_b, true));
    barrera_poner($dir, 'sigue-ventana');
    $ra = $esperar_hijo($ha, 'ventana');
    $comprobar('A, que sigue después de que B ya tiene el candado, NO lo obtiene (cod_mcp_page_busy)', $ra['ok'] === false && $ra['codigo'] === 'cod_mcp_page_busy', json_encode($ra));
    $comprobar('y A no pisó el candado de B', $candado_de($pa) === $valor_b, var_export($candado_de($pa), true));
    barrera_poner($dir, 'soltar-guardia');
    $rb = $esperar_hijo($hb, 'guardia');
    $comprobar('de las dos escrituras con la misma revisión base tuvo éxito EXACTAMENTE una (B), y la revisión es 1', $rb['ok'] === true && (int) $ra['ok'] + (int) $rb['ok'] === 1 && $rev_de($pa) === 1, json_encode([$ra, $rb]) . ' revisión ' . $rev_de($pa));
    $comprobar('el contenido guardado es el de B', strpos($contenido_de($pa), 'escritor guardia') !== false, $contenido_de($pa));
    $comprobar('y no quedó ningún candado colgado', $candado_de($pa) === null, var_export($candado_de($pa), true));

    // -----------------------------------------------------------------
    echo "\n== (b) DETERMINISTA: revisión vieja que espera el candado ==\n";
    $pb = $nueva_pagina('prueba candado b');
    $limpiar_barreras();
    $ha = $lanzar('ventana', $pb, 0);
    $comprobar('A pasó la comparación de revisión (0) y está detenido antes de tomar el candado', barrera_esperar($dir, 'en-ventana'));
    $hc = $lanzar('rapido', $pb, 0);
    $rc = $esperar_hijo($hc, 'rapido');
    $comprobar('otro proceso escribe con la revisión 0 y suelta: éxito, revisión 1', $rc['ok'] === true && $rev_de($pb) === 1, json_encode($rc) . ' revisión ' . $rev_de($pb));
    barrera_poner($dir, 'sigue-ventana');
    $ra = $esperar_hijo($ha, 'ventana');
    $comprobar('A, con la revisión 0 ya vieja, es RECHAZADA por conflicto de revisión (no pisa lo escrito)', $ra['ok'] === false && $ra['codigo'] === 'cod_mcp_revision_conflict', json_encode($ra));
    $comprobar('la revisión sigue en 1 y el contenido es el del otro proceso', $rev_de($pb) === 1 && strpos($contenido_de($pb), 'escritor rapido') !== false, $contenido_de($pb));
    $comprobar('y el rechazo dentro del candado lo soltó (ningún candado colgado)', $candado_de($pb) === null, var_export($candado_de($pb), true));

    // -----------------------------------------------------------------
    echo "\n== (c) compatibilidad con candados en el formato antiguo (entero pelado) ==\n";
    $pc = $nueva_pagina('prueba candado c');
    $escritor = new COD_Block_Page_Writer();
    $opc = PREFIJO_CANDADO . $pc;
    $viejo_vencido = (string) (time() - 120);
    COD_Mutex::tomar($opc, $viejo_vencido);
    $r = $escritor->write(['pageId' => $pc, 'expectedRevision' => 0, 'content' => contenido_de_prueba('tras vencido')]);
    $comprobar('con un candado antiguo VENCIDO (hace 120 s) la escritura pasa', !is_wp_error($r) && $rev_de($pc) === 1, is_wp_error($r) ? $r->get_error_code() : '');
    $comprobar('y el candado antiguo desapareció (no queda colgado)', $candado_de($pc) === null, var_export($candado_de($pc), true));
    $viejo_vigente = (string) (time() - 5);
    COD_Mutex::tomar($opc, $viejo_vigente);
    $r = $escritor->write(['pageId' => $pc, 'expectedRevision' => 1, 'content' => contenido_de_prueba('con vigente')]);
    $comprobar('con un candado antiguo VIGENTE (hace 5 s) la escritura queda «ocupada» (cod_mcp_page_busy)', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_page_busy', is_wp_error($r) ? $r->get_error_code() : 'pasó');
    $comprobar('y no se tocó ni el candado antiguo ni la página (revisión 1)', $candado_de($pc) === $viejo_vigente && $rev_de($pc) === 1, var_export($candado_de($pc), true));
    COD_Mutex::soltar($opc, $viejo_vigente);
    $r = $escritor->write(['pageId' => $pc, 'expectedRevision' => 1, 'content' => contenido_de_prueba('sin candado')]);
    $comprobar('control: sin candado, la misma escritura con la revisión correcta pasa (revisión 2)', !is_wp_error($r) && $rev_de($pc) === 2 && $candado_de($pc) === null);
    $r = $escritor->write(['pageId' => $pc, 'expectedRevision' => 1, 'content' => contenido_de_prueba('vieja')]);
    $comprobar('secuencial: con la revisión vieja (1) falla con conflicto y no deja candado', is_wp_error($r) && $r->get_error_code() === 'cod_mcp_revision_conflict' && $candado_de($pc) === null, is_wp_error($r) ? $r->get_error_code() : 'pasó');

    // -----------------------------------------------------------------
    echo "\n== (d) COD_Mutex::tomar_o_recuperar_vencido con marca de tiempo ==\n";
    $m = 'cod_bp_lock_prueba_mutex';
    $v1 = time() . ':uno';
    $v2 = time() . ':dos';
    $pelado_viejo = (string) (time() - 500);
    COD_Mutex::tomar($m, $pelado_viejo);
    $comprobar('SIN ttl, un entero pelado viejo NO vence (comportamiento previo)', COD_Mutex::tomar_o_recuperar_vencido($m, $v1) === false && COD_Mutex::leer($m) === $pelado_viejo);
    $comprobar('CON ttl 30, ese mismo entero vence y se recupera', COD_Mutex::tomar_o_recuperar_vencido($m, $v1, 30) === true && COD_Mutex::leer($m) === $v1);
    $comprobar('CON ttl 30, el valor nuevo «hora:token» vigente NO se recupera', COD_Mutex::tomar_o_recuperar_vencido($m, $v2, 30) === false && COD_Mutex::leer($m) === $v1);
    COD_Mutex::soltar($m, $v1);
    COD_Mutex::tomar($m, (string) (time() - 500) . ':viejo');
    $comprobar('CON ttl 30, un «hora:token» viejo vence', COD_Mutex::tomar_o_recuperar_vencido($m, $v2, 30) === true && COD_Mutex::leer($m) === $v2);
    COD_Mutex::soltar($m, $v2);
    $json_vencido = wp_json_encode(['token' => 'x', 'expiresAt' => time() - 5]);
    COD_Mutex::tomar($m, $json_vencido);
    $comprobar('el JSON con expiresAt vencido sigue recuperándose', COD_Mutex::tomar_o_recuperar_vencido($m, $v1, 30) === true && COD_Mutex::leer($m) === $v1);
    COD_Mutex::soltar($m, $v1);
    COD_Mutex::tomar($m, 'basura');
    $comprobar('un valor que no es ni JSON ni marca de tiempo NO vence jamás', COD_Mutex::tomar_o_recuperar_vencido($m, $v1, 30) === false && COD_Mutex::leer($m) === 'basura');
    COD_Mutex::soltar($m, 'basura');
    $comprobar('limpieza de la opción de prueba', COD_Mutex::leer($m) === null);
} finally {
    $limpiar();
}

echo "\n== limpieza ==\n";
$resto = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE 'cod\\_bp\\_lock\\_%'");
$comprobar('no queda ningún candado cod_bp_lock_* en la base', $resto === 0, "filas: $resto");
echo "\n" . ($fallas === 0 ? "TODO VERDE ($ejecutadas comprobaciones)" : "FALLARON $fallas de $ejecutadas comprobaciones") . "\n";
exit($fallas === 0 ? 0 : 1);
