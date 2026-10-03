<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Etiquetas de medición del sitio: Tag Manager, Analytics, Ads, pixel de Meta
 * y las etiquetas de verificación de propiedad.
 *
 * Se guardan IDENTIFICADORES, no código. El plugin arma el fragmento oficial de
 * cada herramienta a partir del identificador. La razón no es desconfianza: un
 * cuadro donde se pega código suelto es la vía más común por la que un sitio
 * termina ejecutando JavaScript de un tercero, y cuando falla no queda nada que
 * revisar salvo el propio pegado. Con Tag Manager instalado, además, todo lo
 * demás se cuelga desde ahí sin volver a tocar WordPress.
 *
 * NADA SE IMPRIME ANTES DEL CONSENTIMIENTO. Cada etiqueta declara a qué
 * categoría pertenece y pregunta por ella a `COD_Consentimiento` antes de
 * salir. Hasta el 3 de octubre de 2026 no lo hacía: la portada de un sitio en
 * pruebas cargaba Tag Manager y DoubleClick, y dejaba puesta la cookie
 * publicitaria `_gcl_au`, con el banner de cookies todavía en pantalla sin
 * tocar. El porqué largo está en `class-cod-consentimiento.php`.
 */
final class COD_Medicion
{
    public const OPTION_KEY = 'cod_medicion';
    public const CAPABILITY = 'manage_options';

    public function register(): void
    {
        add_action('wp_head', [$this, 'imprimir_en_head'], 1);
        add_action('wp_body_open', [$this, 'imprimir_tras_body'], 1);
        add_action('admin_post_cod_save_medicion', [$this, 'guardar']);
    }

    /**
     * @return array<string, mixed>
     */
    public static function ajustes(): array
    {
        $guardado = get_option(self::OPTION_KEY, []);
        $guardado = is_array($guardado) ? $guardado : [];

        return [
            'gtm' => (string) ($guardado['gtm'] ?? ''),
            'ga4' => (string) ($guardado['ga4'] ?? ''),
            'ads' => (string) ($guardado['ads'] ?? ''),
            'ads_conv_formulario' => (string) ($guardado['ads_conv_formulario'] ?? ''),
            'ads_conv_whatsapp' => (string) ($guardado['ads_conv_whatsapp'] ?? ''),
            'meta_pixel' => (string) ($guardado['meta_pixel'] ?? ''),
            'verificaciones' => (string) ($guardado['verificaciones'] ?? ''),
            'excluir_admin' => !empty($guardado['excluir_admin']),
        ];
    }

    /**
     * Forma de cada identificador. Se valida al guardar, no al imprimir: un
     * identificador mal escrito no se nota mirando la página —la herramienta
     * simplemente no recibe nada— así que el momento de avisar es cuando la
     * persona todavía lo tiene delante.
     *
     * @return array<string, array{patron: string, ejemplo: string}>
     */
    private static function formatos(): array
    {
        return [
            'gtm' => ['patron' => '/^GTM-[A-Z0-9]{4,10}$/', 'ejemplo' => 'GTM-ABC1234'],
            'ga4' => ['patron' => '/^G-[A-Z0-9]{6,12}$/', 'ejemplo' => 'G-ABC1234XYZ'],
            'ads' => ['patron' => '/^AW-[0-9]{6,14}$/', 'ejemplo' => 'AW-123456789'],
            // Lo que Google entrega para una conversión: el ID de la cuenta, una
            // barra y la etiqueta. La etiqueta distingue mayúsculas de minúsculas.
            'ads_conv_formulario' => ['patron' => '/^AW-[0-9]{6,14}\/[A-Za-z0-9_-]{8,40}$/', 'ejemplo' => 'AW-123456789/AbC-dEfGhIjKlMnOpQr'],
            'ads_conv_whatsapp' => ['patron' => '/^AW-[0-9]{6,14}\/[A-Za-z0-9_-]{8,40}$/', 'ejemplo' => 'AW-123456789/AbC-dEfGhIjKlMnOpQr'],
            'meta_pixel' => ['patron' => '/^[0-9]{8,20}$/', 'ejemplo' => '123456789012345'],
        ];
    }

