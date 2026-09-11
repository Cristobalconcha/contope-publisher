<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Importa un paquete generado por COD_Site_Package_Exporter: recrea (o
 * actualiza, si ya existen) los documentos Canvas y las páginas que
 * respaldan, coloca los archivos de medios bajo `wp-content/uploads/` en la
 * misma ruta relativa que tenían en el origen, y reescribe toda referencia
 * a la URL del sitio origen por la URL de este sitio.
 *
 * Idempotente por diseño: un documento se localiza por su `documentId`
 * estable (nunca por ID numérico de post) y una página por el
 * `documentId` que la respalda, así que reimportar el mismo paquete
 * actualiza en vez de duplicar.
 */
final class COD_Site_Package_Importer
{
    public function __construct(
        private COD_Canvas_Document_Repository $repository,
        private COD_Canvas_Document_Sanitizer $sanitizer,
        private COD_Media_Attachment_Sync $media_sync
    ) {
    }

    /**
     * @return array{pages: array<int, int>, documents: array<int, string>, mediaCopied: int}|WP_Error
     */
    public function import(string $zip_path)
    {
        if (!class_exists('ZipArchive')) {
            return new WP_Error('cod_package_zip_unavailable', 'La extensión ZipArchive de PHP no está disponible.');
        }

        $zip = new ZipArchive();
        if ($zip->open($zip_path) !== true) {
            return new WP_Error('cod_package_zip_open', 'No fue posible abrir el paquete ZIP.');
        }

        $manifest_json = $zip->getFromName('manifest.json');
        if ($manifest_json === false) {
            $zip->close();
            return new WP_Error('cod_package_manifest_missing', 'El paquete no contiene manifest.json.');
        }

        try {
            $manifest = json_decode($manifest_json, true, 128, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            $zip->close();
            return new WP_Error('cod_package_manifest_invalid', 'manifest.json no es JSON válido.');
        }
        if (!is_array($manifest) || !isset($manifest['schemaVersion'], $manifest['pages'], $manifest['documents'])) {
            $zip->close();
            return new WP_Error('cod_package_manifest_shape', 'manifest.json no tiene la forma esperada.');
        }
        if ((int) $manifest['schemaVersion'] !== COD_Site_Package_Exporter::PACKAGE_SCHEMA_VERSION) {
            $zip->close();
            return new WP_Error('cod_package_schema_mismatch', 'Versión de paquete no soportada por este plugin.');
        }

        $source_url = untrailingslashit((string) ($manifest['sourceSiteUrl'] ?? ''));
        $target_url = untrailingslashit(home_url('/'));

        $media_copied = $this->copy_media($zip);
        $zip->close();
        if (is_wp_error($media_copied)) {
            return $media_copied;
        }

        $document_ids = [];
        foreach ($manifest['documents'] as $document_id => $document) {
            $saved = $this->import_document(
                (string) $document_id,
                $document,
                $source_url,
                $target_url
            );
            if (is_wp_error($saved)) {
                return $saved;
            }
            $document_ids[] = (string) $document_id;
        }

        $assignments = $manifest['defaultTemplateAssignments'] ?? [];
        if (is_array($assignments)) {
            foreach ($assignments as $kind => $document_id) {
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
        }

        $page_ids = [];
        foreach ($manifest['pages'] as $page) {
            $post_id = $this->import_page($page);
            if (is_wp_error($post_id)) {
                return $post_id;
            }
            $page_ids[] = $post_id;
        }

        return [
            'pages' => $page_ids,
            'documents' => $document_ids,
            'mediaCopied' => $media_copied,
        ];
    }

    /**
     * @param mixed $document
     * @return true|WP_Error
     */
    private function import_document(string $document_id, $document, string $source_url, string $target_url)
    {
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
        // projectData sólo reabastece el editor visual; html/css (ya
        // saneados arriba) son lo único que determina lo que ve un
        // visitante. Si projectData viene corrupto en el origen, no vale la
        // pena bloquear la importación completa por eso — se reemplaza por
        // un documento vacío y ese documento en particular simplemente
        // queda sin poder reabrirse en el editor, igual que ya estaba en el
        // origen.
        $clean_project = $this->sanitizer->sanitize_project_data($project_data);
        if (is_wp_error($clean_project)) {
            $clean_project = '{}';
        }

        $saved = $this->repository->save($document_id, $clean_project, $clean_html, $clean_css);
        if (is_wp_error($saved)) {
            return $saved;
        }

        // El título (post_title) es propio de cada instalación — antes de
        // esto no viajaba en el paquete, así que un documento creado sin
        // nombre (o con el nombre por defecto feo) quedaba así para
        // siempre en el destino aunque se renombrara en el origen.
        $title = trim((string) ($document['title'] ?? ''));
        if ($title !== '' && isset($saved['postId'])) {
            wp_update_post(['ID' => (int) $saved['postId'], 'post_title' => sanitize_text_field($title)]);
        }

        $region_kind = (string) ($document['regionKind'] ?? '');
        if ($region_kind !== '') {
            $region_saved = $this->repository->save_region(
                $document_id,
                $region_kind,
                (string) ($document['regionScope'] ?? ''),
                is_array($document['regionTargets'] ?? null) ? $document['regionTargets'] : [],
                is_array($document['regionExcludes'] ?? null) ? $document['regionExcludes'] : []
            );
            if (is_wp_error($region_saved)) {
                return $region_saved;
            }
        }

        return true;
    }

    /**
     * @param mixed $page
     * @return int|WP_Error post ID de la página creada o actualizada.
     */
    private function import_page($page)
    {
        if (!is_array($page) || !isset($page['documentId'], $page['title'], $page['slug'])) {
            return new WP_Error('cod_package_page_shape', 'Una entrada de página no tiene la forma esperada.');
        }

        $document_id = sanitize_key((string) $page['documentId']);
        $existing = get_posts([
            'post_type' => 'page',
            'post_status' => 'any',
            'numberposts' => 1,
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

        // El contenido real vive en el documento Canvas; el post sólo
        // necesita el shortcode que COD_Canvas_Page_Publisher::publish()
        // también usa — WordPress lo expande a la marca real (incluidas
        // las regiones de header/footer) al momento de renderizar. Se fija
        // siempre, no sólo al crear, por si una página existente quedó con
        // otro contenido.
        $post_arr = [
            'post_type' => 'page',
            'post_status' => sanitize_key((string) ($page['status'] ?? 'draft')),
            'post_title' => sanitize_text_field((string) $page['title']),
            'post_name' => sanitize_title((string) $page['slug']),
            'post_content' => sprintf('[contope_canvas document_id="%s"]', esc_attr($document_id)),
            'meta_input' => [
                '_cod_canvas_document_id' => $document_id,
            ],
        ];

        if ($existing !== []) {
            $post_arr['ID'] = (int) $existing[0];
            $result = wp_update_post($post_arr, true);
        } else {
            $result = wp_insert_post($post_arr, true);
        }

        return $result;
    }

    private function rewrite_urls(string $text, string $source_url, string $target_url): string
    {
        if ($source_url === '' || $source_url === $target_url) {
            return $text;
        }
        return str_replace($source_url, $target_url, $text);
    }

    /**
     * @return int|WP_Error cantidad de archivos copiados.
     */
    private function copy_media(ZipArchive $zip)
    {
        $upload_dir = wp_get_upload_dir();
        $base_path = $upload_dir['basedir'];
        if (!empty($upload_dir['error'])) {
            return new WP_Error('cod_package_upload_dir', (string) $upload_dir['error']);
        }

        $copied = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if ($name === false || !str_starts_with($name, 'media/') || str_ends_with($name, '/')) {
                continue;
            }
            $relative = substr($name, strlen('media/'));
            $relative = str_replace('..', '', $relative);
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
