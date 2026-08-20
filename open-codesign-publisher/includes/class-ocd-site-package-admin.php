<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla "Empaquetar sitio": exporta un ZIP portable con las páginas
 * Canvas publicadas (más su plantilla global activa y medios referenciados)
 * y permite importar ese mismo tipo de paquete generado en otra
 * instalación. Ver OCD_Site_Package_Exporter / OCD_Site_Package_Importer.
 */
final class OCD_Site_Package_Admin
{
    private const EXPORT_ACTION = 'ocd_export_site_package';
    private const IMPORT_ACTION = 'ocd_import_site_package';
    // Mismo slug que OCD_Admin usaba: es el que "Editor de página",
    // "Plantillas" y "Configuración" ya esperan como padre. Cambiarlo acá
    // por uno propio los deja huérfanos (bug real, encontrado 2026-08-19).
    public const MENU_SLUG = OCD_Admin::MENU_SLUG;
    public const CAPABILITY = 'manage_options';

    public function __construct(
        private OCD_Site_Package_Exporter $exporter,
        private OCD_Site_Package_Importer $importer
    ) {
    }

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_post_' . self::EXPORT_ACTION, [$this, 'handle_export']);
        add_action('admin_post_' . self::IMPORT_ACTION, [$this, 'handle_import']);
    }

    public function add_menu(): void
    {
        add_menu_page(
            'Open CoDesign',
            'Open CoDesign',
            self::CAPABILITY,
            self::MENU_SLUG,
            [$this, 'render_page'],
            'dashicons-layout',
            58
        );

        add_submenu_page(
            self::MENU_SLUG,
            'Portabilidad',
            'Portabilidad',
            self::CAPABILITY,
            self::MENU_SLUG,
            [$this, 'render_page']
        );
    }

    public function render_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para empaquetar el sitio.', 'open-codesign-publisher'));
        }
        $status = isset($_GET['ocd_status']) ? sanitize_key(wp_unslash($_GET['ocd_status'])) : '';
        ?>
        <div class="wrap">
            <h1>Portabilidad</h1>
            <p>Mover el contenido de Open CoDesign entre dos instalaciones que tengan este mismo plugin (como una funcionalidad de exportar/importar de Divi, no un backup).</p>
            <?php if ($status === 'import_success') : ?>
                <div class="notice notice-success"><p>Paquete importado correctamente.</p></div>
            <?php elseif ($status === 'error') : ?>
                <div class="notice notice-error"><p><?php echo esc_html(get_transient($this->error_key()) ?: 'La operación falló.'); ?></p></div>
                <?php delete_transient($this->error_key()); ?>
            <?php endif; ?>

            <h2>Exportar</h2>
            <p>Genera un ZIP con las páginas publicadas respaldadas por un documento Canvas y la plantilla de header/footer global activa. Elegí si incluir también los archivos de <code>uploads/</code> que referencian.</p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="<?php echo esc_attr(self::EXPORT_ACTION); ?>">
                <?php wp_nonce_field(self::EXPORT_ACTION); ?>
                <p>
                    <label>
                        <input type="radio" name="ocd_include_media" value="1" checked>
                        Sitio completo (páginas + imágenes/video)
                    </label>
                    <br>
                    <label>
                        <input type="radio" name="ocd_include_media" value="0">
                        Solo estructura (páginas y texto, sin medios — mucho más liviano; usalo cuando lo único que cambió es contenido, no imágenes)
                    </label>
                </p>
                <?php submit_button('Descargar paquete'); ?>
            </form>

            <hr>

            <h2>Importar</h2>
            <p>Sube un paquete generado por esta misma pantalla en otra instalación — completo o solo estructura, cualquiera de los dos funciona acá. Las páginas y documentos existentes con el mismo identificador se actualizan; no se duplican.</p>
            <form method="post" enctype="multipart/form-data" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="<?php echo esc_attr(self::IMPORT_ACTION); ?>">
                <?php wp_nonce_field(self::IMPORT_ACTION); ?>
                <input type="file" name="ocd_site_package" accept="application/zip,.zip" required>
                <?php submit_button('Importar paquete'); ?>
            </form>
        </div>
        <?php
    }

    public function handle_export(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para empaquetar el sitio.', 'open-codesign-publisher'));
        }
        check_admin_referer(self::EXPORT_ACTION);

        $include_media = ($_POST['ocd_include_media'] ?? '1') === '1';

        $zip_path = $this->exporter->export($include_media);
        if (is_wp_error($zip_path)) {
            $this->redirect_error($zip_path->get_error_message());
        }

        $suffix = $include_media ? 'completo' : 'estructura';
        $filename = 'open-codesign-site-' . $suffix . '-' . gmdate('Ymd-His') . '.zip';
        nocache_headers();
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . filesize($zip_path));
        readfile($zip_path);
        wp_delete_file($zip_path);
        exit;
    }

    public function handle_import(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para importar el sitio.', 'open-codesign-publisher'));
        }
        check_admin_referer(self::IMPORT_ACTION);

        $file = $_FILES['ocd_site_package'] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
            $this->redirect_error('No se recibió un archivo válido.');
        }

        $result = $this->importer->import($file['tmp_name']);
        if (is_wp_error($result)) {
            $this->redirect_error($result->get_error_message());
        }

        wp_safe_redirect(add_query_arg(['page' => self::MENU_SLUG, 'ocd_status' => 'import_success'], admin_url('admin.php')));
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
        return 'ocd_site_package_error_' . get_current_user_id();
    }
}
