<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Las cuentas oficiales de redes sociales del sitio.
 *
 * Se configuran en Configuración → «Redes sociales», no dentro de la
 * composición de cada página: las cuentas las administra otra gente (el equipo
 * de redes de la empresa) y cambian —una se consolida, otra se verifica, otra se
 * cierra—, y quien mantiene el sitio tiene que poder entrar al panel, cambiar la
 * dirección y guardar sin recomponer ninguna página.
 *
 * Aquí vive también la REGLA que decide si una dirección o un nombre de usuario
 * son aceptables: la usan el panel al guardar, el compilador de composiciones
 * al leer un nodo `social` con `url` propia y la lectura de lo guardado antes de
 * dibujar. Una regla de seguridad copiada en dos sitios termina divergiendo, y
 * la divergencia es justo el hueco por el que se cuela una cuenta falsa.
 *
 * La resolución ocurre al MOSTRAR la página (ver resolver_en_html), no al
 * compilarla: el HTML guardado de una página lleva la cuenta que había en ese
 * momento, y si se dejara así, cambiar la dirección en el panel no cambiaría
 * nada hasta recomponer.
 */
final class COD_Redes_Sociales
{
    public const OPTION_KEY = 'cod_redes_sociales';
    public const CAPABILITY = 'manage_options';
    /** Atributo con el que el compilador marca un enlace cuya cuenta sale del panel. */
    public const MARCA_PANEL = 'data-cod-social-panel';

