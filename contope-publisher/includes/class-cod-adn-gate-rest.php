<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * La compuerta del diseño en la REST de WordPress.
 *
 * QUÉ CIERRA. El MCP propio ya pasaba por COD_ADN_Gate, pero una IA con una contraseña de
 * aplicación también puede hablarle directo a `wp/v2/pages`, `wp/v2/posts`, `wp/v2/blocks`
 * (patrones), `wp/v2/templates`, `wp/v2/template-parts`, `wp/v2/navigation` y `wp/v2/widgets`
 * con bloques que traen `style.color.text: "#123456"`, y a `wp/v2/global-styles`, que cambia
 * los valores del registro. Eso era la puerta abierta: la IA usa la vía que queda sin compuerta.
 *
 * CUÁNDO ACTÚA. Sólo si (a) el modo no es `off` y (b) la petición viene autenticada con una
 * contraseña de aplicación —no una persona con sesión en el editor, que queda fuera como dice
 * la espec (4.1)—. Los modos son los de siempre: `observe` registra, `ratchet` rechaza lo que
 * agrega deuda, `enforce` rechaza todo literal. Mismos códigos y mismas rutas de error.
 *
 * `global-styles` por contraseña de aplicación se rechaza en `ratchet` y `enforce`: cambia los
 * valores a los que apunta todo lo demás, así que ninguna referencia a un preset vale si el
 * preset lo puede reescribir quien debía obedecerlo. También se rechaza instalar, activar,
 * desactivar, actualizar o borrar plugins por esa vía (apagar este plugin sería apagar la
 * compuerta).
 *
 * XML-RPC: con la compuerta en `ratchet` o `enforce` se desactiva, porque admite contraseñas de
 * aplicación y escribe contenido sin pasar por REST.
 *
 * LÍMITES QUE QUEDAN (declarados en el CHANGELOG, no ocultos): WP-CLI y la base de datos son
 * acceso al servidor; una persona en el editor no se bloquea.
 */
final class COD_ADN_Gate_Rest
{
    public function register(): void
    {
        add_action('application_password_did_authenticate', static function (): void {
            COD_ADN_Gate::marcar_contrasena_de_aplicacion(true);
        });
        add_filter('rest_request_before_callbacks', [$this, 'antes_de_los_callbacks'], 10, 3);
        add_filter('xmlrpc_enabled', [$this, 'xmlrpc_habilitado']);
    }

    /** @param mixed $habilitado */
    public function xmlrpc_habilitado($habilitado)
    {
        return in_array(COD_ADN_Gate::modo(), ['ratchet', 'enforce'], true) ? false : $habilitado;
    }

    /**
     * @param mixed $respuesta
     * @param mixed $manejador
     * @param mixed $peticion
     * @return mixed
     */
    public function antes_de_los_callbacks($respuesta, $manejador, $peticion)
    {
        if (is_wp_error($respuesta) || !($peticion instanceof WP_REST_Request)) {
            return $respuesta;
        }
        $error = $this->revisar($peticion);
        return $error ?? $respuesta;
    }

