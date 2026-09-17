<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Validación y saneamiento del documento experimental del editor Canvas.
 *
 * Cada método rechaza de forma explícita lo que no puede representar en vez de
 * descartarlo en silencio, según las reglas del repositorio.
 */
final class COD_Canvas_Document_Sanitizer
{
    public const MAX_HTML_BYTES = 2097152;
    // Subido de 512 KB a 2 MB en caliente (2026-08-21) para destrabar un
    // guardado real bloqueado en una sesión larga de edición: el CSS del
    // documento ya superaba el límite anterior. Investigar por qué se
    // acumuló tanto CSS (posibles reglas huérfanas de componentes borrados
    // sin limpiar) queda pendiente como tarea aparte, no urgente.
    public const MAX_CSS_BYTES = 2097152;
    public const MAX_PROJECT_BYTES = 4194304;
    public const MAX_PROJECT_DEPTH = 64;

    /**
     * Etiquetas estructurales admitidas de forma explícita.
     *
     * Muchas de ellas (incluidas table, caption, colgroup, col, thead, tbody,
     * tfoot, tr, th y td) ya forman parte del conjunto `post` de WordPress; se
     * repiten acá sólo como documentación, no para habilitarlas. El resto
     * (svg, video, picture, source, audio, button, label, etc.) amplía el
     * conjunto `post`. `body` aparece porque GrapesJS envuelve el lienzo en el
     * wrapper `<body>`. `iframe`, `script`, `style`, `object`, `embed` y `form`
     * quedan fuera a propósito.
     */
    private const STRUCTURAL_TAGS = [
        'body',
        'div',
        'section',
        'article',
        'aside',
        'header',
        'footer',
        'main',
        'nav',
        'span',
        'figure',
        'figcaption',
        'picture',
        'source',
        'video',
        'canvas',
        'audio',
        'button',
        'label',
        'svg',
        'path',
        'g',
        'circle',
        'rect',
        'line',
        'polyline',
        'polygon',
        'hgroup',
        'table',
        'caption',
        'colgroup',
        'col',
        'thead',
        'tbody',
        'tfoot',
        'tr',
        'th',
        'td',
        'iframe',
        'defs',
        'symbol',
        'use',
        'text',
        'tspan',
        'select',
        'option',
    ];

    /**
     * Propiedades CSS de maquetación que `safecss_filter_attr` no admite por
     * defecto en todas las versiones soportadas y que el lienzo necesita.
     */
    private const EXTRA_STYLE_PROPERTIES = [
        'display',
        'flex',
        'flex-basis',
        'flex-direction',
        'flex-flow',
        'flex-grow',
        'flex-shrink',
        'flex-wrap',
        'gap',
        'row-gap',
        'column-gap',
        'align-content',
        'align-items',
        'align-self',
        'justify-content',
        'justify-items',
        'justify-self',
        'order',
        'grid-template-columns',
        'grid-template-rows',
        'grid-template-areas',
        'grid-area',
        'grid-column',
        'grid-row',
        'grid-auto-flow',
        'grid-auto-columns',
        'grid-auto-rows',
        'object-fit',
        'object-position',
        'aspect-ratio',
        'transition',
        'box-shadow',
    ];

    /**
     * Escribe un tamaño en bytes como lo leería una persona.
     *
     * Existe para que el número del mensaje salga del propio límite y no de
     * la memoria de quien escribió la línea. Escribirlo a mano ya costó una
     * vez: el tope de CSS se subió a 2 MB el 2026-08-21 y el mensaje siguió
     * diciendo 512 KB durante casi un mes, mandando a buscar el problema
     * donde no estaba. Ver la issue #10.
     */
    private static function limite_legible(int $bytes): string
    {
        foreach ([1048576 => 'MB', 1024 => 'KB'] as $unidad => $nombre) {
            if ($bytes >= $unidad) {
                $valor = number_format($bytes / $unidad, 1, ',', '');
                $valor = rtrim(rtrim($valor, '0'), ',');
                return $valor . ' ' . $nombre;
            }
        }

        return $bytes . ' bytes';
    }

