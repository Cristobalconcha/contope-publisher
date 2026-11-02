<?php
/**
 * Registra el bloque contope/formulario.
 *
 * CORRESPONDENCIA CON GUTENBERG (regla 11 de CLAUDE.md). Se miró
 * `wp-includes/blocks/` (7.1.4): WordPress no trae familia de formularios (lo
 * único parecido es `post-comments-form`, que es el formulario de comentarios
 * de una entrada, no un constructor). No hay nada que corresponder.
 *
 * El modelo que sí se sigue es el del propio plugin de formularios: Orugantt
 * Forms ya ofrece el shortcode `[orugantt_form slug="…"]`, que es su manera
 * oficial de incrustar un formulario en cualquier contenido (entrega el módulo
 * del formulario, encola el runtime, maneja el «no disponible» y los enlaces
 * privados). Este bloque es la envoltura de bloque de ESE shortcode: lo llama,
 * no reimplementa nada. Su único atributo es el identificador del formulario
 * (`formSlug`), igual que el nodo `form` del lienzo.
 *
 * DISEÑO. El bloque no lleva valores de diseño. El formulario se estila por las
 * variables de su contrato (`--ofr-*`, ver OFR_Design_Tokens), nunca por reglas
 * sobre sus campos, y esas variables apuntan a lo que el tema declara:
 *
 *   1. Si el tema define `settings.custom.form.<clave>` (lo que el ADN proyecta;
 *      la clave es la del contrato en camelCase o en kebab-case: «campoFondo» o
 *      «campo-fondo»), la variable toma `var(--wp--custom--form--<clave>)`.
 *   2. Si no, para unos pocos roles base (fondo, texto, color principal…) se
 *      usa el preset de color del tema por nombre de rol, con un color del
 *      SISTEMA como último recurso (Canvas, CanvasText, Highlight): nunca un
 *      hex ni un rgb.
 *   3. Lo demás NO se declara, y manda el valor por omisión del runtime del
 *      formulario. Declararlo sin tener de dónde sacarlo lo dejaría inválido.
 *
 * Los pendientes de color están anotados en el informe: el bloque necesita que
 * el ADN proyecte `settings.custom.form` para los colores de error y de nota,
 * que hoy toman el rojo/verde/ámbar del runtime.
 */
final class COD_Block_Formulario
{
    public const BLOQUE = 'contope/formulario';
    public const SHORTCODE = 'orugantt_form';
    public const HANDLE_ESTILO = 'contope-formulario-style';

    /**
     * Roles base: variable del contrato → valor. Sólo valores que salen de
     * presets del tema (por nombre de rol, con sinónimos habituales) o de otras
     * variables del propio formulario. Los últimos recursos son colores del
     * sistema, no literales.
     *
     * @var array<string, string>
     */
    private const ROLES = [
        'fondo' => 'var(--wp--preset--color--background, var(--wp--preset--color--base, Canvas))',
        'superficie' => 'var(--wp--preset--color--background, var(--wp--preset--color--base, Canvas))',
        'texto' => 'var(--wp--preset--color--text, var(--wp--preset--color--contrast, CanvasText))',
        'principal' => 'var(--wp--preset--color--accent, var(--wp--preset--color--primary, Highlight))',
        'principalContraste' => 'var(--wp--preset--color--background, var(--wp--preset--color--base, Canvas))',
        'superficieAlt' => 'color-mix(in srgb, var(--ofr-color-text) 6%, var(--ofr-color-bg))',
        'textoSuave' => 'color-mix(in srgb, var(--ofr-color-text) 65%, transparent)',
        'borde' => 'color-mix(in srgb, var(--ofr-color-text) 25%, transparent)',
        'bordeFuerte' => 'color-mix(in srgb, var(--ofr-color-text) 45%, transparent)',
        'principalHover' => 'color-mix(in srgb, var(--ofr-color-primary) 85%, var(--ofr-color-text))',
        'tipografia' => 'var(--wp--preset--font-family--body, inherit)',
    ];

    public function register(): void
    {
        add_action('init', [$this, 'register_block']);
        add_action('enqueue_block_editor_assets', [$this, 'datos_para_el_editor']);
    }

    public function register_block(): void
    {
        register_block_type(COD_PUBLISHER_DIR . 'blocks/cod-formulario');
    }

