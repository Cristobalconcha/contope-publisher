<?php

/**
 * Que ninguna etiqueta de medición salga antes del consentimiento.
 *
 * Esto no se comprueba mirando la página: una etiqueta impresa de más no se
 * ve, y el día que se note será porque alguien reclamó. Así que se comprueba
 * acá, sobre el HTML que el plugin produce, con la cookie puesta a mano en sus
 * cuatro estados: sin responder, rechazado, aceptado todo y a medida.
 *
 * Uso:  php scripts/probar-consentimiento.php
 */

$raiz = dirname(__DIR__);

// ---------------------------------------------------------------------------
// El mínimo de WordPress que estas dos clases tocan.
// ---------------------------------------------------------------------------
define('ABSPATH', $raiz . '/');

$GLOBALS['cod_opciones'] = [];
$GLOBALS['cod_filtros'] = [];
$GLOBALS['cod_plugins_activos'] = [];

function add_filter($etiqueta, $funcion, $prioridad = 10, $args = 1)
{
    $GLOBALS['cod_filtros'][$etiqueta][] = $funcion;
    return true;
}
function apply_filters($etiqueta, $valor, ...$resto)
{
    foreach ($GLOBALS['cod_filtros'][$etiqueta] ?? [] as $funcion) {
        $valor = $funcion($valor, ...$resto);
    }
    return $valor;
}
function add_action($etiqueta, $funcion, $prioridad = 10, $args = 1)
{
    return true;
}
function get_option($nombre, $omision = false)
{
    return $GLOBALS['cod_opciones'][$nombre] ?? $omision;
}
function get_site_option($nombre, $omision = false)
{
    return $omision;
}
function update_option($nombre, $valor, $auto = null)
{
    $GLOBALS['cod_opciones'][$nombre] = $valor;
    return true;
}
function is_multisite()
{
    return false;
}
function is_admin()
{
    return false;
}
function wp_doing_ajax()
{
    return false;
}
function is_feed()
{
    return false;
}
function is_robots()
{
    return false;
}
function current_user_can($cap)
{
    return false;
}
function wp_unslash($valor)
{
    return is_string($valor) ? stripslashes($valor) : $valor;
}
function esc_attr($t)
{
    return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8');
}
function esc_url($t)
{
    return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8');
}
function esc_js($t)
{
    return addslashes((string) $t);
}
function esc_html($t)
{
    return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8');
}
function esc_html__($t, $dominio = null)
{
    return $t;
}
function wp_die($m)
{
    throw new RuntimeException((string) $m);
}

require_once $raiz . '/contope-publisher/includes/class-cod-consentimiento.php';
require_once $raiz . '/contope-publisher/includes/class-cod-medicion.php';

// ---------------------------------------------------------------------------
// Andamio
// ---------------------------------------------------------------------------
$total = 0;
$malas = [];

function comprobar(string $que, bool $cierto): void
{
    global $total, $malas;
    $total++;
    if (!$cierto) {
        $malas[] = $que;
    }
}

/** El HTML que el plugin imprimiría con esta cookie y estos ajustes. */
function salida(?string $cookie, array $ajustes, bool $con_gestor = true): string
{
    $GLOBALS['cod_opciones'][COD_Medicion::OPTION_KEY] = $ajustes;
    $GLOBALS['cod_plugins_activos'] = $con_gestor ? ['cookieadmin/cookieadmin.php'] : [];
    $GLOBALS['cod_opciones']['active_plugins'] = $GLOBALS['cod_plugins_activos'];

    if ($cookie === null) {
        unset($_COOKIE['cookieadmin_consent']);
    } else {
        $_COOKIE['cookieadmin_consent'] = $cookie;
    }
    COD_Consentimiento::olvidar();

    $medicion = new COD_Medicion();
    ob_start();
    $medicion->imprimir_en_head();
    $medicion->imprimir_tras_body();

    return (string) ob_get_clean();
}

/** ¿Hay un guion que SE EJECUTA pidiendo esto? Los dormidos no cuentan. */
function ejecuta(string $html, string $aguja): bool
{
    foreach (guiones($html) as $guion) {
        if ($guion['vivo'] && strpos($guion['cuerpo'], $aguja) !== false) {
            return true;
        }
    }

    // Un `<iframe>` o una `<img>` de un `<noscript>` se cargan solos: cuentan
    // como ejecución aunque no sean un guion.
    if (preg_match_all('/<(?:iframe|img)[^>]*>/i', $html, $m)) {
        foreach ($m[0] as $etiqueta) {
            if (strpos($etiqueta, $aguja) !== false) {
                return true;
            }
        }
    }

    return false;
}

