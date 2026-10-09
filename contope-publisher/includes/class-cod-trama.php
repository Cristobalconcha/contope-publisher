<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Tramas generativas: el archivo de trama como recurso del sitio.
 *
 * QUÉ ES. Una trama es el fondo generativo de una sección (la «superficie de
 * puntos»: una lámina 3D de puntos o líneas que se pliega y evoluciona). La
 * describe un ARCHIVO DE TRAMA: un JSON (`kind: contope/trama`) que es una
 * receta, sólo datos, que el motor vuelve a calcular igual en cualquier
 * equipo. El formato y el motor viven en contopedesign-core
 * (`packages/trama/`); Publisher sólo los muestra. Decisión 36, Cristóbal, 9
 * de octubre de 2026: «Core genera las tramas. El reproductor solo los
 * muestra».
 *
 * QUÉ HACE ESTA CLASE, con el patrón de COD_SVG y COD_Divisor:
 *
 *   1. Deja subir un `.json` a Medios SÓLO si es un archivo de trama válido.
 *      Cualquier otro JSON se rechaza: abrir el tipo de archivo para que
 *      entre lo que sea es justo lo que no se hace.
 *   2. Al servir la página, cada `data-cod-trama-fuente="<url de Medios>"`
 *      se resuelve: se lee el archivo del disco, se valida otra vez y la
 *      receta se pone en línea, como `<script type="application/json"
 *      data-cod-trama-receta>`, dentro del elemento. Sin petición extra del
 *      navegador. Reemplazar el archivo en Medios llega a todas las páginas
 *      sin recomponer ninguna (el mismo porqué del divisor).
 *   3. Encola el reproductor y el motor, y les pasa las URLs de los workers.
 *
 * VALIDAR DOS VECES, a propósito. Un archivo puede haber llegado a `uploads`
 * por otra vía —FTP, una migración, otro plugin— sin pasar por la subida. Si
 * no valida, la sección queda sin trama y el contenido manda.
 *
 * LO QUE SE VALIDA ACÁ es la frontera: estructura mínima, versión de formato
 * y de motor, tamaño, límites duros de los números que podrían congelar al
 * navegador, y que sea SÓLO DATOS (ningún texto con marcado ni `javascript:`).
 * La validación completa, campo por campo, la hace el lector del motor en el
 * navegador (`leerTrama`), que además nunca lanza: una trama que pase acá y
 * no allá deja la sección intacta.
 *
 * VARIANTES. El formato v1 no tiene variantes. Una variante de una trama
 * (otros colores, otro modo, otra secuencia) es OTRO archivo de trama: se
 * exporta del generador y se sube a Medios como cualquier otro.
 */
final class COD_Trama
{
    public const MIME = 'application/json';
    public const ATRIBUTO = 'data-cod-trama';
    public const ATRIBUTO_FUENTE = 'data-cod-trama-fuente';
    public const ATRIBUTO_RECETA = 'data-cod-trama-receta';

    /** El formato y el motor que este Publisher sabe leer (ver assets/vendor/contope-trama/MOTOR.json). */
    public const KIND = 'contope/trama';
    public const FORMATO_VERSION = 1;
    public const MOTOR_ID = 'superficie-de-puntos';
    public const MOTOR_VERSION_MAYOR = 1;

    /**
     * Límites duros: los mismos de `formato/limites.ts` en core. No son gustos
     * de diseño; protegen al navegador de un archivo que lo congele.
     */
    public const TAMANO_MAXIMO = 2000000;
    public const LINEAS_MAX = 1000;
    public const PUNTOS_MAX = 4000;
    public const PUNTOS_POR_CUADRO_MAX = 500000;
    public const DURACION_MAX = 600;
    public const NUMERO_MAX = 1e6;
    public const KEYFRAMES_MAX = 50000;
    public const ESCENAS_MAX = 1000;
    public const TEXTO_CORTO_MAX = 200;
    public const PROCEDENCIA_MAX = 65536;
    public const PROFUNDIDAD_MAX = 48;

    /** Los modos que la receta MCP y el atributo aceptan. */
    public const MODOS = ['vivo', 'estatico'];
    public const INTERACCIONES = ['archivo', 'ninguna', 'cursor', 'paralaje', 'ambos'];

