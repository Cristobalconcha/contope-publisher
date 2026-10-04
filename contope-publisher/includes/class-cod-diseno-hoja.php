<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Una hoja de estilos por DISEÑO, no una por página.
 *
 * DE DÓNDE SALE. Cristóbal, el 4 de octubre de 2026, mirando el deduplicador
 * de CSS que acabábamos de escribir: «es como que hubieras pinchado un
 * neumático y después lo tuvieras que parchar. Lo que necesitamos es que el
 * neumático no se pinche. No tiene por qué generarse una hoja de estilo por
 * cada página de un sitio; la hoja tiene que ser centralizada».
 *
 * La 0.3.63 sacó de los documentos la hoja BASE, que es del motor. Esto saca
 * las REGLAS DE DISEÑO, que son del sitio: hasta ahora cada documento llevaba
 * las suyas incrustadas en el HTML, así que un visitante que recorría cuatro
 * páginas descargaba cuatro veces lo que en el fondo es un solo sistema.
 *
 * QUÉ LO HIZO POSIBLE, y sin esto habría roto el sitio: que dentro de un
 * mismo diseño un nombre signifique UNA cosa. Al medirlo aparecieron siete
 * nombres con dos significados —`titulo` era 40 px en una página y 34 en otra,
 * `caja` era una rejilla de 1080 px en una y una caja de lectura de 760 en
 * otra—. Funcionaba por casualidad, porque cada página cargaba sólo lo suyo.
 * Fundir las hojas sin arreglar eso habría cambiado el aspecto de páginas que
 * nadie tocó. Lo vigila `probar-reglas-sin-colision.php`.
 *
 * EL `designId` ES EL ESPACIO DE NOMBRES. Dos diseños distintos pueden llamar
 * `caja` a cosas distintas sin estorbarse, porque son hojas distintas.
 *
 * CUÁNDO SE ESCRIBE: al aplicar una composición, no al servir una página. Una
 * visita no puede quedar esperando a que se recorra el sitio.
 */
final class COD_Diseno_Hoja
{
    /** Dónde viven las hojas, dentro de uploads y sin año ni mes. */
    public const CARPETA = 'contope-disenos';

    /** La lista de hojas vigentes: designId => ['archivo' => ..., 'sello' => ...]. */
    public const OPTION_KEY = 'cod_disenos_hojas';

    /** La carpeta en disco, creada si hace falta. */
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

    /** La dirección pública de la hoja de un diseño, o '' si no hay. */
    public static function url(string $design_id): string
    {
        $hojas = get_option(self::OPTION_KEY, []);
        if (!is_array($hojas) || !isset($hojas[$design_id]['archivo'])) {
            return '';
        }
        $archivo = (string) $hojas[$design_id]['archivo'];
        $carpeta = self::carpeta();
        if ($carpeta === '' || !is_readable(trailingslashit($carpeta) . $archivo)) {
            return '';
        }
        $subida = wp_upload_dir();
        return trailingslashit($subida['baseurl']) . self::CARPETA . '/' . $archivo;
    }

