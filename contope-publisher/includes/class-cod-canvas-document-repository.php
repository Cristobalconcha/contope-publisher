<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Persistencia del documento experimental del editor Canvas.
 *
 * El documento vive en una entidad WordPress propia (un post type privado) y se
 * localiza siempre por su ID estable de ContOpe Design, nunca por slug ni por el
 * ID numérico del post, que es un detalle interno de la instalación.
 */
final class COD_Canvas_Document_Repository
{
    public const POST_TYPE = 'cod_canvas_doc';

    /** ID estable e inmutable del único documento del slice experimental. */
    public const DOCUMENT_ID = 'cod-canvas-experimental-0001';

    public const META_DOCUMENT_ID = '_cod_canvas_document_id';
    public const META_PROJECT_DATA = '_cod_canvas_project_data';
    public const META_HTML = '_cod_canvas_html';
    public const META_CSS = '_cod_canvas_css';
    public const META_REVISION = '_cod_canvas_revision';
    public const META_UPDATED_AT = '_cod_canvas_updated_at';

    /**
     * Última composición MCP aplicada con éxito: `{composition, design}` tal
     * cual salió normalizada del compilador (COD_Canvas_MCP_Recipe_Compiler::
     * compile()['compositionSnapshot'|'designSnapshot']), resubmitible sin
     * cambios a cod_preview_canvas_composition/cod_apply_canvas_composition.
     * No es una representación cruda (HTML/CSS/JS): es la misma composición
     * declarativa que ya se validó al aplicarse, guardada para poder editar un
     * nodo puntual después sin reconstruir el resto a ciegas.
     *
     * Vacío ('') para documentos que nunca se escribieron por esta vía (por
     * ejemplo, contenido armado a mano en el editor Grapes) — cod_read_canvas_
     * composition debe distinguir ese caso, no inventar un árbol.
     */
    public const META_COMPOSITION = '_cod_canvas_composition';

    /**
     * Índice JSON de snapshots de sesión por documento: arreglo de
     * `{id, session, label, createdAt (ISO UTC), revision}`. Cada snapshot
     * guarda además su contenido en una meta propia `_cod_canvas_snap_<id>`.
     */
    public const META_SNAPSHOTS = '_cod_canvas_snapshots';

    /** Prefijo de las metas individuales que guardan el contenido de cada snapshot. */
    public const SNAPSHOT_META_PREFIX = '_cod_canvas_snap_';

    /** Límite de snapshots conservados por documento. */
    public const MAX_SNAPSHOTS = 15;

    /** Etiqueta reservada para el snapshot de apertura de sesión. */
    public const SNAPSHOT_SESSION_OPEN_LABEL = 'session-open';

    /**
     * Region role this document plays when assembling a page: 'header',
     * 'body' or 'footer'. Empty string means "not a region" (the legacy
     * single-document behavior, kept so the existing experimental document
     * keeps working unchanged).
     */
    public const META_REGION_KIND = '_cod_region_kind';
    public const REGION_KIND_HEADER = 'header';
    public const REGION_KIND_BODY = 'body';
    public const REGION_KIND_FOOTER = 'footer';
    public const REGION_KINDS = [self::REGION_KIND_HEADER, self::REGION_KIND_BODY, self::REGION_KIND_FOOTER];

    /**
     * Documento Canvas especial, compartido por TODAS las páginas del sitio
     * en vez de vivir por separado en cada una. No es una región (no tiene
     * scope/targets/excludes: no se resuelve "para esta página sí, para
     * aquella no") — es una sola hoja de clases reutilizables, como .cod-btn,
     * que hasta ahora había que duplicar a mano en cada documento y por eso
     * se desalineaban entre páginas. Se edita con las mismas herramientas que
     * cualquier documento (revisión, bloqueo, snapshot); ver target() en
     * class-cod-canvas-mcp-service.php para cómo se autoriza su escritura con
     * pageId 0.
     */
    public const SHARED_STYLES_DOCUMENT_ID = 'cod-shared-styles';

    /**
     * 'global' applies to every page unless a more specific local region
     * overrides it. 'local' applies only to the posts/categories listed in
     * META_REGION_TARGETS.
     */
    public const META_REGION_SCOPE = '_cod_region_scope';
    public const REGION_SCOPE_GLOBAL = 'global';
    public const REGION_SCOPE_LOCAL = 'local';

    /**
     * JSON-encoded array of match rules — only meaningful when
     * META_REGION_SCOPE is 'local'. See MATCH_RULE_TYPES for the full
     * vocabulary: some rules need an `id` (post/children_of/category/tag),
     * others match a whole class of content on their own (all_pages,
     * homepage, all_posts).
     */
    public const META_REGION_TARGETS = '_cod_region_targets';

    /**
     * JSON-encoded array of match rules using the same vocabulary as
     * META_REGION_TARGETS, but subtracted instead of added: a page matching
     * a target is still excluded if it also matches an exclude rule. Mirrors
     * a "use on" / "exclude from" split rather than folding both into one
     * list, so a broad include (e.g. all_pages) can still carve out specific
     * exceptions without needing a separate narrower include rule per page.
     */
    public const META_REGION_EXCLUDES = '_cod_region_excludes';

    /**
     * Stable template/group identity. Unlike the numeric WordPress post ID,
     * this is generated once when the template is created and never derived
     * from a title or slug, so renaming the template cannot break the group.
     */
    public const META_REGION_TEMPLATE_ID = '_cod_region_template_id';

    /**
     * Human-readable template name, stored separately from the immutable ID.
     * Kept on every region document (and on the group container) so the UI
     * can render a card even when only one side of the group was fetched.
     */
    public const META_REGION_TEMPLATE_TITLE = '_cod_region_template_title';

    /**
     * Template→region assignment map (shared references, many-to-many), stored
     * as JSON `{header, body, footer}` on the template's container post. Each
     * value is a stable document ID or '' (free slot). This map is the source
     * of truth for card slots; the per-document META_REGION_TEMPLATE_ID keeps
     * marking the template that CREATED the region (its "home") and doubles as
     * the compatibility grouping when this meta does not exist yet.
     */
    public const META_REGION_ASSIGNMENTS = '_cod_region_assignments';

    /**
     * Template ID for the always-visible "site default" card (global scope).
     */
    public const DEFAULT_TEMPLATE_ID = 'cod-site-default';

    /** Prefix for generated template IDs (group identity). */
    public const TEMPLATE_ID_PREFIX = 'cod-region-template-';

    /** Prefix for generated region document IDs. */
    public const REGION_DOCUMENT_ID_PREFIX = 'cod-template-';

