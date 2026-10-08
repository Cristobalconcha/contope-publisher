<?php
/**
 * Verifica la conversión de Google Ads al enviar un formulario o abrir WhatsApp
 * (0.3.43), en la medición del plugin.
 *
 * Lo que se mide:
 *  1. sin etiquetas de conversión no se emite ningún guion de conversión (y lo
 *     que ya se emitía —el tag de Ads— sigue ahí)
 *  2. con la etiqueta del formulario: el `send_to` correcto y los tres
 *     enganches (evento propio, Gravity por jQuery y Gravity nativo); sin los de
 *     WhatsApp
 *  3. con la de WhatsApp: su etiqueta y su enganche; sin los del formulario
 *  4. quien administra no mide (debe_medir), con la exclusión activa
 *  5. una etiqueta mal escrita se rechaza al guardar y el aviso nombra el campo;
 *     lo que ya estaba guardado no se borra; una bien escrita conserva sus
 *     mayúsculas
 *  6. la pantalla avisa si hay etiqueta sin ID de Ads, o con el de otra cuenta
 *  7. lo que sale al HTML va escapado
 *  8. el guion EJECUTADO (en Node, con un window y un jQuery de mentira): una
 *     conversión por envío, sea cual sea la vía por la que llegue el aviso,
 *     nada más que `send_to`, sin tocar el dataLayer, y sin explotar si falta
 *     gtag o jQuery
 *
 * No toca la base de datos: la opción `cod_medicion` se sustituye con un filtro.
 *
 * Corre contra el WordPress local de Econut: sincronizar antes con
 *   node scripts/sincronizar-plugin.mjs --a econut --aplicar
 * Nunca contra wp-local (ése es Santa Luisa). Necesita `node` en el PATH.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$total = 0;
$verifica = function (string $nombre, bool $bien, string $detalle = '') use (&$fallas, &$total): void {
    $total++;
    if (!$bien) {
        $fallas++;
    }
    printf("%s  %-58s  %s\n", $bien ? 'OK  ' : 'FALLA', $nombre, $detalle);
};

$FORM = 'AW-751289133/dnRYCLmy84odEK2Gn-YC';
$WA = 'AW-751289133/WhAtSaPpLaBeL_01';
$BASE = [
    'consentimiento' => 'auto', // estas pruebas miden la PUERTA; el modo «heredado» tiene su prueba aparte
    'gtm' => '', 'ga4' => '', 'ads' => 'AW-751289133', 'meta_pixel' => '', 'verificaciones' => '',
    'excluir_admin' => false, 'ads_conv_formulario' => '', 'ads_conv_whatsapp' => '',
];

// Desde el 0.3.48 nada de medición se imprime hasta que el visitante acepta.
// Esta prueba es sobre QUÉ se mide y cómo, no sobre la puerta —ésa tiene la
// suya, `probar-consentimiento.php`—, así que se pone en el caso de alguien
// que ya aceptó. Sin esto, todo lo de abajo mediría el guion dormido y daría
// una falla por cada comprobación, escondiendo lo que de verdad prueba.
$_COOKIE['cookieadmin_consent'] = '{"accept":"true"}';
COD_Consentimiento::olvidar();

/** Lo que imprime la medición en el head con esos ajustes (sin tocar la base). */
$cabecera = function (array $ajustes) use ($BASE): string {
    $filtro = static fn () => array_merge($BASE, $ajustes);
    add_filter('pre_option_cod_medicion', $filtro);
    ob_start();
    (new COD_Medicion())->imprimir_en_head();
    $salida = (string) ob_get_clean();
    remove_filter('pre_option_cod_medicion', $filtro);

    return $salida;
};

/** Los guiones de conversión de un HTML. */
$guiones = function (string $html): array {
    preg_match_all('#<script>(.*?)</script>#s', $html, $m);

    return array_values(array_filter($m[1], static fn ($js) => strpos($js, '__codConversiones') !== false));
};

// 1. Sin etiquetas.
$html = $cabecera([]);
$verifica('sin etiquetas: ningún guion de conversión', $guiones($html) === [] && strpos($html, 'Conversiones de Google Ads') === false);
$verifica('sin etiquetas: el tag de Ads sigue emitiéndose', strpos($html, "gtag('config','AW-751289133')") !== false);

