<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * El estado del SITIO que un `.ocdsite` lleva además de las páginas (docs/package-format-v1.md, §10):
 * lo que hace que un sitio armado en el local se vea igual cuando se sube a producción.
 *
 *  - ajustes: título y descripción, estructura de enlaces permanentes (y sus bases de categoría/etiqueta);
 *  - marca: ícono del sitio (`site_icon`), logo (`site_logo` y `custom_logo`), con su archivo y su sha256;
 *  - navegación: los menús de bloques (`wp_navigation`) y los menús clásicos con sus ubicaciones;
 *  - el set de íconos (`uploads/contope-iconos` + `cod_icono_estilo`) y las hojas de diseño generadas
 *    (`uploads/contope-disenos` + `cod_disenos_hojas`) que usan los documentos que viajan;
 *  - los destinos de las regiones locales (encabezado/pie por página, categoría o etiqueta).
 *
 * LA REGLA DE ORO: ningún número de WordPress viaja. Un menú que apunta a la página 12 no vale en el
 * destino, donde esa página es la 47. Todo lo que apunta a algo se escribe con una identidad portable
 * (tipo + slug, taxonomía + slug, ruta del archivo en uploads + sha256) y el importador la vuelve a
 * resolver contra el sitio de destino. Lo que no se puede resolver no se inventa: un enlace de menú
 * pasa a ser un enlace común con su URL (con aviso); el destino de una región que no existe rechaza el
 * paquete ANTES de escribir nada.
 *
 * Qué NO lleva y por qué (declarado, no olvidado):
 *  - `blog_public` (visibilidad en buscadores), `admin_email`, `siteurl`/`home`, zona horaria, idioma,
 *    formatos de fecha, comentarios, medios y usuarios: son decisiones DEL SITIO DE DESTINO (producción
 *    suele querer lo contrario del local: indexarse, otro correo, otra zona), no del diseño.
 *  - plantillas y partes de plantilla guardadas en la base (`wp_template`, `wp_template_part`) y los
 *    estilos globales del usuario (`wp_global_styles`): el aspecto lo gobierna el ADN (fase F2); un
 *    segundo canal de estilo en el paquete reabriría la puerta que F1 cerró.
 *  - `cod_theme_definitions` (colores, tipografías, ícono declarado por el tema): es la PROYECCIÓN del
 *    ADN; la trae el ADN, no este paquete.
 *
 * Idempotente y sin pisar: reimportar no duplica nada (menús y navegaciones se buscan por slug, los
 * archivos por ruta + sha256). Un ajuste del destino que alguien editó DESPUÉS de la última importación
 * no se pisa: el paquete entero se rechaza (`cod_package_settings_edited`) salvo el reemplazo expreso,
 * el mismo mecanismo de H9 (casilla de la pantalla, `--reemplazar-editadas`).
 */
final class COD_Site_Package_Sitio
{
    /** Option con lo que dejó la última importación: clave => sha256 del valor tal como quedó. */
    public const REGISTRO = 'cod_package_ajustes_importados';

    /** Ajustes de texto que viajan: clave en el paquete => [opción de WordPress, etiqueta, valores "de fábrica"]. */
    private const OPCIONES = [
        'blogname' => ['blogname', 'el título del sitio', ['', 'WordPress']],
        'blogdescription' => ['blogdescription', 'la descripción del sitio', ['', 'Just another WordPress site']],
        'permalinkStructure' => ['permalink_structure', 'la estructura de enlaces permanentes', ['']],
        'categoryBase' => ['category_base', 'la base de categorías', ['']],
        'tagBase' => ['tag_base', 'la base de etiquetas', ['']],
    ];

    private const MARCA = [
        'siteIcon' => ['site_icon', 'el ícono del sitio'],
        // custom_logo va ANTES que site_logo: WordPress copia el primero sobre el segundo al fijarlo
        'customLogo' => ['custom_logo', 'el logo del tema'],
        'siteLogo' => ['site_logo', 'el logo del sitio (bloque Logo)'],
    ];

    private const ESTILOS_DE_ICONO = ['', 'outlined', 'rounded', 'sharp'];

    // ==================================================================
    // EXPORTAR
    // ==================================================================

    /**
     * Las navegaciones de bloques publicadas: id => slug.
     *
     * @return array<int, string>
     */
    public static function navegaciones_por_id(): array
    {
        $salida = [];
        foreach (get_posts(['post_type' => 'wp_navigation', 'post_status' => 'publish', 'numberposts' => -1, 'orderby' => 'ID', 'order' => 'ASC', 'no_found_rows' => true]) as $p) {
            $salida[(int) $p->ID] = (string) $p->post_name;
        }
        return $salida;
    }

    /**
     * Lo que el sitio de origen tiene aparte de las páginas, en forma portable.
     *
     * @param array<string, array<string, mixed>> $documents los documentos que viajan (para saber qué hojas de diseño usan)
     * @param array<int, string> $avisos
     * @return array{estado: array<string, mixed>, medios: array<string, array{abs: string, attach: bool, grupo: string}>}
     */
    public static function capturar(array $documents, array &$avisos): array
    {
        $medios = [];

        $sitio = [];
        foreach (self::OPCIONES as $clave => [$opcion]) {
            $sitio[$clave] = (string) get_option($opcion, '');
        }

        $marca = [];
        foreach (self::MARCA as $clave => [$opcion, $etiqueta]) {
            $id = $clave === 'customLogo' ? (int) get_theme_mod('custom_logo', 0) : (int) get_option($opcion, 0);
            $marca[$clave] = self::medio_de_adjunto($id, $medios, $avisos, $etiqueta);
        }

        $navegaciones_por_id = self::navegaciones_por_id();
        $navegaciones = [];
        foreach (get_posts(['post_type' => 'wp_navigation', 'post_status' => 'publish', 'numberposts' => -1, 'orderby' => 'ID', 'order' => 'ASC', 'no_found_rows' => true]) as $p) {
            $navegaciones[] = [
                'slug' => (string) $p->post_name,
                'title' => (string) $p->post_title,
                'content' => self::contenido_a_portable((string) $p->post_content, $navegaciones_por_id, $avisos),
            ];
        }

        $menus = [];
        $slug_por_termino = [];
        foreach (wp_get_nav_menus() as $menu) {
            $slug_por_termino[(int) $menu->term_id] = (string) $menu->slug;
            $menus[] = self::menu_portable($menu, true, $avisos);
        }
        $ubicaciones = [];
        foreach (get_nav_menu_locations() as $ubicacion => $term_id) {
            if (isset($slug_por_termino[(int) $term_id]) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', (string) $ubicacion) === 1) {
                $ubicaciones[(string) $ubicacion] = $slug_por_termino[(int) $term_id];
            }
        }

        $iconos = self::capturar_iconos($medios);
        $hojas = self::capturar_hojas($documents, $medios);

        return [
            'estado' => [
                'site' => $sitio,
                'branding' => $marca,
                'navigation' => $navegaciones,
                'menus' => $menus,
                'menuLocations' => $ubicaciones,
                'iconSet' => $iconos,
                'designSheets' => $hojas,
            ],
            'medios' => $medios,
        ];
    }

    /**
     * Pone los destinos de las regiones en forma portable. Un destino por número (`post 12`) se vuelve
     * `{type: post, ref: {postType: page, slug: contactos}}`; el número NO viaja.
     *
     * @param array<string, array<string, mixed>> $documents
     * @param array<int, string> $avisos
     * @return array<string, array<string, mixed>>
     */
    public static function documentos_portables(array $documents, array &$avisos): array
    {
        foreach ($documents as $id => $documento) {
            foreach (['regionTargets', 'regionExcludes'] as $campo) {
                if (is_array($documento[$campo] ?? null) && $documento[$campo] !== []) {
                    $documents[$id][$campo] = self::reglas_portables($documento[$campo], (string) $id, $avisos);
                }
            }
        }
        return $documents;
    }