/** ¿Está presente pero dormido, esperando esa categoría? */
function dormido(string $html, string $aguja, string $categoria): bool
{
    foreach (guiones($html) as $guion) {
        if (!$guion['vivo']
            && strpos($guion['cuerpo'], $aguja) !== false
            && strpos($guion['apertura'], 'data-cookieadmin-category="' . $categoria . '"') !== false) {
            return true;
        }
    }

    return false;
}

/**
 * Parte el HTML en guiones. Un guion está «vivo» si el navegador lo ejecuta:
 * es decir, si NO lleva `type="text/plain"`.
 *
 * @return list<array{apertura: string, cuerpo: string, vivo: bool}>
 */
function guiones(string $html): array
{
    $fuera = [];
    if (!preg_match_all('/<script([^>]*)>(.*?)<\/script>/is', $html, $m, PREG_SET_ORDER)) {
        return $fuera;
    }
    foreach ($m as $uno) {
        $apertura = $uno[1];
        $fuera[] = [
            'apertura' => $apertura,
            // El `src` cuenta como cuerpo: ahí va la URL que se pide.
            'cuerpo' => $apertura . ' ' . $uno[2],
            'vivo' => stripos($apertura, 'text/plain') === false,
        ];
    }

    return $fuera;
}

const TODO = [
    'gtm' => 'GTM-ABC1234',
    'ga4' => 'G-ABC1234XYZ',
    'ads' => 'AW-751289133',
    'ads_conv_formulario' => 'AW-751289133/AbC-dEfGhIjKlMnOpQr',
    'ads_conv_whatsapp' => '',
    'meta_pixel' => '123456789012345',
    'verificaciones' => 'google-site-verification=abc123',
    'excluir_admin' => false,
];

// ---------------------------------------------------------------------------
// 1. SIN RESPONDER. Éste es el caso que falló de verdad.
// ---------------------------------------------------------------------------
$html = salida(null, TODO);

comprobar('sin responder: Tag Manager no se ejecuta', !ejecuta($html, 'googletagmanager.com/gtm.js'));
comprobar('sin responder: la etiqueta de Google no se ejecuta', !ejecuta($html, 'gtag/js'));
comprobar('sin responder: no se configura ningún identificador', !ejecuta($html, "gtag('config'"));
comprobar('sin responder: el pixel de Meta no se ejecuta', !ejecuta($html, 'fbevents.js'));
comprobar('sin responder: la conversión no engancha nada', !ejecuta($html, '__codConversiones'));
comprobar('sin responder: el iframe de Tag Manager no está', !ejecuta($html, 'googletagmanager.com/ns.html'));
comprobar('sin responder: el pixel sin JavaScript no está', !ejecuta($html, 'facebook.com/tr?id='));

// NADA de terceros, dicho de una vez y sin lista de agujas: es la comprobación
// que de verdad importa y la que sobrevive a que mañana se agregue otra
// etiqueta y nadie se acuerde de añadirla acá arriba.
$terceros = ['googletagmanager.com', 'google-analytics.com', 'doubleclick.net', 'facebook.net', 'facebook.com'];
$vivo_con_tercero = false;
foreach (guiones($html) as $guion) {
    if (!$guion['vivo']) {
        continue;
    }
    foreach ($terceros as $tercero) {
        if (strpos($guion['cuerpo'], $tercero) !== false) {
            $vivo_con_tercero = true;
        }
    }
}
comprobar('sin responder: NINGÚN guion vivo nombra a un tercero', !$vivo_con_tercero);

// Y lo que sí tiene que salir siempre.
comprobar('sin responder: el Consent Mode sí se imprime', strpos($html, "gtag('consent','default'") !== false);
comprobar('sin responder: la publicidad va denegada', strpos($html, "'ad_storage':'denied'") !== false);
comprobar('sin responder: la medición va denegada', strpos($html, "'analytics_storage':'denied'") !== false);
comprobar('sin responder: seguridad sí concedida', strpos($html, "'security_storage':'granted'") !== false);
comprobar('sin responder: la verificación de propiedad sí sale', strpos($html, 'google-site-verification') !== false);

// Y que esté dormido, no ausente: así despierta al aceptar sin recargar.
comprobar('sin responder: Tag Manager queda dormido', dormido($html, 'gtm.js', 'analytics'));
comprobar('sin responder: la conversión queda dormida', dormido($html, '__codConversiones', 'marketing'));
comprobar('sin responder: el pixel de Meta queda dormido', dormido($html, 'fbevents.js', 'marketing'));

