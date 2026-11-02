<?php
/**
 * Registra el bloque contope/whatsapp.
 *
 * CORRESPONDENCIA CON GUTENBERG (regla 11 de CLAUDE.md). WordPress ya trae la
 * familia «botón» (core/buttons > core/button) y core/social-link con
 * `service: whatsapp`. Este bloque NO la duplica ni la reemplaza:
 *
 *   - Habla el mismo lenguaje que core/button: el enlace lleva
 *     `wp-block-button__link wp-element-button`, así que el estilo del botón
 *     que el sitio ya declara (theme.json: styles.elements.button y lo que el
 *     ADN proyecte) lo alcanza sin una sola regla nuestra. Declara los mismos
 *     `supports` (color con degradados, tipografía, relleno, borde, sombra) y
 *     cada uno viaja como un atributo de preset (`backgroundColor: "ink"`,
 *     `style.spacing.padding: "var:preset|spacing|30"`), nunca como un valor.
 *   - No puede ser una variación de core/button ni de core/social-link porque
 *     ambos guardan la URL en el CONTENIDO: el número de teléfono quedaría
 *     escrito en cada página. Aquí el número es una configuración del sitio
 *     (`cod_whatsapp_number`, el mismo ajuste que ya usa el nodo `whatsapp` del
 *     lienzo y la herramienta MCP cod_set_whatsapp_number); cambiarlo en
 *     Configuración llega a todas las páginas sin tocar ninguna. Por eso es un
 *     bloque DINÁMICO.
 *   - Lo único propio es lo que core/button no tiene: el enlace `wa.me` con el
 *     mensaje, el ícono, y poder quedar fijo en una esquina.
 *
 * Es un solo elemento (el propio enlace es la raíz del bloque), para que todo
 * soporte de bloque (color, borde, relleno) caiga en el mismo lugar que cae en
 * core/button y no en un contenedor de afuera.
 *
 * La marca de WhatsApp (iconStyle «logo») es el logotipo de un tercero, no un
 * valor de diseño del sitio: viaja como imagen vectorial con sus colores. Es lo
 * único con colores literales de todo el bloque. El modo «mono» pinta con
 * currentColor y toma el color del botón.
 *
 * Nota de duplicación: el dibujo del logotipo existe también en el compilador
 * del lienzo (COD_Canvas_MCP_Recipe_Compiler::whatsapp_logo_svg, privado). Se
 * dejó una copia aquí para no abrir ese archivo; unificarlas es un pendiente.
 */
final class COD_Block_Whatsapp
{
    public const BLOQUE = 'contope/whatsapp';
    public const OPCION_NUMERO = 'cod_whatsapp_number';

    public function register(): void
    {
        add_action('init', [$this, 'register_block']);
        add_action('enqueue_block_editor_assets', [$this, 'datos_para_el_editor']);
    }

    public function register_block(): void
    {
        register_block_type(COD_PUBLISHER_DIR . 'blocks/cod-whatsapp');
    }

    /** Lo único que el editor necesita saber del servidor: si hay número, y dónde se configura. */
    public function datos_para_el_editor(): void
    {
        $datos = [
            'whatsappNumero' => self::numero() !== '',
            'ajustesUrl' => admin_url('admin.php?page=' . COD_Settings_Admin::PAGE_SLUG),
        ];
        wp_add_inline_script(
            'contope-whatsapp-editor-script',
            'window.codBloques = Object.assign(window.codBloques || {}, ' . wp_json_encode($datos) . ');',
            'before'
        );
    }

    /** El número configurado, sólo dígitos ('' si no hay). */
    public static function numero(): string
    {
        return (string) preg_replace('/[^0-9]/', '', (string) get_option(self::OPCION_NUMERO, ''));
    }

    /**
     * El enlace a la conversación. El mensaje se codifica DESPUÉS de esc_url():
     * esc_url() borra %0A y %0D (defensa contra inyección de cabeceras) y con
     * ellos los saltos de línea del mensaje. rawurlencode() sólo deja letras,
     * números y %XX, así que lo que se agrega no puede romper el atributo.
     */
    public static function url(string $numero, string $mensaje): string
    {
        $url = esc_url('https://wa.me/' . $numero);
        $mensaje = trim(str_replace(["\r\n", "\r"], "\n", $mensaje));

        return $mensaje === '' ? $url : $url . '?text=' . rawurlencode($mensaje);
    }

