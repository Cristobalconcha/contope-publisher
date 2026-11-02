<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Definiciones de estilo del tema (M4).
 *
 * Schema fijo de campos de estilo del tema, persistidos como opción JSON y
 * traducidos a CSS de baja especificidad (variables `:root` + reglas base).
 *
 * Los VALORES provienen del tema importado (hoy por seeding manual); los campos
 * sin definir quedan con valor vacío y NO emiten CSS. La clase no conoce la UI:
 * la pantalla de Configuración (COD_Settings_Admin) renderiza el formulario a
 * partir de `schema()` + `get()`, y `css()` es lo que se inyecta antes del CSS
 * de cada página en los tres contextos (sitio publicado, editor Canvas admin y
 * editor en línea).
 */
final class COD_Theme_Definitions
{
    public const OPTION_KEY = 'cod_theme_definitions';
    public const AJAX_SAVE = 'cod_theme_definitions_save';
    public const NONCE_ACTION = 'cod_theme_definitions';
    public const CAPABILITY = 'manage_options';

    /**
     * Schema ordenado de grupos y campos. Cada campo lleva: id, label, type y,
     * según corresponda, options (select), min/max (number) o unit (px).
     *
     * @return array<int, array{title: string, fields: array<int, array<string, mixed>>}>
     */
    public static function schema(): array
    {
        return [
            [
                'title' => 'Marca',
                'fields' => [
                    // El ícono del sitio es una definición de MARCA, no un ajuste
                    // de WordPress: pertenece al tema, igual que la paleta o la
                    // tipografía. Por eso vive acá y no en Ajustes → Generales.
                    //
                    // WordPress trae su propio "Icono del sitio" y eso deja dos
                    // lugares donde definirlo. La respuesta no es evitar el
                    // duplicado sino declarar cuál manda: si acá hay un ícono,
                    // se apaga el de WordPress (ver icono_en_cabecera).
                    ['id' => 'favicon', 'label' => 'Ícono del sitio', 'type' => 'image'],
                ],
            ],
            [
                'title' => 'Modo',
                'fields' => [
                    [
                        'id' => 'mode',
                        'label' => 'Modo',
                        'type' => 'select',
                        'options' => [
                            '' => 'Sin definir',
                            'light' => 'Claro',
                            'dark' => 'Oscuro',
                        ],
                        'emite' => ['token' => '--cod-mode', 'also' => 'color-scheme'],
                    ],
                ],
            ],
            [
                'title' => 'Paleta',
                'fields' => [
                    ['id' => 'color_bg', 'label' => 'Fondo', 'type' => 'color', 'emite' => ['token' => '--cod-color-bg']],
                    ['id' => 'color_text', 'label' => 'Texto', 'type' => 'color', 'emite' => ['token' => '--cod-color-text']],
                    ['id' => 'color_primary', 'label' => 'Primario', 'type' => 'color', 'emite' => ['token' => '--cod-color-primary']],
                    ['id' => 'color_accent', 'label' => 'Acento', 'type' => 'color', 'emite' => ['token' => '--cod-color-accent']],
                ],
            ],
            [
                'title' => 'Tipografías',
                'fields' => [
                    ['id' => 'font_heading', 'label' => 'Títulos', 'type' => 'select', 'google' => true, 'options' => self::font_options(), 'emite' => ['token' => '--cod-font-heading', 'quote' => true]],
                    ['id' => 'font_body', 'label' => 'Cuerpo', 'type' => 'select', 'google' => true, 'options' => self::font_options(), 'emite' => ['token' => '--cod-font-body', 'quote' => true]],
                    ['id' => 'font_accent', 'label' => 'Acento', 'type' => 'select', 'google' => true, 'options' => self::font_options(), 'emite' => ['token' => '--cod-font-accent', 'quote' => true]],
                ],
            ],
            [
                'title' => 'Escala',
                'fields' => [
                    ['id' => 'size_base', 'label' => 'Tamaño base', 'type' => 'number', 'min' => 10, 'max' => 32, 'unit' => 'px', 'emite' => ['token' => '--cod-size-base', 'unit' => 'px']],
                    ['id' => 'h1_size', 'label' => 'H1', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px', 'emite' => ['token' => '--cod-h1-size', 'unit' => 'px']],
                    ['id' => 'h2_size', 'label' => 'H2', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px', 'emite' => ['token' => '--cod-h2-size', 'unit' => 'px']],
                    ['id' => 'h3_size', 'label' => 'H3', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px', 'emite' => ['token' => '--cod-h3-size', 'unit' => 'px']],
                    ['id' => 'h4_size', 'label' => 'H4', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px', 'emite' => ['token' => '--cod-h4-size', 'unit' => 'px']],
                    ['id' => 'h5_size', 'label' => 'H5', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px', 'emite' => ['token' => '--cod-h5-size', 'unit' => 'px']],
                    ['id' => 'h6_size', 'label' => 'H6', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px', 'emite' => ['token' => '--cod-h6-size', 'unit' => 'px']],
                    ...self::campos_de_escala(),
                ],
            ],
            [
                'title' => 'Layout',
                'fields' => [
                    [
                        'id' => 'layout_mode',
                        'label' => 'Modo de layout',
                        'type' => 'select',
                        'options' => [
                            '' => 'Sin definir',
                            'liquid' => 'Líquido (100%)',
                            'boxed' => 'Enclaustrado (max-width)',
                        ],
                    ],
                    ['id' => 'layout_max_width', 'label' => 'Ancho máximo', 'type' => 'number', 'min' => 480, 'max' => 2560, 'unit' => 'px'],
                ],
            ],
            [
                'title' => 'Detalles',
                'fields' => [
                    ['id' => 'radius', 'label' => 'Radio de bordes', 'type' => 'number', 'min' => 0, 'max' => 64, 'unit' => 'px', 'emite' => ['token' => '--cod-radius', 'unit' => 'px']],
                    ['id' => 'spacing', 'label' => 'Espaciado base', 'type' => 'number', 'min' => 0, 'max' => 64, 'unit' => 'px', 'emite' => ['token' => '--cod-spacing', 'unit' => 'px']],
                    // Normalmente el alto del encabezado fijo: es el aire que queda
                    // arriba cuando un enlace o un QR hace saltar la página hasta un
                    // bloque con marcador. Admite negativo para caer más adentro.
                    ['id' => 'landing', 'label' => 'Aire al llegar por un enlace', 'type' => 'number', 'min' => -400, 'max' => 400, 'unit' => 'px', 'emite' => ['token' => '--cod-landing', 'unit' => 'px']],
                ],
            ],
            [
                // Dos definiciones y no una, decidido el 2026-09-17 sobre lo
                // medido en el sitio: los dos gestos que usa agrupan en 420-500
                // ms y en 160-200 ms, con un factor de 2,5 entre medias.
                //
                // No son variantes de lo mismo porque sus tiempos se calibran
                // contra cosas distintas. Aparecer se mide contra la vista: el
                // movimiento tiene que durar lo suficiente para que el ojo lo
                // siga. Responder se mide contra la mano: pasados unos 150 ms
                // deja de sentirse como respuesta y empieza a sentirse como
                // lentitud. Al ajustar una se rompería la otra.
                //
                // El valor es una duración y una curva juntas, para poder
                // escribirse tal cual dentro de un transition:
                //     transition: opacity var(--cod-motion-enter);
                'title' => 'Movimiento',
                'fields' => [
                    ['id' => 'motion_enter', 'label' => 'Aparecer', 'type' => 'motion', 'placeholder' => '420ms cubic-bezier(.34,1.56,.64,1)', 'emite' => ['token' => '--cod-motion-enter']],
                    ['id' => 'motion_response', 'label' => 'Responder', 'type' => 'motion', 'placeholder' => '160ms ease', 'emite' => ['token' => '--cod-motion-response']],
                ],
            ],
        ];
    }

    /**
     * Los campos de ESCALA: pasos con nombre (paso=valor, uno por línea o separados por «;»). Cada paso se vuelve un
     * nombre del registro de diseño que la compuerta admite y un preset del theme.json (--wp--preset--spacing--*,
     * --wp--preset--font-size--*, --wp--custom--*). Un valor que no es un paso de la escala no entra por el MCP.
     * Van aparte del schema() porque el filtro del theme.json las lee, y schema() consulta el theme.json (recursión).
     *
     * @return array<int, array<string, mixed>>
     */
    public static function campos_de_escala(): array
    {
        return [
            ['id' => 'scale_spacing', 'label' => 'Espaciado: pasos (paso=valor, o paso=escritorio/tablet/celular)', 'type' => 'scale', 'scale' => 'spacing', 'preset' => 'spacing'],
            ['id' => 'scale_font_size', 'label' => 'Tamaños de letra: pasos (paso=escritorio/tablet/celular, o paso=máximo~mínimo en móvil para un tamaño fluido)', 'type' => 'scale', 'scale' => 'font-size', 'preset' => 'font-size'],
            ['id' => 'scale_radius', 'label' => 'Radios: pasos', 'type' => 'scale', 'scale' => 'length', 'custom' => ['radius']],
            ['id' => 'scale_border', 'label' => 'Grosores de borde: pasos', 'type' => 'scale', 'scale' => 'length', 'custom' => ['border']],
            ['id' => 'scale_weight', 'label' => 'Pesos de letra: pasos', 'type' => 'scale', 'scale' => 'number', 'custom' => ['typography', 'fontWeight']],
            ['id' => 'scale_leading', 'label' => 'Interlineados: pasos', 'type' => 'scale', 'scale' => 'number', 'custom' => ['typography', 'lineHeight']],
            ['id' => 'scale_measure', 'label' => 'Anchos de texto (medidas): pasos', 'type' => 'scale', 'scale' => 'length', 'custom' => ['layout', 'measure']],
            // Transparencias: un paso es un color de la paleta con su opacidad («blanco-88=fondo-pagina 88%»). Entra a la paleta del
            // tema como `--wp--preset--color--<paso>`, así que el bloque lo usa por su slug (backgroundColor, textColor…).
            ['id' => 'scale_alpha', 'label' => 'Transparencias de la paleta: pasos (paso=color N%)', 'type' => 'scale', 'scale' => 'alpha', 'preset' => 'color'],
            // Sombras: pasos con nombre. Entran a `settings.shadow.presets` y el bloque las usa por `style.shadow` (var:preset|shadow|paso).
            ['id' => 'scale_shadow', 'label' => 'Sombras: pasos (paso=desplazamientos, desenfoque y color con opacidad)', 'type' => 'scale', 'scale' => 'shadow', 'preset' => 'shadow'],
            // Desenfoques del fondo (backdrop-filter): pasos. Los usa un estilo de bloque del tema, nunca el contenido.
            ['id' => 'scale_blur', 'label' => 'Desenfoques del fondo: pasos', 'type' => 'scale', 'scale' => 'length', 'custom' => ['blur']],
        ];
    }

    /**
     * Familias tipográficas disponibles, leídas de los @font-face autocontenidos
     * del sitio (`wp-content/uploads/contope/fonts/fonts.css`). Devuelve
     * nombres únicos ordenados; si el CSS está vacío devuelve [].
     *
     * @return string[]
     */
    public static function available_font_families(): array
    {
        $css = COD_Canvas_Page_Publisher::site_font_css();
        if ($css === '') {
            return [];
        }

        // Sin comentarios: una familia mencionada en /* ... */ no es real.
        $css = (string) preg_replace('#/\*.*?\*/#s', '', $css);

        preg_match_all('/font-family\s*:\s*([^;{}]+)/i', $css, $matches);
        $generic = [
            'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
            'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
        ];
        $seen = [];
        foreach ($matches[1] as $decl) {
            // Solo la primera familia de la lista: el resto son fallbacks.
            $name = trim(explode(',', $decl)[0]);
            $name = (string) preg_replace('/^["\']|["\']$/', '', $name);
            $name = trim($name);
            if ($name === '' || in_array(strtolower($name), $generic, true)) {
                continue;
            }
            // Dedupe case-insensitive conservando la primera grafía vista.
            $seen[strtolower($name)] = $name;
        }

        $families = array_values($seen);
        sort($families, SORT_STRING);

        return $families;
    }

    /**
     * Mapa id => valor validado contra el schema. Descarta ids desconocidos y
     * normaliza todo lo demás; el default es '' (sin definir) en todos.
     *
     * @return array<string, string>
     */
    public static function get(): array
    {
        $raw = get_option(self::OPTION_KEY, '');
        $decoded = [];
        if (is_string($raw) && $raw !== '') {
            $parsed = json_decode($raw, true);
            if (is_array($parsed)) {
                $decoded = $parsed;
            }
        }

        $values = [];
        foreach (self::schema() as $group) {
            foreach ($group['fields'] as $field) {
                $id = (string) $field['id'];
                $value = array_key_exists($id, $decoded) ? $decoded[$id] : '';
                $values[$id] = self::sanitize_value($field, $value);
            }
        }

        return $values;
    }

    /**
     * Sanitiza un mapa crudo contra el schema. Solo sobreviven los ids conocidos
     * y los valores válidos por tipo; '' (sin definir) se permite en todo.
     *
     * @param array<string, mixed> $raw
     * @return array<string, string>
     */
    public static function sanitize(array $raw): array
    {
        $values = [];
        foreach (self::schema() as $group) {
            foreach ($group['fields'] as $field) {
                $id = (string) $field['id'];
                $value = array_key_exists($id, $raw) ? $raw[$id] : '';
                $values[$id] = self::sanitize_value($field, $value);
            }
        }

        return $values;
    }

    /**
     * CSS de baja especificidad (variables `:root` + reglas base) solo con las
     * propiedades definidas. Si no hay NINGÚN valor no-vacío devuelve ''.
     */
    /**
     * Color de fondo para la cortina de precarga.
     *
     * Es el mismo fondo del sitio, así la cortina no se distingue de la
     * página: no se ve una pantalla de carga, se ve el sitio todavía vacío.
     *
     * Hasta el 2026-09-16 devolvía `#f6f6f3` cuando nadie lo definía. Daba la
     * casualidad de que en Santa Luisa ese era el fondo real, así que el
     * invento pasó desapercibido durante meses: el mejor ejemplo de por qué un
     * respaldo que acierta es más peligroso que uno que falla.
     *
     * Ahora, si las definiciones no lo traen, sale del rol «superficie» del
     * núcleo, que lee el theme.json del tema activo: el mismo color, pero
     * declarado por alguien. Si nadie lo declara devuelve '' y la cortina se
     * dibuja sin fondo, en vez de con un color que no eligió nadie.
     */
    public static function preload_background(): string
    {
        $valores = self::get();
        $fondo = isset($valores['color_bg']) ? trim((string) $valores['color_bg']) : '';
        if ($fondo !== '' && preg_match('/^#[0-9a-fA-F]{3,8}$/', $fondo) === 1) {
            return $fondo;
        }

        if (class_exists('COD_Design_Core')) {
            $estado = COD_Design_Core::estado();
            if (!empty($estado['surface']['declarado'])) {
                return (string) $estado['surface']['valor'];
            }
        }

        return '';
    }

    public static function css(): string
    {
        $v = self::get();

        $has = false;
        foreach ($v as $value) {
            if ($value !== '') {
                $has = true;
                break;
            }
        }
        if (!$has) {
            return '';
        }

        $root = [];

        if ($v['mode'] !== '') {
            $root[] = '--cod-mode:' . $v['mode'];
            $root[] = 'color-scheme:' . $v['mode'];
        }
        if ($v['color_bg'] !== '') {
            $root[] = '--cod-color-bg:' . $v['color_bg'];
        }
        if ($v['color_text'] !== '') {
            $root[] = '--cod-color-text:' . $v['color_text'];
        }
        if ($v['color_primary'] !== '') {
            $root[] = '--cod-color-primary:' . $v['color_primary'];
        }
        if ($v['color_accent'] !== '') {
            $root[] = '--cod-color-accent:' . $v['color_accent'];
        }
        if ($v['font_heading'] !== '') {
            $root[] = "--cod-font-heading:'" . $v['font_heading'] . "'";
        }
        if ($v['font_body'] !== '') {
            $root[] = "--cod-font-body:'" . $v['font_body'] . "'";
        }
        if ($v['font_accent'] !== '') {
            $root[] = "--cod-font-accent:'" . $v['font_accent'] . "'";
        }
        if ($v['size_base'] !== '') {
            $root[] = '--cod-size-base:' . $v['size_base'] . 'px';
        }
        for ($i = 1; $i <= 6; $i++) {
            if ($v['h' . $i . '_size'] !== '') {
                $root[] = '--cod-h' . $i . '-size:' . $v['h' . $i . '_size'] . 'px';
            }
        }
        if ($v['layout_mode'] === 'liquid') {
            $root[] = '--cod-layout-width:100%';
        } elseif ($v['layout_mode'] === 'boxed' && $v['layout_max_width'] !== '') {
            $root[] = '--cod-layout-width:' . $v['layout_max_width'] . 'px';
        }
        if ($v['radius'] !== '') {
            $root[] = '--cod-radius:' . $v['radius'] . 'px';
        }
        if ($v['spacing'] !== '') {
            $root[] = '--cod-spacing:' . $v['spacing'] . 'px';
        }
        if ($v['landing'] !== '') {
            $root[] = '--cod-landing:' . $v['landing'] . 'px';
        }
        // Duración y curva juntas, para escribirse tal cual dentro de un
        // transition: `transition: opacity var(--cod-motion-enter);`
        if (isset($v['motion_enter']) && $v['motion_enter'] !== '') {
            $root[] = '--cod-motion-enter:' . $v['motion_enter'];
        }
        if (isset($v['motion_response']) && $v['motion_response'] !== '') {
            $root[] = '--cod-motion-response:' . $v['motion_response'];
        }

        $css = "/* Definiciones del tema — generado desde Configuración */\n";
        $css .= ':root{' . implode(';', $root) . ';}';

        $rules = [];

        // Aire al llegar por un enlace. Todo bloque con marcador —o sea, con id—
        // recibe este valor sin que haya que escribirlo en cada uno: el alto del
        // encabezado fijo es un dato del sitio, no de cada sección, y si se
        // repitiera bloque por bloque el día que cambie el encabezado habría que
        // acordarse de corregir todos.
        //
        // Va en :where() a propósito: eso le da peso CERO, así que cualquier
        // valor puesto a mano en un bloque le gana sin pelear con especificidad.
        // Es lo que permite la excepción —caer más adentro, o más arriba— sin
        // tener que desactivar el valor general.
        if ($v['landing'] !== '') {
            $rules[] = ':where([id]){scroll-margin-block-start:var(--cod-landing);}';
        }

        $body = [];
        if ($v['color_bg'] !== '') {
            $body[] = 'background-color:var(--cod-color-bg)';
        }
        if ($v['color_text'] !== '') {
            $body[] = 'color:var(--cod-color-text)';
        }
        if ($v['font_body'] !== '') {
            $body[] = 'font-family:var(--cod-font-body)';
        }
        if ($v['size_base'] !== '') {
            $body[] = 'font-size:var(--cod-size-base)';
        }
        if ($body !== []) {
            $rules[] = 'body{' . implode(';', $body) . ';}';
        }

        if ($v['font_heading'] !== '') {
            $rules[] = 'h1,h2,h3,h4,h5,h6{font-family:var(--cod-font-heading);}';
        }
        for ($i = 1; $i <= 6; $i++) {
            if ($v['h' . $i . '_size'] !== '') {
                $rules[] = 'h' . $i . '{font-size:var(--cod-h' . $i . '-size);}';
            }
        }
        if ($v['layout_mode'] === 'boxed' && $v['layout_max_width'] !== '') {
            $rules[] = '.cod-canvas-published{max-width:var(--cod-layout-width);margin-inline:auto;}';
        }

        foreach ($rules as $rule) {
            $css .= "\n" . $rule;
        }

        return $css;
    }

    /**
     * Familias que el tema activo declara en su `theme.json`
     * (`settings.typography.fontFamilies`): el nombre de la PRIMERA familia de
     * cada pila, sin comillas.
     *
     * Existe porque un tema puede servir sus tipografías por su cuenta (con su
     * propia hoja de @font-face) sin que estén en `uploads/contope/fonts`, que es
     * lo único que `available_font_families()` mira. Sin esto, Basis —que declara
     * sus cuatro familias en el theme.json— no podía elegir NINGUNA en la
     * pantalla de Configuración: el menú sólo traía «Sin definir».
     *
     * @return string[]
     */
    public static function theme_font_families(): array
    {
        // Antes de que el tema esté cargado no hay theme.json que leer.
        if (!function_exists('wp_get_global_settings') || !did_action('after_setup_theme')) {
            return [];
        }
        $settings = wp_get_global_settings();
        $seen = [];
        foreach (['theme', 'custom'] as $origen) {
            $lista = $settings['typography']['fontFamilies'][$origen] ?? [];
            if (!is_array($lista)) {
                continue;
            }
            foreach ($lista as $familia) {
                if (!isset($familia['fontFamily']) || !is_string($familia['fontFamily'])) {
                    continue;
                }
                $name = trim(explode(',', $familia['fontFamily'])[0]);
                $name = trim((string) preg_replace('/^["\']|["\']$/', '', $name));
                // Una pila que empieza por var(...) no nombra una familia.
                if ($name === '' || strpos($name, '(') !== false || strpos($name, '--') === 0) {
                    continue;
                }
                $seen[strtolower($name)] = $name;
            }
        }
        $families = array_values($seen);
        sort($families, SORT_STRING);

        return $families;
    }

    /**
     * El catálogo de Google Fonts: nombre de familia => categoría.
     *
     * Viene de `catalogo/familias-google.json` (los metadatos públicos de
     * fonts.google.com, sin clave). Sirve para que Títulos / Cuerpo / Acento
     * acepten CUALQUIER familia de Google, no sólo las que el sitio ya trae
     * instaladas: el sistema de diseño trabaja con tipografías de Google.
     *
     * Elegir una familia no la carga: cargar el archivo es cosa del sitio (su
     * hoja de @font-face, o `uploads/contope/fonts`). Esto sólo la declara.
     *
     * @return array<string, string>
     */
    public static function google_font_families(): array
    {
        static $catalogo = null;
        if ($catalogo !== null) {
            return $catalogo;
        }
        $catalogo = [];
        $base = defined('COD_PUBLISHER_DIR') ? (string) COD_PUBLISHER_DIR : trailingslashit(dirname(__DIR__));
        $ruta = $base . 'catalogo/familias-google.json';
        if (is_readable($ruta)) {
            $json = json_decode((string) file_get_contents($ruta), true);
            if (is_array($json) && isset($json['familias']) && is_array($json['familias'])) {
                foreach ($json['familias'] as $nombre => $categoria) {
                    if (is_string($nombre) && $nombre !== '') {
                        $catalogo[$nombre] = is_string($categoria) ? $categoria : '';
                    }
                }
            }
        }

        return $catalogo;
    }

    /**
     * Las familias que el sitio ya tiene a mano: las instaladas en uploads y las
     * que declara el theme.json. (Las demás de Google se aceptan igual: ver
     * `google_font_families()`.)
     *
     * @return array<string, string>
     */
    private static function font_options(): array
    {
        $options = ['' => 'Sin definir'];
        $seen = [];
        foreach (array_merge(self::available_font_families(), self::theme_font_families()) as $family) {
            $seen[strtolower($family)] = $family;
        }
        $families = array_values($seen);
        sort($families, SORT_STRING);
        foreach ($families as $family) {
            $options[$family] = $family;
        }

        return $options;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed $value
     */
    private static function sanitize_value(array $field, $value): string
    {
        if ($value === null) {
            $value = '';
        }
        if (!is_scalar($value)) {
            return '';
        }
        $value = (string) $value;

        if ($value === '') {
            return '';
        }

        $type = (string) ($field['type'] ?? 'text');

        if ($type === 'select') {
            $options = isset($field['options']) && is_array($field['options']) ? $field['options'] : [];
            if (array_key_exists($value, $options)) {
                return $value;
            }
            // Una familia tipográfica puede ser cualquiera de Google Fonts.
            if (!empty($field['google']) && array_key_exists($value, self::google_font_families())) {
                return $value;
            }
            return '';
        }

        // image: una dirección de un archivo que YA está en la biblioteca de
        // medios de este sitio. No se acepta cualquier URL: el valor termina
        // dentro de un <link> en la cabecera de todas las páginas, así que una
        // dirección ajena sería un recurso de un tercero cargándose en cada
        // visita, y una dirección con esquema raro sería peor.
        if ($type === 'image') {
            $limpia = esc_url_raw($value);
            if ($limpia === '') {
                return '';
            }
            $subidas = wp_get_upload_dir();
            $base = isset($subidas['baseurl']) ? (string) $subidas['baseurl'] : '';
            // Se comparan sin esquema para que el valor sobreviva a un cambio de
            // http a https, o de dominio con y sin www.
            $sin_esquema = static function (string $u): string {
                return preg_replace('#^https?://#i', '', $u) ?? $u;
            };
            if ($base === '' || strpos($sin_esquema($limpia), $sin_esquema($base)) !== 0) {
                return '';
            }
            return $limpia;
        }

        if ($type === 'color') {
            $hex = sanitize_hex_color($value);
            return is_string($hex) ? $hex : '';
        }

        // motion: una duración y una curva, tal como se escriben dentro de un
        // transition. El valor termina dentro de un :root del sitio, así que se
        // admite sólo lo que puede componer ese par —números, ms/s, las curvas
        // por nombre, cubic-bezier() y steps()— y nada más. Un punto y coma o
        // una llave permitirían cerrar la declaración y escribir otra regla.
        if ($type === 'motion') {
            $limpio = trim(preg_replace('/\s+/', ' ', $value) ?? '');
            if ($limpio === '' || strlen($limpio) > 120) {
                return '';
            }
            if (preg_match('/^[0-9a-zA-Z .,()\-]+$/', $limpio) !== 1) {
                return '';
            }
            // Tiene que haber al menos una duración: sin ella no es un gesto.
            if (preg_match('/\d+(\.\d+)?m?s\b/', $limpio) !== 1) {
                return '';
            }
            $palabras = preg_split('/[^a-zA-Z-]+/', $limpio, -1, PREG_SPLIT_NO_EMPTY) ?: [];
            $permitidas = ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end', 'cubic-bezier', 'steps', 'ms', 's', 'jump-start', 'jump-end', 'jump-none', 'jump-both', 'start', 'end'];
            foreach ($palabras as $palabra) {
                if (!in_array(strtolower($palabra), $permitidas, true)) {
                    return '';
                }
            }
            return $limpio;
        }

        // scale: una lista de pasos «paso=valor» separados por «;» o por saltos de línea. El valor termina
        // dentro de un :root y de un theme.json, así que se admite sólo una medida simple, un número o
        // una expresión max()/min()/clamp()/calc() hecha de medidas y variables de ancho del tema.
        if ($type === 'scale') {
            return self::serializar_pasos(self::leer_pasos($value, (string) ($field['scale'] ?? 'length')));
        }

        // number: se acota entre min y max. El 0 es válido cuando min es 0
        // (radius/spacing); '' ya se devolvió antes como "sin definir".
        //
        // El signo sólo se descarta si el campo no admite negativos. Antes esto
        // era un absint() para todos, y un campo con mínimo negativo —como el
        // aire de aterrizaje, que puede ir hacia arriba— habría guardado el
        // valor con el signo cambiado, sin decir nada.
        $min = isset($field['min']) ? (int) $field['min'] : null;
        $num = ($min !== null && $min < 0) ? (int) $value : absint($value);
        $max = isset($field['max']) ? (int) $field['max'] : null;
        if ($min !== null && $num < $min) {
            $num = $min;
        }
        if ($max !== null && $num > $max) {
            $num = $max;
        }

        return (string) $num;
    }

    // =====================================================================
    // Escalas: pasos con nombre que el tema expone como presets
    // =====================================================================

    /**
     * Lee «paso=valor; paso=valor» y devuelve sólo los pasos válidos, en orden.
     * `scale`: length | spacing | font-size | number | alpha | shadow. Un tamaño de letra admite «máximo~mínimo» (fluido); un tamaño o un
     * espaciado admiten «escritorio/tablet/celular» (cada punto de quiebre con su valor: «50px/28px/20px»; un tramo vacío hereda el de escritorio:
     * «50px//20px»).
     *
     * @return array<int, array{slug: string, valor: string, min: string, tablet: string, movil: string}>
     */
    public static function leer_pasos(string $texto, string $tipo): array
    {
        $out = [];
        $vistos = [];
        foreach (preg_split('/[;\r\n]+/', $texto) ?: [] as $par) {
            $par = trim($par);
            if ($par === '' || strpos($par, '=') === false) {
                continue;
            }
            [$slug, $valor] = array_map('trim', explode('=', $par, 2));
            if (preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug) !== 1 || isset($vistos[$slug])) {
                continue;
            }
            $minimo = '';
            $tablet = '';
            $movil = '';
            // Un tamaño de letra o un espaciado puede traer un valor por punto de quiebre («50px/28px/20px»). Una fórmula con paréntesis (el
            // gutter, que divide) no.
            if (in_array($tipo, ['font-size', 'spacing'], true) && strpos($valor, '/') !== false && strpos($valor, '(') === false) {
                $partes = array_map('trim', explode('/', $valor));
                if (count($partes) !== 3 || !self::medida_valida($partes[0]) || ($partes[1] !== '' && !self::medida_valida($partes[1])) || ($partes[2] !== '' && !self::medida_valida($partes[2]))) {
                    continue;
                }
                [$valor, $tablet, $movil] = $partes;
            }
            if ($tipo === 'font-size' && strpos($valor, '~') !== false) {
                [$valor, $minimo] = array_map('trim', explode('~', $valor, 2));
                if (!self::medida_valida($minimo)) {
                    continue;
                }
            }
            if ($tipo === 'number') {
                $ok = preg_match('/^(?:\d+|\d*\.\d+)$/', $valor) === 1;
            } elseif ($tipo === 'alpha') {
                $ok = self::alfa_valida($valor);
            } elseif ($tipo === 'shadow') {
                $ok = self::sombra_valida($valor);
            } else {
                $ok = self::medida_valida($valor);
            }
            if (!$ok) {
                continue;
            }
            $vistos[$slug] = true;
            $out[] = ['slug' => $slug, 'valor' => $valor, 'min' => $minimo, 'tablet' => $tablet, 'movil' => $movil];
        }
        return $out;
    }

    /** @param array<int, array{slug: string, valor: string, min: string, tablet?: string, movil?: string}> $pasos */
    public static function serializar_pasos(array $pasos): string
    {
        $partes = [];
        foreach ($pasos as $p) {
            $quiebres = (($p['tablet'] ?? '') !== '' || ($p['movil'] ?? '') !== '') ? '/' . ($p['tablet'] ?? '') . '/' . ($p['movil'] ?? '') : '';
            $partes[] = $p['slug'] . '=' . $p['valor'] . $quiebres . ($p['min'] !== '' ? '~' . $p['min'] : '');
        }
        return implode('; ', $partes);
    }

    /** «color N%»: el slug de un color de la paleta y su opacidad (1 a 99). */
    private static function alfa_valida(string $v): bool
    {
        return preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)* (?:[1-9]\d?)(?:\.\d+)?%$/', $v) === 1;
    }

    /** El color de una paso de alfa o de una sombra: color-mix de un color de la paleta con transparente. */
    public static function color_con_alfa(string $slug, string $porcentaje): string
    {
        return 'color-mix(in srgb, var(--wp--preset--color--' . $slug . ') ' . $porcentaje . ', transparent)';
    }

    /**
     * Una sombra: una o más capas separadas por coma; cada capa son medidas (px o 0) y, a lo sumo, un color de la paleta con
     * opacidad. Ni un color literal ni una función cualquiera: el valor termina dentro de un theme.json y de un :root.
     */
    private static function sombra_valida(string $v): bool
    {
        if ($v === '' || strlen($v) > 400) {
            return false;
        }
        foreach (explode(',', (string) preg_replace('/color-mix\(in srgb, var\(--wp--preset--color--[a-z0-9-]+\) \d{1,2}%, transparent\)/', 'C', $v)) as $capa) {
            $fichas = preg_split('/\s+/', trim($capa)) ?: [];
            $medidas = 0;
            $colores = 0;
            foreach ($fichas as $f) {
                if ($f === 'C') {
                    ++$colores;
                } elseif ($f === 'inset') {
                    continue;
                } elseif (preg_match('/^-?(?:\d+|\d*\.\d+)(?:px)?$/', $f) === 1) {
                    ++$medidas;
                } else {
                    return false;
                }
            }
            if ($medidas < 2 || $medidas > 4 || $colores !== 1) {
                return false;
            }
        }
        return true;
    }

    /** Una medida simple (16px, 1.5rem, 50%) o una expresión max()/min()/clamp()/calc() de medidas y anchos del tema. */
    private static function medida_valida(string $v): bool
    {
        if ($v === '' || strlen($v) > 200) {
            return false;
        }
        if (preg_match('/^-?(?:\d+|\d*\.\d+)(?:px|rem|em|%|vw)$/', $v) === 1) {
            return true;
        }
        if (preg_match('/^(?:max|min|clamp|calc)\(/', $v) !== 1) {
            return false;
        }
        $sin_vars = preg_replace('/var\(--wp--style--global--[a-z-]+\)/', '1px', $v) ?? '';
        if (preg_match('/^[0-9a-z%.,()\s*+\/-]+$/', $sin_vars) !== 1) {
            return false;
        }
        if (preg_match_all('/[a-z]+(?=\()/', $sin_vars, $m) > 0) {
            foreach ($m[0] as $fn) {
                if (!in_array($fn, ['max', 'min', 'clamp', 'calc'], true)) {
                    return false;
                }
            }
        }
        return substr_count($v, '(') === substr_count($v, ')');
    }

    /**
     * Las escalas declaradas, por campo.
     *
     * @return array<string, array<int, array{slug: string, valor: string, min: string}>>
     */
    public static function escalas(): array
    {
        $raw = get_option(self::OPTION_KEY, '');
        $guardado = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
        $guardado = is_array($guardado) ? $guardado : [];
        $out = [];
        foreach (self::campos_de_escala() as $campo) {
            $pasos = self::leer_pasos((string) ($guardado[$campo['id']] ?? ''), (string) $campo['scale']);
            if ($pasos !== []) {
                $out[(string) $campo['id']] = $pasos;
            }
        }
        return $out;
    }

    /**
     * Lo que las escalas aportan al theme.json: presets de espaciado y de tamaño de letra, y
     * valores personalizados (radios, bordes, pesos, interlineados, medidas). Vacío si no hay escalas.
     *
     * @return array<string, mixed>
     */
    public static function theme_json_partial(): array
    {
        $escalas = self::escalas();
        if ($escalas === []) {
            return [];
        }
        $campos = [];
        foreach (self::campos_de_escala() as $campo) {
            $campos[(string) $campo['id']] = $campo;
        }
        $ajustes = [];
        foreach ($escalas as $id => $pasos) {
            $campo = $campos[$id];
            if (($campo['preset'] ?? '') === 'spacing') {
                $ajustes['spacing']['defaultSpacingSizes'] = false;
                foreach ($pasos as $p) {
                    $quiebres = (($p['tablet'] ?? '') !== '' || ($p['movil'] ?? '') !== '') ? ' / ' . (($p['tablet'] ?? '') ?: $p['valor']) . ' / ' . (($p['movil'] ?? '') ?: $p['valor']) : '';
                    $ajustes['spacing']['spacingSizes'][] = ['slug' => $p['slug'], 'name' => $p['slug'] . ' (' . $p['valor'] . $quiebres . ')', 'size' => $p['valor']];
                }
            } elseif (($campo['preset'] ?? '') === 'color') {
                foreach ($pasos as $p) {
                    [$base, $pct] = explode(' ', $p['valor'], 2);
                    $ajustes['color']['palette'][] = ['slug' => $p['slug'], 'name' => $base . ' al ' . $pct, 'color' => self::color_con_alfa($base, $pct)];
                }
            } elseif (($campo['preset'] ?? '') === 'shadow') {
                foreach ($pasos as $p) {
                    $ajustes['shadow']['presets'][] = ['slug' => $p['slug'], 'name' => $p['slug'], 'shadow' => $p['valor']];
                }
            } elseif (($campo['preset'] ?? '') === 'font-size') {
                foreach ($pasos as $p) {
                    $tam = ['slug' => $p['slug'], 'name' => $p['slug'] . ' (' . $p['valor'] . ')', 'size' => $p['valor']];
                    $tam['fluid'] = $p['min'] !== '' ? ['min' => $p['min'], 'max' => $p['valor']] : false;
                    $tam['name'] = $p['slug'] . ' (' . $p['valor'] . (($p['tablet'] ?? '') !== '' || ($p['movil'] ?? '') !== '' ? ' / ' . (($p['tablet'] ?? '') ?: $p['valor']) . ' / ' . (($p['movil'] ?? '') ?: $p['valor']) : '') . ')';
                    $ajustes['typography']['fontSizes'][] = $tam;
                }
                $ajustes['typography']['defaultFontSizes'] = false;
            } elseif (isset($campo['custom']) && is_array($campo['custom'])) {
                $nodo = &$ajustes['custom'];
                foreach ($campo['custom'] as $clave) {
                    $nodo[$clave] = $nodo[$clave] ?? [];
                    $nodo = &$nodo[$clave];
                }
                foreach ($pasos as $p) {
                    $nodo[$p['slug']] = $p['valor'];
                }
                unset($nodo);
            }
        }
        return ['version' => 3, 'settings' => $ajustes];
    }

    /**
     * Los nombres del registro de diseño que las escalas generan (nombre → valor), tal como los
     * imprime WordPress: --wp--preset--spacing--<paso>, --wp--preset--font-size--<paso>,
     * --wp--custom--radius--<paso>, --wp--custom--border--<paso>,
     * --wp--custom--typography--font-weight--<paso>, --wp--custom--typography--line-height--<paso>,
     * --wp--custom--layout--measure--<paso>.
     *
     * @return array<string, string>
     */
    public static function nombres_de_escalas(): array
    {
        $campos = [];
        foreach (self::campos_de_escala() as $campo) {
            $campos[(string) $campo['id']] = $campo;
        }
        $kebab = static fn (string $c): string => strtolower((string) preg_replace('/(?<!^)[A-Z]/', '-$0', $c));
        $out = [];
        foreach (self::escalas() as $id => $pasos) {
            $campo = $campos[$id];
            foreach ($pasos as $p) {
                if (($campo['preset'] ?? '') !== '') {
                    $out['--wp--preset--' . $campo['preset'] . '--' . $p['slug']] = $p['valor'];
                } elseif (isset($campo['custom']) && is_array($campo['custom'])) {
                    $out['--wp--custom--' . implode('--', array_map($kebab, $campo['custom'])) . '--' . $p['slug']] = $p['valor'];
                }
            }
        }
        return $out;
    }

    public const MARCA_CSS_ESCALA = 'cod-escalas-con-quiebres';
    /** Los puntos de quiebre del plugin (los mismos del lienzo): tablet 768 a 1023 y celular hasta 767. */
    public const QUIEBRE_TABLET = '(min-width: 768px) and (max-width: 1023px)';
    public const QUIEBRE_MOVIL = '(max-width: 767px)';

    /**
     * El CSS de las escalas con punto de quiebre (tamaños de letra y espaciado): cada paso «escritorio/tablet/celular» redefine su propia
     * variable (--wp--preset--font-size--<paso>, --wp--preset--spacing--<paso>) dentro del punto de quiebre. Sólo declara variables de la
     * escala, con los valores de la escala: el bloque sigue pidiendo `fontSize: "<paso>"` o `var:preset|spacing|<paso>` y WordPress imprime
     * la referencia a la variable. Va entre marcas para poder rehacerse sin duplicarse. '' si ningún paso tiene quiebres.
     */
    public static function css_de_escalas_con_quiebres(): string
    {
        $tablet = '';
        $movil = '';
        foreach (['scale_font_size' => 'font-size', 'scale_spacing' => 'spacing'] as $campo => $preset) {
            foreach (self::escalas()[$campo] ?? [] as $p) {
                if (($p['tablet'] ?? '') !== '') {
                    $tablet .= '--wp--preset--' . $preset . '--' . $p['slug'] . ':' . $p['tablet'] . ';';
                }
                if (($p['movil'] ?? '') !== '') {
                    $movil .= '--wp--preset--' . $preset . '--' . $p['slug'] . ':' . $p['movil'] . ';';
                }
            }
        }
        if ($tablet === '' && $movil === '') {
            return '';
        }
        $css = '';
        if ($tablet !== '') {
            $css .= '@media ' . self::QUIEBRE_TABLET . '{:root{' . $tablet . '}}';
        }
        if ($movil !== '') {
            $css .= '@media ' . self::QUIEBRE_MOVIL . '{:root{' . $movil . '}}';
        }
        return '/*' . self::MARCA_CSS_ESCALA . '*/' . $css . '/*/' . self::MARCA_CSS_ESCALA . '*/';
    }

    /** Pone (o rehace) el bloque de las escalas con quiebres dentro del CSS que el tema ya trae. */
    public static function css_con_escalas_con_quiebres(string $existente): string
    {
        $m = preg_quote(self::MARCA_CSS_ESCALA, '#');
        $sin = trim((string) preg_replace('#/\*' . $m . '\*/.*?/\*/' . $m . '\*/#s', '', $existente));
        $nuevo = self::css_de_escalas_con_quiebres();
        return trim($sin . ($sin !== '' && $nuevo !== '' ? "\n" : '') . $nuevo);
    }

    /** Engancha las escalas al theme.json del tema activo (los presets salen de las definiciones). */
    public static function registrar_escalas(): void
    {
        add_filter('wp_theme_json_data_theme', static function ($datos) {
            $parcial = self::theme_json_partial();
            if ($parcial === [] || !is_object($datos) || !method_exists($datos, 'update_with')) {
                return $datos;
            }
            // La paleta es del tema: las transparencias se SUMAN a sus colores, no la reemplazan.
            if (!empty($parcial['settings']['color']['palette']) && method_exists($datos, 'get_data')) {
                $actual = $datos->get_data()['settings']['color']['palette'] ?? [];
                // En este punto la paleta puede venir por origen (['theme' => [...]]) o como lista.
                if (is_array($actual) && isset($actual['theme']) && is_array($actual['theme'])) {
                    $actual = $actual['theme'];
                }
                $nuevos = array_column($parcial['settings']['color']['palette'], 'slug');
                $propios = array_values(array_filter(is_array($actual) ? $actual : [], static fn ($c): bool => is_array($c) && !in_array($c['slug'] ?? '', $nuevos, true)));
                $parcial['settings']['color']['palette'] = array_merge($propios, $parcial['settings']['color']['palette']);
            }
            // Los pasos con punto de quiebre llevan su CSS (variables de la escala) en el CSS del tema.
            if (self::css_de_escalas_con_quiebres() !== '' && method_exists($datos, 'get_data')) {
                $parcial['styles']['css'] = self::css_con_escalas_con_quiebres((string) ($datos->get_data()['styles']['css'] ?? ''));
            }
            return $datos->update_with($parcial);
        });
    }

    /**
     * Emite el ícono del sitio declarado por el tema, y apaga el de WordPress.
     *
     * Que existan dos lugares donde definir el ícono no es el problema; el
     * problema sería que ninguno mande. Acá se declara: si el tema tiene uno,
     * el tema gana y el de WordPress se calla. Si el tema no tiene, WordPress
     * sigue haciendo lo suyo y nadie se entera de que esto existe.
     *
     * Se emiten tres medidas porque cada una la pide alguien distinto: 32 para
     * la pestaña del navegador, 180 para la pantalla de inicio de iOS y 192
     * para Android. Es el mismo archivo redimensionado por el navegador; no se
     * generan copias, que es lo que WordPress sí hace y acá no hace falta.
     */
    public static function icono_en_cabecera(): void
    {
        $valores = self::get();
        $icono = isset($valores['favicon']) ? (string) $valores['favicon'] : '';
        if ($icono === '') {
            return;
        }
        $tipo = wp_check_filetype(basename(wp_parse_url($icono, PHP_URL_PATH) ?? ''));
        $mime = isset($tipo['type']) && is_string($tipo['type']) && $tipo['type'] !== '' ? $tipo['type'] : 'image/png';

        echo "\n<!-- Ícono del sitio — definido en ContOpe, Configuración → Marca -->\n";
        printf(
            '<link rel="icon" href="%1$s" sizes="32x32" type="%2$s">' . "\n"
            . '<link rel="apple-touch-icon" href="%1$s" sizes="180x180">' . "\n"
            . '<link rel="icon" href="%1$s" sizes="192x192" type="%2$s">' . "\n",
            esc_url($icono),
            esc_attr($mime)
        );
    }

    /**
     * WordPress imprime su propio ícono con wp_site_icon en wp_head. Si el tema
     * declara uno, ese sobra: se retira el suyo antes de que llegue a imprimir.
     * Se hace en 'wp_head' con prioridad muy temprana y no al registrar, porque
     * el valor puede cambiar mientras el sitio corre.
     */
    public static function registrar_icono(): void
    {
        add_action('wp_head', static function (): void {
            $valores = self::get();
            if (!empty($valores['favicon'])) {
                remove_action('wp_head', 'wp_site_icon', 99);
            }
        }, 1);
        add_action('wp_head', [self::class, 'icono_en_cabecera'], 2);
    }
}
