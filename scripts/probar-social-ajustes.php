<?php
/**
 * Verifica 0.3.45: las cuentas de redes sociales se configuran en Configuración →
 * «Redes sociales» y no dentro de la composición de cada página.
 *
 * Por qué importa lo que se mide: las cuentas las administra otra gente y
 * cambian (una se consolida, otra se verifica, otra se cierra). Quien mantiene el
 * sitio tiene que poder cambiar la dirección en el panel y que llegue a las
 * páginas SIN recomponerlas. Y un icono de Instagram que no lleva a ninguna parte,
 * en un sitio que existe para que la gente verifique cuál es la cuenta verdadera,
 * es peor que no mostrarlo.
 *
 *  - un nodo sin `url` toma la cuenta configurada; con `url` propia manda la del nodo
 *  - red sin configurar y sin `url`: no se dibuja nada, y queda en summary.omittedNodes
 *  - la cuenta NO queda copiada en la composición (si no, cambiar el panel no serviría)
 *  - al MOSTRAR la página (resolver_en_html y el publicador de verdad) se pone la cuenta de
 *    ese momento: dirección nueva, nombre nuevo, o el enlace entero fuera si ya no existe
 *  - el panel rechaza una dirección inválida nombrando el campo, y un nombre de usuario
 *    con caracteres invisibles; la red que falla conserva lo que tenía (entera)
 *  - la regla de validación vive en un solo sitio (no hay copia en el compilador)
 *  - whatsapp sin número tampoco dibuja un botón a «#»
 *
 * Corre contra el WordPress local de Econut (puerto 8891): sincronizar antes con
 *   node scripts/sincronizar-plugin.mjs --a econut --aplicar
 * Nunca contra wp-local (ése es Santa Luisa). Guarda y devuelve las opciones que
 * toca (cod_redes_sociales, cod_whatsapp_number): no deja nada configurado.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

// Lo que había, para devolverlo (aunque la prueba falle a medias).
$AUSENTE = '__ausente__' . bin2hex(random_bytes(4));
$originales = [];
foreach (['cod_redes_sociales', 'cod_whatsapp_number'] as $opcion) {
    $originales[$opcion] = get_option($opcion, $AUSENTE);
}
$devolver = static function () use ($originales, $AUSENTE): void {
    foreach ($originales as $opcion => $valor) {
        if ($valor === $AUSENTE) {
            delete_option($opcion);
        } else {
            update_option($opcion, $valor, false);
        }
    }
};
register_shutdown_function($devolver);

$sanitizador = new COD_Canvas_Document_Sanitizer();
$compilador = new COD_Canvas_MCP_Recipe_Compiler($sanitizador);
$diseno = ['schemaVersion' => 1, 'designId' => 'prueba-045', 'expectedDesignRevision' => 0, 'reviewState' => 'session', 'rules' => []];

/** Compila una composición con esos nodos hijos de una sección. Devuelve la salida entera o el WP_Error. */
$compilar_nodos = function (array $hijos) use ($compilador, $diseno) {
    return $compilador->compile([
        'schemaVersion' => 2,
        'nodes' => [['id' => 'pie', 'kind' => 'section', 'children' => $hijos]],
    ], $diseno);
};
$social = static function (array $contenido, string $id = 'red'): array {
    return ['id' => $id, 'kind' => 'social', 'content' => $contenido];
};
$markup = static function ($salida): string {
    return is_wp_error($salida) ? '' : (string) ($salida['storage']['markup'] ?? '');
};

$fallas = 0;
$total = 0;
$verifica = function (string $nombre, bool $bien, string $detalle = '') use (&$fallas, &$total): void {
    $total++;
    if (!$bien) {
        $fallas++;
    }
    printf("%s  %-70s  %s\n", $bien ? 'OK  ' : 'FALLA', $nombre, $detalle);
};
$msg = static function ($r): string {
    return is_wp_error($r) ? $r->get_error_message() : 'NO dio error';
};

$IG = 'https://www.instagram.com/econutchile.oficial/';
$IG2 = 'https://www.instagram.com/econut.consolidada/';
$FB = 'https://www.facebook.com/econutchile';
$AJENA = 'https://www.instagram.com/otra.empresa/';

$configurar = static function (array $cuentas): void {
    update_option('cod_redes_sociales', $cuentas, false);
};