    /**
     * Redes que admite la primitiva `social`: lista blanca cerrada. Cada una
     * lleva su nombre legible, los dominios a los que puede apuntar su enlace y
     * la silueta del logotipo (una sola ruta, monocroma, sin alterar).
     *
     * Las siluetas son las del bloque «Enlaces a redes sociales» del núcleo de
     * WordPress (wp-includes/blocks/social-link.php, GPL-2.0-or-later), copiadas
     * tal cual. Los logotipos son marcas registradas de sus dueños; aquí sólo se
     * usan para señalar la cuenta oficial de quien las pone en su propio sitio.
     *
     * @var array<string, array{name: string, hosts: array<int, string>, viewBox: string, path: string}>
     */
    public const REDES = [
        'instagram' => [
            'name' => 'Instagram',
            'hosts' => ['instagram.com', 'instagr.am'],
            'viewBox' => '0 0 24 24',
            'path' => 'M12,4.622c2.403,0,2.688,0.009,3.637,0.052c0.877,0.04,1.354,0.187,1.671,0.31c0.42,0.163,0.72,0.358,1.035,0.673 c0.315,0.315,0.51,0.615,0.673,1.035c0.123,0.317,0.27,0.794,0.31,1.671c0.043,0.949,0.052,1.234,0.052,3.637 s-0.009,2.688-0.052,3.637c-0.04,0.877-0.187,1.354-0.31,1.671c-0.163,0.42-0.358,0.72-0.673,1.035 c-0.315,0.315-0.615,0.51-1.035,0.673c-0.317,0.123-0.794,0.27-1.671,0.31c-0.949,0.043-1.233,0.052-3.637,0.052 s-2.688-0.009-3.637-0.052c-0.877-0.04-1.354-0.187-1.671-0.31c-0.42-0.163-0.72-0.358-1.035-0.673 c-0.315-0.315-0.51-0.615-0.673-1.035c-0.123-0.317-0.27-0.794-0.31-1.671C4.631,14.688,4.622,14.403,4.622,12 s0.009-2.688,0.052-3.637c0.04-0.877,0.187-1.354,0.31-1.671c0.163-0.42,0.358-0.72,0.673-1.035 c0.315-0.315,0.615-0.51,1.035-0.673c0.317-0.123,0.794-0.27,1.671-0.31C9.312,4.631,9.597,4.622,12,4.622 M12,3 C9.556,3,9.249,3.01,8.289,3.054C7.331,3.098,6.677,3.25,6.105,3.472C5.513,3.702,5.011,4.01,4.511,4.511 c-0.5,0.5-0.808,1.002-1.038,1.594C3.25,6.677,3.098,7.331,3.054,8.289C3.01,9.249,3,9.556,3,12c0,2.444,0.01,2.751,0.054,3.711 c0.044,0.958,0.196,1.612,0.418,2.185c0.23,0.592,0.538,1.094,1.038,1.594c0.5,0.5,1.002,0.808,1.594,1.038 c0.572,0.222,1.227,0.375,2.185,0.418C9.249,20.99,9.556,21,12,21s2.751-0.01,3.711-0.054c0.958-0.044,1.612-0.196,2.185-0.418 c0.592-0.23,1.094-0.538,1.594-1.038c0.5-0.5,0.808-1.002,1.038-1.594c0.222-0.572,0.375-1.227,0.418-2.185 C20.99,14.751,21,14.444,21,12s-0.01-2.751-0.054-3.711c-0.044-0.958-0.196-1.612-0.418-2.185c-0.23-0.592-0.538-1.094-1.038-1.594 c-0.5-0.5-1.002-0.808-1.594-1.038c-0.572-0.222-1.227-0.375-2.185-0.418C14.751,3.01,14.444,3,12,3L12,3z M12,7.378 c-2.552,0-4.622,2.069-4.622,4.622S9.448,16.622,12,16.622s4.622-2.069,4.622-4.622S14.552,7.378,12,7.378z M12,15 c-1.657,0-3-1.343-3-3s1.343-3,3-3s3,1.343,3,3S13.657,15,12,15z M16.804,6.116c-0.596,0-1.08,0.484-1.08,1.08 s0.484,1.08,1.08,1.08c0.596,0,1.08-0.484,1.08-1.08S17.401,6.116,16.804,6.116z',
        ],
        'facebook' => [
            'name' => 'Facebook',
            'hosts' => ['facebook.com', 'fb.com', 'fb.me'],
            'viewBox' => '0 0 24 24',
            'path' => 'M12 2C6.5 2 2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7C18.3 21.1 22 17 22 12c0-5.5-4.5-10-10-10z',
        ],
        'linkedin' => [
            'name' => 'LinkedIn',
            'hosts' => ['linkedin.com', 'lnkd.in'],
            'viewBox' => '0 0 24 24',
            'path' => 'M19.7,3H4.3C3.582,3,3,3.582,3,4.3v15.4C3,20.418,3.582,21,4.3,21h15.4c0.718,0,1.3-0.582,1.3-1.3V4.3 C21,3.582,20.418,3,19.7,3z M8.339,18.338H5.667v-8.59h2.672V18.338z M7.004,8.574c-0.857,0-1.549-0.694-1.549-1.548 c0-0.855,0.691-1.548,1.549-1.548c0.854,0,1.547,0.694,1.547,1.548C8.551,7.881,7.858,8.574,7.004,8.574z M18.339,18.338h-2.669 v-4.177c0-0.996-0.017-2.278-1.387-2.278c-1.389,0-1.601,1.086-1.601,2.206v4.249h-2.667v-8.59h2.559v1.174h0.037 c0.356-0.675,1.227-1.387,2.526-1.387c2.703,0,3.203,1.779,3.203,4.092V18.338z',
        ],
        'youtube' => [
            'name' => 'YouTube',
            'hosts' => ['youtube.com', 'youtu.be'],
            'viewBox' => '0 0 24 24',
            'path' => 'M21.8,8.001c0,0-0.195-1.378-0.795-1.985c-0.76-0.797-1.613-0.801-2.004-0.847c-2.799-0.202-6.997-0.202-6.997-0.202 h-0.009c0,0-4.198,0-6.997,0.202C4.608,5.216,3.756,5.22,2.995,6.016C2.395,6.623,2.2,8.001,2.2,8.001S2,9.62,2,11.238v1.517 c0,1.618,0.2,3.237,0.2,3.237s0.195,1.378,0.795,1.985c0.761,0.797,1.76,0.771,2.205,0.855c1.6,0.153,6.8,0.201,6.8,0.201 s4.203-0.006,7.001-0.209c0.391-0.047,1.243-0.051,2.004-0.847c0.6-0.607,0.795-1.985,0.795-1.985s0.2-1.618,0.2-3.237v-1.517 C22,9.62,21.8,8.001,21.8,8.001z M9.935,14.594l-0.001-5.62l5.404,2.82L9.935,14.594z',
        ],
        'tiktok' => [
            'name' => 'TikTok',
            'hosts' => ['tiktok.com'],
            'viewBox' => '0 0 32 32',
            'path' => 'M16.708 0.027c1.745-0.027 3.48-0.011 5.213-0.027 0.105 2.041 0.839 4.12 2.333 5.563 1.491 1.479 3.6 2.156 5.652 2.385v5.369c-1.923-0.063-3.855-0.463-5.6-1.291-0.76-0.344-1.468-0.787-2.161-1.24-0.009 3.896 0.016 7.787-0.025 11.667-0.104 1.864-0.719 3.719-1.803 5.255-1.744 2.557-4.771 4.224-7.88 4.276-1.907 0.109-3.812-0.411-5.437-1.369-2.693-1.588-4.588-4.495-4.864-7.615-0.032-0.667-0.043-1.333-0.016-1.984 0.24-2.537 1.495-4.964 3.443-6.615 2.208-1.923 5.301-2.839 8.197-2.297 0.027 1.975-0.052 3.948-0.052 5.923-1.323-0.428-2.869-0.308-4.025 0.495-0.844 0.547-1.485 1.385-1.819 2.333-0.276 0.676-0.197 1.427-0.181 2.145 0.317 2.188 2.421 4.027 4.667 3.828 1.489-0.016 2.916-0.88 3.692-2.145 0.251-0.443 0.532-0.896 0.547-1.417 0.131-2.385 0.079-4.76 0.095-7.145 0.011-5.375-0.016-10.735 0.025-16.093z',
        ],
        'x' => [
            'name' => 'X',
            'hosts' => ['x.com', 'twitter.com'],
            'viewBox' => '0 0 24 24',
            'path' => 'M13.982 10.622 20.54 3h-1.554l-5.693 6.618L8.745 3H3.5l6.876 10.007L3.5 21h1.554l6.012-6.989L15.868 21h5.245l-7.131-10.378Zm-2.128 2.474-.697-.997-5.543-7.93H8l4.474 6.4.697.996 5.815 8.318h-2.387l-4.745-6.787Z',
        ],
        'threads' => [
            'name' => 'Threads',
            'hosts' => ['threads.net', 'threads.com'],
            'viewBox' => '0 0 24 24',
            'path' => 'M16.3 11.3c-.1 0-.2-.1-.2-.1-.1-2.6-1.5-4-3.9-4-1.4 0-2.6.6-3.3 1.7l1.3.9c.5-.8 1.4-1 2-1 .8 0 1.4.2 1.7.7.3.3.5.8.5 1.3-.7-.1-1.4-.2-2.2-.1-2.2.1-3.7 1.4-3.6 3.2 0 .9.5 1.7 1.3 2.2.7.4 1.5.6 2.4.6 1.2-.1 2.1-.5 2.7-1.3.5-.6.8-1.4.9-2.4.6.3 1 .8 1.2 1.3.4.9.4 2.4-.8 3.6-1.1 1.1-2.3 1.5-4.3 1.5-2.1 0-3.8-.7-4.8-2S5.7 14.3 5.7 12c0-2.3.5-4.1 1.5-5.4 1.1-1.3 2.7-2 4.8-2 2.2 0 3.8.7 4.9 2 .5.7.9 1.5 1.2 2.5l1.5-.4c-.3-1.2-.8-2.2-1.5-3.1-1.3-1.7-3.3-2.6-6-2.6-2.6 0-4.7.9-6 2.6C4.9 7.2 4.3 9.3 4.3 12s.6 4.8 1.9 6.4c1.4 1.7 3.4 2.6 6 2.6 2.3 0 4-.6 5.3-2 1.8-1.8 1.7-4 1.1-5.4-.4-.9-1.2-1.7-2.3-2.3zm-4 3.8c-1 .1-2-.4-2-1.3 0-.7.5-1.5 2.1-1.6h.5c.6 0 1.1.1 1.6.2-.2 2.3-1.3 2.7-2.2 2.7z',
        ],
        'pinterest' => [
            'name' => 'Pinterest',
            'hosts' => ['pinterest.com', 'pin.it'],
            'viewBox' => '0 0 24 24',
            'path' => 'M12.289,2C6.617,2,3.606,5.648,3.606,9.622c0,1.846,1.025,4.146,2.666,4.878c0.25,0.111,0.381,0.063,0.439-0.169 c0.044-0.175,0.267-1.029,0.365-1.428c0.032-0.128,0.017-0.237-0.091-0.362C6.445,11.911,6.01,10.75,6.01,9.668 c0-2.777,2.194-5.464,5.933-5.464c3.23,0,5.49,2.108,5.49,5.122c0,3.407-1.794,5.768-4.13,5.768c-1.291,0-2.257-1.021-1.948-2.277 c0.372-1.495,1.089-3.112,1.089-4.191c0-0.967-0.542-1.775-1.663-1.775c-1.319,0-2.379,1.309-2.379,3.059 c0,1.115,0.394,1.869,0.394,1.869s-1.302,5.279-1.54,6.261c-0.405,1.666,0.053,4.368,0.094,4.604 c0.021,0.126,0.167,0.169,0.25,0.063c0.129-0.165,1.699-2.419,2.142-4.051c0.158-0.59,0.817-2.995,0.817-2.995 c0.43,0.784,1.681,1.446,3.013,1.446c3.963,0,6.822-3.494,6.822-7.833C20.394,5.112,16.849,2,12.289,2',
        ],
    ];

