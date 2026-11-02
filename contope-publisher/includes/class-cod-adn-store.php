<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * El almacén del ADN: una revisión por registro, un puntero único y un import atómico
 * (ESPEC 3.3, hallazgo H5).
 *
 *   CPT privado `cod_adn`         un post por revisión (`<designId>-r<N>`); post_content = JSON canónico
 *   opción `cod_adn_proj_r<N>`    la proyección de esa revisión (registro, theme.json, valores planos);
 *                                 NADIE la lee hasta que el puntero apunte a ella
 *   opción `cod_adn_activa`       EL PUNTERO: {designId, revision, digest, postId, importadoEn, emitirPropuestas}
 *
 * MOVER EL PUNTERO ES LA ÚNICA ESCRITURA QUE CAMBIA LO VISIBLE. Todo lo que se escribe antes
 * es invisible para los consumidores, así que un fallo a mitad de camino deja lo visible en
 * la revisión anterior ENTERA. Orden del import (apply):
 *
 *   validar → proyectar en memoria → integridad referencial sobre lo servido
 *   → bloqueo global EXCLUSIVO → recomparar la base → integridad otra vez, ya sin escrituras
 *   → escribir el CPT → escribir la proyección → mover el puntero → soltar
 *
 * Hay cuatro puntos de fallo con un gancho `cod_adn_import_punto` (tras-cpt, tras-proyeccion,
 * antes-del-puntero, dentro-del-bloqueo): sirven para PROBAR la atomicidad inyectando un
 * fallo, y para sincronizar procesos en la prueba de concurrencia. Sin nadie escuchando
 * no hacen nada.
 *
 * DESDE F2 LA PROYECCIÓN SE CONSUME, SIEMPRE POR EL PUNTERO (proyeccion_vigente()): el filtro de
 * theme.json (COD_ADN_Theme), COD_Design_Core, COD_Theme_Definitions::get() y el emisor de `:root`.
 * Sin ADN activo no se consume nada y el sitio queda exactamente como estaba.
 */
final class COD_ADN_Store
{
    public const POST_TYPE = 'cod_adn';
    public const OPCION_PUNTERO = 'cod_adn_activa';
    public const PREFIJO_PROYECCION = 'cod_adn_proj_r';
    public const META_DIGEST = '_cod_adn_digest';
    public const META_FUENTE = '_cod_adn_source';
    public const META_IMPORTADO_POR = '_cod_adn_importado_por';
    public const META_REVISION = '_cod_adn_revision';
    public const META_DESIGN_ID = '_cod_adn_design_id';
    public const FUENTES = ['desktop', 'extractor', 'upload'];

    public function register(): void
    {
        add_action('init', [self::class, 'registrar_tipo']);
    }

    public static function registrar_tipo(): void
    {
        if (post_type_exists(self::POST_TYPE)) {
            return;
        }
        register_post_type(self::POST_TYPE, [
            'label' => 'ADN de diseño',
            'public' => false,
            'publicly_queryable' => false,
            'show_ui' => false,
            'show_in_rest' => false,
            'show_in_menu' => false,
            'exclude_from_search' => true,
            'has_archive' => false,
            'rewrite' => false,
            'query_var' => false,
            'supports' => ['title'],
            'capability_type' => 'post',
            'map_meta_cap' => true,
        ]);
    }

    // ------------------------------------------------------------------
    // Lectura
    // ------------------------------------------------------------------

    /** @return array<string, mixed>|null el puntero, leído directo de la base (nunca de la caché de este proceso) */
    public static function puntero(): ?array
    {
        global $wpdb;
        $crudo = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", self::OPCION_PUNTERO));
        if (!is_string($crudo) || $crudo === '') {
            return null;
        }
        $valor = maybe_unserialize($crudo);
        return is_array($valor) && isset($valor['designId'], $valor['revision']) ? $valor : null;
    }

    public static function activo(): bool
    {
        return self::puntero() !== null;
    }

    /** La revisión activa, o 0 si no hay ADN. */
    public static function revision_activa(): int
    {
        $p = self::puntero();
        return $p === null ? 0 : (int) $p['revision'];
    }

