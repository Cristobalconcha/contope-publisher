<?php

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/class-cod-site-package-sitio.php';

/**
 * Importa un paquete generado por COD_Site_Package_Exporter: recrea (o actualiza, si ya existen)
 * los documentos Canvas, las regiones y las páginas, coloca los medios bajo `wp-content/uploads/`
 * en la misma ruta relativa que tenían en el origen, activa el ADN si el paquete lo trae y
 * reescribe toda referencia a la URL del sitio origen por la URL de este sitio.
 *
 * Lee DOS esquemas de manifiesto y decide por la presencia de `formatVersion`:
 *  - `.ocdsite` v1 (`formatVersion` + `entrypoints`): el lector nuevo de F1b
 *    (COD_Site_Package_Format). `entrypoints.designModel` va al MISMO apply del almacén del ADN
 *    (COD_ADN_Store::aplicar) que usan la pantalla de wp-admin y el MCP: un solo camino.
 *  - el esquema propio anterior (`schemaVersion` + `pages`/`documents`): los paquetes que ya
 *    existen se importan igual que antes.
 *
 * El orden importa y es el que evita dejar el sitio a medias:
 *  1. REVISAR todo sin escribir: manifiesto, hashes, requisitos, bloques que hacen falta,
 *     documentos saneados, la compuerta del diseño, el ADN (previsualización) y las páginas
 *     (H9: cualquier conflicto rechaza el paquete ENTERO, antes de tocar nada).
 *  2. ESCRIBIR: el ADN (atómico por sí mismo), los medios (primero a archivos temporales ya
 *     verificados), los documentos, las asignaciones y las páginas.
 *
 * H9: una página EN BLOQUES jamás se convierte en shortcode `[contope_canvas …]`, y una página en
 * bloques editada en este sitio no se pisa sin pedirlo expresamente.
 *
 * Idempotente por diseño: un documento se localiza por su `documentId` estable (nunca por ID
 * numérico de post) y una página por ese `documentId` o, si no tiene, por su slug; reimportar el
 * mismo paquete actualiza en vez de duplicar.
 */
final class COD_Site_Package_Importer
{
    /** sha256 del `post_content` tal como lo dejó la última importación de un paquete. */
    public const META_PAQUETE_SHA = '_cod_package_content_sha';

    public function __construct(
        private COD_Canvas_Document_Repository $repository,
        private COD_Canvas_Document_Sanitizer $sanitizer,
        private COD_Media_Attachment_Sync $media_sync
    ) {
    }

    /**
     * @param array{replace_edited_blocks?: bool} $options
     *     replace_edited_blocks: permite reemplazar una página en bloques que se editó en ESTE sitio
     *     (por defecto no: el paquete se rechaza entero y nada se escribe).
     * @return array<string, mixed>|WP_Error
     */
    public function import(string $zip_path, array $options = [])
    {
        if (!class_exists('ZipArchive')) {
            return new WP_Error('cod_package_zip_unavailable', 'La extensión ZipArchive de PHP no está disponible.');
        }

        $zip = new ZipArchive();
        if ($zip->open($zip_path) !== true) {
            return new WP_Error('cod_package_zip_open', 'No fue posible abrir el paquete ZIP.');
        }
        try {
            return $this->importar($zip, $options);
        } finally {
            $zip->close();
        }
    }

