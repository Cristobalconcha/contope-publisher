<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla "Plantillas" del menú Open CoDesign.
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
final class OCD_Theme_Builder_Admin
{
    public const PAGE_SLUG = 'open-codesign-templates';
    public const PARENT_SLUG = 'open-codesign-publisher';
    public const CAPABILITY = 'manage_options';
    public const NONCE_ACTION = 'ocd_theme_builder';
    public const AJAX_SAVE_REGION = 'ocd_theme_builder_save_region';
    public const AJAX_DELETE_REGION = 'ocd_theme_builder_delete_region';
    public const AJAX_CREATE_TEMPLATE = 'ocd_theme_builder_create_template';
    public const AJAX_ADD_REGION = 'ocd_theme_builder_add_region';
    public const AJAX_RENAME_TEMPLATE = 'ocd_theme_builder_rename_template';
    public const ADMIN_POST_PREVIEW = 'ocd_theme_builder_preview';

    private string $hook_suffix = '';

    /** @var WP_Post[]|null */
    private ?array $pages_cache = null;

    /** @var WP_Term[]|null */
    private ?array $categories_cache = null;

    /** @var WP_Term[]|null */
    private ?array $tags_cache = null;

    public function __construct(
        private OCD_Canvas_Document_Repository $repository,
        private OCD_Canvas_Page_Publisher $publisher
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
            'ocd-theme-builder',
            plugins_url('assets/css/ocd-theme-builder.css', OCD_PUBLISHER_FILE),
            ['dashicons'],
            OCD_PUBLISHER_VERSION
        );
        wp_enqueue_script(
            'ocd-theme-builder',
            plugins_url('assets/js/ocd-theme-builder.js', OCD_PUBLISHER_FILE),
            [],
            OCD_PUBLISHER_VERSION,
            true
        );
        wp_add_inline_script(
            'ocd-theme-builder',
            'window.ocdThemeBuilder = ' . wp_json_encode(
                [
                    'ajaxUrl' => admin_url('admin-ajax.php'),
                    'nonce' => wp_create_nonce(self::NONCE_ACTION),
                    'saveRegionAction' => self::AJAX_SAVE_REGION,
                    'deleteRegionAction' => self::AJAX_DELETE_REGION,
                    'createTemplateAction' => self::AJAX_CREATE_TEMPLATE,
                    'addRegionAction' => self::AJAX_ADD_REGION,
                    'renameTemplateAction' => self::AJAX_RENAME_TEMPLATE,
                ],
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            ) . ';',
            'before'
        );
    }

    public function render_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar las plantillas.', 'open-codesign-publisher'));
        }

        $templates = $this->repository->list_templates();
        ?>
        <div class="wrap ocd-tb-wrap">
            <div class="ocd-tb-header">
                <div>
                    <h1>Plantillas</h1>
                    <p>
                        Cada tarjeta es una plantilla con sus tres regiones (Encabezado, Cuerpo y Pie).
                        Editalas en el Canvas y configurá el alcance de cada región acá mismo.
                    </p>
                </div>
                <form class="ocd-tb-create" id="ocd-tb-create">
                    <label>
                        <span>Nueva plantilla</span>
                        <input type="text" name="title" maxlength="160" placeholder="Nombre de la plantilla" required>
                    </label>
                    <button type="submit" class="button button-primary">Crear plantilla</button>
                    <span class="ocd-tb-status" role="status" aria-live="polite"></span>
                </form>
            </div>

            <div class="ocd-tb-grid">
                <?php foreach ($templates as $template) : ?>
                    <?php $this->render_template_card($template); ?>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
    }

    /**
     * @param array<string, mixed> $template
     */
    private function render_template_card(array $template): void
    {
        $template_id = (string) ($template['templateId'] ?? '');
        $title = (string) ($template['title'] ?? $template_id);
        $is_default = (bool) ($template['isDefault'] ?? false);
        $is_legacy = (bool) ($template['isLegacy'] ?? false);
        $allow_add = (bool) ($template['allowAdd'] ?? false);
        $regions = $template['regions'] ?? [];
        ?>
        <article class="ocd-tb-card<?php echo $is_default ? ' is-default' : ''; ?><?php echo $is_legacy ? ' is-legacy' : ''; ?>"
            data-template-id="<?php echo esc_attr($template_id); ?>">
            <div class="ocd-tb-card-rows">
                <?php foreach (OCD_Canvas_Document_Repository::REGION_KINDS as $kind) : ?>
                    <?php $document = $regions[$kind] ?? null; ?>
                    <?php if (is_array($document)) : ?>
                        <?php $this->render_assigned_region($document, $kind); ?>
                    <?php elseif ($allow_add) : ?>
                        <?php $this->render_empty_region($template, $kind); ?>
                    <?php endif; ?>
                <?php endforeach; ?>
            </div>

            <?php if (!$is_default && !$is_legacy) : ?>
                <form class="ocd-tb-rename" data-template-id="<?php echo esc_attr($template_id); ?>">
                    <label class="ocd-tb-field" for="ocd-tb-name-<?php echo esc_attr($template_id); ?>">
                        <span>Nombre de la plantilla</span>
                        <input type="text" id="ocd-tb-name-<?php echo esc_attr($template_id); ?>" name="template_title"
                            maxlength="160" value="<?php echo esc_attr($title); ?>" required>
                    </label>
                    <button type="submit" class="button button-secondary">Guardar nombre</button>
                    <span class="ocd-tb-status" role="status" aria-live="polite"></span>
                </form>
            <?php else : ?>
                <h2 class="ocd-tb-card-name"><?php echo esc_html($title); ?></h2>
            <?php endif; ?>
        </article>
        <?php
    }

    /**
     * @param array<string, mixed> $document
     */
    private function render_assigned_region(array $document, string $kind): void
    {
        $document_id = (string) ($document['documentId'] ?? '');
        $scope = (string) ($document['regionScope'] ?? '');
        $targets = $document['regionTargets'] ?? [];
        $excludes = $document['regionExcludes'] ?? [];
        $targets = is_array($targets) ? $targets : [];
        $excludes = is_array($excludes) ? $excludes : [];

        $edit_url = wp_nonce_url(
            add_query_arg(
                [
                    'page' => OCD_Canvas_Editor_Admin::PAGE_SLUG,
                    'document_id' => $document_id,
                ],
                admin_url('admin.php')
            ),
            OCD_Canvas_Editor_Admin::NONCE_ACTION,
            'ocd_nonce'
        );
        $published = $this->publisher->current($document_id);
        if (is_array($published) && !empty($published['url'])) {
            $preview_url = $published['url'];
        } else {
            $preview_url = wp_nonce_url(
                add_query_arg(
                    [
                        'action' => self::ADMIN_POST_PREVIEW,
                        'document_id' => $document_id,
                    ],
                    admin_url('admin-post.php')
                ),
                self::NONCE_ACTION
            );
        }
        ?>
        <div class="ocd-tb-region" data-document-id="<?php echo esc_attr($document_id); ?>" data-region-kind="<?php echo esc_attr($kind); ?>">
            <div class="ocd-tb-row">
                <a class="ocd-tb-icon ocd-tb-edit" href="<?php echo esc_url($edit_url); ?>"
                    title="Editar en el editor Canvas">
                    <span class="dashicons dashicons-edit" aria-hidden="true"></span>
                    <span class="screen-reader-text">Editar en el editor Canvas</span>
                </a>
                <span class="ocd-tb-row-label"><?php echo esc_html($this->region_kind_label($kind)); ?></span>
                <div class="ocd-tb-row-actions">
                    <button type="button" class="ocd-tb-icon ocd-tb-delete" title="Quitar esta región de la plantilla">
                        <span class="dashicons dashicons-trash" aria-hidden="true"></span>
                        <span class="screen-reader-text">Quitar esta región de la plantilla</span>
                    </button>
                    <a class="ocd-tb-icon ocd-tb-preview" href="<?php echo esc_url($preview_url); ?>"
                        target="_blank" rel="noopener" title="Previsualizar">
                        <span class="dashicons dashicons-visibility" aria-hidden="true"></span>
                        <span class="screen-reader-text">Previsualizar</span>
                    </a>
                </div>
            </div>

            <form class="ocd-tb-scope-form">
                <p class="ocd-tb-scope-summary"><?php echo esc_html($this->describe_scope($scope, $targets, $excludes)); ?></p>

                <label class="ocd-tb-field">
                    <span>Alcance</span>
                    <select name="region_scope" class="ocd-tb-scope">
                        <option value="global" <?php selected($scope, OCD_Canvas_Document_Repository::REGION_SCOPE_GLOBAL); ?>>
                            Global — todo el sitio
                        </option>
                        <option value="local" <?php selected($scope, OCD_Canvas_Document_Repository::REGION_SCOPE_LOCAL); ?>>
                            Local — destinos específicos
                        </option>
                    </select>
                </label>

                <label class="ocd-tb-field">
                    <span>Destinos (solo si es Local)</span>
                    <select name="region_targets" multiple size="5" class="ocd-tb-targets">
                        <?php $this->render_rule_options($targets); ?>
                    </select>
                </label>

                <label class="ocd-tb-field">
                    <span>Exclusiones (opcional)</span>
                    <select name="region_excludes" multiple size="4" class="ocd-tb-excludes">
                        <?php $this->render_rule_options($excludes); ?>
                    </select>
                </label>

                <div class="ocd-tb-form-actions">
                    <button type="submit" class="button button-primary">Guardar alcance</button>
                    <span class="ocd-tb-status" role="status" aria-live="polite"></span>
                </div>
            </form>
        </div>
        <?php
    }

    /**
     * @param array<string, mixed> $template
     */
    private function render_empty_region(array $template, string $kind): void
    {
        $is_default = (bool) ($template['isDefault'] ?? false);
        ?>
        <div class="ocd-tb-region ocd-tb-region-empty" data-region-kind="<?php echo esc_attr($kind); ?>">
            <div class="ocd-tb-row ocd-tb-empty-row">
                <span class="ocd-tb-row-label"><?php echo esc_html($this->region_short_label($kind)); ?></span>
                <div class="ocd-tb-row-actions">
                    <span class="ocd-tb-icon ocd-tb-preview is-disabled" aria-hidden="true"
                        title="Previsualización no disponible hasta agregar la región">
                        <span class="dashicons dashicons-visibility"></span>
                    </span>
                    <button type="button" class="button ocd-tb-add-region">
                        <?php echo esc_html($this->empty_region_action_label($kind, $is_default)); ?>
                    </button>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * @param array<int, array{type: string, id?: int}> $selected
     */
    private function render_rule_options(array $selected): void
    {
        ?>
        <optgroup label="Páginas">
            <option value="all_pages" <?php selected($this->has_rule($selected, OCD_Canvas_Document_Repository::MATCH_TYPE_ALL_PAGES)); ?>>
                Todas las páginas
            </option>
            <option value="homepage" <?php selected($this->has_rule($selected, OCD_Canvas_Document_Repository::MATCH_TYPE_HOMEPAGE)); ?>>
                Portada
            </option>
            <?php foreach ($this->get_pages() as $page) : ?>
                <option value="<?php echo esc_attr('post:' . $page->ID); ?>"
                    <?php selected($this->has_rule($selected, OCD_Canvas_Document_Repository::MATCH_TYPE_POST, (int) $page->ID)); ?>>
                    Página: <?php echo esc_html(get_the_title($page)); ?>
                </option>
            <?php endforeach; ?>
        </optgroup>
        <optgroup label="Hijas de página">
            <?php foreach ($this->get_pages() as $page) : ?>
                <option value="<?php echo esc_attr('children_of:' . $page->ID); ?>"
                    <?php selected($this->has_rule($selected, OCD_Canvas_Document_Repository::MATCH_TYPE_CHILDREN_OF, (int) $page->ID)); ?>>
                    Hijas de: <?php echo esc_html(get_the_title($page)); ?>
                </option>
            <?php endforeach; ?>
        </optgroup>
        <optgroup label="Entradas">
            <option value="all_posts" <?php selected($this->has_rule($selected, OCD_Canvas_Document_Repository::MATCH_TYPE_ALL_POSTS)); ?>>
                Todas las entradas
            </option>
            <?php foreach ($this->get_categories() as $category) : ?>
                <option value="<?php echo esc_attr('category:' . $category->term_id); ?>"
                    <?php selected($this->has_rule($selected, OCD_Canvas_Document_Repository::MATCH_TYPE_CATEGORY, (int) $category->term_id)); ?>>
                    Categoría: <?php echo esc_html($category->name); ?>
                </option>
            <?php endforeach; ?>
            <?php foreach ($this->get_tags() as $tag) : ?>
                <option value="<?php echo esc_attr('tag:' . $tag->term_id); ?>"
                    <?php selected($this->has_rule($selected, OCD_Canvas_Document_Repository::MATCH_TYPE_TAG, (int) $tag->term_id)); ?>>
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
            case OCD_Canvas_Document_Repository::REGION_KIND_HEADER:
                return 'Encabezado personalizado';
            case OCD_Canvas_Document_Repository::REGION_KIND_BODY:
                return 'Cuerpo personalizado';
            case OCD_Canvas_Document_Repository::REGION_KIND_FOOTER:
                return 'Pie de página personalizado';
            default:
                return 'Región';
        }
    }

    private function region_short_label(string $kind): string
    {
        switch ($kind) {
            case OCD_Canvas_Document_Repository::REGION_KIND_HEADER:
                return 'Encabezado';
            case OCD_Canvas_Document_Repository::REGION_KIND_BODY:
                return 'Cuerpo';
            case OCD_Canvas_Document_Repository::REGION_KIND_FOOTER:
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
        if ($scope === OCD_Canvas_Document_Repository::REGION_SCOPE_LOCAL) {
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
            case OCD_Canvas_Document_Repository::MATCH_TYPE_ALL_PAGES:
                return 'Todas las páginas';
            case OCD_Canvas_Document_Repository::MATCH_TYPE_HOMEPAGE:
                return 'Portada';
            case OCD_Canvas_Document_Repository::MATCH_TYPE_ALL_POSTS:
                return 'Todas las entradas';
            case OCD_Canvas_Document_Repository::MATCH_TYPE_POST:
                return 'Página: ' . $this->post_title_or_id($id);
            case OCD_Canvas_Document_Repository::MATCH_TYPE_CHILDREN_OF:
                return 'Hijas de: ' . $this->post_title_or_id($id);
            case OCD_Canvas_Document_Repository::MATCH_TYPE_CATEGORY:
                return 'Categoría: ' . $this->term_name_or_id('category', $id);
            case OCD_Canvas_Document_Repository::MATCH_TYPE_TAG:
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
        $targets = OCD_Canvas_Document_Repository::sanitize_match_rules($decoded_targets);
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
        $excludes = OCD_Canvas_Document_Repository::sanitize_match_rules($decoded_excludes);
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

        wp_send_json_success($created);
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
        if (!in_array($kind, OCD_Canvas_Document_Repository::REGION_KINDS, true)) {
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

        wp_send_json_success($renamed);
    }

    public function handle_preview(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para previsualizar plantillas.', 'open-codesign-publisher'));
        }
        check_admin_referer(self::NONCE_ACTION);

        $document_id = isset($_GET['document_id']) ? sanitize_key((string) wp_unslash($_GET['document_id'])) : '';
        if ($document_id === '') {
            wp_die(esc_html__('Falta el documento a previsualizar.', 'open-codesign-publisher'));
        }

        if ($this->repository->find_post_id($document_id) === null) {
            wp_die(esc_html__('No existe un documento Canvas con ese ID.', 'open-codesign-publisher'));
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
            <title><?php echo esc_html($document['title'] ?? $document_id); ?> — Plantilla Open CoDesign</title>
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
