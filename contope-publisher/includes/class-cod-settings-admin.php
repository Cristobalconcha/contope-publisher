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
