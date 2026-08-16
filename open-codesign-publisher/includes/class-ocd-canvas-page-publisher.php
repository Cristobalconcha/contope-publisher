<?php

if (!defined('ABSPATH')) {
    exit;
}

/** Publishes a saved Canvas document as a stable WordPress page. */
final class OCD_Canvas_Page_Publisher
{
    public const META_DOCUMENT_ID = '_ocd_canvas_document_id';

    /** @var string|null Cache por request del CSS de fuentes autocontenidas. */
    private static ?string $site_font_css_cache = null;

    public function __construct(
        private OCD_Canvas_Document_Repository $repository,
        private ?OCD_Template_Region_Resolver $region_resolver = null,
        private ?OCD_Dynamic_Token_Resolver $token_resolver = null
    ) {
    }

    public function register(): void
    {
        add_shortcode('open_codesign_canvas', [$this, 'render_shortcode']);
        add_filter('template_include', [$this, 'standalone_template']);
    }

    /**
     * Devuelve el CSS de @font-face autocontenido de las tipografías del sitio.
     *
     * Lo genera scripts/build-fonts.mjs en uploads/open-codesign/fonts/fonts.css.
     * Las URLs llegan con el placeholder {FONTS_BASE_URL}, que aquí se resuelve
     * contra el directorio de uploads real (portable entre instalaciones). Si el
     * archivo no existe devuelve cadena vacía y todo sigue funcionando como hoy.
     */
    public static function site_font_css(): string
    {
        if (self::$site_font_css_cache !== null) {
            return self::$site_font_css_cache;
        }

        $uploads = wp_upload_dir();
        $fonts_dir = trailingslashit((string) $uploads['basedir']) . 'open-codesign/fonts';
        $file = trailingslashit($fonts_dir) . 'fonts.css';

        if (!is_file($file)) {
            self::$site_font_css_cache = '';
            return '';
        }

        $css = (string) file_get_contents($file);
        $base_url = trailingslashit((string) $uploads['baseurl']) . 'open-codesign/fonts';
        self::$site_font_css_cache = str_replace('{FONTS_BASE_URL}', $base_url, $css);

        return self::$site_font_css_cache;
    }

    /**
     * @param int $page_id Optional explicit WordPress page target. When
     *                     greater than 0 it anchors the document to that
     *                     existing page; otherwise the legacy meta lookup
     *                     keeps mapping one page per document_id.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function publish(string $document_id, string $title, int $page_id = 0)
    {
        $document = $this->repository->load($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        if (trim((string) $document['html']) === '') {
            return new WP_Error('ocd_canvas_empty', 'Guarda contenido en el Canvas antes de publicarlo.');
        }

        if ($page_id > 0) {
            $target = get_post($page_id);
            if (!$target instanceof WP_Post || $target->post_type !== 'page') {
                return new WP_Error('ocd_canvas_page_invalid', 'La página objetivo no existe o no es una página.');
            }
        } else {
            $page_id = (int) ($this->find_page_id($document_id) ?? 0);
        }

        $post = [
            'post_type' => 'page',
            'post_status' => 'publish',
            'post_title' => $title !== '' ? $title : 'Página Open CoDesign Canvas',
            'post_content' => sprintf('[open_codesign_canvas document_id="%s"]', esc_attr($document_id)),
            'meta_input' => [self::META_DOCUMENT_ID => $document_id],
        ];
        if ($page_id > 0) {
            $post['ID'] = $page_id;
        }
        $saved_id = wp_insert_post($post, true);
        if (is_wp_error($saved_id)) {
            return $saved_id;
        }

        return $this->describe_page((int) $saved_id);
    }

    /** @return array<string, mixed>|null */
    public function current(string $document_id): ?array
    {
        $page_id = $this->find_page_id($document_id);
        return $page_id === null ? null : $this->describe_page($page_id);
    }

    /** @param array<string, mixed> $attributes */
    public function render_shortcode(array $attributes): string
    {
        $document_id = sanitize_key((string) ($attributes['document_id'] ?? ''));
        if ($document_id === '') {
            return '';
        }
        $document = $this->repository->load($document_id);
        if (is_wp_error($document)) {
            return '';
        }

        // Header/footer are resolved live, at render time, against the real
        // page being viewed — not baked in at publish time. This is what
        // makes a global (or category-local) region propagate automatically
        // to every page that uses it without republishing each one.
        $post_id = (int) get_the_ID();
        $header_html = '';
        $footer_html = '';
        $header_css = '';
        $footer_css = '';
        if ($this->region_resolver !== null) {
            if ($post_id > 0) {
                $header = $this->region_resolver->resolve(
                    OCD_Canvas_Document_Repository::REGION_KIND_HEADER,
                    $post_id
                );
                if ($header !== null) {
                    $header_html = (string) $header['html'];
                    $header_css = (string) $header['css'];
                }
                $footer = $this->region_resolver->resolve(
                    OCD_Canvas_Document_Repository::REGION_KIND_FOOTER,
                    $post_id
                );
                if ($footer !== null) {
                    $footer_html = (string) $footer['html'];
                    $footer_css = (string) $footer['css'];
                }
            }
        }

        $site_font_css = self::site_font_css();
        wp_register_style('ocd-canvas-public', false, [], OCD_PUBLISHER_VERSION);
        wp_enqueue_style('ocd-canvas-public');
        wp_add_inline_style('ocd-canvas-public', $site_font_css . $header_css . (string) $document['css'] . $footer_css);
        wp_enqueue_script(
            'ocd-canvas-public',
            plugins_url('assets/js/ocd-canvas-public.js', OCD_PUBLISHER_FILE),
            [],
            OCD_PUBLISHER_VERSION,
            true
        );

        $markup = '';
        if ($header_html !== '') {
            $markup .= '<header class="ocd-canvas-region ocd-canvas-region-header">' . $header_html . '</header>';
        }
        $markup .= '<div class="ocd-canvas-published" data-ocd-document-id="' . esc_attr($document_id) . '">' .
            (string) $document['html'] . '</div>';
        if ($footer_html !== '') {
            $markup .= '<footer class="ocd-canvas-region ocd-canvas-region-footer">' . $footer_html . '</footer>';
        }

        if ($this->token_resolver !== null) {
            $markup = $this->token_resolver->resolve($markup, $post_id);
        }

        return $markup;
    }

    public function standalone_template(string $template): string
    {
        if (!is_singular('page')) {
            return $template;
        }
        $page_id = (int) get_queried_object_id();
        if ((string) get_post_meta($page_id, self::META_DOCUMENT_ID, true) === '') {
            return $template;
        }

        return OCD_PUBLISHER_DIR . 'templates/canvas-document.php';
    }

    private function find_page_id(string $document_id): ?int
    {
        $ids = get_posts([
            'post_type' => 'page',
            'post_status' => 'any',
            'numberposts' => 1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_key' => self::META_DOCUMENT_ID,
            'meta_value' => $document_id,
        ]);
        return $ids === [] ? null : (int) $ids[0];
    }

    /** @return array<string, mixed> */
    private function describe_page(int $page_id): array
    {
        $post = get_post($page_id);
        return [
            'pageId' => $page_id,
            'title' => $post instanceof WP_Post ? $post->post_title : '',
            'status' => $post instanceof WP_Post ? $post->post_status : '',
            'url' => get_permalink($page_id),
            'editUrl' => get_edit_post_link($page_id, 'raw'),
        ];
    }
}
