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
$comprobar('el tamaño de letra admite «escritorio/tablet/celular»', $s('scale_font_size', '45=28px/15px/14px') === '45=28px/15px/14px');
$comprobar('un tramo vacío hereda el de escritorio («50px//20px»)', $s('scale_font_size', '45=50px//20px') === '45=50px//20px');
$comprobar('un punto de quiebre que no es una medida se descarta', $s('scale_font_size', '45=28px/expression(1)/14px') === '' && $s('scale_font_size', '45=28px/15px') === '');
$comprobar('una transparencia es «color-de-la-paleta N%»', $s('scale_alpha', 'fondo-pagina-88=fondo-pagina 88%') === 'fondo-pagina-88=fondo-pagina 88%');
$comprobar('una transparencia con un color literal se descarta', $s('scale_alpha', 'x=#ffffff 50%') === '' && $s('scale_alpha', 'x=rgba(0,0,0,.5)') === '' && $s('scale_alpha', 'x=ink 150%') === '');
$comprobar('una transparencia que intenta cerrar la declaración: sólo queda el paso válido, sin llaves', $s('scale_alpha', 'x=ink 10%;}body{display:none}') === 'x=ink 10%');
$sombra = '10=0 4px 10px color-mix(in srgb, var(--wp--preset--color--ink) 20%, transparent)';
$comprobar('una sombra con medidas y un color de la paleta con opacidad se admite', $s('scale_shadow', $sombra) === $sombra);
$comprobar('una sombra de varias capas se admite', $s('scale_shadow', '20=0 1px 2px color-mix(in srgb, var(--wp--preset--color--ink) 10%, transparent), 0 8px 24px color-mix(in srgb, var(--wp--preset--color--ink) 20%, transparent)') !== '');
$comprobar('una sombra con un color literal se descarta', $s('scale_shadow', 'x=0 4px 10px #000000') === '' && $s('scale_shadow', 'x=0 4px 10px rgba(0,0,0,.2)') === '');
$comprobar('una sombra sin color o con una función ajena se descarta', $s('scale_shadow', 'x=0 4px 10px') === '' && $s('scale_shadow', 'x=0 4px 10px url(http://malo)') === '');
$comprobar('una sombra que referencia una variable fuera de la paleta se descarta', $s('scale_shadow', 'x=0 4px 10px color-mix(in srgb, var(--otra) 20%, transparent)') === '');
$comprobar('un desenfoque es una medida', $s('scale_blur', 's=6px') === 's=6px' && $s('scale_blur', 's=blur(6px)') === '');
$comprobar('un peso no numérico se descarta', $s('scale_weight', 'bold=negrita') === '');

