<?php
/**
 * El catálogo de iconos y su canal: buscar, filtrar y traer uno al set.
 *
 * Lo que se comprueba, en orden de importancia:
 *  - la búsqueda encuentra por ETIQUETA y no sólo por nombre, que es lo que
 *    permite escribir «borrar» y llegar a `delete` sin saberse el inglés;
 *  - el orden lo manda el uso real en la web, con el acierto en el nombre por
 *    delante del acierto en una etiqueta;
 *  - traer un icono lo deja en sus TRES estilos, porque el estilo es un ajuste
 *    del sitio y cambiarlo no puede obligar a volver a descargar;
 *  - el canal exige poder editar: `cachear` escribe en el disco y le pide algo
 *    a un tercero;
 *  - sin catálogo el selector no se queda mudo: enseña lo que ya está bajado.
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

echo "\n== el catálogo ==\n";
$todo = COD_Iconos_Catalogo::todo();
$comprobar('se lee (y queda en el transitorio)', count($todo) > 3000, 'iconos: ' . count($todo));
if (count($todo) === 0) {
    echo "\nSin catálogo no se puede seguir: ¿hay red?\n";
    exit(1);
}
$comprobar('cada entrada trae categorías, etiquetas y usos',
    isset($todo['search']['c'], $todo['search']['e'], $todo['search']['u']));
$comprobar('«search» es el más usado de la web', $todo['search']['u'] > 500000, 'usos: ' . $todo['search']['u']);
$comprobar('la segunda lectura sale del transitorio, sin volver a pedirla',
    get_transient(COD_Iconos_Catalogo::TRANSITORIO) !== false);

echo "\n== las categorías ==\n";
$cat = COD_Iconos_Catalogo::categorias();
$comprobar('hay categorías con su cuenta', count($cat) > 20, 'categorías: ' . count($cat));
$comprobar('ordenadas de más a menos', array_values($cat)[0] >= array_values($cat)[1]);

echo "\n== la búsqueda ==\n";
$r = COD_Iconos_Catalogo::buscar('home', '', 10);
$comprobar('encuentra por nombre', $r !== [] && $r[0]['nombre'] === 'home', $r[0]['nombre'] ?? '(nada)');
$comprobar('  lo exacto antes que lo que lo contiene',
    array_search('home', array_column($r, 'nombre'), true) === 0);

// La comprobación que justifica usar las etiquetas: «borrar» no aparece en
// ningún nombre de icono, pero sí entre las etiquetas de `delete`.
$r = COD_Iconos_Catalogo::buscar('trash', '', 20);
$nombres = array_column($r, 'nombre');
$comprobar('encuentra por ETIQUETA, no sólo por nombre',
    in_array('delete', $nombres, true) && strpos('delete', 'trash') === false, implode(', ', array_slice($nombres, 0, 5)));

/**
 * Buscar en castellano. Las etiquetas de Material están en inglés, así que sin
 * esto el buscador es inútil para quien diseña en castellano: medido el 4 de
 * octubre de 2026, «truck» encontraba cuatro camiones y «camión» ninguno.
 */
foreach ([
    'camion' => 'local_shipping',
    'camión' => 'local_shipping',
    'basura' => 'delete',
    'casa' => 'home',
    'correo' => 'mail',
] as $castellano => $esperado) {
    $r = COD_Iconos_Catalogo::buscar($castellano, '', 12);
    $comprobar('«' . $castellano . '» encuentra ' . $esperado,
        in_array($esperado, array_column($r, 'nombre'), true),
        implode(', ', array_slice(array_column($r, 'nombre'), 0, 4)));
}

$r = COD_Iconos_Catalogo::buscar('', 'maps', 8);
$comprobar('filtra por categoría', $r !== [] && in_array('maps', $r[0]['categorias'], true), implode(', ', array_column($r, 'nombre')));
$comprobar('  y dentro de la categoría ordena por uso', $r[0]['usos'] >= $r[1]['usos']);

$r = COD_Iconos_Catalogo::buscar('', '', 5);
$comprobar('sin texto ni filtro, manda el uso real', $r[0]['nombre'] === 'search', $r[0]['nombre']);

$r = COD_Iconos_Catalogo::buscar('local_shipping', '', 5);
$comprobar('dice cuáles ya están en el set', ($r[0]['enElSet'] ?? false) === true);
$r = COD_Iconos_Catalogo::buscar('fingerprint', '', 5);
$comprobar('  y cuáles no', ($r[0]['enElSet'] ?? true) === false, $r[0]['nombre'] ?? '');

