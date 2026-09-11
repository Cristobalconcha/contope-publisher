<?php
/**
 * Registra el bloque Gutenberg ocd/heading.
 *
 * Fase 1 (POC) de la migración gradual a bloques Gutenberg reales:
 * bloque hoja, dinámico, con render server-side vía render.php.
 * Es aditivo y aislado: no toca OCD_Canvas_Document_Repository ni el
 * flujo del editor visual Canvas.
 *
 * @package Open_CoDesign_Publisher
 */

if (!defined('ABSPATH')) {
    exit;
}

final class OCD_Block_Heading
{
    public function register(): void
    {
        add_action('init', [$this, 'register_block']);
    }

    public function register_block(): void
    {
        register_block_type(OCD_PUBLISHER_DIR . 'blocks/ocd-heading');
    }
}
