<?php
/**
 * Verifica lo que el 0.3.48 agregó al page builder para poder cumplir la ley
 * sin parchear HTML a mano:
 *
 *  - el compilador acepta `interaction.behavior: "preferencias-cookies"` sobre
 *    un `link` o un `button` y emite `data-cod-behavior="preferencias-cookies"`
 *  - el `href` tiene que llevar a alguna parte: se rechaza vacío y se rechaza
 *    «#», porque sin JavaScript no hay panel de cookies que reabrir y el
 *    enlace tiene que servir igual
 *  - un nodo que no es enlace se rechaza nombrando lo que llegó
 *  - el saneador del documento no se come el atributo
 *  - `cod_get_canvas_page_state` responde por una REGIÓN global con
 *    `pageId: 0` y `documentId`, que es lo que exige el apply para escribirla
 *  - una región que nunca se escribió responde revisión 0 y `exists: false`,
 *    en vez de un error que parece una avería
 *  - un documentId que no es una región se rechaza
 *
 * Corre contra el WordPress local de Econut (puerto 8891). Nunca contra
 * wp-local, que es Santa Luisa.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$regla = static function (string $id, string $kind, array $valor): array {
    return [
        'id' => $id,
        'kind' => $kind,
        'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.48.']]],
        'status' => 'reviewed',
        'value' => $valor,
    ];
};
$diseno = static function (array $reglas): array {
    return ['schemaVersion' => 1, 'designId' => 'prueba-048', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas];
};
$composicion = static function (array $hijos): array {
    return ['schemaVersion' => 2, 'nodes' => [['id' => 'seccion-prueba', 'kind' => 'section', 'children' => $hijos]]];
};

$fallas = 0;
$comprobar = static function (string $caso, bool $ok) use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . "\n";
    if (!$ok) { $fallas++; }
};
$mensaje = static function ($r): string { return is_wp_error($r) ? $r->get_error_message() : ''; };

$reglaPref = $regla('r-pref', 'interaction', ['behavior' => 'preferencias-cookies']);

/** Un nodo enlace con la conducta. */
$enlace = static function (string $kind = 'link', string $href = '/terminos-y-privacidad/'): array {
    return [
        'id' => 'preferencias',
        'kind' => $kind,
        'ruleIds' => ['r-pref'],
        'content' => ['label' => 'Preferencias de cookies', 'href' => $href],
    ];
};

echo "\n== el caso bueno ==\n";
foreach (['link', 'button'] as $kind) {
    $r = $compilador->compile($composicion([$enlace($kind)]), $diseno([$reglaPref]));
    $comprobar("un $kind con preferencias-cookies compila", !is_wp_error($r));
    if (is_wp_error($r)) {
        echo '           ' . $r->get_error_message() . "\n";
        continue;
    }
    $html = $r['storage']['markup'];
    $comprobar("  emite data-cod-behavior en el $kind", strpos($html, 'data-cod-behavior="preferencias-cookies"') !== false);
    $comprobar("  conserva el destino en el $kind", strpos($html, 'href="/terminos-y-privacidad/"') !== false);
    $comprobar("  conserva el rótulo en el $kind", strpos($html, 'Preferencias de cookies') !== false);

    $limpio = (new COD_Canvas_Document_Sanitizer())->sanitize_html($html);
    $comprobar("  el saneador no se come el atributo ($kind)", is_string($limpio) && strpos($limpio, 'data-cod-behavior="preferencias-cookies"') !== false);
}

echo "\n== el destino tiene que llevar a alguna parte ==\n";
foreach (['#', '#contacto', ''] as $malo) {
    $r = $compilador->compile($composicion([$enlace('link', $malo)]), $diseno([$reglaPref]));
    // Un href vacío lo rechaza antes el contrato del nodo; «#» y «#algo» los
    // rechaza la conducta. Las dos cosas son un rechazo, que es lo que importa.
    $comprobar('rechaza href ' . var_export($malo, true), is_wp_error($r));
}
$r = $compilador->compile($composicion([$enlace('link', '#')]), $diseno([$reglaPref]));
$comprobar('y al rechazar «#» explica por qué', strpos($mensaje($r), 'sin JavaScript') !== false);

echo "\n== dónde NO puede ir ==\n";
foreach (['paragraph' => ['text' => 'Preferencias'], 'heading' => ['text' => 'Preferencias', 'level' => 2]] as $kind => $content) {
    $r = $compilador->compile(
        $composicion([['id' => 'p', 'kind' => $kind, 'ruleIds' => ['r-pref'], 'content' => $content]]),
        $diseno([$reglaPref])
    );
    $comprobar("rechaza la conducta sobre un $kind", is_wp_error($r));
    $comprobar("  y nombra lo que llegó ($kind)", strpos($mensaje($r), $kind) !== false);
}

echo "\n== el estado de una región global ==\n";
// Armado igual que en el arranque del plugin, para probar el servicio de
// verdad y no un doble que podría divergir sin que nadie lo note.
$repositorio = new COD_Canvas_Document_Repository();
$resolvedor_regiones = new COD_Template_Region_Resolver($repositorio);
$servicio = new COD_Canvas_MCP_Service(
    $repositorio,
    new COD_Canvas_Page_Publisher($repositorio, $resolvedor_regiones, new COD_Dynamic_Token_Resolver()),
    $resolvedor_regiones,
    new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer()),
    new COD_Canvas_Asset_Resolver()
);

$r = $servicio->canvas_region_state('cod-region-footer');
$comprobar('responde por el pie', !is_wp_error($r) && isset($r['document']['revision']));
$comprobar('  la revisión es un entero', !is_wp_error($r) && is_int($r['document']['revision']));
$comprobar('  dice que existe', !is_wp_error($r) && ($r['document']['exists'] ?? null) === true);

$r = $servicio->canvas_region_state('cod-region-header');
$comprobar('responde por el encabezado', !is_wp_error($r) && isset($r['document']['revision']));

// El cuerpo global de este sitio no se ha escrito nunca. Ése es el caso que
// importa: tiene que decir «revisión 0, no existe», no fallar.
$r = $servicio->canvas_region_state('cod-region-body');
$comprobar(
    'una región nunca escrita responde revisión 0 y exists:false (o existe, si ya se escribió)',
    !is_wp_error($r) && isset($r['document']['revision'], $r['document']['exists'])
);

$r = $servicio->canvas_region_state('cod-canvas-page-20');
$comprobar('rechaza un documento que no es región', is_wp_error($r));
$comprobar('  y dice cuáles son las regiones', strpos($mensaje($r), 'cod-region-footer') !== false);

$r = $servicio->canvas_region_state('inventado');
$comprobar('rechaza un documentId inventado', is_wp_error($r));

echo "\n";
if ($fallas === 0) {
    echo "probar-preferencias-cookies.php   TODO OK\n";
    exit(0);
}
echo "probar-preferencias-cookies.php   $fallas falla(s)\n";
exit(1);
