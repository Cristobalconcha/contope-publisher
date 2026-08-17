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
 * la pantalla de Configuración (OCD_Settings_Admin) renderiza el formulario a
 * partir de `schema()` + `get()`, y `css()` es lo que se inyecta antes del CSS
 * de cada página en los tres contextos (sitio publicado, editor Canvas admin y
 * editor en línea).
 */
final class OCD_Theme_Definitions
{
    public const OPTION_KEY = 'ocd_theme_definitions';
    public const AJAX_SAVE = 'ocd_theme_definitions_save';
    public const NONCE_ACTION = 'ocd_theme_definitions';
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
                ],
            ],
        ];
    }

    /**
     * Familias tipográficas disponibles, leídas de los @font-face autocontenidos
     * del sitio (`wp-content/uploads/open-codesign/fonts/fonts.css`). Devuelve
     * nombres únicos ordenados; si el CSS está vacío devuelve [].
     *
     * @return string[]
     */
    public static function available_font_families(): array
    {
        $css = OCD_Canvas_Page_Publisher::site_font_css();
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
            $root[] = '--ocd-mode:' . $v['mode'];
            $root[] = 'color-scheme:' . $v['mode'];
        }
        if ($v['color_bg'] !== '') {
            $root[] = '--ocd-color-bg:' . $v['color_bg'];
        }
        if ($v['color_text'] !== '') {
            $root[] = '--ocd-color-text:' . $v['color_text'];
        }
        if ($v['color_primary'] !== '') {
            $root[] = '--ocd-color-primary:' . $v['color_primary'];
        }
        if ($v['color_accent'] !== '') {
            $root[] = '--ocd-color-accent:' . $v['color_accent'];
        }
        if ($v['font_heading'] !== '') {
            $root[] = "--ocd-font-heading:'" . $v['font_heading'] . "'";
        }
        if ($v['font_body'] !== '') {
            $root[] = "--ocd-font-body:'" . $v['font_body'] . "'";
        }
        if ($v['font_accent'] !== '') {
            $root[] = "--ocd-font-accent:'" . $v['font_accent'] . "'";
        }
        if ($v['size_base'] !== '') {
            $root[] = '--ocd-size-base:' . $v['size_base'] . 'px';
        }
        for ($i = 1; $i <= 6; $i++) {
            if ($v['h' . $i . '_size'] !== '') {
                $root[] = '--ocd-h' . $i . '-size:' . $v['h' . $i . '_size'] . 'px';
            }
        }
        if ($v['layout_mode'] === 'liquid') {
            $root[] = '--ocd-layout-width:100%';
        } elseif ($v['layout_mode'] === 'boxed' && $v['layout_max_width'] !== '') {
            $root[] = '--ocd-layout-width:' . $v['layout_max_width'] . 'px';
        }
        if ($v['radius'] !== '') {
            $root[] = '--ocd-radius:' . $v['radius'] . 'px';
        }
        if ($v['spacing'] !== '') {
            $root[] = '--ocd-spacing:' . $v['spacing'] . 'px';
        }

        $css = "/* Definiciones del tema — generado desde Configuración */\n";
        $css .= ':root{' . implode(';', $root) . ';}';

        $rules = [];

        $body = [];
        if ($v['color_bg'] !== '') {
            $body[] = 'background-color:var(--ocd-color-bg)';
        }
        if ($v['color_text'] !== '') {
            $body[] = 'color:var(--ocd-color-text)';
        }
        if ($v['font_body'] !== '') {
            $body[] = 'font-family:var(--ocd-font-body)';
        }
        if ($v['size_base'] !== '') {
            $body[] = 'font-size:var(--ocd-size-base)';
        }
        if ($body !== []) {
            $rules[] = 'body{' . implode(';', $body) . ';}';
        }

        if ($v['font_heading'] !== '') {
            $rules[] = 'h1,h2,h3,h4,h5,h6{font-family:var(--ocd-font-heading);}';
        }
        for ($i = 1; $i <= 6; $i++) {
            if ($v['h' . $i . '_size'] !== '') {
                $rules[] = 'h' . $i . '{font-size:var(--ocd-h' . $i . '-size);}';
            }
        }
        if ($v['layout_mode'] === 'boxed' && $v['layout_max_width'] !== '') {
            $rules[] = '.ocd-canvas-published{max-width:var(--ocd-layout-width);margin-inline:auto;}';
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

        // number: absint + clamp min/max. El 0 es válido cuando min es 0
        // (radius/spacing); '' ya se devolvió antes como "sin definir".
        $num = absint($value);
        $min = isset($field['min']) ? (int) $field['min'] : null;
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
