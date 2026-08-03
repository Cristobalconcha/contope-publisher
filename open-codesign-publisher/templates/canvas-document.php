<?php
if (!defined('ABSPATH')) {
    exit;
}
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class('ocd-canvas-standalone'); ?>>
<?php wp_body_open(); ?>
<?php
while (have_posts()) {
    the_post();
    the_content();
}
wp_footer();
?>
</body>
</html>