    /** Los formularios publicados, para elegir en el editor. Sólo se calcula al abrir el editor. */
    public function datos_para_el_editor(): void
    {
        $formularios = [];
        if (class_exists('OFR_Runtime')) {
            foreach (OFR_Runtime::published_forms() as $f) {
                $formularios[] = ['slug' => (string) $f['slug'], 'title' => (string) $f['title']];
            }
        }
        $datos = [
            'formulariosActivo' => shortcode_exists(self::SHORTCODE),
            'formularios' => $formularios,
        ];
        wp_add_inline_script(
            'contope-formulario-editor-script',
            'window.codBloques = Object.assign(window.codBloques || {}, ' . wp_json_encode($datos) . ');',
            'before'
        );
    }

    /** El identificador del formulario, saneado como lo sanea el plugin de formularios. */
    public static function slug(array $attributes): string
    {
        return sanitize_title((string) ($attributes['formSlug'] ?? ''));
    }

    /**
     * El marcado del bloque.
     *
     * @param array<string, mixed> $attributes
     * @param string               $atributos_raiz Lo que get_block_wrapper_attributes() dejó.
     */
    public static function marcado(array $attributes, string $atributos_raiz, bool $en_editor = false): string
    {
        $slug = self::slug($attributes);
        if ($slug === '' || !shortcode_exists(self::SHORTCODE)) {
            // En el sitio, un bloque a medias no deja nada. A quien edita se le dice por qué.
            if (!$en_editor) {
                return '';
            }
            return '<div ' . $atributos_raiz . '><p class="cod-formulario-aviso">'
                . ($slug === '' ? 'Elige un formulario en el panel de la derecha.' : 'Orugantt Forms no está activo: no se puede mostrar el formulario «' . esc_html($slug) . '».')
                . '</p></div>';
        }

        self::pedir_variables();

        // El plugin de formularios ya sabe qué hacer con un formulario que no está
        // publicado (su propio aviso «no disponible»): no se duplica esa lógica.
        $formulario = do_shortcode('[' . self::SHORTCODE . ' slug="' . esc_attr($slug) . '"]');

        return '<div ' . $atributos_raiz . '>' . $formulario . '</div>';
    }

    /**
     * El CSS que une las variables del contrato del formulario con el tema.
     * Función pura: recibe lo que el tema declara y el contrato, devuelve la regla.
     *
     * @param array<string, mixed>  $custom_form Lo que el tema declara en settings.custom.form.
     * @param array<string, string> $contrato    Clave del contrato → nombre de la variable (OFR_Design_Tokens::map()).
     */
    public static function css_de_variables(array $custom_form, array $contrato): string
    {
        // Las claves del tema, normalizadas a kebab-case: así «campoFondo» y «campo-fondo» son la misma.
        $declaradas = [];
        foreach (array_keys($custom_form) as $clave) {
            $declaradas[self::kebab((string) $clave)] = true;
        }

        $reglas = '';
        foreach ($contrato as $clave => $variable) {
            $kebab = self::kebab((string) $clave);
            if (isset($declaradas[$kebab])) {
                $reglas .= $variable . ':var(--wp--custom--form--' . $kebab . ');';
            } elseif (isset(self::ROLES[$clave])) {
                $reglas .= $variable . ':' . self::ROLES[$clave] . ';';
            }
        }

        // `.ofr-form` declara sus valores por omisión sobre sí mismo, DENTRO del bloque:
        // heredar no alcanza. Por eso la regla apunta al elemento interno, que pesa más.
        return $reglas === '' ? '' : '.wp-block-contope-formulario .ofr-form{' . $reglas . '}';
    }

    private static function kebab(string $clave): string
    {
        return strtolower((string) preg_replace('/([a-z0-9])([A-Z])/', '$1-$2', str_replace('_', '-', $clave)));
    }

    /** Agrega la regla de variables a la hoja del bloque, una sola vez por petición. */
    private static function pedir_variables(): void
    {
        static $hecho = false;
        if ($hecho || !class_exists('OFR_Design_Tokens')) {
            return;
        }
        $hecho = true;
        $custom = function_exists('wp_get_global_settings') ? wp_get_global_settings(['custom', 'form']) : [];
        $css = self::css_de_variables(is_array($custom) ? $custom : [], OFR_Design_Tokens::map());
        if ($css !== '') {
            wp_add_inline_style(self::HANDLE_ESTILO, $css);
        }
    }
}