// 2. Sólo formulario.
$html = $cabecera(['ads_conv_formulario' => $FORM]);
$g = $guiones($html);
$js = $g[0] ?? '';
$verifica('formulario: un solo guion', count($g) === 1);
$verifica('formulario: el send_to correcto', strpos($js, "contar('" . $FORM . "','formulario-propio')") !== false);
$verifica('formulario: motor propio (evento de ventana)', strpos($js, "addEventListener('orugantt-forms:enviado'") !== false);
$verifica('formulario: Gravity nativo', strpos($js, "d.addEventListener('gform_confirmation_loaded'") !== false);
$verifica('formulario: Gravity por jQuery, sólo si existe', strpos($js, "if(gancho||!w.jQuery)return") !== false && strpos($js, "w.jQuery(d).on('gform_confirmation_loaded'") !== false);
$verifica('formulario: sin enganche de WhatsApp', strpos($js, 'cod:whatsapp-enviado') === false);
$verifica('formulario: no escucha el dataLayer ni gtag de otros', strpos($js, 'dataLayer') === false && strpos($js, 'formulario_enviado') === false);
$verifica('formulario: guarda contra doble impresión', strpos($js, 'w.__codConversiones') !== false);
$verifica('formulario: va después de gtag config', strpos($html, "gtag('config'") < strpos($html, '__codConversiones'));

// 3. Sólo WhatsApp.
$html = $cabecera(['ads_conv_whatsapp' => $WA]);
$js = ($guiones($html)[0] ?? '');
$verifica('whatsapp: su etiqueta y su enganche', strpos($js, "addEventListener('cod:whatsapp-enviado'") !== false && strpos($js, "contar('" . $WA . "','whatsapp')") !== false);
$verifica('whatsapp: sin enganches de formulario', strpos($js, 'orugantt-forms') === false && strpos($js, 'gform_confirmation_loaded') === false);

// Las dos a la vez.
$js_ambos = ($guiones($cabecera(['ads_conv_formulario' => $FORM, 'ads_conv_whatsapp' => $WA]))[0] ?? '');
$verifica('ambas: cada una con su etiqueta', strpos($js_ambos, $FORM) !== false && strpos($js_ambos, $WA) !== false);

// 4. Quien administra no mide.
$admin = get_users(['role' => 'administrator', 'number' => 1]);
if ($admin !== []) {
    wp_set_current_user((int) $admin[0]->ID);
    $con = $cabecera(['ads_conv_formulario' => $FORM, 'excluir_admin' => true]);
    $verifica('administrador con exclusión: no se emite nada', $con === '');
    $sin = $cabecera(['ads_conv_formulario' => $FORM, 'excluir_admin' => false]);
    $verifica('administrador sin exclusión: sí se emite', $guiones($sin) !== []);
    wp_set_current_user(0);
} else {
    $verifica('hay un administrador para probar la exclusión', false, 'no hay usuarios administradores en el local');
}
require_once ABSPATH . 'wp-admin/includes/class-wp-screen.php';
require_once ABSPATH . 'wp-admin/includes/screen.php';
set_current_screen('dashboard');
$verifica('en el admin no se emite', $cabecera(['ads_conv_formulario' => $FORM]) === '');
unset($GLOBALS['current_screen']);

// 5. Validación al guardar.
$previos = array_merge($BASE, ['ads_conv_formulario' => $FORM]);
[$valores, $errores] = COD_Medicion::procesar_envio(['cod_medicion_ads_conv_formulario' => 'AW-751289133'], $previos);
$verifica('etiqueta sin la parte después de la barra: rechazada', $errores === ['ads_conv_formulario']);
$verifica('rechazada: se conserva lo que había', $valores['ads_conv_formulario'] === $FORM);
$mensaje = COD_Medicion::mensaje_de_errores($errores);
$verifica('el aviso nombra el campo y da un ejemplo', strpos($mensaje, 'Conversión de Ads: envío de formulario') !== false && strpos($mensaje, 'AW-123456789/') !== false, $mensaje);
[, $errores] = COD_Medicion::procesar_envio(['cod_medicion_ads_conv_whatsapp' => 'hola mundo'], $BASE);
$verifica('whatsapp mal escrito: nombra el suyo', $errores === ['ads_conv_whatsapp'] && strpos(COD_Medicion::mensaje_de_errores($errores), 'WhatsApp') !== false);
[$valores, $errores] = COD_Medicion::procesar_envio(['cod_medicion_ads_conv_formulario' => "gtag('event', 'conversion', {'send_to': '" . $FORM . "'});"], $BASE);
$verifica('el fragmento de Google se acepta', $errores === [] && $valores['ads_conv_formulario'] === $FORM, (string) $valores['ads_conv_formulario']);
[$valores] = COD_Medicion::procesar_envio(['cod_medicion_ads_conv_formulario' => ' aw-751289133/dnRYCLmy84odEK2Gn-YC '], $BASE);
$verifica('prefijo en minúsculas: se corrige, la etiqueta no', $valores['ads_conv_formulario'] === $FORM, (string) $valores['ads_conv_formulario']);
[$valores, $errores] = COD_Medicion::procesar_envio(['cod_medicion_ads_conv_formulario' => ''], $previos);
$verifica('vaciar el campo a propósito sí lo vacía', $errores === [] && $valores['ads_conv_formulario'] === '');

