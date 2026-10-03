<?php
/**
 * El esquema de configuración de un supermódulo: sus propiedades.
 *
 * Pasos 3 y 4 de `arquitectura-page-builder-compositivo.md` §2 — «recoge el
 * esquema de configuración aportado por cada elemento» y «decide qué
 * propiedades expone al usuario de la instancia».
 *
 * Lo que se comprueba, que es donde está el contrato:
 *  - el esquema se RECOGE del marcado, no se escribe a mano;
 *  - una propiedad declarada que no está marcada se descarta (sería un campo
 *    que no escribe en ninguna parte);
 *  - una marca sin declarar entra igual, con su clave como rótulo;
 *  - el tipo se deduce de la etiqueta cuando no se declara;
 *  - el orden es el del marcado, para que el panel siga a la página;
 *  - los módulos guardados ANTES de que esto existiera siguen leyéndose.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};
$claves = static fn (array $props): array => array_column($props, 'key');
$porClave = static function (array $props, string $k): ?array {
    foreach ($props as $p) { if ($p['key'] === $k) { return $p; } }
    return null;
};

// Un supermódulo realista: una tarjeta con foto, titular, texto y botón.
$TARJETA = '<div class="cod-group">'
    . '<img src="/wp-content/uploads/foto.png" alt="" data-cod-prop="foto">'
    . '<h3 data-cod-prop="titular">Control de huertos</h3>'
    . '<p data-cod-prop="bajada">Nuestros puntos de control.</p>'
    . '<a href="/ficha" data-cod-prop="boton">Más detalles</a>'
    . '</div>';

echo "\n== el esquema se recoge del marcado ==\n";
$claves_marcadas = COD_Custom_Module_Library::claves_en_el_marcado($TARJETA);
$comprobar('encuentra las cuatro marcas', $claves_marcadas === ['foto', 'titular', 'bajada', 'boton'], implode(', ', $claves_marcadas));

$sin_declarar = COD_Custom_Module_Library::normalizar_props([], $TARJETA);
$comprobar('sin declarar nada, salen las cuatro', $claves($sin_declarar) === ['foto', 'titular', 'bajada', 'boton']);
$comprobar('  y el rótulo cae en la propia clave', ($porClave($sin_declarar, 'titular')['label'] ?? '') === 'titular');

echo "\n== el tipo se deduce de la etiqueta ==\n";
$comprobar('una <img> es imagen', ($porClave($sin_declarar, 'foto')['type'] ?? '') === 'imagen');
$comprobar('una <a> es enlace', ($porClave($sin_declarar, 'boton')['type'] ?? '') === 'enlace');
$comprobar('un <h3> es texto', ($porClave($sin_declarar, 'titular')['type'] ?? '') === 'texto');
$comprobar('un <p> es texto', ($porClave($sin_declarar, 'bajada')['type'] ?? '') === 'texto');

echo "\n== lo declarado manda sobre lo deducido ==\n";
$declarado = COD_Custom_Module_Library::normalizar_props([
    ['key' => 'titular', 'label' => 'Título de la tarjeta', 'type' => 'texto'],
    ['key' => 'foto', 'label' => 'Fotografía', 'type' => 'imagen'],
], $TARJETA);
$comprobar('toma el rótulo declarado', ($porClave($declarado, 'titular')['label'] ?? '') === 'Título de la tarjeta');
$comprobar('las no declaradas siguen saliendo', count($declarado) === 4, (string) count($declarado));

echo "\n== una propiedad que no está en el marcado NO entra ==\n";
$fantasma = COD_Custom_Module_Library::normalizar_props([
    ['key' => 'inventada', 'label' => 'No existe', 'type' => 'texto'],
], $TARJETA);
$comprobar('se descarta la que no tiene dónde escribir', !in_array('inventada', $claves($fantasma), true));
$comprobar('  y no se pierde ninguna de las reales', count($fantasma) === 4);

echo "\n== el orden es el del marcado ==\n";
$alReves = COD_Custom_Module_Library::normalizar_props([
    ['key' => 'boton', 'label' => 'Botón'],
    ['key' => 'foto', 'label' => 'Foto'],
    ['key' => 'titular', 'label' => 'Titular'],
], $TARJETA);
$comprobar('sigue a la página, no a la lista declarada', $claves($alReves) === ['foto', 'titular', 'bajada', 'boton'], implode(', ', $claves($alReves)));

echo "\n== claves que no se aceptan ==\n";
foreach ([
    'con espacio' => 'mi clave',
    'con mayúsculas en la declaración' => 'Titular',
    'vacía' => '',
    'con punto' => 'a.b',
] as $nombre => $mala) {
    $r = COD_Custom_Module_Library::normalizar_props([['key' => $mala, 'label' => 'x']], $TARJETA);
    // Ninguna de ellas debe ADEMÁS romper las que sí están marcadas.
    $comprobar('clave ' . $nombre . ': no rompe el resto', count($r) === 4);
}
// «Titular» declarada en mayúsculas sí debe calzar con la marca «titular».
$mayus = COD_Custom_Module_Library::normalizar_props([['key' => 'Titular', 'label' => 'Con mayúscula']], $TARJETA);
$comprobar('una clave declarada en mayúsculas calza igual', ($porClave($mayus, 'titular')['label'] ?? '') === 'Con mayúscula');

echo "\n== un módulo sin marcas no tiene propiedades ==\n";
$plano = COD_Custom_Module_Library::normalizar_props([], '<div class="cod-group"><p>Sin marcas</p></div>');
$comprobar('lista vacía, no un error', $plano === []);

echo "\n== guardar y volver a leer ==\n";
$previo = get_option(COD_Custom_Module_Library::OPTION_KEY, null);
register_shutdown_function(static function () use ($previo) {
    if ($previo === null) { delete_option(COD_Custom_Module_Library::OPTION_KEY); }
    else { update_option(COD_Custom_Module_Library::OPTION_KEY, $previo, false); }
});
delete_option(COD_Custom_Module_Library::OPTION_KEY);

$lib = new COD_Custom_Module_Library();
$guardado = $lib->save('Tarjeta de servicio', 'Tarjetas', $TARJETA, '.cod-group{gap:8px}', [
    ['key' => 'titular', 'label' => 'Título de la tarjeta', 'type' => 'texto'],
]);
$comprobar('el id es un slug estable, no un entero', preg_match('/^cod-custom-[0-9a-f-]{36}$/', $guardado['id']) === 1, $guardado['id']);
$comprobar('guarda el esquema', count($guardado['props']) === 4);
$comprobar('  con el rótulo declarado', ($porClave($guardado['props'], 'titular')['label'] ?? '') === 'Título de la tarjeta');

$leido = $lib->list_all();
$comprobar('se vuelve a leer', count($leido) === 1);
$comprobar('  con su esquema intacto', ($porClave($leido[0]['props'], 'titular')['label'] ?? '') === 'Título de la tarjeta');
$comprobar('  y con los tipos deducidos', ($porClave($leido[0]['props'], 'foto')['type'] ?? '') === 'imagen');

echo "\n== un módulo guardado ANTES de que esto existiera ==\n";
// Sin la clave `props`, tal como quedaron los que ya estaban en la base.
update_option(COD_Custom_Module_Library::OPTION_KEY, wp_json_encode([[
    'id' => 'cod-custom-viejo', 'label' => 'Antiguo', 'category' => 'Módulos guardados',
    'html' => $TARJETA, 'css' => '', 'createdAt' => '2026-09-01T00:00:00+00:00',
]]), false);
$viejo = $lib->list_all();
$comprobar('se lee sin romperse', count($viejo) === 1);
$comprobar('  y recoge sus propiedades del marcado', $claves($viejo[0]['props']) === ['foto', 'titular', 'bajada', 'boton']);

// Y uno sin marcas, que es el caso más común de lo ya guardado.
update_option(COD_Custom_Module_Library::OPTION_KEY, wp_json_encode([[
    'id' => 'cod-custom-plano', 'label' => 'Plano', 'category' => 'x',
    'html' => '<div><p>hola</p></div>', 'css' => '', 'createdAt' => '',
]]), false);
$comprobar('uno sin marcas se lee con props vacías', $lib->list_all()[0]['props'] === []);

echo "\n== el saneador conserva la marca ==\n";
$san = new COD_Canvas_Document_Sanitizer();
$limpio = $san->sanitize_html($TARJETA);
$comprobar('sobrevive al saneado', is_string($limpio) && count(COD_Custom_Module_Library::claves_en_el_marcado($limpio)) === 4);

echo "\n";
if ($fallas === 0) { echo "probar-supermodulo-props.php   TODO OK\n"; exit(0); }
echo "probar-supermodulo-props.php   $fallas falla(s)\n";
exit(1);
