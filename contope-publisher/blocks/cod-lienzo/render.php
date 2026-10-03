<?php
/**
 * Dibuja el contenido de la página dentro del sitio.
 *
 * El contenido son los bloques de dentro —los de WordPress—, ya dibujados por
 * el propio WordPress y entregados acá en $content. Esta función no los toca.
 * Lo único que hace es pedirle al publisher que les ponga alrededor lo que es
 * del SITIO: el encabezado, el pie y las hojas de estilo.
 *
 * Ésa es toda la idea, y es la que faltaba: el contenido es de WordPress, la
 * forma es nuestra. Una página con su contenido en bloques tiene encabezado
 * por el solo hecho de ser una página del sitio, no por cómo esté guardada.
 *
 * Variables del contrato de render dinámico de WP:
 *   array $attributes · string $content · WP_Block $block
 */

if (!defined('ABSPATH')) {
    exit;
}

$documento = isset($attributes['documentId']) ? sanitize_key((string) $attributes['documentId']) : '';

$cuerpo = sprintf(
    '<div %s data-cod-documento="%s">%s</div>',
    get_block_wrapper_attributes(['class' => 'cod-canvas cod-canvas--bloques']),
    esc_attr($documento),
    $content
);

$publisher = class_exists('COD_Canvas_Page_Publisher') ? COD_Canvas_Page_Publisher::instancia() : null;

if ($publisher === null) {
    // Sin publisher no hay regiones que poner, pero el contenido sale igual.
    // Una página de texto sin encabezado es peor que con él; una página en
    // blanco es peor que las dos.
    echo $cuerpo; // phpcs:ignore WordPress.Security.EscapeOutput -- ya viene escapado por WordPress.
    return;
}

echo $publisher->salida_con_regiones($cuerpo, $publisher->css_del_documento($documento), $documento); // phpcs:ignore WordPress.Security.EscapeOutput
