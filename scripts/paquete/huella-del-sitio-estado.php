<?php
/**
 * El ESTADO DEL SITIO en forma comparable entre dos instalaciones (la parte de la huella que no son páginas):
 * título y descripción, enlaces permanentes, ícono y logos (con el sha256 de su archivo), el set de íconos, las
 * hojas de diseño y los menús y navegaciones tal como los pinta WordPress, con el texto y el destino RELATIVO
 * de cada enlace (la parte de "http://localhost:PUERTO" no cuenta: es lo único que cambia entre local y web).
 * SÓLO LEE. Lo carga huella-del-sitio.php (modo `sitio`).
 */

function cod_huella_destino_relativo(string $url): string
{
    $home = untrailingslashit((string) home_url('/'));
    $url = html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return strpos($url, $home) === 0 ? (substr($url, strlen($home)) ?: '/') : $url;
}

/** @return array<int, array{texto: string, href: string}> */
function cod_huella_enlaces_de(string $html): array
{
    $enlaces = [];
    if (preg_match_all('#<a\b[^>]*\bhref=(["\'])(.*?)\1[^>]*>(.*?)</a>#is', $html, $m, PREG_SET_ORDER)) {
        foreach ($m as $a) {
            $texto = trim((string) preg_replace('/\s+/', ' ', wp_strip_all_tags($a[3])));
            $enlaces[] = ['texto' => html_entity_decode($texto, ENT_QUOTES | ENT_HTML5, 'UTF-8'), 'href' => cod_huella_destino_relativo($a[2])];
        }
    }
    return $enlaces;
}

/** @return array<string, mixed> */
function cod_huella_del_estado_del_sitio(): array
{
    $upload = wp_get_upload_dir();
    $base = rtrim((string) $upload['basedir'], '/\\');

    $adjunto = static function (int $id) use ($base): ?array {
        if ($id <= 0) {
            return null;
        }
        $relativa = (string) get_post_meta($id, '_wp_attached_file', true);
        $archivo = $base . '/' . $relativa;
        return ['path' => $relativa, 'sha256' => is_file($archivo) ? hash_file('sha256', $archivo) : null, 'url' => cod_huella_destino_relativo((string) wp_get_attachment_url($id))];
    };

    $iconos = ['estilo' => (string) get_option('cod_icono_estilo', ''), 'archivos' => []];
    foreach (glob($base . '/contope-iconos/*') ?: [] as $f) {
        $iconos['archivos'][basename($f)] = hash_file('sha256', $f);
    }
    ksort($iconos['archivos']);

    $hojas = [];
    $registro = get_option('cod_disenos_hojas', []);
    foreach (is_array($registro) ? $registro : [] as $diseno => $h) {
        $archivo = $base . '/contope-disenos/' . (string) ($h['archivo'] ?? '');
        $hojas[(string) $diseno] = ['archivo' => (string) ($h['archivo'] ?? ''), 'sha256' => is_file($archivo) ? hash_file('sha256', $archivo) : null];
    }
    ksort($hojas);

    // los menús clásicos: cada enlace como lo entrega WordPress (el destino lo calcula con las páginas DEL SITIO)
    $menus = [];
    foreach (wp_get_nav_menus() as $menu) {
        $items = [];
        foreach ((array) wp_get_nav_menu_items($menu->term_id) as $it) {
            $items[] = ['texto' => html_entity_decode((string) $it->title, ENT_QUOTES | ENT_HTML5, 'UTF-8'), 'href' => cod_huella_destino_relativo((string) $it->url), 'nivel' => (int) $it->menu_item_parent > 0 ? 1 : 0];
        }
        $html = wp_nav_menu(['menu' => $menu, 'echo' => false, 'container' => false, 'fallback_cb' => false]);
        $menus[(string) $menu->slug] = ['nombre' => (string) $menu->name, 'items' => $items, 'enlacesPintados' => cod_huella_enlaces_de(is_string($html) ? $html : '')];
    }
    ksort($menus);
    $ubicaciones = [];
    foreach (get_nav_menu_locations() as $loc => $term_id) {
        $t = get_term((int) $term_id, 'nav_menu');
        $ubicaciones[(string) $loc] = $t instanceof WP_Term ? (string) $t->slug : null;
    }
    ksort($ubicaciones);

    // las navegaciones de bloques, pintadas por el bloque `core/navigation`
    $navegaciones = [];
    foreach (get_posts(['post_type' => 'wp_navigation', 'post_status' => 'publish', 'numberposts' => -1, 'orderby' => 'post_name', 'order' => 'ASC']) as $n) {
        $pintado = do_blocks('<!-- wp:navigation {"ref":' . (int) $n->ID . '} /-->');
        $navegaciones[(string) $n->post_name] = ['titulo' => (string) $n->post_title, 'enlacesPintados' => cod_huella_enlaces_de($pintado)];
    }
    ksort($navegaciones);

    return [
        'home' => (string) home_url('/'),
        'adn' => (static function (): ?array {
            $p = COD_ADN_Store::puntero();
            return $p === null ? null : ['designId' => $p['designId'], 'revision' => $p['revision'], 'digest' => $p['digest']];
        })(),
        'blogname' => (string) get_option('blogname'),
        'blogdescription' => (string) get_option('blogdescription'),
        'permalink_structure' => (string) get_option('permalink_structure'),
        'siteIcon' => $adjunto((int) get_option('site_icon')),
        'siteLogo' => $adjunto((int) get_option('site_logo')),
        'customLogo' => $adjunto((int) get_theme_mod('custom_logo', 0)),
        'iconos' => $iconos,
        'hojas' => $hojas,
        'menus' => $menus,
        'ubicaciones' => $ubicaciones,
        'navegaciones' => $navegaciones,
    ];
}
