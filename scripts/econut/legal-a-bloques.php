<?php

/**
 * Pasa la página de términos y privacidad de una composición del lienzo a
 * BLOQUES DE WORDPRESS normales.
 *
 * POR QUÉ. La compuse en el lienzo y se lo presenté a Cristóbal como una
 * ventaja: «así puedes editar el texto donde editas todo lo demás». Su
 * corrección, el 3 de octubre:
 *
 *   «Lo que menciona es que no está vinculado con bloques de WordPress, sino
 *    que se edita en el mismo lugar que el resto de los textos. O sea que
 *    ningún texto se puede editar en una ventana natural de WordPress. Porque
 *    nuestro plugin, si hay algo que no tiene, es una facilidad para editar en
 *    el propio plugin.»
 *
 * Tiene razón, y es lo contrario de lo que yo dije: que un texto sólo se pueda
 * tocar dentro del publisher no es una virtud, es la carencia. Está pedido
 * desde antes y anotado en la arquitectura: los contenidos normales —títulos,
 * textos, fotografías— tienen que ser bloques de WordPress y abrirse en las
 * páginas de WordPress.
 *
 * Un documento legal es el caso más claro. Lo va a corregir un abogado, que no
 * conoce el lienzo y no tiene por qué aprenderlo, y no lleva ni una decisión de
 * diseño: es texto con jerarquía. El lienzo no aportaba nada y estorbaba.
 *
 * QUÉ HACE ESTO. Reemplaza el shortcode `[contope_canvas …]` del post_content
 * por bloques de verdad (encabezados, párrafos, listas y una tabla). Desde ese
 * momento la página se abre y se edita en el editor de WordPress como
 * cualquier otra, y el documento del lienzo queda huérfano —no se borra: si
 * alguna vez se quiere volver atrás, está—.
 *
 * LO QUE ESTO NO ARREGLA. El hueco de fondo sigue abierto: un texto que SÍ
 * necesita el lienzo —un titular sobre una foto, una cifra dentro de un
 * cuadrante— sigue sin poder ser un bloque de WordPress. Eso es trabajo aparte
 * y está anotado como issue.
 *
 * Uso:  php scripts/econut/legal-a-bloques.php [--probar]
 */

$raiz = dirname(__DIR__, 2);
define('WP_USE_THEMES', false);
require dirname($raiz) . '/wp-local-econut/wordpress/wp-load.php';

$soloProbar = in_array('--probar', $argv, true);

$pagina = get_page_by_path('terminos-y-privacidad');
if (!$pagina) {
    echo "No encuentro la página 'terminos-y-privacidad'.\n";
    exit(1);
}

/** Un bloque de encabezado. */
$h = static function (string $texto, int $nivel = 2): string {
    $attr = $nivel === 2 ? '' : ' {"level":' . $nivel . '}';
    return "<!-- wp:heading$attr -->\n<h$nivel class=\"wp-block-heading\">"
        . esc_html($texto) . "</h$nivel>\n<!-- /wp:heading -->";
};

/** Un párrafo. `$html` permite negritas, que el bloque admite. */
$p = static function (string $texto): string {
    return "<!-- wp:paragraph -->\n<p>$texto</p>\n<!-- /wp:paragraph -->";
};

/** Una lista con viñetas. @param list<string> $items */
$ul = static function (array $items): string {
    $li = '';
    foreach ($items as $item) {
        $li .= "<!-- wp:list-item -->\n<li>" . $item . "</li>\n<!-- /wp:list-item -->\n";
    }
    return "<!-- wp:list -->\n<ul class=\"wp-block-list\">\n" . $li . "</ul>\n<!-- /wp:list -->";
};

/**
 * Un recuadro de aviso. Es un bloque `group` con su color de fondo puesto por
 * estilo en línea y no por una clase del tema: así se ve igual en el editor y
 * en la página, y quien lo edite lo ve tal cual quedará.
 */
$aviso = static function (string $texto): string {
    return "<!-- wp:group {\"style\":{\"color\":{\"background\":\"#dbd4c0\"},"
        . "\"spacing\":{\"padding\":{\"top\":\"16px\",\"right\":\"20px\",\"bottom\":\"16px\",\"left\":\"20px\"}},"
        . "\"border\":{\"radius\":\"10px\"}},\"layout\":{\"type\":\"constrained\"}} -->\n"
        . "<div class=\"wp-block-group has-background\" style=\"border-radius:10px;background-color:#dbd4c0;"
        . "padding-top:16px;padding-right:20px;padding-bottom:16px;padding-left:20px\">\n"
        . "<!-- wp:paragraph -->\n<p>" . $texto . "</p>\n<!-- /wp:paragraph -->\n"
        . "</div>\n<!-- /wp:group -->";
};

$tabla = "<!-- wp:table -->\n<figure class=\"wp-block-table\"><table><thead><tr>"
    . "<th>Servicio</th><th>Para qué</th><th>Dónde</th></tr></thead><tbody>"
    . "<tr><td>Google (Tag Manager, Ads)</td><td>Medir el sitio y nuestras campañas</td><td>Estados Unidos</td></tr>"
    . "<tr><td>Mapbox</td><td>Mostrar el mapa de cómo llegar</td><td>Estados Unidos</td></tr>"
    . "</tbody></table></figure>\n<!-- /wp:table -->";

