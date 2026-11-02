<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * La compuerta del diseño: una IA que usa el MCP no puede saltarse el sistema.
 *
 * QUÉ HACE. Todo valor de diseño que entra por el MCP —color, familia, tamaño de
 * letra, peso, interlineado, espaciado, radio, sombra, borde, movimiento,
 * ancho de caja— tiene que ser una referencia `var(--nombre)` a un nombre del
 * registro de diseño (COD_ADN_Registry) o una palabra neutra (`inherit`,
 * `currentColor`, `transparent`, `0`, `none`, `auto`). Un literal (`#F26621`,
 * `16px`, `'Roboto'`, `0 8px 24px rgba(…)`) se rechaza con un código estable y la
 * ruta exacta de lo rechazado, para que quien llamó sepa qué corregir.
 *
 * También se rechaza: declarar o redefinir una variable reservada (los nombres del
 * registro y los prefijos `--wp--preset--`, `--wp--custom--`, `--wp--style--`,
 * `--cod-`), una variable local con un color literal, un `var(--x, #literal)` con
 * respaldo literal y un `var()` a un nombre que no está en el registro ni
 * declarado en la misma regla.
 *
 * POR QUÉ ESTÁ ACÁ. El sitio de Basis se construyó mal porque el MCP aceptaba
 * valores literales por varias vías (la receta, `cod_patch_css`, el HTML con
 * `style=""`, los atributos de presentación de un SVG, `projectData`). Un
 * rechazo en una sola vía no sirve: la IA usa la que queda abierta. Por eso hay
 * UNA clase con UN criterio, y cada herramienta del servicio MCP que escribe
 * diseño pasa por ella (ver COD_Canvas_MCP_Service::guarded_save() y
 * ::compile_gated()).
 *
 * LOS CUATRO MODOS (opción `cod_adn_gate_mode`, o la constante
 * COD_ADN_GATE_MODE de wp-config.php, que gana sobre la opción):
 *
 *   off      no hace nada. El comportamiento de siempre (Santa Luisa, Econut).
 *   observe  revisa e informa en `adnGate`; nunca rechaza.
 *   ratchet  rechaza sólo lo que AGREGA deuda; lo heredado pasa y se cuenta.
 *   enforce  receta: rechaza todo literal. Herramientas crudas: ningún literal
 *            nuevo (lo ya guardado, incluido lo que puso el motor, pasa).
 *
 * El modo NO se cambia por el MCP. Sólo `set_modo()`, llamado desde la
 * administración de WordPress (cookie + nonce, que una contraseña de aplicación
 * no da), y la constante. Si no, la IA se lo saltaría apagándola.
 *
 * LA EDICIÓN HUMANA en el editor visual queda fuera (lo dice la espec): la regla
 * del dueño es sobre el MCP. Pero el MCP no puede usar el editor como puerta
 * trasera: todo lo que una escritura por MCP deja en `projectData` se revisa igual.
 */
final class COD_ADN_Gate
{
    public const OPTION_MODE = 'cod_adn_gate_mode';
    public const OPTION_LOG = 'cod_adn_gate_log';
    public const MODES = ['off', 'observe', 'ratchet', 'enforce'];
    public const MAX_VIOLACIONES_EN_ERROR = 25;

    /** clase → código de error */
    public const CODIGOS = [
        'color' => 'ADN_LITERAL_COLOR',
        'familia' => 'ADN_LITERAL_FONT',
        'tamano' => 'ADN_LITERAL_SIZE',
        'tipografia-fina' => 'ADN_LITERAL_FINE',
        'espaciado' => 'ADN_LITERAL_SPACING',
        'radio' => 'ADN_LITERAL_RADIUS',
        'borde-grosor' => 'ADN_LITERAL_BORDER',
        'sombra' => 'ADN_LITERAL_SHADOW',
        'movimiento' => 'ADN_LITERAL_MOTION',
        'ancho-de-caja' => 'ADN_LITERAL_MEASURE',
    ];

    /**
     * Las reglas de diseño (`kind`) y qué campo de cada una es de qué clase. Cada
     * campo se revisa como si fuera esta propiedad CSS. Está acá, declarado, y no
     * disperso en los validadores, para que `cod_get_capabilities` lo publique:
     * quien construya ve qué campos están gobernados ANTES de componer.
     *
     * @var array<string, array<string, string>>
     */
    public const CAMPOS_DE_REGLA = [
        'color' => ['color' => 'color'],
        'typography' => [
            'family' => 'font-family', 'fontSize' => 'font-size', 'fontWeight' => 'font-weight',
            'lineHeight' => 'line-height', 'letterSpacing' => 'letter-spacing', 'measure' => 'max-width',
        ],
        'spacing' => [
            'paddingBlock' => 'padding-block', 'paddingInline' => 'padding-inline',
            'marginBlockStart' => 'margin-block-start', 'marginBlockEnd' => 'margin-block-end',
            'gap' => 'gap', 'indent' => 'padding-inline-start', 'bleed' => 'margin-inline',
            'landing' => 'scroll-margin-block-start',
        ],
        'layout' => ['gap' => 'gap', 'minColumnWidth' => 'gap', 'maxWidth' => 'max-width', 'mobile.gap' => 'gap'],
        'surface' => [
            'backgroundColor' => 'background-color', 'foregroundColor' => 'color',
            'overlayColor' => 'background-color', 'borderColor' => 'border-color',
            'borderWidth' => 'border-width',
            'backgroundGradient.stops[].color' => 'background-color',
            'backgroundPattern.color' => 'background-color', 'backgroundMask.color' => 'background-color',
        ],
        'shape' => ['radius' => 'border-radius', 'borderWidth' => 'border-width'],
        'media' => ['overlayColor' => 'background-color'],
        'gallery' => ['gap' => 'gap'],
        'form' => ['maxWidth' => 'max-width', 'theme.*' => '(según el tipo de la variable)'],
        'divisor' => ['color' => 'background-color', 'espacio' => 'padding-block', 'capas[].color' => 'background-color'],
        'icono' => ['tamano' => 'gap', 'separacion' => 'gap', 'color' => 'color'],
        'properties' => ['declarations.*' => '(la propiedad CSS que nombra la clave)'],
    ];

    /**
     * Reglas que no llevan valores de diseño de estas clases —o cuyos valores son
     * composición de la página o nombres del motor— y por eso no se revisan acá.
     * Cada una dice por qué. Si el compilador suma un kind nuevo y no está ni en
     * CAMPOS_DE_REGLA ni acá, la prueba de completitud falla: ningún kind queda
     * sin clasificar por olvido.
     *
     * @var array<string, string>
     */
    public const REGLAS_EXENTAS = [
        'interaction' => 'comportamiento, no apariencia',
        'cadence' => 'reparte reglas ya revisadas',
        'anchor' => 'cómo aparece un nodo; sus tiempos y desplazamientos son del motor',
        'motion' => 'duración y retardo son parámetros del motor; no hay nombre del registro con qué reemplazarlos (movimiento por CSS sí se revisa)',
        'button' => 'valores NOMBRADOS del motor (variant/tone/size); pendiente de F4b',
        'table' => 'valores NOMBRADOS del motor (variant/header/density); pendiente de F4b',
        'posicion' => 'ubicación de la caja en la página (composición), no identidad',
        'desborde' => 'composición de la página',
        'transformacion' => 'composición de la página',
    ];

    /** Propiedades CSS de color. */
    private const PROPS_COLOR = [
        'color', 'background-color', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color',
        'border-left-color', 'border-block-color', 'border-inline-color', 'border-block-start-color',
        'border-block-end-color', 'border-inline-start-color', 'border-inline-end-color', 'outline-color',
        'text-decoration-color', 'text-emphasis-color', 'caret-color', 'accent-color', 'column-rule-color',
        'fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'scrollbar-color',
        '-webkit-text-fill-color', '-webkit-text-stroke-color', '-webkit-tap-highlight-color',
    ];

    private const NOMBRES_DE_COLOR = 'aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen';

    private const FAMILIAS_GENERICAS = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong'];

    /** Cuántas declaraciones se han examinado (para informar `revisadas`). */
    private static int $examinadas = 0;

    /** @var array<int, string> lo que no se pudo analizar: se trata como violación, nunca como «no hay nada». */
    private static array $fallos_de_analisis = [];

