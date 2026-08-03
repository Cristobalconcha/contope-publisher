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
        foreach ([self::META_DOCUMENT_ID, self::META_PROJECT_DATA, self::META_HTML, self::META_CSS, self::META_UPDATED_AT] as $key) {
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

        return [
            'documentId' => $document_id,
            'postId' => $post_id,
            'postType' => self::POST_TYPE,
            'projectData' => $project_data === '' ? '{}' : $project_data,
            'html' => (string) get_post_meta($post_id, self::META_HTML, true),
            'css' => (string) get_post_meta($post_id, self::META_CSS, true),
            'revision' => (int) get_post_meta($post_id, self::META_REVISION, true),
            'updatedAt' => (string) get_post_meta($post_id, self::META_UPDATED_AT, true),
        ];
    }
}