    /**
     * @param array<string, mixed> $options
     * @return array<string, mixed>|WP_Error
     */
    private function importar(ZipArchive $zip, array $options)
    {
        $inspeccion = COD_Site_Package_Format::inspeccionar_zip($zip);
        if (is_wp_error($inspeccion)) {
            return $inspeccion;
        }

        $manifest_json = $zip->getFromName('manifest.json');
        if ($manifest_json === false) {
            return new WP_Error('cod_package_manifest_missing', 'El paquete no contiene manifest.json.');
        }
        try {
            $manifest = json_decode($manifest_json, true, 128, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            return new WP_Error('cod_package_manifest_invalid', 'manifest.json no es JSON válido.');
        }
        if (!is_array($manifest)) {
            return new WP_Error('cod_package_manifest_shape', 'manifest.json no tiene la forma esperada.');
        }

        $plan = array_key_exists('formatVersion', $manifest)
            ? $this->plan_v1($zip, $manifest)
            : $this->plan_anterior($manifest);
        if (is_wp_error($plan)) {
            return $plan;
        }

        $source_url = untrailingslashit($plan['sourceUrl']);
        $target_url = untrailingslashit(home_url('/'));
        $reemplazar = !empty($options['replace_edited_blocks']);

        // ================== 1. REVISAR (no se escribe nada) ==================
        $bloques = $this->bloques_que_faltan($plan['requiredBlocks']);
        if ($bloques !== []) {
            return new WP_Error('cod_package_blocks_missing', 'Este sitio no tiene registrados los bloques que el paquete necesita: ' . implode(', ', $bloques) . '. Actualiza WordPress o el plugin que los trae y vuelve a importar. No se escribió nada.', ['bloques' => $bloques]);
        }

        $documentos = $this->preparar_documentos($plan['documents'], $source_url, $target_url);
        if (is_wp_error($documentos)) {
            return $documentos;
        }

        $paginas = $this->revisar_paginas($plan['pages'], $source_url, $target_url, $reemplazar);
        if (is_wp_error($paginas)) {
            return $paginas;
        }

        $faltan = $this->revisar_medios($zip, $plan);
        if (is_wp_error($faltan)) {
            return $faltan;
        }

        // El estado del sitio (título, enlaces permanentes, marca, menús, ubicaciones, íconos, hojas, destinos de
        // región): se resuelve contra ESTE sitio y se decide qué haría, antes de escribir. Un valor propio del
        // destino, editado después de la última importación, rechaza el paquete entero salvo el reemplazo expreso.
        $sitio = COD_Site_Package_Sitio::revisar($plan['estado'], $plan['pages'], $documentos, $plan['media'], $source_url, $target_url, $reemplazar);
        if (is_wp_error($sitio)) {
            return $sitio;
        }

        // La compuerta del diseño: un paquete que llega por una petición que no es una persona en el
        // editor (el MCP, una contraseña de aplicación) trae sus documentos y sus páginas por la
        // misma compuerta que cualquier otra escritura. Se revisan TODOS antes de escribir el primero.
        // WP-CLI y la administración con sesión quedan fuera, como dice la espec (límite declarado
        // en el CHANGELOG).
        if (COD_ADN_Gate::activo() && COD_ADN_Gate::peticion_no_humana()) {
            $revision = $this->revisar_con_la_compuerta($plan, $documentos, $paginas);
            if (is_wp_error($revision)) {
                return $revision;
            }
        }

        $previa_adn = null;
        if ($plan['model'] !== null) {
            $previa_adn = COD_ADN_Store::previsualizar($plan['model'], ['emitirPropuestas' => $plan['adnEmitir']]);
            if (!$previa_adn['ok']) {
                $primero = $previa_adn['errores'][0] ?? ['codigo' => 'ADN_INVALID', 'mensaje' => 'El ADN del paquete no se pudo validar.'];
                return new WP_Error((string) $primero['codigo'], 'El ADN del paquete no se puede aplicar: ' . (string) $primero['mensaje'] . ' No se escribió nada.', ['errores' => $previa_adn['errores']]);
            }
            if ($previa_adn['rompe'] !== []) {
                return new WP_Error('ADN_REF_BROKEN', 'El ADN del paquete quita, renombra o degrada variables que este sitio está usando. No se escribió nada.', ['rompe' => $previa_adn['rompe']]);
            }
        }

        // ================== 2. ESCRIBIR ==================
        $resultado_adn = null;
        if ($plan['model'] !== null && $previa_adn !== null) {
            $aplicado = COD_ADN_Store::aplicar($plan['model'], [
                'emitirPropuestas' => $plan['adnEmitir'],
                'previewId' => (string) $previa_adn['previewId'],
                'fuente' => 'upload',
            ]);
            if (is_wp_error($aplicado)) {
                return $aplicado;
            }
            $resultado_adn = [
                'resultado' => (string) $aplicado['resultado'],
                'designId' => (string) $aplicado['designId'],
                'revision' => (int) $aplicado['revision'],
            ];
        }

        $medios = $this->colocar_medios($zip, $plan);
        if (is_wp_error($medios)) {
            return $medios;
        }

        $document_ids = [];
        foreach ($documentos as $document_id => $documento) {
            $saved = $this->import_document((string) $document_id, $documento);
            if (is_wp_error($saved)) {
                return $saved;
            }
            $document_ids[] = (string) $document_id;
        }

        foreach ($plan['assignments'] as $kind => $document_id) {
            if (!is_string($document_id) || $document_id === '') {
                continue;
            }
            $assigned = $this->repository->assign_region_to_template(
                COD_Canvas_Document_Repository::DEFAULT_TEMPLATE_ID,
                (string) $kind,
                $document_id
            );
            if (is_wp_error($assigned)) {
                return $assigned;
            }
        }

        // las navegaciones de bloques que el paquete trae y este sitio no tiene: primero, para que las páginas
        // que las citan reciban su número
        $navegaciones = COD_Site_Package_Sitio::asegurar_navegaciones($sitio);

        $page_ids = [];
        $por_slug = [];
        $avisos_de_enlaces = [];
        foreach ($paginas as $p) {
            if ($p['page']['kind'] === 'blocks') {
                $p['contenido'] = COD_Site_Package_Sitio::contenido_a_destino($p['contenido'], [], $navegaciones, $avisos_de_enlaces);
            }
            $post_id = $p['page']['kind'] === 'blocks'
                ? $this->escribir_pagina_en_bloques($p)
                : $this->import_page($p['page']);
            if (is_wp_error($post_id)) {
                return $post_id;
            }
            $page_ids[] = (int) $post_id;
            $por_slug[(string) $p['page']['slug']] = (int) $post_id;
        }

        // las regiones, ahora que las páginas existen: sus destinos viajan por slug y aquí vuelven a ser números
        foreach ($sitio['reglas'] as $document_id => $reglas) {
            $region_saved = $this->repository->save_region(
                (string) $document_id,
                (string) $documentos[$document_id]['regionKind'],
                (string) $documentos[$document_id]['regionScope'],
                COD_Site_Package_Sitio::reglas_a_destino($reglas['targets'], $por_slug),
                COD_Site_Package_Sitio::reglas_a_destino($reglas['excludes'], $por_slug)
            );
            if (is_wp_error($region_saved)) {
                return $region_saved;
            }
        }

        $portada = $this->aplicar_portada($plan['reading'], $por_slug);
        $aplicado = COD_Site_Package_Sitio::aplicar($sitio, $por_slug, $this->media_sync);

        return [
            'pages' => $page_ids,
            'documents' => $document_ids,
            'mediaCopied' => $medios['copiados'],
            'mediaUnchanged' => $medios['iguales'],
            'mediaMissing' => $medios['faltan'],
            'blockPages' => count(array_filter($paginas, static function (array $p): bool {
                return $p['page']['kind'] === 'blocks';
            })),
            'adn' => $resultado_adn,
            'frontPage' => $portada,
            'avisos' => array_merge($plan['avisos'], $sitio['avisos'], $avisos_de_enlaces, $aplicado['avisos']),
            'sitio' => $aplicado['hechos'],
            'formato' => $plan['dialect'],
        ];
    }

    // ------------------------------------------------------------------
    // Los dos lectores: ambos devuelven el mismo "plan"
    // ------------------------------------------------------------------

    /**
     * @param array<string, mixed> $manifest
     * @return array<string, mixed>|WP_Error
     */
    private function plan_anterior(array $manifest)
    {
        if (!isset($manifest['schemaVersion'], $manifest['pages'], $manifest['documents'])) {
            return new WP_Error('cod_package_manifest_shape', 'manifest.json no tiene la forma esperada.');
        }
        if ((int) $manifest['schemaVersion'] !== COD_Site_Package_Exporter::PACKAGE_SCHEMA_VERSION) {
            return new WP_Error('cod_package_schema_mismatch', 'Versión de paquete no soportada por este plugin.');
        }
        if (!is_array($manifest['pages']) || !is_array($manifest['documents'])) {
            return new WP_Error('cod_package_manifest_shape', 'manifest.json no tiene la forma esperada.');
        }
        $paginas = $this->normalizar_paginas($manifest['pages']);
        if (is_wp_error($paginas)) {
            return $paginas;
        }
        $asignaciones = isset($manifest['defaultTemplateAssignments']) && is_array($manifest['defaultTemplateAssignments']) ? $manifest['defaultTemplateAssignments'] : [];
        return [
            'dialect' => 'anterior',
            'sourceUrl' => (string) ($manifest['sourceSiteUrl'] ?? ''),
            'pages' => $paginas,
            'documents' => $manifest['documents'],
            'assignments' => $asignaciones,
            'media' => [],
            'legacyMedia' => true,
            'requiredBlocks' => [],
            'model' => null,
            'adnEmitir' => false,
            'reading' => null,
            'estado' => null,
            'avisos' => [],
        ];
    }

    /**
     * @param array<string, mixed> $manifest
     * @return array<string, mixed>|WP_Error
     */
    private function plan_v1(ZipArchive $zip, array $manifest)
    {
        $errores = COD_Site_Package_Format::validar_manifiesto($manifest);
        if ($errores !== []) {
            return new WP_Error('cod_package_manifest_invalid', 'El manifiesto no cumple el formato .ocdsite v1: ' . COD_Site_Package_Format::describir_errores($errores) . '.', ['errores' => $errores]);
        }
        $requisitos = $manifest['requirements'];
        $publicador = defined('COD_PUBLISHER_VERSION') ? (string) COD_PUBLISHER_VERSION : '0';
        if (version_compare($publicador, (string) $requisitos['publisher'], '<')) {
            return new WP_Error('cod_package_requirements', 'El paquete pide el plugin ContOpe ' . $requisitos['publisher'] . ' o más nuevo y este sitio tiene el ' . $publicador . '. No se escribió nada.');
        }
        if (version_compare((string) get_bloginfo('version'), (string) $requisitos['wordpress'], '<')) {
            return new WP_Error('cod_package_requirements', 'El paquete pide WordPress ' . $requisitos['wordpress'] . ' o más nuevo y este sitio tiene el ' . get_bloginfo('version') . '. No se escribió nada.');
        }

        $inventario = COD_Site_Package_Format::inventario($manifest);
        $activos = COD_Site_Package_Format::activos($manifest);
        $entrypoints = $manifest['entrypoints'];

        $json = COD_Site_Package_Format::leer_declarado($zip, $inventario, (string) $entrypoints['content']);
        if (is_wp_error($json)) {
            return $json;
        }
        $contenido = COD_Site_Package_Format::decodificar_objeto($json, (string) $entrypoints['content']);
        if (is_wp_error($contenido)) {
            return $contenido;
        }
        if (($contenido['schema'] ?? null) !== COD_Site_Package_Format::CONTENT_SCHEMA || ($contenido['version'] ?? null) !== 1) {
            return new WP_Error('cod_package_content_schema', 'El contenido del paquete (' . $entrypoints['content'] . ') no está en el formato «' . COD_Site_Package_Format::CONTENT_SCHEMA . '» versión 1. Si es un documento de contenido v0 (schemaVersion 0) lo importa la herramienta de ContOpe Design → Importar, no Portabilidad.');
        }
        $paginas_crudas = isset($contenido['pages']) && is_array($contenido['pages']) ? $contenido['pages'] : [];
        $documentos = isset($contenido['documents']) && is_array($contenido['documents']) ? $contenido['documents'] : [];

        // el contenido de cada página en bloques sale de su archivo, verificado contra el inventario
        foreach ($paginas_crudas as $i => $p) {
            if (!is_array($p) || ($p['kind'] ?? 'canvas') !== 'blocks') {
                continue;
            }
            $archivo = is_array($p['content'] ?? null) ? $p['content'] : [];
            $ruta = (string) ($archivo['path'] ?? '');
            if ($ruta === '' || !isset($inventario[$ruta]) || ($archivo['sha256'] ?? '') !== $inventario[$ruta]['sha256']) {
                return new WP_Error('cod_package_page_content', 'La página «' . (string) ($p['slug'] ?? '?') . '» apunta a un contenido que el inventario del paquete no respalda.');
            }
            $texto = COD_Site_Package_Format::leer_declarado($zip, $inventario, $ruta, 33554432);
            if (is_wp_error($texto)) {
                return $texto;
            }
            $paginas_crudas[$i]['postContent'] = $texto;
        }
        $paginas = $this->normalizar_paginas($paginas_crudas);
        if (is_wp_error($paginas)) {
            return $paginas;
        }

        $medios = [];
        foreach (isset($contenido['media']) && is_array($contenido['media']) ? $contenido['media'] : [] as $m) {
            if (!is_array($m) || !is_string($m['path'] ?? null) || !COD_Site_Package_Format::ruta_de_medio_segura($m['path'])) {
                return new WP_Error('cod_package_media_path', 'El paquete lista un medio con una ruta que no es segura: ' . substr(preg_replace('/[^\x20-\x7E]/', '?', (string) ($m['path'] ?? '')) ?? '', 0, 120) . '.');
            }
            $asset = null;
            if (is_string($m['asset'] ?? null) && $m['asset'] !== '') {
                if (!isset($activos[$m['asset']])) {
                    return new WP_Error('cod_package_asset_unresolved', 'El medio «' . $m['path'] . '» cita un activo que el manifiesto no declara.');
                }
                $asset = $activos[$m['asset']];
            }
            $medios[] = ['path' => $m['path'], 'sha256' => is_string($m['sha256'] ?? null) ? $m['sha256'] : null, 'asset' => $asset, 'attach' => ($m['attach'] ?? true) !== false];
        }

        $model = null;
        $emitir = false;
        $estado = [];
        if (isset($entrypoints['wordpressState'])) {
            $json_estado = COD_Site_Package_Format::leer_declarado($zip, $inventario, (string) $entrypoints['wordpressState']);
            if (is_wp_error($json_estado)) {
                return $json_estado;
            }
            $estado = COD_Site_Package_Format::decodificar_objeto($json_estado, (string) $entrypoints['wordpressState']);
            if (is_wp_error($estado)) {
                return $estado;
            }
            if (($estado['schema'] ?? null) !== COD_Site_Package_Format::STATE_SCHEMA) {
                return new WP_Error('cod_package_state_schema', 'El estado de WordPress del paquete no está en el formato «' . COD_Site_Package_Format::STATE_SCHEMA . '».');
            }
            $emitir = is_array($estado['adn'] ?? null) && !empty($estado['adn']['emitirPropuestas']);
        }
        if (isset($entrypoints['designModel'])) {
            $model = COD_Site_Package_Format::leer_declarado($zip, $inventario, (string) $entrypoints['designModel']);
            if (is_wp_error($model)) {
                return $model;
            }
        }

        return [
            'dialect' => 'v1',
            'sourceUrl' => (string) ($contenido['sourceSiteUrl'] ?? ($manifest['origin']['siteUrl'] ?? '')),
            'pages' => $paginas,
            'documents' => $documentos,
            'assignments' => isset($contenido['defaultTemplateAssignments']) && is_array($contenido['defaultTemplateAssignments']) ? $contenido['defaultTemplateAssignments'] : [],
            'media' => $medios,
            'legacyMedia' => false,
            'requiredBlocks' => array_values(array_map('strval', $manifest['capabilities']['requiredBlocks'])),
            'model' => $model,
            'adnEmitir' => $emitir,
            'reading' => isset($estado['reading']) && is_array($estado['reading']) ? $estado['reading'] : null,
            'estado' => isset($entrypoints['wordpressState']) && is_array($estado) ? $estado : null,
            'avisos' => isset($contenido['avisos']) && is_array($contenido['avisos']) ? array_values(array_map('strval', $contenido['avisos'])) : [],
        ];
    }

    /**
     * @param array<mixed> $crudas
     * @return array<int, array<string, mixed>>|WP_Error
     */
    private function normalizar_paginas(array $crudas)
    {
        $paginas = [];
        foreach ($crudas as $page) {
            if (!is_array($page) || !isset($page['title'], $page['slug'])) {
                return new WP_Error('cod_package_page_shape', 'Una entrada de página no tiene la forma esperada.');
            }
            $kind = ($page['kind'] ?? 'canvas') === 'blocks' ? 'blocks' : 'canvas';
            $estado = sanitize_key((string) ($page['status'] ?? 'draft'));
            $normal = [
                'kind' => $kind,
                'title' => (string) $page['title'],
                'slug' => (string) $page['slug'],
                'status' => in_array($estado, ['publish', 'draft', 'pending', 'private'], true) ? $estado : 'draft',
                'documentId' => sanitize_key((string) ($page['documentId'] ?? '')),
                'postContent' => '',
                'template' => '',
                'menuOrder' => 0,
            ];
            if ($kind === 'canvas') {
                if ($normal['documentId'] === '') {
                    return new WP_Error('cod_package_page_shape', 'Una entrada de página no tiene la forma esperada.');
                }
            } else {
                if (!is_string($page['postContent'] ?? null) || !COD_Site_Package_Format::es_contenido_en_bloques($page['postContent'])) {
                    return new WP_Error('cod_package_page_not_blocks', 'La página «' . $normal['slug'] . '» se declara en bloques pero su contenido no son bloques de WordPress (o es un shortcode del lienzo). No se importa.');
                }
                $normal['postContent'] = $page['postContent'];
                $normal['template'] = is_string($page['template'] ?? null) ? sanitize_text_field($page['template']) : '';
                $normal['menuOrder'] = (int) ($page['menuOrder'] ?? 0);
            }
            $paginas[] = $normal;
        }
        return $paginas;
    }

    // ------------------------------------------------------------------
    // Revisión (no escribe nada)
    // ------------------------------------------------------------------

    /**
     * @param array<int, string> $requeridos
     * @return array<int, string>
     */
    private function bloques_que_faltan(array $requeridos): array
    {
        $registro = WP_Block_Type_Registry::get_instance();
        return array_values(array_filter($requeridos, static function (string $nombre) use ($registro): bool {
            return !$registro->is_registered($nombre);
        }));
    }

    /**
     * Sanea los documentos ANTES de escribir: si uno no pasa, el paquete se rechaza sin haber
     * tocado nada.
     *
     * @param array<mixed> $documentos
     * @return array<string, array<string, mixed>>|WP_Error
     */
    private function preparar_documentos(array $documentos, string $source_url, string $target_url)
    {
        $listos = [];
        foreach ($documentos as $document_id => $document) {
            if (!is_array($document)) {
                return new WP_Error('cod_package_document_shape', "El documento $document_id no es un objeto.");
            }
            $html = $this->rewrite_urls((string) ($document['html'] ?? ''), $source_url, $target_url);
            $css = $this->rewrite_urls((string) ($document['css'] ?? ''), $source_url, $target_url);
            $project_data = $this->rewrite_urls((string) ($document['projectData'] ?? '{}'), $source_url, $target_url);

            $clean_html = $this->sanitizer->sanitize_html($html);
            if (is_wp_error($clean_html)) {
                return $clean_html;
            }
            $clean_css = $this->sanitizer->sanitize_css($css);
            if (is_wp_error($clean_css)) {
                return $clean_css;
            }
            // projectData sólo reabastece el editor visual; html/css (ya saneados arriba) son lo
            // único que determina lo que ve un visitante. Si projectData viene corrupto en el
            // origen, no vale la pena bloquear la importación completa por eso — se reemplaza por
            // un documento vacío y ese documento en particular simplemente queda sin poder
            // reabrirse en el editor, igual que ya estaba en el origen.
            $clean_project = $this->sanitizer->sanitize_project_data($project_data);
            if (is_wp_error($clean_project)) {
                $clean_project = '{}';
            }
            // La composición (el recibo de cómo se armó: de ahí sale a qué diseño pertenece el documento y, con él, su
            // hoja generada) sólo se conserva si el saneado no cambió el documento: si lo cambió, ya no lo describe.
            $composicion = $this->rewrite_urls((string) ($document['composition'] ?? ''), $source_url, $target_url);
            $listos[(string) $document_id] = [
                'html' => $clean_html,
                'css' => $clean_css,
                'composition' => $clean_html === $html && $clean_css === $css ? $composicion : '',
                'projectData' => $clean_project,
                'title' => trim((string) ($document['title'] ?? '')),
                'regionKind' => (string) ($document['regionKind'] ?? ''),
                'regionScope' => (string) ($document['regionScope'] ?? ''),
                'regionTargets' => is_array($document['regionTargets'] ?? null) ? $document['regionTargets'] : [],
                'regionExcludes' => is_array($document['regionExcludes'] ?? null) ? $document['regionExcludes'] : [],
                // lo que la compuerta compara: el documento tal como llegaría, antes del saneado
                'original' => ['html' => $html, 'css' => $css, 'projectData' => $project_data],
            ];
        }
        return $listos;
    }

    /**
     * Decide, para cada página, qué haría el import y detecta los conflictos de H9. Si hay uno, el
     * paquete entero se rechaza y no se escribe NADA.
     *
     * @param array<int, array<string, mixed>> $paginas
     * @return array<int, array{page: array<string, mixed>, accion: string, destino: ?int, contenido: string, previo: string}>|WP_Error
     */
    private function revisar_paginas(array $paginas, string $source_url, string $target_url, bool $reemplazar)
    {
        $plan = [];
        $conflictos = [];
        foreach ($paginas as $page) {
            $destino = $this->buscar_destino($page);
            $previo = $destino === null ? '' : (string) get_post_field('post_content', $destino, 'raw');

            if ($page['kind'] === 'canvas') {
                // Nunca el shortcode sobre una página que ya es de bloques (H9).
                if ($destino !== null && COD_Site_Package_Format::es_contenido_en_bloques($previo)) {
                    $conflictos[] = ['code' => 'cod_package_would_revert_block_page', 'slug' => $page['slug'], 'pageId' => $destino, 'reason' => 'la página ya está en bloques en este sitio y el paquete la trae como página del lienzo: escribirla dejaría el shortcode [contope_canvas …] donde hoy hay bloques'];
                    continue;
                }
                $plan[] = ['page' => $page, 'accion' => $destino === null ? 'crear' : 'actualizar', 'destino' => $destino, 'contenido' => '', 'previo' => $previo];
                continue;
            }

            $nuevo = $this->rewrite_urls((string) $page['postContent'], $source_url, $target_url);
            // los bloques de navegación citan su navegación por slug: las que este sitio ya tiene vuelven a ser
            // su número (las que aún no existen se resuelven al escribir)
            $sin_avisos = [];
            $nuevo = COD_Site_Package_Sitio::contenido_a_destino($nuevo, [], COD_Site_Package_Sitio::navegaciones_id_por_slug(), $sin_avisos, true);
            if ($destino === null) {
                $plan[] = ['page' => $page, 'accion' => 'crear', 'destino' => null, 'contenido' => $nuevo, 'previo' => ''];
                continue;
            }
            if (hash_equals(hash('sha256', $previo), hash('sha256', $nuevo))) {
                $plan[] = ['page' => $page, 'accion' => 'igual', 'destino' => $destino, 'contenido' => $nuevo, 'previo' => $previo];
                continue;
            }
            // Qué hay hoy en el destino: nada, un shortcode del lienzo (la migración a bloques que
            // se quiere), bloques que nadie tocó desde la última importación, o ediciones.
            $registrado = (string) get_post_meta($destino, self::META_PAQUETE_SHA, true);
            if (trim($previo) === '' || COD_Site_Package_Format::es_atajo_canvas($previo)) {
                $plan[] = ['page' => $page, 'accion' => 'migrar', 'destino' => $destino, 'contenido' => $nuevo, 'previo' => $previo];
            } elseif ($registrado !== '' && hash_equals($registrado, hash('sha256', $previo))) {
                $plan[] = ['page' => $page, 'accion' => 'actualizar', 'destino' => $destino, 'contenido' => $nuevo, 'previo' => $previo];
            } elseif ($reemplazar) {
                $plan[] = ['page' => $page, 'accion' => 'reemplazar', 'destino' => $destino, 'contenido' => $nuevo, 'previo' => $previo];
            } else {
                $conflictos[] = ['code' => 'cod_package_block_page_edited', 'slug' => $page['slug'], 'pageId' => $destino, 'reason' => 'la página ya está en bloques en este sitio con ediciones que el paquete no trae'];
            }
        }

        if ($conflictos !== []) {
            $codigos = array_values(array_unique(array_column($conflictos, 'code')));
            $lista = [];
            foreach ($conflictos as $c) {
                $lista[] = '«' . $c['slug'] . '» (página ' . $c['pageId'] . '): ' . $c['reason'];
            }
            return new WP_Error(
                count($codigos) === 1 ? $codigos[0] : 'cod_package_page_conflict',
                'El paquete se rechazó y no se escribió nada: ' . implode('; ', $lista) . '. Una página en bloques no se sobrescribe con el shortcode ni con un contenido que pisa ediciones hechas aquí. Si el paquete debe reemplazarlas, importa de nuevo marcando «reemplazar las páginas en bloques editadas en este sitio».',
                ['conflictos' => $conflictos]
            );
        }
        return $plan;
    }

    /**
     * La página de este sitio a la que corresponde la del paquete: por el `documentId` estable si lo
     * tiene y, si no, por el slug. Nunca por número.
     *
     * @param array<string, mixed> $page
     */
    private function buscar_destino(array $page): ?int
    {
        $document_id = (string) ($page['documentId'] ?? '');
        if ($document_id !== '') {
            $existing = get_posts([
                'post_type' => 'page',
                'post_status' => 'any',
                'numberposts' => 1,
                'orderby' => 'ID',
                'order' => 'ASC',
                'fields' => 'ids',
                'no_found_rows' => true,
                'meta_query' => [
                    [
                        'key' => '_cod_canvas_document_id',
                        'value' => $document_id,
                        'compare' => '=',
                    ],
                ],
            ]);
            if ($existing !== []) {
                return (int) $existing[0];
            }
        }
        if ($page['kind'] === 'blocks') {
            $slug = sanitize_title((string) $page['slug']);
            if ($slug !== '') {
                $por_slug = get_posts([
                    'post_type' => 'page',
                    'post_status' => 'any',
                    'name' => $slug,
                    'numberposts' => 1,
                    'orderby' => 'ID',
                    'order' => 'ASC',
                    'fields' => 'ids',
                    'no_found_rows' => true,
                ]);
                if ($por_slug !== []) {
                    return (int) $por_slug[0];
                }
            }
        }
        return null;
    }

    /**
     * Antes de escribir: ¿están en el paquete los archivos de medios que dice llevar, y cuáles de los
     * que no lleva faltan en este sitio?
     *
     * @param array<string, mixed> $plan
     * @return true|WP_Error
     */
    private function revisar_medios(ZipArchive $zip, array $plan)
    {
        $upload_dir = wp_get_upload_dir();
        if (!empty($upload_dir['error'])) {
            return new WP_Error('cod_package_upload_dir', (string) $upload_dir['error']);
        }
        if (!empty($plan['legacyMedia'])) {
            // esquema anterior: todo lo que viene bajo media/ se copia, así que se revisa ANTES de escribir
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $nombre = (string) $zip->getNameIndex($i);
                if (strpos($nombre, 'media/') === 0 && substr($nombre, -1) !== '/' && !COD_Site_Package_Format::ruta_de_medio_segura(substr($nombre, strlen('media/')))) {
                    return new WP_Error('cod_package_media_path', 'El paquete trae un medio con una ruta o un tipo de archivo que no se importa: ' . substr(preg_replace('/[^ -~]/', '?', $nombre) ?? '', 0, 120) . '. No se escribió nada.');
                }
            }
        }
        foreach ($plan['media'] as $m) {
            if ($m['asset'] !== null && $zip->locateName($m['asset']['path']) === false) {
                return new WP_Error('cod_package_media_missing', 'El manifiesto declara el medio «' . $m['path'] . '» pero su archivo no está en el paquete. No se escribió nada.');
            }
        }
        return true;
    }

