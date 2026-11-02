<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Escribe una página cuyo contenido son bloques de WordPress, por la compuerta del diseño.
 *
 * Es la vía OFICIAL para que una IA cambie el contenido de una página en bloques: la REST cruda
 * (`wp/v2/pages`) con una contraseña de aplicación también pasa por la compuerta, pero esta vía
 * trae además la revisión esperada (no pisa lo que otro escribió) y devuelve el informe de la
 * compuerta junto con la respuesta.
 *
 * El contenido llega SERIALIZADO (el mismo texto que WordPress guarda en `post_content`, con sus
 * comentarios `<!-- wp:… -->`). La compuerta lo parsea con `parse_blocks` y revisa los atributos de
 * cada bloque, el HTML que guarda y las clases `has-*`. Un bloque sólo puede llevar REFERENCIAS al
 * diseño del sitio (un slug de preset, `var:preset|spacing|40`, `var(--wp--custom--radius--m)`);
 * un literal (`#123456`, `18px`, `'Roboto'`) se rechaza con el código y la ruta de lo rechazado.
 *
 * La revisión (`expectedRevision`) es un entero que sólo cambia esta herramienta (meta
 * `_cod_content_revision`; vale 0 mientras nadie la haya escrito por acá). Hay un candado corto
 * por página para que dos escrituras a la vez no se pisen entre la comparación y el guardado.
 */
final class COD_Block_Page_Writer
{
    public const META_REVISION = '_cod_content_revision';
    public const META_DOCUMENT = '_cod_canvas_document_id';
    public const MAX_BYTES = 2097152;
    private const BLOQUE_LIENZO = 'contope/lienzo';

    /** @return array<string, mixed>|WP_Error */
    public function read(int $page_id)
    {
        $post = get_post($page_id);
        if (!($post instanceof WP_Post) || $post->post_type !== 'page') {
            return new WP_Error('cod_mcp_page_not_found', 'No existe una página con ese pageId.');
        }
        return [
            'pageId' => $page_id,
            'title' => (string) $post->post_title,
            'slug' => (string) $post->post_name,
            'status' => (string) $post->post_status,
            'revision' => (int) get_post_meta($page_id, self::META_REVISION, true),
            'conLienzo' => has_block(self::BLOQUE_LIENZO, (string) $post->post_content),
            'content' => (string) $post->post_content,
        ];
    }

