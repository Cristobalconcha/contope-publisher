<?php
/**
 * Pasa a descarga progresiva los JPEG que ya están en Medios.
 *
 * El plugin guarda así las subidas nuevas (COD_Imagen_Progresiva), pero lo que
 * ya estaba subido sigue línea a línea. Esto lo convierte una vez.
 *
 * QUÉ GANA. Un JPEG línea a línea se dibuja de arriba abajo y hasta el último
 * byte la mitad de abajo es un hueco; uno progresivo aparece entero y borroso
 * enseguida y se va afinando. Y pesa menos: medido en Econut el 4 de octubre
 * de 2026, entre un 3% y un 16%.
 *
 * QUÉ CUESTA, y por eso no se hace solo. Convertir es volver a comprimir, o
 * sea una generación más de pérdida. Se hace UNA vez y con una calidad alta
 * (la de WordPress para este sitio), y si el archivo resultante pesa MÁS que
 * el original se descarta: en ese caso la conversión no estaba ganando nada y
 * sólo habría degradado la foto.
 *
 * Uso:
 *   php scripts/pasar-jpeg-a-progresivo.php            dice qué haría
 *   php scripts/pasar-jpeg-a-progresivo.php --hacerlo  convierte
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local-econut/wordpress/wp-load.php';

$hacerlo = in_array('--hacerlo', $argv, true);

if (!extension_loaded('gd')) {
    fwrite(STDERR, "Hace falta GD.\n");
    exit(1);
}

/** ¿Este JPEG ya es progresivo? Se lee su marcador de inicio de cuadro. */
$es_progresivo = static function (string $archivo): ?bool {
    $b = (string) file_get_contents($archivo, false, null, 0, 300000);
    $n = strlen($b);
    for ($i = 2; $i < $n - 1;) {
        if (ord($b[$i]) !== 0xFF) { ++$i; continue; }
        $m = ord($b[$i + 1]);
        if ($m === 0xC0 || $m === 0xC1) { return false; }   // línea a línea
        if ($m === 0xC2) { return true; }                   // progresivo
        if ($m === 0xD8 || $m === 0xD9 || ($m >= 0xD0 && $m <= 0xD7)) { $i += 2; continue; }
        if ($i + 3 >= $n) { break; }
        $i += 2 + ((ord($b[$i + 2]) << 8) | ord($b[$i + 3]));
    }
    return null;
};

$subida = wp_upload_dir();
$raiz = $subida['basedir'];
$calidad = (int) apply_filters('jpeg_quality', 82, 'image/jpeg');

$iterador = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($raiz, FilesystemIterator::SKIP_DOTS));
$total = 0;
$yaEstaban = 0;
$convertidos = 0;
$descartados = 0;
$antesTotal = 0;
$despuesTotal = 0;

foreach ($iterador as $archivo) {
    if (!$archivo->isFile() || preg_match('/\.jpe?g$/i', $archivo->getFilename()) !== 1) {
        continue;
    }
    ++$total;
    $ruta = $archivo->getPathname();
    $estado = $es_progresivo($ruta);
    if ($estado === true) { ++$yaEstaban; continue; }

    $antes = (int) filesize($ruta);
    if (!$hacerlo) {
        $antesTotal += $antes;
        ++$convertidos;
        continue;
    }

    $imagen = @imagecreatefromjpeg($ruta);
    if ($imagen === false) { continue; }
    imageinterlace($imagen, true);
    $temporal = $ruta . '.progresivo';
    $ok = imagejpeg($imagen, $temporal, $calidad);
    imagedestroy($imagen);
    if (!$ok || !file_exists($temporal)) { @unlink($temporal); continue; }

    $despues = (int) filesize($temporal);
    // Si no gana nada, no se toca: no vale una generación de pérdida.
    if ($despues >= $antes) {
        @unlink($temporal);
        ++$descartados;
        continue;
    }

    if (!@rename($temporal, $ruta)) { @unlink($temporal); continue; }
    $antesTotal += $antes;
    $despuesTotal += $despues;
    ++$convertidos;
}

echo "JPEG en Medios: $total\n";
echo "  ya eran progresivos: $yaEstaban\n";
if (!$hacerlo) {
    echo "  se convertirían: $convertidos (" . number_format($antesTotal / 1048576, 1, ',', '.') . " MB)\n";
    echo "\n(prueba en seco; usa --hacerlo para convertir)\n";
    exit(0);
}
echo "  convertidos: $convertidos\n";
echo "  descartados por no ganar nada: $descartados\n";
if ($antesTotal > 0) {
    printf(
        "  %s MB → %s MB (%+d%%)\n",
        number_format($antesTotal / 1048576, 1, ',', '.'),
        number_format($despuesTotal / 1048576, 1, ',', '.'),
        (int) round(($despuesTotal - $antesTotal) * 100 / $antesTotal)
    );
}
