<?php
/**
 * El módulo de fondos de la regla `surface` (0.3.83): degradado, trama y máscara,
 * además de lo que ya había (color, imagen, velo).
 *
 * Lo que se mide:
 *  - COMPATIBILIDAD BYTE A BYTE: 17 reglas viejas (fixtures/fondos-reglas-viejas.json,
 *    sacadas del compilador 0.3.82 antes de tocarlo) producen exactamente el mismo
 *    CSS y el mismo HTML. Econut y Santa Luisa están publicados con ellas.
 *  - VALIDACIÓN: se aceptan los casos válidos y se rechaza el CSS crudo, un url(
 *    metido en un color, más de 8 paradas, un ángulo en un radial, una forma de
 *    otro servidor, etc., nombrando el campo.
 *  - CSS EMITIDO para los tres degradados reales de Basis (portada, aviso naranja,
 *    radial), el orden de capas con la imagen, la trama, la máscara y sus
 *    combinaciones con el velo.
 *  - Que el catálogo publique los campos nuevos y el validador los acepte.
 *
 * Corre contra el WordPress local de Basis (puerto 8894, con el plugin del
 * repositorio copiado). Nunca contra wp-local ni contra Econut.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$fallas = 0;
$total = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas, &$total) {
    $total++;
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? "   $detalle" : '') . "\n";
    if (!$ok) {
        $fallas++;
    }
};

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());
$composicion = [
    'schemaVersion' => 2,
    'nodes' => [[
        'id' => 'aviso',
        'kind' => 'section',
        'ruleIds' => ['fondo'],
        'children' => [['id' => 'texto', 'kind' => 'paragraph', 'content' => ['text' => 'Aviso']]],
    ]],
];
/** Compila una superficie. Devuelve el resultado completo o el WP_Error. */
$compilar = static function (array $valor, ?array $scope = null) use ($compilador, $composicion) {
    return $compilador->compile($composicion, [
        'schemaVersion' => 1, 'designId' => 'golden-fondos', 'expectedDesignRevision' => 0, 'reviewState' => 'session',
        'rules' => [[
            'id' => 'fondo', 'kind' => 'surface',
            'scope' => $scope ?? ['breakpoint' => 'all', 'state' => 'default'],
            'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba de fondos.']]],
            'status' => 'reviewed', 'value' => $valor,
        ]],
    ]);
};
/** Todo el CSS emitido, o 'ERROR: …'. */
$css = static function (array $valor) use ($compilar): string {
    $r = $compilar($valor);
    return is_wp_error($r) ? 'ERROR: ' . $r->get_error_message() : (string) $r['storage']['styles'];
};
/** El cuerpo de la regla .cod-rule--fondo. */
$cuerpo = static function (string $todo): string {
    return preg_match('/\.cod-rule--fondo\{([^}]*)\}/', $todo, $m) === 1 ? $m[1] : 'SIN CUERPO: ' . $todo;
};
$cuerpoDe = static fn (array $valor): string => $cuerpo($css($valor));
$rechaza = static function (string $caso, array $valor, string $campo) use ($compilar, $comprobar): void {
    $r = $compilar($valor);
    $m = is_wp_error($r) ? $r->get_error_message() : '';
    $comprobar($caso, is_wp_error($r) && stripos($m, $campo) !== false, is_wp_error($r) ? "mensaje: $m" : 'se aceptó');
};

$URL = '/wp-content/uploads/2025/07/portada.jpg';
$AZUL = ['color' => 'rgb(12, 113, 195)', 'at' => '0%'];
$TRANSP = ['color' => 'rgba(255, 255, 255, 0)', 'at' => '100%'];

