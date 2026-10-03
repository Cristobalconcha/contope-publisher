<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Registra el bloque contope/lienzo.
 *
 * Es el contenedor donde vive el CONTENIDO de una página: títulos, párrafos,
 * imágenes, listas, tablas. Todos bloques de WordPress, editados en el editor
 * de WordPress, con todas sus herramientas.
 *
 * Lo que pone ContOpe es la FORMA. El bloque guarda de qué documento sale, y
 * al dibujar la página envuelve el contenido para que las reglas de diseño le
 * lleguen.
 *
 * Por qué así y no al revés —que es como estaba—: hasta ahora el publisher
 * escribía un shortcode en el post_content y se quedaba con el contenido
 * adentro. Eso es apropiarse del contenido en vez de ponerle una capa de forma
 * encima, y deja a WordPress sin nada que editar. Un documento legal, por
 * ejemplo, lo corrige un abogado que no conoce el lienzo y no tiene por qué
 * aprenderlo.
 *
 * Es ADITIVO: las páginas que ya están escritas con el shortcode siguen
 * funcionando igual. Las dos formas conviven.
 */
final class COD_Block_Lienzo
{
    public function register(): void
    {
        add_action('init', [$this, 'register_block']);
    }

    public function register_block(): void
    {
        register_block_type(COD_PUBLISHER_DIR . 'blocks/cod-lienzo');
    }
}
