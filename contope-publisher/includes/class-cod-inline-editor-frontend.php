<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Modo de edición en línea sobre la página YA publicada (Fase 2, M3).
 *
 * Agrega un botón "Editar en la página" a la barra de administración de
 * WordPress para toda página Canvas publicada y, ante una petición firmada
 * (`?cod_edit=1&cod_nonce=...`), renderiza un shell a pantalla completa con
 * el lienzo compuesto (Encabezado + Cuerpo + Pie). Desde M3 el editor guarda
 * por región vía AJAX (`saveAction`), abre sesiones con snapshots de entrada
 * (`sessionOpenAction` / `snapshotsListAction`) y muestra un enlace a las
 * reglas de plantillas; el botón "Salir" sigue disponible para volver a la
 * página publicada.
 *
 * El header/footer NO son "globales de por sí": son ítems del tema con alcance
 * propio (global/local + destinos + exclusiones). La UI muestra el alcance real
 * resuelto PARA ESTA PÁGINA, nunca una etiqueta fija.
 */
final class COD_Inline_Editor_Frontend
{
    /** Parámetros de la URL de edición en línea. */
    public const QUERY_EDIT = 'cod_edit';
    public const QUERY_NONCE = 'cod_nonce';

    /** Reutiliza la misma acción nonce y capacidad que el editor admin. */
    public const NONCE_ACTION = 'cod_canvas_editor';
    public const CAPABILITY = 'manage_options';

    public function __construct(
        private COD_Canvas_Document_Repository $repository,
        private COD_Template_Region_Resolver $region_resolver
    ) {
    }

    public function register(): void
    {
        add_action('admin_bar_menu', [$this, 'admin_bar_menu'], 100);
        add_action('template_redirect', [$this, 'maybe_render_inline_editor']);
    }

    /**
     * Botón de la barra de administración, solo para páginas Canvas publicadas
     * vistas por alguien con capacidad de gestión.
     */
    public function admin_bar_menu(WP_Admin_Bar $wp_admin_bar): void
    {
        if (!is_singular('page') || !current_user_can(self::CAPABILITY)) {
            return;
        }

        $page_id = (int) get_queried_object_id();
        if ($page_id <= 0) {
            return;
        }

        if ((string) get_post_meta($page_id, COD_Canvas_Page_Publisher::META_DOCUMENT_ID, true) === '') {
            return;
        }

        $wp_admin_bar->add_node([
            'id' => 'cod-inline-edit',
            'title' => esc_html__('Editar en la página', 'contope-publisher'),
            'href' => add_query_arg(
                [
                    self::QUERY_EDIT => 1,
                    self::QUERY_NONCE => wp_create_nonce(self::NONCE_ACTION),
                ],
                get_permalink($page_id)
            ),
        ]);
    }

    /**
     * Entrada por `template_redirect`. Cualquier combinación que no cumpla
     * TODAS las condiciones (editar=1, capacidad, nonce válido, página Canvas)
     * no hace nada: el visitante sigue viendo el render normal, nunca un error.
     */
    public function maybe_render_inline_editor(): void
    {
        if (($_GET[self::QUERY_EDIT] ?? '') !== '1') {
            return;
        }
        if (!current_user_can(self::CAPABILITY)) {
            return;
        }

        $raw_nonce = $_GET[self::QUERY_NONCE] ?? '';
        if (!is_string($raw_nonce)) {
            return;
        }
        $nonce = sanitize_key($raw_nonce);
        if ($nonce === '' || !wp_verify_nonce($nonce, self::NONCE_ACTION)) {
            return;
        }

        if (!is_singular('page')) {
            return;
        }

        $page_id = (int) get_queried_object_id();
        if ($page_id <= 0) {
            return;
        }

        $document_id = (string) get_post_meta($page_id, COD_Canvas_Page_Publisher::META_DOCUMENT_ID, true);
        if ($document_id === '') {
            return;
        }

        $this->render_inline_editor($page_id, $document_id);
    }

