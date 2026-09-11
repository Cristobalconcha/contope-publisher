<?php
/**
 * Render server-side del bloque ocd/heading.
 *
 * Variables disponibles (contrato de render dinámico de WP):
 *   array $attributes  Atributos del bloque ya validados por block.json.
 *   string $content    Contenido del bloque (no se usa: no hay innerBlocks).
 *   WP_Block $block    Instancia del bloque.
 *
 * @package Open_CoDesign_Publisher
 */

if (!defined('ABSPATH')) {
    exit;
}

$level = isset($attributes['level']) ? (int) $attributes['level'] : 2;
$level = max(1, min(6, $level));

$content = isset($attributes['content']) ? (string) $attributes['content'] : '';

$wrapper_attributes = get_block_wrapper_attributes();

printf(
    '<%1$s %2$s>%3$s</%1$s>',
    'h' . $level,
    $wrapper_attributes,
    wp_kses_post($content)
);
