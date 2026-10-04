<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * El catálogo de iconos: buscar, filtrar y traer uno al set.
 *
 * DE DÓNDE SALE. Del propio catálogo de Material, que Google publica como
 * datos en `fonts.google.com/metadata/icons`: 6.126 iconos, cada uno con sus
 * categorías, sus etiquetas de búsqueda y —lo más valioso— CUÁNTAS VECES SE
 * USA EN LA WEB. Es el mismo movimiento que ya hacemos en ContOpe Desktop con
 * el catálogo de familias tipográficas; la idea de usarlo acá es de Cristóbal.
 *
 * POR QUÉ SE LEE DESDE EL SERVIDOR Y NO DESDE EL NAVEGADOR. Porque el servidor
 * de Google no admite peticiones de otro origen: desde la página, el navegador
 * las bloquea. Medido el 4 de octubre de 2026.
 *
 * QUÉ SE GUARDA Y QUÉ NO. El catálogo entero pesa unos 5,8 MB, así que se
 * guarda ADELGAZADO —nombre, categorías, etiquetas y popularidad— y en un
 * transitorio que vence en una semana. Lo que se queda para siempre es sólo
 * el dibujo de los iconos que alguien eligió.
 *
 * LO QUE NUNCA OCURRE: descargar al servir una página. Una visita no puede
 * depender de que Google responda. Acá se descarga al ELEGIR un icono, que es
 * trabajo de panel, y de ahí en adelante el dibujo es un archivo del sitio.
 */
final class COD_Iconos_Catalogo
{
    public const TRANSITORIO = 'cod_iconos_catalogo';
    public const VIGENCIA = WEEK_IN_SECONDS;

    public const URL_CATALOGO = 'https://fonts.google.com/metadata/icons?incomplete=1&key=material_symbols';

    /** De dónde se baja el dibujo suelto de un icono. */
    public const FAMILIAS = [
        'outlined' => 'materialsymbolsoutlined',
        'rounded' => 'materialsymbolsrounded',
        'sharp' => 'materialsymbolssharp',
    ];

    /**
     * Castellano → inglés, para que la búsqueda sirva.
     *
     * Las etiquetas de Material están en inglés, así que sin esto escribir
     * «basura» o «casa» no devuelve nada y el buscador es inútil para quien
     * diseña en castellano. Medido el 4 de octubre de 2026: «truck» encuentra
     * cuatro camiones; «camión», ninguno.
     *
     * No pretende ser un diccionario: son las palabras con las que se busca un
     * icono. Si falta una se agrega acá, que es una línea.
     */
    public const SINONIMOS = [
        'abajo' => 'down', 'abrir' => 'open', 'acento' => 'star', 'adjuntar' => 'attach',
        'agenda' => 'calendar', 'agregar' => 'add', 'ajustes' => 'settings', 'alerta' => 'warning',
        'archivo' => 'file', 'arriba' => 'up', 'atras' => 'back', 'atrás' => 'back',
        'ayuda' => 'help', 'bajar' => 'download', 'bandeja' => 'inbox', 'basura' => 'delete',
        'bolsa' => 'bag', 'borrar' => 'delete', 'boton' => 'button', 'botón' => 'button',
        'buscar' => 'search', 'calendario' => 'calendar', 'camara' => 'camera', 'cámara' => 'camera',
        'camion' => 'truck', 'camión' => 'truck', 'candado' => 'lock', 'carpeta' => 'folder',
        'carro' => 'cart', 'casa' => 'home', 'cerrar' => 'close', 'cheque' => 'check',
        'ciudad' => 'city', 'cliente' => 'person', 'compartir' => 'share', 'compra' => 'shopping',
        'conectar' => 'link', 'configuracion' => 'settings', 'configuración' => 'settings',
        'contacto' => 'contact', 'copiar' => 'copy', 'correo' => 'mail', 'cuenta' => 'account',
        'descarga' => 'download', 'descargar' => 'download', 'dinero' => 'money',
        'direccion' => 'location', 'dirección' => 'location', 'documento' => 'document',
        'editar' => 'edit', 'empresa' => 'business', 'enlace' => 'link', 'entrar' => 'login',
        'enviar' => 'send', 'error' => 'error', 'escribir' => 'edit', 'estrella' => 'star',
        'etiqueta' => 'label', 'fabrica' => 'factory', 'fábrica' => 'factory', 'favorito' => 'favorite',
        'fecha' => 'date', 'filtro' => 'filter', 'flecha' => 'arrow', 'foto' => 'photo',
        'grafico' => 'chart', 'gráfico' => 'chart', 'guardar' => 'save', 'hoja' => 'leaf',
        'hora' => 'time', 'imagen' => 'image', 'imprimir' => 'print', 'informacion' => 'info',
        'información' => 'info', 'libro' => 'book', 'lista' => 'list', 'llave' => 'key',
        'lupa' => 'search', 'mapa' => 'map', 'menu' => 'menu', 'menú' => 'menu',
        'mensaje' => 'message', 'mundo' => 'globe', 'nube' => 'cloud', 'ojo' => 'visibility',
        'pagar' => 'payment', 'pago' => 'payment', 'persona' => 'person', 'planta' => 'plant',
        'precio' => 'price', 'reloj' => 'clock', 'salir' => 'logout', 'subir' => 'upload',
        'telefono' => 'phone', 'teléfono' => 'phone', 'tienda' => 'store', 'ubicacion' => 'location',
        'ubicación' => 'location', 'usuario' => 'person', 'ver' => 'visibility', 'video' => 'video',
    ];

