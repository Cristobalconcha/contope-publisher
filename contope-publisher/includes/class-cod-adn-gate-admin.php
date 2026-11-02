<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla donde una persona cambia el modo de la compuerta del diseño.
 *
 * Es el ÚNICO lugar de la interfaz donde se cambia. No hay herramienta MCP que lo
 * haga y no la habrá: si la IA pudiera apagar la compuerta, no habría compuerta.
 * La protección es doble:
 *
 *  - la acción es un `admin-post` con nonce, y WordPress sólo autentica ese
 *    punto de entrada con la cookie de la sesión de quien está en el panel; una
 *    contraseña de aplicación (lo que usa el MCP) sirve para REST y XML-RPC, no
 *    para esto;
 *  - COD_ADN_Gate::set_modo() vuelve a comprobar que la petición no sea REST ni
 *    una llamada del MCP.
 *
 * La constante COD_ADN_GATE_MODE de wp-config.php gana sobre esta pantalla (la
 * pantalla lo dice y no deja cambiar nada).
 */
final class COD_ADN_Gate_Admin
{
    public const PAGE_SLUG = 'contope-adn-gate';
    public const ACTION = 'cod_adn_gate_set_mode';
    public const CAPABILITY = 'manage_options';

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_post_' . self::ACTION, [$this, 'handle_set_mode']);
    }

    public function add_menu(): void
    {
        add_submenu_page(
            COD_Theme_Builder_Admin::PARENT_SLUG,
            'Compuerta del diseño',
            'Compuerta del diseño',
            self::CAPABILITY,
            self::PAGE_SLUG,
            [$this, 'render_page']
        );
    }

    public function handle_set_mode(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para cambiar la compuerta del diseño.', 'contope-publisher'));
        }
        check_admin_referer(self::ACTION);
        $modo = isset($_POST['modo']) ? sanitize_key(wp_unslash((string) $_POST['modo'])) : '';
        $resultado = COD_ADN_Gate::set_modo($modo);
        $query = is_wp_error($resultado) ? ['cod_adn_error' => rawurlencode($resultado->get_error_message())] : ['cod_adn_guardado' => '1'];
        wp_safe_redirect(add_query_arg($query, admin_url('admin.php?page=' . self::PAGE_SLUG)));
        exit;
    }

    public function render_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para ver esta pantalla.', 'contope-publisher'));
        }
        $modo = COD_ADN_Gate::modo();
        $constante = COD_ADN_Gate::modo_fijado_por_constante();
        $registro = COD_ADN_Registry::get();
        $textos = [
            'off' => 'Apagada. El MCP escribe como siempre (Santa Luisa, Econut).',
            'observe' => 'Observar. Revisa e informa en cada respuesta; nunca rechaza.',
            'ratchet' => 'Trinquete. Rechaza lo que AGREGA valores fuera del registro; lo ya guardado pasa y se cuenta.',
            'enforce' => 'Exigir. Rechaza todo valor de diseño que no sea una variable del registro.',
        ];
        echo '<div class="wrap"><h1>Compuerta del diseño</h1>';
        if (isset($_GET['cod_adn_guardado'])) {
            echo '<div class="notice notice-success"><p>Modo guardado.</p></div>';
        }
        if (isset($_GET['cod_adn_error'])) {
            echo '<div class="notice notice-error"><p>' . esc_html(rawurldecode((string) wp_unslash($_GET['cod_adn_error']))) . '</p></div>';
        }
        echo '<p>Decide qué hace el MCP cuando una escritura trae un color, una tipografía, un tamaño o un espaciado escrito a mano en vez de una variable del diseño del sitio. '
            . 'Este modo <strong>no se puede cambiar por el MCP</strong>: sólo desde esta pantalla (o con la constante <code>COD_ADN_GATE_MODE</code> en <code>wp-config.php</code>).</p>';
        echo '<p>Registro de diseño vigente: <strong>' . esc_html((string) count($registro['nombres'])) . '</strong> nombres (fuente: ' . esc_html((string) $registro['fuente']) . ').</p>';
        if ($constante) {
            echo '<div class="notice notice-warning inline"><p>El modo lo fija <code>COD_ADN_GATE_MODE</code> en wp-config.php: <strong>' . esc_html($modo) . '</strong>. Se cambia allí.</p></div>';
        }
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr(self::ACTION) . '">';
        wp_nonce_field(self::ACTION);
        echo '<table class="form-table" role="presentation"><tbody><tr><th scope="row">Modo</th><td>';
        foreach ($textos as $valor => $texto) {
            printf(
                '<label style="display:block;margin:.4em 0"><input type="radio" name="modo" value="%1$s"%2$s%3$s> <strong>%1$s</strong> — %4$s</label>',
                esc_attr($valor),
                checked($modo, $valor, false),
                $constante ? ' disabled' : '',
                esc_html($texto)
            );
        }
        echo '</td></tr></tbody></table>';
        if (!$constante) {
            submit_button('Guardar modo');
        }
        echo '</form></div>';
    }
}