    /**
     * La proyección vigente, resuelta SIEMPRE por el puntero. Es la única puerta de lectura
     * para los consumidores (F2).
     *
     * @return array<string, mixed>|null
     */
    public static function proyeccion_vigente(): ?array
    {
        $p = self::puntero();
        return $p === null ? null : self::proyeccion((int) $p['revision']);
    }

    /** @return array<string, mixed>|null */
    public static function proyeccion(int $revision): ?array
    {
        global $wpdb;
        $crudo = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", self::PREFIJO_PROYECCION . $revision));
        if (!is_string($crudo) || $crudo === '') {
            return null;
        }
        $valor = maybe_unserialize($crudo);
        return is_array($valor) ? $valor : null;
    }

    /** El contrato guardado de una revisión. */
    public static function contrato_de_revision(string $design_id, int $revision): ?stdClass
    {
        $post = get_posts([
            'post_type' => self::POST_TYPE,
            'name' => $design_id . '-r' . $revision,
            'post_status' => 'any',
            'numberposts' => 1,
            'suppress_filters' => true,
        ]);
        if ($post === []) {
            return null;
        }
        $valor = json_decode((string) $post[0]->post_content, false);
        return $valor instanceof stdClass ? $valor : null;
    }

    // ------------------------------------------------------------------
    // Entrada
    // ------------------------------------------------------------------

    /**
     * Lo que llega por el MCP son arreglos asociativos (`json_decode(..., true)`): ahí un `{}` y
     * un `[]` son lo mismo y el Core los distingue. Se reconstruyen los objetos. Una lista vacía
     * sigue siendo lista salvo en `value` y `supersededValue`, donde la espec dice que `{}` es
     * "declarada y sin resolver". La forma LOSSLESS es mandar el ADN como texto JSON.
     *
     * @param mixed $v
     * @return mixed
     */
    public static function a_objetos($v, string $clave = '')
    {
        if (!is_array($v)) {
            return $v;
        }
        if ($v === []) {
            return in_array($clave, ['value', 'supersededValue', 'design', 'projections'], true) ? new stdClass() : [];
        }
        $es_lista = array_keys($v) === range(0, count($v) - 1);
        if ($es_lista) {
            return array_map(static function ($item) use ($clave) {
                return self::a_objetos($item, $clave);
            }, $v);
        }
        $o = new stdClass();
        foreach ($v as $k => $item) {
            $o->{(string) $k} = self::a_objetos($item, (string) $k);
        }
        return $o;
    }

    /**
     * @param mixed $modelo texto JSON, objeto (stdClass) o arreglo asociativo
     * @return string|object
     */
    private static function normalizar_modelo($modelo)
    {
        if (is_array($modelo)) {
            return self::a_objetos($modelo);
        }
        return $modelo;
    }

    /** Para cod_get_capabilities (ESPEC 3.4). */
    public static function descriptor(): array
    {
        $p = self::puntero();
        if ($p === null) {
            return ['activo' => false];
        }
        return [
            'activo' => true,
            'designId' => $p['designId'],
            'revision' => (int) $p['revision'],
            'modo' => COD_ADN_Gate::modo(),
            'digest' => $p['digest'],
        ];
    }

    /**
     * `design.expectedDesignRevision` de una composición debe ser la revisión activa del ADN. Sin
     * ADN activo no hay con qué comparar. Quien llama decide si la compuerta está encendida:
     * con el modo `off` esto no se pregunta ("en off sigue libre").
     *
     * @return WP_Error|null
     */
    public static function comprobar_revision_esperada(int $esperada)
    {
        $p = self::puntero();
        if ($p === null || (int) $p['revision'] === $esperada) {
            return null;
        }
        $error = new WP_Error(
            'ADN_REVISION_STALE',
            'La composición se hizo contra la revisión ' . $esperada . ' del ADN y la activa es la ' . (int) $p['revision'] . '. Consulta cod_adn_get y vuelve a previsualizar con expectedDesignRevision ' . (int) $p['revision'] . '.'
        );
        $error->add_data(['revisionActiva' => (int) $p['revision'], 'esperada' => $esperada, 'designId' => $p['designId'], 'siguiente' => 'cod_adn_get']);
        return $error;
    }

