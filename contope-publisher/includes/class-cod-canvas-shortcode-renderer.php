<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Ejecuta shortcodes de WordPress DENTRO del lienzo, solo donde el documento
 * lo pide explícitamente y solo de una lista permitida.
 *
 * POR QUÉ NO SE USA do_shortcode() SOBRE TODO EL HTML: eso convertiría
 * cualquier texto entre corchetes del contenido en una llamada a código. El
 * lienzo es un documento de diseño donde alguien puede escribir "[ver planos]"
 * en un párrafo; no puede ser un intérprete. Por eso el disparador es un nodo
 * marcado, no el texto.
 *
 * El marcador que deja el editor o el compilador:
 *
 *     <div data-cod-shortcode="instagram-feed"
 *          data-cod-shortcode-atts='{"feed":"1"}'></div>
 *
 * Al publicar, ese div ENTERO se reemplaza por la salida del shortcode. El
 * marcador va siempre vacío: su rótulo en el editor lo pinta el CSS, así el
 * reemplazo es un reconocimiento exacto y no hay que interpretar HTML anidado.
 *
 * La lista permitida es corta a propósito y se amplía con un filtro, no
 * editando esta clase.
 */
final class COD_Canvas_Shortcode_Renderer
{
    /**
     * Shortcodes que el lienzo puede ejecutar. Se agregan de a uno, cuando hay
     * una necesidad real — no "por si acaso".
     *
     * @var list<string>
     */
    private const PERMITIDOS = [
        'instagram-feed',   // Smash Balloon Instagram Feed
    ];

    /** @return list<string> */
    public function permitidos(): array
    {
        $lista = apply_filters('cod_canvas_shortcodes_permitidos', self::PERMITIDOS);
        if (!is_array($lista)) {
            return self::PERMITIDOS;
        }
        return array_values(array_filter(array_map(
            static fn ($tag) => is_string($tag) ? strtolower(trim($tag)) : '',
            $lista
        )));
    }

    /**
     * Reemplaza cada marcador por la salida de su shortcode. Devuelve el HTML
     * tal cual si no hay ninguno, para no pagar el recorrido en la mayoría de
     * las páginas.
     */
    public function render(string $html): string
    {
        if (strpos($html, 'data-cod-shortcode') === false) {
            return $html;
        }

        $resultado = preg_replace_callback(
            '/<div\b([^>]*\bdata-cod-shortcode=[^>]*)>\s*<\/div>/i',
            function (array $coincidencia): string {
                return $this->render_marcador((string) $coincidencia[1]);
            },
            $html
        );

        return is_string($resultado) ? $resultado : $html;
    }

    /**
     * @param string $atributos Los atributos crudos del div marcador.
     */
    private function render_marcador(string $atributos): string
    {
        // Se aceptan comillas dobles o simples: el documento guardado usa
        // dobles (con las internas del JSON escapadas como &quot;), pero un
        // marcador escrito a mano bien puede venir con simples.
        if (preg_match('/data-cod-shortcode=("([^"]*)"|\'([^\']*)\')/i', $atributos, $m) !== 1) {
            return '';
        }
        $tag = strtolower(trim(html_entity_decode($m[2] !== '' ? $m[2] : ($m[3] ?? ''), ENT_QUOTES, 'UTF-8')));
        if ($tag === '' || !in_array($tag, $this->permitidos(), true)) {
            // Un shortcode fuera de la lista no se ejecuta ni se muestra: el
            // visitante nunca ve corchetes sueltos por un documento mal armado.
            return '<!-- ocd: shortcode no permitido -->';
        }
        if (!shortcode_exists($tag)) {
            // El plugin que lo provee está desactivado o aún no configurado.
            // Silencio para el visitante; pista para quien administra.
            return current_user_can('manage_options')
                ? '<!-- ocd: el shortcode [' . esc_html($tag) . '] no está registrado; ¿el plugin está activo? -->'
                : '';
        }

        return do_shortcode('[' . $tag . $this->atributos_shortcode($atributos) . ']');
    }

    /**
     * Convierte data-cod-shortcode-atts (un objeto JSON) en los atributos del
     * shortcode. Solo pares simples: nombres alfanuméricos y valores de texto
     * plano. Nada de arreglos ni objetos anidados, que no aportan y sí abren
     * superficie.
     */
    private function atributos_shortcode(string $atributos): string
    {
        if (preg_match('/data-cod-shortcode-atts=("([^"]*)"|\'([^\']*)\')/i', $atributos, $m) !== 1) {
            return '';
        }
        $crudo = html_entity_decode($m[2] !== '' ? $m[2] : ($m[3] ?? ''), ENT_QUOTES, 'UTF-8');
        $datos = json_decode($crudo, true);
        if (!is_array($datos)) {
            return '';
        }

        $salida = '';
        foreach ($datos as $nombre => $valor) {
            if (!is_string($nombre) || preg_match('/^[a-z0-9_-]{1,40}$/i', $nombre) !== 1) {
                continue;
            }
            if (is_bool($valor)) {
                $valor = $valor ? 'true' : 'false';
            }
            if (!is_string($valor) && !is_int($valor) && !is_float($valor)) {
                continue;
            }
            $limpio = sanitize_text_field((string) $valor);
            // Las comillas dobles cerrarían el atributo del shortcode.
            $limpio = str_replace(['"', '[', ']'], '', $limpio);
            $salida .= ' ' . strtolower($nombre) . '="' . $limpio . '"';
        }
        return $salida;
    }
}
