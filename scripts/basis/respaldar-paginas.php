<?php
/**
 * Respaldo (y restauración) de las páginas de Basis ANTES de pasarlas a bloques.
 *
 *   php -c <php.ini> scripts/basis/respaldar-paginas.php  <carpeta-destino>
 *   php -c <php.ini> scripts/basis/respaldar-paginas.php  --restaurar <carpeta-con-respaldo>
 *
 * Por cada una de las cinco páginas guarda: la fila del post (todos sus campos), todos sus metadatos, y el documento Canvas
 * que la respalda (projectData, html, css, revisión). También guarda los documentos de las dos regiones (encabezado y pie), las
 * definiciones del tema, el modo de la compuerta y el theme.json del tema activo. Sólo LEE; `--restaurar` devuelve el `post_content`
 * y los metadatos de cada página tal como estaban (los documentos Canvas no se tocan nunca al pasar a bloques, así que no hay que
 * restaurarlos: el respaldo los guarda para poder comparar).
 *
 * Corre contra el WordPress local de Basis. Nunca contra otro sitio.
 */
define('WP_USE_THEMES', false);
require getenv('WP_LOAD') ?: 'C:/Users/Cristobal concha/wp-local-basis/wordpress/wp-load.php';

$restaurar = in_array('--restaurar', $argv, true);
$carpeta = '';
foreach (array_slice($argv, 1) as $a) {
    if ($a !== '--restaurar') {
        $carpeta = $a;
    }
}
if ($carpeta === '') {
    fwrite(STDERR, "falta la carpeta\n");
    exit(1);
}
$SLUGS = ['inicio', 'basis-carpas-industriales', 'preguntas-frecuentes', 'contactos', 'terminos-y-privacidad'];

if ($restaurar) {
    foreach ($SLUGS as $slug) {
        $archivo = rtrim($carpeta, '/\\') . '/pagina-' . $slug . '.json';
        $d = json_decode((string) file_get_contents($archivo), true);
        if (!is_array($d)) {
            fwrite(STDERR, "no puedo leer $archivo\n");
            exit(1);
        }
        wp_update_post(['ID' => (int) $d['post']['ID'], 'post_content' => wp_slash((string) $d['post']['post_content'])]);
        foreach ($d['meta'] as $k => $v) {
            update_post_meta((int) $d['post']['ID'], $k, maybe_unserialize($v[0] ?? ''));
        }
        echo "restaurada: $slug\n";
    }
    exit(0);
}

if (!is_dir($carpeta) && !mkdir($carpeta, 0777, true)) {
    fwrite(STDERR, "no puedo crear $carpeta\n");
    exit(1);
}
$repo = new COD_Canvas_Document_Repository();
$escribir = static function (string $nombre, $datos) use ($carpeta): void {
    file_put_contents(rtrim($carpeta, '/\\') . '/' . $nombre, wp_json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
};
foreach ($SLUGS as $slug) {
    $p = get_page_by_path($slug);
    if (!$p) {
        fwrite(STDERR, "no existe la página $slug\n");
        exit(1);
    }
    $doc_id = (string) get_post_meta($p->ID, '_cod_canvas_document_id', true);
    $doc = $doc_id !== '' ? $repo->load_existing($doc_id) : null;
    $escribir('pagina-' . $slug . '.json', [
        'post' => $p->to_array(),
        'meta' => get_post_meta($p->ID),
        'documento' => is_array($doc) ? $doc : null,
        'url' => get_permalink($p->ID),
        'respaldadoEl' => gmdate('c'),
    ]);
    echo "respaldada: $slug (post {$p->ID}, documento $doc_id, " . strlen((string) $p->post_content) . " bytes de contenido)\n";
}
foreach ($repo->list_region_documents() as $r) {
    $doc = $repo->load_existing((string) $r['documentId']);
    $escribir('region-' . $r['documentId'] . '.json', ['region' => $r, 'documento' => is_array($doc) ? $doc : null]);
    echo "respaldada: región {$r['documentId']}\n";
}
$escribir('ajustes.json', [
    'definiciones' => get_option(COD_Theme_Definitions::OPTION_KEY, ''),
    'modoCompuerta' => get_option(COD_ADN_Gate::OPTION_MODE, ''),
    'tema' => get_stylesheet(),
    'themeJson' => is_file(get_stylesheet_directory() . '/theme.json') ? json_decode((string) file_get_contents(get_stylesheet_directory() . '/theme.json'), true) : null,
    'portada' => ['show_on_front' => get_option('show_on_front'), 'page_on_front' => get_option('page_on_front')],
]);
echo "listo → $carpeta\n";