    // ------------------------------------------------------------------
    // preview
    // ------------------------------------------------------------------

    private static function previsualizacion_vacia(): array
    {
        return [
            'ok' => false, 'estado' => '', 'errores' => [], 'designId' => '', 'revisionBase' => self::revision_activa(), 'revisionNueva' => 0,
            'digest' => '', 'emitirPropuestas' => false, 'diff' => null, 'rompe' => [], 'proyeccion' => null, 'ignoradas' => [], 'avisos' => [],
            'definiciones' => [], 'previewId' => '', 'formato' => '',
        ];
    }

    private static function error(string $codigo, string $mensaje, array $extra = []): array
    {
        return ['codigo' => $codigo, 'mensaje' => $mensaje] + $extra;
    }

    /**
     * Qué haría un import con este ADN, sin escribir nada.
     *
     * @param mixed $modelo
     * @param array{emitirPropuestas?: bool, expectedCurrentRevision?: int|null} $opciones
     * @return array<string, mixed>
     */
    public static function previsualizar($modelo, array $opciones = []): array
    {
        $r = self::previsualizacion_vacia();
        $emitir = !empty($opciones['emitirPropuestas']);
        $r['emitirPropuestas'] = $emitir;

        $validacion = COD_ADN_Validator::validar(self::normalizar_modelo($modelo), ['emitirPropuestas' => $emitir]);
        $r['formato'] = $validacion['formato'];
        if (!$validacion['ok'] || $validacion['contrato'] === null) {
            $r['errores'] = $validacion['errores'];
            return $r;
        }
        /** @var stdClass $contrato */
        $contrato = $validacion['contrato'];
        $design_id = (string) $contrato->design->id;
        $revision = (int) $contrato->design->revision;
        $digest = $validacion['digest'];
        $r['designId'] = $design_id;
        $r['revisionNueva'] = $revision;
        $r['digest'] = $digest;
        $r['definiciones'] = $validacion['definiciones'];
        $r['ignoradas'] = $validacion['ignoradas'];

        $activo = self::puntero();
        $base = $activo === null ? 0 : (int) $activo['revision'];
        if ($activo !== null && (string) $activo['designId'] !== $design_id) {
            $r['errores'][] = self::error('ADN_DESIGN_ID_MISMATCH', 'Este sitio ya tiene el ADN "' . $activo['designId'] . '"; el archivo trae "' . $design_id . '". Un sitio tiene un solo ADN activo.', ['activo' => $activo['designId'], 'recibido' => $design_id]);
            return $r;
        }
        if ($activo !== null && hash_equals((string) $activo['digest'], $digest)) {
            $r['ok'] = true;
            $r['estado'] = 'unchanged';
            $r['previewId'] = self::preview_id($digest, $base, $emitir);
            return $r;
        }
        if ($activo !== null && $revision <= $base) {
            $r['errores'][] = self::error('ADN_REVISION_NOT_NEWER', 'La revisión ' . $revision . ' no es mayor que la activa (' . $base . '). Para volver a un contenido anterior se reimporta como una revisión nueva.', ['activa' => $base, 'recibida' => $revision]);
            return $r;
        }
        $esperada = $opciones['expectedCurrentRevision'] ?? null;
        if ($esperada !== null && (int) $esperada !== $base) {
            $r['errores'][] = self::error('ADN_STALE_BASE', 'Se esperaba que la revisión activa fuera la ' . (int) $esperada . ' y es la ' . $base . '.', ['esperada' => (int) $esperada, 'activa' => $base]);
            return $r;
        }

        $proyeccion = COD_ADN_Projection::construir($contrato, $validacion);
        if (is_wp_error($proyeccion)) {
            $r['errores'][] = self::error($proyeccion->get_error_code(), $proyeccion->get_error_message(), is_array($proyeccion->get_error_data()) ? $proyeccion->get_error_data() : []);
            return $r;
        }
        $r['avisos'] = $proyeccion['avisos'];

        $anterior = $activo === null ? null : self::proyeccion($base);
        $viejo_contrato = $activo === null ? null : self::contrato_de_revision((string) $activo['designId'], $base);
        $r['diff'] = self::diferencias($viejo_contrato, $contrato, $anterior['registro'] ?? [], $proyeccion['registro']);
        $perdidas = array_merge(
            array_column($r['diff']['variables']['quitadas'], 'variable'),
            array_column($r['diff']['variables']['renombradas'], 'de'),
            array_column($r['diff']['variables']['degradadas'], 'variable')
        );
        $r['rompe'] = $perdidas === [] ? [] : COD_ADN_Integridad::en_uso($perdidas);
        $r['proyeccion'] = [
            'variables' => count($proyeccion['registro']),
            'plano' => array_keys($proyeccion['plano']),
            'themeJson' => array_keys($proyeccion['themeJson']['settings'] ?? []),
        ];
        $r['ok'] = true;
        $r['estado'] = $activo === null ? 'nuevo' : 'actualiza';
        $r['previewId'] = self::preview_id($digest, $base, $emitir);
        return $r;
    }

