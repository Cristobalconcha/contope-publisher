<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * El núcleo del set de diseño para el mundo «sitio web».
 *
 * Por qué existe
 * --------------
 * Hasta el 2026-09-16, cuando el set no definía una variable, el plugin ponía
 * una suya: `--cod-color-accent` caía en `#2271b1`, `--cod-color-ink` en
 * `#1d2327`, `--cod-color-surface` en `#f0f0f1`. Son los tres colores del panel
 * de administración de WordPress. Un sitio pintado así no parece roto: parece
 * decidido. Eso es lo peor que puede pasar, porque nadie va a ir a arreglarlo.
 *
 * Contradice la premisa del sistema, escrita en varias partes: el set de diseño
 * es cerrado. Lo declarado es todo lo que hay, y que algo no esté prohibido no
 * significa que esté disponible.
 *
 * Qué es el núcleo
 * ---------------
 * No es una lista de valores: es una lista de CLASES DE DEFINICIÓN necesarias
 * para poder construir un sitio. Cristóbal lo definió midiendo el suyo: si el
 * sitio funciona y no aparece ni un color del panel de WordPress, entonces lo
 * que ese sitio declara alcanza, y es el mínimo.
 *
 * De ahí salen seis roles: tres de color, dos de tipografía y uno de medida.
 * No importa cuál es el color ni cuál la tipografía; importa que exista la
 * definición. Para los colores, además, se espera una gradación de cinco
 * niveles, al modo de Material Design: una paleta de quince colores sueltos es
 * demasiado grande para mantenerla, tres roles con cinco pasos cada uno no.
 *
 * Qué hace esta clase
 * -------------------
 * Contesta una sola pregunta: **¿el set declara este rol, y dónde?** Busca en
 * las dos fuentes que un sitio WordPress tiene de verdad:
 *
 *   1. Las definiciones del tema guardadas por el plugin (Configuración).
 *   2. El `theme.json` del tema activo, que es donde WordPress mismo lee la
 *      identidad. Un tema de bloques la declara ahí y no en otra parte.
 *
 * La segunda fuente es lo que el issue #9 llamó «herencia declarada»: en vez de
 * inventar un fondo, se lee el fondo que el tema ya declaró. El origen queda
 * escrito en lugar de adivinado.
 *
 * Si ninguna fuente lo declara, esta clase **no inventa un valor**: lo informa
 * como faltante. Quien recibe ese informe decide qué hacer —avisar, no
 * publicar, pedirle el dato a alguien—, pero nadie pinta de azul a espaldas del
 * diseñador.
 */
final class COD_Design_Core
{
    /**
     * Los roles del núcleo del mundo web.
     *
     * `token` es la variable CSS con que se expresa. `gradacion` dice cuántos
     * niveles se esperan del rol: cinco para los colores, uno para lo demás.
     * Hoy la gradación sólo se declara —no se exige— porque los niveles viven
     * en el tema con sus propios nombres; queda escrita acá para que el día que
     * se formalice no haya que redescubrir cuál era la intención.
     *
     * @return array<string, array{clase: string, token: string, titulo: string, gradacion: int}>
     */
    public static function roles(): array
    {
        return [
            'accent' => [
                'clase' => 'color',
                'token' => '--cod-color-accent',
                'titulo' => 'Color de acento',
                'gradacion' => 5,
            ],
            'ink' => [
                'clase' => 'color',
                'token' => '--cod-color-ink',
                'titulo' => 'Color de tinta (texto)',
                'gradacion' => 5,
            ],
            'surface' => [
                'clase' => 'color',
                'token' => '--cod-color-surface',
                'titulo' => 'Color de superficie (fondo)',
                'gradacion' => 5,
            ],
            'heading' => [
                'clase' => 'tipografia',
                'token' => '--cod-font-heading',
                'titulo' => 'Tipografía de títulos',
                'gradacion' => 1,
            ],
            'body' => [
                'clase' => 'tipografia',
                'token' => '--cod-font-body',
                'titulo' => 'Tipografía de cuerpo',
                'gradacion' => 1,
            ],
            'measure' => [
                'clase' => 'medida',
                'token' => '--cod-layout-max-width',
                'titulo' => 'Ancho de la caja de lectura',
                'gradacion' => 1,
            ],
        ];
    }