    /**
     * @param array<string, mixed> $args pageId, content, expectedRevision, title?, slug?, status?
     * @return array<string, mixed>|WP_Error
     */
    public function write(array $args)
    {
        $page_id = (int) ($args['pageId'] ?? 0);
        $content = (string) ($args['content'] ?? '');
        if (strlen($content) > self::MAX_BYTES) {
            return new WP_Error('cod_mcp_block_content_too_large', 'El contenido supera los 2 MB.');
        }
        $bloques = parse_blocks($content);
        $con_bloques = 0;
        foreach ($bloques as $b) {
            if (isset($b['blockName']) && is_string($b['blockName'])) {
                ++$con_bloques;
                continue;
            }
            if (trim((string) ($b['innerHTML'] ?? '')) !== '') {
                return new WP_Error('cod_mcp_block_loose_html', 'Hay texto o HTML suelto fuera de un bloque. Todo el contenido tiene que estar dentro de bloques (usa core/paragraph o core/html).');
            }
        }
        if ($con_bloques === 0) {
            return new WP_Error('cod_mcp_block_empty', 'El contenido no trae ningún bloque.');
        }
        $desconocido = $this->primer_bloque_desconocido($bloques);
        if ($desconocido !== null) {
            return new WP_Error('cod_mcp_block_unknown', 'El bloque «' . $desconocido . '» no está registrado en este sitio.');
        }

        $existente = null;
        if ($page_id > 0) {
            $existente = get_post($page_id);
            if (!($existente instanceof WP_Post) || $existente->post_type !== 'page') {
                return new WP_Error('cod_mcp_page_not_found', 'No existe una página con ese pageId.');
            }
            $actual = (int) get_post_meta($page_id, self::META_REVISION, true);
            $esperada = (int) ($args['expectedRevision'] ?? -1);
            if ($esperada !== $actual) {
                return new WP_Error('cod_mcp_revision_conflict', 'La página está en la revisión ' . $actual . ' y se esperaba la ' . $esperada . '. Lee la página con cod_read_block_page y vuelve a intentar.', ['expectedRevision' => $esperada, 'currentRevision' => $actual]);
            }
            if ((string) get_post_meta($page_id, self::META_DOCUMENT, true) !== '' && !has_block(self::BLOQUE_LIENZO, $content)) {
                return new WP_Error('cod_mcp_block_needs_lienzo', 'Esta página tiene el encabezado y el pie del sitio por el bloque contope/lienzo; sin ese bloque como envoltorio la página saldría sin ellos. Envuelve el contenido en contope/lienzo.');
            }
        } elseif (trim((string) ($args['title'] ?? '')) === '') {
            return new WP_Error('cod_mcp_invalid_arguments', 'Para crear una página (pageId 0) hace falta title.');
        }

        $informe = null;
        if (COD_ADN_Gate::activo()) {
            $informe = COD_ADN_Gate::revisar_contenido($existente instanceof WP_Post ? (string) $existente->post_content : '', $content, 'cod_write_block_page');
            $resuelto = COD_ADN_Gate::resolver($informe);
            if (is_wp_error($resuelto)) {
                return $resuelto;
            }
            $informe = is_array($resuelto) ? $resuelto : $informe;
        }

        $clave_candado = 'cod_bp_lock_' . $page_id;
        if ($page_id > 0) {
            $tomado = get_option($clave_candado, 0);
            if ($tomado && (time() - (int) $tomado) < 30) {
                return new WP_Error('cod_mcp_page_busy', 'Otra escritura de esta página está en curso; reintenta en unos segundos.');
            }
            update_option($clave_candado, time(), false);
        }
        try {
            $post_arr = ['post_content' => wp_slash($content)];
            if (isset($args['title']) && trim((string) $args['title']) !== '') {
                $post_arr['post_title'] = sanitize_text_field((string) $args['title']);
            }
            if (isset($args['slug']) && trim((string) $args['slug']) !== '') {
                $post_arr['post_name'] = sanitize_title((string) $args['slug']);
            }
            if (isset($args['status']) && in_array($args['status'], ['draft', 'publish', 'pending', 'private'], true)) {
                $post_arr['post_status'] = (string) $args['status'];
            }
            if ($page_id > 0) {
                $post_arr['ID'] = $page_id;
                $resultado = wp_update_post($post_arr, true);
            } else {
                $post_arr['post_type'] = 'page';
                $post_arr += ['post_status' => 'draft'];
                $resultado = wp_insert_post($post_arr, true);
            }
            if (is_wp_error($resultado)) {
                return $resultado;
            }
            $id = (int) $resultado;
            $nueva = (int) get_post_meta($id, self::META_REVISION, true) + 1;
            update_post_meta($id, self::META_REVISION, $nueva);
        } finally {
            if ($page_id > 0) {
                delete_option($clave_candado);
            }
        }

        $post = get_post($id);
        $salida = [
            'pageId' => $id,
            'revision' => $nueva,
            'status' => $post instanceof WP_Post ? (string) $post->post_status : '',
            'link' => (string) get_permalink($id),
            'blocks' => $con_bloques,
            'bytes' => strlen($content),
        ];
        if ($informe !== null) {
            $salida['adnGate'] = $informe;
        }
        return $salida;
    }

    /**
     * @param array<int, array<string, mixed>> $bloques
     */
    private function primer_bloque_desconocido(array $bloques): ?string
    {
        $registro = WP_Block_Type_Registry::get_instance();
        foreach ($bloques as $b) {
            $nombre = $b['blockName'] ?? null;
            if (is_string($nombre) && !$registro->is_registered($nombre)) {
                return $nombre;
            }
            $internos = isset($b['innerBlocks']) && is_array($b['innerBlocks']) ? $b['innerBlocks'] : [];
            $hijo = $this->primer_bloque_desconocido($internos);
            if ($hijo !== null) {
                return $hijo;
            }
        }
        return null;
    }
}