    /** El archivo de la tipografía de vista previa, dentro del set. */
    public const TIPOGRAFIA = 'material-symbols-outlined.woff2';

    public const URL_CSS_TIPOGRAFIA = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';

    /**
     * La tipografía de Material, alojada en el sitio.
     *
     * POR QUÉ ALOJADA Y NO DESDE GOOGLE. Porque el editor no puede referenciar
     * un CDN —es regla del proyecto y hay una prueba que la hace cumplir—, y
     * porque es la misma decisión que tomamos al localizar las tipografías del
     * tema: lo que el sitio usa, vive en el sitio.
     *
     * SE TRAE UNA VEZ Y SÓLO PARA EL PANEL. Es la vista previa del selector:
     * al sitio publicado no llega nunca, porque allá cada icono es su propio
     * SVG. Pesa 324 KB —medido el 4 de octubre de 2026; la cifra de 3,7 MB que
     * circulaba venía de un comentario en Orugantt sobre otra cosa y era
     * falsa—.
     *
     * Si no está, el selector sigue funcionando: busca, filtra y elige igual;
     * lo único que falta es el dibujo de los que todavía no están en el sitio.
     */
    public static function ruta_tipografia(): string
    {
        $carpeta = COD_Icono::carpeta();
        if ($carpeta === '') {
            return '';
        }
        $archivo = trailingslashit($carpeta) . self::TIPOGRAFIA;
        return is_readable($archivo) ? trailingslashit(COD_Icono::carpeta_url()) . self::TIPOGRAFIA : '';
    }

