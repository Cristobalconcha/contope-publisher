<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Lo que se DERIVA del ADN: el registro de variables, el fragmento de theme.json y los
 * valores del almacén plano (ESPEC 3.6). Es una función pura del contrato validado y de
 * las decisiones de la validación (qué definiciones se emiten); no escribe nada.
 *
 * Se construye y se guarda al importar (cod_adn_proj_r<N>). Desde F2 lo LEEN, por el puntero
 * (COD_ADN_Store::proyeccion_vigente()): el filtro de theme.json (COD_ADN_Theme),
 * COD_Design_Core y COD_Theme_Definitions::get() (la opción `cod_theme_definitions` es una
 * proyección derivada). Sin ADN activo nadie lo lee y el sitio queda como estaba.
 *
 * MAPEOS FIJADOS EN F2 (ESPEC 3.6):
 *   - Rol de color Core -> variable del plugin: background -> --cod-color-surface, text ->
 *     --cod-color-ink, accent -> --cod-color-accent, surface (la superficie de tarjeta del Core) ->
 *     --cod-color-primary (así lo llama el plugin: color_primary), y cualquier otro rol (border,
 *     action, info, success, warning, error, active, inactive, focus) -> --cod-color-<rol>.
 *   - Forma: la variable es --wp--custom--radius--<nombre>; el nombre sale de resolver el `rol` (una
 *     referencia genérica a cualquier requisito del contrato) hasta un texto; si no llega a un texto
 *     se usa el último segmento de la ruta si es un nombre (no un índice) y si no, `forma-<n>`.
 *     `pill` vale 9999px, `circle` 50%, `none` 0 y `longitud` su `radioValor` (sin él, se omite y
 *     se avisa: ADN_RADIO_SIN_VALOR).
 *   - Tipografía: cada rol (los nueve del Core y los que el dueño agregue, Q1(a)) es un tamaño de
 *     letra `--wp--preset--font-size--<slug del rol>`, siempre con `fluid:false` (el ADN declara
 *     longitudes exactas; WordPress no debe derivar un tamaño fluido) y sin los tamaños de fábrica.
 *   - Ancho de caja (dim3.req05): el contenedor `contenido` es settings.layout.contentSize y el rol
 *     Core `measure` (--cod-layout-max-width); el contenedor `amplio` es wideSize.
 *   - Movimiento Core (dim8.req04): el movimiento cuyo `caso` se llama `enter`/`aparecer` es
 *     --cod-motion-enter y `response`/`responder`, --cod-motion-response, con la forma
 *     "<duración>ms <curva>" que ya usaba Configuración.
 *
 * Los nombres de variable son deterministas (slug del `name`, sin acentos, sólo
 * [a-z0-9-]). R3: dos nombres que dan el mismo slug en una misma clase se desambiguan con
 * -2, -3… y se avisa; nunca se pisa uno con otro.
 *
 * SLOT: dos definiciones emitidas del mismo requisito compiten; gana la de mayor autoridad
 * (human-confirmed > approved-guideline > deterministic-extraction > model-proposal) y un
 * empate es ADN_SLOT_CONFLICT, sin elegir (3.5).
 */
final class COD_ADN_Projection
{
    private const AUTORIDAD = ['human-confirmed' => 4, 'approved-guideline' => 3, 'deterministic-extraction' => 2, 'model-proposal' => 1];
    private const ALIAS_ROL_COLOR = ['background' => 'surface', 'text' => 'ink', 'accent' => 'accent', 'surface' => 'primary'];
    private const CASO_MOVIMIENTO = ['enter' => 'enter', 'aparecer' => 'enter', 'response' => 'response', 'responder' => 'response'];
    private const ROL_ESPACIO = ['intraelemento' => 'intra', 'interelemento' => 'inter', 'entre-secciones' => 'entre-secciones'];

    /** Normaliza un nombre a [a-z0-9-]. */
    public static function slug(string $nombre): string
    {
        $s = mb_strtolower($nombre, 'UTF-8');
        $s = strtr($s, [
            'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'ã' => 'a', 'å' => 'a', 'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
            'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i', 'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o', 'õ' => 'o',
            'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u', 'ñ' => 'n', 'ç' => 'c', 'ß' => 'ss', '_' => '-',
        ]);
        $s = trim((string) preg_replace('/[^a-z0-9]+/', '-', $s), '-');
        return $s === '' ? 'x' : $s;
    }

