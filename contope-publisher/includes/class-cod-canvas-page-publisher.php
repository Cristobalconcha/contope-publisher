<?php

if (!defined('ABSPATH')) {
    exit;
}

/** Publishes a saved Canvas document as a stable WordPress page. */
final class COD_Canvas_Page_Publisher
{
    public const META_DOCUMENT_ID = '_cod_canvas_document_id';

    /** @var string|null Cache por request del CSS de fuentes autocontenidas. */
    private static ?string $site_font_css_cache = null;

    public function __construct(
        private COD_Canvas_Document_Repository $repository,
        private ?COD_Template_Region_Resolver $region_resolver = null,
        private ?COD_Dynamic_Token_Resolver $token_resolver = null
    ) {
    }

    /** Nombre actual del shortcode que inserta un documento en una página. */
    public const SHORTCODE = 'contope_canvas';

    /**
     * El nombre que usaba el plugin antes del cambio de nombre del proyecto.
     *
     * El contenido de cada página publicada es literalmente
     * `[open_codesign_canvas document_id="…"]`, guardado en post_content. Un
     * sitio que viene de la versión anterior tiene ese texto en sus páginas, y
     * dejar de reconocerlo no deja un error: WordPress imprime el shortcode
     * como texto plano y la página queda en blanco con un corchete a la vista.
     *
     * Se podría reescribir el contenido de las páginas en la migración, pero
     * aceptar el nombre viejo es mejor: no toca contenido que es de la persona,
     * funciona también si alguien escribió el shortcode a mano en cualquier
     * otro lugar del sitio, y no hay nada que rehacer si la migración se corre
     * a medias.
     */
    public const SHORTCODE_HEREDADO = 'open_codesign_canvas';

    /** ¿Este contenido inserta un documento, con el nombre que sea? */
    private static function tiene_shortcode(string $contenido): bool
    {
        return has_shortcode($contenido, self::SHORTCODE)
            || has_shortcode($contenido, self::SHORTCODE_HEREDADO);
    }

    /** Evita que el CSS se emita dos veces cuando ya salió en la cabecera. */
    private static bool $css_ya_emitido = false;

    private static ?string $shared_css_cache = null;

    public function register(): void
    {
        add_shortcode(self::SHORTCODE, [$this, 'render_shortcode']);
        add_shortcode(self::SHORTCODE_HEREDADO, [$this, 'render_shortcode']);
        add_action('wp_enqueue_scripts', [$this, 'estilos_en_cabecera'], 5);
        add_action('wp_head', [self::class, 'precarga_en_cabecera'], 1);
        add_filter('template_include', [$this, 'standalone_template']);
    }

    /**
     * Devuelve el CSS de @font-face autocontenido de las tipografías del sitio.
     *
     * Lo genera scripts/build-fonts.mjs en uploads/contope/fonts/fonts.css.
     * Las URLs llegan con el placeholder {FONTS_BASE_URL}, que aquí se resuelve
     * contra el directorio de uploads real (portable entre instalaciones). Si el
     * archivo no existe devuelve cadena vacía y todo sigue funcionando como hoy.
     */
    /**
     * Carrusel en varias filas. Es el MISMO módulo de siempre con un parámetro
     * (data-cod-carousel-rows); con 1 fila —el valor por defecto— este CSS no
     * aplica y nada cambia.
     *
     * La pista pasa de fila flexible a grilla que se llena por columnas: cada
     * columna trae `rows` diapositivas y el motor avanza de a una columna. El
     * ancho de columna sale de --cod-carousel-columnas, que el motor escribe
     * según cuántas caben (escritorio o móvil), porque el CSS no puede leer el
     * atributo.
     */
    /**
     * Rótulo del marcador de shortcode DENTRO DEL EDITOR. En la página
     * publicada el marcador ya no existe —se reemplazó por la salida real—,
     * así que este CSS solo tiene sentido en el lienzo: sin él sería un
     * rectángulo vacío imposible de encontrar y de seleccionar.
     */
    public static function shortcode_marker_css(): string
    {
        return '[data-cod-shortcode]{display:flex;align-items:center;justify-content:center;'
            . 'min-height:120px;padding:16px;border:1px dashed rgb(201,154,46);border-radius:8px;'
            . 'background:rgba(255,243,214,.5);color:rgb(138,90,0);'
            . 'font-family:system-ui,sans-serif;font-size:12px;font-weight:600;letter-spacing:.04em;}'
            . '[data-cod-shortcode]::before{content:"⧉ " attr(data-cod-shortcode);}';
    }

    public static function carousel_rows_css(): string
    {
        $css = '';
        foreach ([2, 3] as $filas) {
            $sel = '[data-cod-carousel-rows="' . $filas . '"]';
            $css .= $sel . ' .gallery-carousel__track,' . $sel . ' .cod-carousel__track{'
                . 'display:grid;grid-auto-flow:column;'
                . 'grid-template-rows:repeat(' . $filas . ',auto);'
                . 'grid-auto-columns:calc((100% - (var(--cod-carousel-columnas,4) - 1) * var(--cod-carousel-gap,12px)) / var(--cod-carousel-columnas,4));'
                . '}';
            // En grilla, el flex-basis de cada diapositiva ya no manda: el ancho
            // lo pone la columna. Se neutraliza para que no compita.
            $css .= $sel . ' .gallery-carousel__slide,' . $sel . ' .cod-carousel__slide{'
                . 'flex-basis:auto;width:auto;min-width:0;'
                . '}';
        }
        return $css;
    }

    /**
     * Giro de imágenes para páginas armadas en el editor (las compiladas por
     * MCP lo traen en sus propios estilos base). El giro vive en la <img>, no
     * en el marco, porque dentro de una galería cada foto lleva el suyo.
     *
     * 90 y 270 cambian la forma de la caja: la imagen girada necesita medir el
     * ALTO del marco de ancho y el ANCHO de alto, y eso lo resuelven las
     * unidades de contenedor sobre el marco marcado como tal. Sin ese
     * intercambio, girar deja franjas vacías a los lados.
     */
    /**
     * Reglas base del Grupo Dinámico, emitidas por el plugin.
     *
     * Antes vivían sólo en la hoja del editor y `cod-editor-core.js` las
     * copiaba DENTRO del CSS de cada documento, en cada guardado, para que la
     * página publicada las tuviera. Esa copia se sumaba a la del guardado
     * anterior: la portada de Santa Luisa llegó a tener cada una de estas
     * once reglas siete veces, un 13,6% de su CSS. Ver la issue #12.
     *
     * El CSS base de un módulo del plugin es del plugin, no del documento. Al
     * emitirlo acá se publica una sola vez, no puede acumularse, y además se
     * corrige solo en todas las páginas cuando cambia.
     *
     * Va ANTES del CSS del documento a propósito: lo que el usuario
     * personalizó tiene que seguir ganando la cascada.
     */
    public static function dynamic_group_css(string $html): string
    {
        // Ninguna página que no use el módulo tiene por qué cargar sus
        // reglas. Se comprueba contra el HTML y nunca contra el CSS: el CSS
        // de los documentos viejos todavía arrastra copias de estas mismas
        // reglas, así que mirarlo daría siempre verdadero.
        if (strpos($html, 'cod-dynamic-group') === false) {
            return '';
        }

        return '.cod-dynamic-group{display:grid;gap:20px;}'
            . '.cod-dynamic-group--grid-2{grid-template-columns:repeat(2,minmax(0,1fr));}'
            . '.cod-dynamic-group--grid-3{grid-template-columns:repeat(3,minmax(0,1fr));}'
            . '.cod-dynamic-group--grid-4{grid-template-columns:repeat(4,minmax(0,1fr));}'
            . '.cod-dynamic-group--list{grid-template-columns:minmax(0,1fr);}'
            . '.cod-dynamic-group--carousel{display:flex;gap:20px;overflow-x:auto;'
            . 'scroll-snap-type:x mandatory;padding-bottom:4px;}'
            . '.cod-dynamic-group--carousel > .cod-dynamic-group__card{'
            . 'flex:0 0 min(78%,320px);scroll-snap-align:start;}'
            . '.cod-dynamic-group__card{min-width:0;box-sizing:border-box;padding:16px;'
            . 'border:1px solid #dcdcde;border-radius:8px;background:#fff;}'
            . '.cod-dynamic-group__image{display:block;width:100%;height:auto;border-radius:6px;}'
            . '.cod-dynamic-group__title{margin:12px 0 6px;}'
            . '.cod-dynamic-group__text{margin:0;}';
    }

