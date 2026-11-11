<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Plano de parcelas: el número de parcelas disponibles, escrito por el servidor.
 *
 * EL PROBLEMA. El módulo `parcel-map` cuenta en el navegador los ítems del
 * plano cuyo `data-cod-parcel-estado` es «disponible» y escribe el resultado en
 * los elementos que indican `data-cod-parcel-count` y
 * `data-cod-parcel-count-secondary` (cod-canvas-public.js, installParcelMap).
 * Hasta ahora el HTML que salía del servidor traía sólo el marcador («—»), así
 * que quien lee la página sin ejecutar JavaScript (los asistentes que leen
 * páginas, y Google en su primera pasada) se perdía el dato más comercial del
 * sitio: «Solo quedan N parcelas disponibles».
 *
 * LA SOLUCIÓN. Al servir la página se hace la misma cuenta, sobre el mismo
 * dato que ya está en el HTML (los atributos de cada ítem), y se rellena el
 * hueco. No se congela un número al publicar: se deriva en cada entrega, así
 * que cambiar el estado de una parcela se refleja sin republicar. El runtime de
 * JavaScript no cambia y sigue recalculando en el navegador; lo único nuevo es
 * que deja de ser el único que sabe la cuenta.
 *
 * CÓMO, Y POR QUÉ ASÍ.
 * - Se usa WP_HTML_Tag_Processor y nunca DOMDocument: éste reescribe el marcado
 *   de todo el documento; el procesador sólo toca lo que se le pide.
 * - El procesador entiende etiquetas y atributos, no «el contenido de un
 *   elemento». Para ese caso se usa su propia API de texto
 *   (`set_modifiable_text`, WordPress 6.7+) sobre el nodo de texto que sigue a
 *   la etiqueta destino: no hay reemplazos de cadena sobre el HTML.
 * - Se escribe sólo si el destino es un elemento con id cuyo contenido es UN
 *   nodo de texto (el marcador «—» del módulo). Si trae marcado adentro, está
 *   vacío o no se puede verificar, no se toca: nunca romper por intentar
 *   mejorar.
 *
 * LO QUE ENTIENDE, a propósito acotado (el runtime acepta cualquier selector
 * CSS; acá, lo que se puede resolver sin un motor de selectores):
 * - selector de ítems: una o más clases encadenadas (`.lote`, `.lote.libre`),
 *   con el mismo valor por omisión que el runtime (`.lote`);
 * - selectores de destino (`data-cod-parcel-count`, `-count-secondary`): un
 *   `#id`. Cualquier otro selector se ignora y lo resuelve el navegador, como
 *   hasta ahora.
 *
 * El panel «Lote Nº» NO se toca: en reposo no hay ningún lote seleccionado, y el
 * runtime sólo lo llena al pasar el cursor o hacer clic sobre un ítem (render());
 * su «—» es el estado vacío a propósito, no contenido perdido.
 */
final class COD_Plano_Parcelas
{
    private const COMPORTAMIENTO = 'parcel-map';
    private const ATTR_ITEMS = 'data-cod-parcel-item-selector';
    private const ATTR_ESTADO = 'data-cod-parcel-estado';
    private const ATTR_CONTEO = 'data-cod-parcel-count';
    private const ATTR_CONTEO_SECUNDARIO = 'data-cod-parcel-count-secondary';
    private const SELECTOR_ITEMS_POR_OMISION = '.lote';

    /** Etiquetas cuyo contenido no es texto de lectura: nunca son destino. */
    private const ETIQUETAS_NO_DESTINO = [
        'SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE', 'IFRAME', 'NOEMBED', 'NOFRAMES', 'XMP', 'PLAINTEXT', 'NOSCRIPT', 'SVG',
    ];

    /**
     * Devuelve el HTML con el conteo de disponibles escrito en los destinos del
     * plano. Si la página no tiene plano, o algo no calza, devuelve el HTML
     * exacto que recibió.
     */
    public static function resolver_en_html(string $html): string
    {
        // Sin plano, el costo es esta búsqueda y nada más.
        if (strpos($html, self::ATTR_CONTEO) === false) {
            return $html;
        }
        if (!class_exists('WP_HTML_Tag_Processor') || !method_exists('WP_HTML_Tag_Processor', 'set_modifiable_text')) {
            return $html;
        }

        try {
            $conteos = self::conteos_por_id($html);
            if ($conteos === []) {
                return $html;
            }
            return self::escribir($html, $conteos);
        } catch (\Throwable $error) {
            return $html;
        }
    }

