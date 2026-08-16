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
        add_filter('page_row_actions', [$this, 'add_page_row_edit_with_ocd'], 10, 2);
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

        return $actions;
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
                    <tr>
                        <th scope="row"><label for="ocd-region-targets">Destinos (solo si es Local)</label></th>
                        <td>
                            <textarea id="ocd-region-targets" rows="3" spellcheck="false"
                                placeholder='[{"type":"post","id":12},{"type":"category","id":4}]'></textarea>
                            <p class="description">
                                Lista JSON de destinos. Vocabulario de <code>type</code>:
                                <code>"all_pages"</code> (todas las páginas),
                                <code>"homepage"</code> (la portada),
                                <code>"post"</code> + <code>id</code> (una página específica),
                                <code>"children_of"</code> + <code>id</code> (todas las páginas hijas de esa página),
                                <code>"all_posts"</code> (todas las entradas de blog),
                                <code>"category"</code> + <code>id</code> (entradas de esa categoría) y
                                <code>"tag"</code> + <code>id</code> (entradas de esa etiqueta).
                                Los tipos sin <code>id</code> van como <code>{"type":"all_pages"}</code>, sin campo id.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="ocd-region-excludes">Exclusiones (opcional)</label></th>
                        <td>
                            <textarea id="ocd-region-excludes" rows="3" spellcheck="false"
                                placeholder='[{"type":"post","id":99}]'></textarea>
                            <p class="description">
                                Lista JSON de exclusiones. Usa el mismo vocabulario que Destinos:
                                <code>"all_pages"</code>, <code>"homepage"</code>,
                                <code>"post"</code> + <code>id</code>,
                                <code>"children_of"</code> + <code>id</code>,
                                <code>"all_posts"</code>, <code>"category"</code> + <code>id</code> y
                                <code>"tag"</code> + <code>id</code>.
                                Una página que coincide con una exclusión no usa esta región aunque también
                                coincida con un destino.
                            </p>
                        </td>
                    </tr>
                </table>
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
}
