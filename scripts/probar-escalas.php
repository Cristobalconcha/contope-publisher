<?php
/**
 * LAS ESCALAS del set de diseño (ContOpe → Configuración → Escala): pasos con nombre que el tema expone como presets y que el
 * registro de la compuerta admite.
 *
 * Falla si: el sanitizador deja pasar un valor que no es una medida (una inyección en un :root o un theme.json), si las escalas
 * no llegan al theme.json que WordPress sirve (--wp--preset--spacing--*, --wp--preset--font-size--*, --wp--custom--*), si no
 * entran al registro con la clase correcta, o si el registro vuelve a admitir los presets de fábrica de WordPress. También
 * comprueba que el theme.json COMMITEADO del tema y las definiciones dicen lo mismo (si no, apagar el plugin cambiaría el diseño).
 *
 * Corre contra el WordPress local de Basis. Nunca contra otro sitio.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$fallas = 0;
$n = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas, &$n) {
    ++$n;
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? '   -> ' . $detalle : '') . "\n";
    if (!$ok) {
        ++$fallas;
    }
};

echo "\n== 1. el sanitizador sólo deja pasar medidas ==\n";
$s = static fn (string $campo, string $valor): string => COD_Theme_Definitions::sanitize([$campo => $valor])[$campo];
$comprobar('«10=4px; 20=10px» se conserva', $s('scale_spacing', '10=4px; 20=10px') === '10=4px; 20=10px');
$comprobar('lo que viene después de «;» en una inyección («16px;}body{display:none}») se descarta y sólo queda el paso válido', $s('scale_spacing', '10=16px;}body{display:none}') === '10=16px');
$comprobar('un valor con url() se descarta', $s('scale_spacing', 'x=url(http://malo)') === '');
$comprobar('un valor con expression() se descarta', $s('scale_spacing', 'x=expression(alert(1))') === '');
$comprobar('un nombre con mayúsculas o espacios se descarta', $s('scale_spacing', 'Grande Uno=16px') === '');
$comprobar('un nombre repetido se queda con el primero', $s('scale_spacing', 'a=4px; a=8px') === 'a=4px');
$comprobar('una fórmula max()/calc() con el ancho del tema se admite', $s('scale_spacing', 'gutter=max(10%, calc((100% - var(--wp--style--global--content-size)) / 2))') !== '');
$comprobar('una fórmula con otra variable se descarta', $s('scale_spacing', 'g=max(10%, var(--otra))') === '');
$comprobar('el tamaño de letra admite «máximo~mínimo»', $s('scale_font_size', '70=28px~18px') === '70=28px~18px');
$comprobar('un peso no numérico se descarta', $s('scale_weight', 'bold=negrita') === '');

echo "\n== 2. llegan al theme.json que WordPress sirve ==\n";
$def = COD_Theme_Definitions::get();
$comprobar('el sitio tiene las siete escalas declaradas', count(COD_Theme_Definitions::escalas()) === 7, (string) count(COD_Theme_Definitions::escalas()));
$ajustes = wp_get_global_settings();
$esp = [];
foreach (($ajustes['spacing']['spacingSizes']['theme'] ?? []) as $p) {
    $esp[$p['slug']] = $p['size'];
}
$comprobar('settings.spacing.spacingSizes trae los pasos de espaciado y el gutter', isset($esp['10'], $esp['60'], $esp['gutter']) && $esp['60'] === '30px', json_encode(array_keys($esp)));
$tam = [];
foreach (($ajustes['typography']['fontSizes']['theme'] ?? []) as $p) {
    $tam[$p['slug']] = $p['size'];
}
$comprobar('settings.typography.fontSizes trae los tamaños de letra', ($tam['30'] ?? '') === '16px' && ($tam['120'] ?? '') === '80px');
$comprobar('settings.custom trae radios, bordes, pesos, interlineados y medidas', ($ajustes['custom']['radius']['m'] ?? '') === '8px' && ($ajustes['custom']['border']['hairline'] ?? '') === '1px' && ($ajustes['custom']['typography']['fontWeight']['medium'] ?? '') === '500' && ($ajustes['custom']['typography']['lineHeight']['normal'] ?? '') === '1.7' && ($ajustes['custom']['layout']['measure']['m'] ?? '') === '760px');
$hoja = (string) wp_get_global_stylesheet(['variables']);
foreach (['--wp--preset--spacing--60:30px', '--wp--preset--font-size--30:16px', '--wp--custom--radius--m:8px', '--wp--custom--typography--font-weight--medium:500', '--wp--custom--typography--line-height--normal:1.7'] as $v) {
    $comprobar('la hoja global imprime ' . $v, strpos(str_replace(' ', '', $hoja), $v) !== false);
}

echo "\n== 3. el registro de la compuerta ==\n";
COD_ADN_Registry::fijar_para_prueba(null);
COD_ADN_Registry::reiniciar();
foreach ([
    '--wp--preset--spacing--60' => 'espaciado', '--wp--preset--spacing--gutter' => 'espaciado', '--wp--preset--font-size--80' => 'tamano', '--wp--custom--radius--pill' => 'radio',
    '--wp--custom--border--thick' => 'borde-grosor', '--wp--custom--typography--font-weight--bold' => 'tipografia-fina', '--wp--custom--typography--line-height--tight' => 'tipografia-fina',
    '--wp--custom--layout--measure--s' => 'ancho-de-caja',
] as $nombre => $clase) {
    $e = COD_ADN_Registry::entrada($nombre);
    $comprobar($nombre . ' está en el registro como ' . $clase, $e !== null && $e['clase'] === $clase, $e === null ? 'no está' : $e['clase']);
}
foreach (['--wp--preset--color--vivid-red', '--wp--preset--shadow--natural', '--wp--preset--gradient--midnight', '--wp--preset--font-size--large'] as $n_) {
    $comprobar('el registro NO admite el preset de fábrica ' . $n_, !COD_ADN_Registry::tiene($n_));
}
$comprobar('--wp--custom--form--* (la variante del formulario) no sirve como valor de diseño en ninguna clase', ($e = COD_ADN_Registry::entrada('--wp--custom--form--campoRellenoY')) === null || $e['clase'] === 'neutro');

echo "\n== 4. el theme.json commiteado del tema dice lo mismo que las definiciones ==\n";
$archivo = json_decode((string) file_get_contents(__DIR__ . '/../contope-basis/theme.json'), true);
$parcial = COD_Theme_Definitions::theme_json_partial()['settings'] ?? [];
$comprobar('spacingSizes iguales', ($archivo['settings']['spacing']['spacingSizes'] ?? null) == ($parcial['spacing']['spacingSizes'] ?? []));
$comprobar('fontSizes iguales', ($archivo['settings']['typography']['fontSizes'] ?? null) == ($parcial['typography']['fontSizes'] ?? []));
$comprobar('custom (radios, bordes, pesos, interlineados, medidas) igual', array_diff_key($archivo['settings']['custom'] ?? [], ['form' => 1]) == ($parcial['custom'] ?? []));
$slugs = array_map(static fn ($c) => $c['slug'], $archivo['settings']['color']['palette'] ?? []);
$comprobar('la paleta no tiene los slugs «text» y «background» (chocan con .has-text-color y .has-background)', !in_array('text', $slugs, true) && !in_array('background', $slugs, true));

echo "\n" . ($fallas === 0 ? 'TODO COMO SE ESPERABA' : $fallas . ' comprobaciones fallaron') . ' de ' . $n . "\n";
exit($fallas === 0 ? 0 : 1);
