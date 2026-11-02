<?php
/**
 * Dibuja el mapa de ubicación.
 *
 * Emite el marcado de la conducta «mapa» del lienzo y deja que su runtime lo
 * monte. La lógica vive en COD_Block_Mapa::marcado() para poder probarla.
 *
 * Variables del contrato de render dinámico de WP:
 *   array $attributes · string $content · WP_Block $block
 */

if (!defined('ABSPATH')) {
    exit;
}

$en_editor = defined('REST_REQUEST') && REST_REQUEST;

if (!$en_editor) {
    COD_Block_Mapa::encolar_recursos();
}

echo COD_Block_Mapa::marcado( // phpcs:ignore WordPress.Security.EscapeOutput -- cada pieza se escapa dentro.
    is_array($attributes) ? $attributes : [],
    get_block_wrapper_attributes(),
    $en_editor
);
