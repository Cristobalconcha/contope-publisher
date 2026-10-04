<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Divisores: el borde no recto entre una sección y la siguiente.
 *
 * QUÉ SON. La franja con forma —una pendiente, una onda, unos cerros— que
 * separa dos secciones en vez de una línea horizontal. Divi los tiene desde
 * hace años y son de lo más usado en diseño web.
 *
 * EN QUÉ NOS DIFERENCIAMOS, que es la razón de construirlos. Divi trae **27
 * formas fijas** —Slant, Arrow, Ramp, Curve, Mountains, Wave, Waves,
 * Asymmetric, Graph, Triangle, Clouds y sus variantes— y ésas son todas las
 * que hay. Si tu diseño pide la silueta de un nogal o el perfil de un cerro,
 * no existe y no hay por dónde meterla.
 *
 * Acá la forma es **un recurso del sitio**: un SVG de Medios. Cristóbal, el 3
 * de octubre de 2026: «a diferencia de lo que ofrece Divi, nosotros tenemos
 * que construir un sistema totalmente abierto donde el usuario pueda
 * reemplazar las texturas, las imágenes, todos los insumos. Somos como Divi
 * pero libre, abierto y modificable por el usuario».
 *
 * POR QUÉ EL SVG VA EN LÍNEA Y NO EN UNA `<img>`. Porque el color del divisor
 * tiene que poder cambiarse, y una imagen externa no se puede recolorear desde
 * CSS. En línea, sus trazos heredan `currentColor` y el color lo pone el
 * diseño. Es la misma razón por la que el icono de WhatsApp del plugin va en
 * línea y no como archivo.
 *
 * POR QUÉ SE INYECTA AL MOSTRAR Y NO AL COMPONER. El documento guardado lleva
 * sólo la RUTA del SVG; el contenido se pone al servir la página. Así,
 * reemplazar el archivo llega a todas las páginas sin recomponer ninguna, el
 * documento no engorda con SVG ajeno, y el saneador del documento no tiene que
 * cargar con marcado que no escribió nadie de acá. Es el mismo patrón que la
 * clave de Mapbox (COD_Mapa) y las cuentas de redes (COD_Redes_Sociales).
 *
 * SEGURIDAD. El SVG se limpia con COD_SVG::limpiar() ANTES de ponerlo en la
 * página, aunque ya se hubiera limpiado al subirlo. Dos veces, a propósito: un
 * archivo puede haber llegado a `uploads` por otra vía —FTP, una migración, un
 * plugin— sin pasar nunca por nuestra subida.
 */
final class COD_Divisor
{
    public const ATRIBUTO_FORMA = 'data-cod-divisor-forma';
    public const CLASE = 'cod-divisor';

    /** Dónde puede ir. */
    public const DONDE = ['arriba', 'abajo', 'ambos'];

    /**
     * Cuántas capas extra admite un divisor.
     *
     * POR QUÉ HAY CAPAS. Una forma sola lee como un recorte: la banda de abajo
     * mordiendo a la de arriba, y nada más. Dos o tres de la misma forma,
     * corridas entre sí y con distinta opacidad, leen como PROFUNDIDAD —que es
     * lo que uno quiere de una onda—. Cristóbal, el 3 de octubre de 2026: «los
     * divisores quedan como un poco duros; tal vez que se puedan aplicar dos
     * capas con diferentes niveles de alfa, y con desplazamiento».
     *
     * CUATRO Y NO MÁS. Cada capa translúcida encima de otra sube el valor del
     * conjunto; pasadas tres o cuatro el degradado se empasta y la forma deja
     * de leerse. No es una limitación técnica sino el punto donde el recurso
     * se vuelve contra sí mismo.
     */
    public const MAX_CAPAS = 4;

    /**
     * Reemplaza cada marcador de divisor por su SVG, ya limpio.
     *
     * Si la forma no se puede leer o no es un SVG válido, el divisor
     * desaparece sin ruido: una sección sin divisor se ve bien, y una con un
     * recuadro roto, no.
     */
    public static function resolver_en_html(string $html): string
    {
        if (strpos($html, self::ATRIBUTO_FORMA) === false) {
            return $html;
        }

        return (string) preg_replace_callback(
            '#<div([^>]*\b' . preg_quote(self::ATRIBUTO_FORMA, '#') . '="([^"]*)"[^>]*)>\s*</div>#i',
            static function (array $m): string {
                $svg = self::svg_de(html_entity_decode($m[2], ENT_QUOTES));
                if ($svg === '') {
                    return '';
                }
                return '<div' . $m[1] . '>' . $svg . '</div>';
            },
            $html
        );
    }

