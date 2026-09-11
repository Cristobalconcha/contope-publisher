<?php
/**
 * Plugin Name: Open CoDesign Publisher
 * Description: Importa proyectos Open CoDesign como pÃ¡ginas Gutenberg nativas y editables.
 * Version: 0.2.88
 * Requires at least: 6.5
 * Requires PHP: 8.0
 * Author: Open CoDesign Publisher contributors
 * Text Domain: open-codesign-publisher
 */

if (!defined('ABSPATH')) {
    exit;
}

define('OCD_PUBLISHER_VERSION', '0.2.88');
define('OCD_PUBLISHER_FILE', __FILE__);
define('OCD_PUBLISHER_DIR', plugin_dir_path(__FILE__));

require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-package-validator.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-block-serializer.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-importer.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-admin.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-canvas-document-sanitizer.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-canvas-document-repository.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-canvas-asset-resolver.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-template-region-resolver.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-dynamic-token-resolver.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-canvas-shortcode-renderer.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-canvas-page-publisher.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-canvas-editor-admin.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-custom-module-library.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-theme-builder-admin.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-inline-editor-frontend.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-theme-definitions.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-settings-admin.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-site-package-exporter.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-site-package-importer.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-site-package-admin.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-site-package-cli.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-media-attachment-sync.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-block-heading.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-canvas-mcp-recipe-compiler.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-canvas-mcp-service.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-mcp-server.php';

add_action('plugins_loaded', static function (): void {
    $validator = new OCD_Package_Validator();
    $serializer = new OCD_Block_Serializer();
    $importer = new OCD_Importer($validator, $serializer);
    (new OCD_Admin($importer))->register();

    // MÃ³dulo experimental y aislado: no interviene en el importador anterior.
    $canvas_repository = new OCD_Canvas_Document_Repository();
    $canvas_repository->register();

    $site_package_sanitizer = new OCD_Canvas_Document_Sanitizer();
    $site_package_exporter = new OCD_Site_Package_Exporter($canvas_repository);
    $media_attachment_sync = new OCD_Media_Attachment_Sync();
    $site_package_importer = new OCD_Site_Package_Importer($canvas_repository, $site_package_sanitizer, $media_attachment_sync);
    (new OCD_Site_Package_Admin($site_package_exporter, $site_package_importer))->register();

    if (defined('WP_CLI') && WP_CLI) {
        WP_CLI::add_command('ocd export-site', [new OCD_Site_Package_CLI($site_package_exporter, $site_package_importer, $media_attachment_sync), 'export_site']);
        WP_CLI::add_command('ocd import-site', [new OCD_Site_Package_CLI($site_package_exporter, $site_package_importer, $media_attachment_sync), 'import_site']);
        WP_CLI::add_command('ocd backfill-media-attachments', [new OCD_Site_Package_CLI($site_package_exporter, $site_package_importer, $media_attachment_sync), 'backfill_media_attachments']);
    }
    $region_resolver = new OCD_Template_Region_Resolver($canvas_repository);
    $token_resolver = new OCD_Dynamic_Token_Resolver();
    $canvas_publisher = new OCD_Canvas_Page_Publisher($canvas_repository, $region_resolver, $token_resolver);
    $canvas_publisher->register();
    $custom_module_library = new OCD_Custom_Module_Library();
    $canvas_asset_resolver = new OCD_Canvas_Asset_Resolver();
    (new OCD_Canvas_Editor_Admin(
        $canvas_repository,
        new OCD_Canvas_Document_Sanitizer(),
        $canvas_asset_resolver,
        $canvas_publisher,
        $region_resolver,
        $custom_module_library
    ))->register();
    (new OCD_MCP_Server(new OCD_Canvas_MCP_Service(
        $canvas_repository,
        $canvas_publisher,
        $region_resolver,
        new OCD_Canvas_MCP_Recipe_Compiler(new OCD_Canvas_Document_Sanitizer()),
        $canvas_asset_resolver
    )))->register();
    (new OCD_Theme_Builder_Admin($canvas_repository, $canvas_publisher))->register();
    (new OCD_Inline_Editor_Frontend($canvas_repository, $region_resolver))->register();
    (new OCD_Settings_Admin())->register();

    // Fase 1 (POC): bloque Gutenberg nativo ocd/heading. Aditivo y aislado,
    // convive con el flujo Canvas legacy sin tocarlo.
    (new OCD_Block_Heading())->register();
});
