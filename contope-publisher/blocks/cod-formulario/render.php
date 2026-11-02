<?php
/**
 * Dibuja el formulario de Orugantt Forms.
 *
 * Llama al shortcode oficial del plugin de formularios; la lógica y las
 * variables de diseño viven en COD_Block_Formulario.
 *
 * Variables del contrato de render dinámico de WP:
 *   array $attributes · string $content · WP_Block $block
 */

if (!defined('ABSPATH')) {
    exit;
}

$en_editor = defined('REST_REQUEST') && REST_REQUEST;

echo COD_Block_Formulario::marcado( // phpcs:ignore WordPress.Security.EscapeOutput -- cada pieza se escapa dentro o la entrega el plugin de formularios.
    is_array($attributes) ? $attributes : [],
    get_block_wrapper_attributes(),
    $en_editor
);
