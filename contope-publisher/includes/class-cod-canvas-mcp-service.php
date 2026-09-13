<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Frontera semántica MCP para el Canvas persistente.
 *
 * El grueso de las herramientas solo acepta composición y reglas explícitas
 * (ni HTML/CSS/projectData/selectores cruzan esa parte de la frontera).
 * `cod_patch_html`/`cod_patch_css` son la excepción histórica (texto exacto,
 * sin tocar projectData) y `cod_grapes_edit_node` es la vía real: dirige un
 * selector CSS al editor Grapes de verdad vía `tools/cod-headless-node-edit.mjs`
 * (mismos bundles que wp-admin, edición por API real de componentes) y
 * re-deriva html/css/projectData con el propio motor de Grapes — no una
 * reimplementación en PHP. No lee ni cambia design-contract.json.
 */
final class COD_Canvas_MCP_Service
{
    public const ADAPTER_VERSION = '3.0.0';

    public function __construct(
        private COD_Canvas_Document_Repository $repository,
        private COD_Canvas_Page_Publisher $publisher,
        private COD_Template_Region_Resolver $region_resolver,
        private COD_Canvas_MCP_Recipe_Compiler $compiler,
        private COD_Canvas_Asset_Resolver $asset_resolver
    ) {
    }

    /** @return array<string, mixed> */
    public function capabilities(): array
    {
        $catalog = $this->compiler->capability_catalog();
        return [
            'adapter' => ['name' => 'contope-canvas', 'version' => self::ADAPTER_VERSION],
            'operations' => [
                'readCapabilities' => true,
                'listCanvasPages' => true,
                'readCanvasPageState' => true,
                'readResolvedRegions' => true,
                'readAppliedComposition' => true,
                'resolveCanvasAssets' => true,
                'listPublishedForms' => true,
                'createCanvasPage' => true,
                'previewComposition' => true,
                'applyComposition' => true,
                'save' => true,
                'publish' => true,
                'readAppliedDesignContract' => false,
                'mutateDesignContract' => false,
            ],
            'designRuleSet' => [
                'supported' => true,
                'portableContractPersisted' => false,
                'readsDesktopContract' => false,
                'writesDesktopContract' => false,
                'reason' => 'COD Web acepta una instantánea explícita de reglas trazables para trabajar directo con IA. Desktop deberá emitir la misma forma cuando su importador esté listo; Canvas no altera design-contract.json.',
                'catalog' => $catalog['designRuleSet'],
            ],
            'composition' => $catalog['composition'],
            'realization' => $catalog['realization'],
            'existingButNotCallableYet' => $catalog['existingButNotCallableYet'],
            'preview' => [
                'semanticPreflight' => true,
                'visualPreviewPersisted' => false,
                'reason' => 'La llamada valida y genera evidencia sin escribir. La revisión visual ocurre en Canvas tras aplicar a una revisión explícita.',
            ],
            'workflow' => [
                '1' => 'Consulta capacidades, páginas y estado de la revisión objetivo.',
                '2' => 'Si vas a editar (no a crear de cero), llama cod_read_canvas_composition: si found=true, trae la composición/reglas ya aplicadas — modificá sólo el/los nodo(s) o regla(s) que corresponda y conservá el resto tal cual. Si found=false, esta página no tiene composición MCP registrada (contenido armado a mano en el editor Grapes); una composición nueva reemplaza todo su contenido.',
                '3' => 'Resuelve activos existentes y lista formularios publicados cuando hagan falta.',
                '4' => 'Construye designRuleSet + composition sin HTML/CSS/JS remoto.',
                '5' => 'Ejecuta cod_preview_canvas_composition y revisa su evidencia.',
                '6' => 'Ejecuta cod_apply_canvas_composition con el previewId exacto; Canvas crea snapshot.',
                '7' => 'Revisa visualmente en Canvas y publica sólo con cod_publish_canvas_page si corresponde.',
            ],
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public function list_canvas_pages(): array
    {
        return $this->publisher->list_canvas_pages();
    }

    /** @return array<string, mixed>|WP_Error */
    public function canvas_page_state(int $page_id)
    {
        $page = $this->publisher->describe_canvas_page($page_id);
        if ($page === null) {
            return new WP_Error('cod_mcp_canvas_page_not_found', 'No existe una página Canvas con ese pageId.');
        }
        $document = $this->repository->describe_existing((string) $page['documentId']);
        if ($document === null) {
            return new WP_Error('cod_mcp_canvas_document_missing', 'La página Canvas existe, pero su documento persistente no está disponible.');
        }
        $regions = [];
        foreach (COD_Canvas_Document_Repository::REGION_KINDS as $kind) {
            $regions[$kind] = $this->resolved_region($kind, $page_id);
        }
        return ['page' => $page, 'document' => $document, 'resolvedRegions' => $regions];
    }

    /**
     * Devuelve la última composición MCP aplicada con éxito sobre esta
     * página, lista para resubmitir tal cual (ajustando sólo lo que se quiera
     * cambiar) a cod_preview_canvas_composition — así se puede editar un nodo
     * puntual por su id sin reconstruir el resto de memoria.
     *
     * found=false significa que esta página nunca se escribió por composición
     * MCP (por ejemplo, contenido armado a mano en el editor Grapes): no hay
     * árbol que devolver, y construir uno a ciegas sería inventar datos.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function read_canvas_composition(int $page_id)
    {
        $page = $this->publisher->describe_canvas_page($page_id);
        if ($page === null) {
            return new WP_Error('cod_mcp_canvas_page_not_found', 'No existe una página Canvas con ese pageId.');
        }
        $result = $this->repository->read_composition((string) $page['documentId']);
        if (is_wp_error($result)) {
            return $result;
        }
        if (!$result['found']) {
            return [
                'page' => $page,
                'found' => false,
                'revision' => $result['revision'],
                'notice' => 'Esta página no tiene una composición MCP registrada (se construyó, o se editó después, fuera de cod_apply_canvas_composition). No hay árbol para leer; una composición nueva reemplaza todo el contenido actual.',
            ];
        }
        // La composición guardada trae campos DERIVADOS que el compilador calcula
        // al normalizar: nodeIds, markers y nodeCount. Son útiles para leer y
        // fatales para reenviar, porque normalize_composition usa has_only_keys y
        // admite sólo schemaVersion, label y nodes. Devolverlos adentro hacía que
        // el paso 2 del flujo —"modificá un nodo y conservá el resto tal cual"—
        // fallara siempre, con un mensaje que además acusaba a schemaVersion, que
        // era justo lo único que sí estaba bien.
        //
        // Se separan: 'composition' queda exactamente como hay que reenviarla, y lo
        // derivado viaja al lado, en 'resumen'.
        $composicion = $result['composition'];
        $resumen = [
            'nodeIds' => $composicion['nodeIds'] ?? [],
            'markers' => $composicion['markers'] ?? [],
            'nodeCount' => $composicion['nodeCount'] ?? 0,
        ];
        unset($composicion['nodeIds'], $composicion['markers'], $composicion['nodeCount']);

        return [
            'page' => $page,
            'found' => true,
            'revision' => $result['revision'],
            'composition' => $composicion,
            'resumen' => $resumen,
            'design' => $result['design'],
            'next' => 'Editá sólo el/los nodo(s) que quieras por su id (o las reglas que referencian) y resubmití composition+design completos, con expectedRevision = revision, a cod_preview_canvas_composition.',
        ];
    }

    /** @return array<string, mixed>|WP_Error */
    public function create_canvas_page(string $title)
    {
        $created = $this->publisher->create_page($title);
        if (is_wp_error($created)) {
            return $created;
        }
        $page = $this->publisher->describe_canvas_page((int) $created['pageId']);
        $document = $this->repository->describe_existing((string) $created['documentId']);
        if ($page === null || $document === null) {
            return new WP_Error('cod_mcp_canvas_create_incomplete', 'La página Canvas se creó, pero no pudo verificarse su vínculo persistente.');
        }
        return [
            'page' => $page,
            'document' => $document,
            'next' => 'Resuelve activos y formularios necesarios; luego solicita cod_preview_canvas_composition antes de aplicar.',
        ];
    }

    /** @return array{mapping: array<string, string>, missing: array<int, string>} */
    public function resolve_canvas_assets(array $references): array
    {
        return $this->asset_resolver->resolve($references);
    }

    /** @return array<string, mixed> */
    public function list_canvas_forms(): array
    {
        return ['forms' => $this->compiler->available_forms()];
    }

    /**
     * @param array<string, mixed> $composition
     * @param array<string, mixed> $design
     * @return array<string, mixed>|WP_Error
     */
    public function preview_canvas_composition(int $page_id, string $document_id, int $expected_revision, array $composition, array $design)
    {
        $target = $this->target($page_id, $document_id, $expected_revision);
        if (is_wp_error($target)) {
            return $target;
        }
        $compiled = $this->compiler->compile($composition, $design);
        if (is_wp_error($compiled)) {
            return $compiled;
        }
        $preview_id = $this->compiler->preview_id((string) $compiled['compositionDigest'], $page_id, $document_id, $expected_revision);
        return [
            'target' => ['pageId' => $page_id, 'documentId' => $document_id, 'revision' => $expected_revision],
            'previewId' => $preview_id,
            'compositionDigest' => $compiled['compositionDigest'],
            'design' => $compiled['design'],
            'summary' => $compiled['summary'],
            'schema' => $compiled['schema'],
            'visualPreviewPersisted' => false,
            'next' => 'Si la evidencia es correcta, usa cod_apply_canvas_composition con este previewId; la operación crea un snapshot antes de escribir.',
        ];
    }

    /**
     * @param array<string, mixed> $composition
     * @param array<string, mixed> $design
     * @return array<string, mixed>|WP_Error
     */
    public function apply_canvas_composition(int $page_id, string $document_id, int $expected_revision, string $preview_id, array $composition, array $design)
    {
        $target = $this->target($page_id, $document_id, $expected_revision);
        if (is_wp_error($target)) {
            return $target;
        }
        $compiled = $this->compiler->compile($composition, $design);
        if (is_wp_error($compiled)) {
            return $compiled;
        }
        $expected_preview_id = $this->compiler->preview_id((string) $compiled['compositionDigest'], $page_id, $document_id, $expected_revision);
        if (!hash_equals($expected_preview_id, $preview_id)) {
            return new WP_Error('cod_mcp_preview_mismatch', 'previewId no corresponde exactamente a esta composición, destino y revisión. Vuelve a previsualizar antes de aplicar.');
        }
        $stored = $this->repository->save_compiled_recipe_if_revision(
            $document_id,
            $expected_revision,
            $compiled,
            'mcp-' . substr($preview_id, 0, 16),
            'mcp-composition-' . substr((string) $compiled['compositionDigest'], 0, 16)
        );
        if (is_wp_error($stored)) {
            return $stored;
        }
        $page = $this->publisher->describe_canvas_page($page_id);
        if ($page === null) {
            return new WP_Error('cod_mcp_canvas_page_unavailable', 'La página Canvas no pudo leerse después de aplicar la composición.');
        }
        return [
            'page' => $page,
            'document' => $stored['document'],
            'snapshot' => $stored['snapshot'],
            'evidence' => [
                'previewId' => $preview_id,
                'compositionDigest' => $compiled['compositionDigest'],
                'design' => $compiled['design'],
                'summary' => $compiled['summary'],
                'reviewedBaseRevision' => $expected_revision,
            ],
        ];
    }

    /** @return array<string, mixed>|WP_Error */
    public function publish_canvas_page(int $page_id, string $document_id, int $expected_revision)
    {
        $target = $this->target($page_id, $document_id, $expected_revision);
        if (is_wp_error($target)) {
            return $target;
        }
        // publish_existing_if_revision, NO publish. Son dos métodos distintos:
        // publish(document_id, title, page_id) es el del editor, que crea o
        // busca la página por su cuenta. El de acá recibe una página que YA
        // existe y una revisión esperada, que es lo único correcto por MCP.
        //
        // Antes se llamaba a publish() con estos cinco argumentos. PHP no se
        // queja —acepta argumentos de más y convierte el int a string—, así
        // que el número de página entraba como identificador de documento, el
        // documento salía vacío y la respuesta era "Guarda contenido en el
        // Canvas antes de publicarlo". La herramienta nunca funcionó, y el
        // error acusaba al contenido en vez de al llamado.
        return $this->publisher->publish_existing_if_revision(
            $page_id,
            $document_id,
            $expected_revision,
            'mcp-publish-' . substr(hash('sha256', $document_id . '|' . $expected_revision), 0, 16),
            'mcp-publish-r' . $expected_revision
        );
    }

    /** @return array<int, array<string, mixed>> */
    public function tool_definitions(): array
    {
        $read_only = ['readOnlyHint' => true, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => false];
        $mutation = ['readOnlyHint' => false, 'destructiveHint' => true, 'idempotentHint' => false, 'openWorldHint' => false];
        $publish = ['readOnlyHint' => false, 'destructiveHint' => true, 'idempotentHint' => true, 'openWorldHint' => false];
        $target = $this->target_schema();
        $composition = $this->composition_schema();
        $design = $this->design_rule_set_schema();

        return [
            [
                'name' => 'cod_get_capabilities',
                'title' => 'Capacidades de COD Web',
                'description' => 'Describe la gramática compositiva, las reglas de diseño revisables y los límites reales del Canvas.',
                'inputSchema' => ['type' => 'object', 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $read_only,
            ],
            [
                'name' => 'cod_list_canvas_pages',
                'title' => 'Listar páginas Canvas',
                'description' => 'Lista páginas Canvas persistidas con identidad y revisión.',
                'inputSchema' => ['type' => 'object', 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $read_only,
            ],
            [
                'name' => 'cod_get_canvas_page_state',
                'title' => 'Estado de página Canvas',
                'description' => 'Obtiene identidad, revisión y regiones resueltas de una página Canvas.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => ['pageId' => ['type' => 'integer', 'minimum' => 1]],
                    'required' => ['pageId'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $read_only,
            ],
            [
                'name' => 'cod_read_canvas_composition',
                'title' => 'Leer composición Canvas aplicada',
                'description' => 'Devuelve la última composición MCP aplicada con éxito sobre una página, resubmitible tal cual para editar un nodo puntual por su id sin reconstruir el resto. found=false si la página nunca se escribió por esta vía.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => ['pageId' => ['type' => 'integer', 'minimum' => 1]],
                    'required' => ['pageId'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $read_only,
            ],
            [
                'name' => 'cod_resolve_canvas_assets',
                'title' => 'Resolver activos Canvas',
                'description' => 'Busca referencias entre activos ya gestionados por ContOpe Design. No sube archivos ni expone rutas locales.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'references' => ['type' => 'array', 'minItems' => 1, 'maxItems' => COD_Canvas_Asset_Resolver::MAX_REFERENCES, 'items' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 2048]],
                    ],
                    'required' => ['references'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $read_only,
            ],
            [
                'name' => 'cod_list_canvas_forms',
                'title' => 'Listar formularios publicados',
                'description' => 'Devuelve formularios Orugantt publicados que una composición puede colocar sin inyectar HTML de formulario.',
                'inputSchema' => ['type' => 'object', 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $read_only,
            ],
            [
                'name' => 'cod_create_canvas_page',
                'title' => 'Crear página Canvas',
                'description' => 'Crea una página Canvas vacía y devuelve su identidad persistente.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => ['title' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 160]],
                    'required' => ['title'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $mutation,
            ],
            [
                'name' => 'cod_preview_canvas_composition',
                'title' => 'Previsualizar composición Canvas',
                'description' => 'Valida composición, reglas, URLs seguras y formularios publicados contra una revisión sin escribir. No sustituye la revisión visual del Canvas ni carga activos.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => array_merge($target, ['composition' => $composition, 'design' => $design]),
                    'required' => ['pageId', 'documentId', 'expectedRevision', 'composition', 'design'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $read_only,
            ],
            [
                'name' => 'cod_apply_canvas_composition',
                'title' => 'Aplicar composición Canvas',
                'description' => 'Guarda una composición exactamente previsualizada, crea snapshot y devuelve la nueva revisión.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => array_merge($target, [
                        'previewId' => ['type' => 'string', 'pattern' => '^[a-f0-9]{64}$'],
                        'composition' => $composition,
                        'design' => $design,
                    ]),
                    'required' => ['pageId', 'documentId', 'expectedRevision', 'previewId', 'composition', 'design'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $mutation,
            ],
            [
                'name' => 'cod_patch_css',
                'title' => 'Reemplazo literal exacto en el CSS de un documento',
                'description' => 'Busca un texto exacto en _cod_canvas_css y lo reemplaza. Rechaza si el texto no aparece o aparece más de una vez (ambiguo) — no escribe nada en ese caso. No toca HTML ni projectData.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => array_merge($target, [
                        'search' => ['type' => 'string', 'minLength' => 1],
                        'replace' => ['type' => 'string'],
                    ]),
                    'required' => ['pageId', 'documentId', 'expectedRevision', 'search', 'replace'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $mutation,
            ],
            [
                'name' => 'cod_patch_html',
                'title' => 'Reemplazo literal exacto en el HTML de un documento',
                'description' => 'Busca un texto exacto en _cod_canvas_html y lo reemplaza (o lo elimina, si replace es ""). Rechaza si el texto no aparece o aparece más de una vez (ambiguo) — no escribe nada en ese caso. No toca CSS ni projectData.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => array_merge($target, [
                        'search' => ['type' => 'string', 'minLength' => 1],
                        'replace' => ['type' => 'string'],
                    ]),
                    'required' => ['pageId', 'documentId', 'expectedRevision', 'search', 'replace'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $mutation,
            ],
            [
                'name' => 'cod_grapes_edit_node',
                'title' => 'Edita un nodo real dentro del editor Grapes (motor real, headless)',
                'description' => 'Arranca los bundles reales de GrapesJS (los mismos de wp-admin) en un navegador headless en el servidor, ubica el nodo con `editor.getWrapper().find(selector)` — la API real de Grapes, no una búsqueda de texto — y aplica la mutación con los métodos reales del componente (addAttributes, addAttributes, addClass/removeClass, addStyle, move para reubicar, o reemplazo de contenido de texto). El HTML/CSS/projectData resultantes salen de editor.getHtml()/getCss()/getProjectData(): el propio motor de Grapes, no una reconstrucción en PHP. Requiere que el servidor pueda ejecutar Node y un navegador headless (Chrome/Chromium/Edge) — si no puede, el error lo dice explícitamente en vez de fallar en silencio.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => array_merge($target, [
                        'selector' => ['type' => 'string', 'minLength' => 1, 'description' => 'Selector CSS del nodo a editar, ej. ".hero-family" o "[data-cod-node=\'wa-section-2\']". Debe resolver a exactamente un nodo.'],
                        'mutation' => [
                            'type' => 'object',
                            'properties' => [
                                'attributes' => ['type' => 'object', 'description' => 'Atributos HTML a fusionar (merge), ej. {"data-foo":"1"}.'],
                                'content' => ['type' => 'string', 'description' => 'Reemplaza el contenido del nodo (solo nodos de texto).'],
                                'addClass' => ['type' => 'array', 'items' => ['type' => 'string']],
                                'removeClass' => ['type' => 'array', 'items' => ['type' => 'string']],
                                'style' => ['type' => 'object', 'description' => 'Reglas CSS a fusionar sobre este nodo, ej. {"color":"red"}.'],
                                'move' => [
                                    'type' => 'object',
                                    'description' => 'Reubica el nodo cambiándolo de PADRE, con la API real de Grapes — el mismo movimiento que haría alguien arrastrándolo con el mouse. Es lo correcto cuando un bloque está en el lugar equivocado: simularlo con position, order o margen negativo deja el árbol mintiendo, el editor lo sigue mostrando donde estaba y quien lo toque después pelea contra reglas que no explican nada. Se declara exactamente UNO de into, before o after; el destino tiene que resolver a un solo nodo y no puede estar adentro del nodo que se mueve.',
                                    'properties' => [
                                        'into' => ['type' => 'string', 'description' => 'Selector del nodo que lo recibe adentro. Sin "at", queda al final de sus hijos.'],
                                        'before' => ['type' => 'string', 'description' => 'Selector de un nodo; queda como hermano justo antes de él.'],
                                        'after' => ['type' => 'string', 'description' => 'Selector de un nodo; queda como hermano justo después de él.'],
                                        'at' => ['type' => 'integer', 'minimum' => 0, 'description' => 'Sólo con "into": posición entre los hijos del destino. Se acota al rango disponible.'],
                                    ],
                                    'additionalProperties' => false,
                                ],
                            ],
                            'additionalProperties' => false,
                        ],
                    ]),
                    'required' => ['pageId', 'documentId', 'expectedRevision', 'selector', 'mutation'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $mutation,
            ],
            [
                'name' => 'cod_read_canvas_document',
                'title' => 'Devuelve projectData/html/css crudos de un documento',
                'description' => 'Lectura cruda del documento Canvas (projectData, html, css y revisión). Existe para el puente headless a Grapes cuando este corre FUERA del servidor (el hosting no tiene Node): el cliente lee el documento con esta herramienta, lo edita con el motor real de GrapesJS en una máquina que sí puede ejecutarlo, y devuelve el resultado con cod_write_canvas_document.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'pageId' => ['type' => 'integer', 'minimum' => 0],
                        'documentId' => ['type' => 'string'],
                    ],
                    'required' => ['pageId', 'documentId'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => ['readOnlyHint' => true],
            ],
            [
                'name' => 'cod_write_canvas_document',
                'title' => 'Guarda projectData/html/css ya producidos por el motor real de Grapes',
                'description' => 'Contraparte de escritura de cod_read_canvas_document. Acepta projectData/html/css tal cual los devolvió GrapesJS (editor.getProjectData()/getHtml()/getCss()) tras una edición hecha con su API real, los sanea y los guarda de forma consistente entre sí. No es para HTML escrito a mano: para eso están cod_patch_html/cod_patch_css, que además dejan projectData desincronizado.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => array_merge($target, [
                        'projectData' => ['type' => 'string', 'minLength' => 2],
                        'html' => ['type' => 'string'],
                        'css' => ['type' => 'string'],
                    ]),
                    'required' => ['pageId', 'documentId', 'expectedRevision', 'projectData', 'html', 'css'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $mutation,
            ],
            [
                'name' => 'cod_sync_project_data',
                'title' => 'Reconstruye projectData a partir del HTML/CSS vigentes',
                'description' => 'cod_patch_html y cod_patch_css nunca tocan projectData (el árbol que lee el editor visual GrapesJS) — tras usarlos, projectData queda desincronizado del HTML/CSS real. Si en ese estado se abre el editor visual y se guarda ahí, pisaría los cambios hechos por MCP. Este tool cierra esa brecha: empaqueta el HTML/CSS actuales como projectData (mismo formato que usa una composición MCP normal) sin alterar el HTML ni el CSS. Úsalo después de una tanda de cod_patch_html/cod_patch_css, antes de que alguien abra el editor visual.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => $target,
                    'required' => ['pageId', 'documentId', 'expectedRevision'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $mutation,
            ],
            [
                'name' => 'cod_activate_section_whatsapp',
                'title' => 'Insertar/actualizar módulo WhatsApp en cada fila con data-wa-msg',
                'description' => 'Inserta un módulo real de WhatsApp (mismo componente que la composición normal construiría) dentro de la FILA (no la sección completa) de cada elemento que trae data-wa-msg, usando ese texto como mensaje. Si ya existe un módulo en esa fila, lo reemplaza con el estilo nuevo — permite iterar sin duplicar. anchorSelector indica qué elemento de la sección es "la fila" (por defecto, su primer div hijo).',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => array_merge($target, [
                        'position' => [
                            'type' => 'string',
                            'enum' => ['bottom', 'top', 'left', 'right', 'bottom-left', 'bottom-right', 'top-left', 'top-right', 'center'],
                        ],
                        'anchorSelector' => ['type' => 'string', 'pattern' => '^\\.[a-zA-Z_][a-zA-Z0-9_-]*$'],
                        'style' => [
                            'type' => 'object',
                            'properties' => [
                                'offset' => ['type' => 'number', 'minimum' => -100, 'maximum' => 100],
                                'size' => ['type' => 'integer', 'minimum' => 24, 'maximum' => 200],
                                'iconPadding' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 80],
                                'iconColor' => ['type' => 'string'],
                                'backgroundColor' => ['type' => 'string'],
                                'borderRadius' => ['type' => 'string'],
                                'animation' => [
                                    'type' => 'object',
                                    'properties' => [
                                        'routine' => ['type' => 'string', 'enum' => ['rise', 'fade', 'scale', 'pop']],
                                        'level' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 3],
                                    ],
                                ],
                            ],
                        ],
                    ]),
                    'required' => ['pageId', 'documentId', 'expectedRevision'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $mutation,
            ],
            [
                'name' => 'cod_patch_geo_places',
                'title' => 'Actualizar lugares de un geo-map ya publicado',
                'description' => 'Reemplaza el atributo data-cod-geo-places de un geo-map ya existente en una página Canvas, sin tocar el resto del HTML/CSS/projectData. No crea un geo-map nuevo; el documento debe tener uno ya construido.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => array_merge($target, [
                        'places' => [
                            'type' => 'array',
                            'minItems' => 1,
                            'items' => [
                                'type' => 'object',
                                'required' => ['nombre', 'categoria', 'x', 'y'],
                                'properties' => [
                                    'nombre' => ['type' => 'string'],
                                    'categoria' => ['type' => 'string'],
                                    'x' => ['type' => 'number'],
                                    'y' => ['type' => 'number'],
                                    'dist' => ['type' => 'number'],
                                    'tiempoMin' => ['type' => ['number', 'null']],
                                    'contacto' => ['type' => 'string'],
                                    'descripcionLarga' => ['type' => 'string'],
                                ],
                            ],
                        ],
                    ]),
                    'required' => ['pageId', 'documentId', 'expectedRevision', 'places'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $mutation,
            ],
            [
                'name' => 'cod_set_whatsapp_number',
                'title' => 'Configurar número de WhatsApp del sitio',
                'description' => 'Guarda el número de WhatsApp (con código de país, sin +) que usan el nodo whatsapp y la burbuja contextual por sección.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => ['number' => ['type' => 'string', 'pattern' => '^[0-9]{8,15}$']],
                    'required' => ['number'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $mutation,
            ],
            [
                'name' => 'cod_publish_canvas_page',
                'title' => 'Publicar página Canvas',
                'description' => 'Publica de forma separada una página Canvas ya revisada en la revisión indicada.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => $target,
                    'required' => ['pageId', 'documentId', 'expectedRevision'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object'],
                'annotations' => $publish,
            ],
        ];
    }

    public function has_tool(string $tool_name): bool
    {
        foreach ($this->tool_definitions() as $tool) {
            if ($tool['name'] === $tool_name) {
                return true;
            }
        }
        return false;
    }

    /** @param array<string, mixed> $arguments @return array<string, mixed>|WP_Error */
    public function call_tool(string $tool_name, array $arguments)
    {
        if ($tool_name === 'cod_get_capabilities') {
            return $this->reject_unexpected_arguments($arguments) ?? $this->capabilities();
        }
        if ($tool_name === 'cod_list_canvas_pages') {
            $error = $this->reject_unexpected_arguments($arguments);
            return $error ?? ['pages' => $this->list_canvas_pages()];
        }
        if ($tool_name === 'cod_get_canvas_page_state') {
            if (!$this->has_only_keys($arguments, ['pageId']) || !isset($arguments['pageId']) || !is_int($arguments['pageId']) || $arguments['pageId'] < 1) {
                return new WP_Error('cod_mcp_invalid_arguments', 'pageId debe ser un entero positivo y el único argumento.');
            }
            return $this->canvas_page_state($arguments['pageId']);
        }
        if ($tool_name === 'cod_read_canvas_composition') {
            if (!$this->has_only_keys($arguments, ['pageId']) || !isset($arguments['pageId']) || !is_int($arguments['pageId']) || $arguments['pageId'] < 1) {
                return new WP_Error('cod_mcp_invalid_arguments', 'pageId debe ser un entero positivo y el único argumento.');
            }
            return $this->read_canvas_composition($arguments['pageId']);
        }
        if ($tool_name === 'cod_resolve_canvas_assets') {
            if (!$this->has_only_keys($arguments, ['references']) || !isset($arguments['references']) || !is_array($arguments['references']) || !$this->is_list($arguments['references']) || count($arguments['references']) < 1 || count($arguments['references']) > COD_Canvas_Asset_Resolver::MAX_REFERENCES) {
                return new WP_Error('cod_mcp_invalid_arguments', 'references debe ser una lista de 1 a ' . COD_Canvas_Asset_Resolver::MAX_REFERENCES . ' referencias.');
            }
            foreach ($arguments['references'] as $reference) {
                if (!is_string($reference) || $reference === '' || strlen($reference) > 2048) {
                    return new WP_Error('cod_mcp_invalid_arguments', 'Cada referencia de activo debe ser texto no vacío de hasta 2048 caracteres.');
                }
            }
            return $this->resolve_canvas_assets($arguments['references']);
        }
        if ($tool_name === 'cod_list_canvas_forms') {
            return $this->reject_unexpected_arguments($arguments) ?? $this->list_canvas_forms();
        }
        if ($tool_name === 'cod_create_canvas_page') {
            if (!$this->has_only_keys($arguments, ['title']) || !array_key_exists('title', $arguments)) {
                return new WP_Error('cod_mcp_invalid_arguments', 'title es obligatorio para crear una página Canvas.');
            }
            $title = $this->normalize_page_title($arguments['title']);
            return is_wp_error($title) ? $title : $this->create_canvas_page($title);
        }
        if ($tool_name === 'cod_preview_canvas_composition') {
            $input = $this->composition_arguments($arguments, false);
            if (is_wp_error($input)) {
                return $input;
            }
            return $this->preview_canvas_composition($input['pageId'], $input['documentId'], $input['expectedRevision'], $input['composition'], $input['design']);
        }
        if ($tool_name === 'cod_apply_canvas_composition') {
            $input = $this->composition_arguments($arguments, true);
            if (is_wp_error($input)) {
                return $input;
            }
            return $this->apply_canvas_composition($input['pageId'], $input['documentId'], $input['expectedRevision'], $input['previewId'], $input['composition'], $input['design']);
        }
        if ($tool_name === 'cod_patch_css') {
            $target = $this->target_arguments($arguments, ['search', 'replace']);
            if (is_wp_error($target)) {
                return $target;
            }
            if (!isset($arguments['search'], $arguments['replace']) || !is_string($arguments['search']) || !is_string($arguments['replace']) || $arguments['search'] === '') {
                return new WP_Error('cod_mcp_invalid_arguments', 'search y replace deben ser texto; search no puede ser vacío.');
            }
            return $this->patch_css($target['pageId'], $target['documentId'], $target['expectedRevision'], $arguments['search'], $arguments['replace']);
        }
        if ($tool_name === 'cod_patch_html') {
            $target = $this->target_arguments($arguments, ['search', 'replace']);
            if (is_wp_error($target)) {
                return $target;
            }
            if (!isset($arguments['search'], $arguments['replace']) || !is_string($arguments['search']) || !is_string($arguments['replace']) || $arguments['search'] === '') {
                return new WP_Error('cod_mcp_invalid_arguments', 'search y replace deben ser texto; search no puede ser vacío.');
            }
            return $this->patch_html($target['pageId'], $target['documentId'], $target['expectedRevision'], $arguments['search'], $arguments['replace']);
        }
        if ($tool_name === 'cod_grapes_edit_node') {
            $target = $this->target_arguments($arguments, ['selector', 'mutation']);
            if (is_wp_error($target)) {
                return $target;
            }
            if (!isset($arguments['selector']) || !is_string($arguments['selector']) || $arguments['selector'] === '') {
                return new WP_Error('cod_mcp_invalid_arguments', 'selector debe ser texto no vacío.');
            }
            $mutation_input = isset($arguments['mutation']) && is_array($arguments['mutation']) ? $arguments['mutation'] : [];
            return $this->grapes_edit_node($target['pageId'], $target['documentId'], $target['expectedRevision'], $arguments['selector'], $mutation_input);
        }
        if ($tool_name === 'cod_read_canvas_document') {
            $page_id = isset($arguments['pageId']) ? (int) $arguments['pageId'] : -1;
            $document_id = isset($arguments['documentId']) ? (string) $arguments['documentId'] : '';
            if ($page_id < 0 || $document_id === '') {
                return new WP_Error('cod_mcp_invalid_arguments', 'pageId y documentId son obligatorios.');
            }
            return $this->read_canvas_document($page_id, $document_id);
        }
        if ($tool_name === 'cod_write_canvas_document') {
            $target = $this->target_arguments($arguments, ['projectData', 'html', 'css']);
            if (is_wp_error($target)) {
                return $target;
            }
            foreach (['projectData', 'html', 'css'] as $key) {
                if (!isset($arguments[$key]) || !is_string($arguments[$key])) {
                    return new WP_Error('cod_mcp_invalid_arguments', $key . ' debe ser texto.');
                }
            }
            return $this->write_canvas_document($target['pageId'], $target['documentId'], $target['expectedRevision'], $arguments['projectData'], $arguments['html'], $arguments['css']);
        }
        if ($tool_name === 'cod_sync_project_data') {
            $target = $this->target_arguments($arguments, []);
            if (is_wp_error($target)) {
                return $target;
            }
            return $this->sync_project_data($target['pageId'], $target['documentId'], $target['expectedRevision']);
        }
        if ($tool_name === 'cod_activate_section_whatsapp') {
            $target = $this->target_arguments($arguments, ['position', 'style', 'anchorSelector']);
            if (is_wp_error($target)) {
                return $target;
            }
            $position = $arguments['position'] ?? 'bottom';
            if (!is_string($position)) {
                return new WP_Error('cod_mcp_invalid_arguments', 'position debe ser una cadena.');
            }
            $style = $arguments['style'] ?? [];
            if (!is_array($style)) {
                return new WP_Error('cod_mcp_invalid_arguments', 'style debe ser un objeto.');
            }
            $anchor_selector = $arguments['anchorSelector'] ?? null;
            if ($anchor_selector !== null && (!is_string($anchor_selector) || preg_match('/^\.[a-zA-Z_][a-zA-Z0-9_-]*$/', $anchor_selector) !== 1)) {
                return new WP_Error('cod_mcp_invalid_arguments', 'anchorSelector debe ser una clase simple, p. ej. ".wrap".');
            }
            return $this->activate_section_whatsapp($target['pageId'], $target['documentId'], $target['expectedRevision'], $position, $style, $anchor_selector);
        }
        if ($tool_name === 'cod_patch_geo_places') {
            $target = $this->target_arguments($arguments, ['places']);
            if (is_wp_error($target)) {
                return $target;
            }
            if (!isset($arguments['places']) || !is_array($arguments['places']) || !$this->is_list($arguments['places']) || count($arguments['places']) < 1) {
                return new WP_Error('cod_mcp_invalid_arguments', 'places debe ser una lista no vacía de lugares.');
            }
            return $this->patch_geo_places($target['pageId'], $target['documentId'], $target['expectedRevision'], $arguments['places']);
        }
        if ($tool_name === 'cod_set_whatsapp_number') {
            if (!$this->has_only_keys($arguments, ['number']) || !isset($arguments['number']) || !is_string($arguments['number']) || preg_match('/^[0-9]{8,15}$/', $arguments['number']) !== 1) {
                return new WP_Error('cod_mcp_invalid_arguments', 'number debe ser una cadena de 8 a 15 dígitos, con código de país y sin +.');
            }
            update_option('cod_whatsapp_number', $arguments['number'], false);
            return ['number' => $arguments['number'], 'saved' => true];
        }
        if ($tool_name === 'cod_publish_canvas_page') {
            $target = $this->target_arguments($arguments, []);
            if (is_wp_error($target)) {
                return $target;
            }
            return $this->publish_canvas_page($target['pageId'], $target['documentId'], $target['expectedRevision']);
        }
        return new WP_Error('cod_mcp_tool_not_found', 'La herramienta MCP solicitada no existe.');
    }

    /**
     * Reemplaza SOLO el atributo data-cod-geo-places de _cod_canvas_html,
     * dejando project_data y css intactos tal como están (no se re-codifica
     * nada que no haga falta tocar, para no arriesgar corromper JSON anidado
     * — ver la nota sobre wp_slash() en el repositorio para el porqué).
     *
     * @param array<int, array<string, mixed>> $places
     * @return array<string, mixed>|WP_Error
     */
    private function patch_geo_places(int $page_id, string $document_id, int $expected_revision, array $places)
    {
        $target = $this->target($page_id, $document_id, $expected_revision);
        if (is_wp_error($target)) {
            return $target;
        }
        $document = $this->repository->load_existing($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        $html = (string) $document['html'];
        if (!preg_match('/data-cod-geo-places="([^"]*)"/', $html, $matches)) {
            return new WP_Error('cod_mcp_geo_places_not_found', 'Esta página no tiene un geo-map con data-cod-geo-places para actualizar.');
        }
        $decoded_current = json_decode(html_entity_decode($matches[1], ENT_QUOTES), true);
        if (!is_array($decoded_current)) {
            return new WP_Error('cod_mcp_geo_places_invalid', 'El data-cod-geo-places actual no es JSON válido; no se toca por seguridad.');
        }
        $new_json = wp_json_encode(array_values($places), JSON_UNESCAPED_UNICODE);
        if (!is_string($new_json)) {
            return new WP_Error('cod_mcp_geo_places_encode', 'No se pudo codificar la nueva lista de lugares.');
        }
        $new_html = str_replace(
            'data-cod-geo-places="' . $matches[1] . '"',
            'data-cod-geo-places="' . esc_attr($new_json) . '"',
            $html
        );
        $saved = $this->repository->save($document_id, (string) $document['projectData'], $new_html, (string) $document['css']);
        if (is_wp_error($saved)) {
            return $saved;
        }
        return [
            'previousCount' => count($decoded_current),
            'newCount' => count($places),
            'revision' => $saved['revision'],
        ];
    }

    /**
     * Inserta un módulo whatsapp real (mismo componente que
     * cod_apply_canvas_composition construiría) como hijo directo de cada
     * elemento que ya trae data-wa-msg, usando ese mismo texto como mensaje.
     * Si una sección ya tiene un módulo insertado, lo REEMPLAZA con el
     * estilo nuevo (para poder iterar tamaño/color/posición sin duplicar).
     * Cada sección recibe position:relative si no lo tenía, porque el
     * módulo se ancla a ella con position:absolute (nace de la sección, no
     * de la página).
     *
     * @param array<string, mixed> $style offset, size, iconPadding, iconColor, backgroundColor, borderRadius, animation
     * @return array<string, mixed>|WP_Error
     */
    private function activate_section_whatsapp(int $page_id, string $document_id, int $expected_revision, string $position, array $style = [], ?string $anchor_selector = null)
    {
        $target = $this->target($page_id, $document_id, $expected_revision);
        if (is_wp_error($target)) {
            return $target;
        }
        $document = $this->repository->load_existing($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        $html = (string) $document['html'];
        if (strpos($html, 'data-wa-msg') === false) {
            return new WP_Error('cod_mcp_no_whatsapp_sections', 'Esta página no tiene secciones con data-wa-msg.');
        }

        libxml_use_internal_errors(true);
        $dom = new DOMDocument('1.0', 'UTF-8');
        $dom->loadHTML('<?xml encoding="utf-8"?><div id="cod-mcp-root">' . $html . '</div>', LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();
        $xpath = new DOMXPath($dom);
        $sections = $xpath->query('//*[@data-wa-msg]');
        if ($sections === false || $sections->length === 0) {
            return new WP_Error('cod_mcp_no_whatsapp_sections', 'No se encontraron elementos con data-wa-msg.');
        }

        // El módulo se posiciona respecto de la FILA (el contenedor de
        // contenido real dentro de la sección), no de la sección completa
        // — una sección puede tener varias filas, y "esquina inferior
        // derecha de la sección" no es lo mismo que "de esta fila". Por
        // defecto usamos el primer div hijo directo (".wrap" en este
        // sitio); anchorSelector permite indicar otra clase explícita.
        $anchored = 0;
        foreach ($sections as $index => $section) {
            $anchor = null;
            if ($anchor_selector !== null) {
                $class_name = ltrim($anchor_selector, '.');
                $matches = $xpath->query('.//*[contains(concat(" ", normalize-space(@class), " "), " ' . $class_name . ' ")]', $section);
                if ($matches !== false && $matches->length > 0) {
                    $anchor = $matches->item(0);
                }
            } else {
                foreach ($section->childNodes as $child) {
                    if ($child->nodeType === XML_ELEMENT_NODE) {
                        $anchor = $child;
                        break;
                    }
                }
            }
            if ($anchor === null) {
                return new WP_Error('cod_mcp_whatsapp_anchor_not_found', 'No se encontró el elemento ancla (fila) dentro de una de las secciones con data-wa-msg.');
            }

            // Reemplaza cualquier módulo ya insertado en TODA la sección
            // (no solo en el ancla actual) — una corrida anterior pudo
            // haber usado otro anchorSelector, y dejaría copias huérfanas
            // si solo buscáramos dentro del ancla de esta corrida.
            $already = $xpath->query('.//*[contains(concat(" ", normalize-space(@class), " "), " cod-node--whatsapp ")]', $section);
            if ($already !== false) {
                foreach (iterator_to_array($already) as $old) {
                    if ($old->parentNode !== null) {
                        $old->parentNode->removeChild($old);
                    }
                }
            }

            $message = (string) $section->getAttribute('data-wa-msg');
            $node_id = 'wa-section-' . $index;
            $module_html = $this->compiler->render_whatsapp_module($node_id, $message, $position, $style);
            if (is_wp_error($module_html)) {
                return $module_html;
            }
            $anchor_style = $anchor->getAttribute('style');
            if (strpos($anchor_style, 'position') === false) {
                $anchor->setAttribute('style', rtrim($anchor_style, '; ') . (($anchor_style !== '') ? ';' : '') . 'position:relative;');
            }
            $fragmentDoc = new DOMDocument('1.0', 'UTF-8');
            $fragmentDoc->loadHTML('<?xml encoding="utf-8"?><div id="cod-mcp-fragment">' . $module_html . '</div>', LIBXML_NOERROR | LIBXML_NOWARNING);
            $importedWrap = $dom->importNode($fragmentDoc->getElementById('cod-mcp-fragment'), true);
            foreach (iterator_to_array($importedWrap->childNodes) as $child) {
                $anchor->appendChild($child);
            }
            $anchored++;
        }

        $root = $dom->getElementById('cod-mcp-root');
        $new_html = '';
        foreach ($root->childNodes as $child) {
            $new_html .= $dom->saveHTML($child);
        }

        $saved = $this->repository->save($document_id, (string) $document['projectData'], $new_html, (string) $document['css']);
        if (is_wp_error($saved)) {
            return $saved;
        }
        return ['anchored' => $anchored, 'revision' => $saved['revision']];
    }

    /**
     * Reemplazo literal exacto dentro de _cod_canvas_css. Exige que $search
     * aparezca EXACTAMENTE una vez — si no aparece, o aparece más de una
     * vez (ambiguo), rechaza sin escribir nada. No toca HTML ni
     * projectData.
     *
     * @return array<string, mixed>|WP_Error
     */
    private function patch_css(int $page_id, string $document_id, int $expected_revision, string $search, string $replace)
    {
        $target = $this->target($page_id, $document_id, $expected_revision);
        if (is_wp_error($target)) {
            return $target;
        }
        $document = $this->repository->load_existing($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        $css = (string) $document['css'];
        $count = substr_count($css, $search);
        if ($count === 0) {
            return new WP_Error('cod_mcp_css_search_not_found', 'El texto buscado no aparece en el CSS de este documento.');
        }
        if ($count > 1) {
            return new WP_Error('cod_mcp_css_search_ambiguous', 'El texto buscado aparece ' . $count . ' veces; debe ser único para aplicar el reemplazo con seguridad.');
        }
        $new_css = str_replace($search, $replace, $css);
        $saved = $this->repository->save($document_id, (string) $document['projectData'], (string) $document['html'], $new_css);
        if (is_wp_error($saved)) {
            return $saved;
        }
        return ['revision' => $saved['revision']];
    }

    /**
     * Lectura cruda del documento (projectData/html/css/revisión) para que un
     * puente headless que corre FUERA de este servidor pueda editarlo con el
     * motor real de Grapes y devolverlo por write_canvas_document.
     *
     * @return array<string, mixed>|WP_Error
     */
    private function read_canvas_document(int $page_id, string $document_id)
    {
        $described = $this->repository->describe_existing($document_id);
        if ($described === null) {
            return new WP_Error('cod_mcp_document_not_found', 'No existe un documento Canvas con ese ID.');
        }
        $document = $this->repository->load_existing($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        return [
            'documentId' => $document_id,
            'revision' => (int) $document['revision'],
            'projectData' => (string) $document['projectData'],
            'html' => (string) $document['html'],
            'css' => (string) $document['css'],
        ];
    }

    /**
     * Guarda projectData/html/css producidos por el motor real de Grapes en
     * una máquina externa. Los tres se guardan juntos y saneados, de modo que
     * el árbol y sus exportaciones queden consistentes entre sí (a diferencia
     * de patch_html/patch_css, que dejan projectData atrás).
     *
     * @return array<string, mixed>|WP_Error
     */
    private function write_canvas_document(int $page_id, string $document_id, int $expected_revision, string $project_data, string $html, string $css)
    {
        $target = $this->target($page_id, $document_id, $expected_revision);
        if (is_wp_error($target)) {
            return $target;
        }
        $sanitizer = new COD_Canvas_Document_Sanitizer();
        $clean_project = $sanitizer->sanitize_project_data($project_data);
        if (is_wp_error($clean_project)) {
            return $clean_project;
        }
        $clean_html = $sanitizer->sanitize_html($html);
        if (is_wp_error($clean_html)) {
            return $clean_html;
        }
        $clean_css = $sanitizer->sanitize_css($css);
        if (is_wp_error($clean_css)) {
            return $clean_css;
        }
        $saved = $this->repository->save($document_id, $clean_project, $clean_html, $clean_css);
        if (is_wp_error($saved)) {
            return $saved;
        }
        return ['revision' => $saved['revision']];
    }

    /**
     * Dirige un selector CSS al editor Grapes real (headless) y aplica la
     * mutación con la API real de componentes — ver
     * tools/cod-headless-node-edit.mjs para el detalle. Este método solo
     * localiza `node`, valida que el servidor pueda ejecutar procesos, le
     * pasa el documento actual por stdin y guarda lo que el propio Grapes
     * devuelva. Si el servidor no puede correr Node/un navegador headless,
     * el error lo dice explícitamente — nunca cae en silencio a una
     * reimplementación en PHP.
     *
     * @param array<string, mixed> $mutation
     * @return array<string, mixed>|WP_Error
     */
    private function grapes_edit_node(int $page_id, string $document_id, int $expected_revision, string $selector, array $mutation)
    {
        if (!function_exists('proc_open')) {
            return new WP_Error('cod_mcp_grapes_no_proc_open', 'Este servidor tiene proc_open deshabilitado (revisar disable_functions en php.ini) — no puede ejecutar el puente headless a Grapes.');
        }

        $target = $this->target($page_id, $document_id, $expected_revision);
        if (is_wp_error($target)) {
            return $target;
        }
        $document = $this->repository->load_existing($document_id);
        if (is_wp_error($document)) {
            return $document;
        }

        $node_bin = $this->find_node_binary();
        if ($node_bin === null) {
            return new WP_Error('cod_mcp_grapes_no_node', 'No se encontró el ejecutable de Node.js en este servidor. El puente headless a Grapes (tools/cod-headless-node-edit.mjs) necesita Node instalado en la máquina donde corre el plugin.');
        }

        $script_path = COD_PUBLISHER_DIR . 'tools/cod-headless-node-edit.mjs';
        if (!file_exists($script_path)) {
            return new WP_Error('cod_mcp_grapes_script_missing', 'No se encontró tools/cod-headless-node-edit.mjs dentro del plugin.');
        }

        $payload = wp_json_encode([
            'document' => [
                'projectData' => (string) $document['projectData'],
                'html' => (string) $document['html'],
                'css' => (string) $document['css'],
            ],
            'selector' => $selector,
            'mutation' => $mutation,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($payload)) {
            return new WP_Error('cod_mcp_grapes_encode', 'No se pudo codificar el documento para el puente headless.');
        }

        $result = $this->run_headless_bridge($node_bin, $script_path, $payload);
        if (is_wp_error($result)) {
            return $result;
        }
        if (empty($result['ok'])) {
            $message = isset($result['error']) ? (string) $result['error'] : 'El puente headless a Grapes falló sin detalle.';
            return new WP_Error('cod_mcp_grapes_bridge_failed', $message);
        }

        $sanitizer = new COD_Canvas_Document_Sanitizer();
        $project_data = $sanitizer->sanitize_project_data((string) $result['projectData']);
        if (is_wp_error($project_data)) {
            return $project_data;
        }
        $html = $sanitizer->sanitize_html((string) $result['html']);
        if (is_wp_error($html)) {
            return $html;
        }
        $css = $sanitizer->sanitize_css((string) $result['css']);
        if (is_wp_error($css)) {
            return $css;
        }

        $saved = $this->repository->save($document_id, $project_data, $html, $css);
        if (is_wp_error($saved)) {
            return $saved;
        }
        return ['revision' => $saved['revision'], 'selector' => $selector];
    }

    /** Busca `node` en ubicaciones comunes; no asume que esté en PATH bajo PHP-FPM. */
    private function find_node_binary(): ?string
    {
        $candidates = [];
        if (function_exists('shell_exec')) {
            $which = @shell_exec('command -v node 2>/dev/null');
            if (is_string($which) && trim($which) !== '') {
                $candidates[] = trim($which);
            }
        }
        $candidates = array_merge($candidates, [
            '/usr/bin/node',
            '/usr/local/bin/node',
            '/opt/homebrew/bin/node',
            'C:\\Program Files\\nodejs\\node.exe',
        ]);
        foreach ($candidates as $candidate) {
            if ($candidate !== '' && file_exists($candidate)) {
                return $candidate;
            }
        }
        return null;
    }

    /**
     * Corre el script Node por proc_open, pasándole $payload por stdin —
     * shell_exec no es seguro para payloads grandes/con caracteres
     * especiales. Devuelve el array decodificado de stdout, o WP_Error si el
     * proceso no pudo correr o no devolvió JSON válido.
     *
     * @return array<string, mixed>|WP_Error
     */
    private function run_headless_bridge(string $node_bin, string $script_path, string $payload)
    {
        $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $process = @proc_open([$node_bin, $script_path], $descriptors, $pipes);
        if (!is_resource($process)) {
            return new WP_Error('cod_mcp_grapes_spawn_failed', 'No se pudo iniciar el proceso Node para el puente headless.');
        }
        fwrite($pipes[0], $payload);
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exit_code = proc_close($process);

        $stdout = is_string($stdout) ? trim($stdout) : '';
        if ($stdout === '') {
            return new WP_Error('cod_mcp_grapes_no_output', 'El puente headless no devolvió salida.' . ($stderr ? ' stderr: ' . $stderr : '') . ' (código de salida ' . $exit_code . ')');
        }
        $decoded = json_decode($stdout, true);
        if (!is_array($decoded)) {
            return new WP_Error('cod_mcp_grapes_bad_output', 'El puente headless no devolvió JSON válido: ' . $stdout);
        }
        return $decoded;
    }

    /**
     * Reconstruye projectData a partir del html/css vigentes del documento,
     * envolviéndolos en la misma forma mínima que usa compile() (un wrapper
     * cuyo `components` es directamente el HTML como string). Existe porque
     * patch_html/patch_css nunca tocan projectData — tras usarlos, el árbol
     * que lee el editor visual GrapesJS queda desincronizado del html/css
     * real, y guardar desde ahí pisaría esos cambios. No reconstruye ni
     * reinterpreta el contenido, solo empaqueta lo que ya está guardado.
     *
     * @return array<string, mixed>|WP_Error
     */
    private function sync_project_data(int $page_id, string $document_id, int $expected_revision)
    {
        $target = $this->target($page_id, $document_id, $expected_revision);
        if (is_wp_error($target)) {
            return $target;
        }
        $document = $this->repository->load_existing($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        $project = [
            'pages' => [[
                'name' => 'ContOpe Design MCP composition',
                'component' => [
                    'type' => 'wrapper',
                    'components' => (string) $document['html'],
                ],
                'styles' => (string) $document['css'],
            ]],
            'assets' => [],
        ];
        $project_json = wp_json_encode($project, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($project_json)) {
            return new WP_Error('cod_mcp_sync_project_encode', 'No se pudo codificar projectData.');
        }
        $sanitizer = new COD_Canvas_Document_Sanitizer();
        $project_json = $sanitizer->sanitize_project_data($project_json);
        if (is_wp_error($project_json)) {
            return $project_json;
        }
        $saved = $this->repository->save($document_id, $project_json, (string) $document['html'], (string) $document['css']);
        if (is_wp_error($saved)) {
            return $saved;
        }
        return ['revision' => $saved['revision'], 'synced' => true];
    }

    /** @return array<string, mixed>|WP_Error */
    private function patch_html(int $page_id, string $document_id, int $expected_revision, string $search, string $replace)
    {
        $target = $this->target($page_id, $document_id, $expected_revision);
        if (is_wp_error($target)) {
            return $target;
        }
        $document = $this->repository->load_existing($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        $html = (string) $document['html'];
        $count = substr_count($html, $search);
        if ($count === 0) {
            return new WP_Error('cod_mcp_html_search_not_found', 'El texto buscado no aparece en el HTML de este documento.');
        }
        if ($count > 1) {
            return new WP_Error('cod_mcp_html_search_ambiguous', 'El texto buscado aparece ' . $count . ' veces; debe ser único para aplicar el reemplazo con seguridad.');
        }
        $new_html = str_replace($search, $replace, $html);
        $saved = $this->repository->save($document_id, (string) $document['projectData'], $new_html, (string) $document['css']);
        if (is_wp_error($saved)) {
            return $saved;
        }
        return ['revision' => $saved['revision']];
    }

    /** @return array<string, mixed>|WP_Error */
    private function target(int $page_id, string $document_id, int $expected_revision)
    {
        // pageId 0 identifica un documento que no está atado a ninguna página
        // Canvas concreta. Dos formas distintas, no conflated entre sí:
        //   - un documento de región global (header/footer/body), que se
        //     resuelve por regla (ver COD_Template_Region_Resolver) y por eso
        //     se valida contra list_region_documents();
        //   - el documento de estilos COMPARTIDOS entre todas las páginas
        //     (COD_Canvas_Document_Repository::SHARED_STYLES_DOCUMENT_ID), que
        //     no tiene scope/targets/excludes — es el mismo para el sitio
        //     entero, así que basta con su identidad fija.
        // Ambos reutilizan el mismo modelo de revisión/bloqueo/snapshot que
        // ya protege una página real; lo único que cambia es cómo se
        // autoriza el documentId cuando no hay página que lo respalde.
        if ($page_id === 0) {
            $es_documento_global = hash_equals(COD_Canvas_Document_Repository::SHARED_STYLES_DOCUMENT_ID, $document_id);
            if (!$es_documento_global) {
                foreach ($this->repository->list_region_documents() as $region_document) {
                    if (hash_equals((string) $region_document['documentId'], $document_id)) {
                        $es_documento_global = true;
                        break;
                    }
                }
            }
            if (!$es_documento_global) {
                return new WP_Error('cod_mcp_canvas_page_not_found', 'pageId 0 sólo es válido para un documento de región global (header/footer/body) o para el documento de estilos compartidos; documentId no corresponde a ninguno.');
            }
            $document = $this->repository->describe_existing($document_id);
            if ($document === null) {
                return new WP_Error('cod_mcp_canvas_document_missing', 'El documento Canvas indicado no está disponible.');
            }
            if ((int) $document['revision'] !== $expected_revision) {
                return $this->revision_conflict($expected_revision, (int) $document['revision']);
            }
            return ['page' => null, 'document' => $document];
        }

        $page = $this->publisher->describe_canvas_page($page_id);
        if ($page === null) {
            return new WP_Error('cod_mcp_canvas_page_not_found', 'No existe una página Canvas con ese pageId.');
        }
        if (!hash_equals((string) $page['documentId'], $document_id)) {
            return new WP_Error('cod_mcp_canvas_target_mismatch', 'documentId no corresponde a la página Canvas indicada.');
        }
        $document = $this->repository->describe_existing($document_id);
        if ($document === null) {
            return new WP_Error('cod_mcp_canvas_document_missing', 'El documento Canvas indicado no está disponible.');
        }
        if ((int) $document['revision'] !== $expected_revision) {
            return $this->revision_conflict($expected_revision, (int) $document['revision']);
        }
        return ['page' => $page, 'document' => $document];
    }

    /** @param array<string, mixed> $arguments @param array<int, string> $extra_allowed @return array<string, mixed>|WP_Error */
    private function target_arguments(array $arguments, array $extra_allowed)
    {
        $allowed = array_merge(['pageId', 'documentId', 'expectedRevision'], $extra_allowed);
        if (!$this->has_only_keys($arguments, $allowed)
            || !isset($arguments['pageId'], $arguments['documentId'], $arguments['expectedRevision'])
            || !is_int($arguments['pageId']) || $arguments['pageId'] < 0
            || !is_string($arguments['documentId']) || !$this->is_document_id($arguments['documentId'])
            || !is_int($arguments['expectedRevision']) || $arguments['expectedRevision'] < 0) {
            return new WP_Error('cod_mcp_invalid_arguments', 'pageId, documentId y expectedRevision deben identificar una revisión Canvas válida. pageId 0 = documento de región global (sin página).');
        }
        return ['pageId' => $arguments['pageId'], 'documentId' => $arguments['documentId'], 'expectedRevision' => $arguments['expectedRevision']];
    }

    /** @param array<string, mixed> $arguments @return array<string, mixed>|WP_Error */
    private function composition_arguments(array $arguments, bool $requires_preview_id)
    {
        $extra = ['composition', 'design'];
        if ($requires_preview_id) {
            $extra[] = 'previewId';
        }
        $target = $this->target_arguments($arguments, $extra);
        if (is_wp_error($target)) {
            return $target;
        }
        if (!isset($arguments['composition']) || !is_array($arguments['composition']) || !isset($arguments['design']) || !is_array($arguments['design'])) {
            return new WP_Error('cod_mcp_invalid_arguments', 'composition y design deben ser objetos JSON.');
        }
        if ($requires_preview_id) {
            if (!isset($arguments['previewId']) || !is_string($arguments['previewId']) || preg_match('/^[a-f0-9]{64}$/', $arguments['previewId']) !== 1) {
                return new WP_Error('cod_mcp_invalid_arguments', 'previewId debe ser la evidencia SHA-256 devuelta por la previsualización.');
            }
            $target['previewId'] = $arguments['previewId'];
        }
        $target['composition'] = $arguments['composition'];
        $target['design'] = $arguments['design'];
        return $target;
    }

    /** @return array<string, mixed>|null */
    private function resolved_region(string $kind, int $page_id): ?array
    {
        $resolved = $this->region_resolver->resolve($kind, $page_id);
        if (!is_array($resolved) || !isset($resolved['documentId'])) {
            return null;
        }
        return $this->repository->describe_existing((string) $resolved['documentId']);
    }

    /** @return array<string, mixed> */
    private function target_schema(): array
    {
        return [
            'pageId' => ['type' => 'integer', 'minimum' => 0, 'description' => '0 = documento de región global (header/footer/body), sin página propia.'],
            'documentId' => ['type' => 'string', 'pattern' => '^[a-z0-9][a-z0-9_-]{0,191}$'],
            'expectedRevision' => ['type' => 'integer', 'minimum' => 0],
        ];
    }

    /** @return array<string, mixed> */
    private function design_rule_set_schema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'schemaVersion' => ['const' => 1],
                'designId' => ['type' => 'string', 'pattern' => '^[a-z][a-z0-9._:-]{0,127}$'],
                'expectedDesignRevision' => ['type' => 'integer', 'minimum' => 0],
                'reviewState' => ['type' => 'string', 'enum' => ['session', 'reviewed']],
                'label' => ['type' => 'string', 'maxLength' => 160],
                'rootRuleIds' => ['type' => 'array', 'maxItems' => 32, 'items' => ['type' => 'string']],
                'rules' => ['type' => 'array', 'maxItems' => 256, 'items' => ['type' => 'object', 'description' => 'Registro de regla id/kind/scope/provenance/status/value. La previsualización es la validación autoritativa.']],
            ],
            'required' => ['schemaVersion', 'designId', 'expectedDesignRevision', 'reviewState', 'rules'],
            'additionalProperties' => false,
        ];
    }

    /** @return array<string, mixed> */
    private function composition_schema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'schemaVersion' => ['const' => 2],
                'label' => ['type' => 'string', 'maxLength' => 160],
                'nodes' => ['type' => 'array', 'minItems' => 1, 'maxItems' => 240, 'items' => ['type' => 'object', 'description' => 'Nodo id/kind/ruleIds/cadenceRuleId/children/content. No admite HTML, CSS, JS ni projectData remotos.']],
            ],
            'required' => ['schemaVersion', 'nodes'],
            'additionalProperties' => false,
        ];
    }

    /** @return WP_Error|null */
    private function reject_unexpected_arguments(array $arguments): ?WP_Error
    {
        return $arguments === [] ? null : new WP_Error('cod_mcp_invalid_arguments', 'Esta herramienta no acepta argumentos.');
    }

    /** @param mixed $value @return string|WP_Error */
    private function normalize_page_title($value)
    {
        if (!is_string($value)) {
            return new WP_Error('cod_mcp_invalid_arguments', 'title debe ser texto.');
        }
        $title = sanitize_text_field($value);
        if ($title === '' || (function_exists('mb_strlen') ? mb_strlen($title) : strlen($title)) > 160) {
            return new WP_Error('cod_mcp_invalid_arguments', 'title debe tener entre 1 y 160 caracteres.');
        }
        return $title;
    }

    /** @param array<string, mixed> $arguments @param array<int, string> $allowed */
    private function has_only_keys(array $arguments, array $allowed): bool
    {
        foreach (array_keys($arguments) as $key) {
            if (!is_string($key) || !in_array($key, $allowed, true)) {
                return false;
            }
        }
        return true;
    }

    private function is_document_id(string $value): bool
    {
        return preg_match('/^[a-z0-9][a-z0-9_-]{0,191}$/', $value) === 1;
    }

    /** @param array<mixed> $value */
    private function is_list(array $value): bool
    {
        $index = 0;
        foreach (array_keys($value) as $key) {
            if ($key !== $index) {
                return false;
            }
            ++$index;
        }
        return true;
    }

    /** @return WP_Error */
    private function revision_conflict(int $expected, int $actual): WP_Error
    {
        return new WP_Error(
            'cod_mcp_revision_conflict',
            sprintf('La revisión Canvas cambió: se esperaba %d y actualmente es %d. Vuelve a leer el estado antes de escribir.', $expected, $actual),
            ['expectedRevision' => $expected, 'actualRevision' => $actual]
        );
    }
}
