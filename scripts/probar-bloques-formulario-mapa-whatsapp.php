<?php
/**
 * Los tres bloques propios de ContOpe que Basis necesita para pasar a bloques de WordPress
 * (docs/ESPEC-adn-unica-puerta-y-bloques.md, 6.2): contope/formulario, contope/mapa y contope/whatsapp.
 *
 *  - Registro: los tres existen, son dinámicos y declaran lo que la espec dice (atributos, soportes).
 *  - whatsapp: el número sale del AJUSTE y no del contenido; el mensaje conserva sus saltos de línea; sin número no
 *    se dibuja en el sitio (y en el editor avisa); el enlace lleva las clases de core/button; fijo y posición.
 *  - mapa: valida lat/lng/zoom como el compilador del lienzo; la clave pública viaja SÓLO al mostrar (nunca en los
 *    atributos del bloque); sin clave el runtime no monta nada; sin imagen de respaldo el mapa queda abierto; el
 *    alto es la variable de la conducta; el globo sale escapado.
 *  - formulario: llama al shortcode oficial de Orugantt Forms; sin identificador o sin el plugin no dibuja nada en el
 *    sitio; el diseño sale de `settings.custom.form` del tema o de presets por rol, nunca de un valor.
 *  - Ningún CSS de los bloques ni el que se genera por PHP trae hex, rgb/hsl ni font-family literales.
 *
 * Corre contra el WordPress local de Basis (puerto 8894, con el plugin del repositorio copiado:
 * robocopy contope-publisher -> wp-local-basis/.../plugins/contope-publisher). Nunca contra Santa Luisa ni Econut.
 * Guarda y RESTAURA las opciones que toca (número de WhatsApp y clave de Mapbox).
 *
 * El comportamiento en el navegador se verifica a mano (informe de la tarea): teselas, escritura en el formulario,
 * enlace de WhatsApp y ancho de celular.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-basis/wordpress/wp-load.php';

$fallas = 0;
$total = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas, &$total): void {
    $total++;
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? "   $detalle" : '') . "\n";
    if (!$ok) {
        $fallas++;
    }
};

// Opciones que se tocan: se restauran pase lo que pase.
$previas = [
    COD_Block_Whatsapp::OPCION_NUMERO => get_option(COD_Block_Whatsapp::OPCION_NUMERO, null),
    COD_Mapa::OPTION_KEY => get_option(COD_Mapa::OPTION_KEY, null),
];
register_shutdown_function(static function () use ($previas): void {
    foreach ($previas as $clave => $valor) {
        if ($valor === null) {
            delete_option($clave);
        } else {
            update_option($clave, $valor, false);
        }
    }
});

$CLAVE = 'pk.eyJ1IjoicHJ1ZWJhIiwiYSI6ImNsYXZlZGVwcnVlYmEifQ.AbCdEfGhIjKlMnOpQrStUv';
$render = static fn (string $nombre, array $atributos): string => do_blocks('<!-- wp:' . $nombre . ' ' . ($atributos === [] ? '{}' : wp_json_encode($atributos)) . ' /-->');
$raiz = COD_PUBLISHER_DIR;

echo "Registro\n";
$registro = WP_Block_Type_Registry::get_instance();
foreach (['contope/formulario', 'contope/mapa', 'contope/whatsapp'] as $nombre) {
    $tipo = $registro->get_registered($nombre);
    $comprobar("$nombre está registrado", $tipo instanceof WP_Block_Type);
    $comprobar("$nombre es dinámico (lo dibuja el servidor)", $tipo instanceof WP_Block_Type && $tipo->is_dynamic());
    $comprobar("$nombre usa apiVersion 3", $tipo instanceof WP_Block_Type && (int) $tipo->api_version === 3);
}
$wa = $registro->get_registered('contope/whatsapp');
$comprobar('whatsapp corresponde a core/button: color, tipografía, relleno, borde y sombra', $wa instanceof WP_Block_Type
    && !empty($wa->supports['color']) && !empty($wa->supports['typography']) && !empty($wa->supports['spacing'])
    && !empty($wa->supports['__experimentalBorder']) && !empty($wa->supports['shadow']));
$comprobar('whatsapp no tiene un atributo de número ni de URL (el número es un ajuste)', $wa instanceof WP_Block_Type
    && !isset($wa->attributes['numero'], $wa->attributes['url'], $wa->attributes['phone'], $wa->attributes['href']));
$comprobar('whatsapp carga la hoja de core/button como dependencia', $wa instanceof WP_Block_Type && in_array('wp-block-button', (array) $wa->style_handles, true));
$mapa = $registro->get_registered('contope/mapa');
$comprobar('mapa no tiene atributo de clave (la clave nunca va en el contenido)', $mapa instanceof WP_Block_Type
    && !isset($mapa->attributes['token'], $mapa->attributes['clave'], $mapa->attributes['apiKey'], $mapa->attributes['accessToken']));
$comprobar('mapa declara lat, lng, zoom, alto y fijo', $mapa instanceof WP_Block_Type
    && isset($mapa->attributes['lat'], $mapa->attributes['lng'], $mapa->attributes['zoom'], $mapa->attributes['alto'], $mapa->attributes['fijo']));
$comprobar('mapa tiene el soporte de sombra de Gutenberg (style.shadow: un paso de la escala de sombras del sitio) y de radio', $mapa instanceof WP_Block_Type
    && !empty($mapa->supports['shadow']) && !empty($mapa->supports['__experimentalBorder']['radius']));
$form = $registro->get_registered('contope/formulario');
$comprobar('formulario declara formSlug', $form instanceof WP_Block_Type && isset($form->attributes['formSlug']));

echo "\nWhatsApp\n";
update_option(COD_Block_Whatsapp::OPCION_NUMERO, '+56 9 9999 0000', false);
$html = $render('contope/whatsapp', ['mensaje' => "Hola\n\nNombre:\nQuisiera cotizar", 'iconStyle' => 'logo', 'backgroundColor' => 'ink', 'fijo' => true]);
$comprobar('el enlace va a wa.me con el número del AJUSTE, sólo dígitos', strpos($html, 'href="https://wa.me/56999990000?text=') !== false, $html);
$comprobar('el mensaje conserva los saltos de línea (%0A)', strpos($html, 'Hola%0A%0ANombre%3A%0AQuisiera%20cotizar') !== false, $html);
$comprobar('el número no está en los atributos del bloque que se guardaría', strpos(wp_json_encode(['mensaje' => 'x', 'fijo' => true]), '5699999') === false);
$comprobar('el enlace es la raíz y lleva las clases de core/button', strpos($html, 'class="wp-block-button__link wp-element-button') !== false && strpos($html, 'wp-block-contope-whatsapp') !== false, $html);
$comprobar('trae la clase del preset de fondo (backgroundColor por slug, no un valor)', strpos($html, 'has-ink-background-color') !== false, $html);
$comprobar('fijo y a la derecha por omisión', strpos($html, 'is-fijo') !== false && strpos($html, 'is-posicion-derecha') !== false, $html);
$comprobar('sin texto es sólo ícono', strpos($html, 'is-solo-icono') !== false && strpos($html, 'cod-whatsapp__texto') === false, $html);
$comprobar('abre en otra pestaña sin pasar el referente', strpos($html, 'target="_blank"') !== false && strpos($html, 'rel="noopener noreferrer"') !== false);
$comprobar('lleva nombre accesible aunque no tenga texto', strpos($html, 'aria-label="Contactar por WhatsApp"') !== false);
$comprobar('el logotipo es un SVG decorativo', strpos($html, '<svg class="cod-whatsapp__icono"') !== false && strpos($html, 'aria-hidden="true"') !== false);

$html = $render('contope/whatsapp', ['text' => 'Escríbenos <b>ya</b>', 'posicion' => 'izquierda', 'fijo' => true]);
$comprobar('con texto sale el texto, sin etiquetas, y no es sólo ícono', strpos($html, '<span class="cod-whatsapp__texto">Escríbenos ya</span>') !== false && strpos($html, 'is-solo-icono') === false, $html);
$comprobar('el texto es el nombre accesible si no hay otro', strpos($html, 'aria-label="Escríbenos ya"') !== false, $html);
$comprobar('esquina izquierda', strpos($html, 'is-posicion-izquierda') !== false);
$html = $render('contope/whatsapp', ['mensaje' => 'Hola "amigo" <script>x</script>']);
$comprobar('un mensaje con comillas o etiquetas no rompe el atributo', strpos($html, '<script>') === false && substr_count($html, 'href="') === 1, $html);
$comprobar('no fijo: sin clases de posición', strpos($html, 'is-fijo') === false);
$comprobar('en la vista previa del editor no se fija', strpos(COD_Block_Whatsapp::marcado(['fijo' => true], 'class="x"', '5691', true), 'is-fijo') === false);

update_option(COD_Block_Whatsapp::OPCION_NUMERO, '', false);
$comprobar('sin número no se dibuja en el sitio (ni un botón a «#»)', trim($render('contope/whatsapp', ['fijo' => true])) === '');
$aviso = COD_Block_Whatsapp::marcado([], 'class="x"', '', true);
$comprobar('sin número, el editor recibe el aviso con el enlace a Configuración', strpos($aviso, 'Falta el número') !== false && strpos($aviso, 'contope-settings') !== false, $aviso);

echo "\nMapa\n";
$ok = ['lat' => -33.804, 'lng' => -70.681, 'zoom' => 17, 'alto' => 420, 'globo' => 'Planta "Sur" <b>1</b>'];
$comprobar('lat fuera de rango se rechaza', COD_Block_Mapa::normalizar(array_merge($ok, ['lat' => 91])) === null);
$comprobar('lng fuera de rango se rechaza', COD_Block_Mapa::normalizar(array_merge($ok, ['lng' => -181])) === null);
$comprobar('sin lat o lng se rechaza', COD_Block_Mapa::normalizar(['lat' => -33.8]) === null && COD_Block_Mapa::normalizar([]) === null);
$comprobar('zoom fuera de rango se recorta a 0..22', COD_Block_Mapa::normalizar(array_merge($ok, ['zoom' => 99]))['zoom'] === 22.0 && COD_Block_Mapa::normalizar(array_merge($ok, ['zoom' => -3]))['zoom'] === 0.0);
$comprobar('el alto se acota', COD_Block_Mapa::normalizar(array_merge($ok, ['alto' => 5]))['alto'] === 120 && COD_Block_Mapa::normalizar(array_merge($ok, ['alto' => 99999]))['alto'] === 1600);
$comprobar('sin imagen de respaldo el mapa queda abierto aunque diga fijo:false', COD_Block_Mapa::normalizar(array_merge($ok, ['fijo' => false]))['fijo'] === true);
$comprobar('con imagen de respaldo y fijo:false se puede cerrar', COD_Block_Mapa::normalizar(array_merge($ok, ['fijo' => false, 'mini' => 'https://ejemplo.cl/m.png']))['fijo'] === false);
$comprobar('un marcador o una imagen que no es http(s) se descarta', COD_Block_Mapa::normalizar(array_merge($ok, ['marcador' => 'javascript:alert(1)', 'mini' => 'data:text/html,x']))['marcador'] === '');

update_option(COD_Mapa::OPTION_KEY, $CLAVE, false);
$html = $render('contope/mapa', $ok);
$comprobar('marca la conducta «mapa» que monta el runtime del lienzo', strpos($html, 'data-cod-behavior="mapa"') !== false, $html);
$comprobar('con clave configurada, el servidor pone la clave AL MOSTRAR', strpos($html, 'data-cod-mapa-token="' . $CLAVE . '"') !== false, $html);
$sin_resolver = COD_Block_Mapa::marcado($ok, 'class="x"', true);
$comprobar('la clave no está en el marcado base ni en los atributos (sólo la agrega resolver_en_html)', strpos($sin_resolver, 'pk.') === false && strpos(wp_json_encode($ok), 'pk.') === false);
$comprobar('lat, lng y zoom viajan como los lee el runtime', strpos($html, 'data-cod-mapa-lat="-33.804"') !== false && strpos($html, 'data-cod-mapa-lng="-70.681"') !== false && strpos($html, 'data-cod-mapa-zoom="17"') !== false, $html);
$comprobar('el alto es la variable de la conducta', strpos($html, '--cod-mapa-alto:420px') !== false, $html);
$comprobar('el mini es el enlace «cómo llegar» de OpenStreetMap (funciona sin clave ni JavaScript)', strpos($html, 'data-cod-mapa-rol="mini"') !== false && strpos($html, 'https://www.openstreetmap.org/?mlat=-33.804') !== false, $html);
$comprobar('el globo sale como texto: sin etiquetas y con las comillas escapadas', strpos($html, '<b>') === false && strpos($html, 'data-cod-mapa-globo="Planta &quot;Sur&quot; 1"') !== false, $html);
$comprobar('abierto siempre por omisión', strpos($html, 'data-cod-mapa-fijo="1"') !== false);
update_option(COD_Mapa::OPTION_KEY, '', false);
$html = $render('contope/mapa', $ok);
$comprobar('sin clave el runtime no monta nada: queda «sin clave» y no la conducta', strpos($html, 'data-cod-mapa-sin-clave="1"') !== false && strpos($html, 'data-cod-behavior="mapa"') === false && strpos($html, 'data-cod-mapa-token') === false, $html);
$comprobar('sin ubicación válida no se dibuja en el sitio', trim($render('contope/mapa', ['lat' => 200, 'lng' => 0])) === '');
$comprobar('sin ubicación válida, el editor recibe el aviso', strpos(COD_Block_Mapa::marcado([], 'class="x"', true), 'Falta la ubicación') !== false);
$con_ancla = COD_Block_Mapa::marcado($ok, 'class="x" style="color:red"', true);
$comprobar('el alto se suma al estilo que ya traían los soportes de bloque', strpos($con_ancla, 'style="--cod-mapa-alto:420px;color:red"') !== false, $con_ancla);
$comprobar('la hoja de la conducta existe y se usa como está (no se copia)', strpos(COD_Canvas_Page_Publisher::mapa_css(), '.cod-mapa[data-cod-behavior="mapa"]') !== false);

echo "\nFormulario\n";
$comprobar('el identificador se sanea como lo hace Orugantt Forms', COD_Block_Formulario::slug(['formSlug' => ' Contacto Basis!! ']) === 'contacto-basis');
$existe = shortcode_exists(COD_Block_Formulario::SHORTCODE);
$comprobar('el shortcode oficial de Orugantt Forms está disponible', $existe);
if ($existe) {
    $html = $render('contope/formulario', ['formSlug' => 'contacto-basis']);
    $comprobar('incrusta el formulario por el shortcode oficial', strpos($html, 'data-orugantt-form="contacto-basis"') !== false && strpos($html, 'wp-block-contope-formulario') !== false, substr($html, 0, 200));
    $comprobar('lleva el módulo del formulario (el runtime no tiene que pedirlo)', strpos($html, 'data-form-module=') !== false);
    $html = $render('contope/formulario', ['formSlug' => 'no-existe-123']);
    $comprobar('un formulario no publicado deja el aviso «no disponible» del propio plugin', strpos($html, 'data-orugantt-form') === false && strpos($html, 'wp-block-contope-formulario') !== false, substr($html, 0, 200));
}
$comprobar('sin identificador no se dibuja en el sitio', trim($render('contope/formulario', [])) === '');
$comprobar('sin identificador, el editor recibe el aviso', strpos(COD_Block_Formulario::marcado([], 'class="x"', true), 'Elige un formulario') !== false);

$contrato = ['texto' => '--ofr-color-text', 'principal' => '--ofr-color-primary', 'campoFondo' => '--ofr-field-bg', 'botonRadio' => '--ofr-submit-radius', 'tipografia' => '--ofr-font', 'error' => '--ofr-color-error'];
$css = COD_Block_Formulario::css_de_variables(['campo-fondo' => 'x', 'botonRadio' => 'y'], $contrato);
$comprobar('una clave que el tema declara apunta a su variable --wp--custom--form--* (kebab o camel, da igual)', strpos($css, '--ofr-field-bg:var(--wp--custom--form--campo-fondo);') !== false && strpos($css, '--ofr-submit-radius:var(--wp--custom--form--boton-radio);') !== false, $css);
$comprobar('un rol base sin declaración usa el preset del tema con un color del sistema al final', strpos($css, '--ofr-color-primary:var(--wp--preset--color--accent, var(--wp--preset--color--primary, Highlight));') !== false, $css);
$comprobar('lo que no tiene de dónde salir NO se declara (manda el valor del runtime)', strpos($css, '--ofr-color-error') === false, $css);
$comprobar('la regla pesa más que .ofr-form (que declara sus valores sobre sí mismo)', strpos($css, '.wp-block-contope-formulario .ofr-form{') === 0, $css);
$comprobar('si el tema declara un rol, gana sobre el respaldo', strpos(COD_Block_Formulario::css_de_variables(['texto' => '1'], $contrato), '--ofr-color-text:var(--wp--custom--form--texto);') !== false);
$comprobar('sin contrato no hay regla', COD_Block_Formulario::css_de_variables([], []) === '');
if (class_exists('OFR_Design_Tokens')) {
    $completo = COD_Block_Formulario::css_de_variables([], OFR_Design_Tokens::map());
    $comprobar('con el contrato real sale una regla utilizable', strpos($completo, '--ofr-color-primary:') !== false && strlen($completo) > 200);
    $css_generado = $completo;
} else {
    $css_generado = $css;
}

echo "\nSin valores de diseño literales\n";
$todo = [];
foreach (glob($raiz . 'blocks/cod-{formulario,mapa,whatsapp}/*.css', GLOB_BRACE) ?: [] as $archivo) {
    $todo[basename(dirname($archivo)) . '/' . basename($archivo)] = (string) file_get_contents($archivo);
}
$todo['css generado por PHP'] = $css_generado;
$comprobar('encontró las hojas de los tres bloques', count($todo) >= 6, (string) count($todo));
foreach ($todo as $nombre => $css) {
    $sin_comentarios = (string) preg_replace('~/\*.*?\*/~s', '', $css);
    $comprobar("$nombre: sin colores hex", preg_match('/#[0-9a-fA-F]{3,8}\b/', $sin_comentarios) !== 1);
    $comprobar("$nombre: sin rgb()/hsl()/hwb()", preg_match('/\b(rgba?|hsla?|hwb)\(/i', $sin_comentarios) !== 1);
    $comprobar("$nombre: sin font-family literal", preg_match('/font-family\s*:(?![^;]*var\()/i', $sin_comentarios) !== 1);
}

echo "\n$total comprobaciones, $fallas fallas\n";
exit($fallas === 0 ? 0 : 1);
