<?php
/**
 * Deja el WordPress limpio de la fase F1b (puerto 8895) sin contenido de ContOpe: borra las páginas que
 * viajan en un paquete, los documentos del lienzo, el ADN, los adjuntos y los archivos de uploads, y
 * devuelve la portada a "últimas entradas". Se niega a correr en cualquier otro sitio.
 *
 *   php vaciar-destino.php <ruta a wp-load.php del destino>
 */
define('WP_USE_THEMES', false);
require $argv[1] ?? '';
if (strpos((string) home_url(), ':8895') === false) {
    fwrite(STDERR, 'No es el destino limpio de F1b (' . home_url() . "): no se vacía.\n");
    exit(2);
}
global $wpdb;
$borrados = 0;
$ids = (array) $wpdb->get_col("SELECT ID FROM {$wpdb->posts} WHERE post_type IN ('cod_canvas_doc','cod_adn','attachment') OR ID IN (SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key IN ('_cod_canvas_document_id','_cod_package_content_sha'))");
foreach ($ids as $id) {
    wp_delete_post((int) $id, true);
    ++$borrados;
}
foreach ((array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_%'") as $nombre) {
    delete_option((string) $nombre);
}
update_option('show_on_front', 'posts');
update_option('page_on_front', 0);
update_option('page_for_posts', 0);
$upload = rtrim((string) wp_get_upload_dir()['basedir'], '/\\');
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
$rec($upload);
echo json_encode(['borrados' => $borrados]);