    /** @return array{ok: bool, bytes?: int, error?: string} */
    public static function traer_tipografia(): array
    {
        $carpeta = COD_Icono::carpeta();
        if ($carpeta === '') {
            return ['ok' => false, 'error' => 'No se pudo preparar la carpeta del set.'];
        }
        $destino = trailingslashit($carpeta) . self::TIPOGRAFIA;
        if (is_readable($destino)) {
            return ['ok' => true, 'bytes' => (int) filesize($destino)];
        }

        // La hoja de Google devuelve una dirección distinta según el navegador
        // que dice ser quien pregunta; con un agente moderno responde woff2,
        // que es el formato que queremos.
        $hoja = wp_remote_get(self::URL_CSS_TIPOGRAFIA, [
            'timeout' => 25,
            'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ]);
        if (is_wp_error($hoja) || (int) wp_remote_retrieve_response_code($hoja) !== 200) {
            return ['ok' => false, 'error' => 'No se pudo leer la hoja de la tipografía.'];
        }
        if (preg_match('#url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)#', (string) wp_remote_retrieve_body($hoja), $m) !== 1) {
            return ['ok' => false, 'error' => 'La hoja no traía una dirección woff2.'];
        }

        $fuente = wp_remote_get($m[1], ['timeout' => 40]);
        if (is_wp_error($fuente) || (int) wp_remote_retrieve_response_code($fuente) !== 200) {
            return ['ok' => false, 'error' => 'No se pudo descargar la tipografía.'];
        }
        $cuerpo = (string) wp_remote_retrieve_body($fuente);
        if (strlen($cuerpo) < 50000 || substr($cuerpo, 0, 4) !== 'wOF2') {
            return ['ok' => false, 'error' => 'Lo descargado no parece una tipografía woff2.'];
        }
        if (file_put_contents($destino, $cuerpo) === false) {
            return ['ok' => false, 'error' => 'No se pudo escribir la tipografía.'];
        }

        return ['ok' => true, 'bytes' => strlen($cuerpo)];
    }

    /**
     * El catálogo adelgazado: [nombre => [cat, etiquetas, usos]].
     *
     * @return array<string, array{c: array<int,string>, e: array<int,string>, u: int, p: int}>
     */
    public static function todo(): array
    {
        $guardado = get_transient(self::TRANSITORIO);
        if (is_array($guardado) && $guardado !== []) {
            return $guardado;
        }

        $respuesta = wp_remote_get(self::URL_CATALOGO, ['timeout' => 25]);
        if (is_wp_error($respuesta) || (int) wp_remote_retrieve_response_code($respuesta) !== 200) {
            return [];
        }

        // Google antepone `)]}'` a sus respuestas JSON, para que un <script>
        // ajeno no pueda leerlas. Hay que quitarlo antes de interpretar.
        $cuerpo = preg_replace('/^\)\]\}\'\s*/', '', (string) wp_remote_retrieve_body($respuesta));
        $datos = json_decode((string) $cuerpo, true);
        if (!is_array($datos) || !isset($datos['icons']) || !is_array($datos['icons'])) {
            return [];
        }

        $catalogo = [];
        foreach ($datos['icons'] as $icono) {
            if (!is_array($icono) || !isset($icono['name']) || !is_string($icono['name'])) {
                continue;
            }
            $nombre = $icono['name'];
            $usos = isset($icono['popularity']) ? (int) $icono['popularity'] : 0;
            // El mismo nombre aparece en varias familias; nos quedamos con el
            // registro de mayor uso, que es el que manda al ordenar.
            if (isset($catalogo[$nombre]) && $catalogo[$nombre]['u'] >= $usos) {
                continue;
            }
            $catalogo[$nombre] = [
                'c' => array_values(array_filter((array) ($icono['categories'] ?? []), 'is_string')),
                'e' => array_values(array_filter((array) ($icono['tags'] ?? []), 'is_string')),
                'u' => $usos,
                // El punto de código es lo que permite dibujar la vista previa
                // con la tipografía. Por ligadura —escribiendo el nombre— falla
                // en los que empiezan por un número, como `10k`.
                'p' => isset($icono['codepoint']) ? (int) $icono['codepoint'] : 0,
            ];
        }

        if ($catalogo !== []) {
            set_transient(self::TRANSITORIO, $catalogo, self::VIGENCIA);
        }

        return $catalogo;
    }

    /** Las categorías con cuántos iconos tiene cada una. */
    public static function categorias(): array
    {
        $cuenta = [];
        foreach (self::todo() as $datos) {
            foreach ($datos['c'] as $categoria) {
                $cuenta[$categoria] = ($cuenta[$categoria] ?? 0) + 1;
            }
        }
        arsort($cuenta);
        return $cuenta;
    }

    /**
     * Busca iconos por texto y categoría, ordenados por uso real.
     *
     * El texto se compara contra el nombre Y contra las etiquetas, que es lo
     * que permite encontrar «basura» escribiendo «borrar»: 4.220 de los 4.254
     * iconos distintos traen etiquetas. Un buscador que sólo mirara el nombre
     * obligaría a saberse el nombre en inglés de antemano.
     *
     * @return array<int, array{nombre: string, usos: int, categorias: array<int,string>, punto: int, enElSet: bool}>
     */
    public static function buscar(string $texto = '', string $categoria = '', int $limite = 120): array
    {
        $texto = strtolower(trim($texto));
        // Si lo escrito está en castellano se busca también por su palabra en
        // inglés, que es el idioma de las etiquetas de Material.
        if ($texto !== '' && isset(self::SINONIMOS[$texto])) {
            $texto = self::SINONIMOS[$texto];
        }
        $limite = max(1, min(500, $limite));
        $encontrados = [];

        foreach (self::todo() as $nombre => $datos) {
            if ($categoria !== '' && !in_array($categoria, $datos['c'], true)) {
                continue;
            }
            if ($texto !== '') {
                $enNombre = strpos($nombre, $texto) !== false;
                $enEtiquetas = false;
                if (!$enNombre) {
                    foreach ($datos['e'] as $etiqueta) {
                        if (strpos(strtolower($etiqueta), $texto) !== false) {
                            $enEtiquetas = true;
                            break;
                        }
                    }
                }
                if (!$enNombre && !$enEtiquetas) {
                    continue;
                }
                // Un acierto en el nombre vale más que uno en las etiquetas, y
                // que empiece por lo escrito vale más que contenerlo: quien
                // escribe «home» quiere `home` antes que `home_work`.
                $peso = $enNombre ? (strpos($nombre, $texto) === 0 ? 2 : 1) : 0;
            } else {
                $peso = 0;
            }
            $encontrados[] = [
                'nombre' => $nombre,
                'usos' => $datos['u'],
                'categorias' => $datos['c'],
                'punto' => $datos['p'] ?? 0,
                'peso' => $peso,
            ];
        }

        usort($encontrados, static function (array $a, array $b): int {
            return $a['peso'] === $b['peso'] ? $b['usos'] <=> $a['usos'] : $b['peso'] <=> $a['peso'];
        });

        $salida = [];
        foreach (array_slice($encontrados, 0, $limite) as $icono) {
            unset($icono['peso']);
            $icono['enElSet'] = COD_Icono::ruta_de_nombre($icono['nombre']) !== '';
            $salida[] = $icono;
        }

        return $salida;
    }

    /**
     * Trae un icono al set, en sus TRES estilos.
     *
     * Los tres y no el activo: el estilo es un ajuste del sitio y tenerlos los
     * tres deja cambiarlo sin volver a descargar ni rehacer las páginas.
     *
     * @return array{ok: bool, estilos: array<int,string>, error?: string}
     */
    public static function cachear(string $nombre, string $peso = '', bool $relleno = false): array
    {
        $nombre = strtolower(trim($nombre));
        if (preg_match('/^[a-z0-9_]{1,64}$/', $nombre) !== 1) {
            // Acá SIN guión a propósito: esto descarga de Material, y los
            // nombres con guión son los nuestros (las redes), que no se bajan.
            return ['ok' => false, 'estilos' => [], 'error' => 'El nombre de un icono de Material son letras minúsculas, números y guión bajo.'];
        }

        $carpeta = COD_Icono::carpeta();
        if ($carpeta === '') {
            return ['ok' => false, 'estilos' => [], 'error' => 'No se pudo preparar la carpeta del set.'];
        }

        // La variante se arma como la pide el servidor de Google: «default», o
        // el peso y el relleno pegados («wght300fill1»).
        $variante = 'default';
        if ($peso !== '' || $relleno) {
            $variante = ($peso !== '' ? 'wght' . (int) $peso : '') . ($relleno ? 'fill1' : '');
            if ($variante === '') {
                $variante = 'default';
            }
        }

        $hechos = [];
        foreach (self::FAMILIAS as $estilo => $familia) {
            $archivo = 'icono-' . $nombre . '-' . $estilo . '.svg';
            $destino = trailingslashit($carpeta) . $archivo;
            if (file_exists($destino)) {
                $hechos[] = $estilo;
                continue;
            }

            $url = 'https://fonts.gstatic.com/s/i/short-term/release/' . $familia . '/'
                . rawurlencode($nombre) . '/' . rawurlencode($variante) . '/24px.svg';
            $respuesta = wp_remote_get($url, ['timeout' => 20]);
            if (is_wp_error($respuesta) || (int) wp_remote_retrieve_response_code($respuesta) !== 200) {
                continue;
            }

            // Fuera el ancho y el alto del archivo: el tamaño lo decide quien
            // lo usa. Y se limpia con la misma puerta que una subida a mano.
            $svg = (string) preg_replace('/\s(?:width|height)="[0-9.]+"/i', '', wp_remote_retrieve_body($respuesta));
            $limpio = class_exists('COD_SVG') ? COD_SVG::limpiar($svg) : null;
            if ($limpio === null || file_put_contents($destino, $limpio) === false) {
                continue;
            }

            $hechos[] = $estilo;
        }

        if ($hechos === []) {
            return ['ok' => false, 'estilos' => [], 'error' => 'No se pudo traer «' . $nombre . '». ¿Existe ese icono?'];
        }

        return ['ok' => true, 'estilos' => $hechos];
    }
}