    /**
     * @param array<string, mixed> $plan
     * @param array<string, array<string, mixed>> $documentos
     * @param array<int, array<string, mixed>> $paginas
     * @return true|WP_Error
     */
    private function revisar_con_la_compuerta(array $plan, array $documentos, array $paginas)
    {
        foreach ($documentos as $document_id => $documento) {
            $despues = $documento['original'];
            $guardado = $this->repository->load_existing((string) $document_id);
            $antes = is_array($guardado)
                ? ['html' => (string) ($guardado['html'] ?? ''), 'css' => (string) ($guardado['css'] ?? ''), 'projectData' => (string) ($guardado['projectData'] ?? '')]
                : ['html' => '', 'css' => '', 'projectData' => ''];
            $resuelto = COD_ADN_Gate::resolver(COD_ADN_Gate::revisar_documento($antes, $despues, 'importador de paquetes (documento ' . $document_id . ')'));
            if (is_wp_error($resuelto)) {
                return $resuelto;
            }
        }
        foreach ($paginas as $p) {
            if ($p['page']['kind'] !== 'blocks' || $p['accion'] === 'igual') {
                continue;
            }
            $informe = COD_ADN_Gate::revisar_contenido((string) $p['previo'], (string) $p['contenido'], 'importador de paquetes (página ' . $p['page']['slug'] . ')');
            $resuelto = COD_ADN_Gate::resolver($informe);
            if (is_wp_error($resuelto)) {
                return $resuelto;
            }
        }
        return true;
    }

