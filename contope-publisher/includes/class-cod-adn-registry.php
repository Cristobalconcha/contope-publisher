<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * El registro de diseño: la lista de nombres que un documento puede referenciar.
 *
 * Es la ÚNICA función que la compuerta (COD_ADN_Gate) consulta para saber qué
 * variables existen. Hoy el registro sale de lo que el sitio ya emite:
 *
 *   1. las definiciones del tema guardadas por el plugin (Configuración):
 *      `--cod-color-bg`, `--cod-font-heading`, `--cod-radius`…,
 *   2. los roles del núcleo declarados (COD_Design_Core): `--cod-color-accent`…,
 *   3. el theme.json del tema activo, tal como WordPress lo imprime:
 *      `--wp--preset--color--*`, `--wp--preset--font-family--*`,
 *      `--wp--preset--font-size--*`, `--wp--preset--spacing--*`,
 *      `--wp--preset--shadow--*`, `--wp--custom--*`,
 *      `--wp--style--global--content-size|wide-size`.
 *
 * Mañana el registro saldrá de la proyección del ADN. Para que eso no obligue a
 * tocar la compuerta, TODO el que quiera saber qué nombres existen llama a
 * `COD_ADN_Registry::get()` y a nada más: cuando haya ADN cambia esta función
 * (o la prende el filtro `cod_adn_registry`) y la compuerta sigue igual.
 *
 * Forma de lo que devuelve `get()`:
 *
 *   [
 *     'designId' => '',            // id del ADN; '' mientras el registro es el del sitio
 *     'revision' => 0,             // revisión del ADN activo; 0 mientras no hay ADN
 *     'fuente'   => 'sitio',       // 'sitio' (hoy) | 'adn' (mañana)
 *     'nombres'  => [
 *       '--wp--preset--color--accent' => [
 *         'clase'  => 'color',     // ver CLASES
 *         'estado' => 'confirmed', // confirmed | proposed (las propuestas no llegan a lo público)
 *         'origen' => 'theme.json',
 *         'valor'  => '#f26621',   // sólo para sugerir; puede ser ''
 *       ],
 *     ],
 *   ]
 */
final class COD_ADN_Registry
{
    public const FILTER = 'cod_adn_registry';

    /**
     * Las clases de diseño que un nombre puede tener. `neutro` es una variable
     * del registro que no es un valor de diseño (p. ej. `--cod-mode`).
     * `libre` es un nombre de `--wp--custom--*` que el tema no clasificó: sirve
     * en cualquier clase, porque el tema es quien lo declaró.
     */
    public const CLASES = [
        'color', 'familia', 'tamano', 'tipografia-fina', 'espaciado', 'radio',
        'borde-grosor', 'sombra', 'movimiento', 'ancho-de-caja', 'neutro', 'libre',
    ];

    /** Prefijos reservados: sólo los escribe la proyección del diseño, nunca un documento. */
    public const PREFIJOS_RESERVADOS = ['--wp--preset--', '--wp--custom--', '--wp--style--', '--cod-'];

    /**
     * Parámetros del MOTOR que la propia documentación del catálogo manda escribir
     * con una regla `properties` (marquesina, aviso, mapa, menú). No son valores
     * de diseño sino configuración de un comportamiento, así que no están
     * reservados aunque lleven el prefijo `--cod-`.
     */
    public const PARAMETROS_DEL_MOTOR = [
        '--cod-marquesina-visibles',
        '--cod-marquesina-separacion',
        '--cod-marquesina-duracion-pieza',
        '--cod-aviso-vuelve-dias',
        '--cod-aviso-ancho-maximo',
        '--cod-mapa-alto',
        '--cod-mapa-ancho-maximo',
        '--cod-nav-panel-display',
    ];

    /** @var array<string, mixed>|null */
    private static ?array $cache = null;

    /** @var array<string, mixed>|null */
    private static ?array $fijado = null;

    /**
     * El registro vigente. Es la única función que entrega los nombres.
     *
     * @return array{designId: string, revision: int, fuente: string, nombres: array<string, array<string, string>>}
     */
    public static function get(): array
    {
        if (self::$fijado !== null) {
            return self::$fijado;
        }
        if (self::$cache !== null) {
            return self::$cache;
        }

        $nombres = [];
        self::desde_definiciones($nombres);
        self::desde_nucleo($nombres);
        self::desde_theme_json($nombres);

        $registro = [
            'designId' => '',
            'revision' => 0,
            'fuente' => 'sitio',
            'nombres' => $nombres,
        ];
        if (function_exists('apply_filters')) {
            $filtrado = apply_filters(self::FILTER, $registro);
            if (is_array($filtrado) && isset($filtrado['nombres']) && is_array($filtrado['nombres'])) {
                $registro = $filtrado;
            }
        }

        // El registro del sitio cambia cuando alguien guarda Configuración o
        // cambia de tema, y eso ocurre en otra petición: un caché por petición
        // basta y nunca queda viejo.
        self::$cache = $registro;
        return $registro;
    }