$bloques = [
    $p('<em>Última actualización: 3 de octubre de 2026.</em>'),

    $h('1. Quién es el responsable'),
    $p('Comercializadora Econut SpA, RUT 76.717.930-8, con domicilio en Avda. 18 de Septiembre S/N, '
        . 'Hijuela 2, Fundo San Rafael, Sector Nuevo Sendero, Paine, Región Metropolitana, es responsable '
        . 'del tratamiento de los datos personales que se recogen en este sitio.'),
    $p('Para cualquier materia relacionada con sus datos personales puede escribir a '
        . '<a href="mailto:contacto@econut.cl">contacto@econut.cl</a> o llamar al (56 2) 2 824 2229.'),

    $h('2. Qué datos recogemos'),
    $p('<strong>Los que usted nos entrega.</strong> Cuando completa el formulario de contacto le pedimos '
        . 'su nombre, su correo electrónico, su teléfono y el mensaje que quiera dejarnos, además del área '
        . 'a la que dirige su consulta.'),
    $p('<strong>Los que se recogen solos.</strong> Si usted lo autoriza, recogemos datos sobre cómo usa el '
        . 'sitio: qué páginas visita, cuánto tiempo permanece y desde qué tipo de dispositivo entra. Esto se '
        . 'hace mediante cookies, y sólo si acepta.'),

    $h('3. Para qué los usamos'),
    $ul([
        'Para responder su consulta.',
        'Para contactarlo si solicita información sobre nuestros productos o servicios.',
        'Si lo autoriza, para entender cómo se usa el sitio y mejorar su contenido, y para medir nuestras '
            . 'campañas de publicidad.',
    ]),
    $p('No vendemos sus datos personales a terceros.'),

    $h('4. Con quién los compartimos'),
    $p('Usamos servicios de terceros que pueden tratar datos desde fuera de Chile. Se activan sólo si usted '
        . 'acepta las cookies correspondientes:'),
    $tabla,

    $h('5. Sus derechos'),
    $p('Usted puede, en cualquier momento y sin costo:'),
    $ul([
        '<strong>Acceder</strong> a los datos que tenemos sobre usted.',
        '<strong>Rectificarlos</strong> si están equivocados o incompletos.',
        '<strong>Cancelarlos</strong>, pidiendo que los eliminemos.',
        '<strong>Oponerse</strong> a que los usemos para un fin determinado.',
        '<strong>Portarlos</strong>, pidiendo que se los entreguemos en un formato que pueda llevarse a otra parte.',
    ]),
    $p('Para ejercer cualquiera de estos derechos escriba a <a href="mailto:contacto@econut.cl">contacto@econut.cl</a> '
        . 'indicando cuál de ellos quiere ejercer. Le responderemos en el plazo que establece la ley.'),
    $p('Si considera que no respondimos adecuadamente, puede reclamar ante la Agencia de Protección de Datos '
        . 'Personales.'),

    $h('6. Cookies'),
    $p('Este sitio usa cookies. Las necesarias para que funcione están siempre activas; las de medición y '
        . 'publicidad sólo se activan si usted las acepta, y nada se carga antes de que responda.'),
    $p('Puede cambiar su decisión cuando quiera desde «Preferencias de cookies», en el pie de cualquier página.'),

    $h('7. Cuánto tiempo conservamos sus datos'),
    $aviso('<strong>Pendiente:</strong> este plazo lo define la empresa. Debe decir un plazo concreto o un '
        . 'criterio claro, no «el tiempo necesario».'),

    $h('8. Quién responde por sus datos'),
    $aviso('<strong>Pendiente:</strong> la empresa debe designar a quién responde las solicitudes sobre datos '
        . 'personales, y publicar acá su contacto.'),

    $h('9. Cambios a esta política'),
    $p('Si cambiamos esta política publicaremos la versión nueva en esta misma página, indicando la fecha de '
        . 'la última actualización.'),

    $h('Normativa aplicable'),
    $p('Esta política se rige por la Ley 19.628 sobre protección de la vida privada y por la Ley 21.719, que '
        . 'entra en vigencia el 1 de diciembre de 2026.'),
];

// De qué documento sale la FORMA. El contenido ya no vive ahí: vive en los
// bloques de arriba.
$documento = (string) get_post_meta($pagina->ID, '_cod_document_id', true);
if ($documento === '') {
    $documento = 'cod-canvas-page-' . $pagina->ID;
}

// Todo va DENTRO del contenedor de ContOpe. Eso es lo que hace que la página
// siga siendo parte del sitio —encabezado, pie, hojas de estilo—: el plugin
// reconoce este bloque igual que reconocía su shortcode. Sin el contenedor, la
// página se sale del sitio, que es exactamente lo que pasó el 3 de octubre al
// primer intento.
$contenido = '<!-- wp:contope/lienzo {"documentId":"' . $documento . '"} -->' . "\n"
    . implode("\n\n", $bloques) . "\n"
    . '<!-- /wp:contope/lienzo -->' . "\n";

echo "Página: {$pagina->ID}  ({$pagina->post_name})\n";
echo "Ahora: " . (strpos($pagina->post_content, '[contope_canvas') !== false
    ? 'una composición del lienzo (shortcode)'
    : 'contenido propio') . "\n";
echo "Quedará: " . count($bloques) . " bloques de WordPress, " . strlen($contenido) . " caracteres.\n";

if ($soloProbar) {
    echo "\n(--probar: no escribo nada)\n";
    exit(0);
}

$r = wp_update_post(['ID' => $pagina->ID, 'post_content' => $contenido], true);
if (is_wp_error($r)) {
    echo "ERROR: " . $r->get_error_message() . "\n";
    exit(1);
}

echo "\nListo. Se edita en: " . admin_url('post.php?post=' . $pagina->ID . '&action=edit') . "\n";
echo "Se ve en: " . get_permalink($pagina->ID) . "\n";
echo "\nEl documento del lienzo (cod-canvas-page-55) queda huérfano, no borrado.\n";
