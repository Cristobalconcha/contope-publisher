<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla experimental y aislada del editor ContOpe Canvas.
 *
 * No interviene en el importador de paquetes. Edita y persiste un documento
 * experimental con ID estable, que puede publicarse como una página Canvas.
 */
final class COD_Canvas_Editor_Admin
{
    public const PAGE_SLUG = 'contope-canvas-editor';
    public const PARENT_SLUG = 'contope-publisher';
    public const NONCE_ACTION = 'cod_canvas_editor';
    public const AJAX_LOAD = 'cod_canvas_editor_load';
    public const AJAX_SAVE = 'cod_canvas_editor_save';
    public const AJAX_RESOLVE_ASSETS = 'cod_canvas_editor_resolve_assets';
    public const AJAX_PUBLISH = 'cod_canvas_editor_publish';
    public const AJAX_SAVE_REGION = 'cod_canvas_editor_save_region';
    public const AJAX_RESOLVE_PAGE = 'cod_canvas_editor_resolve_page';
    public const AJAX_ACF_FIELDS = 'cod_canvas_editor_acf_fields';
    public const AJAX_SESSION_OPEN = 'cod_canvas_editor_session_open';
    public const AJAX_SNAPSHOTS_LIST = 'cod_canvas_editor_snapshots_list';
    public const AJAX_SNAPSHOT_LOAD = 'cod_canvas_editor_snapshot_load';
    /** "Guardar como módulo" (Súper-Módulo, MVP): guardar y listar bloques reutilizables. */
    public const AJAX_CUSTOM_MODULE_SAVE = 'cod_canvas_editor_custom_module_save';
    public const AJAX_CUSTOM_MODULE_LIST = 'cod_canvas_editor_custom_module_list';
    /** Botón "+ Nueva página" del editor: crea página + documento Canvas vinculados. */
    public const AJAX_CREATE_PAGE = 'cod_canvas_editor_create_page';
    /** Acción admin-post del duplicado de páginas Canvas. */
    public const ACTION_DUPLICATE = 'cod_canvas_duplicate_page';
    public const CAPABILITY = 'manage_options';

    /** Versión exacta del vendor incluido en `assets/vendor/grapesjs`. */
    public const GRAPESJS_VERSION = '0.23.4';

    /**
     * Prefijo de los document_id derivados de una página WordPress. El
     * documento aislado original (COD_Canvas_Document_Repository::DOCUMENT_ID)
     * no usa este prefijo y conserva su comportamiento actual.
     */
    public const PAGE_DOCUMENT_PREFIX = 'cod-canvas-page-';

    private string $hook_suffix = '';

    /**
     * Devuelve el ID estable de ContOpe Design para el documento Canvas del
     * cuerpo de una página WordPress específica. Es determinístico y no usa
     * el slug ni el ID numérico del post interno del repositorio.
     */
    public static function document_id_for_page(int $page_id): string
    {
        return self::PAGE_DOCUMENT_PREFIX . $page_id;
    }