    /** Para pruebas: reemplaza el registro entero por uno fijo. null lo suelta. */
    public static function fijar_para_prueba(?array $registro): void
    {
        self::$fijado = $registro;
        self::$cache = null;
    }

    public static function reiniciar(): void
    {
        self::$cache = null;
    }

    public static function tiene(string $nombre): bool
    {
        return isset(self::get()['nombres'][$nombre]);
    }

    /** @return array<string, string>|null */
    public static function entrada(string $nombre): ?array
    {
        $e = self::get()['nombres'][$nombre] ?? null;
        return is_array($e) ? $e : null;
    }

    public static function es_parametro_del_motor(string $nombre): bool
    {
        return in_array($nombre, self::PARAMETROS_DEL_MOTOR, true);
    }

    /**
     * ¿Es un nombre que sólo la proyección del diseño puede escribir?
     * Los del registro y los prefijos reservados, salvo los parámetros del motor.
     */
    public static function es_reservado(string $nombre): bool
    {
        if (self::es_parametro_del_motor($nombre)) {
            return false;
        }
        if (self::tiene($nombre)) {
            return true;
        }
        foreach (self::PREFIJOS_RESERVADOS as $prefijo) {
            if (strpos($nombre, $prefijo) === 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * La clase de diseño de un nombre según su forma.
     *
     * @return string una de CLASES
     */
    public static function clase_por_nombre(string $nombre): string
    {
        $mapa = [
            '--wp--preset--color--' => 'color',
            '--wp--preset--font-family--' => 'familia',
            '--wp--preset--font-size--' => 'tamano',
            '--wp--preset--spacing--' => 'espaciado',
            '--wp--preset--shadow--' => 'sombra',
            '--wp--custom--color--' => 'color',
            '--wp--custom--font-family--' => 'familia',
            '--wp--custom--font-size--' => 'tamano',
            '--wp--custom--typography--' => 'tipografia-fina',
            '--wp--custom--spacing--' => 'espaciado',
            '--wp--custom--radius--' => 'radio',
            '--wp--custom--border--' => 'borde-grosor',
            '--wp--custom--shadow--' => 'sombra',
            '--wp--custom--motion--' => 'movimiento',
            '--wp--custom--layout--' => 'ancho-de-caja',
            '--wp--style--global--' => 'ancho-de-caja',
        ];
        foreach ($mapa as $prefijo => $clase) {
            if (strpos($nombre, $prefijo) === 0) {
                return $clase;
            }
        }
        if (strpos($nombre, '--wp--custom--') === 0) {
            return 'libre';
        }
        if (strpos($nombre, '--wp--preset--') === 0) {
            // gradientes y duotonos: sirven sólo en fondos, no en las clases de la compuerta.
            return 'neutro';
        }
        if (strpos($nombre, '--cod-color-') === 0) {
            return 'color';
        }
        if (strpos($nombre, '--cod-font-') === 0) {
            return 'familia';
        }
        if ($nombre === '--cod-size-base' || preg_match('/^--cod-h[1-6]-size$/', $nombre) === 1) {
            return 'tamano';
        }
        if ($nombre === '--cod-radius') {
            return 'radio';
        }
        if ($nombre === '--cod-spacing' || $nombre === '--cod-landing') {
            return 'espaciado';
        }
        if ($nombre === '--cod-layout-width' || $nombre === '--cod-layout-max-width') {
            return 'ancho-de-caja';
        }
        if (strpos($nombre, '--cod-motion-') === 0) {
            return 'movimiento';
        }
        return 'neutro';
    }

    /** @param array<string, array<string, string>> $nombres */
    private static function agregar(array &$nombres, string $nombre, string $origen, string $valor = ''): void
    {
        if (preg_match('/^--[a-z0-9_-]+$/i', $nombre) !== 1 || isset($nombres[$nombre])) {
            return;
        }
        $nombres[$nombre] = [
            'clase' => self::clase_por_nombre($nombre),
            'estado' => 'confirmed',
            'origen' => $origen,
            'valor' => $valor,
        ];
    }

    /** @param array<string, array<string, string>> $nombres */
    private static function desde_definiciones(array &$nombres): void
    {
        if (!class_exists('COD_Theme_Definitions')) {
            return;
        }
        $v = COD_Theme_Definitions::get();
        $con_px = ['size_base' => '--cod-size-base', 'radius' => '--cod-radius', 'spacing' => '--cod-spacing', 'landing' => '--cod-landing'];
        $directos = [
            'mode' => '--cod-mode',
            'color_bg' => '--cod-color-bg', 'color_text' => '--cod-color-text',
            'color_primary' => '--cod-color-primary', 'color_accent' => '--cod-color-accent',
            'font_heading' => '--cod-font-heading', 'font_body' => '--cod-font-body', 'font_accent' => '--cod-font-accent',
            'motion_enter' => '--cod-motion-enter', 'motion_response' => '--cod-motion-response',
        ];
        foreach ($directos as $id => $token) {
            if (isset($v[$id]) && $v[$id] !== '') {
                self::agregar($nombres, $token, 'definiciones', (string) $v[$id]);
            }
        }
        foreach ($con_px as $id => $token) {
            if (isset($v[$id]) && $v[$id] !== '') {
                self::agregar($nombres, $token, 'definiciones', $v[$id] . 'px');
            }
        }
        foreach (COD_Theme_Definitions::nombres_de_escalas() as $nombre => $valor) {
            self::agregar($nombres, $nombre, 'definiciones', $valor);
        }
        for ($i = 1; $i <= 6; $i++) {
            if (isset($v['h' . $i . '_size']) && $v['h' . $i . '_size'] !== '') {
                self::agregar($nombres, '--cod-h' . $i . '-size', 'definiciones', $v['h' . $i . '_size'] . 'px');
            }
        }
        if (($v['layout_mode'] ?? '') === 'liquid') {
            self::agregar($nombres, '--cod-layout-width', 'definiciones', '100%');
        } elseif (($v['layout_mode'] ?? '') === 'boxed' && ($v['layout_max_width'] ?? '') !== '') {
            self::agregar($nombres, '--cod-layout-width', 'definiciones', $v['layout_max_width'] . 'px');
        }
    }

    /** @param array<string, array<string, string>> $nombres */
    private static function desde_nucleo(array &$nombres): void
    {
        if (!class_exists('COD_Design_Core')) {
            return;
        }
        foreach (COD_Design_Core::estado() as $rol) {
            if (!empty($rol['declarado']) && isset($rol['token'])) {
                self::agregar($nombres, (string) $rol['token'], 'nucleo', (string) ($rol['valor'] ?? ''));
            }
        }
    }

    /**
     * Los presets declarados por el tema del sitio (y los que una persona agregó en el editor del
     * sitio), NO los que WordPress trae de fábrica. WordPress imprime sus propios colores
     * (vivid-red, luminous-vivid-orange…), degradados, escalas de espaciado y sombras
     * (natural, deep, sharp…) aunque el tema los desactive para el editor; si entraran al
     * registro, una IA podría pintar con un rojo o una sombra que el diseño del sitio no definió.
     * El registro es lo que el diseño del sitio define, y nada más.
     *
     * @param array<string, array<string, string>> $nombres
     */
    private static function desde_theme_json(array &$nombres): void
    {
        if (function_exists('wp_get_global_settings')) {
            $ajustes = wp_get_global_settings();
            $presets = [
                ['color', 'palette', 'color', 'color'],
                ['color', 'gradients', 'gradient', 'gradient'],
                ['typography', 'fontSizes', 'font-size', 'size'],
                ['typography', 'fontFamilies', 'font-family', 'fontFamily'],
                ['spacing', 'spacingSizes', 'spacing', 'size'],
                ['shadow', 'presets', 'shadow', 'shadow'],
            ];
            foreach ($presets as [$grupo, $clave, $tipo, $campo]) {
                $porOrigen = is_array($ajustes) && isset($ajustes[$grupo][$clave]) && is_array($ajustes[$grupo][$clave]) ? $ajustes[$grupo][$clave] : [];
                foreach (['theme', 'custom'] as $origen) {
                    foreach (($porOrigen[$origen] ?? []) as $p) {
                        if (is_array($p) && isset($p['slug']) && is_string($p['slug'])) {
                            self::agregar($nombres, '--wp--preset--' . $tipo . '--' . $p['slug'], 'theme.json', is_string($p[$campo] ?? null) ? (string) $p[$campo] : '');
                        }
                    }
                }
            }
        }
        if (function_exists('wp_get_global_stylesheet')) {
            $css = wp_get_global_stylesheet(['variables']);
            if (is_string($css) && $css !== '') {
                if (preg_match_all('/(--[a-z0-9_-]+)s*:s*([^;}]*)/i', $css, $m, PREG_SET_ORDER) !== false) {
                    foreach ($m as $par) {
                        // Los presets ya entraron arriba por origen; acá sólo lo personalizado (--wp--custom--*).
                        if (strpos($par[1], '--wp--preset--') === 0) {
                            continue;
                        }
                        self::agregar($nombres, $par[1], 'theme.json', trim($par[2]));
                    }
                }
            }
        }
        if (function_exists('wp_get_global_settings')) {
            $ajustes = wp_get_global_settings();
            $layout = is_array($ajustes) && isset($ajustes['layout']) && is_array($ajustes['layout']) ? $ajustes['layout'] : [];
            if (!empty($layout['contentSize']) && is_string($layout['contentSize'])) {
                self::agregar($nombres, '--wp--style--global--content-size', 'theme.json', $layout['contentSize']);
            }
            if (!empty($layout['wideSize']) && is_string($layout['wideSize'])) {
                self::agregar($nombres, '--wp--style--global--wide-size', 'theme.json', $layout['wideSize']);
            }
        }
    }
}
