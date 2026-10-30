<?php
/**
 * Dos ampliaciones chicas que salieron de transcribir Basis (Divi):
 *  - los saltos de línea de un título, un párrafo o un ítem de lista se dibujan
 *    como <br>, no como un espacio (el original rompía líneas a propósito);
 *  - un ítem de `list` puede ser {text, items}: una sublista, hasta tres niveles
 *    (el <ul> dentro de un <li> que Divi permite y el nodo no admitía).
 * Lo que NO cambia: el texto sigue escapándose (nada de HTML dentro de un ítem) y
 * un ítem con otra forma se rechaza nombrando el porqué.
 *
 * Corre contra el WordPress local de Basis (puerto 8894, con el plugin del repositorio copiado). Nunca contra wp-local ni contra Econut.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};
$mensaje = static fn ($r): string => is_wp_error($r) ? $r->get_error_message() : '';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$diseno = ['schemaVersion' => 1, 'designId' => 'prueba-lista', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => []];
$componer = static fn (array $nodos): array => ['schemaVersion' => 2, 'nodes' => [['id' => 'sec', 'kind' => 'section', 'children' => $nodos]]];

echo "\n== saltos de línea ==\n";
$r = $compilador->compile($componer([
    ['id' => 'h', 'kind' => 'heading', 'content' => ['level' => 1, 'text' => "La respuesta eficiente\na su demanda"]],
    ['id' => 'p', 'kind' => 'paragraph', 'content' => ['text' => "Primera línea\nSegunda <b>línea</b>"]],
]), $diseno);
$comprobar('compila', !is_wp_error($r), $mensaje($r));
if (is_wp_error($r)) { exit(1); }
$html = $r['storage']['markup'];
$comprobar('el título lleva <br>', preg_match('/eficiente<br>\s*a su demanda/', $html) === 1);
$comprobar('el párrafo lleva <br>', preg_match('/Primera línea<br>\s*Segunda/', $html) === 1);
$comprobar('el HTML del texto sigue escapado', strpos($html, '&lt;b&gt;línea&lt;/b&gt;') !== false && strpos($html, '<b>') === false);

echo "\n== listas anidadas ==\n";
$r = $compilador->compile($componer([
    ['id' => 'l', 'kind' => 'list', 'content' => ['ordered' => false, 'items' => [
        'Plano',
        ['text' => 'Dimensiones', 'items' => ['Ancho', 'Largo', ['text' => 'Alto', 'items' => ['Hombro']]]],
    ]]],
]), $diseno);
$comprobar('una lista con sublistas compila', !is_wp_error($r), $mensaje($r));
if (!is_wp_error($r)) {
    $h = $r['storage']['markup'];
    $comprobar('el ítem plano sigue igual', strpos($h, '<li>Plano</li>') !== false);
    $comprobar('la sublista va dentro del <li>', strpos($h, '<li>Dimensiones<ul><li>Ancho</li><li>Largo</li>') !== false);
    $comprobar('el tercer nivel también', strpos($h, '<li>Alto<ul><li>Hombro</li></ul></li>') !== false);
}
$rr = $compilador->compile($componer([
    ['id' => 'l', 'kind' => 'list', 'content' => ['ordered' => false, 'items' => [['text' => 'A', 'items' => [['text' => 'B', 'items' => [['text' => 'C', 'items' => [['text' => 'D', 'items' => ['E']]]]]]]]]]],
]), $diseno);
$comprobar('un cuarto nivel se rechaza', is_wp_error($rr));
$rr = $compilador->compile($componer([
    ['id' => 'l', 'kind' => 'list', 'content' => ['ordered' => false, 'items' => [['text' => 'A', 'html' => '<b>x</b>', 'items' => ['B']]]]],
]), $diseno);
$comprobar('un ítem con claves de más se rechaza', is_wp_error($rr), $mensaje($rr));
$rr = $compilador->compile($componer([
    ['id' => 'l', 'kind' => 'list', 'content' => ['ordered' => false, 'items' => [['text' => 'A', 'items' => []]]]],
]), $diseno);
$comprobar('una sublista vacía se rechaza', is_wp_error($rr));

echo "\n";
if ($fallas === 0) { echo "probar-lista-anidada.php   TODO OK\n"; exit(0); }
echo "probar-lista-anidada.php   $fallas falla(s)\n";
exit(1);
