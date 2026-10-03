<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Subir SVG a Medios, limpiándolos antes de guardarlos.
 *
 * POR QUÉ. WordPress no deja subir SVG. La razón técnica es real —un SVG es un
 * documento XML y puede traer JavaScript dentro, así que subir uno es, en el
 * peor caso, dejar que alguien guarde un guion en el sitio— pero la
 * consecuencia práctica es que un sitio no puede usar vectores, que es la
 * forma correcta de un logotipo, un icono o un pin de mapa. Un PNG de un pin
 * se ve borroso en cuanto alguien hace zoom.
 *
 * Cristóbal, el 3 de octubre, sobre lo que hace en sus sitios con Divi:
 *
 *   «En todos los sitios que yo he hecho sobre Divi me encuentro con el mismo
 *    problema con los SVG, y lo que hago es insertar un plugin que me permita
 *    usar SVG en WordPress. Ese problema de seguridad realmente es una especie
 *    de leguleyada de WordPress. No vamos a renunciar a tener una mejor calidad
 *    visual del contenido por el hecho de que WordPress diga que es muy
 *    peligroso.»
 *
 * Tiene razón en el fondo. Lo que esta clase NO hace es lo que hacen varios de
 * esos plugins: abrir el tipo de archivo y guardar lo que llegue tal cual. Eso
 * sí deja el agujero entero. Acá el SVG se acepta y **se limpia antes de
 * escribirse en el disco**: lo que queda guardado ya no puede ejecutar nada.
 *
 * QUÉ SE QUITA, y por qué cada cosa:
 *
 *   - `<script>`: lo evidente.
 *   - `<foreignObject>`: mete HTML dentro del SVG, y con él cualquier cosa.
 *   - `<use>`, `<image>` y `<a>` que apunten FUERA del sitio: un SVG puede
 *     traerse un fragmento de otro servidor y ejecutarlo como propio.
 *   - atributos `on*` (`onload`, `onclick`, `onmouseover`…): son guiones
 *     escritos en un atributo.
 *   - cualquier URL `javascript:` o `data:` con contenido ejecutable.
 *   - `<!ENTITY>` y referencias a entidades externas: por ahí entra el ataque
 *     clásico de XML que lee archivos del servidor.
 *   - instrucciones de proceso con hojas de estilo externas.
 *
 * QUIÉN PUEDE SUBIRLOS. Sólo quien ya puede publicar HTML sin filtrar
 * (`unfiltered_html`): administradores y editores. Para todos los demás, el
 * SVG sigue rechazado. Esto importa en un sitio con autores o colaboradores:
 * la limpieza es buena, pero no es una razón para ampliarle los permisos a
 * quien no los tenía.
 *
 * SE PUEDE APAGAR. El filtro `cod_permitir_svg` devuelve `false` y todo vuelve
 * a como estaba.
 */
final class COD_SVG
{
    public const MIME = 'image/svg+xml';

    public function register(): void
    {
        add_filter('upload_mimes', [$this, 'permitir_tipo'], 10, 2);
        // WordPress comprueba aparte que la extensión y el contenido del
        // archivo concuerden. Para un SVG no sabe hacerlo y lo rechaza aunque
        // el tipo esté permitido, así que hay que contestarle también acá.
        add_filter('wp_check_filetype_and_ext', [$this, 'reconocer_extension'], 10, 4);
        // La limpieza va ANTES de que el archivo llegue a su sitio definitivo.
        add_filter('wp_handle_upload_prefilter', [$this, 'limpiar_al_subir']);
        // Sin esto, la lista de Medios muestra el SVG como un icono genérico
        // en vez del dibujo.
        add_filter('wp_prepare_attachment_for_js', [$this, 'miniatura_en_medios'], 10, 2);
    }

    public static function permitido(): bool
    {
        /** Filtra si este sitio acepta SVG. Devolver false lo desactiva entero. */
        return (bool) apply_filters('cod_permitir_svg', true);
    }

    /**
     * ¿Puede ESTE usuario subir un SVG?
     *
     * `unfiltered_html` es la capacidad que WordPress ya usa para decir «de
     * esta persona nos fiamos para meter marcado en el sitio». Es exactamente
     * la pregunta que corresponde acá, y así no se inventa un permiso nuevo
     * que después nadie sabe dónde se configura.
     */
    public static function puede_subir(): bool
    {
        return self::permitido() && current_user_can('unfiltered_html');
    }

