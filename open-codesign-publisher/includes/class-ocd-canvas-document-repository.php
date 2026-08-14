<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Persistencia del documento experimental del editor Canvas.
 *
 * El documento vive en una entidad WordPress propia (un post type privado) y se
 * localiza siempre por su ID estable de Open CoDesign, nunca por slug ni por el
 * ID numérico del post, que es un detalle interno de la instalación.
 */
final class OCD_Canvas_Document_Repository
{
    public const POST_TYPE = 'ocd_canvas_doc';

    /** ID estable e inmutable del único documento del slice experimental. */
    public const DOCUMENT_ID = 'ocd-canvas-experimental-0001';

    public const META_DOCUMENT_ID = '_ocd_canvas_document_id';
    public const META_PROJECT_DATA = '_ocd_canvas_project_data';
    public const META_HTML = '_ocd_canvas_html';
    public const META_CSS = '_ocd_canvas_css';
    public const META_REVISION = '_ocd_canvas_revision';
    public const META_UPDATED_AT = '_ocd_canvas_updated_at';

    /**
     * Region role this document plays when assembling a page: 'header',
     * 'body' or 'footer'. Empty string means "not a region" (the legacy
     * single-document behavior, kept so the existing experimental document
     * keeps working unchanged).
     */
    public const META_REGION_KIND = '_ocd_region_kind';
    public const REGION_KIND_HEADER = 'header';
    public const REGION_KIND_BODY = 'body';
    public const REGION_KIND_FOOTER = 'footer';
    public const REGION_KINDS = [self::REGION_KIND_HEADER, self::REGION_KIND_BODY, self::REGION_KIND_FOOTER];

    /**
     * 'global' applies to every page unless a more specific local region
     * overrides it. 'local' applies only to the posts/categories listed in
     * META_REGION_TARGETS.
     */
    public const META_REGION_SCOPE = '_ocd_region_scope';
    public const REGION_SCOPE_GLOBAL = 'global';
    public const REGION_SCOPE_LOCAL = 'local';

    /**
     * JSON-encoded array of match rules — only meaningful when
     * META_REGION_SCOPE is 'local'. See MATCH_RULE_TYPES for the full
     * vocabulary: some rules need an `id` (post/children_of/category/tag),
     * others match a whole class of content on their own (all_pages,
     * homepage, all_posts).
     */
    public const META_REGION_TARGETS = '_ocd_region_targets';

    /**
     * JSON-encoded array of match rules using the same vocabulary as
     * META_REGION_TARGETS, but subtracted instead of added: a page matching
     * a target is still excluded if it also matches an exclude rule. Mirrors
     * a "use on" / "exclude from" split rather than folding both into one
     * list, so a broad include (e.g. all_pages) can still carve out specific
     * exceptions without needing a separate narrower include rule per page.
     */
    public const META_REGION_EXCLUDES = '_ocd_region_excludes';

    public const MATCH_TYPE_ALL_PAGES = 'all_pages';
    public const MATCH_TYPE_HOMEPAGE = 'homepage';
    public const MATCH_TYPE_POST = 'post';
    public const MATCH_TYPE_CHILDREN_OF = 'children_of';
    public const MATCH_TYPE_ALL_POSTS = 'all_posts';
    public const MATCH_TYPE_CATEGORY = 'category';
    public const MATCH_TYPE_TAG = 'tag';

    /** Match types that stand on their own — no `id` field. */
    public const MATCH_TYPES_WITHOUT_ID = [
        self::MATCH_TYPE_ALL_PAGES,
        self::MATCH_TYPE_HOMEPAGE,
        self::MATCH_TYPE_ALL_POSTS,
    ];

    /** Match types that require a positive integer `id`. */
    public const MATCH_TYPES_WITH_ID = [
        self::MATCH_TYPE_POST,
        self::MATCH_TYPE_CHILDREN_OF,
        self::MATCH_TYPE_CATEGORY,
        self::MATCH_TYPE_TAG,
    ];

    public function register(): void
    {
        add_action('init', [$this, 'register_post_type']);
    }

    public function register_post_type(): void
    {
        register_post_type(self::POST_TYPE, [
            'label' => 'Open CoDesign Canvas (Experimental)',
            'public' => false,
            'publicly_queryable' => false,
            'show_ui' => false,
            'show_in_menu' => false,
            'show_in_rest' => false,
            'exclude_from_search' => true,
            'has_archive' => false,
            'rewrite' => false,
            'query_var' => false,
            'hierarchical' => false,
            'can_export' => true,
            'supports' => ['title'],
            'capability_type' => 'post',
            'map_meta_cap' => true,
        ]);

        $auth = static function (): bool {
            return current_user_can('manage_options');
        };
        foreach ([
            self::META_DOCUMENT_ID,
            self::META_PROJECT_DATA,
            self::META_HTML,
            self::META_CSS,
            self::META_UPDATED_AT,
            self::META_REGION_KIND,
            self::META_REGION_SCOPE,
            self::META_REGION_TARGETS,
            self::META_REGION_EXCLUDES,
        ] as $key) {
            register_post_meta(self::POST_TYPE, $key, [
                'type' => 'string',
                'single' => true,
                'default' => '',
                'show_in_rest' => false,
                'auth_callback' => $auth,
            ]);
        }
        register_post_meta(self::POST_TYPE, self::META_REVISION, [
            'type' => 'integer',
            'single' => true,
            'default' => 0,
            'show_in_rest' => false,
            'auth_callback' => $auth,
        ]);
    }