    /** Tiempo máximo del bloqueo breve que serializa las mutaciones Canvas. */
    private const MUTATION_LOCK_TTL_SECONDS = 30;

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
            'label' => 'ContOpe Canvas (Experimental)',
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
            self::META_COMPOSITION,
            self::META_SNAPSHOTS,
            self::META_REGION_KIND,
            self::META_REGION_SCOPE,
            self::META_REGION_TARGETS,
            self::META_REGION_EXCLUDES,
            self::META_REGION_TEMPLATE_ID,
            self::META_REGION_TEMPLATE_TITLE,
            self::META_REGION_ASSIGNMENTS,
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
            'post_title' => sprintf('ContOpe Canvas — %s', $document_id),
            'post_content' => '',
            'meta_input' => [
                self::META_DOCUMENT_ID => $document_id,
                self::META_PROJECT_DATA => '{}',
                self::META_HTML => '',
                self::META_CSS => '',
                self::META_COMPOSITION => '',
                self::META_REVISION => 0,
                self::META_UPDATED_AT => '',
                self::META_REGION_KIND => '',
                self::META_REGION_SCOPE => '',
                self::META_REGION_TARGETS => '[]',
                self::META_REGION_EXCLUDES => '[]',
                self::META_REGION_TEMPLATE_ID => '',
                self::META_REGION_TEMPLATE_TITLE => '',
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
     * Carga un documento existente sin inicializarlo. A diferencia de load(),
     * esta variante es para operaciones de dominio que ya conocen una
     * identidad estable y deben rechazar una referencia ausente.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function load_existing(string $document_id)
    {
        $post_id = $this->find_post_id($document_id);
        if ($post_id === null) {
            return new WP_Error('cod_canvas_document_not_found', 'No existe un documento Canvas con ese ID.');
        }

        return $this->read($post_id, $document_id);
    }

    /**
     * Describe un documento ya existente sin inicializarlo ni devolver sus
     * representaciones crudas. Esta es la frontera de lectura para clientes
     * externos: a diferencia de load(), nunca llama ensure_post_id() y por lo
     * tanto una consulta no puede crear una entidad Canvas vacía.
     *
     * @return array<string, mixed>|null
     */
    public function describe_existing(string $document_id): ?array
    {
        $post_id = $this->find_post_id($document_id);
        if ($post_id === null) {
            return null;
        }

        $document = $this->read($post_id, $document_id);

        return $this->semantic_document($document);
    }

    /**
     * Lee la última composición MCP aplicada con éxito sobre este documento
     * (ver META_COMPOSITION). A diferencia de describe_existing(), esto SÍ es
     * lectura de contenido — pero de la composición declarativa ya validada,
     * no de HTML/CSS/JS crudo, así que no cruza la frontera que el resto de
     * este servicio protege.
     *
     * @return array{found: bool, revision: int, composition?: array<string, mixed>, design?: array<string, mixed>}|WP_Error
     */
    public function read_composition(string $document_id)
    {
        $post_id = $this->find_post_id($document_id);
        if ($post_id === null) {
            return new WP_Error('cod_canvas_document_not_found', 'No existe un documento Canvas con ese ID.');
        }

        $revision = (int) get_post_meta($post_id, self::META_REVISION, true);
        $raw = (string) get_post_meta($post_id, self::META_COMPOSITION, true);
        if ($raw === '') {
            return ['found' => false, 'revision' => $revision];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || !isset($decoded['composition'], $decoded['design'])) {
            // No debería pasar (esta meta sólo la escribe write_document con
            // JSON propio), pero un valor corrupto se trata como ausente en
            // vez de romper la llamada.
            return ['found' => false, 'revision' => $revision];
        }

        return [
            'found' => true,
            'revision' => $revision,
            'composition' => $decoded['composition'],
            'design' => $decoded['design'],
        ];
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

        return $this->with_document_lock($post_id, function () use ($document_id, $post_id, $project_data, $html, $css) {
            $revision = (int) get_post_meta($post_id, self::META_REVISION, true);
            $updated_at = gmdate('c');

            // wp_slash() es obligatorio acá: update_post_meta() le quita una
            // capa de backslashes al valor (compatibilidad histórica con
            // magic_quotes), y project_data trae JSON anidado (por ejemplo
            // el atributo data-cod-geo-places, que es un string JSON dentro
            // del JSON del proyecto). Sin wp_slash(), esa capa de escape se
            // pierde y el documento queda con JSON inválido — así se rompió
            // el project_data real de "Inicio" antes de este fix.
            update_post_meta($post_id, self::META_PROJECT_DATA, wp_slash($project_data));
            update_post_meta($post_id, self::META_HTML, wp_slash($html));
            update_post_meta($post_id, self::META_CSS, wp_slash($css));
            // Este guardado viene del editor Grapes (a mano), no de una
            // composición MCP: cualquier snapshot de composición previo queda
            // desincronizado del contenido real que se acaba de escribir, así
            // que se limpia en vez de dejarlo mentir sobre lo que hay ahora.
            update_post_meta($post_id, self::META_COMPOSITION, '');
            update_post_meta($post_id, self::META_REVISION, $revision + 1);
            update_post_meta($post_id, self::META_UPDATED_AT, $updated_at);

            return $this->read($post_id, $document_id);
        });
    }

    /**
     * Persiste un resultado ya compilado por una receta semántica. Esta es la
     * única ruta de escritura MCP: exige una revisión exacta, crea el snapshot
     * del estado previo dentro del mismo bloqueo y jamás crea un documento por
     * una identidad remota errónea.
     *
     * @param array<string, mixed> $compiled
     * @return array<string, mixed>|WP_Error
     */
    public function save_compiled_recipe_if_revision(
        string $document_id,
        int $expected_revision,
        array $compiled,
        string $snapshot_session,
        string $snapshot_label
    ) {
        $storage = $compiled['storage'] ?? null;
        if (!is_array($storage)
            || !isset($storage['project'], $storage['markup'], $storage['styles'])
            || !is_string($storage['project'])
            || !is_string($storage['markup'])
            || !is_string($storage['styles'])) {
            return new WP_Error('cod_canvas_recipe_compilation_invalid', 'La receta compilada no contiene un documento Canvas válido.');
        }

        // compositionSnapshot/designSnapshot los trae siempre el compilador
        // actual, pero el chequeo queda defensivo: si algún llamador futuro
        // pasa un $compiled sin esas claves, simplemente no se persiste
        // composición legible en vez de fallar la escritura completa.
        $composition_json = '';
        if (isset($compiled['compositionSnapshot'], $compiled['designSnapshot'])) {
            $encoded = wp_json_encode([
                'composition' => $compiled['compositionSnapshot'],
                'design' => $compiled['designSnapshot'],
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $composition_json = is_string($encoded) ? $encoded : '';
        }

        $post_id = $this->find_post_id($document_id);
        if ($post_id === null) {
            return new WP_Error('cod_canvas_document_not_found', 'No existe un documento Canvas con ese ID.');
        }

        return $this->with_document_lock(
            $post_id,
            function () use ($document_id, $post_id, $expected_revision, $storage, $composition_json, $snapshot_session, $snapshot_label) {
                $actual_revision = (int) get_post_meta($post_id, self::META_REVISION, true);
                if ($actual_revision !== $expected_revision) {
                    return $this->revision_conflict($expected_revision, $actual_revision);
                }

                $snapshot = $this->create_snapshot_for_post($post_id, $snapshot_session, $snapshot_label);
                if (is_wp_error($snapshot)) {
                    return $snapshot;
                }

                $saved = $this->write_document(
                    $post_id,
                    $document_id,
                    $storage['project'],
                    $storage['markup'],
                    $storage['styles'],
                    $composition_json
                );
                if (is_wp_error($saved)) {
                    return $saved;
                }

                return [
                    'snapshot' => $snapshot,
                    'document' => $this->semantic_document($saved),
                ];
            }
        );
    }

    /**
     * Crea un snapshot únicamente si la revisión todavía coincide. Se usa por
     * acciones que mutan la página WordPress (por ejemplo publicar) sin tocar
     * las representaciones del documento Canvas.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function create_snapshot_if_revision(
        string $document_id,
        int $expected_revision,
        string $snapshot_session,
        string $snapshot_label
    ) {
        $post_id = $this->find_post_id($document_id);
        if ($post_id === null) {
            return new WP_Error('cod_canvas_document_not_found', 'No existe un documento Canvas con ese ID.');
        }

        return $this->with_document_lock(
            $post_id,
            function () use ($post_id, $expected_revision, $snapshot_session, $snapshot_label) {
                $actual_revision = (int) get_post_meta($post_id, self::META_REVISION, true);
                if ($actual_revision !== $expected_revision) {
                    return $this->revision_conflict($expected_revision, $actual_revision);
                }

                return $this->create_snapshot_for_post($post_id, $snapshot_session, $snapshot_label);
            }
        );
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
            'composition' => (string) get_post_meta($post_id, self::META_COMPOSITION, true),
            'revision' => (int) get_post_meta($post_id, self::META_REVISION, true),
            'updatedAt' => (string) get_post_meta($post_id, self::META_UPDATED_AT, true),
            'regionKind' => (string) get_post_meta($post_id, self::META_REGION_KIND, true),
            'regionScope' => (string) get_post_meta($post_id, self::META_REGION_SCOPE, true),
            'regionTargets' => $targets,
            'regionExcludes' => $excludes,
            'regionTemplateId' => (string) get_post_meta($post_id, self::META_REGION_TEMPLATE_ID, true),
            'regionTemplateTitle' => (string) get_post_meta($post_id, self::META_REGION_TEMPLATE_TITLE, true),
        ];
    }

    /**
     * @param array<string, mixed> $document
     * @return array<string, mixed>
     */
    private function semantic_document(array $document): array
    {
        return [
            'documentId' => $document['documentId'],
            'title' => $document['title'],
            'revision' => $document['revision'],
            'updatedAt' => $document['updatedAt'],
            'region' => [
                'kind' => $document['regionKind'],
                'scope' => $document['regionScope'],
                'targets' => $document['regionTargets'],
                'excludes' => $document['regionExcludes'],
                'templateId' => $document['regionTemplateId'],
                'templateTitle' => $document['regionTemplateTitle'],
            ],
        ];
    }

    /**
     * Escribe las tres representaciones internas y avanza la revisión. Debe
     * llamarse dentro de with_document_lock() cuando la operación comparte el
     * documento con una acción MCP protegida por revisión.
     *
     * @return array<string, mixed>
     */
    private function write_document(int $post_id, string $document_id, string $project_data, string $html, string $css, string $composition_json = ''): array
    {
        $revision = (int) get_post_meta($post_id, self::META_REVISION, true);
        $updated_at = gmdate('c');

        // Ver la nota sobre wp_slash() en save(): sin esto, update_post_meta()
        // corrompe cualquier JSON anidado dentro de project_data.
        update_post_meta($post_id, self::META_PROJECT_DATA, wp_slash($project_data));
        update_post_meta($post_id, self::META_HTML, wp_slash($html));
        update_post_meta($post_id, self::META_CSS, wp_slash($css));
        // '' es válido y significa "esta escritura no trae composición legible"
        // (por ejemplo, render_whatsapp_module aislado) — se guarda igual para
        // no dejar un snapshot de una revisión anterior colgando de una que ya
        // no le corresponde.
        update_post_meta($post_id, self::META_COMPOSITION, wp_slash($composition_json));
        update_post_meta($post_id, self::META_REVISION, $revision + 1);
        update_post_meta($post_id, self::META_UPDATED_AT, $updated_at);

        return $this->read($post_id, $document_id);
    }

    /** @return WP_Error */
    private function revision_conflict(int $expected_revision, int $actual_revision): WP_Error
    {
        $error = new WP_Error(
            'cod_canvas_revision_conflict',
            'La revisión de la página cambió; vuelve a consultar o previsualizar antes de aplicar la operación.'
        );
        $error->add_data([
            'expectedRevision' => $expected_revision,
            'actualRevision' => $actual_revision,
        ]);

        return $error;
    }

    /**
     * @param callable $operation
     * @return mixed|WP_Error
     */
    private function with_document_lock(int $post_id, callable $operation)
    {
        $lock = $this->acquire_document_lock($post_id);
        if (is_wp_error($lock)) {
            return $lock;
        }

        try {
            return $operation();
        } finally {
            $this->release_document_lock($lock);
        }
    }

    /**
     * @return array{option: string, value: string}|WP_Error
     */
    private function acquire_document_lock(int $post_id)
    {
        $option = 'cod_canvas_lock_' . substr(hash('sha256', (string) get_current_blog_id() . ':' . $post_id), 0, 32);
        $value = wp_json_encode([
            'token' => wp_generate_uuid4(),
            'expiresAt' => time() + self::MUTATION_LOCK_TTL_SECONDS,
        ]);
        if (!is_string($value)) {
            return new WP_Error('cod_canvas_lock_failed', 'No fue posible preparar el bloqueo de escritura Canvas.');
        }

        if (!add_option($option, $value, '', false)) {
            $existing = json_decode((string) get_option($option, ''), true);
            $expired = is_array($existing) && isset($existing['expiresAt']) && (int) $existing['expiresAt'] < time();
            if ($expired) {
                delete_option($option);
            }
            if (!$expired || !add_option($option, $value, '', false)) {
                $error = new WP_Error('cod_canvas_document_busy', 'El documento Canvas está siendo modificado por otra operación.');
                $error->add_data(['retryAfterSeconds' => self::MUTATION_LOCK_TTL_SECONDS]);
                return $error;
            }
        }

        return ['option' => $option, 'value' => $value];
    }

    /** @param array{option: string, value: string} $lock */
    private function release_document_lock(array $lock): void
    {
        if ((string) get_option($lock['option'], '') === $lock['value']) {
            delete_option($lock['option']);
        }
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
            return new WP_Error('cod_region_rules_invalid', 'El valor debe ser un arreglo.');
        }
        $normalized = [];
        foreach ($rules as $entry) {
            if (!is_array($entry) || !isset($entry['type'])) {
                return new WP_Error('cod_region_rules_invalid', 'Cada regla requiere type.');
            }
            $type = $entry['type'];
            $needs_id = in_array($type, self::MATCH_TYPES_WITH_ID, true);
            $standalone = in_array($type, self::MATCH_TYPES_WITHOUT_ID, true);
            if (!$needs_id && !$standalone) {
                return new WP_Error(
                    'cod_region_rules_invalid',
                    'type desconocido: ' . (is_string($type) ? $type : gettype($type))
                );
            }
            if (!$needs_id) {
                $normalized[] = ['type' => $type];
                continue;
            }
            if (!isset($entry['id'])) {
                return new WP_Error('cod_region_rules_invalid', 'El tipo "' . $type . '" requiere id.');
            }
            $id = $entry['id'];
            if (!is_int($id) && !(is_string($id) && ctype_digit($id))) {
                return new WP_Error('cod_region_rules_invalid', 'id debe ser un entero positivo.');
            }
            $id_int = (int) $id;
            if ($id_int <= 0) {
                return new WP_Error('cod_region_rules_invalid', 'id debe ser un entero positivo.');
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
            return new WP_Error('cod_region_kind_invalid', 'regionKind desconocido.');
        }
        if ($scope !== '' && $scope !== self::REGION_SCOPE_GLOBAL && $scope !== self::REGION_SCOPE_LOCAL) {
            return new WP_Error('cod_region_scope_invalid', 'regionScope desconocido.');
        }
        if ($scope === self::REGION_SCOPE_LOCAL && $targets === []) {
            return new WP_Error('cod_region_targets_required', 'Una región local necesita al menos un destino.');
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

    /**
     * Clears the region role from a document without deleting the Canvas
     * document itself. Also clears the template assignment so the post does
     * not get misclassified as a template group container afterwards.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function clear_region(string $document_id)
    {
        $post_id = $this->find_post_id($document_id);
        if ($post_id === null) {
            return new WP_Error('cod_region_document_not_found', 'No existe un documento Canvas con ese ID.');
        }

        update_post_meta($post_id, self::META_REGION_KIND, '');
        update_post_meta($post_id, self::META_REGION_SCOPE, '');
        update_post_meta($post_id, self::META_REGION_TARGETS, '[]');
        update_post_meta($post_id, self::META_REGION_EXCLUDES, '[]');
        update_post_meta($post_id, self::META_REGION_TEMPLATE_ID, '');
        update_post_meta($post_id, self::META_REGION_TEMPLATE_TITLE, '');

        $this->remove_document_from_assignments($document_id);

        return $this->read($post_id, $document_id);
    }

    /**
     * Quita un documentId de todos los mapas de asignaciones que lo
     * referencian (los slots quedan libres; el documento no se borra).
     */
    private function remove_document_from_assignments(string $document_id): void
    {
        $post_ids = get_posts([
            'post_type' => self::POST_TYPE,
            'post_status' => 'any',
            'numberposts' => -1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_key' => self::META_REGION_ASSIGNMENTS,
            'meta_compare' => 'EXISTS',
        ]);
        foreach ($post_ids as $post_id) {
            $raw = (string) get_post_meta((int) $post_id, self::META_REGION_ASSIGNMENTS, true);
            $decoded = json_decode($raw === '' ? '[]' : $raw, true);
            if (!is_array($decoded)) {
                continue;
            }
            $changed = false;
            foreach ($decoded as $kind => $assigned_id) {
                if ($assigned_id === $document_id) {
                    $decoded[$kind] = '';
                    $changed = true;
                }
            }
            if ($changed) {
                update_post_meta((int) $post_id, self::META_REGION_ASSIGNMENTS, wp_json_encode($decoded));
            }
        }
    }

    /**
     * Creates the template group first (name + stable ID), not a loose region
     * document. The group is represented by a private canvas post whose
     * document ID equals the template ID and whose regionKind is empty, so
     * `list_region_documents()` never leaks it into the page resolver.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function create_template_group(string $title)
    {
        $title = trim($title);
        if ($title === '') {
            return new WP_Error('cod_template_title_required', 'El nombre de la plantilla es obligatorio.');
        }

        // Una plantilla nueva arranca heredando los slots de la plantilla
        // global del sitio (el selector muestra sus regiones por defecto).
        $default_assignments = $this->get_template_assignments(self::DEFAULT_TEMPLATE_ID);

        $template_id = self::TEMPLATE_ID_PREFIX . wp_generate_uuid4();
        $post_id = wp_insert_post([
            'post_type' => self::POST_TYPE,
            'post_status' => 'draft',
            'post_title' => $title,
            'post_content' => '',
            'meta_input' => [
                self::META_DOCUMENT_ID => $template_id,
                self::META_PROJECT_DATA => '{}',
                self::META_HTML => '',
                self::META_CSS => '',
                self::META_REVISION => 0,
                self::META_UPDATED_AT => '',
                self::META_REGION_KIND => '',
                self::META_REGION_SCOPE => '',
                self::META_REGION_TARGETS => '[]',
                self::META_REGION_EXCLUDES => '[]',
                self::META_REGION_TEMPLATE_ID => $template_id,
                self::META_REGION_TEMPLATE_TITLE => $title,
                self::META_REGION_ASSIGNMENTS => wp_json_encode($default_assignments),
            ],
        ], true);

        if (is_wp_error($post_id)) {
            return $post_id;
        }

        return $this->get_template($template_id);
    }

    /**
     * Creates a new region document inside an existing template group.
     * Scope defaults to global (the common case for a new template region);
     * the user can narrow it per-row from the Plantillas screen. Delegates the
     * actual document creation to duplicate_region().
     *
     * @return array<string, mixed>|WP_Error
     */
    public function add_region_to_template(string $template_id, string $kind)
    {
        if (!in_array($kind, self::REGION_KINDS, true)) {
            return new WP_Error('cod_region_kind_invalid', 'regionKind desconocido.');
        }

        $template = $this->get_template($template_id);
        if ($template === null) {
            return new WP_Error('cod_template_not_found', 'La plantilla no existe.');
        }
        if (!empty($template['isLegacy'])) {
            return new WP_Error('cod_template_not_grouped', 'Las plantillas sin agrupar no aceptan nuevas regiones.');
        }
        if (!empty($template['regions'][$kind])) {
            return new WP_Error('cod_region_already_assigned', 'La plantilla ya tiene una región de ese tipo.');
        }

        // Región vacía nueva, hoy sobre la capa de asignaciones; la creación
        // desde el contenido de otra región usa duplicate_region().
        return $this->duplicate_region($template_id, $kind, '');
    }

    /**
     * Renames a template group without touching its stable ID. The name is
     * copied to every region document so cards stay coherent even if the group
     * container is fetched independently.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function rename_template(string $template_id, string $title)
    {
        $title = trim($title);
        if ($title === '') {
            return new WP_Error('cod_template_title_required', 'El nombre de la plantilla es obligatorio.');
        }
        if ($template_id === self::DEFAULT_TEMPLATE_ID) {
            return new WP_Error('cod_template_not_renamable', 'La plantilla por defecto del sitio no se puede renombrar.');
        }

        $template = $this->get_template($template_id);
        if ($template === null) {
            return new WP_Error('cod_template_not_found', 'La plantilla no existe.');
        }
        if (!empty($template['isLegacy'])) {
            return new WP_Error('cod_template_not_renamable', 'Las plantillas sin agrupar no se pueden renombrar.');
        }

        $container_post_id = $this->find_post_id($template_id);
        if ($container_post_id !== null) {
            $updated = wp_update_post([
                'ID' => (int) $container_post_id,
                'post_title' => $title,
            ], true);
            if (is_wp_error($updated)) {
                return $updated;
            }
            update_post_meta((int) $container_post_id, self::META_REGION_TEMPLATE_TITLE, $title);
        }

        $region_post_ids = get_posts([
            'post_type' => self::POST_TYPE,
            'post_status' => 'any',
            'numberposts' => -1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_key' => self::META_REGION_TEMPLATE_ID,
            'meta_value' => $template_id,
        ]);
        foreach ($region_post_ids as $post_id) {
            update_post_meta((int) $post_id, self::META_REGION_TEMPLATE_TITLE, $title);
        }

        return $this->get_template($template_id);
    }

    /**
     * Elimina una plantilla con nombre: borra su contenedor (y con él el mapa
     * de asignaciones) y desvincula a las regiones que la tenían como hogar.
     * Los documentos-región NO se borran: quedan disponibles en los selectores
     * del tema como catálogo (y como tarjetas sueltas si nadie más las agrupa).
     * La plantilla global del sitio y las legacy no se eliminan por acá.
     *
     * @return true|WP_Error
     */
    public function delete_template_group(string $template_id)
    {
        $template = $this->get_template($template_id);
        if ($template === null) {
            return new WP_Error('cod_template_not_found', 'La plantilla no existe.');
        }
        if (!empty($template['isDefault'])) {
            return new WP_Error('cod_template_default', 'La plantilla global del sitio no se puede eliminar.');
        }
        if (!empty($template['isLegacy'])) {
            return new WP_Error('cod_template_legacy', 'Las plantillas sin agrupar no se eliminan por acá.');
        }

        $container_post_id = $this->find_post_id($template_id);
        if ($container_post_id !== null) {
            wp_delete_post((int) $container_post_id, true);
        }

        $region_post_ids = get_posts([
            'post_type' => self::POST_TYPE,
            'post_status' => 'any',
            'numberposts' => -1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_key' => self::META_REGION_TEMPLATE_ID,
            'meta_value' => $template_id,
        ]);
        foreach ($region_post_ids as $post_id) {
            update_post_meta((int) $post_id, self::META_REGION_TEMPLATE_ID, '');
            update_post_meta((int) $post_id, self::META_REGION_TEMPLATE_TITLE, '');
        }

        return true;
    }

    /**
     * Lee el mapa de asignaciones de una plantilla: `{header, body, footer}`
     * → documentId estable ('' = slot libre). Cuando la meta aún no existe
     * (plantillas anteriores a este sistema) reconstruye el mapa desde el
     * agrupamiento clásico por META_REGION_TEMPLATE_ID; en empates gana el
     * documentId menor, igual que la UI anterior.
     *
     * @return array<string, string>
     */
    public function get_template_assignments(string $template_id): array
    {
        $map = [
            self::REGION_KIND_HEADER => '',
            self::REGION_KIND_BODY => '',
            self::REGION_KIND_FOOTER => '',
        ];

        $container_post_id = $this->find_post_id($template_id);
        $stored = '';
        if ($container_post_id !== null) {
            $stored = (string) get_post_meta($container_post_id, self::META_REGION_ASSIGNMENTS, true);
        }
        if ($stored !== '') {
            $decoded = json_decode($stored, true);
            if (is_array($decoded)) {
                foreach ($decoded as $kind => $document_id) {
                    if (in_array($kind, self::REGION_KINDS, true) && is_string($document_id)) {
                        $map[$kind] = $document_id;
                    }
                }
                return $map;
            }
            // JSON corrupto: se cae al fallback en vez de devolver todo vacío.
        }

        // Fallback: agrupamiento clásico por META_REGION_TEMPLATE_ID. Se dejan
        // pasar TODOS los candidatos del kind para que el desempate por
        // documentId menor sea real (mismo criterio que la UI anterior).
        $post_ids = get_posts([
            'post_type' => self::POST_TYPE,
            'post_status' => 'any',
            'numberposts' => -1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'orderby' => 'ID',
            'order' => 'ASC',
            'meta_key' => self::META_REGION_TEMPLATE_ID,
            'meta_value' => $template_id,
        ]);
        foreach ($post_ids as $post_id) {
            $kind = (string) get_post_meta((int) $post_id, self::META_REGION_KIND, true);
            if ($kind === '' || !isset($map[$kind])) {
                continue;
            }
            $document_id = (string) get_post_meta((int) $post_id, self::META_DOCUMENT_ID, true);
            if ($document_id === '') {
                continue;
            }
            if ($map[$kind] === '' || strcmp($document_id, $map[$kind]) < 0) {
                $map[$kind] = $document_id;
            }
        }
        return $map;
    }

    /**
     * Asigna (o libera con '') el slot de un kind dentro de una plantilla. La
     * región queda amarrada POR REFERENCIA: si otras plantillas la tienen
     * seleccionada, todas ven los mismos cambios (semántica de compartir, no
     * de copiar — para bifurcar existe duplicate_region()).
     *
     * @return array<string, string>|WP_Error El mapa de asignaciones actualizado.
     */
    public function assign_region_to_template(string $template_id, string $kind, string $document_id)
    {
        if (!in_array($kind, self::REGION_KINDS, true)) {
            return new WP_Error('cod_region_kind_invalid', 'regionKind desconocido.');
        }

        $template = $this->get_template($template_id);
        if ($template === null) {
            return new WP_Error('cod_template_not_found', 'La plantilla no existe.');
        }
        if (!empty($template['isLegacy'])) {
            return new WP_Error('cod_template_not_grouped', 'Las plantillas sin agrupar no aceptan asignaciones.');
        }

        if ($document_id !== '') {
            $post_id = $this->find_post_id($document_id);
            if ($post_id === null) {
                return new WP_Error('cod_region_document_not_found', 'No existe un documento Canvas con ese ID.');
            }
            $existing_kind = (string) get_post_meta($post_id, self::META_REGION_KIND, true);
            if ($existing_kind !== $kind) {
                return new WP_Error('cod_region_kind_mismatch', 'El documento no es una región de ese tipo.');
            }
        }

        $container_post_id = $this->ensure_template_container($template_id);
        if (is_wp_error($container_post_id)) {
            return $container_post_id;
        }

        $map = $this->get_template_assignments($template_id);
        $map[$kind] = $document_id;
        update_post_meta($container_post_id, self::META_REGION_ASSIGNMENTS, wp_json_encode($map));

        return $map;
    }

    /**
     * Bifurca una región existente (o crea una vacía si el source es '') como
     * documento NUEVO asignado a la plantilla indicada. Copia
     * projectData/html/css del donante SIN amarrarlo: los cambios posteriores
     * en la copia no afectan al original, y viceversa. La copia nace SIN
     * alcance (no hereda scope/targets/excludes del donante) y no copia
     * snapshots (el historial de sesión pertenece al documento fuente).
     *
     * @return array<string, mixed>|WP_Error El documento región creado.
     */
    public function duplicate_region(string $template_id, string $kind, string $title, string $source_document_id = '')
    {
        if (!in_array($kind, self::REGION_KINDS, true)) {
            return new WP_Error('cod_region_kind_invalid', 'regionKind desconocido.');
        }

        $template = $this->get_template($template_id);
        if ($template === null) {
            return new WP_Error('cod_template_not_found', 'La plantilla no existe.');
        }
        if (!empty($template['isLegacy'])) {
            return new WP_Error('cod_template_not_grouped', 'Las plantillas sin agrupar no aceptan regiones nuevas.');
        }

        // Materializa (o valida) el contenedor ANTES de crear nada: si la
        // plantilla es una huérfana sin contenedor, falla acá y no queda un
        // doc-región global fantasma que el resolver pueda renderizar.
        $container_post_id = $this->ensure_template_container($template_id);
        if (is_wp_error($container_post_id)) {
            return $container_post_id;
        }

        $title = trim($title);
        if ($title === '') {
            $title = trim((string) $template['title']) . ' — ' . $kind;
        }

        $project_data = '{}';
        $html = '';
        $css = '';
        if ($source_document_id !== '') {
            $source_post_id = $this->find_post_id($source_document_id);
            if ($source_post_id === null) {
                return new WP_Error('cod_region_document_not_found', 'No existe un documento Canvas con ese ID.');
            }
            $source = $this->read($source_post_id, $source_document_id);
            if ((string) ($source['regionKind'] ?? '') !== $kind) {
                return new WP_Error('cod_region_kind_mismatch', 'La región de origen no es del mismo tipo.');
            }
            // Ya salió sanitizado del repositorio al guardarse.
            $project_data = (string) $source['projectData'];
            $html = (string) $source['html'];
            $css = (string) $source['css'];
        }

        $document_id = self::REGION_DOCUMENT_ID_PREFIX . wp_generate_uuid4();
        $post_id = $this->ensure_post_id($document_id);
        if (is_wp_error($post_id)) {
            return $post_id;
        }

        $updated = wp_update_post([
            'ID' => (int) $post_id,
            'post_title' => $title,
        ], true);
        if (is_wp_error($updated)) {
            return $updated;
        }

        $saved = $this->save($document_id, $project_data, $html, $css);
        if (is_wp_error($saved)) {
            return $saved;
        }

        $region = $this->save_region($document_id, $kind, '', [], []);
        if (is_wp_error($region)) {
            return $region;
        }

        // Hogar del documento (qué plantilla lo creó); la presencia en
        // tarjetas la da la asignación, no esta meta.
        update_post_meta((int) $post_id, self::META_REGION_TEMPLATE_ID, $template_id);
        update_post_meta((int) $post_id, self::META_REGION_TEMPLATE_TITLE, (string) $template['title']);

        $assigned = $this->assign_region_to_template($template_id, $kind, $document_id);
        if (is_wp_error($assigned)) {
            return $assigned;
        }

        return $this->read((int) $post_id, $document_id);
    }

    /**
     * Renombra una región (su nombre propio, visible en los selectores del
     * tema). No toca la plantilla a la que pertenece.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function rename_region(string $document_id, string $title)
    {
        $title = trim($title);
        if ($title === '') {
            return new WP_Error('cod_region_title_required', 'El nombre de la región es obligatorio.');
        }

        $post_id = $this->find_post_id($document_id);
        if ($post_id === null) {
            return new WP_Error('cod_region_document_not_found', 'No existe un documento Canvas con ese ID.');
        }
        $kind = (string) get_post_meta($post_id, self::META_REGION_KIND, true);
        if ($kind === '') {
            return new WP_Error('cod_not_a_region', 'El documento no es una región de plantilla.');
        }

        $updated = wp_update_post([
            'ID' => (int) $post_id,
            'post_title' => $title,
        ], true);
        if (is_wp_error($updated)) {
            return $updated;
        }

        return $this->read((int) $post_id, $document_id);
    }

    /**
     * Garantiza el post contenedor de una plantilla (necesario para persistir
     * asignaciones). Las plantillas con nombre ya lo tienen desde
     * create_template_group(); la plantilla global del sitio se materializa
     * acá la primera vez que se le asigna algo.
     *
     * @return int|WP_Error
     */
    private function ensure_template_container(string $template_id)
    {
        $existing = $this->find_post_id($template_id);
        if ($existing !== null) {
            return $existing;
        }

        if ($template_id !== self::DEFAULT_TEMPLATE_ID) {
            return new WP_Error('cod_template_not_found', 'La plantilla no existe.');
        }

        $title = 'Plantilla global del sitio';
        $post_id = wp_insert_post([
            'post_type' => self::POST_TYPE,
            'post_status' => 'draft',
            'post_title' => $title,
            'post_content' => '',
            'meta_input' => [
                self::META_DOCUMENT_ID => $template_id,
                self::META_PROJECT_DATA => '{}',
                self::META_HTML => '',
                self::META_CSS => '',
                self::META_REVISION => 0,
                self::META_UPDATED_AT => '',
                self::META_REGION_KIND => '',
                self::META_REGION_SCOPE => '',
                self::META_REGION_TARGETS => '[]',
                self::META_REGION_EXCLUDES => '[]',
                self::META_REGION_TEMPLATE_ID => $template_id,
                self::META_REGION_TEMPLATE_TITLE => $title,
            ],
        ], true);

        return is_wp_error($post_id) ? $post_id : (int) $post_id;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function get_template(string $template_id): ?array
    {
        foreach ($this->list_templates() as $template) {
            if ($template['templateId'] === $template_id) {
                return $template;
            }
        }
        return null;
    }

    /**
     * Groups every region document into template cards.
     *
     * Card membership comes from the template's assignment map
     * (META_REGION_ASSIGNMENTS on the container post); when that meta does not
     * exist yet, it is rebuilt from the classic per-document
     * META_REGION_TEMPLATE_ID grouping so pre-existing sites render unchanged
     * without any data migration. Legacy region documents created before
     * template IDs existed still surface as one-region "unnamed" cards so no
     * saved data disappears.
     *
     * @return array<int, array<string, mixed>>
     */
    public function list_templates(): array
    {
        $posts = get_posts([
            'post_type' => self::POST_TYPE,
            'post_status' => 'any',
            'numberposts' => -1,
            'orderby' => 'ID',
            'order' => 'ASC',
            'fields' => 'ids',
            'no_found_rows' => true,
        ]);

        $documents_by_id = [];
        $containers = [];
        foreach ($posts as $post_id) {
            $document_id = (string) get_post_meta((int) $post_id, self::META_DOCUMENT_ID, true);
            if ($document_id === '') {
                continue;
            }
            $document = $this->read((int) $post_id, $document_id);
            $documents_by_id[$document_id] = $document;
            $kind = (string) ($document['regionKind'] ?? '');
            $template_id = (string) ($document['regionTemplateId'] ?? '');
            if ($kind === '' && $template_id !== '' && !isset($containers[$template_id])) {
                $containers[$template_id] = $document;
            }
        }

        // Template IDs conocidos: contenedores reales, plantillas huérfanas
        // (regiones cuyo contenedor no existe) y siempre la plantilla global.
        $template_sources = $containers;
        foreach ($documents_by_id as $document) {
            $kind = (string) ($document['regionKind'] ?? '');
            $template_id = (string) ($document['regionTemplateId'] ?? '');
            if ($kind !== '' && $template_id !== '' && !isset($template_sources[$template_id])) {
                $template_sources[$template_id] = $document;
            }
        }
        if (!isset($template_sources[self::DEFAULT_TEMPLATE_ID])) {
            $template_sources[self::DEFAULT_TEMPLATE_ID] = null;
        }

        $groups = [];
        $assigned_document_ids = [];
        foreach ($template_sources as $template_id => $source) {
            $is_default = $template_id === self::DEFAULT_TEMPLATE_ID;
            $title = $source !== null
                ? $this->template_display_title($source, (string) $template_id)
                : 'Plantilla global del sitio';
            $groups[$template_id] = $this->empty_template_group((string) $template_id, $title, $is_default, false);

            $assignments = $this->get_template_assignments((string) $template_id);
            foreach ($assignments as $kind => $document_id) {
                if ($document_id === '' || !isset($documents_by_id[$document_id])) {
                    continue;
                }
                $document = $documents_by_id[$document_id];
                if ((string) ($document['regionKind'] ?? '') !== $kind) {
                    continue;
                }
                $this->assign_region($groups[$template_id], $kind, $document);
                $assigned_document_ids[$document_id] = true;
            }
        }

        // Documentos legacy (región sin plantilla) como tarjetas sueltas de
        // una sola región, para no perder nada guardado. Los que siguen
        // referenciados por algún mapa de asignaciones no duplican tarjeta.
        foreach ($documents_by_id as $document) {
            $document_key = (string) ($document['documentId'] ?? '');
            if (isset($assigned_document_ids[$document_key])) {
                continue;
            }
            $template_id = (string) ($document['regionTemplateId'] ?? '');
            $kind = (string) ($document['regionKind'] ?? '');
            if ($template_id !== '' || $kind === '') {
                continue;
            }
            $legacy_id = 'legacy:' . (string) ($document['documentId'] ?? '');
            if (!isset($groups[$legacy_id])) {
                $groups[$legacy_id] = $this->empty_template_group(
                    $legacy_id,
                    $this->legacy_template_title($document),
                    false,
                    true
                );
            }
            $this->assign_region($groups[$legacy_id], $kind, $document);
        }

        $groups = array_values($groups);
        usort($groups, static function (array $a, array $b): int {
            if ($a['isDefault'] !== $b['isDefault']) {
                return $a['isDefault'] ? -1 : 1;
            }
            if ($a['isLegacy'] !== $b['isLegacy']) {
                return $a['isLegacy'] ? 1 : -1;
            }
            $title_cmp = strcasecmp((string) $a['title'], (string) $b['title']);
            if ($title_cmp !== 0) {
                return $title_cmp;
            }
            return strcmp((string) $a['templateId'], (string) $b['templateId']);
        });

        return $groups;
    }

    /**
     * @return array<string, mixed>
     */
    private function empty_template_group(string $template_id, string $title, bool $is_default, bool $is_legacy): array
    {
        return [
            'templateId' => $template_id,
            'title' => $title,
            'isDefault' => $is_default,
            'isLegacy' => $is_legacy,
            'allowAdd' => !$is_legacy,
            'regions' => [
                self::REGION_KIND_HEADER => null,
                self::REGION_KIND_BODY => null,
                self::REGION_KIND_FOOTER => null,
            ],
        ];
    }

    /**
     * @param array<string, mixed> $group
     * @param array<string, mixed> $document
     */
    private function assign_region(array &$group, string $kind, array $document): void
    {
        if (!array_key_exists($kind, $group['regions'])) {
            return;
        }
        $current = $group['regions'][$kind];
        if (
            $current === null
            || strcmp((string) $document['documentId'], (string) $current['documentId']) < 0
        ) {
            $group['regions'][$kind] = $document;
        }
    }

    /**
     * @param array<string, mixed> $document
     */
    private function template_display_title(array $document, string $template_id): string
    {
        $title = trim((string) ($document['regionTemplateTitle'] ?? ''));
        if ($title === '') {
            $title = trim((string) ($document['title'] ?? ''));
        }
        return $title !== '' ? $title : $template_id;
    }

    /**
     * @param array<string, mixed> $document
     */
    private function legacy_template_title(array $document): string
    {
        $title = trim((string) ($document['title'] ?? ''));
        return $title !== '' ? $title : 'Plantilla sin nombre';
    }

    /**
     * Lee el índice de snapshots de un documento (solo metadatos, sin
     * contenidos) y lo devuelve normalizado a un arreglo de entradas.
     *
     * @return array<int, array{id: string, session: string, label: string, createdAt: string, revision: int}>
     */
    private function read_snapshot_index(int $post_id): array
    {
        $raw = (string) get_post_meta($post_id, self::META_SNAPSHOTS, true);
        $decoded = json_decode($raw === '' ? '[]' : $raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $index = [];
        foreach ($decoded as $entry) {
            if (!is_array($entry) || !isset($entry['id'])) {
                continue;
            }
            $index[] = [
                'id' => (string) $entry['id'],
                'session' => (string) ($entry['session'] ?? ''),
                'label' => (string) ($entry['label'] ?? ''),
                'createdAt' => (string) ($entry['createdAt'] ?? ''),
                'revision' => (int) ($entry['revision'] ?? 0),
            ];
        }
        return $index;
    }

    /**
     * @param array<int, array{id: string, session: string, label: string, createdAt: string, revision: int}> $index
     */
    private function write_snapshot_index(int $post_id, array $index): void
    {
        update_post_meta($post_id, self::META_SNAPSHOTS, wp_json_encode($index));
    }

    /**
     * Persiste el estado ACTUAL del documento como un snapshot de sesión.
     *
     * Guarda una entrada en el índice `_cod_canvas_snapshots` y el contenido
     * completo (`{projectData, html, css}`) en una meta propia
     * `_cod_canvas_snap_<id>`. El identificador es `bin2hex(random_bytes(6))`.
     *
     * Límite de 15 por documento. Al superarlo se podan los más viejos por
     * `createdAt`, PERO nunca se poda un snapshot con `label === 'session-open'`
     * que pertenezca a la sesión más reciente: esos marcan el punto de partida
     * de la sesión activa y deben sobrevivir para poder restaurar el estado de
     * entrada aunque la sesión genere muchos guardados posteriores.
     *
     * @return array<string, mixed>|WP_Error La entrada del índice creada.
     */
    public function create_snapshot(string $document_id, string $session_id, string $label)
    {
        $post_id = $this->find_post_id($document_id);
        if ($post_id === null) {
            return new WP_Error('cod_snapshot_document_not_found', 'No existe un documento Canvas con ese ID.');
        }

        return $this->with_document_lock($post_id, function () use ($post_id, $session_id, $label) {
            return $this->create_snapshot_for_post($post_id, $session_id, $label);
        });
    }

    /**
     * Persiste el estado actual de un post de documento dentro de un bloqueo
     * que ya fue adquirido por el llamador.
     *
     * @return array<string, mixed>|WP_Error
     */
    private function create_snapshot_for_post(int $post_id, string $session_id, string $label)
    {
        $id = bin2hex(random_bytes(6));
        $created_at = gmdate('c');
        $revision = (int) get_post_meta($post_id, self::META_REVISION, true);

        $content = wp_json_encode([
            'projectData' => (string) get_post_meta($post_id, self::META_PROJECT_DATA, true),
            'html' => (string) get_post_meta($post_id, self::META_HTML, true),
            'css' => (string) get_post_meta($post_id, self::META_CSS, true),
        ]);
        update_post_meta($post_id, self::SNAPSHOT_META_PREFIX . $id, $content);

        $entry = [
            'id' => $id,
            'session' => $session_id,
            'label' => $label,
            'createdAt' => $created_at,
            'revision' => $revision,
        ];

        $index = $this->read_snapshot_index($post_id);
        $index[] = $entry;
        $index = $this->prune_snapshots($post_id, $index);
        $this->write_snapshot_index($post_id, $index);

        return $entry;
    }

    /**
     * Aplica el límite de snapshots por documento, eliminando también la meta
     * de contenido de cada snapshot podado.
     *
     * @param array<int, array{id: string, session: string, label: string, createdAt: string, revision: int}> $index
     * @return array<int, array{id: string, session: string, label: string, createdAt: string, revision: int}>
     */
    private function prune_snapshots(int $post_id, array $index): array
    {
        if (count($index) <= self::MAX_SNAPSHOTS) {
            return $index;
        }

        // Sesión más reciente: la del snapshot `session-open` con `createdAt`
        // más reciente; si no hay ninguno, la de la entrada más reciente.
        $recent_session = '';
        $recent_created = '';
        foreach ($index as $entry) {
            $created = (string) $entry['createdAt'];
            if ($entry['label'] === self::SNAPSHOT_SESSION_OPEN_LABEL && $created > $recent_created) {
                $recent_created = $created;
                $recent_session = (string) $entry['session'];
            }
        }
        if ($recent_session === '') {
            foreach ($index as $entry) {
                $created = (string) $entry['createdAt'];
                if ($created > $recent_created) {
                    $recent_created = $created;
                    $recent_session = (string) $entry['session'];
                }
            }
        }

        $is_protected = static function (array $entry) use ($recent_session): bool {
            return $entry['label'] === self::SNAPSHOT_SESSION_OPEN_LABEL && $entry['session'] === $recent_session;
        };

        // Más nuevo primero: se podan los más viejos.
        usort($index, static function (array $a, array $b): int {
            return strcmp((string) $b['createdAt'], (string) $a['createdAt']);
        });

        $protected = [];
        $regular = [];
        foreach ($index as $entry) {
            if ($is_protected($entry)) {
                $protected[] = $entry;
            } else {
                $regular[] = $entry;
            }
        }

        $budget = self::MAX_SNAPSHOTS - count($protected);
        $budget = $budget < 0 ? 0 : $budget;
        $kept = array_merge($protected, array_slice($regular, 0, $budget));

        foreach (array_slice($regular, $budget) as $entry) {
            delete_post_meta($post_id, self::SNAPSHOT_META_PREFIX . (string) $entry['id']);
        }

        usort($kept, static function (array $a, array $b): int {
            return strcmp((string) $b['createdAt'], (string) $a['createdAt']);
        });

        return $kept;
    }

    /**
     * Lista solo los metadatos del índice (sin contenidos), más nuevo primero.
     *
     * @return array<int, array{id: string, session: string, label: string, createdAt: string, revision: int}>
     */
    public function list_snapshots(string $document_id): array
    {
        $post_id = $this->find_post_id($document_id);
        if ($post_id === null) {
            return [];
        }

        $index = $this->read_snapshot_index($post_id);
        usort($index, static function (array $a, array $b): int {
            return strcmp((string) $b['createdAt'], (string) $a['createdAt']);
        });
        return $index;
    }

    /**
     * Lee un snapshot completo: sus metadatos y su contenido
     * `{projectData, html, css}`.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function load_snapshot(string $document_id, string $snapshot_id)
    {
        $post_id = $this->find_post_id($document_id);
        if ($post_id === null) {
            return new WP_Error('cod_snapshot_document_not_found', 'No existe un documento Canvas con ese ID.');
        }

        $entry = null;
        foreach ($this->read_snapshot_index($post_id) as $candidate) {
            if ($candidate['id'] === $snapshot_id) {
                $entry = $candidate;
                break;
            }
        }
        if ($entry === null) {
            return new WP_Error('cod_snapshot_not_found', 'No existe un snapshot con ese ID.');
        }

        $raw = (string) get_post_meta($post_id, self::SNAPSHOT_META_PREFIX . $snapshot_id, true);
        $content = json_decode($raw === '' ? '{}' : $raw, true);
        if (!is_array($content)) {
            $content = [];
        }

        return [
            'meta' => $entry,
            'projectData' => (string) ($content['projectData'] ?? ''),
            'html' => (string) ($content['html'] ?? ''),
            'css' => (string) ($content['css'] ?? ''),
        ];
    }
}
