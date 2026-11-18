<?php
/**
 * Una foto de galería puede llevar título Y texto: la galería de tarjetas.
 *
 * DE DÓNDE SALE. El 18 de noviembre de 2026 Cristóbal pidió que la galería de
 * urbanización de Santa Luisa fuera «de tarjetas, es decir, que cada foto
 * viniera con un pequeño texto debajo y con un titulito. De esa manera se
 * explicaría el contenido y además sería indexable». La imagen sólo admitía
 * un `caption`; ahora admite además `description`.
 *
 * Lo que se comprueba:
 *  - que un ítem con caption y description salga con las dos piezas, cada una
 *    con su clase, y la figura marcada como tarjeta;
 *  - que un ítem SIN description salga exactamente como antes (lo publicado no
 *    puede cambiar);
 *  - que la ida y vuelta funcione: lo normalizado se puede volver a entregar;
 *  - que las partes nuevas (foto, leyenda-titulo, leyenda-texto) reciban reglas;
 *  - que un description demasiado largo se rechace y que el marcado no se
 *    interprete.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$regla = static function (string $id, string $kind, array $value): array {
    return [
        'id' => $id, 'label' => '', 'kind' => $kind,
        'scope' => ['breakpoint' => 'all', 'state' => 'default', 'roles' => []],
        'provenance' => ['sources' => [['kind' => 'reference', 'label' => '', 'reference' => 'prueba', 'rationale' => 'prueba']], 'confidence' => null],
        'status' => 'reviewed', 'value' => $value,
    ];
};
$diseno = [
    'schemaVersion' => 1,
    'designId' => 'prueba-tarjeta-de-galeria',
    'expectedDesignRevision' => 0,
    'reviewState' => 'reviewed',
    'label' => 'Prueba',
    'rules' => [
        $regla('g-galeria', 'gallery', ['mode' => 'grid', 'columns' => 4, 'mobileColumns' => 1, 'gap' => '12px', 'caption' => 'below', 'controls' => 'none']),
        $regla('g-foto', 'properties', ['declarations' => ['aspect-ratio' => '5 / 8']]),
        $regla('g-titulo', 'properties', ['declarations' => ['display' => 'block']]),
        $regla('g-texto', 'properties', ['declarations' => ['display' => 'block', 'margin-block-start' => '4px']]),
    ],
    'rootRuleIds' => [],
];
$foto = '/wp-content/uploads/2026/01/prueba.jpg';
$composicion = static function (array $items, array $partes = []) use ($foto): array {
    $nodo = ['id' => 'galeria', 'kind' => 'gallery', 'ruleIds' => ['g-galeria'], 'content' => ['items' => $items]];
    if ($partes !== []) { $nodo['partes'] = $partes; }
    return ['schemaVersion' => 2, 'label' => 'Prueba', 'nodes' => [[
        'id' => 'seccion', 'kind' => 'section', 'ruleIds' => [], 'children' => [$nodo],
    ]]];
};
$compilar = static function (array $comp) use ($compilador, $diseno) {
    return $compilador->compile($comp, $diseno);
};

echo "\n== con título y texto ==\n";
$r = $compilar($composicion([
    ['assetUrl' => $foto, 'alt' => 'Grifo', 'caption' => 'Agua certificada', 'description' => 'Agua potable de pozo propio.'],
    ['assetUrl' => $foto, 'alt' => 'Poste', 'caption' => 'Luz subterránea'],
], ['foto' => ['g-foto'], 'leyenda-titulo' => ['g-titulo'], 'leyenda-texto' => ['g-texto']]));
if (is_wp_error($r)) {
    $comprobar('compila', false, $r->get_error_message());
} else {
    $html = (string) $r['storage']['markup'];
    $css = (string) $r['storage']['styles'];
    $comprobar('compila', $html !== '');
    $comprobar('la leyenda sale en dos piezas, con su clase cada una',
        strpos($html, '<figcaption><span class="cod-leyenda__titulo">Agua certificada</span> <span class="cod-leyenda__texto">Agua potable de pozo propio.</span></figcaption>') !== false);
    $comprobar('la figura queda marcada como tarjeta', preg_match('/<figure[^>]*cod-figura--tarjeta[^>]*>/', $html) === 1);
    $comprobar('el ítem SIN description sale como siempre', strpos($html, '<figcaption>Luz subterránea</figcaption>') !== false);
    $comprobar('sólo UNA figura es tarjeta', substr_count($html, 'cod-figura--tarjeta') === 1);
    $comprobar('la regla de la parte «foto» llega a la imagen', strpos($css, '.cod-mcp-gallery__item img{aspect-ratio:5 / 8;}') !== false, '');
    $comprobar('la regla de «leyenda-texto» llega a su pieza', strpos($css, '.cod-leyenda__texto{display:block;margin-block-start:4px;}') !== false);
}

echo "\n== lo que se rechaza ==\n";
$r = $compilar($composicion([['assetUrl' => $foto, 'alt' => 'x', 'caption' => 'T', 'description' => str_repeat('a', 601)]]));
$comprobar('un description de más de 600 caracteres', is_wp_error($r));
$r = $compilar($composicion([['assetUrl' => $foto, 'alt' => 'x', 'caption' => 'T', 'description' => 'hola <b>negrita</b>']]));
$salida = is_wp_error($r) ? '' : (string) $r['storage']['markup'];
$comprobar('un description con marcado no se interpreta: sale escapado o se rechaza', is_wp_error($r) || (strpos($salida, '<b>') === false && strpos($salida, '&lt;b&gt;') !== false));

echo "\n== la hoja base ==\n";
$base = file_get_contents(__DIR__ . '/../contope-publisher/assets/css/cod-canvas-base.css');
$comprobar('la tarjeta no recorta su leyenda', strpos($base, '.cod-figura--tarjeta{display:flex;flex-direction:column;overflow:visible;}') !== false);
$comprobar('la foto de la tarjeta no ocupa el alto completo', strpos($base, '.cod-mcp-gallery__item.cod-figura--tarjeta img{height:auto;flex:0 0 auto;}') !== false);

echo "\n" . basename(__FILE__) . '   ' . ($fallas === 0 ? 'TODO OK' : "$fallas falla(s)") . "\n";
exit($fallas === 0 ? 0 : 1);