// ---------------------------------------------------------------------------
echo "\n== compatibilidad: lo de antes sale idéntico, byte a byte ==\n";
$golden = json_decode((string) file_get_contents(__DIR__ . '/../fixtures/fondos-reglas-viejas.json'), true);
$comprobar('el archivo de referencia (del plugin 0.3.82) se lee', is_array($golden) && count($golden['casos'] ?? []) >= 17);
foreach ($golden['casos'] ?? [] as $caso) {
    $r = $compilar($caso['value'], $caso['scope']);
    $igual = !is_wp_error($r) && (string) $r['storage']['styles'] === $caso['css'] && (string) $r['storage']['markup'] === $caso['markup'];
    $comprobar('igual que 0.3.82: ' . $caso['nombre'], $igual, is_wp_error($r) ? $r->get_error_message() : substr((string) $r['storage']['styles'], 0, 400));
}

// ---------------------------------------------------------------------------
echo "\n== los tres degradados reales de Basis ==\n";
// 1. Portada: azul → transparente ENCIMA de la foto.
$c = $cuerpoDe([
    'backgroundAssetUrl' => $URL,
    'backgroundGradient' => ['type' => 'linear', 'stops' => [$AZUL, $TRANSP]],
]);
$comprobar(
    'portada: linear-gradient(azul 0%, transparente 100%), url(foto)',
    $c === 'background-image:linear-gradient(rgb(12, 113, 195) 0%, rgba(255, 255, 255, 0) 100%),url("' . $URL . '");'
        . 'background-repeat:no-repeat,no-repeat;background-position:center,center;background-size:cover,cover;',
    $c
);
// 2. Aviso naranja: negro → transparente a 65° sobre el color naranja.
$c = $cuerpoDe([
    'backgroundColor' => '#F58220',
    'backgroundGradient' => ['type' => 'linear', 'angle' => '65deg', 'stops' => [['color' => 'rgb(0, 0, 0)', 'at' => '0%'], $TRANSP]],
]);
$comprobar(
    'aviso naranja: 65deg, negro 0% → transparente 100% sobre color plano',
    $c === 'background-color:#F58220;background-image:linear-gradient(65deg, rgb(0, 0, 0) 0%, rgba(255, 255, 255, 0) 100%);',
    $c
);
// 3. Radial de otro sitio.
$c = $cuerpoDe([
    'backgroundGradient' => ['type' => 'radial', 'shape' => 'circle', 'at' => '0% 0%', 'stops' => [
        ['color' => 'rgba(214, 218, 255, 0.7)', 'at' => '50%'], ['color' => 'rgba(214, 218, 255, 0.3)', 'at' => '100%'],
    ]],
]);
$comprobar(
    'radial: circle at 0% 0%, rgba(…, 0.7) 50%, rgba(…, 0.3) 100%',
    $c === 'background-image:radial-gradient(circle at 0% 0%, rgba(214, 218, 255, 0.7) 50%, rgba(214, 218, 255, 0.3) 100%);',
    $c
);

// ---------------------------------------------------------------------------
echo "\n== orden de capas con la imagen y el velo ==\n";
$grad = ['type' => 'linear', 'stops' => [$AZUL, $TRANSP]];
$g = 'linear-gradient(rgb(12, 113, 195) 0%, rgba(255, 255, 255, 0) 100%)';
$c = $cuerpoDe(['backgroundAssetUrl' => $URL, 'backgroundGradient' => $grad, 'gradientPlacement' => 'below']);
$comprobar(
    'gradientPlacement below: la foto arriba y el degradado debajo',
    $c === 'background-image:url("' . $URL . '"),' . $g . ';background-repeat:no-repeat,no-repeat;background-position:center,center;background-size:cover,cover;',
    $c
);
$c = $cuerpoDe(['backgroundAssetUrl' => $URL, 'backgroundGradient' => $grad, 'gradientPlacement' => 'above']);
$comprobar('gradientPlacement above es lo mismo que omitirlo', $c === $cuerpoDe(['backgroundAssetUrl' => $URL, 'backgroundGradient' => $grad]), $c);
$velo = 'color-mix(in srgb,#000000 40%,transparent)';
$c = $cuerpoDe(['backgroundAssetUrl' => $URL, 'backgroundGradient' => $grad, 'overlayColor' => '#000000', 'overlayOpacity' => 0.4,
    'backgroundSize' => '50% auto', 'backgroundPosition' => '2% 50%']);
