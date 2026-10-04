<?php
define('WP_USE_THEMES', false);
require "C:/Users/Cristobal concha/wp-local/wordpress/wp-load.php";
global $wpdb;

$slug = "contacto-santa-luisa";
$titulo = "Contacto Santa Luisa";
$json = file_get_contents("C:\\Users\\Cristobal concha\\open-codesign-wordpress\\scripts\\santaluisa\\.formulario.json");
$ahora = current_time('mysql');

$id = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$wpdb->prefix}orugantt_forms WHERE slug = %s", $slug));
if ($id) {
    $wpdb->update("{$wpdb->prefix}orugantt_forms", ['title' => $titulo, 'status' => 'published', 'updated_at' => $ahora], ['id' => $id]);
    echo "  el formulario ya estaba (id $id): actualizado\n";
} else {
    $wpdb->insert("{$wpdb->prefix}orugantt_forms", [
        'slug' => $slug, 'title' => $titulo, 'status' => 'published',
        'created_at' => $ahora, 'updated_at' => $ahora,
    ]);
    $id = (int) $wpdb->insert_id;
    echo "  formulario creado con id $id\n";
}

// Una sola versión vigente: las demás dejan de serlo.
$wpdb->update("{$wpdb->prefix}orugantt_form_versions", ['is_current' => 0], ['form_id' => $id]);
$wpdb->insert("{$wpdb->prefix}orugantt_form_versions", [
    'form_id' => $id,
    'version_number' => 8,
    'json' => $json,
    'is_current' => 1,
    'changelog' => 'Traído del sitio publicado con traer-formulario.mjs.',
    'created_at' => $ahora,
]);
echo "  versión 8 instalada y marcada como vigente\n";
