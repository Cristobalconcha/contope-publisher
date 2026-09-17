<?php

if (!defined('ABSPATH')) {
    exit;
}

/** Publishes a saved Canvas document as a stable WordPress page. */
final class COD_Canvas_Page_Publisher
{
    public const META_DOCUMENT_ID = '_cod_canvas_document_id';

    /** @var string|null Cache por request del CSS de fuentes autocontenidas. */
    private static ?string $site_font_css_cache = null;

    public function __construct(
        private COD_Canvas_Document_Repository $repository,
        private ?COD_Template_Region_Resolver $region_resolver = null,
        private ?COD_Dynamic_Token_Resolver $token_resolver = null
    ) {
    }

    /** Nombre actual del shortcode que inserta un documento en una página. */
    public const SHORTCODE = 'contope_canvas';

    /**
     * El nombre que usaba el plugin antes del cambio de nombre del proyecto.
     *
     * El contenido de cada página publicada es literalmente
     * `[open_codesign_canvas document_id="…"]`, guardado en post_content. Un
     * sitio que viene de la versión anterior tiene ese texto en sus páginas, y
     * dejar de reconocerlo no deja un error: WordPress imprime el shortcode
     * como texto plano y la página queda en blanco con un corchete a la vista.
     *
     * Se podría reescribir el contenido de las páginas en la migración, pero
     * aceptar el nombre viejo es mejor: no toca contenido que es de la persona,
     * funciona también si alguien escribió el shortcode a mano en cualquier
     * otro lugar del sitio, y no hay nada que rehacer si la migración se corre
     * a medias.
     */
    public const SHORTCODE_HEREDADO = 'open_codesign_canvas';

    /** ¿Este contenido inserta un documento, con el nombre que sea? */
    private static function tiene_shortcode(string $contenido): bool
    {
        return has_shortcode($contenido, self::SHORTCODE)
            || has_shortcode($contenido, self::SHORTCODE_HEREDADO);
    }

    /** Evita que el CSS se emita dos veces cuando ya salió en la cabecera. */
    private static bool $css_ya_emitido = false;

    private static ?string $shared_css_cache = null;

    public function register(): void
    {
        add_shortcode(self::SHORTCODE, [$this, 'render_shortcode']);
        add_shortcode(self::SHORTCODE_HEREDADO, [$this, 'render_shortcode']);
        add_action('wp_enqueue_scripts', [$this, 'estilos_en_cabecera'], 5);
        add_action('wp_head', [self::class, 'precarga_en_cabecera'], 1);
        add_filter('template_include', [$this, 'standalone_template']);
    }

    /**
     * Devuelve el CSS de @font-face autocontenido de las tipografías del sitio.
     *
     * Lo genera scripts/build-fonts.mjs en uploads/contope/fonts/fonts.css.
     * Las URLs llegan con el placeholder {FONTS_BASE_URL}, que aquí se resuelve
     * contra el directorio de uploads real (portable entre instalaciones). Si el
     * archivo no existe devuelve cadena vacía y todo sigue funcionando como hoy.
     */
    /**
     * Carrusel en varias filas. Es el MISMO módulo de siempre con un parámetro
     * (data-cod-carousel-rows); con 1 fila —el valor por defecto— este CSS no
     * aplica y nada cambia.
     *
     * La pista pasa de fila flexible a grilla que se llena por columnas: cada
     * columna trae `rows` diapositivas y el motor avanza de a una columna. El
     * ancho de columna sale de --cod-carousel-columnas, que el motor escribe
     * según cuántas caben (escritorio o móvil), porque el CSS no puede leer el
     * atributo.
     */
    /**
     * Rótulo del marcador de shortcode DENTRO DEL EDITOR. En la página
     * publicada el marcador ya no existe —se reemplazó por la salida real—,
     * así que este CSS solo tiene sentido en el lienzo: sin él sería un
     * rectángulo vacío imposible de encontrar y de seleccionar.
     */
    public static function shortcode_marker_css(): string
    {
        return '[data-cod-shortcode]{display:flex;align-items:center;justify-content:center;'
            . 'min-height:120px;padding:16px;border:1px dashed rgb(201,154,46);border-radius:8px;'
            . 'background:rgba(255,243,214,.5);color:rgb(138,90,0);'
            . 'font-family:system-ui,sans-serif;font-size:12px;font-weight:600;letter-spacing:.04em;}'
            . '[data-cod-shortcode]::before{content:"⧉ " attr(data-cod-shortcode);}';
    }