    // =====================================================================
    // Modo
    // =====================================================================

    /** Lo que dice el sitio. La constante de wp-config.php gana sobre la opción. */
    public static function modo(): string
    {
        if (defined('COD_ADN_GATE_MODE')) {
            $c = constant('COD_ADN_GATE_MODE');
            if (is_string($c) && in_array($c, self::MODES, true)) {
                return $c;
            }
        }
        $m = get_option(self::OPTION_MODE, 'off');
        return is_string($m) && in_array($m, self::MODES, true) ? $m : 'off';
    }

    public static function activo(): bool
    {
        return self::modo() !== 'off';
    }

    public static function modo_fijado_por_constante(): bool
    {
        return defined('COD_ADN_GATE_MODE') && is_string(constant('COD_ADN_GATE_MODE')) && in_array(constant('COD_ADN_GATE_MODE'), self::MODES, true);
    }

    /**
     * Cambia el modo. SOLO desde la administración de WordPress.
     *
     * Rechaza si la petición es REST o es una llamada del MCP: la IA llega por
     * ahí, y poder apagar la compuerta desde ahí sería no tener compuerta. La
     * administración llega con cookie y nonce (una contraseña de aplicación no
     * autentica `admin-post.php`), y `COD_ADN_Gate_Admin` los comprueba antes
     * de llamar acá; este método no se fía de eso y vuelve a comprobar el
     * contexto.
     *
     * @return true|WP_Error
     */
    public static function set_modo(string $modo)
    {
        if (!in_array($modo, self::MODES, true)) {
            return new WP_Error('cod_adn_gate_modo_invalido', 'El modo debe ser off, observe, ratchet o enforce.');
        }
        if (self::en_mcp() || (defined('REST_REQUEST') && REST_REQUEST)) {
            return new WP_Error('cod_adn_gate_modo_prohibido', 'El modo de la compuerta no se cambia por el MCP ni por REST: sólo desde la administración de WordPress.');
        }
        if (!function_exists('current_user_can') || !current_user_can('manage_options')) {
            return new WP_Error('cod_adn_gate_modo_prohibido', 'Cambiar el modo de la compuerta exige permisos de administración.');
        }
        if (self::modo_fijado_por_constante()) {
            return new WP_Error('cod_adn_gate_modo_constante', 'El modo lo fija la constante COD_ADN_GATE_MODE en wp-config.php; se cambia allí.');
        }
        update_option(self::OPTION_MODE, $modo, false);
        return true;
    }

    /** Lo prende el servidor MCP mientras atiende una llamada a una herramienta. */
    private static bool $mcp = false;

    public static function entrar_en_mcp(): void
    {
        self::$mcp = true;
    }

    public static function salir_de_mcp(): void
    {
        self::$mcp = false;
    }

    public static function en_mcp(): bool
    {
        return self::$mcp;
    }

    // =====================================================================
    // Descriptor para cod_get_capabilities
    // =====================================================================

    /** @return array<string, mixed> */
    public static function descriptor(): array
    {
        $registro = COD_ADN_Registry::get();
        $por_clase = [];
        foreach ($registro['nombres'] as $nombre => $e) {
            $clase = (string) ($e['clase'] ?? 'neutro');
            if ($clase === 'neutro') {
                continue;
            }
            $por_clase[$clase][] = $nombre;
        }
        foreach ($por_clase as $clase => $lista) {
            sort($lista);
            $por_clase[$clase] = array_slice($lista, 0, 80);
        }
        $modo = self::modo();
        $d = [
            'modo' => $modo,
            'cambiaPor' => 'La administración de WordPress (ContOpe Design → Compuerta del diseño) o la constante COD_ADN_GATE_MODE. No se cambia por el MCP.',
            'registro' => [
                'fuente' => $registro['fuente'],
                'designId' => $registro['designId'],
                'revision' => $registro['revision'],
                'totalNombres' => count($registro['nombres']),
            ],
        ];
        if ($modo === 'off') {
            return $d;
        }
        $d['reglas'] = [
            'Todo valor de diseño (color, familia, tamaño de letra, peso, interlineado, espaciado, radio, sombra, borde, movimiento, ancho de caja) debe ser var(--nombre) de este registro, o una palabra neutra: inherit, currentColor, transparent, 0, none, auto.',
            'Una variable reservada (los nombres del registro y los prefijos --wp--preset--, --wp--custom--, --wp--style--, --cod-) no se declara ni redefine: ADN_VAR_RESERVED.',
            'Una variable local (--x) no puede llevar un color literal, ni un valor literal si se usa en una propiedad gobernada.',
            'var(--x, respaldo) no admite un respaldo literal; var(--x) exige que --x esté en el registro o se declare en la misma regla: ADN_VAR_UNKNOWN.',
            'Lo mismo vale para style="" y para los atributos de presentación SVG (fill, stroke, stop-color; font-* en text/tspan) y para los estilos de projectData.',
        ];
        $d['nombresPorClase'] = $por_clase;
        $d['camposGobernados'] = self::CAMPOS_DE_REGLA;
        $d['reglasNoRevisadas'] = self::REGLAS_EXENTAS;
        return $d;
    }

    // =====================================================================
    // Revisión de la receta (cod_preview / cod_apply)
    // =====================================================================

    /**
     * Lo que la persona escribió en `style` de cod_activate_section_whatsapp.
     *
     * @param array<string, mixed> $style
     * @return array<string, mixed> informe
     */
    public static function revisar_estilo_whatsapp(array $style): array
    {
        $modo = self::modo();
        $antes_n = self::$examinadas;
        $out = [];
        foreach (['iconColor' => 'color', 'backgroundColor' => 'background-color', 'borderRadius' => 'border-radius'] as $campo => $pseudo) {
            if (isset($style[$campo]) && is_string($style[$campo])) {
                foreach (self::revisar_declaracion($pseudo, $style[$campo], 'style.' . $campo, []) as $v) {
                    $out[] = $v;
                }
            }
        }
        return self::informe($modo, self::$examinadas - $antes_n, $out, 0, 'cod_activate_section_whatsapp');
    }

    /**
     * Revisa las reglas ya normalizadas de una receta y el contenido de nodos que
     * lleva colores o medidas. En `ratchet` sólo cuenta lo que no estaba en
     * $reglas_base (las reglas de la composición ya guardada); en `enforce` y
     * `observe` cuenta todo.
     *
     * @param array<int, array<string, mixed>> $reglas normalizadas
     * @param array<int, array<string, mixed>> $nodos   los nodos de la composición tal como llegaron
     * @param array<int, array<string, mixed>>|null $reglas_base
     * @param array<string, string> $tipos_tema_formulario clave → tipo (color, length, font, ratio, weight, shadow, keyword)
     * @return array<string, mixed> informe
     */
    public static function revisar_receta(array $reglas, array $nodos, ?array $reglas_base, array $tipos_tema_formulario = []): array
    {
        $modo = self::modo();
        $antes_n = self::$examinadas;
        $violaciones = self::violaciones_de_receta($reglas, $nodos, $tipos_tema_formulario);
        $revisadas = self::$examinadas - $antes_n;
        $heredadas = 0;
        if ($modo === 'ratchet' && $reglas_base !== null) {
            $base = self::violaciones_de_receta($reglas_base, [], $tipos_tema_formulario);
            $conteo = [];
            foreach ($base as $v) {
                $conteo[$v['clave']] = ($conteo[$v['clave']] ?? 0) + 1;
            }
            $nuevas = [];
            foreach ($violaciones as $v) {
                if (($conteo[$v['clave']] ?? 0) > 0) {
                    --$conteo[$v['clave']];
                    ++$heredadas;
                    continue;
                }
                $nuevas[] = $v;
            }
            $violaciones = $nuevas;
        }
        return self::informe($modo, $revisadas, $violaciones, $heredadas, 'receta');
    }

