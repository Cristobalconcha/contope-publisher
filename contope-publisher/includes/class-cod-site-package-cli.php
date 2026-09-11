<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Comandos WP-CLI para el empaquetador de sitio. Sólo se registra bajo
 * WP-CLI (ver bootstrap del plugin), nunca en una petición web normal.
 */
final class COD_Site_Package_CLI
{
    public function __construct(
        private COD_Site_Package_Exporter $exporter,
        private COD_Site_Package_Importer $importer,
        private COD_Media_Attachment_Sync $media_sync
    ) {
    }

    /**
     * Exporta el paquete portable del sitio a un archivo ZIP.
     *
     * ## OPTIONS
     *
     * <destino>
     * : Ruta del archivo .zip a escribir.
     *
     * [--sin-medios]
     * : Genera un paquete de solo estructura (páginas y documentos), sin
     * imágenes ni video. Mucho más liviano; el sitio destino ya debe tener
     * los medios, o se agregan por separado.
     *
     * ## EXAMPLES
     *
     *     wp ocd export-site ./santa-luisa.zip
     *     wp ocd export-site ./santa-luisa-estructura.zip --sin-medios
     */
    public function export_site(array $args, array $assoc_args): void
    {
        $destination = $args[0];
        $include_media = !isset($assoc_args['sin-medios']);
        $zip_path = $this->exporter->export($include_media);
        if (is_wp_error($zip_path)) {
            WP_CLI::error($zip_path->get_error_message());
            return;
        }
        if (!copy($zip_path, $destination)) {
            WP_CLI::error("No fue posible copiar el paquete a $destination.");
            return;
        }
        unlink($zip_path);
        WP_CLI::success("Paquete escrito en $destination (" . size_format(filesize($destination)) . ').');
    }

    /**
     * Importa un paquete portable del sitio desde un archivo ZIP.
     *
     * ## OPTIONS
     *
     * <origen>
     * : Ruta del archivo .zip a importar.
     *
     * ## EXAMPLES
     *
     *     wp ocd import-site ./santa-luisa.zip
     */
    public function import_site(array $args): void
    {
        $source = $args[0];
        if (!is_file($source)) {
            WP_CLI::error("No existe el archivo $source.");
            return;
        }
        $result = $this->importer->import($source);
        if (is_wp_error($result)) {
            WP_CLI::error($result->get_error_message());
            return;
        }
        WP_CLI::success(sprintf(
            '%d páginas, %d documentos, %d archivos de medios.',
            count($result['pages']),
            count($result['documents']),
            $result['mediaCopied']
        ));
    }

    /**
     * Registra como adjuntos reales los archivos que ya están en
     * `wp-content/uploads/contope/` desde antes de que existiera la
     * sincronización automática en la importación.
     *
     * Recorre el mismo árbol que escanea COD_Canvas_Asset_Resolver, pero no
     * modifica la resolución de URLs: solo completa la Biblioteca de medios.
     *
     * ## EXAMPLES
     *
     *     wp ocd backfill-media-attachments
     */
    public function backfill_media_attachments(array $args, array $assoc_args): void
    {
        $upload_dir = wp_get_upload_dir();
        if (!empty($upload_dir['error'])) {
            WP_CLI::error((string) $upload_dir['error']);
            return;
        }

        $root = wp_normalize_path(COD_Canvas_Asset_Resolver::carpeta_gestionada()['dir']);
        if (!is_dir($root)) {
            WP_CLI::warning('No existe el directorio de medios gestionado: ' . $root);
            return;
        }

        $created = 0;
        $existing = 0;
        $skipped = 0;
        $errors = [];
        $count = 0;
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file) {
            if (++$count > COD_Canvas_Asset_Resolver::MAX_FILES_SCANNED) {
                WP_CLI::warning(sprintf('Se alcanzó el límite de %d archivos escaneados.', COD_Canvas_Asset_Resolver::MAX_FILES_SCANNED));
                break;
            }
            if (!$file->isFile()) {
                continue;
            }

            $path = wp_normalize_path($file->getPathname());
            // Los tamaños intermedios que genera WordPress para los adjuntos
            // originales viven en el mismo árbol, pero no son archivos
            // fuente: no deben convertirse en adjuntos propios.
            if ($this->media_sync->is_generated_image_size($path)) {
                $skipped++;
                continue;
            }

            $result = $this->media_sync->sync_file_with_status($path);
            if (is_wp_error($result)) {
                $errors[] = $file->getFilename() . ': ' . $result->get_error_message();
                continue;
            }

            if ($result['created']) {
                $created++;
            } else {
                $existing++;
            }
        }

        WP_CLI::success(sprintf(
            '%d adjuntos nuevos, %d ya existían, %d tamaños intermedios omitidos, %d archivos recorridos, %d errores.',
            $created,
            $existing,
            $skipped,
            $count,
            count($errors)
        ));

        foreach ($errors as $error) {
            WP_CLI::warning($error);
        }
    }
}