// 6. Avisos en la pantalla.
// Los avisos dependen de COD_Consentimiento::exigir(), que lee la opción guardada: se fija en «auto»
// para que lo que se mide sea el aviso y no el estado de la base de este local.
$fija_auto = static fn () => $BASE;
add_filter('pre_option_cod_medicion', $fija_auto);
COD_Consentimiento::olvidar();
$av = COD_Medicion::avisos_de_conversion(array_merge($BASE, ['ads' => '', 'ads_conv_formulario' => $FORM]));
$verifica('etiqueta sin ningún ID: avisa', count($av) === 1 && strpos($av[0], 'no medirá nada') !== false, $av[0] ?? '');
$av = COD_Medicion::avisos_de_conversion(array_merge($BASE, ['ads' => 'AW-999999999', 'ads_conv_whatsapp' => $WA]));
$verifica('etiqueta de otra cuenta que la de Ads: avisa', count($av) === 1 && strpos($av[0], 'AW-751289133') !== false, $av[0] ?? '');
$av = COD_Medicion::avisos_de_conversion(array_merge($BASE, ['ads' => '', 'ga4' => 'G-ABC1234XYZ', 'ads_conv_formulario' => $FORM]));
$verifica('sólo Analytics 4 y etiqueta de Ads: avisa', count($av) === 1, $av[0] ?? '');
$verifica('etiqueta con su ID: sin avisos', COD_Medicion::avisos_de_conversion(array_merge($BASE, ['ads_conv_formulario' => $FORM, 'ads_conv_whatsapp' => $WA])) === []);
$verifica('sin etiquetas: sin avisos', COD_Medicion::avisos_de_conversion($BASE) === []);
remove_filter('pre_option_cod_medicion', $fija_auto);

// La pantalla de verdad: los campos nuevos y el aviso salen en el HTML.
if ($admin !== []) {
    wp_set_current_user((int) $admin[0]->ID);
    $filtro = static fn () => array_merge($BASE, ['ads' => '', 'ads_conv_formulario' => $FORM]);
    add_filter('pre_option_cod_medicion', $filtro);
    ob_start();
    (new COD_Settings_Admin())->render_page();
    $pantalla = (string) ob_get_clean();
    remove_filter('pre_option_cod_medicion', $filtro);
    wp_set_current_user(0);
    $verifica('pantalla: el campo del formulario', strpos($pantalla, 'name="cod_medicion_ads_conv_formulario"') !== false && strpos($pantalla, 'value="' . $FORM . '"') !== false);
    $verifica('pantalla: el campo de WhatsApp', strpos($pantalla, 'name="cod_medicion_ads_conv_whatsapp"') !== false);
    $verifica('pantalla: el aviso de etiqueta sin ID', strpos($pantalla, 'notice-warning') !== false && strpos($pantalla, 'no medirá nada') !== false);
}

// 7. Escapado: una etiqueta hostil guardada a la fuerza no rompe el guion.
$hostil = "AW-751289133/x'</script><img src=x onerror=alert(1)>";
$html = $cabecera(['ads_conv_formulario' => $hostil]);
$verifica('etiqueta hostil: no cierra el script ni abre HTML', strpos($html, '</script><img') === false && strpos($html, '<img src=x') === false);

// 8. El guion ejecutado.
$nodo = trim((string) shell_exec('node --version 2>&1'));
$verifica('node disponible para ejecutar el guion', preg_match('/^v\d+/', $nodo) === 1, $nodo);

$arnes = <<<'JS'
const vm = require('vm');
const fs = require('fs');
const codigo = fs.readFileSync(process.argv[2], 'utf8');

