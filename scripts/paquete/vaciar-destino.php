<?php
/**
 * Deja el WordPress limpio de la fase F1b (carpeta wp-local-f1b-destino*, puerto 8895 u otro) sin contenido de
 * ContOpe ni estado del sitio que un paquete trae: borra las páginas que viajan en un paquete, los documentos
 * del lienzo, el ADN, los adjuntos, los archivos de uploads, las navegaciones y los menús, y devuelve a su
 * valor de fábrica el título, la descripción, los enlaces permanentes, el ícono, el logo, las ubicaciones de
 * menú, el estilo de íconos y las hojas de diseño; devuelve la portada a "últimas entradas". Se niega a
 * correr en cualquier otro sitio.
 *
 *   php vaciar-destino.php <ruta a wp-load.php del destino> [--solo-estado]
 *
 * Con --solo-estado se deja el contenido (páginas, documentos, adjuntos, ADN, medios) y se vacía SÓLO el estado del sitio
 * que trae un paquete: menús, navegaciones, ajustes, ícono, logo, ubicaciones, set de íconos y hojas de diseño. Sirve para
 * repetir una importación sin volver a escribir los archivos pesados.
 */
define('WP_USE_THEMES', false);
require $argv[1] ?? '';
if (strpos(str_replace('\\', '/', (string) ABSPATH), '/wp-local-f1b-destino') === false || preg_match('/^localhost:\d+$/', (string) wp_parse_url(home_url(), PHP_URL_HOST) . ':' . (string) wp_parse_url(home_url(), PHP_URL_PORT)) !== 1) {
    fwrite(STDERR, 'No es el destino limpio de F1b (' . home_url() . "): no se vacía.\n");
    exit(2);
}
global $wpdb;
$solo_estado = in_array('--solo-estado', $argv, true);
$borrados = 0;
$ids = $solo_estado
    ? (array) $wpdb->get_col("SELECT ID FROM {$wpdb->posts} WHERE post_type IN ('wp_navigation','nav_menu_item')")
    : (array) $wpdb->get_col("SELECT ID FROM {$wpdb->posts} WHERE post_type IN ('cod_canvas_doc','cod_adn','attachment','wp_navigation','nav_menu_item') OR ID IN (SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key IN ('_cod_canvas_document_id','_cod_package_content_sha'))");
foreach ($ids as $id) {
    wp_delete_post((int) $id, true);
    ++$borrados;
}
if (!$solo_estado) {
    foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_%'") as $nombre) {
        delete_option((string) $nombre);
    }
}
foreach ((array) get_terms(['taxonomy' => 'nav_menu', 'hide_empty' => false]) as $menu) {
    if ($menu instanceof WP_Term) {
        wp_delete_nav_menu((int) $menu->term_id);
    }
}
// el estado del sitio que trae un paquete (COD_Site_Package_Sitio) vuelve a su valor de fábrica
update_option('blogname', 'WordPress');
update_option('blogdescription', '');
global $wp_rewrite;
$wp_rewrite->set_permalink_structure('');
$wp_rewrite->set_category_base('');
$wp_rewrite->set_tag_base('');
delete_option('site_icon');
delete_option('site_logo');
remove_theme_mod('custom_logo');
remove_theme_mod('nav_menu_locations');
foreach (['cod_icono_estilo', 'cod_disenos_hojas', 'cod_package_ajustes_importados'] as $nombre) {
    delete_option($nombre);
}
flush_rewrite_rules(false);
if (!$solo_estado) {
    update_option('show_on_front', 'posts');
    update_option('page_on_front', 0);
    update_option('page_for_posts', 0);
}
$upload = rtrim((string) wp_get_upload_dir()['basedir'], '/\\');
// qué carpeta se vacía: todo uploads, o sólo las del set de íconos y las hojas de diseño
$raices = $solo_estado ? [$upload . '/contope-iconos', $upload . '/contope-disenos'] : [$upload];
$rec = static function (string $dir) use (&$rec, $upload): void {
    foreach (glob($dir . '/*') ?: [] as $f) {
        if (is_dir($f)) {
            $rec($f);
            @rmdir($f);
        } else {
            @unlink($f);
        }
    }
};
// El servidor de desarrollo de PHP (php -S) mantiene abierto el último archivo que sirvió a una conexión; en Windows
// eso impide borrarlo hasta que la conexión se cierra. Se reintenta unos segundos y, si queda algo, se dice (código 3).
$restos = 0;
for ($intento = 0; $intento < 12; ++$intento) {
    $restos = 0;
    foreach ($raices as $raiz) {
        $rec($raiz);
        if ($solo_estado) {
            @rmdir($raiz);
        }
    }
    $contar = static function (string $dir) use (&$contar, &$restos): void {
        foreach (glob($dir . '/*') ?: [] as $f) {
            if (is_dir($f)) {
                $contar($f);
            } else {
                ++$restos;
            }
        }
    };
    foreach ($raices as $raiz) {
        $contar($raiz);
    }
    if ($restos === 0) {
        break;
    }
    sleep(1);
}
echo json_encode(['borrados' => $borrados, 'restos' => $restos]);
exit($restos === 0 ? 0 : 3);
