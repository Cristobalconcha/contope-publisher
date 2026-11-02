<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla "Portabilidad": exporta el sitio como un paquete `.ocdsite` (un ZIP:
 * páginas del lienzo y en bloques, encabezado y pie, ADN, medios y el estado del sitio:
 * título, enlaces permanentes, logo e ícono, menús, íconos y hojas de diseño) y permite
 * importar un paquete generado en otra instalación. Es la vía de PRODUCCIÓN para
 * subir un sitio armado en el local: exportar allá, importar acá. Ver
 * COD_Site_Package_Exporter / COD_Site_Package_Importer.
 */
final class COD_Site_Package_Admin
{
    private const EXPORT_ACTION = 'cod_export_site_package';
    private const IMPORT_ACTION = 'cod_import_site_package';
    private const OK_PREFIX = 'cod_site_package_ok_';
    // Mismo slug que COD_Admin usaba: es el que "Editor de página",
    // "Plantillas" y "Configuración" ya esperan como padre. Cambiarlo acá
    // por uno propio los deja huérfanos (bug real, encontrado 2026-08-19).
    public const MENU_SLUG = COD_Admin::MENU_SLUG;
    public const CAPABILITY = 'manage_options';

    public function __construct(
        private COD_Site_Package_Exporter $exporter,
        private COD_Site_Package_Importer $importer
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
            'ContOpe Design',
            'ContOpe Design',
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
            wp_die(esc_html__('No tienes permisos para empaquetar el sitio.', 'contope-publisher'));
        }
        $status = isset($_GET['cod_status']) ? sanitize_key(wp_unslash($_GET['cod_status'])) : '';
        ?>
        <div class="wrap">
            <h1>Portabilidad</h1>
            <p>Mover el contenido de ContOpe Design entre dos instalaciones que tengan este mismo plugin (como una funcionalidad de exportar/importar de Divi, no un backup).</p>
            <?php if ($status === 'import_success') : ?>
                <div class="notice notice-success"><p>Paquete importado correctamente.</p>
                    <?php $resumen = get_transient($this->ok_key()); delete_transient($this->ok_key()); ?>
                    <?php if (is_array($resumen)) : ?>
                        <ul style="list-style:disc;margin-left:1.5em">
                            <?php foreach ($resumen as $linea) : ?>
                                <li><?php echo esc_html((string) $linea); ?></li>
                            <?php endforeach; ?>
                        </ul>
                    <?php endif; ?>
                </div>
            <?php elseif ($status === 'error') : ?>
                <div class="notice notice-error"><p><?php echo esc_html(get_transient($this->error_key()) ?: 'La operación falló.'); ?></p></div>
                <?php delete_transient($this->error_key()); ?>
            <?php endif; ?>

            <h2>Exportar</h2>
            <p>Genera un paquete <code>.ocdsite</code> (un ZIP) con las páginas publicadas del lienzo y las páginas en bloques (su contenido exacto), el encabezado y el pie globales, los estilos compartidos, el estado del sitio (título y descripción, enlaces permanentes, logo e ícono, menús y navegaciones, set de íconos, hojas de diseño) y, si el sitio tiene uno activo, el ADN de diseño. Nada viaja por número de WordPress: lo que apunta a una página o categoría viaja por su nombre y se vuelve a enlazar en el destino. Elige si incluir también los archivos de <code>uploads/</code> que esas páginas citan.</p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="<?php echo esc_attr(self::EXPORT_ACTION); ?>">
                <?php wp_nonce_field(self::EXPORT_ACTION); ?>
                <p>
                    <label>
                        <input type="radio" name="cod_include_media" value="1" checked>
                        Sitio completo (páginas + imágenes/video)
                    </label>
                    <br>
                    <label>
                        <input type="radio" name="cod_include_media" value="0">
                        Solo estructura (páginas, texto y ADN, sin medios — mucho más liviano; úsalo cuando lo único que cambió es contenido, no imágenes)
                    </label>
                </p>
                <?php submit_button('Descargar paquete'); ?>
            </form>

            <hr>