    /**
     * Qué declara el sitio para cada rol del núcleo, y desde dónde.
     *
     * Devuelve, por rol: `declarado` (bool), `valor` (string, vacío si no),
     * `origen` ('definiciones' | 'theme.json' | '') y los datos del rol.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function estado(): array
    {
        $definiciones = self::desde_definiciones();
        $tema = self::desde_theme_json();

        $estado = [];
        foreach (self::roles() as $id => $rol) {
            $valor = '';
            $origen = '';
            if (isset($definiciones[$id]) && $definiciones[$id] !== '') {
                $valor = $definiciones[$id];
                $origen = 'definiciones';
            } elseif (isset($tema[$id]) && $tema[$id] !== '') {
                $valor = $tema[$id];
                $origen = 'theme.json';
            }
            $estado[$id] = [
                'clase' => $rol['clase'],
                'token' => $rol['token'],
                'titulo' => $rol['titulo'],
                'gradacion' => $rol['gradacion'],
                'declarado' => $valor !== '',
                'valor' => $valor,
                'origen' => $origen,
            ];
        }

        return $estado;
    }

    /**
     * Los roles del núcleo que nadie declara.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function faltantes(): array
    {
        $faltan = [];
        foreach (self::estado() as $id => $rol) {
            if (!$rol['declarado']) {
                $faltan[] = [
                    'rol' => $id,
                    'clase' => $rol['clase'],
                    'token' => $rol['token'],
                    'titulo' => $rol['titulo'],
                ];
            }
        }

        return $faltan;
    }

    /**
     * Una frase para quien lea el informe, o '' si no falta nada.
     *
     * Dice qué falta y dónde se declara, porque un aviso que no indica el
     * siguiente paso se termina ignorando igual que un valor inventado.
     */
    public static function aviso(): string
    {
        $faltan = self::faltantes();
        if ($faltan === []) {
            return '';
        }

        $nombres = [];
        foreach ($faltan as $rol) {
            $nombres[] = $rol['titulo'] . ' (' . $rol['token'] . ')';
        }

        return 'El set de diseño no declara ' . count($faltan) . ' definición(es) del núcleo: '
            . implode(', ', $nombres) . '. El plugin ya no pone un valor propio en su lugar, '
            . 'así que esas propiedades quedan sin resolver. Se declaran en el theme.json del '
            . 'tema activo o en ContOpe → Configuración.';
    }

    /**
     * Las variables `:root` del núcleo que SÍ están declaradas.
     *
     * Emite solamente lo declarado. Un rol que nadie definió no sale acá: no
     * hay valor que emitir, y ese es justamente el punto.
     */
    public static function css(): string
    {
        $reglas = [];
        foreach (self::estado() as $rol) {
            if (!$rol['declarado']) {
                continue;
            }
            $valor = $rol['valor'];
            // Un nombre de familia suelto va entre comillas —«Birthstone» sin
            // ellas no es una familia válida si algún día lleva espacios—, pero
            // una lista, algo ya entrecomillado o una función como var(...) se
            // dejan tal cual: entrecomillar un var() lo convierte en texto y la
            // tipografía no se aplica nunca.
            $es_nombre_suelto = $rol['clase'] === 'tipografia'
                && strpos($valor, ',') === false
                && strpos($valor, "'") === false
                && strpos($valor, '"') === false
                && strpos($valor, '(') === false;
            if ($es_nombre_suelto) {
                $valor = "'" . $valor . "'";
            }
            $reglas[] = $rol['token'] . ':' . $valor;
        }

        if ($reglas === []) {
            return '';
        }

        return ':root{' . implode(';', $reglas) . ';}';
    }