    public static function preview_id(string $digest, int $base, bool $emitir): string
    {
        return hash('sha256', $digest . '|' . $base . '|' . ($emitir ? '1' : '0'));
    }

    /**
     * @param array<string, array<string, mixed>> $viejo
     * @param array<string, array<string, mixed>> $nuevo
     * @return array<string, mixed>
     */
    private static function diferencias(?stdClass $contrato_viejo, stdClass $contrato_nuevo, array $viejo, array $nuevo): array
    {
        $firma = static function (stdClass $d): string {
            return COD_ADN_Validator::json_canonico($d);
        };
        $defs_viejas = [];
        foreach ($contrato_viejo->definitions ?? [] as $d) {
            $defs_viejas[(string) $d->id] = $firma($d);
        }
        $defs_nuevas = [];
        foreach ($contrato_nuevo->definitions as $d) {
            $defs_nuevas[(string) $d->id] = $firma($d);
        }
        $definiciones = [
            'agregadas' => array_values(array_diff(array_keys($defs_nuevas), array_keys($defs_viejas))),
            'quitadas' => array_values(array_diff(array_keys($defs_viejas), array_keys($defs_nuevas))),
            'cambiadas' => array_values(array_filter(array_intersect(array_keys($defs_nuevas), array_keys($defs_viejas)), static function ($id) use ($defs_viejas, $defs_nuevas): bool {
                return $defs_viejas[$id] !== $defs_nuevas[$id];
            })),
        ];

        $agregadas = array_values(array_diff(array_keys($nuevo), array_keys($viejo)));
        $quitadas = array_values(array_diff(array_keys($viejo), array_keys($nuevo)));
        $renombradas = [];
        foreach ($quitadas as $i => $v) {
            foreach ($agregadas as $j => $a) {
                if ($viejo[$v]['definicion'] === $nuevo[$a]['definicion'] && $viejo[$v]['ruta'] === $nuevo[$a]['ruta'] && $viejo[$v]['clase'] === $nuevo[$a]['clase']) {
                    $renombradas[] = ['de' => $v, 'a' => $a];
                    unset($quitadas[$i], $agregadas[$j]);
                    break;
                }
            }
        }
        $cambiadas = [];
        $degradadas = [];
        foreach (array_intersect(array_keys($nuevo), array_keys($viejo)) as $v) {
            if ($viejo[$v]['valor'] !== $nuevo[$v]['valor']) {
                $cambiadas[] = ['variable' => $v, 'antes' => $viejo[$v]['valor'], 'despues' => $nuevo[$v]['valor']];
            }
            if ($viejo[$v]['estado'] === 'confirmed' && $nuevo[$v]['estado'] !== 'confirmed') {
                $degradadas[] = ['variable' => $v, 'antes' => $viejo[$v]['estado'], 'despues' => $nuevo[$v]['estado']];
            }
        }
        return [
            'definiciones' => $definiciones,
            'variables' => [
                'agregadas' => array_values($agregadas),
                'quitadas' => array_map(static function (string $v) use ($viejo): array {
                    return ['variable' => $v, 'definicion' => $viejo[$v]['definicion']];
                }, array_values($quitadas)),
                'renombradas' => $renombradas,
                'cambiadas' => $cambiadas,
                'degradadas' => $degradadas,
            ],
        ];
    }

