<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Los íconos del sitio dentro del bloque `core/icon` de WordPress.
 *
 * LA REGLA DE FAMILIA. Gutenberg ya trae la familia «ícono» (`core/icon`, desde
 * WordPress 7.0): un SVG que toma el color de su texto, así que su color es un
 * slug de la paleta (`textColor`) y su tamaño un ancho de bloque. ContOpe no
 * vuelve a construir un ícono ni lo dibuja como imagen (una imagen SVG conserva
 * el color de su archivo y no puede tomar uno de la paleta): se CORRESPONDE con
 * esa familia dándole el repertorio del sitio.
 *
 * QUÉ REGISTRA. Una colección `contope` en el registro de íconos de WordPress,
 * con cada SVG de la carpeta del set (`uploads/contope-iconos`, la misma de
 * `COD_Icono`): los `icono-<nombre>-<estilo>.svg` de Material (se elige el
 * estilo del sitio y, si falta, otro) y los `icono-<nombre>.svg` sin estilo
 * (marcas y glifos que se dibujan como son). Cada uno se llama
 * `contope/<nombre>`. El contenido no se lee hasta que se usa.
 *
 * Es un ícono más del editor: el selector de `core/icon` lo lista y la página
 * lo guarda como `<!-- wp:icon {"icon":"contope/<nombre>","textColor":"…"} /-->`,
 * sin una sola declaración de diseño que no sea una referencia a la paleta.
 */
final class COD_Iconos_De_Bloque
{
    public const COLECCION = 'contope';

    public function register(): void
    {
        // Después de que WordPress registre su propia colección (init, 10).
        add_action('init', [$this, 'registrar'], 20);
    }

    public function registrar(): void
    {
        if (!function_exists('wp_register_icon_collection') || !function_exists('wp_register_icon')) {
            return;
        }
        $archivos = self::archivos();
        if ($archivos === []) {
            return;
        }
        wp_register_icon_collection(self::COLECCION, [
            'label' => 'ContOpe',
            'description' => 'Los íconos del set del sitio (carpeta contope-iconos de Medios).',
        ]);
        foreach ($archivos as $nombre => $ruta) {
            wp_register_icon(self::COLECCION . '/' . $nombre, [
                'label' => ucfirst(str_replace(['-', '_'], ' ', $nombre)),
                'file_path' => $ruta,
            ]);
        }
    }

    /**
     * nombre → ruta del archivo, uno por nombre, con el estilo del sitio primero.
     *
     * @return array<string, string>
     */
    public static function archivos(): array
    {
        $carpeta = class_exists('COD_Icono') ? COD_Icono::carpeta() : '';
        if ($carpeta === '' || !is_dir($carpeta)) {
            return [];
        }
        $estilo = COD_Icono::estilo();
        $orden = array_merge([$estilo], array_diff(COD_Icono::ESTILOS, [$estilo]));
        $porNombre = [];
        foreach (glob(trailingslashit($carpeta) . 'icono-*.svg') ?: [] as $ruta) {
            $base = basename($ruta, '.svg');
            if (preg_match('/^icono-([a-z0-9_-]+?)(?:-(outlined|rounded|sharp))?$/', $base, $m) !== 1) {
                continue;
            }
            $nombre = $m[1];
            if (preg_match('/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/', $nombre) !== 1) {
                continue;
            }
            $prioridad = isset($m[2]) ? (int) array_search($m[2], $orden, true) : 99;
            if (!isset($porNombre[$nombre]) || $prioridad < $porNombre[$nombre][0]) {
                $porNombre[$nombre] = [$prioridad, $ruta];
            }
        }
        ksort($porNombre);
        return array_map(static fn (array $p): string => $p[1], $porNombre);
    }
}