    public static function carousel_rows_css(): string
    {
        $css = '';
        foreach ([2, 3] as $filas) {
            $sel = '[data-cod-carousel-rows="' . $filas . '"]';
            $css .= $sel . ' .gallery-carousel__track,' . $sel . ' .cod-carousel__track{'
                . 'display:grid;grid-auto-flow:column;'
                . 'grid-template-rows:repeat(' . $filas . ',auto);'
                . 'grid-auto-columns:calc((100% - (var(--cod-carousel-columnas,4) - 1) * var(--cod-carousel-gap,12px)) / var(--cod-carousel-columnas,4));'
                . '}';
            // En grilla, el flex-basis de cada diapositiva ya no manda: el ancho
            // lo pone la columna. Se neutraliza para que no compita.
            $css .= $sel . ' .gallery-carousel__slide,' . $sel . ' .cod-carousel__slide{'
                . 'flex-basis:auto;width:auto;min-width:0;'
                . '}';
        }
        return $css;
    }

    /**
     * Giro de imágenes para páginas armadas en el editor (las compiladas por
     * MCP lo traen en sus propios estilos base). El giro vive en la <img>, no
     * en el marco, porque dentro de una galería cada foto lleva el suyo.
     *
     * 90 y 270 cambian la forma de la caja: la imagen girada necesita medir el
     * ALTO del marco de ancho y el ANCHO de alto, y eso lo resuelven las
     * unidades de contenedor sobre el marco marcado como tal. Sin ese
     * intercambio, girar deja franjas vacías a los lados.
     */
    /**
     * Reglas base del Grupo Dinámico, emitidas por el plugin.
     *
     * Antes vivían sólo en la hoja del editor y `cod-editor-core.js` las
     * copiaba DENTRO del CSS de cada documento, en cada guardado, para que la
     * página publicada las tuviera. Esa copia se sumaba a la del guardado
     * anterior: la portada de Santa Luisa llegó a tener cada una de estas
     * once reglas siete veces, un 13,6% de su CSS. Ver la issue #12.
     *
     * El CSS base de un módulo del plugin es del plugin, no del documento. Al
     * emitirlo acá se publica una sola vez, no puede acumularse, y además se
     * corrige solo en todas las páginas cuando cambia.
     *
     * Va ANTES del CSS del documento a propósito: lo que el usuario
     * personalizó tiene que seguir ganando la cascada.
     */
    public static function dynamic_group_css(string $html): string
    {
        // Ninguna página que no use el módulo tiene por qué cargar sus
        // reglas. Se comprueba contra el HTML y nunca contra el CSS: el CSS
        // de los documentos viejos todavía arrastra copias de estas mismas
        // reglas, así que mirarlo daría siempre verdadero.
        if (strpos($html, 'cod-dynamic-group') === false) {
            return '';
        }

        return '.cod-dynamic-group{display:grid;gap:20px;}'
            . '.cod-dynamic-group--grid-2{grid-template-columns:repeat(2,minmax(0,1fr));}'
            . '.cod-dynamic-group--grid-3{grid-template-columns:repeat(3,minmax(0,1fr));}'
            . '.cod-dynamic-group--grid-4{grid-template-columns:repeat(4,minmax(0,1fr));}'
            . '.cod-dynamic-group--list{grid-template-columns:minmax(0,1fr);}'
            . '.cod-dynamic-group--carousel{display:flex;gap:20px;overflow-x:auto;'
            . 'scroll-snap-type:x mandatory;padding-bottom:4px;}'
            . '.cod-dynamic-group--carousel > .cod-dynamic-group__card{'
            . 'flex:0 0 min(78%,320px);scroll-snap-align:start;}'
            . '.cod-dynamic-group__card{min-width:0;box-sizing:border-box;padding:16px;'
            . 'border:1px solid #dcdcde;border-radius:8px;background:#fff;}'
            . '.cod-dynamic-group__image{display:block;width:100%;height:auto;border-radius:6px;}'
            . '.cod-dynamic-group__title{margin:12px 0 6px;}'
            . '.cod-dynamic-group__text{margin:0;}';
    }

