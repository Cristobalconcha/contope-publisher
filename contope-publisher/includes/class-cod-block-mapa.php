<?php
/**
 * Registra el bloque contope/mapa.
 *
 * CORRESPONDENCIA CON GUTENBERG (regla 11 de CLAUDE.md). Se miró
 * `wp-includes/blocks/` (7.1.4): WordPress no tiene familia de mapa. Lo más
 * cercano es core/embed, que sólo incrusta proveedores oEmbed y no incluye
 * ninguno de mapas; y core/html, que es una puerta abierta a pegar código. No
 * hay nada que corresponder, así que el bloque es propio.
 *
 * Lo que SÍ se respeta de Gutenberg es el modelo de bloque: dinámico (render
 * en el servidor), `supports` estándar (alineación ancha/completa, color, borde,
 * margen) y el contenido como atributos tipados.
 *
 * Y NO se escribe un motor nuevo. El mapa de ubicación ya existe como conducta
 * del lienzo (`data-cod-behavior="mapa"`): lo monta el runtime que está en
 * assets/js/cod-canvas-public.js (la copia del editor, en cod-behaviors.js, no
 * monta nada dentro del editor y no interviene aquí). El bloque emite EXACTAMENTE
 * el marcado que esa conducta espera y deja que la misma pieza haga el trabajo:
 *
 *   - la clave pública de Mapbox NO viaja en el contenido: la pone
 *     COD_Mapa::resolver_en_html() al mostrar, desde Configuración → «Mapa
 *     (Mapbox)». Sin clave, el runtime no monta nada y queda el enlace a
 *     «cómo llegar» (OpenStreetMap), que no pide clave;
 *   - Mapbox GL se descarga SÓLO cuando el mapa grande se abre (con `fijo`, al
 *     montarse); nunca como parte del peso de la página;
 *   - la hoja de la conducta es la misma (COD_Canvas_Page_Publisher::mapa_css()).
 *
 * Fuera del lienzo (una página que no es del lienzo) nadie más encola el runtime
 * ni la hoja, así que el bloque los pide él mismo. Dentro del lienzo el
 * publicador ya los encola con los mismos nombres y WordPress no los repite; la
 * hoja de la conducta sí sale dos veces (es idéntica y pesa unos 3 KB).
 */
final class COD_Block_Mapa
{
    public const BLOQUE = 'contope/mapa';

    public function register(): void
    {
        add_action('init', [$this, 'register_block']);
        add_action('enqueue_block_editor_assets', [$this, 'datos_para_el_editor']);
    }

    public function register_block(): void
    {
        register_block_type(COD_PUBLISHER_DIR . 'blocks/cod-mapa');
    }

    /** Si hay clave de Mapbox y dónde se configura: lo único que el editor necesita del servidor. */
    public function datos_para_el_editor(): void
    {
        $datos = [
            'mapaClave' => COD_Mapa::clave() !== null,
            'ajustesUrl' => admin_url('admin.php?page=' . COD_Settings_Admin::PAGE_SLUG),
        ];
        wp_add_inline_script(
            'contope-mapa-editor-script',
            'window.codBloques = Object.assign(window.codBloques || {}, ' . wp_json_encode($datos) . ');',
            'before'
        );
    }

    /**
     * Los atributos ya comprobados, o null si no alcanzan para dibujar un mapa.
     * Mismos límites que el compilador del lienzo (normalize_mapa_content).
     *
     * @param array<string, mixed> $a
     * @return array{lat: float, lng: float, zoom: float, alto: int, fijo: bool, mini: string, marcador: string, globo: string, etiqueta: string}|null
     */
    public static function normalizar(array $a): ?array
    {
        $lat = $a['lat'] ?? null;
        $lng = $a['lng'] ?? null;
        if (!is_numeric($lat) || !is_numeric($lng)) {
            return null;
        }
        $lat = (float) $lat;
        $lng = (float) $lng;
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            return null;
        }
        $zoom = isset($a['zoom']) && is_numeric($a['zoom']) ? (float) $a['zoom'] : 17.0;
        $zoom = min(22.0, max(0.0, $zoom));
        $alto = isset($a['alto']) && is_numeric($a['alto']) ? (int) $a['alto'] : 400;
        $alto = min(1600, max(120, $alto));

        $mini = esc_url_raw((string) ($a['mini'] ?? ''), ['http', 'https']);
        $marcador = esc_url_raw((string) ($a['marcador'] ?? ''), ['http', 'https']);
        // Sin imagen para el mini no hay nada que pinchar: el mapa queda abierto.
        $fijo = !isset($a['fijo']) || !empty($a['fijo']) || $mini === '';

