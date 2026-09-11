<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Registra como adjuntos reales de la Biblioteca de medios los archivos que
 * ya están copiados bajo `wp-content/uploads/` (en la práctica, bajo
 * `wp-content/uploads/contope/`).
 *
 * La resolución de URLs para renderizar NO cambia: sigue a cargo de
 * `COD_Canvas_Asset_Resolver`. Esta clase solo agrega el adjunto para que la
 * Biblioteca de medios deje de estar vacía y herramientas nativas de
 * WordPress (thumbnails, metadata, búsquedas por adjunto, etc.) vean esos
 * archivos.
 */
final class COD_Media_Attachment_Sync
{
    /**
     * Sincroniza un único archivo ya copiado con su adjunto real.
     *
     * Es idempotente: la clave de unicidad es la ruta relativa a
     * `wp-content/uploads/` guardada en `_wp_attached_file`, no el nombre de
     * archivo. Dos archivos con el mismo nombre en subcarpetas distintas
     * tienen rutas relativas distintas y por lo tanto producen adjuntos
     * distintos (no se pisan ni se duplican).
     *
     * @param string $absolute_path Ruta absoluta del archivo ya copiado.
     * @return int|WP_Error ID del adjunto (nuevo o existente) o WP_Error.
     */
    public function sync_file(string $absolute_path)
    {
        $result = $this->sync_file_with_status($absolute_path);
        if (is_wp_error($result)) {
            return $result;
        }

        return $result['attachment_id'];
    }

    /**
     * Igual que `sync_file()`, pero además informa si el adjunto se creó en
     * esta corrida o si ya existía. Útil para el comando de backfill.
     *
     * @param string $absolute_path Ruta absoluta del archivo ya copiado.
     * @return array{attachment_id: int, created: bool}|WP_Error
     */
    public function sync_file_with_status(string $absolute_path)
    {
        $absolute_path = wp_normalize_path($absolute_path);
        if (!is_file($absolute_path)) {
            return new WP_Error('cod_media_sync_missing_file', "No existe el archivo $absolute_path.");
        }

        $upload_dir = wp_get_upload_dir();
        if (!empty($upload_dir['error'])) {
            return new WP_Error('cod_media_sync_upload_dir', (string) $upload_dir['error']);
        }

        $basedir = wp_normalize_path((string) $upload_dir['basedir']);
        $relative = $this->relative_to_uploads($absolute_path, $basedir);
        if ($relative === null) {
            return new WP_Error('cod_media_sync_outside_uploads', "El archivo $absolute_path no está dentro del directorio de uploads.");
        }

        $existing_id = $this->find_by_attached_file($relative);
        if ($existing_id !== null) {
            return ['attachment_id' => $existing_id, 'created' => false];
        }

        $attachment_id = $this->create_attachment($absolute_path, $relative);
        if (is_wp_error($attachment_id)) {
            return $attachment_id;
        }

        return ['attachment_id' => $attachment_id, 'created' => true];
    }

    /**
     * Indica si un archivo es un tamaño intermedio generado por WordPress
     * (p. ej. `dif-1-300x225.jpg`) y no un archivo fuente.
     *
     * Heurística deliberadamente conservadora: además de cumplir el patrón
     * `-WxH.ext`, debe existir en el mismo directorio el archivo base
     * (`dif-1.jpg`). Los tamaños intermedios legítimos siempre tienen un
     * original al lado; un activo real llamado `hero-300x200.jpg` sin
     * `hero.jpg` al lado no se descartaría.
     *
     * @param string $absolute_path Ruta absoluta del archivo.
     */
    public function is_generated_image_size(string $absolute_path): bool
    {
        $filename = basename(wp_normalize_path($absolute_path));
        if (!preg_match('/^(.*)-(\d+)x(\d+)\.(jpe?g|png|gif|webp|avif)$/i', $filename, $matches)) {
            return false;
        }

        $base_filename = $matches[1] . '.' . $matches[4];
        $base_path = dirname(wp_normalize_path($absolute_path)) . '/' . $base_filename;

        return is_file($base_path);
    }

    /**
     * @return string|null Ruta relativa a uploads, o null si queda fuera.
     */
    private function relative_to_uploads(string $absolute_path, string $basedir): ?string
    {
        $base = trailingslashit($basedir);
        if (!str_starts_with($absolute_path, $base)) {
            return null;
        }

        $relative = ltrim(substr($absolute_path, strlen($base)), '/');

        return $relative === '' ? null : $relative;
    }

    /**
     * @return int|null ID del adjunto que ya apunta a esa ruta relativa, o null.
     */
    private function find_by_attached_file(string $relative): ?int
    {
        $ids = get_posts([
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'numberposts' => 1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_query' => [
                [
                    'key' => '_wp_attached_file',
                    'value' => $relative,
                    'compare' => '=',
                ],
            ],
        ]);

        if ($ids === []) {
            return null;
        }

        return (int) $ids[0];
    }

    /**
     * @return int|WP_Error
     */
    private function create_attachment(string $absolute_path, string $relative)
    {
        $filename = basename($absolute_path);

        $mime_type = wp_check_filetype($filename)['type'];
        if (!$mime_type && function_exists('mime_content_type')) {
            $detected = mime_content_type($absolute_path);
            if (is_string($detected) && $detected !== '') {
                $mime_type = $detected;
            }
        }
        if (!$mime_type) {
            $mime_type = 'application/octet-stream';
        }

        $attachment_id = wp_insert_attachment([
            'post_mime_type' => $mime_type,
            'post_title' => wp_basename($filename),
            'post_status' => 'inherit',
        ], $relative, 0, true);

        if (is_wp_error($attachment_id)) {
            return $attachment_id;
        }
        if ($attachment_id === 0) {
            return new WP_Error('cod_media_sync_insert_failed', "No fue posible insertar el adjunto para $relative.");
        }

        $attachment_id = (int) $attachment_id;

        // `wp_generate_attachment_metadata()` vive en wp-admin/includes/image.php,
        // que no siempre está cargado (p. ej. en un import vía WP-CLI o en un
        // gancho de admin sin carga de medios). Para video/audio también se
        // necesita media.php (`wp_read_video_metadata` / `wp_read_audio_metadata`).
        if (!function_exists('wp_generate_attachment_metadata')) {
            require_once ABSPATH . 'wp-admin/includes/image.php';
        }
        if (!function_exists('wp_read_video_metadata') || !function_exists('wp_read_audio_metadata')) {
            require_once ABSPATH . 'wp-admin/includes/media.php';
        }

        $metadata = wp_generate_attachment_metadata($attachment_id, $absolute_path);
        if (!is_array($metadata)) {
            $metadata = [];
        }
        wp_update_attachment_metadata($attachment_id, $metadata);

        return $attachment_id;
    }
}
