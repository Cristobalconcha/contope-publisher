<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Integridad referencial del diseño SOBRE LO SERVIDO (ESPEC 3.6, hallazgo H4).
 *
 * Antes de mover el puntero del ADN hay que saber qué variables están en uso, para no
 * quitarle el suelo a una página. La versión anterior de la espec miraba el registro de
 * composiciones (`META_COMPOSITION`), que `repository->save()` VACÍA en cada guardado
 * (class-cod-canvas-document-repository.php: save, save_if_revision): un `cod_patch_css`
 * legítimo borraba la prueba de que la variable estaba en uso. Por eso se recorre lo que
 * realmente se sirve, en cinco lugares, sin depender de la composición:
 *
 *   1. el CSS guardado y los `style=""` del HTML de TODOS los documentos y regiones;
 *   2. los `styles` de `projectData` (de donde el editor vuelve a sacar el CSS);
 *   3. los atributos y las clases de los bloques en `post_content` de TODAS las páginas y
 *      entradas, en cualquier estado (publish, draft, pending, private, future);
 *   4. las partes y plantillas del tema (parts/*.html, templates/*.html);
 *   5. las hojas generadas (`cod_disenos_hojas`, uploads/contope-disenos).
 *
 * Una "variable en uso" es `var(--nombre)`, la abreviatura de bloque `var:preset|color|x`
 * y las clases `has-x-color`, `has-x-background-color`, `has-x-border-color`,
 * `has-x-font-size`, `has-x-font-family`, que WordPress resuelve a `--wp--preset--*`.
 */
final class COD_ADN_Integridad
{
    public const MAX_USOS_POR_VARIABLE = 8;

    /** @var array<string, string> prefijo de clase has-… → familia de preset */
    private const CLASES_HAS = [
        '/(?<![\w-])has-([a-z0-9-]+)-background-color(?![\w-])/' => 'color',
        '/(?<![\w-])has-([a-z0-9-]+)-border-color(?![\w-])/' => 'color',
        '/(?<![\w-])has-([a-z0-9-]+)-color(?![\w-])/' => 'color',
        '/(?<![\w-])has-([a-z0-9-]+)-font-size(?![\w-])/' => 'font-size',
        '/(?<![\w-])has-([a-z0-9-]+)-font-family(?![\w-])/' => 'font-family',
    ];

    /**
     * Las variables que nombra un texto.
     *
     * @return array<int, string>
     */
    public static function variables_en(string $texto): array
    {
        $out = [];
        if ($texto === '') {
            return $out;
        }
        if (preg_match_all('/var\(\s*(--[a-zA-Z0-9_-]+)/', $texto, $m) > 0) {
            foreach ($m[1] as $v) {
                $out[$v] = true;
            }
        }
        // Abreviatura de WordPress en atributos de bloque: "var:preset|color|accent".
        if (preg_match_all('/var:preset\|([a-z0-9-]+)\|([a-z0-9-]+)/', $texto, $m, PREG_SET_ORDER) > 0) {
            foreach ($m as $par) {
                $out['--wp--preset--' . $par[1] . '--' . $par[2]] = true;
            }
        }
        // En orden y consumiendo lo que calza: "has-accent-background-color" no debe leerse
        // también como un color llamado "accent-background".
        foreach (self::CLASES_HAS as $patron => $familia) {
            $texto = (string) preg_replace_callback($patron, static function (array $c) use (&$out, $familia): string {
                // `has-text-color` y `has-link-color` son clases de WordPress ("tiene color de texto"), no un preset llamado "text".
                if (!($familia === 'color' && in_array($c[1], ['text', 'link'], true))) {
                    $out['--wp--preset--' . $familia . '--' . $c[1]] = true;
                }
                return ' ';
            }, $texto);
        }
        return array_keys($out);
    }

    /**
     * Todas las variables en uso en lo servido.
     *
     * @return array<string, array<int, array<string, string>>> variable → usos {origen, documento|archivo, detalle}
     */
    public static function variables_en_uso(): array
    {
        global $wpdb;
        $usos = [];
        $anotar = static function (string $texto, string $origen, string $donde, string $detalle) use (&$usos): void {
            foreach (self::variables_en($texto) as $variable) {
                $usos[$variable][] = ['origen' => $origen, 'donde' => $donde, 'detalle' => $detalle];
            }
        };

        // 1 y 2. Documentos y regiones (mismo tipo de contenido): CSS, style="" y projectData.
        $tipo = COD_Canvas_Document_Repository::POST_TYPE;
        $ids = $wpdb->get_col($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE post_type = %s AND post_status NOT IN ('trash','auto-draft')", $tipo));
        foreach ((array) $ids as $post_id) {
            $post_id = (int) $post_id;
            $documento = (string) get_post_meta($post_id, COD_Canvas_Document_Repository::META_DOCUMENT_ID, true);
            if ($documento === '') {
                $documento = 'post-' . $post_id;
            }
            $anotar((string) get_post_meta($post_id, COD_Canvas_Document_Repository::META_CSS, true), 'css', $documento, 'hoja del documento');
            $html = (string) get_post_meta($post_id, COD_Canvas_Document_Repository::META_HTML, true);
            if ($html !== '' && preg_match_all('/\sstyle\s*=\s*("([^"]*)"|\'([^\']*)\')/i', $html, $m, PREG_SET_ORDER) > 0) {
                foreach ($m as $par) {
                    $anotar(html_entity_decode($par[2] !== '' ? $par[2] : ($par[3] ?? ''), ENT_QUOTES), 'style', $documento, 'style=""');
                }
            }
            $anotar((string) get_post_meta($post_id, COD_Canvas_Document_Repository::META_PROJECT_DATA, true), 'projectData', $documento, 'projectData');
        }

        // 3. Bloques en post_content de todas las páginas y estados.
        $excluir = [$tipo, COD_ADN_Store::POST_TYPE, 'revision', 'nav_menu_item', 'attachment', 'customize_changeset', 'oembed_cache', 'auto-draft'];
        $marcadores = implode(',', array_fill(0, count($excluir), '%s'));
        $filas = $wpdb->get_results($wpdb->prepare(
            "SELECT ID, post_type, post_status, post_content FROM {$wpdb->posts} WHERE post_status IN ('publish','draft','pending','private','future') AND post_type NOT IN ($marcadores) AND post_content <> ''",
            $excluir
        ), ARRAY_A);
        foreach ((array) $filas as $fila) {
            $anotar((string) $fila['post_content'], 'bloques', $fila['post_type'] . ' #' . $fila['ID'], 'post_content (' . $fila['post_status'] . ')');
        }

        // 4. Partes y plantillas del tema (activo y, si es hijo, también el padre).
        $carpetas = array_unique(array_filter([function_exists('get_stylesheet_directory') ? get_stylesheet_directory() : '', function_exists('get_template_directory') ? get_template_directory() : '']));
        foreach ($carpetas as $carpeta) {
            foreach (['parts', 'templates'] as $sub) {
                foreach ((array) glob(rtrim($carpeta, '/\\') . '/' . $sub . '/*.html') as $archivo) {
                    $contenido = is_readable($archivo) ? (string) file_get_contents($archivo) : '';
                    $anotar($contenido, 'tema', $sub . '/' . basename($archivo), basename($carpeta));
                }
            }
        }

        // 5. Las hojas generadas.
        $hojas = get_option(COD_Diseno_Hoja::OPTION_KEY, []);
        $dir_hojas = COD_Diseno_Hoja::carpeta();
        if (is_array($hojas) && $dir_hojas !== '') {
            foreach ($hojas as $design_id => $hoja) {
                $archivo = trailingslashit($dir_hojas) . (string) ($hoja['archivo'] ?? '');
                if (is_file($archivo) && is_readable($archivo)) {
                    $anotar((string) file_get_contents($archivo), 'hoja', (string) ($hoja['archivo'] ?? ''), 'diseño ' . $design_id);
                }
            }
        }

        return $usos;
    }

    /**
     * Las variables de la lista que están en uso, con dónde.
     *
     * @param array<int, string> $variables
     * @param array<string, array<int, array<string, string>>>|null $usos si ya se calcularon
     * @return array<int, array<string, mixed>> {variable, origen, documentId|archivo, regla|ruta, usos}
     */
    public static function en_uso(array $variables, ?array $usos = null): array
    {
        $usos = $usos ?? self::variables_en_uso();
        $rompe = [];
        foreach ($variables as $variable) {
            if (empty($usos[$variable])) {
                continue;
            }
            $lista = $usos[$variable];
            $primero = $lista[0];
            $rompe[] = [
                'variable' => $variable,
                'origen' => $primero['origen'],
                'documentId' => $primero['donde'],
                'ruta' => $primero['detalle'],
                'archivo' => in_array($primero['origen'], ['tema', 'hoja'], true) ? $primero['donde'] : null,
                'cantidad' => count($lista),
                'usos' => array_slice($lista, 0, self::MAX_USOS_POR_VARIABLE),
            ];
        }
        return $rompe;
    }
}