    public static function rotation_css(): string
    {
        return '.cod-rot-180{transform:rotate(180deg);}'
            . '.cod-marco-girado{position:relative;overflow:hidden;container-type:size;}'
            . '.cod-marco-girado>.cod-rot-90,.cod-marco-girado>.cod-rot-270'
            . '{position:absolute;top:50%;left:50%;width:100cqh;height:100cqw;max-width:none;object-fit:cover;}'
            . '.cod-marco-girado>.cod-rot-90{transform:translate(-50%,-50%) rotate(90deg);}'
            . '.cod-marco-girado>.cod-rot-270{transform:translate(-50%,-50%) rotate(270deg);}'
            . '@supports not (width:100cqh){.cod-marco-girado>.cod-rot-90,.cod-marco-girado>.cod-rot-270'
            . '{position:static;width:100%;height:auto;transform:rotate(90deg);}}';
    }

    /**
     * Cortina de precarga: cubre la página con el color de fondo del sitio
     * hasta que la portada está lista de verdad (tipografías, imágenes, el
     * símbolo del logotipo y el primer cuadro del video con máscara).
     *
     * Se escribe directo en la cabecera, no como archivo aparte: esperar una
     * descarga dejaría ver justo lo que se quiere ocultar. El retiro lo hace
     * assets/js/cod-preload.js, que además tiene un tope de tiempo para que
     * la página nunca quede tapada.
     */
    public static function precarga_en_cabecera(): void
    {
        if (!is_singular()) {
            return;
        }
        $post = get_post();
        if (!$post || !self::tiene_shortcode((string) $post->post_content)) {
            return;
        }

        // Si el set no declara una superficie, la cortina va sin fondo. No se
        // pone un color de relleno: una cortina transparente se nota y se
        // arregla; una del color equivocado se queda para siempre.
        $fondo = COD_Theme_Definitions::preload_background();
        $pinta = $fondo === '' ? '' : ' background: ' . esc_attr($fondo) . ';';
        $estilo = '.cod-precarga, .cod-precarga body { overflow: hidden !important; }'
            . '.cod-precarga body::after, .cod-precarga-lista body::after {'
            . ' content: ""; position: fixed; inset: 0; z-index: 2147483000;'
            . ' pointer-events: none;' . $pinta . ' }'
            . '.cod-precarga-lista body::after { opacity: 0; transition: opacity .45s ease; }'
            . '@media (prefers-reduced-motion: reduce) {'
            . ' .cod-precarga-lista body::after { transition: none; } }';

        // El tope de tiempo va acá además de en el script: si el archivo del
        // retiro no llegara a cargar, la página se destapa igual.
        $marca = "document.documentElement.classList.add('cod-precarga');"
            . "setTimeout(function(){"
            . "document.documentElement.classList.remove('cod-precarga');"
            . "}, 6000);";

        echo '<style id="cod-precarga-estilo">' . $estilo . '</style>';
        echo '<script id="cod-precarga-marca">' . $marca . '</script>';
    }

    public static function site_font_css(): string
    {
        if (self::$site_font_css_cache !== null) {
            return self::$site_font_css_cache;
        }

        $carpeta = COD_Canvas_Asset_Resolver::carpeta_gestionada('fonts');
        $file = trailingslashit($carpeta['dir']) . 'fonts.css';

        if (!is_file($file)) {
            self::$site_font_css_cache = '';
            return '';
        }

        $css = (string) file_get_contents($file);
        $base_url = $carpeta['url'];
        self::$site_font_css_cache = str_replace('{FONTS_BASE_URL}', $base_url, $css);

        return self::$site_font_css_cache;
    }

