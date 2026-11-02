<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * El lector (y el constructor) del manifiesto `.ocdsite` v1: `formatVersion` + `entrypoints`
 * (docs/package-format-v1.md, schemas/manifest-v1.schema.json).
 *
 * Hasta F1b NINGÚN código del plugin leía ese manifiesto: el exportador y el importador hablaban
 * el esquema propio `schemaVersion` + `pages`/`documents`. Este lector convive con ese esquema (el
 * importador decide por la presencia de `formatVersion`) y no lo reemplaza: los paquetes que ya
 * existen se siguen importando igual.
 *
 * Qué hace esta clase y qué no:
 *  - VALIDA el manifiesto con las mismas reglas del esquema (claves exactas, URN, rutas portables,
 *    sha256, entrypoints que resuelven a un archivo del inventario y con el rol que les toca,
 *    rutas únicas sin distinguir mayúsculas). Los códigos son los de `check-package-v1.mjs`.
 *  - INSPECCIONA el ZIP antes de leer nada (rutas fuera de la raíz, enlaces simbólicos, bombas).
 *  - LEE un archivo del paquete verificando tamaño y sha256 contra el inventario: lo que declara
 *    el manifiesto es lo que se lee, o no se lee.
 *  - NO escribe nada en WordPress. Eso lo hace el importador, después de revisarlo todo.
 */
final class COD_Site_Package_Format
{
    public const FORMAT_VERSION = 1;
    public const SCHEMA_ID = 'https://contope.org/schemas/package/manifest-v1.schema.json';

    public const CONTENT_PATH = 'content/pages.json';
    public const STATE_PATH = 'wordpress/state.json';
    public const MODEL_PATH = 'design/model.json';
    public const MODEL_MD_PATH = 'design/DESIGN.md';
    public const CONTENT_SCHEMA = 'contope/site-content';
    public const STATE_SCHEMA = 'contope/wordpress-state';

    public const MAX_ENTRIES = 20000;
    public const MAX_JSON_BYTES = 67108864;
    public const MAX_UNCOMPRESSED_BYTES = 4294967296;
    public const MAX_COMPRESSION_RATIO = 2000;

    private const ROLES = [
        'manifest', 'content', 'wordpress-state', 'theme-config', 'theme-stylesheet', 'template', 'part',
        'pattern', 'navigation', 'fonts', 'design-model', 'desktop-source', 'idml', 'readme', 'other',
    ];

    /** entrypoint → rol que debe tener el archivo al que apunta. */
    private const ENTRYPOINT_ROLES = [
        'content' => 'content',
        'theme' => 'theme-config',
        'wordpressState' => 'wordpress-state',
        'designModel' => 'design-model',
        'desktopSource' => 'desktop-source',
        'idml' => 'idml',
    ];

    private const RE_PATH = '#^(?:[A-Za-z0-9][A-Za-z0-9._-]*)(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*$#D';
    private const RE_VERSION = '#^[0-9]+(?:\.[0-9]+){0,3}(?:[-+][A-Za-z0-9._-]+)?$#D';
    private const RE_SHA256 = '#^[a-f0-9]{64}$#D';
    private const RE_MIME = '#^[a-z0-9!\#$&^_.+-]+/[a-z0-9!\#$&^_.+-]+$#D';
    private const RE_DATE_TIME = '#^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$#D';

    // ------------------------------------------------------------------
    // Validación del manifiesto
    // ------------------------------------------------------------------

