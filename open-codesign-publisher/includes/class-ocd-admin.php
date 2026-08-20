<?php

if (!defined('ABSPATH')) {
    exit;
}

final class OCD_Admin
{
    private const ACTION = 'ocd_import_project';

    public const MENU_SLUG = 'open-codesign-publisher';
    public const CAPABILITY = 'manage_options';

    public function __construct(private OCD_Importer $importer)
    {
    }

    public function register(): void
    {
        // Sin entrada de menú propia: OCD_Site_Package_Admin (Portabilidad)
        // es ahora la única pantalla del menú "Open CoDesign" y cubre este
        // caso de uso. El handler de abajo queda activo por compatibilidad
        // con cualquier formulario ya enviado, pero no hay forma de llegar
        // a esta pantalla desde la interfaz.
        add_action('admin_post_' . self::ACTION, [$this, 'handle_import']);
    }

    public function render_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para importar proyectos.', 'open-codesign-publisher'));
        }
        $status = isset($_GET['ocd_status']) ? sanitize_key(wp_unslash($_GET['ocd_status'])) : '';
        ?>
        <div class="wrap">
            <h1>Open CoDesign Publisher</h1>
            <?php if ($status === 'success') : ?>
                <div class="notice notice-success"><p>Las páginas se crearon como borradores.</p></div>
            <?php elseif ($status === 'error') : ?>
                <div class="notice notice-error"><p><?php echo esc_html(get_transient($this->error_key()) ?: 'No fue posible importar el proyecto.'); ?></p></div>
                <?php delete_transient($this->error_key()); ?>
            <?php endif; ?>
            <p>Importa una descripción estructurada. Este prototipo nunca publica automáticamente.</p>
            <form method="post" enctype="multipart/form-data" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="<?php echo esc_attr(self::ACTION); ?>">
                <?php wp_nonce_field(self::ACTION); ?>
                <input type="file" name="ocd_project" accept="application/json,.json" required>
                <?php submit_button('Importar como borradores'); ?>
            </form>
        </div>
        <?php
    }

    public function handle_import(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para importar proyectos.', 'open-codesign-publisher'));
        }
        check_admin_referer(self::ACTION);

        $file = $_FILES['ocd_project'] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
            $this->redirect_error('No se recibió un archivo válido.');
        }
        if (($file['size'] ?? 0) > 2 * MB_IN_BYTES) {
            $this->redirect_error('El archivo supera el límite de 2 MB.');
        }

        $json = file_get_contents($file['tmp_name']);
        if (!is_string($json)) {
            $this->redirect_error('No fue posible leer el archivo.');
        }
        $result = $this->importer->import_json($json);
        if (is_wp_error($result)) {
            $this->redirect_error($result->get_error_message());
        }

        wp_safe_redirect(add_query_arg(['page' => self::MENU_SLUG, 'ocd_status' => 'success'], admin_url('admin.php')));
        exit;
    }

    private function redirect_error(string $message): void
    {
        set_transient($this->error_key(), $message, MINUTE_IN_SECONDS);
        wp_safe_redirect(add_query_arg(['page' => self::MENU_SLUG, 'ocd_status' => 'error'], admin_url('admin.php')));
        exit;
    }

    private function error_key(): string
    {
        return 'ocd_import_error_' . get_current_user_id();
    }
}