    private const CLAVES = ['kind', 'version', 'motor', 'nombre', 'procedencia', 'lienzo', 'dibujo', 'color', 'configuracion', 'tiempo', 'interaccion', 'cuadroQuieto'];

    /** @var array<string, string|null> receta ya resuelta por ruta, durante esta petición */
    private static array $resueltas = [];

    public function register(): void
    {
        add_filter('upload_mimes', [$this, 'permitir_tipo'], 10, 2);
        add_filter('wp_check_filetype_and_ext', [$this, 'reconocer_extension'], 10, 4);
        add_filter('wp_handle_upload_prefilter', [$this, 'validar_al_subir']);
    }

    public static function permitido(): bool
    {
        /** Filtra si este sitio acepta archivos de trama en Medios. Devolver false lo desactiva. */
        return (bool) apply_filters('cod_permitir_trama', true);
    }

    /**
     * ¿Puede ESTE usuario subir un archivo de trama? Basta con poder subir
     * archivos: a diferencia de un SVG, una trama validada no puede llevar
     * marcado, así que no hace falta `unfiltered_html`.
     */
    public static function puede_subir(): bool
    {
        return self::permitido() && current_user_can('upload_files');
    }

    /**
     * @param array<string, string> $tipos
     * @return array<string, string>
     */
    public function permitir_tipo(array $tipos, $usuario = null): array
    {
        if (self::puede_subir()) {
            $tipos['json'] = self::MIME;
        }

        return $tipos;
    }

    /**
     * WordPress comprueba aparte que la extensión y el contenido concuerden;
     * a un JSON lo detecta como `text/plain` y lo rechaza aunque el tipo
     * esté permitido. El contenido lo revisa `validar_al_subir`.
     *
     * @param array<string, mixed> $datos
     * @return array<string, mixed>
     */
    public function reconocer_extension(array $datos, $archivo, $nombre, $mimes): array
    {
        if (!self::puede_subir()) {
            return $datos;
        }
        if (strtolower((string) pathinfo((string) $nombre, PATHINFO_EXTENSION)) === 'json') {
            $datos['ext'] = 'json';
            $datos['type'] = self::MIME;
            $datos['proper_filename'] = $nombre;
        }

        return $datos;
    }

    /**
     * Un `.json` entra a Medios sólo si es un archivo de trama válido.
     *
     * @param array<string, mixed> $archivo
     * @return array<string, mixed>
     */
    public function validar_al_subir(array $archivo): array
    {
        $nombre = (string) ($archivo['name'] ?? '');
        if (strtolower((string) pathinfo($nombre, PATHINFO_EXTENSION)) !== 'json') {
            return $archivo;
        }
        if (!self::permitido()) {
            return $archivo;
        }
        if (!self::puede_subir()) {
            $archivo['error'] = 'No tienes permisos para subir archivos de trama.';
            return $archivo;
        }

        $ruta = (string) ($archivo['tmp_name'] ?? '');
        $tamano = $ruta !== '' && is_readable($ruta) ? (int) filesize($ruta) : 0;
        if ($tamano > self::TAMANO_MAXIMO) {
            $archivo['error'] = 'El archivo de trama es demasiado grande (máximo ' . self::TAMANO_MAXIMO . ' bytes).';
            return $archivo;
        }
        $texto = $tamano > 0 ? (string) file_get_contents($ruta) : '';
        $resultado = self::validar($texto, true);
        if (!$resultado['ok']) {
            $archivo['error'] = 'Sólo se aceptan archivos JSON que sean archivos de trama de ContOpe (kind «'
                . self::KIND . '»). Este no lo es: ' . implode('; ', array_slice($resultado['errores'], 0, 3));
        }

        return $archivo;
    }