    // ------------------------------------------------------------------
    // Escritura
    // ------------------------------------------------------------------

    /**
     * @param array<string, mixed> $documento ya saneado por preparar_documentos()
     * @return true|WP_Error
     */
    private function import_document(string $document_id, array $documento)
    {
        $saved = $this->repository->save($document_id, (string) $documento['projectData'], (string) $documento['html'], (string) $documento['css']);
        if (is_wp_error($saved)) {
            return $saved;
        }

        // El título (post_title) es propio de cada instalación — antes de esto no viajaba en el
        // paquete, así que un documento creado sin nombre (o con el nombre por defecto feo) quedaba
        // así para siempre en el destino aunque se renombrara en el origen.
        $title = (string) $documento['title'];
        if ($title !== '' && isset($saved['postId'])) {
            wp_update_post(['ID' => (int) $saved['postId'], 'post_title' => sanitize_text_field($title)]);
        }

        // La composición viaja con el documento (save() la vacía): sin ella el destino no sabe de qué diseño
        // es el documento y sirve su CSS en línea en vez de la hoja generada.
        if ((string) $documento['composition'] !== '' && isset($saved['postId'])) {
            $decodificada = json_decode((string) $documento['composition'], true);
            if (is_array($decodificada) && isset($decodificada['composition'], $decodificada['design'])) {
                update_post_meta((int) $saved['postId'], COD_Canvas_Document_Repository::META_COMPOSITION, wp_slash((string) $documento['composition']));
            }
        }

        // (La región —tipo, alcance y destinos— se escribe después de las páginas: sus destinos viajan por slug.)
        return true;
    }