    /**
     * @param int $page_id Optional explicit WordPress page target. When
     *                     greater than 0 it anchors the document to that
     *                     existing page; otherwise the legacy meta lookup
     *                     keeps mapping one page per document_id.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function publish(string $document_id, string $title, int $page_id = 0)
    {
        $document = $this->repository->load($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        if (trim((string) $document['html']) === '') {
            return new WP_Error('cod_canvas_empty', 'Guarda contenido en el Canvas antes de publicarlo.');
        }

        if ($page_id > 0) {
            $target = get_post($page_id);
            if (!$target instanceof WP_Post || $target->post_type !== 'page') {
                return new WP_Error('cod_canvas_page_invalid', 'La página objetivo no existe o no es una página.');
            }
        } else {
            $page_id = (int) ($this->find_page_id($document_id) ?? 0);
        }

        $post = [
            'post_type' => 'page',
            'post_status' => 'publish',
            'post_content' => sprintf('[contope_canvas document_id="%s"]', esc_attr($document_id)),
            'meta_input' => [self::META_DOCUMENT_ID => $document_id],
        ];
        if ($page_id > 0) {
            // Página ya existente: solo tocamos el título si mandaron uno
            // real. Antes esto pisaba el título ya puesto por el título
            // genérico cada vez que se publicaba sin pasar uno (ej. desde un
            // flujo que no reenvía el campo) — un usuario podía renombrar su
            // página y perder el nombre en la siguiente publicación.
            $post['ID'] = $page_id;
            if ($title !== '') {
                $post['post_title'] = $title;
            }
        } else {
            $post['post_title'] = $title !== '' ? $title : 'Página ContOpe Canvas';
        }
        $saved_id = wp_insert_post($post, true);
        if (is_wp_error($saved_id)) {
            return $saved_id;
        }

        return $this->describe_page((int) $saved_id);
    }

    /**
     * Publica únicamente una página Canvas ya existente. Es la ruta de
     * dominio para MCP: no llama load(), no puede crear un documento por un ID
     * remoto erróneo y conserva un snapshot previo antes de cambiar la
     * visibilidad de la página.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function publish_existing_if_revision(
        int $page_id,
        string $document_id,
        int $expected_revision,
        string $snapshot_session,
        string $snapshot_label
    ) {
        $page = $this->describe_canvas_page($page_id);
        if ($page === null) {
            return new WP_Error('cod_mcp_canvas_page_not_found', 'No existe una página Canvas con ese pageId.');
        }
        if ((string) $page['documentId'] !== $document_id) {
            return new WP_Error('cod_mcp_canvas_target_mismatch', 'pageId y documentId no pertenecen a la misma página Canvas.');
        }

        $document = $this->repository->load_existing($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        $actual_revision = (int) $document['revision'];
        if ($actual_revision !== $expected_revision) {
            return $this->revision_conflict($expected_revision, $actual_revision);
        }
        if (trim((string) $document['html']) === '') {
            return new WP_Error('cod_canvas_empty', 'Aplica una receta Canvas antes de publicar la página.');
        }

        // Publicar una página que ya está pública no altera nada ni genera un
        // snapshot redundante. También hace que la llamada sea idempotente.
        if ($page['status'] === 'publish') {
            return [
                'page' => $page,
                'snapshot' => null,
                'alreadyPublished' => true,
            ];
        }

        $snapshot = $this->repository->create_snapshot_if_revision(
            $document_id,
            $expected_revision,
            $snapshot_session,
            $snapshot_label
        );
        if (is_wp_error($snapshot)) {
            return $snapshot;
        }

        // La creación de snapshot libera su bloqueo; antes de exponer la
        // página revalidamos que nadie haya editado el documento entre ambos
        // pasos. En tal caso no publicamos una versión distinta de la que el
        // cliente revisó y el snapshot adicional deja evidencia recuperable.
        $current = $this->repository->describe_existing($document_id);
        if ($current === null) {
            return new WP_Error('cod_canvas_document_not_found', 'El documento Canvas dejó de estar disponible.');
        }
        if ((int) $current['revision'] !== $expected_revision) {
            return $this->revision_conflict($expected_revision, (int) $current['revision']);
        }

        $published = wp_update_post([
            'ID' => $page_id,
            'post_type' => 'page',
            'post_status' => 'publish',
            'post_content' => sprintf('[contope_canvas document_id="%s"]', esc_attr($document_id)),
        ], true);
        if (is_wp_error($published)) {
            return $published;
        }

        $published_page = $this->describe_canvas_page($page_id);
        if ($published_page === null) {
            return new WP_Error('cod_mcp_canvas_page_unavailable', 'La página Canvas no pudo leerse después de publicarla.');
        }

        return [
            'page' => $published_page,
            'snapshot' => $snapshot,
            'alreadyPublished' => false,
        ];
    }

    /** @return WP_Error */
    private function revision_conflict(int $expected_revision, int $actual_revision): WP_Error
    {
        $error = new WP_Error(
            'cod_canvas_revision_conflict',
            'La revisión de la página cambió; vuelve a consultar o previsualizar antes de aplicar la operación.'
        );
        $error->add_data([
            'expectedRevision' => $expected_revision,
            'actualRevision' => $actual_revision,
        ]);

        return $error;
    }

