<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Biblioteca de "Súper-Módulos" personalizados guardados por el usuario.
 *
 * MVP de "Guardar como módulo": persiste una lista plana de bloques
 * reutilizables (HTML + CSS ya saneados) como una única opción de WordPress,
 * en vez de un custom post type nuevo — no hace falta más que eso para este
 * alcance (ver class-cod-theme-definitions.php para el mismo patrón de
 * opción-JSON usado en este plugin).
 *
 * Cada entrada tiene un `id` estable en forma de slug (`cod-custom-<uuid4>`),
 * NUNCA un entero incremental: este proyecto tiene un bug recurrente de IDs
 * numéricos que no sobreviven una migración entre instalaciones de WordPress
 * (ver la nota de `document_id` en COD_Canvas_Editor_Admin), y una biblioteca
 * de módulos reusables viaja entre sitios en un paquete exactamente igual que
 * los documentos Canvas.
 */
final class COD_Custom_Module_Library
{
    public const OPTION_KEY = 'cod_custom_modules';

    /** Límites defensivos, en el mismo espíritu que COD_Canvas_Document_Sanitizer. */
    private const MAX_LABEL_LENGTH = 120;
    private const MAX_CATEGORY_LENGTH = 80;
    private const DEFAULT_CATEGORY = 'Módulos guardados';

    /**
     * El esquema de configuración del supermódulo: sus PROPIEDADES.
     *
     * Son los pasos 3 y 4 de la arquitectura (ver
     * `vault_contope-design/arquitectura-page-builder-compositivo.md` §2):
     * «recoge el esquema de configuración aportado por cada elemento» y
     * «decide qué propiedades expone al usuario de la instancia».
     *
     * Hasta acá el supermódulo cubría los pasos 1, 2 y 5 —componer, incorporar
     * y guardar— y eso lo dejaba a la altura de un patrón sincronizado de
     * WordPress. Lo que distingue a un supermódulo es esto: que quien lo usa
     * pueda configurarlo SIN entrar a editarlo por dentro.
     *
     * CÓMO VIAJA. La propiedad se marca en el propio marcado, con
     * `data-cod-prop="<clave>"` sobre el elemento. Eso se decidió así —y no con
     * un vínculo entre la instancia y la biblioteca— porque insertar un
     * supermódulo es COPIAR su HTML: una marca dentro del marcado sobrevive a
     * la copia, a la exportación en un paquete y hasta a una edición a mano,
     * mientras que un vínculo por id se rompe en cuanto el módulo viaja a otro
     * sitio. Comprobado que el saneador del documento conserva el atributo.
     *
     * Lo que se guarda acá es el esquema: qué claves hay, cómo se llaman para
     * quien las usa y de qué tipo son. Los VALORES de cada instancia no se
     * guardan acá: viven en el documento de la página, dentro del propio
     * marcado, que es donde vive el contenido.
     */
    private const MAX_PROPS = 32;
    private const MAX_PROP_LABEL_LENGTH = 80;

    /**
     * Los tipos que una propiedad puede tener.
     *
     * La lista es corta a propósito, siguiendo el criterio de la propia
     * arquitectura: «un vocabulario pequeño y una gramática capaz de producir
     * familias completas». Tres tipos cubren lo que de verdad se cambia al
     * reutilizar un módulo —el texto, la foto y el destino de un botón—. Lo
     * que no esté acá se sigue editando entrando al módulo, que es exactamente
     * lo que se podía hacer antes: no se pierde nada por empezar corto.
     */
    public const TIPOS = ['texto', 'imagen', 'enlace'];

