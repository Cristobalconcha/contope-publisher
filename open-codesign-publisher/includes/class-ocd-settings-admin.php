<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla "Configuración" del menú Open CoDesign (M4).
 *
 * v1 expone una única sección, "Definiciones de estilo del tema", renderizada
 * server-side desde OCD_Theme_Definitions::schema() + get(). Los valores no se
 * guardan por submit tradicional: la pantalla autoguarda por AJAX (debounce en
 * el cliente) y el botón "Guardar ahora" fuerza el guardado inmediato.
 */
final class OCD_Settings_Admin
{
    public const PAGE_SLUG = 'open-codesign-settings';
    public const CAPABILITY = 'manage_options';

    private string $hook_suffix = '';

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_ajax_' . OCD_Theme_Definitions::AJAX_SAVE, [$this, 'handle_save']);
        add_action('admin_post_ocd_save_whatsapp_number', [$this, 'handle_save_whatsapp']);
    }

    public function handle_save_whatsapp(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar la configuración.', 'open-codesign-publisher'));
        }
        check_admin_referer('ocd_save_whatsapp_number');
        $raw = isset($_POST['ocd_whatsapp_number']) ? wp_unslash($_POST['ocd_whatsapp_number']) : '';
        $number = preg_replace('/[^0-9]/', '', (string) $raw);
        update_option('ocd_whatsapp_number', $number, false);
        wp_safe_redirect(add_query_arg('ocd_whatsapp_saved', '1', admin_url('admin.php?page=' . self::PAGE_SLUG)));
        exit;
    }

    public function add_menu(): void
    {
        // Ubicado al final del menú Open CoDesign: se registra último.
        $hook_suffix = add_submenu_page(
            OCD_Theme_Builder_Admin::PARENT_SLUG,
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
            'ocd-theme-settings',
            plugins_url('assets/css/ocd-theme-settings.css', OCD_PUBLISHER_FILE),
            ['dashicons'],
            OCD_PUBLISHER_VERSION
        );
        wp_enqueue_script(
            'ocd-theme-settings',
            plugins_url('assets/js/ocd-theme-settings.js', OCD_PUBLISHER_FILE),
            [],
            OCD_PUBLISHER_VERSION,
            true
        );
        wp_add_inline_script(
            'ocd-theme-settings',
            'window.ocdThemeSettings = ' . wp_json_encode(
                [
                    'ajaxUrl' => admin_url('admin-ajax.php'),
                    'nonce' => wp_create_nonce(OCD_Theme_Definitions::NONCE_ACTION),
                    'saveAction' => OCD_Theme_Definitions::AJAX_SAVE,
                ],
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            ) . ';',
            'before'
        );
    }

    public function render_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para gestionar la configuración.', 'open-codesign-publisher'));
        }

        $values = OCD_Theme_Definitions::get();
        $schema = OCD_Theme_Definitions::schema();
        ?>
        <div class="wrap ocd-settings-wrap">
            <div class="ocd-settings-header">
                <h1>Configuración</h1>
                <div class="ocd-settings-actions">
                    <button type="button" class="button button-primary" id="ocd-settings-save-now">Guardar ahora</button>
                    <span class="ocd-settings-status" id="ocd-settings-status" role="status" aria-live="polite"></span>
                </div>
            </div>

            <div class="ocd-settings-sections">
                <section class="ocd-settings-section">
                    <h2>Definiciones de estilo del tema</h2>
                    <p class="ocd-settings-intro">
                        Los campos sin definir no emiten CSS. Los valores iniciales provienen del
                        tema importado; guardá acá solo lo que quieras aplicar como base del sitio.
                    </p>
                    <form id="ocd-settings-form" autocomplete="off">
                        <?php foreach ($schema as $group) : ?>
                            <fieldset class="ocd-settings-group">
                                <legend><?php echo esc_html($group['title']); ?></legend>
                                <div class="ocd-settings-fields">
                                    <?php foreach ($group['fields'] as $field) : ?>
                                        <?php $this->render_field($field, (string) ($values[$field['id']] ?? '')); ?>
                                    <?php endforeach; ?>
                                </div>
                            </fieldset>
                        <?php endforeach; ?>
                    </form>
                </section>

                <section class="ocd-settings-section">
                    <h2>WhatsApp</h2>
                    <p class="ocd-settings-intro">
                        Número usado por el ícono de contacto de WhatsApp que aparece en las
                        secciones que lo tengan configurado. El mensaje de cada instancia se edita
                        aparte, en el propio contenido de la página.
                    </p>
                    <?php if (isset($_GET['ocd_whatsapp_saved'])) : ?>
                        <div class="notice notice-success"><p>Número de WhatsApp guardado.</p></div>
                    <?php endif; ?>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <input type="hidden" name="action" value="ocd_save_whatsapp_number">
                        <?php wp_nonce_field('ocd_save_whatsapp_number'); ?>
                        <p>
                            <label for="ocd_whatsapp_number">Número (solo dígitos, con código de país, sin +)</label><br>
                            <input type="text" id="ocd_whatsapp_number" name="ocd_whatsapp_number"
                                value="<?php echo esc_attr((string) get_option('ocd_whatsapp_number', '')); ?>"
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
        $id = 'ocd-settings-' . $field['id'];
        $type = (string) ($field['type'] ?? 'text');
        $unit = (string) ($field['unit'] ?? '');
        ?>
        <label class="ocd-settings-field ocd-settings-field--<?php echo esc_attr($type); ?>" for="<?php echo esc_attr($id); ?>">
            <span class="ocd-settings-field-label">
                <?php echo esc_html($field['label']); ?>
                <?php if ($unit !== '') : ?>
                    <span class="ocd-settings-field-unit"><?php echo esc_html($unit); ?></span>
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
                <span class="ocd-settings-color">
                    <input type="color" id="<?php echo esc_attr($id); ?>" name="<?php echo esc_attr($field['id']); ?>"
                        data-field-id="<?php echo esc_attr($field['id']); ?>"
                        <?php if ($value === '') : ?>data-ocd-undefined="1"<?php endif; ?>
                        value="<?php echo esc_attr($value); ?>">
                    <span class="ocd-settings-color-value"><?php echo $value !== '' ? esc_html($value) : 'Sin definir'; ?></span>
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
        check_ajax_referer(OCD_Theme_Definitions::NONCE_ACTION, 'nonce');

        $raw = isset($_POST['definitions']) ? (string) wp_unslash($_POST['definitions']) : '';
        $decoded = json_decode($raw, true, 8);
        if (!is_array($decoded)) {
            wp_send_json_error(['message' => 'Las definiciones no son un JSON válido.'], 400);
        }

        $values = OCD_Theme_Definitions::sanitize($decoded);
        update_option(OCD_Theme_Definitions::OPTION_KEY, wp_json_encode($values), false);

        wp_send_json_success($values);
    }
}