    public function __construct(
        private COD_Canvas_Document_Repository $repository,
        private COD_Canvas_Document_Sanitizer $sanitizer,
        private COD_Canvas_Asset_Resolver $asset_resolver,
        private COD_Canvas_Page_Publisher $publisher,
        private COD_Template_Region_Resolver $region_resolver,
        private COD_Custom_Module_Library $custom_module_library
    ) {
    }

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_footer', [$this, 'render_visual_editor_page_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_ajax_' . self::AJAX_LOAD, [$this, 'handle_load']);
        add_action('wp_ajax_' . self::AJAX_SAVE, [$this, 'handle_save']);
        add_action('wp_ajax_' . self::AJAX_RESOLVE_ASSETS, [$this, 'handle_resolve_assets']);
        add_action('wp_ajax_' . self::AJAX_PUBLISH, [$this, 'handle_publish']);
        add_action('wp_ajax_' . self::AJAX_SAVE_REGION, [$this, 'handle_save_region']);
        add_action('wp_ajax_' . self::AJAX_RESOLVE_PAGE, [$this, 'handle_resolve_page']);
        add_action('wp_ajax_' . self::AJAX_ACF_FIELDS, [$this, 'handle_acf_fields']);
        add_action('wp_ajax_' . self::AJAX_SESSION_OPEN, [$this, 'handle_session_open']);
        add_action('wp_ajax_' . self::AJAX_SNAPSHOTS_LIST, [$this, 'handle_snapshots_list']);
        add_action('wp_ajax_' . self::AJAX_SNAPSHOT_LOAD, [$this, 'handle_snapshot_load']);
        add_action('wp_ajax_' . self::AJAX_CUSTOM_MODULE_SAVE, [$this, 'handle_custom_module_save']);
        add_action('wp_ajax_' . self::AJAX_CUSTOM_MODULE_LIST, [$this, 'handle_custom_module_list']);
        add_action('wp_ajax_' . self::AJAX_CREATE_PAGE, [$this, 'handle_create_page']);
        add_filter('page_row_actions', [$this, 'add_page_row_edit_with_ocd'], 10, 2);
        add_action('admin_post_' . self::ACTION_DUPLICATE, [$this, 'handle_duplicate_page']);
        add_action('admin_notices', [$this, 'render_duplicate_notices']);
    }

    /**
     * Adds an "Editar con OCD" row action to the Pages list. The destination is
     * the Canvas admin screen with the page ID and a nonce, so opening the
     * editor can pre-load the target page without changing the existing manual
     * page picker flow.
     */
    public function add_page_row_edit_with_ocd(array $actions, WP_Post $post): array
    {
        if (!current_user_can(self::CAPABILITY)) {
            return $actions;
        }

        $url = add_query_arg(
            [
                'page'    => self::PAGE_SLUG,
                'page_id' => $post->ID,
            ],
            admin_url('admin.php')
        );

        $actions['cod_canvas_editor'] = sprintf(
            '<a href="%s">%s</a>',
            esc_url(wp_nonce_url($url, self::NONCE_ACTION, 'cod_nonce')),
            esc_html__('Editar con OCD', 'contope-publisher')
        );

        // "Duplicar" SOLO para páginas Canvas (las que tienen documento de
        // cuerpo asociado). La duplicación la maneja este plugin y no un
        // duplicador externo, porque un duplicador genérico copia la cáscara
        // de la página sin crear el documento de cuerpo nuevo.
        if ((string) get_post_meta($post->ID, COD_Canvas_Page_Publisher::META_DOCUMENT_ID, true) !== '') {
            $duplicate_url = add_query_arg(
                [
                    'action' => self::ACTION_DUPLICATE,
                    'page_id' => $post->ID,
                ],
                admin_url('admin-post.php')
            );
            $actions['cod_canvas_duplicate'] = sprintf(
                '<a href="%s">%s</a>',
                esc_url(wp_nonce_url($duplicate_url, self::NONCE_ACTION, 'cod_nonce')),
                esc_html__('Duplicar', 'contope-publisher')
            );
        }

        return $actions;
    }

    /**
     * Handler admin-post del duplicado de páginas Canvas.
     *
     * Valida nonce y capacidad, delega en publisher->duplicate_page() y, según
     * el estado editorial de la página nueva, redirige al editor en línea
     * (publish) o al editor de WordPress (draft). Los errores vuelven al listado
     * de páginas con un notice vía ?cod-dup-error=.
     */
    public function handle_duplicate_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para duplicar esta página.', 'contope-publisher'));
        }
        check_admin_referer(self::NONCE_ACTION, 'cod_nonce');

        $page_id = isset($_GET['page_id']) ? absint(wp_unslash($_GET['page_id'])) : 0;
        if ($page_id <= 0) {
            wp_safe_redirect(add_query_arg(
                ['cod-dup-error' => 'ID de página inválido.'],
                admin_url('edit.php?post_type=page')
            ));
            exit;
        }

        $result = $this->publisher->duplicate_page($page_id);
        if (is_wp_error($result)) {
            wp_safe_redirect(add_query_arg(
                ['cod-dup-error' => $result->get_error_message()],
                admin_url('edit.php?post_type=page')
            ));
            exit;
        }

        $new_page_id = (int) $result['pageId'];

        // La página nueva hereda el estado del fuente: si quedó publicada se
        // abre en el editor en línea (el shell inline ya existe y la meta de
        // documento la hace editable); si quedó en draft no hay permalink
        // estable para el modo inline, así que se redirige al editor de WP.
        if (get_post_status($new_page_id) === 'publish') {
            $edit_url = add_query_arg(
                [
                    COD_Inline_Editor_Frontend::QUERY_EDIT => 1,
                    COD_Inline_Editor_Frontend::QUERY_NONCE => wp_create_nonce(COD_Inline_Editor_Frontend::NONCE_ACTION),
                ],
                get_permalink($new_page_id)
            );
            wp_safe_redirect($edit_url);
        } else {
            $edit_link = get_edit_post_link($new_page_id, 'raw');
            wp_safe_redirect($edit_link !== null ? $edit_link : admin_url('edit.php?post_type=page'));
        }
        exit;
    }

    /**
     * Muestra un notice de error del duplicado, escapado, solo en pantallas
     * admin y para quien tiene la capacidad. El mensaje llega por
     * ?cod-dup-error= tras un redirect al listado de páginas.
     */
    public function render_duplicate_notices(): void
    {
        if (!is_admin() || !current_user_can(self::CAPABILITY)) {
            return;
        }
        if (!isset($_GET['cod-dup-error']) || !is_string($_GET['cod-dup-error'])) {
            return;
        }
        $message = sanitize_text_field(wp_unslash($_GET['cod-dup-error']));
        if ($message === '') {
            return;
        }
        echo '<div class="notice notice-error is-dismissible"><p>' . esc_html($message) . '</p></div>';
    }

    /**
     * Resolves the page ID passed in the URL for auto-loading, only when the
     * request carries a valid nonce and a real WordPress page.
     */
    private function resolve_auto_load_page_id(): int
    {
        if (!isset($_GET['page_id'])) {
            return 0;
        }

        $page_id = absint(wp_unslash($_GET['page_id']));
        if ($page_id <= 0) {
            return 0;
        }

        check_admin_referer(self::NONCE_ACTION, 'cod_nonce');

        $page = get_post($page_id);
        if (!$page instanceof WP_Post || $page->post_type !== 'page') {
            return 0;
        }

        return $page_id;
    }

    /**
     * Resolves a region document ID passed directly in the URL (e.g. from
     * the Theme Builder's "Editar en el editor Canvas" link), only when the
     * request carries a valid nonce and the document actually exists. Only
     * consulted when no `page_id` was given, since a page always takes
     * priority over a raw document_id.
     */
    private function resolve_auto_load_document_id(): string
    {
        if (!isset($_GET['document_id'])) {
            return '';
        }

        $document_id = sanitize_key((string) wp_unslash($_GET['document_id']));
        if ($document_id === '') {
            return '';
        }

        check_admin_referer(self::NONCE_ACTION, 'cod_nonce');

        $document = $this->repository->load($document_id);
        if (is_wp_error($document)) {
            return '';
        }

        return $document_id;
    }

    public function add_menu(): void
    {
        $hook_suffix = add_submenu_page(
            self::PARENT_SLUG,
            'ContOpe Canvas (Experimental)',
            'Editor visual',
            self::CAPABILITY,
            self::PAGE_SLUG,
            [$this, 'render_page']
        );
        $this->hook_suffix = is_string($hook_suffix) ? $hook_suffix : '';
    }

    /** Añade un tercer nivel visual con accesos directos a las páginas. */
    public function render_visual_editor_page_menu(): void
    {
        if (!current_user_can(self::CAPABILITY)) return;
        $items = [];
        foreach (get_pages(['post_status' => ['publish', 'draft', 'pending', 'future'], 'sort_column' => 'post_title']) as $page) {
            $title = trim((string) $page->post_title);
            $url = add_query_arg(['page' => self::PAGE_SLUG, 'page_id' => $page->ID, 'cod_nonce' => wp_create_nonce(self::NONCE_ACTION)], admin_url('admin.php'));
            $items[] = ['title' => $title !== '' ? $title : sprintf('(Sin título) #%d', $page->ID), 'url' => $url];
        }
        ?>
        <style>
            #adminmenu .cod-visual-pages { display:none; position:absolute; z-index:10000; left:100%; top:0; width:260px; max-height:70vh; overflow:auto; margin:0; padding:6px 0; background:#1d2327; box-shadow:4px 4px 12px #0005; }
            #adminmenu li:hover > .cod-visual-pages, #adminmenu li:focus-within > .cod-visual-pages { display:block; }
            #adminmenu .cod-visual-pages a { display:block; padding:7px 12px; color:#dcdcde; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            #adminmenu .cod-visual-pages a:hover, #adminmenu .cod-visual-pages a:focus { color:#72aee6; background:#2c3338; }
        </style>
        <script>
        (function () {
            var link = document.querySelector('#adminmenu a[href="admin.php?page=<?php echo esc_js(self::PAGE_SLUG); ?>"]');
            if (!link || !link.parentElement || link.parentElement.querySelector('.cod-visual-pages')) return;
            var pages = <?php echo wp_json_encode($items); ?>;
            var list = document.createElement('ul'); list.className = 'cod-visual-pages';
            pages.forEach(function (page) { var item = document.createElement('li'); var anchor = document.createElement('a'); anchor.href = page.url; anchor.textContent = page.title; anchor.title = 'Editar visualmente: ' + page.title; item.appendChild(anchor); list.appendChild(item); });
            link.parentElement.style.position = 'relative'; link.parentElement.appendChild(list);
        }());
        </script>
        <?php
    }

    public function enqueue_assets(string $hook_suffix): void
    {
        if ($this->hook_suffix === '' || $hook_suffix !== $this->hook_suffix) {
            return;
        }
        if (!current_user_can(self::CAPABILITY)) {
            return;
        }

        wp_enqueue_style(
            'cod-grapesjs',
            plugins_url('assets/vendor/grapesjs/grapes.min.css', COD_PUBLISHER_FILE),
            [],
            self::GRAPESJS_VERSION
        );
        wp_enqueue_style(
            'cod-canvas-editor',
            plugins_url('assets/css/cod-canvas-editor.css', COD_PUBLISHER_FILE),
            ['cod-grapesjs'],
            COD_PUBLISHER_VERSION
        );
        wp_enqueue_script(
            'cod-grapesjs',
            plugins_url('assets/vendor/grapesjs/grapes.min.js', COD_PUBLISHER_FILE),
            [],
            self::GRAPESJS_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-interactions',
            plugins_url('assets/js/cod-interactions.js', COD_PUBLISHER_FILE),
            [],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-computed-inspector',
            plugins_url('assets/js/cod-computed-inspector.js', COD_PUBLISHER_FILE),
            ['cod-grapesjs', 'cod-interactions'],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-canvas-grid',
            plugins_url('assets/js/cod-canvas-grid.global.js', COD_PUBLISHER_FILE),
            ['cod-grapesjs'],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-grid-controls',
            plugins_url('assets/js/cod-grid-controls.js', COD_PUBLISHER_FILE),
            ['cod-grapesjs', 'cod-computed-inspector', 'cod-canvas-grid'],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-behaviors',
            plugins_url('assets/js/cod-behaviors.js', COD_PUBLISHER_FILE),
            ['cod-grapesjs'],
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
            'cod-editor-core',
            plugins_url('assets/js/cod-editor-core.js', COD_PUBLISHER_FILE),
            ['cod-grapesjs', 'cod-computed-inspector', 'cod-canvas-grid', 'cod-grid-controls', 'cod-behaviors', 'cod-luma-matte-video', 'cod-interactions'],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-canvas-editor',
            plugins_url('assets/js/cod-canvas-editor.js', COD_PUBLISHER_FILE),
            ['cod-editor-core'],
            COD_PUBLISHER_VERSION,
            true
        );
        // Inspector modal por componente (primera versión, sólo Título/cod-heading).
        // Se monta después de cod-canvas-editor para poder leer window.ocdCanvas.
        wp_enqueue_script(
            'cod-inspector-modal',
            plugins_url('assets/js/cod-inspector-modal.js', COD_PUBLISHER_FILE),
            ['cod-canvas-editor'],
            COD_PUBLISHER_VERSION,
            true
        );

        $auto_load_page_id = $this->resolve_auto_load_page_id();
        $auto_load_document_id = $auto_load_page_id > 0 ? '' : $this->resolve_auto_load_document_id();
        if ($auto_load_page_id > 0) {
            // El document_id real es el guardado en la meta de la página, NO
            // necesariamente "cod-canvas-page-{ID}": ese nombre asume que el
            // ID numérico de WordPress nunca cambió, lo cual es falso en
            // cualquier sitio migrado (el document_id viaja con el paquete de
            // Portabilidad, el ID numérico de post lo asigna cada instalación
            // por su cuenta). Usar la convención acá era exactamente el bug
            // detrás de "Editar con OCD" mostrando una página en blanco.
            $real_document_id = (string) get_post_meta(
                $auto_load_page_id,
                COD_Canvas_Page_Publisher::META_DOCUMENT_ID,
                true
            );
            $document_id = $real_document_id !== '' ? $real_document_id : self::document_id_for_page($auto_load_page_id);
        } elseif ($auto_load_document_id !== '') {
            $document_id = $auto_load_document_id;
        } else {
            // Sin page_id ni document_id explícitos en la URL: no hay ninguna
            // página elegida todavía. Antes acá se caía a un documento
            // experimental genérico y se mostraba igual, como si fuera la
            // página elegida — confuso, porque no lo era. El lienzo arranca
            // vacío hasta que el usuario elige una página con el selector.
            $document_id = '';
        }
        $document = $document_id !== '' ? $this->repository->load($document_id) : null;
        $config = [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce(self::NONCE_ACTION),
            'loadAction' => self::AJAX_LOAD,
            'saveAction' => self::AJAX_SAVE,
            'resolveAssetsAction' => self::AJAX_RESOLVE_ASSETS,
            'publishAction' => self::AJAX_PUBLISH,
            'saveRegionAction' => self::AJAX_SAVE_REGION,
            'resolvePageAction' => self::AJAX_RESOLVE_PAGE,
            'acfFieldsAction' => self::AJAX_ACF_FIELDS,
            'customModuleSaveAction' => self::AJAX_CUSTOM_MODULE_SAVE,
            'customModuleListAction' => self::AJAX_CUSTOM_MODULE_LIST,
            'createPageAction' => self::AJAX_CREATE_PAGE,
            'snapshotsListAction' => self::AJAX_SNAPSHOTS_LIST,
            'snapshotLoadAction' => self::AJAX_SNAPSHOT_LOAD,
            'sessionOpenAction' => self::AJAX_SESSION_OPEN,
            'documentId' => $document_id,
            'document' => (!is_wp_error($document) && $document !== null) ? $document : null,
            'loadError' => is_wp_error($document) ? $document->get_error_message() : '',
            'publishedPage' => $document_id !== '' ? $this->publisher->current($document_id) : null,
            'pageTitle' => $auto_load_page_id > 0 ? get_the_title($auto_load_page_id) : '',
            'regionKinds' => COD_Canvas_Document_Repository::REGION_KINDS,
            'regionDocuments' => $this->repository->list_region_documents(),
            'ruleChoices' => [
                'pages' => $this->rule_page_choices(),
                'categories' => $this->rule_term_choices('category'),
                'tags' => $this->rule_term_choices('post_tag'),
            ],
            'autoLoadPageId' => $this->resolve_auto_load_page_id(),
            // Este bloque es el CSS del sitio que el lienzo necesita para verse
            // como se verá publicado (va al <style data-cod-site-css>): tipografías
            // y el giro de imágenes, para que girar en el inspector se vea al
            // instante y no recién al publicar.
            'siteFontCss' => COD_Canvas_Page_Publisher::site_font_css() . COD_Canvas_Page_Publisher::rotation_css() . COD_Canvas_Page_Publisher::carousel_rows_css() . COD_Canvas_Page_Publisher::shortcode_marker_css(),
            'themeDefinitionsCss' => COD_Theme_Definitions::css(),
            // Base pública del sitio para las vistas en iframe del canvas
            // (p. ej. la preview del bloque "Formulario Orugantt").
            'siteUrl' => home_url('/'),
            // Formularios publicados de Orugantt Forms (OF-BRIDGE). Vacío si
            // el plugin está inactivo, desactualizado o sin forms publicados;
            // con lista vacía el JS no registra el bloque.
            'oruganttForms' => $this->orugantt_forms_config(),
            // Variables de diseño publicadas por el runtime de formularios:
            // con ellas el inspector arma sus controles. Lista vacía = sin
            // pestaña de diseño (nunca controles que no hacen nada).
            'oruganttFormTokens' => $this->orugantt_form_tokens_config(),
        ];

        // JSON_HEX_TAG evita cualquier salida de `<` dentro del script en línea.
        wp_add_inline_script(
            'cod-canvas-editor',
            'window.ocdCanvasEditor = ' . wp_json_encode(
                $config,
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            ) . ';',
            'before'
        );
    }

    /**
     * Construye las opciones legibles para el picker de reglas de región:
     * páginas, categorías y etiquetas. Los IDs van como enteros y los títulos
     * pasan por sanitize_text_field() porque viajan en la configuración del
     * cliente vía wp_json_encode() con JSON_HEX_*, y en el cliente sólo se usan
     * para resolver nombres legibles (nunca como identidad).
     *
     * @return array<int, array{id: int, title: string}>
     */
    private function rule_page_choices(): array
    {
        $pages = [];
        foreach (get_pages(['post_status' => ['publish', 'draft', 'pending', 'future']]) as $page) {
            $title = trim((string) $page->post_title);
            $label = $title !== '' ? $title : sprintf('(Sin título) #%d', $page->ID);
            $pages[] = [
                'id' => (int) $page->ID,
                'title' => sanitize_text_field($label),
            ];
        }
        return $pages;
    }

    /**
     * @return array<int, array{id: int, name: string}>
     */
    private function rule_term_choices(string $taxonomy): array
    {
        $terms = get_terms(['taxonomy' => $taxonomy, 'hide_empty' => false]);
        if (is_wp_error($terms) || !is_array($terms)) {
            return [];
        }
        $choices = [];
        foreach ($terms as $term) {
            $choices[] = [
                'id' => (int) $term->term_id,
                'name' => sanitize_text_field((string) $term->name),
            ];
        }
        return $choices;
    }

    /**
     * Formularios publicados de Orugantt Forms para el bloque del Canvas
     * (OF-BRIDGE). Defensivo: si el plugin no está activo o su runtime no
     * expone published_forms() (versión antigua), devuelve lista vacía y el
     * editor no registra el bloque.
     *
     * @return array<int, array{slug: string, title: string}>
     */
    private function orugantt_forms_config(): array
    {
        if (!class_exists('OFR_Runtime') || !method_exists('OFR_Runtime', 'published_forms')) {
            return [];
        }
        $forms = [];
        foreach (OFR_Runtime::published_forms() as $form) {
            $slug = isset($form['slug']) ? sanitize_title((string) $form['slug']) : '';
            if ($slug === '') {
                continue;
            }
            $title = isset($form['title']) ? trim((string) $form['title']) : '';
            $forms[] = [
                'slug' => $slug,
                'title' => $title !== '' ? sanitize_text_field($title) : $slug,
            ];
        }
        return $forms;
    }

    /**
     * Variables de diseño que el runtime de formularios publica, para armar
     * los controles del inspector.
     *
     * La lista NO se escribe acá: la publica el propio plugin de formularios.
     * Si no está instalado, se devuelve vacía y el inspector simplemente no
     * muestra la pestaña de diseño — nunca controles que no hacen nada.
     *
     * @return array<int, array{key: string, token: string, label: string, type: string, group: string, curated: bool}>
     */
    private function orugantt_form_tokens_config(): array
    {
        if (!class_exists('OFR_Design_Tokens')) {
            return [];
        }

        $curadas = array_keys(OFR_Design_Tokens::curated());
        $salida = [];
        foreach (OFR_Design_Tokens::advanced() as $clave => $def) {
            if (!is_array($def) || !isset($def['token'], $def['label'], $def['type'])) {
                continue;
            }
            $salida[] = [
                'key' => (string) $clave,
                'token' => (string) $def['token'],
                'label' => sanitize_text_field((string) $def['label']),
                'type' => (string) $def['type'],
                'group' => sanitize_text_field((string) ($def['group'] ?? 'Diseño')),
                'curated' => in_array($clave, $curadas, true),
            ];
        }

        return $salida;
    }

    public function render_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para abrir el editor Canvas.', 'contope-publisher'));
        }
        ?>
        <div class="wrap cod-canvas-wrap">
            <div class="cod-canvas-toolbar">
                <button type="button" class="button button-primary" id="cod-canvas-save">Guardar</button>
                <button type="button" class="button" id="cod-canvas-reload">Recargar</button>
                <button type="button" class="button" id="cod-canvas-export-html">Exportar HTML</button>
                <button type="button" class="button" id="cod-canvas-export-css">Exportar CSS</button>
                <button type="button" class="button" id="cod-canvas-toggle-import" aria-expanded="false" aria-controls="cod-canvas-import">
                    Importar HTML/CSS
                </button>
                <label class="cod-canvas-title-label" for="cod-canvas-page-title">Título público</label>
                <input type="text" id="cod-canvas-page-title" value="Página ContOpe Canvas" maxlength="160">
                <label class="cod-canvas-title-label" for="cod-canvas-zoom">Zoom</label>
                <select id="cod-canvas-zoom">
                    <option value="fit">Ajustar a pantalla</option>
                    <option value="100">100%</option>
                    <option value="75">75%</option>
                    <option value="50">50%</option>
                </select>
                <label class="cod-canvas-title-label" for="cod-canvas-width">Ancho de página</label>
					<select id="cod-canvas-width">
                    <option value="1920">1920px</option>
                    <option value="1440">1440px</option>
                    <option value="1280">1280px</option>
					</select>
					<label class="cod-canvas-title-label" for="cod-canvas-height">Alto vista</label>
					<input type="number" id="cod-canvas-height" min="240" max="2000" step="1" value="1080" aria-label="Alto de la previsualización en píxeles">
                <button type="button" class="button button-primary" id="cod-canvas-publish">Publicar/actualizar página</button>
                <a id="cod-canvas-view-page" class="button" href="#" target="_blank" rel="noopener" hidden>Ver página</a>
                <span class="cod-canvas-status" id="cod-canvas-status" role="status" aria-live="polite"></span>
            </div>

            <div class="cod-canvas-import" id="cod-canvas-import" hidden>
                <p class="description">
                    Pega o carga HTML y CSS. La importación sólo afecta al lienzo; nada se guarda hasta pulsar
                    <strong>Guardar</strong>.
                </p>
                <div class="cod-canvas-import-grid">
                    <p>
                        <label for="cod-canvas-import-html"><strong>HTML</strong></label><br>
                        <input type="file" id="cod-canvas-import-html-file" accept="text/html,.html,.htm"><br>
                        <textarea id="cod-canvas-import-html" rows="8" spellcheck="false"></textarea>
                    </p>
                    <p>
                        <label for="cod-canvas-import-css"><strong>CSS</strong></label><br>
                        <input type="file" id="cod-canvas-import-css-file" accept="text/css,.css"><br>
                        <textarea id="cod-canvas-import-css" rows="8" spellcheck="false"></textarea>
                    </p>
                </div>
                <p>
                    <button type="button" class="button button-secondary" id="cod-canvas-import-apply">Cargar en el lienzo</button>
                </p>
            </div>

            <span class="screen-reader-text">Revisión <strong id="cod-canvas-revision">—</strong>, actualizado <strong id="cod-canvas-updated">—</strong></span>

            <div class="cod-canvas-page-editor">
                <div class="cod-canvas-page-picker">
                    <label for="cod-page-target">Página objetivo</label>
                    <select id="cod-page-target">
                        <option value="">Elegir página…</option>
                        <?php
                        // get_pages() sin argumentos solo trae páginas publicadas; las
                        // páginas nuevas creadas con "+ Nueva página" quedan como
                        // borrador (ver COD_Canvas_Page_Publisher::create_page()), así
                        // que sin este override desaparecían del selector en cuanto se
                        // recargaba la pantalla, aunque seguían intactas en la base de
                        // datos (confirmado 2026-08-21).
                        foreach (get_pages(['post_status' => ['publish', 'draft', 'pending', 'future']]) as $page) :
                            $document_id = (string) get_post_meta($page->ID, COD_Canvas_Page_Publisher::META_DOCUMENT_ID, true);
                            $title = trim((string) $page->post_title);
                            $option_label = $title !== '' ? $title : sprintf('(Sin título) #%d', $page->ID);
                            if ($document_id !== '') {
                                $option_label .= ' — Canvas';
                            }
                            ?>
                            <option value="<?php echo esc_attr((string) $page->ID); ?>" data-document-id="<?php echo esc_attr($document_id); ?>"><?php echo esc_html($option_label); ?></option>
                        <?php endforeach; ?>
                    </select>
                    <button type="button" class="button button-primary" id="cod-page-load">Cargar página</button>
                    <button type="button" class="button" id="cod-page-create">+ Nueva página</button>
                    <button type="button" class="button" id="cod-snapshots-open">Versiones anteriores</button>
                    <span class="cod-canvas-status" id="cod-canvas-page-status" role="status" aria-live="polite"></span>
                </div>
            </div>

            <div class="cod-canvas-assembled">
                <div class="cod-assembled-slot cod-assembled-slot--body" data-cod-slot="body">
                    <div class="cod-assembled-slot-preview" data-cod-slot-preview="body" role="button" tabindex="0" hidden></div>
                    <div class="cod-assembled-slot-canvas" data-cod-slot-canvas="body">
                        <div class="cod-canvas-editor-shell" id="cod-canvas-editor-shell">
                            <div class="cod-canvas-side-tabs" role="tablist" aria-label="Panel lateral del editor">
							<button type="button" class="button" role="tab" data-cod-side-panel="components" aria-selected="false" title="Agregar componentes y ordenar la estructura de la página">
								Agregar y ordenar
                                </button>
							<button type="button" class="button button-primary" role="tab" data-cod-side-panel="inspector" aria-selected="true" title="Editar contenido, tamaño, posición y apariencia del elemento seleccionado">
								Editar diseño
                                </button>
                            </div>

                            <div class="cod-canvas-workspace" data-cod-active-panel="inspector">
                                <div id="cod-canvas-editor-root" class="cod-canvas-editor-root"></div>
                                <aside id="cod-canvas-inspector" class="cod-canvas-inspector" aria-label="Inspector de diseño efectivo"></aside>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
        <?php
    }

    /**
     * Reads `document_id` from the current request, falling back to the
     * legacy single-document constant when absent so existing callers (and
     * the original experimental document) keep working unchanged. Centralized
     * here so every AJAX handler resolves the target document the same way —
     * a copy-pasted fallback in each handler is exactly how one of them could
     * silently keep writing to the wrong (legacy) document after this class
     * grew multi-document support.
     */
    private function resolve_document_id_from_request(): string
    {
        $raw = isset($_POST['document_id']) ? sanitize_key((string) wp_unslash($_POST['document_id'])) : '';
        return $raw === '' ? COD_Canvas_Document_Repository::DOCUMENT_ID : $raw;
    }

    public function handle_load(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $document = $this->repository->load($this->resolve_document_id_from_request());
        if (is_wp_error($document)) {
            wp_send_json_error(['message' => $document->get_error_message()], 500);
        }

        wp_send_json_success($document);
    }

    public function handle_save(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $document_id = $this->resolve_document_id_from_request();
        $raw_project = isset($_POST['project_data']) ? (string) wp_unslash($_POST['project_data']) : '';
        $raw_html = isset($_POST['html']) ? (string) wp_unslash($_POST['html']) : '';
        $raw_css = isset($_POST['css']) ? (string) wp_unslash($_POST['css']) : '';

        $project_data = $this->sanitizer->sanitize_project_data($raw_project);
        if (is_wp_error($project_data)) {
            wp_send_json_error(['message' => $project_data->get_error_message(), 'code' => $project_data->get_error_code()], 400);
        }
        $html = $this->sanitizer->sanitize_html($raw_html);
        if (is_wp_error($html)) {
            wp_send_json_error(['message' => $html->get_error_message(), 'code' => $html->get_error_code()], 400);
        }
        $css = $this->sanitizer->sanitize_css($raw_css);
        if (is_wp_error($css)) {
            wp_send_json_error(['message' => $css->get_error_message(), 'code' => $css->get_error_code()], 400);
        }

        // Snapshots de sesión OPCIONALES. Solo el guardado del editor en línea
        // envía `snapshot_session` (y opcionalmente `snapshot_label`): el
        // autosave del editor admin (1200ms) NO los envía y por tanto NO crea
        // snapshots, para no llenar el historial con cada autoguardado. El
        // snapshot captura el estado ANTERIOR al guardado (de ahí que se cree
        // antes de persistir): es el "antes del guardado N" que permite
        // restaurar en M5.
        $snapshot_session = isset($_POST['snapshot_session']) ? (string) wp_unslash($_POST['snapshot_session']) : '';
        if ($snapshot_session !== '' && preg_match('/^[a-z0-9-]{1,64}$/', $snapshot_session)) {
            $snapshot_label = isset($_POST['snapshot_label']) ? sanitize_text_field((string) wp_unslash($_POST['snapshot_label'])) : '';
            if ($snapshot_label === '') {
                $snapshot_label = 'guardado';
            }
            $snapshot_label = function_exists('mb_substr')
                ? mb_substr($snapshot_label, 0, 120)
                : substr($snapshot_label, 0, 120);
            $this->repository->create_snapshot($document_id, $snapshot_session, $snapshot_label);
        }

        $saved = $this->repository->save(
            $document_id,
            $project_data,
            $html,
            $css
        );
        if (is_wp_error($saved)) {
            wp_send_json_error(['message' => $saved->get_error_message()], 500);
        }

        wp_send_json_success($saved);
    }

    public function handle_resolve_assets(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $raw = isset($_POST['asset_refs']) ? (string) wp_unslash($_POST['asset_refs']) : '[]';
        $references = json_decode($raw, true, 8);
        if (!is_array($references)) {
            wp_send_json_error(['message' => 'La lista de activos no es JSON válido.'], 400);
        }
        wp_send_json_success($this->asset_resolver->resolve($references));
    }

    public function handle_publish(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $document_id = $this->resolve_document_id_from_request();
        $raw_project = isset($_POST['project_data']) ? (string) wp_unslash($_POST['project_data']) : '';
        $raw_html = isset($_POST['html']) ? (string) wp_unslash($_POST['html']) : '';
        $raw_css = isset($_POST['css']) ? (string) wp_unslash($_POST['css']) : '';

        $project_data = $this->sanitizer->sanitize_project_data($raw_project);
        if (is_wp_error($project_data)) {
            wp_send_json_error(['message' => $project_data->get_error_message(), 'stage' => 'project_data'], 400);
        }
        $html = $this->sanitizer->sanitize_html($raw_html);
        if (is_wp_error($html)) {
            wp_send_json_error(['message' => $html->get_error_message(), 'stage' => 'html'], 400);
        }
        $css = $this->sanitizer->sanitize_css($raw_css);
        if (is_wp_error($css)) {
            wp_send_json_error(['message' => $css->get_error_message(), 'stage' => 'css'], 400);
        }

        $saved = $this->repository->save(
            $document_id,
            $project_data,
            $html,
            $css
        );
        if (is_wp_error($saved)) {
            wp_send_json_error(['message' => $saved->get_error_message(), 'stage' => 'save'], 500);
        }

        $title = isset($_POST['title']) ? sanitize_text_field((string) wp_unslash($_POST['title'])) : '';
        // No adivinamos el page_id desde el document_id (no es portable entre
        // instalaciones): dejamos que publish() lo resuelva por el postmeta
        // real (_cod_canvas_document_id), igual que hace para documentos sin
        // página anclada.
        $published = $this->publisher->publish($document_id, $title, 0);
        if (is_wp_error($published)) {
            wp_send_json_error(['message' => $published->get_error_message(), 'stage' => 'publish'], 400);
        }
        $published['revision'] = (int) $saved['revision'];
        $published['updatedAt'] = (string) $saved['updatedAt'];
        wp_send_json_success($published);
    }

    /**
     * Persists the Header/Body/Footer role, global/local scope, and (for
     * local) the page/category targets for a document. Does not touch its
     * projectData/html/css — that stays through AJAX_SAVE as before.
     */
    public function handle_save_region(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $document_id = isset($_POST['document_id']) ? sanitize_key((string) wp_unslash($_POST['document_id'])) : '';
        if ($document_id === '') {
            wp_send_json_error(['message' => 'document_id es obligatorio.'], 400);
        }

        $kind = isset($_POST['region_kind']) ? sanitize_key((string) wp_unslash($_POST['region_kind'])) : '';
        $scope = isset($_POST['region_scope']) ? sanitize_key((string) wp_unslash($_POST['region_scope'])) : '';

        $raw_targets = isset($_POST['region_targets']) ? (string) wp_unslash($_POST['region_targets']) : '[]';
        $decoded_targets = json_decode($raw_targets, true, 8);
        $targets = COD_Canvas_Document_Repository::sanitize_match_rules($decoded_targets ?? []);
        if (is_wp_error($targets)) {
            wp_send_json_error(['message' => $targets->get_error_message(), 'code' => $targets->get_error_code()], 400);
        }

        $raw_excludes = isset($_POST['region_excludes']) ? (string) wp_unslash($_POST['region_excludes']) : '[]';
        $decoded_excludes = json_decode($raw_excludes, true, 8);
        $excludes = COD_Canvas_Document_Repository::sanitize_match_rules($decoded_excludes ?? []);
        if (is_wp_error($excludes)) {
            wp_send_json_error(['message' => $excludes->get_error_message(), 'code' => $excludes->get_error_code()], 400);
        }

        $saved = $this->repository->save_region($document_id, $kind, $scope, $targets, $excludes);
        if (is_wp_error($saved)) {
            wp_send_json_error(['message' => $saved->get_error_message(), 'code' => $saved->get_error_code()], 400);
        }

        wp_send_json_success($saved);
    }

    /**
     * Resolves the Header/Body/Footer documents that apply to a target
     * WordPress page, so the editor can show all three assembled together
     * (segment-scoped editing: only one is active/editable at a time, but
     * all three render so their visual relationship — spacing, overlap — is
     * judged in context instead of guessed across separate screens).
     */
    public function handle_resolve_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $page_id = isset($_POST['page_id']) ? absint(wp_unslash($_POST['page_id'])) : 0;
        if ($page_id <= 0) {
            wp_send_json_error(['message' => 'page_id debe ser un entero positivo.'], 400);
        }
        $page = get_post($page_id);
        if (!$page instanceof WP_Post || $page->post_type !== 'page') {
            wp_send_json_error(['message' => 'No existe una página con ese ID.'], 404);
        }

        $regions = [];
        foreach (COD_Canvas_Document_Repository::REGION_KINDS as $kind) {
            $regions[$kind] = $this->region_resolver->resolve($kind, $page_id);
        }

        wp_send_json_success([
            'pageId' => $page_id,
            'pageTitle' => $page->post_title,
            'regions' => $regions,
        ]);
    }

    /**
     * Lists the ACF fields assigned to a specific post/page so the Canvas
     * editor can offer them as draggable dynamic blocks. Uses ACF's
     * `get_field_objects()` only when ACF is active; otherwise (or when the
     * post has no fields) it returns an empty list instead of failing.
     */
    public function handle_acf_fields(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $page_id = isset($_POST['page_id']) ? absint(wp_unslash($_POST['page_id'])) : 0;
        if ($page_id <= 0) {
            wp_send_json_error(['message' => 'page_id debe ser un entero positivo.'], 400);
        }
        $post = get_post($page_id);
        if (!$post instanceof WP_Post) {
            wp_send_json_success(['fields' => []]);
        }

        if (!function_exists('get_field_objects')) {
            wp_send_json_success(['fields' => []]);
        }

        $objects = get_field_objects($page_id);
        if (!is_array($objects)) {
            wp_send_json_success(['fields' => []]);
        }

        $fields = [];
        foreach ($objects as $field) {
            if (!is_array($field) || !isset($field['name'])) {
                continue;
            }
            $name = (string) $field['name'];
            if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $name)) {
                continue;
            }
            $fields[] = [
                'name' => $name,
                'label' => isset($field['label']) ? sanitize_text_field((string) $field['label']) : $name,
                'type' => isset($field['type']) ? sanitize_key((string) $field['type']) : 'text',
            ];
        }

        wp_send_json_success(['fields' => $fields]);
    }

    /**
     * Abre una sesión de edición en línea: crea un snapshot
     * `session-open` por cada documento existente de la sesión, para poder
     * restaurar el estado de entrada en M5.
     */
    public function handle_session_open(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $session_id = isset($_POST['session_id']) ? (string) wp_unslash($_POST['session_id']) : '';
        if ($session_id === '' || !preg_match('/^[a-z0-9-]{1,64}$/', $session_id)) {
            wp_send_json_error(['message' => 'session_id inválido.'], 400);
        }

        $raw_ids = isset($_POST['document_ids']) ? wp_unslash($_POST['document_ids']) : [];
        if (is_string($raw_ids)) {
            // El cliente envía la lista como JSON porque el transporte del
            // editor es un formulario URL-encoded sin claves repetidas.
            $decoded = json_decode($raw_ids, true, 8);
            $raw_ids = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($raw_ids)) {
            $raw_ids = [];
        }

        $snapshots = [];
        $seen = [];
        foreach ($raw_ids as $raw_id) {
            $document_id = sanitize_key((string) $raw_id);
            if ($document_id === '' || isset($seen[$document_id])) {
                continue;
            }
            $seen[$document_id] = true;

            // Solo se snapshot-mean documentos que existen de verdad.
            $document = $this->repository->load($document_id);
            if (is_wp_error($document)) {
                continue;
            }

            $snapshot = $this->repository->create_snapshot(
                $document_id,
                $session_id,
                COD_Canvas_Document_Repository::SNAPSHOT_SESSION_OPEN_LABEL
            );
            if (!is_wp_error($snapshot)) {
                $snapshots[] = $snapshot;
            }
        }

        wp_send_json_success(['snapshots' => $snapshots]);
    }

    /**
     * Lista los snapshots de un documento (solo metadatos, más nuevo primero).
     */
    public function handle_snapshots_list(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $document_id = isset($_POST['document_id']) ? sanitize_key((string) wp_unslash($_POST['document_id'])) : '';
        if ($document_id === '') {
            wp_send_json_error(['message' => 'document_id es obligatorio.'], 400);
        }

        wp_send_json_success(['snapshots' => $this->repository->list_snapshots($document_id)]);
    }

    /**
     * Restaura el contenido de un snapshot sobre el documento, de forma
     * append-only: el estado ACTUAL se congela primero como snapshot
     * 'antes de restaurar' para que nada se pierda, y recién después se
     * persiste el contenido del snapshot elegido.
     */
    public function handle_snapshot_load(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $document_id = isset($_POST['document_id']) ? sanitize_key((string) wp_unslash($_POST['document_id'])) : '';
        $snapshot_id = isset($_POST['snapshot_id']) ? sanitize_key((string) wp_unslash($_POST['snapshot_id'])) : '';
        if ($document_id === '' || $snapshot_id === '') {
            wp_send_json_error(['message' => 'document_id y snapshot_id son obligatorios.'], 400);
        }

        $snapshot = $this->repository->load_snapshot($document_id, $snapshot_id);
        if (is_wp_error($snapshot)) {
            $status = $snapshot->get_error_code() === 'cod_snapshot_not_found' ? 404 : 400;
            wp_send_json_error(['message' => $snapshot->get_error_message(), 'code' => $snapshot->get_error_code()], $status);
        }

        // Restauración append-only: congela el estado actual en el historial
        // ANTES de pisar el documento, para poder volver atrás si hace falta.
        $frozen = $this->repository->create_snapshot($document_id, 'restore', 'antes de restaurar');
        if (is_wp_error($frozen)) {
            wp_send_json_error(['message' => $frozen->get_error_message(), 'code' => $frozen->get_error_code()], 500);
        }

        // El contenido del snapshot ya salió sanitizado del repositorio (igual
        // que duplicate_page/duplicate_region): NO se re-sanitiza con el
        // sanitizador de entrada, pensado para payloads crudos del cliente.
        $saved = $this->repository->save(
            $document_id,
            (string) $snapshot['projectData'],
            (string) $snapshot['html'],
            (string) $snapshot['css']
        );
        if (is_wp_error($saved)) {
            wp_send_json_error(['message' => $saved->get_error_message()], 500);
        }

        wp_send_json_success([
            'restored' => true,
            'documentId' => $document_id,
            'snapshotId' => $snapshot_id,
        ]);
    }

    /**
     * "Guardar como módulo" (Súper-Módulo, MVP): recibe el HTML/CSS ya
     * serializados de un componente del lienzo (un contenedor con su
     * contenido adentro) y los persiste como un bloque reutilizable nuevo en
     * COD_Custom_Module_Library. Reutiliza el mismo sanitizador que el resto
     * del documento Canvas (sanitize_html()/sanitize_css()) en vez de escribir
     * uno nuevo, para no abrir una segunda superficie de saneamiento de
     * marcado en este plugin.
     */
    public function handle_custom_module_save(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $label = isset($_POST['label']) ? sanitize_text_field((string) wp_unslash($_POST['label'])) : '';
        $category = isset($_POST['category']) ? sanitize_text_field((string) wp_unslash($_POST['category'])) : '';
        $raw_html = isset($_POST['html']) ? (string) wp_unslash($_POST['html']) : '';
        $raw_css = isset($_POST['css']) ? (string) wp_unslash($_POST['css']) : '';

        if (trim($raw_html) === '') {
            wp_send_json_error(['message' => 'El módulo no tiene contenido para guardar.'], 400);
        }

        $html = $this->sanitizer->sanitize_html($raw_html);
        if (is_wp_error($html)) {
            wp_send_json_error(['message' => $html->get_error_message(), 'code' => $html->get_error_code()], 400);
        }
        $css = $this->sanitizer->sanitize_css($raw_css);
        if (is_wp_error($css)) {
            wp_send_json_error(['message' => $css->get_error_message(), 'code' => $css->get_error_code()], 400);
        }

        $entry = $this->custom_module_library->save($label, $category, $html, $css);

        wp_send_json_success($entry);
    }

    /**
     * Lista los módulos personalizados guardados, para que el editor los
     * registre como bloques del BlockManager al arrancar (misma idea que los
     * campos ACF y el bloque de Orugantt Forms, cargados desde el servidor).
     */
    public function handle_custom_module_list(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        wp_send_json_success(['modules' => $this->custom_module_library->list_all()]);
    }

    /**
     * Botón "+ Nueva página" del editor. Crea una página WordPress en borrador
     * con su documento Canvas propio ya vinculado (vía
     * COD_Canvas_Page_Publisher::create_page()) y devuelve los datos para que
     * el JS la agregue al selector y la cargue de inmediato, sin recargar la
     * pantalla.
     */
    public function handle_create_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $title = isset($_POST['title']) ? sanitize_text_field((string) wp_unslash($_POST['title'])) : '';

        $result = $this->publisher->create_page($title);
        if (is_wp_error($result)) {
            wp_send_json_error(['message' => $result->get_error_message()], 400);
        }

        wp_send_json_success($result);
    }
}