    /**
     * @param array<int, array<string, mixed>> $reglas
     * @param array<int, array<string, mixed>> $nodos
     * @param array<string, string> $tipos
     * @return array<int, array<string, mixed>>
     */
    private static function violaciones_de_receta(array $reglas, array $nodos, array $tipos): array
    {
        $out = [];
        foreach ($reglas as $regla) {
            if (!is_array($regla) || !isset($regla['kind'], $regla['id']) || !is_array($regla['value'] ?? null)) {
                continue;
            }
            $kind = (string) $regla['kind'];
            $id = (string) $regla['id'];
            $valor = $regla['value'];
            $base = 'design.rules[' . $id . '].value';

            if ($kind === 'properties') {
                $decls = [];
                foreach (($valor['declarations'] ?? []) as $prop => $val) {
                    if (is_string($prop) && is_string($val)) {
                        $decls[] = [$prop, $val];
                    }
                }
                foreach (self::revisar_bloque($decls, $base . '.declarations') as $v) {
                    $out[] = $v;
                }
                continue;
            }
            if (!isset(self::CAMPOS_DE_REGLA[$kind])) {
                continue;
            }

            if ($kind === 'surface' && isset($valor['shadow']) && $valor['shadow'] !== 'none') {
                $out[] = self::violacion(
                    'ADN_NO_DEFINITION',
                    'sombra',
                    'surface.shadow',
                    (string) $valor['shadow'],
                    $base . '.shadow',
                    'surface.shadow "' . $valor['shadow'] . '" es un nombre del motor y el registro de diseño no declara una escala de sombras con la que reemplazarlo: no se inventa un valor.'
                );
            }
            foreach (self::CAMPOS_DE_REGLA[$kind] as $campo => $pseudo) {
                if ($campo === 'theme.*') {
                    foreach (($valor['theme'] ?? []) as $clave => $bruto) {
                        if (!is_string($clave) || !is_string($bruto)) {
                            continue;
                        }
                        $p = self::propiedad_para_tipo($tipos[$clave] ?? '', $clave);
                        if ($p === null) {
                            continue;
                        }
                        foreach (self::revisar_declaracion($p, $bruto, $base . '.theme.' . $clave, []) as $v) {
                            $out[] = $v;
                        }
                    }
                    continue;
                }
                if ($campo === 'declarations.*') {
                    continue;
                }
                foreach (self::valores_en($valor, $campo, $base) as [$ruta, $v]) {
                    foreach (self::revisar_declaracion($pseudo, $v, $ruta, []) as $viol) {
                        $out[] = $viol;
                    }
                }
            }
        }
        foreach (self::violaciones_de_nodos($nodos, 'composition.nodes') as $v) {
            $out[] = $v;
        }
        return $out;
    }

    /**
     * Saca los valores de un campo (con soporte para `a.b`, `lista[].campo`) como
     * [ruta, texto]. Un número (fontWeight: 700) se revisa como su texto.
     *
     * @param array<string, mixed> $valor
     * @return array<int, array{0: string, 1: string}>
     */
    private static function valores_en(array $valor, string $campo, string $base): array
    {
        $partes = explode('.', $campo);
        $nivel = [[$base, $valor]];
        foreach ($partes as $parte) {
            $siguiente = [];
            $es_lista = substr($parte, -2) === '[]';
            $nombre = $es_lista ? substr($parte, 0, -2) : $parte;
            foreach ($nivel as [$ruta, $nodo]) {
                if (!is_array($nodo) || !array_key_exists($nombre, $nodo)) {
                    continue;
                }
                $hijo = $nodo[$nombre];
                if ($es_lista) {
                    if (!is_array($hijo)) {
                        continue;
                    }
                    foreach ($hijo as $i => $elemento) {
                        $siguiente[] = [$ruta . '.' . $nombre . '[' . $i . ']', $elemento];
                    }
                } else {
                    $siguiente[] = [$ruta . '.' . $nombre, $hijo];
                }
            }
            $nivel = $siguiente;
        }
        $out = [];
        foreach ($nivel as [$ruta, $nodo]) {
            if (is_string($nodo)) {
                $out[] = [$ruta, $nodo];
            } elseif (is_int($nodo) || is_float($nodo)) {
                $out[] = [$ruta, (string) $nodo];
            }
        }
        return $out;
    }

    private static function propiedad_para_tipo(string $tipo, string $clave): ?string
    {
        switch ($tipo) {
            case 'color':
                return 'color';
            case 'font':
                return 'font-family';
            case 'ratio':
                return 'line-height';
            case 'weight':
                return 'font-weight';
            case 'shadow':
                return 'box-shadow';
            case 'length':
                if (stripos($clave, 'radio') !== false || stripos($clave, 'radius') !== false) {
                    return 'border-radius';
                }
                if (stripos($clave, 'tamano') !== false) {
                    return 'font-size';
                }
                if (stripos($clave, 'borde') !== false) {
                    return 'border-width';
                }
                return 'gap';
        }
        return null;
    }

    /**
     * Contenido de nodos con colores o medidas propios (whatsapp, social, chart).
     * Se revisa lo que la persona ESCRIBIÓ, no los valores por omisión del motor.
     *
     * @param array<int, mixed> $nodos
     * @return array<int, array<string, mixed>>
     */
    private static function violaciones_de_nodos(array $nodos, string $ruta): array
    {
        $out = [];
        foreach ($nodos as $i => $nodo) {
            if (!is_array($nodo)) {
                continue;
            }
            $id = isset($nodo['id']) && is_string($nodo['id']) ? $nodo['id'] : (string) $i;
            $kind = isset($nodo['kind']) && is_string($nodo['kind']) ? $nodo['kind'] : '';
            $contenido = isset($nodo['content']) && is_array($nodo['content']) ? $nodo['content'] : [];
            $mapa = [];
            if ($kind === 'whatsapp' || $kind === 'social') {
                $mapa = ['iconColor' => 'color', 'backgroundColor' => 'background-color', 'borderRadius' => 'border-radius'];
            } elseif ($kind === 'chart') {
                $mapa = ['color' => 'color'];
            }
            foreach ($mapa as $campo => $pseudo) {
                if (isset($contenido[$campo]) && is_string($contenido[$campo])) {
                    foreach (self::revisar_declaracion($pseudo, $contenido[$campo], $ruta . '[' . $id . '].content.' . $campo, []) as $v) {
                        $out[] = $v;
                    }
                }
            }
            if (isset($nodo['children']) && is_array($nodo['children'])) {
                foreach (self::violaciones_de_nodos($nodo['children'], $ruta) as $v) {
                    $out[] = $v;
                }
            }
        }
        return $out;
    }

    // =====================================================================
    // Revisión de un documento (herramientas crudas)
    // =====================================================================

    /**
     * Revisa lo que una escritura cruda DEJA en el documento, contra lo que ya
     * había. Cuenta como violación sólo lo que no estaba antes (como multiconjunto
     * de clave: código, propiedad y valor): lo heredado pasa y se cuenta.
     *
     * Superficies, todas: el CSS, el `style=""` y los atributos de presentación
     * SVG del HTML, los `<style>` que traiga el HTML y los estilos de projectData.
     * Un literal que sólo está en projectData (y no en el CSS ni en el HTML) se
     * informa como ADN_PROJECT_DATA_MISMATCH: reaparecería al guardar desde el editor.
     *
     * @param array<string, string> $antes   projectData, html, css guardados
     * @param array<string, string> $despues projectData, html, css que se van a guardar
     * @return array<string, mixed> informe
     */
    public static function revisar_documento(array $antes, array $despues, string $herramienta): array
    {
        $modo = self::modo();
        $antes_n = self::$examinadas;
        $nuevo = self::violaciones_de_documento($despues);
        $revisadas = self::$examinadas - $antes_n;
        $previo = self::violaciones_de_documento($antes);
        $conteo = [];
        foreach ($previo as $v) {
            $conteo[$v['clave']] = ($conteo[$v['clave']] ?? 0) + 1;
        }
        $nuevas = [];
        $heredadas = 0;
        foreach ($nuevo as $v) {
            if (($conteo[$v['clave']] ?? 0) > 0) {
                --$conteo[$v['clave']];
                ++$heredadas;
                continue;
            }
            $nuevas[] = $v;
        }
        return self::informe($modo, $revisadas, $nuevas, $heredadas, $herramienta);
    }

