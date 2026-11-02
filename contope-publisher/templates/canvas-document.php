<?php
if (!defined('ABSPATH')) {
    exit;
}

/*
 * El contenido se dibuja ANTES de imprimir la cabecera, como hace WordPress con las plantillas de bloques.
 *
 * Con un tema de bloques, WordPress imprime el mapa de importación de los módulos de script (lo que necesitan los
 * bloques interactivos: acordeón, navegación…) en wp_head. Un módulo que un bloque pide al dibujarse, si se dibuja
 * DESPUÉS de wp_head, llega sin mapa y el navegador no resuelve «@wordpress/interactivity»: los pliegues quedaban
 * todos abiertos y sin respuesta. Dibujar primero deja que los bloques pidan sus módulos y sus hojas a tiempo, y
 * además manda a la cabecera las hojas que antes salían al pie.
 */
ob_start();
while (have_posts()) {
    the_post();
    the_content();
}
$cod_contenido = (string) ob_get_clean();
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class('cod-canvas-standalone'); ?>>
<?php wp_body_open(); ?>
<?php
echo $cod_contenido; // phpcs:ignore WordPress.Security.EscapeOutput -- ya pasó por the_content().
wp_footer();
?>
</body>
</html>
