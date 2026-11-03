<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * La proyección del ADN que WordPress lee: el theme.json (F2, ESPEC 3.6 y H11).
 *
 * TRES COSAS, UNA SOLA FUENTE (el puntero `cod_adn_activa`):
 *
 *   1. `filtrar()` engancha `wp_theme_json_data_theme`: con un ADN activo, la paleta, las familias,
 *      las escalas de tamaño y de espaciado, el ancho de caja, los radios y lo demás que el ADN
 *      proyecta SALEN DEL ADN, no del archivo `theme.json` del tema. Es lo que hace que importar un
 *      paquete deje al sitio destino con los mismos presets que el origen SIN subir archivos de tema.
 *      Es un no-op en dos casos: sin ADN, y cuando el archivo del tema ya lleva el sello de ESTA
 *      revisión (`settings.custom.adn.digest`): entonces el archivo es una salida del ADN y no hay
 *      nada que superponer (no son dos autoridades).
 *
 *   2. `exportar_theme_json()` (herramienta `cod_adn_export`, formato `theme-json`) genera ese archivo:
 *      la base del tema (`theme.base.json` si existe, si no el `theme.json` actual) con la proyección
 *      encima y el sello. Se commitea y se sube con el tema: es el respaldo si el plugin se apaga.
 *
 *   3. `limpiar_cache()` descarta lo que WordPress guardó del theme.json cuando cambia el puntero.
 *
 * QUÉ SUPERPONE: sólo lo que la proyección declara. Las listas (paleta con sus transparencias, degradados,
 * familias, tamaños, espaciados con su gutter, sombras) REEMPLAZAN a las del archivo: el ADN es la autoridad
 * de esas escalas, y un `theme.json` viejo no puede volver a tapar un hueco. Los mapas (`custom`, `styles`,
 * `layout`) se mezclan por clave. Desde el 02-nov-2026 (pedidos Q1, Q3 y Q4 al Core) el ADN lleva también
 * transparencias, degradados, sombras, pesos e interlineados con nombre, medidas de texto, grosores de borde,
 * desenfoques, el margen lateral (gutter), el tema del formulario (`custom.form`) y los valores por punto de
 * quiebre. Lo que sigue fuera, y por qué, está en `fuera_del_adn()`.
 *
 * EL CSS DE LOS QUIEBRES (`styles.css`) es una cadena, no un mapa: la proyección trae sólo SU bloque (entre las
 * marcas de COD_ADN_Projection::MARCA_CSS_ESCALA) y aquí se inserta en el CSS que el archivo ya trae, sin pisar
 * lo demás (el CSS de los estilos de bloque, p. ej.).
 */
final class COD_ADN_Theme
{
    public const PRIORIDAD = 9;

    public static function registrar(): void
    {
        add_filter('wp_theme_json_data_theme', [self::class, 'filtrar'], self::PRIORIDAD);
        add_action('cod_adn_activada', [self::class, 'limpiar_cache']);
    }

    /**
     * @param mixed $datos WP_Theme_JSON_Data
     * @return mixed
     */
    public static function filtrar($datos)
    {
        if (!is_object($datos) || !method_exists($datos, 'update_with') || !method_exists($datos, 'get_data')) {
            return $datos;
        }
        $puntero = COD_ADN_Store::puntero();
        if ($puntero === null) {
            return $datos;
        }
        $proyeccion = COD_ADN_Store::proyeccion((int) $puntero['revision']);
        $fragmento = is_array($proyeccion) && is_array($proyeccion['themeJson'] ?? null) ? $proyeccion['themeJson'] : [];
        if ($fragmento === []) {
            return $datos;
        }
        $actual = $datos->get_data();
        $sello = is_array($actual) ? ($actual['settings']['custom']['adn']['digest'] ?? null) : null;
        if (is_string($sello) && hash_equals($sello, (string) $puntero['digest'])) {
            return $datos;
        }
        if (isset($fragmento['styles']['css']) && is_string($fragmento['styles']['css'])) {
            $fragmento['styles']['css'] = self::con_bloque_de_quiebres(is_array($actual) ? (string) ($actual['styles']['css'] ?? '') : '', $fragmento['styles']['css']);
        }
        return $datos->update_with($fragmento);
    }