    /**
     * Imprime el shell de edición a pantalla completa y corta la petición.
     *
     * @param string $document_id Documento del CUERPO de la página.
     */
    private function render_inline_editor(int $page_id, string $document_id): void
    {
        $body = $this->repository->load($document_id);
        if (is_wp_error($body)) {
            // Sin documento cargable no hay editor; se deja el render normal.
            return;
        }

        $header = $this->region_resolver->resolve(
            COD_Canvas_Document_Repository::REGION_KIND_HEADER,
            $page_id
        );
        $footer = $this->region_resolver->resolve(
            COD_Canvas_Document_Repository::REGION_KIND_FOOTER,
            $page_id
        );

        $regions = [
            'header' => null,
            'footer' => null,
        ];
        if (is_array($header)) {
            $header['reach'] = $this->describe_region_reach($header);
            $regions['header'] = $header;
        }
        if (is_array($footer)) {
            $footer['reach'] = $this->describe_region_reach($footer);
            $regions['footer'] = $footer;
        }

        // El cuerpo de la página se edita sobre el DOCUMENTO-REGIÓN `body`
        // cuando una región de ese tipo resuelve para esta página CON HTML no
        // vacío. Misma guarda que el render público: una región body vacía no
        // debe presentar una página en blanco, así que se cae al documento
        // propio de la página (que es el `$body` cargado arriba).
        $body_region = $this->region_resolver->resolve(
            COD_Canvas_Document_Repository::REGION_KIND_BODY,
            $page_id
        );
        $body_is_region = false;
        if (is_array($body_region) && trim((string) ($body_region['html'] ?? '')) !== '') {
            $body_region['reach'] = $this->describe_region_reach($body_region);
            $body = $body_region;
            $body_is_region = true;
        }

        $this->enqueue_assets();

        $templates_url = admin_url('admin.php?page=' . COD_Theme_Builder_Admin::PAGE_SLUG);

        $config = [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce(self::NONCE_ACTION),
            'saveAction' => COD_Canvas_Editor_Admin::AJAX_SAVE,
            'sessionOpenAction' => COD_Canvas_Editor_Admin::AJAX_SESSION_OPEN,
            'snapshotsListAction' => COD_Canvas_Editor_Admin::AJAX_SNAPSHOTS_LIST,
            'snapshotLoadAction' => COD_Canvas_Editor_Admin::AJAX_SNAPSHOT_LOAD,
            'pageId' => $page_id,
            'pageTitle' => get_the_title($page_id),
            'pageUrl' => get_permalink($page_id),
            'bodyIsRegion' => $body_is_region,
            'bodyDocument' => $body,
            'regions' => $regions,
            'templatesUrl' => $templates_url,
            'siteFontCss' => COD_Canvas_Page_Publisher::site_font_css(),
            // El núcleo primero, igual que en la página publicada.
            'themeDefinitionsCss' => COD_Design_Core::css() . COD_Theme_Definitions::css(),
        ];

        // JSON_HEX_* evita cualquier salida de `<` o `&` dentro del <script>.
        wp_add_inline_script(
            'cod-inline-editor',
            'window.ocdInlineEditor = ' . wp_json_encode(
                $config,
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            ) . ';',
            'before'
        );

        // Pantalla completa del editor: se oculta la barra de administración
        // para que no se solape con la barra superior propia del shell.
        show_admin_bar(false);

        nocache_headers();
        status_header(200);
        ?>
        <!doctype html>
        <html <?php language_attributes(); ?>>
        <head>
            <meta charset="<?php bloginfo('charset'); ?>">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title><?php echo esc_html(sprintf('%s — %s', get_the_title($page_id), __('Edición ContOpe Design', 'contope-publisher'))); ?></title>
            <?php wp_head(); ?>
        </head>
        <body <?php body_class('cod-inline-editor-body'); ?>>
            <div id="cod-inline-bar">
                <span id="cod-inline-region" class="cod-inline-region" data-cod-region-kind="">&mdash;</span>
                <span id="cod-inline-status" class="cod-inline-status" role="status" aria-live="polite"></span>
                <button id="cod-inline-save" class="cod-inline-save" type="button" disabled>
                    <?php esc_html_e('Guardar', 'contope-publisher'); ?>
                </button>
                <button id="cod-inline-history" class="cod-inline-history" type="button">
                    <?php esc_html_e('Historial', 'contope-publisher'); ?>
                </button>
                <a id="cod-inline-templates" class="cod-inline-link" href="<?php echo esc_url($templates_url); ?>" hidden>
                    <?php esc_html_e('Reglas en Plantillas', 'contope-publisher'); ?>
                </a>
                <a id="cod-inline-exit" class="cod-inline-link" href="<?php echo esc_url(get_permalink($page_id)); ?>">
                    <?php esc_html_e('Salir', 'contope-publisher'); ?>
                </a>
            </div>
            <div id="cod-inline-canvas-root"></div>
            <?php wp_footer(); ?>
        </body>
        </html>
        <?php
        exit;
    }