    /**
     * @param array<string, array<string, bool>> $usados
     */
    private static function slug_unico(string $nombre, string $clase, array &$usados, array &$avisos): string
    {
        $base = self::slug($nombre);
        $slug = $base;
        $n = 2;
        while (isset($usados[$clase][$slug])) {
            $slug = $base . '-' . $n++;
        }
        if ($slug !== $base) {
            $avisos[] = ['codigo' => 'ADN_SLUG_COLLISION', 'mensaje' => 'El nombre "' . $nombre . '" da el mismo slug que otro de la clase ' . $clase . '; quedó como "' . $slug . '".', 'clase' => $clase, 'slug' => $slug];
        }
        $usados[$clase][$slug] = true;
        return $slug;
    }

    /** Recorre una ruta (`refPath`) dentro de un valor; null si no llega. @param array<int, string|int|float> $ruta @return mixed */
    public static function navegar($raiz, array $ruta)
    {
        $actual = $raiz;
        foreach ($ruta as $seg) {
            if (is_string($seg) && $actual instanceof stdClass && property_exists($actual, $seg)) {
                $actual = $actual->{$seg};
            } elseif (!is_string($seg) && is_array($actual) && isset($actual[(int) $seg])) {
                $actual = $actual[(int) $seg];
            } else {
                return null;
            }
        }
        return $actual;
    }

    /** El nombre de la primera familia de una pila (sin comillas): lo que Configuración guarda como "Tipografía de títulos". @param array<int, mixed> $pila */
    public static function primera_familia(array $pila): string
    {
        $primera = $pila === [] ? '' : trim((string) $pila[0]);
        return trim((string) preg_replace('/^["\']|["\']$/', '', $primera));
    }

    /**
     * El nombre que una referencia GENÉRICA (a cualquier requisito del contrato, no sólo a los que se
     * proyectan) da a una variable: se navega la ruta hasta un texto; si no llega, el último segmento si es
     * un nombre y no un índice o una palabra de estructura; si no, null (quien llama pone `forma-<n>`).
     *
     * @param mixed $ref
     */
    public static function nombre_de_ref(stdClass $contrato, $ref): ?string
    {
        if (!COD_ADN_Requisitos::es_ref($ref)) {
            return is_string($ref) && trim($ref) !== '' ? $ref : null;
        }
        foreach ($contrato->definitions as $d) {
            if (COD_ADN_Requisitos::requisito_de((string) $d->id) !== (string) $ref->refReqId || !($d->value ?? null) instanceof stdClass) {
                continue;
            }
            $alcanzado = self::navegar($d->value, $ref->refPath);
            if (is_string($alcanzado) && trim($alcanzado) !== '') {
                return $alcanzado;
            }
        }
        $ultimo = $ref->refPath === [] ? null : end($ref->refPath);
        if (is_string($ultimo) && !in_array($ultimo, ['nombre', 'name', 'value', 'rol', 'role', 'roles'], true)) {
            return $ultimo;
        }
        return null;
    }

