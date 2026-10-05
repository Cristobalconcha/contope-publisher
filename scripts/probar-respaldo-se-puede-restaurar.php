<?php
/**
 * Un respaldo tiene que poder restaurarse. Suena obvio: no lo era.
 *
 * DE DÓNDE SALE. El 5 de octubre de 2026 intenté deshacer un cambio mío en la
 * portada de Santa Luisa y descubrí que NINGÚN respaldo del plugin se podía
 * restaurar. `create_snapshot_for_post()` guardaba el contenido con
 * `update_post_meta()` sin pasar por `wp_slash()`, y WordPress le quita una capa
 * de barras invertidas al valor (compatibilidad histórica con magic_quotes). El
 * JSON quedaba con las comillas de `projectData` sin escapar, `json_decode`
 * devolvía null y el contenido era inalcanzable.
 *
 * `save()` SÍ aplicaba `wp_slash()`, con un comentario largo explicando
 * exactamente este problema. El único sitio que escribe respaldos era el único
 * que se lo había saltado.
 *
 * Y fallaba en silencio: el índice seguía listando los respaldos, cada guardado
 * imprimía «respaldo <id>» y todo parecía en orden. Hubo que recuperar la
 * portada de un respaldo externo.
 *
 * Esta prueba crea un documento con JSON anidado —que es el caso que rompe—,
 * le saca un respaldo y comprueba que vuelve byte a byte.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local ni contra el
 * sitio de un cliente.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};

$repo = new COD_Canvas_Document_Repository();
$id = 'cod-prueba-respaldo-' . bin2hex(random_bytes(5));

/*
 * El contenido que rompía: projectData es un STRING que contiene JSON, y ese
 * JSON contiene a su vez otro JSON (el caso real es el atributo
 * data-cod-geo-places del mapa de ubicación). Cada nivel añade una capa de
 * barras invertidas, y es la capa que se perdía.
 */
$dentro = wp_json_encode(['lugares' => [['nombre' => 'Viña "Santa Rita"', 'x' => 879.45]]]);
$projectData = wp_json_encode([
    'styles' => [['selectors' => ['hero'], 'style' => ['content' => '"\\201C"', 'font-family' => '"Montserrat", sans-serif']]],
    'pages' => [['frames' => [['component' => ['attributes' => ['data-cod-geo-places' => $dentro]]]]]],
]);
$html = '<div data-places=\'' . $dentro . '\'>Hola "mundo"</div>';
$css = '.hero::before{content:"\\201C";}';

$creado = $repo->save($id, $projectData, $html, $css);
if (is_wp_error($creado)) {
    echo '  FALLA  no pude crear el documento   ' . $creado->get_error_message() . "\n";
    exit(1);
}

$limpiar = static function () use ($id) {
    $p = get_posts([
        'post_type' => COD_Canvas_Document_Repository::POST_TYPE,
        'post_status' => 'any', 'numberposts' => 1, 'fields' => 'ids',
        'meta_key' => COD_Canvas_Document_Repository::META_DOCUMENT_ID, 'meta_value' => $id,
    ]);
    if ($p) { wp_delete_post((int) $p[0], true); }
};

echo "\n== el respaldo se crea ==\n";
$snap = $repo->create_snapshot($id, 'prueba', 'session-open');
$comprobar('create_snapshot devuelve una entrada', !is_wp_error($snap) && isset($snap['id']),
    is_wp_error($snap) ? $snap->get_error_message() : 'id ' . ($snap['id'] ?? '?'));
if (is_wp_error($snap)) { $limpiar(); exit(1); }

echo "\n== y SE PUEDE LEER, que es el punto ==\n";
global $wpdb;
$post_id = (int) $wpdb->get_var($wpdb->prepare(
    "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key=%s AND meta_value=%s LIMIT 1",
    COD_Canvas_Document_Repository::META_DOCUMENT_ID, $id));
$crudo = get_post_meta($post_id, COD_Canvas_Document_Repository::SNAPSHOT_META_PREFIX . $snap['id'], true);
$leido = json_decode((string) $crudo, true);

$comprobar('el respaldo decodifica como JSON', is_array($leido),
    is_array($leido) ? implode(', ', array_keys($leido)) : 'json_decode falló: ' . json_last_error_msg());

if (!is_array($leido)) {
    echo "\n  (esto es exactamente lo que fallaba: se guardaba y no se podía leer)\n";
    $limpiar();
    echo "\n1 falla\n";
    exit(1);
}

echo "\n== y vuelve byte a byte ==\n";
$comprobar('projectData idéntico', ($leido['projectData'] ?? null) === $projectData,
    ($leido['projectData'] ?? '') === $projectData ? strlen($projectData) . ' B' : 'difiere');
$comprobar('html idéntico', ($leido['html'] ?? null) === $html);
$comprobar('css idéntico', ($leido['css'] ?? null) === $css);

/*
 * Y el JSON anidado sobrevive: es lo que de verdad se perdía. Un mapa guarda sus
 * lugares como JSON dentro de un atributo, dentro del JSON del proyecto, dentro
 * del JSON del respaldo. Tres capas de escape.
 */
$pd = json_decode((string) ($leido['projectData'] ?? ''), true);
$places = $pd['pages'][0]['frames'][0]['component']['attributes']['data-cod-geo-places'] ?? '';
$comprobar('el JSON anidado de tres capas sobrevive', json_decode((string) $places, true) !== null,
    $places === '' ? 'se perdió' : 'decodifica');

$limpiar();
echo "\n" . ($fallas === 0 ? "todo en orden\n" : "$fallas fallas\n");
exit($fallas === 0 ? 0 : 1);