    /**
     * Lo que declaran las definiciones del tema guardadas por el plugin.
     *
     * @return array<string, string>
     */
    private static function desde_definiciones(): array
    {
        if (!class_exists('COD_Theme_Definitions')) {
            return [];
        }
        $v = COD_Theme_Definitions::get();
        $leer = static function ($clave) use ($v) {
            return isset($v[$clave]) ? trim((string) $v[$clave]) : '';
        };

        $ancho = $leer('layout_max_width');

        return [
            'accent' => $leer('color_accent'),
            'ink' => $leer('color_text'),
            'surface' => $leer('color_bg'),
            'heading' => $leer('font_heading'),
            'body' => $leer('font_body'),
            'measure' => $ancho === '' ? '' : $ancho . 'px',
        ];
    }

    /**
     * Lo que declara el `theme.json` del tema activo.
     *
     * Un tema de bloques declara su identidad acá: WordPress la lee de este
     * archivo y de ningún otro. Leerla es lo contrario de inventarla.
     *
     * Para el acento no hay un campo directo: se busca en la paleta un color
     * cuyo `slug` sea 'accent' o 'primary', que es como lo nombra cualquier
     * tema. Si la paleta no tiene ninguno de los dos, el rol queda sin
     * declarar, que es la respuesta honesta.
     *
     * @return array<string, string>
     */
    private static function desde_theme_json(): array
    {
        if (!function_exists('wp_get_global_settings') || !function_exists('wp_get_global_styles')) {
            return [];
        }

        $settings = wp_get_global_settings();
        $styles = wp_get_global_styles();

        $paleta = [];
        foreach (['theme', 'custom', 'default'] as $origen) {
            $lista = $settings['color']['palette'][$origen] ?? [];
            if (!is_array($lista)) {
                continue;
            }
            foreach ($lista as $color) {
                if (isset($color['slug'], $color['color'])) {
                    $paleta[(string) $color['slug']] = (string) $color['color'];
                }
            }
        }

        $acento = '';
        foreach (['accent', 'primary'] as $slug) {
            if (isset($paleta[$slug]) && $paleta[$slug] !== '') {
                $acento = $paleta[$slug];
                break;
            }
        }

        $familias = [];
        foreach (['theme', 'custom', 'default'] as $origen) {
            $lista = $settings['typography']['fontFamilies'][$origen] ?? [];
            if (!is_array($lista)) {
                continue;
            }
            foreach ($lista as $familia) {
                if (isset($familia['slug'], $familia['fontFamily'])) {
                    $familias[(string) $familia['slug']] = (string) $familia['fontFamily'];
                }
            }
        }

        $buscar_familia = static function (array $candidatos) use ($familias) {
            foreach ($candidatos as $slug) {
                if (isset($familias[$slug]) && $familias[$slug] !== '') {
                    return $familias[$slug];
                }
            }
            return '';
        };

        $cuerpo = isset($styles['typography']['fontFamily'])
            ? (string) $styles['typography']['fontFamily']
            : '';
        if ($cuerpo === '') {
            $cuerpo = $buscar_familia(['body', 'base', 'text']);
        }
        $titulos = isset($styles['elements']['heading']['typography']['fontFamily'])
            ? (string) $styles['elements']['heading']['typography']['fontFamily']
            : '';
        if ($titulos === '') {
            $titulos = $buscar_familia(['display', 'heading', 'headings', 'title']);
        }

        $ancho = $settings['layout']['contentSize'] ?? '';

        return [
            'accent' => $acento,
            'ink' => isset($styles['color']['text']) ? (string) $styles['color']['text'] : '',
            'surface' => isset($styles['color']['background']) ? (string) $styles['color']['background'] : '',
            'heading' => $titulos,
            'body' => $cuerpo,
            'measure' => is_string($ancho) ? $ancho : '',
        ];
    }
}