    /**
     * Geometría del behavior «cuadrantes» (cuatro contenidos: en reposo una
     * grilla 2x2 de imágenes cuadradas; al activar uno, su imagen crece a la
     * mitad del bloque, el texto va en la otra mitad y las otras tres pasan a
     * miniaturas). El runtime vive en cod-canvas-public.js y cod-behaviors.js
     * (montarCuadrantes) y sólo marca atributos; toda la disposición sale de acá.
     *
     * Es el port de la hoja original del módulo (la del sitio de Econut, que
     * estaba clavada en 900px con celdas de 440px). Lo que se conserva, en
     * proporción, porque es lo que hace bueno al módulo:
     *
     *   - celdas cuadradas con 20px de separación sobre 900px (2,22% del ancho);
     *   - miniaturas de 88px sobre celdas de 440px (20% del lado de la celda) y
     *     14px entre ellas (3,18% del lado de la celda), con borde de 1px;
     *   - INVARIANTE: las tres miniaturas forman una mini 2x2 con un hueco donde
     *     estaba la activa. La que estaba a la derecha sigue a la derecha, la de
     *     abajo sigue abajo. Se pegan a la esquina de la imagen expandida que
     *     mira al centro del bloque y no tienen margen;
     *   - al activar, el bloque pasa de alto 2 celdas + separación a alto 1 celda
     *     (la imagen y el texto quedan lado a lado, cada uno del tamaño de una
     *     celda); el radio de 8px; y la «×» en la esquina superior derecha.
     *
     * Lo que cambia respecto de la hoja original, y sólo esto: (1) es fluido, no
     * clavado en píxeles: todo se mide en cqw, o sea en % del ancho del bloque,
     * y las celdas son cuadradas por construcción; (2) sin !important, que ahí
     * sólo peleaba contra Divi; (3) el movimiento usa el token del set en vez de
     * `all 0.4s ease-in-out`; (4) móvil (hasta 700px): el reposo sigue siendo 2x2
     * y, al activar, la imagen va arriba, el texto abajo y las miniaturas en fila
     * dentro de la imagen; ahí sí se rompe la invariante, porque no hay espacio.
     *
     * CÓMO SE MIDE. La raíz es un contenedor (container-type: inline-size), así
     * que sus hijos miden en cqw. Todo sale de un solo número, la separación como
     * fracción del ancho (--cuad-g); de ahí salen la celda, la miniatura y su
     * separación. Cada imagen tiene su posición de origen (--cuad-k columna,
     * --cuad-r fila) y esa posición decide dónde queda como miniatura.
     *
     *   ítem 1: imagen a la izquierda, texto a la derecha, miniaturas abajo-derecha
     *   ítem 2: imagen a la derecha, texto a la izquierda, miniaturas abajo-izquierda
     *   ítem 3: imagen a la izquierda, texto a la derecha, miniaturas arriba-derecha
     *   ítem 4: imagen a la derecha, texto a la izquierda, miniaturas arriba-izquierda
     *
     * SÓLO geometría y movimiento. Ningún color de marca ni tipografía: eso lo
     * ponen las reglas de diseño de cada sitio. Los únicos colores son las
     * palabras clave del sistema (Canvas, CanvasText) en el borde de las
     * miniaturas, la «×» y el anillo de foco: heredan del navegador y no de una
     * marca. Sin degradados.
     *
     * Movimiento: el cambio de estado (el bloque cambia de alto y las imágenes
     * viajan) usa --cod-motion-response, y el texto al aparecer usa
     * --cod-motion-enter. Si el sitio no declara esos tokens la transición
     * queda inválida y el cambio es instantáneo, que es lo correcto: aquí no se
     * inventan duraciones. Con prefers-reduced-motion no hay transición ni
     * animación, y el estado cambia igual.
     *
     * Ajustes que un sitio puede sobrescribir (todos opcionales):
     *   --cod-cuadrantes-separacion (número: fracción del ancho, por omisión .0222222),
     *   --cod-cuadrantes-radio (por omisión --cod-radius y, si no, 8px),
     *   --cod-cuadrantes-aire (relleno del texto),
     *   --cod-cuadrantes-movil-miniatura-ancho / -separacion / -margen (móvil, en % de la imagen).
     *
     * Regla del proyecto: nunca una abreviada con variable (background,
     * border, font, margin, padding). Donde entra una variable, forma larga.
     *
     * @param string|null $html HTML de la página: si se entrega y no menciona
     *                          «cuadrantes», no se emite nada. Null = siempre.
     */
    public static function cuadrantes_css(?string $html = null): string
    {
        if ($html !== null && strpos($html, 'cuadrantes') === false) {
            return '';
        }

        $r = '.cod-cuadrantes[data-cod-behavior="cuadrantes"]';
        // Las piezas van SIN el prefijo de la raíz: cada regla lo pone donde
        // corresponde ($r, $activo, $izq...) para no repetirlo dentro del selector.
        $medio = '.cod-cuadrantes__media';
        $panel = '.cod-cuadrantes__info';
        $boton = '.cod-cuadrantes__disparador';
        $cerrar = '.cod-cuadrantes__cerrar';
        $activo = $r . '[data-cod-cuadrantes-estado="activo"]';
        $izq = $r . '[data-cod-cuadrantes-lado="izquierda"]';
        $der = $r . '[data-cod-cuadrantes-lado="derecha"]';
        $arriba = $r . '[data-cod-cuadrantes-esquina="arriba"]';
        $abajo = $r . '[data-cod-cuadrantes-esquina="abajo"]';
        $rol = static function (string $nombre): string {
            return '[data-cod-cuadrantes-rol="' . $nombre . '"]';
        };
        $item = static function (int $n): string {
            return '[data-cod-cuadrantes-item="' . $n . '"]';
        };
        $ranura = static function (int $n): string {
            return '[data-cod-cuadrantes-slot="' . $n . '"]';
        };

        $css = <<<CSS
/* Raíz: contenedor (sus hijos miden en cqw) y, en reposo, un cuadrado: dos celdas más una separación. Todo sale de --cuad-g. */
{$r}{position:relative;box-sizing:border-box;overflow:hidden;container-type:inline-size;aspect-ratio:1;
--cuad-g:var(--cod-cuadrantes-separacion,.0222222);
--cuad-c:calc((1 - var(--cuad-g)) / 2);
--cuad-gap:calc(var(--cuad-g) * 100cqw);
--cuad-cel:calc(var(--cuad-c) * 100cqw);
--cuad-min:calc(var(--cuad-cel) * .2);
--cuad-sep:calc(var(--cuad-cel) * .0318182);
--cuad-caja:calc(2 * var(--cuad-min) + var(--cuad-sep));
--cuad-radio:var(--cod-cuadrantes-radio,var(--cod-radius,8px));
--cuad-aire:var(--cod-cuadrantes-aire,1.5rem);
--cuad-movil-mini-w:var(--cod-cuadrantes-movil-miniatura-ancho,22%);
--cuad-movil-sep:var(--cod-cuadrantes-movil-miniatura-separacion,2%);
--cuad-movil-margen:var(--cod-cuadrantes-movil-margen,3%);}
/* El hijo de la raíz no genera caja: su imagen y su texto se ubican directo en el bloque. */
{$r} .cod-cuadrantes__item{display:contents;}

/* Cada imagen tiene su celda de origen (columna --cuad-k, fila --cuad-r). En reposo, un cuadrante de la grilla 2x2. */
{$r} {$medio}{position:absolute;box-sizing:border-box;margin:0;overflow:hidden;z-index:1;border-radius:var(--cuad-radio);
width:var(--cuad-cel);height:var(--cuad-cel);
left:calc(var(--cuad-k) * (var(--cuad-cel) + var(--cuad-gap)));top:calc(var(--cuad-r) * (var(--cuad-cel) + var(--cuad-gap)));}
{$r} {$medio}{$item(1)}{--cuad-k:0;--cuad-r:0;}
{$r} {$medio}{$item(2)}{--cuad-k:1;--cuad-r:0;}
{$r} {$medio}{$item(3)}{--cuad-k:0;--cuad-r:1;}
{$r} {$medio}{$item(4)}{--cuad-k:1;--cuad-r:1;}
/* La imagen original llena su celda sin aportarle tamaño propio: el tamaño lo manda la regla de la celda. */
{$r} {$medio} > *:not({$boton}){position:absolute;top:0;left:0;display:block;box-sizing:border-box;width:100%;height:100%;margin:0;}
{$r} {$medio} img:not([data-cod-rotation]),{$r} {$medio} video{display:block;width:100%;height:100%;object-fit:cover;}
{$r} {$medio} figcaption{display:none;}

/* Activo: el bloque baja a una celda de alto; la imagen y el texto quedan lado a lado, cada uno del tamaño de una celda. */
{$activo}{aspect-ratio:1 / var(--cuad-c);}
{$izq}{--cuad-caja-x:calc(var(--cuad-cel) - var(--cuad-caja));--cuad-texto-x:calc(var(--cuad-cel) + var(--cuad-gap));--cuad-imagen-x:0px;}
{$der}{--cuad-caja-x:calc(var(--cuad-cel) + var(--cuad-gap));--cuad-texto-x:0px;--cuad-imagen-x:calc(var(--cuad-cel) + var(--cuad-gap));}
{$abajo}{--cuad-caja-y:calc(var(--cuad-cel) - var(--cuad-caja));}
{$arriba}{--cuad-caja-y:0px;}
{$activo} {$medio}{$rol('activa')}{left:var(--cuad-imagen-x);top:0;}
/* Miniaturas: la mini 2x2 con el hueco de la activa, pegada a la esquina de la imagen que mira al centro. Cada una en su celda de origen. */
{$activo} {$medio}{$rol('miniatura')}{z-index:3;width:var(--cuad-min);height:var(--cuad-min);
border-width:1px;border-style:solid;border-color:Canvas;
left:calc(var(--cuad-caja-x) + var(--cuad-k) * (var(--cuad-min) + var(--cuad-sep)));
top:calc(var(--cuad-caja-y) + var(--cuad-r) * (var(--cuad-min) + var(--cuad-sep)));}

/* Texto: una celda, en la otra mitad. Oculto (y fuera del orden de tabulación) salvo el del ítem activo. */
{$r} {$panel}{position:absolute;box-sizing:border-box;margin:0;top:0;left:calc(var(--cuad-cel) + var(--cuad-gap));width:var(--cuad-cel);height:var(--cuad-cel);overflow:auto;z-index:2;align-content:start;
padding-top:calc(var(--cuad-aire) + 1.25rem);padding-right:var(--cuad-aire);padding-bottom:var(--cuad-aire);padding-left:var(--cuad-aire);
opacity:0;visibility:hidden;pointer-events:none;}
{$activo} {$panel}{left:var(--cuad-texto-x);}
{$r} {$panel}[data-cod-cuadrantes-visible="true"]{opacity:1;visibility:visible;pointer-events:auto;}

/* Botón que cubre la imagen: es el «button de verdad» del cuadrante o la miniatura. */
{$r} {$boton}{position:absolute;left:0;top:0;width:100%;height:100%;z-index:1;padding:0;margin:0;border:0;background-color:transparent;color:inherit;appearance:none;cursor:pointer;}
{$r} {$boton}:hover{box-shadow:inset 0 0 0 3px Canvas;}
{$r} {$boton}:focus-visible{outline:3px solid CanvasText;outline-offset:-3px;box-shadow:inset 0 0 0 6px Canvas;}
{$r} {$medio}{$rol('activa')} {$boton}{cursor:default;box-shadow:none;}

/* «×»: en la esquina superior derecha del bloque, como en el original, pero con un respiro para que quede dentro del área visible y no pegada al borde. */
{$r} {$cerrar}{position:absolute;top:.5rem;right:.5rem;z-index:1000;box-sizing:border-box;min-width:1.75rem;min-height:1.75rem;
padding-top:3px;padding-right:6px;padding-bottom:3px;padding-left:6px;margin:0;border:0;border-radius:5px;
background-color:Canvas;color:CanvasText;box-shadow:0 0 2px rgba(0,0,0,.3);font-weight:bold;font-size:14px;line-height:1em;cursor:pointer;}
{$r} {$cerrar}[hidden]{display:none;}
{$r} {$cerrar}:focus-visible{outline:3px solid CanvasText;outline-offset:2px;}

/* Con movimiento permitido: el bloque cambia de alto y las imágenes viajan (el clic responde); el texto aparece. */
@media (prefers-reduced-motion:no-preference){
{$r}{transition:aspect-ratio var(--cod-motion-response);}
{$r} {$medio}{transition:left var(--cod-motion-response),top var(--cod-motion-response),width var(--cod-motion-response),height var(--cod-motion-response);}
{$r} {$panel}{transition:opacity var(--cod-motion-enter);}
{$r} {$boton}{transition:box-shadow var(--cod-motion-response);}
}

/* Móvil: el reposo sigue siendo 2x2; al activar, la imagen arriba (4:3), el texto abajo y las miniaturas en fila dentro de la imagen. */
@media (max-width:700px){
{$activo}{display:grid;grid-template-columns:minmax(0,1fr);aspect-ratio:auto;transition:none;}
{$activo} {$medio}{$rol('activa')}{position:relative;left:auto;top:auto;width:auto;height:auto;aspect-ratio:4/3;grid-area:1/1;align-self:start;transition:none;}
{$activo} {$medio}{$rol('miniatura')}{position:relative;left:auto;top:auto;width:var(--cuad-movil-mini-w);height:auto;aspect-ratio:1;grid-area:1/1;transition:none;}
{$izq} {$medio}{$rol('miniatura')}{justify-self:end;margin-right:calc(var(--cuad-movil-margen) + (2 - var(--cuad-slot)) * (var(--cuad-movil-mini-w) + var(--cuad-movil-sep)));}
{$der} {$medio}{$rol('miniatura')}{justify-self:start;margin-left:calc(var(--cuad-movil-margen) + var(--cuad-slot) * (var(--cuad-movil-mini-w) + var(--cuad-movil-sep)));}
{$abajo} {$medio}{$rol('miniatura')}{align-self:end;margin-bottom:var(--cuad-movil-margen);}
{$arriba} {$medio}{$rol('miniatura')}{align-self:start;margin-top:var(--cuad-movil-margen);}
{$r} {$medio}{$ranura(0)}{--cuad-slot:0;}
{$r} {$medio}{$ranura(1)}{--cuad-slot:1;}
{$r} {$medio}{$ranura(2)}{--cuad-slot:2;}
{$activo} {$panel}[data-cod-cuadrantes-visible="true"]{position:relative;left:auto;top:auto;width:auto;height:auto;overflow:visible;grid-area:2/1;transition:none;}
{$activo} {$panel}[data-cod-cuadrantes-visible="false"]{display:none;}
{$activo} {$cerrar}{position:relative;top:auto;right:auto;grid-area:2/1;justify-self:end;align-self:start;margin-top:.5rem;margin-right:.5rem;}
}
@media (max-width:700px) and (prefers-reduced-motion:no-preference){
@keyframes cod-cuadrantes-aparecer{from{opacity:0;}to{opacity:1;}}
{$activo} {$panel}[data-cod-cuadrantes-visible="true"]{animation:cod-cuadrantes-aparecer var(--cod-motion-enter);}
}
CSS;

        // Fuera comentarios y saltos de línea: se emite en línea en cada página.
        $css = (string) preg_replace('~/\*.*?\*/~s', '', $css);
        return (string) preg_replace('~\s*\n\s*~', '', $css);
    }