    /**
     * Valida un archivo de trama (JSON) o un código de una línea (`CT1.…`,
     * `SP1.…`). Pura: no llama a WordPress, para poder probarla suelta.
     *
     * @return array{ok: bool, errores: array<int, string>, origen: string, receta: string}
     *   `receta` es lo que se pone en línea en la página: el JSON vuelto a
     *   escribir (sin `<`, `>` ni `&` literales) o el código tal cual.
     */
    public static function validar(string $texto, bool $solo_json = false): array
    {
        $no = static fn (string $mensaje, string $origen = ''): array => ['ok' => false, 'errores' => [$mensaje], 'origen' => $origen, 'receta' => ''];

        if (strlen($texto) > self::TAMANO_MAXIMO) {
            return $no('demasiado grande (máximo ' . self::TAMANO_MAXIMO . ' bytes)');
        }
        $texto = trim($texto);
        if ($texto === '') {
            return $no('vacío');
        }

        $prefijo = substr($texto, 0, 4);
        if (!$solo_json && ($prefijo === 'SP1.' || $prefijo === 'CT1.')) {
            $origen = strtolower(substr($prefijo, 0, 3));
            $cuerpo = substr($texto, 4);
            // base64 (SP1) o base64url (CT1): nada más que eso puede ir en el código.
            if ($cuerpo === '' || preg_match('#^[A-Za-z0-9+/_=-]+$#', $cuerpo) !== 1) {
                return $no('código ' . strtoupper($origen) . ' con caracteres que no son base64', $origen);
            }
            $crudo = base64_decode(strtr($cuerpo, '-_', '+/'), true);
            $datos = is_string($crudo) ? json_decode($crudo, true, self::PROFUNDIDAD_MAX) : null;
            if (!is_array($datos)) {
                return $no('código ' . strtoupper($origen) . ' ilegible (base64 o JSON roto)', $origen);
            }
            if ($origen === 'sp1') {
                // Una captura vieja de v7: un instante y su configuración.
                $errores = [];
                if (!isset($datos['time']) || !self::es_numero($datos['time'])) {
                    $errores[] = 'código SP1 sin instante (time)';
                }
                if (!isset($datos['cfg']) || !is_array($datos['cfg'])) {
                    $errores[] = 'código SP1 sin configuración (cfg)';
                }
                self::revisar_solo_datos($datos, 'sp1', $errores);
                return ['ok' => $errores === [], 'errores' => $errores, 'origen' => 'sp1', 'receta' => $errores === [] ? $texto : ''];
            }
            $errores = self::revisar_documento($datos);
            return ['ok' => $errores === [], 'errores' => $errores, 'origen' => 'ct1', 'receta' => $errores === [] ? $texto : ''];
        }

        if ($texto[0] !== '{') {
            return $no($solo_json ? 'no es un objeto JSON' : 'no se reconoce: se esperaba un archivo de trama en JSON o un código CT1. o SP1.');
        }
        $datos = json_decode($texto, true, self::PROFUNDIDAD_MAX);
        if (!is_array($datos)) {
            return $no('JSON inválido: ' . json_last_error_msg(), 'json');
        }
        $errores = self::revisar_documento($datos);
        if ($errores !== []) {
            return ['ok' => false, 'errores' => $errores, 'origen' => 'json', 'receta' => ''];
        }
        // Se vuelve a escribir desde los OBJETOS (no desde arreglos), para que
        // un `{}` vacío siga siendo un objeto y no se convierta en `[]`.
        $receta = json_encode(json_decode($texto, false, self::PROFUNDIDAD_MAX), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);

        return ['ok' => is_string($receta), 'errores' => is_string($receta) ? [] : ['no se pudo volver a escribir'], 'origen' => 'json', 'receta' => is_string($receta) ? $receta : ''];
    }