function mundo({ gtag = true, jquery = true } = {}) {
  let reloj = 100000;
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.readyState = 'loading';
  const llamadas = [];
  const ganchos = {};
  win.dataLayer = [];
  if (gtag) win.gtag = function () { llamadas.push(Array.from(arguments)); };
  const instalarJq = () => {
    win.jQuery = function () { return { on(n, f) { (ganchos[n] = ganchos[n] || []).push(f); } }; };
  };
  if (jquery) instalarJq();
  const ctx = vm.createContext({ window: win, document: doc, Date: { now: () => reloj } });
  const m = {
    win, doc, ganchos, instalarJq,
    cargar() { vm.runInContext(codigo, ctx); },
    avanzar(ms) { reloj += ms; },
    orugantt() { win.dispatchEvent(new CustomEvent('orugantt-forms:enviado', { detail: { slug: 'contacto', formulario: 'Contacto' } })); },
    gravityNativo() { doc.dispatchEvent(new CustomEvent('gform_confirmation_loaded', { detail: { formId: 1 } })); },
    gravityJq() { (ganchos['gform_confirmation_loaded'] || []).forEach((f) => f({}, 1)); },
    whatsapp() { win.dispatchEvent(new CustomEvent('cod:whatsapp-enviado', { detail: { origen: 'hero' } })); },
    conversiones() {
      return llamadas.filter((a) => a[0] === 'event' && a[1] === 'conversion').map((a) => a[2]);
    },
    todas() { return llamadas; },
  };
  m.cargar();
  return m;
}

const r = {};
let w;
w = mundo(); w.orugantt();
r.orugantt_una = w.conversiones();
r.orugantt_args = w.todas();
w = mundo(); w.orugantt(); w.orugantt(); w.orugantt();
r.orugantt_repetido = w.conversiones().length;
w = mundo(); w.orugantt(); w.avanzar(5000); w.orugantt();
r.orugantt_dos_envios_reales = w.conversiones().length;
w = mundo(); w.gravityJq(); w.gravityNativo();
r.gravity_jq_y_nativo = w.conversiones().length;
w = mundo(); w.gravityNativo(); w.gravityJq(); w.gravityJq();
r.gravity_nativo_y_jq_repetido = w.conversiones().length;
w = mundo(); w.gravityJq(); w.avanzar(5000); w.gravityJq();
r.gravity_dos_envios_reales = w.conversiones().length;
w = mundo(); w.orugantt(); w.gravityJq();
r.motores_distintos = w.conversiones().length;
w = mundo(); w.whatsapp(); w.whatsapp();
r.whatsapp_repetido = w.conversiones().length;
w = mundo(); w.whatsapp(); w.orugantt();
r.whatsapp_y_formulario = w.conversiones();
w = mundo({ jquery: false });
let sinJq = 'ok';
try { w.orugantt(); w.gravityNativo(); } catch (e) { sinJq = 'explotó: ' + e.message; }
r.sin_jquery = { error: sinJq, n: w.conversiones().length };
w = mundo({ jquery: false });
w.instalarJq(); w.doc.dispatchEvent(new Event('DOMContentLoaded')); w.win.dispatchEvent(new Event('load'));
w.gravityJq();
r.jquery_tardio = { n: w.conversiones().length, ganchos: (w.ganchos['gform_confirmation_loaded'] || []).length };
w = mundo({ gtag: false });
let sinGtag = 'ok';
try { w.orugantt(); w.whatsapp(); w.gravityNativo(); } catch (e) { sinGtag = 'explotó: ' + e.message; }
r.sin_gtag = { error: sinGtag, n: w.todas().length };
w = mundo();
w.win.dataLayer.push({ event: 'formulario_enviado', slug: 'contacto', formulario: 'Contacto' });
w.win.gtag('event', 'formulario_enviado', { slug: 'contacto' });
r.datalayer_no_cuenta = w.conversiones().length;
w = mundo(); w.cargar(); w.cargar();
w.orugantt();
r.doble_impresion = { n: w.conversiones().length, ganchos: (w.ganchos['gform_confirmation_loaded'] || []).length };
process.stdout.write(JSON.stringify(r));
JS;

$dir = sys_get_temp_dir();
$ruta_arnes = $dir . DIRECTORY_SEPARATOR . 'cod-arnes-conversion.cjs';
file_put_contents($ruta_arnes, $arnes);

$ejecutar = function (string $guion) use ($ruta_arnes, $dir): ?array {
    $ruta = $dir . DIRECTORY_SEPARATOR . 'cod-conversion-' . md5($guion) . '.js';
    file_put_contents($ruta, $guion);
    $bruto = (string) shell_exec('node ' . escapeshellarg($ruta_arnes) . ' ' . escapeshellarg($ruta) . ' 2>&1');
    @unlink($ruta);
    $r = json_decode($bruto, true);

    return is_array($r) ? $r : ['__error' => $bruto];
};