    /**
     * @param array<int, mixed> $reglas
     * @param array<int, string> $avisos
     * @return array<int, mixed>
     */
    private static function reglas_portables(array $reglas, string $documento, array &$avisos): array
    {
        $salida = [];
        foreach ($reglas as $regla) {
            if (!is_array($regla) || !isset($regla['id'])) {
                $salida[] = $regla;
                continue;
            }
            $tipo = (string) ($regla['type'] ?? '');
            $id = (int) $regla['id'];
            $ref = null;
            if ($tipo === COD_Canvas_Document_Repository::MATCH_TYPE_POST || $tipo === COD_Canvas_Document_Repository::MATCH_TYPE_CHILDREN_OF) {
                $p = get_post($id);
                if ($p instanceof WP_Post) {
                    $ref = ['postType' => (string) $p->post_type, 'slug' => (string) $p->post_name];
                }
            } else {
                $taxonomia = $tipo === COD_Canvas_Document_Repository::MATCH_TYPE_TAG ? 'post_tag' : 'category';
                $t = get_term($id, $taxonomia);
                if ($t instanceof WP_Term) {
                    $ref = ['taxonomy' => $taxonomia, 'slug' => (string) $t->slug];
                }
            }
            if ($ref === null) {
                $avisos[] = 'La región «' . $documento . '» apunta a un destino por número (' . $tipo . ' ' . $id . ') que ya no existe en este sitio; viaja con ese número y puede no servir en el destino.';
                $salida[] = $regla;
                continue;
            }
            $salida[] = ['type' => $tipo, 'ref' => $ref];
        }
        return $salida;
    }

    /**
     * @param array<string, array{abs: string, attach: bool, grupo: string}> $medios
     * @param array<int, string> $avisos
     * @return array{path: string, sha256: string}|null
     */
    private static function medio_de_adjunto(int $id, array &$medios, array &$avisos, string $etiqueta): ?array
    {
        if ($id <= 0) {
            return null;
        }
        $relativa = (string) get_post_meta($id, '_wp_attached_file', true);
        $upload = wp_get_upload_dir();
        $absoluta = untrailingslashit((string) $upload['basedir']) . '/' . $relativa;
        if ($relativa === '' || !COD_Site_Package_Format::ruta_de_medio_segura($relativa) || !is_file($absoluta)) {
            $avisos[] = 'No se pudo llevar ' . $etiqueta . ': su archivo (' . ($relativa !== '' ? $relativa : 'sin ruta') . ') no está en este sitio.';
            return null;
        }
        $medios[$relativa] = ['abs' => $absoluta, 'attach' => true, 'grupo' => 'marca'];
        return ['path' => $relativa, 'sha256' => (string) hash_file('sha256', $absoluta)];
    }