            <h2>Importar</h2>
            <p>Sube un paquete generado por esta misma pantalla en otra instalación — completo o solo estructura, cualquiera de los dos funciona acá. Las páginas y documentos existentes con el mismo identificador se actualizan; no se duplican. Si el paquete trae un ADN de diseño, se activa por la misma puerta que la pantalla «Diseño (ADN)». Antes de escribir nada se revisa todo el paquete: si algo no pasa, el sitio queda como estaba. Un ajuste de este sitio (título, menús, logo…) que se editó después de la última importación no se pisa: el paquete se rechaza entero, salvo que marques la casilla de reemplazo.</p>
            <form method="post" enctype="multipart/form-data" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="<?php echo esc_attr(self::IMPORT_ACTION); ?>">
                <?php wp_nonce_field(self::IMPORT_ACTION); ?>
                <input type="file" name="cod_site_package" accept="application/zip,.zip,.ocdsite" required>
                <p>
                    <label>
                        <input type="checkbox" name="cod_replace_edited_blocks" value="1">
                        Reemplazar lo que se editó en este sitio: páginas en bloques y ajustes (título, menús, logo, enlaces permanentes…) (por defecto NO: si el paquete trae algo que aquí ya tiene ediciones distintas, el paquete se rechaza entero y no se toca nada)
                    </label>
                </p>
                <?php submit_button('Importar paquete'); ?>
            </form>
        </div>
        <?php
    }

    public function handle_export(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para empaquetar el sitio.', 'contope-publisher'));
        }
        check_admin_referer(self::EXPORT_ACTION);

        $include_media = ($_POST['cod_include_media'] ?? '1') === '1';

        $zip_path = $this->exporter->export($include_media);
        if (is_wp_error($zip_path)) {
            $this->redirect_error($zip_path->get_error_message());
        }

        $suffix = $include_media ? 'completo' : 'estructura';
        $filename = 'contope-site-' . $suffix . '-' . gmdate('Ymd-His') . '.zip';
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
            wp_die(esc_html__('No tienes permisos para importar el sitio.', 'contope-publisher'));
        }
        check_admin_referer(self::IMPORT_ACTION);

        $file = $_FILES['cod_site_package'] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
            $this->redirect_error('No se recibió un archivo válido.');
        }

        $result = $this->importer->import($file['tmp_name'], [
            'replace_edited_blocks' => ($_POST['cod_replace_edited_blocks'] ?? '') === '1',
        ]);
        if (is_wp_error($result)) {
            $this->redirect_error($result->get_error_message());
        }
        set_transient($this->ok_key(), $this->resumen($result), MINUTE_IN_SECONDS * 5);

        wp_safe_redirect(add_query_arg(['page' => self::MENU_SLUG, 'cod_status' => 'import_success'], admin_url('admin.php')));
        exit;
    }

    /**
     * @param array<string, mixed> $r
     * @return array<int, string>
     */
    private function resumen(array $r): array
    {
        $lineas = [sprintf('%d páginas (%d en bloques), %d documentos, %d archivos de medios copiados.', count($r['pages']), (int) ($r['blockPages'] ?? 0), count($r['documents']), (int) $r['mediaCopied'])];
        if (is_array($r['adn'] ?? null)) {
            $lineas[] = sprintf('ADN %s revisión %d: %s.', (string) $r['adn']['designId'], (int) $r['adn']['revision'], (string) $r['adn']['resultado']);
        }
        if (!empty($r['mediaMissing'])) {
            $lineas[] = sprintf('Faltan %d archivos de medios que el paquete no trae (era «solo estructura») y este sitio no tiene.', count((array) $r['mediaMissing']));
        }
        if (is_array($r['frontPage'] ?? null) && !empty($r['frontPage']['aplicada'])) {
            $lineas[] = 'Se fijó la página de portada.';
        }
        if (!empty($r['sitio'])) {
            $lineas[] = sprintf('Estado del sitio: %d elementos escritos (ajustes, marca, menús, navegaciones).', count((array) $r['sitio']));
        }
        foreach ((array) ($r['avisos'] ?? []) as $aviso) {
            $lineas[] = 'Aviso: ' . (string) $aviso;
        }
        return $lineas;
    }

    private function ok_key(): string
    {
        return self::OK_PREFIX . get_current_user_id();
    }

    private function redirect_error(string $message): void
    {
        set_transient($this->error_key(), $message, MINUTE_IN_SECONDS);
        wp_safe_redirect(add_query_arg(['page' => self::MENU_SLUG, 'cod_status' => 'error'], admin_url('admin.php')));
        exit;
    }

    private function error_key(): string
    {
        return 'cod_site_package_error_' . get_current_user_id();
    }
}