$r = $ejecutar($js_ambos);
if (isset($r['__error'])) {
    $verifica('el arnés de Node corrió', false, substr((string) $r['__error'], 0, 300));
} else {
    $verifica('el arnés de Node corrió', true);
    $verifica('motor propio: UNA conversión con su send_to', $r['orugantt_una'] === [['send_to' => $FORM]], json_encode($r['orugantt_una']));
    $verifica('no viaja nada más que send_to (ni slug, ni nombre)', $r['orugantt_una'] === [['send_to' => $FORM]] && count($r['orugantt_args']) === 1 && array_keys($r['orugantt_una'][0]) === ['send_to']);
    $verifica('el mismo aviso tres veces seguidas: una sola', $r['orugantt_repetido'] === 1, (string) $r['orugantt_repetido']);
    $verifica('dos envíos reales separados: dos conversiones', $r['orugantt_dos_envios_reales'] === 2, (string) $r['orugantt_dos_envios_reales']);
    $verifica('Gravity por jQuery y por evento nativo: una sola', $r['gravity_jq_y_nativo'] === 1, (string) $r['gravity_jq_y_nativo']);
    $verifica('Gravity nativo y jQuery repetido: una sola', $r['gravity_nativo_y_jq_repetido'] === 1, (string) $r['gravity_nativo_y_jq_repetido']);
    $verifica('Gravity: dos envíos reales separados: dos', $r['gravity_dos_envios_reales'] === 2, (string) $r['gravity_dos_envios_reales']);
    $verifica('un motor y otro, formularios distintos: cuentan los dos', $r['motores_distintos'] === 2, (string) $r['motores_distintos']);
    $verifica('whatsapp repetido: una sola', $r['whatsapp_repetido'] === 1, (string) $r['whatsapp_repetido']);
    $verifica('whatsapp y formulario: cada uno con su etiqueta', $r['whatsapp_y_formulario'] === [['send_to' => $WA], ['send_to' => $FORM]], json_encode($r['whatsapp_y_formulario']));
    $verifica('sin jQuery: no explota y el resto cuenta', $r['sin_jquery']['error'] === 'ok' && $r['sin_jquery']['n'] === 2, json_encode($r['sin_jquery']));
    $verifica('jQuery que llega tarde: se engancha una vez', $r['jquery_tardio'] === ['n' => 1, 'ganchos' => 1], json_encode($r['jquery_tardio']));
    $verifica('sin gtag: no explota y no cuenta', $r['sin_gtag'] === ['error' => 'ok', 'n' => 0], json_encode($r['sin_gtag']));
    $verifica('el dataLayer y el gtag del motor propio no cuentan', $r['datalayer_no_cuenta'] === 0, (string) $r['datalayer_no_cuenta']);
    $verifica('guion impreso dos veces: una conversión, un gancho', $r['doble_impresion'] === ['n' => 1, 'ganchos' => 1], json_encode($r['doble_impresion']));
}
@unlink($ruta_arnes);

// Y la otra cara: sin consentimiento, esta misma conversión no engancha nada.
// Va acá y no sólo en `probar-consentimiento.php` porque es el punto donde
// alguien podría «arreglar» un fallo futuro quitando la puerta sin darse
// cuenta de lo que quita: que la prueba de la conversión misma falle lo
// vuelve imposible de hacer en silencio.
$_COOKIE['cookieadmin_consent'] = '{"reject":"true"}';
COD_Consentimiento::olvidar();
$html = $cabecera(['ads_conv_formulario' => $FORM]);
$verifica('tras rechazar: el guion de conversión no se ejecuta', $guiones($html) === []);
$verifica(
    'tras rechazar: queda dormido esperando publicidad',
    strpos($html, 'type="text/plain"') !== false
        && strpos($html, 'data-cookieadmin-category="marketing"') !== false
        && strpos($html, '__codConversiones') !== false
);
// Ojo con cómo se comprueba esto: `gtag('config', …)` SÍ aparece en el HTML
// —dentro de un guion dormido—, así que buscar el texto a secas daría un falso
// positivo. Lo que hay que comprobar es que no esté en un guion que se
// ejecuta, y un guion se ejecuta cuando NO lleva `type="text/plain"`.
$vivos = [];
if (preg_match_all('#<script([^>]*)>(.*?)</script>#s', $html, $m, PREG_SET_ORDER)) {
    foreach ($m as $uno) {
        if (stripos($uno[1], 'text/plain') === false) {
            $vivos[] = $uno[2];
        }
    }
}
$verifica(
    'tras rechazar: la cuenta de Ads no se configura en ningún guion vivo',
    strpos(implode(' ', $vivos), "gtag('config'") === false
);
unset($_COOKIE['cookieadmin_consent']);
COD_Consentimiento::olvidar();

printf("\n%d de %d.\n", $total - $fallas, $total);
exit($fallas === 0 ? 0 : 1);