    /**
     * El contenido del SVG de una ruta del propio sitio, limpio y listo para
     * heredar el color.
     *
     * Sólo rutas propias. Una forma traída de otro servidor sería un recurso
     * ajeno dibujándose como propio, y además dejaría al sitio dependiendo de
     * que ese servidor siga ahí.
     */
    public static function svg_de(string $ruta): string
    {
        $ruta = trim($ruta);
        if ($ruta === '' || !self::es_del_sitio($ruta)) {
            return '';
        }

        $archivo = self::archivo_de($ruta);
        if ($archivo === '' || !is_readable($archivo)) {
            return '';
        }

        $crudo = (string) file_get_contents($archivo);
        $limpio = class_exists('COD_SVG') ? COD_SVG::limpiar($crudo) : null;
        if ($limpio === null) {
            return '';
        }

        // Fuera la declaración XML: el SVG va dentro del HTML, no es un
        // documento aparte.
        $limpio = (string) preg_replace('/^\s*<\?xml[^>]*\?>\s*/i', '', $limpio);

        // Que llene su caja y herede el color. `preserveAspectRatio="none"` es
        // a propósito: un divisor se estira a lo ancho de la sección, y ésa es
        // justamente la deformación que se busca. (Para una pieza de diseño que
        // NO debe deformarse, ver la nota contraria en el mapa de lotes.)
        $limpio = (string) preg_replace(
            '/<svg\b/i',
            '<svg preserveAspectRatio="none" focusable="false" aria-hidden="true" fill="currentColor"',
            $limpio,
            1
        );

        return $limpio;
    }

    /** ¿Es una ruta del propio sitio? */
    public static function es_del_sitio(string $ruta): bool
    {
        if ($ruta === '' || strpos($ruta, '..') !== false) {
            return false;
        }
        if (strpos($ruta, '/') === 0) {
            return true;
        }
        $inicio = home_url('/');
        return strpos($ruta, $inicio) === 0;
    }

    /** La ruta en disco de un archivo del sitio. */
    private static function archivo_de(string $ruta): string
    {
        $relativa = $ruta;
        $inicio = home_url('/');
        if (strpos($relativa, $inicio) === 0) {
            $relativa = '/' . ltrim(substr($relativa, strlen($inicio)), '/');
        }
        $relativa = (string) parse_url($relativa, PHP_URL_PATH);
        if ($relativa === '' || substr($relativa, -4) !== '.svg') {
            return '';
        }

        $raiz = defined('ABSPATH') ? rtrim(ABSPATH, '/\\') : '';
        if ($raiz === '') {
            return '';
        }
        $archivo = $raiz . $relativa;
        $real = realpath($archivo);
        $raiz_real = realpath($raiz);

        // Que no se salga del sitio por un enlace simbólico o un `..` que se
        // haya colado pese a la comprobación de arriba.
        if ($real === false || $raiz_real === false || strpos($real, $raiz_real) !== 0) {
            return '';
        }

        return $real;
    }

    /**
     * El CSS del divisor. Sólo geometría: el color y la forma los pone el
     * diseño de cada sitio.
     */
    public static function css(?string $html = null): string
    {
        if ($html !== null && strpos($html, self::CLASE) === false) {
            return '';
        }

        $r = '.' . self::CLASE;

        return <<<CSS
/* El divisor se apoya en el borde de su sección y no empuja el contenido. */
{$r}{position:absolute;left:0;right:0;z-index:1;pointer-events:none;line-height:0;overflow:hidden;
height:var(--cod-divisor-alto,80px);opacity:var(--cod-divisor-alfa,1);}
{$r}[data-cod-divisor-donde="arriba"]{top:0;--cod-divisor-sy:-1;}
{$r}[data-cod-divisor-donde="abajo"]{bottom:0;}
/* El sobreancho es lo que permite desplazar una capa sin despegarla de los
   bordes: el dibujo se hace más ancho que su caja y se corre hacia atrás la
   misma medida, así el desplazamiento ocurre DENTRO del recorte y nunca deja
   una esquina vacía. Sin esto, correr una capa 60px abre un hueco de 60px. */
/* El hueco que el divisor se reserva en el flujo para no caerle encima al
   contenido. Su alto lo escribe el compilador, con el de la capa más alta. */
.cod-divisor-reserva{pointer-events:none;}
{$r} > svg{display:block;height:100%;
width:calc(100% * var(--cod-divisor-repeticion,1) + 2 * var(--cod-divisor-margen,0px));
margin-inline-start:calc(-1 * var(--cod-divisor-margen,0px));
transform:translateX(var(--cod-divisor-dx,0px)) scale(var(--cod-divisor-sx,1),var(--cod-divisor-sy,1));}
/* Volteado: la misma forma del revés, sin necesitar un archivo distinto —que
   es la mitad de las 27 formas de Divi, que son pares de lo mismo invertido. */
{$r}[data-cod-divisor-voltear="1"]{--cod-divisor-sx:-1;}
/* El contenedor del divisor tiene que ser el ancla de su posición. `:has` es
   lo que permite no exigirle al diseño que lo declare: si hay divisor dentro,
   el contenedor se vuelve relativo solo. */
:where(section, header, footer, .cod-node):has(> {$r}){position:relative;}
CSS;
    }
}