    // ------------------------------------------------------------------
    // apply
    // ------------------------------------------------------------------

    private static function punto(string $nombre): void
    {
        do_action('cod_adn_import_punto', $nombre);
    }

    /**
     * Aplica un ADN. Atómico: o queda activa la revisión nueva ENTERA o sigue la anterior.
     *
     * @param mixed $modelo
     * @param array{emitirPropuestas?: bool, expectedCurrentRevision?: int|null, previewId?: string, permitirRuptura?: bool, fuente?: string} $opciones
     * @return array<string, mixed>|WP_Error
     */
    public static function aplicar($modelo, array $opciones = [])
    {
        $emitir = !empty($opciones['emitirPropuestas']);
        $previa = self::previsualizar($modelo, $opciones);
        if (!$previa['ok']) {
            return self::a_wp_error($previa['errores'][0] ?? self::error('ADN_INVALID', 'El ADN no se pudo validar.'), $previa);
        }
        $pedido = (string) ($opciones['previewId'] ?? '');
        if ($pedido === '' || !hash_equals($previa['previewId'], $pedido)) {
            return self::a_wp_error(self::error('ADN_PREVIEW_MISMATCH', 'El previewId no corresponde a este ADN y a esta base. Vuelve a llamar a cod_adn_preview_import y aplica con el previewId que devuelva.', ['previewId' => $previa['previewId']]), $previa);
        }
        if ($previa['estado'] === 'unchanged') {
            return self::respuesta($previa, 'unchanged');
        }
        $permitir = !empty($opciones['permitirRuptura']) && !COD_ADN_Gate::en_mcp();
        if ($previa['rompe'] !== [] && !$permitir) {
            return self::a_wp_error(self::error('ADN_REF_BROKEN', 'Esta revisión quita, renombra o degrada variables que el sitio está usando. Nada se aplicó.', ['rompe' => $previa['rompe']]), $previa);
        }

        $bloqueo = COD_ADN_Lock::exclusivo();
        if (is_wp_error($bloqueo)) {
            return $bloqueo;
        }
        $creado = ['post' => 0, 'proyeccion' => ''];
        try {
            self::punto('dentro-del-bloqueo');
            // Con el bloqueo exclusivo ya no hay escrituras en curso: se vuelve a mirar TODO.
            $otra = self::previsualizar($modelo, $opciones);
            if (!$otra['ok']) {
                return self::a_wp_error($otra['errores'][0], $otra);
            }
            if (!hash_equals($otra['previewId'], $pedido)) {
                return self::a_wp_error(self::error('ADN_STALE_BASE', 'La revisión activa cambió mientras se preparaba el import. Vuelve a previsualizar.', ['activa' => self::revision_activa()]), $otra);
            }
            if ($otra['rompe'] !== [] && !$permitir) {
                return self::a_wp_error(self::error('ADN_REF_BROKEN', 'Mientras se esperaba el bloqueo, una página empezó a usar una variable que esta revisión quita. Nada se aplicó.', ['rompe' => $otra['rompe']]), $otra);
            }

            $validacion = COD_ADN_Validator::validar(self::normalizar_modelo($modelo), ['emitirPropuestas' => $emitir]);
            /** @var stdClass $contrato */
            $contrato = $validacion['contrato'];
            $proyeccion = COD_ADN_Projection::construir($contrato, $validacion);
            if (is_wp_error($proyeccion)) {
                return $proyeccion;
            }
            $proyeccion['definiciones'] = $validacion['definiciones'];
            $proyeccion['emitirPropuestas'] = $emitir;
            $proyeccion['importadoEn'] = gmdate('c');

            $design_id = (string) $contrato->design->id;
            $revision = (int) $contrato->design->revision;
            $canonico = COD_ADN_Validator::json_canonico($contrato);

            // 1. El registro de la revisión (invisible: nadie lo lee).
            $fuente = in_array($opciones['fuente'] ?? 'upload', self::FUENTES, true) ? (string) ($opciones['fuente'] ?? 'upload') : 'upload';
            $usuario = function_exists('wp_get_current_user') && wp_get_current_user()->exists() ? wp_get_current_user()->user_login : 'cli';
            $post_id = self::escribir_post($design_id, $revision, $canonico, $validacion['digest'], $fuente, $usuario);
            if (is_wp_error($post_id)) {
                return $post_id;
            }
            $creado['post'] = $post_id;
            self::punto('tras-cpt');

            // 2. La proyección de la revisión (invisible: nadie la lee).
            $clave = self::PREFIJO_PROYECCION . $revision;
            update_option($clave, $proyeccion, false);
            $creado['proyeccion'] = $clave;
            self::punto('tras-proyeccion');

            // 3. El puntero: la ÚNICA escritura que cambia lo visible.
            self::punto('antes-del-puntero');
            $puntero = [
                'designId' => $design_id,
                'revision' => $revision,
                'digest' => $validacion['digest'],
                'postId' => $post_id,
                'importadoEn' => $proyeccion['importadoEn'],
                'emitirPropuestas' => $emitir,
                'fuente' => $fuente,
            ];
            update_option(self::OPCION_PUNTERO, $puntero, true);
            $leido = self::puntero();
            if ($leido === null || (int) $leido['revision'] !== $revision || (string) $leido['digest'] !== $validacion['digest']) {
                throw new RuntimeException('El puntero no quedó como se escribió.');
            }
        } catch (Throwable $e) {
            self::deshacer($creado);
            return new WP_Error('ADN_IMPORT_FAILED', 'El import falló y no se aplicó nada: ' . $e->getMessage() . ' Lo visible sigue siendo la revisión anterior.', ['revisionActiva' => self::revision_activa()]);
        } finally {
            COD_ADN_Lock::soltar_exclusivo($bloqueo);
        }
        do_action('cod_adn_activada', self::puntero(), $proyeccion);
        return self::respuesta($previa, 'aplicado', ['revisionActiva' => $revision, 'postId' => $creado['post']]);
    }

