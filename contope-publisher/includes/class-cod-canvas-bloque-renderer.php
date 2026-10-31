<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pone DENTRO del lienzo un bloque nativo de Gutenberg, que dibuja WordPress.
 *
 * LA REGLA (CLAUDE.md, regla 11): ContOpe no duplica las familias de bloques que
 * Gutenberg ya tiene (buscador, últimas entradas, últimos comentarios…); se
 * CORRESPONDE con ellas. Antes de este nodo, una composición no tenía cómo decir
 * «aquí va el buscador de WordPress»: la única salida era imitarlo con texto fijo
 * —una lista de entradas copiada a mano que envejece desde el primer día, un
 * buscador que no busca— o dejarlo fuera, y así quedó la barra lateral de Basis.
 *
 * EL NODO. `kind: "block"`, `content: { name: "core/search", attrs: { … } }`. La
 * composición dice QUÉ bloque y con qué atributos; la FORMA la ponen las reglas
 * de diseño, sobre el nodo y sobre sus partes (ver NODE_KIND_CONTRACTS['block']
 * en el compilador); y el CONTENIDO —las entradas, los comentarios— lo dibuja
 * WordPress al mostrar la página, con los datos de ese momento. Nada se copia.
 *
 * EL MARCADOR. Igual que el shortcode, pero conservando su caja: el compilador
 * deja
 *
 *     <div class="cod-node cod-node--block …" data-cod-bloque="core/search"
 *          data-cod-bloque-atts='{"buttonText":"Buscar"}'></div>
 *
 * y al publicar ese div se rellena con la salida de `render_block()`. El div
 * se queda —es el que recibe las clases de regla—; lo que cambia es que ya no
 * está vacío.
 *
 * LA LISTA PERMITIDA es corta y cerrada: sólo bloques DINÁMICOS (los que
 * WordPress dibuja con PHP al mostrar, sin contenido propio guardado) y sin
 * efectos fuera de la página. Se amplía con el filtro `cod_canvas_bloques_permitidos`,
 * no editando esta clase. Un bloque fuera de la lista no se dibuja ni se muestra.
 * Los atributos que llegan se entregan al propio sistema de bloques, que descarta
 * los que su esquema no reconoce o no valida.
 */
final class COD_Canvas_Bloque_Renderer
{
    /**
     * Bloques de núcleo que el lienzo puede dibujar. Se agregan de a uno,
     * cuando hay una necesidad real.
     *
     * @var list<string>
     */
    private const PERMITIDOS = [
        'core/search',
        'core/latest-posts',
        'core/latest-comments',
        'core/archives',
        'core/categories',
        'core/tag-cloud',
        'core/calendar',
        'core/page-list',
    ];

    /** @return list<string> */
    public static function permitidos(): array
    {
        $lista = apply_filters('cod_canvas_bloques_permitidos', self::PERMITIDOS);
        if (!is_array($lista)) {
            return self::PERMITIDOS;
        }
        return array_values(array_filter(array_map(
            static fn ($nombre) => is_string($nombre) && preg_match('/^[a-z0-9-]+\/[a-z0-9-]+$/', trim($nombre)) === 1 ? trim($nombre) : '',
            $lista
        )));
    }

    /**
     * ¿Es un nombre de bloque que el lienzo puede dibujar? (la validación del
     * compilador y la del renderizador son ésta misma)
     */
    public static function es_permitido(string $nombre): bool
    {
        return in_array($nombre, self::permitidos(), true);
    }

