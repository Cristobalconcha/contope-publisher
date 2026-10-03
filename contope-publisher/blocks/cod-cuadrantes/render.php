<?php
/**
 * Dibuja el módulo de cuadrantes.
 *
 * El contenido —las cuatro fotos, los cuatro títulos y los cuatro textos— son
 * bloques de WordPress, ya dibujados por WordPress y entregados en $content.
 * Acá no se toca ninguno: sólo se les pone alrededor la raíz que el módulo
 * necesita para reconocerlos y redistribuirlos.
 *
 * Y no hace falta nada más, que es la parte buena: el runtime de cuadrantes
 * exige de sus hijos sólo dos cosas —que sean cuatro, y que cada uno tenga
 * algo que sea o contenga una imagen más al menos un elemento de texto—. No
 * mira clases ni de dónde salió el marcado. Un `core/group` con un
 * `core/image`, un `core/heading` y un `core/paragraph` ya lo cumple, así que
 * el módulo funciona con bloques de WordPress sin cambiarle una línea.
 *
 * Variables del contrato de render dinámico de WP:
 *   array $attributes · string $content · WP_Block $block
 */

if (!defined('ABSPATH')) {
    exit;
}

printf(
    '<div %s data-cod-behavior="cuadrantes">%s</div>',
    get_block_wrapper_attributes(['class' => 'cod-group cod-cuadrantes']),
    $content
);