    /**
     * @param array<string, string> $doc
     * @return array<int, array<string, mixed>>
     */
    private static function violaciones_de_documento(array $doc): array
    {
        $css = (string) ($doc['css'] ?? '');
        $html = (string) ($doc['html'] ?? '');
        $project = (string) ($doc['projectData'] ?? '');

        self::$fallos_de_analisis = [];
        $visibles = [];
        foreach (self::bloques_css($css, 'css') as $b) {
            foreach (self::revisar_bloque($b['decls'], $b['ruta']) as $v) {
                $visibles[] = $v;
            }
        }
        foreach (self::bloques_html($html, 'html') as $b) {
            foreach (self::revisar_bloque($b['decls'], $b['ruta']) as $v) {
                $visibles[] = $v;
            }
        }

        foreach (self::$fallos_de_analisis as $donde) {
            $visibles[] = self::violacion(
                'ADN_SCAN_FAILED',
                'analisis',
                '(documento)',
                $donde,
                $donde,
                'No se pudo analizar esta parte del documento (demasiado grande o mal formada), y lo que no se puede revisar no se acepta.'
            );
        }

        $claves_visibles = [];
        foreach ($visibles as $v) {
            $claves_visibles[$v['clave']] = true;
        }

        $ocultas = [];
        if ($project !== '' && $project !== '{}') {
            $datos = json_decode($project, true);
            if (!is_array($datos)) {
                $visibles[] = self::violacion('ADN_SCAN_FAILED', 'analisis', '(projectData)', 'JSON', 'projectData', 'projectData no es JSON analizable; lo que no se puede revisar no se acepta.');
            } else {
                $bloques = [];
                self::bloques_project($datos, 'projectData', $bloques);
                foreach ($bloques as $b) {
                    foreach (self::revisar_bloque($b['decls'], $b['ruta']) as $v) {
                        if (isset($claves_visibles[$v['clave']])) {
                            // El mismo literal ya está a la vista en el CSS o el HTML: se informa allí.
                            continue;
                        }
                        // Escondido sólo en projectData. Es otra clave: lo que importa es dónde vive.
                        $v['codigoOriginal'] = $v['codigo'];
                        $v['codigo'] = 'ADN_PROJECT_DATA_MISMATCH';
                        $v['mensaje'] = 'ADN_PROJECT_DATA_MISMATCH — ' . $v['ruta'] . ': projectData trae «' . $v['propiedad'] . ': ' . $v['valor'] . '» ('
                            . $v['codigoOriginal'] . ') que no está en el CSS ni en el HTML que se envían. El editor visual toma projectData como fuente del CSS: ese valor reaparecería al guardar desde allí. '
                            . 'El CSS derivado de projectData debe coincidir con el CSS enviado y no traer ningún literal que el CSS no traiga.';
                        $v['clave'] = 'ADN_PROJECT_DATA_MISMATCH|' . $v['propiedad'] . '|' . self::normalizar_valor($v['valor']);
                        $ocultas[] = $v;
                    }
                }
            }
        }
        return array_merge($visibles, $ocultas);
    }

    // =====================================================================
    // CSS: bloques y declaraciones
    // =====================================================================

    /**
     * Parte un CSS en bloques de declaraciones: [{ruta, decls: [[prop, valor], …]}].
     * Entiende comentarios, cadenas, paréntesis (un `;` dentro de url(…) no corta),
     * @media/@supports anidados y anidamiento CSS. Salta lo que no es diseño
     * del sitio: @font-face, @page, @property, @counter-style.
     *
     * @return array<int, array{ruta: string, decls: array<int, array{0: string, 1: string}>}>
     */
    public static function bloques_css(string $css, string $ruta_base): array
    {
        $css = (string) preg_replace('#/\*.*?\*/#s', '', $css);
        $n = strlen($css);
        $pila = [];      // [{prelude, decls, saltar}]
        $bloques = [];
        $buf = '';
        $par = 0;
        $comilla = '';
        for ($i = 0; $i < $n; $i++) {
            $c = $css[$i];
            if ($comilla !== '') {
                $buf .= $c;
                if ($c === '\\' && $i + 1 < $n) {
                    $buf .= $css[++$i];
                } elseif ($c === $comilla) {
                    $comilla = '';
                }
                continue;
            }
            if ($c === '"' || $c === "'") {
                $comilla = $c;
                $buf .= $c;
                continue;
            }
            if ($c === '(') {
                ++$par;
            } elseif ($c === ')' && $par > 0) {
                --$par;
            }
            if ($par === 0 && $c === '{') {
                $prelude = trim((string) preg_replace('/\s+/', ' ', $buf));
                $saltar = (bool) preg_match('/^@(?:font-face|page|property|counter-style|font-feature-values|font-palette-values)\b/i', $prelude);
                $pila[] = ['prelude' => $prelude, 'decls' => [], 'saltar' => $saltar];
                $buf = '';
                continue;
            }
            if ($par === 0 && ($c === ';' || $c === '}')) {
                if ($pila !== [] && trim($buf) !== '') {
                    self::agregar_declaracion($pila[count($pila) - 1], $buf);
                }
                $buf = '';
                if ($c === '}' && $pila !== []) {
                    $marco = array_pop($pila);
                    if ($marco['decls'] !== [] && !$marco['saltar']) {
                        $ambito = [];
                        foreach ($pila as $p) {
                            $ambito[] = $p['prelude'];
                        }
                        $ambito[] = $marco['prelude'];
                        $ruta = $ruta_base . ': ' . self::recortar(implode(' › ', $ambito), 110);
                        $bloques[] = ['ruta' => $ruta, 'decls' => $marco['decls']];
                    }
                }
                continue;
            }
            $buf .= $c;
        }
        return $bloques;
    }

    /** @param array{prelude: string, decls: array<int, array{0: string, 1: string}>, saltar: bool} $marco */
    private static function agregar_declaracion(array &$marco, string $texto): void
    {
        $pos = strpos($texto, ':');
        if ($pos === false) {
            return;
        }
        $prop = trim(substr($texto, 0, $pos));
        $valor = trim((string) preg_replace('/\s+/', ' ', substr($texto, $pos + 1)));
        if ($prop === '' || $valor === '') {
            return;
        }
        // Un nombre con caracteres raros (un escape CSS como \63olor) lo lee el navegador
        // como otro y esta revisión no: se conserva tal cual y revisar_declaracion() lo rechaza.
        $marco['decls'][] = [strpos($prop, '--') === 0 ? $prop : strtolower($prop), $valor];
    }