    /**
     * Guarda una entrada nueva y devuelve la entrada completa tal como quedó
     * persistida (con su id generado y su createdAt).
     *
     * $html y $css deben llegar YA saneados por el llamador (se reutiliza
     * COD_Canvas_Document_Sanitizer::sanitize_html()/sanitize_css(), igual que
     * el resto del documento Canvas) — esta clase no vuelve a sanear el
     * contenido, sólo lo persiste.
     *
     * @param array<int, array{key?: mixed, label?: mixed, type?: mixed}> $props
     * @return array{id: string, label: string, category: string, html: string, css: string, props: array<int, array{key: string, label: string, type: string}>, createdAt: string}
     */
    public function save(string $label, string $category, string $html, string $css, array $props = []): array
    {
        $label = function_exists('mb_substr')
            ? mb_substr(trim($label), 0, self::MAX_LABEL_LENGTH)
            : substr(trim($label), 0, self::MAX_LABEL_LENGTH);
        if ($label === '') {
            $label = 'Módulo guardado';
        }

        $category = function_exists('mb_substr')
            ? mb_substr(trim($category), 0, self::MAX_CATEGORY_LENGTH)
            : substr(trim($category), 0, self::MAX_CATEGORY_LENGTH);
        if ($category === '') {
            $category = self::DEFAULT_CATEGORY;
        }

        $entry = [
            'id' => 'cod-custom-' . wp_generate_uuid4(),
            'label' => $label,
            'category' => $category,
            'html' => $html,
            'css' => $css,
            // El esquema se cruza con el marcado: una propiedad declarada que
            // no esté marcada en el HTML no sirve para nada —sería un campo
            // que no escribe en ninguna parte— y una marca sin declarar no se
            // puede mostrar, porque no tiene nombre ni tipo.
            'props' => self::normalizar_props($props, $html),
            'createdAt' => gmdate('c'),
        ];

        $entries = $this->read_all();
        $entries[] = $entry;
        $this->write_all($entries);

        return $entry;
    }

    /**
     * @return array<int, array{id: string, label: string, category: string, html: string, css: string, props: array<int, array{key: string, label: string, type: string}>, createdAt: string}>
     */
    public function list_all(): array
    {
        return $this->read_all();
    }

    /**
     * Las claves que el MARCADO declara, leídas de los `data-cod-prop`.
     *
     * Esto es el paso 3: el esquema no se escribe a mano, se RECOGE de lo que
     * aportan los elementos. Quien compone marca un título y una foto; la
     * lista sale de ahí.
     *
     * Se lee con una expresión y no con un analizador de HTML a propósito: lo
     * único que hace falta es el valor de un atributo cuyo formato ya está
     * acotado a `[a-z0-9_-]`, y meter un DOM entero para esto sería más
     * superficie para equivocarse que la que ahorra.
     *
     * @return array<int, string> en el orden en que aparecen, sin repetidas
     */
    public static function claves_en_el_marcado(string $html): array
    {
        if (preg_match_all('/data-cod-prop="([a-z0-9_-]{1,40})"/i', $html, $m) !== 1 && empty($m[1])) {
            return [];
        }

        $vistas = [];
        $claves = [];
        foreach ($m[1] as $clave) {
            $clave = strtolower($clave);
            if (isset($vistas[$clave])) {
                continue;
            }
            $vistas[$clave] = true;
            $claves[] = $clave;
        }

        return $claves;
    }