    /**
     * @param mixed $manifest el manifiesto ya decodificado (arreglo asociativo)
     * @return array<int, array{code: string, where: string}> vacío = válido
     */
    public static function validar_manifiesto($manifest): array
    {
        $errores = [];
        $e = static function (string $code, string $where) use (&$errores): void {
            $errores[] = ['code' => $code, 'where' => $where];
        };

        if (!is_array($manifest) || self::es_lista($manifest)) {
            $e('MANIFEST_NOT_OBJECT', 'manifest');
            return $errores;
        }
        self::claves($manifest, ['$schema', 'formatVersion', 'package', 'project', 'origin', 'requirements', 'entrypoints', 'files', 'assets', 'capabilities'], 'manifest', $e);
        foreach (['formatVersion', 'package', 'project', 'origin', 'requirements', 'entrypoints', 'files', 'assets', 'capabilities'] as $k) {
            if (!array_key_exists($k, $manifest)) {
                $e('MISSING_REQUIRED', 'manifest.' . $k);
            }
        }
        if (array_key_exists('$schema', $manifest) && $manifest['$schema'] !== self::SCHEMA_ID) {
            $e('SCHEMA_ID_MISMATCH', 'manifest.$schema');
        }
        if (array_key_exists('formatVersion', $manifest) && $manifest['formatVersion'] !== self::FORMAT_VERSION) {
            $e('FORMAT_VERSION', 'manifest.formatVersion');
        }

        $obj = static function ($v): bool {
            return is_array($v) && ($v === [] || !self::es_lista($v));
        };

        if (array_key_exists('package', $manifest)) {
            $p = $manifest['package'];
            if (!$obj($p)) {
                $e('NOT_OBJECT', 'manifest.package');
            } else {
                self::claves($p, ['id', 'revision', 'createdAt'], 'manifest.package', $e);
                if (!isset($p['id']) || !is_string($p['id']) || preg_match('#^urn:ocd:package:[A-Za-z0-9._-]+$#D', $p['id']) !== 1) {
                    $e('PACKAGE_ID_FORMAT', 'manifest.package.id');
                }
                if (!isset($p['revision']) || !is_string($p['revision']) || $p['revision'] === '' || strlen($p['revision']) > 128) {
                    $e('INVALID_REVISION', 'manifest.package.revision');
                }
                if (isset($p['createdAt']) && !self::fecha_hora($p['createdAt'])) {
                    $e('INVALID_DATE_TIME', 'manifest.package.createdAt');
                }
            }
        }
        if (array_key_exists('project', $manifest)) {
            $p = $manifest['project'];
            if (!$obj($p)) {
                $e('NOT_OBJECT', 'manifest.project');
            } else {
                self::claves($p, ['id', 'name'], 'manifest.project', $e);
                if (!isset($p['id']) || !is_string($p['id']) || preg_match('#^urn:ocd:project:[A-Za-z0-9._-]+$#D', $p['id']) !== 1) {
                    $e('PROJECT_ID_FORMAT', 'manifest.project.id');
                }
                if (!isset($p['name']) || !is_string($p['name']) || $p['name'] === '' || strlen($p['name']) > 200) {
                    $e('INVALID_NAME', 'manifest.project.name');
                }
            }
        }
        if (array_key_exists('origin', $manifest)) {
            $p = $manifest['origin'];
            if (!$obj($p)) {
                $e('NOT_OBJECT', 'manifest.origin');
            } else {
                self::claves($p, ['producer', 'producerVersion', 'siteId', 'siteUrl', 'exportedAt'], 'manifest.origin', $e);
                if (!isset($p['producer']) || !is_string($p['producer']) || $p['producer'] === '' || strlen($p['producer']) > 80) {
                    $e('INVALID_PRODUCER', 'manifest.origin.producer');
                }
                if (!isset($p['producerVersion']) || !self::version($p['producerVersion'])) {
                    $e('VERSION_FORMAT', 'manifest.origin.producerVersion');
                }
                if (isset($p['siteId']) && (!is_string($p['siteId']) || preg_match('#^urn:ocd:site:[A-Za-z0-9._-]+$#D', $p['siteId']) !== 1)) {
                    $e('SITE_ID_FORMAT', 'manifest.origin.siteId');
                }
                if (isset($p['siteUrl']) && (!is_string($p['siteUrl']) || preg_match('#^[A-Za-z][A-Za-z0-9+.-]*:\S+$#D', $p['siteUrl']) !== 1)) {
                    $e('INVALID_URI', 'manifest.origin.siteUrl');
                }
                if (isset($p['exportedAt']) && !self::fecha_hora($p['exportedAt'])) {
                    $e('INVALID_DATE_TIME', 'manifest.origin.exportedAt');
                }
            }
        }
        if (array_key_exists('requirements', $manifest)) {
            $p = $manifest['requirements'];
            if (!$obj($p)) {
                $e('NOT_OBJECT', 'manifest.requirements');
            } else {
                self::claves($p, ['canvas', 'publisher', 'wordpress'], 'manifest.requirements', $e);
                foreach (['canvas', 'publisher', 'wordpress'] as $k) {
                    if (!array_key_exists($k, $p)) {
                        $e('MISSING_REQUIRED', 'manifest.requirements.' . $k);
                    } elseif (!self::version($p[$k])) {
                        $e('VERSION_FORMAT', 'manifest.requirements.' . $k);
                    }
                }
            }
        }
        if (array_key_exists('capabilities', $manifest)) {
            $p = $manifest['capabilities'];
            if (!$obj($p)) {
                $e('NOT_OBJECT', 'manifest.capabilities');
            } else {
                self::claves($p, ['blockEditor', 'fullSiteEditing', 'localFonts', 'networkAccess', 'requiredBlocks'], 'manifest.capabilities', $e);
                foreach (['blockEditor', 'fullSiteEditing', 'localFonts', 'networkAccess'] as $k) {
                    if (!array_key_exists($k, $p)) {
                        $e('MISSING_REQUIRED', 'manifest.capabilities.' . $k);
                    } elseif (!is_bool($p[$k])) {
                        $e('NOT_BOOLEAN', 'manifest.capabilities.' . $k);
                    }
                }
                if (!array_key_exists('requiredBlocks', $p)) {
                    $e('MISSING_REQUIRED', 'manifest.capabilities.requiredBlocks');
                } elseif (!is_array($p['requiredBlocks']) || !self::es_lista($p['requiredBlocks'])) {
                    $e('NOT_ARRAY', 'manifest.capabilities.requiredBlocks');
                } else {
                    $vistos = [];
                    foreach ($p['requiredBlocks'] as $i => $b) {
                        if (!is_string($b) || $b === '' || strlen($b) > 80) {
                            $e('INVALID_BLOCK', 'manifest.capabilities.requiredBlocks[' . $i . ']');
                        } elseif (isset($vistos[$b])) {
                            $e('DUPLICATE_BLOCK', 'manifest.capabilities.requiredBlocks[' . $i . ']');
                        }
                        if (is_string($b)) {
                            $vistos[$b] = true;
                        }
                    }
                }
            }
        }

        // Inventario y activos: rutas, ids y digestos.
        $rutas = [];
        $rutas_bajas = [];
        $roles_por_ruta = [];
        $ids = [];
        $lista = static function (string $k) use ($manifest): ?array {
            return isset($manifest[$k]) && is_array($manifest[$k]) && self::es_lista($manifest[$k]) ? $manifest[$k] : null;
        };
        $registrar_ruta = static function ($ruta, string $where) use (&$rutas, &$rutas_bajas, $e): bool {
            if (!is_string($ruta) || preg_match(self::RE_PATH, $ruta) !== 1 || strlen($ruta) > 512) {
                $e('PATH_NOT_NORMALIZED', $where);
                return false;
            }
            if (isset($rutas[$ruta])) {
                $e('DUPLICATE_PATH', $where);
            } elseif (isset($rutas_bajas[strtolower($ruta)])) {
                $e('DUPLICATE_PATH_CASE', $where);
            }
            $rutas[$ruta] = true;
            $rutas_bajas[strtolower($ruta)] = true;
            return true;
        };
        if (array_key_exists('files', $manifest)) {
            $files = $lista('files');
            if ($files === null) {
                $e('NOT_ARRAY', 'manifest.files');
            } else {
                foreach ($files as $i => $f) {
                    $w = 'manifest.files[' . $i . ']';
                    if (!$obj($f)) {
                        $e('NOT_OBJECT', $w);
                        continue;
                    }
                    self::claves($f, ['path', 'role', 'size', 'sha256'], $w, $e);
                    foreach (['path', 'role', 'size', 'sha256'] as $k) {
                        if (!array_key_exists($k, $f)) {
                            $e('MISSING_REQUIRED', $w . '.' . $k);
                        }
                    }
                    $ok = array_key_exists('path', $f) && $registrar_ruta($f['path'], $w . '.path');
                    if (isset($f['role']) && (!is_string($f['role']) || !in_array($f['role'], self::ROLES, true))) {
                        $e('INVALID_ROLE', $w . '.role');
                    }
                    if (array_key_exists('size', $f) && (!is_int($f['size']) || $f['size'] < 0)) {
                        $e('INVALID_SIZE', $w . '.size');
                    }
                    if (array_key_exists('sha256', $f) && (!is_string($f['sha256']) || preg_match(self::RE_SHA256, $f['sha256']) !== 1)) {
                        $e('INVALID_SHA256', $w . '.sha256');
                    }
                    if ($ok && isset($f['role']) && is_string($f['role'])) {
                        if (!isset($roles_por_ruta[(string) $f['path']])) { $roles_por_ruta[(string) $f['path']] = $f['role']; }
                    }
                }
            }
        }
        if (array_key_exists('assets', $manifest)) {
            $assets = $lista('assets');
            if ($assets === null) {
                $e('NOT_ARRAY', 'manifest.assets');
            } else {
                foreach ($assets as $i => $a) {
                    $w = 'manifest.assets[' . $i . ']';
                    if (!$obj($a)) {
                        $e('NOT_OBJECT', $w);
                        continue;
                    }
                    self::claves($a, ['id', 'path', 'mime', 'size', 'sha256'], $w, $e);
                    foreach (['id', 'path', 'mime', 'size', 'sha256'] as $k) {
                        if (!array_key_exists($k, $a)) {
                            $e('MISSING_REQUIRED', $w . '.' . $k);
                        }
                    }
                    if (array_key_exists('id', $a)) {
                        if (!is_string($a['id']) || preg_match('#^urn:ocd:asset:[A-Za-z0-9._-]+$#D', $a['id']) !== 1) {
                            $e('ASSET_ID_FORMAT', $w . '.id');
                        } elseif (isset($ids[$a['id']])) {
                            $e('DUPLICATE_ID', $w . '.id');
                        } else {
                            $ids[$a['id']] = true;
                        }
                    }
                    if (array_key_exists('path', $a)) {
                        $registrar_ruta($a['path'], $w . '.path');
                    }
                    if (array_key_exists('mime', $a) && (!is_string($a['mime']) || strlen($a['mime']) < 3 || strlen($a['mime']) > 100 || preg_match(self::RE_MIME, $a['mime']) !== 1)) {
                        $e('INVALID_MIME', $w . '.mime');
                    }
                    if (array_key_exists('size', $a) && (!is_int($a['size']) || $a['size'] < 0)) {
                        $e('INVALID_SIZE', $w . '.size');
                    }
                    if (array_key_exists('sha256', $a) && (!is_string($a['sha256']) || preg_match(self::RE_SHA256, $a['sha256']) !== 1)) {
                        $e('INVALID_SHA256', $w . '.sha256');
                    }
                }
            }
        }

        // Entrypoints: resuelven a un archivo del inventario, sin repetirse, con el rol que les toca.
        if (array_key_exists('entrypoints', $manifest)) {
            $p = $manifest['entrypoints'];
            if (!$obj($p)) {
                $e('NOT_OBJECT', 'manifest.entrypoints');
            } else {
                self::claves($p, ['content', 'theme', 'wordpressState', 'designModel', 'desktopSource', 'idml'], 'manifest.entrypoints', $e);
                foreach (['content', 'theme'] as $k) {
                    if (!array_key_exists($k, $p)) {
                        $e('MISSING_REQUIRED', 'manifest.entrypoints.' . $k);
                    }
                }
                $referidos = [];
                foreach (self::ENTRYPOINT_ROLES as $k => $rol) {
                    if (!array_key_exists($k, $p)) {
                        continue;
                    }
                    $w = 'manifest.entrypoints.' . $k;
                    $ruta = $p[$k];
                    if (!is_string($ruta) || preg_match(self::RE_PATH, $ruta) !== 1) {
                        $e('PATH_NOT_NORMALIZED', $w);
                        continue;
                    }
                    if (isset($referidos[$ruta])) {
                        $e('DUPLICATE_REFERENCE', $w);
                    }
                    $referidos[$ruta] = true;
                    if (!isset($roles_por_ruta[$ruta])) {
                        $e('UNRESOLVED_REFERENCE', $w);
                    } elseif ($roles_por_ruta[$ruta] !== $rol) {
                        $e('ENTRYPOINT_ROLE_MISMATCH', $w);
                    }
                }
            }
        }
        return $errores;
    }