    /**
     * @return string|WP_Error HTML saneado o el motivo del rechazo.
     */
    public function sanitize_html(string $html)
    {
        $html = $this->normalize($html);
        $html = $this->strip_document_metadata($html);
        if (strlen($html) > self::MAX_HTML_BYTES) {
            return new WP_Error(
                'cod_canvas_html_size',
                sprintf(
                    'El HTML supera el límite de %s: el documento trae %s.',
                    self::limite_legible(self::MAX_HTML_BYTES),
                    self::limite_legible(strlen($html))
                )
            );
        }

        $allowed = $this->allowed_html();
        $unsupported = $this->unsupported_tags($html, $allowed);
        if ($unsupported !== []) {
            return new WP_Error(
                'cod_canvas_html_tag',
                sprintf('El HTML contiene etiquetas no admitidas: %s.', implode(', ', $unsupported))
            );
        }

        $invalid_iframe = $this->first_invalid_iframe($html);
        if ($invalid_iframe !== null) {
            return new WP_Error(
                'cod_canvas_iframe_source',
                sprintf('El iframe referencia un origen no admitido: %s.', $invalid_iframe)
            );
        }

        $filter = static function (array $properties): array {
            return array_values(array_unique(array_merge($properties, self::EXTRA_STYLE_PROPERTIES)));
        };
        add_filter('safe_style_css', $filter);
        $clean = wp_kses($html, $allowed);
        remove_filter('safe_style_css', $filter);

        return $clean;
    }

    /**
     * El importador puede recibir un documento completo y GrapesJS conserva a
     * veces metadatos de `<head>` dentro de su wrapper `<body>`. Son conocidos,
     * no visuales y no deben transformarse en contenido de una página.
     */
    private function strip_document_metadata(string $html): string
    {
        $html = (string) preg_replace('/<\s*(?:base|meta|link)\b[^>]*\/?\s*>/i', '', $html);
        return (string) preg_replace('/<\s*title\b[^>]*>[\s\S]*?<\s*\/\s*title\s*>/i', '', $html);
    }

    /**
     * @return string|WP_Error CSS validado o el motivo del rechazo.
     */
    public function sanitize_css(string $css)
    {
        $css = $this->normalize($css);
        if (strlen($css) > self::MAX_CSS_BYTES) {
            return new WP_Error(
                'cod_canvas_css_size',
                sprintf(
                    'El CSS supera el límite de %s: el documento trae %s.',
                    self::limite_legible(self::MAX_CSS_BYTES),
                    self::limite_legible(strlen($css))
                )
            );
        }

        if (strpos($css, '<') !== false) {
            return new WP_Error('cod_canvas_css_markup', 'El CSS no puede contener el carácter "<".');
        }

        $lower = strtolower($css);
        $forbidden = [
            'javascript:' => 'esquemas javascript:',
            'vbscript:' => 'esquemas vbscript:',
            'expression(' => 'expression()',
            '@import' => '@import',
            '-moz-binding' => '-moz-binding',
            'data:text/html' => 'data:text/html',
        ];
        foreach ($forbidden as $needle => $label) {
            if (strpos($lower, $needle) !== false) {
                return new WP_Error('cod_canvas_css_forbidden', sprintf('El CSS no admite %s.', $label));
            }
        }
        if (preg_match('/(?:^|[;{])\s*behavior\s*:/i', $css) === 1) {
            return new WP_Error('cod_canvas_css_forbidden', 'El CSS no admite la propiedad behavior:.');
        }

        $invalid_url = $this->first_invalid_css_url($css);
        if ($invalid_url !== null) {
            return new WP_Error(
                'cod_canvas_css_url',
                sprintf('El CSS referencia un recurso no admitido: %s.', $invalid_url)
            );
        }

        return trim($css);
    }

    /**
     * @return string|WP_Error JSON canónico del projectData o el motivo del rechazo.
     */
    public function sanitize_project_data(string $json)
    {
        $json = trim($this->normalize($json));
        if ($json === '') {
            return wp_json_encode(new stdClass());
        }
        if (strlen($json) > self::MAX_PROJECT_BYTES) {
            return new WP_Error(
                'cod_canvas_project_size',
                sprintf(
                    'Los datos estructurados superan el límite de %s: traen %s.',
                    self::limite_legible(self::MAX_PROJECT_BYTES),
                    self::limite_legible(strlen($json))
                )
            );
        }

        $data = json_decode($json, true, self::MAX_PROJECT_DEPTH);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return new WP_Error(
                'cod_canvas_project_json',
                sprintf('Los datos estructurados no son JSON válido: %s.', json_last_error_msg())
            );
        }
        if (!is_array($data)) {
            return new WP_Error('cod_canvas_project_shape', 'Los datos estructurados deben ser un objeto JSON.');
        }
        if ($data !== [] && $this->is_list($data)) {
            return new WP_Error('cod_canvas_project_shape', 'Los datos estructurados deben ser un objeto JSON.');
        }
        if (isset($data['pages']) && (!is_array($data['pages']) || !$this->is_list($data['pages']))) {
            return new WP_Error('cod_canvas_project_pages', 'La colección pages debe ser una lista.');
        }

