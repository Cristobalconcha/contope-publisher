<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla experimental y aislada del editor Open CoDesign Canvas.
 *
 * No interviene en el importador de paquetes. Edita y persiste un documento
 * experimental con ID estable, que puede publicarse como una página Canvas.
 */
final class OCD_Canvas_Editor_Admin
{
    public const PAGE_SLUG = 'open-codesign-canvas-editor';
    public const PARENT_SLUG = 'open-codesign-publisher';
    public const NONCE_ACTION = 'ocd_canvas_editor';
    public const AJAX_LOAD = 'ocd_canvas_editor_load';
    public const AJAX_SAVE = 'ocd_canvas_editor_save';
    public const AJAX_RESOLVE_ASSETS = 'ocd_canvas_editor_resolve_assets';
    public const AJAX_PUBLISH = 'ocd_canvas_editor_publish';
    public const AJAX_SAVE_REGION = 'ocd_canvas_editor_save_region';
    public const AJAX_RESOLVE_PAGE = 'ocd_canvas_editor_resolve_page';
    public const AJAX_ACF_FIELDS = 'ocd_canvas_editor_acf_fields';
    public const AJAX_SESSION_OPEN = 'ocd_canvas_editor_session_open';
    public const AJAX_SNAPSHOTS_LIST = 'ocd_canvas_editor_snapshots_list';
    /** Acción admin-post del duplicado de páginas Canvas. */
    public const ACTION_DUPLICATE = 'ocd_canvas_duplicate_page';
    public const CAPABILITY = 'manage_options';

    /** Versión exacta del vendor incluido en `assets/vendor/grapesjs`. */
    public const GRAPESJS_VERSION = '0.23.4';

    /**
     * Prefijo de los document_id derivados de una página WordPress. El
     * documento aislado original (OCD_Canvas_Document_Repository::DOCUMENT_ID)
     * no usa este prefijo y conserva su comportamiento actual.
     */
    public const PAGE_DOCUMENT_PREFIX = 'ocd-canvas-page-';

    private string $hook_suffix = '';

    /**
     * Devuelve el ID estable de Open CoDesign para el documento Canvas del
     * cuerpo de una página WordPress específica. Es determinístico y no usa
     * el slug ni el ID numérico del post interno del repositorio.
     */
    public static function document_id_for_page(int $page_id): string
    {
        return self::PAGE_DOCUMENT_PREFIX . $page_id;
    }

    /**
     * Inverso de document_id_for_page(): extrae el page_id de un document_id
     * de página, o devuelve 0 si el document_id no es de página (por ejemplo
     * el documento experimental compartido).
     */
    private static function page_id_from_document_id(string $document_id): int
    {
        if (strpos($document_id, self::PAGE_DOCUMENT_PREFIX) !== 0) {
            return 0;
        }
        $suffix = substr($document_id, strlen(self::PAGE_DOCUMENT_PREFIX));
        if ($suffix === '' || !preg_match('/^\d+$/', $suffix)) {
            return 0;
        }
        $page_id = absint($suffix);
        return $page_id > 0 ? $page_id : 0;
    }

    public function __construct(
        private OCD_Canvas_Document_Repository $repository,
        private OCD_Canvas_Document_Sanitizer $sanitizer,
        private OCD_Canvas_Asset_Resolver $asset_resolver,
        private OCD_Canvas_Page_Publisher $publisher,
        private OCD_Template_Region_Resolver $region_resolver
    ) {
    }

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_menu']);
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

        $actions['ocd_canvas_editor'] = sprintf(
            '<a href="%s">%s</a>',
            esc_url(wp_nonce_url($url, self::NONCE_ACTION, 'ocd_nonce')),
            esc_html__('Editar con OCD', 'open-codesign-publisher')
        );

