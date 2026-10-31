<?php
/**
 * El mensaje del botón de WhatsApp conserva sus saltos de línea.
 *
 * Defecto que cubre: render_whatsapp() armaba el href con rawurlencode() (que sí da %0A) y después lo pasaba por esc_url(),
 * que BORRA %0A y %0D de cualquier URL. "Hola BASIS\n\nNombre:" llegaba a wa.me como "Hola BASISNombre:". El mensaje debe
 * salir con %0A en el href y con el salto literal en data-cod-whatsapp-message, y sobrevivir al sanitizador del lienzo.
 *
 * Corre contra el WordPress local de Basis (puerto 8894, con el plugin del repositorio copiado: `node scripts/basis/sincronizar-local.mjs`).
 * Nunca contra wp-local ni contra Econut. No toca ajustes: el número se inyecta con un filtro mientras corre.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$fallas = 0;
$total = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas, &$total) {
    $total++;
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? "   $detalle" : '') . "\n";
    if (!$ok) {
        $fallas++;
    }
};

add_filter('pre_option_cod_whatsapp_number', static fn () => '56900000000');
$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$mensaje = "Hola BASIS\n\nNombre:\nEmail:\nTeléfono:\n\nMensaje:\nQuisiera realizar una consulta/cotización & más";
$esperado = 'text=' . rawurlencode($mensaje);

echo "== compilación completa ==\n";
$r = $compilador->compile(['schemaVersion' => 2, 'nodes' => [['id' => 'wa', 'kind' => 'whatsapp', 'ruleIds' => [], 'content' => ['message' => $mensaje]]]], [
    'schemaVersion' => 1, 'designId' => 'prueba-wa-saltos', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => [],
]);
$marcado = is_wp_error($r) ? 'ERROR: ' . $r->get_error_message() : (string) $r['storage']['markup'];
preg_match('/href="([^"]*)"/', $marcado, $h);
$href = isset($h[1]) ? html_entity_decode($h[1]) : '';
$comprobar('el href lleva el mensaje codificado, con %0A en cada salto', strpos($href, $esperado) !== false, $href);
$comprobar('…y los dos saltos seguidos quedan como %0A%0A', strpos($href, 'BASIS%0A%0ANombre%3A%0AEmail') !== false, $href);
$comprobar('el número va antes, sin tocar', strpos($href, 'https://wa.me/56900000000?text=') === 0, $href);
preg_match('/data-cod-whatsapp-message="([^"]*)"/', $marcado, $d);
$comprobar('data-cod-whatsapp-message conserva los saltos de línea', isset($d[1]) && substr_count($d[1], "\n") === substr_count($mensaje, "\n"), isset($d[1]) ? json_encode($d[1]) : $marcado);

echo "\n== sanitizador del lienzo ==\n";
$sanea = (new COD_Canvas_Document_Sanitizer())->sanitize_html($marcado);
$sanea = is_wp_error($sanea) ? 'ERROR: ' . $sanea->get_error_message() : (string) $sanea;
preg_match('/href="([^"]*)"/', $sanea, $h2);
$comprobar('tras sanitize_html el href sigue con %0A', isset($h2[1]) && strpos(html_entity_decode($h2[1]), $esperado) !== false, $sanea);
preg_match('/data-cod-whatsapp-message="([^"]*)"/', $sanea, $d2);
$comprobar('tras sanitize_html el atributo conserva los saltos', isset($d2[1]) && substr_count($d2[1], "\n") === substr_count($mensaje, "\n"), isset($d2[1]) ? json_encode($d2[1]) : $sanea);

echo "\n== módulo aislado y saltos de Windows ==\n";
$mod = $compilador->render_whatsapp_module('wa-mod', "Uno\r\nDos", 'bottom-right');
$mod = is_wp_error($mod) ? 'ERROR: ' . $mod->get_error_message() : (string) $mod;
$comprobar('CRLF se normaliza a un solo %0A', strpos($mod, 'text=Uno%0ADos"') !== false && strpos($mod, '%0D') === false, $mod);

echo "\n== el href no se puede romper ==\n";
$r2 = $compilador->compile(['schemaVersion' => 2, 'nodes' => [['id' => 'wb', 'kind' => 'whatsapp', 'ruleIds' => [], 'content' => ['message' => 'a"b<c>&d javascript:x']]]], [
    'schemaVersion' => 1, 'designId' => 'prueba-wa-saltos', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => [],
]);
$m2 = is_wp_error($r2) ? 'ERROR' : (string) $r2['storage']['markup'];
preg_match('/href="([^"]*)"/', $m2, $h3);
$comprobar('comillas y signos del mensaje quedan codificados dentro del href', isset($h3[1]) && strpos($h3[1], '"') === false && strpos($h3[1], '<') === false && strpos($h3[1], 'text=a%22b%3Cc%3E%26d%20javascript%3Ax') !== false, $m2);

echo "\n" . ($fallas === 0 ? "TODO OK ($total comprobaciones)" : "$fallas de $total FALLARON") . "\n";
exit($fallas === 0 ? 0 : 1);