    /**
     * Página del lienzo: el contenido real vive en el documento; el post sólo necesita el shortcode
     * que COD_Canvas_Page_Publisher::publish() también usa — WordPress lo expande a la marca real
     * (incluidas las regiones de header/footer) al momento de renderizar. Se fija siempre, no sólo
     * al crear, por si una página existente quedó con otro contenido. (Que la página de destino no
     * esté ya en bloques se revisó antes de escribir: H9.)
     *
     * @param array<string, mixed> $page
     * @return int|WP_Error post ID de la página creada o actualizada.
     */
    private function import_page(array $page)
    {
        $document_id = (string) $page['documentId'];
        $existing = $this->buscar_destino($page);

        $post_arr = [
            'post_type' => 'page',
            'post_status' => (string) $page['status'],
            'post_title' => sanitize_text_field((string) $page['title']),
            'post_name' => sanitize_title((string) $page['slug']),
            'post_content' => sprintf('[contope_canvas document_id="%s"]', esc_attr($document_id)),
            'meta_input' => [
                '_cod_canvas_document_id' => $document_id,
            ],
        ];

        if ($existing !== null) {
            $post_arr['ID'] = $existing;
            return wp_update_post($post_arr, true);
        }
        return wp_insert_post($post_arr, true);
    }

    /**
     * Página en bloques: `post_content` TAL CUAL (con las URL del origen ya cambiadas por las de
     * este sitio), verificado después de escribir. Nunca un shortcode.
     *
     * @param array{page: array<string, mixed>, accion: string, destino: ?int, contenido: string, previo: string} $p
     * @return int|WP_Error
     */
    private function escribir_pagina_en_bloques(array $p)
    {
        $page = $p['page'];
        $contenido = $p['contenido'];
        $destino = $p['destino'];

        if ($p['accion'] === 'igual' && $destino !== null) {
            $this->marcar_pagina_en_bloques($destino, $page, $contenido, false);
            return $destino;
        }

        $post_arr = [
            'post_type' => 'page',
            'post_status' => (string) $page['status'],
            'post_title' => sanitize_text_field((string) $page['title']),
            'post_name' => sanitize_title((string) $page['slug']),
            'menu_order' => (int) $page['menuOrder'],
        ];

        // kses desfiguraría el contenido (quita lo que parece una etiqueta peligrosa): sólo se apaga
        // cuando quien escribe ya es de confianza (una persona con unfiltered_html, o WP-CLI sin
        // usuario). Con otro usuario se deja encendido y la verificación de abajo lo dirá.
        $kses = function_exists('kses_remove_filters') && has_filter('content_save_pre', 'wp_filter_post_kses') && (!is_user_logged_in() || current_user_can('unfiltered_html'));
        if ($kses) {
            kses_remove_filters();
        }
        try {
            $post_arr['post_content'] = wp_slash($contenido);
            if ($destino !== null) {
                $post_arr['ID'] = $destino;
                $id = wp_update_post($post_arr, true);
            } else {
                $id = wp_insert_post($post_arr, true);
            }
        } finally {
            if ($kses) {
                kses_init_filters();
            }
        }
        if (is_wp_error($id)) {
            return $id;
        }
        $id = (int) $id;

        $guardado = (string) get_post_field('post_content', $id, 'raw');
        if (!hash_equals(hash('sha256', $contenido), hash('sha256', $guardado))) {
            // WordPress alteró lo que se le entregó: no se deja una página distinta de la del origen.
            if ($destino === null) {
                wp_delete_post($id, true);
            } else {
                $this->restaurar_contenido($id, $p['previo']);
            }
            return new WP_Error('cod_package_content_altered', 'WordPress cambió el contenido de la página «' . $page['slug'] . '» al guardarla (un filtro de contenido del sitio o los permisos del usuario). Se dejó como estaba.');
        }

        $this->marcar_pagina_en_bloques($id, $page, $contenido, true);
        return $id;
    }

