<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Empaqueta un subconjunto portable del sitio: las páginas publicadas
 * respaldadas por un documento Canvas, los documentos Canvas que
 * referencian (incluida la plantilla global de header/footer activa), y los
 * archivos de `wp-content/uploads/` que esos documentos citan.
 *
 * El paquete es un ZIP con `manifest.json` en la raíz y los archivos de
 * medios bajo `media/<ruta relativa a uploads>`. Pensado para moverse entre
 * dos instalaciones que corren la misma versión (o una compatible) de este
 * plugin, sin depender de migrar la base de datos completa.
 */
final class COD_Site_Package_Exporter
{
    public const PACKAGE_SCHEMA_VERSION = 1;

    public function __construct(private COD_Canvas_Document_Repository $repository)
    {
    }

    /**
     * @param bool $include_media Si es false, genera un paquete de solo
     *     estructura (páginas + documentos): mucho más liviano, sin
     *     imágenes ni video. Útil para cambios de texto que no tocan
     *     medios, sin tener que re-subir todo de nuevo.
     * @return string|WP_Error Ruta al ZIP generado (archivo temporal del
     *     llamador; queda a su cargo borrarlo) o WP_Error.
     */
    public function export(bool $include_media = true)
    {
        $pages = $this->collect_pages();
        if ($pages === []) {
            return new WP_Error('cod_package_empty', 'No hay páginas publicadas respaldadas por un documento Canvas.');
        }

        $document_ids = [];
        foreach ($pages as $page) {
            $document_ids[$page['documentId']] = true;
        }

        $default_template = $this->repository->get_template(COD_Canvas_Document_Repository::DEFAULT_TEMPLATE_ID);
        $default_assignments = $this->repository->get_template_assignments(COD_Canvas_Document_Repository::DEFAULT_TEMPLATE_ID);
        foreach ($default_assignments as $assigned_document_id) {
            if ($assigned_document_id !== '') {
                $document_ids[$assigned_document_id] = true;
            }
        }

        $documents = [];
        foreach (array_keys($document_ids) as $document_id) {
            $document = $this->repository->load($document_id);
            if (is_wp_error($document)) {
                return $document;
            }
            $documents[$document_id] = $document;
        }

        $media_paths = $this->collect_media_paths($documents);
        // Las fuentes del sitio (site_font_css()) se inyectan aparte del
        // html/css de cada documento, así que nunca las detecta el escaneo
        // por regex de arriba — sin esto, un paquete "completo" migra las
        // imágenes pero deja el sitio destino sin las tipografías reales.
        $media_paths = array_merge($media_paths, $this->collect_site_font_paths());

        $manifest = [
            'schemaVersion' => self::PACKAGE_SCHEMA_VERSION,
            'exportedAt' => gmdate('c'),
            'sourceSiteUrl' => home_url('/'),
            'pluginVersion' => defined('COD_PUBLISHER_VERSION') ? COD_PUBLISHER_VERSION : '',
            'includesMedia' => $include_media,
            'pages' => $pages,
            'documents' => $documents,
            'defaultTemplateAssignments' => $default_assignments,
            // Se lista siempre, aunque el paquete sea "solo estructura": así
            // quien lo reciba sabe qué archivos le faltan y de dónde salen,
            // aunque tenga que ir a buscarlos por separado.
            'media' => array_values(array_keys($media_paths)),
        ];

        $json = wp_json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return new WP_Error('cod_package_encode', 'No fue posible serializar el paquete.');
        }

        return $this->write_zip($json, $include_media ? $media_paths : []);
    }

    /**
     * @return array<int, array{id:int, title:string, slug:string, status:string, documentId:string}>
     */
    private function collect_pages(): array
    {
        $post_ids = get_posts([
            'post_type' => 'page',
            'post_status' => 'publish',
            'numberposts' => -1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_query' => [
                [
                    'key' => '_cod_canvas_document_id',
                    'compare' => 'EXISTS',
                ],
            ],
        ]);

        $pages = [];
        foreach ($post_ids as $post_id) {
            $document_id = (string) get_post_meta((int) $post_id, '_cod_canvas_document_id', true);
            if ($document_id === '') {
                continue;
            }
            $pages[] = [
                'id' => (int) $post_id,
                'title' => (string) get_the_title($post_id),
                'slug' => (string) get_post_field('post_name', $post_id),
                'status' => (string) get_post_status($post_id),
                'documentId' => $document_id,
            ];
        }

        return $pages;
    }

    /**
     * @return array<string, string> ruta relativa a uploads => ruta absoluta en disco
     */
    private function collect_site_font_paths(): array
    {
        $upload_dir = wp_get_upload_dir();
        $fonts_dir = trailingslashit((string) $upload_dir['basedir']) . 'contope/fonts';
        if (!is_dir($fonts_dir)) {
            return [];
        }

        $found = [];
        foreach (glob(trailingslashit($fonts_dir) . '*') as $absolute) {
            if (!is_file($absolute)) {
                continue;
            }
            $found['contope/fonts/' . basename($absolute)] = $absolute;
        }

        return $found;
    }

    /**
     * Busca rutas de `wp-content/uploads/...` dentro de html/css/projectData
     * de cada documento. Coincidencia por texto, no por parseo de HTML: es
     * deliberadamente permisiva para no perder referencias dentro de
     * atributos de datos o CSS `url()`.
     *
     * @param array<string, array<string, mixed>> $documents
     * @return array<string, string> ruta relativa a uploads => ruta absoluta en disco
     */
    private function collect_media_paths(array $documents): array
    {
        $upload_dir = wp_get_upload_dir();
        $base_url = $upload_dir['baseurl'];
        $base_path = $upload_dir['basedir'];

        $pattern = '#' . preg_quote($base_url, '#') . '/([A-Za-z0-9_\-./%]+\.(?:jpe?g|png|gif|webp|svg|mp4|webm|mov|avif))#i';

        $found = [];
        foreach ($documents as $document) {
            $haystack = ($document['html'] ?? '') . ' ' . ($document['css'] ?? '') . ' ' . ($document['projectData'] ?? '');
            if (preg_match_all($pattern, $haystack, $matches)) {
                foreach ($matches[1] as $relative_encoded) {
                    $relative = rawurldecode($relative_encoded);
                    if (isset($found[$relative])) {
                        continue;
                    }
                    $absolute = $base_path . '/' . $relative;
                    if (is_file($absolute)) {
                        $found[$relative] = $absolute;
                    }
                }
            }
        }

        return $found;
    }

    /**
     * @param array<string, string> $media_paths ruta relativa => ruta absoluta
     * @return string|WP_Error
     */
    private function write_zip(string $manifest_json, array $media_paths)
    {
        if (!class_exists('ZipArchive')) {
            return new WP_Error('cod_package_zip_unavailable', 'La extensión ZipArchive de PHP no está disponible.');
        }

        $tmp_path = wp_tempnam('cod-site-package.zip');
        if (!$tmp_path) {
            return new WP_Error('cod_package_tmp', 'No fue posible crear un archivo temporal.');
        }

        $zip = new ZipArchive();
        if ($zip->open($tmp_path, ZipArchive::OVERWRITE) !== true) {
            return new WP_Error('cod_package_zip_open', 'No fue posible abrir el ZIP para escritura.');
        }

        $zip->addFromString('manifest.json', $manifest_json);
        foreach ($media_paths as $relative => $absolute) {
            $zip->addFile($absolute, 'media/' . $relative);
        }

        $zip->close();

        return $tmp_path;
    }
}