    /**
     * El marcado del botón. Separado de render.php para poder probarlo.
     *
     * @param array<string, mixed> $attributes
     * @param string               $atributos_raiz Lo que get_block_wrapper_attributes() dejó (class, style…).
     * @param bool                 $en_editor      true cuando lo pide una vista previa del editor (REST).
     */
    public static function marcado(array $attributes, string $atributos_raiz, string $numero, bool $en_editor = false): string
    {
        if ($numero === '') {
            // Un botón de WhatsApp sin a quién escribirle es un botón que no hace
            // nada: en el sitio no se dibuja. A quien edita sí se le dice por qué.
            if (!$en_editor) {
                return '';
            }
            return '<p class="cod-whatsapp-aviso">Falta el número de WhatsApp: guárdalo en <a href="'
                . esc_url(admin_url('admin.php?page=' . COD_Settings_Admin::PAGE_SLUG)) . '">Configuración → WhatsApp</a>.</p>';
        }

        $texto = trim(wp_strip_all_tags((string) ($attributes['text'] ?? '')));
        $mensaje = (string) ($attributes['mensaje'] ?? '');
        $etiqueta = trim(wp_strip_all_tags((string) ($attributes['ariaLabel'] ?? '')));
        if ($etiqueta === '') {
            $etiqueta = $texto !== '' ? $texto : 'Contactar por WhatsApp';
        }
        $estilo = ($attributes['iconStyle'] ?? 'mono') === 'logo' ? 'logo' : 'mono';
        // En una vista previa del editor el botón no se fija: taparía el lienzo.
        $fijo = !$en_editor && !empty($attributes['fijo']);
        $posicion = ($attributes['posicion'] ?? 'derecha') === 'izquierda' ? 'izquierda' : 'derecha';

        $clases = ['wp-block-button__link', 'wp-element-button'];
        if ($texto === '') {
            $clases[] = 'is-solo-icono';
        }
        if ($fijo) {
            $clases[] = 'is-fijo';
            $clases[] = 'is-posicion-' . $posicion;
        }
        // Las clases del botón se unen a las que ya dejaron los soportes de bloque.
        $atributos_raiz = preg_replace('/\bclass="/', 'class="' . esc_attr(implode(' ', $clases)) . ' ', $atributos_raiz, 1) ?? $atributos_raiz;

        return '<a ' . $atributos_raiz . ' href="' . self::url($numero, $mensaje) . '"'
            . ' target="_blank" rel="noopener noreferrer"'
            . ' data-cod-whatsapp-message="' . esc_attr($mensaje) . '"'
            . ' aria-label="' . esc_attr($etiqueta) . '">'
            . self::icono($estilo)
            . ($texto !== '' ? '<span class="cod-whatsapp__texto">' . esc_html($texto) . '</span>' : '')
            . '</a>';
    }

    /** El glifo de WhatsApp en SVG, sin tamaño propio: lo da el CSS del bloque (1.75em por omisión). */
    public static function icono(string $estilo): string
    {
        if ($estilo === 'logo') {
            // La marca, con su degradado verde (colores del logotipo, no del sitio).
            // El contorno y el teléfono toman currentColor, como en el nodo del lienzo.
            return '<svg class="cod-whatsapp__icono" viewBox="0 0 175.216 175.552" aria-hidden="true" focusable="false">'
                . '<defs><linearGradient id="cod-wa-logo" x1="85.915" x2="86.535" y1="32.567" y2="137.092" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#57d163"/><stop offset="1" stop-color="#23b33a"/></linearGradient></defs>'
                . '<path fill="currentColor" d="m12.966 161.238 10.439-38.114a73.42 73.42 0 0 1-9.821-36.772c.017-40.556 33.021-73.55 73.578-73.55 19.681.01 38.154 7.669 52.047 21.572s21.537 32.383 21.53 52.037c-.018 40.553-33.027 73.553-73.578 73.553h-.032c-12.313-.005-24.412-3.094-35.159-8.954z"/>'
                . '<path fill="url(#cod-wa-logo)" d="M87.184 25.227c-33.733 0-61.166 27.423-61.178 61.13a60.98 60.98 0 0 0 9.349 32.535l1.455 2.313-6.179 22.558 23.146-6.069 2.235 1.324c9.387 5.571 20.15 8.517 31.126 8.523h.023c33.707 0 61.14-27.426 61.153-61.135a60.75 60.75 0 0 0-17.895-43.251 60.75 60.75 0 0 0-43.235-17.928z"/>'
                . '<path fill="currentColor" fill-rule="evenodd" d="M68.772 55.603c-1.378-3.061-2.828-3.123-4.137-3.176l-3.524-.043c-1.226 0-3.218.46-4.902 2.3s-6.435 6.287-6.435 15.332 6.588 17.785 7.506 19.013 12.718 20.381 31.405 27.75c15.529 6.124 18.689 4.906 22.061 4.6s10.877-4.447 12.408-8.74 1.532-7.971 1.073-8.74-1.685-1.226-3.525-2.146-10.877-5.367-12.562-5.981-2.91-.919-4.137.921-4.746 5.979-5.819 7.206-2.144 1.381-3.984.462-7.76-2.861-14.784-9.124c-5.465-4.873-9.154-10.891-10.228-12.73s-.114-2.835.808-3.751c.825-.824 1.838-2.147 2.759-3.22s1.224-1.84 1.836-3.065.307-2.301-.153-3.22-4.032-10.011-5.666-13.647"/>'
                . '</svg>';
        }

        return '<svg class="cod-whatsapp__icono" viewBox="0 0 32 32" aria-hidden="true" focusable="false">'
            . '<path fill="currentColor" d="M16 3C9 3 3.3 8.6 3.3 15.5c0 2.4.7 4.7 1.9 6.7L3 29l7-2.1c1.9 1 4 1.6 6 1.6 7 0 12.7-5.6 12.7-12.5S23 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.2 1.2 1.2-4-.3-.4a10.2 10.2 0 0 1-1.6-5.4C5.4 9.7 10.1 5 16 5s10.6 4.7 10.6 10.5S21.9 25.7 16 25.7zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-2.6-1.6 9.7 9.7 0 0 1-1.8-2.2c-.2-.3 0-.5.1-.7l.5-.6.3-.5a.6.6 0 0 0 0-.5c-.1-.2-.7-1.7-1-2.3s-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.6 3.6 0 0 0-1.1 2.7c0 1.6 1.2 3.1 1.3 3.3.2.2 2.3 3.6 5.7 5a19.6 19.6 0 0 0 1.9.7 4.6 4.6 0 0 0 2.1.1c.6-.1 1.9-.8 2.2-1.5s.3-1.4.2-1.5-.3-.2-.6-.4z"/>'
            . '</svg>';
    }
}
