<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Lee el catálogo de primitivas.
 *
 * El catálogo (`catalogo/primitivas.json`) declara qué puede configurarse en
 * cada tipo de objeto: qué familias de propiedades se le ofrecen, con qué
 * control se editan y de dónde heredan su valor de partida.
 *
 * Esta clase sólo lo LEE. No valida el contrato —de eso se encarga
 * `scripts/probar-catalogo-primitivas.php`, que comprueba que cada clase de
 * regla exista en el compilador, que cada taxonomía sea un nodo real y que
 * cada rol heredado exista en el set de diseño—. Acá se da por bueno y se
 * entrega.
 *
 * POR QUÉ UN ARCHIVO Y NO CÓDIGO. Las disposiciones de columnas vivían dentro
 * del JavaScript del inspector como una lista fija de quince. Ampliarlas exigía
 * tocar el editor y desplegar. Cristóbal, el 3 de octubre de 2026: «no
 * aplicaría una cantidad rígida de opciones, ya que deberíamos poder hacer
 * cualquier combinación que no sea absurda, dependiendo del breakpoint». Un
 * catálogo en un archivo se amplía sin tocar la interfaz.
 *
 * SE PUEDE EXTENDER, NO RECORTAR. El filtro `cod_catalogo` permite a un tema
 * añadir taxonomías, familias o disposiciones. Quitarlas no: inventar una
 * primitiva es cambiar el producto, pero si cada sitio pudiera recortar el
 * catálogo, el mismo módulo se comportaría distinto en cada instalación y una
 * biblioteca compartida dejaría de tener sentido.
 */
final class COD_Catalogo
{
    /** @var array<string, mixed>|null */
    private static $cache = null;

    /** Para las pruebas: vuelve a leer el archivo. */
    public static function olvidar(): void
    {
        self::$cache = null;
    }

    /**
     * El catálogo entero.
     *
     * @return array<string, mixed>
     */
    public static function todo(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $ruta = COD_PUBLISHER_DIR . 'catalogo/primitivas.json';
        $crudo = is_readable($ruta) ? (string) file_get_contents($ruta) : '';
        $datos = $crudo === '' ? null : json_decode($crudo, true);

        if (!is_array($datos)) {
            // Un catálogo ilegible no debe tumbar el editor: se devuelve vacío
            // y los paneles caen a lo que ya sabían hacer. Pero se deja dicho
            // en el registro, porque si no, un archivo mal escrito se vería
            // como «el panel salió sin opciones» y nadie sabría por qué.
            if (function_exists('error_log')) {
                error_log('ContOpe: no se pudo leer catalogo/primitivas.json');
            }
            $datos = ['version' => 0, 'familias' => [], 'taxonomias' => []];
        }

        /**
         * Filtra el catálogo. Para añadir —no para quitar—.
         *
         * @param array<string, mixed> $datos
         */
        $filtrado = apply_filters('cod_catalogo', $datos);
        self::$cache = is_array($filtrado) ? $filtrado : $datos;

        return self::$cache;
    }

    /**
     * Las disposiciones de columnas que ofrece la paleta visual, ya filtradas
     * por lo que tiene sentido en ese tamaño de pantalla.
     *
     * @return array<int, array{columnas: int, variantes: array<int, array{rotulo: string, pesos: array<int, int>}>}>
     */
    public static function columnas(string $breakpoint = 'desktop'): array
    {
        $disposicion = self::todo()['familias']['disposicion']['columnas'] ?? [];
        $grupos = is_array($disposicion['grupos'] ?? null) ? $disposicion['grupos'] : [];
        $techos = is_array($disposicion['techoPorBreakpoint'] ?? null) ? $disposicion['techoPorBreakpoint'] : [];

        $techo = isset($techos[$breakpoint]) && is_int($techos[$breakpoint])
            ? $techos[$breakpoint]
            : (int) ($techos['desktop'] ?? 6);

        $fuera = [];
        foreach ($grupos as $grupo) {
            if (!is_array($grupo) || !isset($grupo['columnas'])) {
                continue;
            }
            if ((int) $grupo['columnas'] > $techo) {
                continue;
            }
            $fuera[] = $grupo;
        }

        return $fuera;
    }

    /**
     * Qué se le ofrece a una taxonomía, con sus familias ya resueltas.
     *
     * Devuelve las dos pestañas con la definición completa de cada familia,
     * para que el inspector no tenga que cruzar nada: pide por el tipo de nodo
     * y recibe lo que puede dibujar.
     *
     * @return array{rotulo: string, configuracion: array<string, mixed>, diseno: array<string, mixed>}
     */
    public static function para(string $taxonomia): array
    {
        $cat = self::todo();
        $def = $cat['taxonomias'][$taxonomia] ?? null;
        if (!is_array($def)) {
            return ['rotulo' => '', 'configuracion' => [], 'diseno' => []];
        }

        $resolver = static function (array $nombres) use ($cat): array {
            $fuera = [];
            foreach ($nombres as $nombre) {
                $familia = $cat['familias'][$nombre] ?? null;
                if (is_array($familia)) {
                    $fuera[$nombre] = $familia;
                }
            }
            return $fuera;
        };

        return [
            'rotulo' => (string) ($def['rotulo'] ?? $taxonomia),
            'configuracion' => $resolver(is_array($def['configuracion'] ?? null) ? $def['configuracion'] : []),
            'diseno' => $resolver(is_array($def['diseno'] ?? null) ? $def['diseno'] : []),
        ];
    }

    /**
     * Lo que el editor necesita, en una sola estructura.
     *
     * Se manda entero y no por partes porque el editor lo consulta en cada
     * selección: una ida y vuelta por objeto seleccionado sería peor que unos
     * kilobytes al cargar.
     *
     * @return array<string, mixed>
     */
    public static function para_el_editor(): array
    {
        $cat = self::todo();

        return [
            'version' => $cat['version'] ?? 0,
            'controles' => $cat['controles'] ?? [],
            'familias' => $cat['familias'] ?? [],
            'taxonomias' => $cat['taxonomias'] ?? [],
        ];
    }
}
