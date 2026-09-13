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
                    ],
                ],
            ],
            [
                'title' => 'Paleta',
                'fields' => [
                    ['id' => 'color_bg', 'label' => 'Fondo', 'type' => 'color'],
                    ['id' => 'color_text', 'label' => 'Texto', 'type' => 'color'],
                    ['id' => 'color_primary', 'label' => 'Primario', 'type' => 'color'],
                    ['id' => 'color_accent', 'label' => 'Acento', 'type' => 'color'],
                ],
            ],
            [
                'title' => 'Tipografías',
                'fields' => [
                    ['id' => 'font_heading', 'label' => 'Títulos', 'type' => 'select', 'options' => self::font_options()],
                    ['id' => 'font_body', 'label' => 'Cuerpo', 'type' => 'select', 'options' => self::font_options()],
                    ['id' => 'font_accent', 'label' => 'Acento', 'type' => 'select', 'options' => self::font_options()],
                ],
            ],
            [
                'title' => 'Escala',
                'fields' => [
                    ['id' => 'size_base', 'label' => 'Tamaño base', 'type' => 'number', 'min' => 10, 'max' => 32, 'unit' => 'px'],
                    ['id' => 'h1_size', 'label' => 'H1', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px'],
                    ['id' => 'h2_size', 'label' => 'H2', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px'],
                    ['id' => 'h3_size', 'label' => 'H3', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px'],
                    ['id' => 'h4_size', 'label' => 'H4', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px'],
                    ['id' => 'h5_size', 'label' => 'H5', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px'],
                    ['id' => 'h6_size', 'label' => 'H6', 'type' => 'number', 'min' => 12, 'max' => 120, 'unit' => 'px'],
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
                    ['id' => 'radius', 'label' => 'Radio de bordes', 'type' => 'number', 'min' => 0, 'max' => 64, 'unit' => 'px'],
                    ['id' => 'spacing', 'label' => 'Espaciado base', 'type' => 'number', 'min' => 0, 'max' => 64, 'unit' => 'px'],
                    // Normalmente el alto del encabezado fijo: es el aire que queda
                    // arriba cuando un enlace o un QR hace saltar la página hasta un
                    // bloque con marcador. Admite negativo para caer más adentro.
                    ['id' => 'landing', 'label' => 'Aire al llegar por un enlace', 'type' => 'number', 'min' => -400, 'max' => 400, 'unit' => 'px'],
                ],
            ],
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
     * Si el tema no lo tiene definido, se usa el blanco cálido de partida.
     */
    public static function preload_background(): string
    {
        $valores = self::get();
        $fondo = isset($valores['color_bg']) ? trim((string) $valores['color_bg']) : '';
        if ($fondo !== '' && preg_match('/^#[0-9a-fA-F]{3,8}$/', $fondo) === 1) {
            return $fondo;
        }
        return '#f6f6f3';
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
     * @return array<string, string>
     */
    private static function font_options(): array
    {
        $options = ['' => 'Sin definir'];
        foreach (self::available_font_families() as $family) {
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
            return array_key_exists($value, $options) ? $value : '';
        }

        if ($type === 'color') {
            $hex = sanitize_hex_color($value);
            return is_string($hex) ? $hex : '';
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
}