    /**
     * Rehace la hoja de un diseño juntando las reglas de todos sus documentos.
     *
     * Se puede juntar sin más porque ningún nombre significa dos cosas dentro
     * de un diseño; si alguna vez vuelve a pasar, la prueba lo dice antes de
     * que llegue acá.
     *
     * EL NOMBRE DEL ARCHIVO LLEVA LA HUELLA DEL CONTENIDO. Así el navegador
     * puede guardarlo para siempre: si el diseño cambia, cambia el nombre, y
     * se descarga el nuevo sin que nadie tenga que vaciar nada.
     *
     * @return string El nombre del archivo escrito, o '' si no se pudo.
     */
    public static function regenerar(string $design_id, COD_Canvas_Document_Repository $repositorio): string
    {
        $design_id = trim($design_id);
        if ($design_id === '' || preg_match('/^[a-z0-9_-]{1,64}$/i', $design_id) !== 1) {
            return '';
        }
        $carpeta = self::carpeta();
        if ($carpeta === '') {
            return '';
        }

        $reglas = [];
        foreach (self::documentos_del_sitio() as $documento_id) {
            $documento = $repositorio->load($documento_id);
            if (!is_array($documento)) {
                continue;
            }
            $composicion = json_decode((string) ($documento['composition'] ?? ''), true);
            if (!is_array($composicion) || (string) ($composicion['design']['designId'] ?? '') !== $design_id) {
                continue;
            }
            // Cada bloque entra una sola vez: entre documentos del mismo diseño
            // una regla repetida es la MISMA regla, no dos.
            foreach (self::bloques((string) ($documento['css'] ?? '')) as $bloque) {
                $reglas[$bloque] = true;
            }
        }

        if ($reglas === []) {
            return '';
        }

        $contenido = "/* Hoja del diseño «{$design_id}». La escribe COD_Diseno_Hoja al\n"
            . " * aplicar una composición; no se edita a mano. */\n"
            . implode("\n", array_keys($reglas)) . "\n";

        $sello = substr(md5($contenido), 0, 12);
        $archivo = sanitize_file_name($design_id) . '-' . $sello . '.css';
        $destino = trailingslashit($carpeta) . $archivo;

        if (!is_readable($destino) && file_put_contents($destino, $contenido) === false) {
            return '';
        }

        $hojas = get_option(self::OPTION_KEY, []);
        if (!is_array($hojas)) {
            $hojas = [];
        }
        $anterior = (string) ($hojas[$design_id]['archivo'] ?? '');
        $hojas[$design_id] = ['archivo' => $archivo, 'sello' => $sello];
        update_option(self::OPTION_KEY, $hojas, false);

        // La hoja vieja se borra: su nombre llevaba otra huella, así que nadie
        // la va a pedir y quedaría ocupando sitio para siempre.
        if ($anterior !== '' && $anterior !== $archivo) {
            @unlink(trailingslashit($carpeta) . $anterior);
        }

        return $archivo;
    }

    /**
     * Los bloques de una hoja de documento, uno por regla.
     *
     * Se parte por llaves de primer nivel para no romper las consultas de
     * medios, que llevan reglas dentro.
     *
     * @return array<int, string>
     */
    public static function bloques(string $css): array
    {
        $bloques = [];
        $nivel = 0;
        $actual = '';
        $largo = strlen($css);
        for ($i = 0; $i < $largo; ++$i) {
            $c = $css[$i];
            $actual .= $c;
            if ($c === '{') {
                ++$nivel;
            } elseif ($c === '}') {
                --$nivel;
                if ($nivel <= 0) {
                    $nivel = 0;
                    $limpio = trim($actual);
                    if ($limpio !== '') {
                        $bloques[] = $limpio;
                    }
                    $actual = '';
                }
            }
        }
        $resto = trim($actual);
        if ($resto !== '') {
            $bloques[] = $resto;
        }
        return $bloques;
    }

    /**
     * Los documentos del sitio: las páginas Canvas y las regiones.
     *
     * @return array<int, string>
     */
    private static function documentos_del_sitio(): array
    {
        $ids = [];
        $paginas = get_posts([
            'post_type' => 'page',
            'numberposts' => -1,
            'post_status' => 'any',
            'fields' => 'ids',
        ]);
        foreach ($paginas as $pagina_id) {
            $contenido = (string) get_post_field('post_content', (int) $pagina_id);
            $documento = COD_Canvas_Page_Publisher::documento_del_contenido($contenido);
            if ($documento !== '') {
                $ids[] = $documento;
            }
        }
        foreach ([
            COD_Canvas_Document_Repository::REGION_KIND_HEADER,
            COD_Canvas_Document_Repository::REGION_KIND_FOOTER,
            COD_Canvas_Document_Repository::REGION_KIND_BODY,
        ] as $region) {
            $ids[] = 'cod-region-' . $region;
        }
        return array_values(array_unique($ids));
    }
}
