<?php
/**
 * Ajustes SEO de Santa Luisa en el ESPEJO local (SiteSEO), 2026-11-11.
 *
 * Uso (desde wp-local/wordpress):  ../php/php.exe <ruta>/aplicar-seo-espejo.php
 *
 * Dos partes, dichas por separado porque no son lo mismo:
 *
 *  A. PARIDAD — lo que producción ya tiene (alguien lo escribió en SiteSEO entre
 *     el 10 y el 11 de noviembre) y el espejo no. Los textos se copiaron tal cual
 *     del HTML de producción, porque SiteSEO no expone sus metas por la API.
 *
 *  B. POR DELANTE — arreglos nuevos del diagnóstico SEO que producción NO tiene
 *     todavía. Para subirlos hay que repetirlos en SiteSEO de producción.
 *
 * Las páginas se buscan por slug: el id numérico no es portable.
 */
$_SERVER['HTTP_HOST'] = 'localhost:8890';
require 'wp-load.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

function sl_pagina($slug) {
	$p = get_page_by_path($slug, OBJECT, 'page');
	if (!$p || $p->post_status !== 'publish') { echo "  ! no encontré la página publicada «$slug»\n"; return 0; }
	return (int) $p->ID;
}
function sl_meta($slug, $titulo, $desc) {
	$id = sl_pagina($slug);
	if (!$id) return;
	if ($titulo !== null) update_post_meta($id, '_siteseo_titles_title', $titulo);
	if ($desc !== null) update_post_meta($id, '_siteseo_titles_desc', $desc);
	echo "  ✓ $slug (id $id)\n";
}

echo "A. Paridad con producción\n";
sl_meta('inicio', 'Parcelas de 5.000 m² en Paine | Santa Luisa de Palpi',
	'Condominio de 22 parcelas de 5.000 m² en El Tránsito, Paine. Rol propio, libres de gravámenes, con agua y electricidad soterradas, y entregadas cercadas.');
sl_meta('contacto', 'Agenda tu visita | Santa Luisa de Palpi, Paine',
	'Coordina una visita al proyecto o escríbenos por WhatsApp. Te mostramos el terreno, el plano de parcelas y la documentación legal disponible.');
sl_meta('preguntas-frecuentes', 'Preguntas frecuentes | Comprar una parcela en Paine',
	'Rol propio, gravámenes, agua y luz, cercos, etapas del proceso de compra y financiamiento bancario. Las dudas más comunes, respondidas con detalle.');
sl_meta('diferenciales', 'Por qué elegir Santa Luisa | Parcelas en Paine',
	'Un proyecto de solo 22 parcelas, no un loteo masivo. Claridad, respaldo legal, acompañamiento y entorno de precordillera a minutos del valle del Maipo.');

$social = get_option('siteseo_social_option_name');
if (!is_array($social)) $social = array();
$social['social_knowledge_type'] = 'Organization';
$social['social_knowledge_name'] = 'Santa Luisa de Palpi';
$social['social_knowledge_img'] = home_url('/wp-content/uploads/2026/09/santa-luisa-icono-512.png');
$social['social_knowledge_phone'] = '+56981866742';
$social['social_knowledge_contact_type'] = 'Customer support';
$social['social_accounts_instagram'] = 'https://www.instagram.com/santaluisadepalpi/';
echo "  ✓ ficha de la organización (nombre, logo, teléfono, Instagram)\n";

echo "B. Por delante de producción\n";

