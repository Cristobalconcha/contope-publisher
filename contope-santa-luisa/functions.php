<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Load the project overrides after the Canvas engine stylesheet.
 *
 * The parent theme registers the cod-canvas handle from its own functions.php.
 * The Cormorant Garamond / Inter identity is expressed through the theme.json
 * font-family stacks, which fall back to portable system fonts. No mandatory
 * Google Fonts request is made, so the site renders without network access.
 */
add_action('wp_enqueue_scripts', static function (): void {
    wp_enqueue_style(
        'cod-santa-luisa',
        get_stylesheet_uri(),
        ['cod-canvas'],
        wp_get_theme()->get('Version') ?: null
    );
}, 20);

/**
 * Textos del banner de cookies (CookieAdmin), en espanol y al minimo.
 *
 * CookieAdmin trae los nombres y descripciones de sus categorias en ingles y
 * escritos de mas: cuatro parrafos para decir que hay cookies que hacen
 * funcionar el sitio y otras que dependen de la persona. Ese exceso no es
 * neutro: alarga el panel, y un aviso que tapa media pantalla no se lee, se
 * cierra.
 *
 * Las descripciones de categoria no se pueden editar desde la pantalla de
 * ajustes del plugin —solo el titulo y la introduccion—, pero el plugin expone
 * el filtro `cookieadmin_default_strings`. Traducirlas aca las mantiene fuera
 * del plugin, asi que sobreviven a sus actualizaciones.
 *
 * Una correccion de fondo y no solo de estilo: el texto original invoca el
 * GDPR, que es la norma europea. Este sitio opera en Chile, donde rigen la Ley
 * 19.628 y la Ley 21.719. Citar la norma equivocada en un aviso legal es peor
 * que no citar ninguna.
 */
add_filter('cookieadmin_default_strings', static function (array $textos): array {
    return array_merge($textos, [
        'cookie_consent' => 'Cookies',
        'cookie_preferences' => 'Preferencias de cookies',
        'remark_standard' => 'Siempre activas',
        'remark' => 'Detalle',
        'none' => 'Ninguna',
        'close' => 'Cerrar',
        'reconsent' => 'Cambiar preferencias',

        'necessary_cookies' => 'Necesarias',
        'necessary_cookies_desc' => 'Hacen funcionar el sitio. No guardan datos personales.',

        'functional_cookies' => 'Funcionales',
        'functional_cookies_desc' => 'Permiten compartir contenido y usar herramientas de terceros.',

        'analytical_cookies' => 'De medición',
        'analytical_cookies_desc' => 'Nos dicen cuánta gente visita el sitio y qué mira.',

        'advertisement_cookies' => 'De publicidad',
        'advertisement_cookies_desc' => 'Miden nuestras campañas y permiten mostrarte avisos según lo que viste.',

        'unclassified_cookies' => 'Sin clasificar',
        'unclassified_cookies_desc' => 'Todavía las estamos revisando con su proveedor.',
    ]);
});