    /**
     * Geometría del behavior «pestanas» (un juego de pestañas: una fila de
     * etiquetas arriba y, debajo, el panel de la activa). El runtime vive en
     * cod-canvas-public.js y cod-behaviors.js (montarPestanas) y sólo marca
     * atributos, arma la lista de botones y mueve el alto; toda la disposición
     * sale de acá.
     *
     * Mirado en el módulo Tabs de Divi (econut.cl):
     *   - Divi flota las etiquetas a la izquierda (float:left) y les iguala el
     *     alto por JavaScript. Acá la lista es un flex con align-items:stretch:
     *     misma fila, mismo alto, sin JavaScript.
     *   - Divi, bajo 768px, apila las etiquetas una sobre otra (float:none,
     *     display:block, borde abajo). Acá también se apilan, bajo 700px, y por
     *     la misma razón: NUNCA se esconde una pestaña. La alternativa
     *     —deslizar la fila— deja etiquetas fuera de la vista sin ninguna
     *     señal, y en un teléfono el gesto se confunde con el desplazamiento
     *     de la página. Apiladas, cada etiqueta es un blanco táctil ancho. Si
     *     un sitio prefiere dos por fila, --cod-pestanas-movil-base lo permite.
     *   - Divi esconde los paneles inactivos con display:none y desvanece uno
     *     detrás del otro (500 ms + 500 ms, en serie). Acá el inactivo se
     *     esconde igual, pero el nuevo aparece de inmediato con
     *     --cod-motion-enter y el alto del bloque viaja con
     *     --cod-motion-response, que es lo que Divi no hace (el alto salta).
     *
     * SÓLO geometría y movimiento. Ningún color de marca ni tipografía: los
     * pone la composición sobre los atributos que emite el runtime:
     *
     *   [data-cod-pestanas-rol="etiqueta"]                          la etiqueta (un button)
     *   [data-cod-pestanas-rol="etiqueta"][data-cod-pestanas-estado="activa"|"inactiva"]
     *   [data-cod-pestanas-rol="panel"][data-cod-pestanas-visible="true"|"false"]
     *   [data-cod-pestanas-rol="lista"]                             la fila de etiquetas
     *
     * Los valores por omisión van dentro de :where(), o sea con especificidad
     * cero: cualquier regla de la composición los pisa sin necesidad de
     * !important. Lo único que NO se puede pisar, porque sostiene el
     * comportamiento, es que el panel inactivo no se ve (display:none) y que el
     * grupo sea un bloque con la lista arriba.
     *
     * Movimiento: el panel al aparecer usa --cod-motion-enter; el alto del
     * bloque y el color de las etiquetas usan --cod-motion-response. Todo bajo
     * prefers-reduced-motion: no-preference; con movimiento reducido el estado
     * cambia igual, sin animar. Si el sitio no declara esos tokens la
     * transición queda inválida y el cambio es instantáneo, que es lo
     * correcto: aquí no se inventan duraciones.
     *
     * Ajustes que un sitio puede sobrescribir (todos opcionales):
     *   --cod-pestanas-alineacion (justify-content de la fila; por omisión flex-start),
     *   --cod-pestanas-separacion (espacio entre etiquetas; por omisión 0),
     *   --cod-pestanas-espacio-lista (espacio bajo la fila de etiquetas; por omisión 0),
     *   --cod-pestanas-etiqueta-aire-y / --cod-pestanas-etiqueta-aire-x (relleno de cada etiqueta),
     *   --cod-pestanas-movil-base (ancho de cada etiqueta bajo 700px; por omisión 100%: apiladas).
     *
     * Regla del proyecto: nunca una abreviada con variable (background,
     * border, font, margin, padding). Donde entra una variable, forma larga.
     *
     * @param string|null $html HTML de la página: si se entrega y no menciona
     *                          «pestanas», no se emite nada. Null = siempre.
     */
    public static function pestanas_css(?string $html = null): string
    {
        if ($html !== null && strpos($html, 'pestanas') === false) {
            return '';
        }

        $r = '.cod-pestanas[data-cod-behavior="pestanas"]';
        $lista = '.cod-pestanas__lista';
        $etiqueta = '.cod-pestanas__etiqueta';
        $panel = '.cod-pestanas__panel';
        $animando = $r . '[data-cod-pestanas-animando]';
        $cambio = $r . '[data-cod-pestanas-cambio]';

        $css = <<<CSS
/* Estructura (esto no se pisa): el grupo es un bloque, la lista va arriba en una fila, y el panel inactivo no se ve. */
{$r}{display:block;box-sizing:border-box;}
{$r} > {$lista}{display:flex;}
{$r} > {$panel}[data-cod-pestanas-visible="false"]{display:none !important;}
/* La etiqueta es un button de verdad: sin la apariencia del sistema. */
{$r} > {$lista} > {$etiqueta}{appearance:none;}
/* El nodo que viaja adentro toma el color del botón y no aporta margen vertical (el aire de la etiqueta lo pone el relleno del botón). Va con UNA clase de especificidad y no más: le gana al color propio del tema (h3{color}) pero pierde, por orden, contra cualquier regla de la composición (una clase), que se emite después. */
.cod-pestanas__etiqueta > *{color:inherit;margin-top:0;margin-bottom:0;}

/* Valores por omisión, con especificidad cero: la composición los pisa con cualquier regla. */
:where({$r} > {$lista}){flex-wrap:wrap;align-items:stretch;justify-content:var(--cod-pestanas-alineacion,flex-start);column-gap:var(--cod-pestanas-separacion,0px);row-gap:var(--cod-pestanas-separacion,0px);margin-top:0;margin-right:0;margin-bottom:var(--cod-pestanas-espacio-lista,0px);margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;min-width:0;}
:where({$r} > {$lista} > {$etiqueta}){box-sizing:border-box;flex-grow:0;flex-shrink:1;flex-basis:auto;min-width:0;margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;
padding-top:var(--cod-pestanas-etiqueta-aire-y,.5rem);padding-right:var(--cod-pestanas-etiqueta-aire-x,1rem);padding-bottom:var(--cod-pestanas-etiqueta-aire-y,.5rem);padding-left:var(--cod-pestanas-etiqueta-aire-x,1rem);
border-top-width:0;border-right-width:0;border-bottom-width:0;border-left-width:0;background-color:transparent;color:inherit;
font-family:inherit;font-size:inherit;font-weight:inherit;font-style:inherit;line-height:inherit;letter-spacing:inherit;text-transform:inherit;text-align:inherit;cursor:pointer;}
:where({$r} > {$lista} > {$etiqueta}:focus-visible){outline-width:2px;outline-style:solid;outline-color:currentColor;outline-offset:2px;}

/* Con movimiento permitido: el panel nuevo aparece; el alto del bloque viaja; el color de la etiqueta responde. */
@media (prefers-reduced-motion:no-preference){
{$animando}{overflow:hidden;transition:height var(--cod-motion-response);}
{$cambio} > {$panel}[data-cod-pestanas-visible="true"]{animation:cod-pestanas-aparecer var(--cod-motion-enter);}
:where({$r} > {$lista} > {$etiqueta}){transition:color var(--cod-motion-response),background-color var(--cod-motion-response);}
@keyframes cod-pestanas-aparecer{from{opacity:0;}to{opacity:1;}}
}

/* Móvil: las etiquetas se apilan, una por fila y a todo el ancho. */
@media (max-width:700px){
:where({$r} > {$lista} > {$etiqueta}){flex-grow:1;flex-basis:var(--cod-pestanas-movil-base,100%);}
}
CSS;

        // Fuera comentarios y saltos de línea: se emite en línea en cada página.
        $css = (string) preg_replace('~/\*.*?\*/~s', '', $css);
        return (string) preg_replace('~\s*\n\s*~', '', $css);
    }