    /**
     * Duplica una página Canvas completa: crea una página WordPress NUEVA y un
     * documento de CUERPO NUEVO (projectData/html/css copiados del fuente).
     *
     * A diferencia de un duplicador genérico (que solo copia la cáscara de la
     * página y por eso termina "duplicando solo el header"), aquí el cuerpo sí
     * se recrea como un documento nuevo con id determinístico derivado del id
     * de la página nueva. NO se copian las metas de región
     * (regionKind/Scope/Targets/Excludes) ni los snapshots: el cuerpo de una
     * página NO es una región de tema, y el historial de snapshots pertenece a
     * la sesión de edición del documento fuente. El header/footer tampoco se
     * copian porque son regiones de tema que se resuelven en vivo por reglas
     * (COD_Template_Region_Resolver) contra la página que se está viendo, así
     * que la página nueva los recibe automáticamente por su propio ID.
     *
     * @param int $page_id ID de la página Canvas a duplicar.
     * @return array<string, mixed>|WP_Error ['pageId' => int, 'documentId' => string]
     */
    public function duplicate_page(int $page_id)
    {
        $source = get_post($page_id);
        if (!$source instanceof WP_Post || $source->post_type !== 'page') {
            return new WP_Error('cod_canvas_duplicate_not_page', 'La página a duplicar no existe o no es una página.');
        }

        $document_id = (string) get_post_meta($page_id, self::META_DOCUMENT_ID, true);
        if ($document_id === '') {
            return new WP_Error('cod_canvas_duplicate_not_canvas', 'Esta página no es una página Canvas.');
        }

        $document = $this->repository->load($document_id);
        if (is_wp_error($document)) {
            return new WP_Error('cod_canvas_duplicate_document_missing', 'El documento Canvas de la página fuente no se puede cargar.');
        }

        $title = trim((string) $source->post_title);
        $new_title = sprintf('%s — Copia', $title !== '' ? $title : 'Página ContOpe Canvas');

        // Creamos primero la página (sin content ni meta) para obtener su ID y
        // poder derivar el document_id estable del cuerpo nuevo. El título
        // colisionado lo resuelve WordPress solo añadiendo el sufijo al slug;
        // el content se construye igual que publish(), nunca copiando el content
        // fuente. El post_status se hereda del fuente (publish -> publish,
        // draft -> draft).
        $saved_id = wp_insert_post([
            'post_type' => 'page',
            'post_status' => $source->post_status,
            'post_title' => $new_title,
            'post_content' => '',
        ], true);
        if (is_wp_error($saved_id)) {
            return $saved_id;
        }
        $new_page_id = (int) $saved_id;

        $new_document_id = COD_Canvas_Editor_Admin::document_id_for_page($new_page_id);

        // projectData/html/css ya salieron sanitizados del repositorio, así que
        // se copian tal cual (igual que publish() los consume desde el repo).
        $saved = $this->repository->save(
            $new_document_id,
            (string) $document['projectData'],
            (string) $document['html'],
            (string) $document['css']
        );
        if (is_wp_error($saved)) {
            // La página quedó creada pero sin documento: se elimina para no
            // dejar una cáscara huérfana y se devuelve el error.
            wp_delete_post($new_page_id, true);
            return $saved;
        }

        $updated = wp_update_post([
            'ID' => $new_page_id,
            'post_content' => sprintf('[contope_canvas document_id="%s"]', esc_attr($new_document_id)),
        ], true);
        if (is_wp_error($updated)) {
            // Sin shortcode la página es una cáscara vacía: se elimina para no
            // dejar residuo visible, igual que en el fallo de save().
            wp_delete_post($new_page_id, true);
            return $updated;
        }
        update_post_meta($new_page_id, self::META_DOCUMENT_ID, $new_document_id);

        return [
            'pageId' => $new_page_id,
            'documentId' => $new_document_id,
        ];
    }