$comprobar(
    'velo + degradado + foto con medidas: tres capas alineadas, el velo siempre arriba',
    $c === 'background-image:linear-gradient(' . $velo . ',' . $velo . '),' . $g . ',url("' . $URL . '");'
        . 'background-repeat:no-repeat,no-repeat,no-repeat;background-position:50% 50%,50% 50%,2% 50%;background-size:cover,cover,50% auto;',
    $c
);
$c = $cuerpoDe(['backgroundGradient' => $grad, 'overlayColor' => '#000000', 'overlayOpacity' => 0.4]);
$comprobar('degradado + velo sin imagen: el degradado en el fondo y el velo como ::before (como siempre)',
    $c === 'background-image:' . $g . ';' && strpos($css(['backgroundGradient' => $grad, 'overlayColor' => '#000000']), '::before{content:""') !== false, $c);
$c = $cuerpoDe(['backgroundGradient' => ['type' => 'linear', 'repeating' => true, 'angle' => '45deg', 'stops' => [['color' => '#000', 'at' => '0px'], ['color' => '#fff', 'at' => '10px']]]]);
$comprobar('repeating-linear-gradient', $c === 'background-image:repeating-linear-gradient(45deg, #000 0px, #fff 10px);', $c);
$c = $cuerpoDe(['backgroundGradient' => ['type' => 'radial', 'at' => 'center', 'stops' => [['color' => 'var(--cod-color-accent)'], ['color' => 'hsla(10, 20%, 30%, 0.5)']]]]);
$comprobar('radial sin forma; paradas sin posición; var() y hsla()', $c === 'background-image:radial-gradient(at center, var(--cod-color-accent), hsla(10, 20%, 30%, 0.5));', $c);
foreach (['background:', 'background-image:linear'] as $abreviada) {
    // Que ninguno emita la abreviada `background:` (GrapesJS la pierde con var()).
    $todo = $css(['backgroundColor' => '#fff', 'backgroundAssetUrl' => $URL, 'backgroundGradient' => $grad]);
    $comprobar('no emite la abreviada «' . $abreviada . '» sola', $abreviada === 'background:' ? preg_match('/[;{]background:/', $todo) === 0 : strpos($todo, $abreviada) !== false);
}

// ---------------------------------------------------------------------------
echo "\n== trama y máscara ==\n";
$FORMA = '/wp-content/uploads/formas/onda.svg';
$TRAMA = '/wp-content/uploads/formas/trama-puntos.svg';
$todo = $css(['backgroundColor' => '#0C71C3', 'backgroundPattern' => ['assetUrl' => $TRAMA, 'color' => '#ffffff', 'size' => '24px', 'opacity' => 0.3]]);
$comprobar('trama: ::before con color, mask-image, repetición y baldosa',
    strpos($todo, '.cod-rule--fondo::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background-color:#ffffff;'
        . '-webkit-mask-image:url("' . $TRAMA . '");mask-image:url("' . $TRAMA . '");-webkit-mask-repeat:repeat;mask-repeat:repeat;'
        . '-webkit-mask-size:24px;mask-size:24px;-webkit-mask-position:0 0;mask-position:0 0;opacity:0.3;}') !== false, $todo);
$comprobar('trama: la superficie se aísla y el contenido sube sobre ella',
    strpos($cuerpo($todo), 'isolation:isolate;') !== false && strpos($todo, ':where(.cod-rule--fondo)>*{position:relative;z-index:1;}') !== false, $todo);
