<?php
/**
 * Plugin Name: Open CoDesign Publisher
 * Description: Importa proyectos Open CoDesign como páginas Gutenberg nativas y editables.
 * Version: 0.1.15-dev
 * Requires at least: 6.5
 * Requires PHP: 8.0
 * Author: Open CoDesign Publisher contributors
 * Text Domain: open-codesign-publisher
 */

if (!defined('ABSPATH')) {
    exit;
}

define('OCD_PUBLISHER_VERSION', '0.1.15-dev');
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
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-canvas-page-publisher.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-canvas-editor-admin.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-theme-builder-admin.php';

add_action('plugins_loaded', static function (): void {
    $validator = new OCD_Package_Validator();
    $serializer = new OCD_Block_Serializer();
    $importer = new OCD_Importer($validator, $serializer);
    (new OCD_Admin($importer))->register();

    // Módulo experimental y aislado: no interviene en el importador anterior.
    $canvas_repository = new OCD_Canvas_Document_Repository();
    $canvas_repository->register();
    $region_resolver = new OCD_Template_Region_Resolver($canvas_repository);
    $token_resolver = new OCD_Dynamic_Token_Resolver();
    $canvas_publisher = new OCD_Canvas_Page_Publisher($canvas_repository, $region_resolver, $token_resolver);
    $canvas_publisher->register();
    (new OCD_Canvas_Editor_Admin(
        $canvas_repository,
        new OCD_Canvas_Document_Sanitizer(),
        new OCD_Canvas_Asset_Resolver(),
        $canvas_publisher,
        $region_resolver
    ))->register();
    (new OCD_Theme_Builder_Admin($canvas_repository, $canvas_publisher))->register();
});

