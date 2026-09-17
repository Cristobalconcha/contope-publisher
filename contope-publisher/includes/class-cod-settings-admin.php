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
                                No se guardó
                                <?php
                                $cod_nombres = [];
                                foreach ($cod_medicion_malos as $cod_malo) {
                                    if (isset($cod_medicion_campos[$cod_malo])) {
                                        $cod_nombres[] = $cod_medicion_campos[$cod_malo]['etiqueta']
                                            . ' (se espera algo como ' . $cod_medicion_campos[$cod_malo]['ejemplo'] . ')';
                                    }
                                }
                                echo esc_html(implode('; ', $cod_nombres));
                                ?>.
                                Revisa que esté copiado completo y vuelve a guardar.
                            </p>
                        </div>
                    <?php endif; ?>
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
