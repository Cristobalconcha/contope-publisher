<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla "Configuración" del menú ContOpe Design (M4).
 *
 * v1 expone una única sección, "Definiciones de estilo del tema", renderizada
 * server-side desde COD_Theme_Definitions::schema() + get(). Los valores no se
 * guardan por submit tradicional: la pantalla autoguarda por AJAX (debounce en
 * el cliente) y el botón "Guardar ahora" fuerza el guardado inmediato.
 */
final class COD_Settings_Admin
{
    public const PAGE_SLUG = 'contope-settings';
    public const CAPABILITY = 'manage_options';

    private string $hook_suffix = '';

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_ajax_' . COD_Theme_Definitions::AJAX_SAVE, [$this, 'handle_save']);
        add_action('admin_post_cod_save_whatsapp_number', [$this, 'handle_save_whatsapp']);
        add_action('admin_post_cod_save_icono_estilo', [$this, 'handle_save_icono_estilo']);
        add_action('admin_post_cod_save_embed_origins', [$this, 'handle_save_embed_origins']);
    }

    public function handle_save_whatsapp(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar la configuración.', 'contope-publisher'));
        }
        check_admin_referer('cod_save_whatsapp_number');
        $raw = isset($_POST['cod_whatsapp_number']) ? wp_unslash($_POST['cod_whatsapp_number']) : '';
        $number = preg_replace('/[^0-9]/', '', (string) $raw);
        update_option('cod_whatsapp_number', $number, false);
        wp_safe_redirect(add_query_arg('cod_whatsapp_saved', '1', admin_url('admin.php?page=' . self::PAGE_SLUG)));
        exit;
    }

    /**
     * Guarda el estilo de los iconos del sitio.
     *
     * Un valor que no esté entre los tres se descarta y queda el que había: el
     * ajuste llega de un formulario y no hay por qué confiar en lo que trae.
     */
    public function handle_save_icono_estilo(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar la configuración.', 'contope-publisher'));
        }
        check_admin_referer('cod_save_icono_estilo');
        $estilo = isset($_POST['cod_icono_estilo']) ? (string) wp_unslash($_POST['cod_icono_estilo']) : '';
        if (in_array($estilo, COD_Icono::ESTILOS, true)) {
            update_option(COD_Icono::OPTION_KEY, $estilo, false);
        }
        wp_safe_redirect(add_query_arg('cod_icono_estilo_guardado', '1', admin_url('admin.php?page=' . self::PAGE_SLUG)));
        exit;
    }

    /**
     * Guarda los orígenes que este sitio permite incrustar en un iframe.
     *
     * Se normaliza cada línea a un nombre de host: quien pega la dirección
     * completa del navegador obtiene lo mismo que quien escribe solo el
     * dominio. Las líneas que no son un host se descartan en silencio en vez
     * de rechazar el formulario entero, y lo guardado se muestra de vuelta ya
     * normalizado, así se ve qué quedó.
     */
    public function handle_save_embed_origins(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar la configuración.', 'contope-publisher'));
        }
        check_admin_referer('cod_save_embed_origins');
        $crudo = isset($_POST['cod_embed_origins']) ? (string) wp_unslash($_POST['cod_embed_origins']) : '';
        $hosts = [];
        foreach (preg_split('/[\r\n,]+/', $crudo) ?: [] as $linea) {
            $host = COD_Canvas_Document_Sanitizer::normalize_embed_origin((string) $linea);
            if ($host !== '') {
                $hosts[] = $host;
            }
        }
        update_option(
            COD_Canvas_Document_Sanitizer::OPTION_EMBED_ORIGINS,
            implode("\n", array_values(array_unique($hosts))),
            false
        );
        wp_safe_redirect(add_query_arg('cod_embed_saved', '1', admin_url('admin.php?page=' . self::PAGE_SLUG)));
        exit;
    }

    public function add_menu(): void
    {
        // Ubicado al final del menú ContOpe Design: se registra último.
        $hook_suffix = add_submenu_page(
            COD_Theme_Builder_Admin::PARENT_SLUG,
            'Configuración',
            'Configuración',
            self::CAPABILITY,
            self::PAGE_SLUG,
            [$this, 'render_page']
        );
        $this->hook_suffix = is_string($hook_suffix) ? $hook_suffix : '';
    }

    public function enqueue_assets(string $hook_suffix): void
    {
        if ($this->hook_suffix === '' || $hook_suffix !== $this->hook_suffix) {
            return;
        }
        if (!current_user_can(self::CAPABILITY)) {
            return;
        }

        // El campo de imagen abre la biblioteca de medios de WordPress. Sin

        // esto wp.media no existe y el botón «Elegir…» no hace nada.

        wp_enqueue_media();


        wp_enqueue_style(
            'cod-theme-settings',
            plugins_url('assets/css/cod-theme-settings.css', COD_PUBLISHER_FILE),
            ['dashicons'],
            COD_PUBLISHER_VERSION
        );
        wp_enqueue_script(
            'cod-theme-settings',
            plugins_url('assets/js/cod-theme-settings.js', COD_PUBLISHER_FILE),
            [],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_add_inline_script(
            'cod-theme-settings',
            'window.ocdThemeSettings = ' . wp_json_encode(
                [
                    'ajaxUrl' => admin_url('admin-ajax.php'),
                    'nonce' => wp_create_nonce(COD_Theme_Definitions::NONCE_ACTION),
                    'saveAction' => COD_Theme_Definitions::AJAX_SAVE,
                ],
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            ) . ';',
            'before'
        );
    }

    public function render_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar la configuración.', 'contope-publisher'));
        }

        $values = COD_Theme_Definitions::get();
        $schema = COD_Theme_Definitions::schema();
        ?>
        <div class="wrap cod-settings-wrap">
            <div class="cod-settings-header">
                <h1>Configuración</h1>
                <div class="cod-settings-actions">
                    <button type="button" class="button button-primary" id="cod-settings-save-now">Guardar ahora</button>
                    <span class="cod-settings-status" id="cod-settings-status" role="status" aria-live="polite"></span>
                </div>
            </div>

            <div class="cod-settings-sections">
                <section class="cod-settings-section">
                    <h2>Núcleo del set de diseño</h2>
                    <p class="cod-settings-intro">
                        Las definiciones sin las cuales no hay con qué dibujar un sitio. No
                        importa cuál es el color ni cuál la tipografía: importa que exista la
                        definición. Si falta alguna, el plugin <strong>no pone una suya</strong>:
                        lo dice acá. Pueden venir de los campos de más abajo o del
                        <code>theme.json</code> del tema activo.
                    </p>
                    <?php $nucleo = COD_Design_Core::estado(); ?>
                    <table class="widefat striped" style="max-width:760px">
                        <thead>
                            <tr><th>Definición</th><th>Variable</th><th>Valor</th><th>Declarada en</th></tr>
                        </thead>
                        <tbody>
                        <?php foreach ($nucleo as $rol) : ?>
                            <tr>
                                <td><?php echo esc_html($rol['titulo']); ?></td>
                                <td><code><?php echo esc_html($rol['token']); ?></code></td>
                                <td>
                                    <?php if ($rol['declarado']) : ?>
                                        <?php echo esc_html($rol['valor']); ?>
                                    <?php else : ?>
                                        <strong>sin declarar</strong>
                                    <?php endif; ?>
                                </td>
                                <td><?php echo $rol['declarado'] ? esc_html($rol['origen']) : '—'; ?></td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                    <?php $aviso_nucleo = COD_Design_Core::aviso(); ?>
                    <?php if ($aviso_nucleo !== '') : ?>
                        <div class="notice notice-warning inline" style="margin-top:12px">
                            <p><?php echo esc_html($aviso_nucleo); ?></p>
                        </div>
                    <?php endif; ?>
                </section>

                <section class="cod-settings-section">
                    <h2>Definiciones de estilo del tema</h2>
                    <p class="cod-settings-intro">
                        Los campos sin definir no emiten CSS. Los valores iniciales provienen del
                        tema importado; guardá acá solo lo que quieras aplicar como base del sitio.
                    </p>
                    <form id="cod-settings-form" autocomplete="off">
                        <?php foreach ($schema as $group) : ?>
                            <fieldset class="cod-settings-group">
                                <legend><?php echo esc_html($group['title']); ?></legend>
                                <div class="cod-settings-fields">
                                    <?php foreach ($group['fields'] as $field) : ?>
                                        <?php $this->render_field($field, (string) ($values[$field['id']] ?? '')); ?>
                                    <?php endforeach; ?>
                                </div>
                            </fieldset>
                        <?php endforeach; ?>
                    </form>
                </section>

                <section class="cod-settings-section">
                    <h2>WhatsApp</h2>
                    <p class="cod-settings-intro">
                        Número usado por el ícono de contacto de WhatsApp que aparece en las
                        secciones que lo tengan configurado. El mensaje de cada instancia se edita
                        aparte, en el propio contenido de la página.
                    </p>
                    <?php if (isset($_GET['cod_whatsapp_saved'])) : ?>
                        <div class="notice notice-success"><p>Número de WhatsApp guardado.</p></div>
                    <?php endif; ?>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <input type="hidden" name="action" value="cod_save_whatsapp_number">
                        <?php wp_nonce_field('cod_save_whatsapp_number'); ?>
                        <p>
                            <label for="cod_whatsapp_number">Número (solo dígitos, con código de país, sin +)</label><br>
                            <input type="text" id="cod_whatsapp_number" name="cod_whatsapp_number"
                                value="<?php echo esc_attr((string) get_option('cod_whatsapp_number', '')); ?>"
                                placeholder="56981396967" class="regular-text">
                        </p>
                        <p><button type="submit" class="button button-primary">Guardar número</button></p>
                    </form>
                </section>

                <section class="cod-settings-section" id="cod-iconos">
                    <h2>Iconos</h2>
                    <p class="cod-settings-intro">
                        El estilo de los iconos del sitio. Material trae cada uno en tres, y aquí
                        se elige <em>uno para todo el sitio</em>: si un sitio es redondeado, lo son
                        sus cuarenta iconos. Elegirlo icono por icono es justamente como se
                        desordena un sistema.
                    </p>
                    <p class="cod-settings-intro">
                        Cambiarlo <strong>no exige rehacer ninguna página</strong>: las páginas
                        guardan el nombre del icono, no el archivo, así que el dibujo se resuelve
                        al mostrarlas. Los iconos que uses con un archivo propio —un logotipo, una
                        silueta tuya— no se tocan.
                    </p>
                    <?php if (isset($_GET['cod_icono_estilo_guardado'])) : ?>
                        <div class="notice notice-success"><p>Estilo de iconos guardado.</p></div>
                    <?php endif; ?>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <input type="hidden" name="action" value="cod_save_icono_estilo">
                        <?php wp_nonce_field('cod_save_icono_estilo'); ?>
                        <?php $estilo_actual = COD_Icono::estilo(); ?>
                        <p>
                            <?php foreach (['outlined' => 'De contorno', 'rounded' => 'Redondeado', 'sharp' => 'De ángulo vivo'] as $valor => $rotulo) : ?>
                                <label style="margin-inline-end:18px">
                                    <input type="radio" name="cod_icono_estilo" value="<?php echo esc_attr($valor); ?>"
                                        <?php checked($estilo_actual, $valor); ?>>
                                    <?php echo esc_html($rotulo); ?>
                                </label>
                            <?php endforeach; ?>
                        </p>
                        <p><button type="submit" class="button button-primary">Guardar estilo</button></p>
                    </form>
                </section>

                <section class="cod-settings__section" id="cod-redes">
                    <h2>Redes sociales</h2>
                    <p>
                        Las cuentas oficiales de la empresa. Los enlaces con el logotipo de cada
                        red que hay en las páginas toman la cuenta de aquí, así que si una cuenta
                        cambia —se consolida, se verifica, se cierra— se cambia en este lugar y
                        llega a todo el sitio, sin tocar las páginas.
                    </p>
                    <p>
                        Cada red lleva la <strong>dirección</strong> de la cuenta
                        (<code>https://…</code>, del dominio de esa red) y, si quieres, su
                        <strong>nombre de usuario</strong>, que se escribe como texto junto al
                        logotipo para que quien recibió un mensaje de una cuenta que dice ser la
                        empresa pueda compararlo letra por letra. Deja vacía la dirección de una red
                        que no uses o que cierres: ese logotipo deja de mostrarse (y su nombre de
                        usuario también).
                    </p>
                    <?php
                    $cod_redes = COD_Redes_Sociales::cuentas();
                    $cod_redes_malas = isset($_GET['cod_redes_error'])
                        ? explode(',', sanitize_text_field((string) wp_unslash($_GET['cod_redes_error'])))
                        : [];
                    ?>
                    <?php if (isset($_GET['cod_redes_guardadas']) && $cod_redes_malas === []) : ?>
                        <div class="notice notice-success"><p>Redes sociales guardadas.</p></div>
                    <?php endif; ?>
                    <?php if ($cod_redes_malas !== []) : ?>
                        <div class="notice notice-error">
                            <p>
                                <?php echo esc_html(COD_Redes_Sociales::mensaje_de_errores($cod_redes_malas)); ?>
                                Revisa que esté copiado completo y vuelve a guardar.
                            </p>
                        </div>
                    <?php endif; ?>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <input type="hidden" name="action" value="cod_save_redes_sociales">
                        <?php wp_nonce_field('cod_save_redes_sociales'); ?>
                        <table class="form-table" role="presentation">
                            <tbody>
                            <?php foreach (COD_Redes_Sociales::REDES as $cod_red => $cod_spec) : ?>
                                <tr>
                                    <th scope="row"><?php echo esc_html($cod_spec['name']); ?></th>
                                    <td>
                                        <p>
                                            <label for="cod_redes_<?php echo esc_attr($cod_red); ?>_url">Dirección</label><br>
                                            <input type="url" class="large-text code"
                                                id="cod_redes_<?php echo esc_attr($cod_red); ?>_url"
                                                name="cod_redes_<?php echo esc_attr($cod_red); ?>_url"
                                                value="<?php echo esc_attr((string) ($cod_redes[$cod_red]['url'] ?? '')); ?>"
                                                placeholder="https://www.<?php echo esc_attr($cod_spec['hosts'][0]); ?>/…">
                                        </p>
                                        <p>
                                            <label for="cod_redes_<?php echo esc_attr($cod_red); ?>_handle">Nombre de usuario (opcional)</label><br>
                                            <input type="text" class="regular-text code"
                                                id="cod_redes_<?php echo esc_attr($cod_red); ?>_handle"
                                                name="cod_redes_<?php echo esc_attr($cod_red); ?>_handle"
                                                value="<?php echo esc_attr((string) ($cod_redes[$cod_red]['handle'] ?? '')); ?>"
                                                placeholder="@nombredeusuario" maxlength="80" autocomplete="off">
                                        </p>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                            </tbody>
                        </table>
                        <p><button type="submit" class="button button-primary">Guardar redes sociales</button></p>
                    </form>
                </section>

                <section class="cod-settings__section" id="cod-mapa">
                    <h2>Mapa (Mapbox)</h2>
                    <p>
                        La clave pública de Mapbox que usa el <strong>mapa grande</strong> de las
                        páginas que tienen un mini mapa. Se guarda una sola vez y sirve para todas
                        las páginas: si la cambias, llega a todas sin tocarlas. El mini mapa no la
                        necesita (es una imagen del propio sitio); sin clave el mini se ve igual,
                        pero no se puede abrir el mapa grande y queda como un enlace a «cómo llegar».
                    </p>
                    <?php
                    $cod_mapbox_error = isset($_GET['cod_mapbox_error'])
                        ? sanitize_text_field(rawurldecode((string) wp_unslash($_GET['cod_mapbox_error'])))
                        : '';
                    ?>
                    <?php if (isset($_GET['cod_mapbox_guardada']) && $cod_mapbox_error === '') : ?>
                        <div class="notice notice-success"><p>Clave de Mapbox guardada.</p></div>
                    <?php endif; ?>
                    <?php if ($cod_mapbox_error !== '') : ?>
                        <div class="notice notice-error">
                            <p>No se guardó la clave. <?php echo esc_html($cod_mapbox_error); ?> Se conservó la que había.</p>
                        </div>
                    <?php endif; ?>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <input type="hidden" name="action" value="cod_save_mapbox">
                        <?php wp_nonce_field('cod_save_mapbox'); ?>
                        <p>
                            <label for="cod_mapbox_token">Clave pública de Mapbox (empieza con <code>pk.</code>)</label><br>
                            <input type="text" class="large-text code" id="cod_mapbox_token" name="cod_mapbox_token"
                                value="<?php echo esc_attr((string) COD_Mapa::clave()); ?>"
                                placeholder="pk.eyJ1Ijoi…" autocomplete="off" spellcheck="false">
                        </p>
                        <p class="description">
                            Conviene restringir la clave al dominio de este sitio desde el panel de
                            Mapbox (Access tokens → URL restrictions): la clave queda a la vista en el
                            código de la página y, sin esa restricción, cualquiera puede gastar tu cuota.
                            Deja el campo vacío para quitar la clave.
                        </p>
                        <p><button type="submit" class="button button-primary">Guardar clave de Mapbox</button></p>
                    </form>
                </section>

                <section class="cod-settings__section">
                    <h2>Sitios que puedes incrustar</h2>
                    <p>
                        Un iframe muestra una página de otro sitio <em>dentro</em> de la tuya.
                        YouTube, Vimeo y Google Maps vienen permitidos. Para cualquier otro
                        —un recorrido 360, un plano interactivo, un visor de documentos—
                        escribe acá su dominio, uno por línea. Puedes pegar la dirección
                        completa: se guarda solo el dominio.
                    </p>
                    <?php if (isset($_GET['cod_embed_saved'])) : ?>
                        <div class="notice notice-success"><p>Sitios permitidos guardados.</p></div>
                    <?php endif; ?>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <input type="hidden" name="action" value="cod_save_embed_origins">
                        <?php wp_nonce_field('cod_save_embed_origins'); ?>
                        <p>
                            <label for="cod_embed_origins">Dominios permitidos (uno por línea)</label><br>
                            <textarea id="cod_embed_origins" name="cod_embed_origins" rows="4" class="large-text code"
                                placeholder="www.ejemplo.cl"><?php
                                echo esc_textarea((string) get_option(COD_Canvas_Document_Sanitizer::OPTION_EMBED_ORIGINS, ''));
                            ?></textarea>
                        </p>
                        <p><button type="submit" class="button button-primary">Guardar sitios permitidos</button></p>
                    </form>
                </section>
                <section class="cod-settings__section" id="cod-medicion">
                    <h2>Etiquetas de medición</h2>
                    <p>
                        Acá van los códigos de Google y de Meta. Se pegan los
                        <strong>identificadores</strong>, no el código completo: el sitio arma
                        solo el fragmento que corresponde a cada herramienta, en el lugar
                        correcto de la página. Deja vacío lo que no uses.
                    </p>
                    <p>
                        Con Tag Manager instalado no necesitas volver acá: todo lo demás
                        —Analytics, campañas, mapas de calor— se agrega desde Tag Manager.
                        Este sitio además ya avisa por su cuenta cuando alguien
                        <em>envía el formulario</em> y cuando <em>abre WhatsApp</em>, así que
                        esas dos conversiones quedan disponibles apenas conectes el contenedor.
                    </p>
                    <p>
                        Si en cambio mides con Google Ads directo, sin Tag Manager, pega abajo las
                        etiquetas de conversión del formulario y de WhatsApp: el sitio las cuenta
                        solo, con el formulario propio o con Gravity Forms.
                    </p>
                    <?php
                    $cod_medicion = COD_Medicion::ajustes();
                    $cod_medicion_campos = COD_Medicion::campos_para_pantalla();
                    $cod_medicion_malos = isset($_GET['cod_medicion_error'])
                        ? explode(',', sanitize_text_field((string) wp_unslash($_GET['cod_medicion_error'])))
                        : [];
                    ?>
                    <?php if (isset($_GET['cod_medicion_guardada']) && $cod_medicion_malos === []) : ?>
                        <div class="notice notice-success"><p>Etiquetas de medición guardadas.</p></div>
                    <?php endif; ?>
                    <?php if ($cod_medicion_malos !== []) : ?>
                        <div class="notice notice-error">
                            <p>
                                <?php echo esc_html(COD_Medicion::mensaje_de_errores($cod_medicion_malos)); ?>
                                Revisa que esté copiado completo y vuelve a guardar.
                            </p>
                        </div>
                    <?php endif; ?>
                    <?php foreach (COD_Medicion::avisos_de_conversion($cod_medicion) as $cod_aviso) : ?>
                        <div class="notice notice-warning"><p><?php echo esc_html($cod_aviso); ?></p></div>
                    <?php endforeach; ?>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <input type="hidden" name="action" value="cod_save_medicion">
                        <?php wp_nonce_field('cod_save_medicion'); ?>
                        <table class="form-table" role="presentation">
                            <tbody>
                            <?php foreach ($cod_medicion_campos as $cod_clave => $cod_campo) : ?>
                                <tr>
                                    <th scope="row">
                                        <label for="cod_medicion_<?php echo esc_attr($cod_clave); ?>">
                                            <?php echo esc_html($cod_campo['etiqueta']); ?>
                                        </label>
                                    </th>
                                    <td>
                                        <input type="text" class="regular-text code"
                                            id="cod_medicion_<?php echo esc_attr($cod_clave); ?>"
                                            name="cod_medicion_<?php echo esc_attr($cod_clave); ?>"
                                            value="<?php echo esc_attr((string) $cod_medicion[$cod_clave]); ?>"
                                            placeholder="<?php echo esc_attr($cod_campo['ejemplo']); ?>">
                                        <p class="description"><?php echo esc_html($cod_campo['ayuda']); ?></p>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                                <tr>
                                    <th scope="row">
                                        <label for="cod_medicion_verificaciones">Verificaciones de propiedad</label>
                                    </th>
                                    <td>
                                        <textarea id="cod_medicion_verificaciones" name="cod_medicion_verificaciones"
                                            rows="3" class="large-text code"
                                            placeholder="google-site-verification=abc123..."><?php
                                            echo esc_textarea((string) $cod_medicion['verificaciones']);
                                        ?></textarea>
                                        <p class="description">
                                            Las etiquetas que piden Search Console, Bing o Meta para comprobar
                                            que el sitio es tuyo. Una por línea. Puedes pegar la etiqueta
                                            completa tal como te la dan, o sólo el par
                                            <code>nombre=valor</code>: las dos formas sirven.
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row">
                                        <label for="cod_medicion_consentimiento">Consentimiento</label>
                                    </th>
                                    <td>
                                        <select id="cod_medicion_consentimiento" name="cod_medicion_consentimiento">
                                            <option value="auto" <?php selected($cod_medicion['consentimiento'], 'auto'); ?>>
                                                Esperar el consentimiento (si hay un gestor de cookies)
                                            </option>
                                            <option value="heredado" <?php selected($cod_medicion['consentimiento'], 'heredado'); ?>>
                                                Como antes: medir sin esperar
                                            </option>
                                        </select>
                                        <p class="description">
                                            Con «Esperar», lo de arriba no se carga hasta que la persona acepta las
                                            cookies del banner; es lo que pide la Ley 21.719 desde el 1 de diciembre
                                            de 2026. «Como antes» deja el sitio midiendo desde la primera visita:
                                            es lo que se aplica solo a un sitio que ya medía cuando se actualizó
                                            el plugin, para no cambiarle el comportamiento sin que lo decidas.
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row">Tus propias visitas</th>
                                    <td>
                                        <label for="cod_medicion_excluir_admin">
                                            <input type="checkbox" id="cod_medicion_excluir_admin"
                                                name="cod_medicion_excluir_admin" value="1"
                                                <?php checked($cod_medicion['excluir_admin']); ?>>
                                            No medir las visitas de quien administra el sitio
                                        </label>
                                        <p class="description">
                                            Recomendado. Mientras trabajas en el sitio lo recorres muchas veces,
                                            y esas visitas ensucian los números de las campañas.
                                        </p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <p><button type="submit" class="button button-primary">Guardar etiquetas</button></p>
                    </form>
                </section>
            </div>
        </div>
        <?php
    }

    /**
     * @param array<string, mixed> $field
     */
    private function render_field(array $field, string $value): void
    {
        $id = 'cod-settings-' . $field['id'];
        $type = (string) ($field['type'] ?? 'text');
        $unit = (string) ($field['unit'] ?? '');
        ?>
        <label class="cod-settings-field cod-settings-field--<?php echo esc_attr($type); ?>" for="<?php echo esc_attr($id); ?>">
            <span class="cod-settings-field-label">
                <?php echo esc_html($field['label']); ?>
                <?php if ($unit !== '') : ?>
                    <span class="cod-settings-field-unit"><?php echo esc_html($unit); ?></span>
                <?php endif; ?>
            </span>
            <?php if ($type === 'select') : ?>
                <select id="<?php echo esc_attr($id); ?>" name="<?php echo esc_attr($field['id']); ?>"
                    data-field-id="<?php echo esc_attr($field['id']); ?>">
                    <?php foreach ($field['options'] as $option_value => $option_label) : ?>
                        <option value="<?php echo esc_attr((string) $option_value); ?>"
                            <?php selected($value, (string) $option_value); ?>>
                            <?php echo esc_html($option_label); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            <?php elseif ($type === 'image') : ?>
                <span class="cod-settings-image" data-cod-image-field="<?php echo esc_attr($field['id']); ?>">
                    <span class="cod-settings-image-preview">
                        <?php if ($value !== '') : ?>
                            <img src="<?php echo esc_url($value); ?>" alt="">
                        <?php else : ?>
                            <span class="cod-settings-image-vacio">Sin definir</span>
                        <?php endif; ?>
                    </span>
                    <span class="cod-settings-image-acciones">
                        <button type="button" class="button cod-settings-image-elegir">Elegir…</button>
                        <button type="button" class="button-link cod-settings-image-quitar"
                            <?php disabled($value === ''); ?>>Quitar</button>
                    </span>
                    <input type="hidden" id="<?php echo esc_attr($id); ?>" name="<?php echo esc_attr($field['id']); ?>"
                        data-field-id="<?php echo esc_attr($field['id']); ?>" value="<?php echo esc_attr($value); ?>">
                </span>
            <?php elseif ($type === 'color') : ?>
                <span class="cod-settings-color">
                    <input type="color" id="<?php echo esc_attr($id); ?>" name="<?php echo esc_attr($field['id']); ?>"
                        data-field-id="<?php echo esc_attr($field['id']); ?>"
                        <?php if ($value === '') : ?>data-cod-undefined="1"<?php endif; ?>
                        value="<?php echo esc_attr($value); ?>">
                    <span class="cod-settings-color-value"><?php echo $value !== '' ? esc_html($value) : 'Sin definir'; ?></span>
                </span>
            <?php elseif ($type === 'motion') : ?>
                <input type="text" id="<?php echo esc_attr($id); ?>" name="<?php echo esc_attr($field['id']); ?>"
                    data-field-id="<?php echo esc_attr($field['id']); ?>" value="<?php echo esc_attr($value); ?>"
                    placeholder="<?php echo esc_attr((string) ($field['placeholder'] ?? 'Sin definir')); ?>"
                    spellcheck="false" autocomplete="off">
            <?php else : ?>
                <input type="number" id="<?php echo esc_attr($id); ?>" name="<?php echo esc_attr($field['id']); ?>"
                    data-field-id="<?php echo esc_attr($field['id']); ?>" value="<?php echo esc_attr($value); ?>"
                    placeholder="Sin definir"
                    min="<?php echo esc_attr((string) ($field['min'] ?? '')); ?>"
                    max="<?php echo esc_attr((string) ($field['max'] ?? '')); ?>"
                    step="1">
            <?php endif; ?>
        </label>
        <?php
    }

    public function handle_save(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_send_json_error(['message' => 'Permisos insuficientes.'], 403);
        }
        check_ajax_referer(COD_Theme_Definitions::NONCE_ACTION, 'nonce');

        $raw = isset($_POST['definitions']) ? (string) wp_unslash($_POST['definitions']) : '';
        $decoded = json_decode($raw, true, 8);
        if (!is_array($decoded)) {
            wp_send_json_error(['message' => 'Las definiciones no son un JSON válido.'], 400);
        }

        $values = COD_Theme_Definitions::sanitize($decoded);
        update_option(COD_Theme_Definitions::OPTION_KEY, wp_json_encode($values), false);

        wp_send_json_success($values);
    }
}
