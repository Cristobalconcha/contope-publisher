<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla experimental y aislada del editor Open CoDesign Canvas.
 *
 * No interviene en el importador de paquetes ni en la publicación de páginas:
 * sólo edita y persiste un documento experimental con ID estable.
 */
final class OCD_Canvas_Editor_Admin
{
    public const PAGE_SLUG = 'open-codesign-canvas-editor';
    public const NONCE_ACTION = 'ocd_canvas_editor';
    public const AJAX_LOAD = 'ocd_canvas_editor_load';
    public const AJAX_SAVE = 'ocd_canvas_editor_save';
    public const CAPABILITY = 'manage_options';

    /** Versión exacta del vendor incluido en `assets/vendor/grapesjs`. */
    public const GRAPESJS_VERSION = '0.23.4';

    private string $hook_suffix = '';

    public function __construct(
        private OCD_Canvas_Document_Repository $repository,
        private OCD_Canvas_Document_Sanitizer $sanitizer
    ) {
    }

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_ajax_' . self::AJAX_LOAD, [$this, 'handle_load']);
        add_action('wp_ajax_' . self::AJAX_SAVE, [$this, 'handle_save']);
    }

    public function add_menu(): void
    {
        $hook_suffix = add_management_page(
            'Open CoDesign Canvas (Experimental)',
            'Open CoDesign Canvas (Experimental)',
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
            'ocd-canvas-editor',
            plugins_url('assets/js/ocd-canvas-editor.js', OCD_PUBLISHER_FILE),
            ['ocd-grapesjs', 'ocd-computed-inspector', 'ocd-canvas-grid', 'ocd-grid-controls', 'ocd-behaviors'],
            OCD_PUBLISHER_VERSION,
            true
        );

        $document = $this->repository->load(OCD_Canvas_Document_Repository::DOCUMENT_ID);
        $config = [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce(self::NONCE_ACTION),
            'loadAction' => self::AJAX_LOAD,
            'saveAction' => self::AJAX_SAVE,
            'documentId' => OCD_Canvas_Document_Repository::DOCUMENT_ID,
            'document' => is_wp_error($document) ? null : $document,
            'loadError' => is_wp_error($document) ? $document->get_error_message() : '',
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
                Slice vertical aislado. Edita un único documento experimental con ID estable
                <code><?php echo esc_html(OCD_Canvas_Document_Repository::DOCUMENT_ID); ?></code>
                y guarda datos estructurados, HTML y CSS por separado. No publica páginas ni toca el importador.
            </p>

            <div class="ocd-canvas-toolbar">
                <button type="button" class="button button-primary" id="ocd-canvas-save">Guardar</button>
                <button type="button" class="button" id="ocd-canvas-reload">Recargar</button>
                <button type="button" class="button" id="ocd-canvas-export-html">Exportar HTML</button>
                <button type="button" class="button" id="ocd-canvas-export-css">Exportar CSS</button>
                <button type="button" class="button" id="ocd-canvas-toggle-import" aria-expanded="false" aria-controls="ocd-canvas-import">
                    Importar HTML/CSS
                </button>
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

            <div class="ocd-canvas-workspace">
                <div id="ocd-canvas-editor-root" class="ocd-canvas-editor-root"></div>
                <aside id="ocd-canvas-inspector" class="ocd-canvas-inspector" aria-label="Inspector de diseño efectivo"></aside>
            </div>
        </div>
        <?php
    }

    public function handle_load(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $document = $this->repository->load(OCD_Canvas_Document_Repository::DOCUMENT_ID);
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
            OCD_Canvas_Document_Repository::DOCUMENT_ID,
            $project_data,
            $html,
            $css
        );
        if (is_wp_error($saved)) {
            wp_send_json_error(['message' => $saved->get_error_message()], 500);
        }

        wp_send_json_success($saved);
    }
}
