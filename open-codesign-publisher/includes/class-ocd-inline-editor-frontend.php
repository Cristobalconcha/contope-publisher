<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Modo de edición en línea sobre la página YA publicada (Fase 2, M3).
 *
 * Agrega un botón "Editar en la página" a la barra de administración de
 * WordPress para toda página Canvas publicada y, ante una petición firmada
 * (`?ocd_edit=1&ocd_nonce=...`), renderiza un shell a pantalla completa con
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
final class OCD_Inline_Editor_Frontend
{
    /** Parámetros de la URL de edición en línea. */
    public const QUERY_EDIT = 'ocd_edit';
    public const QUERY_NONCE = 'ocd_nonce';

    /** Reutiliza la misma acción nonce y capacidad que el editor admin. */
    public const NONCE_ACTION = 'ocd_canvas_editor';
    public const CAPABILITY = 'manage_options';

    public function __construct(
        private OCD_Canvas_Document_Repository $repository,
        private OCD_Template_Region_Resolver $region_resolver
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

        if ((string) get_post_meta($page_id, OCD_Canvas_Page_Publisher::META_DOCUMENT_ID, true) === '') {
            return;
        }

        $wp_admin_bar->add_node([
            'id' => 'ocd-inline-edit',
            'title' => esc_html__('Editar en la página', 'open-codesign-publisher'),
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

        $document_id = (string) get_post_meta($page_id, OCD_Canvas_Page_Publisher::META_DOCUMENT_ID, true);
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
            OCD_Canvas_Document_Repository::REGION_KIND_HEADER,
            $page_id
        );
        $footer = $this->region_resolver->resolve(
            OCD_Canvas_Document_Repository::REGION_KIND_FOOTER,
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
            OCD_Canvas_Document_Repository::REGION_KIND_BODY,
            $page_id
        );
        $body_is_region = false;
        if (is_array($body_region) && trim((string) ($body_region['html'] ?? '')) !== '') {
            $body_region['reach'] = $this->describe_region_reach($body_region);
            $body = $body_region;
            $body_is_region = true;
        }

        $this->enqueue_assets();

        $templates_url = admin_url('admin.php?page=' . OCD_Theme_Builder_Admin::PAGE_SLUG);

        $config = [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce(self::NONCE_ACTION),
            'saveAction' => OCD_Canvas_Editor_Admin::AJAX_SAVE,
            'sessionOpenAction' => OCD_Canvas_Editor_Admin::AJAX_SESSION_OPEN,
            'snapshotsListAction' => OCD_Canvas_Editor_Admin::AJAX_SNAPSHOTS_LIST,
            'pageId' => $page_id,
            'pageTitle' => get_the_title($page_id),
            'pageUrl' => get_permalink($page_id),
            'bodyIsRegion' => $body_is_region,
            'bodyDocument' => $body,
            'regions' => $regions,
            'templatesUrl' => $templates_url,
            'siteFontCss' => OCD_Canvas_Page_Publisher::site_font_css(),
            'themeDefinitionsCss' => OCD_Theme_Definitions::css(),
        ];

        // JSON_HEX_* evita cualquier salida de `<` o `&` dentro del <script>.
        wp_add_inline_script(
            'ocd-inline-editor',
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
            <title><?php echo esc_html(sprintf('%s — %s', get_the_title($page_id), __('Edición Open CoDesign', 'open-codesign-publisher'))); ?></title>
            <?php wp_head(); ?>
        </head>
        <body <?php body_class('ocd-inline-editor-body'); ?>>
            <div id="ocd-inline-bar">
                <span id="ocd-inline-region" class="ocd-inline-region" data-ocd-region-kind="">&mdash;</span>
                <span id="ocd-inline-status" class="ocd-inline-status" role="status" aria-live="polite"></span>
                <button id="ocd-inline-save" class="ocd-inline-save" type="button" disabled>
                    <?php esc_html_e('Guardar', 'open-codesign-publisher'); ?>
                </button>
                <a id="ocd-inline-templates" class="ocd-inline-link" href="<?php echo esc_url($templates_url); ?>" hidden>
                    <?php esc_html_e('Reglas en Plantillas', 'open-codesign-publisher'); ?>
                </a>
                <a id="ocd-inline-exit" class="ocd-inline-link" href="<?php echo esc_url(get_permalink($page_id)); ?>">
                    <?php esc_html_e('Salir', 'open-codesign-publisher'); ?>
                </a>
            </div>
            <div id="ocd-inline-canvas-root"></div>
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
            'ocd-grapesjs',
            plugins_url('assets/vendor/grapesjs/grapes.min.css', OCD_PUBLISHER_FILE),
            [],
            OCD_Canvas_Editor_Admin::GRAPESJS_VERSION
        );
        wp_enqueue_style(
            'ocd-canvas-editor',
            plugins_url('assets/css/ocd-canvas-editor.css', OCD_PUBLISHER_FILE),
            ['ocd-grapesjs'],
            OCD_PUBLISHER_VERSION
        );
        wp_enqueue_style(
            'ocd-inline-editor',
            plugins_url('assets/css/ocd-inline-editor.css', OCD_PUBLISHER_FILE),
            ['ocd-canvas-editor'],
            OCD_PUBLISHER_VERSION
        );

        wp_enqueue_script(
            'ocd-grapesjs',
            plugins_url('assets/vendor/grapesjs/grapes.min.js', OCD_PUBLISHER_FILE),
            [],
            OCD_Canvas_Editor_Admin::GRAPESJS_VERSION,
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
            'ocd-inline-editor',
            plugins_url('assets/js/ocd-inline-editor.js', OCD_PUBLISHER_FILE),
            ['ocd-editor-core'],
            OCD_PUBLISHER_VERSION,
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

        if ($scope === OCD_Canvas_Document_Repository::REGION_SCOPE_GLOBAL) {
            if ($excludes === []) {
                return 'todo el sitio';
            }
            $excluded = $this->describe_rules($excludes);
            return $excluded === '' ? 'todo el sitio, salvo exclusiones' : 'todo el sitio, salvo: ' . $excluded;
        }

        if ($scope === OCD_Canvas_Document_Repository::REGION_SCOPE_LOCAL) {
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
            case OCD_Canvas_Document_Repository::MATCH_TYPE_POST:
                $title = $this->post_title_or_empty($id);
                return $title !== '' ? 'la página «' . $title . '»' : '';

            case OCD_Canvas_Document_Repository::MATCH_TYPE_CHILDREN_OF:
                $title = $this->post_title_or_empty($id);
                return $title !== '' ? 'páginas hijas de «' . $title . '»' : '';

            case OCD_Canvas_Document_Repository::MATCH_TYPE_CATEGORY:
                $name = $this->term_name_or_empty('category', $id);
                return $name !== '' ? 'entradas de la categoría «' . $name . '»' : '';

            case OCD_Canvas_Document_Repository::MATCH_TYPE_TAG:
                $name = $this->term_name_or_empty('post_tag', $id);
                return $name !== '' ? 'entradas de la etiqueta «' . $name . '»' : '';

            case OCD_Canvas_Document_Repository::MATCH_TYPE_HOMEPAGE:
                return 'la portada';

            case OCD_Canvas_Document_Repository::MATCH_TYPE_ALL_PAGES:
                return 'todas las páginas';

            case OCD_Canvas_Document_Repository::MATCH_TYPE_ALL_POSTS:
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