$todo = $css(['backgroundMask' => ['assetUrl' => $FORMA, 'color' => '#F58220', 'flip' => 'vertical']]);
$comprobar('máscara: ::after, sin repetir, a toda la caja, volteada',
    strpos($todo, '.cod-rule--fondo::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background-color:#F58220;'
        . '-webkit-mask-image:url("' . $FORMA . '");mask-image:url("' . $FORMA . '");-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;'
        . '-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-position:center;mask-position:center;transform:scale(1,-1);}') !== false, $todo);
foreach (['horizontal' => 'scale(-1,1)', 'both' => 'scale(-1,-1)'] as $flip => $t) {
    $todo = $css(['backgroundMask' => ['assetUrl' => $FORMA, 'color' => '#fff', 'flip' => $flip]]);
    $comprobar('flip ' . $flip, strpos($todo, 'transform:' . $t . ';') !== false, $todo);
}
$todo = $css(['backgroundMask' => ['assetUrl' => $FORMA, 'color' => '#fff', 'flip' => 'none', 'size' => '100% 120px', 'position' => 'bottom']]);
$comprobar('flip none no transforma; size y position se respetan',
    strpos($todo, 'transform:') === false && strpos($todo, 'mask-size:100% 120px;') !== false && strpos($todo, 'mask-position:bottom;') !== false, $todo);
$comprobar('una máscara sin trama no emite ::before', strpos($todo, '::before') === false);
$todo = $css([
    'backgroundColor' => '#0C71C3', 'backgroundAssetUrl' => $URL, 'backgroundGradient' => $grad,
    'overlayColor' => '#000000', 'overlayOpacity' => 0.4,
    'backgroundPattern' => ['assetUrl' => $TRAMA, 'color' => '#fff'], 'backgroundMask' => ['assetUrl' => $FORMA, 'color' => '#F58220'],
]);
$comprobar('todo junto: capas de fondo (velo, degradado, foto) + ::before + ::after',
    strpos($cuerpo($todo), 'background-image:linear-gradient(' . $velo . ',' . $velo . '),' . $g . ',url("' . $URL . '");') !== false
    && strpos($todo, '::before{') !== false && strpos($todo, '::after{') !== false, $todo);
$comprobar('con trama o máscara el velo YA NO usa ::before propio con opacidad',
    strpos($todo, '::before{content:"";position:absolute;inset:0;background-color:#000000;opacity') === false, $todo);
$todo = $css(['overlayColor' => '#112233', 'overlayOpacity' => 0.5, 'backgroundMask' => ['assetUrl' => $FORMA, 'color' => '#fff']]);
$comprobar('velo + máscara sin imagen: el velo pasa a capa de fondo',
    strpos($cuerpo($todo), 'background-image:linear-gradient(color-mix(in srgb,#112233 50%,transparent),color-mix(in srgb,#112233 50%,transparent));') !== false, $todo);
$todo = $compilar(['backgroundMask' => ['assetUrl' => $FORMA, 'color' => '#fff']], ['breakpoint' => 'mobile', 'state' => 'default']);
$comprobar('en celular se envuelve en su media query, también los pseudo-elementos',
    !is_wp_error($todo) && preg_match('/@media[^{]*\{[^@]*\.cod-rule--fondo::after\{/', (string) $todo['storage']['styles']) === 1);