    /**
     * ¿Corresponde imprimir las etiquetas en esta petición?
     */
    private function debe_medir(): bool
    {
        if (is_admin() || wp_doing_ajax() || is_feed() || is_robots()) {
            return false;
        }
        if (defined('REST_REQUEST') && REST_REQUEST) {
            return false;
        }
        if (function_exists('is_customize_preview') && is_customize_preview()) {
            return false;
        }
        $ajustes = self::ajustes();
        if ($ajustes['excluir_admin'] && current_user_can(self::CAPABILITY)) {
            return false;
        }

        return true;
    }

    public function imprimir_en_head(): void
    {
        if (!$this->debe_medir()) {
            return;
        }
        $a = self::ajustes();

        // Las verificaciones de propiedad no piden consentimiento: son
        // etiquetas `<meta>` con un texto dentro. No ejecutan nada, no piden
        // nada a la red y no ponen ninguna cookie.
        foreach (self::verificaciones_en_lista($a['verificaciones']) as $nombre => $contenido) {
            printf('<meta name="%s" content="%s">' . "\n", esc_attr($nombre), esc_attr($contenido));
        }

        // Si hay alguna etiqueta de Google, su estado de consentimiento va
        // antes que ella. Es inline: no pide nada a la red.
        if ($a['gtm'] !== '' || $a['ga4'] !== '' || $a['ads'] !== '') {
            echo COD_Consentimiento::fragmento_consent_mode();
        }

        if ($a['gtm'] !== '') {
            // Fragmento oficial de Google Tag Manager. Va lo más arriba posible
            // del head porque Tag Manager tiene que existir antes que cualquier
            // evento que la página empuje al dataLayer: los que este sitio ya
            // emite al enviar el formulario y al abrir WhatsApp.
            echo "<!-- Google Tag Manager (ContOpe) -->\n";
            echo COD_Consentimiento::abrir_script(self::categoria_de_tag_manager())
                . "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':"
                . "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],"
                . "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src="
                . "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);"
                . "})(window,document,'script','dataLayer','" . esc_js($a['gtm']) . "');</script>\n";
            echo "<!-- Fin Google Tag Manager -->\n";
        }

        // Analytics y Ads comparten una sola etiqueta de Google. Cuando están
        // los dos y la persona concedió sólo una de las dos categorías, la
        // etiqueta se carga igual —hace falta para la que sí concedió— y es el
        // `gtag('config')` de cada identificador el que se omite. Así no se
        // mide lo que no se permitió, y lo que sí se permitió funciona.
        $gtag = [];
        if ($a['ga4'] !== '' && COD_Consentimiento::concede('analytics')) {
            $gtag[] = $a['ga4'];
        }
        if ($a['ads'] !== '' && COD_Consentimiento::concede('marketing')) {
            $gtag[] = $a['ads'];
        }

        if ($gtag !== []) {
            echo "<!-- Google tag (ContOpe) -->\n";
            printf(
                '<script async src="https://www.googletagmanager.com/gtag/js?id=%s"></script>' . "\n",
                esc_attr($gtag[0])
            );
            echo "<script>window.dataLayer=window.dataLayer||[];"
                . "function gtag(){dataLayer.push(arguments);}gtag('js',new Date());";
            foreach ($gtag as $id) {
                echo "gtag('config','" . esc_js($id) . "');";
            }
            echo "</script>\n";
        } elseif ($a['ga4'] !== '' || $a['ads'] !== '') {
            // Nada concedido todavía. La etiqueta se deja dormida para que
            // empiece a medir en el momento en que acepte, sin recargar.
            //
            // CADA IDENTIFICADOR CON SU PROPIA CATEGORÍA, en su propio par de
            // guiones. Es la parte que importa y la que estuvo mal escrita
            // media hora: con un solo bloque que llevara los dos `config`
            // dentro, aceptar sólo medición habría despertado ese bloque
            // entero y configurado también la cuenta de publicidad. Lo
            // destapó la prueba de conversiones, no la lectura.
            //
            // Que la etiqueta de Google se pida dos veces no es un problema:
            // es la misma URL, el navegador la trae una vez y la reutiliza, y
            // el fragmento oficial de Google está escrito para poder repetirse
            // —`dataLayer` se acumula y `gtag` se redefine igual a sí misma—.
            echo "<!-- Google tag (ContOpe, en espera del consentimiento) -->\n";
            foreach (['analytics' => $a['ga4'], 'marketing' => $a['ads']] as $categoria => $id) {
                if ($id === '') {
                    continue;
                }
                echo COD_Consentimiento::abrir_script(
                    $categoria,
                    'async src="' . esc_url('https://www.googletagmanager.com/gtag/js?id=' . $id) . '"'
                ) . "</script>\n";
                echo COD_Consentimiento::abrir_script($categoria)
                    . "window.dataLayer=window.dataLayer||[];"
                    . "function gtag(){dataLayer.push(arguments);}gtag('js',new Date());"
                    . "gtag('config','" . esc_js($id) . "');"
                    . "</script>\n";
            }
        }

        echo self::fragmento_conversiones($a);

        if ($a['meta_pixel'] !== '') {
            echo "<!-- Meta Pixel (ContOpe) -->\n";
            echo COD_Consentimiento::abrir_script('marketing')
                . "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?"
                . "n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;"
                . "n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;"
                . "t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,"
                . "document,'script','https://connect.facebook.net/en_US/fbevents.js');"
                . "fbq('init','" . esc_js($a['meta_pixel']) . "');fbq('track','PageView');</script>\n";
        }
    }

