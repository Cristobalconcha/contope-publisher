<?php
/**
 * Que una imagen incrustada (`src="data:image/…"`) sobreviva al guardado SIN
 * depender de otro plugin, y que el permiso no abra nada más.
 *
 * Nació el 13-nov-2026: el visor de fotos de la portada de Santa Luisa perdió
 * su imagen de espera en producción porque el esquema `data:` sólo pasaba
 * gracias a CookieAdmin, y CookieAdmin estaba desactivado.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local (Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};

// OJO con lo que esta prueba demuestra. WordPress fija la lista de esquemas
// permitidos al terminar de cargar y ya no la suelta: si en este local
// CookieAdmin está activo, `data:` pasa de todas formas y los tres casos de
// «tiene que pasar» no prueban al plugin solo. Los de «NO tiene que pasar» sí
// valen siempre. La prueba completa del caso bueno fue en producción el
// 13-nov-2026, con CookieAdmin desactivado.
if (in_array('data', wp_allowed_protocols(), true)) {
    echo "  aviso  en este local otro plugin ya permite data: — el caso bueno no mide al plugin solo\n";
}

$limpiador = new COD_Canvas_Document_Sanitizer();
$svg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
$png = 'data:image/png;base64,iVBORw0KGgo=';

echo "\n== lo que tiene que pasar ==\n";
$r = $limpiador->sanitize_html('<div><img id="espera" src="' . $svg . '" alt=""></div>');
$comprobar('un <img> con SVG incrustado conserva su dirección', is_string($r) && strpos($r, 'src="' . $svg . '"') !== false, is_string($r) ? '' : 'error');
$r = $limpiador->sanitize_html('<video poster="' . $png . '" src="/v.mp4"></video>');
$comprobar('el poster de un video con PNG incrustado se conserva', is_string($r) && strpos($r, 'poster="' . $png . '"') !== false);
$r = $limpiador->sanitize_html('<img src="/wp-content/uploads/a.jpg" alt="a">');
$comprobar('una imagen normal sigue igual', is_string($r) && strpos($r, 'src="/wp-content/uploads/a.jpg"') !== false);

echo "\n== lo que NO tiene que pasar ==\n";
$r = $limpiador->sanitize_html('<a href="' . $svg . '">x</a>');
$comprobar('un enlace a data: pierde el esquema', is_string($r) && strpos($r, 'href="data:') === false);
$r = $limpiador->sanitize_html('<img src="data:text/html;base64,PHNjcmlwdD4=" alt="">');
$comprobar('un src con data:text/html pierde el esquema', is_string($r) && strpos($r, 'data:text/html') === false);
$r = $limpiador->sanitize_html('<img src="javascript:alert(1)" alt="">');
$comprobar('javascript: sigue sin pasar', is_string($r) && stripos($r, 'javascript:') === false);

echo "\n" . basename(__FILE__) . '   ' . ($fallas === 0 ? 'TODO OK' : "$fallas falla(s)") . "\n";
exit($fallas === 0 ? 0 : 1);
