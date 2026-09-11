<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla "Plantillas" del menú ContOpe Design.
 *
 * Muestra una grilla de tarjetas — una por plantilla/agrupación — con sus
 * tres filas Encabezado/Cuerpo/Pie. La primera tarjeta es siempre la plantilla
 * por defecto del sitio; las demás son grupos con nombre y las regiones
 * creadas antes de que existiera el concepto de plantilla se muestran como
 * tarjetas sin agrupar de una sola región.
 *
 * El alcance local se configura con selectores reales de páginas, categorías
 * y etiquetas de WordPress (get_pages()/get_categories()/get_tags()); nunca
 * se pide JSON crudo al usuario.
 */
final class COD_Theme_Builder_Admin
{
    public const PAGE_SLUG = 'contope-templates';
    public const PARENT_SLUG = 'contope-publisher';
    public const CAPABILITY = 'manage_options';
    public const NONCE_ACTION = 'cod_theme_builder';
    public const AJAX_SAVE_REGION = 'cod_theme_builder_save_region';
    public const AJAX_DELETE_REGION = 'cod_theme_builder_delete_region';
    public const AJAX_CREATE_TEMPLATE = 'cod_theme_builder_create_template';
    public const AJAX_ADD_REGION = 'cod_theme_builder_add_region';
    public const AJAX_RENAME_TEMPLATE = 'cod_theme_builder_rename_template';
    public const AJAX_ASSIGN_REGION = 'cod_theme_builder_assign_region';
    public const AJAX_CREATE_REGION = 'cod_theme_builder_create_region';
    public const AJAX_RENAME_REGION = 'cod_theme_builder_rename_region';
    public const AJAX_DELETE_TEMPLATE = 'cod_theme_builder_delete_template';
    public const ADMIN_POST_PREVIEW = 'cod_theme_builder_preview';

    private string $hook_suffix = '';

    /** @var WP_Post[]|null */
    private ?array $pages_cache = null;

    /** @var WP_Term[]|null */
    private ?array $categories_cache = null;

    /** @var WP_Term[]|null */
    private ?array $tags_cache = null;

