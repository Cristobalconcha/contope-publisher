<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Enqueue the Canvas engine stylesheet.
 *
 * Block themes do not auto-load style.css on the front end, so the engine's
 * structural rules must be enqueued explicitly. When a child theme is active
 * this handle still loads the parent stylesheet (get_template_directory_uri()
 * always points at the parent) and child themes depend on this handle.
 */
add_action('wp_enqueue_scripts', static function (): void {
    wp_enqueue_style(
        'ocd-canvas',
        get_template_directory_uri() . '/style.css',
        [],
        wp_get_theme(get_template())->get('Version') ?: null
    );
});
