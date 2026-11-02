<?php
/**
 * LOS ÍCONOS DEL SITIO EN EL BLOQUE `core/icon` (WordPress 7.1): la familia «ícono» de Gutenberg con el repertorio del set.
 *
 * Falla si: el plugin no registra la colección `contope`, si un glifo de la carpeta del set no queda como `contope/<nombre>`, si el
 * estilo del sitio no decide entre las variantes de un mismo ícono, si el bloque no toma el color de un SLUG de la paleta (la
 * razón de que sea un bloque y no una imagen: un SVG como imagen conserva el color de su archivo), o si la compuerta del diseño
 * deja pasar un color literal en ese bloque.
 *
 * Corre contra el WordPress local de Basis (puerto 8894). Nunca contra otro sitio.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? '   -> ' . $detalle : '') . "\n";
    if (!$ok) {
        ++$fallas;
    }
};

echo "\n== 1. la colección y los íconos del set ==\n";
$comprobar('WordPress trae la familia (core/icon registrado)', WP_Block_Type_Registry::get_instance()->is_registered('core/icon'));
$comprobar('el plugin registró la colección «contope»', class_exists('WP_Icon_Collections_Registry') && WP_Icon_Collections_Registry::get_instance()->is_registered(COD_Iconos_De_Bloque::COLECCION));
$archivos = COD_Iconos_De_Bloque::archivos();
$comprobar('hay íconos en la carpeta del set', count($archivos) > 0, (string) count($archivos));
$registro = WP_Icons_Registry::get_instance();
$faltan = array_filter(array_keys($archivos), static fn (string $n): bool => !$registro->is_registered('contope/' . $n));
$comprobar('cada archivo del set es un ícono contope/<nombre>', $faltan === [], implode(', ', $faltan));
foreach (['mas', 'menos'] as $n) {
    $comprobar('el dibujo del pliegue «' . $n . '» es un ícono del set', $registro->is_registered('contope/' . $n));
}
$comprobar('un glifo de Divi (etmodules-e050) es un ícono del set', $registro->is_registered('contope/etmodules-e050'));
$comprobar('un ícono de Material con estilo sale UNA vez, sin el sufijo de estilo', $registro->is_registered('contope/search') && !$registro->is_registered('contope/search-outlined'));
$estilo = COD_Icono::estilo();
$archivo = $archivos['search'] ?? '';
$comprobar('de las variantes de un ícono se elige la del estilo del sitio (' . $estilo . ')', $archivo !== '' && str_contains(basename($archivo), '-' . $estilo . '.svg'), basename($archivo));

echo "\n== 2. el bloque toma el color de un slug de la paleta ==\n";
$html = render_block(['blockName' => 'core/icon', 'attrs' => ['icon' => 'contope/etmodules-e050', 'textColor' => 'fondo-pagina', 'style' => ['dimensions' => ['width' => '45px']]], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []]);
$comprobar('se dibuja un <svg> dentro de .wp-block-icon', str_contains($html, 'wp-block-icon') && str_contains($html, '<svg'), substr($html, 0, 160));
$comprobar('el color es la clase del slug (has-fondo-pagina-color), no un color escrito', str_contains($html, 'has-fondo-pagina-color') && !preg_match('/#[0-9a-f]{3,8}|rgb\(/i', $html), substr($html, 0, 200));
$comprobar('el dibujo es el del glifo (su <path>)', str_contains($html, '<path'));
$inexistente = render_block(['blockName' => 'core/icon', 'attrs' => ['icon' => 'contope/no-existe'], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []]);
$comprobar('un ícono que no está en el set no dibuja nada (ni un recuadro roto)', trim($inexistente) === '', $inexistente);

echo "\n== 3. la compuerta del diseño ==\n";
$modoOriginal = get_option(COD_ADN_Gate::OPTION_MODE, null);
update_option(COD_ADN_Gate::OPTION_MODE, 'enforce', false);
COD_ADN_Registry::reiniciar();
$bueno = '<!-- wp:icon {"icon":"contope/etmodules-e050","textColor":"fondo-pagina","style":{"dimensions":{"width":"45px"}}} /-->';
$i = COD_ADN_Gate::revisar_contenido('', $bueno, 'prueba');
$comprobar('un ícono con color de la paleta pasa (0 violaciones)', ($i['nuevas'] ?? -1) === 0, json_encode($i['violaciones'] ?? []));
$malo = '<!-- wp:icon {"icon":"contope/etmodules-e050","style":{"color":{"text":"#ffffff"}}} /-->';
$i = COD_ADN_Gate::revisar_contenido('', $malo, 'prueba');
$comprobar('un color literal en el ícono se rechaza', ($i['nuevas'] ?? 0) > 0 && str_contains(json_encode($i['violaciones']), 'ADN_LITERAL_COLOR'), json_encode($i['violaciones'] ?? []));
$malo2 = '<!-- wp:icon {"icon":"contope/etmodules-e050","textColor":"un-color-que-no-existe"} /-->';
$i = COD_ADN_Gate::revisar_contenido('', $malo2, 'prueba');
$comprobar('un slug que la paleta no tiene se rechaza', ($i['nuevas'] ?? 0) > 0 && str_contains(json_encode($i['violaciones']), 'ADN_VAR_UNKNOWN'), json_encode($i['violaciones'] ?? []));
if ($modoOriginal === null) {
    delete_option(COD_ADN_Gate::OPTION_MODE);
} else {
    update_option(COD_ADN_Gate::OPTION_MODE, $modoOriginal, false);
}
COD_ADN_Registry::reiniciar();

echo $fallas === 0 ? "\nTODO BIEN\n" : "\n$fallas FALLA(S)\n";
exit($fallas === 0 ? 0 : 1);