    public function __construct(
        private COD_Canvas_Document_Repository $repository,
        private COD_Canvas_Page_Publisher $publisher
    ) {
    }

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_ajax_' . self::AJAX_SAVE_REGION, [$this, 'handle_save_region']);
        add_action('wp_ajax_' . self::AJAX_DELETE_REGION, [$this, 'handle_delete_region']);
        add_action('wp_ajax_' . self::AJAX_CREATE_TEMPLATE, [$this, 'handle_create_template']);
        add_action('wp_ajax_' . self::AJAX_ADD_REGION, [$this, 'handle_add_region']);
        add_action('wp_ajax_' . self::AJAX_RENAME_TEMPLATE, [$this, 'handle_rename_template']);
        add_action('wp_ajax_' . self::AJAX_ASSIGN_REGION, [$this, 'handle_assign_region']);
        add_action('wp_ajax_' . self::AJAX_CREATE_REGION, [$this, 'handle_create_region']);
        add_action('wp_ajax_' . self::AJAX_RENAME_REGION, [$this, 'handle_rename_region']);
        add_action('wp_ajax_' . self::AJAX_DELETE_TEMPLATE, [$this, 'handle_delete_template']);
        add_action('admin_post_' . self::ADMIN_POST_PREVIEW, [$this, 'handle_preview']);
    }

    public function add_menu(): void
    {
        $hook_suffix = add_submenu_page(
            self::PARENT_SLUG,
            'Plantillas',
            'Plantillas',
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
            'cod-theme-builder',
            plugins_url('assets/css/cod-theme-builder.css', COD_PUBLISHER_FILE),
            ['dashicons'],
            COD_PUBLISHER_VERSION
        );
        wp_enqueue_script(
            'cod-theme-builder',
            plugins_url('assets/js/cod-theme-builder.js', COD_PUBLISHER_FILE),
            [],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_add_inline_script(
            'cod-theme-builder',
            'window.ocdThemeBuilder = ' . wp_json_encode(
                [
                    'ajaxUrl' => admin_url('admin-ajax.php'),
                    'nonce' => wp_create_nonce(self::NONCE_ACTION),
                    'saveRegionAction' => self::AJAX_SAVE_REGION,
                    'deleteRegionAction' => self::AJAX_DELETE_REGION,
                    'createTemplateAction' => self::AJAX_CREATE_TEMPLATE,
                    'addRegionAction' => self::AJAX_ADD_REGION,
                    'renameTemplateAction' => self::AJAX_RENAME_TEMPLATE,
                    'assignRegionAction' => self::AJAX_ASSIGN_REGION,
                    'createRegionAction' => self::AJAX_CREATE_REGION,
                    'renameRegionAction' => self::AJAX_RENAME_REGION,
                    'deleteTemplateAction' => self::AJAX_DELETE_TEMPLATE,
                ],
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            ) . ';',
            'before'
        );
    }

    public function render_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar las plantillas.', 'contope-publisher'));
        }

        $templates = $this->repository->list_templates();
        $region_documents_by_kind = $this->region_documents_by_kind();
        ?>
        <div class="wrap cod-tb-wrap">
            <div class="cod-tb-header">
                <div>
                    <h1>Plantillas del tema</h1>
                    <p>
                        Cada tarjeta agrupa las tres regiones de una plantilla. El selector comparte la
                        región entre plantillas; el botón + crea una copia propia a partir de la seleccionada.
                    </p>
                    <p class="cod-tb-autosave-note">Los cambios se guardan automáticamente.</p>
                </div>
                <button type="button" class="button button-primary" id="cod-tb-new-template">+ Nueva plantilla</button>
            </div>

            <details class="cod-tb-help">
                <summary>¿Cómo funcionan las plantillas?</summary>
                <ul>
                    <li>Elegir una región en el selector la <strong>comparte</strong>: todas las plantillas que la
                        tengan seleccionada ven los mismos cambios al editarla.</li>
                    <li>El botón <strong>+</strong> crea una región nueva <strong>a partir del contenido</strong> de
                        la seleccionada (o vacía si no hay ninguna) — la copia es propia y no afecta al donante.</li>
                    <li>El <strong>ojo</strong> abre la región asignada en el editor Canvas, solamente esa región.</li>
                    <li>El <strong>alcance</strong> (Global/Local con destinos y exclusiones) se edita desplegando
                        cada fila con el chevron.</li>
                </ul>
            </details>

            <div class="cod-tb-grid" id="cod-tb-grid">
                <?php foreach ($templates as $template) : ?>
                    <?php echo $this->render_template_card_html($template, $region_documents_by_kind); ?>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
    }

    /**
     * Tarjeta de plantilla como string: sirve al render inicial y a las
     * respuestas AJAX que re-renderizan la tarjeta sin recargar la página.
     *
     * @param array<string, mixed> $template
     * @param array<string, array<int, array<string, mixed>>> $region_documents_by_kind
     */
    private function render_template_card_html(array $template, array $region_documents_by_kind): string
    {
        $template_id = (string) ($template['templateId'] ?? '');
        $title = (string) ($template['title'] ?? $template_id);
        $is_default = (bool) ($template['isDefault'] ?? false);
        $is_legacy = (bool) ($template['isLegacy'] ?? false);
        $regions = is_array($template['regions'] ?? null) ? $template['regions'] : [];

        $has_local = false;
        foreach (COD_Canvas_Document_Repository::REGION_KINDS as $kind) {
            $document = $regions[$kind] ?? null;
            if (is_array($document)
                && (string) ($document['regionScope'] ?? '') === COD_Canvas_Document_Repository::REGION_SCOPE_LOCAL) {
                $has_local = true;
                break;
            }
        }
        $badge = $is_default ? 'Global · base' : ($is_legacy ? 'Sin agrupar' : ($has_local ? 'Local' : 'Plantilla'));

        ob_start();
        ?>
        <article class="cod-tb-card<?php echo $is_default ? ' is-default' : ''; ?><?php echo $is_legacy ? ' is-legacy' : ''; ?>"
            data-template-id="<?php echo esc_attr($template_id); ?>">
            <header class="cod-tb-card-head">
                <h2 class="cod-tb-card-name"><?php echo esc_html($title); ?></h2>
                <span class="cod-tb-badge"><?php echo esc_html($badge); ?></span>
                <?php if (!$is_default && !$is_legacy) : ?>
                    <div class="cod-tb-menu">
                        <button type="button" class="cod-tb-icon cod-tb-menu-toggle" title="Opciones de la plantilla">
                            <span class="dashicons dashicons-ellipsis" aria-hidden="true"></span>
                            <span class="screen-reader-text">Opciones de la plantilla</span>
                        </button>
                        <div class="cod-tb-menu-panel" hidden>
                            <button type="button" class="cod-tb-menu-rename">Renombrar plantilla</button>
                            <button type="button" class="cod-tb-menu-delete">Eliminar plantilla</button>
                        </div>
                    </div>
                <?php endif; ?>
            </header>

            <?php if (!$is_default && !$is_legacy) : ?>
                <form class="cod-tb-rename" data-template-id="<?php echo esc_attr($template_id); ?>" hidden>
                    <label class="cod-tb-field" for="cod-tb-name-<?php echo esc_attr($template_id); ?>">
                        <span>Nombre de la plantilla</span>
                        <input type="text" id="cod-tb-name-<?php echo esc_attr($template_id); ?>" name="template_title"
                            maxlength="160" value="<?php echo esc_attr($title); ?>" required>
                    </label>
                    <button type="submit" class="button button-secondary">Guardar nombre</button>
                    <button type="button" class="button cod-tb-rename-cancel">Cancelar</button>
                    <span class="cod-tb-status" role="status" aria-live="polite"></span>
                </form>
            <?php endif; ?>

            <div class="cod-tb-card-rows">
                <?php foreach (COD_Canvas_Document_Repository::REGION_KINDS as $kind) : ?>
                    <?php if ($kind === '') { continue; } ?>
                    <?php $document = $regions[$kind] ?? null; ?>
                    <?php $this->render_region_row(
                        $template,
                        $kind,
                        is_array($document) ? $document : null,
                        is_array($region_documents_by_kind[$kind] ?? null) ? $region_documents_by_kind[$kind] : []
                    ); ?>
                <?php endforeach; ?>
            </div>
        </article>
        <?php
        return (string) ob_get_clean();
    }

    /**
     * Fila de región: etiqueta, selector con TODAS las regiones del tema de
     * ese tipo, ojo (abrir la asignada en el Canvas), "+" (bifurcar la
     * seleccionada o crear una vacía) y chevron que despliega alcance y
     * nombre de la región.
     *
     * @param array<string, mixed> $template
     * @param array<string, mixed>|null $document
     * @param array<int, array<string, mixed>> $kind_documents
     */
    private function render_region_row(array $template, string $kind, ?array $document, array $kind_documents): void
    {
        $assigned_id = $document !== null ? (string) ($document['documentId'] ?? '') : '';
        $is_legacy = (bool) ($template['isLegacy'] ?? false);
        ?>
        <section class="cod-tb-region" data-region-kind="<?php echo esc_attr($kind); ?>"
            data-assigned-document="<?php echo esc_attr($assigned_id); ?>">
            <div class="cod-tb-row">
                <span class="cod-tb-row-label"><?php echo esc_html($this->region_short_label($kind)); ?></span>
                <select class="cod-tb-region-select" data-region-select<?php echo $is_legacy ? ' disabled' : ''; ?>
                    aria-label="Región de <?php echo esc_attr($this->region_short_label($kind)); ?>">
                    <option value="" <?php selected($assigned_id, ''); ?>>Sin definir</option>
                    <?php foreach ($kind_documents as $option_document) : ?>
                        <?php $option_id = (string) ($option_document['documentId'] ?? ''); ?>
                        <?php if ($option_id === '') { continue; } ?>
                        <option value="<?php echo esc_attr($option_id); ?>" <?php selected($option_id, $assigned_id); ?>>
                            <?php echo esc_html((string) ($option_document['title'] ?? $option_id)); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <div class="cod-tb-row-actions">
                    <?php if ($assigned_id !== '') : ?>
                        <a class="cod-tb-icon cod-tb-eye" href="<?php echo esc_url($this->region_edit_url($assigned_id)); ?>"
                            title="Abrir esta región en el editor Canvas">
                            <span class="dashicons dashicons-visibility" aria-hidden="true"></span>
                            <span class="screen-reader-text">Abrir esta región en el editor Canvas</span>
                        </a>
                    <?php else : ?>
                        <span class="cod-tb-icon cod-tb-eye is-disabled" title="Sin región asignada">
                            <span class="dashicons dashicons-visibility" aria-hidden="true"></span>
                        </span>
                    <?php endif; ?>
                    <button type="button" class="cod-tb-icon cod-tb-fork<?php echo $is_legacy ? ' is-disabled' : ''; ?>"<?php echo $is_legacy ? ' disabled' : ''; ?>
                        title="Crear una región nueva a partir de la seleccionada (o vacía)">
                        <span class="dashicons dashicons-plus-alt2" aria-hidden="true"></span>
                        <span class="screen-reader-text">Crear una región nueva</span>
                    </button>
                    <button type="button" class="cod-tb-icon cod-tb-chevron" title="Alcance y nombre de la región">
                        <span class="dashicons dashicons-arrow-down" aria-hidden="true"></span>
                        <span class="screen-reader-text">Alcance y nombre de la región</span>
                    </button>
                </div>
            </div>
            <span class="cod-tb-status cod-tb-row-status" role="status" aria-live="polite"></span>

            <div class="cod-tb-region-panel" hidden>
                <?php if ($document !== null) : ?>
                    <?php $this->render_region_panel($document); ?>
                <?php else : ?>
                    <p class="cod-tb-panel-empty">Sin región asignada — elegí una existente en el selector o creala con +.</p>
                <?php endif; ?>
            </div>
        </section>
        <?php
    }

    /**
     * Panel desplegado de la fila: nombre propio de la región + formulario de
     * alcance (idéntico al clásico: Global/Local, destinos, exclusiones).
     *
     * @param array<string, mixed> $document
     */
    private function render_region_panel(array $document): void
    {
        $document_id = (string) ($document['documentId'] ?? '');
        $scope = (string) ($document['regionScope'] ?? '');
        $targets = is_array($document['regionTargets'] ?? null) ? $document['regionTargets'] : [];
        $excludes = is_array($document['regionExcludes'] ?? null) ? $document['regionExcludes'] : [];
        ?>
        <form class="cod-tb-region-name-form" data-document-id="<?php echo esc_attr($document_id); ?>">
            <label class="cod-tb-field">
                <span>Nombre de la región</span>
                <input type="text" name="region_title" maxlength="160"
                    value="<?php echo esc_attr((string) ($document['title'] ?? $document_id)); ?>" required>
            </label>
            <button type="submit" class="button button-secondary">Guardar nombre</button>
            <span class="cod-tb-status" role="status" aria-live="polite"></span>
        </form>

        <form class="cod-tb-scope-form">
            <p class="cod-tb-scope-summary"><?php echo esc_html($this->describe_scope($scope, $targets, $excludes)); ?></p>

            <label class="cod-tb-field">
                <span>Alcance</span>
                <select name="region_scope" class="cod-tb-scope">
                    <option value="global" <?php selected($scope, COD_Canvas_Document_Repository::REGION_SCOPE_GLOBAL); ?>>
                        Global — todo el sitio
                    </option>
                    <option value="local" <?php selected($scope, COD_Canvas_Document_Repository::REGION_SCOPE_LOCAL); ?>>
                        Local — destinos específicos
                    </option>
                </select>
            </label>

            <label class="cod-tb-field">
                <span>Destinos (solo si es Local)</span>
                <select name="region_targets" multiple size="5" class="cod-tb-targets">
                    <?php $this->render_rule_options($targets); ?>
                </select>
            </label>

            <label class="cod-tb-field">
                <span>Exclusiones (opcional)</span>
                <select name="region_excludes" multiple size="4" class="cod-tb-excludes">
                    <?php $this->render_rule_options($excludes); ?>
                </select>
            </label>

            <div class="cod-tb-form-actions">
                <button type="submit" class="button button-primary">Guardar alcance</button>
                <span class="cod-tb-status" role="status" aria-live="polite"></span>
            </div>
        </form>
        <?php
    }

    /**
     * URL del Canvas para editar una región aislada (mecanismo de
     * resolve_auto_load_document_id(): page + document_id + nonce).
     */
    private function region_edit_url(string $document_id): string
    {
        return wp_nonce_url(
            add_query_arg(
                [
                    'page' => COD_Canvas_Editor_Admin::PAGE_SLUG,
                    'document_id' => $document_id,
                ],
                admin_url('admin.php')
            ),
            COD_Canvas_Editor_Admin::NONCE_ACTION,
            'cod_nonce'
        );
    }

    /**
     * Todos los documentos-región del tema agrupados por kind, para poblar
     * los selectores compartidos.
     *
     * @return array<string, array<int, array<string, mixed>>>
     */
    private function region_documents_by_kind(): array
    {
        $grouped = [
            COD_Canvas_Document_Repository::REGION_KIND_HEADER => [],
            COD_Canvas_Document_Repository::REGION_KIND_BODY => [],
            COD_Canvas_Document_Repository::REGION_KIND_FOOTER => [],
        ];
        foreach ($this->repository->list_region_documents() as $document) {
            $kind = (string) ($document['regionKind'] ?? '');
            if (!isset($grouped[$kind])) {
                continue;
            }
            $grouped[$kind][] = $document;
        }
        return $grouped;
    }

    /**
     * Re-render de una tarjeta por template_id (para respuestas AJAX).
     */
    private function template_card_html_by_id(string $template_id): ?string
    {
        if ($template_id === '') {
            return null;
        }
        foreach ($this->repository->list_templates() as $template) {
            if ((string) ($template['templateId'] ?? '') === $template_id) {
                return $this->render_template_card_html($template, $this->region_documents_by_kind());
            }
        }
        return null;
    }

    /**
     * @param array<int, array{type: string, id?: int}> $selected
     */
    private function render_rule_options(array $selected): void
    {
        ?>
        <optgroup label="Páginas">
            <option value="all_pages" <?php selected($this->has_rule($selected, COD_Canvas_Document_Repository::MATCH_TYPE_ALL_PAGES)); ?>>
                Todas las páginas
            </option>
            <option value="homepage" <?php selected($this->has_rule($selected, COD_Canvas_Document_Repository::MATCH_TYPE_HOMEPAGE)); ?>>
                Portada
            </option>
            <?php foreach ($this->get_pages() as $page) : ?>
                <option value="<?php echo esc_attr('post:' . $page->ID); ?>"
                    <?php selected($this->has_rule($selected, COD_Canvas_Document_Repository::MATCH_TYPE_POST, (int) $page->ID)); ?>>
                    Página: <?php echo esc_html(get_the_title($page)); ?>
                </option>
            <?php endforeach; ?>
        </optgroup>
        <optgroup label="Hijas de página">
            <?php foreach ($this->get_pages() as $page) : ?>
                <option value="<?php echo esc_attr('children_of:' . $page->ID); ?>"
                    <?php selected($this->has_rule($selected, COD_Canvas_Document_Repository::MATCH_TYPE_CHILDREN_OF, (int) $page->ID)); ?>>
                    Hijas de: <?php echo esc_html(get_the_title($page)); ?>
                </option>
            <?php endforeach; ?>
        </optgroup>
        <optgroup label="Entradas">
            <option value="all_posts" <?php selected($this->has_rule($selected, COD_Canvas_Document_Repository::MATCH_TYPE_ALL_POSTS)); ?>>
                Todas las entradas
            </option>
            <?php foreach ($this->get_categories() as $category) : ?>
                <option value="<?php echo esc_attr('category:' . $category->term_id); ?>"
                    <?php selected($this->has_rule($selected, COD_Canvas_Document_Repository::MATCH_TYPE_CATEGORY, (int) $category->term_id)); ?>>
                    Categoría: <?php echo esc_html($category->name); ?>
                </option>
            <?php endforeach; ?>
            <?php foreach ($this->get_tags() as $tag) : ?>
                <option value="<?php echo esc_attr('tag:' . $tag->term_id); ?>"
                    <?php selected($this->has_rule($selected, COD_Canvas_Document_Repository::MATCH_TYPE_TAG, (int) $tag->term_id)); ?>>
                    Etiqueta: <?php echo esc_html($tag->name); ?>
                </option>
            <?php endforeach; ?>
        </optgroup>
        <?php
    }

    /**
     * @param array<int, array{type: string, id?: int}> $rules
     */
    private function has_rule(array $rules, string $type, int $id = 0): bool
    {
        foreach ($rules as $rule) {
            if (!is_array($rule) || ($rule['type'] ?? '') !== $type) {
                continue;
            }
            if ($id > 0) {
                if ((int) ($rule['id'] ?? 0) === $id) {
                    return true;
                }
            } else {
                return true;
            }
        }
        return false;
    }

    private function region_kind_label(string $kind): string
    {
        switch ($kind) {
            case COD_Canvas_Document_Repository::REGION_KIND_HEADER:
                return 'Encabezado personalizado';
            case COD_Canvas_Document_Repository::REGION_KIND_BODY:
                return 'Cuerpo personalizado';
            case COD_Canvas_Document_Repository::REGION_KIND_FOOTER:
                return 'Pie de página personalizado';
            default:
                return 'Región';
        }
    }

    private function region_short_label(string $kind): string
    {
        switch ($kind) {
            case COD_Canvas_Document_Repository::REGION_KIND_HEADER:
                return 'Encabezado';
            case COD_Canvas_Document_Repository::REGION_KIND_BODY:
                return 'Cuerpo';
            case COD_Canvas_Document_Repository::REGION_KIND_FOOTER:
                return 'Pie de página';
            default:
                return 'Región';
        }
    }

    private function empty_region_action_label(string $kind, bool $is_default): string
    {
        $suffix = $is_default ? ' global' : '';
        return 'Agregar ' . $this->region_short_label($kind) . $suffix;
    }

    /**
     * @param array<int, array{type: string, id?: int}> $targets
     * @param array<int, array{type: string, id?: int}> $excludes
     */
    private function describe_scope(string $scope, array $targets, array $excludes): string
    {
        if ($scope === COD_Canvas_Document_Repository::REGION_SCOPE_LOCAL) {
            $label = 'Local — ' . ($targets === [] ? 'sin destinos' : $this->describe_rules($targets));
        } else {
            $label = 'Global — todo el sitio';
        }

        if ($excludes !== []) {
            $label .= ' · excluye: ' . $this->describe_rules($excludes);
        }

        return $label;
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
            $parts[] = $this->describe_rule($type, $id);
        }
        return $parts === [] ? '—' : implode(', ', $parts);
    }

    private function describe_rule(string $type, int $id): string
    {
        switch ($type) {
            case COD_Canvas_Document_Repository::MATCH_TYPE_ALL_PAGES:
                return 'Todas las páginas';
            case COD_Canvas_Document_Repository::MATCH_TYPE_HOMEPAGE:
                return 'Portada';
            case COD_Canvas_Document_Repository::MATCH_TYPE_ALL_POSTS:
                return 'Todas las entradas';
            case COD_Canvas_Document_Repository::MATCH_TYPE_POST:
                return 'Página: ' . $this->post_title_or_id($id);
            case COD_Canvas_Document_Repository::MATCH_TYPE_CHILDREN_OF:
                return 'Hijas de: ' . $this->post_title_or_id($id);
            case COD_Canvas_Document_Repository::MATCH_TYPE_CATEGORY:
                return 'Categoría: ' . $this->term_name_or_id('category', $id);
            case COD_Canvas_Document_Repository::MATCH_TYPE_TAG:
                return 'Etiqueta: ' . $this->term_name_or_id('post_tag', $id);
            default:
                return $type !== '' ? $type : 'Regla desconocida';
        }
    }

    private function post_title_or_id(int $id): string
    {
        $post = get_post($id);
        return $post instanceof WP_Post ? $post->post_title : '#' . $id;
    }

    private function term_name_or_id(string $taxonomy, int $id): string
    {
        $term = get_term($id, $taxonomy);
        return $term instanceof WP_Term ? $term->name : '#' . $id;
    }

    /**
     * @return WP_Post[]
     */
    private function get_pages(): array
    {
        if ($this->pages_cache !== null) {
            return $this->pages_cache;
        }

        $pages = get_pages([
            'post_status' => ['publish', 'private', 'draft', 'pending', 'future'],
            'number' => 300,
        ]);
        $this->pages_cache = is_array($pages) ? $pages : [];
        return $this->pages_cache;
    }

    /**
     * @return WP_Term[]
     */
    private function get_categories(): array
    {
        if ($this->categories_cache !== null) {
            return $this->categories_cache;
        }

        $categories = get_categories([
            'hide_empty' => false,
            'number' => 300,
        ]);
        $this->categories_cache = is_array($categories) ? $categories : [];
        return $this->categories_cache;
    }

    /**
     * @return WP_Term[]
     */
    private function get_tags(): array
    {
        if ($this->tags_cache !== null) {
            return $this->tags_cache;
        }

        $tags = get_tags([
            'hide_empty' => false,
            'number' => 300,
        ]);
        $this->tags_cache = is_array($tags) ? $tags : [];
        return $this->tags_cache;
    }

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

        $raw_targets = $_POST['region_targets'] ?? '[]';
        if (!is_string($raw_targets)) {
            wp_send_json_error(['message' => 'Los destinos deben ser una cadena JSON.'], 400);
        }
        $raw_targets = wp_unslash($raw_targets);
        $decoded_targets = json_decode($raw_targets, true, 8);
        if (!is_array($decoded_targets)) {
            wp_send_json_error(['message' => 'Los destinos no son un JSON válido.'], 400);
        }
        $targets = COD_Canvas_Document_Repository::sanitize_match_rules($decoded_targets);
        if (is_wp_error($targets)) {
            wp_send_json_error(['message' => $targets->get_error_message(), 'code' => $targets->get_error_code()], 400);
        }

        $raw_excludes = $_POST['region_excludes'] ?? '[]';
        if (!is_string($raw_excludes)) {
            wp_send_json_error(['message' => 'Las exclusiones deben ser una cadena JSON.'], 400);
        }
        $raw_excludes = wp_unslash($raw_excludes);
        $decoded_excludes = json_decode($raw_excludes, true, 8);
        if (!is_array($decoded_excludes)) {
            wp_send_json_error(['message' => 'Las exclusiones no son un JSON válido.'], 400);
        }
        $excludes = COD_Canvas_Document_Repository::sanitize_match_rules($decoded_excludes);
        if (is_wp_error($excludes)) {
            wp_send_json_error(['message' => $excludes->get_error_message(), 'code' => $excludes->get_error_code()], 400);
        }

        $saved = $this->repository->save_region($document_id, $kind, $scope, $targets, $excludes);
        if (is_wp_error($saved)) {
            wp_send_json_error(['message' => $saved->get_error_message(), 'code' => $saved->get_error_code()], 400);
        }

        wp_send_json_success($saved);
    }

    public function handle_delete_region(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $document_id = isset($_POST['document_id']) ? sanitize_key((string) wp_unslash($_POST['document_id'])) : '';
        if ($document_id === '') {
            wp_send_json_error(['message' => 'document_id es obligatorio.'], 400);
        }

        if ($this->repository->find_post_id($document_id) === null) {
            wp_send_json_error(['message' => 'No existe un documento Canvas con ese ID.'], 404);
        }

        $cleared = $this->repository->clear_region($document_id);
        if (is_wp_error($cleared)) {
            wp_send_json_error(['message' => $cleared->get_error_message(), 'code' => $cleared->get_error_code()], 400);
        }

        wp_send_json_success([
            'documentId' => $document_id,
            'cleared' => true,
        ]);
    }

    public function handle_create_template(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $title = isset($_POST['title']) ? sanitize_text_field((string) wp_unslash($_POST['title'])) : '';
        $title = trim($title);
        if ($title === '') {
            wp_send_json_error(['message' => 'El nombre de la plantilla es obligatorio.'], 400);
        }

        $created = $this->repository->create_template_group($title);
        if (is_wp_error($created)) {
            wp_send_json_error(['message' => $created->get_error_message(), 'code' => $created->get_error_code()], 400);
        }

        wp_send_json_success([
            'template' => $created,
            'cardHtml' => $this->template_card_html_by_id((string) ($created['templateId'] ?? '')),
        ]);
    }

    public function handle_add_region(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $template_id = isset($_POST['template_id']) ? sanitize_key((string) wp_unslash($_POST['template_id'])) : '';
        if ($template_id === '') {
            wp_send_json_error(['message' => 'template_id es obligatorio.'], 400);
        }

        $kind = isset($_POST['region_kind']) ? sanitize_key((string) wp_unslash($_POST['region_kind'])) : '';
        if (!in_array($kind, COD_Canvas_Document_Repository::REGION_KINDS, true)) {
            wp_send_json_error(['message' => 'region_kind desconocido.'], 400);
        }

        $created = $this->repository->add_region_to_template($template_id, $kind);
        if (is_wp_error($created)) {
            wp_send_json_error(['message' => $created->get_error_message(), 'code' => $created->get_error_code()], 400);
        }

        wp_send_json_success($created);
    }

    public function handle_rename_template(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $template_id = isset($_POST['template_id']) ? sanitize_key((string) wp_unslash($_POST['template_id'])) : '';
        if ($template_id === '') {
            wp_send_json_error(['message' => 'template_id es obligatorio.'], 400);
        }

        $title = isset($_POST['template_title']) ? sanitize_text_field((string) wp_unslash($_POST['template_title'])) : '';
        $title = trim($title);
        if ($title === '') {
            wp_send_json_error(['message' => 'El nombre de la plantilla es obligatorio.'], 400);
        }

        $renamed = $this->repository->rename_template($template_id, $title);
        if (is_wp_error($renamed)) {
            wp_send_json_error(['message' => $renamed->get_error_message(), 'code' => $renamed->get_error_code()], 400);
        }

        wp_send_json_success([
            'template' => $renamed,
            'cardHtml' => $this->template_card_html_by_id($template_id),
        ]);
    }

    public function handle_assign_region(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $template_id = isset($_POST['template_id']) ? sanitize_key((string) wp_unslash($_POST['template_id'])) : '';
        $kind = isset($_POST['region_kind']) ? sanitize_key((string) wp_unslash($_POST['region_kind'])) : '';
        $document_id = isset($_POST['document_id']) ? sanitize_key((string) wp_unslash($_POST['document_id'])) : '';
        if ($template_id === '' || $kind === '') {
            wp_send_json_error(['message' => 'template_id y region_kind son obligatorios.'], 400);
        }

        $assigned = $this->repository->assign_region_to_template($template_id, $kind, $document_id);
        if (is_wp_error($assigned)) {
            wp_send_json_error(['message' => $assigned->get_error_message(), 'code' => $assigned->get_error_code()], 400);
        }

        wp_send_json_success([
            'assignments' => $assigned,
            'cardHtml' => $this->template_card_html_by_id($template_id),
        ]);
    }

    public function handle_create_region(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $template_id = isset($_POST['template_id']) ? sanitize_key((string) wp_unslash($_POST['template_id'])) : '';
        $kind = isset($_POST['region_kind']) ? sanitize_key((string) wp_unslash($_POST['region_kind'])) : '';
        if ($template_id === '' || $kind === '') {
            wp_send_json_error(['message' => 'template_id y region_kind son obligatorios.'], 400);
        }

        $title = isset($_POST['title']) ? sanitize_text_field((string) wp_unslash($_POST['title'])) : '';
        $source_document_id = isset($_POST['source_document_id'])
            ? sanitize_key((string) wp_unslash($_POST['source_document_id']))
            : '';

        $created = $this->repository->duplicate_region($template_id, $kind, $title, $source_document_id);
        if (is_wp_error($created)) {
            wp_send_json_error(['message' => $created->get_error_message(), 'code' => $created->get_error_code()], 400);
        }

        $document_id = (string) ($created['documentId'] ?? '');
        wp_send_json_success([
            'document' => $created,
            'documentId' => $document_id,
            'editUrl' => $this->region_edit_url($document_id),
        ]);
    }

    public function handle_rename_region(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $document_id = isset($_POST['document_id']) ? sanitize_key((string) wp_unslash($_POST['document_id'])) : '';
        $template_id = isset($_POST['template_id']) ? sanitize_key((string) wp_unslash($_POST['template_id'])) : '';
        if ($document_id === '') {
            wp_send_json_error(['message' => 'document_id es obligatorio.'], 400);
        }

        $title = isset($_POST['title']) ? sanitize_text_field((string) wp_unslash($_POST['title'])) : '';
        $title = trim($title);
        if ($title === '') {
            wp_send_json_error(['message' => 'El nombre de la región es obligatorio.'], 400);
        }

        $renamed = $this->repository->rename_region($document_id, $title);
        if (is_wp_error($renamed)) {
            wp_send_json_error(['message' => $renamed->get_error_message(), 'code' => $renamed->get_error_code()], 400);
        }

        wp_send_json_success([
            'document' => $renamed,
            'cardHtml' => $this->template_card_html_by_id($template_id),
        ]);
    }

    public function handle_delete_template(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $template_id = isset($_POST['template_id']) ? sanitize_key((string) wp_unslash($_POST['template_id'])) : '';
        if ($template_id === '') {
            wp_send_json_error(['message' => 'template_id es obligatorio.'], 400);
        }

        $deleted = $this->repository->delete_template_group($template_id);
        if (is_wp_error($deleted)) {
            wp_send_json_error(['message' => $deleted->get_error_message(), 'code' => $deleted->get_error_code()], 400);
        }

        wp_send_json_success(['deleted' => true]);
    }

    public function handle_preview(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para previsualizar plantillas.', 'contope-publisher'));
        }
        check_admin_referer(self::NONCE_ACTION);

        $document_id = isset($_GET['document_id']) ? sanitize_key((string) wp_unslash($_GET['document_id'])) : '';
        if ($document_id === '') {
            wp_die(esc_html__('Falta el documento a previsualizar.', 'contope-publisher'));
        }

        if ($this->repository->find_post_id($document_id) === null) {
            wp_die(esc_html__('No existe un documento Canvas con ese ID.', 'contope-publisher'));
        }

        $document = $this->repository->load($document_id);
        if (is_wp_error($document)) {
            wp_die(esc_html($document->get_error_message()));
        }

        nocache_headers();
        header('Content-Type: text/html; charset=UTF-8');
        ?>
        <!doctype html>
        <html lang="es">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title><?php echo esc_html($document['title'] ?? $document_id); ?> — Plantilla ContOpe Design</title>
            <style><?php echo (string) ($document['css'] ?? ''); ?></style>
        </head>
        <body>
            <?php echo (string) ($document['html'] ?? ''); ?>
        </body>
        </html>
        <?php
        exit;
    }
}