// CADA IDENTIFICADOR DUERME BAJO SU PROPIA CATEGORÍA. Esto estuvo mal escrito:
// los dos `gtag('config')` viajaban en UN solo guion dormido, así que aceptar
// nada más que medición lo habría despertado entero y configurado también la
// cuenta de publicidad. Un consentimiento a medias que en realidad concedía
// todo —y sin que se notara, porque la página se ve igual—.
comprobar(
    'sin responder: Analytics duerme bajo medición',
    dormido($html, "gtag('config','G-ABC1234XYZ')", 'analytics')
);
comprobar(
    'sin responder: Ads duerme bajo publicidad',
    dormido($html, "gtag('config','AW-751289133')", 'marketing')
);
comprobar(
    'sin responder: NINGÚN guion dormido de medición menciona la cuenta de Ads',
    !(function (string $html): bool {
        foreach (guiones($html) as $g) {
            if (!$g['vivo']
                && strpos($g['apertura'], 'data-cookieadmin-category="analytics"') !== false
                && strpos($g['cuerpo'], 'AW-751289133') !== false) {
                return true;
            }
        }
        return false;
    })($html)
);

// ---------------------------------------------------------------------------
// 2. RECHAZADO. Igual que sin responder: no hay un «rechazó, pero igual».
// ---------------------------------------------------------------------------
$html = salida('{"reject":"true"}', TODO);
comprobar('rechazado: Tag Manager no se ejecuta', !ejecuta($html, 'gtm.js'));
comprobar('rechazado: la etiqueta de Google no se ejecuta', !ejecuta($html, 'gtag/js'));
comprobar('rechazado: el pixel de Meta no se ejecuta', !ejecuta($html, 'fbevents.js'));
comprobar('rechazado: la conversión no engancha', !ejecuta($html, '__codConversiones'));
comprobar('rechazado: publicidad denegada en Consent Mode', strpos($html, "'ad_user_data':'denied'") !== false);

// ---------------------------------------------------------------------------
// 3. ACEPTADO TODO. Acá tiene que medir: una puerta que no abre es un defecto.
// ---------------------------------------------------------------------------
$html = salida('{"accept":"true"}', TODO);
comprobar('aceptado: Tag Manager se ejecuta', ejecuta($html, 'googletagmanager.com/gtm.js'));
comprobar('aceptado: la etiqueta de Google se ejecuta', ejecuta($html, 'gtag/js'));
comprobar('aceptado: se configura Analytics', ejecuta($html, "gtag('config','G-ABC1234XYZ')"));
comprobar('aceptado: se configura Ads', ejecuta($html, "gtag('config','AW-751289133')"));
comprobar('aceptado: el pixel de Meta se ejecuta', ejecuta($html, 'fbevents.js'));
comprobar('aceptado: la conversión engancha', ejecuta($html, '__codConversiones'));
comprobar('aceptado: el iframe de Tag Manager está', ejecuta($html, 'googletagmanager.com/ns.html'));
comprobar('aceptado: todo concedido en Consent Mode', strpos($html, "'ad_storage':'granted'") !== false);
comprobar('aceptado: nada queda dormido', strpos($html, 'text/plain') === false);

// ---------------------------------------------------------------------------
// 4. A MEDIDA. Es donde se ve si la puerta distingue o sólo abre y cierra.
// ---------------------------------------------------------------------------
$html = salida('{"analytics":"true"}', TODO);
comprobar('sólo medición: Analytics se configura', ejecuta($html, "gtag('config','G-ABC1234XYZ')"));
comprobar('sólo medición: Ads NO se configura', !ejecuta($html, "gtag('config','AW-751289133')"));
comprobar('sólo medición: el pixel de Meta no se ejecuta', !ejecuta($html, 'fbevents.js'));
comprobar('sólo medición: la conversión no engancha', !ejecuta($html, '__codConversiones'));
comprobar('sólo medición: Tag Manager sí se ejecuta', ejecuta($html, 'googletagmanager.com/gtm.js'));
comprobar('sólo medición: medición concedida', strpos($html, "'analytics_storage':'granted'") !== false);
comprobar('sólo medición: publicidad denegada', strpos($html, "'ad_storage':'denied'") !== false);

$html = salida('{"marketing":"true"}', TODO);
comprobar('sólo publicidad: Ads se configura', ejecuta($html, "gtag('config','AW-751289133')"));
comprobar('sólo publicidad: Analytics NO se configura', !ejecuta($html, "gtag('config','G-ABC1234XYZ')"));
comprobar('sólo publicidad: la conversión engancha', ejecuta($html, '__codConversiones'));
comprobar('sólo publicidad: Tag Manager se ejecuta', ejecuta($html, 'googletagmanager.com/gtm.js'));
comprobar('sólo publicidad: medición denegada', strpos($html, "'analytics_storage':'denied'") !== false);

