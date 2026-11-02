<?php

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/class-cod-site-package-sitio.php';

/**
 * Empaqueta el sitio en un `.ocdsite` v1 (docs/package-format-v1.md): un ZIP con `manifest.json`
 * (`formatVersion` + `entrypoints`), el contenido, el ADN, el estado de WordPress y los medios.
 *
 * Qué lleva (F1b, ESPEC-adn-unica-puerta-y-bloques.md):
 *  - `content/pages.json`   las páginas, de DOS clases que antes se confundían:
 *       · Canvas      respaldadas por un documento del lienzo (`documentId`); en el destino se
 *                     vuelven a publicar con el shortcode `[contope_canvas …]`.
 *       · en bloques  su `post_content` viaja TAL CUAL, como archivo propio
 *                     (`content/pages/…html`) con su sha256; nunca se convierten en shortcode.
 *    más los documentos Canvas que referencian, las REGIONES globales (encabezado/pie), la
 *    plantilla global activa y los estilos compartidos.
 *  - `design/model.json`    el ADN activo, si hay uno, en el envoltorio `contope/design-model`
 *                           (el mismo que valida `parsePortableDesignModel` del Core).
 *  - `wordpress/state.json` lo que no es contenido: cómo se aplicó el ADN, qué página es la portada y el
 *                           ESTADO DEL SITIO (COD_Site_Package_Sitio): título y descripción, enlaces
 *                           permanentes, ícono y logo, menús y navegaciones con sus ubicaciones, el set de
 *                           íconos y las hojas de diseño. Ningún número de WordPress viaja.
 *  - `themes/<tema>/theme.json` el theme.json del tema activo (informativo: el destino NO lo
 *                           aplica; el ADN no lo pisa en F1, ver ESPEC 3.3).
 *  - `assets/…`             los medios que las páginas, los documentos y las fuentes citan, con
 *                           su sha256. El nombre dentro del ZIP es el hash, porque las rutas
 *                           portables no admiten `@`, espacios ni tildes y los medios de un sitio
 *                           real sí; la ruta real (relativa a uploads) viaja en `content/pages.json`.
 *
 * Pensado para moverse entre dos instalaciones que corren una versión compatible de este plugin
 * (Portabilidad: exportar en el local, importar en la web). No es un respaldo de la base de datos.
 */
final class COD_Site_Package_Exporter
{
    /** Versión del esquema propio anterior (`pages`/`documents`). El importador sigue leyéndolo. */
    public const PACKAGE_SCHEMA_VERSION = 1;

    private const EXTENSIONES_DE_MEDIO = 'jpe?g|png|gif|webp|svg|avif|ico|bmp|mp4|m4v|webm|mov|ogv|mp3|m4a|ogg|wav|pdf|woff2?|ttf|otf|eot|docx?|xlsx?|pptx?|csv|txt|zip';

    public function __construct(private COD_Canvas_Document_Repository $repository)
    {
    }

