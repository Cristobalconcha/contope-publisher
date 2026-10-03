<?php
/**
 * Un cuadrante: su imagen y el contenido que se abre al pincharla.
 *
 * No lleva clases ni atributos propios. El runtime del módulo reconoce a sus
 * hijos por lo que SON —el primero que es o contiene una imagen es la cara, y
 * lo demás es el panel— y les pone él los nombres. Añadir acá clases que el
 * runtime no mira sería decorado muerto.
 */

if (!defined('ABSPATH')) {
    exit;
}

printf('<div %s>%s</div>', get_block_wrapper_attributes(), $content);
