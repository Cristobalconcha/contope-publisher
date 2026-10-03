<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Qué permitió el visitante, leído desde PHP antes de imprimir nada.
 *
 * POR QUÉ EXISTE. El 3 de octubre de 2026, midiendo el sitio de Econut en
 * local, la portada cargaba `googletagmanager.com` y `ad.doubleclick.net` y
 * dejaba puesta la cookie publicitaria `_gcl_au` **con el banner de cookies
 * todavía en pantalla, sin tocar**. Las etiquetas se imprimían en `wp_head`
 * sin preguntarle nada a nadie. Eso es exactamente lo que la Ley 21.719
 * prohíbe, y no era un descuido de configuración del sitio: era el plugin.
 *
 * La diferencia importa porque decide dónde se arregla. Un sitio puede
 * configurar mal su banner; que la etiqueta se imprima antes del
 * consentimiento no es algo que el sitio pueda configurar. Si el plugin pone
 * la etiqueta, el plugin tiene que poner la puerta.
 *
 * QUÉ NO HACE. No muestra ningún banner ni guarda ningún consentimiento: eso
 * lo hace un plugin de consentimiento, que es trabajo aparte y bien hecho por
 * otros. Esta clase sólo **lee** lo que ese plugin ya decidió, para que el
 * resto del código pueda preguntarlo.
 *
 * CÓMO SE COMPORTA SI NO HAY GESTOR. Imprime como antes. Y esto es una
 * decisión, no un olvido: el repositorio es público y hay forks instalados en
 * sitios que no conozco. Un plugin que, al actualizarse, apagara en silencio
 * la medición de un sitio que no tiene banner sería un daño peor que el que
 * viene a arreglar —y silencioso, que es la peor clase—. Donde hay banner, la
 * puerta funciona; donde no lo hay, el sitio queda como estaba y la pantalla
 * de Configuración lo dice con todas sus letras.
 *
 * Quien quiera la puerta cerrada de todas formas tiene el filtro
 * `cod_consentimiento_exigir`.
 */
final class COD_Consentimiento
{
    /**
     * Las tres categorías con las que se razona acá. Son las de cualquier
     * gestor de consentimiento, con distintos nombres:
     *
     *  - `functional`: lo que la persona pidió —un mapa, un vídeo incrustado—.
     *  - `analytics`:  medir cuánta gente visita y qué mira.
     *  - `marketing`:  publicidad y remarketing.
     *
     * Las necesarias no están en la lista porque no se preguntan.
     */
    public const CATEGORIAS = ['functional', 'analytics', 'marketing'];

    /**
     * Lo que ya se resolvió en esta petición. La cookie no cambia a mitad de
     * una carga de página, así que se lee una vez.
     *
     * @var array<string, bool>|null
     */
    private static $cache = null;

    /** Para las pruebas: olvida lo leído. */
    public static function olvidar(): void
    {
        self::$cache = null;
    }

    /**
     * ¿Hay en el sitio algo que pida consentimiento?
     *
     * Se detecta por los gestores conocidos. La lista es corta a propósito:
     * sólo lo que se puede comprobar. Un sitio con otro gestor usa el filtro.
     */
    public static function hay_gestor(): bool
    {
        $gestores = [
            'cookieadmin/cookieadmin.php',
            'cookie-law-info/cookie-law-info.php',      // CookieYes
            'complianz-gdpr/complianz-gpdr.php',
            'cookie-notice/cookie-notice.php',
            'borlabs-cookie/borlabs-cookie.php',
            'iubenda-cookie-law-solution/iubenda_cookie_solution.php',
        ];

        $hay = false;
        foreach ($gestores as $gestor) {
            if (self::plugin_activo($gestor)) {
                $hay = true;
                break;
            }
        }

        /**
         * Filtra si el sitio tiene un gestor de consentimiento.
         *
         * Devolver `true` acá cierra la puerta aunque no se reconozca el
         * gestor: nada que no sea necesario se imprime hasta que la categoría
         * esté concedida. Es lo que corresponde si el gestor del sitio no está
         * en la lista de arriba.
         */
        return (bool) apply_filters('cod_consentimiento_hay_gestor', $hay);
    }

