<?php
/**
 * Verifica la primitiva `social` de 0.3.44: enlaces a las redes oficiales.
 *
 * Existe para que una persona pueda comprobar que habla con la empresa de
 * verdad (hay cuentas falsas que se hacen pasar por ella), así que lo que se
 * mide es justamente lo que protege:
 *  - cada red de la lista emite su enlace con su propio SVG en línea
 *  - una red inventada se rechaza NOMBRÁNDOLA
 *  - javascript:, data:, http:// y usuario@ en la dirección se rechazan
 *  - la dirección tiene que ser de la red elegida (no basta con ser https)
 *  - el handle sale como texto seleccionable (no dentro del SVG ni de una imagen)
 *    y no admite caracteres invisibles ni HTML
 *  - sin handle sale sólo el icono
 *  - rel="noopener noreferrer" y target="_blank"
 *  - tamaños y colores fuera de rango se rechazan
 *  - el marcado sobrevive al sanitizador de Canvas (si no, se perdería al guardar)
 *  - el catálogo declara la primitiva
 *  - nunca la abreviada «background:»
 *
 * Desde 0.3.45 la `url` es opcional (sin ella la cuenta sale de Configuración →
 * «Redes sociales»): eso se prueba aparte, en probar-social-ajustes.php. Aquí
 * quedan las reglas de una `url` propia, que siguen valiendo igual.
 *
 * Corre contra el WordPress local de Econut (puerto 8891): sincronizar antes con
 *   node scripts/sincronizar-plugin.mjs --a econut --aplicar
 * Nunca contra wp-local (ése es Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$sanitizador = new COD_Canvas_Document_Sanitizer();
$compilador = new COD_Canvas_MCP_Recipe_Compiler($sanitizador);

$diseno = ['schemaVersion' => 1, 'designId' => 'prueba-044', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => []];

/** Compila un nodo social con ese contenido. Devuelve ['markup' => ..., 'styles' => ...] o el WP_Error. */
$compilar = function (array $contenido) use ($compilador, $diseno) {
    $composicion = [
        'schemaVersion' => 2,
        'nodes' => [[
            'id' => 'pie',
            'kind' => 'section',
            'children' => [['id' => 'red', 'kind' => 'social', 'content' => $contenido]],
        ]],
    ];
    $salida = $compilador->compile($composicion, $diseno);
    if (is_wp_error($salida)) {
        return $salida;
    }
    return ['markup' => (string) ($salida['storage']['markup'] ?? ''), 'styles' => (string) ($salida['storage']['styles'] ?? '')];
};

$fallas = 0;
$total = 0;
$verifica = function (string $nombre, bool $bien, string $detalle = '') use (&$fallas, &$total): void {
    $total++;
    if (!$bien) {
        $fallas++;
    }
    printf("%s  %-62s  %s\n", $bien ? 'OK  ' : 'FALLA', $nombre, $detalle);
};
$msg = static function ($r): string {
    return is_wp_error($r) ? $r->get_error_message() : 'NO dio error';
};
/** Debe fallar, y el mensaje debe contener $debe. */
$error = function (string $nombre, array $contenido, string $debe) use ($compilar, $verifica, $msg): void {
    $r = $compilar($contenido);
    $verifica($nombre, is_wp_error($r) && strpos($r->get_error_message(), $debe) !== false, $msg($r));
};

