<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * La clave de Mapbox del sitio, para el mapa grande de la conducta «mapa».
 *
 * Se configura en Configuración → «Mapa (Mapbox)», no dentro de la composición
 * de cada página: si mañana la clave cambia (se renueva, se restringe a otro
 * dominio, se cambia de cuenta), quien mantiene el sitio entra al panel, la
 * cambia y guarda, sin recomponer ninguna página que tenga un mapa. Es el mismo
 * criterio que las cuentas de redes sociales (ver COD_Redes_Sociales).
 *
 * Qué clave se acepta, y por qué es tan estricto: la clave viaja en el HTML que
 * ve cualquiera, así que sólo puede ser una clave PÚBLICA de Mapbox (empieza con
 * «pk.»). Las secretas («sk.») dan acceso de escritura a la cuenta y nunca deben
 * llegar a una página; si alguien pega una por error, se rechaza nombrando la
 * razón en vez de publicarla.
 *
 * La resolución ocurre al MOSTRAR la página (ver resolver_en_html), no al
 * compilarla: el HTML guardado no lleva la clave, y lo que cambie en el panel
 * llega a todas las páginas.
 *
 * Qué NO hace falta de la clave: el mini mapa. Es una imagen del propio sitio
 * (se genera una vez con scripts/generar-mini-mapa.mjs), así que se ve sin clave,
 * sin JavaScript y sin pedirle nada a un tercero. La clave sólo abre el mapa
 * grande, que es cuando de verdad se necesita Mapbox.
 */
final class COD_Mapa
{
    public const OPTION_KEY = 'cod_mapbox_token';
    public const CAPABILITY = 'manage_options';
    /** Atributo con el que el compilador marca la raíz de un mapa. */
    public const MARCA = 'data-cod-behavior="mapa"';
    /** Atributo que se pone al mostrar la página cuando HAY clave. */
    public const ATRIBUTO_CLAVE = 'data-cod-mapa-token';
    /** Atributo que se pone al mostrar la página cuando NO hay clave (el runtime no monta nada). */
    public const ATRIBUTO_SIN_CLAVE = 'data-cod-mapa-sin-clave';

    public function register(): void
    {
        add_action('admin_post_cod_save_mapbox', [$this, 'guardar']);
    }

    /**
     * ¿Es esto una clave pública de Mapbox? Devuelve la misma cadena si vale, o un
     * WP_Error con el motivo (que se muestra tal cual en el panel).
     *
     * Forma: «pk.» + dos tramos de letras, números, guion y guion bajo separados
     * por un punto (la carga y la firma). No se aceptan espacios ni caracteres
     * invisibles: se copian a mano y un salto de línea pegado de más es lo más común.
     *
     * @param mixed $valor
     * @return string|WP_Error
     */
    public static function clave_valida($valor)
    {
        if (!is_string($valor)) {
            return new WP_Error('cod_mapa_clave_invalida', 'La clave debe ser texto.');
        }
        if (preg_match('/^(sk|tk)\./', $valor) === 1) {
            return new WP_Error('cod_mapa_clave_secreta', 'Esa clave es secreta (empieza con ' . substr($valor, 0, 3) . '): daría acceso a la cuenta a cualquiera que mire el código de la página. Usa una clave pública, la que empieza con «pk.».');
        }
        if (preg_match('/^pk\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/D', $valor) !== 1 || strlen($valor) > 400) {
            return new WP_Error('cod_mapa_clave_invalida', 'La clave pública de Mapbox empieza con «pk.» y no lleva espacios ni saltos de línea. Revisa que esté copiada completa.');
        }

        return $valor;
    }

    /**
     * La clave configurada, ya comprobada, o null si no hay (o no es válida). Se
     * vuelve a validar al leerla, no sólo al guardarla: la opción vive en la base
     * de datos y puede haberse escrito por otra vía.
     */
    public static function clave(): ?string
    {
        $guardada = get_option(self::OPTION_KEY, '');
        if (!is_string($guardada) || $guardada === '' || is_wp_error(self::clave_valida($guardada))) {
            return null;
        }

        return $guardada;
    }

    /**
     * Valida lo que llegó del formulario sin tocar la base de datos (para poder
     * comprobarlo sin simular una petición de administración).
     *
     * Vacío cierra el mapa grande (se borra la clave). Una clave que no pasa NO se
     * guarda y se conserva la que había: aceptarla a medias dejaría un mapa que
     * falla en silencio justo cuando alguien lo pincha.
     *
     * @param mixed $crudo
     * @return array{0: string, 1: string} La clave a guardar y el motivo del rechazo ('' si no hubo).
     */
    public static function procesar_envio($crudo, string $previa): array
    {
        $limpia = is_string($crudo) ? (string) preg_replace('/^[ \t\r\n\x{00A0}]+|[ \t\r\n\x{00A0}]+$/u', '', $crudo) : '';
        if ($limpia === '') {
            return ['', ''];
        }
        $valida = self::clave_valida($limpia);
        if (is_wp_error($valida)) {
            return [$previa, $valida->get_error_message()];
        }

        return [$valida, ''];
    }

