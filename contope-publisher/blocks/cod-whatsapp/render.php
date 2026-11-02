<?php
/**
 * Dibuja el botón de WhatsApp.
 *
 * El número NO está en el contenido: sale del ajuste del sitio (Configuración →
 * WhatsApp). Toda la lógica vive en COD_Block_Whatsapp::marcado() para poder
 * probarla sin simular el contrato de render de WordPress.
 *
 * Variables del contrato de render dinámico de WP:
 *   array $attributes · string $content · WP_Block $block
 */

if (!defined('ABSPATH')) {
    exit;
}

$en_editor = defined('REST_REQUEST') && REST_REQUEST;

echo COD_Block_Whatsapp::marcado( // phpcs:ignore WordPress.Security.EscapeOutput -- cada pieza se escapa dentro.
    is_array($attributes) ? $attributes : [],
    get_block_wrapper_attributes(),
    COD_Block_Whatsapp::numero(),
    $en_editor
);