    /**
     * Pone el bloque de CSS de los quiebres del ADN dentro del CSS que ya hay: si ya había uno (entre las mismas marcas)
     * lo cambia donde estaba y, si no, agrega el nuevo al final; lo demás queda como estaba.
     */
    public static function con_bloque_de_quiebres(string $existente, string $bloque): string
    {
        $m = preg_quote(COD_ADN_Projection::MARCA_CSS_ESCALA, '#');
        $patron = '#/\*' . $m . '\*/.*?/\*/' . $m . '\*/#s';
        if ($bloque !== '' && preg_match($patron, $existente) === 1) {
            // Ya hay un bloque: se cambia donde está (no se mueve el resto del CSS).
            return trim((string) preg_replace_callback($patron, static function () use ($bloque): string {
                return $bloque;
            }, $existente, 1));
        }
        $sin = trim((string) preg_replace($patron, '', $existente));
        return trim($sin . ($sin !== '' && $bloque !== '' ? "\n" : '') . $bloque);
    }

    /** Lo que WordPress recuerda del theme.json durante esta petición: se descarta para que el puntero nuevo se vea. */
    public static function limpiar_cache(): void
    {
        if (function_exists('wp_clean_theme_json_cache')) {
            wp_clean_theme_json_cache();
        } elseif (class_exists('WP_Theme_JSON_Resolver')) {
            WP_Theme_JSON_Resolver::clean_cached_data();
        }
    }

    /**
     * Lo que el ADN NO lleva y, por eso, un sitio destino no recibe por el paquete. Se muestra en `cod_adn_get` y lo mide
     * la prueba de portabilidad (scripts/probar-adn-proyeccion.php): si algo de esta lista pasa a viajar, la prueba lo dice
     * y se saca de aquí; si algo del theme.json de Basis no llega y no está aquí, la prueba falla.
     *
     * Hasta el 02-nov-2026 estaban aquí las transparencias, los degradados, las sombras, el gutter, los grosores de borde,
     * los pesos y los interlineados, las medidas de texto, los desenfoques, `custom.form` y los quiebres: el Core los
     * agregó (pedidos Q3 y Q4) y ahora viajan.
     *
     * @return array<string, string> ruta del theme.json -> por qué no viaja
     */
    public static function fuera_del_adn(): array
    {
        return [
            'styles.css (/*cod-estilos-responsivos*/)' => 'la proporción y el alto mínimo de un estilo de bloque por punto de quiebre salen de dim9.req08 + dim9.req09, que el plugin valida y guarda pero aún no emite: qué selector lleva cada propiedad (`img` dentro de `.wp-block-image`, el propio grupo…) es del destino y no está construido. Esas reglas siguen viniendo del tema (styles/blocks/*.json) y de su theme.json',
            'settings.color.palette[].name|settings.typography.fontFamilies[].name' => 'el slug de una variable sale del NOMBRE del color o de la familia (slug(nombre)): un nombre de mostrar que no da su slug («Naranja Basis» -> accent) no puede viajar; es cosmético (el editor), no cambia ningún valor calculado',
            'settings.custom.typography.<rol> (peso, interlineado y espaciado de letra de un rol)' => 'dim2.req02 los exige por rol, pero la web los toma de las escalas con nombre (dim2.req09); emitirlos habría agregado claves a settings.custom que ningún tema declara',
            'styles.* (blocks, elements.button.border|typography, spacing.blockGap…)' => 'el ADN sólo gobierna los colores y las familias de los elementos (styles.color, elements.link|button|heading); el resto de los estilos globales sigue siendo del archivo del tema',
        ];
    }