    /**
     * Geometría y movimiento del behavior «marquesina» (una fila de piezas que
     * se desplaza sola, en bucle continuo y sin controles). El runtime vive en
     * cod-canvas-public.js y cod-behaviors.js (montarMarquesina) y sólo arma la
     * estructura: mete las piezas en una pista y agrega las copias que cierran
     * el bucle. El movimiento es de acá.
     *
     * SIN LIBRERÍAS. El caso que la pide (los logos de certificación de la
     * landing de Econut) es hoy un Swiper dentro de un módulo de código de Divi,
     * con loop:true, autoplay.delay:0 y speed:8000: desplazamiento continuo y
     * lento. Acá no entra Swiper ni ninguna dependencia: la pista lleva el
     * juego de piezas duplicado y una animación de @keyframes la corre
     * translateX(-50%), que es la forma estándar de un bucle sin salto y sin
     * JavaScript por cuadro.
     *
     * Por qué el desplazamiento es -50% menos MEDIA separación y no -50% a
     * secas: la separación va entre piezas (column-gap) y la pista tiene
     * 2N piezas pero 2N-1 separaciones, así que su mitad exacta queda media
     * separación corta. Sin esa corrección el bucle da un salto del tamaño de
     * la separación (60px en Econut) al reiniciar.
     *
     * Piezas visibles: cada pieza mide (ancho del contenedor - (n-1) separaciones)
     * / n, con n = --cod-marquesina-visibles. El contenedor es la propia raíz
     * (container-type:inline-size), por eso se mide con cqw y no con vw. Cuánto
     * vale n por ancho NO lo decide este archivo: la composición escribe la
     * variable con una regla properties que admite scope.breakpoint, o sea con el
     * mismo sistema de breakpoints que todo lo demás. (En un navegador sin
     * unidades de contenedor el ancho de la pieza no se calcula y las piezas
     * toman su tamaño natural: la fila sigue andando.)
     *
     * Movimiento reducido: con prefers-reduced-motion: reduce la animación se
     * detiene y el juego queda quieto y a la vista: sin copias y en filas que
     * envuelven, de modo que ninguna pieza quede fuera de la vista.
     *
     * SÓLO geometría y movimiento. Ningún color de marca ni tipografía. Los
     * valores por omisión van dentro de :where() (especificidad cero); lo que no
     * se puede pisar, porque sostiene el comportamiento, es la pista en fila sin
     * envolver, el recorte de la raíz y la animación.
     *
     * Ajustes que un sitio puede escribir (todos opcionales, todos variables):
     *   --cod-marquesina-visibles (piezas a la vez; por omisión 4),
     *   --cod-marquesina-separacion (espacio entre piezas; por omisión 0px),
     *   --cod-marquesina-duracion-pieza (cuánto tarda en pasar una pieza; por
     *     omisión 8s, que es el speed:8000 medido),
     *   --cod-marquesina-alineacion (justify-content de cada pieza; por omisión center).
     * El runtime escribe además --cod-marquesina-piezas (cuántas piezas hay en
     * media pista): es lo que mantiene constante la velocidad por pieza.
     *
     * Regla del proyecto: nunca una abreviada con variable (background,
     * border, font, margin, padding). Donde entra una variable, forma larga;
     * por eso la animación va en sus partes y no en `animation:`.
     *
     * @param string|null $html HTML de la página: si se entrega y no menciona
     *                          «marquesina», no se emite nada. Null = siempre.
     */
    public static function marquesina_css(?string $html = null): string
    {
        if ($html !== null && strpos($html, 'marquesina') === false) {
            return '';
        }

        $r = '.cod-marquesina[data-cod-behavior="marquesina"]';
        $pista = '.cod-marquesina__pista';
        $pieza = '.cod-marquesina__pieza';
        $copia = '[data-cod-marquesina-copia]';

        $css = <<<CSS
/* Estructura (esto no se pisa): la raíz recorta y es el contenedor contra el que se mide la pieza; la pista es una fila sin envolver que se mueve; la pieza no se encoge. */
{$r}{display:block;box-sizing:border-box;overflow:hidden;container-type:inline-size;}
{$r} > {$pista}{display:flex;flex-wrap:nowrap;width:max-content;animation-name:cod-marquesina-desplazar;animation-duration:calc(var(--cod-marquesina-piezas,4) * var(--cod-marquesina-duracion-pieza,8s));animation-timing-function:linear;animation-iteration-count:infinite;}
{$r} > {$pista} > {$pieza}{flex-grow:0;flex-shrink:0;box-sizing:border-box;}
@keyframes cod-marquesina-desplazar{from{transform:translateX(0);}to{transform:translateX(calc(-50% - var(--cod-marquesina-separacion,0px) / 2));}}

/* Valores por omisión, con especificidad cero: la composición los pisa con cualquier regla. */
:where({$r}){width:100%;}
:where({$r} > {$pista}){align-items:center;column-gap:var(--cod-marquesina-separacion,0px);}
:where({$r} > {$pista} > {$pieza}){flex-basis:calc((100cqw - (var(--cod-marquesina-visibles,4) - 1) * var(--cod-marquesina-separacion,0px)) / var(--cod-marquesina-visibles,4));min-width:0;display:flex;align-items:center;justify-content:var(--cod-marquesina-alineacion,center);}

/* Movimiento reducido: la pista se detiene, las copias desaparecen y el juego queda quieto y a la vista, en filas que envuelven. */
@media (prefers-reduced-motion:reduce){
{$r} > {$pista}{animation:none;transform:none;width:auto;flex-wrap:wrap;justify-content:center;row-gap:var(--cod-marquesina-separacion,0px);}
{$r} > {$pista} > {$copia}{display:none;}
}
CSS;

        // Fuera comentarios y saltos de línea: se emite en línea en cada página.
        $css = (string) preg_replace('~/\*.*?\*/~s', '', $css);
        return (string) preg_replace('~\s*\n\s*~', '', $css);
    }