        $encoded = wp_json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded)) {
            return new WP_Error('cod_canvas_project_encode', 'No fue posible normalizar los datos estructurados.');
        }

        return $encoded;
    }

    /**
     * @param array<string, array<string, bool>> $allowed
     * @return list<string>
     */
    private function unsupported_tags(string $html, array $allowed): array
    {
        if (preg_match_all('/<\s*\/?\s*([a-z][a-z0-9:-]*)/i', $html, $matches) === false) {
            return [];
        }
        $used = array_unique(array_map('strtolower', $matches[1]));
        $unsupported = array_values(array_diff($used, array_keys($allowed)));
        sort($unsupported);

        return array_slice($unsupported, 0, 10);
    }

    private function first_invalid_css_url(string $css): ?string
    {
        if (preg_match_all('/url\(\s*([\'"]?)(.*?)\1\s*\)/is', $css, $matches) === false) {
            return null;
        }
        foreach ($matches[2] as $url) {
            $url = trim($url);
            if ($url === '' || $url[0] === '#') {
                continue;
            }
            if (preg_match('#^(https?:)?//#i', $url) === 1) {
                continue;
            }
            if (preg_match('#^data:image/(png|jpe?g|gif|webp|avif|svg\+xml);#i', $url) === 1) {
                continue;
            }
            if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $url) === 1) {
                return substr($url, 0, 80);
            }
        }

        return null;
    }

    private function first_invalid_iframe(string $html): ?string
    {
        if (preg_match_all('/<iframe\b([^>]*)>/i', $html, $matches) === false) {
            return 'iframe mal formado';
        }
        foreach ($matches[1] as $attributes) {
            // Un iframe SIN src no carga nada: muestra about:blank. Es el caso
            // del visor bajo demanda, que recibe su dirección recién cuando
            // alguien lo abre. Lo que sí se controla es esa dirección, que
            // viaja en data-cod-visor-src y se comprueba más abajo con la
            // misma vara que un src escrito a mano.
            if (preg_match('/\bsrc\s*=\s*([\'\"])(.*?)\1/i', $attributes, $source) === 1) {
                $error = $this->embed_origin_error(html_entity_decode(trim($source[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                if ($error !== null) {
                    return $error;
                }
            }
            if (preg_match('/\bdata-cod-visor-src\s*=\s*([\'\"])(.*?)\1/i', $attributes, $diferido) === 1) {
                $error = $this->embed_origin_error(html_entity_decode(trim($diferido[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                if ($error !== null) {
                    return $error;
                }
            }
        }

        // La dirección diferida puede estar en el contenedor del visor y no en
        // el iframe: el comportamiento visor-embed la lee del nodo que lleva
        // data-cod-behavior="visor-embed".
        if (preg_match_all('/data-cod-visor-src\s*=\s*([\'\"])(.*?)\1/i', $html, $diferidas) !== false) {
            foreach ($diferidas[2] as $cruda) {
                $error = $this->embed_origin_error(html_entity_decode(trim($cruda), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                if ($error !== null) {
                    return $error;
                }
            }
        }

        return null;
    }

    /**
     * Opción del sitio con los orígenes que este WordPress permite incrustar.
     *
     * Un nombre de host por línea, sin esquema ni ruta. Ver
     * COD_Settings_Admin, pestaña Configuración.
     */
    public const OPTION_EMBED_ORIGINS = 'cod_embed_origins';

    /**
     * Comprueba una dirección a incrustar. Devuelve null si es aceptable, o el
     * texto del error si no.
     *
     * Por qué existe una lista y no "cualquier dirección": un iframe muestra
     * una página ajena DENTRO de la tuya, con tu dominio en la barra. Si
     * cualquiera que edite un documento pudiera apuntarlo a donde quisiera, un
     * documento importado de afuera —una plantilla, un paquete de otro sitio—
     * podría traer un iframe a una página cualquiera y la persona que lo abre
     * no tendría cómo notarlo.
     *
     * Por qué tampoco alcanza la lista fija de YouTube, Vimeo y Google Maps:
     * deja afuera todo lo demás. Un recorrido 360, un plano interactivo, un
     * formulario de reservas o un visor de documentos son necesidades
     * corrientes de un sitio, y no hay razón para que el plugin decida por el
     * dueño del sitio cuáles valen.
     *
     * La salida es que el dueño del sitio lo declare: los tres de siempre
     * vienen permitidos, y cualquier otro origen se agrega a mano en
     * Configuración. Declararlo es un acto deliberado de alguien con permiso
     * de administración, que es exactamente la garantía que hacía falta.
     */
    private function embed_origin_error(string $url): ?string
    {
        // Una ruta del propio sitio no es un tercero: es este mismo
        // WordPress sirviendo algo suyo. No hay origen que declarar, porque
        // ya es el del dueño del sitio, y exigirle https:// obligaría a
        // escribir el dominio adentro del documento, que es justo lo que
        // rompe una mudanza de dominio.
        //
        // Se admite solo la ruta absoluta de una barra. «//otro.com/x» es
        // relativa al esquema y apunta afuera; «/\otro.com» lo mismo en
        // varios navegadores. Las dos quedan fuera a propósito.
        $barra_invertida = chr(92); // \ — varios navegadores la leen como /
        $ruta_propia = $url !== '' && $url[0] === '/'
            && !str_starts_with($url, '//')
            && !str_starts_with($url, '/' . $barra_invertida);
        if ($ruta_propia) {
            return null;
        }
        $parts = wp_parse_url($url);
        if (!is_array($parts) || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
            return substr($url, 0, 100);
        }
        $host = strtolower((string) ($parts['host'] ?? ''));
        $path = (string) ($parts['path'] ?? '');

        $conocidos =
            ($host === 'www.google.com' && str_starts_with($path, '/maps/embed')) ||
            (($host === 'www.youtube.com' || $host === 'youtube.com' || $host === 'www.youtube-nocookie.com') && str_starts_with($path, '/embed/')) ||
            ($host === 'player.vimeo.com' && str_starts_with($path, '/video/'));
        if ($conocidos) {
            return null;
        }

        return in_array($host, self::declared_embed_origins(), true)
            ? null
            : substr($url, 0, 100);
    }

    /**
     * Los hosts que el sitio declaró como incrustables.
     *
     * @return list<string>
     */
    public static function declared_embed_origins(): array
    {
        $crudo = (string) get_option(self::OPTION_EMBED_ORIGINS, '');
        if ($crudo === '') {
            return [];
        }
        $hosts = [];
        foreach (preg_split('/[\r\n,]+/', $crudo) ?: [] as $linea) {
            $host = self::normalize_embed_origin((string) $linea);
            if ($host !== '') {
                $hosts[] = $host;
            }
        }

        return array_values(array_unique($hosts));
    }

    /**
     * Acepta "ejemplo.com", "https://ejemplo.com/algo" o " EJEMPLO.com " y
     * devuelve siempre el host en minúsculas, o cadena vacía si no lo es.
     *
     * Se tolera que alguien pegue la dirección completa porque es lo que va a
     * hacer: copiar del navegador y pegar. Rechazarlo por traer "https://"
     * sería castigar lo obvio.
     */
    public static function normalize_embed_origin(string $linea): string
    {
        $texto = trim($linea);
        if ($texto === '') {
            return '';
        }
        if (str_contains($texto, '/') || str_contains($texto, ':')) {
            $partes = wp_parse_url(str_contains($texto, '//') ? $texto : 'https://' . $texto);
            $texto = is_array($partes) ? (string) ($partes['host'] ?? '') : '';
        }
        $texto = strtolower(trim($texto));

        return preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $texto) === 1 ? $texto : '';
    }

    /**
     * @return array<string, array<string, bool>>
     */
    private function allowed_html(): array
    {
        $allowed = wp_kses_allowed_html('post');
        // `select` se admite como marcado estructural inerte (sin `form`/`input` no puede enviarse nada);
        // `option` viaja con él para que los desplegables de filtro conserven su contenido.
        foreach (['script', 'style', 'object', 'embed', 'form', 'input', 'textarea'] as $blocked) {
            unset($allowed[$blocked]);
        }
        foreach (self::STRUCTURAL_TAGS as $tag) {
            if (!isset($allowed[$tag]) || !is_array($allowed[$tag])) {
                $allowed[$tag] = [];
            }
        }

        $global = [
            'id' => true,
            'class' => true,
            'style' => true,
            'title' => true,
            'lang' => true,
            'dir' => true,
            'role' => true,
            'hidden' => true,
            'data-*' => true,
            'aria-*' => true,
        ];
        foreach ($allowed as $tag => $attributes) {
            $allowed[$tag] = array_merge(is_array($attributes) ? $attributes : [], $global);
        }

        $specific = [
            'a' => ['href' => true, 'target' => true, 'rel' => true, 'download' => true],
            // fetchpriority le dice al navegador cuál imagen pedir primero. En un
            // banner a pantalla completa esa imagen ES la métrica LCP que mide
            // Google, así que poder marcarla como prioritaria no es cosmético.
            // Valor seguro: solo lo escribe quien edita el documento, y el
            // navegador ignora cualquier valor que no sea high/low/auto.
            'img' => ['src' => true, 'srcset' => true, 'sizes' => true, 'alt' => true, 'width' => true, 'height' => true, 'loading' => true, 'decoding' => true, 'fetchpriority' => true],
            'source' => ['src' => true, 'srcset' => true, 'sizes' => true, 'type' => true, 'media' => true],
            'video' => ['src' => true, 'poster' => true, 'controls' => true, 'loop' => true, 'muted' => true, 'autoplay' => true, 'playsinline' => true, 'preload' => true, 'width' => true, 'height' => true],
            'canvas' => ['width' => true, 'height' => true],
            'audio' => ['src' => true, 'controls' => true, 'loop' => true, 'muted' => true, 'preload' => true],
            // `allow` es la lista de permisos que el iframe le concede a lo que muestra:
            // pantalla completa, sensores, seguimiento espacial. Un recorrido 360 los
            // pide, y sin el atributo el navegador se los niega. No amplía a qué sitios
            // se puede apuntar —eso lo sigue decidiendo la lista de orígenes— sino qué
            // puede hacer el contenido ya admitido.
            'iframe' => ['src' => true, 'width' => true, 'height' => true, 'title' => true, 'loading' => true, 'allowfullscreen' => true, 'referrerpolicy' => true, 'sandbox' => true, 'allow' => true],
            'button' => ['type' => true, 'disabled' => true],
            'label' => ['for' => true],
            'svg' => ['viewbox' => true, 'xmlns' => true, 'fill' => true, 'stroke' => true, 'width' => true, 'height' => true, 'preserveaspectratio' => true],
            'path' => ['d' => true, 'fill' => true, 'fill-rule' => true, 'clip-rule' => true, 'stroke' => true, 'stroke-width' => true, 'stroke-linecap' => true, 'stroke-linejoin' => true],
            'circle' => ['cx' => true, 'cy' => true, 'r' => true, 'fill' => true, 'stroke' => true],
            'rect' => ['x' => true, 'y' => true, 'width' => true, 'height' => true, 'rx' => true, 'ry' => true, 'fill' => true, 'stroke' => true],
            'line' => ['x1' => true, 'y1' => true, 'x2' => true, 'y2' => true, 'stroke' => true],
            'polyline' => ['points' => true, 'fill' => true, 'stroke' => true],
            'polygon' => ['points' => true, 'fill' => true, 'stroke' => true],
            'g' => ['fill' => true, 'fill-rule' => true, 'clip-rule' => true, 'stroke' => true, 'transform' => true],
            'defs' => [],
            'symbol' => ['viewbox' => true, 'fill' => true],
            'use' => ['href' => true, 'xlink:href' => true, 'x' => true, 'y' => true, 'width' => true, 'height' => true, 'fill' => true, 'transform' => true],
            'text' => ['x' => true, 'y' => true, 'dx' => true, 'dy' => true, 'font-family' => true, 'font-weight' => true, 'font-size' => true, 'font-style' => true, 'fill' => true, 'text-anchor' => true, 'letter-spacing' => true, 'transform' => true],
            'tspan' => ['x' => true, 'y' => true, 'dx' => true, 'dy' => true, 'font-family' => true, 'font-weight' => true, 'font-size' => true, 'fill' => true, 'text-anchor' => true],
            'select' => ['name' => true, 'multiple' => true, 'disabled' => true],
            'option' => ['value' => true, 'selected' => true, 'disabled' => true],
        ];
        foreach ($specific as $tag => $attributes) {
            $allowed[$tag] = array_merge($allowed[$tag] ?? [], $attributes);
        }

        return $allowed;
    }

    /**
     * Equivalente a `array_is_list()`; el objetivo declarado es PHP 8.0.
     *
     * @param array<array-key, mixed> $value
     */
    private function is_list(array $value): bool
    {
        return $value === [] || array_keys($value) === range(0, count($value) - 1);
    }

    private function normalize(string $value): string
    {
        $value = str_replace(["\r\n", "\r"], "\n", $value);
        if (strncmp($value, "\xEF\xBB\xBF", 3) === 0) {
            $value = substr($value, 3);
        }

        return $value;
    }
}
