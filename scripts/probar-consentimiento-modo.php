<?php
/**
 * Una actualización no cambia lo que un sitio ya hacía.
 *
 * POR QUÉ. 7-oct-2026: Santa Luisa tenía Tag Manager andando. Al subir el plugin
 * de 0.3.29 a 0.3.78 el contenedor quedó dormido hasta que alguien aceptara
 * cookies y el noscript desapareció. La configuración guardada seguía intacta;
 * lo que cambió fue el comportamiento, sin aviso. Cristóbal: «las
 * actualizaciones deberían verificar si existe una configuración y guardarla».
 *
 * Lo que se mide:
 *  - sitio con medición ya configurada y sin decisión → «heredado»: no espera nada
 *  - sitio sin medición                               → «auto»: espera si hay gestor
 *  - la migración FIJA el modo (y no escribe en un sitio vacío)
 *  - lo decidido a mano manda sobre lo calculado
 *  - el formulario sólo admite los dos modos; lo demás conserva lo decidido
 *  - la pantalla avisa cuando se mide sin esperar teniendo un gestor
 *  - el filtro `cod_consentimiento_exigir` sigue mandando sobre todo
 *
 * Corre contra el WordPress local de Econut (8891); restaura la opción al final.
 * Antes: node scripts/sincronizar-plugin.mjs --a econut --aplicar
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$ok = function (bool $cond, string $msg) use (&$fallas) {
    echo ($cond ? 'ok     ' : 'FALLA  ') . $msg . "\n";
    if (!$cond) { $fallas++; }
};

$K = COD_Medicion::OPTION_KEY;
$original = get_option($K, null);

// Simula un sitio con gestor de cookies instalado (como Santa Luisa con CookieAdmin).
add_filter('cod_consentimiento_hay_gestor', '__return_true');

$con = function ($valor) use ($K) {
    if ($valor === null) { delete_option($K); } else { update_option($K, $valor, true); }
    COD_Consentimiento::olvidar();
};

try {
    // Un sitio que ya medía (el caso de Santa Luisa): sólo un GTM guardado.
    $con(['excluir_admin' => false, 'gtm' => 'GTM-W8D7ZGDP', 'ga4' => '', 'ads' => '', 'meta_pixel' => '', 'verificaciones' => '']);
    $ok(COD_Medicion::ajustes()['consentimiento'] === 'heredado', 'con medición configurada y sin decisión: modo heredado');
    $ok(COD_Consentimiento::exigir() === false, '… y NO se exige consentimiento, aunque haya gestor (se mide como antes)');
    $ok(COD_Consentimiento::concede('analytics') === true, '… y analytics se concede sin esperar');

    // La migración fija el modo para que no dependa de recalcular.
    $ok(!array_key_exists('consentimiento', (array) get_option($K)), 'antes de migrar, el modo no está escrito');
    COD_Medicion::migrar_consentimiento();
    $ok((get_option($K)['consentimiento'] ?? '') === 'heredado', 'migrar() lo escribe: heredado');
    $ok((get_option($K)['gtm'] ?? '') === 'GTM-W8D7ZGDP', '… y no toca el identificador guardado');

    // Un sitio nuevo, sin medición.
    $con([]);
    $ok(COD_Medicion::ajustes()['consentimiento'] === 'auto', 'sin medición configurada: modo auto');
    $ok(COD_Consentimiento::exigir() === true, '… y con gestor, SÍ se exige consentimiento');
    COD_Medicion::migrar_consentimiento();
    $ok(!array_key_exists('consentimiento', (array) get_option($K)), 'migrar() no escribe nada en un sitio sin medición');
    $con(null);
    COD_Medicion::migrar_consentimiento();
    $ok(get_option($K, null) === null, 'migrar() no crea la opción de la nada');

    // Lo decidido a mano manda.
    $con(['gtm' => 'GTM-ABC1234', 'consentimiento' => 'auto']);
    $ok(COD_Medicion::ajustes()['consentimiento'] === 'auto', 'lo elegido («auto») manda sobre lo que se calcularía');
    $ok(COD_Consentimiento::exigir() === true, '… y con gestor se exige');

    // El filtro sigue por encima de todo.
    $con(['gtm' => 'GTM-ABC1234', 'consentimiento' => 'heredado']);
    add_filter('cod_consentimiento_exigir', '__return_true');
    $ok(COD_Consentimiento::exigir() === true, 'el filtro cod_consentimiento_exigir fuerza la puerta aun en modo heredado');
    remove_filter('cod_consentimiento_exigir', '__return_true');

    // El formulario.
    $previos = ['gtm' => 'GTM-ABC1234', 'consentimiento' => 'heredado'];
    [$v] = COD_Medicion::procesar_envio(['cod_medicion_gtm' => 'GTM-ABC1234', 'cod_medicion_consentimiento' => 'auto'], $previos);
    $ok(($v['consentimiento'] ?? '') === 'auto', 'el formulario cambia el modo a auto');
    [$v] = COD_Medicion::procesar_envio(['cod_medicion_gtm' => 'GTM-ABC1234', 'cod_medicion_consentimiento' => 'cualquier-cosa'], $previos);
    $ok(($v['consentimiento'] ?? '') === 'heredado', 'un valor inválido conserva lo decidido');
    [$v] = COD_Medicion::procesar_envio(['cod_medicion_gtm' => 'GTM-ABC1234'], $previos);
    $ok(($v['consentimiento'] ?? '') === 'heredado', 'si el formulario no trae el campo, conserva lo decidido');

    // El aviso.
    $con(['gtm' => 'GTM-ABC1234', 'consentimiento' => 'heredado']);
    $avisos = implode(' ', COD_Medicion::avisos_de_conversion(COD_Medicion::ajustes()));
    $ok(strpos($avisos, 'SIN esperar el consentimiento') !== false, 'heredado + gestor: la pantalla avisa que se mide sin esperar');
    $con(['gtm' => 'GTM-ABC1234', 'consentimiento' => 'auto']);
    $avisos = implode(' ', COD_Medicion::avisos_de_conversion(COD_Medicion::ajustes()));
    $ok(strpos($avisos, 'SIN esperar el consentimiento') === false, 'en auto, ese aviso no sale');

    // Lo que sale en la página, que es lo que de verdad importa.
    $imprimir = function () {
        $m = new COD_Medicion();
        ob_start();
        $m->imprimir_en_head();
        $m->imprimir_tras_body();
        return (string) ob_get_clean();
    };
    $con(['gtm' => 'GTM-W8D7ZGDP', 'consentimiento' => 'heredado']);
    $html = $imprimir();
    $ok(strpos($html, 'GTM-W8D7ZGDP') !== false, 'heredado: el contenedor sale en la página');
    $ok(strpos($html, 'type="text/plain"') === false, 'heredado: el script NO sale dormido (se ejecuta como antes)');
    $ok(strpos($html, 'ns.html?id=GTM-W8D7ZGDP') !== false, 'heredado: vuelve el noscript de Tag Manager');
    $ok(strpos($html, "gtag('consent','default'") === false, 'heredado: no se declara consentimiento denegado por omisión');
    $con(['gtm' => 'GTM-W8D7ZGDP', 'consentimiento' => 'auto']);
    $html = $imprimir();
    $ok(strpos($html, 'type="text/plain"') !== false, 'auto + gestor: el script sale dormido hasta el permiso');
    $ok(strpos($html, 'ns.html?id=') === false, 'auto + gestor: sin permiso no hay noscript');
} finally {
    if ($original === null) { delete_option($K); } else { update_option($K, $original, true); }
}

echo $fallas === 0 ? "\nTODO OK\n" : "\n$fallas falla(s)\n";
exit($fallas === 0 ? 0 : 1);