    /** @param array<int, array{code: string, where: string}> $errores */
    public static function describir_errores(array $errores): string
    {
        $partes = [];
        foreach (array_slice($errores, 0, 8) as $err) {
            $partes[] = $err['code'] . ' (' . $err['where'] . ')';
        }
        $mas = count($errores) > 8 ? ' y ' . (count($errores) - 8) . ' más' : '';
        return implode(', ', $partes) . $mas;
    }

    /**
     * @param array<mixed> $objeto
     * @param array<int, string> $permitidas
     * @param callable(string, string): void $e
     */
    private static function claves(array $objeto, array $permitidas, string $donde, callable $e): void
    {
        foreach (array_keys($objeto) as $k) {
            if (!in_array((string) $k, $permitidas, true)) {
                $e('UNKNOWN_FIELD', $donde . '.' . (string) $k);
            }
        }
    }

    /** Equivalente a `array_is_list()` (el plugin declara PHP 8.0). @param array<mixed> $a */
    public static function es_lista(array $a): bool
    {
        $i = 0;
        foreach ($a as $k => $_) {
            if ($k !== $i++) {
                return false;
            }
        }
        return true;
    }

    /** @param mixed $v */
    private static function version($v): bool
    {
        return is_string($v) && $v !== '' && strlen($v) <= 40 && preg_match(self::RE_VERSION, $v) === 1;
    }