    /** @param array{post: int, proyeccion: string} $creado */
    private static function deshacer(array $creado): void
    {
        if ($creado['proyeccion'] !== '') {
            delete_option($creado['proyeccion']);
        }
        if ($creado['post'] > 0) {
            wp_delete_post($creado['post'], true);
        }
    }

    /** @return int|WP_Error */
    private static function escribir_post(string $design_id, int $revision, string $canonico, string $digest, string $fuente, string $usuario)
    {
        // kses desfiguraría el JSON (quita lo que parece una etiqueta dentro de un texto): se apaga sólo aquí.
        $kses = function_exists('kses_remove_filters') && has_filter('content_save_pre', 'wp_filter_post_kses');
        if ($kses) {
            kses_remove_filters();
        }
        try {
            $id = wp_insert_post([
                'post_type' => self::POST_TYPE,
                'post_status' => 'publish',
                'post_name' => $design_id . '-r' . $revision,
                'post_title' => 'ADN ' . $design_id . ' r' . $revision,
                'post_content' => wp_slash($canonico),
            ], true);
        } finally {
            if ($kses) {
                kses_init_filters();
            }
        }
        if (is_wp_error($id)) {
            return $id;
        }
        $id = (int) $id;
        update_post_meta($id, self::META_DIGEST, $digest);
        update_post_meta($id, self::META_FUENTE, $fuente);
        update_post_meta($id, self::META_IMPORTADO_POR, $usuario);
        update_post_meta($id, self::META_REVISION, $revision);
        update_post_meta($id, self::META_DESIGN_ID, $design_id);
        $guardado = (string) get_post_field('post_content', $id, 'raw');
        if (!hash_equals(hash('sha256', $canonico), hash('sha256', $guardado))) {
            wp_delete_post($id, true);
            return new WP_Error('ADN_STORE_MISMATCH', 'Lo que quedó guardado no coincide con lo que se escribió; se descartó la revisión.');
        }
        return $id;
    }