// El sinónimo de otros gestores.
$html = salida('{"advertisement":"true"}', TODO);
comprobar('sinónimo advertisement: cuenta como publicidad', ejecuta($html, "gtag('config','AW-751289133')"));
$html = salida('{"analytical":"true"}', TODO);
comprobar('sinónimo analytical: cuenta como medición', ejecuta($html, "gtag('config','G-ABC1234XYZ')"));

// ---------------------------------------------------------------------------
// 5. SIN GESTOR. El sitio queda como estaba: nada se apaga en silencio.
// ---------------------------------------------------------------------------
$html = salida(null, TODO, false);
comprobar('sin gestor: Tag Manager se ejecuta', ejecuta($html, 'googletagmanager.com/gtm.js'));
comprobar('sin gestor: la etiqueta de Google se ejecuta', ejecuta($html, 'gtag/js'));
comprobar('sin gestor: el pixel de Meta se ejecuta', ejecuta($html, 'fbevents.js'));
comprobar('sin gestor: nada dormido', strpos($html, 'text/plain') === false);
comprobar('sin gestor: Consent Mode concede', strpos($html, "'ad_storage':'granted'") !== false);
comprobar(
    'sin gestor: la pantalla avisa',
    strpos(implode(' ', COD_Medicion::avisos_de_conversion(TODO)), '21.719') !== false
);

// Y con gestor NO avisa, que es la otra mitad del mismo aviso.
$GLOBALS['cod_opciones']['active_plugins'] = ['cookieadmin/cookieadmin.php'];
COD_Consentimiento::olvidar();
comprobar(
    'con gestor: la pantalla no avisa de la ley',
    strpos(implode(' ', COD_Medicion::avisos_de_conversion(TODO)), '21.719') === false
);

// ---------------------------------------------------------------------------
// 6. El filtro para forzar la puerta sin gestor reconocido.
// ---------------------------------------------------------------------------
add_filter('cod_consentimiento_exigir', static fn () => true);
$html = salida(null, TODO, false);
comprobar('filtro exigir: cierra la puerta sin gestor', !ejecuta($html, 'googletagmanager.com/gtm.js'));
$GLOBALS['cod_filtros'] = [];

// ---------------------------------------------------------------------------
// 7. Una cookie basura no abre la puerta.
// ---------------------------------------------------------------------------
foreach (['', 'no-es-json', '{}', '[]', 'null', '{"accept":"false"}', '{"accept":0}'] as $basura) {
    $html = salida($basura, TODO);
    comprobar(
        'cookie basura ' . var_export($basura, true) . ': no mide',
        !ejecuta($html, 'googletagmanager.com/gtm.js') && !ejecuta($html, 'fbevents.js')
    );
}

// Y la lectura directa, por si alguien cambia el emisor.
comprobar(
    'leer_cookie: rechazo no concede nada',
    COD_Consentimiento::leer_cookie('{"reject":"true"}') === ['functional' => false, 'analytics' => false, 'marketing' => false]
);
comprobar(
    'leer_cookie: aceptar concede las tres',
    COD_Consentimiento::leer_cookie('{"accept":"true"}') === ['functional' => true, 'analytics' => true, 'marketing' => true]
);
comprobar(
    'leer_cookie: el rechazo gana sobre una categoría suelta',
    COD_Consentimiento::leer_cookie('{"reject":"true","marketing":"true"}')['marketing'] === false
);

// ---------------------------------------------------------------------------
// 8. Sin nada configurado no se imprime ni el Consent Mode.
// ---------------------------------------------------------------------------
$html = salida(null, [
    'gtm' => '', 'ga4' => '', 'ads' => '', 'ads_conv_formulario' => '',
    'ads_conv_whatsapp' => '', 'meta_pixel' => '', 'verificaciones' => '', 'excluir_admin' => false,
]);
comprobar('sin etiquetas: no se imprime nada', trim($html) === '');

// ---------------------------------------------------------------------------
echo "\n";
if ($malas === []) {
    echo "probar-consentimiento.php   $total de $total.   TODO OK\n";
    exit(0);
}
echo "probar-consentimiento.php   " . ($total - count($malas)) . " de $total.\n\n";
foreach ($malas as $mala) {
    echo "  FALLA  $mala\n";
}
exit(1);
