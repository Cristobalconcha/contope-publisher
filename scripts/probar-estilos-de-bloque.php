<?php
/**
 * LOS ESTILOS DE BLOQUE DEL TEMA: la forma de un bloque que ningún atributo expresa (el contorno separado de una foto, el
 * desenfoque del fondo de un recuadro, el ícono de un pliegue) como un estilo de bloque REGISTRADO de WordPress
 * (`contope-basis/styles/blocks/<nombre>.json`), que el contenido sólo nombra con `is-style-<nombre>`.
 *
 * Falla si: un archivo no es una variación válida (slug = nombre del archivo, tipos de bloque que existen), si WordPress no la
 * registró ni la imprime en la hoja global, o si sus declaraciones traen un valor de diseño que no sea una REFERENCIA al sistema
 * (cada archivo pasa por la misma compuerta del diseño que el contenido: sin colores, tamaños, espaciados, radios, bordes ni
 * sombras literales, ni una variable que el registro no tenga). Es lo que impide que un estilo de bloque sea la puerta
 * trasera por donde entre un literal.
 *
 * También prueba que la propia compuerta rechaza un literal en ese mismo lugar (una variación con `outline: 2px solid #fff`).
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

$carpeta = realpath(__DIR__ . '/../contope-basis/styles/blocks');
$archivos = $carpeta ? (glob($carpeta . '/*.json') ?: []) : [];
echo "\n== 1. cada archivo es una variación válida y registrada ==\n";
$comprobar('el tema declara estilos de bloque', count($archivos) > 0, (string) $carpeta);
$estilos = WP_Block_Styles_Registry::get_instance();
// WordPress registra las variaciones del tema al leer los estilos globales (lo que hace cualquier página del sitio al dibujarse).
wp_get_global_stylesheet();
$instalada = get_theme_root() . '/contope-basis/styles/blocks';
foreach ($archivos as $ruta) {
    $nombre = basename($ruta, '.json');
    $d = json_decode((string) file_get_contents($ruta), true);
    $ok = is_array($d) && ($d['slug'] ?? '') === $nombre && !empty($d['blockTypes']) && is_string($d['styles']['css'] ?? null) && ($d['title'] ?? '') !== '';
    $comprobar($nombre . ': slug = nombre del archivo, título, tipos de bloque y css', $ok);
    if (!is_array($d)) {
        continue;
    }
    $comprobar($nombre . ': está instalado en el tema local (igual al del repositorio)', is_file($instalada . '/' . $nombre . '.json') && md5_file($instalada . '/' . $nombre . '.json') === md5_file($ruta), 'sincroniza el tema al local');
    foreach ($d['blockTypes'] as $bloque) {
        $comprobar($nombre . ': el bloque ' . $bloque . ' existe', WP_Block_Type_Registry::get_instance()->is_registered($bloque));
        $registrados = $estilos->get_registered_styles_for_block($bloque);
        $comprobar($nombre . ': WordPress lo registró como estilo de ' . $bloque, isset($registrados[$nombre]));
    }
    // WordPress imprime la variación por INSTANCIA al dibujar un bloque que la usa (clase is-style-<nombre>--N): se dibuja uno y se mira la hoja.
    $bloque_ = (string) $d['blockTypes'][0];
    render_block(['blockName' => $bloque_, 'attrs' => ['className' => 'is-style-' . $nombre], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []]);
    $impresa = (string) (wp_styles()->get_data('block-style-variation-styles', 'after') ? implode(' ', (array) wp_styles()->get_data('block-style-variation-styles', 'after')) : '');
    $comprobar($nombre . ': al dibujar un bloque con esa clase WordPress imprime la variación', str_contains($impresa, 'is-style-' . $nombre . '--'), substr($impresa, -200));
}

echo "\n== 2. sus declaraciones son sólo referencias al sistema (misma compuerta que el contenido) ==\n";
$modoOriginal = get_option(COD_ADN_Gate::OPTION_MODE, null);
update_option(COD_ADN_Gate::OPTION_MODE, 'enforce', false);
COD_ADN_Registry::reiniciar();
$violacionesDe = static function (string $css, string $ruta): array {
    $out = [];
    foreach (COD_ADN_Gate::bloques_css('x{' . $css . '}', $ruta) as $b) {
        foreach (COD_ADN_Gate::revisar_bloque($b['decls'], $b['ruta']) as $v) {
            $out[] = $v['codigo'] . ' ' . $v['propiedad'] . ': ' . $v['valor'];
        }
    }
    return $out;
};
foreach ($archivos as $ruta) {
    $d = json_decode((string) file_get_contents($ruta), true);
    if (!is_array($d)) {
        continue;
    }
    $v = $violacionesDe((string) ($d['styles']['css'] ?? ''), basename($ruta));
    $comprobar(basename($ruta, '.json') . ': 0 literales ni referencias desconocidas', $v === [], implode(' | ', $v));
    $comprobar(basename($ruta, '.json') . ': no declara variables reservadas ni trae hojas externas', !preg_match('/@import|--wp--|--cod-/', preg_replace('/var\(--[a-z0-9-]+\)/i', '', (string) $d['styles']['css'])));
}

echo "\n== 3. y la compuerta SÍ rechaza un literal en ese mismo lugar ==\n";
foreach ([
    'outline literal' => '& img { outline: 2px solid #ffffff; outline-offset: 4px; }',
    'color literal' => '& { background-color: #f26621; }',
    'espaciado literal' => '& .x { margin-top: 24px; }',
    'sombra literal' => '& { box-shadow: 0 4px 10px rgba(0,0,0,.2); }',
    'variable que el registro no tiene' => '& { color: var(--wp--preset--color--no-existe); }',
] as $caso => $css) {
    $comprobar($caso . ' → rechazado', $violacionesDe($css, 'prueba') !== []);
}
$bien = '& img { outline: var(--wp--custom--border--thick) solid var(--wp--preset--color--fondo-pagina); outline-offset: var(--wp--preset--spacing--10); }';
$comprobar('la misma regla con referencias al sistema → aceptada', $violacionesDe($bien, 'prueba') === [], implode(' | ', $violacionesDe($bien, 'prueba')));

echo "\n== 4. lo que un estilo cambia en un punto de quiebre (CSS del tema, entre marcas) ==\n";
$tema = json_decode((string) file_get_contents(__DIR__ . '/../contope-basis/theme.json'), true);
$cssTema = (string) ($tema['styles']['css'] ?? '');
$hay = preg_match('#/\*cod-estilos-responsivos\*/(.*?)/\*/cod-estilos-responsivos\*/#s', $cssTema, $bloqueResp) === 1;
$comprobar('el tema trae el bloque de estilos en puntos de quiebre', $hay);
$comprobar('ese bloque llega a la hoja que WordPress sirve', $hay && str_contains(str_replace(' ', '', (string) wp_get_global_stylesheet(['custom-css'])), str_replace(' ', '', $bloqueResp[1])));
if ($hay) {
    $registradas = array_map(static fn (string $r): string => basename($r, '.json'), $archivos);
    $rest = (string) preg_replace('#@media\s*\((?:min|max)-width:\s*\d+px\)(?:\s*and\s*\((?:min|max)-width:\s*\d+px\))?\s*\{#', '', $bloqueResp[1]);
    $reglas = 0;
    $ajenas = [];
    foreach (explode('}', $rest) as $trozo) {
        $trozo = trim($trozo);
        if ($trozo === '') {
            continue;
        }
        $esImagen = preg_match('/^\.wp-block-image\.is-style-([a-z0-9-]+) img\{aspect-ratio:\d+(?:\.\d+)?\/\d+(?:\.\d+)?;?$/', $trozo, $m) === 1;
        $esAlto = !$esImagen && preg_match('/^\.wp-block-group\.is-style-([a-z0-9-]+)\{min-height:\d+(?:\.\d+)?px;?$/', $trozo, $m) === 1;
        if ((!$esImagen && !$esAlto) || !in_array($m[1], $registradas, true)) {
            $ajenas[] = $trozo;
            continue;
        }
        ++$reglas;
    }
    $comprobar('cada regla es «la clase de un estilo REGISTRADO + aspect-ratio (imagen) o min-height (grupo)» y nada más (' . $reglas . ' reglas)', $reglas > 0 && $ajenas === [], implode(' | ', $ajenas));
}

if ($modoOriginal === null) {
    delete_option(COD_ADN_Gate::OPTION_MODE);
} else {
    update_option(COD_ADN_Gate::OPTION_MODE, $modoOriginal, false);
}
COD_ADN_Registry::reiniciar();
echo $fallas === 0 ? "\nTODO BIEN\n" : "\n$fallas FALLA(S)\n";
exit($fallas === 0 ? 0 : 1);