    /** @param array<string, mixed> $previa */
    private static function respuesta(array $previa, string $resultado, array $extra = []): array
    {
        return [
            'resultado' => $resultado,
            'designId' => $previa['designId'],
            'revision' => $previa['revisionNueva'],
            'digest' => $previa['digest'],
            'estado' => $previa['estado'],
            'ignoradas' => $previa['ignoradas'],
            'avisos' => $previa['avisos'],
            'diff' => $previa['diff'],
            'rompe' => $previa['rompe'],
        ] + $extra;
    }

    /** @param array<string, mixed> $error @param array<string, mixed> $previa */
    private static function a_wp_error(array $error, array $previa): WP_Error
    {
        $detalles = $error;
        unset($detalles['codigo'], $detalles['mensaje']);
        $e = new WP_Error((string) $error['codigo'], (string) $error['mensaje']);
        $e->add_data($detalles + ['errores' => $previa['errores']]);
        return $e;
    }

    // ------------------------------------------------------------------
    // cod_adn_get
    // ------------------------------------------------------------------

    /**
     * @param array<int, string> $incluir definiciones | registro | auditoria
     * @return array<string, mixed>
     */
    public static function resumen(array $incluir = []): array
    {
        $p = self::puntero();
        if ($p === null) {
            return [
                'activo' => false, 'designId' => null, 'revision' => 0, 'digest' => null, 'modo' => COD_ADN_Gate::modo(),
                'fuente' => null, 'importadoEn' => null,
                'conteos' => ['confirmed' => 0, 'proposed' => 0, 'observed' => 0, 'rejected' => 0, 'emitidas' => 0, 'sinResolver' => 0],
                'proyeccion' => ['themeJson' => 'ausente', 'themeDefinitions' => 'sin-adn'],
                'ignoradas' => [],
            ];
        }
        $proy = self::proyeccion((int) $p['revision']);
        $contrato = self::contrato_de_revision((string) $p['designId'], (int) $p['revision']);
        $conteos = ['confirmed' => 0, 'proposed' => 0, 'observed' => 0, 'rejected' => 0, 'emitidas' => 0, 'sinResolver' => 0];
        foreach ($contrato->definitions ?? [] as $d) {
            ++$conteos[$d->state];
        }
        foreach ($proy['definiciones'] ?? [] as $ficha) {
            if (!empty($ficha['emitida'])) {
                ++$conteos['emitidas'];
            }
            if (($ficha['ignorada'] ?? null) === 'R2-sin-resolver') {
                ++$conteos['sinResolver'];
            }
        }
        $r = [
            'activo' => true,
            'designId' => $p['designId'],
            'revision' => (int) $p['revision'],
            'digest' => $p['digest'],
            'modo' => COD_ADN_Gate::modo(),
            'fuente' => $p['fuente'] ?? null,
            'importadoEn' => $p['importadoEn'] ?? null,
            'emitirPropuestas' => !empty($p['emitirPropuestas']),
            'conteos' => $conteos,
            'proyeccion' => [
                'themeJson' => self::estado_del_theme_json((string) $p['digest']),
                // cod_theme_definitions es una proyección derivada: los campos gobernados se leen por el puntero.
                'themeDefinitions' => 'derivada',
                'camposGobernados' => array_keys(COD_Theme_Definitions::gobernados()),
                'variables' => count($proy['registro'] ?? []),
                'fueraDelAdn' => array_keys(COD_ADN_Theme::fuera_del_adn()),
            ],
            'ignoradas' => $proy['ignoradas'] ?? [],
        ];
        if ($proy === null) {
            $r['advertencia'] = 'El puntero apunta a una proyección que no está en la base.';
        }
        if (in_array('definiciones', $incluir, true)) {
            $r['definiciones'] = $proy['definiciones'] ?? [];
        }
        if (in_array('registro', $incluir, true)) {
            $r['registro'] = $proy['registro'] ?? [];
        }
        if (in_array('auditoria', $incluir, true)) {
            $r['auditoria'] = ['disponible' => false, 'nota' => 'cod_adn_audit llega en F3.'];
        }
        return $r;
    }

    /** sincronizado | adelantado | ausente, según el `digest` que lleve el theme.json del tema. */
    private static function estado_del_theme_json(string $digest): string
    {
        return COD_ADN_Theme::estado_del_archivo();
    }
}