    /**
     * Geometría y movimiento del behavior «aviso» (una ventana emergente que
     * aparece sola, una vez por visitante, y se cierra con la X, con Escape o
     * pinchando el fondo). El runtime vive en cod-canvas-public.js y
     * cod-behaviors.js (montarAviso) y sólo arma la estructura, recuerda en el
     * navegador que ya se vio y maneja el foco. La disposición es de acá.
     *
     * LO QUE ESTA HOJA NO PUEDE HACER: ocultar el contenido por su cuenta. El
     * aviso lleva información de seguridad y no puede depender de que el
     * JavaScript funcione. Por eso TODA regla de esta hoja cuelga de la clase
     * .cod-aviso, que sólo pone el runtime al montarse: si el guion no corre, el
     * grupo queda como un bloque más, en el flujo normal de la página, con su
     * contenido legible. La capa fija y el «cerrado» sólo existen cuando hay un
     * runtime vivo que pueda abrir y cerrar.
     *
     * Estructura que arma el runtime dentro del grupo (que pasa a ser la capa):
     *   [data-cod-aviso-estado="abierto"|"cerrado"]            la raíz
     *     [data-cod-aviso-rol="velo"]                          el fondo (aria-hidden)
     *     [data-cod-aviso-rol="panel"]                         la ventana (role="dialog")
     *       [data-cod-aviso-rol="cerrar"]                      el botón de la X (primero en el panel)
     *       …los hijos originales del grupo
     *
     * Estructura (esto no se pisa): cerrado no se ve; abierto es una capa fija a
     * pantalla completa; el velo la cubre; el panel hace scroll por dentro si el
     * contenido es más alto que la pantalla (así la X, que es sticky, sigue a la
     * vista y el aviso nunca queda más grande que la ventana sin salida).
     *
     * Valores por omisión, con especificidad cero (:where): cualquier regla de la
     * composición los pisa. Sin colores ni tipografías de marca: el panel usa los
     * colores del sistema (Canvas y CanvasText), que se leen sobre cualquier
     * página, y el velo es CanvasText al 55% —sólo si el navegador sabe mezclar
     * colores; si no, no hay velo y el panel se sostiene solo—. NO se rellena con
     * var(--cod-color-*, respaldo): el set de diseño es cerrado y lo que el sitio
     * no declaró no se inventa (ver el chequeo de scripts/check.mjs). Los colores
     * de la marca los ponen las reglas de la composición sobre las partes panel y
     * velo.
     *
     * Movimiento: al abrirse, el velo y el panel aparecen con --cod-motion-enter,
     * y sólo bajo prefers-reduced-motion: no-preference. Con movimiento reducido
     * el aviso aparece sin animar. Si el sitio no declara el token, la animación
     * queda inválida y el aviso aparece de golpe: aquí no se inventan duraciones.
     *
     * No se bloquea el scroll de la página de atrás: el aviso es una ventana, no
     * una pared. (El panel contiene su propio scroll, y eso basta.)
     *
     * Ajustes que un sitio puede escribir (todos opcionales, variables):
     *   --cod-aviso-ancho-maximo  (ancho máximo del panel; por omisión 32rem),
     *   --cod-aviso-vuelve-dias   (cada cuántos días vuelve a aparecer; por omisión
     *     0: una sola vez y no vuelve. Lo lee el runtime, no esta hoja).
     *
     * Regla del proyecto: nunca una abreviada con variable (background, border,
     * font, margin, padding). Donde entra una variable, forma larga.
     *
     * @param string|null $html HTML de la página: si se entrega y no declara el
     *                          behavior «aviso», no se emite nada. Null = siempre.
     */
    public static function aviso_css(?string $html = null): string
    {
        if ($html !== null && preg_match('/data-cod-behavior\s*=\s*["\']?aviso\b/', $html) !== 1) {
            return '';
        }

        $r = '.cod-aviso[data-cod-behavior="aviso"]';
        $abierto = $r . '[data-cod-aviso-estado="abierto"]';
        $velo = '.cod-aviso__velo';
        $panel = '.cod-aviso__panel';
        $cerrar = '.cod-aviso__cerrar';

        $css = <<<CSS
/* Estructura (esto no se pisa): cerrado no se ve; abierto es una capa fija sobre todo; el velo la cubre; el panel hace scroll por dentro. */
{$r}[data-cod-aviso-estado="cerrado"]{display:none !important;}
{$abierto}{position:fixed;top:0;right:0;bottom:0;left:0;display:flex;box-sizing:border-box;}
{$r} > {$velo}{position:absolute;top:0;right:0;bottom:0;left:0;}
{$r} > {$panel}{position:relative;box-sizing:border-box;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;}
/* La X es sticky: si el contenido es más alto que la ventana, el botón para salir sigue a la vista. */
{$r} > {$panel} > {$cerrar}{position:sticky;top:0;z-index:1;appearance:none;}

/* Valores por omisión, con especificidad cero: la composición los pisa con cualquier regla. */
:where({$abierto}){z-index:100000;align-items:center;justify-content:center;padding-top:1rem;padding-right:1rem;padding-bottom:1rem;padding-left:1rem;}
:where({$r} > {$panel}){width:100%;max-width:var(--cod-aviso-ancho-maximo,32rem);max-height:calc(100vh - 2rem);max-height:calc(100dvh - 2rem);padding-top:1.5rem;padding-right:1.5rem;padding-bottom:1.5rem;padding-left:1.5rem;background-color:Canvas;color:CanvasText;outline-style:none;}
:where({$r} > {$panel} > {$cerrar}){display:flex;align-items:center;justify-content:center;width:2.75rem;height:2.75rem;margin-top:0;margin-right:0;margin-bottom:0;margin-left:auto;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;border-top-width:0;border-right-width:0;border-bottom-width:0;border-left-width:0;background-color:inherit;color:inherit;cursor:pointer;}
:where({$r} > {$panel} > {$cerrar}:focus-visible){outline-width:2px;outline-style:solid;outline-color:currentColor;outline-offset:2px;}
.cod-aviso__cerrar svg{width:1.25rem;height:1.25rem;pointer-events:none;}
@supports (background-color:color-mix(in srgb,red 50%,transparent)){
:where({$r} > {$velo}){background-color:color-mix(in srgb,CanvasText 55%,transparent);}
}

/* Con movimiento permitido: el velo y el panel aparecen al abrirse. */
@media (prefers-reduced-motion:no-preference){
{$abierto} > {$velo}{animation:cod-aviso-velo var(--cod-motion-enter);}
{$abierto} > {$panel}{animation:cod-aviso-aparecer var(--cod-motion-enter);}
@keyframes cod-aviso-velo{from{opacity:0;}to{opacity:1;}}
@keyframes cod-aviso-aparecer{from{opacity:0;transform:translateY(.75rem);}to{opacity:1;transform:none;}}
}
CSS;

        // Fuera comentarios y saltos de línea: se emite en línea en cada página.
        $css = (string) preg_replace('~/\*.*?\*/~s', '', $css);
        return (string) preg_replace('~\s*\n\s*~', '', $css);
    }

    /**
     * Geometría del behavior «mapa» (un mini mapa que, al pincharlo, despliega uno
     * grande con un marcador). El runtime vive en cod-canvas-public.js y
     * cod-behaviors.js (montarMapa): cambia el enlace del mini por un botón, fabrica
     * el recuadro del mapa grande y su X, y carga Mapbox GL SÓLO al abrirlo. La
     * disposición es de acá.
     *
     * Lo que NO está acá a propósito:
     *   - El mini mapa no necesita esta hoja para verse: es un <a><img> del sitio
     *     con ancho y alto en la propia imagen. Por eso toda regla de esta hoja
     *     cuelga de la clase .cod-mapa (que sólo pone el runtime) y, si el guion no
     *     corre, el grupo queda como un bloque más: el mini es un enlace a «cómo
     *     llegar» y la dirección escrita sigue a la vista. La ÚNICA regla suelta es
     *     que la imagen del mini hereda el radio de su contenedor, que no oculta ni
     *     mueve nada.
     *   - No hay colores de marca ni valores de respaldo de color: el recuadro del
     *     mapa usa los colores del sistema (Canvas y CanvasText) hasta que una regla
     *     de diseño sobre las partes grande y cerrar ponga los de la marca. Radio,
     *     sombra y borde tampoco se inventan: son del diseño del sitio.
     *   - No hay animación. El desplazamiento hacia el mapa lo hace el runtime y
     *     respeta prefers-reduced-motion.
     *
     * Estructura que arma el runtime dentro del grupo (raíz):
     *   [data-cod-mapa-estado="abierto"|"cerrado"]            la raíz
     *     [data-cod-mapa-rol="mini"]                          el botón con la imagen (se oculta al abrir)
     *     …los hijos originales del grupo (la dirección escrita: siempre a la vista)
     *     [data-cod-mapa-rol="grande"]                        el recuadro del mapa (oculto mientras está cerrado)
     *       .cod-mapa__lienzo                                 donde Mapbox dibuja
     *       .cod-mapa__estado                                 «Cargando…» o el aviso de que no llegó (con el enlace a «cómo llegar»)
     *       [data-cod-mapa-rol="cerrar"]                      el botón de la X
     *
     * Ajustes que un sitio puede escribir (opcionales, variables, por regla
     * properties sobre el grupo, con scope.breakpoint como todo lo demás):
     *   --cod-mapa-alto           (alto del mapa grande; por omisión 25rem = 400px),
     *   --cod-mapa-ancho-maximo   (ancho máximo; por omisión 80rem = 1280px).
     *
     * Si el grupo es una fila flex, el mapa grande ocupa todo el ancho (flex-basis
     * 100%); para que se despliegue DEBAJO de la fila hace falta flex-wrap:wrap en el
     * grupo, que es una decisión de diseño del sitio.
     *
     * Regla del proyecto: nunca una abreviada con variable (background, border,
     * font, margin, padding). Donde entra una variable, forma larga.
     *
     * @param string|null $html HTML de la página: si se entrega y no declara el
     *                          behavior «mapa», no se emite nada. Null = siempre.
     */
    public static function mapa_css(?string $html = null): string
    {
        if ($html !== null && preg_match('/data-cod-behavior\s*=\s*["\']?mapa\b/', $html) !== 1) {
            return '';
        }

        $r = '.cod-mapa[data-cod-behavior="mapa"]';
        $abierto = $r . '[data-cod-mapa-estado="abierto"]';
        $cerrado = $r . '[data-cod-mapa-estado="cerrado"]';
        $mini = '.cod-mapa__mini';
        $grande = '.cod-mapa__grande';
        $lienzo = '.cod-mapa__lienzo';
        $estado = '.cod-mapa__estado';
        $cerrar = '.cod-mapa__cerrar';

        $css = <<<CSS
/* Estructura (esto no se pisa): abierto esconde el mini y muestra el grande; cerrado, al revés. */
{$cerrado} > {$grande}{display:none !important;}
{$abierto} > {$mini}{display:none !important;}
{$r} > {$mini}{appearance:none;cursor:pointer;}
{$r} > {$mini} img{display:block;width:100%;height:100%;object-fit:contain;}
{$r} > {$grande}{position:relative;box-sizing:border-box;overflow:hidden;flex-grow:0;flex-shrink:0;flex-basis:100%;width:100%;}
{$r} > {$grande} > {$lienzo}{width:100%;height:100%;}
{$r} > {$grande} > {$estado}{position:absolute;top:0;right:0;bottom:0;left:0;z-index:1;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;}
{$r} > {$grande} > {$estado}[hidden]{display:none !important;}
{$r} > {$grande} > {$cerrar}{position:absolute;top:.5rem;right:.5rem;z-index:2;appearance:none;}
/* Sin guion el mini es un enlace con una imagen: la imagen respeta el radio que le ponga el diseño al mini. */
[data-cod-behavior="mapa"] > [data-cod-mapa-rol="mini"] > img{border-radius:inherit;}

/* Valores por omisión, con especificidad cero: la composición los pisa con cualquier regla. */
:where({$r} > {$mini}){display:block;flex-shrink:0;width:60px;height:60px;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;border-top-width:0;border-right-width:0;border-bottom-width:0;border-left-width:0;background-color:transparent;}
:where({$r} > {$mini}:focus-visible){outline-width:2px;outline-style:solid;outline-color:currentColor;outline-offset:2px;}
:where({$r} > {$grande}){height:var(--cod-mapa-alto,25rem);max-width:var(--cod-mapa-ancho-maximo,80rem);margin-top:1.25rem;margin-right:auto;margin-bottom:1.25rem;margin-left:auto;}
:where({$r} > {$grande}){background-color:Canvas;color:CanvasText;}
:where({$r} > {$grande} > {$estado}){gap:.75rem;padding-top:1rem;padding-right:1rem;padding-bottom:1rem;padding-left:1rem;background-color:inherit;color:inherit;}
:where({$r} > {$grande} > {$cerrar}){display:flex;align-items:center;justify-content:center;width:2.75rem;height:2.75rem;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;border-top-width:0;border-right-width:0;border-bottom-width:0;border-left-width:0;background-color:Canvas;color:CanvasText;cursor:pointer;}
:where({$r} > {$grande} > {$cerrar}:focus-visible){outline-width:2px;outline-style:solid;outline-color:currentColor;outline-offset:-4px;}
.cod-mapa__cerrar svg{width:1.25rem;height:1.25rem;pointer-events:none;}
CSS;

        // Fuera comentarios y saltos de línea: se emite en línea en cada página.
        $css = (string) preg_replace('~/\*.*?\*/~s', '', $css);
        return (string) preg_replace('~\s*\n\s*~', '', $css);
    }