// ---------------------------------------------------------------------------
echo "\n== validación: lo válido pasa ==\n";
$validos = [
    'degradado mínimo (2 paradas)' => ['backgroundGradient' => ['type' => 'linear', 'stops' => [['color' => '#000'], ['color' => '#fff']]]],
    'degradado de 8 paradas' => ['backgroundGradient' => ['type' => 'linear', 'stops' => array_fill(0, 8, ['color' => '#123456', 'at' => '10%'])]],
    'ángulo negativo y decimal' => ['backgroundGradient' => ['type' => 'linear', 'angle' => '-12.5deg', 'stops' => [['color' => '#000'], ['color' => '#fff']]]],
    'parada en px' => ['backgroundGradient' => ['type' => 'linear', 'stops' => [['color' => '#000', 'at' => '0'], ['color' => '#fff', 'at' => '120px']]]],
    'radial ellipse con palabras' => ['backgroundGradient' => ['type' => 'radial', 'shape' => 'ellipse', 'at' => 'top left', 'stops' => [['color' => '#000'], ['color' => '#fff']]]],
    'trama PNG' => ['backgroundPattern' => ['assetUrl' => '/wp-content/uploads/formas/malla.png', 'color' => 'var(--cod-color-ink)']],
    'máscara con todo' => ['backgroundMask' => ['assetUrl' => $FORMA, 'color' => '#fff', 'size' => 'cover', 'position' => '50% 100%', 'flip' => 'both', 'opacity' => 0]],
    'solo máscara (sin otro tratamiento)' => ['backgroundMask' => ['assetUrl' => $FORMA, 'color' => '#fff']],
];
foreach ($validos as $nombre => $valor) {
    $r = $compilar($valor);
    $comprobar($nombre, !is_wp_error($r), is_wp_error($r) ? $r->get_error_message() : '');
}