    /**
     * @param array<string, array{abs: string, attach: bool, grupo: string}> $medios
     * @return array{style: string, files: int}
     */
    private static function capturar_iconos(array &$medios): array
    {
        $estilo = class_exists('COD_Icono') ? (string) get_option(COD_Icono::OPTION_KEY, '') : '';
        $carpeta = trailingslashit((string) wp_get_upload_dir()['basedir']) . (class_exists('COD_Icono') ? COD_Icono::CARPETA : 'contope-iconos');
        $cuenta = 0;
        if (is_dir($carpeta)) {
            // los dibujos (.svg) y lo que la acompaña en esa carpeta (la tipografía de símbolos, .woff2)
            foreach (glob($carpeta . '/*') ?: [] as $archivo) {
                $nombre = basename($archivo);
                if (is_file($archivo) && preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:svg|woff2?|ttf|otf|json|css)$/', $nombre) === 1) {
                    $medios['contope-iconos/' . $nombre] = ['abs' => $archivo, 'attach' => false, 'grupo' => 'iconos'];
                    ++$cuenta;
                }
            }
        }
        return ['style' => in_array($estilo, self::ESTILOS_DE_ICONO, true) ? $estilo : '', 'files' => $cuenta];
    }

    /**
     * Las hojas generadas de los diseños que usan los documentos que viajan.
     *
     * @param array<string, array<string, mixed>> $documents
     * @param array<string, array{abs: string, attach: bool, grupo: string}> $medios
     * @return array<string, array{archivo: string, sello: string}>
     */
    private static function capturar_hojas(array $documents, array &$medios): array
    {
        if (!class_exists('COD_Diseno_Hoja')) {
            return [];
        }
        $registro = get_option(COD_Diseno_Hoja::OPTION_KEY, []);
        $registro = is_array($registro) ? $registro : [];
        $carpeta = trailingslashit((string) wp_get_upload_dir()['basedir']) . COD_Diseno_Hoja::CARPETA;
        $hojas = [];
        foreach ($documents as $documento) {
            $composicion = json_decode((string) ($documento['composition'] ?? ''), true);
            $diseno = is_array($composicion) ? (string) ($composicion['design']['designId'] ?? '') : '';
            if ($diseno === '' || isset($hojas[$diseno]) || !isset($registro[$diseno]['archivo'])) {
                continue;
            }
            $archivo = (string) $registro[$diseno]['archivo'];
            if (preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.css$/', $archivo) !== 1 || !is_file($carpeta . '/' . $archivo)) {
                continue;
            }
            $medios[COD_Diseno_Hoja::CARPETA . '/' . $archivo] = ['abs' => $carpeta . '/' . $archivo, 'attach' => false, 'grupo' => 'disenos'];
            $hojas[$diseno] = ['archivo' => $archivo, 'sello' => (string) ($registro[$diseno]['sello'] ?? '')];
        }
        return $hojas;
    }

    // ==================================================================
    // Menús clásicos (forma portable, la MISMA para exportar y para comparar con el destino)
    // ==================================================================

    /**
     * @param array<int, string> $avisos
     * @return array{slug: string, name: string, items: array<int, array<string, mixed>>}
     */
    public static function menu_portable(WP_Term $menu, bool $con_respaldo, array &$avisos): array
    {
        $items = wp_get_nav_menu_items($menu->term_id, ['post_status' => 'publish']);
        $items = is_array($items) ? array_values($items) : [];
        $clave_por_id = [];
        foreach ($items as $i => $it) {
            $clave_por_id[(int) $it->ID] = 'i' . ($i + 1);
        }
        $salida = [];
        foreach ($items as $i => $it) {
            $tipo = (string) $it->type;
            $objeto = (string) $it->object;
            $ref = null;
            if ($tipo === 'post_type') {
                $p = get_post((int) $it->object_id);
                if ($p instanceof WP_Post && $p->post_status === 'publish') {
                    $ref = ['postType' => (string) $p->post_type, 'slug' => (string) $p->post_name];
                }
            } elseif ($tipo === 'taxonomy') {
                $t = get_term((int) $it->object_id, $objeto);
                if ($t instanceof WP_Term) {
                    $ref = ['taxonomy' => (string) $t->taxonomy, 'slug' => (string) $t->slug];
                }
            }
            $url = '';
            if (($tipo === 'post_type' || $tipo === 'taxonomy') && $ref === null) {
                // el destino del enlace ya no existe: queda como enlace común, con lo que tenía
                $tipo = 'custom';
                $objeto = 'custom';
                $url = (string) $it->url;
                $avisos[] = 'El menú «' . $menu->slug . '» tiene un enlace («' . (string) $it->title . '») a un contenido que ya no existe; viaja como enlace común.';
            } elseif ($tipo === 'custom') {
                $url = (string) $it->url;
            }
            $padre = (int) $it->menu_item_parent;
            $clases = array_values(array_filter(array_map('strval', (array) $it->classes), static function (string $c): bool {
                return $c !== '';
            }));
            $entrada = [
                'key' => 'i' . ($i + 1),
                'parent' => $padre > 0 && isset($clave_por_id[$padre]) ? $clave_por_id[$padre] : null,
                'title' => (string) $it->title,
                'type' => $tipo,
                'object' => $objeto,
                'ref' => $ref,
                'url' => $url,
                'target' => (string) $it->target,
                'attrTitle' => (string) $it->attr_title,
                'description' => (string) $it->description,
                'classes' => $clases,
                'xfn' => (string) $it->xfn,
            ];
            if ($con_respaldo && $ref !== null) {
                // para el destino que no tenga el contenido: el enlace como era (no entra en las comparaciones)
                $entrada['fallback'] = (string) $it->url;
            }
            $salida[] = $entrada;
        }
        return ['slug' => (string) $menu->slug, 'name' => (string) $menu->name, 'items' => $salida];
    }

    // ==================================================================
    // Enlaces dentro de bloques (navegación y páginas): id numérico <-> identidad portable
    // ==================================================================

    /**
     * Cambia, en el contenido de bloques, los números de WordPress por su identidad portable:
     * `navigation-link`/`navigation-submenu` (`id` -> `ocdRef`) y `navigation` (`ref` -> `ocdNavRef`).
     * Mantiene la posición de cada atributo y no toca ningún bloque que no necesite el cambio.
     *
     * @param array<int, string> $nav_slug_por_id
     * @param array<int, string> $avisos
     */
    public static function contenido_a_portable(string $contenido, array $nav_slug_por_id, array &$avisos): string
    {
        if (strpos($contenido, '<!-- wp:navigation') === false) {
            return $contenido;
        }
        $contenido = self::mapear_comentarios($contenido, 'navigation-link|navigation-submenu', static function (array $a): ?array {
            if (!isset($a['id']) || !is_numeric($a['id'])) {
                return null;
            }
            $id = (int) $a['id'];
            $kind = (string) ($a['kind'] ?? '');
            $tipo = (string) ($a['type'] ?? '');
            $ref = null;
            if ($kind === 'taxonomy') {
                $t = get_term($id, $tipo);
                if ($t instanceof WP_Term) {
                    $ref = ['taxonomy' => (string) $t->taxonomy, 'slug' => (string) $t->slug];
                }
            } elseif ($kind === 'post-type' || $kind === '') {
                $p = get_post($id);
                if ($p instanceof WP_Post && $p->post_status === 'publish') {
                    $ref = ['postType' => (string) $p->post_type, 'slug' => (string) $p->post_name];
                }
            }
            return $ref === null ? null : self::reemplazar_clave($a, 'id', 'ocdRef', $ref);
        });
        return self::mapear_comentarios($contenido, 'navigation', static function (array $a) use ($nav_slug_por_id, &$avisos): ?array {
            if (!isset($a['ref']) || !is_numeric($a['ref'])) {
                return null;
            }
            $slug = $nav_slug_por_id[(int) $a['ref']] ?? null;
            if ($slug === null) {
                $avisos[] = 'Un bloque de navegación apunta a la navegación ' . (int) $a['ref'] . ', que no se exporta (no está publicada); viaja con ese número.';
                return null;
            }
            return self::reemplazar_clave($a, 'ref', 'ocdNavRef', $slug);
        });
    }

    /**
     * Lo contrario: cada identidad portable vuelve a ser el número de ESTE sitio. Lo que no se puede
     * resolver no se inventa: un enlace pasa a ser un enlace común (conserva su URL) y una navegación sin
     * resolver pierde su `ref`.
     *
     * @param array<string, int> $por_slug_paginas slug => id de las páginas que este import escribió
     * @param array<string, int> $nav_id_por_slug slug => id de las navegaciones de este sitio
     * @param array<int, string> $avisos
     * @param bool $conservar_pendientes true = lo que aún no se puede resolver queda como estaba (la revisión
     *     previa a escribir: la navegación todavía no existe); false = se degrada como se explicó arriba
     */
    public static function contenido_a_destino(string $contenido, array $por_slug_paginas, array $nav_id_por_slug, array &$avisos, bool $conservar_pendientes = false): string
    {
        if (strpos($contenido, 'ocdRef') === false && strpos($contenido, 'ocdNavRef') === false) {
            return $contenido;
        }
        $contenido = self::mapear_comentarios($contenido, 'navigation-link|navigation-submenu', static function (array $a) use ($por_slug_paginas, $conservar_pendientes, &$avisos): ?array {
            if (!array_key_exists('ocdRef', $a)) {
                return null;
            }
            $id = is_array($a['ocdRef']) ? self::resolver_ref($a['ocdRef'], $por_slug_paginas) : null;
            if ($id !== null) {
                return self::reemplazar_clave($a, 'ocdRef', 'id', $id);
            }
            if ($conservar_pendientes) {
                return null;
            }
            $avisos[] = 'Un enlace de navegación («' . (string) ($a['label'] ?? '') . '») apunta a un contenido que este sitio no tiene; queda como enlace común.';
            unset($a['ocdRef'], $a['id'], $a['type']);
            $a['kind'] = 'custom';
            return $a;
        });
        return self::mapear_comentarios($contenido, 'navigation', static function (array $a) use ($nav_id_por_slug, $conservar_pendientes, &$avisos): ?array {
            if (!array_key_exists('ocdNavRef', $a)) {
                return null;
            }
            $id = $nav_id_por_slug[(string) $a['ocdNavRef']] ?? null;
            if ($id !== null) {
                return self::reemplazar_clave($a, 'ocdNavRef', 'ref', $id);
            }
            if ($conservar_pendientes) {
                return null;
            }
            $avisos[] = 'Un bloque de navegación apunta a «' . (string) $a['ocdNavRef'] . '», que este sitio no tiene; queda sin navegación asignada.';
            unset($a['ocdNavRef']);
            return $a;
        });
    }

    /**
     * @param callable(array<string, mixed>): ?array<string, mixed> $fn devuelve los atributos nuevos o null (no tocar)
     */
    private static function mapear_comentarios(string $contenido, string $nombres, callable $fn): string
    {
        $resultado = preg_replace_callback('#<!--\s+wp:(' . $nombres . ')\s+(\{.*?\})\s*(/?)-->#s', static function (array $m) use ($fn): string {
            $atributos = json_decode($m[2], true);
            if (!is_array($atributos)) {
                return $m[0];
            }
            $nuevos = $fn($atributos);
            if ($nuevos === null) {
                return $m[0];
            }
            return '<!-- wp:' . $m[1] . ' ' . self::serializar_atributos($nuevos) . ' ' . $m[3] . '-->';
        }, $contenido);
        return is_string($resultado) ? $resultado : $contenido;
    }

    /**
     * @param array<string, mixed> $atributos
     * @param mixed $valor
     * @return array<string, mixed>
     */
    private static function reemplazar_clave(array $atributos, string $vieja, string $nueva, $valor): array
    {
        $salida = [];
        foreach ($atributos as $k => $v) {
            if ($k === $vieja) {
                $salida[$nueva] = $valor;
            } elseif ($k !== $nueva) {
                $salida[$k] = $v;
            }
        }
        return $salida;
    }

    /** @param array<string, mixed> $atributos */
    private static function serializar_atributos(array $atributos): string
    {
        if (function_exists('serialize_block_attributes')) {
            return serialize_block_attributes($atributos);
        }
        $json = (string) wp_json_encode($atributos, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return str_replace(['--', '<', '>', '&', '\\"'], ['\\u002d\\u002d', '\\u003c', '\\u003e', '\\u0026', '\\u0022'], $json);
    }

    // ==================================================================
    // IMPORTAR: revisar (no escribe nada)
    // ==================================================================

    /**
     * Valida y decide, ANTES de escribir, qué haría el import con el estado del sitio.
     *
     * @param array<string, mixed>|null $estado lo que trae `wordpress/state.json` (null en paquetes sin esa parte)
     * @param array<int, array<string, mixed>> $paginas las páginas del paquete (ya normalizadas)
     * @param array<string, array<string, mixed>> $documentos los documentos del paquete ya preparados (con sus reglas de región)
     * @param array<int, array<string, mixed>> $medios los medios del plan (`path`, `sha256`, `asset`)
     * @return array<string, mixed>|WP_Error
     */
    public static function revisar(?array $estado, array $paginas, array $documentos, array $medios, string $source_url, string $target_url, bool $reemplazar)
    {
        $slugs_paginas = [];
        foreach ($paginas as $p) {
            $slugs_paginas[(string) $p['slug']] = true;
        }
        $avisos = [];

        // ---- los destinos de las regiones: los números de WordPress no viajan, se resuelven aquí
        $reglas = [];
        foreach ($documentos as $document_id => $d) {
            if ((string) $d['regionKind'] === '') {
                continue;
            }
            foreach (['regionTargets', 'regionExcludes'] as $campo) {
                foreach ((array) $d[$campo] as $regla) {
                    if (!is_array($regla)) {
                        return new WP_Error('cod_package_region_rule_shape', 'La región «' . $document_id . '» trae una regla que no tiene la forma esperada. No se escribió nada.');
                    }
                    if (isset($regla['ref'])) {
                        if (!is_array($regla['ref']) || self::existe_ref($regla['ref'], $slugs_paginas) === false) {
                            return new WP_Error('cod_package_region_target_unresolved', 'La región «' . $document_id . '» apunta a un destino («' . self::describir_ref($regla['ref']) . '») que ni el paquete ni este sitio tienen. No se escribió nada.');
                        }
                    } elseif (isset($regla['id'])) {
                        $avisos[] = 'La región «' . $document_id . '» trae un destino por número (' . (string) ($regla['type'] ?? '?') . ' ' . (int) $regla['id'] . ') de un paquete anterior; ese número es del sitio de origen y puede no ser el mismo aquí.';
                    }
                }
            }
            $reglas[(string) $document_id] = ['targets' => (array) $d['regionTargets'], 'excludes' => (array) $d['regionExcludes']];
        }

        if ($estado === null || !isset($estado['site'])) {
            return ['ajustes' => [], 'navegaciones' => [], 'menus' => [], 'hojas' => [], 'reglas' => $reglas, 'avisos' => $avisos, 'permalinks' => false];
        }

        $valido = self::validar_estado($estado);
        if (is_wp_error($valido)) {
            return $valido;
        }
        $rutas_de_medios = [];
        foreach ($medios as $m) {
            $rutas_de_medios[(string) $m['path']] = true;
        }

        $registro = get_option(self::REGISTRO, []);
        $registro = is_array($registro) ? $registro : [];
        $conflictos = [];
        $decidir = static function (string $clave, string $etiqueta, string $actual, string $nuevo, bool $de_fabrica) use ($registro, $reemplazar, &$conflictos): string {
            if (hash_equals($actual, $nuevo)) {
                return 'igual';
            }
            $sin_tocar = isset($registro[$clave]) && is_string($registro[$clave]) && hash_equals($registro[$clave], hash('sha256', $actual));
            if ($sin_tocar && isset($registro[$clave . '#paquete']) && is_string($registro[$clave . '#paquete']) && hash_equals($registro[$clave . '#paquete'], hash('sha256', $nuevo))) {
                return 'igual'; // el mismo paquete de la última vez sobre lo que dejó: nada que rehacer
            }
            if ($de_fabrica) {
                return 'poner';
            }
            if ($sin_tocar) {
                return 'poner'; // nadie lo tocó desde la última importación
            }
            if ($reemplazar) {
                return 'reemplazar';
            }
            $conflictos[] = $etiqueta;
            return 'conflicto';
        };

        $ajustes = [];
        foreach (self::OPCIONES as $clave => [$opcion, $etiqueta, $de_fabrica]) {
            $nuevo = (string) $valido['site'][$clave];
            $actual = (string) get_option($opcion, '');
            $ajustes[] = [
                'clave' => 'opt:' . $opcion, 'tipo' => 'opcion', 'opcion' => $opcion, 'nuevo' => $nuevo,
                'accion' => $decidir('opt:' . $opcion, $etiqueta, $actual, $nuevo, in_array($actual, self::de_fabrica($opcion, $de_fabrica), true)),
            ];
        }
        if ($valido['iconSet'] !== null) {
            $actual = (string) get_option('cod_icono_estilo', '');
            $nuevo = (string) $valido['iconSet']['style'];
            $ajustes[] = [
                'clave' => 'opt:cod_icono_estilo', 'tipo' => 'opcion', 'opcion' => 'cod_icono_estilo', 'nuevo' => $nuevo,
                'accion' => $decidir('opt:cod_icono_estilo', 'el estilo de los íconos', $actual, $nuevo, in_array($actual, ['', 'outlined'], true)),
            ];
        }
        foreach (self::MARCA as $clave => [$opcion, $etiqueta]) {
            $ref = $valido['branding'][$clave];
            if ($ref === null) {
                continue; // el paquete no define ese elemento de marca: el del destino se conserva
            }
            if (!isset($rutas_de_medios[$ref['path']]) && !is_file(untrailingslashit((string) wp_get_upload_dir()['basedir']) . '/' . $ref['path'])) {
                $avisos[] = 'No se pudo fijar ' . $etiqueta . ': el paquete no trae su archivo (' . $ref['path'] . ') y este sitio no lo tiene.';
                continue;
            }
            $actual = self::sha_del_adjunto($clave === 'customLogo' ? (int) get_theme_mod('custom_logo', 0) : (int) get_option($opcion, 0));
            $ajustes[] = [
                'clave' => 'media:' . $opcion, 'tipo' => 'medio', 'destino' => $opcion, 'ruta' => $ref['path'], 'nuevo' => $ref['sha256'],
                'accion' => $decidir('media:' . $opcion, $etiqueta, $actual, $ref['sha256'], $actual === ''),
            ];
        }

        // ---- navegaciones de bloques
        $navegaciones = [];
        $nav_slugs = [];
        $nav_por_id = self::navegaciones_por_id();
        foreach ($valido['navigation'] as $n) {
            $nav_slugs[$n['slug']] = true;
            $contenido = self::reescribir_urls($n['content'], $source_url, $target_url);
            $existente = self::buscar_navegacion($n['slug']);
            $accion = 'poner';
            if ($existente !== null) {
                $avisos_ignorados = [];
                $actual = self::huella_navegacion((string) $existente->post_title, self::contenido_a_portable((string) $existente->post_content, $nav_por_id, $avisos_ignorados));
                $accion = $decidir('nav:' . $n['slug'], 'la navegación «' . $n['slug'] . '»', $actual, self::huella_navegacion($n['title'], $contenido), false);
            }
            $navegaciones[] = ['slug' => $n['slug'], 'title' => $n['title'], 'content' => $contenido, 'accion' => $accion];
        }

        // ---- menús clásicos
        $menus = [];
        $menu_slugs = [];
        foreach ($valido['menus'] as $m) {
            $menu_slugs[$m['slug']] = true;
            foreach ($m['items'] as &$item) {
                $item['url'] = self::reescribir_urls((string) $item['url'], $source_url, $target_url);
                if (isset($item['fallback'])) {
                    $item['fallback'] = self::reescribir_urls((string) $item['fallback'], $source_url, $target_url);
                }
            }
            unset($item);
            $existente = get_term_by('slug', $m['slug'], 'nav_menu');
            $accion = 'poner';
            if ($existente instanceof WP_Term) {
                $sin_avisos = [];
                $actual = self::huella_menu(self::menu_portable($existente, false, $sin_avisos));
                $accion = $decidir('menu:' . $m['slug'], 'el menú «' . $m['slug'] . '»', $actual, self::huella_menu($m), false);
            }
            foreach ($m['items'] as $item) {
                if ($item['ref'] !== null && self::existe_ref($item['ref'], $slugs_paginas) === false) {
                    $avisos[] = 'El menú «' . $m['slug'] . '» tiene un enlace («' . $item['title'] . '») a un contenido que este sitio no tiene; queda como enlace común.';
                }
            }
            $menus[] = $m + ['accion' => $accion];
        }

        foreach ($valido['menuLocations'] as $ubicacion => $slug) {
            if (!isset($menu_slugs[$slug]) && !(get_term_by('slug', $slug, 'nav_menu') instanceof WP_Term)) {
                $avisos[] = 'La ubicación de menú «' . $ubicacion . '» apunta al menú «' . $slug . '», que ni el paquete ni este sitio tienen; se omite.';
                continue;
            }
            $actual = '';
            $locs = get_nav_menu_locations();
            if (isset($locs[$ubicacion])) {
                $t = get_term((int) $locs[$ubicacion], 'nav_menu');
                $actual = $t instanceof WP_Term ? (string) $t->slug : '';
            }
            $ajustes[] = [
                'clave' => 'loc:' . $ubicacion, 'tipo' => 'ubicacion', 'ubicacion' => $ubicacion, 'menu' => $slug, 'nuevo' => $slug,
                'accion' => $decidir('loc:' . $ubicacion, 'la ubicación de menú «' . $ubicacion . '»', $actual, $slug, $actual === ''),
            ];
        }

        if ($conflictos !== []) {
            return new WP_Error(
                'cod_package_settings_edited',
                'El paquete se rechazó y no se escribió nada: este sitio tiene valores propios, distintos de los del paquete y editados después de la última importación, en ' . implode(', ', array_values(array_unique($conflictos))) . '. Si el paquete debe reemplazarlos, importa de nuevo marcando «reemplazar lo que se editó en este sitio».',
                ['conflictos' => array_values(array_unique($conflictos))]
            );
        }

        $permalinks = false;
        foreach ($ajustes as $a) {
            if (in_array($a['clave'], ['opt:permalink_structure', 'opt:category_base', 'opt:tag_base'], true) && $a['accion'] !== 'igual') {
                $permalinks = true;
            }
        }
        return ['ajustes' => $ajustes, 'navegaciones' => $navegaciones, 'menus' => $menus, 'hojas' => $valido['designSheets'], 'reglas' => $reglas, 'avisos' => $avisos, 'permalinks' => $permalinks];
    }

    /**
     * @param array<int, string> $de_fabrica
     * @return array<int, string>
     */
    private static function de_fabrica(string $opcion, array $de_fabrica): array
    {
        if ($opcion === 'blogdescription') {
            $de_fabrica[] = __('Just another WordPress site');
        }
        return $de_fabrica;
    }

    /**
     * Valida (y normaliza) lo que trae `state.json`: es entrada de un archivo ajeno, nada se da por bueno.
     *
     * @param array<string, mixed> $estado
     * @return array<string, mixed>|WP_Error
     */
    private static function validar_estado(array $estado)
    {
        $forma = static function (string $donde): WP_Error {
            return new WP_Error('cod_package_site_shape', 'El estado del sitio del paquete (' . $donde . ') no tiene la forma esperada. No se escribió nada.');
        };

        if (!is_array($estado['site'])) {
            return $forma('site');
        }
        $sitio = [];
        foreach (self::OPCIONES as $clave => $_) {
            $v = $estado['site'][$clave] ?? '';
            if (!is_string($v) || strlen($v) > 1000 || ($clave !== 'blogname' && $clave !== 'blogdescription' && preg_match('#^[A-Za-z0-9%/_.\-]*$#D', $v) !== 1)) {
                return $forma('site.' . $clave);
            }
            $sitio[$clave] = $v;
        }

        $marca = [];
        $b = is_array($estado['branding'] ?? null) ? $estado['branding'] : [];
        foreach (self::MARCA as $clave => $_) {
            $ref = $b[$clave] ?? null;
            if ($ref === null) {
                $marca[$clave] = null;
                continue;
            }
            if (!is_array($ref) || !is_string($ref['path'] ?? null) || !COD_Site_Package_Format::ruta_de_medio_segura($ref['path']) || !is_string($ref['sha256'] ?? null) || preg_match('#^[a-f0-9]{64}$#D', $ref['sha256']) !== 1) {
                return $forma('branding.' . $clave);
            }
            $marca[$clave] = ['path' => $ref['path'], 'sha256' => $ref['sha256']];
        }

        $navegaciones = [];
        foreach (is_array($estado['navigation'] ?? null) ? $estado['navigation'] : [] as $i => $n) {
            if (!is_array($n) || !is_string($n['slug'] ?? null) || sanitize_title($n['slug']) !== $n['slug'] || $n['slug'] === '' || !is_string($n['content'] ?? null) || !is_string($n['title'] ?? '')) {
                return $forma('navigation[' . $i . ']');
            }
            $navegaciones[] = ['slug' => $n['slug'], 'title' => sanitize_text_field((string) ($n['title'] ?? '')), 'content' => $n['content']];
        }

        $menus = [];
        foreach (is_array($estado['menus'] ?? null) ? $estado['menus'] : [] as $i => $m) {
            if (!is_array($m) || !is_string($m['slug'] ?? null) || sanitize_title($m['slug']) !== $m['slug'] || $m['slug'] === '' || !is_string($m['name'] ?? null) || !is_array($m['items'] ?? null)) {
                return $forma('menus[' . $i . ']');
            }
            $items = [];
            $claves = [];
            foreach ($m['items'] as $j => $it) {
                $e = self::validar_item($it, $claves);
                if ($e === null) {
                    return $forma('menus[' . $i . '].items[' . $j . ']');
                }
                $claves[$e['key']] = true;
                $items[] = $e;
            }
            $menus[] = ['slug' => $m['slug'], 'name' => sanitize_text_field($m['name']), 'items' => $items];
        }

        $ubicaciones = [];
        foreach (is_array($estado['menuLocations'] ?? null) ? $estado['menuLocations'] : [] as $ubicacion => $slug) {
            if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', (string) $ubicacion) !== 1 || !is_string($slug) || sanitize_title($slug) !== $slug) {
                return $forma('menuLocations');
            }
            $ubicaciones[(string) $ubicacion] = $slug;
        }

        $iconos = null;
        if (is_array($estado['iconSet'] ?? null)) {
            if (!in_array($estado['iconSet']['style'] ?? '', self::ESTILOS_DE_ICONO, true)) {
                return $forma('iconSet.style');
            }
            $iconos = ['style' => (string) $estado['iconSet']['style']];
        }

        $hojas = [];
        foreach (is_array($estado['designSheets'] ?? null) ? $estado['designSheets'] : [] as $diseno => $h) {
            if (preg_match('/^[a-z0-9_-]{1,64}$/i', (string) $diseno) !== 1 || !is_array($h) || !is_string($h['archivo'] ?? null) || preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.css$/', $h['archivo']) !== 1 || !is_string($h['sello'] ?? '') || strlen((string) ($h['sello'] ?? '')) > 64) {
                return $forma('designSheets');
            }
            $hojas[(string) $diseno] = ['archivo' => $h['archivo'], 'sello' => (string) ($h['sello'] ?? '')];
        }

        return ['site' => $sitio, 'branding' => $marca, 'navigation' => $navegaciones, 'menus' => $menus, 'menuLocations' => $ubicaciones, 'iconSet' => $iconos, 'designSheets' => $hojas];
    }

    /**
     * @param mixed $it
     * @param array<string, bool> $claves_previas
     * @return array<string, mixed>|null
     */
    private static function validar_item($it, array $claves_previas): ?array
    {
        if (!is_array($it) || !is_string($it['key'] ?? null) || preg_match('/^i[0-9]{1,6}$/', $it['key']) !== 1 || isset($claves_previas[$it['key']])) {
            return null;
        }
        $tipo = $it['type'] ?? '';
        if (!in_array($tipo, ['custom', 'post_type', 'taxonomy', 'post_type_archive'], true)) {
            return null;
        }
        $padre = $it['parent'] ?? null;
        if ($padre !== null && (!is_string($padre) || !isset($claves_previas[$padre]))) {
            return null; // el padre va antes que sus hijos
        }
        foreach (['title', 'object', 'url', 'target', 'attrTitle', 'description', 'xfn'] as $k) {
            if (!is_string($it[$k] ?? '') || strlen((string) ($it[$k] ?? '')) > 4000) {
                return null;
            }
        }
        $ref = $it['ref'] ?? null;
        if ($ref !== null) {
            if (!is_array($ref) || !is_string($ref['slug'] ?? null) || (!is_string($ref['postType'] ?? null) && !is_string($ref['taxonomy'] ?? null))) {
                return null;
            }
            $ref = isset($ref['postType']) ? ['postType' => (string) $ref['postType'], 'slug' => (string) $ref['slug']] : ['taxonomy' => (string) $ref['taxonomy'], 'slug' => (string) $ref['slug']];
        } elseif ($tipo === 'post_type' || $tipo === 'taxonomy') {
            return null;
        }
        $clases = [];
        foreach (is_array($it['classes'] ?? null) ? $it['classes'] : [] as $c) {
            if (!is_string($c) || preg_match('/^[A-Za-z0-9_ :\/.\-]{1,100}$/', $c) !== 1) {
                return null;
            }
            $clases[] = $c;
        }
        $salida = [
            'key' => $it['key'], 'parent' => $padre, 'title' => sanitize_text_field((string) ($it['title'] ?? '')), 'type' => $tipo,
            'object' => preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($it['object'] ?? '')) ?? '', 'ref' => $ref, 'url' => (string) ($it['url'] ?? ''),
            'target' => in_array($it['target'] ?? '', ['', '_blank'], true) ? (string) ($it['target'] ?? '') : '',
            'attrTitle' => sanitize_text_field((string) ($it['attrTitle'] ?? '')), 'description' => sanitize_textarea_field((string) ($it['description'] ?? '')),
            'classes' => $clases, 'xfn' => preg_replace('/[^A-Za-z0-9 _-]/', '', (string) ($it['xfn'] ?? '')) ?? '',
        ];
        if (is_string($it['fallback'] ?? null)) {
            $salida['fallback'] = $it['fallback'];
        }
        return $salida;
    }

    // ==================================================================
    // Resolución de identidades portables contra ESTE sitio
    // ==================================================================

    /**
     * ¿Existe en este sitio (o en el paquete, si es una página) lo que la referencia nombra?
     *
     * @param array<string, mixed> $ref
     * @param array<string, bool> $slugs_paginas las páginas que trae el paquete
     */
    private static function existe_ref(array $ref, array $slugs_paginas): bool
    {
        if (isset($ref['postType'])) {
            return ($ref['postType'] === 'page' && isset($slugs_paginas[(string) $ref['slug']])) || self::id_de_contenido((string) $ref['postType'], (string) $ref['slug']) !== null;
        }
        return isset($ref['taxonomy']) && get_term_by('slug', (string) $ref['slug'], (string) $ref['taxonomy']) instanceof WP_Term;
    }

    /**
     * El número de ESTE sitio de lo que la referencia nombra (primero las páginas que escribió este
     * import, después lo que el sitio ya tenía), o null.
     *
     * @param array<string, mixed> $ref
     * @param array<string, int> $por_slug_paginas
     */
    public static function resolver_ref(array $ref, array $por_slug_paginas): ?int
    {
        if (isset($ref['postType'])) {
            if ($ref['postType'] === 'page' && isset($por_slug_paginas[(string) $ref['slug']])) {
                return $por_slug_paginas[(string) $ref['slug']];
            }
            return self::id_de_contenido((string) $ref['postType'], (string) $ref['slug']);
        }
        if (isset($ref['taxonomy'])) {
            $t = get_term_by('slug', (string) $ref['slug'], (string) $ref['taxonomy']);
            return $t instanceof WP_Term ? (int) $t->term_id : null;
        }
        return null;
    }

    private static function id_de_contenido(string $tipo, string $slug): ?int
    {
        if (!post_type_exists($tipo) || $slug === '') {
            return null;
        }
        $ids = get_posts(['post_type' => $tipo, 'name' => $slug, 'post_status' => ['publish', 'draft', 'pending', 'private', 'future'], 'numberposts' => 1, 'orderby' => 'ID', 'order' => 'ASC', 'fields' => 'ids', 'no_found_rows' => true]);
        return $ids === [] ? null : (int) $ids[0];
    }

    /** @param mixed $ref */
    private static function describir_ref($ref): string
    {
        if (!is_array($ref)) {
            return '?';
        }
        return (string) ($ref['postType'] ?? $ref['taxonomy'] ?? '?') . ' ' . (string) ($ref['slug'] ?? '?');
    }

    /**
     * Los destinos de las reglas de región, con los números de este sitio.
     *
     * @param array<int, mixed> $reglas
     * @param array<string, int> $por_slug_paginas
     * @return array<int, array<string, mixed>>
     */
    public static function reglas_a_destino(array $reglas, array $por_slug_paginas): array
    {
        $salida = [];
        foreach ($reglas as $regla) {
            if (is_array($regla) && isset($regla['ref']) && is_array($regla['ref'])) {
                $id = self::resolver_ref($regla['ref'], $por_slug_paginas);
                if ($id !== null) {
                    $salida[] = ['type' => (string) $regla['type'], 'id' => $id];
                }
                continue;
            }
            if (is_array($regla)) {
                $salida[] = $regla;
            }
        }
        return $salida;
    }

    // ==================================================================
    // Huellas (comparación con el destino)
    // ==================================================================

    /** @param array<string, mixed> $menu */
    private static function huella_menu(array $menu): string
    {
        foreach ($menu['items'] as &$item) {
            unset($item['fallback']);
        }
        unset($item);
        return hash('sha256', self::canonico(['name' => $menu['name'], 'items' => $menu['items']]));
    }

    private static function huella_navegacion(string $titulo, string $contenido): string
    {
        return hash('sha256', $titulo . "\n" . $contenido);
    }

    /** @param mixed $v */
    private static function canonico($v): string
    {
        $orden = static function ($x) use (&$orden) {
            if (!is_array($x)) {
                return $x;
            }
            $x = array_map($orden, $x);
            if (!COD_Site_Package_Format::es_lista($x)) {
                ksort($x);
            }
            return $x;
        };
        return (string) wp_json_encode($orden($v), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private static function sha_del_adjunto(int $id): string
    {
        if ($id <= 0) {
            return '';
        }
        $archivo = get_attached_file($id);
        return is_string($archivo) && is_file($archivo) ? (string) hash_file('sha256', $archivo) : '';
    }

    private static function reescribir_urls(string $texto, string $origen, string $destino): string
    {
        if ($origen === '' || $origen === $destino) {
            return $texto;
        }
        return str_replace([$origen, str_replace('/', '\\/', $origen)], [$destino, str_replace('/', '\\/', $destino)], $texto);
    }

    private static function buscar_navegacion(string $slug): ?WP_Post
    {
        $r = get_posts(['post_type' => 'wp_navigation', 'name' => $slug, 'post_status' => 'any', 'numberposts' => 1, 'orderby' => 'ID', 'order' => 'ASC', 'no_found_rows' => true]);
        return $r === [] ? null : $r[0];
    }

    // ==================================================================
    // IMPORTAR: escribir
    // ==================================================================

    /**
     * Antes de escribir las páginas: las navegaciones de bloques que el paquete trae y este sitio no
     * tiene se crean (vacías), para que las páginas que las citan reciban su número.
     *
     * @param array<string, mixed> $sitio lo que devolvió revisar()
     * @return array<string, int> slug => id de TODAS las navegaciones de este sitio
     */
    public static function asegurar_navegaciones(array $sitio): array
    {
        foreach ($sitio['navegaciones'] as $n) {
            $existente = self::buscar_navegacion((string) $n['slug']);
            if ($existente === null) {
                wp_insert_post(['post_type' => 'wp_navigation', 'post_status' => 'publish', 'post_title' => (string) $n['title'], 'post_name' => (string) $n['slug'], 'post_content' => '']);
            } elseif ($existente->post_status !== 'publish' && $n['accion'] !== 'igual') {
                wp_update_post(['ID' => $existente->ID, 'post_status' => 'publish']); // la navegación del paquete está publicada
            }
        }
        return self::navegaciones_id_por_slug();
    }

    /** @return array<string, int> */
    public static function navegaciones_id_por_slug(): array
    {
        $salida = [];
        foreach (self::navegaciones_por_id() as $id => $slug) {
            $salida[$slug] = $id;
        }
        return $salida;
    }

    /**
     * Escribe el estado del sitio. Se llama DESPUÉS de colocar los medios y de escribir las páginas.
     *
     * @param array<string, mixed> $sitio lo que devolvió revisar()
     * @param array<string, int> $por_slug_paginas slug => id de las páginas que escribió este import
     * @return array<string, mixed> resumen
     */
    public static function aplicar(array $sitio, array $por_slug_paginas, COD_Media_Attachment_Sync $sync): array
    {
        $avisos = [];
        $hechos = [];
        $registro = get_option(self::REGISTRO, []);
        $registro = is_array($registro) ? $registro : [];

        // ---- navegaciones de bloques (el contenido, ya con las páginas escritas)
        $nav_ids = self::navegaciones_id_por_slug();
        foreach ($sitio['navegaciones'] as $n) {
            if ($n['accion'] === 'igual') {
                continue;
            }
            $existente = self::buscar_navegacion((string) $n['slug']);
            $contenido = self::contenido_a_destino((string) $n['content'], $por_slug_paginas, $nav_ids, $avisos);
            if ($existente === null) {
                continue; // no pasa: asegurar_navegaciones() la creó
            }
            self::escribir_contenido_sin_kses(['ID' => $existente->ID, 'post_title' => (string) $n['title'], 'post_status' => 'publish', 'post_content' => $contenido]);
            $sin_avisos = [];
            $registro['nav:' . $n['slug']] = hash('sha256', self::huella_navegacion((string) get_post_field('post_title', $existente->ID), self::contenido_a_portable((string) get_post_field('post_content', $existente->ID, 'raw'), self::navegaciones_por_id(), $sin_avisos)));
            $registro['nav:' . $n['slug'] . '#paquete'] = hash('sha256', self::huella_navegacion((string) $n['title'], (string) $n['content']));
            $hechos[] = 'navegación ' . $n['slug'];
        }

        // ---- menús clásicos
        $term_por_slug = [];
        foreach ($sitio['menus'] as $m) {
            $term = get_term_by('slug', $m['slug'], 'nav_menu');
            if ($m['accion'] !== 'igual') {
                $term_id = self::escribir_menu($m, $term instanceof WP_Term ? $term : null, $por_slug_paginas, $avisos);
                if ($term_id === null) {
                    continue;
                }
                $term = get_term($term_id, 'nav_menu');
                $sin_avisos = [];
                if ($term instanceof WP_Term) {
                    $registro['menu:' . $m['slug']] = hash('sha256', self::huella_menu(self::menu_portable($term, false, $sin_avisos)));
                    $registro['menu:' . $m['slug'] . '#paquete'] = hash('sha256', self::huella_menu($m));
                }
                $hechos[] = 'menú ' . $m['slug'];
            }
            if ($term instanceof WP_Term) {
                $term_por_slug[$m['slug']] = (int) $term->term_id;
            }
        }

        // ---- ajustes, marca, ubicaciones
        $permalinks = false;
        $logo_del_tema_escrito = false;
        foreach ($sitio['ajustes'] as $a) {
            // fijar custom_logo hace que WordPress copie ese valor sobre site_logo: si el paquete trae un site_logo
            // propio hay que volver a escribirlo aunque ya fuera el correcto
            $rehacer_logo_del_sitio = $logo_del_tema_escrito && $a['tipo'] === 'medio' && $a['destino'] === 'site_logo';
            if ($a['accion'] === 'igual' && !$rehacer_logo_del_sitio) {
                continue;
            }
            if ($a['tipo'] === 'opcion') {
                self::escribir_opcion((string) $a['opcion'], (string) $a['nuevo']);
                $registro[$a['clave']] = hash('sha256', (string) get_option((string) $a['opcion'], ''));
                $permalinks = $permalinks || in_array($a['opcion'], ['permalink_structure', 'category_base', 'tag_base'], true);
            } elseif ($a['tipo'] === 'medio') {
                $absoluta = untrailingslashit((string) wp_get_upload_dir()['basedir']) . '/' . $a['ruta'];
                $id = is_file($absoluta) ? $sync->sync_file($absoluta) : 0;
                if (is_wp_error($id) || (int) $id <= 0) {
                    $avisos[] = 'No se pudo fijar ' . $a['destino'] . ': el archivo ' . $a['ruta'] . ' no está en este sitio.';
                    continue;
                }
                if ($a['destino'] === 'custom_logo') {
                    set_theme_mod('custom_logo', (int) $id);
                    $logo_del_tema_escrito = true;
                } else {
                    update_option((string) $a['destino'], (int) $id);
                }
                $registro[$a['clave']] = hash('sha256', self::sha_del_adjunto((int) $id));
            } elseif ($a['tipo'] === 'ubicacion' && isset($term_por_slug[$a['menu']])) {
                $ubicaciones = get_nav_menu_locations();
                $ubicaciones[(string) $a['ubicacion']] = $term_por_slug[$a['menu']];
                set_theme_mod('nav_menu_locations', $ubicaciones);
                $registro[$a['clave']] = hash('sha256', (string) $a['menu']);
            }
            $hechos[] = (string) $a['clave'];
        }
        if ($permalinks || $sitio['permalinks']) {
            flush_rewrite_rules(false);
        }

        // ---- hojas de diseño (derivadas de los documentos, que se escriben sin condición: se igualan sin conflicto)
        if ($sitio['hojas'] !== [] && class_exists('COD_Diseno_Hoja')) {
            $carpeta = trailingslashit((string) wp_get_upload_dir()['basedir']) . COD_Diseno_Hoja::CARPETA;
            $hojas = get_option(COD_Diseno_Hoja::OPTION_KEY, []);
            $hojas = is_array($hojas) ? $hojas : [];
            foreach ($sitio['hojas'] as $diseno => $h) {
                if (!is_file($carpeta . '/' . $h['archivo'])) {
                    $avisos[] = 'La hoja de diseño «' . $h['archivo'] . '» no llegó; el sitio sirve el CSS de cada documento en línea.';
                    continue;
                }
                $anterior = (string) ($hojas[$diseno]['archivo'] ?? '');
                $hojas[$diseno] = ['archivo' => $h['archivo'], 'sello' => $h['sello']];
                if ($anterior !== '' && $anterior !== $h['archivo'] && preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.css$/', $anterior) === 1) {
                    @unlink($carpeta . '/' . $anterior);
                }
            }
            update_option(COD_Diseno_Hoja::OPTION_KEY, $hojas, false);
        }

        update_option(self::REGISTRO, $registro, false);
        return ['avisos' => $avisos, 'hechos' => $hechos];
    }

    private static function escribir_opcion(string $opcion, string $valor): void
    {
        global $wp_rewrite;
        update_option($opcion, $valor);
        if (in_array($opcion, ['permalink_structure', 'category_base', 'tag_base'], true) && $wp_rewrite instanceof WP_Rewrite) {
            // WP_Rewrite guarda su propia copia de estas opciones: se le hace releerlas antes de regenerar las reglas
            $wp_rewrite->init();
        }
    }

    /**
     * kses desfiguraría el contenido de bloques: sólo se apaga cuando quien escribe ya es de confianza
     * (una persona con unfiltered_html, o WP-CLI sin usuario), igual que con las páginas en bloques.
     *
     * @param array<string, mixed> $datos
     */
    private static function escribir_contenido_sin_kses(array $datos): void
    {
        self::sin_kses(static function () use ($datos): void {
            $datos['post_content'] = wp_slash((string) $datos['post_content']);
            wp_update_post($datos);
        });
    }

    /**
     * Ejecuta una escritura con kses apagado cuando quien escribe ya es de confianza: así lo que se guarda
     * es lo que el paquete trae (títulos de menú con `&`, bloques con atributos), no una versión "limpiada".
     */
    private static function sin_kses(callable $escribir): void
    {
        $kses = function_exists('kses_remove_filters') && has_filter('content_save_pre', 'wp_filter_post_kses') && (!is_user_logged_in() || current_user_can('unfiltered_html'));
        if ($kses) {
            kses_remove_filters();
        }
        try {
            $escribir();
        } finally {
            if ($kses) {
                kses_init_filters();
            }
        }
    }

    /**
     * Crea o reescribe un menú clásico con sus enlaces. Idempotente: el menú se busca por slug y sus
     * enlaces se rehacen sólo si cambiaron (si no, la acción es "igual" y ni se llama aquí).
     *
     * @param array<string, mixed> $m
     * @param array<string, int> $por_slug_paginas
     * @param array<int, string> $avisos
     */
    private static function escribir_menu(array $m, ?WP_Term $existente, array $por_slug_paginas, array &$avisos): ?int
    {
        $term_id = null;
        self::sin_kses(static function () use ($m, $existente, $por_slug_paginas, &$avisos, &$term_id): void {
            $term_id = self::escribir_menu_con_filtros($m, $existente, $por_slug_paginas, $avisos);
        });
        return $term_id;
    }

    /**
     * @param array<string, mixed> $m
     * @param array<string, int> $por_slug_paginas
     * @param array<int, string> $avisos
     */
    private static function escribir_menu_con_filtros(array $m, ?WP_Term $existente, array $por_slug_paginas, array &$avisos): ?int
    {
        if ($existente === null) {
            $nombre = (string) $m['name'] !== '' ? (string) $m['name'] : (string) $m['slug'];
            if (get_term_by('name', $nombre, 'nav_menu') instanceof WP_Term) {
                $nombre .= ' (' . $m['slug'] . ')';
            }
            $term_id = wp_create_nav_menu($nombre);
            if (is_wp_error($term_id)) {
                $avisos[] = 'No se pudo crear el menú «' . $m['slug'] . '»: ' . $term_id->get_error_message();
                return null;
            }
            wp_update_term((int) $term_id, 'nav_menu', ['slug' => (string) $m['slug']]);
        } else {
            $term_id = (int) $existente->term_id;
            if ((string) $m['name'] !== '' && $existente->name !== $m['name']) {
                wp_update_nav_menu_object($term_id, ['menu-name' => (string) $m['name']]);
            }
            foreach ((array) wp_get_nav_menu_items($term_id, ['post_status' => 'any']) as $viejo) {
                wp_delete_post((int) $viejo->ID, true);
            }
        }

        $id_por_clave = [];
        foreach ($m['items'] as $posicion => $item) {
            $args = [
                'menu-item-title' => (string) $item['title'],
                'menu-item-position' => $posicion + 1,
                'menu-item-parent-id' => $item['parent'] !== null ? (int) ($id_por_clave[$item['parent']] ?? 0) : 0,
                'menu-item-target' => (string) $item['target'],
                'menu-item-attr-title' => (string) $item['attrTitle'],
                'menu-item-description' => (string) $item['description'],
                'menu-item-classes' => implode(' ', (array) $item['classes']),
                'menu-item-xfn' => (string) $item['xfn'],
                'menu-item-status' => 'publish',
            ];
            $destino = $item['ref'] !== null ? self::resolver_ref($item['ref'], $por_slug_paginas) : null;
            if ($item['type'] === 'post_type' && $destino !== null) {
                $args += ['menu-item-type' => 'post_type', 'menu-item-object' => (string) $item['ref']['postType'], 'menu-item-object-id' => $destino];
            } elseif ($item['type'] === 'taxonomy' && $destino !== null) {
                $args += ['menu-item-type' => 'taxonomy', 'menu-item-object' => (string) $item['ref']['taxonomy'], 'menu-item-object-id' => $destino];
            } elseif ($item['type'] === 'post_type_archive') {
                $args += ['menu-item-type' => 'post_type_archive', 'menu-item-object' => (string) $item['object']];
            } else {
                $url = (string) $item['url'] !== '' ? (string) $item['url'] : (string) ($item['fallback'] ?? '');
                $args += ['menu-item-type' => 'custom', 'menu-item-object' => 'custom', 'menu-item-url' => esc_url_raw($url)];
            }
            $id = wp_update_nav_menu_item((int) $term_id, 0, $args);
            if (is_wp_error($id)) {
                $avisos[] = 'No se pudo crear un enlace del menú «' . $m['slug'] . '» («' . $item['title'] . '»): ' . $id->get_error_message();
                continue;
            }
            $id_por_clave[$item['key']] = (int) $id;
        }
        return (int) $term_id;
    }
}