echo "\n== 2. llegan al theme.json que WordPress sirve ==\n";
$def = COD_Theme_Definitions::get();
$comprobar('el sitio tiene las diez escalas declaradas (las siete de siempre, transparencias, sombras y desenfoques)', count(COD_Theme_Definitions::escalas()) === 10, (string) count(COD_Theme_Definitions::escalas()));
$ajustes = wp_get_global_settings();
$esp = [];
foreach (($ajustes['spacing']['spacingSizes']['theme'] ?? []) as $p) {
    $esp[$p['slug']] = $p['size'];
}
$pasosEsp = array_values(array_filter(COD_Theme_Definitions::escalas()['scale_spacing'] ?? [], static fn (array $p): bool => $p['slug'] !== 'gutter'));
$comprobar('settings.spacing.spacingSizes trae los pasos de espaciado (con el tamaño de escritorio) y el gutter', count($pasosEsp) > 0 && isset($esp['gutter']) && !array_filter($pasosEsp, static fn (array $p): bool => ($esp[$p['slug']] ?? '') !== $p['valor']), json_encode(array_keys($esp)));
$comprobar('hay pasos de espaciado con valor propio en tablet y celular', count(array_filter($pasosEsp, static fn (array $p): bool => ($p['tablet'] ?? '') !== '' || ($p['movil'] ?? '') !== '')) > 0);
$tam = [];
foreach (($ajustes['typography']['fontSizes']['theme'] ?? []) as $p) {
    $tam[$p['slug']] = $p['size'];
}
$pasosTam = COD_Theme_Definitions::escalas()['scale_font_size'] ?? [];
$comprobar('settings.typography.fontSizes trae los tamaños de letra (un preset por paso, con el tamaño de escritorio)', count($pasosTam) > 0 && count($tam) === count($pasosTam) && !array_filter($pasosTam, static fn (array $p): bool => ($tam[$p['slug']] ?? '') !== $p['valor']));
$comprobar('hay pasos con tamaño propio en tablet y celular', count(array_filter($pasosTam, static fn (array $p): bool => ($p['tablet'] ?? '') !== '' || ($p['movil'] ?? '') !== '')) > 0);
$paleta = [];
foreach (($ajustes['color']['palette']['theme'] ?? []) as $p) {
    $paleta[$p['slug']] = $p['color'];
}
$alfas = COD_Theme_Definitions::escalas()['scale_alpha'] ?? [];
$comprobar('la paleta del tema trae cada transparencia como un color más (y conserva los colores del tema)', count($alfas) > 0 && isset($paleta['fondo-pagina'], $paleta['accent']) && !array_filter($alfas, static fn (array $p): bool => !isset($paleta[$p['slug']]) || strpos($paleta[$p['slug']], 'color-mix(in srgb, var(--wp--preset--color--') !== 0), json_encode(array_keys($paleta)));
$sombras = [];
foreach (($ajustes['shadow']['presets']['theme'] ?? []) as $p) {
    $sombras[$p['slug']] = $p['shadow'];
}
$comprobar('settings.shadow.presets trae las sombras de la escala (y no las de fábrica de WordPress)', count($sombras) === count(COD_Theme_Definitions::escalas()['scale_shadow'] ?? []) && count($sombras) > 0 && !isset($sombras['natural']) && !isset($sombras['deep']), json_encode(array_keys($sombras)));
$comprobar('settings.custom.blur trae los desenfoques', ($ajustes['custom']['blur']['s'] ?? '') === '6px');
$comprobar('settings.custom trae radios, bordes, pesos, interlineados y medidas', ($ajustes['custom']['radius']['m'] ?? '') === '8px' && ($ajustes['custom']['border']['hairline'] ?? '') === '1px' && ($ajustes['custom']['typography']['fontWeight']['medium'] ?? '') === '500' && ($ajustes['custom']['typography']['lineHeight']['normal'] ?? '') === '1.7' && ($ajustes['custom']['layout']['measure']['m'] ?? '') === '760px');
$hoja = (string) wp_get_global_stylesheet(['variables']);
foreach (['--wp--preset--spacing--' . ($pasosEsp[0]['slug'] ?? '10') . ':' . ($pasosEsp[0]['valor'] ?? ''), '--wp--preset--font-size--' . ($pasosTam[0]['slug'] ?? '10') . ':' . ($pasosTam[0]['valor'] ?? ''), '--wp--custom--radius--m:8px', '--wp--custom--typography--font-weight--medium:500', '--wp--custom--typography--line-height--normal:1.7'] as $v) {
    $comprobar('la hoja global imprime ' . $v, strpos(str_replace(' ', '', $hoja), $v) !== false);
}

$css_global = str_replace(' ', '', (string) wp_get_global_stylesheet(['custom-css']));
foreach (['font-size' => 'tamaño de letra', 'spacing' => 'espaciado'] as $preset => $que) {
    $comprobar('la hoja global redefine la variable de un ' . $que . ' dentro del punto de quiebre del celular', (bool) preg_match('/@media\(max-width:767px\)\{:root\{[^}]*--wp--preset--' . $preset . '--[a-z0-9-]+:[\d.]+px/', $css_global));
    $comprobar('y dentro del de tablet (' . $que . ')', (bool) preg_match('/@media\(min-width:768px\)and\(max-width:1023px\)\{:root\{[^}]*--wp--preset--' . $preset . '--[a-z0-9-]+:[\d.]+px/', $css_global));
}
$bloque = COD_Theme_Definitions::css_de_escalas_con_quiebres();
$sinVars = (string) preg_replace('/--wp--preset--(?:font-size|spacing)--[a-z0-9-]+:[\d.]+px;?/', '', (string) preg_replace('#/\*cod-escalas-con-quiebres\*/(.*?)/\*/cod-escalas-con-quiebres\*/#s', '$1', $bloque));
$comprobar('ese CSS no declara nada que no sea una variable de la escala de tamaños o de espaciado', $bloque !== '' && (bool) preg_match('/^(?:@media\([^)]*\)(?:and\([^)]*\))?\{:root\{\}\})+$/', str_replace(' ', '', $sinVars)), $sinVars);
$comprobar('el CSS de los quiebres se puede rehacer sin duplicarse (rehacerlo sobre sí mismo no cambia nada)', COD_Theme_Definitions::css_con_escalas_con_quiebres($bloque) === $bloque);