    /**
     * La estructura mínima de un documento de trama.
     *
     * @param array<mixed> $d
     * @return array<int, string>
     */
    private static function revisar_documento(array $d): array
    {
        $e = [];
        if ($d !== [] && array_keys($d) === range(0, count($d) - 1)) {
            return ['se esperaba un objeto, no una lista'];
        }
        foreach (array_keys($d) as $clave) {
            if (!in_array($clave, self::CLAVES, true)) {
                $e[] = $clave . ': campo desconocido';
            }
        }
        if (($d['kind'] ?? null) !== self::KIND) {
            $e[] = 'kind: debe ser «' . self::KIND . '»';
        }
        if (($d['version'] ?? null) !== self::FORMATO_VERSION) {
            $e[] = 'version: versión de formato no soportada (este Publisher lee la ' . self::FORMATO_VERSION . ')';
        }
        $motor = $d['motor'] ?? null;
        if (!is_array($motor) || ($motor['id'] ?? null) !== self::MOTOR_ID) {
            $e[] = 'motor.id: debe ser «' . self::MOTOR_ID . '»';
        }
        $version = is_array($motor) ? ($motor['version'] ?? null) : null;
        if (!is_string($version) || preg_match('/^(\d+)\.(\d+)\.(\d+)$/', $version, $m) !== 1) {
            $e[] = 'motor.version: debe ser una versión x.y.z';
        } elseif ((int) $m[1] !== self::MOTOR_VERSION_MAYOR) {
            $e[] = 'motor.version: motor ' . $version . ' no soportado (este Publisher tiene la versión ' . self::MOTOR_VERSION_MAYOR . '.x)';
        }
        if (isset($d['nombre']) && (!is_string($d['nombre']) || mb_strlen($d['nombre']) > self::TEXTO_CORTO_MAX)) {
            $e[] = 'nombre: texto de hasta ' . self::TEXTO_CORTO_MAX . ' caracteres';
        }
        if (isset($d['procedencia'])) {
            $p = json_encode($d['procedencia']);
            if (!is_array($d['procedencia']) || !is_string($p) || strlen($p) > self::PROCEDENCIA_MAX) {
                $e[] = 'procedencia: objeto de hasta ' . self::PROCEDENCIA_MAX . ' bytes';
            }
        }
        if (isset($d['dibujo'])) {
            $dib = $d['dibujo'];
            if (!is_array($dib)
                || (isset($dib['modo']) && !in_array($dib['modo'], ['puntos', 'lineas', 'mixto'], true))
                || (isset($dib['tinta']) && !in_array($dib['tinta'], ['luz', 'tinta', 'auto'], true))) {
                $e[] = 'dibujo: modo puntos | lineas | mixto, tinta luz | tinta | auto';
            }
        }
        if (isset($d['color'])) {
            if (!is_array($d['color'])) {
                $e[] = 'color: debe ser un objeto';
            } else {
                foreach ($d['color'] as $clave => $valor) {
                    $hex = is_array($valor) ? ($valor['hex'] ?? null) : $valor;
                    if (!in_array($clave, ['lejos', 'cerca', 'fondo'], true) || !is_string($hex) || preg_match('/^#[0-9a-fA-F]{6}$/', $hex) !== 1) {
                        $e[] = 'color.' . $clave . ': debe ser lejos, cerca o fondo, con un color #rrggbb';
                    }
                }
            }
        }
        if (isset($d['configuracion'])) {
            $c = $d['configuracion'];
            if (!is_array($c)) {
                $e[] = 'configuracion: debe ser un objeto';
            } else {
                foreach ($c as $clave => $valor) {
                    if (!self::es_numero($valor) || abs((float) $valor) > self::NUMERO_MAX) {
                        $e[] = 'configuracion.' . $clave . ': debe ser un número';
                    }
                }
                $lineas = (float) ($c['lineas'] ?? 64);
                $puntos = (float) ($c['puntosPorLinea'] ?? 480);
                if ($lineas < 2 || $lineas > self::LINEAS_MAX) {
                    $e[] = 'configuracion.lineas: entre 2 y ' . self::LINEAS_MAX;
                }
                if ($puntos < 8 || $puntos > self::PUNTOS_MAX) {
                    $e[] = 'configuracion.puntosPorLinea: entre 8 y ' . self::PUNTOS_MAX;
                }
                if ($lineas * $puntos > self::PUNTOS_POR_CUADRO_MAX) {
                    $e[] = 'configuracion: más de ' . self::PUNTOS_POR_CUADRO_MAX . ' puntos por cuadro';
                }
            }
        }
        if (isset($d['tiempo'])) {
            $t = $d['tiempo'];
            if (!is_array($t) || !in_array($t['modo'] ?? 'vivo', ['vivo', 'secuencia'], true)) {
                $e[] = 'tiempo.modo: vivo | secuencia';
            } elseif (($t['modo'] ?? 'vivo') === 'secuencia') {
                $dur = $t['duracion'] ?? null;
                if (!self::es_numero($dur) || $dur <= 0 || $dur > self::DURACION_MAX) {
                    $e[] = 'tiempo.duracion: obligatoria en una secuencia, entre 0 y ' . self::DURACION_MAX . ' s';
                }
                $keyframes = 0;
                foreach ((is_array($t['pistas'] ?? null) ? $t['pistas'] : []) as $pista) {
                    $keyframes += is_array($pista) ? count($pista) : 0;
                }
                if ($keyframes > self::KEYFRAMES_MAX) {
                    $e[] = 'tiempo.pistas: más de ' . self::KEYFRAMES_MAX . ' keyframes';
                }
                if (is_array($t['escenas'] ?? null) && count($t['escenas']) > self::ESCENAS_MAX) {
                    $e[] = 'tiempo.escenas: más de ' . self::ESCENAS_MAX . ' escenas';
                }
            }
        }
        if (isset($d['interaccion'])) {
            $i = $d['interaccion'];
            if (!is_array($i) || (isset($i['cursor']) && !is_bool($i['cursor'])) || (isset($i['paralaje']) && !is_bool($i['paralaje']))) {
                $e[] = 'interaccion: cursor y paralaje son verdadero o falso';
            }
        }
        if (isset($d['cuadroQuieto']) && (!self::es_numero($d['cuadroQuieto']) || $d['cuadroQuieto'] < 0)) {
            $e[] = 'cuadroQuieto: un instante en segundos, 0 o más';
        }
        self::revisar_solo_datos($d, '', $e);

        return $e;
    }