    /**
     * Encola en el front-end los mismos handles que el admin (GrapesJS vendor,
     * módulos Canvas, core) más el entry propio del editor en línea. Solo se
     * ejecuta dentro del modo edición, así que no contamina el render público.
     */
    private function enqueue_assets(): void
    {
        wp_enqueue_style(
            'cod-grapesjs',
            plugins_url('assets/vendor/grapesjs/grapes.min.css', COD_PUBLISHER_FILE),
            [],
            COD_Canvas_Editor_Admin::GRAPESJS_VERSION
        );
        wp_enqueue_style(
            'cod-canvas-editor',
            plugins_url('assets/css/cod-canvas-editor.css', COD_PUBLISHER_FILE),
            ['cod-grapesjs'],
            COD_PUBLISHER_VERSION
        );
        wp_enqueue_style(
            'cod-inline-editor',
            plugins_url('assets/css/cod-inline-editor.css', COD_PUBLISHER_FILE),
            ['cod-canvas-editor'],
            COD_PUBLISHER_VERSION
        );

        wp_enqueue_script(
            'cod-grapesjs',
            plugins_url('assets/vendor/grapesjs/grapes.min.js', COD_PUBLISHER_FILE),
            [],
            COD_Canvas_Editor_Admin::GRAPESJS_VERSION,
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
            'cod-inline-editor',
            plugins_url('assets/js/cod-inline-editor.js', COD_PUBLISHER_FILE),
            ['cod-editor-core'],
            COD_PUBLISHER_VERSION,
            true
        );
    }

    /**
     * Describe el alcance real de un documento-región en español, a partir de
     * su scope/targets/excludes. Devuelve '' cuando no hay forma de describirlo.
     *
     * @param array<string, mixed> $doc
     */
    private function describe_region_reach(array $doc): string
    {
        $scope = (string) ($doc['regionScope'] ?? '');
        $targets = $doc['regionTargets'] ?? [];
        $excludes = $doc['regionExcludes'] ?? [];
        $targets = is_array($targets) ? $targets : [];
        $excludes = is_array($excludes) ? $excludes : [];

        if ($scope === COD_Canvas_Document_Repository::REGION_SCOPE_GLOBAL) {
            if ($excludes === []) {
                return 'todo el sitio';
            }
            $excluded = $this->describe_rules($excludes);
            return $excluded === '' ? 'todo el sitio, salvo exclusiones' : 'todo el sitio, salvo: ' . $excluded;
        }

        if ($scope === COD_Canvas_Document_Repository::REGION_SCOPE_LOCAL) {
            $label = $this->describe_rules($targets);
            if ($label === '') {
                return '';
            }
            if ($excludes !== []) {
                $excluded = $this->describe_rules($excludes);
                if ($excluded !== '') {
                    $label .= '; salvo ' . $excluded;
                }
            }
            return $label;
        }

        return '';
    }

    /**
     * @param array<int, array{type: string, id?: int}> $rules
     */
    private function describe_rules(array $rules): string
    {
        $parts = [];
        foreach ($rules as $rule) {
            if (!is_array($rule)) {
                continue;
            }
            $type = (string) ($rule['type'] ?? '');
            $id = (int) ($rule['id'] ?? 0);
            $description = $this->describe_rule($type, $id);
            if ($description !== '') {
                $parts[] = $description;
            }
        }
        return $parts === [] ? '' : implode(', ', $parts);
    }

    private function describe_rule(string $type, int $id): string
    {
        switch ($type) {
            case COD_Canvas_Document_Repository::MATCH_TYPE_POST:
                $title = $this->post_title_or_empty($id);
                return $title !== '' ? 'la página «' . $title . '»' : '';

            case COD_Canvas_Document_Repository::MATCH_TYPE_CHILDREN_OF:
                $title = $this->post_title_or_empty($id);
                return $title !== '' ? 'páginas hijas de «' . $title . '»' : '';

            case COD_Canvas_Document_Repository::MATCH_TYPE_CATEGORY:
                $name = $this->term_name_or_empty('category', $id);
                return $name !== '' ? 'entradas de la categoría «' . $name . '»' : '';

            case COD_Canvas_Document_Repository::MATCH_TYPE_TAG:
                $name = $this->term_name_or_empty('post_tag', $id);
                return $name !== '' ? 'entradas de la etiqueta «' . $name . '»' : '';

            case COD_Canvas_Document_Repository::MATCH_TYPE_HOMEPAGE:
                return 'la portada';

            case COD_Canvas_Document_Repository::MATCH_TYPE_ALL_PAGES:
                return 'todas las páginas';

            case COD_Canvas_Document_Repository::MATCH_TYPE_ALL_POSTS:
                return 'todas las entradas';

            default:
                return '';
        }
    }

    private function post_title_or_empty(int $id): string
    {
        $title = trim((string) get_the_title($id));
        return $title === '' ? '' : $title;
    }

    private function term_name_or_empty(string $taxonomy, int $id): string
    {
        $name = get_term_field('name', $id, $taxonomy, 'raw');
        return is_string($name) ? trim($name) : '';
    }
}
