<?php
/**
 * Una regla de diseño significa UNA cosa en todo el sitio.
 *
 * DE DÓNDE SALE. Al ir a centralizar las hojas de estilo —un documento por
 * página hoy, una por diseño mañana— se midió qué se repetía de verdad, y
 * apareció algo peor que la repetición: de 205 clases de regla sólo 9 estaban
 * en más de un documento, y **siete de esas nueve decían cosas distintas**.
 * `.cod-rule--titulo` era 40 px en una página y 34 en otra; `.cod-rule--aire`,
 * 54, 64 y 56; `.cod-rule--caja`, una rejilla de 1080 px en una y una caja de
 * lectura de 760 en otra.
 *
 * Hoy eso no choca por CASUALIDAD: cada página carga sólo su documento, y las
 * reglas del encabezado y del pie no coinciden con las del cuerpo. Pero
 * significa que el diseño todavía no es un sistema —son variables locales que
 * comparten nombre— y que fundir las hojas cambiaría el aspecto de páginas que
 * nadie tocó.
 *
 * Esta prueba es el guardarraíl: un mismo identificador de regla no puede
 * compilar a dos declaraciones distintas. Mientras falle, centralizar no es
 * seguro. El compilador no puede verlo solo —sólo ve un documento a la vez—,
 * así que hace falta mirar el sitio entero.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$repo = new COD_Canvas_Document_Repository();

/** Todos los documentos del sitio: las páginas Canvas y las regiones. */
$ids = [];
foreach (get_posts(['post_type' => 'page', 'numberposts' => -1, 'post_status' => 'any']) as $pagina) {
    $doc = COD_Canvas_Page_Publisher::documento_del_contenido((string) $pagina->post_content);
    if ($doc !== '') { $ids[] = $doc; }
}
foreach (['cod-region-header', 'cod-region-footer', 'cod-region-body'] as $region) {
    $ids[] = $region;
}
$ids = array_values(array_unique($ids));

/**
 * Se agrupa POR DISEÑO, no por sitio entero.
 *
 * El `designId` es el espacio de nombres: dos diseños distintos pueden llamar
 * `caja` a cosas distintas sin estorbarse, porque serán hojas distintas. Lo que
 * no puede pasar es que dentro del MISMO diseño un nombre signifique dos cosas.
 *
 * Se lee de la composición guardada, que es donde vive: el documento no lo
 * tiene como campo propio. Para poder servir una hoja por diseño habrá que
 * subirlo a campo, pero para comprobar basta con leerlo de ahí.
 *
 * @var array<string, array<string, array<string, string>>> diseño → clase → documento → declaraciones
 */
$cuerpos = [];
$leidos = 0;
foreach ($ids as $id) {
    $d = $repo->load($id);
    if (!is_array($d)) { continue; }
    ++$leidos;
    $comp = json_decode((string) ($d['composition'] ?? ''), true);
    $diseno = (string) ($comp['design']['designId'] ?? '(sin diseño)');
    preg_match_all('/\.cod-rule--([a-z0-9_-]+)\s*\{([^}]*)\}/i', (string) ($d['css'] ?? ''), $m, PREG_SET_ORDER);
    foreach ($m as $x) {
        // Una misma clase puede aparecer varias veces en un documento —estado,
        // breakpoint—; se juntan para compararla entera contra la de al lado.
        $cuerpos[$diseno][$x[1]][$id] = ($cuerpos[$diseno][$x[1]][$id] ?? '') . trim($x[2]);
    }
}

echo "documentos leídos: $leidos\n";
echo "diseños: " . implode(', ', array_keys($cuerpos)) . "\n\n";

$colisiones = [];
$compartidas = 0;
foreach ($cuerpos as $diseno => $clases) {
    foreach ($clases as $clase => $porDocumento) {
        if (count($porDocumento) < 2) { continue; }
        ++$compartidas;
        if (count(array_unique(array_values($porDocumento))) > 1) {
            $colisiones[$diseno . ' · .cod-rule--' . $clase] = $porDocumento;
        }
    }
}

echo "clases compartidas entre documentos del mismo diseño: $compartidas\n";

if ($colisiones === []) {
    echo "\nNinguna dice dos cosas distintas.\n";
    echo "probar-reglas-sin-colision.php   TODO OK\n";
    exit(0);
}

echo "\nCLASES QUE SIGNIFICAN COSAS DISTINTAS SEGÚN EL DOCUMENTO:\n\n";
foreach ($colisiones as $clase => $porDocumento) {
    echo "  $clase\n";
    foreach ($porDocumento as $doc => $cuerpo) {
        printf("      %-24s %s\n", $doc, substr(preg_replace('/\s+/', ' ', $cuerpo), 0, 70));
    }
    echo "\n";
}
echo "Mientras esto falle, centralizar las hojas cambiaría el aspecto de\n";
echo "páginas que nadie tocó: la última definición ganaría para todas.\n";
echo "Se arregla dándole a cada cosa su propio nombre, o unificando el valor\n";
echo "cuando de verdad son la misma cosa.\n\n";
echo "probar-reglas-sin-colision.php   " . count($colisiones) . " colisión(es)\n";
exit(1);