echo "\n== traer un icono al set ==\n";
$carpeta = COD_Icono::carpeta();
$nuevo = 'rocket_launch';
foreach (COD_Icono::ESTILOS as $estilo) {
    @unlink(trailingslashit($carpeta) . 'icono-' . $nuevo . '-' . $estilo . '.svg');
}
$comprobar('antes no está', COD_Icono::ruta_de_nombre($nuevo) === '');
$res = COD_Iconos_Catalogo::cachear($nuevo);
$comprobar('se trae', ($res['ok'] ?? false) === true, $res['error'] ?? '');
$comprobar('  en los TRES estilos', count($res['estilos'] ?? []) === 3, implode(', ', $res['estilos'] ?? []));
$comprobar('  y ya se puede usar por nombre', strpos(COD_Icono::ruta_de_nombre($nuevo), $nuevo) !== false);
$svg = COD_Icono::svg_de(COD_Icono::ruta_de_nombre($nuevo));
$comprobar('  el dibujo llega y hereda el color', strpos($svg, '<path') !== false && strpos($svg, 'currentColor') !== false);
$comprobar('  sin ancho ni alto propios, que los pone quien lo usa',
    preg_match('/<svg[^>]*\swidth="(?!100%)/i', $svg) !== 1);

$res = COD_Iconos_Catalogo::cachear($nuevo);
$comprobar('pedirlo otra vez no vuelve a descargarlo', ($res['ok'] ?? false) === true);

foreach (['../../etc/passwd', 'Mayúsculas', '', 'no_existe_este_icono_jamas'] as $malo) {
    $res = COD_Iconos_Catalogo::cachear($malo);
    $comprobar('rechaza «' . $malo . '»', ($res['ok'] ?? true) === false);
}
foreach (COD_Icono::ESTILOS as $estilo) {
    @unlink(trailingslashit($carpeta) . 'icono-' . $nuevo . '-' . $estilo . '.svg');
}

echo "\n== el canal ==\n";
$rest = new COD_Iconos_Rest();
$comprobar('pide poder editar, no administrar', COD_Iconos_Rest::CAPACIDAD === 'edit_posts');
wp_set_current_user(0);
$comprobar('un visitante anónimo no entra', $rest->puede() === false);
$editor = get_users(['role__in' => ['administrator'], 'number' => 1]);
if ($editor !== []) {
    wp_set_current_user($editor[0]->ID);
    $comprobar('quien edita, sí', $rest->puede() === true);

    $peticion = new WP_REST_Request('GET', '/contope/v1/iconos');
    $peticion->set_param('q', 'camera');
    $respuesta = $rest->buscar($peticion);
    $datos = $respuesta->get_data();
    $comprobar('la búsqueda responde con iconos, categorías y el estilo del sitio',
        isset($datos['iconos'][0]['nombre'], $datos['categorias'], $datos['estilo']));
    $comprobar('  y el estilo es uno de los tres', in_array($datos['estilo'], COD_Icono::ESTILOS, true), (string) $datos['estilo']);
}

/**
 * La tipografía de la vista previa. Lo que importa comprobar es DÓNDE vive:
 * el editor no puede referenciar un CDN —hay una prueba estática que lo hace
 * cumplir— y es la misma decisión que tomamos al localizar las tipografías
 * del tema.
 */
echo "\n== la tipografía de vista previa ==\n";
$tipo = COD_Iconos_Catalogo::traer_tipografia();
$comprobar('está en el sitio', !empty($tipo['ok']), $tipo['error'] ?? '');
$comprobar('  y pesa lo que dijimos, no 3,7 MB',
    ($tipo['bytes'] ?? 0) > 200000 && ($tipo['bytes'] ?? 0) < 600000,
    number_format((int) ($tipo['bytes'] ?? 0) / 1024, 0, ',', '.') . ' KB');
$comprobar('  servida desde el propio sitio, no desde Google',
    strpos(COD_Iconos_Catalogo::ruta_tipografia(), home_url()) === 0, COD_Iconos_Catalogo::ruta_tipografia());
$comprobar('  junto al set, no en la carpeta del mes',
    strpos(COD_Iconos_Catalogo::ruta_tipografia(), COD_Icono::CARPETA) !== false);
$comprobar('pedirla otra vez no la vuelve a bajar', !empty(COD_Iconos_Catalogo::traer_tipografia()['ok']));

echo "\n== el set base ==\n";
$comprobar('vive en su propia carpeta, sin año ni mes', strpos($carpeta, COD_Icono::CARPETA) !== false);
$cuantos = count((array) glob(trailingslashit($carpeta) . 'icono-*.svg'));
$comprobar('está instalado', $cuantos >= 200, "archivos: $cuantos");
$comprobar('incluye las redes, que Material no tiene', COD_Icono::ruta_de_nombre('red-whatsapp') !== '');

echo "\n";
if ($fallas === 0) { echo "probar-selector-iconos.php   TODO OK\n"; exit(0); }
echo "probar-selector-iconos.php   $fallas falla(s)\n";
exit(1);