// =====================================================================
echo "== sin configurar y sin url: no se dibuja ==\n";
delete_option('cod_redes_sociales');
$r = $compilar_nodos([$social(['network' => 'instagram'])]);
$m = $markup($r);
$verifica('compila sin error', !is_wp_error($r), $msg($r));
$verifica('no deja ningún enlace de red', strpos($m, 'data-cod-social') === false && strpos($m, 'cod-node--social') === false, '');
$verifica('ni un enlace vacío ni a «#»', strpos($m, 'href="#"') === false && strpos($m, 'href=""') === false, '');
$verifica('tampoco deja un <svg> suelto', strpos($m, '<svg') === false, '');
$omitidos = is_wp_error($r) ? [] : ($r['summary']['omittedNodes'] ?? null);
$verifica('queda anotado en summary.omittedNodes', is_array($omitidos) && count($omitidos) === 1
    && ($omitidos[0]['nodeId'] ?? '') === 'red' && ($omitidos[0]['kind'] ?? '') === 'social' && ($omitidos[0]['network'] ?? '') === 'instagram'
    && strpos((string) ($omitidos[0]['reason'] ?? ''), 'Redes sociales') !== false, json_encode($omitidos, JSON_UNESCAPED_UNICODE));
$verifica('el nodo sigue en la composición (aplicarla de nuevo, con la red ya configurada, lo dibuja)',
    !is_wp_error($r) && strpos((string) json_encode($r['compositionSnapshot']), '"kind":"social"') !== false, '');

$r = $compilar_nodos([$social(['network' => 'instagram']), $social(['network' => 'facebook', 'url' => $FB], 'fb')]);
$verifica('una red omitida no arrastra a la otra', !is_wp_error($r) && strpos($markup($r), 'data-cod-social="facebook"') !== false && strpos($markup($r), 'data-cod-social="instagram"') === false, '');
$verifica('sólo la omitida figura en omittedNodes', !is_wp_error($r) && count($r['summary']['omittedNodes']) === 1, '');
$r = $compilar_nodos([['id' => 'filas', 'kind' => 'layout', 'children' => [$social(['network' => 'instagram']), $social(['network' => 'facebook', 'url' => $FB], 'fb')]]]);
$base = $compilar_nodos([['id' => 'filas', 'kind' => 'layout', 'children' => [$social(['network' => 'facebook', 'url' => $FB], 'fb')]]]);
$verifica('en una rejilla no queda una columna vacía en su lugar', !is_wp_error($r) && !is_wp_error($base) && substr_count($markup($r), 'class="cod-column"') === substr_count($markup($base), 'class="cod-column"'), (string) (is_wp_error($r) ? $msg($r) : substr_count($markup($r), 'class="cod-column"')));
$r = $compilar_nodos([['id' => 'solo', 'kind' => 'heading', 'content' => ['level' => 2, 'text' => 'Hola']]]);
$verifica('una composición sin redes trae omittedNodes vacío', !is_wp_error($r) && $r['summary']['omittedNodes'] === [], '');

// =====================================================================
echo "\n== sin url, con la red configurada ==\n";
$configurar(['instagram' => ['url' => $IG, 'handle' => '@econutchile.oficial']]);
$r = $compilar_nodos([$social(['network' => 'instagram'])]);
$m = $markup($r);
$verifica('compila', !is_wp_error($r), $msg($r));
$verifica('toma la dirección del panel', strpos($m, 'href="' . esc_url($IG) . '"') !== false, '');
$verifica('toma el nombre de usuario del panel, como texto', strpos($m, '<span class="cod-social__handle">@econutchile.oficial</span>') !== false, '');
$verifica('el aria-label lo incluye', strpos($m, 'aria-label="Instagram de @econutchile.oficial"') !== false, '');
$verifica('queda marcado como cuenta del panel (para resolverla al mostrar)', strpos($m, 'data-cod-social-panel="instagram"') !== false && strpos($m, 'data-cod-social-aria-auto="1"') !== false, '');
$verifica('sigue con rel y target', strpos($m, 'rel="noopener noreferrer"') !== false && strpos($m, 'target="_blank"') !== false, '');
$verifica('nada que reportar como omitido', $r['summary']['omittedNodes'] === [], '');
$verifica('no hay red configurada que se haya dibujado en otra: facebook sigue sin dibujarse',
    strpos($markup($compilar_nodos([$social(['network' => 'facebook'])])), 'data-cod-social') === false, '');