        return [
            'lat' => $lat,
            'lng' => $lng,
            'zoom' => $zoom,
            'alto' => $alto,
            'fijo' => $fijo,
            'mini' => $mini,
            'marcador' => $marcador,
            'globo' => trim(wp_strip_all_tags((string) ($a['globo'] ?? ''))),
            'etiqueta' => trim(wp_strip_all_tags((string) ($a['etiqueta'] ?? ''))) ?: 'Abrir el mapa de ubicación',
        ];
    }

    /**
     * El marcado del mapa. La clave se pone al final con COD_Mapa::resolver_en_html().
     *
     * @param array<string, mixed> $attributes
     * @param string               $atributos_raiz Lo que get_block_wrapper_attributes() dejó (class, style…).
     */
    public static function marcado(array $attributes, string $atributos_raiz, bool $en_editor = false): string
    {
        $m = self::normalizar($attributes);
        if ($m === null) {
            return $en_editor
                ? '<p class="cod-mapa-aviso">Falta la ubicación del mapa: pon una latitud (-90 a 90) y una longitud (-180 a 180).</p>'
                : '';
        }

        $como_llegar = COD_Mapa::url_como_llegar($m['lat'], $m['lng'], $m['zoom']);
        $datos = ' data-cod-behavior="mapa"'
            . ' data-cod-mapa-lat="' . esc_attr(COD_Mapa::numero($m['lat'])) . '"'
            . ' data-cod-mapa-lng="' . esc_attr(COD_Mapa::numero($m['lng'])) . '"'
            . ' data-cod-mapa-zoom="' . esc_attr(COD_Mapa::numero($m['zoom'])) . '"'
            . ($m['globo'] !== '' ? ' data-cod-mapa-globo="' . esc_attr($m['globo']) . '"' : ' data-cod-mapa-globo=""')
            . ($m['marcador'] !== '' ? ' data-cod-mapa-marcador="' . esc_attr($m['marcador']) . '"' : '')
            . ($m['fijo'] ? ' data-cod-mapa-fijo="1"' : '');

        // El alto del recuadro grande es una variable de la conducta, no un estilo suelto.
        $atributos_raiz = self::con_alto($atributos_raiz, $m['alto']);

        $mini = '<a class="cod-mapa__mini" data-cod-mapa-rol="mini" href="' . esc_url($como_llegar) . '" target="_blank" rel="noopener noreferrer">'
            . ($m['mini'] !== ''
                ? '<img src="' . esc_url($m['mini']) . '" alt="' . esc_attr($m['etiqueta']) . '" decoding="async" loading="lazy">'
                : '<span class="cod-mapa__enlace-texto">Ver la ubicación en el mapa</span>')
            . '</a>';

        $html = '<div ' . $atributos_raiz . $datos . '>' . $mini . '</div>';

        // En la vista previa del editor no hay runtime; todo lo demás lo hace el servidor
        // igual que en la página: clave pública si hay, y si no, el enlace.
        return $en_editor ? $html : COD_Mapa::resolver_en_html($html);
    }

    /** Agrega --cod-mapa-alto al atributo style de la raíz (o lo crea). */
    private static function con_alto(string $atributos_raiz, int $alto): string
    {
        $variable = '--cod-mapa-alto:' . $alto . 'px;';
        if (preg_match('/\bstyle="/', $atributos_raiz) === 1) {
            return preg_replace('/\bstyle="/', 'style="' . $variable, $atributos_raiz, 1) ?? $atributos_raiz;
        }

        return $atributos_raiz . ' style="' . $variable . '"';
    }

    /**
     * Pide el runtime y la hoja de la conducta. Idempotente: WordPress no repite
     * un mismo nombre de script o de estilo.
     */
    public static function encolar_recursos(): void
    {
        if (!defined('COD_PUBLISHER_FILE') || !defined('COD_PUBLISHER_VERSION')) {
            return;
        }
        // Los mismos nombres y direcciones que usa COD_Canvas_Page_Publisher::salida_con_regiones().
        wp_enqueue_script('cod-interactions', plugins_url('assets/js/cod-interactions.js', COD_PUBLISHER_FILE), [], COD_PUBLISHER_VERSION, true);
        wp_enqueue_script('cod-canvas-public', plugins_url('assets/js/cod-canvas-public.js', COD_PUBLISHER_FILE), ['cod-interactions'], COD_PUBLISHER_VERSION, true);

        static $hoja = false;
        if (!$hoja && class_exists('COD_Canvas_Page_Publisher')) {
            $hoja = true;
            wp_add_inline_style('contope-mapa-style', COD_Canvas_Page_Publisher::mapa_css());
        }
    }
}