    public function guardar(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar la configuración.', 'contope-publisher'));
        }
        check_admin_referer('cod_save_mapbox');

        $previa = get_option(self::OPTION_KEY, '');
        [$clave, $error] = self::procesar_envio(wp_unslash($_POST['cod_mapbox_token'] ?? ''), is_string($previa) ? $previa : '');
        update_option(self::OPTION_KEY, $clave, false);

        $destino = add_query_arg('cod_mapbox_guardada', '1', admin_url('admin.php?page=' . COD_Settings_Admin::PAGE_SLUG));
        if ($error !== '') {
            // El motivo viaja por la dirección porque el redireccionamiento no deja
            // otro sitio; sólo se muestra escapado y nunca contiene la clave pegada.
            $destino = add_query_arg('cod_mapbox_error', rawurlencode($error), $destino);
        }
        wp_safe_redirect($destino . '#cod-mapa');
        exit;
    }

    /**
     * Una coordenada o un zoom como texto: hasta 8 decimales (un milímetro de
     * terreno) y sin ceros de sobra. (string) del número usa 14 cifras en total y
     * redondea una coordenada de siete dígitos enteros antes de lo debido.
     */
    public static function numero(float $valor): string
    {
        $texto = rtrim(rtrim(number_format($valor, 8, '.', ''), '0'), '.');

        return $texto === '' || $texto === '-0' ? '0' : $texto;
    }

    /**
     * El enlace a «cómo llegar»: OpenStreetMap, que no pide clave. Es lo que ve
     * quien no tiene JavaScript, quien no tiene clave configurada en el sitio, y
     * quien abre el mapa grande cuando Mapbox no llega.
     */
    public static function url_como_llegar(float $lat, float $lng, float $zoom): string
    {
        $lat = rtrim(rtrim(number_format($lat, 6, '.', ''), '0'), '.');
        $lng = rtrim(rtrim(number_format($lng, 6, '.', ''), '0'), '.');
        $lat = $lat === '-0' ? '0' : $lat;
        $lng = $lng === '-0' ? '0' : $lng;
        $z = (string) (int) round($zoom);

        return 'https://www.openstreetmap.org/?mlat=' . $lat . '&mlon=' . $lng . '#map=' . $z . '/' . $lat . '/' . $lng;
    }

    /**
     * Pone en el HTML que se va a mostrar la clave que HAY AHORA en el panel.
     *
     * El compilador deja la raíz de cada mapa marcada con
     * data-cod-behavior="mapa". Aquí, al mostrar la página (cabecera, cuerpo y pie
     * ya ensamblados):
     *   - con clave: se le agrega data-cod-mapa-token="pk.…" y el runtime sabe que
     *     puede ofrecer el mapa grande;
     *   - sin clave: se cambia data-cod-behavior="mapa" por data-cod-mapa-sin-clave="1".
     *     El runtime no monta nada y el mini queda como lo que es sin guion: un
     *     enlace a «cómo llegar». Nada de un botón que no abre nada.
     * Idempotente: pasarlo dos veces da lo mismo.
     */
    public static function resolver_en_html(string $html): string
    {
        if (strpos($html, self::MARCA) === false && strpos($html, self::ATRIBUTO_CLAVE) === false) {
            return $html;
        }
        $clave = self::clave();
        $resultado = preg_replace_callback(
            '#<[a-z][a-z0-9]*\b[^>]*\sdata-cod-behavior="mapa"[^>]*>#i',
            static function (array $m) use ($clave): string {
                $etiqueta = (string) preg_replace('/\s' . preg_quote(self::ATRIBUTO_CLAVE, '/') . '="[^"]*"|\s' . preg_quote(self::ATRIBUTO_SIN_CLAVE, '/') . '="[^"]*"/', '', $m[0]);
                if ($clave === null) {
                    return str_replace(self::MARCA, self::ATRIBUTO_SIN_CLAVE . '="1"', $etiqueta);
                }
                return str_replace(self::MARCA, self::MARCA . ' ' . self::ATRIBUTO_CLAVE . '="' . esc_attr($clave) . '"', $etiqueta);
            },
            $html
        );

        return $resultado ?? $html;
    }
}
