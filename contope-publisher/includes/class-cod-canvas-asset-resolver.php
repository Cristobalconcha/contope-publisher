<?php

if (!defined('ABSPATH')) {
    exit;
}

/** Resolves portable/local asset references against the managed uploads tree. */
final class COD_Canvas_Asset_Resolver
{
    public const MAX_REFERENCES = 100;
    public const MAX_FILES_SCANNED = 2000;

    /**
     * @param list<string> $references
     * @return array{mapping: array<string, string>, missing: list<string>}
     */
    /**
     * La carpeta de uploads donde el plugin guarda lo suyo.
     *
     * El proyecto cambió de nombre y la carpeta pasó de `open-codesign` a
     * `contope`. En un sitio que venía de la versión anterior los archivos
     * siguen en la carpeta vieja, y nadie va a moverlos: son las tipografías
     * del sitio y las imágenes ya publicadas.
     *
     * Se prefiere la carpeta nueva. Si no existe pero sí la vieja, se usa la
     * vieja, sin mover ni copiar nada. Mover archivos por FTP para cambiar un
     * nombre que nadie ve sería caro y arriesgado a cambio de nada; leer donde
     * están cuesta una comprobación.
     *
     * @return array{dir: string, url: string}
     */
    public static function carpeta_gestionada(?string $subcarpeta = null): array
    {
        $uploads = wp_upload_dir();
        $sufijo = $subcarpeta !== null && $subcarpeta !== '' ? '/' . ltrim($subcarpeta, '/') : '';

        foreach (['contope', 'open-codesign'] as $nombre) {
            $dir = trailingslashit((string) $uploads['basedir']) . $nombre . $sufijo;
            if (is_dir($dir)) {
                return [
                    'dir' => $dir,
                    'url' => trailingslashit((string) $uploads['baseurl']) . $nombre . $sufijo,
                ];
            }
        }

        // Ninguna existe todavía: se nombra la nueva, que es donde se escribe.
        return [
            'dir' => trailingslashit((string) $uploads['basedir']) . 'contope' . $sufijo,
            'url' => trailingslashit((string) $uploads['baseurl']) . 'contope' . $sufijo,
        ];
    }

    public function resolve(array $references): array
    {
        $references = array_values(array_unique(array_filter($references, static function ($value): bool {
            return is_string($value) && $value !== '' && strlen($value) <= 2048;
        })));
        $references = array_slice($references, 0, self::MAX_REFERENCES);

        $carpeta = self::carpeta_gestionada();
        $managed_root = $carpeta['dir'];
        $managed_url = $carpeta['url'];
        $index = $this->build_index($managed_root, $managed_url);
        $mapping = [];
        $missing = [];

        foreach ($references as $reference) {
            $key = $this->normalized_asset_key($reference);
            if ($key !== '' && isset($index[$key])) {
                $mapping[$reference] = $index[$key];
            } else {
                $missing[] = $reference;
            }
        }

        return ['mapping' => $mapping, 'missing' => $missing];
    }

    /** @return array<string, string> */
    private function build_index(string $root, string $base_url): array
    {
        if (!is_dir($root)) {
            return [];
        }
        $root = wp_normalize_path($root);
        $index = [];
        $count = 0;
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $file) {
            if (++$count > self::MAX_FILES_SCANNED) {
                break;
            }
            if (!$file->isFile()) {
                continue;
            }
            $path = wp_normalize_path($file->getPathname());
            if (!str_starts_with($path, trailingslashit($root))) {
                continue;
            }
            $key = $this->normalized_asset_key($file->getFilename());
            if ($key === '' || isset($index[$key])) {
                continue;
            }
            $relative = ltrim(substr($path, strlen($root)), '/');
            $segments = array_map('rawurlencode', explode('/', $relative));
            $index[$key] = esc_url_raw(trailingslashit($base_url) . implode('/', $segments));
        }

        return $index;
    }

    private function normalized_asset_key(string $reference): string
    {
        $decoded = rawurldecode(html_entity_decode($reference, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $path = wp_parse_url($decoded, PHP_URL_PATH);
        $name = basename(is_string($path) && $path !== '' ? $path : $decoded);
        $extension = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        $stem = strtolower((string) pathinfo($name, PATHINFO_FILENAME));
        $stem = remove_accents($stem);
        $stem = preg_replace('/[^a-z0-9]+/', '', $stem) ?? '';

        return $stem === '' ? '' : $stem . ($extension === '' ? '' : '.' . $extension);
    }
}
