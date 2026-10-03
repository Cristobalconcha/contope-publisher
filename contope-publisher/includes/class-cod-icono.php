<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Iconos: un dibujo pequeño que acompaña a un texto.
 *
 * DE DÓNDE SALE. Cristóbal, mirando el icono de WhatsApp del pie: «eso no
 * debería ser hardcoded; todo elemento de un módulo debería tener su propia
 * configuración, y ésta es una foto que debería poder ser estilizada con los
 * controles del pagebuilder». Tenía razón: hasta hoy los iconos del plugin
 * —WhatsApp, redes— viven escritos dentro del código y no hay forma de
 * cambiarles el tamaño, el color ni el dibujo desde ninguna parte.
 *
 * EL MISMO PRINCIPIO ABIERTO QUE EL DIVISOR. El icono es un SVG de Medios, no
 * una lista cerrada. Divi, con `_add_image_icon_fields`, ofrece su propia
 * fuente de iconos: lo que hay es lo que hay. Acá el repertorio es el que el
 * sitio tenga.
 *
 * LA DIFERENCIA IMPORTANTE CON EL DIVISOR, y conviene tenerla a la vista
 * porque es la misma pieza de código con la decisión contraria: un divisor se
 * estira a lo ancho de la sección y esa deformación es lo que se busca; **un
 * icono no se deforma nunca**. Un divisor lleva `preserveAspectRatio="none"`;
 * éste conserva el suyo y se dimensiona por su alto.
 */
final class COD_Icono
{
    public const ATRIBUTO_FORMA = 'data-cod-icono-forma';
    public const CLASE = 'cod-icono';

    /** Dónde va respecto del texto que acompaña. */
    public const DONDE = ['antes', 'despues'];

    /**
     * Reemplaza cada marcador de icono por su SVG, ya limpio.
     *
     * Si la forma no se puede leer, el icono desaparece sin ruido: un botón
     * sin icono se ve bien, y uno con un recuadro roto, no.
     */
    public static function resolver_en_html(string $html): string
    {
        if (strpos($html, self::ATRIBUTO_FORMA) === false) {
            return $html;
        }

        return (string) preg_replace_callback(
            '#<span([^>]*\b' . preg_quote(self::ATRIBUTO_FORMA, '#') . '="([^"]*)"[^>]*)>\s*</span>#i',
            static function (array $m): string {
                $svg = self::svg_de(html_entity_decode($m[2], ENT_QUOTES));
                if ($svg === '') {
                    return '';
                }
                return '<span' . $m[1] . '>' . $svg . '</span>';
            },
            $html
        );
    }

    /**
     * El contenido del SVG de una ruta del propio sitio, limpio y listo para
     * heredar el color.
     *
     * Sólo rutas propias, por lo mismo que el divisor: un recurso de otro
     * servidor dibujándose como propio deja al sitio dependiendo de que ese
     * servidor siga ahí.
     */
    public static function svg_de(string $ruta): string
    {
        $ruta = trim($ruta);
        if ($ruta === '' || !COD_Divisor::es_del_sitio($ruta)) {
            return '';
        }

        $archivo = self::archivo_de($ruta);
        if ($archivo === '' || !is_readable($archivo)) {
            return '';
        }

        $limpio = class_exists('COD_SVG') ? COD_SVG::limpiar((string) file_get_contents($archivo)) : null;
        if ($limpio === null) {
            return '';
        }

        $limpio = (string) preg_replace('/^\s*<\?xml[^>]*\?>\s*/i', '', $limpio);

        // Sin `preserveAspectRatio="none"`, al revés que el divisor: un icono
        // estirado se lee como un error. `fill="currentColor"` sólo cuando el
        // archivo no trae relleno propio —un icono de marca puede querer sus
        // colores— y `stroke="currentColor"` no se fuerza por lo mismo.
        $atributos = ' focusable="false" aria-hidden="true" width="100%" height="100%"';
        if (stripos($limpio, 'fill=') === false) {
            $atributos .= ' fill="currentColor"';
        }

        return (string) preg_replace('/<svg\b/i', '<svg' . $atributos, $limpio, 1);
    }

    /** La ruta en disco de un archivo .svg del sitio, contenida en la raíz. */
    private static function archivo_de(string $ruta): string
    {
        $relativa = $ruta;
        $inicio = home_url('/');
        if (strpos($relativa, $inicio) === 0) {
            $relativa = '/' . ltrim(substr($relativa, strlen($inicio)), '/');
        }
        $relativa = (string) parse_url($relativa, PHP_URL_PATH);
        if ($relativa === '' || substr(strtolower($relativa), -4) !== '.svg') {
            return '';
        }

        $raiz = defined('ABSPATH') ? rtrim(ABSPATH, '/\\') : '';
        if ($raiz === '') {
            return '';
        }
        $real = realpath($raiz . $relativa);
        $raiz_real = realpath($raiz);
        if ($real === false || $raiz_real === false || strpos($real, $raiz_real) !== 0) {
            return '';
        }

        return $real;
    }

    /**
     * El CSS del icono. Sólo geometría: el color lo hereda del texto.
     */
    public static function css(?string $html = null): string
    {
        if ($html !== null && strpos($html, self::CLASE) === false) {
            return '';
        }

        $r = '.' . self::CLASE;

        return <<<CSS
/* El icono se alinea con el texto por su propio alto y no empuja la línea. */
{$r}{display:inline-block;flex:0 0 auto;vertical-align:-0.125em;line-height:0;
width:var(--cod-icono-tamano,1em);height:var(--cod-icono-tamano,1em);}
{$r}[data-cod-icono-donde="antes"]{margin-inline-end:var(--cod-icono-separacion,.5em);}
{$r}[data-cod-icono-donde="despues"]{margin-inline-start:var(--cod-icono-separacion,.5em);}
{$r} > svg{display:block;width:100%;height:100%;}
CSS;
    }
}
