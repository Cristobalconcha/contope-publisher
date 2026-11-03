<?php
/**
 * P1.6 (ESPEC-adn-unica-puerta-y-bloques, F1, hallazgo H5): concurrencia, con DOS PROCESOS PHP
 * sincronizados por archivos de barrera, contra el WordPress LOCAL de Basis (puerto 8894).
 *
 *   (a) un apply compilado contra la revisión r2 del ADN que llega DESPUÉS de que entró r3 →
 *       rechazado (ADN_REVISION_STALE): la revisión se recompara DENTRO del bloqueo;
 *   (b) un import mientras hay una escritura de documento en curso → ADN_BUSY, y a la inversa;
 *   (c) dos escrituras CRUDAS con la misma revisión base → la segunda falla (la revisión se
 *       recompara en el repositorio). La prueba FALLA si las dos tienen éxito.
 *   (d) DETERMINISTA, sin azar: el mismo cruce de (c), pero con uno de los procesos detenido en la
 *       ventana exacta entre «miré si el bloqueo existe» y «lo escribí». Con `add_option()` (que
 *       comprueba y escribe en dos pasos, y su INSERT ... ON DUPLICATE KEY UPDATE PISA la fila)
 *       los dos obtenían el bloqueo: dos éxitos y una actualización perdida. Con COD_Mutex (un
 *       solo INSERT IGNORE) el que llega segundo recibe «ocupado». Vale para el bloqueo del
 *       documento y para el exclusivo del ADN. Los hijos se detienen con `add_option` (código
 *       viejo) o con `cod_mutex_punto` (código nuevo): el que exista dispara justo en la ventana.
 *
 * Los procesos no se mockean: cada hijo carga WordPress de verdad, toma los bloqueos de verdad y
 * escribe en la misma base. El hijo se detiene DENTRO de la sección crítica con los ganchos
 * `cod_adn_escritura_en_curso` (repositorio) y `cod_adn_import_punto` (import) y espera la
 * orden del padre por un archivo.
 *
 * Nunca corre contra Santa Luisa, Econut ni producción; se niega a correr si ya hay un ADN activo.
 *
 * Uso:  php scripts/probar-adn-concurrencia.php
 *       (los hijos los lanza el propio script: --hijo <rol> <carpeta-de-barreras> [parámetros])
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';
require __DIR__ . '/adn/lib/contrato-de-prueba.php';

// ---------------------------------------------------------------------------
// Utilidades de barrera
// ---------------------------------------------------------------------------
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

function resultado_de($r): array
{
    if (is_wp_error($r)) {
        return ['ok' => false, 'codigo' => $r->get_error_code()];
    }
    return ['ok' => true, 'codigo' => 'ok'];
}

// ---------------------------------------------------------------------------
// MODO HIJO
// ---------------------------------------------------------------------------
$hijo = array_search('--hijo', $argv, true);
if ($hijo !== false) {
    $rol = (string) ($argv[$hijo + 1] ?? '');
    $dir = (string) ($argv[$hijo + 2] ?? '');
    $doc = (string) ($argv[$hijo + 3] ?? '');
    $extra = (string) ($argv[$hijo + 4] ?? '');
    $repo = new COD_Canvas_Document_Repository();
    $salida = ['rol' => $rol, 'ok' => false, 'codigo' => 'sin-ejecutar'];
    try {
        if ($rol === 'compilado') {
            // Compiló contra la revisión del ADN que le dice $extra; espera; guarda.
            $esperada = (int) $extra;
            $compilado = [
                'storage' => ['project' => '{}', 'markup' => '<p>aplicado</p>', 'styles' => ''],
                'compositionSnapshot' => ['nodes' => []],
                'designSnapshot' => ['designId' => 'basis-web', 'expectedDesignRevision' => $esperada, 'rules' => []],
            ];
            barrera_poner($dir, 'listo-compilado');
            if (!barrera_esperar($dir, 'seguir-compilado')) {
                throw new RuntimeException('el padre no dio la orden');
            }
            $salida = resultado_de($repo->save_compiled_recipe_if_revision($doc, 0, $compilado, 'prueba-conc', 'prueba-conc'));
        } elseif ($rol === 'escritor-retenido') {
            // Escribe y se detiene DENTRO de ambos bloqueos hasta que el padre lo suelte.
            add_action('cod_adn_escritura_en_curso', static function () use ($dir): void {
                barrera_poner($dir, 'dentro-escritura');
                barrera_esperar($dir, 'soltar-escritura');
            });
            $salida = resultado_de($repo->save_if_revision($doc, 0, '{}', '<p>retenido</p>', ''));
        } elseif ($rol === 'importador-retenido') {
            // Importa y se detiene DENTRO del bloqueo exclusivo hasta que el padre lo suelte.
            add_action('cod_adn_import_punto', static function (string $punto) use ($dir): void {
                if ($punto === 'dentro-del-bloqueo') {
                    barrera_poner($dir, 'dentro-import');
                    barrera_esperar($dir, 'soltar-import');
                }
            });
            $json = (string) file_get_contents($dir . '/adn-' . $extra . '.json');
            $previa = COD_ADN_Store::previsualizar($json);
            $salida = resultado_de(COD_ADN_Store::aplicar($json, ['previewId' => $previa['previewId']]));
        } elseif ($rol === 'escritor-con-guardia') {
            // Ya LEYÓ la revisión (la comparó con la esperada) y se detiene justo antes de escribir:
            // si otro proceso entra ahora a la sección crítica, los dos habrán leído la misma revisión.
            $salida = resultado_de($repo->save_if_revision($doc, 0, '{}', '<p>escritor con guardia</p>', '', static function (array $actual) use ($dir): ?array {
                barrera_poner($dir, 'dentro-guardia');
                barrera_esperar($dir, 'soltar-guardia');
                return null;
            }));
        } elseif ($rol === 'escritor-ventana' || $rol === 'exclusivo-ventana') {
            // Se detiene en la VENTANA de la toma del bloqueo (después de mirar, antes de escribir).
            $prefijo = $rol === 'escritor-ventana' ? 'cod_canvas_lock_' : COD_ADN_Lock::OPCION_EXCLUSIVO;
            $una_vez = false;
            $ventana = static function (...$args) use ($dir, $rol, $prefijo, &$una_vez): void {
                $nombre = (string) ($args[0] ?? '');
                if ($args[0] === 'antes-de-insertar') {
                    $nombre = (string) ($args[1] ?? ''); // cod_mutex_punto(punto, opción)
                }
                if ($una_vez || strpos($nombre, $prefijo) !== 0) {
                    return;
                }
                $una_vez = true;
                barrera_poner($dir, 'en-ventana-' . $rol);
                barrera_esperar($dir, 'sigue-' . $rol);
            };
            add_action('add_option', $ventana, 10, 2);      // código viejo: add_option()
            add_action('cod_mutex_punto', $ventana, 10, 2); // código nuevo: COD_Mutex::tomar()
            if ($rol === 'escritor-ventana') {
                $salida = resultado_de($repo->save_if_revision($doc, 0, '{}', '<p>escritor de la ventana</p>', ''));
            } else {
                $r = COD_ADN_Lock::exclusivo();
                $salida = resultado_de($r);
            }
        } elseif ($rol === 'escritor-crudo') {
            // Dos de estos arrancan a la vez con la MISMA revisión base.
            barrera_poner($dir, 'listo-' . $extra);
            if (!barrera_esperar($dir, 'ya')) {
                throw new RuntimeException('el padre no dio la salida');
            }
            $salida = resultado_de($repo->save_if_revision($doc, 0, '{}', '<p>escritor ' . $extra . '</p>', ''));
        }
    } catch (Throwable $e) {
        $salida = ['ok' => false, 'codigo' => 'EXCEPCION: ' . $e->getMessage()];
    }
    file_put_contents($dir . '/resultado-' . $rol . ($rol === 'escritor-crudo' ? '-' . $extra : '') . '.json', json_encode($salida));
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
// Los scripts de prueba del ADN comparten el modo de la compuerta y el puntero en la MISMA base: si otro corre a la vez,
// cambia el modo o borra el ADN en medio de esta prueba. Se anota en el detalle de cualquier falla para no confundirlo.
$ambiente = static function () use ($wpdb): string {
    return ' [ambiente: modo=' . var_export($wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", COD_ADN_Gate::OPTION_MODE)), true) . ', ADN activo=' . (COD_ADN_Store::activo() ? 'r' . COD_ADN_Store::revision_activa() : 'no') . '; si no es observe/rN esperado, otro proceso tocó la base]';
};
$bloqueos_doc = static function () use ($wpdb, &$docs): string {
    $propios = [];
    foreach ($docs as $post_id) {
        $propios[] = 'cod_canvas_lock_' . substr(hash('sha256', (string) get_current_blog_id() . ':' . (int) $post_id), 0, 32);
    }
    $filas = $propios === [] ? [] : (array) $wpdb->get_results("SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name IN ('" . implode("','", $propios) . "')", ARRAY_A);
    return implode('; ', array_map(static fn (array $f): string => $f['option_name'] . '=' . $f['option_value'], $filas));
};
$codigo = static function ($r): string {
    return is_wp_error($r) ? (string) $r->get_error_code() : 'ok';
};

echo "\n== 0. precondiciones ==\n";
$repo_dir = realpath(__DIR__ . '/../contope-publisher');
$inst_dir = rtrim((string) COD_PUBLISHER_DIR, '/\\');
$desiguales = [];
// Sólo los archivos que esta prueba ejercita (bloqueos, almacén, compuerta, repositorio): otros archivos del
// plugin pueden estar en edición sin que importe aquí.
foreach (['includes/class-cod-mutex.php', 'includes/class-cod-adn-lock.php', 'includes/class-cod-adn-store.php', 'includes/class-cod-adn-gate.php', 'includes/class-cod-canvas-document-repository.php', 'includes/class-cod-canvas-mcp-service.php'] as $rel) {
    $a = $repo_dir . '/' . $rel;
    $b = $inst_dir . substr($a, strlen($repo_dir));
    if (!is_file($b) || md5_file($a) !== md5_file($b)) {
        $desiguales[] = basename($a);
    }
}
$comprobar('lo instalado en el local es lo que hay en el repositorio', $desiguales === [], implode(', ', $desiguales));
if ($desiguales !== [] || COD_ADN_Store::activo()) {
    echo "\n  No se corre: " . (COD_ADN_Store::activo() ? 'ya hay un ADN activo en este WordPress.' : 'el plugin instalado no es el del repositorio.') . "\n";
    exit(1);
}
$modo_original = get_option(COD_ADN_Gate::OPTION_MODE, null);
update_option(COD_ADN_Gate::OPTION_MODE, 'observe', false);
$dir = sys_get_temp_dir() . '/adn-conc-' . bin2hex(random_bytes(4));
mkdir($dir, 0777, true);
$repo = new COD_Canvas_Document_Repository();
$docs = [];

$limpiar = static function () use (&$docs, $dir, $modo_original, $wpdb): void {
    foreach (get_posts(['post_type' => COD_ADN_Store::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']) as $id) {
        wp_delete_post((int) $id, true);
    }
    foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_%'") as $nombre) {
        if (preg_match('/^cod_adn_(proj_r\d+|lock_.*|activa)$/', (string) $nombre) === 1) {
            delete_option((string) $nombre);
        }
    }
    foreach ($docs as $post_id) {
        delete_option('cod_canvas_lock_' . substr(hash('sha256', (string) get_current_blog_id() . ':' . (int) $post_id), 0, 32));
        wp_delete_post((int) $post_id, true);
    }
    foreach ((array) glob($dir . '/*') as $f) {
        @unlink($f);
    }
    @rmdir($dir);
    if ($modo_original === null) {
        delete_option(COD_ADN_Gate::OPTION_MODE);
    } else {
        update_option(COD_ADN_Gate::OPTION_MODE, $modo_original, false);
    }
};
register_shutdown_function($limpiar);

$lanzar = static function (string $rol, string $doc = '', string $extra = '') use ($dir) {
    $cmd = [PHP_BINARY, __FILE__, '--hijo', $rol, $dir, $doc, $extra];
    $proc = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['file', $dir . '/salida-' . $rol . $extra . '.txt', 'w'], 2 => ['file', $dir . '/error-' . $rol . $extra . '.txt', 'w']], $pipes);
    if (!is_resource($proc)) {
        throw new RuntimeException('no se pudo lanzar el hijo ' . $rol);
    }
    fclose($pipes[0]);
    return $proc;
};
$esperar_hijo = static function ($proc, string $rol, string $extra = '') use ($dir): array {
    proc_close($proc);
    $archivo = $dir . '/resultado-' . $rol . ($rol === 'escritor-crudo' ? '-' . $extra : '') . '.json';
    $dato = is_file($archivo) ? json_decode((string) file_get_contents($archivo), true) : null;
    return is_array($dato) ? $dato : ['ok' => false, 'codigo' => 'el hijo no dejó resultado: ' . substr((string) @file_get_contents($dir . '/error-' . $rol . $extra . '.txt'), 0, 300)];
};
$nuevo_doc = static function (string $id) use ($repo, &$docs): int {
    $post_id = (int) $repo->ensure_post_id($id);
    $docs[] = $post_id;
    return $post_id;
};
$importar = static function (int $revision, array $extra = []): array {
    $json = adn_de_prueba(['revision' => $revision] + $extra);
    $previa = COD_ADN_Store::previsualizar($json);
    return ['json' => $json, 'res' => COD_ADN_Store::aplicar($json, ['previewId' => $previa['previewId']])];
};
// Directo de la base: la caché de metadatos de ESTE proceso no ve lo que escribió otro.
$rev_doc = static function (int $post_id) use ($wpdb): int {
    return (int) $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s", $post_id, COD_Canvas_Document_Repository::META_REVISION));
};

try {
    $a = $importar(1);
    $b = $importar(2);
    $comprobar('base: el ADN está en r2', COD_ADN_Store::revision_activa() === 2, $codigo($a['res']) . ' ' . $codigo($b['res']));

    // -----------------------------------------------------------------
    echo "\n== (a) un apply compilado contra r2 llega después de que entró r3 ==\n";
    $post_a = $nuevo_doc('adn-conc-a');
    $h = $lanzar('compilado', 'adn-conc-a', '2');
    $comprobar('el hijo compiló contra r2 y está esperando', barrera_esperar($dir, 'listo-compilado'));
    $r3 = $importar(3);
    $comprobar('mientras tanto entra r3 (no había ninguna escritura en curso)', !is_wp_error($r3['res']) && COD_ADN_Store::revision_activa() === 3, $codigo($r3['res']));
    barrera_poner($dir, 'seguir-compilado');
    $res = $esperar_hijo($h, 'compilado');
    $comprobar('el apply tardío es RECHAZADO con ADN_REVISION_STALE (la revisión se recompara dentro del bloqueo)', $res['ok'] === false && $res['codigo'] === 'ADN_REVISION_STALE', json_encode($res) . $ambiente());
    $comprobar('y no escribió nada: el documento sigue en la revisión 0', $rev_doc($post_a) === 0);
    // Control: lo compilado contra r3 sí se guarda.
    @unlink($dir . '/listo-compilado');
    @unlink($dir . '/seguir-compilado');
    @unlink($dir . '/resultado-compilado.json');
    $h = $lanzar('compilado', 'adn-conc-a', '3');
    barrera_esperar($dir, 'listo-compilado');
    barrera_poner($dir, 'seguir-compilado');
    $res = $esperar_hijo($h, 'compilado');
    $comprobar('CONTROL: lo compilado contra la revisión activa (r3) SÍ se guarda', $res['ok'] === true && $rev_doc($post_a) === 1, json_encode($res));

    // -----------------------------------------------------------------
    echo "\n== (b) import contra escritura en curso, y a la inversa ==\n";
    $post_b = $nuevo_doc('adn-conc-b');
    $h = $lanzar('escritor-retenido', 'adn-conc-b');
    $comprobar('el escritor está DENTRO de su bloqueo', barrera_esperar($dir, 'dentro-escritura'));
    $hay_x = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_lock_s_%'");
    $comprobar('hay un bloqueo compartido vigente en la base', (int) $hay_x >= 1, (string) $hay_x);
    $r4 = $importar(4);
    $comprobar('un import mientras hay una escritura en curso → ADN_BUSY', $codigo($r4['res']) === 'ADN_BUSY' && COD_ADN_Store::revision_activa() === 3, $codigo($r4['res']));
    $lock_x = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name = '" . COD_ADN_Lock::OPCION_EXCLUSIVO . "'");
    $comprobar('y el import fallido no dejó su bloqueo exclusivo', (int) $lock_x === 0);
    barrera_poner($dir, 'soltar-escritura');
    $res = $esperar_hijo($h, 'escritor-retenido');
    $comprobar('el escritor retenido termina bien (el import no le quitó nada)', $res['ok'] === true && $rev_doc($post_b) === 1, json_encode($res));
    $r4 = $importar(4);
    $comprobar('CONTROL: sin escritura en curso, el mismo import pasa', !is_wp_error($r4['res']) && COD_ADN_Store::revision_activa() === 4, $codigo($r4['res']));

    // A la inversa: el import retenido dentro de su bloqueo exclusivo; una escritura de documento debe fallar con ADN_BUSY.
    file_put_contents($dir . '/adn-5.json', adn_de_prueba(['revision' => 5]));
    $post_c = $nuevo_doc('adn-conc-c');
    $h = $lanzar('importador-retenido', '', '5');
    $comprobar('el importador está DENTRO del bloqueo exclusivo', barrera_esperar($dir, 'dentro-import'));
    $w = $repo->save_if_revision('adn-conc-c', 0, '{}', '<p>x</p>', '');
    $comprobar('una escritura de documento mientras el import está en curso → ADN_BUSY', $codigo($w) === 'ADN_BUSY' && $rev_doc($post_c) === 0, $codigo($w));
    barrera_poner($dir, 'soltar-import');
    $res = $esperar_hijo($h, 'importador-retenido');
    $comprobar('el import retenido termina bien (r5)', $res['ok'] === true && COD_ADN_Store::revision_activa() === 5, json_encode($res));
    $w = $repo->save_if_revision('adn-conc-c', 0, '{}', '<p>x</p>', '');
    $comprobar('CONTROL: terminado el import, la misma escritura pasa', !is_wp_error($w) && $rev_doc($post_c) === 1, $codigo($w));

    // -----------------------------------------------------------------
    echo "\n== (c) dos escrituras CRUDAS con la misma revisión base ==\n";
    $rondas = 6;
    $dos_exitos = 0;
    $un_exito = 0;
    $ninguno = 0;
    for ($i = 1; $i <= $rondas; ++$i) {
        $id = 'adn-conc-r' . $i;
        $post = $nuevo_doc($id);
        foreach (['listo-1', 'listo-2', 'ya', 'resultado-escritor-crudo-1.json', 'resultado-escritor-crudo-2.json'] as $f) {
            @unlink($dir . '/' . $f);
        }
        $h1 = $lanzar('escritor-crudo', $id, '1');
        $h2 = $lanzar('escritor-crudo', $id, '2');
        $listos = barrera_esperar($dir, 'listo-1') && barrera_esperar($dir, 'listo-2');
        barrera_poner($dir, 'ya');
        $r1 = $esperar_hijo($h1, 'escritor-crudo', '1');
        $r2 = $esperar_hijo($h2, 'escritor-crudo', '2');
        $exitos = (int) $r1['ok'] + (int) $r2['ok'];
        if (!$listos) {
            $comprobar("ronda $i: los dos hijos arrancaron", false);
        }
        if ($exitos === 2) {
            ++$dos_exitos;
        } elseif ($exitos === 1) {
            ++$un_exito;
        } else {
            ++$ninguno;
        }
        $rev_final = $rev_doc($post);
        if ($exitos === 2 || $rev_final !== 1) {
            echo "           ronda $i: " . json_encode([$r1, $r2]) . " revisión final $rev_final\n";
        }
    }
    $comprobar("la prueba FALLA si las dos escrituras tienen éxito: en $rondas rondas, ninguna dejó dos éxitos con la misma base", $dos_exitos === 0, "$dos_exitos ronda(s) con dos éxitos");
    $comprobar("en cada ronda exactamente una escritura ganó ($un_exito de $rondas; sin ninguna: $ninguno)", $un_exito === $rondas, "ganó una en $un_exito, ninguna en $ninguno");
    $post = $nuevo_doc('adn-conc-seq');
    $primera = $repo->save_if_revision('adn-conc-seq', 0, '{}', '<p>1</p>', '');
    $segunda = $repo->save_if_revision('adn-conc-seq', 0, '{}', '<p>2</p>', '');
    $comprobar('secuencial: la segunda escritura con la revisión base vieja falla con conflicto de revisión (se recompara en el repositorio)', !is_wp_error($primera) && $codigo($segunda) === 'cod_canvas_revision_conflict' && $rev_doc($post) === 1, $codigo($segunda));
    $comprobar('control del instrumento: la misma escritura con la revisión correcta (1) pasa', !is_wp_error($repo->save_if_revision('adn-conc-seq', 1, '{}', '<p>3</p>', '')) && $rev_doc($post) === 2);

    // -----------------------------------------------------------------
    $comprobar('antes de (d): ningún bloqueo de documento colgado de las secciones anteriores', $bloqueos_doc() === '', $bloqueos_doc() . ' · hora ' . time());
    echo "
== (d) DETERMINISTA: un proceso detenido entre «miré» y «escribí» del bloqueo ==
";
    $post_d = $nuevo_doc('adn-conc-d');
    foreach (glob($dir . '/*ventana*') ?: [] as $f) {
        @unlink($f);
    }
    foreach (['dentro-guardia', 'soltar-guardia'] as $f) {
        @unlink($dir . '/' . $f);
    }
    $ha = $lanzar('escritor-ventana', 'adn-conc-d');
    $comprobar('A está detenido EN LA VENTANA del bloqueo del documento (miró, aún no escribió)', barrera_esperar($dir, 'en-ventana-escritor-ventana'));
    $hb = $lanzar('escritor-con-guardia', 'adn-conc-d');
    $comprobar('B toma el bloqueo, LEYÓ la revisión 0 y está detenido antes de escribir', barrera_esperar($dir, 'dentro-guardia'));
    barrera_poner($dir, 'sigue-escritor-ventana');
    $ra = $esperar_hijo($ha, 'escritor-ventana');
    $comprobar('A, que sigue después de que B ya tiene el bloqueo, NO lo obtiene (cod_canvas_document_busy)', $ra['ok'] === false && $ra['codigo'] === 'cod_canvas_document_busy', json_encode($ra));
    barrera_poner($dir, 'soltar-guardia');
    $rb = $esperar_hijo($hb, 'escritor-con-guardia');
    $comprobar('de las dos escrituras con la misma revisión base tuvo éxito EXACTAMENTE una (B), y la revisión es 1', $rb['ok'] === true && (int) $ra['ok'] + (int) $rb['ok'] === 1 && $rev_doc($post_d) === 1, json_encode([$ra, $rb]) . ' revisión ' . $rev_doc($post_d));
    $comprobar('y no quedó ningún bloqueo de documento colgado', $bloqueos_doc() === '', $bloqueos_doc() . ' · hora ' . time() . ' · ' . json_encode([$ra, $rb]));

    // El mismo cruce con el bloqueo EXCLUSIVO del ADN.
    foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name = '" . COD_ADN_Lock::OPCION_EXCLUSIVO . "'") as $n) {
        delete_option((string) $n);
    }
    $hx = $lanzar('exclusivo-ventana');
    $comprobar('el segundo importador está detenido EN LA VENTANA del bloqueo exclusivo', barrera_esperar($dir, 'en-ventana-exclusivo-ventana'));
    $mio = COD_ADN_Lock::exclusivo();
    $comprobar('este proceso toma el bloqueo exclusivo', !is_wp_error($mio), $codigo($mio));
    barrera_poner($dir, 'sigue-exclusivo-ventana');
    $rx = $esperar_hijo($hx, 'exclusivo-ventana');
    $comprobar('el que sigue después NO obtiene el exclusivo (ADN_BUSY) en lugar de pisar al que ya lo tiene', $rx['ok'] === false && $rx['codigo'] === 'ADN_BUSY', json_encode($rx));
    $fila = (string) $wpdb->get_var("SELECT option_value FROM {$wpdb->options} WHERE option_name = '" . COD_ADN_Lock::OPCION_EXCLUSIVO . "'");
    $comprobar('y el bloqueo en la base sigue siendo el de quien lo tomó primero', !is_wp_error($mio) && (json_decode($fila, true)['token'] ?? '') === $mio['token'], $fila);
    COD_ADN_Lock::soltar_exclusivo($mio);
    $comprobar('soltarlo lo borra', (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name = '" . COD_ADN_Lock::OPCION_EXCLUSIVO . "'") === 0);
    foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name = '" . COD_ADN_Lock::OPCION_EXCLUSIVO . "'") as $n) {
        delete_option((string) $n); // por si el código viejo dejó el bloqueo del segundo proceso
    }

    // -----------------------------------------------------------------
    echo "
== (e) COD_Mutex: vencimiento y liberación condicional ==
";
    $m = 'cod_adn_lock_prueba_mutex';
    $v1 = wp_json_encode(['token' => 'uno', 'expiresAt' => time() + 30]);
    $v2 = wp_json_encode(['token' => 'dos', 'expiresAt' => time() + 30]);
    $comprobar('tomar una opción libre → true', COD_Mutex::tomar($m, $v1) === true);
    $comprobar('tomarla de nuevo (otro valor) → false, y NO pisa el valor', COD_Mutex::tomar($m, $v2) === false && COD_Mutex::leer($m) === $v1);
    $comprobar('con el bloqueo vigente, tomar_o_recuperar_vencido → false', COD_Mutex::tomar_o_recuperar_vencido($m, $v2) === false && COD_Mutex::leer($m) === $v1);
    COD_Mutex::soltar($m, $v2);
    $comprobar('soltar con un valor ajeno no borra nada', COD_Mutex::leer($m) === $v1);
    COD_Mutex::soltar($m, $v1);
    $comprobar('soltar con el valor propio lo borra', COD_Mutex::leer($m) === null);
    $vencido = wp_json_encode(['token' => 'viejo', 'expiresAt' => time() - 5]);
    COD_Mutex::tomar($m, $vencido);
    $comprobar('un bloqueo VENCIDO se recupera y queda el valor nuevo', COD_Mutex::tomar_o_recuperar_vencido($m, $v2) === true && COD_Mutex::leer($m) === $v2);
    COD_Mutex::soltar($m, $v2);
    $comprobar('get_option/delete_option de este proceso no quedan con la caché vieja', get_option($m, null) === null);
} finally {
    $limpiar();
}

echo "\n== limpieza ==\n";
$resto = 0;
foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_%'") as $nombre) {
    if (preg_match('/^cod_adn_(proj_r\d+|lock_.*|activa)$/', (string) $nombre) === 1) {
        ++$resto;
    }
}
$comprobar('no queda ninguna proyección, bloqueo ni puntero del ADN', $resto === 0 && !COD_ADN_Store::activo(), "opciones: $resto");
echo "\n" . ($fallas === 0 ? "TODO VERDE ($ejecutadas comprobaciones)" : "FALLARON $fallas de $ejecutadas comprobaciones") . "\n";
exit($fallas === 0 ? 0 : 1);
