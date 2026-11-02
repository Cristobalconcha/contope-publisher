<?php
/**
 * Verificación del contenido GUARDADO de las cinco páginas de Basis (post_content), que debe poder fallar:
 *
 *   (c) 0 colores hex/rgb/hsl literales, 0 `font-family` literales y 0 `style=""` con valores de diseño (un `style=""` que sólo
 *       trae `var(--…)`, `0` o las medidas de composición —flex-basis, aspect-ratio, min-height, width/height de una imagen— no es
 *       un valor de diseño: es la forma en que WordPress guarda un preset);
 *   - y la propia compuerta, corrida sobre el contenido guardado, no encuentra ninguna violación.
 *
 *   php -c <php.ini> scripts/basis/verificar-bloques.php
 *
 * Sale con código 1 si algo no cumple. Sólo lee.
 */
define('WP_USE_THEMES', false);
require getenv('WP_LOAD') ?: 'C:/Users/Cristobal concha/wp-local-basis/wordpress/wp-load.php';

$paginas = ['inicio', 'basis-carpas-industriales', 'preguntas-frecuentes', 'contactos', 'terminos-y-privacidad'];
$fallas = 0;
printf("%-28s %7s %6s %6s %6s %8s %9s %9s\n", 'página', 'bytes', 'hex', 'rgb', 'ff', 'style=', 'style-dis', 'compuerta');
foreach ($paginas as $slug) {
    $p = get_page_by_path($slug);
    $c = $p ? (string) $p->post_content : '';
    if ($c === '' || strpos($c, 'wp:contope/lienzo') === false) {
        echo "FALLA  $slug: no es una página en bloques (sin contope/lienzo)\n";
        ++$fallas;
        continue;
    }
    // Se quitan las URL de medios y los anclas antes de buscar colores: `#soluciones` no es un color.
    $sin_urls = (string) preg_replace('/(?:href|src|poster|url)="[^"]*"|"url":"[^"]*"/i', '', $c);
    $hex = preg_match_all('/#[0-9a-fA-F]{3,8}\b/', $sin_urls);
    $rgb = preg_match_all('/\b(?:rgba?|hsla?|hwb|oklch|oklab)\s*\(/i', $c);
    $ff = preg_match_all('/font-family\s*:\s*(?!var\()/i', $c) + preg_match_all('/"fontFamily"\s*:\s*"[^"]*[\',][^"]*"/', $c);
    $estilos = 0;
    $con_diseno = 0;
    foreach (COD_ADN_Gate::bloques_html($c, 'post_content') as $b) {
        ++$estilos;
        if (COD_ADN_Gate::revisar_bloque($b['decls'], $b['ruta']) !== []) {
            ++$con_diseno;
        }
    }
    $previo_modo = get_option(COD_ADN_Gate::OPTION_MODE);
    update_option(COD_ADN_Gate::OPTION_MODE, 'enforce', false);
    $informe = COD_ADN_Gate::revisar_contenido('', $c, 'verificar-bloques');
    update_option(COD_ADN_Gate::OPTION_MODE, $previo_modo, false);
    $viol = count($informe['violaciones']);
    printf("%-28s %7d %6d %6d %6d %8d %9d %9d\n", $slug, strlen($c), $hex, $rgb, $ff, $estilos, $con_diseno, $viol);
    if ($hex || $rgb || $ff || $con_diseno || $viol) {
        ++$fallas;
        foreach (array_slice($informe['violaciones'], 0, 5) as $v) {
            echo '   ' . $v['codigo'] . ' ' . $v['ruta'] . ' ' . $v['propiedad'] . ': ' . $v['valor'] . "\n";
        }
    }
}
// ---------------------------------------------------------------------------------------------------------------------------
// Las regresiones de la comparación antes/después siguen cerradas: se mira lo que el contenido GUARDADO dice (por estructura, no por píxel).
echo "\nRegresiones cerradas (contenido guardado):\n";
$contenido = static function (string $slug): string {
    $p = get_page_by_path($slug);
    return $p ? (string) $p->post_content : '';
};
$inicio = $contenido('inicio');
$faq = $contenido('preguntas-frecuentes');
$comprobar = static function (string $caso, bool $ok) use (&$fallas): void {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . "\n";
    if (!$ok) {
        ++$fallas;
    }
};
$comprobar('Características: el recuadro es un color de la paleta con transparencia (no sólido) y sin literales', strpos($inicio, '"backgroundColor":"fondo-pagina-88"') !== false);
$comprobar('Características: el recuadro lleva el desenfoque como estilo de bloque registrado', strpos($inicio, 'is-style-desenfoque-s') !== false);
$comprobar('Características: el contenedor del video es «constrained» (el recuadro queda centrado con el ancho de contenido)', strpos($inicio, '"layout":{"type":"constrained"}') !== false);
$comprobar('Opciones comerciales: los íconos son core/icon con un color de la paleta (no imágenes)', substr_count($inicio, 'wp:icon {"icon":"contope/') === 3 && substr_count($inicio, '"textColor":"fondo-pagina"') >= 3);
$comprobar('Soluciones inteligentes: las fotos llevan el contorno separado como estilo de bloque registrado', preg_match_all('/contorno-thick-fondo-pagina-\d+/', $inicio) >= 4);
$comprobar('Descubre más: el degradado termina en el color de fondo (naranja), no en transparente sobre otro fondo', strpos($inicio, '"gradient":"ink-a-accent-65"') !== false);
$comprobar('Preguntas frecuentes: cada pliegue lleva el estilo del ícono y del estado abierto', substr_count($faq, 'is-style-pliegue-') >= 10);
$comprobar('Preguntas frecuentes: el divisor curvo del encabezado es un estilo de bloque registrado', strpos($faq, 'is-style-divisor-abajo-') !== false);
$comprobar('basis-carpas-industriales: la barra lateral lleva las partes de los bloques de WordPress como estilo registrado', substr_count($contenido('basis-carpas-industriales'), 'is-style-partes-') >= 3);
$comprobar('Términos y privacidad: la columna de texto es el contenedor «constrained» de una medida del set (queda centrada)', (bool) preg_match('/"layout":\{"type":"constrained","contentSize":"var\(--wp--custom--layout--measure--[a-z]+\)"\}/', str_replace(chr(92) . 'u002d', '-', $contenido('terminos-y-privacidad'))));
echo $fallas === 0 ? "\nCUMPLE: 0 literales de diseño en el contenido guardado de las 5 páginas y las regresiones siguen cerradas\n" : "\nNO CUMPLE: $fallas comprobación(es)\n";
exit($fallas === 0 ? 0 : 1);
