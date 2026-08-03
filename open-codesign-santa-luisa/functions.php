<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Load the project overrides after the Canvas engine stylesheet.
 *
 * The parent theme registers the ocd-canvas handle from its own functions.php.
 * The Cormorant Garamond / Inter identity is expressed through the theme.json
 * font-family stacks, which fall back to portable system fonts. No mandatory
 * Google Fonts request is made, so the site renders without network access.
 */
add_action('wp_enqueue_scripts', static function (): void {
    wp_enqueue_style(
        'ocd-santa-luisa',
        get_stylesheet_uri(),
        ['ocd-canvas'],
        wp_get_theme()->get('Version') ?: null
    );
}, 20);