    public function register(): void
    {
        add_action('admin_post_cod_save_redes_sociales', [$this, 'guardar']);
    }

    /**
     * ¿Es esta dirección aceptable como cuenta de esa red? Devuelve la misma
     * cadena si vale, o un WP_Error con el motivo.
     *
     * No se acepta por buena fe: tiene que ser https y su dominio tiene que ser
     * uno de los de la red declarada. Un enlace rotulado «Instagram» que lleva a
     * otro sitio es justo la suplantación que esta primitiva existe para
     * desenmascarar. Sin usuario antes de la arroba (instagram.com@otro.sitio),
     * sin puerto, y sin ningún carácter de control ni invisible.
     *
     * @param mixed $url
     * @return string|WP_Error
     */
    public static function url_valida(string $red, $url)
    {
        if (!isset(self::REDES[$red])) {
            return new WP_Error('cod_social_red_invalida', 'La red «' . self::mostrable($red) . '» no está disponible. Redes admitidas: ' . self::nombres_de_claves() . '.');
        }
        $spec = self::REDES[$red];
        $parts = is_string($url) && strlen($url) <= 500 && preg_match('/[\s\p{C}\'"<>{};()\\\\]/u', $url) === 0
            ? wp_parse_url($url)
            : false;
        if (!is_array($parts) || strtolower((string) ($parts['scheme'] ?? '')) !== 'https' || empty($parts['host'])
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
            return new WP_Error('cod_social_url_invalida', 'url debe ser una dirección https:// de la cuenta (sin usuario, sin puerto, sin javascript: ni data:).');
        }
        $host = strtolower((string) $parts['host']);
        foreach ($spec['hosts'] as $domain) {
            if ($host === $domain || substr($host, -strlen($domain) - 1) === '.' . $domain) {
                return $url;
            }
        }

        return new WP_Error('cod_social_url_invalida', 'La url apunta a «' . preg_replace('/[^a-z0-9.-]/', '?', $host) . '», que no es un dominio de ' . $spec['name'] . ' (' . implode(', ', $spec['hosts']) . ').');
    }

