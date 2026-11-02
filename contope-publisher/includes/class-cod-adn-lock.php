<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * El bloqueo global de diseño (ESPEC 3.3, hallazgo H5 de la auditoría del 01-nov-2026).
 *
 * POR QUÉ. Hasta ahora el único bloqueo era POR DOCUMENTO (COD_Canvas_Document_Repository::
 * acquire_document_lock). Con un ADN activo hay una carrera real: el compilador valida contra
 * la revisión r2, entra el import de r3 y el `apply` guarda lo validado contra r2. El import
 * cambia lo que TODOS los documentos pueden referenciar, así que no puede convivir con una
 * escritura de documento en curso, ni al revés.
 *
 * SEMÁNTICA LECTOR/ESCRITOR, sobre el mismo mutex de `add_option` que ya usa el repositorio
 * (atómico: la segunda inserción de la misma opción falla):
 *
 *   - el IMPORT toma el bloqueo EXCLUSIVO (`cod_adn_lock_x`);
 *   - CADA ESCRITURA DE DOCUMENTO toma uno COMPARTIDO (`cod_adn_lock_s_<token>`, uno por
 *     escritura, así que varias conviven).
 *
 * Es el protocolo de dos banderas: quien escribe levanta SU bandera y después mira la del
 * otro. Si los dos las levantan a la vez, los dos ven la del otro y los dos fallan con
 * ADN_BUSY (nadie queda dentro por error). Lo que no puede pasar es que los dos entren.
 *
 * Todas las lecturas van DIRECTO a la tabla de opciones: `get_option()` puede devolver un
 * valor guardado en la caché de objetos de ESTE proceso mientras otro proceso ya lo cambió.
 *
 * Los bloqueos vencen solos (TTL): un proceso que muere no deja el sitio bloqueado.
 *
 * SIN ADN, NADA CAMBIA. Mientras no exista el puntero `cod_adn_activa` ni un import en
 * curso, `compartido_si_hace_falta()` no toca la base. Santa Luisa y Econut no escriben una
 * sola opción nueva por guardar un documento.
 */
final class COD_ADN_Lock
{
    public const OPCION_EXCLUSIVO = 'cod_adn_lock_x';
    public const PREFIJO_COMPARTIDO = 'cod_adn_lock_s_';
    public const TTL_COMPARTIDO = 30;
    public const TTL_EXCLUSIVO = 60;

    /**
     * @return array<string, mixed>|null el contenido vivo del bloqueo exclusivo, o null si no hay (o venció)
     */
    private static function exclusivo_vivo(): ?array
    {
        global $wpdb;
        $crudo = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", self::OPCION_EXCLUSIVO));
        if (!is_string($crudo) || $crudo === '') {
            return null;
        }
        $dato = json_decode($crudo, true);
        if (!is_array($dato) || (int) ($dato['expiresAt'] ?? 0) < time()) {
            return null;
        }
        return $dato;
    }

    /** @return int cuántas escrituras de documento tienen el bloqueo compartido y vigente */
    private static function compartidos_vivos(bool $limpiar_vencidos = true): int
    {
        global $wpdb;
        // Sin escapar el guion bajo: el motor SQLite del local no siempre entiende ESCAPE. El comodín
        // de una letra sólo ensancha la búsqueda y el prefijo exacto se vuelve a exigir en PHP.
        $filas = $wpdb->get_results("SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE 'cod_adn_lock_s_%'", ARRAY_A);
        $vivos = 0;
        foreach ((array) $filas as $fila) {
            if (strpos((string) $fila['option_name'], self::PREFIJO_COMPARTIDO) !== 0) {
                continue;
            }
            $dato = json_decode((string) $fila['option_value'], true);
            if (is_array($dato) && (int) ($dato['expiresAt'] ?? 0) >= time()) {
                ++$vivos;
            } elseif ($limpiar_vencidos) {
                delete_option((string) $fila['option_name']);
            }
        }
        return $vivos;
    }

