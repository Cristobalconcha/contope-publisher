<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pone un módulo de la biblioteca DENTRO de una página compuesta, nombrándolo.
 *
 * LO QUE ESTO NO ES, y estuvo a punto de ser. El 4 de octubre de 2026, al
 * componer la portada de Santa Luisa, me encontré con que sus dos mapas no
 * podían entrar en una composición: no son contenido que alguien escriba, los
 * produce `scripts/build-geo-map.mjs` consultando OpenStreetMap, y el de
 * ubicación son 2.642 nodos. Mi primer arreglo fue inventar un almacén nuevo
 * —archivos sueltos en `uploads/`— y Cristóbal lo paró en una línea: *«como que
 * no está declarado, es un módulo del plugin»*.
 *
 * Tenía razón. `COD_Custom_Module_Library` ya es exactamente eso: la biblioteca
 * de súper-módulos, HTML y CSS saneados por el mismo saneador que el resto del
 * documento, con id de slug estable *precisamente* para viajar entre sitios en
 * un paquete. Un segundo almacén habría partido en dos la respuesta a «¿qué
 * módulos tiene este sitio?», que es la peor forma de resolver un hueco.
 *
 * LO QUE SÍ FALTABA era poder REFERIRSE a uno desde una composición. La
 * biblioteca se usa desde el editor —se guarda un componente y se vuelve a
 * insertar, copiándolo—, y copiar es justo lo que no sirve para una pieza
 * generada: el día que el mapa se regenere habría que volver a pegarlo en cada
 * página que lo use. Nombrarlo mantiene el módulo y la página independientes.
 *
 * CÓMO SE USA. El nodo `shortcode` de la composición lo nombra:
 *
 *     { kind: 'shortcode', content: { tag: 'contope_modulo', atts: { nombre: 'mapa-ubicacion' } } }
 *
 * `nombre` es el rótulo del módulo en forma de slug, o su id. El rótulo es lo
 * que una persona lee en la biblioteca, así que es lo que una receta debería
 * poder escribir; el id sirve cuando hay dos con el mismo nombre.
 *
 * Un módulo que falta no rompe la página de un visitante: deja un hueco y un
 * aviso que sólo ve quien puede arreglarlo.
 */
final class COD_Modulo
{
    public const SHORTCODE = 'contope_modulo';

    public function __construct(private COD_Custom_Module_Library $biblioteca)
    {
    }

    public function register(): void
    {
        add_shortcode(self::SHORTCODE, [$this, 'render']);
    }

    /**
     * @param array<string, mixed>|string $atts
     */
    public function render($atts): string
    {
        $atts = shortcode_atts(['nombre' => ''], is_array($atts) ? $atts : [], self::SHORTCODE);
        $buscado = trim((string) $atts['nombre']);
        if ($buscado === '') {
            return $this->aviso('Al módulo le falta el nombre.');
        }

        $modulo = $this->buscar($buscado);
        if ($modulo === null) {
            return $this->aviso(sprintf('No encuentro el módulo «%s» en la biblioteca.', $buscado));
        }

        // El HTML y el CSS ya pasaron por el saneador al guardarse: la
        // biblioteca es la única puerta de entrada y lo hace ahí. Volver a
        // sanearlos acá sería una segunda superficie de saneamiento, que es lo
        // que este plugin evita a propósito.
        $hoja = $this->hoja((string) $modulo['id'], (string) $modulo['css']);

        return $hoja . '<div class="cod-modulo" data-cod-modulo="' . esc_attr((string) $modulo['id']) . '">'
            . $modulo['html'] . '</div>';
    }

    /**
     * Por id exacto, o por el rótulo convertido a slug.
     *
     * @return array<string, mixed>|null
     */
    private function buscar(string $buscado): ?array
    {
        $slug = sanitize_title($buscado);
        foreach ($this->biblioteca->list_all() as $modulo) {
            if ((string) $modulo['id'] === $buscado) {
                return $modulo;
            }
            if (sanitize_title((string) $modulo['label']) === $slug) {
                return $modulo;
            }
        }
        return null;
    }

    /**
     * El CSS del módulo, una sola vez por página aunque aparezca varias veces.
     *
     * Viaja CON el módulo y no en la hoja de la página porque si no, llevárselo
     * a otro sitio sería llevarse la mitad: el mapa de ubicación de Santa Luisa
     * son 23 reglas que nadie adivinaría que le pertenecen.
     */
    private function hoja(string $id, string $css): string
    {
        static $puestas = [];
        if ($css === '' || isset($puestas[$id])) {
            return '';
        }
        $puestas[$id] = true;
        // Nada de </style> dentro del CSS: cerraría la etiqueta antes de tiempo.
        return '<style data-cod-modulo-hoja="' . esc_attr($id) . '">'
            . str_replace('</', '<\/', $css) . '</style>';
    }

    private function aviso(string $mensaje): string
    {
        if (!current_user_can('edit_posts')) {
            return '';
        }
        return '<div class="cod-modulo cod-modulo--ausente" role="note">'
            . esc_html('Módulo de ContOpe: ' . $mensaje) . '</div>';
    }
}
