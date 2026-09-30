<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Carga las tres familias de Econut desde Google Fonts:
 * Big Shoulders Display (titulos), Open Sans (cuerpo) y Bodoni Moda (serif).
 *
 * Los slugs display / body / serif de theme.json apuntan a estas familias.
 * Si la red falla, las pilas de theme.json caen a fuentes del sistema.
 */
add_action('wp_enqueue_scripts', static function (): void {
    wp_enqueue_style(
        'cod-econut-fonts',
        'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@400;600;700;800&family=Bodoni+Moda:ital,wght@0,400;0,600;0,700;1,400&family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap',
        [],
        null
    );
}, 5);

/**
 * Carga la hoja del tema hijo despues del motor Canvas del padre.
 *
 * El padre registra el handle cod-canvas desde su propio functions.php.
 */
add_action('wp_enqueue_scripts', static function (): void {
    wp_enqueue_style(
        'cod-econut',
        get_stylesheet_uri(),
        ['cod-canvas', 'cod-econut-fonts'],
        wp_get_theme()->get('Version') ?: null
    );
}, 20);

/**
 * Las mismas familias en el editor de bloques, para que lo que se ve al
 * editar coincida con lo publicado.
 */
add_action('enqueue_block_editor_assets', static function (): void {
    wp_enqueue_style(
        'cod-econut-fonts-editor',
        'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@400;600;700;800&family=Bodoni+Moda:ital,wght@0,400;0,600;0,700;1,400&family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap',
        [],
        null
    );
});