    /**
     * Localiza el post del documento por ID estable sin crearlo.
     */
    public function find_post_id(string $document_id): ?int
    {
        $posts = get_posts([
            'post_type' => self::POST_TYPE,
            'post_status' => 'any',
            'numberposts' => 1,
            'orderby' => 'ID',
            'order' => 'ASC',
            'fields' => 'ids',
            'no_found_rows' => true,
            'suppress_filters' => false,
            'meta_query' => [
                [
                    'key' => self::META_DOCUMENT_ID,
                    'value' => $document_id,
                    'compare' => '=',
                ],
            ],
        ]);

        return $posts === [] ? null : (int) $posts[0];
    }

    /**
     * @return int|WP_Error ID del post que respalda el documento.
     */
    public function ensure_post_id(string $document_id)
    {
        $existing = $this->find_post_id($document_id);
        if ($existing !== null) {
            return $existing;
        }

        $post_id = wp_insert_post([
            'post_type' => self::POST_TYPE,
            'post_status' => 'draft',
            'post_title' => sprintf('Open CoDesign Canvas — %s', $document_id),
            'post_content' => '',
            'meta_input' => [
                self::META_DOCUMENT_ID => $document_id,
                self::META_PROJECT_DATA => '{}',
                self::META_HTML => '',
                self::META_CSS => '',
                self::META_REVISION => 0,
                self::META_UPDATED_AT => '',
                self::META_REGION_KIND => '',
                self::META_REGION_SCOPE => '',
                self::META_REGION_TARGETS => '[]',
                self::META_REGION_EXCLUDES => '[]',
            ],
        ], true);

        if (is_wp_error($post_id)) {
            return $post_id;
        }

        return (int) $post_id;
    }

    /**
     * @return array<string, mixed>|WP_Error
     */
    public function load(string $document_id)
    {
        $post_id = $this->ensure_post_id($document_id);
        if (is_wp_error($post_id)) {
            return $post_id;
        }

        return $this->read($post_id, $document_id);
    }

    /**
     * Guarda las tres representaciones por separado y avanza la revisión.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function save(string $document_id, string $project_data, string $html, string $css)
    {
        $post_id = $this->ensure_post_id($document_id);
        if (is_wp_error($post_id)) {
            return $post_id;
        }

        $revision = (int) get_post_meta($post_id, self::META_REVISION, true);
        $updated_at = gmdate('c');

        update_post_meta($post_id, self::META_PROJECT_DATA, $project_data);
        update_post_meta($post_id, self::META_HTML, $html);
        update_post_meta($post_id, self::META_CSS, $css);
        update_post_meta($post_id, self::META_REVISION, $revision + 1);
        update_post_meta($post_id, self::META_UPDATED_AT, $updated_at);

        return $this->read($post_id, $document_id);
    }

    /**
     * @return array<string, mixed>
     */
    private function read(int $post_id, string $document_id): array
    {
        $project_data = (string) get_post_meta($post_id, self::META_PROJECT_DATA, true);
        $targets = $this->decode_rules((string) get_post_meta($post_id, self::META_REGION_TARGETS, true));
        $excludes = $this->decode_rules((string) get_post_meta($post_id, self::META_REGION_EXCLUDES, true));

        return [
            'documentId' => $document_id,
            'postId' => $post_id,
            'postType' => self::POST_TYPE,
            'title' => (string) get_the_title($post_id),
            'projectData' => $project_data === '' ? '{}' : $project_data,
            'html' => (string) get_post_meta($post_id, self::META_HTML, true),
            'css' => (string) get_post_meta($post_id, self::META_CSS, true),
            'revision' => (int) get_post_meta($post_id, self::META_REVISION, true),
            'updatedAt' => (string) get_post_meta($post_id, self::META_UPDATED_AT, true),
            'regionKind' => (string) get_post_meta($post_id, self::META_REGION_KIND, true),
            'regionScope' => (string) get_post_meta($post_id, self::META_REGION_SCOPE, true),
            'regionTargets' => $targets,
            'regionExcludes' => $excludes,
        ];
    }