    /**
     * @param stdClass $contrato contrato normalizado
     * @param array<string, mixed> $validacion lo que devolvió COD_ADN_Validator::validar()
     * @return array<string, mixed>|WP_Error
     */
    public static function construir(stdClass $contrato, array $validacion)
    {
        // --- las definiciones que ganan cada requisito ---
        $candidatas = [];
        foreach ($contrato->definitions as $d) {
            $ficha = $validacion['definiciones'][(string) $d->id] ?? null;
            $req = COD_ADN_Requisitos::requisito_de((string) $d->id);
            if ($ficha !== null && $ficha['emitida'] && COD_ADN_Requisitos::es_proyectado($req)) {
                $candidatas[(string) $req][] = ['def' => $d, 'estado' => $ficha['estadoEfectivo']];
            }
        }
        $ganadoras = [];
        $avisos = [];
        foreach ($candidatas as $req => $lista) {
            usort($lista, static function (array $a, array $b): int {
                return (self::AUTORIDAD[$b['def']->authority] ?? 0) <=> (self::AUTORIDAD[$a['def']->authority] ?? 0);
            });
            if (count($lista) > 1 && (self::AUTORIDAD[$lista[0]['def']->authority] ?? 0) === (self::AUTORIDAD[$lista[1]['def']->authority] ?? 0)) {
                $error = new WP_Error('ADN_SLOT_CONFLICT', 'Dos definiciones de ' . $req . ' compiten con la misma autoridad: ' . $lista[0]['def']->id . ' y ' . $lista[1]['def']->id . '. No se elige entre ellas.');
                $error->add_data(['requisito' => $req, 'definiciones' => [(string) $lista[0]['def']->id, (string) $lista[1]['def']->id]]);
                return $error;
            }
            $ganadoras[$req] = $lista[0];
            foreach (array_slice($lista, 1) as $perdedora) {
                $avisos[] = ['codigo' => 'ADN_SLOT_LOST', 'mensaje' => 'La definición ' . $perdedora['def']->id . ' pierde frente a ' . $lista[0]['def']->id . ' (mayor autoridad).', 'requisito' => $req];
            }
        }

        $registro = [];
        $usados = [];
        $tema = ['settings' => []];
        $plano = [];
        $agregar = static function (string $variable, string $clase, string $valor, string $req, string $ruta) use (&$registro, &$ganadoras): void {
            $g = $ganadoras[$req];
            $registro[$variable] = [
                'definicion' => (string) $g['def']->id,
                'requisito' => $req,
                'ruta' => $ruta,
                'clase' => $clase,
                'valor' => $valor,
                'estado' => $g['estado'],
            ];
        };
        $valor_de = static function (string $req) use ($ganadoras): ?stdClass {
            $v = isset($ganadoras[$req]) ? ($ganadoras[$req]['def']->value ?? null) : null;
            return $v instanceof stdClass ? $v : null;
        };

        // --- color (dim1.req01) ---
        $slug_color = [];
        $hex_de = [];
        if (($v = $valor_de('dim1.req01')) !== null) {
            $paleta = [];
            foreach (['institucionales', 'neutros'] as $lista) {
                foreach ($v->{$lista} as $i => $c) {
                    $slug = self::slug_unico((string) $c->name, 'color', $usados, $avisos);
                    $slug_color[$lista . ':' . $i] = $slug;
                    $hex_de[$lista . ':' . $i] = (string) $c->value;
                    $agregar('--wp--preset--color--' . $slug, 'color', (string) $c->value, 'dim1.req01', $lista . '[' . $i . '].value');
                    $paleta[] = ['slug' => $slug, 'name' => (string) $c->name, 'color' => (string) $c->value];
                }
            }
            $tema['settings']['color']['palette'] = $paleta;
        }

        /**
         * Resuelve un ref de color/familia/espacio. Devuelve [referencia, literal]: la referencia es
         * `var(--…)` si apunta a un elemento emitido (lo que va al registro y al theme.json) y el
         * literal es el valor final (lo que va al almacén plano, que guarda valores y no referencias).
         *
         * @return array{0: string, 1: string}|null
         */
        $resolver = static function ($valor, string $req_destino, array $mapa_slug, string $prefijo, array $mapa_literal) use ($valor_de) {
            if (!COD_ADN_Requisitos::es_ref($valor)) {
                return is_string($valor) ? [$valor, $valor] : null;
            }
            $raiz = $valor_de($req_destino);
            if ($raiz === null) {
                return null;
            }
            $ruta = $valor->refPath;
            if (count($ruta) >= 2 && is_string($ruta[0])) {
                $clave = $ruta[0] . ':' . $ruta[1];
                if (isset($mapa_slug[$clave])) {
                    return ['var(' . $prefijo . $mapa_slug[$clave] . ')', (string) ($mapa_literal[$clave] ?? '')];
                }
            }
            $actual = self::navegar($raiz, $ruta);
            return is_string($actual) ? [$actual, $actual] : null;
        };

        // --- roles de color (dim1.req02) ---
        if (($v = $valor_de('dim1.req02')) !== null) {
            $roles = [];
            foreach ($v->roleColors as $i => $rc) {
                $color = $resolver($rc->color, 'dim1.req01', $slug_color, '--wp--preset--color--', $hex_de);
                if ($color === null) {
                    continue;
                }
                $alias = self::ALIAS_ROL_COLOR[$rc->role] ?? $rc->role;
                $agregar('--cod-color-' . $alias, 'color', $color[0], 'dim1.req02', 'roleColors[' . $i . '].color');
                $roles[$rc->role] = $color;
            }
            foreach (['background' => 'color_bg', 'text' => 'color_text', 'surface' => 'color_primary', 'accent' => 'color_accent'] as $rol => $campo) {
                if (isset($roles[$rol]) && $roles[$rol][1] !== '') {
                    $plano[$campo] = $roles[$rol][1];
                }
            }
            // Lo que el tema pinta con esos roles (ESPEC 3.6): fondo y texto de la página, enlaces y botones.
            if (isset($roles['background'])) {
                $tema['styles']['color']['background'] = $roles['background'][0];
            }
            if (isset($roles['text'])) {
                $tema['styles']['color']['text'] = $roles['text'][0];
            }
            if (isset($roles['accent'])) {
                $tema['styles']['elements']['link']['color']['text'] = $roles['accent'][0];
                $tema['styles']['elements']['button']['color']['background'] = $roles['accent'][0];
            }
        }

        // --- familias (dim2.req01) ---
        $slug_familia = [];
        $pila_de = [];
        $nombre_de = [];
        if (($v = $valor_de('dim2.req01')) !== null) {
            $familias = [];
            foreach ($v->familias as $i => $f) {
                $slug = self::slug_unico((string) $f->name, 'familia', $usados, $avisos);
                $slug_familia['familias:' . $i] = $slug;
                $pila = implode(', ', array_map('strval', $f->stack));
                $pila_de['familias:' . $i] = $pila;
                $nombre_de['familias:' . $i] = self::primera_familia($f->stack);
                $agregar('--wp--preset--font-family--' . $slug, 'familia', $pila, 'dim2.req01', 'familias[' . $i . ']');
                $familias[] = ['slug' => $slug, 'name' => (string) $f->name, 'fontFamily' => $pila];
            }
            $tema['settings']['typography']['fontFamilies'] = $familias;
        }

        // --- roles tipográficos (dim2.req02) ---
        $estilos_de_rol = [];
        if (($v = $valor_de('dim2.req02')) !== null) {
            $tamanos = [];
            foreach ($v->roleStyles as $i => $r) {
                $rol = self::slug_unico((string) $r->role, 'tamano', $usados, $avisos);
                $familia = $resolver($r->family, 'dim2.req01', $slug_familia, '--wp--preset--font-family--', $nombre_de);
                $estilos_de_rol[(string) $r->role] = ['familia' => $familia, 'size' => (string) $r->fontSize, 'slug' => $rol, 'ruta' => 'roleStyles[' . $i . ']'];
                $agregar('--wp--preset--font-size--' . $rol, 'tamano', (string) $r->fontSize, 'dim2.req02', 'roleStyles[' . $i . '].fontSize');
                $agregar('--wp--custom--typography--' . $rol . '--weight', 'tipografia-fina', COD_ADN_Js::numero_a_texto($r->fontWeight), 'dim2.req02', 'roleStyles[' . $i . '].fontWeight');
                $agregar('--wp--custom--typography--' . $rol . '--line-height', 'tipografia-fina', COD_ADN_Js::numero_a_texto($r->lineHeight), 'dim2.req02', 'roleStyles[' . $i . '].lineHeight');
                if (property_exists($r, 'letterSpacing')) {
                    $agregar('--wp--custom--typography--' . $rol . '--letter-spacing', 'tipografia-fina', (string) $r->letterSpacing, 'dim2.req02', 'roleStyles[' . $i . '].letterSpacing');
                }
                $tamanos[] = ['slug' => $rol, 'name' => (string) $r->role, 'size' => (string) $r->fontSize, 'fluid' => false];
                $tema['settings']['custom']['typography'][$rol] = [
                    'weight' => COD_ADN_Js::numero_a_texto($r->fontWeight),
                    'line-height' => COD_ADN_Js::numero_a_texto($r->lineHeight),
                ] + (property_exists($r, 'letterSpacing') ? ['letter-spacing' => (string) $r->letterSpacing] : []);
            }
            $tema['settings']['typography']['fontSizes'] = $tamanos;
            $tema['settings']['typography']['defaultFontSizes'] = false;
        }

        // --- correspondencia con el almacén plano (dim2.req07) ---
        if (($v = $valor_de('dim2.req07')) !== null) {
            foreach ($v->correspondencias as $c) {
                $rol_nombre = null;
                $valor_rol = $valor_de('dim2.req02');
                if ($valor_rol !== null && COD_ADN_Requisitos::es_ref($c->role) && count($c->role->refPath) >= 2 && $c->role->refPath[0] === 'roleStyles') {
                    $item = $valor_rol->roleStyles[(int) $c->role->refPath[1]] ?? null;
                    $rol_nombre = $item instanceof stdClass ? (string) $item->role : null;
                }
                if ($rol_nombre === null || !isset($estilos_de_rol[$rol_nombre])) {
                    continue;
                }
                $campo = (string) $c->campoPlano;
                $estilo = $estilos_de_rol[$rol_nombre];
                if (strpos($campo, 'font_') === 0 && $estilo['familia'] !== null) {
                    // El almacén plano guarda el NOMBRE de la familia (así lo cita Configuración); el registro, la referencia.
                    $plano[$campo] = $estilo['familia'][1];
                    $agregar('--cod-font-' . substr($campo, 5), 'familia', $estilo['familia'][0], 'dim2.req07', 'correspondencias[' . $c->campoPlano . ']');
                    if ($campo === 'font_body') {
                        $tema['styles']['typography']['fontFamily'] = $estilo['familia'][0];
                    } elseif ($campo === 'font_heading') {
                        $tema['styles']['elements']['heading']['typography']['fontFamily'] = $estilo['familia'][0];
                    }
                } elseif (strpos($campo, '_size') !== false) {
                    // Los campos de tamaño de Configuración son números de píxeles; un tamaño en otra unidad no cabe.
                    if (preg_match('/^(\d+(?:\.\d+)?)px$/D', $estilo['size'], $m) === 1) {
                        $plano[$campo] = $m[1];
                        $token = '--cod-' . str_replace('_', '-', $campo);
                        $agregar($token, 'tamano', 'var(--wp--preset--font-size--' . $estilo['slug'] . ')', 'dim2.req07', 'correspondencias[' . $c->campoPlano . ']');
                    } else {
                        $avisos[] = ['codigo' => 'ADN_PLANO_UNIDAD', 'mensaje' => 'El campo ' . $campo . ' de Configuración sólo admite píxeles y el rol vale "' . $estilo['size'] . '"; no se proyectó.', 'campo' => $campo];
                    }
                }
            }
        }

        // --- espacio (dim3.req01 y dim3.req02) ---
        $slug_espacio = [];
        $literal_espacio = [];
        if (($v = $valor_de('dim3.req01')) !== null) {
            $tamanos = [];
            foreach ($v->escala as $i => $e) {
                $slug = self::slug_unico(str_replace('.', '-', COD_ADN_Js::numero_a_texto($e->step)), 'espacio', $usados, $avisos);
                $slug_espacio['escala:' . $i] = $slug;
                $literal_espacio['escala:' . $i] = (string) $e->value;
                $agregar('--wp--preset--spacing--' . $slug, 'espaciado', (string) $e->value, 'dim3.req01', 'escala[' . $i . '].value');
                $tamanos[] = ['slug' => $slug, 'name' => (string) $e->step, 'size' => (string) $e->value];
            }
            $tema['settings']['spacing']['spacingSizes'] = $tamanos;
            $tema['settings']['spacing']['defaultSpacingSizes'] = false;
        }
        if (($v = $valor_de('dim3.req02')) !== null) {
            foreach ($v->roleSpacing as $i => $rs) {
                $valor = $resolver($rs->value, 'dim3.req01', $slug_espacio, '--wp--preset--spacing--', $literal_espacio);
                if ($valor === null) {
                    continue;
                }
                $nombre = self::ROL_ESPACIO[$rs->role] ?? self::slug((string) $rs->role);
                $agregar('--wp--custom--spacing--' . $nombre, 'espaciado', $valor[0], 'dim3.req02', 'roleSpacing[' . $i . '].value');
                $tema['settings']['custom']['spacing'][$nombre] = $valor[0];
            }
        }

        // --- ancho de caja (dim3.req05) ---
        if (($v = $valor_de('dim3.req05')) !== null) {
            foreach ($v->contenedores as $i => $c) {
                $nombre = self::slug((string) $c->nombre);
                $ancho = (string) $c->maxWidth;
                if ($nombre === 'contenido') {
                    $agregar('--wp--style--global--content-size', 'ancho-de-caja', $ancho, 'dim3.req05', 'contenedores[' . $i . '].maxWidth');
                    $agregar('--cod-layout-max-width', 'ancho-de-caja', $ancho, 'dim3.req05', 'contenedores[' . $i . '].maxWidth');
                    $tema['settings']['layout']['contentSize'] = $ancho;
                    if (preg_match('/^(\d+(?:\.\d+)?)px$/D', $ancho, $m) === 1) {
                        $plano['layout_max_width'] = $m[1];
                    }
                } elseif ($nombre === 'amplio') {
                    $agregar('--wp--style--global--wide-size', 'ancho-de-caja', $ancho, 'dim3.req05', 'contenedores[' . $i . '].maxWidth');
                    $tema['settings']['layout']['wideSize'] = $ancho;
                } else {
                    $slug = self::slug_unico($nombre, 'contenedor', $usados, $avisos);
                    $agregar('--wp--custom--layout--contenedor--' . $slug, 'ancho-de-caja', $ancho, 'dim3.req05', 'contenedores[' . $i . '].maxWidth');
                    $tema['settings']['custom']['layout']['contenedor'][$slug] = $ancho;
                }
            }
        }

        // --- formas (dim4.req02) ---
        if (($v = $valor_de('dim4.req02')) !== null) {
            foreach ($v->formas as $i => $f) {
                $nombre = self::nombre_de_ref($contrato, $f->rol);
                $slug = self::slug_unico($nombre !== null && $nombre !== '' ? $nombre : 'forma-' . $i, 'radio', $usados, $avisos);
                switch ($f->radio) {
                    case 'longitud':
                        $valor = property_exists($f, 'radioValor') ? (string) $f->radioValor : null;
                        break;
                    case 'none':
                        $valor = '0';
                        break;
                    case 'pill':
                        $valor = '9999px';
                        break;
                    default:
                        $valor = '50%';
                }
                if ($valor === null) {
                    $avisos[] = ['codigo' => 'ADN_RADIO_SIN_VALOR', 'mensaje' => 'La forma "' . $slug . '" declara radio "longitud" sin radioValor; no se proyectó.', 'forma' => $slug];
                    continue;
                }
                $agregar('--wp--custom--radius--' . $slug, 'radio', $valor, 'dim4.req02', 'formas[' . $i . ']');
                $tema['settings']['custom']['radius'][$slug] = $valor;
            }
        }

        // --- movimiento (dim8.req03) ---
        if (($v = $valor_de('dim8.req03')) !== null) {
            foreach ($v->escala as $i => $e) {
                $slug = self::slug_unico((string) $e->nombre, 'movimiento', $usados, $avisos);
                $valor = COD_ADN_Js::numero_a_texto($e->duracion) . 'ms';
                $agregar('--wp--custom--motion--' . $slug, 'movimiento', $valor, 'dim8.req03', 'escala[' . $i . ']');
                $tema['settings']['custom']['motion'][$slug] = $valor;
            }
        }

        // --- movimientos con su curva (dim8.req04) ---
        if (($v = $valor_de('dim8.req04')) !== null) {
            $escala = $valor_de('dim8.req03');
            foreach ($v->movimientos as $i => $m) {
                $ms = null;
                if (property_exists($m, 'duracionMs') && COD_ADN_Js::es_numero_finito($m->duracionMs)) {
                    $ms = $m->duracionMs;
                } elseif (property_exists($m, 'tiempo') && $escala !== null) {
                    $alcanzado = self::navegar($escala, $m->tiempo->refPath ?? []);
                    $ms = COD_ADN_Js::es_numero_finito($alcanzado) ? $alcanzado : null;
                }
                if ($ms === null) {
                    $avisos[] = ['codigo' => 'ADN_MOVIMIENTO_SIN_TIEMPO', 'mensaje' => 'El movimiento "' . $m->caso . '" no llega a una duración; no se proyectó.', 'caso' => (string) $m->caso];
                    continue;
                }
                $valor = COD_ADN_Js::numero_a_texto($ms) . 'ms ' . COD_ADN_Js::trim((string) $m->curva);
                $slug = self::slug_unico((string) $m->caso, 'movimiento-caso', $usados, $avisos);
                $agregar('--wp--custom--motion--caso-' . $slug, 'movimiento', $valor, 'dim8.req04', 'movimientos[' . $i . ']');
                $tema['settings']['custom']['motion']['caso-' . $slug] = $valor;
                $rol_core = self::CASO_MOVIMIENTO[$slug] ?? null;
                if ($rol_core !== null) {
                    $agregar('--cod-motion-' . $rol_core, 'movimiento', $valor, 'dim8.req04', 'movimientos[' . $i . ']');
                    $plano['motion_' . $rol_core] = $valor;
                }
            }
        }

        $tema['settings']['custom']['adn'] = [
            'designId' => (string) $contrato->design->id,
            'revision' => (int) $contrato->design->revision,
            'digest' => (string) ($validacion['digest'] ?? ''),
        ];
        ksort($registro);

        return [
            'designId' => (string) $contrato->design->id,
            'revision' => (int) $contrato->design->revision,
            'digest' => (string) ($validacion['digest'] ?? ''),
            'registro' => $registro,
            'themeJson' => ['version' => 3] + $tema,
            'plano' => $plano,
            'avisos' => $avisos,
            'ignoradas' => $validacion['ignoradas'] ?? [],
        ];
    }
}