    private function restaurar_contenido(int $id, string $previo): void
    {
        $kses = function_exists('kses_remove_filters') && has_filter('content_save_pre', 'wp_filter_post_kses');
        if ($kses) {
            kses_remove_filters();
        }
        try {
            wp_update_post(['ID' => $id, 'post_content' => wp_slash($previo)]);
        } finally {
            if ($kses) {
                kses_init_filters();
            }
        }
    }

    /** @param array<string, mixed> $page */
    private function marcar_pagina_en_bloques(int $id, array $page, string $contenido, bool $cambio): void
    {
        if ((string) $page['documentId'] !== '') {
            update_post_meta($id, '_cod_canvas_document_id', (string) $page['documentId']);
        }
        if ((string) $page['template'] !== '') {
            update_post_meta($id, '_wp_page_template', (string) $page['template']);
        }
        update_post_meta($id, self::META_PAQUETE_SHA, hash('sha256', $contenido));
        if ($cambio) {
            // la revisión de contenido es lo que comparan quienes escriben con expectedRevision:
            // si el contenido cambió, quien leyó antes tiene que enterarse.
            update_post_meta($id, COD_Block_Page_Writer::META_REVISION, (int) get_post_meta($id, COD_Block_Page_Writer::META_REVISION, true) + 1);
        }
    }