    /**
     * ¿Es este nombre de usuario aceptable? Es texto que alguien va a comparar
     * letra por letra con la cuenta que le escribió, así que no admite HTML, ni
     * espacios de ancho cero, ni marcas de escritura inversa (con las que una
     * cuenta falsa imita a la verdadera), ni espacios en los extremos.
     *
     * @param mixed $handle
     * @return string|WP_Error
     */
    public static function handle_valido($handle)
    {
        if (!is_string($handle) || preg_match('/^[\p{L}\p{N}@._\/ -]{1,80}$/u', $handle) !== 1 || trim($handle) !== $handle) {
            return new WP_Error('cod_social_handle_invalido', 'handle debe ser texto de hasta 80 caracteres: letras, números y @ . _ - / (sin caracteres invisibles ni espacios en los extremos).');
        }

        return $handle;
    }

    /** Nombre accesible por omisión del enlace: «Instagram de @usuario» o «Instagram». */
    public static function etiqueta_por_defecto(string $red, string $handle): string
    {
        return self::REDES[$red]['name'] . ($handle !== '' ? ' de ' . $handle : '');
    }

    /** Las claves de las redes admitidas, separadas por coma, para los mensajes de error. */
    public static function nombres_de_claves(): string
    {
        return implode(', ', array_keys(self::REDES));
    }

    /** Un valor que viene de afuera, sin marcado y acotado, para mostrarlo en un mensaje. */
    public static function mostrable(string $texto): string
    {
        $corto = function_exists('mb_substr') ? mb_substr($texto, 0, 40) : substr($texto, 0, 40);

        return (string) preg_replace('/[^\p{L}\p{N} ._-]/u', '?', $corto);
    }