// B1. Imagen para compartir: foto aérea real del loteo, 1200×630.
$origen = __DIR__ . '/santa-luisa-de-palpi-compartir.jpg';
$subidas = wp_upload_dir('2026/11');
$destino = $subidas['path'] . '/santa-luisa-de-palpi-compartir.jpg';
$url = $subidas['url'] . '/santa-luisa-de-palpi-compartir.jpg';
if (!file_exists($destino)) {
	wp_mkdir_p($subidas['path']);
	copy($origen, $destino);
	$adj = wp_insert_attachment(array(
		'post_mime_type' => 'image/jpeg',
		'post_title' => 'Santa Luisa de Palpi — imagen para compartir',
		'post_status' => 'inherit',
	), $destino);
	wp_update_attachment_metadata($adj, wp_generate_attachment_metadata($adj, $destino));
	update_post_meta($adj, '_wp_attachment_image_alt', 'Vista aérea del loteo de Santa Luisa de Palpi, en Paine, con la cordillera al fondo');
	echo "  ✓ imagen subida a la biblioteca (adjunto $adj)\n";
} else {
	echo "  · la imagen ya estaba en la biblioteca\n";
}
$social['social_facebook_og'] = true;
$social['social_facebook_img'] = $url;
$social['social_facebook_img_default'] = true;
$social['social_twitter_card'] = true;
$social['social_twitter_card_img'] = $url;
$social['social_twitter_card_img_size'] = 'Large';
update_option('siteseo_social_option_name', $social);
echo "  ✓ imagen para compartir en todas las páginas: $url\n";

// B2. La categoría vacía «Uncategorized» deja de indexarse y sale del sitemap.
$titulos = get_option('siteseo_titles_option_name');
$titulos['titles_tax_titles']['category']['noindex'] = 'category';
update_option('siteseo_titles_option_name', $titulos);
$mapa = get_option('siteseo_xml_sitemap_option_name');
unset($mapa['xml_sitemap_taxonomies_list']['category']);
update_option('siteseo_xml_sitemap_option_name', $mapa);
echo "  ✓ categorías: noindex y fuera del sitemap\n";

// B3. Términos y condiciones no tenía meta descripción.
sl_meta('terminos-y-condiciones', null,
	'Condiciones de uso del sitio de Santa Luisa de Palpi y política de privacidad: qué datos personales recopilamos, para qué los usamos y cómo ejercer tus derechos.');

// B4. La página de error estaba en inglés (12-nov-2026).
$titulos = get_option('siteseo_titles_option_name');
$titulos['titles_archives_404_title'] = 'Página no encontrada %%sep%% %%sitetitle%%';
update_option('siteseo_titles_option_name', $titulos);
echo "  ✓ título de la página de error en español\n";

echo "Listo.\n";

// B5. Imagen para compartir según la portada de cada página (12-nov-2026,
// elegidas por Cristóbal: «la foto de portada es la que manda»).
// Por omisión, la portada de Inicio; Diferenciales lleva la suya (el acceso).
function sl_subir_compartir($archivo, $titulo, $alt) {
	$origen = __DIR__ . '/' . $archivo;
	$subidas = wp_upload_dir('2026/11');
	$destino = $subidas['path'] . '/' . $archivo;
	if (!file_exists($destino)) {
		wp_mkdir_p($subidas['path']);
		copy($origen, $destino);
		$adj = wp_insert_attachment(array(
			'post_mime_type' => 'image/jpeg',
			'post_title' => $titulo,
			'post_status' => 'inherit',
		), $destino);
		wp_update_attachment_metadata($adj, wp_generate_attachment_metadata($adj, $destino));
		update_post_meta($adj, '_wp_attachment_image_alt', $alt);
		echo "  ✓ $archivo subida a la biblioteca (adjunto $adj)\n";
	}
	return $subidas['url'] . '/' . $archivo;
}
$portada = sl_subir_compartir('santa-luisa-de-palpi-portada.jpg', 'Santa Luisa de Palpi — portada para compartir', 'Casa en una parcela de Santa Luisa de Palpi al atardecer, con la cordillera al fondo');
$acceso = sl_subir_compartir('santa-luisa-de-palpi-acceso.jpg', 'Santa Luisa de Palpi — acceso, para compartir', 'Portón de acceso a Santa Luisa de Palpi, en Paine');
$social = get_option('siteseo_social_option_name');
$social['social_facebook_img'] = $portada;
$social['social_twitter_card_img'] = $portada;
update_option('siteseo_social_option_name', $social);
$dif = get_page_by_path('diferenciales');
if ($dif) {
	update_post_meta($dif->ID, '_siteseo_social_fb_img', $acceso);
	update_post_meta($dif->ID, '_siteseo_social_twitter_img', $acceso);
	echo "  ✓ Diferenciales comparte con la foto del acceso\n";
}
echo "  ✓ las demás páginas comparten con la portada de Inicio\n";
