<?php
/**
 * Verifica el arreglo de 0.3.38: una regla de disposición que trae `columns` y
 * `minColumnWidth` a la vez respeta las dos.
 *
 * El defecto: `minColumnWidth` descartaba `columns` en silencio, así que pedir
 * cuatro columnas con un ancho mínimo salía en 2x2 y nada lo decía. Se destapó
 * con los cuatro logos de certificación de la landing de Econut.
 *
 * Los cuatro casos que importan:
 *  - sólo `columns`           → repeat(N, ...), como siempre
 *  - sólo `minColumnWidth`    → auto-fit sin techo, como siempre (esto es lo que
 *                               no debe cambiar: `columns` tiene valor por
 *                               omisión, y aplicarle techo acá le pondría un
 *                               máximo de dos columnas a lo que ya funciona)
 *  - las dos juntas           → auto-fit con el mínimo elevado al ancho que le
 *                               toca a una de N columnas: nunca más de N, y
 *                               baja sola cuando no alcanza el ancho mínimo
 *  - las dos, con columns: 1  → una sola pista
 *
 * Corre contra el WordPress local de Econut (puerto 8891), que ya tiene el
 * plugin cargado: sincronizar antes con
 *   node scripts/sincronizar-plugin.mjs --a econut --aplicar
 * Nunca contra wp-local (ése es Santa Luisa).
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$compilador = new COD_Canvas_MCP_Recipe_Compiler(new COD_Canvas_Document_Sanitizer());

$regla = function (array $valor): array {
    return [
        'id' => 'rejilla',
        'kind' => 'layout',
        'scope' => ['breakpoint' => 'all', 'state' => 'default'],
        'provenance' => ['sources' => [['kind' => 'user', 'rationale' => 'Prueba 0.3.38.']]],
        'status' => 'reviewed',
        'value' => $valor,
    ];
};
$diseno = function (array $valor) use ($regla): array {
    return [
        'schemaVersion' => 1,
        'designId' => 'prueba-038',
        'expectedDesignRevision' => 0,
        'reviewState' => 'session',
        'rules' => [$regla($valor)],
    ];
};
$composicion = [
    'schemaVersion' => 2,
    'nodes' => [[
        'id' => 'seccion-prueba',
        'kind' => 'section',
        'ruleIds' => ['rejilla'],
        'children' => [
            ['id' => 'uno', 'kind' => 'paragraph', 'content' => ['text' => 'Uno']],
            ['id' => 'dos', 'kind' => 'paragraph', 'content' => ['text' => 'Dos']],
            ['id' => 'tres', 'kind' => 'paragraph', 'content' => ['text' => 'Tres']],
            ['id' => 'cuatro', 'kind' => 'paragraph', 'content' => ['text' => 'Cuatro']],
        ],
    ]],
];

/** Compila y devuelve el valor de grid-template-columns que salió, o el error. */
$pistas = function (array $valor) use ($compilador, $diseno, $composicion) {
    $salida = $compilador->compile($composicion, $diseno($valor));
    if (is_wp_error($salida)) {
        return 'ERROR: ' . $salida->get_error_message();
    }
    // El CSS compilado vive en storage.styles. Hay que leer la regla por su
    // selector: las reglas base del canvas también declaran
    // grid-template-columns, y buscar la propiedad sola trae la primera que
    // aparezca en vez de la que emitió esta regla.
    $css = $salida['storage']['styles'] ?? '';
    if (!preg_match('/\.cod-rule--rejilla\{([^}]*)\}/', $css, $m)) {
        return 'SIN la regla .cod-rule--rejilla en el CSS';
    }
    if (!preg_match('/grid-template-columns:\s*([^;]+);/', $m[1], $p)) {
        return 'la regla no declara grid-template-columns: ' . $m[1];
    }
    return trim($p[1]);
};

$casos = [
    ['sólo columns', ['mode' => 'grid', 'columns' => 4, 'gap' => '24px'], 'repeat(4,minmax(0,1fr))'],
    ['sólo minColumnWidth', ['mode' => 'grid', 'minColumnWidth' => '220px', 'gap' => '24px'], 'repeat(auto-fit,minmax(220px,1fr))'],
    ['las dos juntas', ['mode' => 'grid', 'columns' => 4, 'minColumnWidth' => '220px', 'gap' => '24px'], 'repeat(auto-fit,minmax(max(220px,calc((100% - 3 * 24px) / 4)),1fr))'],
    ['las dos, columns 1', ['mode' => 'grid', 'columns' => 1, 'minColumnWidth' => '220px', 'gap' => '24px'], 'minmax(0,1fr)'],
];

$fallas = 0;
foreach ($casos as [$nombre, $valor, $esperado]) {
    $salio = $pistas($valor);
    $bien = $salio === $esperado;
    if (!$bien) {
        $fallas++;
    }
    printf("%s  %-22s  %s\n", $bien ? 'OK  ' : 'FALLA', $nombre, $salio);
    if (!$bien) {
        printf("       esperaba: %s\n", $esperado);
    }
}

printf("\n%d de %d.\n", count($casos) - $fallas, count($casos));
exit($fallas === 0 ? 0 : 1);