    /**
     * @return array<int, array{type: string, id?: int}>
     */
    private function decode_rules(string $raw): array
    {
        $decoded = json_decode($raw === '' ? '[]' : $raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Validates and normalizes a match-rule list (used for both "use on"
     * targets and "exclude from" excludes — same vocabulary, opposite
     * effect). Each entry must be `{"type": <one of MATCH_TYPE_*>}`, plus
     * `{"id": <positive int>}` for the types that need one. Anything else is
     * rejected outright rather than silently dropped, so a malformed
     * assignment never resolves to "applies nowhere" (indistinguishable from
     * intentionally empty) or "applies unexpectedly".
     *
     * @param mixed $rules
     * @return array<int, array{type: string, id?: int}>|WP_Error
     */
    public static function sanitize_match_rules($rules)
    {
        if (!is_array($rules)) {
            return new WP_Error('ocd_region_rules_invalid', 'El valor debe ser un arreglo.');
        }
        $normalized = [];
        foreach ($rules as $entry) {
            if (!is_array($entry) || !isset($entry['type'])) {
                return new WP_Error('ocd_region_rules_invalid', 'Cada regla requiere type.');
            }
            $type = $entry['type'];
            $needs_id = in_array($type, self::MATCH_TYPES_WITH_ID, true);
            $standalone = in_array($type, self::MATCH_TYPES_WITHOUT_ID, true);
            if (!$needs_id && !$standalone) {
                return new WP_Error(
                    'ocd_region_rules_invalid',
                    'type desconocido: ' . (is_string($type) ? $type : gettype($type))
                );
            }
            if (!$needs_id) {
                $normalized[] = ['type' => $type];
                continue;
            }
            if (!isset($entry['id'])) {
                return new WP_Error('ocd_region_rules_invalid', 'El tipo "' . $type . '" requiere id.');
            }
            $id = $entry['id'];
            if (!is_int($id) && !(is_string($id) && ctype_digit($id))) {
                return new WP_Error('ocd_region_rules_invalid', 'id debe ser un entero positivo.');
            }
            $id_int = (int) $id;
            if ($id_int <= 0) {
                return new WP_Error('ocd_region_rules_invalid', 'id debe ser un entero positivo.');
            }
            $normalized[] = ['type' => $type, 'id' => $id_int];
        }
        return $normalized;
    }

    /**
     * Persists the region role (kind/scope/targets/excludes) for an existing
     * document without touching its projectData/html/css/revision.
     *
     * @param array<int, array{type: string, id?: int}> $targets
     * @param array<int, array{type: string, id?: int}> $excludes
     * @return array<string, mixed>|WP_Error
     */
    public function save_region(string $document_id, string $kind, string $scope, array $targets, array $excludes = [])
    {
        if ($kind !== '' && !in_array($kind, self::REGION_KINDS, true)) {
            return new WP_Error('ocd_region_kind_invalid', 'regionKind desconocido.');
        }
        if ($scope !== '' && $scope !== self::REGION_SCOPE_GLOBAL && $scope !== self::REGION_SCOPE_LOCAL) {
            return new WP_Error('ocd_region_scope_invalid', 'regionScope desconocido.');
        }
        if ($scope === self::REGION_SCOPE_LOCAL && $targets === []) {
            return new WP_Error('ocd_region_targets_required', 'Una región local necesita al menos un destino.');
        }

        $post_id = $this->ensure_post_id($document_id);
        if (is_wp_error($post_id)) {
            return $post_id;
        }

        update_post_meta($post_id, self::META_REGION_KIND, $kind);
        update_post_meta($post_id, self::META_REGION_SCOPE, $scope);
        update_post_meta($post_id, self::META_REGION_TARGETS, wp_json_encode($targets));
        update_post_meta($post_id, self::META_REGION_EXCLUDES, wp_json_encode($excludes));

        return $this->read($post_id, $document_id);
    }

    /**
     * Lists every canvas document that has a region kind assigned, for the
     * page-assembly resolver and for the admin picker. Documents with an
     * empty regionKind (the legacy single-document behavior) are excluded.
     *
     * @return array<int, array<string, mixed>>
     */
    public function list_region_documents(): array
    {
        $posts = get_posts([
            'post_type' => self::POST_TYPE,
            'post_status' => 'any',
            'numberposts' => -1,
            'orderby' => 'ID',
            'order' => 'ASC',
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_query' => [
                [
                    'key' => self::META_REGION_KIND,
                    'value' => '',
                    'compare' => '!=',
                ],
            ],
        ]);

        $documents = [];
        foreach ($posts as $post_id) {
            $document_id = (string) get_post_meta((int) $post_id, self::META_DOCUMENT_ID, true);
            if ($document_id === '') {
                continue;
            }
            $documents[] = $this->read((int) $post_id, $document_id);
        }
        return $documents;
    }
}