    /**
     * Deja el esquema en su forma guardable, cruzado con el marcado.
     *
     * Reglas, y cada una tiene su motivo:
     *
     *  - Una propiedad declarada que NO está marcada en el HTML se descarta:
     *    sería un campo en el panel que no escribe en ningún sitio.
     *  - Una clave marcada en el HTML que nadie declaró SÍ entra, con su
     *    propia clave como rótulo. Es el paso 3 funcionando solo: si alguien
     *    marcó un elemento y no llegó a ponerle nombre, es mejor un campo con
     *    nombre feo que una marca muerta.
     *  - El tipo que no se reconoce se deduce del marcado; si tampoco, es
     *    texto, que es el caso común y el menos dañino si se equivoca.
     *  - El orden es el del MARCADO, no el de la lista declarada: así el panel
     *    sale en el mismo orden en que se ven las cosas en la página.
     *
     * @param array<int, array{key?: mixed, label?: mixed, type?: mixed}> $props
     * @return array<int, array{key: string, label: string, type: string}>
     */
    public static function normalizar_props(array $props, string $html): array
    {
        $declaradas = [];
        foreach ($props as $prop) {
            if (!is_array($prop)) {
                continue;
            }
            $clave = isset($prop['key']) ? strtolower(trim((string) $prop['key'])) : '';
            if ($clave === '' || preg_match('/^[a-z0-9_-]{1,40}$/', $clave) !== 1) {
                continue;
            }
            $rotulo = isset($prop['label']) ? trim((string) $prop['label']) : '';
            $rotulo = function_exists('mb_substr')
                ? mb_substr($rotulo, 0, self::MAX_PROP_LABEL_LENGTH)
                : substr($rotulo, 0, self::MAX_PROP_LABEL_LENGTH);
            $tipo = isset($prop['type']) ? strtolower(trim((string) $prop['type'])) : '';
            $declaradas[$clave] = [
                'label' => $rotulo,
                'type' => in_array($tipo, self::TIPOS, true) ? $tipo : '',
            ];
        }

        $salida = [];
        foreach (self::claves_en_el_marcado($html) as $clave) {
            $declarada = $declaradas[$clave] ?? ['label' => '', 'type' => ''];
            $salida[] = [
                'key' => $clave,
                'label' => $declarada['label'] !== '' ? $declarada['label'] : $clave,
                'type' => $declarada['type'] !== '' ? $declarada['type'] : self::tipo_segun_el_marcado($html, $clave),
            ];
            if (count($salida) >= self::MAX_PROPS) {
                break;
            }
        }

        return $salida;
    }

    /**
     * Deduce el tipo mirando qué etiqueta lleva la marca.
     *
     * Una `<img>` es una imagen y una `<a>` es un enlace. Cualquier otra cosa
     * es texto. No se intenta nada más fino: deducir de más es cómo se
     * construyen las sorpresas.
     */
    private static function tipo_segun_el_marcado(string $html, string $clave): string
    {
        $escapada = preg_quote($clave, '/');
        if (preg_match('/<\s*img\b[^>]*data-cod-prop="' . $escapada . '"/i', $html) === 1
            || preg_match('/data-cod-prop="' . $escapada . '"[^>]*\bsrc=/i', $html) === 1) {
            return 'imagen';
        }
        if (preg_match('/<\s*a\b[^>]*data-cod-prop="' . $escapada . '"/i', $html) === 1
            || preg_match('/data-cod-prop="' . $escapada . '"[^>]*\bhref=/i', $html) === 1) {
            return 'enlace';
        }

        return 'texto';
    }

    /**
     * @return array<int, array{id: string, label: string, category: string, html: string, css: string, createdAt: string}>
     */
    private function read_all(): array
    {
        $raw = get_option(self::OPTION_KEY, '');
        if (!is_string($raw) || $raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $entries = [];
        foreach ($decoded as $item) {
            if (!is_array($item)) {
                continue;
            }
            $id = isset($item['id']) ? (string) $item['id'] : '';
            if ($id === '') {
                continue;
            }
            $html = isset($item['html']) ? (string) $item['html'] : '';
            $entries[] = [
                'id' => $id,
                'label' => isset($item['label']) ? (string) $item['label'] : $id,
                'category' => isset($item['category']) ? (string) $item['category'] : self::DEFAULT_CATEGORY,
                'html' => $html,
                'css' => isset($item['css']) ? (string) $item['css'] : '',
                // Se normaliza AL LEER y no sólo al guardar: los módulos que ya
                // estaban guardados antes de que existieran las propiedades no
                // tienen la clave, y uno compuesto a mano puede traer marcas
                // que nadie declaró. Normalizar acá hace que todos se
                // comporten igual sin tener que migrar la opción.
                'props' => self::normalizar_props(
                    isset($item['props']) && is_array($item['props']) ? $item['props'] : [],
                    $html
                ),
                'createdAt' => isset($item['createdAt']) ? (string) $item['createdAt'] : '',
            ];
        }

        return $entries;
    }

    /**
     * @param array<int, array{id: string, label: string, category: string, html: string, css: string, createdAt: string}> $entries
     */
    private function write_all(array $entries): void
    {
        // autoload=false: esta lista puede crecer y no hace falta en cada
        // carga de página del sitio público, sólo la lee el editor Canvas.
        update_option(self::OPTION_KEY, wp_json_encode($entries), false);
    }
}