echo "\n== validación: lo inválido se rechaza nombrando el campo ==\n";
$p2 = [['color' => '#000'], ['color' => '#fff']];
$rechaza('CSS crudo en vez de la estructura', ['backgroundGradient' => 'linear-gradient(red, blue)'], 'backgroundGradient');
$rechaza('clave desconocida', ['backgroundGradient' => ['type' => 'linear', 'stops' => $p2, 'css' => 'x']], 'backgroundGradient');
$rechaza('type inventado', ['backgroundGradient' => ['type' => 'conic', 'stops' => $p2]], 'backgroundGradient.type');
$rechaza('sin paradas', ['backgroundGradient' => ['type' => 'linear']], 'backgroundGradient.stops');
$rechaza('una sola parada', ['backgroundGradient' => ['type' => 'linear', 'stops' => [['color' => '#000']]]], 'backgroundGradient.stops');
$rechaza('nueve paradas', ['backgroundGradient' => ['type' => 'linear', 'stops' => array_fill(0, 9, ['color' => '#000'])]], 'backgroundGradient.stops');
$rechaza('url( dentro de un color', ['backgroundGradient' => ['type' => 'linear', 'stops' => [['color' => 'url(http://x/y.png)'], ['color' => '#fff']]]], 'stops[0].color');
$rechaza('color con punto y coma y otra declaración', ['backgroundGradient' => ['type' => 'linear', 'stops' => [['color' => '#000'], ['color' => 'red; background:url(x)']]]], 'stops[1].color');
$rechaza('color con paréntesis anidados', ['backgroundGradient' => ['type' => 'linear', 'stops' => [['color' => 'rgb(calc(1),2,3)'], ['color' => '#fff']]]], 'stops[0].color');
$rechaza('posición con calc()', ['backgroundGradient' => ['type' => 'linear', 'stops' => [['color' => '#000', 'at' => 'calc(10% + 2px)'], ['color' => '#fff']]]], 'stops[0].at');
$rechaza('clave de más en una parada', ['backgroundGradient' => ['type' => 'linear', 'stops' => [['color' => '#000', 'hint' => '50%'], ['color' => '#fff']]]], 'stops[0]');
$rechaza('ángulo en un radial', ['backgroundGradient' => ['type' => 'radial', 'angle' => '45deg', 'stops' => $p2]], 'backgroundGradient.angle');
$rechaza('forma en un lineal', ['backgroundGradient' => ['type' => 'linear', 'shape' => 'circle', 'stops' => $p2]], 'backgroundGradient.shape');
$rechaza('at en un lineal', ['backgroundGradient' => ['type' => 'linear', 'at' => 'center', 'stops' => $p2]], 'backgroundGradient.at');
$rechaza('ángulo sin unidad', ['backgroundGradient' => ['type' => 'linear', 'angle' => '65', 'stops' => $p2]], 'backgroundGradient.angle');
$rechaza('ángulo con inyección', ['backgroundGradient' => ['type' => 'linear', 'angle' => '65deg);background:url(x', 'stops' => $p2]], 'backgroundGradient.angle');
$rechaza('at con var()', ['backgroundGradient' => ['type' => 'radial', 'at' => 'var(--x)', 'stops' => $p2]], 'backgroundGradient.at');
$rechaza('repeating que no es booleano', ['backgroundGradient' => ['type' => 'linear', 'repeating' => 'si', 'stops' => $p2]], 'backgroundGradient.repeating');
$rechaza('gradientPlacement sin degradado', ['backgroundAssetUrl' => $URL, 'gradientPlacement' => 'below'], 'gradientPlacement');
$rechaza('gradientPlacement sin imagen', ['backgroundGradient' => ['type' => 'linear', 'stops' => $p2], 'gradientPlacement' => 'below'], 'gradientPlacement');
$rechaza('gradientPlacement inventado', ['backgroundAssetUrl' => $URL, 'backgroundGradient' => ['type' => 'linear', 'stops' => $p2], 'gradientPlacement' => 'middle'], 'gradientPlacement');
foreach (['backgroundPattern', 'backgroundMask'] as $campo) {
    $rechaza($campo . ': CSS crudo', [$campo => 'url(x.svg)'], $campo);
    $rechaza($campo . ': sin assetUrl', [$campo => ['color' => '#fff']], $campo . '.assetUrl');
    $rechaza($campo . ': sin color', [$campo => ['assetUrl' => $FORMA]], $campo . '.color');
    $rechaza($campo . ': forma de otro servidor', [$campo => ['assetUrl' => 'https://otro.example/forma.svg', 'color' => '#fff']], $campo . '.assetUrl');
    $rechaza($campo . ': ruta sin protocolo', [$campo => ['assetUrl' => '//otro.example/forma.svg', 'color' => '#fff']], $campo . '.assetUrl');
    $rechaza($campo . ': extensión que no es imagen', [$campo => ['assetUrl' => '/wp-content/uploads/forma.php', 'color' => '#fff']], $campo . '.assetUrl');
    $rechaza($campo . ': paréntesis en la ruta', [$campo => ['assetUrl' => '/wp-content/uploads/a(1).svg', 'color' => '#fff']], $campo . '.assetUrl');
    $rechaza($campo . ': comillas en la ruta', [$campo => ['assetUrl' => '/wp-content/uploads/a".svg', 'color' => '#fff']], $campo . '.assetUrl');
    $rechaza($campo . ': subir de carpeta', [$campo => ['assetUrl' => '/wp-content/../wp-config.svg', 'color' => '#fff']], $campo . '.assetUrl');
    $rechaza($campo . ': color con url(', [$campo => ['assetUrl' => $FORMA, 'color' => 'url(x)']], $campo . '.color');
    $rechaza($campo . ': size inválido', [$campo => ['assetUrl' => $FORMA, 'color' => '#fff', 'size' => 'calc(1px)']], $campo . '.size');
    $rechaza($campo . ': position inválida', [$campo => ['assetUrl' => $FORMA, 'color' => '#fff', 'position' => '1px 2px 3px']], $campo . '.position');
    $rechaza($campo . ': opacidad fuera de rango', [$campo => ['assetUrl' => $FORMA, 'color' => '#fff', 'opacity' => 1.5]], $campo . '.opacity');
    $rechaza($campo . ': clave desconocida', [$campo => ['assetUrl' => $FORMA, 'color' => '#fff', 'blend' => 'multiply']], $campo);
}
$rechaza('flip en una trama (no tiene)', ['backgroundPattern' => ['assetUrl' => $TRAMA, 'color' => '#fff', 'flip' => 'both']], 'backgroundPattern');
$rechaza('flip inventado en la máscara', ['backgroundMask' => ['assetUrl' => $FORMA, 'color' => '#fff', 'flip' => 'diagonal']], 'backgroundMask.flip');