    /**
     * Bajo qué categoría viaja Tag Manager.
     *
     * Tag Manager no es una herramienta de medición: es el transporte de las
     * que se cuelguen dentro. Así que se carga si la persona concedió
     * CUALQUIERA de las dos categorías que podrían viajar por ahí, y el
     * Consent Mode que se imprime más arriba es el que le dice a cada etiqueta
     * de dentro qué tiene permitido. Atarlo sólo a `analytics` dejaría sin
     * funcionar una conversión de publicidad en el caso —poco común, pero
     * real— de quien acepta publicidad y rechaza medición.
     *
     * Cuando no hay ninguna concedida se deja dormido bajo `analytics`, porque
     * el atributo del gestor admite una sola categoría. Quien conceda sólo
     * publicidad lo verá despertar en la carga siguiente, no en el acto.
     */
    private static function categoria_de_tag_manager(): string
    {
        return COD_Consentimiento::concede('marketing') ? 'marketing' : 'analytics';
    }

    public function imprimir_tras_body(): void
    {
        if (!$this->debe_medir()) {
            return;
        }
        $a = self::ajustes();

        // Los dos recursos de aquí abajo son para quien navega sin JavaScript,
        // y los dos piden algo a un tercero en cuanto se dibuja la página. No
        // hay forma de dejarlos «dormidos»: un `<iframe>` y una `<img>` se
        // cargan solos. Así que o hay permiso o no se imprimen.
        //
        // Y hay una consecuencia honesta que conviene decir: sin JavaScript
        // tampoco hay banner que pulsar, así que ahí no se va a medir nunca.
        // Es el orden correcto. Medir sin poder preguntar no es una opción.
        if ($a['gtm'] !== '' && COD_Consentimiento::concede(self::categoria_de_tag_manager())) {
            printf(
                '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=%s"'
                    . ' height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>' . "\n",
                esc_attr($a['gtm'])
            );
        }
        if ($a['meta_pixel'] !== '' && COD_Consentimiento::concede('marketing')) {
            printf(
                '<noscript><img height="1" width="1" style="display:none" alt=""'
                    . ' src="https://www.facebook.com/tr?id=%s&ev=PageView&noscript=1"></noscript>' . "\n",
                esc_attr($a['meta_pixel'])
            );
        }
    }