echo "\n== con url propia manda la del nodo ==\n";
$r = $compilar_nodos([$social(['network' => 'instagram', 'url' => $AJENA])]);
$m = $markup($r);
$verifica('usa la del nodo', strpos($m, 'href="' . esc_url($AJENA) . '"') !== false && strpos($m, esc_url($IG)) === false, '');
$verifica('no se marca como del panel', strpos($m, 'data-cod-social-panel') === false, '');
$verifica('el nombre de usuario del panel NO se cuela en un enlace a otra cuenta', strpos($m, '@econutchile.oficial') === false && strpos($m, 'cod-social__handle') === false, '');
$verifica('el aria-label tampoco lo lleva', strpos($m, 'aria-label="Instagram"') !== false, '');
$r = $compilar_nodos([$social(['network' => 'instagram', 'url' => $AJENA, 'handle' => '@otra.empresa'])]);
$verifica('con url y handle propios salen los del nodo', strpos($markup($r), '>@otra.empresa</span>') !== false && strpos($markup($r), 'econutchile') === false, $msg($r));

echo "\n== handle sin url ==\n";
$r = $compilar_nodos([$social(['network' => 'instagram', 'handle' => '@otro'])]);
$verifica('handle con texto y sin url se rechaza (no sería de la misma cuenta)', is_wp_error($r) && strpos($r->get_error_message(), 'handle sin url') !== false, $msg($r));
$r = $compilar_nodos([$social(['network' => 'instagram', 'handle' => ''])]);
$m = $markup($r);
$verifica('handle "" sin url: sólo el icono, aunque el panel tenga nombre', !is_wp_error($r) && strpos($m, 'cod-social__handle') === false && strpos($m, 'data-cod-social-sin-texto="1"') !== false && strpos($m, 'aria-label="Instagram"') !== false, $msg($r));
$r = $compilar_nodos([$social(['network' => 'instagram', 'ariaLabel' => 'Nuestro Instagram oficial'])]);
$verifica('ariaLabel propio manda y no se marca como automático', strpos($markup($r), 'aria-label="Nuestro Instagram oficial"') !== false && strpos($markup($r), 'aria-auto') === false, $msg($r));
$r = $compilar_nodos([$social(['network' => 'instagram', 'url' => ''])]);
$verifica('url "" declarada no cae en silencio al panel', is_wp_error($r), $msg($r));
$r = $compilar_nodos([$social(['network' => 'instagram', 'url' => null])]);
$verifica('url null equivale a no declararla', !is_wp_error($r) && strpos($markup($r), 'data-cod-social-panel="instagram"') !== false, $msg($r));

