<?php
/**
 * Escribe la hoja base del lienzo como ARCHIVO, desde su única fuente.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO, Y POR QUÉ NO ESTABA ANTES. Hasta hoy la hoja
 * base se guardaba DENTRO de cada documento: `compile()` empezaba con
 * `$styles = self::base_styles()` y esa copia quedaba escrita en la página. El
 * resultado es que cada documento conservaba una foto de la hoja del día en
 * que se compiló, y una página con encabezado, cuerpo y pie servía TRES copias
 * distintas; la última ganaba y pisaba el diseño.
 *
 * Esto se venía parchando al servir, descartando las copias repetidas.
 * Cristóbal, el 4 de octubre de 2026: «el proceso de deduplicación es como que
 * hubieras pinchado un neumático y después lo tuvieras que parchar. Lo que
 * necesitamos es que el neumático no se pinche. No tiene por qué generarse una
 * hoja de estilo por cada página de un sitio; la hoja tiene que ser
 * centralizada».
 *
 * LA HOJA BASE NO ES DISEÑO, ES DEL MOTOR. No describe este sitio ni esta
 * página: describe cómo se comporta una sección, una columna o una imagen en
 * cualquier sitio hecho con el publicador. Por eso le corresponde vivir con el
 * plugin —versionada con él— y no dentro del contenido.
 *
 * Y de paso deja de ser texto incrustado en cada HTML: como archivo, el
 * navegador lo guarda una vez y lo reusa en todas las páginas del sitio.
 *
 * LA FUENTE SIGUE SIENDO UNA SOLA: `COD_Canvas_MCP_Recipe_Compiler::base_styles()`.
 * Este guion no escribe reglas, sólo las vuelca. `probar-css-base.php`
 * comprueba que el archivo y la función digan lo mismo, así que un olvido se
 * nota en la batería y no en el sitio.
 *
 * Uso:
 *   php scripts/generar-css-base.php            escribe el archivo
 *   php scripts/generar-css-base.php --mirar    sólo dice si está al día
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

const DESTINO = __DIR__ . '/../contope-publisher/assets/css/cod-canvas-base.css';

$solo_mirar = in_array('--mirar', $argv, true);

$cabecera = "/* Generado por scripts/generar-css-base.php desde\n"
    . " * COD_Canvas_MCP_Recipe_Compiler::base_styles(). No editar a mano:\n"
    . " * la fuente es esa función y `probar-css-base.php` comprueba que\n"
    . " * coincidan. */\n";
$contenido = $cabecera . COD_Canvas_MCP_Recipe_Compiler::base_styles();

$actual = is_readable(DESTINO) ? (string) file_get_contents(DESTINO) : null;

if ($actual === $contenido) {
    echo "al día (" . number_format(strlen($contenido) / 1024, 1, ',', '.') . " KB)\n";
    exit(0);
}
if ($solo_mirar) {
    echo $actual === null ? "falta el archivo\n" : "desactualizado\n";
    exit(1);
}

if (!is_dir(dirname(DESTINO)) && !wp_mkdir_p(dirname(DESTINO))) {
    fwrite(STDERR, "No se pudo crear la carpeta.\n");
    exit(1);
}
if (file_put_contents(DESTINO, $contenido) === false) {
    fwrite(STDERR, "No se pudo escribir " . DESTINO . "\n");
    exit(1);
}

echo "escrito · " . number_format(strlen($contenido) / 1024, 1, ',', '.') . " KB\n";