    /**
     * @param array<string, string> $tipos
     * @return array<string, string>
     */
    public function permitir_tipo(array $tipos, $usuario = null): array
    {
        if (self::puede_subir()) {
            $tipos['svg'] = self::MIME;
            $tipos['svgz'] = self::MIME;
        }

        return $tipos;
    }

    /**
     * @param array<string, mixed> $datos
     * @return array<string, mixed>
     */
    public function reconocer_extension(array $datos, $archivo, $nombre, $mimes): array
    {
        if (!self::puede_subir()) {
            return $datos;
        }
        $extension = strtolower((string) pathinfo((string) $nombre, PATHINFO_EXTENSION));
        if ($extension === 'svg' || $extension === 'svgz') {
            $datos['ext'] = $extension;
            $datos['type'] = self::MIME;
            $datos['proper_filename'] = $nombre;
        }

        return $datos;
    }

    /**
     * Limpia el archivo recién subido, en el sitio.
     *
     * Si el SVG no se puede leer como XML, se rechaza. Un SVG roto no es un
     * caso que convenga «arreglar como se pueda»: lo que no se puede analizar
     * tampoco se puede limpiar, y guardar lo que no se entendió es justo lo
     * que esta clase viene a evitar.
     *
     * @param array<string, mixed> $archivo
     * @return array<string, mixed>
     */
    public function limpiar_al_subir(array $archivo): array
    {
        if (($archivo['type'] ?? '') !== self::MIME) {
            return $archivo;
        }
        if (!self::puede_subir()) {
            $archivo['error'] = 'No tienes permisos para subir archivos SVG.';
            return $archivo;
        }

        $ruta = (string) ($archivo['tmp_name'] ?? '');
        $crudo = $ruta !== '' && is_readable($ruta) ? (string) file_get_contents($ruta) : '';
        if ($crudo === '') {
            $archivo['error'] = 'El archivo SVG llegó vacío.';
            return $archivo;
        }

        $limpio = self::limpiar($crudo);
        if ($limpio === null) {
            $archivo['error'] = 'Ese SVG no se pudo leer como XML válido, así que no se puede comprobar '
                . 'que sea seguro. Vuelve a exportarlo desde el programa de dibujo.';
            return $archivo;
        }

        file_put_contents($ruta, $limpio);

        return $archivo;
    }

