<?php
/**
 * El paquete de sitio lleva los estilos compartidos.
 *
 * POR QUÉ. Las páginas llevan `class="cod-btn cod-btn--primario"`, pero la regla
 * que las viste vive en un documento aparte (`cod-shared-styles`) que no es de
 * ninguna página ni plantilla. El exportador sólo recogía páginas y plantillas,
 * así que un sitio exportado e importado perdía sus botones: el espejo local de
 * Santa Luisa mostró el de WhatsApp como texto suelto, y en producción es
 * dorado (7-oct-2026).
 *
 * Lo que se mide:
 *  - con estilos compartidos → el manifiesto lleva el documento con su css
 *  - sin estilos compartidos → no se agrega un documento vacío
 *  - el css compartido pasa el saneador de la importación sin perder reglas
 *    (el importador lo sanea igual que a cualquier documento)
 *
 * Desde F1b el paquete es un .ocdsite v1: los documentos viajan en content/pages.json. Corre contra el
 * WordPress limpio de pruebas (COD_PRUEBA_WP, por ejemplo el de la fase F1b en el puerto 8895) o, si no
 * se indica, contra el WordPress local de Econut (puerto 8891), que es donde no
 * importa tocar el documento compartido un momento; lo restaura al terminar.
 * Antes: node scripts/sincronizar-plugin.mjs --a econut --aplicar
 */
define('WP_USE_THEMES', false);
require getenv('COD_PRUEBA_WP') ?: __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/file.php'; // wp_tempnam(): el exportador la usa y en CLI no se carga sola

$fallas = 0;
$ok = function (bool $cond, string $msg) use (&$fallas) {
    echo ($cond ? 'ok     ' : 'FALLA  ') . $msg . "\n";
    if (!$cond) { $fallas++; }
};

$ID = COD_Canvas_Document_Repository::SHARED_STYLES_DOCUMENT_ID;
$repo = new COD_Canvas_Document_Repository();
$exportador = new COD_Site_Package_Exporter($repo);

/** Lee el documento compartido del paquete que genera el exportador. */
$manifiesto = function () use ($exportador) {
    $zip_path = $exportador->export(false);
    if (is_wp_error($zip_path)) { return $zip_path; }
    $zip = new ZipArchive();
    $zip->open($zip_path);
    $json = $zip->getFromName('content/pages.json');
    if ($json === false) {
        $json = $zip->getFromName('manifest.json'); // paquete del esquema anterior
    }
    $zip->close();
    @unlink($zip_path);
    return json_decode((string) $json, true);
};

// Respaldo del documento compartido de este local, para devolverlo al final (y, si no existía, quitarlo).
$antes = $repo->load_existing($ID);
$antes = is_wp_error($antes) ? null : $antes;

// El exportador no genera un paquete de un sitio sin páginas: si este local no tiene ninguna página del
// lienzo, se crea una de prueba y se borra al terminar.
$pagina_de_prueba = 0;
$documento_de_prueba = 'zz-estilos-compartidos-pagina';
if (get_posts(['post_type' => 'page', 'post_status' => 'publish', 'numberposts' => 1, 'fields' => 'ids', 'meta_key' => '_cod_canvas_document_id']) === []) {
    $repo->save($documento_de_prueba, '{}', '<section><p>prueba</p></section>', '');
    $pagina_de_prueba = (int) wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'ZZ estilos compartidos', 'post_content' => '[contope_canvas document_id="' . $documento_de_prueba . '"]', 'meta_input' => ['_cod_canvas_document_id' => $documento_de_prueba]]);
}

$CSS = '.cod-btn{display:inline-flex;}.cod-btn--primario{background-color:var(--dorado-600);color:#2b2210;}'
    . '[data-cod-luma-matte="1"] .cod-luma-matte__canvas{display:block;width:100%;height:auto;}';

try {
    $repo->save($ID, '{"styles":[]}', '<body></body>', $CSS);
    $m = $manifiesto();
    $ok(is_array($m), 'el exportador produce un manifiesto legible');
    $ok(is_array($m) && isset($m['documents'][$ID]), 'con estilos compartidos: el manifiesto lleva ' . $ID);
    $ok(is_array($m) && strpos((string) ($m['documents'][$ID]['css'] ?? ''), 'cod-btn--primario') !== false, 'y su css trae la regla del botón');

    $limpio = (new COD_Canvas_Document_Sanitizer())->sanitize_css($CSS);
    $ok(!is_wp_error($limpio), 'el saneador de la importación acepta ese css');
    $ok(!is_wp_error($limpio) && strpos($limpio, 'cod-btn--primario') !== false && strpos($limpio, 'cod-luma-matte__canvas') !== false,
        'y no le quita ni el botón ni el matte de luminancia');

    $repo->save($ID, '{"styles":[]}', '<body></body>', '');
    $m = $manifiesto();
    $ok(is_array($m) && !isset($m['documents'][$ID]), 'sin estilos compartidos: no se agrega un documento vacío');
} finally {
    if ($antes) {
        $repo->save($ID, (string) $antes['projectData'], (string) $antes['html'], (string) $antes['css']);
    } else {
        $creado = $repo->load_existing($ID);
        if (is_array($creado)) {
            wp_delete_post((int) $creado['postId'], true);
        }
    }
    if ($pagina_de_prueba > 0) {
        wp_delete_post($pagina_de_prueba, true);
        $doc = $repo->load_existing($documento_de_prueba);
        if (is_array($doc)) {
            wp_delete_post((int) $doc['postId'], true);
        }
    }
}

echo $fallas === 0 ? "\nTODO OK\n" : "\n$fallas falla(s)\n";
exit($fallas === 0 ? 0 : 1);
