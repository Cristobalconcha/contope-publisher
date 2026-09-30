<?php
/**
 * Crea las regiones globales de encabezado y pie en el WordPress local de
 * Econut.
 *
 * Por qué hace falta un guion: el canal MCP sabe LEER regiones resueltas
 * (readResolvedRegions) pero no tiene herramienta para CREARLAS; se crean en
 * el panel de WordPress. Esto hace lo mismo que esa pantalla, sin pantalla.
 *
 * Una región es un documento del Canvas con dos metadatos: su tipo
 * (header|body|footer) y su alcance. Con alcance «global» y sin exclusiones se
 * aplica a todas las páginas, que es lo que corresponde para el encabezado y
 * el pie de un sitio.
 *
 * Corre contra wp-local-econut (puerto 8891). NUNCA contra wp-local, que es
 * Santa Luisa.
 *
 * Uso:  php crear-regiones.php
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../../wp-local-econut/wordpress/wp-load.php';

$repositorio = new COD_Canvas_Document_Repository();

$regiones = [
    ['documento' => 'cod-region-header', 'tipo' => COD_Canvas_Document_Repository::REGION_KIND_HEADER, 'titulo' => 'Encabezado global'],
    ['documento' => 'cod-region-footer', 'tipo' => COD_Canvas_Document_Repository::REGION_KIND_FOOTER, 'titulo' => 'Pie global'],
];

foreach ($regiones as $region) {
    $post_id = $repositorio->ensure_post_id($region['documento']);
    if (is_wp_error($post_id)) {
        echo "ERROR creando {$region['documento']}: " . $post_id->get_error_message() . "\n";
        continue;
    }

    $antes = (string) get_post_meta($post_id, COD_Canvas_Document_Repository::META_REGION_KIND, true);

    update_post_meta($post_id, COD_Canvas_Document_Repository::META_REGION_KIND, $region['tipo']);
    update_post_meta($post_id, COD_Canvas_Document_Repository::META_REGION_SCOPE, COD_Canvas_Document_Repository::REGION_SCOPE_GLOBAL);
    update_post_meta($post_id, COD_Canvas_Document_Repository::META_REGION_TARGETS, '[]');
    update_post_meta($post_id, COD_Canvas_Document_Repository::META_REGION_EXCLUDES, '[]');
    update_post_meta($post_id, COD_Canvas_Document_Repository::META_REGION_TEMPLATE_TITLE, $region['titulo']);
    wp_update_post(['ID' => $post_id, 'post_title' => $region['titulo'], 'post_status' => 'publish']);

    $estado = $antes === '' ? 'creada' : 'actualizada';
    echo "{$estado}: {$region['documento']}  (post {$post_id}, tipo {$region['tipo']}, alcance global)\n";
}

echo "\nRegiones registradas ahora:\n";
foreach ($repositorio->list_region_documents() as $doc) {
    echo '  ' . str_pad($doc['documentId'], 22) . $doc['regionKind'] . ' · ' . $doc['regionScope'] . "\n";
}