    /**
     * Devuelve el SVG sin nada ejecutable, o `null` si no se pudo leer.
     *
     * Está aparte de la subida —y es pública— para poder probarla con cadenas
     * sueltas, sin simular una subida de archivo.
     */
    public static function limpiar(string $crudo): ?string
    {
        // Un archivo vacío no es «XML inválido»: en PHP 8 `loadXML('')` lanza
        // un ValueError y tumba la petición entera. Pasa de verdad —una subida
        // cortada deja un archivo de cero bytes— y lo encontró la prueba, no
        // la lectura.
        if (trim($crudo) === '') {
            return null;
        }

        // Las entidades externas se desactivan ANTES de analizar: el ataque
        // clásico de XML consiste en declarar una entidad que apunta a un
        // archivo del servidor y dejar que el analizador la resuelva solo.
        $previo = libxml_use_internal_errors(true);
        if (function_exists('libxml_disable_entity_loader') && PHP_VERSION_ID < 80000) {
            // phpcs:ignore -- en PHP 8 ya es el comportamiento por omisión.
            libxml_disable_entity_loader(true);
        }

        $doc = new DOMDocument();
        // `LIBXML_NONET` es lo que impide que el analizador salga a la red por
        // su cuenta. Y NO se pasa `LIBXML_NOENT`: esa bandera, pese al nombre,
        // *expande* las entidades en vez de quitarlas, que es justo lo que no
        // queremos. Sin ella quedan sin resolver, que es lo seguro.
        $ok = $doc->loadXML($crudo, LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($previo);

        if (!$ok || $doc->documentElement === null) {
            return null;
        }
        if (strtolower($doc->documentElement->nodeName) !== 'svg') {
            return null;
        }
        // Una declaración de tipo de documento no hace falta nunca en un SVG
        // de un programa de dibujo, y es donde viven las entidades.
        if ($doc->doctype !== null && $doc->doctype->parentNode !== null) {
            $doc->doctype->parentNode->removeChild($doc->doctype);
        }

        self::podar($doc->documentElement);

        $salida = $doc->saveXML();

        return is_string($salida) ? $salida : null;
    }

    /** Elementos que se van enteros, con lo que lleven dentro. */
    private const ELEMENTOS_FUERA = [
        'script', 'foreignobject', 'handler', 'listener', 'set',
        'animate', 'animatetransform', 'animatemotion',
    ];

    /** Atributos que llevan una dirección y por lo tanto hay que revisar. */
    private const ATRIBUTOS_CON_URL = ['href', 'xlink:href', 'src', 'from', 'to', 'values', 'filter', 'style'];

    private static function podar(DOMElement $elemento): void
    {
        // Se recorre al revés porque quitar un hijo mueve a los siguientes.
        for ($i = $elemento->childNodes->length - 1; $i >= 0; $i--) {
            $hijo = $elemento->childNodes->item($i);
            if ($hijo instanceof DOMProcessingInstruction) {
                // `<?xml-stylesheet href="…">` trae una hoja de fuera.
                $elemento->removeChild($hijo);
                continue;
            }
            if (!$hijo instanceof DOMElement) {
                continue;
            }
            if (in_array(strtolower($hijo->nodeName), self::ELEMENTOS_FUERA, true)) {
                $elemento->removeChild($hijo);
                continue;
            }
            self::podar($hijo);
        }

        for ($i = $elemento->attributes->length - 1; $i >= 0; $i--) {
            $attr = $elemento->attributes->item($i);
            if (!$attr instanceof DOMAttr) {
                continue;
            }
            $nombre = strtolower($attr->nodeName);
            $valor = (string) $attr->nodeValue;

            // Un atributo que empieza por «on» es un guion escrito a mano.
            if (strpos($nombre, 'on') === 0) {
                $elemento->removeAttribute($attr->nodeName);
                continue;
            }
            if (in_array($nombre, self::ATRIBUTOS_CON_URL, true) && !self::url_aceptable($valor)) {
                $elemento->removeAttribute($attr->nodeName);
            }
        }
    }

    /**
     * ¿Es una dirección que se puede dejar dentro de un SVG?
     *
     * Se aceptan las que apuntan DENTRO del propio archivo (`#algo`), las
     * relativas del propio sitio, y las imágenes incrustadas en base64. Se
     * rechaza todo lo que salga a otro servidor: un `<use href="https://…">`
     * trae un fragmento ajeno y lo dibuja como propio, y entonces quien
     * controle ese servidor controla lo que muestra este sitio.
     */
    private static function url_aceptable(string $valor): bool
    {
        $v = trim($valor);
        if ($v === '' || $v[0] === '#') {
            return true;
        }
        // Dentro de `style` puede venir un url(...) escondido.
        if (stripos($v, 'javascript:') !== false || stripos($v, 'vbscript:') !== false) {
            return false;
        }
        if (preg_match('#url\s*\(\s*[\x22\x27]?\s*(https?:)?//#i', $v) === 1) {
            return false;
        }
        if (stripos($v, 'data:') === 0) {
            // Sólo imágenes, nunca `data:text/html` ni `data:image/svg+xml`,
            // que vuelve a abrir la puerta de par en par.
            return preg_match('#^data:image/(png|jpe?g|gif|webp);base64,#i', $v) === 1;
        }
        if (preg_match('#^(https?:)?//#i', $v) === 1) {
            return false;
        }

        return true;
    }

    /**
     * Que la lista de Medios muestre el dibujo y no un icono genérico.
     *
     * WordPress arma las miniaturas recortando el archivo, y un SVG no se
     * recorta: no tiene píxeles. Así que se le pasa el propio archivo como
     * «miniatura», que es lo que corresponde a un vector —se ve bien a
     * cualquier tamaño—.
     *
     * @param array<string, mixed> $respuesta
     * @return array<string, mixed>
     */
    public function miniatura_en_medios(array $respuesta, $adjunto): array
    {
        if (($respuesta['mime'] ?? '') !== self::MIME) {
            return $respuesta;
        }
        $url = wp_get_attachment_url(is_object($adjunto) ? (int) $adjunto->ID : 0);
        if (!is_string($url) || $url === '') {
            return $respuesta;
        }
        $respuesta['icon'] = $url;
        $respuesta['sizes'] = [
            'full' => ['url' => $url, 'width' => 150, 'height' => 150, 'orientation' => 'portrait'],
            'thumbnail' => ['url' => $url, 'width' => 150, 'height' => 150, 'orientation' => 'portrait'],
        ];

        return $respuesta;
    }
}
