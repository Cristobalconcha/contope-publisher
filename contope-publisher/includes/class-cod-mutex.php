<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Exclusión mutua sobre la tabla de opciones, ATÓMICA (hallazgo de la prueba P1.6, 02-nov-2026).
 *
 * POR QUÉ NO `add_option()`. Hasta ahora el bloqueo por documento y el bloqueo exclusivo del ADN
 * se tomaban con `add_option()`, suponiendo que «la segunda inserción de la misma opción falla».
 * No falla. `add_option()` hace DOS cosas separadas:
 *
 *   1. LEE con `get_option()` y, si ya existe, devuelve false (comprobar);
 *   2. si no existía, ejecuta `INSERT ... ON DUPLICATE KEY UPDATE option_value = VALUES(option_value)`
 *      (escribir), que cuando la fila ya está LA SOBRESCRIBE y devuelve «éxito».
 *
 * Entre (1) y (2) hay una ventana: dos procesos que leen «no existe» a la vez pasan los dos, el
 * segundo `INSERT` pisa el valor del primero y los dos creen tener el bloqueo. Con dos escrituras
 * crudas con la misma revisión base eso dejaba dos éxitos y una actualización perdida (se vio en
 * ~2 de cada 10 corridas de scripts/probar-adn-concurrencia.php; reproducido de forma determinista
 * con el gancho `add_option`, que se dispara justo en esa ventana).
 *
 * LO QUE HACE ESTA CLASE.
 *
 *   - La toma es UNA sola sentencia, `INSERT IGNORE`: la clave única `option_name` decide quién
 *     gana, no PHP.
 *   - Para saber si ganó ESTE proceso se vuelve a leer la fila y se compara con el valor propio
 *     (cada toma lleva un token único). NO se confía en el número de filas afectadas: el motor
 *     SQLite de los otros locales lo informa mal en las sentencias que no cambian nada (medido: un
 *     INSERT IGNORE ignorado y un DELETE sin coincidencia devolvían 1).
 *   - Soltar y quitar un bloqueo vencido son `DELETE ... WHERE option_name = x AND option_value = <el
 *     valor que yo vi>`: sólo borra si la fila sigue siendo exactamente esa, así que nadie le quita
 *     a otro un bloqueo recién tomado.
 *   - Funciona igual en MySQL/MariaDB y en SQLite (que traduce `INSERT IGNORE` a `INSERT OR IGNORE`).
 *
 * Todo va DIRECTO a la tabla de opciones y después se limpia la caché de objetos de ESTE proceso
 * (`get_option()` podría devolver un valor ya viejo, o la marca «no existe»).
 */
final class COD_Mutex
{
    /**
     * Intenta tomar la opción. Una sola sentencia, atómica.
     *
     * @param string $valor DEBE ser único por toma (lleva un token): es lo que prueba quién ganó
     * @return bool true si ESTE proceso la creó; false si ya existía (de quien sea)
     */
    public static function tomar(string $opcion, string $valor): bool
    {
        global $wpdb;
        // Gancho para las pruebas de concurrencia (P1.6): se dispara justo ANTES de la única
        // sentencia que decide quién gana.
        do_action('cod_mutex_punto', 'antes-de-insertar', $opcion);
        $wpdb->query($wpdb->prepare(
            "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'no')",
            $opcion,
            $valor
        ));
        self::olvidar($opcion);
        return self::leer($opcion) === $valor;
    }

    /**
     * Como tomar(), pero si lo que hay venció (JSON con `expiresAt` en el pasado) lo quita y
     * reintenta UNA vez. Quitarlo es condicional al valor visto: de dos procesos que ven el mismo
     * bloqueo vencido, sólo uno lo borra; el otro no borra nada y pierde ante la clave única.
     */
    public static function tomar_o_recuperar_vencido(string $opcion, string $valor): bool
    {
        if (self::tomar($opcion, $valor)) {
            return true;
        }
        $visto = self::leer($opcion);
        if ($visto === null) {
            // Se soltó entre una sentencia y otra: un último intento.
            return self::tomar($opcion, $valor);
        }
        $dato = json_decode($visto, true);
        if (!is_array($dato) || !isset($dato['expiresAt']) || (int) $dato['expiresAt'] >= time()) {
            return false;
        }
        self::soltar($opcion, $visto);
        return self::tomar($opcion, $valor);
    }

    /**
     * Suelta SÓLO si la fila sigue teniendo exactamente $valor (el que escribió quien la tomó).
     * Si venció y otro la tomó, no se le quita.
     */
    public static function soltar(string $opcion, string $valor): void
    {
        global $wpdb;
        $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s",
            $opcion,
            $valor
        ));
        self::olvidar($opcion);
    }

    /** @return string|null el valor crudo que hay AHORA en la base, o null si no hay fila */
    public static function leer(string $opcion): ?string
    {
        global $wpdb;
        $crudo = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $opcion));
        return is_string($crudo) ? $crudo : null;
    }

    private static function olvidar(string $opcion): void
    {
        wp_cache_delete($opcion, 'options');
        wp_cache_delete('notoptions', 'options');
    }
}