    /**
     * Junta el CSS de varios documentos (cabecera, cuerpo, pie) de modo que el
     * CSS base del canvas salga UNA sola vez y ANTES de todas las reglas.
     *
     * Cada documento compilado trae su propio base al comienzo (ver
     * COD_Canvas_MCP_Recipe_Compiler::base_styles()). Si se concatenan tal cual,
     * el base del pie queda después de las reglas del cuerpo y, con la misma
     * especificidad, les gana (`.cod-group{gap:16px}` sobre `.cod-rule--x{gap:165px}`).
     * Aquí se le quita a cada documento su base inicial —sólo las líneas del
     * comienzo que son idénticas a las del base vigente— y se antepone una copia.
     * Un documento que no empieza por el base (por ejemplo, reexportado por el
     * editor) se deja como está.
     *
     * @param list<string> $documentos
     */
    public static function unir_css_de_documentos(array $documentos): string
    {
        $base = COD_Canvas_MCP_Recipe_Compiler::base_styles();
        $lineas_base = array_flip(array_filter(explode("\n", $base), static fn(string $l): bool => $l !== ''));
        $hubo_base = false;
        $resto = '';
        foreach ($documentos as $css) {
            $lineas = explode("\n", $css);
            $quitadas = 0;
            foreach ($lineas as $i => $linea) {
                if ($linea === '' && $quitadas === 0) {
                    // Línea vacía antes del base (el base empieza con un salto).
                    continue;
                }
                if (isset($lineas_base[$linea])) {
                    ++$quitadas;
                    $lineas[$i] = null;
                    continue;
                }
                break;
            }
            if ($quitadas > 0) {
                $hubo_base = true;
                $lineas = array_filter($lineas, static fn($l): bool => $l !== null);
            }
            $resto .= implode("\n", $lineas) . "\n";
        }
        return ($hubo_base ? $base : '') . $resto;
    }

    public static function rotation_css(): string
    {
        return '.cod-rot-180{transform:rotate(180deg);}'
            . '.cod-marco-girado{position:relative;overflow:hidden;container-type:size;}'
            . '.cod-marco-girado>.cod-rot-90,.cod-marco-girado>.cod-rot-270'
            . '{position:absolute;top:50%;left:50%;width:100cqh;height:100cqw;max-width:none;object-fit:cover;}'
            . '.cod-marco-girado>.cod-rot-90{transform:translate(-50%,-50%) rotate(90deg);}'
            . '.cod-marco-girado>.cod-rot-270{transform:translate(-50%,-50%) rotate(270deg);}'
            . '@supports not (width:100cqh){.cod-marco-girado>.cod-rot-90,.cod-marco-girado>.cod-rot-270'
            . '{position:static;width:100%;height:auto;transform:rotate(90deg);}}';
    }

    /**
     * Cortina de precarga: cubre la página con el color de fondo del sitio
     * hasta que la portada está lista de verdad (tipografías, imágenes, el
     * símbolo del logotipo y el primer cuadro del video con máscara).
     *
     * Se escribe directo en la cabecera, no como archivo aparte: esperar una
     * descarga dejaría ver justo lo que se quiere ocultar. El retiro lo hace
     * assets/js/cod-preload.js, que además tiene un tope de tiempo para que
     * la página nunca quede tapada.
     */
    public static function precarga_en_cabecera(): void
    {
        if (!is_singular()) {
            return;
        }
        $post = get_post();
        if (!$post || !self::tiene_shortcode((string) $post->post_content)) {
            return;
        }

        // Si el set no declara una superficie, la cortina va sin fondo. No se
        // pone un color de relleno: una cortina transparente se nota y se
        // arregla; una del color equivocado se queda para siempre.
        $fondo = COD_Theme_Definitions::preload_background();
        $pinta = $fondo === '' ? '' : ' background: ' . esc_attr($fondo) . ';';
        $estilo = '.cod-precarga, .cod-precarga body { overflow: hidden !important; }'
            . '.cod-precarga body::after, .cod-precarga-lista body::after {'
            . ' content: ""; position: fixed; inset: 0; z-index: 2147483000;'
            . ' pointer-events: none;' . $pinta . ' }'
            . '.cod-precarga-lista body::after { opacity: 0; transition: opacity .45s ease; }'
            . '@media (prefers-reduced-motion: reduce) {'
            . ' .cod-precarga-lista body::after { transition: none; } }';

        // El tope de tiempo va acá además de en el script: si el archivo del
        // retiro no llegara a cargar, la página se destapa igual.
        $marca = "document.documentElement.classList.add('cod-precarga');"
            . "setTimeout(function(){"
            . "document.documentElement.classList.remove('cod-precarga');"
            . "}, 6000);";

        echo '<style id="cod-precarga-estilo">' . $estilo . '</style>';
        echo '<script id="cod-precarga-marca">' . $marca . '</script>';
    }

    public static function site_font_css(): string
    {
        if (self::$site_font_css_cache !== null) {
            return self::$site_font_css_cache;
        }

        $carpeta = COD_Canvas_Asset_Resolver::carpeta_gestionada('fonts');
        $file = trailingslashit($carpeta['dir']) . 'fonts.css';

        if (!is_file($file)) {
            self::$site_font_css_cache = '';
            return '';
        }

        $css = (string) file_get_contents($file);
        $base_url = $carpeta['url'];
        self::$site_font_css_cache = str_replace('{FONTS_BASE_URL}', $base_url, $css);

        return self::$site_font_css_cache;
    }

    /**
     * @param int $page_id Optional explicit WordPress page target. When
     *                     greater than 0 it anchors the document to that
     *                     existing page; otherwise the legacy meta lookup
     *                     keeps mapping one page per document_id.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function publish(string $document_id, string $title, int $page_id = 0)
    {
        $document = $this->repository->load($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        if (trim((string) $document['html']) === '') {
            return new WP_Error('cod_canvas_empty', 'Guarda contenido en el Canvas antes de publicarlo.');
        }

        if ($page_id > 0) {
            $target = get_post($page_id);
            if (!$target instanceof WP_Post || $target->post_type !== 'page') {
                return new WP_Error('cod_canvas_page_invalid', 'La página objetivo no existe o no es una página.');
            }
        } else {
            $page_id = (int) ($this->find_page_id($document_id) ?? 0);
        }

        $post = [
            'post_type' => 'page',
            'post_status' => 'publish',
            'post_content' => sprintf('[contope_canvas document_id="%s"]', esc_attr($document_id)),
            'meta_input' => [self::META_DOCUMENT_ID => $document_id],
        ];
        if ($page_id > 0) {
            // Página ya existente: solo tocamos el título si mandaron uno
            // real. Antes esto pisaba el título ya puesto por el título
            // genérico cada vez que se publicaba sin pasar uno (ej. desde un
            // flujo que no reenvía el campo) — un usuario podía renombrar su
            // página y perder el nombre en la siguiente publicación.
            $post['ID'] = $page_id;
            if ($title !== '') {
                $post['post_title'] = $title;
            }
        } else {
            $post['post_title'] = $title !== '' ? $title : 'Página ContOpe Canvas';
        }
        $saved_id = wp_insert_post($post, true);
        if (is_wp_error($saved_id)) {
            return $saved_id;
        }

        return $this->describe_page((int) $saved_id);
    }

    /**
     * Publica únicamente una página Canvas ya existente. Es la ruta de
     * dominio para MCP: no llama load(), no puede crear un documento por un ID
     * remoto erróneo y conserva un snapshot previo antes de cambiar la
     * visibilidad de la página.
     *
     * @return array<string, mixed>|WP_Error
     */
    public function publish_existing_if_revision(
        int $page_id,
        string $document_id,
        int $expected_revision,
        string $snapshot_session,
        string $snapshot_label
    ) {
        $page = $this->describe_canvas_page($page_id);
        if ($page === null) {
            return new WP_Error('cod_mcp_canvas_page_not_found', 'No existe una página Canvas con ese pageId.');
        }
        if ((string) $page['documentId'] !== $document_id) {
            return new WP_Error('cod_mcp_canvas_target_mismatch', 'pageId y documentId no pertenecen a la misma página Canvas.');
        }

        $document = $this->repository->load_existing($document_id);
        if (is_wp_error($document)) {
            return $document;
        }
        $actual_revision = (int) $document['revision'];
        if ($actual_revision !== $expected_revision) {
            return $this->revision_conflict($expected_revision, $actual_revision);
        }
        if (trim((string) $document['html']) === '') {
            return new WP_Error('cod_canvas_empty', 'Aplica una receta Canvas antes de publicar la página.');
        }

        // Publicar una página que ya está pública no altera nada ni genera un
        // snapshot redundante. También hace que la llamada sea idempotente.
        if ($page['status'] === 'publish') {
            return [
                'page' => $page,
                'snapshot' => null,
                'alreadyPublished' => true,
            ];
        }

        $snapshot = $this->repository->create_snapshot_if_revision(
            $document_id,
            $expected_revision,
            $snapshot_session,
            $snapshot_label
        );
        if (is_wp_error($snapshot)) {
            return $snapshot;
        }

        // La creación de snapshot libera su bloqueo; antes de exponer la
        // página revalidamos que nadie haya editado el documento entre ambos
        // pasos. En tal caso no publicamos una versión distinta de la que el
        // cliente revisó y el snapshot adicional deja evidencia recuperable.
        $current = $this->repository->describe_existing($document_id);
        if ($current === null) {
            return new WP_Error('cod_canvas_document_not_found', 'El documento Canvas dejó de estar disponible.');
        }
        if ((int) $current['revision'] !== $expected_revision) {
            return $this->revision_conflict($expected_revision, (int) $current['revision']);
        }

        $published = wp_update_post([
            'ID' => $page_id,
            'post_type' => 'page',
            'post_status' => 'publish',
            'post_content' => sprintf('[contope_canvas document_id="%s"]', esc_attr($document_id)),
        ], true);
        if (is_wp_error($published)) {
            return $published;
        }

        $published_page = $this->describe_canvas_page($page_id);
        if ($published_page === null) {
            return new WP_Error('cod_mcp_canvas_page_unavailable', 'La página Canvas no pudo leerse después de publicarla.');
        }

        return [
            'page' => $published_page,
            'snapshot' => $snapshot,
            'alreadyPublished' => false,
        ];
    }