        // "Duplicar" SOLO para páginas Canvas (las que tienen documento de
        // cuerpo asociado). La duplicación la maneja este plugin y no un
        // duplicador externo, porque un duplicador genérico copia la cáscara
        // de la página sin crear el documento de cuerpo nuevo.
        if ((string) get_post_meta($post->ID, OCD_Canvas_Page_Publisher::META_DOCUMENT_ID, true) !== '') {
            $duplicate_url = add_query_arg(
                [
                    'action' => self::ACTION_DUPLICATE,
                    'page_id' => $post->ID,
                ],
                admin_url('admin-post.php')
            );
            $actions['ocd_canvas_duplicate'] = sprintf(
                '<a href="%s">%s</a>',
                esc_url(wp_nonce_url($duplicate_url, self::NONCE_ACTION, 'ocd_nonce')),
                esc_html__('Duplicar', 'open-codesign-publisher')
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
     * de páginas con un notice vía ?ocd-dup-error=.
     */
    public function handle_duplicate_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para duplicar esta página.', 'open-codesign-publisher'));
        }
        check_admin_referer(self::NONCE_ACTION, 'ocd_nonce');

        $page_id = isset($_GET['page_id']) ? absint(wp_unslash($_GET['page_id'])) : 0;
        if ($page_id <= 0) {
            wp_safe_redirect(add_query_arg(
                ['ocd-dup-error' => 'ID de página inválido.'],
                admin_url('edit.php?post_type=page')
            ));
            exit;
        }

        $result = $this->publisher->duplicate_page($page_id);
        if (is_wp_error($result)) {
            wp_safe_redirect(add_query_arg(
                ['ocd-dup-error' => $result->get_error_message()],
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
                    OCD_Inline_Editor_Frontend::QUERY_EDIT => 1,
                    OCD_Inline_Editor_Frontend::QUERY_NONCE => wp_create_nonce(OCD_Inline_Editor_Frontend::NONCE_ACTION),
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
     * ?ocd-dup-error= tras un redirect al listado de páginas.
     */
    public function render_duplicate_notices(): void
    {
        if (!is_admin() || !current_user_can(self::CAPABILITY)) {
            return;
        }
        if (!isset($_GET['ocd-dup-error']) || !is_string($_GET['ocd-dup-error'])) {
            return;
        }
        $message = sanitize_text_field(wp_unslash($_GET['ocd-dup-error']));
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

        check_admin_referer(self::NONCE_ACTION, 'ocd_nonce');

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

        check_admin_referer(self::NONCE_ACTION, 'ocd_nonce');

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
            'Open CoDesign Canvas (Experimental)',
            'Editor de página',
            self::CAPABILITY,
            self::PAGE_SLUG,
            [$this, 'render_page']
        );
        $this->hook_suffix = is_string($hook_suffix) ? $hook_suffix : '';
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
            'ocd-grapesjs',
            plugins_url('assets/vendor/grapesjs/grapes.min.css', OCD_PUBLISHER_FILE),
            [],
            self::GRAPESJS_VERSION
        );
        wp_enqueue_style(
            'ocd-canvas-editor',
            plugins_url('assets/css/ocd-canvas-editor.css', OCD_PUBLISHER_FILE),
            ['ocd-grapesjs'],
            OCD_PUBLISHER_VERSION
        );
        wp_enqueue_script(
            'ocd-grapesjs',
            plugins_url('assets/vendor/grapesjs/grapes.min.js', OCD_PUBLISHER_FILE),
            [],
            self::GRAPESJS_VERSION,
            true
        );
        wp_enqueue_script(
            'ocd-computed-inspector',
            plugins_url('assets/js/ocd-computed-inspector.js', OCD_PUBLISHER_FILE),
            ['ocd-grapesjs'],
            OCD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'ocd-canvas-grid',
            plugins_url('assets/js/ocd-canvas-grid.global.js', OCD_PUBLISHER_FILE),
            ['ocd-grapesjs'],
            OCD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'ocd-grid-controls',
            plugins_url('assets/js/ocd-grid-controls.js', OCD_PUBLISHER_FILE),
            ['ocd-grapesjs', 'ocd-computed-inspector', 'ocd-canvas-grid'],
            OCD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'ocd-behaviors',
            plugins_url('assets/js/ocd-behaviors.js', OCD_PUBLISHER_FILE),
            ['ocd-grapesjs'],
            OCD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'ocd-editor-core',
            plugins_url('assets/js/ocd-editor-core.js', OCD_PUBLISHER_FILE),
            ['ocd-grapesjs', 'ocd-computed-inspector', 'ocd-canvas-grid', 'ocd-grid-controls', 'ocd-behaviors'],
            OCD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'ocd-canvas-editor',
            plugins_url('assets/js/ocd-canvas-editor.js', OCD_PUBLISHER_FILE),
            ['ocd-editor-core'],
            OCD_PUBLISHER_VERSION,
            true
        );

        $auto_load_page_id = $this->resolve_auto_load_page_id();
        $auto_load_document_id = $auto_load_page_id > 0 ? '' : $this->resolve_auto_load_document_id();
        if ($auto_load_page_id > 0) {
            $document_id = self::document_id_for_page($auto_load_page_id);
        } elseif ($auto_load_document_id !== '') {
            $document_id = $auto_load_document_id;
        } else {
            $document_id = OCD_Canvas_Document_Repository::DOCUMENT_ID;
        }
        $document = $this->repository->load($document_id);
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
            'documentId' => $document_id,
            'document' => is_wp_error($document) ? null : $document,
            'loadError' => is_wp_error($document) ? $document->get_error_message() : '',
            'publishedPage' => $this->publisher->current($document_id),
            'pageTitle' => $auto_load_page_id > 0 ? get_the_title($auto_load_page_id) : '',
            'regionKinds' => OCD_Canvas_Document_Repository::REGION_KINDS,
            'regionDocuments' => $this->repository->list_region_documents(),
            'ruleChoices' => [
                'pages' => $this->rule_page_choices(),
                'categories' => $this->rule_term_choices('category'),
                'tags' => $this->rule_term_choices('post_tag'),
            ],
            'autoLoadPageId' => $this->resolve_auto_load_page_id(),
            'siteFontCss' => OCD_Canvas_Page_Publisher::site_font_css(),
        ];

        // JSON_HEX_TAG evita cualquier salida de `<` dentro del script en línea.
        wp_add_inline_script(
            'ocd-canvas-editor',
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
        foreach (get_pages() as $page) {
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

    public function render_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para abrir el editor Canvas.', 'open-codesign-publisher'));
        }
        ?>
        <div class="wrap ocd-canvas-wrap">
            <h1>Open CoDesign Canvas (Experimental)</h1>
            <p class="ocd-canvas-intro">
                Slice vertical aislado. Edita documentos experimentales con ID estable
                <code><?php echo esc_html(OCD_Canvas_Document_Repository::DOCUMENT_ID); ?></code>
                y guarda datos estructurados, HTML y CSS por separado. Podés editar el documento
                individual o cargar una página WordPress para ver y editar sus regiones de
                Encabezado y Pie de página juntas.
            </p>

            <div class="ocd-canvas-toolbar">
                <button type="button" class="button button-primary" id="ocd-canvas-save">Guardar</button>
                <button type="button" class="button" id="ocd-canvas-reload">Recargar</button>
                <button type="button" class="button" id="ocd-canvas-export-html">Exportar HTML</button>
                <button type="button" class="button" id="ocd-canvas-export-css">Exportar CSS</button>
                <button type="button" class="button" id="ocd-canvas-toggle-import" aria-expanded="false" aria-controls="ocd-canvas-import">
                    Importar HTML/CSS
                </button>
                <label class="ocd-canvas-title-label" for="ocd-canvas-page-title">Título público</label>
                <input type="text" id="ocd-canvas-page-title" value="Página Open CoDesign Canvas" maxlength="160">
                <button type="button" class="button button-primary" id="ocd-canvas-publish">Publicar/actualizar página</button>
                <a id="ocd-canvas-view-page" class="button" href="#" target="_blank" rel="noopener" hidden>Ver página</a>
                <span class="ocd-canvas-status" id="ocd-canvas-status" role="status" aria-live="polite"></span>
            </div>

            <div class="ocd-canvas-import" id="ocd-canvas-import" hidden>
                <p class="description">
                    Pega o carga HTML y CSS. La importación sólo afecta al lienzo; nada se guarda hasta pulsar
                    <strong>Guardar</strong>.
                </p>
                <div class="ocd-canvas-import-grid">
                    <p>
                        <label for="ocd-canvas-import-html"><strong>HTML</strong></label><br>
                        <input type="file" id="ocd-canvas-import-html-file" accept="text/html,.html,.htm"><br>
                        <textarea id="ocd-canvas-import-html" rows="8" spellcheck="false"></textarea>
                    </p>
                    <p>
                        <label for="ocd-canvas-import-css"><strong>CSS</strong></label><br>
                        <input type="file" id="ocd-canvas-import-css-file" accept="text/css,.css"><br>
                        <textarea id="ocd-canvas-import-css" rows="8" spellcheck="false"></textarea>
                    </p>
                </div>
                <p>
                    <button type="button" class="button button-secondary" id="ocd-canvas-import-apply">Cargar en el lienzo</button>
                </p>
            </div>

            <div class="ocd-canvas-meta">
                <span>Revisión: <strong id="ocd-canvas-revision">—</strong></span>
                <span>Actualizado: <strong id="ocd-canvas-updated">—</strong></span>
                <span>Entidad: <code><?php echo esc_html(OCD_Canvas_Document_Repository::POST_TYPE); ?></code></span>
                <span>GrapesJS <?php echo esc_html(self::GRAPESJS_VERSION); ?> (BSD-3-Clause, local)</span>
            </div>

            <div class="ocd-canvas-page-editor">
                <div class="ocd-canvas-page-picker">
                    <label for="ocd-page-target">Página objetivo</label>
                    <select id="ocd-page-target">
                        <option value="">Elegir página…</option>
                        <?php
                        foreach (get_pages() as $page) :
                            $document_id = (string) get_post_meta($page->ID, OCD_Canvas_Page_Publisher::META_DOCUMENT_ID, true);
                            $title = trim((string) $page->post_title);
                            $option_label = $title !== '' ? $title : sprintf('(Sin título) #%d', $page->ID);
                            if ($document_id !== '') {
                                $option_label .= ' — Canvas';
                            }
                            ?>
                            <option value="<?php echo esc_attr((string) $page->ID); ?>"><?php echo esc_html($option_label); ?></option>
                        <?php endforeach; ?>
                    </select>
                    <button type="button" class="button button-primary" id="ocd-page-load">Cargar página</button>
                    <span class="ocd-canvas-status" id="ocd-canvas-page-status" role="status" aria-live="polite"></span>
                </div>

                <div class="ocd-region-segments" data-ocd-active-segment="">
                    <div class="ocd-region-tabs" role="tablist" aria-label="Segmentos de la página">
                        <button type="button" class="button" role="tab" data-ocd-region-segment="header" aria-selected="false" disabled>
                            Encabezado
                        </button>
                        <button type="button" class="button" role="tab" data-ocd-region-segment="footer" aria-selected="false" disabled>
                            Pie de página
                        </button>
                    </div>

                    <div class="ocd-region-panels">
                        <section class="ocd-region-segment-panel" data-ocd-region-segment-panel="header">
                            <div class="ocd-region-preview" data-ocd-region-preview="header">
                                <p class="ocd-region-empty">Cargá una página para resolver el Encabezado.</p>
                            </div>
                            <div class="ocd-region-canvas-slot" data-ocd-region-canvas-slot="header"></div>
                        </section>
                        <section class="ocd-region-segment-panel" data-ocd-region-segment-panel="footer">
                            <div class="ocd-region-preview" data-ocd-region-preview="footer">
                                <p class="ocd-region-empty">Cargá una página para resolver el Pie de página.</p>
                            </div>
                            <div class="ocd-region-canvas-slot" data-ocd-region-canvas-slot="footer"></div>
                        </section>
                    </div>
                </div>
            </div>

            <div class="ocd-canvas-region-panel">
                <h2>Región de plantilla (Encabezado / Pie de página)</h2>
                <p class="description">
                    Marca qué rol cumple este documento al armar una página. Global se usa en
                    todo el sitio salvo que exista una región local más específica. Local aplica
                    solo a las páginas o categorías que indiques.
                </p>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="ocd-region-kind">Tipo de región</label></th>
                        <td>
                            <select id="ocd-region-kind">
                                <option value="">(ninguno — documento normal)</option>
                                <option value="header">Encabezado</option>
                                <option value="footer">Pie de página</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="ocd-region-scope">Alcance</label></th>
                        <td>
                            <select id="ocd-region-scope">
                                <option value="">(sin definir)</option>
                                <option value="global">Global — todo el sitio</option>
                                <option value="local">Local — página(s) o categoría(s) específicas</option>
                            </select>
                        </td>
                    </tr>
                    <tr class="ocd-region-rules-row" data-ocd-rule-fieldset="targets">
                        <th scope="row"><span id="ocd-region-targets-label">Destinos (solo si es Local)</span></th>
                        <td>
                            <div class="ocd-rule-picker">
                                <select class="ocd-rule-type" data-ocd-rule-type="targets" aria-label="Tipo de destino">
                                    <option value="">Elegir tipo…</option>
                                    <option value="post">Página…</option>
                                    <option value="children_of">Páginas hijas de…</option>
                                    <option value="category">Categoría…</option>
                                    <option value="tag">Etiqueta…</option>
                                    <option value="homepage">La portada</option>
                                    <option value="all_pages">Todas las páginas</option>
                                    <option value="all_posts">Todas las entradas</option>
                                </select>
                                <select class="ocd-rule-entity" data-ocd-rule-entity="targets" aria-label="Elegir página, categoría o etiqueta" hidden>
                                    <option value="">Elegir…</option>
                                </select>
                                <button type="button" class="button button-secondary" data-ocd-rule-add="targets">Agregar</button>
                            </div>
                            <div class="ocd-rule-list" data-ocd-rule-list="targets" role="list" aria-label="Destinos"></div>
                            <p class="description ocd-rule-scope-hint" data-ocd-rule-scope-hint="targets" hidden>
                                El alcance global aplica a todo el sitio; solo definí exclusiones.
                            </p>
                            <input type="hidden" id="ocd-region-targets" value="">
                        </td>
                    </tr>
                    <tr class="ocd-region-rules-row" data-ocd-rule-fieldset="excludes">
                        <th scope="row"><span id="ocd-region-excludes-label">Exclusiones (opcional)</span></th>
                        <td>
                            <div class="ocd-rule-picker">
                                <select class="ocd-rule-type" data-ocd-rule-type="excludes" aria-label="Tipo de exclusión">
                                    <option value="">Elegir tipo…</option>
                                    <option value="post">Página…</option>
                                    <option value="children_of">Páginas hijas de…</option>
                                    <option value="category">Categoría…</option>
                                    <option value="tag">Etiqueta…</option>
                                    <option value="homepage">La portada</option>
                                    <option value="all_pages">Todas las páginas</option>
                                    <option value="all_posts">Todas las entradas</option>
                                </select>
                                <select class="ocd-rule-entity" data-ocd-rule-entity="excludes" aria-label="Elegir página, categoría o etiqueta" hidden>
                                    <option value="">Elegir…</option>
                                </select>
                                <button type="button" class="button button-secondary" data-ocd-rule-add="excludes">Agregar</button>
                            </div>
                            <div class="ocd-rule-list" data-ocd-rule-list="excludes" role="list" aria-label="Exclusiones"></div>
                            <input type="hidden" id="ocd-region-excludes" value="">
                        </td>
                    </tr>
                </table>
                <p class="ocd-region-reach" id="ocd-region-reach" role="status" aria-live="polite"></p>
                <details class="ocd-region-advanced">
                    <summary>Opciones avanzadas (JSON)</summary>
                    <textarea id="ocd-region-json" rows="8" spellcheck="false"
                        aria-label="JSON combinado de destinos y exclusiones"></textarea>
                    <p class="description">
                        Objeto <code>{"targets":[…],"excludes":[…]}</code> con el mismo vocabulario de
                        <code>type</code>: <code>post</code> + <code>id</code>, <code>children_of</code> + <code>id</code>,
                        <code>category</code> + <code>id</code>, <code>tag</code> + <code>id</code>, <code>homepage</code>,
                        <code>all_pages</code> y <code>all_posts</code>. Al salir del campo, si el JSON es válido
                        reconstruye los chips; si no, se conserva el último valor válido.
                    </p>
                </details>
                <button type="button" class="button button-secondary" id="ocd-canvas-save-region">
                    Guardar región
                </button>
                <span class="ocd-canvas-status" id="ocd-canvas-region-status" role="status" aria-live="polite"></span>
            </div>

            <div class="ocd-canvas-editor-shell">
                <div class="ocd-canvas-side-tabs" role="tablist" aria-label="Panel lateral del editor">
                    <button type="button" class="button" role="tab" data-ocd-side-panel="components" aria-selected="false">
                        Estructura y componentes
                    </button>
                    <button type="button" class="button button-primary" role="tab" data-ocd-side-panel="inspector" aria-selected="true">
                        Inspector Open CoDesign
                    </button>
                </div>

                <div class="ocd-canvas-workspace" data-ocd-active-panel="inspector">
                    <div id="ocd-canvas-editor-root" class="ocd-canvas-editor-root"></div>
                    <aside id="ocd-canvas-inspector" class="ocd-canvas-inspector" aria-label="Inspector de diseño efectivo"></aside>
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
        return $raw === '' ? OCD_Canvas_Document_Repository::DOCUMENT_ID : $raw;
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
        $published = $this->publisher->publish($document_id, $title, self::page_id_from_document_id($document_id));
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
        $targets = OCD_Canvas_Document_Repository::sanitize_match_rules($decoded_targets ?? []);
        if (is_wp_error($targets)) {
            wp_send_json_error(['message' => $targets->get_error_message(), 'code' => $targets->get_error_code()], 400);
        }

        $raw_excludes = isset($_POST['region_excludes']) ? (string) wp_unslash($_POST['region_excludes']) : '[]';
        $decoded_excludes = json_decode($raw_excludes, true, 8);
        $excludes = OCD_Canvas_Document_Repository::sanitize_match_rules($decoded_excludes ?? []);
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
        foreach (OCD_Canvas_Document_Repository::REGION_KINDS as $kind) {
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
                OCD_Canvas_Document_Repository::SNAPSHOT_SESSION_OPEN_LABEL
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
}
