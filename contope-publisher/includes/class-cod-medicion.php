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

        foreach (self::verificaciones_en_lista($a['verificaciones']) as $nombre => $contenido) {
            printf('<meta name="%s" content="%s">' . "\n", esc_attr($nombre), esc_attr($contenido));
        }

        if ($a['gtm'] !== '') {
            // Fragmento oficial de Google Tag Manager. Va lo más arriba posible
            // del head porque Tag Manager tiene que existir antes que cualquier
            // evento que la página empuje al dataLayer: los que este sitio ya
            // emite al enviar el formulario y al abrir WhatsApp.
            echo "<!-- Google Tag Manager (ContOpe) -->\n";
            echo "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':"
                . "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],"
                . "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src="
                . "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);"
                . "})(window,document,'script','dataLayer','" . esc_js($a['gtm']) . "');</script>\n";
            echo "<!-- Fin Google Tag Manager -->\n";
        }

        $gtag = array_values(array_filter([$a['ga4'], $a['ads']]));
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
        }

        if ($a['meta_pixel'] !== '') {
            echo "<!-- Meta Pixel (ContOpe) -->\n";
            echo "<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?"
                . "n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;"
                . "n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;"
                . "t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,"
                . "document,'script','https://connect.facebook.net/en_US/fbevents.js');"
                . "fbq('init','" . esc_js($a['meta_pixel']) . "');fbq('track','PageView');</script>\n";
        }
    }

    public function imprimir_tras_body(): void
    {
        if (!$this->debe_medir()) {
            return;
        }
        $a = self::ajustes();

        if ($a['gtm'] !== '') {
            printf(
                '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=%s"'
                    . ' height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>' . "\n",
                esc_attr($a['gtm'])
            );
        }
        if ($a['meta_pixel'] !== '') {
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

    public function guardar(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar la configuración.', 'contope-publisher'));
        }
        check_admin_referer('cod_save_medicion');

        $errores = [];
        $valores = ['excluir_admin' => !empty($_POST['cod_medicion_excluir_admin'])];

        foreach (self::formatos() as $campo => $formato) {
            $crudo = isset($_POST['cod_medicion_' . $campo])
                ? trim((string) wp_unslash($_POST['cod_medicion_' . $campo]))
                : '';
            if ($campo === 'meta_pixel') {
                $crudo = preg_replace('/\D/', '', $crudo) ?? '';
            } else {
                $crudo = strtoupper($crudo);
            }
            if ($crudo === '') {
                $valores[$campo] = '';
                continue;
            }
            if (!preg_match($formato['patron'], $crudo)) {
                $errores[] = $campo;
                $valores[$campo] = '';
                continue;
            }
            $valores[$campo] = $crudo;
        }

        $verificaciones = isset($_POST['cod_medicion_verificaciones'])
            ? (string) wp_unslash($_POST['cod_medicion_verificaciones'])
            : '';
        $lineas = [];
        foreach (self::verificaciones_en_lista($verificaciones) as $nombre => $contenido) {
            $lineas[] = $nombre . '=' . $contenido;
        }
        $valores['verificaciones'] = implode("\n", $lineas);

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
            'meta_pixel' => [
                'etiqueta' => 'Pixel de Meta (Facebook e Instagram)',
                'ejemplo' => '123456789012345',
                'ayuda' => 'Sólo los números del pixel, sin texto alrededor.',
            ],
        ];
    }
}
