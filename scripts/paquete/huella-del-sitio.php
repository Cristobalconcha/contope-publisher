<?php
/**
 * La "huella" de un WordPress para comparar un sitio de origen con su destino (F1b): hash del contenido de
 * las páginas, de los medios y de los documentos que viajan en un paquete. SÓLO LEE.
 *
 *   php huella-del-sitio.php <wp-load.php> paquete <entrada.json>
 *       entrada.json: {"media": ["2025/07/a.png", ...], "documents": ["cod-region-header", ...]}
 *       salida: {home, pages{slug:{id,status,len,sha,docId,rev}}, media{ruta:sha|null}, documents{id:{htmlSha,cssSha,projectDataSha,regionKind,regionScope}}, adn, reading}
 *   php huella-del-sitio.php <wp-load.php> resumen
 *       salida: {posts, sha, opciones, maxId}  → un resumen de TODO el contenido, para comprobar que un sitio no cambió
 */
define('WP_USE_THEMES', false);
[$_script, $wp_load, $modo, $entrada] = array_pad($argv, 4, '');
require $wp_load;
global $wpdb;

if ($modo === 'resumen') {
    $filas = $wpdb->get_results("SELECT ID, post_type, post_status, post_name, post_modified_gmt, MD5(post_content) AS c FROM {$wpdb->posts} ORDER BY ID");
    $linea = '';
    foreach ($filas as $f) {
        $linea .= $f->ID . '|' . $f->post_type . '|' . $f->post_status . '|' . $f->post_name . '|' . $f->post_modified_gmt . '|' . $f->c . "\n";
    }
    $metas = (string) $wpdb->get_var("SELECT MD5(GROUP_CONCAT(CONCAT(post_id,'=',meta_key,'=',MD5(IFNULL(meta_value,''))) ORDER BY meta_id SEPARATOR '|')) FROM {$wpdb->postmeta} WHERE meta_key NOT IN ('_edit_lock','_edit_last')");
    $opciones = (array) $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name NOT LIKE '_transient%' AND option_name NOT LIKE '_site_transient%' ORDER BY option_name");
    echo json_encode(['posts' => count($filas), 'sha' => hash('sha256', $linea), 'metas' => $metas, 'opciones' => count($opciones), 'maxId' => (int) end($filas)->ID]);
    exit(0);
}

if ($modo !== 'paquete' || !is_file($entrada)) {
    fwrite(STDERR, "Uso: php huella-del-sitio.php <wp-load.php> paquete <entrada.json> | resumen\n");
    exit(2);
}
$pedido = json_decode((string) file_get_contents($entrada), true);
$base = rtrim((string) wp_get_upload_dir()['basedir'], '/\\');
$salida = ['home' => home_url(), 'pages' => [], 'media' => [], 'documents' => [], 'adn' => COD_ADN_Store::puntero(), 'reading' => [
    'showOnFront' => get_option('show_on_front'), 'pageOnFront' => (int) get_option('page_on_front') > 0 ? (string) get_post_field('post_name', (int) get_option('page_on_front')) : null,
]];
foreach (get_posts(['post_type' => 'page', 'post_status' => 'any', 'numberposts' => -1, 'orderby' => 'ID', 'order' => 'ASC']) as $p) {
    $c = (string) get_post_field('post_content', $p->ID, 'raw');
    $salida['pages'][$p->post_name] = [
        'id' => $p->ID, 'status' => $p->post_status, 'len' => strlen($c), 'sha' => hash('sha256', $c),
        'docId' => (string) get_post_meta($p->ID, '_cod_canvas_document_id', true),
        'rev' => (int) get_post_meta($p->ID, '_cod_content_revision', true),
        'template' => (string) get_post_meta($p->ID, '_wp_page_template', true),
        'enBloques' => strpos($c, '<!-- wp:') !== false && strpos($c, '[contope_canvas') === false,
    ];
}
foreach ((array) ($pedido['media'] ?? []) as $ruta) {
    $archivo = $base . '/' . $ruta;
    $salida['media'][$ruta] = is_file($archivo) ? hash_file('sha256', $archivo) : null;
}
$repo = new COD_Canvas_Document_Repository();
foreach ((array) ($pedido['documents'] ?? []) as $id) {
    $d = $repo->load_existing((string) $id);
    $salida['documents'][$id] = is_array($d) ? [
        'htmlSha' => hash('sha256', (string) $d['html']), 'cssSha' => hash('sha256', (string) $d['css']),
        'htmlLen' => strlen((string) $d['html']), 'cssLen' => strlen((string) $d['css']),
        'regionKind' => (string) $d['regionKind'], 'regionScope' => (string) $d['regionScope'],
    ] : null;
}
echo json_encode($salida, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