    /**
     * La portada del sitio. Sólo se aplica si este sitio todavía no eligió una página de portada
     * (un destino con su propia portada no se toca por llegar un paquete).
     *
     * @param array<string, mixed>|null $lectura
     * @param array<string, int> $por_slug
     * @return array<string, mixed>
     */
    private function aplicar_portada(?array $lectura, array $por_slug): array
    {
        if ($lectura === null || ($lectura['showOnFront'] ?? 'posts') !== 'page') {
            return ['aplicada' => false, 'motivo' => 'el paquete no define una página de portada'];
        }
        $frente = is_string($lectura['pageOnFront'] ?? null) ? $lectura['pageOnFront'] : '';
        if ($frente === '' || !isset($por_slug[$frente])) {
            return ['aplicada' => false, 'motivo' => 'la página de portada del paquete no está entre las páginas importadas'];
        }
        if (get_option('show_on_front') === 'page' && (int) get_option('page_on_front') > 0) {
            return ['aplicada' => false, 'motivo' => 'este sitio ya tiene una página de portada elegida; se conserva'];
        }
        update_option('show_on_front', 'page');
        update_option('page_on_front', $por_slug[$frente]);
        $entradas = is_string($lectura['pageForPosts'] ?? null) ? $lectura['pageForPosts'] : '';
        if ($entradas !== '' && isset($por_slug[$entradas]) && (int) get_option('page_for_posts') === 0) {
            update_option('page_for_posts', $por_slug[$entradas]);
        }
        return ['aplicada' => true, 'pageId' => $por_slug[$frente]];
    }

    private function rewrite_urls(string $text, string $source_url, string $target_url): string
    {
        if ($source_url === '' || $source_url === $target_url) {
            return $text;
        }
        // La misma URL también aparece con las barras escapadas dentro de un JSON.
        return str_replace(
            [$source_url, str_replace('/', '\\/', $source_url)],
            [$target_url, str_replace('/', '\\/', $target_url)],
            $text
        );
    }

    // ------------------------------------------------------------------
    // Medios
    // ------------------------------------------------------------------