    /** sincronizado | adelantado | ausente | sin-adn, según el sello del theme.json del tema activo. */
    public static function estado_del_archivo(): string
    {
        $puntero = COD_ADN_Store::puntero();
        if ($puntero === null) {
            return 'sin-adn';
        }
        $archivo = rtrim((string) get_stylesheet_directory(), '/\\') . '/theme.json';
        if (!is_readable($archivo)) {
            return 'ausente';
        }
        $json = json_decode((string) file_get_contents($archivo), true);
        $sello = is_array($json) ? ($json['settings']['custom']['adn']['digest'] ?? null) : null;
        if (!is_string($sello) || $sello === '') {
            return 'ausente';
        }
        return hash_equals($sello, (string) $puntero['digest']) ? 'sincronizado' : 'adelantado';
    }

    /**
     * El theme.json que sale del ADN activo: la base del tema con la proyección encima.
     *
     * @return array{json: string, datos: array<string, mixed>, base: string, digest: string, designId: string, revision: int}|WP_Error
     */
    public static function exportar_theme_json(?string $archivo_base = null)
    {
        $puntero = COD_ADN_Store::puntero();
        if ($puntero === null) {
            return new WP_Error('ADN_NOT_ACTIVE', 'Este sitio no tiene un ADN activo: no hay nada que exportar.');
        }
        $proyeccion = COD_ADN_Store::proyeccion((int) $puntero['revision']);
        if ($proyeccion === null) {
            return new WP_Error('ADN_PROJECTION_MISSING', 'El puntero apunta a una proyección que no está en la base.');
        }
        if ($archivo_base === null) {
            $dir = rtrim((string) get_stylesheet_directory(), '/\\');
            $archivo_base = is_readable($dir . '/theme.base.json') ? $dir . '/theme.base.json' : $dir . '/theme.json';
        }
        $base = is_readable($archivo_base) ? json_decode((string) file_get_contents($archivo_base), true) : null;
        if (!is_array($base)) {
            return new WP_Error('ADN_THEME_BASE', 'No se pudo leer la base del theme.json: ' . $archivo_base);
        }
        $fragmento = is_array($proyeccion['themeJson'] ?? null) ? $proyeccion['themeJson'] : [];
        if (isset($fragmento['styles']['css']) && is_string($fragmento['styles']['css'])) {
            $fragmento['styles']['css'] = self::con_bloque_de_quiebres((string) ($base['styles']['css'] ?? ''), $fragmento['styles']['css']);
        }
        $datos = self::mezclar($base, $fragmento);
        $json = (string) wp_json_encode($datos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION) . "\n";
        return [
            'json' => $json,
            'datos' => $datos,
            'base' => basename($archivo_base),
            'digest' => (string) $puntero['digest'],
            'designId' => (string) $puntero['designId'],
            'revision' => (int) $puntero['revision'],
        ];
    }

    /**
     * Mezcla igual que WordPress para lo que aquí importa: los mapas por clave y las listas, enteras
     * (la lista del ADN reemplaza a la del archivo).
     *
     * @param array<string, mixed> $base
     * @param array<string, mixed> $encima
     * @return array<string, mixed>
     */
    public static function mezclar(array $base, array $encima): array
    {
        foreach ($encima as $clave => $valor) {
            $es_lista = is_array($valor) && $valor !== [] && array_keys($valor) === range(0, count($valor) - 1);
            if (is_array($valor) && !$es_lista && isset($base[$clave]) && is_array($base[$clave]) && !self::es_lista($base[$clave])) {
                $base[$clave] = self::mezclar($base[$clave], $valor);
            } else {
                $base[$clave] = $valor;
            }
        }
        return $base;
    }

    /** @param array<mixed> $a */
    private static function es_lista(array $a): bool
    {
        return $a === [] || array_keys($a) === range(0, count($a) - 1);
    }
}
