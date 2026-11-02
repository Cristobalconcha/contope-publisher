<?php
/**
 * Manifiesto de assets del bloque contope/formulario (sin build tools: se declaran
 * a mano las dependencias del editor de bloques).
 *
 * @package Open_CoDesign_Publisher
 */

return array(
    'dependencies' => array(
        'wp-blocks',
        'wp-block-editor',
        'wp-components',
        'wp-element',
    ),
    'version' => defined('COD_PUBLISHER_VERSION') ? COD_PUBLISHER_VERSION : '0.1.0',
);