    /**
     * @param array<string, mixed> $plan
     * @return array{copiados: int, iguales: int, faltan: array<int, string>}|WP_Error
     */
    private function colocar_medios(ZipArchive $zip, array $plan)
    {
        $upload_dir = wp_get_upload_dir();
        if (!empty($upload_dir['error'])) {
            return new WP_Error('cod_package_upload_dir', (string) $upload_dir['error']);
        }
        if (!empty($plan['legacyMedia'])) {
            $copiados = $this->copy_media_anterior($zip);
            return is_wp_error($copiados) ? $copiados : ['copiados' => $copiados, 'iguales' => 0, 'faltan' => []];
        }

        $base_path = untrailingslashit((string) $upload_dir['basedir']);
        // 1) todo a archivos temporales YA verificados; 2) recién ahí se mueven a su lugar.
        $puestos = [];
        $iguales = 0;
        $faltan = [];
        $errores = null;
        foreach ($plan['media'] as $m) {
            $destino = $base_path . '/' . $m['path'];
            if ($m['asset'] === null) {
                // paquete "solo estructura": no trae el archivo; se anota si este sitio no lo tiene
                if (!is_file($destino)) {
                    $faltan[] = $m['path'];
                }
                continue;
            }
            if (is_file($destino) && hash_equals($m['asset']['sha256'], (string) hash_file('sha256', $destino))) {
                $iguales++;
                $puestos[] = ['final' => $destino, 'temporal' => null, 'attach' => $m['attach']];
                continue;
            }
            $temporal = $this->preparar_medio($zip, $m['asset'], $destino);
            if (is_wp_error($temporal)) {
                $errores = $temporal;
                break;
            }
            $puestos[] = ['final' => $destino, 'temporal' => $temporal, 'attach' => $m['attach']];
        }
        if ($errores !== null) {
            foreach ($puestos as $p) {
                if ($p['temporal'] !== null) {
                    @unlink($p['temporal']);
                }
            }
            return $errores;
        }

        $copiados = 0;
        foreach ($puestos as $p) {
            if ($p['temporal'] !== null) {
                if (!@rename($p['temporal'], $p['final'])) {
                    // Windows no mueve encima de un archivo existente
                    @unlink($p['final']);
                    if (!@rename($p['temporal'], $p['final'])) {
                        // no se dejan archivos a medias: los temporales que aún no se movieron se borran
                        foreach ($puestos as $resto) {
                            if ($resto['temporal'] !== null && is_file($resto['temporal'])) {
                                @unlink($resto['temporal']);
                            }
                        }
                        return new WP_Error('cod_package_media_write', 'No fue posible escribir ' . basename($p['final']) . '.');
                    }
                }
                $copiados++;
            }
            if (!$p['attach']) {
                continue; // íconos del set y hojas generadas: archivos de uploads, no adjuntos de la Biblioteca
            }
            $sync_result = $this->media_sync->sync_file($p['final']);
            if (is_wp_error($sync_result)) {
                return new WP_Error('cod_package_media_attach', sprintf('No fue posible registrar el adjunto para %s: %s', basename($p['final']), $sync_result->get_error_message()));
            }
        }
        return ['copiados' => $copiados, 'iguales' => $iguales, 'faltan' => $faltan];
    }

    /**
     * Copia un activo del ZIP a un archivo temporal junto a su destino, calculando el sha256 en el
     * camino, y lo compara con el del manifiesto. No toca el destino.
     *
     * @param array{id: string, path: string, mime: string, size: int, sha256: string} $asset
     * @return string|WP_Error ruta del temporal
     */
    private function preparar_medio(ZipArchive $zip, array $asset, string $destino)
    {
        $carpeta = dirname($destino);
        if (!is_dir($carpeta) && !wp_mkdir_p($carpeta)) {
            return new WP_Error('cod_package_media_dir', 'No fue posible crear la carpeta para ' . basename($destino) . '.');
        }
        $stream = $zip->getStream($asset['path']);
        if ($stream === false) {
            return new WP_Error('cod_package_media_read', 'No fue posible leer ' . basename($destino) . ' del paquete.');
        }
        $temporal = $destino . '.cod-part';
        $out = fopen($temporal, 'wb');
        if ($out === false) {
            fclose($stream);
            return new WP_Error('cod_package_media_write', 'No fue posible escribir ' . basename($destino) . '.');
        }
        $hash = hash_init('sha256');
        $bytes = 0;
        while (!feof($stream)) {
            $trozo = fread($stream, 1048576);
            if ($trozo === false) {
                break;
            }
            $bytes += strlen($trozo);
            hash_update($hash, $trozo);
            fwrite($out, $trozo);
        }
        fclose($stream);
        fclose($out);
        if ($bytes !== $asset['size'] || !hash_equals($asset['sha256'], hash_final($hash))) {
            @unlink($temporal);
            return new WP_Error('cod_package_media_hash', 'El medio «' . basename($destino) . '» no coincide con su sha256 del manifiesto: el paquete está alterado o dañado. No se escribió nada.');
        }
        return $temporal;
    }

    /**
     * El copiado del esquema anterior (`media/<ruta>`, sin hashes), igual que antes.
     *
     * @return int|WP_Error cantidad de archivos copiados.
     */
    private function copy_media_anterior(ZipArchive $zip)
    {
        $upload_dir = wp_get_upload_dir();
        $base_path = $upload_dir['basedir'];

        $copied = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if ($name === false || !str_starts_with($name, 'media/') || str_ends_with($name, '/')) {
                continue;
            }
            $relative = substr($name, strlen('media/'));
            if (!COD_Site_Package_Format::ruta_de_medio_segura($relative)) {
                return new WP_Error('cod_package_media_path', 'El paquete trae un medio con una ruta o un tipo de archivo que no se importa: ' . substr(preg_replace('/[^ -~]/', '?', $relative) ?? '', 0, 120) . '.');
            }
            $target_path = $base_path . '/' . ltrim($relative, '/');

            $target_dir = dirname($target_path);
            if (!is_dir($target_dir) && !wp_mkdir_p($target_dir)) {
                return new WP_Error('cod_package_media_dir', "No fue posible crear el directorio para $relative.");
            }

            $stream = $zip->getStream($name);
            if ($stream === false) {
                return new WP_Error('cod_package_media_read', "No fue posible leer $relative del paquete.");
            }
            $out = fopen($target_path, 'wb');
            if ($out === false) {
                fclose($stream);
                return new WP_Error('cod_package_media_write', "No fue posible escribir $relative.");
            }
            stream_copy_to_stream($stream, $out);
            fclose($stream);
            fclose($out);

            $sync_result = $this->media_sync->sync_file($target_path);
            if (is_wp_error($sync_result)) {
                return new WP_Error('cod_package_media_attach', sprintf('No fue posible registrar el adjunto para %s: %s', $relative, $sync_result->get_error_message()));
            }

            $copied++;
        }

        return $copied;
    }
}
