<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * El canal por el que el selector de iconos habla con el catálogo.
 *
 * Existe porque el navegador no puede pedirle el catálogo a Google —no admite
 * peticiones de otro origen— ni puede escribir en la carpeta del set. Las dos
 * cosas las hace el servidor; esto es la puerta.
 *
 * QUIÉN PUEDE USARLO: quien puede editar páginas. No es `manage_options`
 * porque elegir un icono es trabajo de quien diseña, no de quien administra el
 * servidor; pero tampoco es público, porque `cachear` escribe en el disco y
 * pide a un tercero.
 */
final class COD_Iconos_Rest
{
    public const NAMESPACE = 'contope/v1';
    public const CAPACIDAD = 'edit_posts';

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'rutas']);
    }

    public function rutas(): void
    {
        register_rest_route(self::NAMESPACE, '/iconos', [
            'methods' => 'GET',
            'permission_callback' => [$this, 'puede'],
            'callback' => [$this, 'buscar'],
            'args' => [
                'q' => ['type' => 'string', 'required' => false],
                'categoria' => ['type' => 'string', 'required' => false],
                'limite' => ['type' => 'integer', 'required' => false],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/iconos/cachear', [
            'methods' => 'POST',
            'permission_callback' => [$this, 'puede'],
            'callback' => [$this, 'cachear'],
            'args' => [
                'nombre' => ['type' => 'string', 'required' => true],
            ],
        ]);
    }

    public function puede(): bool
    {
        return current_user_can(self::CAPACIDAD);
    }

    public function buscar(WP_REST_Request $peticion): WP_REST_Response
    {
        $catalogo = COD_Iconos_Catalogo::todo();
        if ($catalogo === []) {
            // Sin catálogo el selector no se queda mudo: enseña lo que el sitio
            // ya tiene descargado, que es con lo que se puede trabajar igual.
            return new WP_REST_Response([
                'iconos' => $this->del_set(),
                'categorias' => [],
                'estilo' => COD_Icono::estilo(),
                'aviso' => 'No se pudo leer el catálogo de Material. Se muestran sólo los iconos ya descargados.',
            ]);
        }

        return new WP_REST_Response([
            'iconos' => COD_Iconos_Catalogo::buscar(
                (string) $peticion->get_param('q'),
                (string) $peticion->get_param('categoria'),
                (int) ($peticion->get_param('limite') ?: 120)
            ),
            'categorias' => COD_Iconos_Catalogo::categorias(),
            'estilo' => COD_Icono::estilo(),
        ]);
    }

    public function cachear(WP_REST_Request $peticion)
    {
        $resultado = COD_Iconos_Catalogo::cachear((string) $peticion->get_param('nombre'));
        if (!$resultado['ok']) {
            return new WP_Error('cod_icono_no_cacheado', $resultado['error'] ?? 'No se pudo traer el icono.', ['status' => 502]);
        }

        return new WP_REST_Response([
            'ok' => true,
            'nombre' => (string) $peticion->get_param('nombre'),
            'estilos' => $resultado['estilos'],
            'url' => COD_Icono::ruta_de_nombre((string) $peticion->get_param('nombre')),
        ]);
    }

    /**
     * Lo que ya está descargado, leído del disco.
     *
     * @return array<int, array{nombre: string, usos: int, categorias: array<int,string>, enElSet: bool}>
     */
    private function del_set(): array
    {
        $carpeta = COD_Icono::carpeta();
        if ($carpeta === '') {
            return [];
        }
        $nombres = [];
        foreach ((array) glob(trailingslashit($carpeta) . 'icono-*.svg') as $ruta) {
            $base = basename((string) $ruta, '.svg');
            $nombre = preg_replace('/^icono-/', '', $base);
            $nombre = preg_replace('/-(?:outlined|rounded|sharp)$/', '', (string) $nombre);
            $nombres[(string) $nombre] = true;
        }
        ksort($nombres);

        $salida = [];
        foreach (array_keys($nombres) as $nombre) {
            $salida[] = ['nombre' => $nombre, 'usos' => 0, 'categorias' => [], 'enElSet' => true];
        }
        return $salida;
    }
}