// Las siluetas tal como las declara COD_Redes_Sociales (desde 0.3.45 viven ahí, junto con la regla que valida la dirección).
$redes = COD_Redes_Sociales::REDES;
$verifica('la lista tiene las ocho redes pedidas', is_array($redes) && array_keys($redes) === ['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'x', 'threads', 'pinterest'], is_array($redes) ? implode(',', array_keys($redes)) : '');

$urls = [
    'instagram' => 'https://www.instagram.com/econutchile.oficial/',
    'facebook' => 'https://www.facebook.com/econutchile',
    'linkedin' => 'https://www.linkedin.com/company/econut',
    'youtube' => 'https://www.youtube.com/@econutchile',
    'tiktok' => 'https://www.tiktok.com/@econutchile.oficial',
    'x' => 'https://x.com/econutchile',
    'threads' => 'https://www.threads.net/@econutchile.oficial',
    'pinterest' => 'https://cl.pinterest.com/econutchile/',
];

echo "\n== cada red emite su enlace con su SVG ==\n";
$dibujos = [];
foreach ($urls as $red => $url) {
    $r = $compilar(['network' => $red, 'url' => $url]);
    if (is_wp_error($r)) {
        $verifica($red . ': compila', false, $msg($r));
        continue;
    }
    $m = $r['markup'];
    $spec = $redes[$red];
    $dibujos[$red] = $m;
    $verifica(
        $red . ': enlace + SVG propio',
        strpos($m, 'data-cod-social="' . $red . '"') !== false
            && strpos($m, 'href="' . esc_url($url) . '"') !== false
            && stripos($m, 'viewBox="' . $spec['viewBox'] . '"') !== false
            && strpos($m, ' d="' . esc_attr($spec['path']) . '"') !== false
            && preg_match('#<a [^>]*>\s*<span [^>]*><svg .*</svg></span></a>#s', $m) === 1,
        'viewBox ' . $spec['viewBox'] . ', ruta de ' . strlen($spec['path']) . ' caracteres'
    );
}
$rutas = [];
foreach ($redes as $spec) {
    $rutas[$spec['path']] = true;
}
$verifica('cada red tiene una silueta distinta', count($rutas) === count($redes), count($rutas) . ' distintas de ' . count($redes));
$verifica('ninguna silueta está vacía', min(array_map(static function ($s) { return strlen($s['path']); }, $redes)) > 100);

echo "\n== red inventada ==\n";
$error('red inventada se rechaza nombrándola', ['network' => 'myspace', 'url' => 'https://myspace.com/x'], 'myspace');
$error('el mensaje lista las admitidas', ['network' => 'myspace', 'url' => 'https://myspace.com/x'], 'instagram, facebook, linkedin, youtube, tiktok, x, threads, pinterest');
$error('«Instagram» con mayúscula no es la clave', ['network' => 'Instagram', 'url' => $urls['instagram']], 'Instagram');
$error('sin red', ['url' => $urls['instagram']], 'no está disponible');
$error('red que no es texto', ['network' => ['instagram'], 'url' => $urls['instagram']], 'no está disponible');
$error('red con marcado se rechaza (y no lo repite crudo)', ['network' => '<script>alert(1)</script>', 'url' => $urls['instagram']], 'no está disponible');
$r = $compilar(['network' => '<script>alert(1)</script>', 'url' => $urls['instagram']]);
$verifica('el error no repite el marcado', is_wp_error($r) && strpos($r->get_error_message(), '<script>') === false, $msg($r));

echo "\n== dirección ==\n";
$error('javascript: se rechaza', ['network' => 'instagram', 'url' => 'javascript:alert(1)'], 'https://');
$error('JaVaScRiPt: con mayúsculas se rechaza', ['network' => 'instagram', 'url' => 'JaVaScRiPt:alert(1)'], 'https://');
$error('data: se rechaza', ['network' => 'instagram', 'url' => 'data:text/html;base64,PHNjcmlwdD4='], 'https://');
$error('http:// (sin cifrar) se rechaza', ['network' => 'instagram', 'url' => 'http://www.instagram.com/econut'], 'https://');
$error('ruta relativa se rechaza', ['network' => 'instagram', 'url' => '/econut'], 'https://');
$error('url vacía se rechaza (declararla y dejarla vacía no cae al panel)', ['network' => 'instagram', 'url' => ''], 'https://');
$error('url que no es texto se rechaza', ['network' => 'instagram', 'url' => ['https://instagram.com/x']], 'https://');
$error('mailto: se rechaza', ['network' => 'instagram', 'url' => 'mailto:a@b.cl'], 'https://');
$error('usuario@ en la dirección se rechaza', ['network' => 'instagram', 'url' => 'https://instagram.com@evil.example/x'], 'https://');
$error('puerto se rechaza', ['network' => 'instagram', 'url' => 'https://instagram.com:8443/x'], 'https://');
$error('dominio ajeno se rechaza nombrándolo', ['network' => 'instagram', 'url' => 'https://evil.example/econutchile.oficial'], 'evil.example');
$error('instagram.com.evil.example se rechaza', ['network' => 'instagram', 'url' => 'https://instagram.com.evil.example/x'], 'instagram.com.evil.example');
$error('notinstagram.com se rechaza (no es subdominio)', ['network' => 'instagram', 'url' => 'https://notinstagram.com/x'], 'notinstagram.com');
$error('el dominio de OTRA red se rechaza', ['network' => 'instagram', 'url' => $urls['facebook']], 'facebook.com');
$error('con comillas se rechaza', ['network' => 'instagram', 'url' => 'https://instagram.com/x" onclick="y'], 'https://');
$error('con espacios se rechaza', ['network' => 'instagram', 'url' => 'https://instagram.com/x y'], 'https://');
$ok = $compilar(['network' => 'x', 'url' => 'https://twitter.com/econutchile']);
$verifica('twitter.com vale para x (alias de la red)', !is_wp_error($ok), $msg($ok));
$ok = $compilar(['network' => 'youtube', 'url' => 'https://youtu.be/abc']);
$verifica('youtu.be vale para youtube', !is_wp_error($ok), $msg($ok));

echo "\n== handle ==\n";
$r = $compilar(['network' => 'instagram', 'url' => $urls['instagram'], 'handle' => '@econutchile.oficial']);
$m = is_wp_error($r) ? '' : $r['markup'];
$verifica('compila con handle', !is_wp_error($r), $msg($r));
$verifica('el handle sale como TEXTO en su propio span', strpos($m, '<span class="cod-social__handle">@econutchile.oficial</span>') !== false, '');
$verifica('el texto del handle está dentro del <a>', preg_match('#<a [^>]*>.*>@econutchile\.oficial</span></a>#s', $m) === 1, '');
$verifica('el handle NO va dentro del SVG', preg_match('#<svg[^>]*>(?:(?!</svg>).)*econutchile#s', $m) === 0, '');
$verifica('sin <img> ni <text> (no es una imagen con texto)', strpos($m, '<img') === false && strpos($m, '<text') === false, '');
$verifica('el aria-label por omisión lo incluye', strpos($m, 'aria-label="Instagram de @econutchile.oficial"') !== false, '');
$r2 = $compilar(['network' => 'instagram', 'url' => $urls['instagram'], 'handle' => '@econutchile.oficial', 'ariaLabel' => 'Nuestro Instagram oficial']);
$verifica('ariaLabel propio manda', !is_wp_error($r2) && strpos($r2['markup'], 'aria-label="Nuestro Instagram oficial"') !== false, $msg($r2));
$error('handle con HTML se rechaza', ['network' => 'instagram', 'url' => $urls['instagram'], 'handle' => '<b>x</b>'], 'handle');
$error('handle con espacio de ancho cero se rechaza', ['network' => 'instagram', 'url' => $urls['instagram'], 'handle' => "@econut\u{200B}chile"], 'handle');
$error('handle con marca bidireccional se rechaza', ['network' => 'instagram', 'url' => $urls['instagram'], 'handle' => "@econut\u{202E}elihc"], 'handle');
$error('handle de más de 80 se rechaza', ['network' => 'instagram', 'url' => $urls['instagram'], 'handle' => '@' . str_repeat('a', 80)], 'handle');
$error('handle con espacios en los extremos se rechaza', ['network' => 'instagram', 'url' => $urls['instagram'], 'handle' => ' @econut'], 'handle');
$error('handle que no es texto se rechaza', ['network' => 'instagram', 'url' => $urls['instagram'], 'handle' => 12], 'handle');

echo "\n== sin handle: sólo el icono ==\n";
$r = $compilar(['network' => 'facebook', 'url' => $urls['facebook']]);
$m = is_wp_error($r) ? '' : $r['markup'];
$verifica('sin handle no sale el span de texto', !is_wp_error($r) && strpos($m, 'cod-social__handle') === false, $msg($r));
$verifica('sin handle sale el icono', strpos($m, '<svg') !== false, '');
$r = $compilar(['network' => 'facebook', 'url' => $urls['facebook'], 'handle' => '']);
$verifica('handle vacío equivale a no ponerlo', !is_wp_error($r) && strpos($r['markup'], 'cod-social__handle') === false, $msg($r));
$verifica('aria-label por omisión sin handle: sólo la red', !is_wp_error($r) && strpos($r['markup'], 'aria-label="Facebook"') !== false, '');

echo "\n== el enlace ==\n";
$m = $dibujos['instagram'] ?? '';
$verifica('rel="noopener noreferrer"', strpos($m, 'rel="noopener noreferrer"') !== false, '');
$verifica('target="_blank"', strpos($m, 'target="_blank"') !== false, '');
$verifica('el nombre accesible lo da el aria-label del enlace, no el SVG', strpos($m, 'aria-label="Instagram"') !== false && stripos($m, '<title') === false, '');
$verifica('el nodo conserva su clase de nodo', strpos($m, 'cod-node--social') !== false, '');

echo "\n== tamaños y colores ==\n";
$base = ['network' => 'instagram', 'url' => $urls['instagram']];
$error('size 23 se rechaza', $base + ['size' => 23], 'size');
$error('size 201 se rechaza', $base + ['size' => 201], 'size');
$error('size como texto se rechaza', $base + ['size' => '40'], 'size');
$error('iconPadding -1 se rechaza', $base + ['iconPadding' => -1], 'iconPadding');
$error('iconPadding 81 se rechaza', $base + ['iconPadding' => 81], 'iconPadding');
$error('iconColor inseguro se rechaza', $base + ['iconColor' => 'red;position:fixed'], 'iconColor');
$error('backgroundColor inseguro se rechaza', $base + ['backgroundColor' => '#fff;background-image:url(x)'], 'backgroundColor');
$error('borderRadius inseguro se rechaza', $base + ['borderRadius' => '1px;x:y'], 'borderRadius');
$error('clave desconocida se rechaza', $base + ['color' => '#fff'], 'social acepta sólo');
$error('el handle no puede colarse como «label»', $base + ['label' => 'x'], 'social acepta sólo');
$r = $compilar($base + ['size' => 24, 'iconPadding' => 0, 'iconColor' => '#ffffff', 'backgroundColor' => 'var(--color-marca)', 'borderRadius' => '8px']);
$verifica('los extremos del rango se aceptan', !is_wp_error($r), $msg($r));
$verifica('los valores llegan al icono', !is_wp_error($r) && strpos($r['markup'], 'width:24px;height:24px;border-radius:8px;background-color:var(--color-marca);color:#ffffff"') !== false, '');
$verifica('el SVG mide tamaño menos el doble del relleno', !is_wp_error($r) && strpos($r['markup'], 'width="24" height="24"') !== false, '');
$r = $compilar($base + ['size' => 56, 'iconPadding' => 14]);
$verifica('56 con relleno 14 deja un icono de 28', !is_wp_error($r) && strpos($r['markup'], 'width="28" height="28"') !== false, '');

echo "\n== sobrevive al sanitizador de Canvas ==\n";
$r = $compilar(['network' => 'tiktok', 'url' => $urls['tiktok'], 'handle' => '@econutchile.oficial', 'backgroundColor' => '#111111', 'iconColor' => '#ffffff']);
$limpio = is_wp_error($r) ? $r : $sanitizador->sanitize_html($r['markup']);
$verifica('sanitize_html lo acepta', is_string($limpio), $msg($limpio));
if (is_string($limpio)) {
    $verifica('conserva el enlace, rel y target', strpos($limpio, 'href="' . $urls['tiktok'] . '"') !== false && strpos($limpio, 'rel="noopener noreferrer"') !== false && strpos($limpio, 'target="_blank"') !== false, '');
    $verifica('conserva la silueta', strpos($limpio, ' d="' . esc_attr($redes['tiktok']['path']) . '"') !== false && stripos($limpio, 'viewBox="0 0 32 32"') !== false, '');
    $verifica('conserva el handle como texto', strpos($limpio, '>@econutchile.oficial</span>') !== false, '');
    $verifica('conserva el color de fondo del icono', strpos($limpio, 'background-color:#111111') !== false, '');
    $verifica('conserva el diseño en línea (flex y sin subrayado)', strpos($limpio, 'display:inline-flex') !== false && strpos($limpio, 'text-decoration:none') !== false, '');
    $verifica('nada impide seleccionar el handle (sin user-select:none)', stripos($limpio, 'user-select') === false, '');
    $verifica('conserva gap entre icono y texto', strpos($limpio, 'gap:10px') !== false, '');
}

echo "\n== catálogo ==\n";
$catalogo = $compilador->capability_catalog();
$json = (string) wp_json_encode($catalogo, JSON_UNESCAPED_UNICODE);
$verifica('nodeKinds incluye social', in_array('social', $catalogo['composition']['nodeKinds'] ?? [], true), '');
$verifica('el catálogo describe el contenido de social', strpos($json, '"social":{"content":{"network"') !== false, '');
$verifica('el catálogo lista las ocho redes', strpos($json, 'instagram, facebook, linkedin, youtube, tiktok, x, threads, pinterest') !== false, '');
$verifica('el catálogo avisa que el handle sale como texto seleccionable', strpos($json, 'TEXTO seleccionable') !== false, '');

echo "\n== nunca la abreviada ==\n";
$todo = '';
foreach ($dibujos as $m) {
    $todo .= $m;
}
$verifica('sin «background:» abreviada en ninguna red', preg_match('/(?<![-\w])background\s*:/', $todo) === 0, '');
$verifica('sin degradados', stripos($todo, 'gradient') === false, '');

printf("\n%d de %d.\n", $total - $fallas, $total);
echo $fallas === 0 ? "TODO OK\n" : $fallas . " FALLA(S)\n";
exit($fallas === 0 ? 0 : 1);