    /**
     * Bloques de un HTML: cada `style=""`, los atributos de presentación SVG y los
     * <style>. Cada elemento es su propio bloque (las variables locales de un
     * `style` valen sólo para ese elemento).
     *
     * @return array<int, array{ruta: string, decls: array<int, array{0: string, 1: string}>}>
     */
    public static function bloques_html(string $html, string $ruta_base): array
    {
        $bloques = [];
        if ($html === '') {
            return $bloques;
        }
        if (preg_match('#<link\b[^>]*\brel\s*=\s*(?:"|\')?\s*stylesheet#i', $html) === 1) {
            $bloques[] = ['ruta' => $ruta_base . ': <link rel="stylesheet">', 'decls' => [['__hoja_externa__', 'stylesheet']]];
        }
        $estilos = preg_match_all('#<style\b[^>]*>(.*?)</style>#is', $html, $m);
        if ($estilos === false) {
            self::$fallos_de_analisis[] = $ruta_base . ' <style>';
        } elseif ($estilos > 0) {
            foreach ($m[1] as $i => $contenido) {
                foreach (self::bloques_css((string) $contenido, $ruta_base . ' <style>[' . $i . ']') as $b) {
                    $bloques[] = $b;
                }
            }
        }
        if (preg_match_all('/<([a-zA-Z][a-zA-Z0-9:-]*)\b((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>/s', $html, $tags, PREG_SET_ORDER) === false) {
            self::$fallos_de_analisis[] = $ruta_base . ' (etiquetas)';
            return $bloques;
        }
        $n = 0;
        foreach ($tags as $t) {
            $etiqueta = strtolower($t[1]);
            $atributos = $t[2];
            if ($atributos === '') {
                continue;
            }
            if (preg_match_all('/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+))/', $atributos, $a, PREG_SET_ORDER) === false) {
                self::$fallos_de_analisis[] = $ruta_base . ': <' . $etiqueta . '>#' . $n;
                continue;
            }
            $decls = [];
            foreach ($a as $par) {
                $nombre = strtolower($par[1]);
                $crudo = ($par[2] ?? '') !== '' ? $par[2] : ((($par[3] ?? '') !== '') ? $par[3] : ($par[4] ?? ''));
                $valor = html_entity_decode($crudo, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                if ($nombre === 'style') {
                    foreach (self::bloques_css('x{' . $valor . '}', '') as $b) {
                        foreach ($b['decls'] as $d) {
                            $decls[] = $d;
                        }
                    }
                    continue;
                }
                $prop = self::propiedad_de_atributo_svg($nombre, $etiqueta);
                if ($prop !== null && trim($valor) !== '') {
                    $decls[] = [$prop, trim($valor)];
                }
            }
            if ($decls !== []) {
                $bloques[] = ['ruta' => $ruta_base . ': <' . $etiqueta . '>#' . $n, 'decls' => $decls];
            }
            ++$n;
        }
        return $bloques;
    }

    private static function recortar(string $texto, int $max): string
    {
        return strlen($texto) > $max ? substr($texto, 0, $max - 1) . '…' : $texto;
    }

    private static function propiedad_de_atributo_svg(string $atributo, string $etiqueta): ?string
    {
        if (in_array($atributo, ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color'], true)) {
            return $atributo;
        }
        if ($atributo === 'bgcolor') {
            return 'background-color';
        }
        if (in_array($etiqueta, ['text', 'tspan'], true) && in_array($atributo, ['font-family', 'font-size', 'font-weight', 'letter-spacing'], true)) {
            return $atributo;
        }
        return null;
    }

    /**
     * Bloques de un projectData (JSON de GrapesJS o el envoltorio de la receta):
     * `styles` como texto o como lista de reglas, `style` de componentes (objeto
     * o texto), `attributes` (style y atributos SVG) y todo texto que sea HTML.
     *
     * @param mixed $nodo
     * @param array<int, array{ruta: string, decls: array<int, array{0: string, 1: string}>}> $bloques
     */
    private static function bloques_project($nodo, string $ruta, array &$bloques): void
    {
        if (is_string($nodo)) {
            if (strpos($nodo, '<') !== false) {
                foreach (self::bloques_html($nodo, $ruta) as $b) {
                    $bloques[] = $b;
                }
            }
            return;
        }
        if (!is_array($nodo)) {
            return;
        }
        $etiqueta = isset($nodo['tagName']) && is_string($nodo['tagName']) ? strtolower($nodo['tagName']) : '';
        foreach ($nodo as $clave => $valor) {
            $sub = $ruta . (is_int($clave) ? '[' . $clave . ']' : '.' . $clave);
            if ($clave === 'styles') {
                if (is_string($valor)) {
                    foreach (self::bloques_css($valor, $sub) as $b) {
                        $bloques[] = $b;
                    }
                } elseif (is_array($valor)) {
                    foreach ($valor as $i => $regla) {
                        if (is_array($regla) && isset($regla['style']) && is_array($regla['style'])) {
                            $decls = [];
                            foreach ($regla['style'] as $p => $v) {
                                if (is_string($p) && (is_string($v) || is_int($v) || is_float($v))) {
                                    $decls[] = [strpos($p, '--') === 0 ? $p : strtolower($p), (string) $v];
                                }
                            }
                            if ($decls !== []) {
                                $bloques[] = ['ruta' => $sub . '[' . $i . '].style', 'decls' => $decls];
                            }
                        } elseif (is_string($regla)) {
                            foreach (self::bloques_css($regla, $sub . '[' . $i . ']') as $b) {
                                $bloques[] = $b;
                            }
                        }
                    }
                }
                continue;
            }
            if ($clave === 'style') {
                if (is_array($valor)) {
                    $decls = [];
                    foreach ($valor as $p => $v) {
                        if (is_string($p) && (is_string($v) || is_int($v) || is_float($v))) {
                            $decls[] = [strpos($p, '--') === 0 ? $p : strtolower($p), (string) $v];
                        }
                    }
                    if ($decls !== []) {
                        $bloques[] = ['ruta' => $sub, 'decls' => $decls];
                    }
                } elseif (is_string($valor)) {
                    foreach (self::bloques_css('x{' . $valor . '}', $sub) as $b) {
                        $bloques[] = $b;
                    }
                }
                continue;
            }
            if ($clave === 'attributes' && is_array($valor)) {
                $decls = [];
                foreach ($valor as $nombre => $v) {
                    if (!is_string($nombre) || !is_string($v)) {
                        continue;
                    }
                    $n = strtolower($nombre);
                    if ($n === 'style') {
                        foreach (self::bloques_css('x{' . $v . '}', '') as $b) {
                            foreach ($b['decls'] as $d) {
                                $decls[] = $d;
                            }
                        }
                        continue;
                    }
                    $p = self::propiedad_de_atributo_svg($n, $etiqueta);
                    if ($p !== null && trim($v) !== '') {
                        $decls[] = [$p, trim($v)];
                    }
                }
                if ($decls !== []) {
                    $bloques[] = ['ruta' => $sub, 'decls' => $decls];
                }
                continue;
            }
            self::bloques_project($valor, $sub, $bloques);
        }
    }

    // =====================================================================
    // El criterio: una declaración, un bloque
    // =====================================================================

    /**
     * Revisa las declaraciones de UN bloque (una regla CSS, un style="", las
     * declaraciones de una regla `properties`). Las variables que el bloque declara
     * valen para los var() de ese mismo bloque.
     *
     * @param array<int, array{0: string, 1: string}> $decls
     * @return array<int, array<string, mixed>>
     */
    public static function revisar_bloque(array $decls, string $ruta): array
    {
        $locales = [];
        foreach ($decls as [$prop, $valor]) {
            if (strpos($prop, '--') === 0) {
                $locales[$prop] = $valor;
            }
        }
        $out = [];
        foreach ($decls as [$prop, $valor]) {
            $r = $ruta . ' { ' . $prop . ' }';
            foreach (self::revisar_declaracion($prop, $valor, $r, $locales) as $v) {
                $out[] = $v;
            }
        }
        return $out;
    }

    /**
     * @param array<string, string> $locales variables declaradas en el mismo bloque
     * @return array<int, array<string, mixed>>
     */
    public static function revisar_declaracion(string $prop, string $valor, string $ruta, array $locales): array
    {
        $out = [];
        $valor = trim((string) preg_replace('/\s*!important\s*$/i', '', $valor));
        if ($valor === '') {
            return $out;
        }
        ++self::$examinadas;

        if ($prop === '__hoja_externa__') {
            $out[] = self::violacion('ADN_EXTERNAL_STYLE', 'analisis', 'link', 'rel=stylesheet', $ruta, 'El HTML enlaza una hoja de estilos externa: su contenido no se puede revisar y trae diseño por fuera del registro.');
            return $out;
        }

        // 0) Lo que no se puede leer no se acepta: un nombre con escapes o un valor con
        // un escape fuera de comillas lo interpreta el navegador de otra forma.
        if (preg_match('/^-{0,2}[a-zA-Z0-9_][-a-zA-Z0-9_]*$/', $prop) !== 1
            || preg_match('/\\\\/', (string) preg_replace('/"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'/', '', $valor)) === 1) {
            $out[] = self::violacion(
                'ADN_SCAN_FAILED',
                'analisis',
                $prop,
                $valor,
                $ruta,
                'La declaración trae un escape CSS (barra invertida) en el nombre o el valor: el navegador la lee distinto de como se puede revisar. Escríbela sin escapes.'
            );
            return $out;
        }

        // 1) Declaración de una variable.
        if (strpos($prop, '--') === 0) {
            $nombre = strtolower($prop);
            if (COD_ADN_Registry::es_reservado($nombre)) {
                $out[] = self::violacion(
                    'ADN_VAR_RESERVED',
                    'declaracion-de-variable',
                    $prop,
                    $valor,
                    $ruta,
                    'La variable ' . $prop . ' es del registro de diseño (los nombres del registro y los prefijos --wp--preset--, --wp--custom--, --wp--style--, --cod-). Sólo la escribe la proyección del diseño del sitio; no se declara ni se redefine desde un documento.'
                );
                return $out;
            }
            [$sin_vars, $refs] = self::extraer_vars($valor);
            foreach (self::revisar_referencias($refs, $prop, null, $ruta, $locales, $valor) as $v) {
                $out[] = $v;
            }
            if (self::hay_literal($sin_vars, 'color', $prop)) {
                $out[] = self::violacion(
                    'ADN_LITERAL_COLOR',
                    'color',
                    $prop,
                    $valor,
                    $ruta,
                    'La variable local ' . $prop . ' lleva un color literal. Una variable local hereda la clase de su valor: usa var(--…) de un color del registro.'
                );
            }
            return $out;
        }

        // 1b) filter: sólo su drop-shadow() es una sombra.
        if ($prop === 'filter' && stripos($valor, 'drop-shadow(') !== false) {
            [$f_sin, $f_refs] = self::extraer_vars($valor);
            foreach (self::revisar_referencias($f_refs, $prop, 'sombra', $ruta, $locales, $valor) as $v) {
                $out[] = $v;
            }
            if (preg_match_all('/drop-shadow\(((?:[^()]|\([^()]*\))*)\)/i', $f_sin, $dm) > 0) {
                foreach ($dm[1] as $interior) {
                    if (self::hay_literal($interior, 'sombra', $prop)) {
                        $out[] = self::violacion('ADN_LITERAL_SHADOW', 'sombra', $prop, $valor, $ruta, self::mensaje_literal('sombra', $prop, $valor));
                        break;
                    }
                }
            }
            return $out;
        }

        // 2) Propiedad: qué clases revisa.
        $clases = self::clases_de_propiedad($prop);
        [$sin_vars, $refs] = self::extraer_vars($valor);
        $clase_principal = $clases[0] ?? null;
        foreach (self::revisar_referencias($refs, $prop, $clase_principal, $ruta, $locales, $valor) as $v) {
            $out[] = $v;
        }
        if ($clases === []) {
            return $out;
        }

        $sin_vars = self::permitir_formas($sin_vars);
        foreach ($clases as $clase) {
            if ($clase === '__font') {
                if (self::hay_resto($sin_vars)) {
                    $out[] = self::violacion('ADN_LITERAL_FONT', 'familia', $prop, $valor, $ruta, self::mensaje_literal('familia', $prop, $valor));
                }
                continue;
            }
            if (self::hay_literal($sin_vars, $clase, $prop)) {
                $out[] = self::violacion(self::CODIGOS[$clase], $clase, $prop, $valor, $ruta, self::mensaje_literal($clase, $prop, $valor));
            }
        }

        // 3) Una variable local con un literal, usada en una propiedad gobernada.
        foreach ($refs as $ref) {
            $n = $ref['nombre'];
            if (!isset($locales[$n]) || COD_ADN_Registry::tiene($n)) {
                continue;
            }
            [$local_sin, ] = self::extraer_vars((string) $locales[$n]);
            foreach ($clases as $clase) {
                if ($clase === '__font') {
                    continue;
                }
                if (self::hay_literal(self::permitir_formas($local_sin), $clase, $prop)) {
                    $out[] = self::violacion(
                        self::CODIGOS[$clase],
                        $clase,
                        $prop,
                        $valor,
                        $ruta,
                        $n . ' vale «' . $locales[$n] . '», un literal, y se usa en ' . $prop . '. Una variable local hereda la clase de su valor: usa var(--…) del registro.'
                    );
                    break;
                }
            }
        }
        return $out;
    }

    /**
     * Qué clases de diseño revisa una propiedad CSS. El primero es el principal (el
     * que usa un respaldo literal de var()).
     *
     * @return array<int, string>
     */
    private static function clases_de_propiedad(string $prop): array
    {
        if (in_array($prop, self::PROPS_COLOR, true)) {
            return ['color'];
        }
        switch ($prop) {
            case 'font-family':
                return ['familia'];
            case 'font-size':
                return ['tamano'];
            case 'font-weight':
            case 'line-height':
            case 'letter-spacing':
                return ['tipografia-fina'];
            case 'max-width':
                return ['ancho-de-caja'];
            case 'box-shadow':
            case '-webkit-box-shadow':
            case '-moz-box-shadow':
            case 'text-shadow':
                return ['sombra'];
            case 'transition':
            case 'transition-duration':
            case 'transition-delay':
            case 'transition-timing-function':
            case 'animation':
            case 'animation-duration':
            case 'animation-delay':
            case 'animation-timing-function':
            case '-webkit-transition':
            case '-webkit-animation':
                return ['movimiento'];
            case 'font':
                return ['__font'];
            case 'background':
            case 'background-image':
            case 'text-decoration':
            case 'text-emphasis':
            case 'column-rule':
                return ['color'];
            case '-webkit-text-stroke':
                return ['color', 'borde-grosor'];
            case 'border':
            case 'border-top':
            case 'border-right':
            case 'border-bottom':
            case 'border-left':
            case 'border-block':
            case 'border-inline':
            case 'outline':
                return ['color', 'borde-grosor'];
            case 'filter':
                return [];
        }
        if (preg_match('/^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/', $prop) === 1) {
            return ['radio'];
        }
        if (preg_match('/^(?:border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline|column-rule)-width$/', $prop) === 1) {
            return ['borde-grosor'];
        }
        if (preg_match('/^(?:padding|margin|scroll-margin|scroll-padding)(?:-(?:block|inline|top|right|bottom|left))?(?:-(?:start|end))?$/', $prop) === 1
            || in_array($prop, ['gap', 'row-gap', 'column-gap', 'grid-gap'], true)) {
            return ['espaciado'];
        }
        return [];
    }

    /**
     * @param array<int, array{nombre: string, respaldo: ?string}> $refs
     * @param array<string, string> $locales
     * @return array<int, array<string, mixed>>
     */
    private static function revisar_referencias(array $refs, string $prop, ?string $clase, string $ruta, array $locales, string $valor_completo): array
    {
        $out = [];
        foreach ($refs as $ref) {
            $nombre = $ref['nombre'];
            $conocido = preg_match('/^--[A-Za-z0-9_-]+$/', $nombre) === 1
                && (COD_ADN_Registry::tiene($nombre) || isset($locales[$nombre]) || COD_ADN_Registry::es_parametro_del_motor($nombre));
            if (!$conocido) {
                $out[] = self::violacion(
                    'ADN_VAR_UNKNOWN',
                    'variable',
                    $prop,
                    $valor_completo,
                    $ruta,
                    'var(' . $nombre . ') apunta a un nombre que no está en el registro de diseño ni se declara en la misma regla. Usa una variable del registro o declárala en esta misma regla.'
                );
            }
            $resp = $ref['respaldo'];
            if ($resp !== null && trim($resp) !== '') {
                [$resp_sin, $resp_refs] = self::extraer_vars($resp);
                foreach (self::revisar_referencias($resp_refs, $prop, $clase, $ruta, $locales, $valor_completo) as $v) {
                    $out[] = $v;
                }
                $resp_sin = self::permitir_formas($resp_sin);
                if (self::hay_literal($resp_sin, 'color', $prop)) {
                    $out[] = self::violacion('ADN_LITERAL_COLOR', 'color', $prop, $valor_completo, $ruta, 'var(' . $nombre . ', …) trae un respaldo con un color literal («' . trim($resp) . '»). Un respaldo literal es el valor de diseño que el registro debía evitar: quita el respaldo.');
                } elseif ($clase !== null && $clase !== '__font' && self::hay_literal($resp_sin, $clase, $prop)) {
                    $out[] = self::violacion(self::CODIGOS[$clase], $clase, $prop, $valor_completo, $ruta, 'var(' . $nombre . ', …) trae un respaldo literal («' . trim($resp) . '»). Quita el respaldo.');
                }
            }
        }
        return $out;
    }

    /**
     * Saca los var(…) de un valor y los deja como un marcador. Devuelve el valor
     * sin ellos y la lista [{nombre, respaldo}].
     *
     * @return array{0: string, 1: array<int, array{nombre: string, respaldo: ?string}>}
     */
    private static function extraer_vars(string $valor): array
    {
        $refs = [];
        $salida = '';
        $n = strlen($valor);
        $i = 0;
        while ($i < $n) {
            if (($valor[$i] === 'v' || $valor[$i] === 'V') && strncasecmp(substr($valor, $i, 4), 'var(', 4) === 0
                && ($i === 0 || preg_match('/[a-zA-Z0-9_-]/', $valor[$i - 1]) !== 1)) {
                $prof = 1;
                $j = $i + 4;
                $coma = -1;
                $comilla = '';
                while ($j < $n && $prof > 0) {
                    $c = $valor[$j];
                    if ($comilla !== '') {
                        if ($c === $comilla) {
                            $comilla = '';
                        }
                    } elseif ($c === '"' || $c === "'") {
                        $comilla = $c;
                    } elseif ($c === '(') {
                        ++$prof;
                    } elseif ($c === ')') {
                        --$prof;
                    } elseif ($c === ',' && $prof === 1 && $coma < 0) {
                        $coma = $j;
                    }
                    ++$j;
                }
                $cierre = $prof === 0 ? $j - 1 : $n;
                $interior_fin = $cierre;
                $nombre = trim(substr($valor, $i + 4, ($coma >= 0 ? $coma : $interior_fin) - ($i + 4)));
                $respaldo = $coma >= 0 ? trim(substr($valor, $coma + 1, $interior_fin - $coma - 1)) : null;
                $refs[] = ['nombre' => $nombre, 'respaldo' => $respaldo];
                $salida .= "\x01";
                $i = $prof === 0 ? $j : $n;
                continue;
            }
            $salida .= $valor[$i];
            ++$i;
        }
        return [$salida, $refs];
    }

    /**
     * Las dos formas compuestas que se aceptan sobre referencias: calc(-1 * var())
     * y color-mix(in srgb, var() N%, transparent). Se reemplazan por un marcador.
     */
    private static function permitir_formas(string $v): string
    {
        $v = (string) preg_replace('/calc\(\s*-1\s*\*\s*\x01\s*\)/i', "\x01", $v);
        $v = (string) preg_replace('/color-mix\(\s*in\s+srgb\s*,\s*(?:\x01|currentcolor|transparent)\s+\d{1,3}(?:\.\d+)?%\s*,\s*transparent\s*\)/i', "\x01", $v);
        return $v;
    }

    /** ¿Queda algo que no sea marcador, espacio, coma o palabra neutra? */
    private static function hay_resto(string $v): bool
    {
        $v = self::sin_neutros($v);
        $v = str_replace("\x01", '', $v);
        $v = (string) preg_replace('/(?<![a-z0-9_#.-])[+-]?0+(?:\.0+)?[a-z%]*/i', '', $v);
        return trim((string) preg_replace('/[\s,\/]+/', '', $v)) !== '';
    }

    private static function sin_neutros(string $v): string
    {
        return (string) preg_replace('/(?<![\w#.-])(?:inherit|initial|unset|revert-layer|revert|currentcolor|transparent|none|auto|normal|caption|icon|menu|message-box|small-caption|status-bar)(?![\w-])/i', ' ', $v);
    }

    /** ¿Hay un literal de esta clase en el valor (ya sin var())? */
    private static function hay_literal(string $v, string $clase, string $prop): bool
    {
        $v = self::permitir_formas($v);
        $v = (string) preg_replace('/url\((?:[^()"\']|"[^"]*"|\'[^\']*\')*\)/i', ' ', $v);
        $v = self::sin_neutros($v);
        $v = str_replace("\x01", ' ', $v);

        switch ($clase) {
            case 'color':
                return preg_match('/#[0-9a-f]{3,8}\b/i', $v) === 1
                    || preg_match('/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color|device-cmyk|light-dark)\s*\(/i', $v) === 1
                    || preg_match('/(?<![\w-])(?:' . self::NOMBRES_DE_COLOR . ')(?![\w-])/i', $v) === 1;
            case 'familia':
                foreach (explode(',', $v) as $item) {
                    $item = strtolower(trim($item, " \t\n\r\"'"));
                    if ($item === '' || in_array($item, self::FAMILIAS_GENERICAS, true)) {
                        continue;
                    }
                    return true;
                }
                return false;
            case 'tamano':
                return self::hay_numero_no_cero($v)
                    || preg_match('/(?<![\w-])(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|larger|smaller)(?![\w-])/i', $v) === 1;
            case 'tipografia-fina':
                return self::hay_numero_no_cero($v)
                    || preg_match('/(?<![\w-])(?:bold|bolder|lighter)(?![\w-])/i', $v) === 1;
            case 'espaciado':
            case 'radio':
                return self::hay_numero_no_cero($v);
            case 'borde-grosor':
                return self::hay_numero_no_cero($v)
                    || preg_match('/(?<![\w-])(?:thin|medium|thick)(?![\w-])/i', $v) === 1;
            case 'ancho-de-caja':
                return self::hay_medida_absoluta($v);
            case 'sombra':
                $v = (string) preg_replace('/(?<![a-z0-9_#.-])[+-]?0+(?:\.0+)?[a-z%]*/i', '', $v);
                return trim((string) preg_replace('/[\s,]+/', '', $v)) !== '';
            case 'movimiento':
                return preg_match('/(?<![\w.#-])(?:[1-9]\d*(?:\.\d+)?|0?\.\d*[1-9]\d*)m?s\b/i', $v) === 1
                    || preg_match('/\b(?:cubic-bezier|steps|linear)\s*\(/i', $v) === 1
                    || preg_match('/(?<![\w-])(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)(?![\w-])/i', $v) === 1;
        }
        return false;
    }

    private static function hay_numero_no_cero(string $v): bool
    {
        if (preg_match_all('/(?<![\w#.-])[+-]?(\d+(?:\.\d+)?|\.\d+)([a-z%]*)/i', $v, $m, PREG_SET_ORDER) === false) {
            return false;
        }
        foreach ($m as $par) {
            if ((float) $par[1] != 0.0) {
                return true;
            }
        }
        return false;
    }

    private static function hay_medida_absoluta(string $v): bool
    {
        if (preg_match_all('/(?<![\w#.-])[+-]?(\d+(?:\.\d+)?|\.\d+)([a-z%]*)/i', $v, $m, PREG_SET_ORDER) === false) {
            return false;
        }
        foreach ($m as $par) {
            if ((float) $par[1] == 0.0) {
                continue;
            }
            $u = strtolower($par[2]);
            if (in_array($u, ['%', 'vw', 'vh', 'vmin', 'vmax', 'svw', 'svh', 'lvw', 'lvh', 'dvw', 'dvh'], true)) {
                continue;
            }
            return true;
        }
        return false;
    }

    // =====================================================================
    // Violaciones, informes, errores
    // =====================================================================

    /** @return array<string, mixed> */
    private static function violacion(string $codigo, string $clase, string $prop, string $valor, string $ruta, string $mensaje): array
    {
        return [
            'codigo' => $codigo,
            'clase' => $clase,
            'propiedad' => $prop,
            'valor' => $valor,
            'ruta' => $ruta,
            'mensaje' => $codigo . ' — ' . $ruta . ': ' . $mensaje,
            'sugerencias' => [],
            'clave' => $codigo . '|' . $prop . '|' . self::normalizar_valor($valor),
        ];
    }

    private static function mensaje_literal(string $clase, string $prop, string $valor): string
    {
        $nombre = [
            'color' => 'un color literal', 'familia' => 'una familia tipográfica literal', 'tamano' => 'un tamaño de letra literal',
            'tipografia-fina' => 'un peso, interlineado o espaciado de letras literal', 'espaciado' => 'un espaciado literal',
            'radio' => 'un radio literal', 'borde-grosor' => 'un grosor de borde literal', 'sombra' => 'una sombra literal',
            'movimiento' => 'una duración o curva literal', 'ancho-de-caja' => 'un ancho de caja con unidad absoluta',
        ][$clase] ?? 'un valor literal';
        return $prop . ': «' . $valor . '» es ' . $nombre . '. Este sitio sólo admite valores del registro de diseño: usa var(--nombre) o una palabra neutra (inherit, currentColor, transparent, 0, none, auto). '
            . 'Si necesitas un valor que el registro no tiene, no se agrega desde aquí: pide una revisión del diseño del sitio.';
    }

    public static function normalizar_valor(string $valor): string
    {
        $v = strtolower(trim($valor));
        $v = (string) preg_replace('/\s+/', ' ', $v);
        $v = (string) preg_replace('/\s*,\s*/', ',', $v);
        $v = (string) preg_replace('/\s*!important$/', '', $v);
        return $v;
    }

    /**
     * @param array<int, array<string, mixed>> $violaciones
     * @return array<string, mixed>
     */
    private static function informe(string $modo, int $revisadas, array $violaciones, int $heredadas, string $herramienta): array
    {
        $registro = COD_ADN_Registry::get();
        foreach ($violaciones as $i => $v) {
            if (($v['sugerencias'] ?? []) === []) {
                $violaciones[$i]['sugerencias'] = self::sugerencias($v);
            }
        }
        return [
            'modo' => $modo,
            'herramienta' => $herramienta,
            'registro' => ['fuente' => $registro['fuente'], 'designId' => $registro['designId'], 'revision' => $registro['revision']],
            'revisadas' => $revisadas,
            'heredadas' => $heredadas,
            'nuevas' => count($violaciones),
            'violaciones' => array_map(static function (array $v): array {
                unset($v['clave']);
                return $v;
            }, $violaciones),
        ];
    }

    /**
     * Decide qué hace el modo con un informe: WP_Error si se rechaza, o el informe
     * que se adjunta a la respuesta. En `observe` registra y nunca rechaza.
     *
     * @param array<string, mixed> $informe
     * @return WP_Error|array<string, mixed>|null null cuando la compuerta está apagada
     */
    public static function resolver(array $informe)
    {
        $modo = (string) ($informe['modo'] ?? 'off');
        if ($modo === 'off') {
            return null;
        }
        $viol = $informe['violaciones'] ?? [];
        if ($modo === 'observe') {
            if ($viol !== []) {
                self::registrar($informe);
            }
            return $informe;
        }
        if ($viol === []) {
            return $informe;
        }
        $primera = $viol[0];
        $resumen = [];
        foreach (array_slice($viol, 0, 5) as $v) {
            $resumen[] = $v['mensaje'];
        }
        $mas = count($viol) > 5 ? ' (+' . (count($viol) - 5) . ' más en details.violaciones)' : '';
        $error = new WP_Error(
            (string) $primera['codigo'],
            'La compuerta del diseño (modo ' . $modo . ') rechazó la escritura: ' . count($viol) . ' valor(es) de diseño fuera del registro. ' . implode(' | ', $resumen) . $mas,
            [
                'modo' => $modo,
                'herramienta' => $informe['herramienta'] ?? '',
                'total' => count($viol),
                'registro' => $informe['registro'] ?? [],
                'violaciones' => array_slice($viol, 0, self::MAX_VIOLACIONES_EN_ERROR),
            ]
        );
        return $error;
    }

    /** @param array<string, mixed> $informe */
    private static function registrar(array $informe): void
    {
        $log = get_option(self::OPTION_LOG, []);
        if (!is_array($log)) {
            $log = [];
        }
        $viol = [];
        foreach (array_slice($informe['violaciones'], 0, 10) as $v) {
            $viol[] = ['codigo' => $v['codigo'], 'ruta' => $v['ruta'], 'valor' => $v['valor']];
        }
        $log[] = ['fecha' => gmdate('c'), 'herramienta' => $informe['herramienta'] ?? '', 'nuevas' => $informe['nuevas'] ?? 0, 'violaciones' => $viol];
        update_option(self::OPTION_LOG, array_slice($log, -50), false);
    }

    // =====================================================================
    // Sugerencias
    // =====================================================================

    /**
     * Con qué reemplazar un literal: color → el mismo valor exacto y los tres más
     * cercanos (en OKLab); medidas → los dos escalones vecinos; el resto, los
     * nombres de la clase.
     *
     * @param array<string, mixed> $v
     * @return array<int, array<string, mixed>>
     */
    private static function sugerencias(array $v): array
    {
        $codigo = (string) ($v['codigo'] ?? '');
        $clase = (string) ($v['clase'] ?? '');
        if (!in_array($clase, array_keys(self::CODIGOS), true) || strpos($codigo, 'ADN_LITERAL_') !== 0) {
            return [];
        }
        $candidatos = [];
        foreach (COD_ADN_Registry::get()['nombres'] as $nombre => $e) {
            $c = (string) ($e['clase'] ?? '');
            if ($c === $clase || ($c === 'libre')) {
                $candidatos[$nombre] = (string) ($e['valor'] ?? '');
            }
        }
        if ($candidatos === []) {
            return [];
        }
        $valor = (string) $v['valor'];
        $lista = [];
        if ($clase === 'color') {
            $objetivo = self::rgb_de($valor);
            foreach ($candidatos as $nombre => $val) {
                $rgb = self::rgb_de($val);
                if ($objetivo === null || $rgb === null) {
                    continue;
                }
                $lista[] = ['variable' => 'var(' . $nombre . ')', 'nombre' => $nombre, 'valorResuelto' => $val, 'distancia' => round(self::distancia_oklab($objetivo, $rgb) * 100, 1)];
            }
            usort($lista, static fn (array $a, array $b): int => $a['distancia'] <=> $b['distancia']);
            return array_slice($lista, 0, 3);
        }
        if (in_array($clase, ['espaciado', 'radio', 'tamano', 'borde-grosor', 'ancho-de-caja'], true)) {
            $objetivo = self::px_de($valor);
            foreach ($candidatos as $nombre => $val) {
                $px = self::px_de($val);
                if ($objetivo === null || $px === null) {
                    continue;
                }
                $lista[] = ['variable' => 'var(' . $nombre . ')', 'nombre' => $nombre, 'valorResuelto' => $val, 'distancia' => round(abs($px - $objetivo), 1)];
            }
            usort($lista, static fn (array $a, array $b): int => $a['distancia'] <=> $b['distancia']);
            return array_slice($lista, 0, 2);
        }
        foreach (array_slice($candidatos, 0, 3, true) as $nombre => $val) {
            $lista[] = ['variable' => 'var(' . $nombre . ')', 'nombre' => $nombre, 'valorResuelto' => $val];
        }
        return $lista;
    }

    /** @return array{0: float, 1: float, 2: float}|null */
    private static function rgb_de(string $c): ?array
    {
        $c = strtolower(trim($c));
        if (preg_match('/^#([0-9a-f]{3})$/', $c, $m) === 1) {
            return [hexdec($m[1][0] . $m[1][0]) / 255, hexdec($m[1][1] . $m[1][1]) / 255, hexdec($m[1][2] . $m[1][2]) / 255];
        }
        if (preg_match('/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/', $c, $m) === 1) {
            return [hexdec(substr($m[1], 0, 2)) / 255, hexdec(substr($m[1], 2, 2)) / 255, hexdec(substr($m[1], 4, 2)) / 255];
        }
        if (preg_match('/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/', $c, $m) === 1) {
            return [min(255, (int) $m[1]) / 255, min(255, (int) $m[2]) / 255, min(255, (int) $m[3]) / 255];
        }
        return null;
    }

    /**
     * @param array{0: float, 1: float, 2: float} $a
     * @param array{0: float, 1: float, 2: float} $b
     */
    private static function distancia_oklab(array $a, array $b): float
    {
        $ok = static function (array $rgb): array {
            $lin = static fn (float $x): float => $x <= 0.04045 ? $x / 12.92 : (($x + 0.055) / 1.055) ** 2.4;
            [$r, $g, $bl] = [$lin($rgb[0]), $lin($rgb[1]), $lin($rgb[2])];
            $l = 0.4122214708 * $r + 0.5363325363 * $g + 0.0514459929 * $bl;
            $m = 0.2119034982 * $r + 0.6806995451 * $g + 0.1073969566 * $bl;
            $s = 0.0883024619 * $r + 0.2817188376 * $g + 0.6299787005 * $bl;
            [$l, $m, $s] = [$l ** (1 / 3), $m ** (1 / 3), $s ** (1 / 3)];
            return [
                0.2104542553 * $l + 0.7936177850 * $m - 0.0040720468 * $s,
                1.9779984951 * $l - 2.4285922050 * $m + 0.4505937099 * $s,
                0.0259040371 * $l + 0.7827717662 * $m - 0.8086757660 * $s,
            ];
        };
        $x = $ok($a);
        $y = $ok($b);
        return sqrt(($x[0] - $y[0]) ** 2 + ($x[1] - $y[1]) ** 2 + ($x[2] - $y[2]) ** 2);
    }

    private static function px_de(string $v): ?float
    {
        if (preg_match('/^\s*(-?\d*\.?\d+)\s*(px|rem|em)?\s*$/i', $v, $m) !== 1) {
            return null;
        }
        $n = (float) $m[1];
        $u = strtolower($m[2] ?? 'px');
        return $u === 'px' ? $n : $n * 16;
    }
}