    /**
     * SÓLO DATOS. Un JSON no ejecuta nada por sí mismo, pero un texto suyo
     * podría terminar mostrado por alguien sin escapar. Se rechaza cualquier
     * texto con aspecto de marcado o de guion: un archivo de trama legítimo
     * no tiene ninguno.
     *
     * @param mixed $valor
     * @param array<int, string> $errores
     */
    private static function revisar_solo_datos($valor, string $ruta, array &$errores): void
    {
        if (is_string($valor)) {
            if (preg_match('#<[a-z/!?]#i', $valor) === 1 || preg_match('#(java|vb)script\s*:#i', $valor) === 1) {
                $errores[] = ($ruta === '' ? '(raíz)' : $ruta) . ': un archivo de trama es sólo datos; este texto parece marcado o código';
            }
            return;
        }
        if (is_array($valor)) {
            foreach ($valor as $clave => $hijo) {
                if (is_string($clave) && preg_match('#[<>]#', $clave) === 1) {
                    $errores[] = $ruta . ': nombre de campo con marcado';
                }
                self::revisar_solo_datos($hijo, $ruta === '' ? (string) $clave : $ruta . '.' . $clave, $errores);
            }
        }
    }

    /** @param mixed $v */
    private static function es_numero($v): bool
    {
        return (is_int($v) || is_float($v)) && is_finite((float) $v);
    }

    /* ------------------------------------------------------------------ */
    /* Al servir la página                                                 */
    /* ------------------------------------------------------------------ */

    /**
     * Pone en línea la receta de cada `data-cod-trama-fuente`.
     *
     * Si el archivo no existe, no es del sitio o no valida, se le quita el
     * atributo al elemento: la sección queda sin trama y su contenido,
     * intacto. Nunca un recuadro roto.
     */
    public static function resolver_en_html(string $html): string
    {
        if (strpos($html, self::ATRIBUTO_FUENTE) === false) {
            return $html;
        }

        return (string) preg_replace_callback(
            '#<([a-z][a-z0-9-]*)(\s[^>]*?\b' . preg_quote(self::ATRIBUTO_FUENTE, '#') . '="([^"]*)"[^>]*)>(?!\s*<script[^>]*' . preg_quote(self::ATRIBUTO_RECETA, '#') . ')#i',
            static function (array $m): string {
                $receta = self::receta_de(html_entity_decode($m[3], ENT_QUOTES));
                if ($receta === null) {
                    $atributos = (string) preg_replace('#\s' . preg_quote(self::ATRIBUTO_FUENTE, '#') . '="[^"]*"#i', '', $m[2]);
                    return '<' . $m[1] . $atributos . '>';
                }
                return $m[0] . '<script type="application/json" ' . self::ATRIBUTO_RECETA . '>' . $receta . '</script>';
            },
            $html
        );
    }