    /**
     * @param bool $include_media Si es false, genera un paquete de solo estructura (páginas +
     *     documentos + ADN): mucho más liviano, sin imágenes ni video. La lista de medios viaja
     *     igual (ruta y sha256), para que quien lo reciba sepa qué le falta.
     * @return string|WP_Error Ruta al ZIP generado (archivo temporal del llamador; queda a su
     *     cargo borrarlo) o WP_Error.
     */
    public function export(bool $include_media = true)
    {
        $paginas = $this->collect_pages();
        if ($paginas['canvas'] === [] && $paginas['blocks'] === []) {
            return new WP_Error('cod_package_empty', 'No hay páginas publicadas respaldadas por un documento Canvas ni páginas de ContOpe en bloques.');
        }

        // ---- documentos: los de las páginas Canvas, la plantilla global, TODAS las regiones y los estilos compartidos
        $document_ids = [];
        foreach ($paginas['canvas'] as $page) {
            $document_ids[$page['documentId']] = true;
        }
        $default_assignments = $this->repository->get_template_assignments(COD_Canvas_Document_Repository::DEFAULT_TEMPLATE_ID);
        foreach ($default_assignments as $assigned_document_id) {
            if ($assigned_document_id !== '') {
                $document_ids[$assigned_document_id] = true;
            }
        }
        // Las regiones con tipo (encabezado, cuerpo, pie) valen por sí mismas: una región GLOBAL no
        // está en ninguna plantilla ni la cita ninguna página, y sin ella el sitio importado sale
        // sin encabezado ni pie. Antes de F1b sólo viajaban las que estaban en la plantilla global.
        // Sus destinos por página/categoría/etiqueta viajan por identidad (slug), no por número.
        $avisos = [];
        foreach ($this->repository->list_region_documents() as $region) {
            $document_ids[(string) $region['documentId']] = true;
        }

        // Los estilos compartidos (.cod-btn, .contacto__cta--ghost, el matte de luminancia…) viven
        // en un documento propio que NO pertenece a ninguna página ni plantilla. Sin él, un sitio
        // exportado e importado pierde sus botones (pasó de verdad el 7-oct-2026). Se incluye sólo
        // si tiene hojas que llevar. load_existing(): no crea el documento si no existe.
        $shared = $this->repository->load_existing(COD_Canvas_Document_Repository::SHARED_STYLES_DOCUMENT_ID);
        if (!is_wp_error($shared) && trim((string) ($shared['css'] ?? '')) !== '') {
            $document_ids[COD_Canvas_Document_Repository::SHARED_STYLES_DOCUMENT_ID] = true;
        }

        $documents = [];
        foreach (array_keys($document_ids) as $document_id) {
            $document = $this->repository->load_existing((string) $document_id);
            if (is_wp_error($document)) {
                return $document;
            }
            $documents[(string) $document_id] = $document;
        }

        // ---- el estado del sitio (marca, menús, íconos, hojas) y los destinos de región en forma portable
        $documents = COD_Site_Package_Sitio::documentos_portables($documents, $avisos);
        $sitio = COD_Site_Package_Sitio::capturar($documents, $avisos);
        $navegaciones = COD_Site_Package_Sitio::navegaciones_por_id();
        foreach ($paginas['blocks'] as $i => $page) {
            // un bloque de navegación cita su navegación por número: viaja por slug
            $paginas['blocks'][$i]['postContent'] = COD_Site_Package_Sitio::contenido_a_portable($page['postContent'], $navegaciones, $avisos);
        }

        // ---- medios: los que citan los documentos, las páginas en bloques y las fuentes del sitio
        $media_paths = $this->collect_media_paths($documents);
        foreach ($paginas['blocks'] as $page) {
            $media_paths += $this->media_en_texto($page['postContent']);
        }
        // Las fuentes del sitio (site_font_css()) se inyectan aparte del html/css de cada documento,
        // así que nunca las detecta el escaneo por texto: sin esto, un paquete "completo" migra las
        // imágenes pero deja el sitio destino sin las tipografías reales.
        $media_paths = array_merge($media_paths, $this->collect_site_font_paths());
        // Lo que el estado del sitio necesita: el archivo del ícono y del logo (adjuntos), el set de íconos y
        // las hojas de diseño (archivos sueltos de uploads, sin adjunto).
        $propiedades_de_medio = [];
        foreach ($sitio['medios'] as $relativa => $m) {
            $media_paths[$relativa] = $m['abs'];
            $propiedades_de_medio[$relativa] = ['attach' => $m['attach'], 'group' => $m['grupo']];
        }
        ksort($media_paths);

        // ---- piezas del paquete
        $archivos = [];   // ruta en el ZIP => ['rol' => ..., 'contenido' => ...]
        $ahora = gmdate('Y-m-d\TH:i:s\Z');
        $package_id = 'urn:ocd:package:' . wp_generate_uuid4();

        $adn = $this->modelo_de_diseno($package_id, $ahora);
        if (is_wp_error($adn)) {
            return $adn;
        }
        $project = $this->identidad_del_proyecto($adn['designId'] ?? null);

        $contenido_paginas = [];
        $nombres_usados = [];
        foreach ($paginas['canvas'] as $p) {
            $contenido_paginas[] = [
                'kind' => 'canvas',
                'id' => $p['id'], 'title' => $p['title'], 'slug' => $p['slug'], 'status' => $p['status'], 'documentId' => $p['documentId'],
            ];
        }
        foreach ($paginas['blocks'] as $i => $p) {
            $ruta = 'content/pages/' . sprintf('%03d', $i + 1) . '-' . $this->segmento_portable($p['slug']) . '.html';
            while (isset($nombres_usados[$ruta])) {
                $ruta = 'content/pages/' . sprintf('%03d', $i + 1) . '-' . substr(md5($ruta), 0, 6) . '.html';
            }
            $nombres_usados[$ruta] = true;
            $archivos[$ruta] = ['rol' => 'content', 'contenido' => $p['postContent']];
            $contenido_paginas[] = [
                'kind' => 'blocks',
                'id' => $p['id'], 'title' => $p['title'], 'slug' => $p['slug'], 'status' => $p['status'],
                'documentId' => $p['documentId'], 'template' => $p['template'], 'menuOrder' => $p['menuOrder'],
                'contentRevision' => $p['contentRevision'],
                'content' => ['path' => $ruta, 'sha256' => hash('sha256', $p['postContent'])],
            ];
        }

        // medios: dedupe por contenido (dos rutas con los mismos bytes comparten un activo)
        $assets = [];
        $lista_medios = [];
        foreach ($media_paths as $relativa => $absoluta) {
            $sha = (string) hash_file('sha256', $absoluta);
            $tamano = (int) filesize($absoluta);
            $id = 'urn:ocd:asset:sha256-' . substr($sha, 0, 40);
            $entrada = ['path' => $relativa, 'sha256' => $sha, 'size' => $tamano, 'asset' => $include_media ? $id : null];
            if (isset($propiedades_de_medio[$relativa])) {
                // "attach: false" = archivo de uploads que NO es un adjunto de la Biblioteca (íconos, hojas)
                if ($propiedades_de_medio[$relativa]['attach'] === false) {
                    $entrada['attach'] = false;
                }
                $entrada['group'] = $propiedades_de_medio[$relativa]['group'];
            }
            $lista_medios[] = $entrada;
            if ($include_media && !isset($assets[$id])) {
                $extension = strtolower(preg_replace('/[^A-Za-z0-9]/', '', (string) pathinfo($absoluta, PATHINFO_EXTENSION)) ?? '');
                $assets[$id] = [
                    'id' => $id,
                    'path' => 'assets/' . substr($sha, 0, 40) . ($extension !== '' ? '.' . $extension : ''),
                    'mime' => $this->mime_de($absoluta),
                    'size' => $tamano,
                    'sha256' => $sha,
                    'absoluta' => $absoluta,
                ];
            }
        }

        $content_json = wp_json_encode([
            'schema' => COD_Site_Package_Format::CONTENT_SCHEMA,
            'version' => 1,
            'sourceSiteUrl' => home_url('/'),
            'includesMedia' => $include_media,
            'pages' => $contenido_paginas,
            'documents' => $documents,
            'defaultTemplateAssignments' => $default_assignments,
            'media' => $lista_medios,
            'avisos' => $avisos,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($content_json)) {
            return new WP_Error('cod_package_encode', 'No fue posible serializar el contenido del paquete (¿texto que no es UTF-8?).');
        }
        $archivos[COD_Site_Package_Format::CONTENT_PATH] = ['rol' => 'content', 'contenido' => $content_json];

        $state_json = wp_json_encode([
            'schema' => COD_Site_Package_Format::STATE_SCHEMA,
            'version' => 2,
            'adn' => $adn === null ? null : $adn['estado'],
            'reading' => $this->lectura($paginas),
        ] + $sitio['estado'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($state_json)) {
            return new WP_Error('cod_package_encode', 'No fue posible serializar el estado de WordPress del paquete.');
        }
        $archivos[COD_Site_Package_Format::STATE_PATH] = ['rol' => 'wordpress-state', 'contenido' => $state_json];

        if ($adn !== null) {
            $archivos[COD_Site_Package_Format::MODEL_PATH] = ['rol' => 'design-model', 'contenido' => $adn['json']];
            $archivos[COD_Site_Package_Format::MODEL_MD_PATH] = ['rol' => 'other', 'contenido' => $adn['designMd']];
        }

        $tema = $this->tema_activo();
        $archivos[$tema['path']] = ['rol' => 'theme-config', 'contenido' => $tema['contenido']];

        // ---- manifiesto
        $files = [];
        foreach ($archivos as $ruta => $a) {
            $files[] = ['path' => $ruta, 'role' => $a['rol'], 'size' => strlen($a['contenido']), 'sha256' => hash('sha256', $a['contenido'])];
        }
        $entrypoints = [
            'content' => COD_Site_Package_Format::CONTENT_PATH,
            'theme' => $tema['path'],
            'wordpressState' => COD_Site_Package_Format::STATE_PATH,
        ];
        if ($adn !== null) {
            $entrypoints['designModel'] = COD_Site_Package_Format::MODEL_PATH;
        }
        $canvas_theme = wp_get_theme('contope-canvas');
        $version_plugin = $this->version_valida(defined('COD_PUBLISHER_VERSION') ? (string) COD_PUBLISHER_VERSION : '', '0.0.0');
        $manifest = [
            '$schema' => COD_Site_Package_Format::SCHEMA_ID,
            'formatVersion' => COD_Site_Package_Format::FORMAT_VERSION,
            'package' => ['id' => $package_id, 'revision' => $ahora, 'createdAt' => $ahora],
            'project' => ['id' => $project['id'], 'name' => $project['name']],
            'origin' => [
                'producer' => 'contope-publisher',
                'producerVersion' => $version_plugin,
                'siteId' => 'urn:ocd:site:' . substr(sha1(untrailingslashit(home_url('/'))), 0, 24),
                'siteUrl' => home_url('/'),
                'exportedAt' => $ahora,
            ],
            'requirements' => [
                'canvas' => $this->version_valida($canvas_theme->exists() ? (string) $canvas_theme->get('Version') : '', '0.0.0'),
                'publisher' => $version_plugin,
                'wordpress' => $this->version_valida((string) get_bloginfo('version'), '6.5'),
            ],
            'entrypoints' => $entrypoints,
            'files' => $files,
            'assets' => array_values(array_map(static function (array $a): array {
                unset($a['absoluta']);
                return $a;
            }, $assets)),
            'capabilities' => [
                'blockEditor' => true,
                'fullSiteEditing' => function_exists('wp_is_block_theme') ? (bool) wp_is_block_theme() : false,
                'localFonts' => true,
                'networkAccess' => false,
                'requiredBlocks' => $this->bloques_requeridos($paginas['blocks']),
            ],
        ];

        // El manifiesto que se escribe tiene que pasar el mismo validador que lo lee: si no, el
        // paquete saldría "bien" y no se podría importar. Mejor fallar al exportar.
        $errores = COD_Site_Package_Format::validar_manifiesto($manifest);
        if ($errores !== []) {
            return new WP_Error('cod_package_manifest_invalid', 'El paquete que se iba a escribir no cumple el formato v1: ' . COD_Site_Package_Format::describir_errores($errores) . '.');
        }
        $manifest_json = wp_json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if (!is_string($manifest_json)) {
            return new WP_Error('cod_package_encode', 'No fue posible serializar el manifiesto del paquete.');
        }

        return $this->write_zip($manifest_json, $archivos, $include_media ? $assets : []);
    }

    // ------------------------------------------------------------------
    // Páginas
    // ------------------------------------------------------------------

    /**
     * @return array{
     *   canvas: array<int, array{id:int, title:string, slug:string, status:string, documentId:string}>,
     *   blocks: array<int, array{id:int, title:string, slug:string, status:string, documentId:string, postContent:string, template:string, menuOrder:int, contentRevision:int}>
     * }
     */
    private function collect_pages(): array
    {
        $post_ids = get_posts([
            'post_type' => 'page',
            'post_status' => 'publish',
            'numberposts' => -1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'orderby' => 'ID',
            'order' => 'ASC',
        ]);

        $canvas = [];
        $blocks = [];
        foreach ($post_ids as $post_id) {
            $post_id = (int) $post_id;
            $document_id = (string) get_post_meta($post_id, COD_Canvas_Document_Repository::META_DOCUMENT_ID, true);
            $contenido = (string) get_post_field('post_content', $post_id, 'raw');
            $revision = (int) get_post_meta($post_id, COD_Block_Page_Writer::META_REVISION, true);

            // Una página es de ContOpe si tiene su documento (aunque ya esté en bloques: las migradas
            // lo conservan), si pasó por la escritura de páginas en bloques, o si usa un bloque propio.
            $es_en_bloques = COD_Site_Package_Format::es_contenido_en_bloques($contenido);
            if ($es_en_bloques && ($document_id !== '' || $revision > 0 || strpos($contenido, '<!-- wp:contope/') !== false)) {
                $template = (string) get_post_meta($post_id, '_wp_page_template', true);
                $blocks[] = [
                    'id' => $post_id,
                    'title' => (string) get_the_title($post_id),
                    'slug' => (string) get_post_field('post_name', $post_id),
                    'status' => (string) get_post_status($post_id),
                    'documentId' => $document_id,
                    'postContent' => $contenido,
                    'template' => $template === 'default' ? '' : $template,
                    'menuOrder' => (int) get_post_field('menu_order', $post_id),
                    'contentRevision' => $revision,
                ];
                continue;
            }
            if ($document_id !== '' && !$es_en_bloques) {
                $canvas[] = [
                    'id' => $post_id,
                    'title' => (string) get_the_title($post_id),
                    'slug' => (string) get_post_field('post_name', $post_id),
                    'status' => (string) get_post_status($post_id),
                    'documentId' => $document_id,
                ];
            }
        }

        return ['canvas' => $canvas, 'blocks' => $blocks];
    }

    /**
     * Qué página es la portada (por slug, no por número: el número es de cada instalación).
     *
     * @param array{canvas: array<int, array<string, mixed>>, blocks: array<int, array<string, mixed>>} $paginas
     * @return array{showOnFront: string, pageOnFront: ?string, pageForPosts: ?string}
     */
    private function lectura(array $paginas): array
    {
        $slugs = [];
        foreach (array_merge($paginas['canvas'], $paginas['blocks']) as $p) {
            $slugs[(int) $p['id']] = (string) $p['slug'];
        }
        $frente = (int) get_option('page_on_front');
        $entradas = (int) get_option('page_for_posts');
        return [
            'showOnFront' => get_option('show_on_front') === 'page' ? 'page' : 'posts',
            'pageOnFront' => $frente > 0 && isset($slugs[$frente]) ? $slugs[$frente] : null,
            'pageForPosts' => $entradas > 0 && isset($slugs[$entradas]) ? $slugs[$entradas] : null,
        ];
    }

    /**
     * Nombres de los bloques que usan las páginas en bloques: lo que el destino tiene que tener
     * registrado para que la página se vea (capabilities.requiredBlocks).
     *
     * @param array<int, array<string, mixed>> $paginas
     * @return array<int, string>
     */
    private function bloques_requeridos(array $paginas): array
    {
        $nombres = [];
        foreach ($paginas as $p) {
            if (preg_match_all('/<!--\s+wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)/', (string) $p['postContent'], $m)) {
                foreach ($m[1] as $nombre) {
                    // "wp:paragraph" es "core/paragraph" en el comentario
                    $nombres[strpos($nombre, '/') === false ? 'core/' . $nombre : $nombre] = true;
                }
            }
        }
        $lista = array_keys($nombres);
        sort($lista);
        return array_values(array_filter($lista, static function (string $n): bool {
            return strlen($n) <= 80;
        }));
    }

    // ------------------------------------------------------------------
    // El ADN
    // ------------------------------------------------------------------

    /**
     * El ADN activo en el envoltorio portable, o null si el sitio no tiene uno.
     *
     * El almacén guarda sólo el `contract` (ESPEC 3.3: «el plugin guarda y usa sólo contract»), así
     * que el envoltorio se RECONSTRUYE: identidad de diseño y DESIGN.md salen del contrato (el
     * DESIGN.md con el mismo renderizador determinista que exige el validador) y el transporte
     * enlaza este paquete. `provenance.producer` es el único valor que el Core acepta
     * (`contope-design-desktop`): es la procedencia del MODELO, no de este paquete (esa va en
     * `origin.producer`).
     *
     * @return array{designId: string, json: string, designMd: string, estado: array<string, mixed>}|null|WP_Error
     */
    private function modelo_de_diseno(string $package_id, string $ahora)
    {
        $puntero = COD_ADN_Store::puntero();
        if ($puntero === null) {
            return null;
        }
        $contrato = COD_ADN_Store::contrato_de_revision((string) $puntero['designId'], (int) $puntero['revision']);
        if ($contrato === null) {
            return new WP_Error('cod_package_adn_missing', 'El sitio dice tener el ADN ' . $puntero['designId'] . ' revisión ' . (int) $puntero['revision'] . ' pero ese registro no está. No se exporta un paquete a medias.');
        }
        $project = $this->identidad_del_proyecto((string) $contrato->design->id);
        $md = COD_ADN_Design_Md::renderizar($contrato);

        $modelo = new stdClass();
        $modelo->schemaVersion = 1;
        $modelo->kind = 'contope/design-model';
        $modelo->design = clone $contrato->design;
        $modelo->transport = (object) [
            'package' => (object) ['id' => $package_id, 'revision' => $ahora],
            'project' => (object) ['id' => $project['id'], 'name' => $project['name']],
        ];
        $modelo->provenance = (object) [
            'producer' => 'contope-design-desktop',
            'producerVersion' => $this->version_valida(defined('COD_PUBLISHER_VERSION') ? (string) COD_PUBLISHER_VERSION : '', '0.0.0'),
            'exportedAt' => $ahora,
        ];
        $modelo->contract = $contrato;
        $modelo->designMd = (object) ['path' => COD_Site_Package_Format::MODEL_MD_PATH, 'revision' => $contrato->design->revision, 'content' => $md];

        $json = wp_json_encode($modelo, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        if (!is_string($json)) {
            return new WP_Error('cod_package_encode', 'No fue posible serializar el ADN del paquete.');
        }

        // Lo que se escribe tiene que ser lo que el validador del plugin acepta Y lo que activa el
        // mismo ADN (mismo digest). Si no, el paquete no reproduciría el diseño del origen.
        $previa = COD_ADN_Validator::validar($json, ['emitirPropuestas' => true]);
        if (!$previa['ok'] || !hash_equals((string) $puntero['digest'], (string) $previa['digest'])) {
            return new WP_Error('cod_package_adn_roundtrip', 'El ADN activo no sobrevive a la exportación (el envoltorio no valida o su digest cambia). No se exporta.');
        }

        return [
            'designId' => (string) $contrato->design->id,
            'json' => $json,
            'designMd' => $md,
            'estado' => [
                'designId' => (string) $puntero['designId'],
                'revision' => (int) $puntero['revision'],
                'digest' => (string) $puntero['digest'],
                'emitirPropuestas' => !empty($puntero['emitirPropuestas']),
                // Informativo: el modo de la compuerta es del sitio de destino y NO se aplica al importar.
                'modo' => COD_ADN_Gate::modo(),
            ],
        ];
    }

    /**
     * Identidad estable del proyecto: la del diseño si hay ADN (es la misma en el local y en la web),
     * y si no, la del nombre del sitio. Nunca un número de WordPress.
     *
     * @return array{id: string, name: string}
     */
    private function identidad_del_proyecto(?string $design_id): array
    {
        $nombre = trim(wp_strip_all_tags((string) get_bloginfo('name')));
        if ($nombre === '') {
            $nombre = 'Sitio WordPress';
        }
        $base = $design_id !== null && $design_id !== '' ? $design_id : 'sitio-' . sanitize_title($nombre);
        $id = preg_replace('/[^A-Za-z0-9._-]+/', '-', $base) ?? '';
        $id = trim($id, '-.');
        return ['id' => 'urn:ocd:project:' . ($id !== '' ? $id : 'sitio'), 'name' => function_exists('mb_substr') ? mb_substr($nombre, 0, 200) : substr($nombre, 0, 200)];
    }

    // ------------------------------------------------------------------
    // Tema, versiones, nombres
    // ------------------------------------------------------------------

    /**
     * El theme.json del tema activo (o del padre, o uno mínimo). Es requerido por el formato y viaja
     * como referencia: el importador no lo aplica.
     *
     * @return array{path: string, contenido: string}
     */
    private function tema_activo(): array
    {
        $slug = $this->segmento_portable(get_stylesheet());
        foreach ([get_stylesheet_directory(), get_template_directory()] as $dir) {
            $archivo = trailingslashit((string) $dir) . 'theme.json';
            if (is_file($archivo)) {
                $contenido = (string) file_get_contents($archivo);
                if ($contenido !== '') {
                    return ['path' => 'themes/' . $slug . '/theme.json', 'contenido' => $contenido];
                }
            }
        }
        return ['path' => 'themes/' . $slug . '/theme.json', 'contenido' => "{\"version\":3}\n"];
    }

    private function segmento_portable(string $texto): string
    {
        $s = strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', remove_accents($texto)) ?? '');
        $s = trim($s, '-');
        return $s !== '' ? substr($s, 0, 60) : 'sin-nombre';
    }

    private function version_valida(string $version, string $respaldo): string
    {
        return $version !== '' && strlen($version) <= 40 && preg_match('#^[0-9]+(?:\.[0-9]+){0,3}(?:[-+][A-Za-z0-9._-]+)?$#D', $version) === 1 ? $version : $respaldo;
    }

    private function mime_de(string $absoluta): string
    {
        $tipo = wp_check_filetype($absoluta);
        $mime = is_string($tipo['type'] ?? false) ? (string) $tipo['type'] : '';
        if ($mime === '' && function_exists('mime_content_type')) {
            $detectado = @mime_content_type($absoluta);
            $mime = is_string($detectado) ? $detectado : '';
        }
        $mime = strtolower($mime);
        return preg_match('#^[a-z0-9!\#$&^_.+-]+/[a-z0-9!\#$&^_.+-]+$#D', $mime) === 1 ? $mime : 'application/octet-stream';
    }

    // ------------------------------------------------------------------
    // Medios
    // ------------------------------------------------------------------

    /**
     * @return array<string, string> ruta relativa a uploads => ruta absoluta en disco
     */
    private function collect_site_font_paths(): array
    {
        $fonts_dir = COD_Canvas_Asset_Resolver::carpeta_gestionada('fonts')['dir'];
        if (!is_dir($fonts_dir)) {
            return [];
        }

        $found = [];
        foreach (glob(trailingslashit($fonts_dir) . '*') ?: [] as $absolute) {
            if (!is_file($absolute)) {
                continue;
            }
            $found['contope/fonts/' . basename($absolute)] = $absolute;
        }

        return $found;
    }

    /**
     * Busca rutas de `wp-content/uploads/...` dentro de html/css/projectData de cada documento.
     * Coincidencia por texto, no por parseo de HTML: deliberadamente permisiva para no perder
     * referencias dentro de atributos de datos o CSS `url()`.
     *
     * @param array<string, array<string, mixed>> $documents
     * @return array<string, string> ruta relativa a uploads => ruta absoluta en disco
     */
    private function collect_media_paths(array $documents): array
    {
        $found = [];
        foreach ($documents as $document) {
            $haystack = ($document['html'] ?? '') . ' ' . ($document['css'] ?? '') . ' ' . ($document['projectData'] ?? '');
            $found += $this->media_en_texto((string) $haystack);
        }

        return $found;
    }

    /**
     * Los archivos de uploads que un texto cita: con la URL completa del sitio o con la ruta desde
     * la raíz (`/wp-content/uploads/…`, que es como las páginas en bloques de Basis los guardan), y
     * también con las barras escapadas de un JSON (`\/`). Sólo cuenta lo que existe en disco y está
     * DENTRO de uploads.
     *
     * @return array<string, string> ruta relativa a uploads => ruta absoluta en disco
     */
    private function media_en_texto(string $texto): array
    {
        $upload_dir = wp_get_upload_dir();
        $base_url = untrailingslashit((string) $upload_dir['baseurl']);
        $base_path = untrailingslashit(wp_normalize_path((string) $upload_dir['basedir']));
        $real_base = realpath($base_path);
        $ruta_url = (string) wp_parse_url($base_url, PHP_URL_PATH);
        if ($real_base === false || $base_url === '') {
            return [];
        }
        $real_base = wp_normalize_path($real_base);

        $alternativas = [preg_quote($base_url, '#')];
        if ($ruta_url !== '' && $ruta_url !== '/') {
            $alternativas[] = '(?<![A-Za-z0-9._~:\-])' . preg_quote($ruta_url, '#');
        }
        $patron = '#(?:' . implode('|', $alternativas) . ')/([^"\'\s<>()\\\\?\#]+\.(?:' . self::EXTENSIONES_DE_MEDIO . '))#i';

        $normalizado = str_replace('\\/', '/', $texto);
        $encontrados = [];
        if (preg_match_all($patron, $normalizado, $matches)) {
            foreach ($matches[1] as $relative_encoded) {
                $relative = rawurldecode($relative_encoded);
                if (isset($encontrados[$relative]) || !COD_Site_Package_Format::ruta_de_medio_segura($relative)) {
                    continue;
                }
                $absolute = $base_path . '/' . $relative;
                if (!is_file($absolute)) {
                    continue;
                }
                $real = realpath($absolute);
                if ($real === false || strpos(wp_normalize_path($real) . '/', $real_base . '/') !== 0) {
                    continue; // un enlace que sale de uploads
                }
                $encontrados[$relative] = $absolute;
            }
        }
        return $encontrados;
    }

    // ------------------------------------------------------------------
    // El ZIP
    // ------------------------------------------------------------------

    /**
     * @param array<string, array{rol: string, contenido: string}> $archivos
     * @param array<string, array<string, mixed>> $assets
     * @return string|WP_Error
     */
    private function write_zip(string $manifest_json, array $archivos, array $assets)
    {
        if (!class_exists('ZipArchive')) {
            return new WP_Error('cod_package_zip_unavailable', 'La extensión ZipArchive de PHP no está disponible.');
        }

        $tmp_path = wp_tempnam('cod-site-package.zip');
        if (!$tmp_path) {
            return new WP_Error('cod_package_tmp', 'No fue posible crear un archivo temporal.');
        }

        $zip = new ZipArchive();
        if ($zip->open($tmp_path, ZipArchive::OVERWRITE) !== true) {
            return new WP_Error('cod_package_zip_open', 'No fue posible abrir el ZIP para escritura.');
        }

        $zip->addFromString('manifest.json', $manifest_json);
        foreach ($archivos as $ruta => $a) {
            $zip->addFromString($ruta, $a['contenido']);
        }
        foreach ($assets as $asset) {
            $zip->addFile((string) $asset['absoluta'], (string) $asset['path']);
        }

        if (!$zip->close()) {
            @unlink($tmp_path);
            return new WP_Error('cod_package_zip_close', 'No fue posible cerrar el ZIP del paquete.');
        }

        return $tmp_path;
    }
}
