<?php
/**
 * Mide cuántos valores de diseño LITERALES (los que la compuerta rechazaría) tienen hoy las
 * páginas y las dos regiones de Basis, por clase y por valor. Es la fuente de las escalas:
 * una escala se deriva de lo que el sitio usa de verdad, no de un valor inventado.
 *
 *   php -c <php.ini> scripts/basis/medir-literales.php [--json=<archivo>]
 *
 * Lee el CSS, el HTML y el projectData guardados de cada documento Canvas (las 5 páginas y las
 * regiones encabezado y pie). Sólo lee.
 */
define('WP_USE_THEMES', false);
require getenv('WP_LOAD') ?: 'C:/Users/Cristobal concha/wp-local-basis/wordpress/wp-load.php';

$json = '';
foreach ($argv as $a) {
    if (strpos($a, '--json=') === 0) {
        $json = substr($a, 7);
    }
}
$repo = new COD_Canvas_Document_Repository();
$docs = [];
foreach (['inicio', 'basis-carpas-industriales', 'preguntas-frecuentes', 'contactos', 'terminos-y-privacidad'] as $slug) {
    $p = get_page_by_path($slug);
    if ($p) {
        $id = (string) get_post_meta($p->ID, '_cod_canvas_document_id', true);
        if ($id !== '') {
            $docs[$slug] = $id;
        }
    }
}
foreach ($repo->list_region_documents() as $r) {
    $docs['region-' . ($r['regionKind'] ?? $r['kind'] ?? '?')] = (string) $r['documentId'];
}
$tot = ['porClase' => [], 'porValor' => [], 'porPagina' => []];
foreach ($docs as $nombre => $id) {
    $d = $repo->load_existing($id);
    if (!is_array($d)) {
        continue;
    }
    $bloques = array_merge(COD_ADN_Gate::bloques_css((string) $d['css'], 'css'), COD_ADN_Gate::bloques_html((string) $d['html'], 'html'));
    foreach ($bloques as $b) {
        foreach (COD_ADN_Gate::revisar_bloque($b['decls'], $b['ruta']) as $v) {
            $c = $v['clase'];
            $tot['porClase'][$c] = ($tot['porClase'][$c] ?? 0) + 1;
            $tot['porPagina'][$nombre][$c] = ($tot['porPagina'][$nombre][$c] ?? 0) + 1;
            $k = $c . '|' . $v['propiedad'] . '|' . $v['valor'];
            $tot['porValor'][$k] = ($tot['porValor'][$k] ?? 0) + 1;
        }
    }
}
arsort($tot['porClase']);
echo "Documentos: " . implode(', ', array_keys($docs)) . "\n";
echo "TOTAL: " . array_sum($tot['porClase']) . "\n";
foreach ($tot['porClase'] as $c => $n) {
    echo "  $c: $n\n";
}
if ($json !== '') {
    file_put_contents($json, wp_json_encode($tot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    echo "-> $json\n";
}