    /**
     * Convierte el cuadro de verificaciones en pares nombre => contenido.
     *
     * Acepta las dos formas en que esto llega en la vida real: la etiqueta
     * completa copiada de Search Console, y el par escrito a mano. Admitir sólo
     * una garantiza que alguien pegue la otra y no funcione sin decir por qué.
     *
     * @return array<string, string>
     */
    public static function verificaciones_en_lista(string $crudo): array
    {
        $pares = [];
        foreach (preg_split('/[\r\n]+/', $crudo) ?: [] as $linea) {
            $linea = trim((string) $linea);
            if ($linea === '') {
                continue;
            }
            if (preg_match('/name=["\']([^"\']+)["\'][^>]*content=["\']([^"\']*)["\']/i', $linea, $m)) {
                $nombre = $m[1];
                $contenido = $m[2];
            } elseif (strpos($linea, '=') !== false) {
                [$nombre, $contenido] = array_pad(explode('=', $linea, 2), 2, '');
            } else {
                continue;
            }
            $nombre = preg_replace('/[^A-Za-z0-9_.:-]/', '', trim((string) $nombre)) ?? '';
            $contenido = trim((string) $contenido);
            if ($nombre !== '' && $contenido !== '') {
                $pares[$nombre] = $contenido;
            }
        }

        return $pares;
    }

    /**
     * Deja el identificador en su forma canónica antes de validarlo.
     *
     * Quita los espacios invisibles que viajan pegados a un copiar-y-pegar desde
     * una página web —espacio duro (U+00A0), espacio de ancho cero, marca de
     * orden de bytes—. `trim()` de PHP no toca ninguno de esos: sólo limpia
     * espacio, tabulador y salto de línea. Con uno de ellos adherido, el
     * identificador no calzaba con su formato, el campo se guardaba vacío y no
     * había forma de entender por qué; pasó de verdad la primera vez que se usó
     * esta pantalla.
     *
     * Y si pegaron el fragmento completo en lugar del identificador, lo extrae.
     * Esa es la forma en que Google entrega estos códigos, así que es la forma
     * en que van a llegar; rechazarla sólo produce un campo en blanco.
     */
    private static function normalizar(string $crudo, string $campo): string
    {
        $texto = preg_replace('/[\s\x{00A0}\x{200B}-\x{200D}\x{FEFF}]+/u', ' ', $crudo) ?? $crudo;
        $texto = trim($texto);

        if ($campo === 'meta_pixel') {
            return preg_replace('/\D/', '', $texto) ?? '';
        }

        if (in_array($campo, ['ads_conv_formulario', 'ads_conv_whatsapp'], true)) {
            // La etiqueta distingue mayúsculas: NO se pasa a mayúsculas. Sólo el
            // prefijo AW- se deja canónico. Acepta también el fragmento tal como
            // lo da Google (`'send_to': 'AW-…/…'`), de donde saca el par.
            if (preg_match('/AW-[0-9]{6,14}\/[A-Za-z0-9_-]+/i', $texto, $coincidencia)) {
                return 'AW-' . substr($coincidencia[0], 3);
            }

            return $texto;
        }

        $texto = strtoupper($texto);

        $prefijos = ['gtm' => 'GTM', 'ga4' => 'G', 'ads' => 'AW'];
        if (isset($prefijos[$campo])
            && preg_match('/\b' . $prefijos[$campo] . '-[A-Z0-9]{4,14}\b/', $texto, $coincidencia)) {
            return $coincidencia[0];
        }

        return $texto;
    }

    public function guardar(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar la configuración.', 'contope-publisher'));
        }
        check_admin_referer('cod_save_medicion');

        [$valores, $errores] = self::procesar_envio(wp_unslash($_POST), self::ajustes());

        update_option(self::OPTION_KEY, $valores, true);