echo "\n== la cuenta no queda copiada en la composición ==\n";
$r = $compilar_nodos([$social(['network' => 'instagram'])]);
$instantanea = is_wp_error($r) ? '' : (string) json_encode($r['compositionSnapshot'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
$verifica('la instantánea no lleva la dirección ni el nombre de usuario', $instantanea !== '' && strpos($instantanea, 'instagram.com') === false && strpos($instantanea, 'econutchile') === false, '');
$d1 = $r['compositionDigest'] ?? '';
$configurar(['instagram' => ['url' => $IG2, 'handle' => '@econut.consolidada']]);
$r2 = $compilar_nodos([$social(['network' => 'instagram'])]);
$verifica('cambiar el panel no cambia el digest de la composición', !is_wp_error($r2) && ($r2['compositionDigest'] ?? '') === $d1 && $d1 !== '', '');
$configurar(['instagram' => ['url' => $IG, 'handle' => '@econutchile.oficial']]);
// La instantánea es lo que se reenvía para editar un nodo: tiene que volver a entrar tal cual.
$reenviar = static function (array $salida) use ($compilador, $diseno) {
    return $compilador->compile(['schemaVersion' => 2, 'nodes' => $salida['compositionSnapshot']['nodes']], $diseno);
};
$otra = $reenviar($r);
$verifica('la instantánea vuelve a compilar tal cual', !is_wp_error($otra), $msg($otra));
$r = $compilar_nodos([$social(['network' => 'instagram', 'handle' => ''])]);
$otra = $reenviar($r);
$verifica('también la del icono solo', !is_wp_error($otra) && strpos($markup($otra), 'data-cod-social-sin-texto="1"') !== false, $msg($otra));
$r = $compilar_nodos([$social(['network' => 'instagram', 'url' => $AJENA, 'handle' => '@otra.empresa'])]);
$otra = $reenviar($r);
$verifica('también la de url propia', !is_wp_error($otra) && strpos($markup($otra), esc_url($AJENA)) !== false, $msg($otra));

// =====================================================================
echo "\n== al mostrar la página se pone la cuenta de ese momento ==\n";
$configurar(['instagram' => ['url' => $IG, 'handle' => '@econutchile.oficial'], 'facebook' => ['url' => $FB, 'handle' => '']]);
$r = $compilar_nodos([
    ['id' => 'titulo', 'kind' => 'heading', 'content' => ['level' => 2, 'text' => 'Síguenos']],
    $social(['network' => 'instagram']),
    $social(['network' => 'facebook'], 'fb'),
    $social(['network' => 'tiktok', 'url' => 'https://www.tiktok.com/@propia'], 'tt'),
]);
$guardado = $markup($r);   // lo que queda guardado en la página
$verifica('lo guardado lleva la cuenta de cuando se compuso', strpos($guardado, esc_url($IG)) !== false, '');

$configurar(['instagram' => ['url' => $IG2, 'handle' => '@econut.consolidada'], 'facebook' => ['url' => $FB, 'handle' => '']]);
$visto = COD_Redes_Sociales::resolver_en_html($guardado);
$verifica('la dirección nueva reemplaza a la vieja', strpos($visto, 'href="' . esc_url($IG2) . '"') !== false && strpos($visto, esc_url($IG)) === false, '');
$verifica('el nombre nuevo reemplaza al viejo', strpos($visto, '>@econut.consolidada</span>') !== false && strpos($visto, 'econutchile.oficial') === false, '');
$verifica('el aria-label sigue al nombre', strpos($visto, 'aria-label="Instagram de @econut.consolidada"') !== false, '');
$verifica('una sola copia del nombre (no se acumula)', substr_count($visto, 'cod-social__handle') === 1, (string) substr_count($visto, 'cod-social__handle'));
$verifica('lo demás de la página queda igual', strpos($visto, '>Síguenos</h2>') !== false && strpos($visto, 'https://www.tiktok.com/@propia') !== false, '');
$verifica('el enlace de url propia no se toca', strpos($visto, 'data-cod-social="tiktok"') !== false && strpos($visto, 'data-cod-social-panel="tiktok"') === false, '');

$configurar(['instagram' => ['url' => $IG2, 'handle' => ''], 'facebook' => ['url' => $FB, 'handle' => '']]);
$visto = COD_Redes_Sociales::resolver_en_html($guardado);
$verifica('si el panel quita el nombre, el texto desaparece y queda el icono', strpos($visto, 'cod-social__handle') === false && strpos($visto, 'data-cod-social="instagram"') !== false && strpos($visto, 'aria-label="Instagram"') !== false, '');
$configurar(['instagram' => ['url' => $IG2, 'handle' => '@econut.consolidada'], 'facebook' => ['url' => $FB, 'handle' => '@econutchile']]);
$visto = COD_Redes_Sociales::resolver_en_html($guardado);
$verifica('si el panel agrega un nombre, aparece (facebook no lo traía)', strpos($visto, '>@econutchile</span>') !== false && strpos($visto, 'aria-label="Facebook de @econutchile"') !== false, '');

$configurar(['instagram' => ['url' => $IG2, 'handle' => '@x']]);
$visto = COD_Redes_Sociales::resolver_en_html($guardado);
$verifica('una red que se cierra desaparece ENTERA (el enlace y su icono)', strpos($visto, 'data-cod-social="facebook"') === false && strpos($visto, esc_url($FB)) === false && substr_count($visto, '<svg') === 2, (string) substr_count($visto, '<svg'));
$verifica('y no deja un enlace huérfano ni a «#»', strpos($visto, 'href="#"') === false && substr_count($visto, '<a ') === substr_count($visto, '</a>'), '');
delete_option('cod_redes_sociales');
$visto = COD_Redes_Sociales::resolver_en_html($guardado);
$verifica('sin nada configurado, sólo queda el enlace de url propia', substr_count($visto, '<a ') === 1 && strpos($visto, 'data-cod-social="tiktok"') !== false, (string) substr_count($visto, '<a '));
$verifica('una página sin redes del panel pasa intacta', COD_Redes_Sociales::resolver_en_html('<p>hola</p>') === '<p>hola</p>', '');

echo "\n== lo guardado a la fuerza en la base de datos tampoco engaña ==\n";
$configurar(['instagram' => ['url' => 'javascript:alert(1)', 'handle' => '@x']]);
$verifica('una dirección hostil en la opción no cuenta como cuenta', COD_Redes_Sociales::cuenta('instagram') === null, '');
$visto = COD_Redes_Sociales::resolver_en_html($guardado);
$verifica('y el enlace no se dibuja', strpos($visto, 'javascript') === false && strpos($visto, 'data-cod-social="instagram"') === false, '');
$configurar(['instagram' => ['url' => 'https://evil.example/econutchile.oficial', 'handle' => '']]);
$verifica('una dirección de otro dominio en la opción tampoco', COD_Redes_Sociales::cuenta('instagram') === null, '');
$configurar(['instagram' => ['url' => $IG, 'handle' => "@econut\u{200B}chile"]]);
$cuenta = COD_Redes_Sociales::cuenta('instagram');
$verifica('un nombre con carácter invisible se descarta; la dirección buena se conserva', $cuenta !== null && $cuenta['url'] === $IG && $cuenta['handle'] === '', json_encode($cuenta));
update_option('cod_redes_sociales', 'no soy una lista', false);
$verifica('una opción que no es una lista no rompe nada', COD_Redes_Sociales::cuentas() === [], '');
update_option('cod_redes_sociales', ['instagram' => 'texto', 'facebook' => ['url' => ['x']]], false);
$verifica('filas mal formadas se ignoran', COD_Redes_Sociales::cuentas() === [], '');

// =====================================================================
echo "\n== la página real: el publicador resuelve al mostrar ==\n";
$repositorio = new COD_Canvas_Document_Repository();
$publicador = new COD_Canvas_Page_Publisher($repositorio);
$id_documento = 'prueba-redes-045-' . bin2hex(random_bytes(3));
$configurar(['instagram' => ['url' => $IG, 'handle' => '@econutchile.oficial']]);
$r = $compilar_nodos([$social(['network' => 'instagram']), $social(['network' => 'facebook'], 'fb')]);
$guardo = $repositorio->save($id_documento, '{"pages":[]}', $markup($r), '');
$verifica('se guardó el documento de prueba', !is_wp_error($guardo), $msg($guardo));
if (!is_wp_error($guardo)) {
    $configurar(['instagram' => ['url' => $IG2, 'handle' => '@econut.consolidada']]);
    $pagina = $publicador->render_shortcode(['document_id' => $id_documento]);
    $verifica('la página mostrada lleva la dirección NUEVA sin haber recompuesto nada', strpos($pagina, 'href="' . esc_url($IG2) . '"') !== false && strpos($pagina, esc_url($IG)) === false, '');
    $verifica('y el nombre nuevo', strpos($pagina, '>@econut.consolidada</span>') !== false, '');
    $verifica('facebook (que nunca estuvo configurado) no sale', strpos($pagina, 'facebook') === false, '');
    delete_option('cod_redes_sociales');
    $pagina = $publicador->render_shortcode(['document_id' => $id_documento]);
    $verifica('cerrada la cuenta en el panel, la página ya no muestra el enlace', strpos($pagina, 'data-cod-social') === false && strpos($pagina, 'instagram.com') === false, '');
    $verifica('la página sigue siendo una página', strpos($pagina, 'cod-canvas-published') !== false, '');
    $post_id = $repositorio->find_post_id($id_documento);
    if ($post_id !== null) {
        wp_delete_post($post_id, true);
    }
    $verifica('documento de prueba borrado', $repositorio->find_post_id($id_documento) === null, '');
}

// =====================================================================
echo "\n== el panel: se rechaza lo inválido, nombrando el campo ==\n";
$previos = ['instagram' => ['url' => $IG, 'handle' => '@econutchile.oficial']];
$envio = static function (array $campos) use ($previos): array {
    return COD_Redes_Sociales::procesar_envio($campos, $previos);
};
[$v, $e] = $envio(['cod_redes_facebook_url' => $FB, 'cod_redes_facebook_handle' => '@econutchile']);
$verifica('una cuenta válida se acepta', $e === [] && $v === ['facebook' => ['url' => $FB, 'handle' => '@econutchile']], json_encode([$v, $e]));
[$v, $e] = $envio(['cod_redes_facebook_url' => "  $FB  ", 'cod_redes_facebook_handle' => " @econutchile\u{00A0}"]);
$verifica('los espacios de los extremos al pegar no estorban', $e === [] && ($v['facebook'] ?? null) === ['url' => $FB, 'handle' => '@econutchile'], json_encode([$v, $e]));
foreach ([
    'javascript:' => 'javascript:alert(1)',
    'http:// (sin cifrar)' => 'http://www.instagram.com/econut',
    'otro dominio' => 'https://evil.example/econutchile.oficial',
    'instagram.com@otro' => 'https://instagram.com@evil.example/x',
    'dominio de otra red' => $FB,
    'sin esquema' => 'www.instagram.com/econut',
    'con espacio dentro' => 'https://instagram.com/eco nut',
    'con carácter invisible' => "https://instagram.com/econut\u{200B}",
] as $nombre => $mala) {
    [$v, $e] = $envio(['cod_redes_instagram_url' => $mala, 'cod_redes_instagram_handle' => '@nuevo']);
    $mensaje = COD_Redes_Sociales::mensaje_de_errores($e);
    $verifica('dirección inválida (' . $nombre . ') se rechaza nombrando el campo', $e === ['instagram_url'] && strpos($mensaje, 'dirección de Instagram') !== false && strpos($mensaje, 'https://') !== false, $mensaje);
    $verifica('  y la red conserva lo que tenía, entera (sin el nombre nuevo)', ($v['instagram'] ?? null) === ['url' => $IG, 'handle' => '@econutchile.oficial'], json_encode($v));
}
foreach ([
    'espacio de ancho cero' => "@econut\u{200B}chile",
    'marca bidireccional' => "@econut\u{202E}elihc",
    'HTML' => '<b>x</b>',
    'más de 80' => '@' . str_repeat('a', 80),
    'comillas' => '@eco"nut',
] as $nombre => $malo) {
    [$v, $e] = $envio(['cod_redes_instagram_url' => $IG2, 'cod_redes_instagram_handle' => $malo]);
    $mensaje = COD_Redes_Sociales::mensaje_de_errores($e);
    $verifica('nombre de usuario con ' . $nombre . ' se rechaza nombrando el campo', $e === ['instagram_handle'] && strpos($mensaje, 'nombre de usuario de Instagram') !== false && strpos($mensaje, 'invisibles') !== false, $mensaje);
    $verifica('  y no mezcla la dirección nueva con el nombre viejo', ($v['instagram'] ?? null) === ['url' => $IG, 'handle' => '@econutchile.oficial'], json_encode($v));
}
[$v, $e] = $envio(['cod_redes_instagram_url' => 'javascript:x', 'cod_redes_instagram_handle' => "@a\u{200B}b"]);
$verifica('los dos mal: nombra los dos', $e === ['instagram_url', 'instagram_handle'] && strpos(COD_Redes_Sociales::mensaje_de_errores($e), 'dirección de Instagram') !== false && strpos(COD_Redes_Sociales::mensaje_de_errores($e), 'nombre de usuario de Instagram') !== false, json_encode($e));
[$v, $e] = COD_Redes_Sociales::procesar_envio(['cod_redes_instagram_url' => 'javascript:x'], []);
$verifica('dirección mala en una red sin cuenta previa: no se guarda nada', $e === ['instagram_url'] && $v === [], json_encode([$v, $e]));
[$v, $e] = $envio(['cod_redes_instagram_url' => '', 'cod_redes_instagram_handle' => '@econutchile.oficial']);
$verifica('dirección vacía cierra la cuenta (y su nombre de usuario no se guarda suelto)', $e === [] && $v === [], json_encode([$v, $e]));
[$v, $e] = $envio([]);
$verifica('un envío sin campos cierra todas', $e === [] && $v === [], '');
[$v, $e] = $envio(['cod_redes_instagram_url' => $IG2, 'cod_redes_instagram_handle' => '']);
$verifica('sin nombre de usuario es válido', $e === [] && ($v['instagram'] ?? null) === ['url' => $IG2, 'handle' => ''], json_encode($v));
$todas = [];
foreach (COD_Redes_Sociales::REDES as $red => $spec) {
    $todas['cod_redes_' . $red . '_url'] = 'https://' . $spec['hosts'][0] . '/econut';
}
[$v, $e] = COD_Redes_Sociales::procesar_envio($todas, []);
$verifica('las ocho redes se aceptan con su propio dominio', $e === [] && count($v) === 8, json_encode($e));
$verifica('mensaje vacío si no hay errores', COD_Redes_Sociales::mensaje_de_errores([]) === '' && COD_Redes_Sociales::mensaje_de_errores(['inventada_url']) === '', '');

echo "\n== guardar de verdad (el controlador) ==\n";
$admin = get_users(['role' => 'administrator', 'number' => 1]);
if ($admin !== []) {
    wp_set_current_user((int) $admin[0]->ID);
    delete_option('cod_redes_sociales');
    $guardar = static function (array $post) {
        $_POST = $post + ['_wpnonce' => wp_create_nonce('cod_save_redes_sociales'), '_wp_http_referer' => '/wp-admin/admin.php?page=contope-settings'];
        $_REQUEST = $_POST;
        $destino = null;
        add_filter('wp_redirect', static function ($url) use (&$destino) {
            $destino = $url;
            throw new RuntimeException('redirige');
        });
        try {
            (new COD_Redes_Sociales())->guardar();
        } catch (RuntimeException $ex) {
            // esperado: guardar() termina redirigiendo
        }
        remove_all_filters('wp_redirect');
        return (string) $destino;
    };
    $destino = $guardar(['cod_redes_instagram_url' => $IG, 'cod_redes_instagram_handle' => '@econutchile.oficial']);
    $verifica('guarda y redirige a la sección con aviso de éxito', strpos($destino, 'cod_redes_guardadas=1') !== false && strpos($destino, 'cod_redes_error') === false && substr($destino, -10) === '#cod-redes', $destino);
    $verifica('queda en la opción', COD_Redes_Sociales::cuenta('instagram') === ['url' => $IG, 'handle' => '@econutchile.oficial'], json_encode(get_option('cod_redes_sociales')));
    $destino = $guardar(['cod_redes_instagram_url' => $IG2, 'cod_redes_instagram_handle' => "@a\u{200B}b"]);
    $verifica('un nombre con carácter invisible se rechaza al guardar, nombrando el campo', strpos($destino, 'cod_redes_error=instagram_handle') !== false, $destino);
    $verifica('y no se guardó nada de ese envío', COD_Redes_Sociales::cuenta('instagram') === ['url' => $IG, 'handle' => '@econutchile.oficial'], json_encode(get_option('cod_redes_sociales')));
    $destino = $guardar(['cod_redes_instagram_url' => 'http://instagram.com/x']);
    $verifica('una dirección http:// se rechaza al guardar, nombrando el campo', strpos($destino, 'cod_redes_error=instagram_url') !== false, $destino);

    echo "\n== la pantalla ==\n";
    $configurar(['instagram' => ['url' => $IG, 'handle' => '@econutchile.oficial']]);
    $_GET['cod_redes_error'] = 'facebook_url';
    ob_start();
    (new COD_Settings_Admin())->render_page();
    $pantalla = (string) ob_get_clean();
    unset($_GET['cod_redes_error']);
    $verifica('la sección «Redes sociales» existe', strpos($pantalla, '<h2>Redes sociales</h2>') !== false && strpos($pantalla, 'id="cod-redes"') !== false, '');
    $verifica('trae el par de campos de cada una de las ocho redes', array_sum(array_map(static function (string $red) use ($pantalla): int {
        return (int) (strpos($pantalla, 'name="cod_redes_' . $red . '_url"') !== false && strpos($pantalla, 'name="cod_redes_' . $red . '_handle"') !== false);
    }, array_keys(COD_Redes_Sociales::REDES))) === 8, '');
    $verifica('muestra lo guardado', strpos($pantalla, 'value="' . $IG . '"') !== false && strpos($pantalla, 'value="@econutchile.oficial"') !== false, '');
    $verifica('manda el formulario a su acción, con nonce', strpos($pantalla, 'value="cod_save_redes_sociales"') !== false && strpos($pantalla, 'name="_wpnonce"') !== false, '');
    $verifica('muestra el aviso de error que nombra la dirección de Facebook', strpos($pantalla, 'notice-error') !== false && strpos($pantalla, 'dirección de Facebook') !== false, '');
    wp_set_current_user(0);
} else {
    $verifica('hay un administrador para probar el guardado y la pantalla', false, 'no hay');
}
$_POST = [];

// =====================================================================
echo "\n== la regla vive en un solo sitio ==\n";
$fuente_compilador = (string) file_get_contents(__DIR__ . '/../contope-publisher/includes/class-cod-canvas-mcp-recipe-compiler.php');
$verifica('el compilador no trae su propia copia de la regla de la dirección', strpos($fuente_compilador, "'hosts'") === false && strpos($fuente_compilador, "substr(\$host") === false && strpos($fuente_compilador, '$parts[\'port\']') === false);
$verifica('ni la del nombre de usuario', strpos($fuente_compilador, '\p{L}\p{N}@') === false);
$verifica('ni la tabla de redes', strpos($fuente_compilador, "'viewBox' =>") === false && strpos($fuente_compilador, 'M12,4.622c') === false);
$verifica('las usa desde COD_Redes_Sociales', strpos($fuente_compilador, 'COD_Redes_Sociales::url_valida') !== false && strpos($fuente_compilador, 'COD_Redes_Sociales::handle_valido') !== false);
$fuente_clase = (string) file_get_contents(__DIR__ . '/../contope-publisher/includes/class-cod-redes-sociales.php');
$verifica('...y el panel también: procesar_envio llama a url_valida y handle_valido', substr_count($fuente_clase, 'self::url_valida(') >= 2 && substr_count($fuente_clase, 'self::handle_valido(') >= 2, '');
$fuente_publicador = (string) file_get_contents(__DIR__ . '/../contope-publisher/includes/class-cod-canvas-page-publisher.php');
$verifica('el publicador llama al resolutor al mostrar', strpos($fuente_publicador, 'COD_Redes_Sociales::resolver_en_html($markup)') !== false, '');

echo "\n== catálogo ==\n";
$catalogo = $compilador->capability_catalog();
$json = (string) wp_json_encode($catalogo, JSON_UNESCAPED_UNICODE);
$verifica('el catálogo dice que url es OPCIONAL', strpos($json, '"url":"OPCIONAL.') !== false, '');
$verifica('dice de dónde sale si no viene (Configuración → Redes sociales)', strpos($json, 'Configuración → «Redes sociales»') !== false, '');
$verifica('dice que si no hay cuenta el nodo no se dibuja', strpos($json, 'el nodo NO se dibuja') !== false && strpos($json, 'summary.omittedNodes') !== false, '');
$verifica('dice que la url propia manda sobre el panel', strpos($json, 'manda sobre el panel') !== false, '');
$verifica('dice qué pasa con handle sin url', strpos($json, 'handle con texto sin url se rechaza') !== false, '');

// =====================================================================
echo "\n== whatsapp sin número tampoco dibuja un botón a «#» ==\n";
$whatsapp = ['id' => 'wa', 'kind' => 'whatsapp', 'content' => ['message' => 'Hola, quiero cotizar']];
delete_option('cod_whatsapp_number');
$r = $compilar_nodos([$whatsapp]);
$m = $markup($r);
$verifica('sin número: compila y no dibuja el botón', !is_wp_error($r) && strpos($m, 'cod-node--whatsapp') === false && strpos($m, 'href="#"') === false && strpos($m, 'wa.me') === false, $msg($r));
$verifica('queda en summary.omittedNodes', !is_wp_error($r) && count($r['summary']['omittedNodes']) === 1 && $r['summary']['omittedNodes'][0]['kind'] === 'whatsapp' && $r['summary']['omittedNodes'][0]['nodeId'] === 'wa', json_encode($r['summary']['omittedNodes'] ?? null, JSON_UNESCAPED_UNICODE));
$modulo = $compilador->render_whatsapp_module('wa-1', 'Hola', 'bottom-right');
$verifica('el módulo aislado (activar en secciones) avisa en vez de insertar un hueco', is_wp_error($modulo) && $modulo->get_error_code() === 'cod_mcp_whatsapp_number_missing', $msg($modulo));
update_option('cod_whatsapp_number', '56912345678', false);
$r = $compilar_nodos([$whatsapp]);
$m = $markup($r);
$verifica('con número: se dibuja con su wa.me', strpos($m, 'cod-node--whatsapp') !== false && strpos($m, 'href="https://wa.me/56912345678?text=') !== false, '');
$verifica('con número: nada omitido', $r['summary']['omittedNodes'] === [], '');
$modulo = $compilador->render_whatsapp_module('wa-1', 'Hola', 'bottom-right');
$verifica('con número: el módulo aislado funciona', is_string($modulo) && strpos($modulo, 'wa.me/56912345678') !== false, $msg($modulo));

echo "\n== nunca la abreviada ni degradados ==\n";
$configurar(['instagram' => ['url' => $IG, 'handle' => '@econutchile.oficial']]);
$m = $markup($compilar_nodos([$social(['network' => 'instagram'])]));
$verifica('sin «background:» abreviada', preg_match('/(?<![-\w])background\s*:/', $m) === 0, '');
$verifica('sin degradados', stripos($m, 'gradient') === false, '');

$devolver();
printf("\n%d de %d.\n", $total - $fallas, $total);
echo $fallas === 0 ? "TODO OK\n" : $fallas . " FALLA(S)\n";
exit($fallas === 0 ? 0 : 1);
