<?php
/**
 * Verifica el behavior «mapa» de 0.3.47 (lado servidor):
 *  - el compilador acepta un group con interaction.mapa y su content (lat, lng, mini, globo…) y emite
 *    data-cod-behavior="mapa", los data-cod-mapa-* y el mini (<a><img> del sitio) delante de los hijos
 *  - la CLAVE de Mapbox NO queda en el HTML guardado: se pone al MOSTRAR la página (COD_Mapa::resolver_en_html),
 *    y cambiarla en Configuración llega sin recomponer
 *  - sin clave: el mini SÍ se dibuja y el mapa grande no se ofrece (se quita el behavior), y queda anotado en
 *    summary.omittedNodes
 *  - latitud, longitud y zoom fuera de rango, un mini o un marcador inseguros, un globo vacío o con un enlace
 *    a medias se rechazan NOMBRANDO el campo
 *  - un nodo que no es group se rechaza; un group con content pero sin la regla sigue rechazado
 *  - dos conductas de runtime en un nodo siguen siendo un conflicto
 *  - el texto del globo sale escapado: texto plano, nada de HTML
 *  - la clave: acepta una pública (pk.), rechaza una secreta (sk.) y la basura, y una rechazada no pisa la anterior
 *  - mapa_css(): vacío si la página no declara la conducta; toda regla cuelga de .cod-mapa salvo una que no
 *    oculta nada; sin colores de marca, sin degradados, sin abreviadas con variable, sin animación
 *  - la pantalla de Configuración trae el campo y la línea sobre restringir la clave al dominio
 *  - el catálogo de capacidades lista «mapa» donde corresponde
 *
 * Corre contra el WordPress local de Econut (puerto 8891), que ya tiene el plugin cargado: hay que
 * sincronizar repo -> wp-local-econut antes. Nunca contra wp-local (ése es Santa Luisa).
 * Guarda y RESTAURA la opción de la clave de Mapbox de ese WordPress de pruebas.
 *
 * El comportamiento en el navegador lo prueba scripts/probar-mapa.mjs.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$CLAVE = 'pk.eyJ1IjoicHJ1ZWJhIiwiYSI6ImNsYXZlZGVwcnVlYmEifQ.AbCdEfGhIjKlMnOpQrStUv';
$CLAVE_OTRA = 'pk.eyJ1IjoicHJ1ZWJhIiwiYSI6Im90cmFjbGF2ZSJ9.ZyXwVuTsRqPoNmLkJiHgFe';
$opcion_previa = get_option(COD_Mapa::OPTION_KEY, null);
register_shutdown_function(static function () use ($opcion_previa) {
    if ($opcion_previa === null) {
        delete_option(COD_Mapa::OPTION_KEY);
    } else {
        update_option(COD_Mapa::OPTION_KEY, $opcion_previa, false);
    }
});

$regla = function (string $id, string $kind, array $valor, string $breakpoint = 'all'): array {
    return [
        'id' => $id,
        'kind' => $kind,
        'scope' => ['breakpoint' => $breakpoint, 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.47.']]],
        'status' => 'reviewed',
        'value' => $valor,
    ];
};
$diseno = function (array $reglas): array {
    return ['schemaVersion' => 1, 'designId' => 'prueba-047', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => $reglas];
};
$composicion = function (array $hijos): array {
    return ['schemaVersion' => 2, 'nodes' => [['id' => 'seccion-prueba', 'kind' => 'section', 'children' => $hijos]]];
};
$datos = function (array $cambios = []): array {
    return array_merge([
        'lat' => -33.80413624737442,
        'lng' => -70.68161681668681,
        'zoom' => 17,
        'mini' => '/wp-content/uploads/mini-mapa.png',
        'etiqueta' => 'Abrir el mapa de la planta de Paine',
        'globo' => 'Av 18 de Septiembre sn Hijuela 2, Fundo San Rafael, Paine',
        'globoEnlaceTexto' => 'www.econut.cl',
        'globoEnlaceHref' => 'https://www.econut.cl',
    ], $cambios);
};
$direccion = [
    ['id' => 'direccion', 'kind' => 'paragraph', 'content' => ['text' => 'Av 18 de Septiembre sn Hijuela 2, Paine, Región Metropolitana']],
];
$mapa = function (?array $content = null, array $reglaIds = ['r-mapa'], string $kind = 'group', array $extra = []) use ($datos, $direccion): array {
    $nodo = array_merge(['id' => 'mapa-pie', 'kind' => $kind, 'ruleIds' => $reglaIds, 'children' => $direccion], $extra);
    $nodo['content'] = $content ?? $datos();
    return $nodo;
};

$fallas = 0;
$comprobar = function (string $caso, bool $ok) use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . "\n";
    if (!$ok) { $fallas++; }
};
$reglaMapa = $regla('r-mapa', 'interaction', ['behavior' => 'mapa']);
$mensaje = static function ($r): string { return is_wp_error($r) ? $r->get_error_message() : ''; };
$codigo = static function ($r): string { return is_wp_error($r) ? $r->get_error_code() : ''; };

echo "\n== compilador: el caso bueno ==\n";
update_option(COD_Mapa::OPTION_KEY, $CLAVE, false);
$r = $compilador->compile($composicion([$mapa()]), $diseno([$reglaMapa]));
$comprobar('un group con interaction.mapa y su content compila', !is_wp_error($r));
if (is_wp_error($r)) { echo '           ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n"; exit(1); }
$html = $r['storage']['markup'];
$comprobar('emite data-cod-behavior="mapa"', strpos($html, 'data-cod-behavior="mapa"') !== false);
$comprobar('emite lat, lng y zoom como atributos', strpos($html, 'data-cod-mapa-lat="-33.80413625"') !== false && strpos($html, 'data-cod-mapa-lng="-70.68161682"') !== false && strpos($html, 'data-cod-mapa-zoom="17"') !== false);
$comprobar('emite el texto del globo y su enlace como atributos', strpos($html, 'data-cod-mapa-globo="Av 18 de Septiembre sn Hijuela 2, Fundo San Rafael, Paine"') !== false && strpos($html, 'data-cod-mapa-globo-enlace-href="https://www.econut.cl"') !== false && strpos($html, 'data-cod-mapa-globo-enlace-texto="www.econut.cl"') !== false);
$comprobar('el mini es un <a> con una <img> del propio sitio, con su alt y su tamaño', preg_match('#<a class="cod-mapa__mini" data-cod-mapa-rol="mini" href="https://www\.openstreetmap\.org/[^"]+" target="_blank" rel="noopener noreferrer"><img src="/wp-content/uploads/mini-mapa\.png" alt="Abrir el mapa de la planta de Paine" width="60" height="60" decoding="async"></a>#', $html) === 1);
$comprobar('el mini va ANTES de los hijos y la dirección escrita sigue dentro del grupo', preg_match('#data-cod-mapa-rol="mini".*Av 18 de Septiembre sn Hijuela 2, Paine#s', $html) === 1);
$comprobar('la imagen del mini no pide nada a un tercero (ni Mapbox ni su API estática)', strpos($html, 'api.mapbox.com') === false);
$comprobar('la CLAVE no queda en el HTML guardado', strpos($html, 'pk.') === false && strpos($html, 'data-cod-mapa-token') === false);
$comprobar('sin marcador propio no emite data-cod-mapa-marcador', strpos($html, 'data-cod-mapa-marcador') === false);
$comprobar('con la clave configurada no hay nota en omittedNodes', $r['summary']['omittedNodes'] === []);
$comprobar('el enlace «cómo llegar» es OpenStreetMap con las coordenadas', strpos($html, 'mlat=-33.804136') !== false && strpos($html, '#map=17/-33.804136/-70.681617') !== false);

$limpio = (new COD_Canvas_Document_Sanitizer())->sanitize_html($html);
$comprobar('el saneador del documento deja pasar el mapa TAL CUAL (el mini, el alt, el tamaño y los data-cod-mapa-*)', is_string($limpio) && $limpio === $html);
if (!is_string($limpio) || $limpio !== $html) { echo '           ' . (is_wp_error($limpio) ? $limpio->get_error_message() : 'el saneador cambió el HTML') . "\n"; }

$r2 = $compilador->compile($composicion([$mapa($datos(['marcador' => '/wp-content/uploads/pin.svg', 'zoom' => 9.5]))]), $diseno([$reglaMapa]));
$comprobar('con marcador propio y zoom decimal compila y emite ambos', !is_wp_error($r2) && strpos($r2['storage']['markup'], 'data-cod-mapa-marcador="/wp-content/uploads/pin.svg"') !== false && strpos($r2['storage']['markup'], 'data-cod-mapa-zoom="9.5"') !== false);
$sinZoom = $datos(); unset($sinZoom['zoom'], $sinZoom['etiqueta'], $sinZoom['globoEnlaceTexto'], $sinZoom['globoEnlaceHref']);
$r3 = $compilador->compile($composicion([$mapa($sinZoom)]), $diseno([$reglaMapa]));
$comprobar('sin zoom, sin etiqueta y sin enlace en el globo: zoom 17 y la etiqueta por omisión', !is_wp_error($r3) && strpos($r3['storage']['markup'], 'data-cod-mapa-zoom="17"') !== false && strpos($r3['storage']['markup'], 'alt="Abrir el mapa de ubicación"') !== false && strpos($r3['storage']['markup'], 'data-cod-mapa-globo-enlace') === false);

echo "\n== al MOSTRAR: la clave se pone entonces, no al compilar ==\n";
update_option(COD_Mapa::OPTION_KEY, $CLAVE, false);
$visto = COD_Mapa::resolver_en_html($html);
$comprobar('con clave: la raíz recibe data-cod-mapa-token', strpos($visto, 'data-cod-behavior="mapa" data-cod-mapa-token="' . $CLAVE . '"') !== false);
$comprobar('con clave: sigue el behavior (el runtime monta)', strpos($visto, 'data-cod-behavior="mapa"') !== false && strpos($visto, 'data-cod-mapa-sin-clave') === false);
$comprobar('el token se pone UNA vez y en la raíz, no en el mini', substr_count($visto, 'data-cod-mapa-token') === 1);
$comprobar('resolver dos veces da lo mismo (idempotente)', COD_Mapa::resolver_en_html($visto) === $visto);
update_option(COD_Mapa::OPTION_KEY, $CLAVE_OTRA, false);
$cambiado = COD_Mapa::resolver_en_html($visto);
$comprobar('cambiar la clave en Configuración llega sin recomponer (mismo HTML guardado)', strpos($cambiado, $CLAVE_OTRA) !== false && strpos($cambiado, $CLAVE . '"') === false && substr_count($cambiado, 'data-cod-mapa-token') === 1);
update_option(COD_Mapa::OPTION_KEY, '', false);
$sin = COD_Mapa::resolver_en_html($html);
$comprobar('sin clave: se quita el behavior y queda data-cod-mapa-sin-clave="1" (el runtime no monta)', strpos($sin, 'data-cod-behavior="mapa"') === false && strpos($sin, 'data-cod-mapa-sin-clave="1"') !== false);
$comprobar('sin clave: el mini SÍ se dibuja (es una imagen propia, no depende de nadie)', strpos($sin, '<img src="/wp-content/uploads/mini-mapa.png"') !== false && strpos($sin, 'data-cod-mapa-rol="mini"') !== false);
$comprobar('sin clave: la dirección escrita sigue a la vista', strpos($sin, 'Av 18 de Septiembre sn Hijuela 2, Paine') !== false);
$comprobar('sin clave, el HTML ya resuelto vuelve a tener la clave cuando se configura (la marca se recupera desde el guardado)', strpos(COD_Mapa::resolver_en_html($html), 'data-cod-mapa-sin-clave') !== false);
update_option(COD_Mapa::OPTION_KEY, 'sk.eyJ1IjoicHJ1ZWJhIn0.AbCdEfGhIjKlMnOpQrStUv', false);
$comprobar('una clave secreta que llegara a la base por otra vía NO se imprime (se trata como sin clave)', strpos(COD_Mapa::resolver_en_html($html), 'sk.') === false && COD_Mapa::clave() === null);
update_option(COD_Mapa::OPTION_KEY, $CLAVE, false);
$comprobar('una página sin mapa no se toca', COD_Mapa::resolver_en_html('<p>hola</p>') === '<p>hola</p>');

echo "\n== sin clave configurada al compilar: queda anotado ==\n";
update_option(COD_Mapa::OPTION_KEY, '', false);
$r = $compilador->compile($composicion([$mapa()]), $diseno([$reglaMapa]));
$comprobar('compila igual (el mini y la dirección son lo importante)', !is_wp_error($r) && strpos($r['storage']['markup'], 'data-cod-mapa-rol="mini"') !== false);
$nota = !is_wp_error($r) ? ($r['summary']['omittedNodes'][0] ?? null) : null;
$comprobar('summary.omittedNodes anota el mapa: nodo, behavior y por qué', is_array($nota) && $nota['nodeId'] === 'mapa-pie' && ($nota['behavior'] ?? '') === 'mapa' && strpos($nota['reason'], 'clave de Mapbox') !== false && strpos($nota['reason'], 'Configuración') !== false);
if (is_array($nota)) { echo '           ' . $nota['reason'] . "\n"; }
update_option(COD_Mapa::OPTION_KEY, $CLAVE, false);

echo "\n== compilador: validación de los datos (cada error nombra el campo) ==\n";
$malos = [
    'lat 91' => [['lat' => 91], 'lat'],
    'lat -91' => [['lat' => -91], 'lat'],
    'lat texto' => [['lat' => 'norte'], 'lat'],
    'lat ausente' => [['lat' => null], 'lat'],
    'lng 181' => [['lng' => 181], 'lng'],
    'lng -180.5' => [['lng' => -180.5], 'lng'],
    'lng texto' => [['lng' => '-70.68'], 'lng'],
    'zoom 23' => [['zoom' => 23], 'zoom'],
    'zoom -1' => [['zoom' => -1], 'zoom'],
    'zoom texto' => [['zoom' => 'cerca'], 'zoom'],
    'mini ausente' => [['mini' => null], 'mini'],
    'mini javascript:' => [['mini' => 'javascript:alert(1)'], 'mini'],
    'mini data:' => [['mini' => 'data:image/png;base64,AAAA'], 'mini'],
    'mini con comillas' => [['mini' => '/a.png" onerror="x'], 'mini'],
    'mini //otro-sitio' => [['mini' => '//otro.sitio/a.png'], 'mini'],
    'marcador javascript:' => [['marcador' => 'javascript:alert(1)'], 'marcador'],
    'etiqueta larga' => [['etiqueta' => str_repeat('a', 151)], 'etiqueta'],
    'globo ausente' => [['globo' => null], 'globo'],
    'globo vacío' => [['globo' => '   '], 'globo'],
    'globo de 301' => [['globo' => str_repeat('a', 301)], 'globo'],
    'enlace sin texto' => [['globoEnlaceTexto' => null], 'globoEnlaceTexto'],
    'enlace sin href' => [['globoEnlaceHref' => null], 'globoEnlaceHref'],
    'enlace javascript:' => [['globoEnlaceHref' => 'javascript:alert(1)'], 'globoEnlaceHref'],
    'campo inventado' => [['zoomMini' => 2], 'zoomMini'],
];
foreach ($malos as $caso => [$cambio, $campo]) {
    $content = $datos();
    foreach ($cambio as $k => $v) { if ($v === null) { unset($content[$k]); } else { $content[$k] = $v; } }
    $r = $compilador->compile($composicion([$mapa($content)]), $diseno([$reglaMapa]));
    $ok = $codigo($r) === 'cod_mcp_mapa_content_invalid' && strpos($mensaje($r), $campo) !== false;
    $comprobar($caso . ': cod_mcp_mapa_content_invalid y nombra «' . $campo . '»', $ok);
    if (!$ok) { echo '           ' . $codigo($r) . ': ' . $mensaje($r) . "\n"; }
}
foreach (['lat 91' => ['lat' => 91], 'zoom 23' => ['zoom' => 23], 'globoEnlaceHref' => ['globoEnlaceHref' => 'javascript:x']] as $caso => $cambio) {
    $r = $compilador->compile($composicion([$mapa($datos($cambio))]), $diseno([$reglaMapa]));
    if ($caso === 'lat 91' || $caso === 'zoom 23') { echo '           ' . $mensaje($r) . "\n"; }
}
foreach ([['lat', 90], ['lat', -90], ['lng', 180], ['lng', -180], ['zoom', 0], ['zoom', 22], ['lat', 0]] as [$campo, $valor]) {
    $r = $compilador->compile($composicion([$mapa($datos([$campo => $valor]))]), $diseno([$reglaMapa]));
    $comprobar('el borde ' . $campo . ' = ' . $valor . ' se acepta', !is_wp_error($r));
}
$vacio = $compilador->compile($composicion([['id' => 'mapa-pie', 'kind' => 'group', 'ruleIds' => ['r-mapa'], 'children' => $direccion]]), $diseno([$reglaMapa]));
$comprobar('un group con interaction.mapa y SIN content: cod_mcp_mapa_content_invalid', $codigo($vacio) === 'cod_mcp_mapa_content_invalid');
if (is_wp_error($vacio)) { echo '           ' . $vacio->get_error_message() . "\n"; }

echo "\n== compilador: destino ==\n";
$r = $compilador->compile($composicion([['id' => 'parrafo-mapa', 'kind' => 'paragraph', 'ruleIds' => ['r-mapa'], 'content' => ['text' => 'hola']]]), $diseno([$reglaMapa]));
$comprobar('en un paragraph (no group): cod_mcp_mapa_target_invalid', $codigo($r) === 'cod_mcp_mapa_target_invalid');
if (is_wp_error($r)) { echo '           ' . $r->get_error_message() . "\n"; }
$r = $compilador->compile($composicion([['id' => 'otra-seccion', 'kind' => 'section', 'ruleIds' => ['r-mapa'], 'children' => $direccion]]), $diseno([$reglaMapa]));
$comprobar('en una section (no group): cod_mcp_mapa_target_invalid', $codigo($r) === 'cod_mcp_mapa_target_invalid');
$r = $compilador->compile($composicion([['id' => 'grupo-comun', 'kind' => 'group', 'children' => $direccion, 'content' => $datos()]]), $diseno([]));
$comprobar('un group con content pero SIN la regla mapa sigue rechazado (la excepción es sólo del mapa)', $codigo($r) === 'cod_mcp_composition_content_invalid');

echo "\n== compilador: parámetros y conflictos ==\n";
foreach (['threshold' => 10, 'toggleClass' => 'abierto', 'mode' => 'single', 'visible' => 2, 'visibleMobile' => 1, 'zoom' => 5, 'token' => 'pk.x'] as $clave => $valor) {
    $r = $compilador->compile(
        $composicion([$mapa(null, ['r-con-parametro'])]),
        $diseno([$regla('r-con-parametro', 'interaction', ['behavior' => 'mapa', $clave => $valor])])
    );
    $comprobar('parámetro «' . $clave . '» en la regla: rechazado y nombrado', $codigo($r) === 'cod_mcp_interaction_rule_invalid' && strpos($mensaje($r), $clave) !== false);
}
$cuatro = [];
for ($i = 1; $i <= 4; $i++) { $cuatro[] = ['id' => 'hijo-' . $i, 'kind' => 'paragraph', 'content' => ['text' => 'texto ' . $i]]; }
foreach (['pestanas', 'marquesina', 'cuadrantes', 'aviso'] as $otro) {
    foreach ([['r-mapa', 'r-otro'], ['r-otro', 'r-mapa']] as $orden) {
        // cuatro hijos: lo que cuadrantes exige y lo que las demás aceptan, para que el conflicto sea lo único que falle.
        $r = $compilador->compile(
            $composicion([$mapa(null, $orden, 'group', ['children' => $cuatro])]),
            $diseno([$reglaMapa, $regla('r-otro', 'interaction', ['behavior' => $otro])])
        );
        $comprobar('mapa + ' . $otro . ' (' . implode(', ', $orden) . '): cod_mcp_behavior_conflict', $codigo($r) === 'cod_mcp_behavior_conflict');
    }
}
$r = $compilador->compile(
    $composicion([$mapa(null, ['r-mapa', 'r-mapa-2'])]),
    $diseno([$reglaMapa, $regla('r-mapa-2', 'interaction', ['behavior' => 'mapa'])])
);
$comprobar('dos mapas en el mismo nodo: cod_mcp_behavior_conflict', $codigo($r) === 'cod_mcp_behavior_conflict');

echo "\n== el texto del globo es texto: sale escapado, sin HTML ==\n";
$peligroso = '<script>alert(1)</script> <b>negrita</b> & "comillas" [www.econut.cl](https://www.econut.cl)';
$r = $compilador->compile($composicion([$mapa($datos(['globo' => $peligroso, 'etiqueta' => '<img src=x onerror=alert(1)>', 'globoEnlaceTexto' => '<i>x</i>']))]), $diseno([$reglaMapa]));
$comprobar('un globo con HTML compila (es texto: se escapa, no se rechaza)', !is_wp_error($r));
if (!is_wp_error($r)) {
    $h = $r['storage']['markup'];
    $comprobar('ninguna etiqueta del texto llega al HTML tal cual (<script, <b>, <img src=x, <i>)', strpos($h, '<script') === false && strpos($h, '<b>') === false && strpos($h, '<img src=x') === false && strpos($h, '<i>') === false);
    $comprobar('el globo está en un atributo con < > " & escapados', strpos($h, 'data-cod-mapa-globo="&lt;script&gt;alert(1)&lt;/script&gt; &lt;b&gt;negrita&lt;/b&gt; &amp; &quot;comillas&quot; [www.econut.cl](https://www.econut.cl)"') !== false);
    $comprobar('la etiqueta (alt del mini) también sale escapada', strpos($h, 'alt="&lt;img src=x onerror=alert(1)&gt;"') !== false);
    $comprobar('el enlace del globo NO es texto con corchetes: sólo se emite como atributos de un enlace de verdad (el runtime crea el <a>)', strpos($h, 'data-cod-mapa-globo-enlace-href="https://www.econut.cl"') !== false);
}

echo "\n== variables por regla properties y partes ==\n";
$medidas = $regla('r-medidas', 'properties', ['declarations' => ['--cod-mapa-alto' => '400px', '--cod-mapa-ancho-maximo' => '1280px']]);
$angosto = $regla('r-movil', 'properties', ['declarations' => ['--cod-mapa-alto' => '18rem']], 'mobile');
$r = $compilador->compile($composicion([$mapa(null, ['r-mapa', 'r-medidas', 'r-movil'])]), $diseno([$reglaMapa, $medidas, $angosto]));
$comprobar('las variables --cod-mapa-* compilan por properties, con scope.breakpoint', !is_wp_error($r));
if (!is_wp_error($r)) {
    $estilos = $r['storage']['styles'];
    $comprobar('emite alto y ancho máximo en la regla del nodo', preg_match('/\.cod-rule--r-medidas\{[^}]*--cod-mapa-alto:\s*400px;[^}]*--cod-mapa-ancho-maximo:\s*1280px/', $estilos) === 1);
    $comprobar('el alto por breakpoint sale del @media del compilador (móvil)', preg_match('/@media\(max-width:767px\)\{\.cod-rule--r-movil\{[^}]*--cod-mapa-alto:\s*18rem/', $estilos) === 1);
}
$radio = $regla('r-radio', 'shape', ['radius' => '8px']);
$sombra = $regla('r-fondo', 'surface', ['backgroundColor' => '#ffffff']);
$equis = $regla('r-x', 'properties', ['declarations' => ['width' => '3rem']]);
$r = $compilador->compile(
    $composicion([$mapa(null, ['r-mapa'], 'group', ['partes' => ['mini' => ['r-radio'], 'grande' => ['r-radio', 'r-fondo'], 'cerrar' => ['r-x']]])]),
    $diseno([$reglaMapa, $radio, $sombra, $equis])
);
$comprobar('las partes mini, grande y cerrar aceptan reglas', !is_wp_error($r));
if (is_wp_error($r)) { echo '           ' . $r->get_error_code() . ': ' . $r->get_error_message() . "\n"; }
else {
    foreach (['mini', 'grande', 'cerrar'] as $parte) {
        $comprobar('la regla de ' . $parte . ' se emite como descendiente anclado al nodo', strpos($r['storage']['styles'], '.cod-node-id-mapa-pie [data-cod-mapa-rol="' . $parte . '"]') !== false);
    }
}
$r = $compilador->compile(
    $composicion([$mapa(null, ['r-mapa'], 'group', ['partes' => ['pin' => ['r-radio']]])]),
    $diseno([$reglaMapa, $radio])
);
$comprobar('una parte inventada se rechaza nombrando las válidas', $codigo($r) === 'cod_mcp_composition_partes_invalid' && strpos($mensaje($r), 'mini, grande, cerrar') !== false);

echo "\n== catálogo de capacidades ==\n";
$json = wp_json_encode($compilador->capability_catalog(), JSON_UNESCAPED_UNICODE);
$comprobar('safeRuntimeBehaviors incluye mapa', preg_match('/safeRuntimeBehaviors.{0,300}"mapa"/s', $json) === 1);
$comprobar('interaction.behavior incluye mapa', preg_match('/"behavior":\[[^\]]*"aviso","mapa"\]/', $json) === 1);
$comprobar('constraints describe mapa y dice dónde va la clave', strpos($json, 'mapa sólo en un nodo group') !== false && strpos($json, 'Configuración → «Mapa (Mapbox)»') !== false && strpos($json, 'NO va en la composición') !== false);
$comprobar('constraints dice que no admite parámetros de la regla', strpos($json, 'mapa no admite threshold, targetId, toggleClass, mode, visible ni visibleMobile') !== false);
$comprobar('nodeContentSchemas documenta group+mapa con sus campos', strpos($json, '"group+mapa"') !== false && strpos($json, 'globoEnlaceHref') !== false && strpos($json, 'scripts\/generar-mini-mapa.mjs') !== false);
$comprobar('behaviorContracts lista las partes mini, grande y cerrar', preg_match('/"mapa":\{"atributoRol":"data-cod-mapa-rol","partes":\{"mini":.*"grande":.*"cerrar":/s', $json) === 1);
$comprobar('la descripción de «partes» menciona mapa', strpos($json, 'aviso y mapa). Mapa parte') !== false);

echo "\n== la clave: qué se acepta ==\n";
$comprobar('una clave pública (pk.) se acepta', COD_Mapa::clave_valida($CLAVE) === $CLAVE);
$sk = COD_Mapa::clave_valida('sk.eyJ1IjoicHJ1ZWJhIn0.AbCdEfGhIjKlMnOpQrStUv');
$comprobar('una clave secreta (sk.) se rechaza y el motivo lo dice', is_wp_error($sk) && $sk->get_error_code() === 'cod_mapa_clave_secreta' && strpos($sk->get_error_message(), 'secreta') !== false && strpos($sk->get_error_message(), 'pública') !== false);
foreach (['pk.', 'pk.corta.corta', 'hola', 'pk.eyJ1IjoicHJ1ZWJh AbCd.AbCdEfGhIjKlMnOpQ', "pk.eyJ1IjoicHJ1ZWJhIn0.AbCdEfGhIjKlMnOpQ\n", 'PK.eyJ1IjoicHJ1ZWJhIn0.AbCdEfGhIjKlMnOpQ', 'pk.' . str_repeat('a', 400) . '.bbbbbbbbbbbb'] as $mala) {
    $comprobar('«' . substr(str_replace("\n", '\n', $mala), 0, 30) . '…» se rechaza', is_wp_error(COD_Mapa::clave_valida($mala)));
}
[$g, $e] = COD_Mapa::procesar_envio("  \n" . $CLAVE_OTRA . "\r\n ", $CLAVE);
$comprobar('lo pegado con espacios y saltos de línea en los extremos se limpia y se guarda', $g === $CLAVE_OTRA && $e === '');
[$g, $e] = COD_Mapa::procesar_envio('hola', $CLAVE);
$comprobar('una clave inválida NO pisa la anterior y dice por qué', $g === $CLAVE && $e !== '');
[$g, $e] = COD_Mapa::procesar_envio('sk.eyJ1IjoicHJ1ZWJhIn0.AbCdEfGhIjKlMnOpQrStUv', $CLAVE);
$comprobar('una secreta pegada por error NO se guarda: se conserva la anterior', $g === $CLAVE && strpos($e, 'secreta') !== false);
[$g, $e] = COD_Mapa::procesar_envio('', $CLAVE);
$comprobar('vacío borra la clave (cierra el mapa grande, el mini sigue)', $g === '' && $e === '');
$comprobar('url_como_llegar: dirección de OpenStreetMap con las coordenadas', COD_Mapa::url_como_llegar(-33.80413624737442, -70.68161681668681, 17.0) === 'https://www.openstreetmap.org/?mlat=-33.804136&mlon=-70.681617#map=17/-33.804136/-70.681617');
$comprobar('url_como_llegar: el cero y los enteros no dejan ceros de sobra', COD_Mapa::url_como_llegar(0.0, 100.0, 2.0) === 'https://www.openstreetmap.org/?mlat=0&mlon=100#map=2/0/100');

echo "\n== Configuración: el campo y la ayuda ==\n";
$admin = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
if ($admin !== []) { wp_set_current_user((int) $admin[0]); }
update_option(COD_Mapa::OPTION_KEY, $CLAVE, false);
ob_start();
try { (new COD_Settings_Admin())->render_page(); } catch (Throwable $e) { echo '[[' . $e->getMessage() . ']]'; }
$pantalla = (string) ob_get_clean();
$comprobar('la pantalla de Configuración se dibuja', strlen($pantalla) > 2000);
$comprobar('trae la sección «Mapa (Mapbox)» y el campo cod_mapbox_token con la clave guardada', strpos($pantalla, 'Mapa (Mapbox)') !== false && strpos($pantalla, 'name="cod_mapbox_token"') !== false && strpos($pantalla, 'value="' . $CLAVE . '"') !== false);
$comprobar('la ayuda dice que conviene restringir la clave al dominio del sitio desde el panel de Mapbox', strpos($pantalla, 'restringir la clave al dominio de este sitio desde el panel de') !== false && strpos($pantalla, 'cualquiera puede gastar tu cuota') !== false);
$comprobar('el formulario lleva su acción y su nonce', strpos($pantalla, 'value="cod_save_mapbox"') !== false);
$comprobar('la acción de guardar está registrada', has_action('admin_post_cod_save_mapbox') !== false);

echo "\n== mapa_css() ==\n";
$css = COD_Canvas_Page_Publisher::mapa_css();
$comprobar('con html null emite la hoja', $css !== '');
$comprobar('sin mención en la página no emite nada', COD_Canvas_Page_Publisher::mapa_css('<div>hola</div>') === '');
$comprobar('la palabra «mapa» en un texto no basta: hace falta declarar el behavior', COD_Canvas_Page_Publisher::mapa_css('<p>El mapa del sitio</p>') === '');
$comprobar('con el behavior declarado emite la hoja', COD_Canvas_Page_Publisher::mapa_css('<div data-cod-behavior="mapa"></div>') === $css);

preg_match_all('/([^{}@]+)\{([^{}]*)\}/', $css, $reglas, PREG_SET_ORDER);
$sinAnclar = [];
foreach ($reglas as $parte) {
    if (strpos($parte[1], '.cod-mapa') === false) { $sinAnclar[] = trim($parte[1]); }
}
$comprobar('hay reglas que mirar (' . count($reglas) . ')', count($reglas) >= 12);
$comprobar('toda regla cuelga de .cod-mapa (que sólo pone el runtime) salvo UNA: la imagen del mini hereda el radio', count($sinAnclar) === 1 && $sinAnclar[0] === '[data-cod-behavior="mapa"] > [data-cod-mapa-rol="mini"] > img');
if (count($sinAnclar) !== 1) { echo '           sueltas: ' . implode(' | ', $sinAnclar) . "\n"; }
$ocultan = [];
foreach ($reglas as $parte) {
    if (preg_match('/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0\b/', $parte[2]) === 1) { $ocultan[] = trim($parte[1]); }
}
$comprobar('lo único que oculta es el estado (cerrado→grande, abierto→mini) y el aviso ya listo; nada sin runtime', count($ocultan) === 3
    && strpos($ocultan[0], '[data-cod-mapa-estado="cerrado"] > .cod-mapa__grande') !== false
    && strpos($ocultan[1], '[data-cod-mapa-estado="abierto"] > .cod-mapa__mini') !== false
    && strpos($ocultan[2], '.cod-mapa__estado[hidden]') !== false);
$comprobar('la imagen del mini no se recorta (object-fit:contain, nunca cover): la atribución de Mapbox viene dentro', strpos($css, 'object-fit:contain') !== false && stripos($css, 'cover') === false);
$comprobar('el mini mide 60x60 por omisión y no se encoge', strpos($css, 'flex-shrink:0;width:60px;height:60px') !== false);
$comprobar('el alto y el ancho máximo salen de --cod-mapa-alto (25rem) y --cod-mapa-ancho-maximo (80rem)', strpos($css, 'height:var(--cod-mapa-alto,25rem)') !== false && strpos($css, 'max-width:var(--cod-mapa-ancho-maximo,80rem)') !== false);
$comprobar('la X mide al menos 44px (2.75rem) por omisión', strpos($css, 'width:2.75rem;height:2.75rem') !== false);
$comprobar('el recuadro usa colores del sistema (Canvas y CanvasText), no de marca', strpos($css, 'background-color:Canvas;color:CanvasText') !== false);
$comprobar('sin colores de marca (ningún #hex ni rgb/hsl)', preg_match('/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/', $css) === 0);
$comprobar('sin var(--cod-color-*, respaldo): el set de diseño es cerrado', strpos($css, '--cod-color-') === false);
$comprobar('sin tipografía (ningún font-*)', strpos($css, 'font') === false);
$comprobar('sin degradados', stripos($css, 'gradient') === false);
$comprobar('sin radio ni sombra inventados (son del diseño del sitio)', strpos($css, 'border-radius:inherit') !== false && substr_count($css, 'border-radius') === 1 && strpos($css, 'box-shadow') === false);
$comprobar('sin animación ni transición (el movimiento lo decide el runtime y respeta prefers-reduced-motion)', stripos($css, 'animation') === false && stripos($css, 'transition') === false && stripos($css, '@keyframes') === false);
$comprobar('sin abreviadas con variable (background/border/font/margin/padding: ... var())', preg_match('/(?<![-\w])(background|border|font|margin|padding)\s*:[^;}]*var\(/', $css) === 0);
$comprobar('valores por omisión con especificidad cero (:where)', substr_count($css, ':where(') >= 5);
echo '           tamaño de la hoja: ' . strlen($css) . " bytes\n";

echo "\n== la conducta llega a la página ==\n";
$fuente = file_get_contents(__DIR__ . '/../contope-publisher/includes/class-cod-canvas-page-publisher.php');
$comprobar('mapa_css() se emite en las dos rutas (plantilla y shortcode)', substr_count($fuente, 'self::mapa_css($header_html . $body_html . $footer_html)') === 2);
$comprobar('la clave se resuelve al mostrar (COD_Mapa::resolver_en_html en el render de la página)', substr_count($fuente, 'COD_Mapa::resolver_en_html($markup)') === 1);
$comprobar('la versión del plugin es 0.3.47', COD_PUBLISHER_VERSION === '0.3.47');

echo $fallas === 0 ? "\nTODO OK\n" : "\n" . $fallas . " FALLA(S)\n";
exit($fallas === 0 ? 0 : 1);
