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

/**
 * Textos y colores del banner de cookies, como VALORES DE PARTIDA.
 *
 * CookieAdmin guarda sus ajustes en la opcion `cookieadmin_consent_settings`,
 * y no expone un filtro propio para ellos. WordPress si: `option_<nombre>` deja
 * intervenir cualquier opcion al leerla. Se aprovecha eso para que el banner
 * nazca en espanol y con la paleta del proyecto, sin tener que escribir nada en
 * la base de datos del sitio publicado.
 *
 * REGLA IMPORTANTE: esto solo rellena lo que esta vacio. Si alguien escribe un
 * valor en la pantalla de CookieAdmin, ese manda y esto no lo toca. Un filtro
 * que pisara lo guardado seria justo el defecto que estuvimos corrigiendo todo
 * el dia: la pantalla mostraria una cosa y el sitio otra, y nadie entenderia
 * por que.
 *
 * Los colores salen de la paleta del tema. No se usan las variables CSS porque
 * el plugin escribe estos valores como atributos de estilo y algunos van a
 * parar a un input de color del panel de administracion, que solo entiende
 * hexadecimal.
 */
$cod_cookies_de_partida = static function ($guardado) {
    if (!is_array($guardado)) {
        $guardado = [];
    }

    $ley = get_option('cookieadmin_law', 'cookieadmin_gdpr');
    if (!is_string($ley) || $ley === '') {
        $ley = 'cookieadmin_gdpr';
    }

    $partida = [
        // Texto: al minimo. El largo del aviso es lo que decide cuanta pantalla
        // tapa: 264 caracteres dan 17,8% en telefono y 89 dan 12,7%.
        'cookieadmin_notice_title' => 'Cookies',
        'cookieadmin_notice' => 'Las necesarias para que el sitio funcione. Las de medición y publicidad, sólo si aceptas.',
        'cookieadmin_preference_title' => 'Preferencias de cookies',
        'cookieadmin_preference' => 'Elige qué permites. Puedes cambiarlo cuando quieras.',
        'cookieadmin_customize_btn' => 'Configurar',
        'cookieadmin_reject_btn' => 'Rechazar',
        'cookieadmin_accept_btn' => 'Aceptar todas',
        'cookieadmin_save_btn' => 'Guardar',

        // Color: la paleta del proyecto.
        'cookieadmin_notice_title_color' => '#70745e',
        'cookieadmin_notice_color' => '#968b8a',
        'cookieadmin_consent_inside_bg_color' => '#ffffff',
        'cookieadmin_consent_inside_border_color' => '#ecebe8',
        'cookieadmin_preference_title_color' => '#70745e',
        'cookieadmin_details_wrapper_color' => '#70745e',
        'cookieadmin_cookie_modal_bg_color' => '#ffffff',
        'cookieadmin_cookie_modal_border_color' => '#ecebe8',

        // Los tres botones del banner, identicos. Uno grande y otro chico no
        // recoge un consentimiento valido: la eleccion tiene que costar lo
        // mismo en las dos direcciones.
        'cookieadmin_customize_btn_color' => '#70745e',
        'cookieadmin_customize_btn_bg_color' => '#ffffff',
        'cookieadmin_reject_btn_color' => '#70745e',
        'cookieadmin_reject_btn_bg_color' => '#ffffff',
        'cookieadmin_accept_btn_color' => '#70745e',
        'cookieadmin_accept_btn_bg_color' => '#ffffff',

        // Guardar si va en dorado: ahi confirma una eleccion que la persona
        // acaba de tomar, no compite con Rechazar.
        'cookieadmin_save_btn_color' => '#ffffff',
        'cookieadmin_save_btn_bg_color' => '#cda23c',

        'cookieadmin_slider_off_bg_color' => '#cdc8c6',
        'cookieadmin_slider_on_bg_color' => '#cda23c',
        'cookieadmin_links_color' => '#cda23c',
    ];

    if (!isset($guardado[$ley]) || !is_array($guardado[$ley])) {
        $guardado[$ley] = [];
    }
    foreach ($partida as $clave => $valor) {
        if (!isset($guardado[$ley][$clave]) || $guardado[$ley][$clave] === '') {
            $guardado[$ley][$clave] = $valor;
        }
    }

    return $guardado;
};

// Se enganchan los DOS filtros a proposito. WordPress aplica `option_<nombre>`
// solo cuando la opcion existe; si no existe todavia —que es justo el caso de
// un plugin recien activado— devuelve por `default_option_<nombre>` y el otro
// filtro no llega a correr nunca. Con uno solo, el banner aparecia en ingles
// la primera vez y en espanol despues de guardar cualquier cosa: el peor de
// los errores, el que se arregla solo mientras alguien mira.
add_filter('option_cookieadmin_consent_settings', $cod_cookies_de_partida);
add_filter('default_option_cookieadmin_consent_settings', $cod_cookies_de_partida);