    private static function ocupado(string $mensaje, string $quien): WP_Error
    {
        $error = new WP_Error('ADN_BUSY', $mensaje);
        $error->add_data(['retryAfterSeconds' => self::TTL_COMPARTIDO, 'bloqueadoPor' => $quien]);
        return $error;
    }

    /** ¿Hay algo que proteger? Hay puntero, o hay un import en curso. */
    public static function hace_falta(): bool
    {
        global $wpdb;
        $hay_puntero = $wpdb->get_var($wpdb->prepare("SELECT 1 FROM {$wpdb->options} WHERE option_name = %s", COD_ADN_Store::OPCION_PUNTERO));
        return $hay_puntero !== null || self::exclusivo_vivo() !== null;
    }

    /**
     * Bloqueo compartido de una escritura de documento.
     *
     * @return array{option: string}|WP_Error|null null = no hacía falta (no hay ADN ni import)
     */
    public static function compartido_si_hace_falta()
    {
        if (!self::hace_falta()) {
            return null;
        }
        return self::compartido();
    }

    /** @return array{option: string}|WP_Error */
    public static function compartido()
    {
        $opcion = self::PREFIJO_COMPARTIDO . wp_generate_uuid4();
        $valor = wp_json_encode(['expiresAt' => time() + self::TTL_COMPARTIDO]);
        if (!is_string($valor) || !add_option($opcion, $valor, '', false)) {
            return self::ocupado('No fue posible tomar el bloqueo de diseño para esta escritura.', 'bloqueo');
        }
        // Bandera levantada; ahora, la del otro.
        if (self::exclusivo_vivo() !== null) {
            delete_option($opcion);
            return self::ocupado('Hay un import del ADN en curso: el diseño está cambiando. Reintenta en unos segundos.', 'import');
        }
        return ['option' => $opcion];
    }

    /** @param array{option: string}|WP_Error|null $bloqueo */
    public static function soltar_compartido($bloqueo): void
    {
        if (is_array($bloqueo) && isset($bloqueo['option'])) {
            delete_option($bloqueo['option']);
        }
    }

    /** @return array{option: string, token: string}|WP_Error */
    public static function exclusivo()
    {
        $token = wp_generate_uuid4();
        $valor = wp_json_encode(['token' => $token, 'expiresAt' => time() + self::TTL_EXCLUSIVO]);
        if (!is_string($valor)) {
            return self::ocupado('No fue posible preparar el bloqueo de diseño.', 'bloqueo');
        }
        if (!add_option(self::OPCION_EXCLUSIVO, $valor, '', false)) {
            if (self::exclusivo_vivo() !== null) {
                return self::ocupado('Otro import del ADN está en curso.', 'import');
            }
            // Venció: se limpia y se reintenta una sola vez.
            delete_option(self::OPCION_EXCLUSIVO);
            if (!add_option(self::OPCION_EXCLUSIVO, $valor, '', false)) {
                return self::ocupado('Otro import del ADN está en curso.', 'import');
            }
        }
        // Bandera levantada; ahora, las de las escrituras de documento.
        if (self::compartidos_vivos() > 0) {
            delete_option(self::OPCION_EXCLUSIVO);
            return self::ocupado('Hay una escritura de documento en curso. Reintenta el import en unos segundos.', 'escritura');
        }
        return ['option' => self::OPCION_EXCLUSIVO, 'token' => $token];
    }

    /** @param array{option: string, token: string}|WP_Error|null $bloqueo */
    public static function soltar_exclusivo($bloqueo): void
    {
        global $wpdb;
        if (!is_array($bloqueo) || !isset($bloqueo['token'])) {
            return;
        }
        $crudo = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", self::OPCION_EXCLUSIVO));
        $dato = is_string($crudo) ? json_decode($crudo, true) : null;
        // Sólo se suelta lo propio: si venció y otro lo tomó, no se le quita.
        if (is_array($dato) && ($dato['token'] ?? '') === $bloqueo['token']) {
            delete_option(self::OPCION_EXCLUSIVO);
        }
    }
}