    /**
     * Crea una página WordPress nueva, vacía, con su documento Canvas propio
     * ya vinculado — para el botón "+ Nueva página" del editor. Mismo patrón
     * que duplicate_page(), sin copiar contenido de ninguna fuente: el
     * documento nuevo lo crea el repositorio en blanco (load() lo inicializa
     * si el post del documento todavía no existe).
     *
     * @return array<string, mixed>|WP_Error
     */
    public function create_page(string $title = '')
    {
        $post_title = trim($title) !== '' ? trim($title) : 'Página sin título';

        $saved_id = wp_insert_post([
            'post_type' => 'page',
            'post_status' => 'draft',
            'post_title' => $post_title,
            'post_content' => '',
        ], true);
        if (is_wp_error($saved_id)) {
            return $saved_id;
        }
        $new_page_id = (int) $saved_id;

        $new_document_id = COD_Canvas_Editor_Admin::document_id_for_page($new_page_id);

        $document = $this->repository->load($new_document_id);
        if (is_wp_error($document)) {
            wp_delete_post($new_page_id, true);
            return $document;
        }

        $updated = wp_update_post([
            'ID' => $new_page_id,
            'post_content' => sprintf('[contope_canvas document_id="%s"]', esc_attr($new_document_id)),
        ], true);
        if (is_wp_error($updated)) {
            wp_delete_post($new_page_id, true);
            return $updated;
        }
        update_post_meta($new_page_id, self::META_DOCUMENT_ID, $new_document_id);

        return [
            'pageId' => $new_page_id,
            'documentId' => $new_document_id,
            'title' => $post_title,
        ];
    }

    /** @return array<string, mixed>|null */
    public function current(string $document_id): ?array
    {
        $page_id = $this->find_page_id($document_id);
        return $page_id === null ? null : $this->describe_page($page_id);
    }

    /**
     * Lista páginas WordPress que ya están vinculadas a un documento Canvas.
     * No crea páginas ni documentos y omite la URL de administración, que es
     * un detalle de la interfaz local y no parte del contrato semántico.
     *
     * @return array<int, array<string, mixed>>
     */
    public function list_canvas_pages(): array
    {
        $page_ids = get_posts([
            'post_type' => 'page',
            'post_status' => 'any',
            'numberposts' => -1,
            'orderby' => 'ID',
            'order' => 'ASC',
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_key' => self::META_DOCUMENT_ID,
            'meta_compare' => 'EXISTS',
        ]);

        $pages = [];
        foreach ($page_ids as $page_id) {
            $page = $this->describe_canvas_page((int) $page_id);
            if ($page !== null) {
                $pages[] = $page;
            }
        }

        return $pages;
    }

    /**
     * Devuelve la identidad semántica de una página Canvas existente, o null
     * si el ID no es una página Canvas. No carga ni inicializa el documento.
     *
     * @return array<string, mixed>|null
     */
    public function describe_canvas_page(int $page_id): ?array
    {
        $post = get_post($page_id);
        if (!$post instanceof WP_Post || $post->post_type !== 'page') {
            return null;
        }

        $document_id = (string) get_post_meta($page_id, self::META_DOCUMENT_ID, true);
        if ($document_id === '') {
            return null;
        }

        $url = get_permalink($page_id);

        return [
            'pageId' => $page_id,
            'documentId' => $document_id,
            'title' => $post->post_title,
            'status' => $post->post_status,
            'url' => is_string($url) ? $url : '',
        ];
    }

    /** @param array<string, mixed> $attributes */
    /**
     * Emite el CSS del sitio en la CABECERA, antes de que haya nada pintado.
     *
     * Sin esto los estilos salían desde el render del contenido, o sea casi al
     * final del documento, y el navegador alcanzaba a pintar la página cruda:
     * el logotipo negro a pantalla completa y el menú como lista suelta.
     *
     * Resuelve lo mismo que el shortcode (documento propio más las regiones de
     * encabezado, cuerpo y pie) pero solo para quedarse con los estilos. Si algo
     * no se puede resolver acá, no pasa nada: el shortcode sigue emitiéndolos
     * como antes.
     */
    /**
     * CSS compartido por todas las páginas: clases reutilizables como
     * .cod-btn, no tokens de tema (eso ya lo cubre COD_Theme_Definitions)
     * ni contenido propio de una página. Se cachea por request porque se
     * pide desde dos puntos (la cabecera y, como respaldo, el shortcode).
     */
    private function shared_components_css(): string
    {
        if (self::$shared_css_cache !== null) {
            return self::$shared_css_cache;
        }
        $documento = $this->repository->load(COD_Canvas_Document_Repository::SHARED_STYLES_DOCUMENT_ID);
        self::$shared_css_cache = is_wp_error($documento) ? '' : (string) $documento['css'];
        return self::$shared_css_cache;
    }

