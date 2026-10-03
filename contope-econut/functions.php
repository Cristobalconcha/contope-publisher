<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Carga las tres familias de Econut DESDE EL PROPIO SITIO:
 * Big Shoulders Display (títulos), Open Sans (cuerpo) y Bodoni Moda (serif).
 *
 * Los slugs display / body / serif de theme.json apuntan a estas familias.
 * Si la hoja falla, las pilas de theme.json caen a fuentes del sistema.
 *
 * POR QUÉ NO DESDE GOOGLE. Hasta el 3 de octubre de 2026 esta hoja se pedía a
 * `fonts.googleapis.com`. Eso le entrega a Google la dirección IP de cada
 * visitante —un dato personal— **antes de que haya aceptado nada**, y era el
 * único tercero que seguía cargando sin permiso después de poner la puerta a
 * las etiquetas de medición.
 *
 * Y no se arregla esperando el consentimiento, como sí se hace con una
 * etiqueta de medición: una etiqueta puede esperar, una tipografía no. Si
 * espera, el texto se dibuja con otra letra y la página entera salta en el
 * momento en que la persona acepta. La solución correcta es que la tipografía
 * no sea de un tercero.
 *
 * Son los mismos archivos, con las mismas métricas: la página se ve igual.
 * Viven en `fuentes/letras/`, con su licencia OFL al lado, y se rehacen con
 * `node scripts/traer-fuentes-de-google.mjs`.
 */
add_action('wp_enqueue_scripts', static function (): void {
    wp_enqueue_style(
        'cod-econut-fonts',
        get_stylesheet_directory_uri() . '/fuentes/fuentes.css',
        [],
        // La versión del tema, no `null`: la hoja ahora es nuestra y cambia
        // cuando se rehace. Sin esto, el navegador de quien ya visitó el sitio
        // seguiría con la copia vieja.
        wp_get_theme()->get('Version') ?: null
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
        get_stylesheet_directory_uri() . '/fuentes/fuentes.css',
        [],
        null
    );
});

/**
 * El banner de cookies (CookieAdmin), configurado desde el tema.
 *
 * Vive en su propio archivo porque es bastante texto y no tiene que ver con la
 * tipografía ni con la hoja del tema. Se carga sólo si el plugin está activo:
 * así el tema sigue funcionando en una instalación que no lo tenga.
 *
 * `is_plugin_active` vive en el admin y no está disponible al servir una
 * página, así que se mira la lista de plugins activos, que es lo que esa
 * función hace por dentro.
 */
$cod_econut_plugins_activos = get_option("active_plugins", []);
$cod_econut_hay_cookieadmin = is_array($cod_econut_plugins_activos)
    && in_array("cookieadmin/cookieadmin.php", $cod_econut_plugins_activos, true);
if ($cod_econut_hay_cookieadmin) {
    require_once __DIR__ . "/cookies.php";

    // La hoja que impide que el banner tape media pantalla, y que corrige los
    // colores que CookieAdmin trae fijos en su código y no expone en ajustes.
    add_action("wp_enqueue_scripts", static function (): void {
        wp_enqueue_style(
            "cod-econut-cookies",
            get_stylesheet_directory_uri() . "/cookies.css",
            [],
            null
        );
    }, 20);
}
unset($cod_econut_plugins_activos);
