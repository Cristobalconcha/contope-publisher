<?php
/**
 * Siembra (y retira) en el WordPress local de BASIS un menú clásico y una navegación de bloques de PRUEBA, hechos con
 * las cinco páginas reales del sitio. Basis no tiene ninguno (su menú está dentro del documento del encabezado), y
 * sin un menú de verdad el transporte de menús no se podría medir de punta a punta.
 *
 * Es lo único que la prueba de la pantalla escribe en Basis, y lo retira apenas termina de exportar:
 * `limpiar` borra el menú, sus enlaces y la navegación, y devuelve las opciones del tema a lo que eran (el texto
 * crudo de `theme_mods_<tema>` que `sembrar` guardó). Se niega a correr en cualquier otro sitio.
 *
 *   php sembrar-menus-basis.php <wp-load.php> sembrar            → JSON con lo sembrado (guárdalo para limpiar)
 *   php sembrar-menus-basis.php <wp-load.php> limpiar <archivo.json con lo que devolvió sembrar>
 *   php sembrar-menus-basis.php <wp-load.php> rastro            → JSON con lo que la siembra toca (para comparar antes y después)
 */
define('WP_USE_THEMES', false);
[$_script, $wp_load, $modo, $archivo_estado] = array_pad($argv, 4, '');
require $wp_load;
if (strpos((string) home_url(), 'localhost:8894') === false) {
    fwrite(STDERR, 'No es Basis (' . home_url() . "): no se siembra nada.\n");
    exit(2);
}
$opcion_del_tema = 'theme_mods_' . get_stylesheet();
$slugs = ['inicio', 'basis-carpas-industriales', 'preguntas-frecuentes', 'contactos', 'terminos-y-privacidad'];

if ($modo === 'rastro') {
    global $wpdb;
    echo json_encode([
        'navegaciones' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'wp_navigation'"),
        'enlacesDeMenu' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'nav_menu_item'"),
        'menus' => count(wp_get_nav_menus()),
        'opcionDelTema' => md5(serialize(get_option($opcion_del_tema, null))),
    ]);
    exit(0);
}

if ($modo === 'sembrar') {
    $paginas = [];
    foreach ($slugs as $slug) {
        $ids = get_posts(['post_type' => 'page', 'post_status' => 'publish', 'name' => $slug, 'numberposts' => 1, 'fields' => 'ids']);
        if ($ids === []) {
            fwrite(STDERR, "Falta la página $slug en Basis.\n");
            exit(2);
        }
        $paginas[$slug] = (int) $ids[0];
    }
    if (wp_get_nav_menu_object('ocd-prueba-menu') || get_posts(['post_type' => 'wp_navigation', 'name' => 'ocd-prueba-navegacion', 'post_status' => 'any', 'numberposts' => 1, 'fields' => 'ids'])) {
        fwrite(STDERR, "Ya hay una siembra de prueba en Basis: limpiar antes.\n");
        exit(2);
    }
    $crudo_antes = get_option($opcion_del_tema, null);
    $menu = (int) wp_create_nav_menu('OCD prueba menú');
    wp_update_term($menu, 'nav_menu', ['slug' => 'ocd-prueba-menu']);
    $titulos = ['inicio' => 'Inicio', 'basis-carpas-industriales' => 'Carpas industriales', 'preguntas-frecuentes' => 'Preguntas frecuentes', 'contactos' => 'Cotizaciones & contactos', 'terminos-y-privacidad' => 'Términos y privacidad'];
    $items = [];
    $posicion = 1;
    foreach ($slugs as $slug) {
        $padre = $slug === 'preguntas-frecuentes' ? ($items['basis-carpas-industriales'] ?? 0) : 0;
        $items[$slug] = (int) wp_update_nav_menu_item($menu, 0, ['menu-item-title' => $titulos[$slug], 'menu-item-type' => 'post_type', 'menu-item-object' => 'page', 'menu-item-object-id' => $paginas[$slug], 'menu-item-parent-id' => $padre, 'menu-item-status' => 'publish', 'menu-item-position' => $posicion++]);
    }
    $items['externo'] = (int) wp_update_nav_menu_item($menu, 0, ['menu-item-title' => 'WhatsApp', 'menu-item-type' => 'custom', 'menu-item-url' => 'https://wa.me/56900000000', 'menu-item-status' => 'publish', 'menu-item-position' => $posicion++, 'menu-item-target' => '_blank']);
    $ubicaciones = get_nav_menu_locations();
    $ubicaciones['ocd-prueba-principal'] = $menu;
    set_theme_mod('nav_menu_locations', $ubicaciones);

    $bloques = '';
    foreach ($slugs as $slug) {
        $bloques .= '<!-- wp:navigation-link ' . serialize_block_attributes(['label' => $titulos[$slug], 'type' => 'page', 'id' => $paginas[$slug], 'url' => home_url('/' . ($slug === 'inicio' ? '' : $slug . '/')), 'kind' => 'post-type', 'isTopLevelLink' => true]) . " /-->\n";
    }
    $bloques .= '<!-- wp:navigation-link ' . serialize_block_attributes(['label' => 'WhatsApp', 'url' => 'https://wa.me/56900000000', 'kind' => 'custom', 'isTopLevelLink' => true]) . ' /-->';
    $nav = (int) wp_insert_post(['post_type' => 'wp_navigation', 'post_status' => 'publish', 'post_title' => 'OCD prueba navegación', 'post_name' => 'ocd-prueba-navegacion', 'post_content' => $bloques]);

    echo json_encode(['menu' => $menu, 'items' => $items, 'nav' => $nav, 'crudoAntes' => $crudo_antes, 'habiaOpcion' => $crudo_antes !== null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit(0);
}

if ($modo === 'limpiar') {
    $estado = json_decode((string) @file_get_contents($archivo_estado), true);
    if (!is_array($estado)) {
        fwrite(STDERR, "No leí el estado de la siembra ($archivo_estado).\n");
        exit(2);
    }
    foreach ((array) wp_get_nav_menu_items((int) $estado['menu'], ['post_status' => 'any']) as $it) {
        wp_delete_post((int) $it->ID, true);
    }
    wp_delete_nav_menu((int) $estado['menu']);
    wp_delete_post((int) $estado['nav'], true);
    if (!empty($estado['habiaOpcion'])) {
        update_option($opcion_del_tema, $estado['crudoAntes']);
    } else {
        delete_option($opcion_del_tema);
    }
    echo json_encode(['limpio' => true]);
    exit(0);
}
fwrite(STDERR, "Uso: php sembrar-menus-basis.php <wp-load.php> sembrar | limpiar <archivo.json>\n");
exit(2);