    /**
     * La decisión, separada del gancho para que la prueba la llame sin pasar por el servidor.
     */
    public function revisar(WP_REST_Request $peticion): ?WP_Error
    {
        $modo = COD_ADN_Gate::modo();
        if ($modo === 'off' || !COD_ADN_Gate::peticion_no_humana()) {
            return null;
        }
        $metodo = strtoupper($peticion->get_method());
        if (!in_array($metodo, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            return null;
        }
        $ruta = $peticion->get_route();
        // Plugins: el id lleva una barra (carpeta/archivo), así que se decide antes del patrón general.
        if (preg_match('#^/wp/v2/plugins(?:/(.+))?/?$#i', $ruta, $mp) === 1) {
            $id_plugin = $mp[1] ?? '';
            if ($metodo === 'POST' && $id_plugin === '') {
                $objetivo = 'instalar un plugin';
            } else {
                $objetivo = $metodo === 'DELETE' ? 'borrar un plugin' : 'activar, desactivar o actualizar un plugin';
            }
            return $this->decidir($modo, 'REST ' . $metodo . ' ' . $ruta, 'ADN_PLUGIN_CHANGE_BLOCKED', 'plugins', $ruta, 'Con una contraseña de aplicación no se puede ' . $objetivo . ' mientras la compuerta del diseño está activa: apagar o reemplazar el plugin sería apagar la compuerta.');
        }
        if (preg_match('#^/wp/v2/([a-z0-9_-]+)(?:/([^/]+))?(?:/(autosaves|revisions|lock)(?:/[^/]+)?)?/?$#i', $ruta, $m) !== 1) {
            return null;
        }
        $base = strtolower($m[1]);
        $id = $m[2] ?? '';

        if ($base === 'global-styles') {
            $cuerpo = $peticion->get_json_params();
            if (!is_array($cuerpo) || $cuerpo === []) {
                $cuerpo = $peticion->get_body_params();
            }
            if (!is_array($cuerpo) || (!array_key_exists('styles', $cuerpo) && !array_key_exists('settings', $cuerpo))) {
                return null;
            }
            return $this->decidir(
                $modo,
                'REST ' . $metodo . ' ' . $ruta,
                'ADN_GLOBAL_STYLES_BLOCKED',
                'global-styles',
                $ruta,
                'wp/v2/global-styles cambia los valores del registro de diseño (colores, tipografías, escalas) de todo el sitio. Con una contraseña de aplicación no se escribe: el diseño del sitio se cambia en la definición del diseño (Configuración del tema), no desde una herramienta que luego se ampararía en él.'
            );
        }
        $contenido = $this->contenido_de($base, $peticion);
        if ($contenido === null) {
            return null;
        }
        $previo = '';
        if (in_array($base, $this->bases_de_posts(), true) && ctype_digit($id) && (int) $id > 0) {
            $post = get_post((int) $id);
            $previo = $post instanceof WP_Post ? (string) $post->post_content : '';
        }
        $informe = COD_ADN_Gate::revisar_contenido($previo, $contenido, 'REST ' . $metodo . ' ' . $ruta);
        $resuelto = COD_ADN_Gate::resolver($informe);
        if (is_wp_error($resuelto)) {
            $datos = $resuelto->get_error_data();
            $datos = is_array($datos) ? $datos : [];
            $datos['status'] = 400;
            return new WP_Error($resuelto->get_error_code(), $resuelto->get_error_message(), $datos);
        }
        return null;
    }

    /**
     * El texto de bloques que la petición quiere guardar, o null si no trae contenido.
     */
    private function contenido_de(string $base, WP_REST_Request $peticion): ?string
    {
        if ($base === 'widgets') {
            $instancia = $peticion->get_param('instance');
            if (is_array($instancia) && isset($instancia['raw']['content']) && is_string($instancia['raw']['content'])) {
                return $instancia['raw']['content'];
            }
            return null;
        }
        if (!in_array($base, $this->bases_de_posts(), true)) {
            return null;
        }
        $c = $peticion->get_param('content');
        if (is_array($c)) {
            $c = $c['raw'] ?? null;
        }
        return is_string($c) ? $c : null;
    }

    /**
     * Las `rest_base` de los tipos de contenido con REST (pages, posts, blocks, templates,
     * template-parts, navigation y los tipos propios).
     *
     * @return array<int, string>
     */
    private function bases_de_posts(): array
    {
        $bases = [];
        foreach (get_post_types(['show_in_rest' => true], 'objects') as $tipo) {
            $bases[] = strtolower((string) (!empty($tipo->rest_base) ? $tipo->rest_base : $tipo->name));
        }
        return $bases;
    }

    private function decidir(string $modo, string $herramienta, string $codigo, string $propiedad, string $ruta, string $mensaje): ?WP_Error
    {
        $violacion = [
            'codigo' => $codigo,
            'clase' => 'analisis',
            'propiedad' => $propiedad,
            'valor' => $ruta,
            'ruta' => $ruta,
            'mensaje' => $codigo . ' — ' . $ruta . ': ' . $mensaje,
            'sugerencias' => [],
        ];
        if ($modo === 'observe') {
            COD_ADN_Gate::resolver(['modo' => 'observe', 'herramienta' => $herramienta, 'nuevas' => 1, 'violaciones' => [$violacion]]);
            return null;
        }
        return new WP_Error(
            $codigo,
            'La compuerta del diseño (modo ' . $modo . ') rechazó la petición: ' . $violacion['mensaje'],
            ['status' => 403, 'modo' => $modo, 'herramienta' => $herramienta, 'total' => 1, 'violaciones' => [$violacion]]
        );
    }
}