    /**
     * Las cuentas configuradas en el panel, ya comprobadas. Se vuelven a validar
     * al leerlas, no sólo al guardarlas: la opción vive en la base de datos y
     * puede haberse escrito por otra vía. Una dirección que no pasa no se dibuja;
     * un nombre de usuario que no pasa se omite y la dirección se conserva.
     *
     * @return array<string, array{url: string, handle: string}>
     */
    public static function cuentas(): array
    {
        $guardado = get_option(self::OPTION_KEY, []);
        if (!is_array($guardado)) {
            return [];
        }
        $cuentas = [];
        foreach (array_keys(self::REDES) as $red) {
            $fila = $guardado[$red] ?? null;
            if (!is_array($fila) || !isset($fila['url']) || !is_string($fila['url']) || $fila['url'] === ''
                || is_wp_error(self::url_valida($red, $fila['url']))) {
                continue;
            }
            $handle = '';
            if (isset($fila['handle']) && is_string($fila['handle']) && $fila['handle'] !== ''
                && !is_wp_error(self::handle_valido($fila['handle']))) {
                $handle = $fila['handle'];
            }
            $cuentas[$red] = ['url' => $fila['url'], 'handle' => $handle];
        }

        return $cuentas;
    }

    /**
     * La cuenta configurada para esa red, o null si no hay (o no es válida).
     *
     * @return array{url: string, handle: string}|null
     */
    public static function cuenta(string $red): ?array
    {
        return self::cuentas()[$red] ?? null;
    }

    /**
     * Quita los espacios de los extremos (y el espacio duro, que llega al copiar
     * desde un teléfono), sin tocar nada del interior.
     *
     * @param mixed $valor
     */
    private static function limpiar($valor): string
    {
        return is_string($valor) ? (string) preg_replace('/^[ \t\r\n\x{00A0}]+|[ \t\r\n\x{00A0}]+$/u', '', $valor) : '';
    }

    /**
     * Valida lo que llegó del formulario sin tocar la base de datos. Está aparte
     * de guardar() para poder comprobar, sin simular una petición de
     * administración, que una dirección mal escrita se rechaza y nombra su campo.
     *
     * Cada red se guarda entera o no se toca. Si uno de sus dos campos no pasa,
     * la red conserva lo que tenía: aceptar la dirección nueva con el nombre de
     * usuario viejo (o al revés) dibujaría en el sitio un enlace y un nombre que
     * no son de la misma cuenta, que es justo lo que esta función existe para
     * evitar. Una dirección vacía cierra la cuenta: ni la dirección ni el nombre
     * de usuario se guardan.
     *
     * @param array<string, mixed> $post     Los datos ya sin barras de escape.
     * @param array<string, mixed> $previos  Lo que estaba guardado.
     * @return array{0: array<string, array{url: string, handle: string}>, 1: list<string>} Cuentas a guardar y campos rechazados («instagram_url», «x_handle»…).
     */
    public static function procesar_envio(array $post, array $previos): array
    {
        $valores = [];
        $errores = [];
        foreach (array_keys(self::REDES) as $red) {
            $url = self::limpiar($post['cod_redes_' . $red . '_url'] ?? '');
            $handle = self::limpiar($post['cod_redes_' . $red . '_handle'] ?? '');
            if ($url === '') {
                continue;
            }
            $malos = [];
            if (is_wp_error(self::url_valida($red, $url))) {
                $malos[] = $red . '_url';
            }
            if ($handle !== '' && is_wp_error(self::handle_valido($handle))) {
                $malos[] = $red . '_handle';
            }
            if ($malos !== []) {
                $errores = array_merge($errores, $malos);
                $previa = isset($previos[$red]) && is_array($previos[$red]) ? $previos[$red] : [];
                if (isset($previa['url']) && is_string($previa['url']) && $previa['url'] !== '') {
                    $valores[$red] = [
                        'url' => $previa['url'],
                        'handle' => isset($previa['handle']) && is_string($previa['handle']) ? $previa['handle'] : '',
                    ];
                }
                continue;
            }
            $valores[$red] = ['url' => $url, 'handle' => $handle];
        }

        return [$valores, $errores];
    }