    /** La receta validada de un archivo de trama del sitio, o null. */
    public static function receta_de(string $ruta): ?string
    {
        $ruta = trim($ruta);
        if (array_key_exists($ruta, self::$resueltas)) {
            return self::$resueltas[$ruta];
        }
        $receta = null;
        $archivo = self::archivo_de($ruta);
        if ($archivo !== '' && is_readable($archivo) && (int) filesize($archivo) <= self::TAMANO_MAXIMO) {
            $resultado = self::validar((string) file_get_contents($archivo), true);
            $receta = $resultado['ok'] ? $resultado['receta'] : null;
        }

        return self::$resueltas[$ruta] = $receta;
    }

    /** ¿Es una ruta del sitio a un `.json`? (lo que la receta MCP acepta como fuente). */
    public static function es_ruta_de_trama(string $ruta): bool
    {
        $ruta = trim($ruta);
        return $ruta !== '' && class_exists('COD_Divisor') && COD_Divisor::es_del_sitio($ruta)
            && substr(strtolower((string) parse_url($ruta, PHP_URL_PATH)), -5) === '.json';
    }

    /** La ruta en disco de un `.json` del sitio, sin salirse de él. */
    private static function archivo_de(string $ruta): string
    {
        if (!self::es_ruta_de_trama($ruta)) {
            return '';
        }
        $relativa = $ruta;
        $inicio = home_url('/');
        if (strpos($relativa, $inicio) === 0) {
            $relativa = '/' . ltrim(substr($relativa, strlen($inicio)), '/');
        }
        $relativa = (string) parse_url($relativa, PHP_URL_PATH);
        $raiz = defined('ABSPATH') ? rtrim(ABSPATH, '/\\') : '';
        if ($relativa === '' || $raiz === '') {
            return '';
        }
        $real = realpath($raiz . $relativa);
        $raiz_real = realpath($raiz);
        if ($real === false || $raiz_real === false || strpos($real, $raiz_real) !== 0) {
            return '';
        }

        return $real;
    }

    /* ------------------------------------------------------------------ */
    /* Encolado                                                            */
    /* ------------------------------------------------------------------ */

    /** ¿Este HTML lleva una trama? Lo que decide si se carga el reproductor. */
    public static function hay_trama(string $html): bool
    {
        return strpos($html, self::ATRIBUTO) !== false;
    }

    /** URL del motor traído de core. */
    public static function url_motor(): string
    {
        return plugins_url('assets/vendor/contope-trama/contope-trama.js', COD_PUBLISHER_FILE);
    }

    /**
     * Lo que el reproductor necesita saber, como guion previo: las URLs de
     * los dos workers (archivos del plugin, nunca `blob:`) y si se encienden
     * los mensajes de diagnóstico.
     */
    public static function configuracion_js(): string
    {
        $config = [
            'worker' => add_query_arg('ver', COD_PUBLISHER_VERSION, plugins_url('assets/vendor/contope-trama/contope-trama-worker.js', COD_PUBLISHER_FILE)),
            'workerTiras' => add_query_arg('ver', COD_PUBLISHER_VERSION, plugins_url('assets/js/cod-trama-tiras-worker.js', COD_PUBLISHER_FILE)),
            'diagnostico' => self::diagnostico(),
        ];

        return 'window.codTramaConfig = ' . wp_json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES) . ';';
    }

    /**
     * Diagnóstico sólo en desarrollo: con WP_DEBUG, o para quien administra
     * el sitio si lo pide en la URL (`?cod-trama-diagnostico=1`). El público
     * nunca ve nada: ni paneles, ni cifras, ni mensajes en su consola.
     */
    public static function diagnostico(): bool
    {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            return true;
        }
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- sólo enciende mensajes de consola para administradores.
        return isset($_GET['cod-trama-diagnostico']) && function_exists('current_user_can') && current_user_can('manage_options');
    }

    /**
     * Encola el motor y el reproductor en la página publicada. Quien llama
     * decide si hace falta (ver `hay_trama`); el editor Canvas y el editor en
     * línea los encolan siempre, porque cualquier sección puede recibir una.
     */
    public static function encolar(): void
    {
        wp_register_script('contope-trama', self::url_motor(), [], COD_PUBLISHER_VERSION, true);
        wp_enqueue_script(
            'cod-trama',
            plugins_url('assets/js/cod-trama.js', COD_PUBLISHER_FILE),
            ['contope-trama'],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_add_inline_script('cod-trama', self::configuracion_js(), 'before');
    }
}
