<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * El banner de cookies de Econut (CookieAdmin), configurado desde el tema.
 *
 * Por qué hace falta: la Ley 21.719 entra en vigencia el 1 de diciembre de
 * 2026 y exige consentimiento EXPLÍCITO. Hoy econut.cl no tiene banner, no
 * tiene página de privacidad y carga cuatro terceros sin preguntar —Mapbox,
 * Google Maps, Google Tag Manager y un CDN—, cada uno con sus cookies.
 *
 * Por qué desde el tema y no desde la pantalla del plugin: así el banner nace
 * en español y con la paleta del proyecto sin escribir nada en la base de
 * datos, y sobrevive a las actualizaciones de CookieAdmin.
 *
 * REGLA QUE NO SE NEGOCIA: esto sólo rellena lo que está vacío. Si alguien
 * escribe un valor en la pantalla de CookieAdmin, ése manda. Un filtro que
 * pisara lo guardado dejaría la pantalla diciendo una cosa y el sitio otra.
 */

/**
 * Los textos de las categorías, en español y al mínimo.
 *
 * CookieAdmin los trae en inglés y escritos de más. Ese exceso no es neutro:
 * alarga el panel, y un aviso que tapa media pantalla no se lee, se cierra —y
 * un cierre apurado no es consentimiento informado.
 *
 * Y una corrección de fondo: el texto original invoca el GDPR, que es la norma
 * europea. Acá rigen la Ley 19.628 y la 21.719. Citar la norma equivocada en
 * un aviso legal es peor que no citar ninguna.
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
        'functional_cookies_desc' => 'Permiten mostrar el mapa de cómo llegar y otras herramientas de terceros.',

        'analytical_cookies' => 'De medición',
        'analytical_cookies_desc' => 'Nos dicen cuánta gente visita el sitio y qué mira.',

        'advertisement_cookies' => 'De publicidad',
        'advertisement_cookies_desc' => 'Miden nuestras campañas y permiten mostrarte avisos según lo que viste.',

        'unclassified_cookies' => 'Sin clasificar',
        'unclassified_cookies_desc' => 'Todavía las estamos revisando con su proveedor.',
    ]);
});

/**
 * Textos y colores del banner, como VALORES DE PARTIDA.
 *
 * Los colores son la paleta de Econut, medida del sitio real: el verde #2E594A
 * del pie, el naranja #DC4017 de los títulos y el beige #DBD4C0 de las
 * secciones.
 */
$cod_econut_cookies_de_partida = static function ($guardado) {
    if (!is_array($guardado)) {
        $guardado = [];
    }

    $ley = get_option('cookieadmin_law', 'cookieadmin_gdpr');
    if (!is_string($ley) || $ley === '') {
        $ley = 'cookieadmin_gdpr';
    }

    $partida = [
        // Texto al mínimo: el largo del aviso es lo que decide cuánta pantalla
        // tapa. En Santa Luisa, 264 caracteres daban 17,8% de un teléfono y 89
        // dan 12,7%.
        'cookieadmin_notice_title' => 'Cookies',
        'cookieadmin_notice' => 'Las necesarias para que el sitio funcione. Las de medición y publicidad, sólo si aceptas.',
        'cookieadmin_preference_title' => 'Preferencias de cookies',
        'cookieadmin_preference' => 'Elige qué permites. Puedes cambiarlo cuando quieras.',
        'reConsent_title' => 'Cambiar preferencias de cookies',
        'cookieadmin_customize_btn' => 'Configurar',
        'cookieadmin_reject_btn' => 'Rechazar',
        'cookieadmin_accept_btn' => 'Aceptar todas',
        'cookieadmin_save_btn' => 'Guardar',

        // La paleta de Econut.
        'cookieadmin_notice_title_color' => '#2e594a',
        'cookieadmin_notice_color' => '#333333',
        'cookieadmin_consent_inside_bg_color' => '#ffffff',
        'cookieadmin_consent_inside_border_color' => '#dbd4c0',
        'cookieadmin_preference_title_color' => '#2e594a',
        'cookieadmin_details_wrapper_color' => '#2e594a',
        'cookieadmin_cookie_modal_bg_color' => '#ffffff',
        'cookieadmin_cookie_modal_border_color' => '#dbd4c0',

        // Los tres botones del banner, IDÉNTICOS. Uno grande y otro chico no
        // recoge un consentimiento válido: la ley pide que rechazar sea tan
        // fácil como aceptar, y eso incluye que se vea igual de fácil.
        'cookieadmin_customize_btn_color' => '#2e594a',
        'cookieadmin_customize_btn_bg_color' => '#ffffff',
        'cookieadmin_reject_btn_color' => '#2e594a',
        'cookieadmin_reject_btn_bg_color' => '#ffffff',
        'cookieadmin_accept_btn_color' => '#2e594a',
        'cookieadmin_accept_btn_bg_color' => '#ffffff',

        // Guardar sí va destacado: ahí confirma una elección que la persona
        // acaba de tomar, no compite con Rechazar.
        'cookieadmin_save_btn_color' => '#ffffff',
        'cookieadmin_save_btn_bg_color' => '#dc4017',

        'cookieadmin_slider_off_bg_color' => '#cdc8c6',
        'cookieadmin_slider_on_bg_color' => '#2e594a',
        'cookieadmin_links_color' => '#dc4017',
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

// Los DOS filtros, a propósito. WordPress aplica `option_<nombre>` sólo cuando
// la opción EXISTE; si no existe todavía —justo el caso de un plugin recién
// activado— devuelve por `default_option_<nombre>` y el otro no corre nunca.
// Con uno solo, el banner aparecía en inglés la primera vez y en español
// después de guardar cualquier cosa: el peor de los errores, el que se arregla
// solo mientras alguien mira.
add_filter('option_cookieadmin_consent_settings', $cod_econut_cookies_de_partida);
add_filter('default_option_cookieadmin_consent_settings', $cod_econut_cookies_de_partida);
