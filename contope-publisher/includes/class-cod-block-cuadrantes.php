<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Registra el bloque contope/cuadrantes.
 *
 * Es el primer MÓDULO que toma bloques de WordPress en vez de guardarse el
 * contenido. Las cuatro fotos, los cuatro títulos y los cuatro textos son
 * bloques de WordPress, editables en el editor de WordPress; el módulo sólo
 * los redistribuye.
 *
 * Pedido por Cristóbal, textual: «el módulo de cuadrantes tiene títulos, tiene
 * textos, tiene fotos; esos elementos son bloques de WordPress, pero se
 * muestran en un módulo que los toma y los redistribuye de una forma
 * específica, que es la nuestra».
 *
 * No hizo falta tocar el runtime. Resultó que ya estaba escrito para esto: de
 * sus hijos sólo exige que sean cuatro y que cada uno tenga una imagen más
 * algo de texto, sin mirar clases ni origen del marcado.
 */
final class COD_Block_Cuadrantes
{
    public function register(): void
    {
        add_action('init', [$this, 'register_block']);
    }

    public function register_block(): void
    {
        // El módulo y su unidad. Son dos bloques y no uno a propósito: la
        // unidad tiene identidad propia y su contenido es libre, igual que
        // `core/tab-panel` en WordPress.
        register_block_type(COD_PUBLISHER_DIR . 'blocks/cod-cuadrantes');
        register_block_type(COD_PUBLISHER_DIR . 'blocks/cod-cuadrante');
    }
}