// ---------------------------------------------------------------------------
echo "\n== el catálogo dice lo mismo que el validador ==\n";
$esquema = $compilador->capability_catalog()['designRuleSet']['ruleValueSchemas']['surface'] ?? [];
foreach (['backgroundGradient', 'gradientPlacement', 'backgroundPattern', 'backgroundMask'] as $campo) {
    $comprobar('el catálogo publica ' . $campo, isset($esquema['fields'][$campo]));
    $comprobar('  y el validador acepta ' . $campo, $campo === 'gradientPlacement' || !is_wp_error($compilar(
        $campo === 'backgroundGradient' ? ['backgroundGradient' => ['type' => 'linear', 'stops' => $p2]]
        : [$campo => ['assetUrl' => $FORMA, 'color' => '#fff']]
    )));
}
$comprobar('los tres tratamientos nuevos cuentan como «al menos uno»',
    array_diff(['backgroundGradient', 'backgroundPattern', 'backgroundMask'], $esquema['atLeastOneOf'] ?? []) === []);
$todoElCatalogo = json_encode($compilador->capability_catalog(), JSON_UNESCAPED_UNICODE);
$comprobar('el catálogo ya no dice «nunca degradado»', stripos((string) $todoElCatalogo, 'nunca degradado') === false);
$comprobar('el catálogo dice dónde va el video de fondo', stripos((string) ($compilador->capability_catalog()['designRuleSet']['ruleKinds']['surface'] ?? ''), 'ambient:true') !== false);

// ---------------------------------------------------------------------------
echo "\n== la forma de un divisor sirve de máscara, tal cual ==\n";
$formas = glob(WP_CONTENT_DIR . '/uploads/formas/*.svg') ?: [];
$comprobar('hay formas de divisor instaladas en Medios', count($formas) >= 14, count($formas) . ' formas');
$sirven = 0;
foreach ($formas as $archivo) {
    $ruta = '/wp-content/uploads/formas/' . basename($archivo);
    if (strpos(basename($archivo), 'trama-') === 0) {
        continue;
    }
    $r = $compilar(['backgroundMask' => ['assetUrl' => $ruta, 'color' => '#fff']]);
    if (!is_wp_error($r)) {
        $sirven++;
    } else {
        $comprobar('la forma ' . basename($archivo) . ' sirve de máscara', false, $r->get_error_message());
    }
}
$comprobar('todas las formas de divisor se aceptan como máscara', $sirven === count(array_filter($formas, static fn ($f) => strpos(basename($f), 'trama-') !== 0)), $sirven . ' de ' . count($formas));
$sinAspecto = array_filter($formas, static fn ($f) => strpos(basename($f), 'trama-') !== 0 && stripos((string) file_get_contents($f), 'preserveAspectRatio="none"') === false);
$comprobar('las formas instaladas se estiran a la caja (preserveAspectRatio=none)', $sinAspecto === [], implode(', ', array_map('basename', $sinAspecto)));
$comprobar('COD_Divisor y la máscara usan la misma validación de ruta',
    COD_Divisor::es_forma_del_sitio('/wp-content/uploads/formas/onda.svg') && !COD_Divisor::es_forma_del_sitio('https://otro.example/x.svg') && !COD_Divisor::es_forma_del_sitio('//otro.example/x.svg'));
// Un divisor sigue mostrándose igual aunque el archivo lleve ya su preserveAspectRatio.
$dentro = COD_Divisor::svg_de('/wp-content/uploads/formas/onda.svg');
$comprobar('el divisor en línea no duplica preserveAspectRatio', $dentro !== '' && substr_count($dentro, 'preserveAspectRatio') === 1, $dentro === '' ? 'vacío' : substr($dentro, 0, 160));

echo "\n";
if ($fallas === 0) {
    echo "probar-fondos.php   TODO OK ($total comprobaciones)\n";
    exit(0);
}
echo "probar-fondos.php   $fallas falla(s) de $total\n";
exit(1);
