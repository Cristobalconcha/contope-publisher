<?php
/**
 * Escribe en stdout una entrada de un ZIP (para las pruebas, que no tienen lector de ZIP en Node).
 *   php extraer-del-zip.php <archivo.zip> <entrada>
 */
$zip = new ZipArchive();
if ($zip->open($argv[1] ?? '') !== true) {
    fwrite(STDERR, "No se pudo abrir el ZIP\n");
    exit(2);
}
$contenido = $zip->getFromName($argv[2] ?? '');
$zip->close();
if ($contenido === false) {
    fwrite(STDERR, "No hay esa entrada\n");
    exit(3);
}
fwrite(STDOUT, $contenido);
