<?php
/**
 * Plugin Name: Open CoDesign Publisher
 * Description: Importa proyectos Open CoDesign como páginas Gutenberg nativas y editables.
 * Version: 0.1.0-dev
 * Requires at least: 6.5
 * Requires PHP: 8.0
 * Author: Open CoDesign Publisher contributors
 * Text Domain: open-codesign-publisher
 */

if (!defined('ABSPATH')) {
    exit;
}

define('OCD_PUBLISHER_VERSION', '0.1.0-dev');
define('OCD_PUBLISHER_FILE', __FILE__);
define('OCD_PUBLISHER_DIR', plugin_dir_path(__FILE__));

require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-package-validator.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-block-serializer.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-importer.php';
require_once OCD_PUBLISHER_DIR . 'includes/class-ocd-admin.php';

add_action('plugins_loaded', static function (): void {
    $validator = new OCD_Package_Validator();
    $serializer = new OCD_Block_Serializer();
    $importer = new OCD_Importer($validator, $serializer);
    (new OCD_Admin($importer))->register();
});