    /** @return WP_Error */
    private function revision_conflict(int $expected_revision, int $actual_revision): WP_Error
    {
        $error = new WP_Error(
            'cod_canvas_revision_conflict',
            'La revisión de la página cambió; vuelve a consultar o previsualizar antes de aplicar la operación.'
        );
        $error->add_data([
            'expectedRevision' => $expected_revision,
            'actualRevision' => $actual_revision,
        ]);

        return $error;
    }

    /**
     * Duplica una página Canvas completa: crea una página WordPress NUEVA y un
     * documento de CUERPO NUEVO (projectData/html/css copiados del fuente).
     *
     * A diferencia de un duplicador genérico (que solo copia la cáscara de la
     * página y por eso termina "duplicando solo el header"), aquí el cuerpo sí
     * se recrea como un documento nuevo con id determinístico derivado del id
     * de la página nueva. NO se copian las metas de región
     * (regionKind/Scope/Targets/Excludes) ni los snapshots: el cuerpo de una
     * página NO es una región de tema, y el historial de snapshots pertenece a
     * la sesión de edición del documento fuente. El header/footer tampoco se
     * copian porque son regiones de tema que se resuelven en vivo por reglas
     * (COD_Template_Region_Resolver) contra la página que se está viendo, así
     * que la página nueva los recibe automáticamente por su propio ID.
     *
     * @param int $page_id ID de la página Canvas a duplicar.
     * @return array<string, mixed>|WP_Error ['pageId' => int, 'documentId' => string]
     */
    public function duplicate_page(int $page_id)
    {
        $source = get_post($page_id);
        if (!$source instanceof WP_Post || $source->post_type !== 'page') {
            return new WP_Error('cod_canvas_duplicate_not_page', 'La página a duplicar no existe o no es una página.');
        }

        $document_id = (string) get_post_meta($page_id, self::META_DOCUMENT_ID, true);
        if ($document_id === '') {
            return new WP_Error('cod_canvas_duplicate_not_canvas', 'Esta página no es una página Canvas.');
        }

        $document = $this->repository->load($document_id);
        if (is_wp_error($document)) {
            return new WP_Error('cod_canvas_duplicate_document_missing', 'El documento Canvas de la página fuente no se puede cargar.');
        }

        $title = trim((string) $source->post_title);
        $new_title = sprintf('%s — Copia', $title !== '' ? $title : 'Página ContOpe Canvas');

        // Creamos primero la página (sin content ni meta) para obtener su ID y
        // poder derivar el document_id estable del cuerpo nuevo. El título
        // colisionado lo resuelve WordPress solo añadiendo el sufijo al slug;
        // el content se construye igual que publish(), nunca copiando el content
        // fuente. El post_status se hereda del fuente (publish -> publish,
        // draft -> draft).
        $saved_id = wp_insert_post([
            'post_type' => 'page',
            'post_status' => $source->post_status,
            'post_title' => $new_title,
            'post_content' => '',
        ], true);
        if (is_wp_error($saved_id)) {
            return $saved_id;
        }
        $new_page_id = (int) $saved_id;

        $new_document_id = COD_Canvas_Editor_Admin::document_id_for_page($new_page_id);

        // projectData/html/css ya salieron sanitizados del repositorio, así que
        // se copian tal cual (igual que publish() los consume desde el repo).
        $saved = $this->repository->save(
            $new_document_id,
            (string) $document['projectData'],
            (string) $document['html'],
            (string) $document['css']
        );
        if (is_wp_error($saved)) {
            // La página quedó creada pero sin documento: se elimina para no
            // dejar una cáscara huérfana y se devuelve el error.
            wp_delete_post($new_page_id, true);
            return $saved;
        }

        $updated = wp_update_post([
            'ID' => $new_page_id,
            'post_content' => sprintf('[contope_canvas document_id="%s"]', esc_attr($new_document_id)),
        ], true);
        if (is_wp_error($updated)) {
            // Sin shortcode la página es una cáscara vacía: se elimina para no
            // dejar residuo visible, igual que en el fallo de save().
            wp_delete_post($new_page_id, true);
            return $updated;
        }
        update_post_meta($new_page_id, self::META_DOCUMENT_ID, $new_document_id);

        return [
            'pageId' => $new_page_id,
            'documentId' => $new_document_id,
        ];
    }

    /**
     * Crea una página WordPress nueva, vacía, con su documento Canvas propio
     * ya vinculado — para el botón "+ Nueva página" del editor. Mismo patrón
     * que duplicate_page(), sin copiar contenido de ninguna fuente: el
     * documento nuevo lo crea el repositorio en blanco (load() lo inicializa
     * si el post del documento todavía no existe).
     *
     * @return array<string, mixed>|WP_Error
     */
    public function create_page(string $title = '')
    {
        $post_title = trim($title) !== '' ? trim($title) : 'Página sin título';

        $saved_id = wp_insert_post([
            'post_type' => 'page',
            'post_status' => 'draft',
            'post_title' => $post_title,
            'post_content' => '',
        ], true);
        if (is_wp_error($saved_id)) {
            return $saved_id;
        }
        $new_page_id = (int) $saved_id;

        $new_document_id = COD_Canvas_Editor_Admin::document_id_for_page($new_page_id);

        $document = $this->repository->load($new_document_id);
        if (is_wp_error($document)) {
            wp_delete_post($new_page_id, true);
            return $document;
        }

        $updated = wp_update_post([
            'ID' => $new_page_id,
            'post_content' => sprintf('[contope_canvas document_id="%s"]', esc_attr($new_document_id)),
        ], true);
        if (is_wp_error($updated)) {
            wp_delete_post($new_page_id, true);
            return $updated;
        }
        update_post_meta($new_page_id, self::META_DOCUMENT_ID, $new_document_id);

        return [
            'pageId' => $new_page_id,
            'documentId' => $new_document_id,
            'title' => $post_title,
        ];
    }

    /** @return array<string, mixed>|null */
    public function current(string $document_id): ?array
    {
        $page_id = $this->find_page_id($document_id);
        return $page_id === null ? null : $this->describe_page($page_id);
    }

    /**
     * Lista páginas WordPress que ya están vinculadas a un documento Canvas.
     * No crea páginas ni documentos y omite la URL de administración, que es
     * un detalle de la interfaz local y no parte del contrato semántico.
     *
     * @return array<int, array<string, mixed>>
     */
    public function list_canvas_pages(): array
    {
        $page_ids = get_posts([
            'post_type' => 'page',
            'post_status' => 'any',
            'numberposts' => -1,
            'orderby' => 'ID',
            'order' => 'ASC',
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_key' => self::META_DOCUMENT_ID,
            'meta_compare' => 'EXISTS',
        ]);

        $pages = [];
        foreach ($page_ids as $page_id) {
            $page = $this->describe_canvas_page((int) $page_id);
            if ($page !== null) {
                $pages[] = $page;
            }
        }

        return $pages;
    }

    /**
     * Devuelve la identidad semántica de una página Canvas existente, o null
     * si el ID no es una página Canvas. No carga ni inicializa el documento.
     *
     * @return array<string, mixed>|null
     */
    public function describe_canvas_page(int $page_id): ?array
    {
        $post = get_post($page_id);
        if (!$post instanceof WP_Post || $post->post_type !== 'page') {
            return null;
        }

        $document_id = (string) get_post_meta($page_id, self::META_DOCUMENT_ID, true);
        if ($document_id === '') {
            return null;
        }

        $url = get_permalink($page_id);

        return [
            'pageId' => $page_id,
            'documentId' => $document_id,
            'title' => $post->post_title,
            'status' => $post->post_status,
            'url' => is_string($url) ? $url : '',
        ];
    }

    /** @param array<string, mixed> $attributes */
    /**
     * Emite el CSS del sitio en la CABECERA, antes de que haya nada pintado.
     *
     * Sin esto los estilos salían desde el render del contenido, o sea casi al
     * final del documento, y el navegador alcanzaba a pintar la página cruda:
     * el logotipo negro a pantalla completa y el menú como lista suelta.
     *
     * Resuelve lo mismo que el shortcode (documento propio más las regiones de
     * encabezado, cuerpo y pie) pero solo para quedarse con los estilos. Si algo
     * no se puede resolver acá, no pasa nada: el shortcode sigue emitiéndolos
     * como antes.
     */
    /**
     * CSS compartido por todas las páginas: clases reutilizables como
     * .cod-btn, no tokens de tema (eso ya lo cubre COD_Theme_Definitions)
     * ni contenido propio de una página. Se cachea por request porque se
     * pide desde dos puntos (la cabecera y, como respaldo, el shortcode).
     */
    private function shared_components_css(): string
    {
        if (self::$shared_css_cache !== null) {
            return self::$shared_css_cache;
        }
        $documento = $this->repository->load(COD_Canvas_Document_Repository::SHARED_STYLES_DOCUMENT_ID);
        self::$shared_css_cache = is_wp_error($documento) ? '' : (string) $documento['css'];
        return self::$shared_css_cache;
    }

