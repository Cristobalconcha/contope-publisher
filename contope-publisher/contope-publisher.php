<?php
/**
 * Plugin Name: ContOpe Publisher
 * Description: Importa proyectos ContOpe Design como páginas Gutenberg nativas y editables.
 * Version: 0.3.6
 * Requires at least: 6.5
 * Requires PHP: 8.0
 * Author: Cristóbal Concha
 * Text Domain: contope-publisher
 * Plugin URI: https://contope.com
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

if (!defined('ABSPATH')) {
    exit;
}

define('COD_PUBLISHER_VERSION', '0.3.6');
define('COD_PUBLISHER_FILE', __FILE__);
define('COD_PUBLISHER_DIR', plugin_dir_path(__FILE__));

require_once COD_PUBLISHER_DIR . 'includes/class-cod-package-validator.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-block-serializer.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-importer.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-admin.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-canvas-document-sanitizer.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-canvas-document-repository.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-canvas-asset-resolver.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-template-region-resolver.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-dynamic-token-resolver.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-canvas-shortcode-renderer.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-canvas-page-publisher.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-canvas-editor-admin.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-custom-module-library.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-theme-builder-admin.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-inline-editor-frontend.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-theme-definitions.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-settings-admin.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-site-package-exporter.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-site-package-importer.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-site-package-admin.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-site-package-cli.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-media-attachment-sync.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-block-heading.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-canvas-mcp-recipe-compiler.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-canvas-mcp-service.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-mcp-server.php';
require_once COD_PUBLISHER_DIR . 'includes/class-cod-migracion-nombres.php';

// Migración de los nombres viejos (Open CoDesign) a los nuevos. Se registra
// ANTES que todo lo demás y corre con prioridad 1 en plugins_loaded: si el
// sitio viene de la versión anterior, sus documentos tienen que estar migrados
// antes de que cualquier otra pieza intente leerlos. Corre una sola vez.
(new COD_Migracion_Nombres())->register();

add_action('plugins_loaded', static function (): void {
    $validator = new COD_Package_Validator();
    $serializer = new COD_Block_Serializer();
    $importer = new COD_Importer($validator, $serializer);
    (new COD_Admin($importer))->register();

    // MÃ³dulo experimental y aislado: no interviene en el importador anterior.
    $canvas_repository = new COD_Canvas_Document_Repository();
    $canvas_repository->register();

    $site_package_sanitizer = new COD_Canvas_Document_Sanitizer();
    $site_package_exporter = new COD_Site_Package_Exporter($canvas_repository);
    $media_attachment_sync = new COD_Media_Attachment_Sync();
    $site_package_importer = new COD_Site_Package_Importer($canvas_repository, $site_package_sanitizer, $media_attachment_sync);
    (new COD_Site_Package_Admin($site_package_exporter, $site_package_importer))->register();

    if (defined('WP_CLI') && WP_CLI) {
        WP_CLI::add_command('ocd export-site', [new COD_Site_Package_CLI($site_package_exporter, $site_package_importer, $media_attachment_sync), 'export_site']);
        WP_CLI::add_command('ocd import-site', [new COD_Site_Package_CLI($site_package_exporter, $site_package_importer, $media_attachment_sync), 'import_site']);
        WP_CLI::add_command('ocd backfill-media-attachments', [new COD_Site_Package_CLI($site_package_exporter, $site_package_importer, $media_attachment_sync), 'backfill_media_attachments']);
    }
    $region_resolver = new COD_Template_Region_Resolver($canvas_repository);
    $token_resolver = new COD_Dynamic_Token_Resolver();
    $canvas_publisher = new COD_Canvas_Page_Publisher($canvas_repository, $region_resolver, $token_resolver);
    $canvas_publisher->register();
    $custom_module_library = new COD_Custom_Module_Library();
    $canvas_asset_resolver = new COD_Canvas_Asset_Resolver();
    (new COD_Canvas_Editor_Admin(
        $canvas_repository,
        new COD_Canvas_Document_Sanitizer(),
        $canvas_asset_resolver,
        $canvas_publisher,
        $region_resolver,
        $custom_module_library
    ))->register();
    (new COD_MCP_Server(new COD_Canvas_MCP_Service(
        $canvas_repository,
        $canvas_publisher,
        $region_resolver,
        new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer()),
        $canvas_asset_resolver
    )))->register();
    (new COD_Theme_Builder_Admin($canvas_repository, $canvas_publisher))->register();
    (new COD_Inline_Editor_Frontend($canvas_repository, $region_resolver))->register();
    (new COD_Settings_Admin())->register();

    // Fase 1 (POC): bloque Gutenberg nativo ocd/heading. Aditivo y aislado,
    // convive con el flujo Canvas legacy sin tocarlo.
    (new COD_Block_Heading())->register();
});