    /**
     * ¿Hay que esperar el consentimiento antes de imprimir lo no necesario?
     */
    public static function exigir(): bool
    {
        /**
         * Filtra si se exige consentimiento. Por omisión, sí cuando hay un
         * gestor que lo recoja; forzarlo a `true` sin gestor deja el sitio sin
         * medición alguna, porque nadie podrá conceder nada.
         */
        return (bool) apply_filters('cod_consentimiento_exigir', self::hay_gestor());
    }

    /**
     * ¿Concedió esta categoría?
     *
     * Sin gestor devuelve `true` —no hay a quién preguntarle—, y con gestor
     * pero sin respuesta todavía devuelve `false`. El silencio no es un sí:
     * ésa es justamente la parte que la ley cambió.
     */
    public static function concede(string $categoria): bool
    {
        if (!self::exigir()) {
            return true;
        }

        return !empty(self::concedidas()[$categoria]);
    }

    /**
     * Lo concedido, por categoría.
     *
     * @return array<string, bool>
     */
    public static function concedidas(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $vacio = array_fill_keys(self::CATEGORIAS, false);
        $crudo = isset($_COOKIE[self::cookie()]) ? (string) $_COOKIE[self::cookie()] : '';

        self::$cache = $crudo === '' ? $vacio : self::leer_cookie($crudo);

        /**
         * Filtra lo concedido. Para un gestor que guarde su respuesta de otra
         * forma: se devuelve el mismo mapa categoría => bool.
         *
         * @param array<string, bool> $concedidas
         */
        $filtrado = apply_filters('cod_consentimiento_concedidas', self::$cache);
        if (is_array($filtrado)) {
            self::$cache = array_merge($vacio, array_map(
                static fn ($v): bool => (bool) $v,
                array_intersect_key($filtrado, $vacio)
            ));
        }

        return self::$cache;
    }

    /**
     * El nombre de la cookie donde el gestor deja su respuesta.
     */
    public static function cookie(): string
    {
        return (string) apply_filters('cod_consentimiento_cookie', 'cookieadmin_consent');
    }

    /**
     * Traduce la cookie del gestor al mapa de categorías.
     *
     * Las tres formas que guarda CookieAdmin, medidas en el navegador el 3 de
     * octubre de 2026 pulsando cada botón y leyendo `document.cookie`:
     *
     *   rechazar todo   {"reject":"true"}
     *   aceptar todo    {"accept":"true"}
     *   guardar a medida  {"functional":"true","analytics":"true"}
     *
     * Están medidas y no leídas de su documentación porque el formato de una
     * cookie de un plugin de terceros no es un contrato: si cambia, esta
     * función deja de reconocerla y devuelve todo en `false`. Que el modo de
     * fallo sea «no se mide» y no «se mide sin permiso» es a propósito.
     *
     * @return array<string, bool>
     */
    public static function leer_cookie(string $crudo): array
    {
        $mapa = array_fill_keys(self::CATEGORIAS, false);

        $datos = json_decode(wp_unslash($crudo), true);
        if (!is_array($datos)) {
            return $mapa;
        }

        $si = static fn ($v): bool => $v === true || $v === 'true' || $v === 1 || $v === '1';

        if (isset($datos['reject']) && $si($datos['reject'])) {
            return $mapa;
        }

        if (isset($datos['accept']) && $si($datos['accept'])) {
            return array_fill_keys(self::CATEGORIAS, true);
        }

        foreach (self::CATEGORIAS as $categoria) {
            // `analytical` y `advertisement` son los nombres que usan otros
            // gestores para lo mismo. Reconocerlos no cuesta nada y evita que
            // un cambio de gestor apague la medición sin explicación.
            foreach ([$categoria, self::sinonimo($categoria)] as $clave) {
                if ($clave !== '' && isset($datos[$clave]) && $si($datos[$clave])) {
                    $mapa[$categoria] = true;
                }
            }
        }

        return $mapa;
    }

    private static function sinonimo(string $categoria): string
    {
        $sinonimos = [
            'analytics' => 'analytical',
            'marketing' => 'advertisement',
            'functional' => 'preferences',
        ];

        return $sinonimos[$categoria] ?? '';
    }

