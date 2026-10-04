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
    public const ATRIBUTO_NOMBRE = 'data-cod-icono-nombre';
    public const CLASE = 'cod-icono';

    /** Dónde va respecto del texto que acompaña. */
    public const DONDE = ['antes', 'despues'];

    /**
     * El estilo de los iconos del sitio, y por qué es un ajuste del SITIO.
     *
     * Material trae cada icono en tres estilos. Elegirlo icono por icono es
     * justamente como se desordena un sistema: si un sitio es redondeado, lo
     * son sus cuarenta iconos. Cristóbal, el 4 de octubre de 2026: «creo que
     * debería quedar en sus 3 estilos cuando se selecciona».
     *
     * De ahí sale la consecuencia que decide el diseño de todo esto: el
     * documento NO puede guardar el archivo, porque entonces cambiar el estilo
     * del sitio obligaría a reescribir todas las páginas. Guarda el NOMBRE, y
     * el estilo se resuelve al mostrar. Es el mismo patrón que la forma del
     * divisor —la ruta en el documento, el dibujo al servir— un escalón más
     * arriba.
     */
    public const OPTION_KEY = 'cod_icono_estilo';

    public const ESTILOS = ['outlined', 'rounded', 'sharp'];

    /**
     * La carpeta del set, dentro de `uploads` y SIN año ni mes.
     *
     * WordPress archiva lo que se sube por fecha, y para una foto está bien.
     * Para esto no: un icono se busca por nombre, y si el set quedara repartido
     * entre `2026/10` y `2026/11` —según cuándo se descargó cada uno— habría
     * que recorrer carpetas para encontrar uno, o guardar la fecha junto al
     * nombre. El set es un recurso del sitio, no una subida con fecha.
     */
    public const CARPETA = 'contope-iconos';

    /** La carpeta del set en disco, creada si hace falta. */
    public static function carpeta(): string
    {
        $subida = wp_upload_dir();
        if (!empty($subida['error'])) {
            return '';
        }
        $ruta = trailingslashit($subida['basedir']) . self::CARPETA;
        if (!is_dir($ruta) && !wp_mkdir_p($ruta)) {
            return '';
        }
        return $ruta;
    }

    /** La dirección pública de la carpeta del set. */
    public static function carpeta_url(): string
    {
        $subida = wp_upload_dir();
        return empty($subida['error']) ? trailingslashit($subida['baseurl']) . self::CARPETA : '';
    }

    /** El estilo activo del sitio. */
    public static function estilo(): string
    {
        $guardado = (string) get_option(self::OPTION_KEY, '');
        return in_array($guardado, self::ESTILOS, true) ? $guardado : 'outlined';
    }

    /**
     * La ruta del archivo de un icono con nombre, en el estilo del sitio.
     *
     * Si ese estilo no está descargado se cae a otro que sí lo esté, en vez de
     * no dibujar nada: un icono con el estilo equivocado se nota y se arregla;
     * un hueco, no. La descarga ocurre al ELEGIR el icono, nunca al servir una
     * página —una visita no puede depender de que Google responda—.
     */
    public static function ruta_de_nombre(string $nombre): string
    {
        $nombre = strtolower(trim($nombre));
        if ($nombre === '' || preg_match('/^[a-z0-9_]{1,64}$/', $nombre) !== 1) {
            return '';
        }

        $carpeta = self::carpeta();
        $url = self::carpeta_url();
        if ($carpeta === '' || $url === '') {
            return '';
        }

        foreach (array_merge([self::estilo()], self::ESTILOS) as $estilo) {
            $archivo = 'icono-' . $nombre . '-' . $estilo . '.svg';
            if (is_readable(trailingslashit($carpeta) . $archivo)) {
                return trailingslashit($url) . $archivo;
            }
        }

        // Las redes no tienen estilos: una marca registrada se dibuja como es.
        $archivo = 'icono-' . $nombre . '.svg';
        if (is_readable(trailingslashit($carpeta) . $archivo)) {
            return trailingslashit($url) . $archivo;
        }

        return '';
    }

    /**
     * Reemplaza cada marcador de icono por su SVG, ya limpio.
     *
     * Si la forma no se puede leer, el icono desaparece sin ruido: un botón
     * sin icono se ve bien, y uno con un recuadro roto, no.
     */
    public static function resolver_en_html(string $html): string
    {
        if (strpos($html, self::ATRIBUTO_FORMA) === false && strpos($html, self::ATRIBUTO_NOMBRE) === false) {
            return $html;
        }

        // Primero los que traen NOMBRE: se convierten en una ruta del sitio,
        // en el estilo que el sitio tenga, y de ahí siguen el mismo camino que
        // cualquier otro icono.
        $html = (string) preg_replace_callback(
            '#<span([^>]*\b' . preg_quote(self::ATRIBUTO_NOMBRE, '#') . '="([^"]*)"[^>]*)>\s*</span>#i',
            static function (array $m): string {
                $ruta = self::ruta_de_nombre(html_entity_decode($m[2], ENT_QUOTES));
                if ($ruta === '') {
                    return '';
                }
                $svg = self::svg_de($ruta);
                return $svg === '' ? '' : '<span' . $m[1] . '>' . $svg . '</span>';
            },
            $html
        );

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