    /**
     * El aviso «no se guardó …» con el campo rechazado y cómo debería verse.
     * Vive aquí y no en la plantilla para que la pantalla y la prueba lean el
     * mismo texto.
     *
     * @param list<string> $claves
     */
    public static function mensaje_de_errores(array $claves): string
    {
        $frases = [];
        foreach ($claves as $clave) {
            $partes = explode('_', $clave, 2);
            $red = $partes[0];
            if (!isset(self::REDES[$red]) || !isset($partes[1])) {
                continue;
            }
            $spec = self::REDES[$red];
            if ($partes[1] === 'url') {
                $frases[] = 'la dirección de ' . $spec['name'] . ' (tiene que empezar con https:// y ser de ' . implode(' o ', $spec['hosts']) . ')';
            } elseif ($partes[1] === 'handle') {
                $frases[] = 'el nombre de usuario de ' . $spec['name'] . ' (hasta 80 caracteres: letras, números y @ . _ - /, sin caracteres invisibles)';
            }
        }

        return $frases === [] ? '' : 'No se guardó ' . implode('; ', $frases) . '. De esa red se conservó lo que había.';
    }

    public function guardar(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar la configuración.', 'contope-publisher'));
        }
        check_admin_referer('cod_save_redes_sociales');

        $previos = get_option(self::OPTION_KEY, []);
        [$valores, $errores] = self::procesar_envio(wp_unslash($_POST), is_array($previos) ? $previos : []);

        update_option(self::OPTION_KEY, $valores, true);

        $destino = add_query_arg('cod_redes_guardadas', '1', admin_url('admin.php?page=' . COD_Settings_Admin::PAGE_SLUG));
        if ($errores !== []) {
            $destino = add_query_arg('cod_redes_error', implode(',', $errores), $destino);
        }
        wp_safe_redirect($destino . '#cod-redes');
        exit;
    }

    /**
     * Pone en el HTML que se va a mostrar la cuenta que HAY AHORA en el panel.
     *
     * El compilador deja cada enlace cuya cuenta sale del panel marcado con
     * data-cod-social-panel="<red>". Aquí, al mostrar la página (cabecera,
     * cuerpo y pie ya ensamblados), se le pone la dirección y el nombre de
     * usuario vigentes; y si la red ya no está configurada, el enlace se quita
     * entero: nada de un icono que no lleva a ninguna parte.
     */
    public static function resolver_en_html(string $html): string
    {
        if (strpos($html, self::MARCA_PANEL) === false) {
            return $html;
        }
        $cuentas = self::cuentas();
        $resultado = preg_replace_callback(
            '#<a\b[^>]*\s' . self::MARCA_PANEL . '="([a-z]+)"[^>]*>.*?</a>#s',
            static function (array $m) use ($cuentas): string {
                return isset($cuentas[$m[1]]) ? self::reescribir_enlace($m[0], $m[1], $cuentas[$m[1]]) : '';
            },
            $html
        );

        return $resultado ?? $html;
    }

    /**
     * @param array{url: string, handle: string} $cuenta
     */
    private static function reescribir_enlace(string $enlace, string $red, array $cuenta): string
    {
        if (preg_match('#^<a\b[^>]*>#s', $enlace, $abre) !== 1 || substr($enlace, -4) !== '</a>') {
            return $enlace;
        }
        $apertura = $abre[0];
        $interior = substr($enlace, strlen($apertura), -4);
        $handle = strpos($apertura, 'data-cod-social-sin-texto=') !== false ? '' : $cuenta['handle'];

        $href = ' href="' . esc_url($cuenta['url']) . '"';
        $apertura = preg_match('/\shref="[^"]*"/', $apertura, $actual) === 1
            ? str_replace($actual[0], $href, $apertura)
            : '<a' . $href . substr($apertura, 2);
        if (strpos($apertura, 'data-cod-social-aria-auto=') !== false && preg_match('/\saria-label="[^"]*"/', $apertura, $rotulo) === 1) {
            $apertura = str_replace($rotulo[0], ' aria-label="' . esc_attr(self::etiqueta_por_defecto($red, $handle)) . '"', $apertura);
        }

        $interior = (string) preg_replace('#<span class="cod-social__handle">.*?</span>#s', '', $interior);
        if ($handle !== '') {
            $interior .= '<span class="cod-social__handle">' . esc_html($handle) . '</span>';
        }

        return $apertura . $interior . '</a>';
    }
}
