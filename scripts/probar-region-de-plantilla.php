<?php
/**
 * Una región se reconoce por su papel, no por su nombre.
 *
 * DE DÓNDE SALE. El 4 de octubre de 2026 el encabezado compartido del sitio de
 * Santa Luisa era lo único que no se podía recomponer por el constructor, y
 * terminé a punto de copiarlo a mano desde producción —el atajo que este
 * proyecto existe para no necesitar—.
 *
 * El motivo era una incoherencia entre las dos mitades de un mismo circuito.
 * Para escribir una composición hay que leer primero la revisión actual, y el
 * `apply` la compara: si no calza, rechaza. Pues bien:
 *
 *   - el APPLY preguntaba «¿es una región?» al repositorio, por regionKind;
 *   - la LECTURA de la revisión lo decidía con tres nombres escritos a mano
 *     (`cod-region-header|body|footer`).
 *
 * El encabezado de un sitio real es un documento de PLANTILLA
 * (`ocd-template-…`) con regionKind header y scope global. El apply lo
 * aceptaba; la lectura lo rechazaba. Resultado: imposible obtener la revisión
 * que el apply exige, y el encabezado inalcanzable por composición.
 *
 * Esta prueba fija las dos cosas: que una región de plantilla se pueda leer, y
 * que las dos mitades sigan preguntándole al MISMO sitio. Lo segundo es lo que
 * importa: mientras la respuesta venga del repositorio, no pueden discrepar
 * otra vez por mucho que cambien los nombres.
 *
 * Corre contra el WordPress local de Econut. Nunca contra wp-local ni contra
 * el sitio de un cliente.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$fallas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' ? "   $detalle" : '') . "\n";
    if (!$ok) { $fallas++; }
};

$repositorio = new COD_Canvas_Document_Repository();
$servicio = new COD_Canvas_MCP_Service(
    $repositorio,
    new COD_Canvas_Page_Publisher($repositorio),
    new COD_Template_Region_Resolver($repositorio),
    new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer()),
    new COD_Canvas_Asset_Resolver()
);

/*
 * Un documento con nombre de plantilla, como el que de verdad tiene un sitio.
 * Se crea acá y se borra al final: la prueba no deja rastro en el local.
 */
$id = 'ocd-template-prueba-' . bin2hex(random_bytes(6));
$creado = $repositorio->save($id, wp_json_encode(['pages' => [], 'styles' => []]), '<header></header>', '');
if (is_wp_error($creado)) {
    echo "  FALLA  no pude crear el documento de prueba   " . $creado->get_error_message() . "\n";
    exit(1);
}
$papel = $repositorio->save_region($id, COD_Canvas_Document_Repository::REGION_KIND_HEADER, COD_Canvas_Document_Repository::REGION_SCOPE_GLOBAL, []);
if (is_wp_error($papel)) {
    echo "  FALLA  no pude asignarle el papel de encabezado   " . $papel->get_error_message() . "\n";
    exit(1);
}

$limpiar = static function () use ($id) {
    $post = get_posts([
        'post_type' => COD_Canvas_Document_Repository::POST_TYPE,
        'post_status' => 'any',
        'numberposts' => 1,
        'fields' => 'ids',
        'meta_key' => COD_Canvas_Document_Repository::META_DOCUMENT_ID,
        'meta_value' => $id,
    ]);
    if ($post) { wp_delete_post((int) $post[0], true); }
};

echo "\n== una región de plantilla se puede leer ==\n";

$estado = $servicio->canvas_region_state($id);
$comprobar('la lectura la acepta, no la rechaza por el nombre',
    !is_wp_error($estado),
    is_wp_error($estado) ? $estado->get_error_message() : '');
$comprobar('y devuelve una revisión, que es lo que el apply exige',
    !is_wp_error($estado) && isset($estado['document']['revision']) && is_int($estado['document']['revision']),
    is_wp_error($estado) ? '' : 'revisión ' . (string) ($estado['document']['revision'] ?? '?'));

echo "\n== las dos mitades del circuito preguntan lo mismo ==\n";
/*
 * El corazón de la prueba. Se recorre TODO lo que el repositorio considera
 * región y se exige que la lectura acepte cada una. Si alguien vuelve a poner
 * una lista de nombres en un lado, esto falla sin que haya que acordarse de
 * agregar el caso.
 */
$regiones = $repositorio->list_region_documents();
$comprobar('hay al menos una región para comparar', $regiones !== [], count($regiones) . ' regiones');
foreach ($regiones as $region) {
    $suyo = (string) $region['documentId'];
    $leido = $servicio->canvas_region_state($suyo);
    $comprobar("la lectura acepta $suyo", !is_wp_error($leido),
        is_wp_error($leido) ? $leido->get_error_message() : 'kind ' . (string) $region['regionKind']);
}

echo "\n== y lo que NO es una región sigue rechazándose ==\n";
/*
 * Abrir la puerta no es quitarla. Pedir con pageId 0 el documento de una
 * página tiene que seguir fallando con un mensaje que lo explique, porque si
 * devolviera una revisión el apply la rechazaría después por otro motivo y
 * quien lo use buscaría en el lugar equivocado.
 */
$paginas = $servicio->list_canvas_pages();
$unaPagina = $paginas[0]['documentId'] ?? null;
if (is_string($unaPagina)) {
    $negado = $servicio->canvas_region_state($unaPagina);
    $comprobar('el documento de una página se rechaza', is_wp_error($negado),
        is_wp_error($negado) ? '' : 'lo aceptó, y no debería');
} else {
    $comprobar('el documento de una página se rechaza', false, 'no hay páginas en este local para probarlo');
}
$inventado = $servicio->canvas_region_state('ocd-template-no-existe-' . bin2hex(random_bytes(4)));
$comprobar('un documentId inventado se rechaza', is_wp_error($inventado));
$comprobar('y el error dice cuáles hay, para no dejar a ciegas',
    is_wp_error($inventado) && str_contains($inventado->get_error_message(), 'Las que hay:'),
    is_wp_error($inventado) ? $inventado->get_error_message() : '');

$limpiar();

echo "\n" . ($fallas === 0 ? "todo en orden\n" : "$fallas fallas\n");
exit($fallas === 0 ? 0 : 1);