    /**
     * Valida el `content` de un nodo block: sólo name y attrs, attrs con
     * nombres simples y valores de texto, número o booleano.
     *
     * @param array<string, mixed> $content
     * @return array{name: string, attrs: array<string, string|int|float|bool>}|WP_Error
     */
    public static function normalizar(array $content)
    {
        $extra = array_diff(array_keys($content), ['name', 'attrs']);
        if ($extra !== [] || !isset($content['name']) || !is_string($content['name'])) {
            return new WP_Error('cod_mcp_block_invalid', 'block requiere name (el nombre del bloque de WordPress, p. ej. core/search); attrs es opcional.');
        }
        $nombre = trim($content['name']);
        if (!self::es_permitido($nombre)) {
            return new WP_Error(
                'cod_mcp_block_not_allowed',
                'El bloque "' . $nombre . '" no está en la lista que el lienzo puede dibujar: ' . implode(', ', self::permitidos()) . '.'
            );
        }
        $atributos = [];
        if (isset($content['attrs'])) {
            if (!is_array($content['attrs']) || count($content['attrs']) > 30) {
                return new WP_Error('cod_mcp_block_attrs_invalid', 'attrs debe ser un objeto de hasta 30 pares simples.');
            }
            foreach ($content['attrs'] as $clave => $valor) {
                if (!is_string($clave) || preg_match('/^[a-zA-Z][a-zA-Z0-9]{0,40}$/', $clave) !== 1) {
                    return new WP_Error('cod_mcp_block_attrs_invalid', 'Los nombres de attrs deben ser simples: letras y números, sin guiones.');
                }
                if (is_string($valor)) {
                    if (strlen($valor) > 300 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F<>]/', $valor) === 1) {
                        return new WP_Error('cod_mcp_block_attrs_invalid', 'El valor de "' . $clave . '" debe ser texto plano de hasta 300 caracteres.');
                    }
                } elseif (!is_int($valor) && !is_float($valor) && !is_bool($valor)) {
                    return new WP_Error('cod_mcp_block_attrs_invalid', 'El valor de "' . $clave . '" debe ser texto, número o booleano.');
                }
                $atributos[$clave] = $valor;
            }
        }
        return ['name' => $nombre, 'attrs' => $atributos];
    }

    /**
     * Rellena cada marcador con la salida de su bloque. Devuelve el HTML tal
     * cual si no hay ninguno.
     */
    public function render(string $html): string
    {
        if (strpos($html, 'data-cod-bloque') === false) {
            return $html;
        }

        $resultado = preg_replace_callback(
            '/<div\b([^>]*\bdata-cod-bloque=[^>]*)>\s*<\/div>/i',
            function (array $coincidencia): string {
                return '<div' . $coincidencia[1] . '>' . $this->render_marcador((string) $coincidencia[1]) . '</div>';
            },
            $html
        );

        return is_string($resultado) ? $resultado : $html;
    }

    /** @param string $atributos Los atributos crudos del div marcador. */
    private function render_marcador(string $atributos): string
    {
        $nombre = strtolower(trim($this->atributo($atributos, 'data-cod-bloque')));
        if ($nombre === '' || !self::es_permitido($nombre)) {
            return '<!-- ocd: bloque no permitido -->';
        }
        $tipo = WP_Block_Type_Registry::get_instance()->get_registered($nombre);
        if ($tipo === null) {
            return current_user_can('manage_options')
                ? '<!-- ocd: el bloque ' . esc_html($nombre) . ' no está registrado en esta versión de WordPress -->'
                : '';
        }

        $atts = [];
        $crudo = $this->atributo($atributos, 'data-cod-bloque-atts');
        if ($crudo !== '') {
            $datos = json_decode($crudo, true);
            if (is_array($datos)) {
                foreach ($datos as $clave => $valor) {
                    if (is_string($clave) && preg_match('/^[a-zA-Z][a-zA-Z0-9]{0,40}$/', $clave) === 1
                        && (is_string($valor) || is_int($valor) || is_float($valor) || is_bool($valor))) {
                        $atts[$clave] = $valor;
                    }
                }
            }
        }

        // render_block() entrega los atributos al esquema del propio bloque: los
        // que no existen o no validan se descartan, y los que faltan toman su
        // valor por omisión. Es la misma ruta que sigue una página de bloques.
        return render_block([
            'blockName' => $nombre,
            'attrs' => $atts,
            'innerBlocks' => [],
            'innerHTML' => '',
            'innerContent' => [],
        ]);
    }

    private function atributo(string $atributos, string $nombre): string
    {
        if (preg_match('/(?<![\w-])' . preg_quote($nombre, '/') . '=("([^"]*)"|\'([^\']*)\')/i', $atributos, $m) !== 1) {
            return '';
        }
        return html_entity_decode($m[2] !== '' ? $m[2] : ($m[3] ?? ''), ENT_QUOTES, 'UTF-8');
    }
}