        $destino = admin_url('admin.php?page=' . COD_Settings_Admin::PAGE_SLUG);
        $destino = add_query_arg('cod_medicion_guardada', '1', $destino);
        if ($errores !== []) {
            $destino = add_query_arg('cod_medicion_error', implode(',', $errores), $destino);
        }
        wp_safe_redirect($destino . '#cod-medicion');
        exit;
    }

    /**
     * Valida y normaliza lo que llegó del formulario, sin tocar la base de
     * datos. Está aparte de `guardar()` para poder comprobar, sin simular una
     * petición de administración, que un identificador mal escrito se rechaza
     * y nombra su campo.
     *
     * @param array<string, mixed> $post      Los datos ya sin barras de escape.
     * @param array<string, mixed> $previos   Lo que estaba guardado.
     * @return array{0: array<string, mixed>, 1: list<string>} Valores a guardar y campos rechazados.
     */
    public static function procesar_envio(array $post, array $previos): array
    {
        $errores = [];
        $valores = ['excluir_admin' => !empty($post['cod_medicion_excluir_admin'])];

        foreach (self::formatos() as $campo => $formato) {
            $crudo = isset($post['cod_medicion_' . $campo])
                ? self::normalizar((string) $post['cod_medicion_' . $campo], $campo)
                : '';
            if ($crudo === '') {
                $valores[$campo] = '';
                continue;
            }
            if (!preg_match($formato['patron'], $crudo)) {
                // No se borra lo que ya estaba guardado y funcionando: un valor
                // nuevo mal escrito no es motivo para apagar la medición que el
                // sitio ya tenía. Vaciar el campo sólo se hace a propósito.
                $errores[] = $campo;
                $valores[$campo] = (string) ($previos[$campo] ?? '');
                continue;
            }
            $valores[$campo] = $crudo;
        }

        $verificaciones = isset($post['cod_medicion_verificaciones'])
            ? (string) $post['cod_medicion_verificaciones']
            : '';
        $lineas = [];
        foreach (self::verificaciones_en_lista($verificaciones) as $nombre => $contenido) {
            $lineas[] = $nombre . '=' . $contenido;
        }
        $valores['verificaciones'] = implode("\n", $lineas);

        return [$valores, $errores];
    }

    /**
     * El aviso «no se guardó …» con el nombre de cada campo rechazado y cómo
     * debería verse. Vive aquí y no en la plantilla para que la pantalla y la
     * prueba lean el mismo texto.
     *
     * @param list<string> $claves
     */
    public static function mensaje_de_errores(array $claves): string
    {
        $campos = self::campos_para_pantalla();
        $nombres = [];
        foreach ($claves as $clave) {
            if (isset($campos[$clave])) {
                $nombres[] = $campos[$clave]['etiqueta'] . ' (se espera algo como ' . $campos[$clave]['ejemplo'] . ')';
            }
        }

        return $nombres === [] ? '' : 'No se guardó ' . implode('; ', $nombres) . '.';
    }

    /**
     * Avisos sobre una configuración que se guarda bien pero no mide nada.
     * Se calculan al mostrar la pantalla, no sólo al guardar: no se notan
     * mirando el sitio, y se pueden producir después, borrando el ID de Ads.
     *
     * Una conversión viaja por `gtag`, que sólo existe si hay un ID de Ads o de
     * Analytics. Y la etiqueta pertenece a una cuenta de Ads: si el ID de esa
     * cuenta no es el configurado, Google no sabe de qué cuenta es el evento.
     *
     * @param array<string, mixed> $a
     * @return list<string>
     */
    public static function avisos_de_conversion(array $a): array
    {
        $avisos = [];
        $hay_algo = (string) ($a['gtm'] ?? '') !== ''
            || (string) ($a['ga4'] ?? '') !== ''
            || (string) ($a['ads'] ?? '') !== ''
            || (string) ($a['meta_pixel'] ?? '') !== '';

        // Lo primero que hay que saber de esta pantalla es si lo configurado
        // acá se está imprimiendo o no, porque desde el 0.3.48 ya no se
        // imprime siempre: espera el consentimiento. Sin este aviso, alguien
        // configuraría su etiqueta, la vería guardada, no mediría nada y no
        // tendría dónde enterarse de por qué.
        if ($hay_algo && !COD_Consentimiento::exigir()) {
            $avisos[] = 'Este sitio no tiene un gestor de consentimiento que reconozcamos, así que las '
                . 'etiquetas de abajo se cargan para todo el mundo desde la primera visita. La Ley 21.719 '
                . '—vigente desde el 1 de diciembre de 2026— pide pedir permiso antes de medir y antes de '
                . 'hacer publicidad. Instalando un plugin de consentimiento, estas etiquetas esperan solas: '
                . 'no hay que volver a esta pantalla.';
        }

        $hay_gtag = (string) ($a['ga4'] ?? '') !== '' || (string) ($a['ads'] ?? '') !== '';
        $ads = (string) ($a['ads'] ?? '');
        $nombres = ['ads_conv_formulario' => 'envío del formulario', 'ads_conv_whatsapp' => 'WhatsApp'];

        foreach ($nombres as $campo => $nombre) {
            $etiqueta = (string) ($a[$campo] ?? '');
            if ($etiqueta === '') {
                continue;
            }
            $cuenta = (string) strstr($etiqueta, '/', true);
            if (!$hay_gtag) {
                $avisos[] = 'La conversión de ' . $nombre . ' (' . $etiqueta . ') no medirá nada: falta el '
                    . 'identificador de Google Ads (o el de Analytics 4) arriba. Sin él, el sitio no carga '
                    . 'la etiqueta de Google y no hay con qué contar la conversión.';
            } elseif ($ads !== $cuenta) {
                $avisos[] = 'La conversión de ' . $nombre . ' (' . $etiqueta . ') es de la cuenta ' . $cuenta
                    . ', pero el identificador de Google Ads configurado es '
                    . ($ads === '' ? 'ninguno' : $ads) . '. Pon aquí el de esa cuenta para que Google '
                    . 'reconozca la conversión.';
            }
        }

        return $avisos;
    }

    /**
     * Guion que cuenta una conversión de Google Ads cuando se envía un
     * formulario o se abre un chat de WhatsApp. Vacío si no hay ninguna etiqueta.
     *
     * Escucha, y sólo escucha, los avisos que el sitio ya emite al enviar:
     *  - `orugantt-forms:enviado` (evento de ventana del motor propio de formularios)
     *  - `gform_confirmation_loaded` (Gravity Forms; lo emite por jQuery, y en
     *    versiones recientes también como evento nativo)
     *  - `cod:whatsapp-enviado` (el chat de WhatsApp del lienzo)
     *
     * NO escucha el `dataLayer` ni el `gtag('event','formulario_enviado')` del
     * motor propio: es el mismo envío contado por otras dos vías y, escuchando
     * las tres, la conversión saldría tres veces. Por la misma razón, quien ya
     * configuró estos eventos dentro de Tag Manager debe dejar estos campos vacíos.
     *
     * Contra el doble conteo hay dos cosas:
     *  1. Se cuenta como mucho una vez por motor dentro de una ventana de 2 s.
     *     Cubre a Gravity Forms avisando por jQuery y por evento nativo a la vez,
     *     y a un aviso repetido por cualquier motivo. 2 s es muchísimo para un
     *     doble disparo del mismo envío y nada para dos envíos reales distintos:
     *     tras enviar, el formulario se reemplaza por su confirmación. Va por
     *     motor y no por formulario porque el evento nativo de Gravity puede no
     *     traer el id y una clave distinta dejaría pasar el duplicado.
     *  2. Aunque el guion se imprima dos veces en la página (otro plugin que
     *     repita `wp_head`, por ejemplo), `window.__codConversiones` hace que la
     *     segunda copia no enganche nada.
     *
     * No viaja nada de lo que la persona escribió: el evento a Google lleva sólo
     * `send_to`. Ni siquiera el id del formulario.
     *
     * @param array<string, mixed> $a
     */
    public static function fragmento_conversiones(array $a): string
    {
        $formulario = (string) ($a['ads_conv_formulario'] ?? '');
        $whatsapp = (string) ($a['ads_conv_whatsapp'] ?? '');
        if ($formulario === '' && $whatsapp === '') {
            return '';
        }

        $js = "(function(w,d){if(w.__codConversiones)return;w.__codConversiones=true;"
            . "var VENTANA=2000,ultimo={};"
            . "function contar(etiqueta,motor){var t=Date.now();"
            . "if(ultimo[motor]!==undefined&&t-ultimo[motor]<VENTANA)return;ultimo[motor]=t;"
            . "if(typeof w.gtag!=='function')return;"
            . "try{w.gtag('event','conversion',{'send_to':etiqueta});}catch(e){}}";

        if ($formulario !== '') {
            $et = esc_js($formulario);
            $js .= "function formulario(){contar('" . $et . "','formulario-propio');}"
                . "function gravity(){contar('" . $et . "','gravity');}"
                . "w.addEventListener('orugantt-forms:enviado',formulario);"
                // Gravity: la forma nativa no necesita jQuery; la de jQuery se
                // engancha en cuanto jQuery exista (puede cargarse al pie, después
                // de este guion) y se salta en silencio si el sitio no lo tiene.
                . "d.addEventListener('gform_confirmation_loaded',gravity);"
                . "var gancho=false;function jq(){if(gancho||!w.jQuery)return;gancho=true;"
                . "try{w.jQuery(d).on('gform_confirmation_loaded',gravity);}catch(e){}}"
                . "jq();d.addEventListener('DOMContentLoaded',jq);w.addEventListener('load',jq);";
        }
        if ($whatsapp !== '') {
            $js .= "w.addEventListener('cod:whatsapp-enviado',function(){contar('" . esc_js($whatsapp) . "','whatsapp');});";
        }
        $js .= "})(window,document);";

        // Una conversión de publicidad es publicidad. Sin esa categoría
        // concedida el guion se queda dormido: no engancha nada y no manda
        // nada. Y aunque despertara por su cuenta, `contar()` comprueba que
        // `gtag` exista, que es justo lo que no existe sin consentimiento.
        return "<!-- Conversiones de Google Ads (ContOpe) -->\n"
            . COD_Consentimiento::abrir_script('marketing') . $js . "</script>\n";
    }

    /**
     * Texto de ayuda por campo, para la pantalla de configuración.
     *
     * @return array<string, array{etiqueta: string, ejemplo: string, ayuda: string}>
     */
    public static function campos_para_pantalla(): array
    {
        return [
            'gtm' => [
                'etiqueta' => 'Google Tag Manager',
                'ejemplo' => 'GTM-ABC1234',
                'ayuda' => 'El contenedor donde después cuelgas todo lo demás sin volver a tocar el sitio. '
                    . 'Aparece arriba a la derecha en tagmanager.google.com.',
            ],
            'ga4' => [
                'etiqueta' => 'Google Analytics 4',
                'ejemplo' => 'G-ABC1234XYZ',
                'ayuda' => 'Sólo si quieres Analytics directo. Si ya lo configuraste dentro de Tag Manager, '
                    . 'deja esto vacío: ponerlo en los dos lados cuenta cada visita dos veces.',
            ],
            'ads' => [
                'etiqueta' => 'Google Ads',
                'ejemplo' => 'AW-123456789',
                'ayuda' => 'El identificador de la cuenta de Ads, para medir conversiones de campaña.',
            ],
            'ads_conv_formulario' => [
                'etiqueta' => 'Conversión de Ads: envío de formulario',
                'ejemplo' => 'AW-123456789/AbC-dEfGhIjKlMnOpQr',
                'ayuda' => 'Cuenta una conversión en Google Ads cada vez que alguien envía un formulario del sitio, '
                    . 'sea el propio de ContOpe o Gravity Forms. Pega lo que te da Google al crear la conversión: '
                    . 'el identificador de la cuenta, una barra y la etiqueta, tal cual (distingue mayúsculas). '
                    . 'Déjalo vacío si ya configuraste esta conversión dentro de Tag Manager: en los dos lados la contaría doble.',
            ],
            'ads_conv_whatsapp' => [
                'etiqueta' => 'Conversión de Ads: envío por WhatsApp',
                'ejemplo' => 'AW-123456789/AbC-dEfGhIjKlMnOpQr',
                'ayuda' => 'Lo mismo, para cuando alguien envía un mensaje desde el chat de WhatsApp del sitio. '
                    . 'Opcional.',
            ],
            'meta_pixel' => [
                'etiqueta' => 'Pixel de Meta (Facebook e Instagram)',
                'ejemplo' => '123456789012345',
                'ayuda' => 'Sólo los números del pixel, sin texto alrededor.',
            ],
        ];
    }
}