    public function estilos_en_cabecera(): void
    {
        if (self::$css_ya_emitido || !is_singular()) {
            return;
        }
        $post = get_post();
        if (!$post) {
            return;
        }
        $contenido = (string) $post->post_content;
        if (!self::tiene_shortcode($contenido)) {
            return;
        }
        if (preg_match('/document_id=[\x22\x27]?([a-z0-9_-]+)/i', $contenido, $coincidencias) !== 1) {
            return;
        }
        $document = $this->repository->load(sanitize_key($coincidencias[1]));
        if (is_wp_error($document)) {
            return;
        }

        $post_id = (int) $post->ID;
        $body_css = (string) $document['css'];
        $body_html = (string) $document['html'];
        $header_css = '';
        $footer_css = '';
        $header_html = '';
        $footer_html = '';
        if ($this->region_resolver !== null && $post_id > 0) {
            $header = $this->region_resolver->resolve(
                COD_Canvas_Document_Repository::REGION_KIND_HEADER,
                $post_id
            );
            if ($header !== null) {
                $header_css = (string) $header['css'];
                $header_html = (string) $header['html'];
            }
            $footer = $this->region_resolver->resolve(
                COD_Canvas_Document_Repository::REGION_KIND_FOOTER,
                $post_id
            );
            if ($footer !== null) {
                $footer_css = (string) $footer['css'];
                $footer_html = (string) $footer['html'];
            }
            $body = $this->region_resolver->resolve(
                COD_Canvas_Document_Repository::REGION_KIND_BODY,
                $post_id
            );
            if ($body !== null && trim((string) $body['html']) !== '') {
                $body_css = (string) $body['css'];
                $body_html = (string) $body['html'];
            }
        }

        wp_register_style('cod-canvas-public', false, [], COD_PUBLISHER_VERSION);
        wp_enqueue_style('cod-canvas-public');
        wp_add_inline_style(
            'cod-canvas-public',
            // El núcleo va primero: lleva a los tokens del plugin lo que el tema
            // ya declara en su theme.json. Antes esos tokens no llegaban a
            // ninguna parte y el compilador tapaba el hueco con los colores del
            // panel de WordPress. Ver COD_Design_Core.
            COD_Design_Core::css() . COD_Theme_Definitions::css() . self::site_font_css() . $this->shared_components_css()
                . self::dynamic_group_css($header_html . $body_html . $footer_html)
                . self::rotation_css() . self::carousel_rows_css() . $header_css . $body_css . $footer_css
        );
        self::$css_ya_emitido = true;
    }