    /** @param mixed $v */
    private static function fecha_hora($v): bool
    {
        return is_string($v) && preg_match(self::RE_DATE_TIME, $v) === 1 && strtotime($v) !== false;
    }

    // ------------------------------------------------------------------
    // El ZIP
    // ------------------------------------------------------------------

    /**
     * Revisa la LISTA de entradas del ZIP antes de leer una sola. Sirve a los dos esquemas.
     *
     * @return true|WP_Error
     */
    public static function inspeccionar_zip(ZipArchive $zip)
    {
        if ($zip->numFiles > self::MAX_ENTRIES) {
            return new WP_Error('cod_package_zip_too_many', 'El paquete trae demasiadas entradas (' . $zip->numFiles . ').');
        }
        $total = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if (!is_array($stat)) {
                return new WP_Error('cod_package_zip_unreadable', 'No se pudo leer la entrada ' . $i . ' del paquete.');
            }
            $nombre = (string) $stat['name'];
            if (
                $nombre === ''
                || strpos($nombre, "\0") !== false
                || strpos($nombre, '\\') !== false
                || $nombre[0] === '/'
                || preg_match('#^[A-Za-z]:#', $nombre) === 1
                || in_array('..', explode('/', $nombre), true)
            ) {
                return new WP_Error('cod_package_zip_unsafe_path', 'El paquete trae una ruta que sale de su carpeta o no es portable: ' . self::visible($nombre));
            }
            $os = null;
            $attr = null;
            if ($zip->getExternalAttributesIndex($i, $os, $attr) && $os === ZipArchive::OPSYS_UNIX && (($attr >> 16) & 0170000) === 0120000) {
                return new WP_Error('cod_package_zip_symlink', 'El paquete trae un enlace simbólico (' . self::visible($nombre) . '); no se importa.');
            }
            $size = (int) $stat['size'];
            $comprimido = (int) $stat['comp_size'];
            $total += $size;
            if ($size > 1048576 && $comprimido > 0 && intdiv($size, $comprimido) > self::MAX_COMPRESSION_RATIO) {
                return new WP_Error('cod_package_zip_bomb', 'La entrada ' . self::visible($nombre) . ' se descomprime más de ' . self::MAX_COMPRESSION_RATIO . ' veces; el paquete se rechaza.');
            }
        }
        if ($total > self::MAX_UNCOMPRESSED_BYTES) {
            return new WP_Error('cod_package_zip_too_big', 'El paquete descomprimido pasa de ' . size_format(self::MAX_UNCOMPRESSED_BYTES) . '.');
        }
        return true;
    }

    private static function visible(string $s): string
    {
        return substr(preg_replace('/[^\x20-\x7E]/', '?', $s) ?? '', 0, 120);
    }

    /**
     * Lee un archivo declarado en `files[]` verificando tamaño y sha256 contra el inventario.
     *
     * @param array<string, array{path: string, role: string, size: int, sha256: string}> $inventario
     * @return string|WP_Error
     */
    public static function leer_declarado(ZipArchive $zip, array $inventario, string $ruta, int $maximo = self::MAX_JSON_BYTES)
    {
        if (!isset($inventario[$ruta])) {
            return new WP_Error('cod_package_file_undeclared', 'El paquete usa ' . self::visible($ruta) . ', que el manifiesto no declara en files[].');
        }
        $entrada = $inventario[$ruta];
        $indice = $zip->locateName($ruta);
        if ($indice === false) {
            return new WP_Error('cod_package_file_missing', 'El manifiesto declara ' . self::visible($ruta) . ' pero el archivo no está en el paquete.');
        }
        if ($entrada['size'] > $maximo) {
            return new WP_Error('cod_package_file_too_big', self::visible($ruta) . ' pesa más de lo que se acepta leer (' . size_format($maximo) . ').');
        }
        $contenido = $zip->getFromIndex($indice);
        if ($contenido === false) {
            return new WP_Error('cod_package_file_unreadable', 'No se pudo leer ' . self::visible($ruta) . ' del paquete.');
        }
        if (strlen($contenido) !== $entrada['size']) {
            return new WP_Error('cod_package_size_mismatch', self::visible($ruta) . ' pesa ' . strlen($contenido) . ' bytes y el manifiesto dice ' . $entrada['size'] . '.');
        }
        if (!hash_equals($entrada['sha256'], hash('sha256', $contenido))) {
            return new WP_Error('cod_package_hash_mismatch', 'El contenido de ' . self::visible($ruta) . ' no coincide con su sha256 del manifiesto: el paquete está alterado o dañado.');
        }
        return $contenido;
    }

    /**
     * @param array<string, mixed> $manifest ya validado
     * @return array<string, array{path: string, role: string, size: int, sha256: string}>
     */
    public static function inventario(array $manifest): array
    {
        $por_ruta = [];
        foreach ($manifest['files'] as $f) {
            $por_ruta[(string) $f['path']] = ['path' => (string) $f['path'], 'role' => (string) $f['role'], 'size' => (int) $f['size'], 'sha256' => (string) $f['sha256']];
        }
        return $por_ruta;
    }

    /**
     * @param array<string, mixed> $manifest ya validado
     * @return array<string, array{id: string, path: string, mime: string, size: int, sha256: string}>
     */
    public static function activos(array $manifest): array
    {
        $por_id = [];
        foreach ($manifest['assets'] as $a) {
            $por_id[(string) $a['id']] = ['id' => (string) $a['id'], 'path' => (string) $a['path'], 'mime' => (string) $a['mime'], 'size' => (int) $a['size'], 'sha256' => (string) $a['sha256']];
        }
        return $por_id;
    }

    /**
     * Decodifica un JSON del paquete (objeto en la raíz). Los objetos vacíos de adentro quedan como
     * arreglos vacíos: ninguno de los dos esquemas propios distingue `{}` de `[]` en su contenido.
     *
     * @return array<string, mixed>|WP_Error
     */
    public static function decodificar_objeto(string $json, string $que)
    {
        try {
            $v = json_decode($json, true, 128, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            return new WP_Error('cod_package_json_invalid', $que . ' no es JSON válido.');
        }
        if (!is_array($v) || ($v !== [] && self::es_lista($v))) {
            return new WP_Error('cod_package_json_shape', $que . ' no es un objeto JSON.');
        }
        return $v;
    }

    // ------------------------------------------------------------------
    // Qué clase de página es (H9)
    // ------------------------------------------------------------------

    /** ¿El contenido es un shortcode del lienzo (`[contope_canvas document_id="…"]`)? */
    public static function es_atajo_canvas(string $contenido): bool
    {
        return strpos($contenido, '[contope_canvas') !== false;
    }

    /**
     * Página EN BLOQUES: su `post_content` es el contenido (bloques de WordPress con sus comentarios
     * `<!-- wp:… -->`), no un shortcode que remite a un documento. Una página migrada a bloques puede
     * conservar el metadato `_cod_canvas_document_id` (las de Basis lo conservan): el metadato NO
     * decide, decide el contenido.
     */
    public static function es_contenido_en_bloques(string $contenido): bool
    {
        return strpos($contenido, '<!-- wp:') !== false && !self::es_atajo_canvas($contenido);
    }

    /** ¿La ruta relativa a uploads es segura para escribir? (sin salir de uploads, sin NUL ni barras invertidas). */
    public static function ruta_de_medio_segura(string $relativa): bool
    {
        if ($relativa === '' || strlen($relativa) > 512 || strpos($relativa, "\0") !== false || strpos($relativa, '\\') !== false || $relativa[0] === '/' || preg_match('#^[A-Za-z]:#', $relativa) === 1) {
            return false;
        }
        $segmentos = explode('/', $relativa);
        foreach ($segmentos as $segmento) {
            if ($segmento === '' || $segmento === '.' || $segmento === '..') {
                return false;
            }
        }
        // §7 del formato: nada que el servidor pueda EJECUTAR llega a uploads (ni un archivo de configuración oculto).
        $nombre = strtolower((string) end($segmentos));
        if ($nombre[0] === '.' || preg_match('/\.(?:php[0-9]?|phtml|pht|phps|phar|cgi|pl|py|rb|sh|bat|cmd|exe|dll|ini|htaccess|htpasswd)(?:\.|$)/', $nombre) === 1) {
            return false;
        }
        return true;
    }
}
