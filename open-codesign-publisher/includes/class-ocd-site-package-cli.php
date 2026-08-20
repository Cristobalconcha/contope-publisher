<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Comandos WP-CLI para el empaquetador de sitio. Sólo se registra bajo
 * WP-CLI (ver bootstrap del plugin), nunca en una petición web normal.
 */
final class OCD_Site_Package_CLI
{
    public function __construct(
        private OCD_Site_Package_Exporter $exporter,
        private OCD_Site_Package_Importer $importer
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
}