    /**
     * Primera pasada, sólo lectura: por cada raíz `parcel-map`, cuenta sus
     * ítems «disponible» y anota el número contra el id de cada destino.
     *
     * @return array<string, int> id del elemento destino => disponibles
     */
    private static function conteos_por_id(string $html): array
    {
        $p = new WP_HTML_Tag_Processor($html);
        $conteos = [];
        $raiz = null;

        while ($p->next_tag(['tag_closers' => 'visit'])) {
            $etiqueta = (string) $p->get_tag();

            if ($raiz !== null) {
                if ($p->is_tag_closer()) {
                    if ($etiqueta === $raiz['etiqueta'] && --$raiz['profundidad'] === 0) {
                        if ($raiz['items'] > 0) {
                            foreach ($raiz['ids'] as $id) {
                                $conteos[$id] = $raiz['disponibles'];
                            }
                        }
                        $raiz = null;
                    }
                    continue;
                }
                if ($etiqueta === $raiz['etiqueta'] && !($raiz['esSvg'] && $p->has_self_closing_flag())) {
                    $raiz['profundidad']++;
                }
                if (self::es_item($p, $raiz['clases'])) {
                    $raiz['items']++;
                    $estado = $p->get_attribute(self::ATTR_ESTADO);
                    if (is_string($estado) && strtolower(trim($estado)) === 'disponible') {
                        $raiz['disponibles']++;
                    }
                }
                continue;
            }

            if ($p->is_tag_closer() || $p->get_attribute('data-cod-behavior') !== self::COMPORTAMIENTO) {
                continue;
            }

            $clases = self::clases_de_selector((string) $p->get_attribute(self::ATTR_ITEMS));
            $ids = array_values(array_filter([
                self::id_de_selector($p->get_attribute(self::ATTR_CONTEO)),
                self::id_de_selector($p->get_attribute(self::ATTR_CONTEO_SECUNDARIO)),
            ], static fn ($id): bool => $id !== null));
            // Un plano con un selector de ítems que no sabemos resolver, o sin
            // destinos que podamos escribir, se deja al navegador.
            if ($clases === [] || $ids === [] || ($etiqueta === 'SVG' && $p->has_self_closing_flag())) {
                continue;
            }

            $raiz = [
                'etiqueta' => $etiqueta,
                'esSvg' => $etiqueta === 'SVG',
                'profundidad' => 1,
                'clases' => $clases,
                'ids' => $ids,
                'items' => 0,
                'disponibles' => 0,
            ];
        }

        // Una raíz que no llegó a cerrarse es HTML que no calza: no se escribe.
        return $conteos;
    }

    /**
     * Segunda pasada: escribe cada número en el primer elemento de la página
     * con ese id (lo mismo que hace document.querySelector('#id')).
     *
     * @param array<string, int> $conteos
     */
    private static function escribir(string $html, array $conteos): string
    {
        $p = new WP_HTML_Tag_Processor($html);
        $pendientes = $conteos;
        $escritos = 0;

        while ($pendientes !== [] && $p->next_tag()) {
            $id = $p->get_attribute('id');
            if (!is_string($id) || !isset($pendientes[$id])) {
                continue;
            }
            $numero = $pendientes[$id];
            unset($pendientes[$id]);

            $etiqueta = (string) $p->get_tag();
            if (in_array($etiqueta, self::ETIQUETAS_NO_DESTINO, true)) {
                continue;
            }

            // Sólo se escribe si el contenido es exactamente UN nodo de texto
            // seguido del cierre del mismo elemento. Se mira antes de tocar.
            $p->set_bookmark('destino');
            if (!$p->next_token() || $p->get_token_type() !== '#text') {
                $p->seek('destino');
                continue;
            }
            $p->set_bookmark('texto');
            $cierra = $p->next_token() && $p->is_tag_closer() && (string) $p->get_tag() === $etiqueta
                && $p->get_token_type() === '#tag';
            $p->seek('texto');
            if (!$cierra) {
                $p->seek('destino');
                continue;
            }
            if ($p->set_modifiable_text((string) $numero)) {
                $escritos++;
            }
            $p->release_bookmark('texto');
            $p->release_bookmark('destino');
        }

        if ($escritos === 0 || $p->paused_at_incomplete_token()) {
            return $html;
        }
        return $p->get_updated_html();
    }

    /** ¿Es la etiqueta actual un ítem del plano, es decir, lleva todas las clases del selector? */
    private static function es_item(WP_HTML_Tag_Processor $p, array $clases): bool
    {
        foreach ($clases as $clase) {
            if (!$p->has_class($clase)) {
                return false;
            }
        }
        return true;
    }

    /**
     * `.lote` o `.lote.libre` => ['lote', 'libre']. Vacío = selector que no
     * entendemos. Un valor vacío cae al mismo `.lote` por omisión del runtime.
     *
     * @return list<string>
     */
    private static function clases_de_selector(string $selector): array
    {
        $selector = trim($selector);
        if ($selector === '') {
            $selector = self::SELECTOR_ITEMS_POR_OMISION;
        }
        if (!preg_match('/^(?:\.[A-Za-z_][A-Za-z0-9_-]*)+$/', $selector)) {
            return [];
        }
        return array_values(array_filter(explode('.', $selector), static fn (string $c): bool => $c !== ''));
    }

    /** `#loteDestacadoNum` => 'loteDestacadoNum'; cualquier otra forma => null. */
    private static function id_de_selector($selector): ?string
    {
        if (!is_string($selector)) {
            return null;
        }
        $selector = trim($selector);
        if (!preg_match('/^#([A-Za-z_][A-Za-z0-9_-]*)$/', $selector, $m)) {
            return null;
        }
        return $m[1];
    }
}