    public function estilos_en_cabecera(): void
    {
        if (self::$css_ya_emitido || !is_singular()) {
            return;
        }
        $post = get_post();
        if (!$post) {
            return;
        }
        $contenido = (string) $post->post_content;
        if (!self::tiene_shortcode($contenido)) {
            return;
        }
        if (preg_match('/document_id=[\x22\x27]?([a-z0-9_-]+)/i', $contenido, $coincidencias) !== 1) {
            return;
        }
        $document = $this->repository->load(sanitize_key($coincidencias[1]));
        if (is_wp_error($document)) {
            return;
        }

        $post_id = (int) $post->ID;
        $body_css = (string) $document['css'];
        $body_html = (string) $document['html'];
        $header_css = '';
        $footer_css = '';
        $header_html = '';
        $footer_html = '';
        if ($this->region_resolver !== null && $post_id > 0) {
            $header = $this->region_resolver->resolve(
                COD_Canvas_Document_Repository::REGION_KIND_HEADER,
                $post_id
            );
            if ($header !== null) {
                $header_css = (string) $header['css'];
                $header_html = (string) $header['html'];
            }
            $footer = $this->region_resolver->resolve(
                COD_Canvas_Document_Repository::REGION_KIND_FOOTER,
                $post_id
            );
            if ($footer !== null) {
                $footer_css = (string) $footer['css'];
                $footer_html = (string) $footer['html'];
            }
            $body = $this->region_resolver->resolve(
                COD_Canvas_Document_Repository::REGION_KIND_BODY,
                $post_id
            );
            if ($body !== null && trim((string) $body['html']) !== '') {
                $body_css = (string) $body['css'];
                $body_html = (string) $body['html'];
            }
        }

        wp_register_style('cod-canvas-public', false, [], COD_PUBLISHER_VERSION);
        wp_enqueue_style('cod-canvas-public');
        wp_add_inline_style(
            'cod-canvas-public',
            // El núcleo va primero: lleva a los tokens del plugin lo que el tema
            // ya declara en su theme.json. Antes esos tokens no llegaban a
            // ninguna parte y el compilador tapaba el hueco con los colores del
            // panel de WordPress. Ver COD_Design_Core.
            COD_Design_Core::css() . COD_Theme_Definitions::css() . self::site_font_css() . $this->shared_components_css()
                . self::dynamic_group_css($header_html . $body_html . $footer_html)
                . self::cuadrantes_css($header_html . $body_html . $footer_html)
                . self::pestanas_css($header_html . $body_html . $footer_html)
                . self::marquesina_css($header_html . $body_html . $footer_html)
                . self::aviso_css($header_html . $body_html . $footer_html)
                . self::mapa_css($header_html . $body_html . $footer_html)
                . self::rotation_css() . self::carousel_rows_css()
                . self::unir_css_de_documentos([$header_css, $body_css, $footer_css])
        );
        self::$css_ya_emitido = true;
    }

    public function render_shortcode(array $attributes): string
    {
        $document_id = sanitize_key((string) ($attributes['document_id'] ?? ''));
        if ($document_id === '') {
            return '';
        }
        $document = $this->repository->load($document_id);
        if (is_wp_error($document)) {
            return '';
        }

        // Header/footer are resolved live, at render time, against the real
        // page being viewed — not baked in at publish time. This is what
        // makes a global (or category-local) region propagate automatically
        // to every page that uses it without republishing each one.
        $post_id = (int) get_the_ID();
        $header_html = '';
        $footer_html = '';
        $header_css = '';
        $footer_css = '';
        // El cuerpo por defecto es el documento propio de la página. Una región
        // `body` que resuelve Y tiene HTML no vacío lo reemplaza (estilo Divi:
        // cuerpo dinámico ACF/tokens); si resuelve vacía, se conserva el
        // documento propio para no publicar nunca una página en blanco.
        $body_html = (string) $document['html'];
        $body_css = (string) $document['css'];
        $body_document_id = $document_id;
        if ($this->region_resolver !== null) {
            if ($post_id > 0) {
                $header = $this->region_resolver->resolve(
                    COD_Canvas_Document_Repository::REGION_KIND_HEADER,
                    $post_id
                );
                if ($header !== null) {
                    $header_html = (string) $header['html'];
                    $header_css = (string) $header['css'];
                }
                $footer = $this->region_resolver->resolve(
                    COD_Canvas_Document_Repository::REGION_KIND_FOOTER,
                    $post_id
                );
                if ($footer !== null) {
                    $footer_html = (string) $footer['html'];
                    $footer_css = (string) $footer['css'];
                }
                $body = $this->region_resolver->resolve(
                    COD_Canvas_Document_Repository::REGION_KIND_BODY,
                    $post_id
                );
                if ($body !== null && trim((string) $body['html']) !== '') {
                    $body_html = (string) $body['html'];
                    $body_css = (string) $body['css'];
                    $body_document_id = (string) $body['documentId'];
                }
            }
        }

        $site_font_css = self::site_font_css();
        $theme_css = COD_Design_Core::css() . COD_Theme_Definitions::css();
        wp_register_style('cod-canvas-public', false, [], COD_PUBLISHER_VERSION);
        wp_enqueue_style('cod-canvas-public');
        if (!self::$css_ya_emitido) {
            wp_add_inline_style(
                'cod-canvas-public',
                $theme_css . $site_font_css . $this->shared_components_css()
                    . self::dynamic_group_css($header_html . $body_html . $footer_html)
                . self::cuadrantes_css($header_html . $body_html . $footer_html)
                . self::pestanas_css($header_html . $body_html . $footer_html)
                . self::marquesina_css($header_html . $body_html . $footer_html)
                . self::aviso_css($header_html . $body_html . $footer_html)
                . self::mapa_css($header_html . $body_html . $footer_html)
                    . self::rotation_css() . self::carousel_rows_css()
                    . self::unir_css_de_documentos([$header_css, $body_css, $footer_css])
            );
            self::$css_ya_emitido = true;
        }
        wp_enqueue_script(
            'cod-interactions',
            plugins_url('assets/js/cod-interactions.js', COD_PUBLISHER_FILE),
            [],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-canvas-public',
            plugins_url('assets/js/cod-canvas-public.js', COD_PUBLISHER_FILE),
            ['cod-interactions'],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-luma-matte-video',
            plugins_url('assets/js/cod-luma-matte-video.js', COD_PUBLISHER_FILE),
            [],
            COD_PUBLISHER_VERSION,
            true
        );
        wp_enqueue_script(
            'cod-preload',
            plugins_url('assets/js/cod-preload.js', COD_PUBLISHER_FILE),
            [],
            COD_PUBLISHER_VERSION,
            true
        );

        $whatsapp_number = preg_replace('/[^0-9]/', '', (string) get_option('cod_whatsapp_number', ''));

        $markup = '';
        if ($header_html !== '') {
            $markup .= '<header class="cod-canvas-region cod-canvas-region-header">' . $header_html . '</header>';
        }
        $markup .= '<div class="cod-canvas-published" data-cod-document-id="' . esc_attr($body_document_id) . '"'
            . ' data-cod-whatsapp-number="' . esc_attr((string) $whatsapp_number) . '">' .
            $body_html . '</div>';
        if ($footer_html !== '') {
            $markup .= '<footer class="cod-canvas-region cod-canvas-region-footer">' . $footer_html . '</footer>';
        }

        if ($this->token_resolver !== null) {
            $markup = $this->token_resolver->resolve($markup, $post_id);
        }

        // Las cuentas de redes sociales se resuelven al mostrar, no al publicar: así
        // cambiar una dirección en Configuración → Redes sociales llega a todas las
        // páginas sin recomponerlas (y una red sin configurar no deja un enlace muerto).
        $markup = COD_Redes_Sociales::resolver_en_html($markup);

        // Lo mismo con la clave de Mapbox del mapa grande: la página guardada no la
        // lleva; aquí se pone la de ahora (o, si no hay, el mapa queda como enlace).
        $markup = COD_Mapa::resolver_en_html($markup);

        // Los shortcodes se ejecutan al final, después de resolver los tokens
        // dinámicos: así un marcador puede llevar un valor ACF entre sus
        // atributos. Solo actúa sobre nodos marcados y de una lista permitida
        // (ver COD_Canvas_Shortcode_Renderer); nunca sobre el texto del diseño.
        $markup = (new COD_Canvas_Shortcode_Renderer())->render($markup);

        return $markup;
    }

    public function standalone_template(string $template): string
    {
        if (!is_singular('page')) {
            return $template;
        }
        $page_id = (int) get_queried_object_id();
        if ((string) get_post_meta($page_id, self::META_DOCUMENT_ID, true) === '') {
            return $template;
        }

        return COD_PUBLISHER_DIR . 'templates/canvas-document.php';
    }

    private function find_page_id(string $document_id): ?int
    {
        $ids = get_posts([
            'post_type' => 'page',
            'post_status' => 'any',
            'numberposts' => 1,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_key' => self::META_DOCUMENT_ID,
            'meta_value' => $document_id,
        ]);
        return $ids === [] ? null : (int) $ids[0];
    }

    /** @return array<string, mixed> */
    private function describe_page(int $page_id): array
    {
        $post = get_post($page_id);
        return [
            'pageId' => $page_id,
            'title' => $post instanceof WP_Post ? $post->post_title : '',
            'status' => $post instanceof WP_Post ? $post->post_status : '',
            'url' => get_permalink($page_id),
            'editUrl' => get_edit_post_link($page_id, 'raw'),
        ];
    }
}
