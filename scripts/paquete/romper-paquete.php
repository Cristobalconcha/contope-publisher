<?php
/**
 * CONTROL de las pruebas del paquete: rehace un `.ocdsite` quitándole a propósito una parte del estado del sitio, dejando
 * el resto VÁLIDO (el manifiesto se rehace con los sha256 y tamaños nuevos). Sirve para comprobar que la prueba de
 * punta a punta falla de verdad cuando el transporte se rompe.
 *
 *   php romper-paquete.php <entrada.zip> <salida.zip> <partes separadas por coma> [--aligerar]
 *
 * Con --aligerar el paquete pierde además los archivos de medios pesados (más de 400 KB) que no importan para lo que se
 * controla (videos, PDF, fotos grandes): quedan listados en el contenido como en un paquete de «solo estructura». Sirve para
 * que cada control no tenga que escribir 35 MB en el destino.
 *
 * Partes: menus (menús clásicos + navegaciones + ubicaciones), branding (ícono y logos), iconos (estilo y set), hojas,
 * ajustes (título, descripción, enlaces permanentes), regiones-por-numero (devuelve los destinos de las regiones a
 * números del origen, el defecto de antes).
 */
[$_script, $entrada, $salida, $partes, $bandera] = array_pad($argv, 5, '');
if (!is_file($entrada) || $salida === '' || $partes === '') {
    fwrite(STDERR, "Uso: php romper-paquete.php <entrada.zip> <salida.zip> <partes>\n");
    exit(2);
}
$zip = new ZipArchive();
$zip->open($entrada);
$archivos = [];
for ($i = 0; $i < $zip->numFiles; $i++) {
    $archivos[(string) $zip->getNameIndex($i)] = (string) $zip->getFromIndex($i);
}
$zip->close();
$manifiesto = json_decode($archivos['manifest.json'], true);
$tocar = static function (string $ruta, callable $f) use (&$archivos, &$manifiesto): void {
    $nuevo = (string) json_encode($f(json_decode($archivos[$ruta], true)), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $archivos[$ruta] = $nuevo;
    foreach ($manifiesto['files'] as $i => $fila) {
        if ($fila['path'] === $ruta) {
            $manifiesto['files'][$i]['size'] = strlen($nuevo);
            $manifiesto['files'][$i]['sha256'] = hash('sha256', $nuevo);
        }
    }
};
if ($bandera === '--aligerar') {
    $pesados = [];
    foreach ($manifiesto['assets'] as $i => $a) {
        if ((int) $a['size'] > 400000) {
            $pesados[$a['id']] = $a['path'];
            unset($manifiesto['assets'][$i]);
            unset($archivos[$a['path']]);
        }
    }
    $manifiesto['assets'] = array_values($manifiesto['assets']);
    if ($pesados !== []) {
        $tocar('content/pages.json', static function (array $c) use ($pesados): array {
            foreach ($c['media'] as $i => $m) {
                if (isset($m['asset']) && isset($pesados[$m['asset']])) {
                    $c['media'][$i]['asset'] = null;
                }
            }
            $c['includesMedia'] = false;
            return $c;
        });
    }
}
foreach (array_filter(explode(',', $partes)) as $parte) {
    if ($parte === 'regiones-por-numero') {
        $tocar('content/pages.json', static function (array $c): array {
            foreach ($c['documents'] as $id => $d) {
                foreach (['regionTargets', 'regionExcludes'] as $campo) {
                    foreach ((array) ($d[$campo] ?? []) as $i => $regla) {
                        if (isset($regla['ref'])) {
                            $c['documents'][$id][$campo][$i] = ['type' => $regla['type'], 'id' => 999 + $i];
                        }
                    }
                }
            }
            return $c;
        });
        continue;
    }
    $tocar('wordpress/state.json', static function (array $e) use ($parte): array {
        if ($parte === 'menus') {
            unset($e['menus'], $e['navigation'], $e['menuLocations']);
        } elseif ($parte === 'branding') {
            $e['branding'] = ['siteIcon' => null, 'siteLogo' => null, 'customLogo' => null];
        } elseif ($parte === 'iconos') {
            $e['iconSet'] = ['style' => '', 'files' => 0];
        } elseif ($parte === 'hojas') {
            $e['designSheets'] = [];
        } elseif ($parte === 'ajustes') {
            $e['site'] = ['blogname' => '', 'blogdescription' => '', 'permalinkStructure' => '', 'categoryBase' => '', 'tagBase' => ''];
        }
        return $e;
    });
}
$archivos['manifest.json'] = (string) json_encode($manifiesto, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
$nuevo = new ZipArchive();
$nuevo->open($salida, ZipArchive::CREATE | ZipArchive::OVERWRITE);
foreach ($archivos as $nombre => $contenido) {
    $nuevo->addFromString($nombre, $contenido);
}
$nuevo->close();
echo json_encode(['escrito' => $salida, 'partes' => explode(',', $partes)]);
