<?php
/**
 * Manifiesto de assets del bloque ocd/heading.
 *
 * Sin build tools: declaramos acá las dependencias que el editor de bloques
 * ya tiene encoladas para que register_block_script_handle() las respete.
 *
 * @package Open_CoDesign_Publisher
 */

return array(
    'dependencies' => array(
        'wp-blocks',
        'wp-block-editor',
        'wp-components',
        'wp-element',
        'wp-i18n',
    ),
    'version' => defined('COD_PUBLISHER_VERSION') ? COD_PUBLISHER_VERSION : '0.1.0',
);