    public function render_shortcode(array $attributes): string
    {
        $document_id = sanitize_key((string) ($attributes['document_id'] ?? ''));
        if ($document_id === '') {
            return '';
        }
        $document = $this->repository->load($document_id);
        if (is_wp_error($document)) {
            return '';
        }

        // Header/footer are resolved live, at render time, against the real
        // page being viewed — not baked in at publish time. This is what
        // makes a global (or category-local) region propagate automatically
        // to every page that uses it without republishing each one.
        $post_id = (int) get_the_ID();
        $header_html = '';
        $footer_html = '';
        $header_css = '';
        $footer_css = '';
        // El cuerpo por defecto es el documento propio de la página. Una región
        // `body` que resuelve Y tiene HTML no vacío lo reemplaza (estilo Divi:
        // cuerpo dinámico ACF/tokens); si resuelve vacía, se conserva el
        // documento propio para no publicar nunca una página en blanco.
        $body_html = (string) $document['html'];
        $body_css = (string) $document['css'];
        $body_document_id = $document_id;
        if ($this->region_resolver !== null) {
            if ($post_id > 0) {
                $header = $this->region_resolver->resolve(
                    COD_Canvas_Document_Repository::REGION_KIND_HEADER,
                    $post_id
                );
                if ($header !== null) {
                    $header_html = (string) $header['html'];
                    $header_css = (string) $header['css'];
                }
                $footer = $this->region_resolver->resolve(
                    COD_Canvas_Document_Repository::REGION_KIND_FOOTER,
                    $post_id
                );
                if ($footer !== null) {
                    $footer_html = (string) $footer['html'];
                    $footer_css = (string) $footer['css'];
                }
                $body = $this->region_resolver->resolve(
                    COD_Canvas_Document_Repository::REGION_KIND_BODY,
                    $post_id
                );
                if ($body !== null && trim((string) $body['html']) !== '') {
                    $body_html = (string) $body['html'];
                    $body_css = (string) $body['css'];
                    $body_document_id = (string) $body['documentId'];
                }
            }
        }

        $site_font_css = self::site_font_css();
        $theme_css = COD_Design_Core::css() . COD_Theme_Definitions::css();
        wp_register_style('cod-canvas-public', false, [], COD_PUBLISHER_VERSION);
        wp_enqueue_style('cod-canvas-public');
        if (!self::$css_ya_emitido) {
            wp_add_inline_style(
                'cod-canvas-public',
                $theme_css . $site_font_css . $this->shared_components_css()
                    . self::dynamic_group_css($header_html . $body_html . $footer_html)
                    . self::rotation_css() . self::carousel_rows_css()
                    . $header_css . $body_css . $footer_css
            );
            self::$css_ya_emitido = true;
        }
        wp_enqueue_script(
            'cod-interactions',
            plugins_url('assets/js/cod-interactions.js', COD_PUBLISHER_FILE),
            [],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-canvas-public',
            plugins_url('assets/js/cod-canvas-public.js', COD_PUBLISHER_FILE),
            ['cod-interactions'],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-luma-matte-video',
            plugins_url('assets/js/cod-luma-matte-video.js', COD_PUBLISHER_FILE),
            [],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-preload',
            plugins_url('assets/js/cod-preload.js', COD_PUBLISHER_FILE),
            [],
            COD_PUBLISHER_VERSION,
            true
        );

        $whatsapp_number = preg_replace('/[^0-9]/', '', (string) get_option('cod_whatsapp_number', ''));

        $markup = '';
        if ($header_html !== '') {
            $markup .= '<header class="cod-canvas-region cod-canvas-region-header">' . $header_html . '</header>';
        }
        $markup .= '<div class="cod-canvas-published" data-cod-document-id="' . esc_attr($body_document_id) . '"'
            . ' data-cod-whatsapp-number="' . esc_attr((string) $whatsapp_number) . '">' .
            $body_html . '</div>';
        if ($footer_html !== '') {
            $markup .= '<footer class="cod-canvas-region cod-canvas-region-footer">' . $footer_html . '</footer>';
        }

        if ($this->token_resolver !== null) {
            $markup = $this->token_resolver->resolve($markup, $post_id);
        }

        // Los shortcodes se ejecutan al final, después de resolver los tokens
        // dinámicos: así un marcador puede llevar un valor ACF entre sus
        // atributos. Solo actúa sobre nodos marcados y de una lista permitida
        // (ver COD_Canvas_Shortcode_Renderer); nunca sobre el texto del diseño.
        $markup = (new COD_Canvas_Shortcode_Renderer())->render($markup);

        return $markup;
    }

    public function standalone_template(string $template): string
    {
        if (!is_singular('page')) {
            return $template;
        }
        $page_id = (int) get_queried_object_id();
        if ((string) get_post_meta($page_id, self::META_DOCUMENT_ID, true) === '') {
            return $template;
        }

        return COD_PUBLISHER_DIR . 'templates/canvas-document.php';
    }

    private function find_page_id(string $document_id): ?int
    {
        $ids = get_posts([
            'post_type' => 'page',
            'post_status' => 'any',
            'numberposts' => 1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_key' => self::META_DOCUMENT_ID,
            'meta_value' => $document_id,
        ]);
        return $ids === [] ? null : (int) $ids[0];
    }

    /** @return array<string, mixed> */
    private function describe_page(int $page_id): array
    {
        $post = get_post($page_id);
        return [
            'pageId' => $page_id,
            'title' => $post instanceof WP_Post ? $post->post_title : '',
            'status' => $post instanceof WP_Post ? $post->post_status : '',
            'url' => get_permalink($page_id),
            'editUrl' => get_edit_post_link($page_id, 'raw'),
        ];
    }
}