    /**
     * El atributo con el que el gestor reconoce un guion dormido.
     *
     * Un guion impreso como `type="text/plain"` no lo ejecuta el navegador.
     * CookieAdmin busca los que llevan su atributo y, cuando la persona
     * concede la categoría, los reemplaza por guiones de verdad —sin recargar
     * la página—. Así la etiqueta empieza a medir en el mismo momento en que
     * se acepta, y no en la página siguiente.
     *
     * Si el gestor del sitio no es CookieAdmin, el guion se queda dormido y la
     * medición empieza en la carga siguiente, cuando esta clase ya lee la
     * cookie. Peor, pero no incumple: el orden es «primero el permiso».
     */
    public static function atributo_categoria(string $categoria): string
    {
        $atributo = (string) apply_filters(
            'cod_consentimiento_atributo',
            'data-cookieadmin-category',
            $categoria
        );

        if ($atributo === '') {
            return '';
        }

        return sprintf(' %s="%s"', esc_attr($atributo), esc_attr($categoria));
    }

    /**
     * Abre la etiqueta `<script>` de un guion sujeto a consentimiento.
     *
     * Devuelve `<script>` si la categoría está concedida, y un guion dormido
     * si no. Quien imprime no tiene que saber nada de todo esto: pide la
     * apertura para su categoría y cierra con `</script>`.
     */
    public static function abrir_script(string $categoria, string $atributos = ''): string
    {
        $extra = $atributos === '' ? '' : ' ' . trim($atributos);

        if (self::concede($categoria)) {
            return '<script' . $extra . '>';
        }

        return '<script type="text/plain"' . self::atributo_categoria($categoria) . $extra . '>';
    }

    /**
     * El bloque de Consent Mode v2 de Google, con todo denegado de partida.
     *
     * Va ANTES de cualquier etiqueta de Google y es inline: no pide nada a la
     * red, no pone ninguna cookie y por eso se imprime siempre, haya
     * consentimiento o no. Lo que hace es decirle a Google —y a cualquier
     * etiqueta que alguien cuelgue después desde Tag Manager— que todavía no
     * hay permiso.
     *
     * Hace falta además de la puerta, no en vez de ella. La puerta cubre lo
     * que imprime este plugin; esto cubre lo que el sitio cuelgue desde Tag
     * Manager, donde el plugin no manda.
     */
    public static function fragmento_consent_mode(): string
    {
        $concedidas = self::exigir() ? self::concedidas() : array_fill_keys(self::CATEGORIAS, true);

        $estado = static fn (bool $si): string => $si ? 'granted' : 'denied';

        $senales = [
            'ad_storage' => $estado($concedidas['marketing']),
            'ad_user_data' => $estado($concedidas['marketing']),
            'ad_personalization' => $estado($concedidas['marketing']),
            'analytics_storage' => $estado($concedidas['analytics']),
            'functionality_storage' => $estado($concedidas['functional']),
            'personalization_storage' => $estado($concedidas['functional']),
            // El almacenamiento de seguridad no se pregunta: es lo que impide
            // un fraude. Denegarlo no protege a nadie.
            'security_storage' => 'granted',
        ];

        $pares = [];
        foreach ($senales as $senal => $valor) {
            $pares[] = "'" . $senal . "':'" . $valor . "'";
        }

        return "<!-- Consentimiento de Google (ContOpe) -->\n<script>"
            . 'window.dataLayer=window.dataLayer||[];'
            . 'function gtag(){dataLayer.push(arguments);}'
            . "gtag('consent','default',{" . implode(',', $pares) . ",'wait_for_update':500});"
            . "</script>\n";
    }

    /**
     * ¿Está activo este plugin? Sin cargar `plugin.php` de más.
     */
    private static function plugin_activo(string $ruta): bool
    {
        if (function_exists('is_plugin_active')) {
            return is_plugin_active($ruta);
        }

        $activos = get_option('active_plugins', []);
        if (is_array($activos) && in_array($ruta, $activos, true)) {
            return true;
        }

        // En multisitio un gestor puede estar activo para toda la red.
        if (is_multisite()) {
            $red = get_site_option('active_sitewide_plugins', []);
            if (is_array($red) && isset($red[$ruta])) {
                return true;
            }
        }

        return false;
    }
}