echo "\n== 3. el registro de la compuerta ==\n";
COD_ADN_Registry::fijar_para_prueba(null);
COD_ADN_Registry::reiniciar();
foreach ([
    '--wp--preset--spacing--60' => 'espaciado', '--wp--preset--spacing--gutter' => 'espaciado', '--wp--preset--font-size--80' => 'tamano', '--wp--custom--radius--pill' => 'radio',
    '--wp--custom--border--thick' => 'borde-grosor', '--wp--custom--typography--font-weight--bold' => 'tipografia-fina', '--wp--custom--typography--line-height--tight' => 'tipografia-fina',
    '--wp--custom--layout--measure--s' => 'ancho-de-caja', '--wp--preset--color--fondo-pagina-88' => 'color', '--wp--preset--shadow--10' => 'sombra', '--wp--custom--blur--s' => 'libre',
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
$comprobar('custom (radios, bordes, pesos, interlineados, medidas, desenfoques) igual', array_diff_key($archivo['settings']['custom'] ?? [], ['form' => 1]) == ($parcial['custom'] ?? []));
$conAlfa = array_values(array_filter($archivo['settings']['color']['palette'] ?? [], static fn (array $c): bool => strpos((string) $c['color'], 'color-mix(') === 0));
$comprobar('las transparencias de la paleta iguales', $conAlfa == ($parcial['color']['palette'] ?? []));
$comprobar('las sombras iguales', ($archivo['settings']['shadow']['presets'] ?? []) == ($parcial['shadow']['presets'] ?? []));
preg_match('#/\*cod-escalas-con-quiebres\*/.*?/\*/cod-escalas-con-quiebres\*/#s', (string) ($archivo['styles']['css'] ?? ''), $mm);
$comprobar('el CSS de los puntos de quiebre (tamaños y espaciado) del tema commiteado es el de las definiciones', ($mm[0] ?? '') === COD_Theme_Definitions::css_de_escalas_con_quiebres() && ($mm[0] ?? '') !== '');

echo "\n== 5. la compuerta con las escalas nuevas ==\n";
$modoOriginal = get_option(COD_ADN_Gate::OPTION_MODE, null);
update_option(COD_ADN_Gate::OPTION_MODE, 'enforce', false);
COD_ADN_Registry::reiniciar();
$nuevas = static fn (string $contenido): array => (array) (COD_ADN_Gate::revisar_contenido('', $contenido, 'prueba')['violaciones'] ?? []);
$comprobar('un fondo con transparencia declarada (backgroundColor: fondo-pagina-88) pasa', $nuevas('<!-- wp:group {"backgroundColor":"fondo-pagina-88"} --><div class="wp-block-group has-fondo-pagina-88-background-color has-background"></div><!-- /wp:group -->') === []);
$comprobar('una sombra de la escala (style.shadow: var:preset|shadow|10) pasa', $nuevas('<!-- wp:group {"style":{"shadow":"var:preset|shadow|10"}} --><div class="wp-block-group"></div><!-- /wp:group -->') === []);
$comprobar('una sombra literal se rechaza', $nuevas('<!-- wp:group {"style":{"shadow":"0 4px 10px rgba(0,0,0,.2)"}} --><div class="wp-block-group"></div><!-- /wp:group -->') !== []);
$comprobar('una transparencia que no está en la escala (fondo-pagina-61) se rechaza', $nuevas('<!-- wp:group {"backgroundColor":"fondo-pagina-61"} --><div class="wp-block-group has-fondo-pagina-61-background-color has-background"></div><!-- /wp:group -->') !== []);
$comprobar('un tamaño de la escala por su slug pasa', $nuevas('<!-- wp:paragraph {"fontSize":"' . ($pasosTam[0]['slug'] ?? '10') . '"} --><p class="has-' . ($pasosTam[0]['slug'] ?? '10') . '-font-size">x</p><!-- /wp:paragraph -->') === []);
if ($modoOriginal === null) {
    delete_option(COD_ADN_Gate::OPTION_MODE);
} else {
    update_option(COD_ADN_Gate::OPTION_MODE, $modoOriginal, false);
}
COD_ADN_Registry::reiniciar();
$slugs = array_map(static fn ($c) => $c['slug'], $archivo['settings']['color']['palette'] ?? []);
$comprobar('la paleta no tiene los slugs «text» y «background» (chocan con .has-text-color y .has-background)', !in_array('text', $slugs, true) && !in_array('background', $slugs, true));

echo "\n" . ($fallas === 0 ? 'TODO COMO SE ESPERABA' : $fallas . ' comprobaciones fallaron') . ' de ' . $n . "\n";
exit($fallas === 0 ? 0 : 1);
