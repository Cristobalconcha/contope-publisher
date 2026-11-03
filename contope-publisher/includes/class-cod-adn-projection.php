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
 *   - Tipografía: cada rol (los nueve del Core y los que el dueño agregue, Q1) es un tamaño de
 *     letra `--wp--preset--font-size--<slug del rol>`, siempre con `fluid:false` (el ADN declara
 *     longitudes exactas; WordPress no debe derivar un tamaño fluido) y sin los tamaños de fábrica.
 *     El peso, el interlineado y el espaciado de letra de UN rol (dim2.req02) se guardan en el contrato pero NO se
 *     emiten: la web toma pesos e interlineados de las escalas con nombre (dim2.req09).
 *   - Lo que el Core agregó el 02-nov-2026 (pedidos Q1, Q3 y Q4; contrato en docs/PEDIDOS-AL-CORE.md del Core) sale
 *     con la forma que ese documento sugiere y con las MISMAS claves que usa el theme.json de Basis:
 *       dim1.req15 transparencias  -> settings.color.palette  (color-mix(in srgb, var(--wp--preset--color--<base>) N%, transparent))
 *       dim1.req16 degradados      -> settings.color.gradients
 *       dim2.req09 pesos/interl.   -> settings.custom.typography.fontWeight|lineHeight.<slug>
 *       dim3.req11 margen lateral  -> el paso de espaciado `gutter`: max(<mínimo>, calc((100% - <ancho>) / 2))
 *       dim3.req12 medidas         -> settings.custom.layout.measure.<slug>
 *       dim4.req09 sombras         -> settings.shadow.presets  ("<x> <y> <desenfoque> <expansión> <color>")
 *       dim4.req10 grosores        -> settings.custom.border.<slug>
 *       dim4.req11 desenfoques     -> settings.custom.blur.<slug>
 *       dim7.req09 tema del form.  -> settings.custom.form.<variable> (las 68; sólo `familia` se llama `tipografia`)
 *       porQuiebre (dim2.req02, dim3.req01) + dim3.req10 -> styles.css, entre las marcas de COD_Theme_Definitions::MARCA_CSS_ESCALA
 *     Una escala con su ausencia declarada (`sin<Cosa>`) no emite nada. Los nombres de los pasos de tamaño y de espaciado
 *     son los de Configuración: «<paso> (<escritorio> / <tablet> / <celular>)».
 *   - dim9.req08 (diferencias por variante) y dim9.req09 (arquetipo -> familia de bloque) se validan y se guardan; el destino
 *     aún no emite sus propiedades (COD_ADN_Theme::fuera_del_adn()).
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

    /** Los puntos de quiebre de la web (los mismos del lienzo): tablet 768 a 1023 y celular hasta 767. */
    public const QUIEBRE_TABLET = '(min-width: 768px) and (max-width: 1023px)';
    public const QUIEBRE_MOVIL = '(max-width: 767px)';
    /** Las marcas del bloque de CSS de las escalas con quiebres (las mismas de COD_Theme_Definitions::MARCA_CSS_ESCALA). */
    public const MARCA_CSS_ESCALA = 'cod-escalas-con-quiebres';

    /** «<paso> (<escritorio> / <tablet> / <celular>)», el nombre que Configuración da a un paso de tamaño o de espaciado. */
    public static function nombre_de_paso(string $slug, string $valor, ?string $tablet = null, ?string $movil = null): string
    {
        $quiebres = ($tablet !== null || $movil !== null) ? ' / ' . ($tablet ?? $valor) . ' / ' . ($movil ?? $valor) : '';
        return $slug . ' (' . $valor . $quiebres . ')';
    }

    /** camelCase -> kebab-case, como WordPress imprime las claves de `settings.custom`. */
    public static function kebab(string $nombre): string
    {
        return strtolower((string) preg_replace('/(?<!^)[A-Z]/', '-$0', $nombre));
    }

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
        $quiebres_de = ['tablet' => [], 'mobile' => []]; // variable -> valor, por pantalla (porQuiebre)
        $usa_quiebres = false;
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
        /**
         * La lista de una escala, o [] si no se emite: si trae su ausencia declarada (`sin<Cosa>`) no emite nada, y si trae
         * la lista Y la ausencia a la vez tampoco (el Core dice que no resuelven) y se avisa.
         *
         * @return array<int, mixed>
         */
        $lista_de = static function (?stdClass $v, string $lista, string $ausencia, string $req) use (&$avisos): array {
            if ($v === null) {
                return [];
            }
            $hay_lista = property_exists($v, $lista) && is_array($v->{$lista}) && $v->{$lista} !== [];
            if (property_exists($v, $ausencia)) {
                if ($hay_lista) {
                    $avisos[] = ['codigo' => 'ADN_AUSENCIA_Y_LISTA', 'mensaje' => $req . ' trae `' . $lista . '` y `' . $ausencia . '` a la vez: el Core no lo resuelve y no se proyectó.', 'requisito' => $req];
                }
                return [];
            }
            return $hay_lista ? $v->{$lista} : [];
        };

        // --- color (dim1.req01) ---
        $slug_color = [];
        $slug_trans = [];
        $valor_trans = []; // slug de una transparencia -> su color-mix()
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
            // dim1.req15: una transparencia es un color de la paleta (el de la base) conservado al N %.
            foreach ($lista_de($valor_de('dim1.req15'), 'transparencias', 'sinTransparencias', 'dim1.req15') as $i => $t) {
                $base = $t->base ?? null;
                $clave = COD_ADN_Requisitos::es_ref($base) && count($base->refPath) >= 2 ? $base->refPath[0] . ':' . $base->refPath[1] : '';
                if ($clave === '' || !isset($slug_color[$clave])) {
                    $avisos[] = ['codigo' => 'ADN_TRANSPARENCIA_SIN_BASE', 'mensaje' => 'La transparencia "' . $t->nombre . '" no llega a un color de la paleta; no se proyectó.', 'nombre' => (string) $t->nombre];
                    continue;
                }
                $slug = self::slug_unico((string) $t->nombre, 'color', $usados, $avisos);
                $color = 'color-mix(in srgb, var(--wp--preset--color--' . $slug_color[$clave] . ') ' . COD_ADN_Js::numero_a_texto($t->opacidad) . '%, transparent)';
                $slug_trans['transparencias:' . $i] = $slug;
                $valor_trans[$slug] = $color;
                $agregar('--wp--preset--color--' . $slug, 'color', $color, 'dim1.req15', 'transparencias[' . $i . ']');
                $paleta[] = ['slug' => $slug, 'name' => (string) $t->nombre, 'color' => $color];
            }
            $tema['settings']['color']['palette'] = $paleta;
        }
        /** Un color por referencia (a la paleta o a una transparencia) como `var(--wp--preset--color--<slug>)`; null si no llega. */
        $color_var = static function ($ref, bool $resuelto = false) use (&$slug_color, &$slug_trans, &$valor_trans): ?string {
            if (!COD_ADN_Requisitos::es_ref($ref) || count($ref->refPath) < 2) {
                return null;
            }
            $clave = $ref->refPath[0] . ':' . $ref->refPath[1];
            if ($ref->refReqId === 'dim1.req01' && isset($slug_color[$clave])) {
                return 'var(--wp--preset--color--' . $slug_color[$clave] . ')';
            }
            if ($ref->refReqId === 'dim1.req15' && isset($slug_trans[$clave])) {
                // Una sombra lleva el color RESUELTO (el color-mix de la transparencia); un degradado o el formulario, la variable.
                return $resuelto ? $valor_trans[$slug_trans[$clave]] : 'var(--wp--preset--color--' . $slug_trans[$clave] . ')';
            }
            return null;
        };

        // --- degradados (dim1.req16) ---
        $degradados = [];
        foreach ($lista_de($valor_de('dim1.req16'), 'degradados', 'sinDegradados', 'dim1.req16') as $i => $g) {
            $paradas = [];
            foreach ((array) ($g->paradas ?? []) as $p) {
                $c = $p->color ?? null;
                $c = $c === 'transparent' ? 'transparent' : $color_var($c);
                if ($c === null) {
                    $paradas = [];
                    break;
                }
                $paradas[] = $c . ' ' . COD_ADN_Js::numero_a_texto($p->posicion) . '%';
            }
            $lineal = ($g->tipo ?? '') === 'linear';
            if (count($paradas) < 2 || ($lineal && !property_exists($g, 'angulo'))) {
                $avisos[] = ['codigo' => 'ADN_DEGRADADO_INCOMPLETO', 'mensaje' => 'El degradado "' . $g->nombre . '" necesita al menos dos paradas que lleguen a un color' . ($lineal ? ' y un ángulo' : '') . '; no se proyectó.', 'nombre' => (string) $g->nombre];
                continue;
            }
            $slug = self::slug_unico((string) $g->nombre, 'degradado', $usados, $avisos);
            $valor = $lineal
                ? 'linear-gradient(' . COD_ADN_Js::numero_a_texto($g->angulo) . 'deg, ' . implode(', ', $paradas) . ')'
                : 'radial-gradient(' . implode(', ', $paradas) . ')';
            $agregar('--wp--preset--gradient--' . $slug, 'neutro', $valor, 'dim1.req16', 'degradados[' . $i . ']');
            $degradados[] = ['slug' => $slug, 'name' => (string) $g->nombre, 'gradient' => $valor];
        }
        if ($degradados !== []) {
            $tema['settings']['color']['gradients'] = $degradados;
            $tema['settings']['color']['defaultGradients'] = false;
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
                $por_quiebre = [];
                foreach ((array) ($r->porQuiebre ?? []) as $q) {
                    $por_quiebre[(string) $q->quiebre] = (string) $q->fontSize;
                    $quiebres_de[(string) $q->quiebre]['--wp--preset--font-size--' . $rol] = (string) $q->fontSize;
                    $usa_quiebres = true;
                }
                $tamanos[] = ['slug' => $rol, 'name' => self::nombre_de_paso($rol, (string) $r->fontSize, $por_quiebre['tablet'] ?? null, $por_quiebre['mobile'] ?? null), 'size' => (string) $r->fontSize, 'fluid' => false];
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

        // --- pesos e interlineados con nombre (dim2.req09) ---
        $escalas_de_letra = $valor_de('dim2.req09');
        foreach (['pesos' => ['fontWeight', 'font-weight', 'peso'], 'interlineados' => ['lineHeight', 'line-height', 'interlineado']] as $lista => [$clave, $variable, $clase_slug]) {
            foreach ($lista_de($escalas_de_letra, $lista, 'sinEscalas', 'dim2.req09') as $i => $e) {
                $slug = self::slug_unico((string) $e->nombre, $clase_slug, $usados, $avisos);
                $valor = COD_ADN_Js::numero_a_texto($e->valor);
                $agregar('--wp--custom--typography--' . $variable . '--' . $slug, 'tipografia-fina', $valor, 'dim2.req09', $lista . '[' . $i . '].valor');
                $tema['settings']['custom']['typography'][$clave][$slug] = $valor;
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
                $por_quiebre = [];
                foreach ((array) ($e->porQuiebre ?? []) as $q) {
                    $por_quiebre[(string) $q->quiebre] = (string) $q->value;
                    $quiebres_de[(string) $q->quiebre]['--wp--preset--spacing--' . $slug] = (string) $q->value;
                    $usa_quiebres = true;
                }
                $tamanos[] = ['slug' => $slug, 'name' => self::nombre_de_paso($slug, (string) $e->value, $por_quiebre['tablet'] ?? null, $por_quiebre['mobile'] ?? null), 'size' => (string) $e->value];
            }
            // dim3.req11: el paso del margen lateral (gutter).
            $lateral = $valor_de('dim3.req11');
            if ($lateral !== null && property_exists($lateral, 'margenLateral') && !property_exists($lateral, 'sinMargenLateral')) {
                $m = $lateral->margenLateral;
                $contenedores = $valor_de('dim3.req05');
                $n = COD_ADN_Requisitos::es_ref($m->contenedor) && count($m->contenedor->refPath) >= 2 ? (int) $m->contenedor->refPath[1] : -1;
                $contenedor = $contenedores !== null && isset($contenedores->contenedores[$n]) ? $contenedores->contenedores[$n] : null;
                if ($contenedor === null) {
                    $avisos[] = ['codigo' => 'ADN_MARGEN_SIN_CONTENEDOR', 'mensaje' => 'El margen lateral "' . $m->nombre . '" no llega a un contenedor de dim3.req05; no se proyectó.', 'nombre' => (string) $m->nombre];
                } else {
                    $ancho = self::slug((string) $contenedor->nombre) === 'contenido' ? 'var(--wp--style--global--content-size)' : (string) $contenedor->maxWidth;
                    $slug = self::slug_unico((string) $m->nombre, 'espacio', $usados, $avisos);
                    $valor = 'max(' . $m->minimo . ', calc((100% - ' . $ancho . ') / 2))';
                    $agregar('--wp--preset--spacing--' . $slug, 'espaciado', $valor, 'dim3.req11', 'margenLateral');
                    $tamanos[] = ['slug' => $slug, 'name' => self::nombre_de_paso($slug, $valor), 'size' => $valor];
                }
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

        // --- medidas de texto (dim3.req12) ---
        foreach ($lista_de($valor_de('dim3.req12'), 'medidas', 'sinMedidas', 'dim3.req12') as $i => $m) {
            $slug = self::slug_unico((string) $m->nombre, 'medida', $usados, $avisos);
            $agregar('--wp--custom--layout--measure--' . $slug, 'ancho-de-caja', (string) $m->valor, 'dim3.req12', 'medidas[' . $i . '].valor');
            $tema['settings']['custom']['layout']['measure'][$slug] = (string) $m->valor;
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

        // --- sombras (dim4.req09), grosores (dim4.req10) y desenfoques (dim4.req11) ---
        $sombra_de = []; // 'sombras:<i>' -> el valor completo, para el tema del formulario
        $presets_sombra = [];
        foreach ($lista_de($valor_de('dim4.req09'), 'sombras', 'sinSombras', 'dim4.req09') as $i => $sh) {
            $color = $color_var($sh->color ?? null, true);
            if ($color === null) {
                $avisos[] = ['codigo' => 'ADN_SOMBRA_SIN_COLOR', 'mensaje' => 'La sombra "' . $sh->nombre . '" no llega a un color de la paleta o a una transparencia; no se proyectó.', 'nombre' => (string) $sh->nombre];
                continue;
            }
            $slug = self::slug_unico((string) $sh->nombre, 'sombra', $usados, $avisos);
            $valor = $sh->x . ' ' . $sh->y . ' ' . $sh->desenfoque . ' ' . $sh->expansion . ' ' . $color;
            $sombra_de['sombras:' . $i] = $valor;
            $agregar('--wp--preset--shadow--' . $slug, 'sombra', $valor, 'dim4.req09', 'sombras[' . $i . ']');
            $presets_sombra[] = ['slug' => $slug, 'name' => (string) $sh->nombre, 'shadow' => $valor];
        }
        if ($presets_sombra !== []) {
            $tema['settings']['shadow'] = ['defaultPresets' => false, 'presets' => $presets_sombra];
        }
        foreach (['grosores' => ['sinGrosores', 'dim4.req10', 'border', 'borde-grosor', 'grosor'], 'desenfoques' => ['sinDesenfoques', 'dim4.req11', 'blur', 'libre', 'desenfoque']] as $lista => [$ausencia, $req, $clave, $clase, $clase_slug]) {
            foreach ($lista_de($valor_de($req), $lista, $ausencia, $req) as $i => $e) {
                $slug = self::slug_unico((string) $e->nombre, $clase_slug, $usados, $avisos);
                $agregar('--wp--custom--' . $clave . '--' . $slug, $clase, (string) $e->valor, $req, $lista . '[' . $i . '].valor');
                $tema['settings']['custom'][$clave][$slug] = (string) $e->valor;
            }
        }

        // --- tema visual del formulario (dim7.req09): las variables de settings.custom.form ---
        $tema_form = $valor_de('dim7.req09');
        if ($tema_form !== null && property_exists($tema_form, 'temaFormulario') && !property_exists($tema_form, 'sinTemaFormulario') && $tema_form->temaFormulario instanceof stdClass) {
            $grupos = $tema_form->temaFormulario;
            $variables = [];
            foreach ((array) ($grupos->colores ?? []) as $nombre => $c) {
                $variables[$nombre] = $c === 'transparent' ? 'transparent' : ($color_var($c) ?? (is_string($c) ? $c : null));
            }
            foreach ((array) ($grupos->tipografia ?? []) as $nombre => $t) {
                if ($nombre === 'familia') {
                    $clave = COD_ADN_Requisitos::es_ref($t) && count($t->refPath) >= 2 ? $t->refPath[0] . ':' . $t->refPath[1] : '';
                    $variables['tipografia'] = isset($slug_familia[$clave]) ? 'var(--wp--preset--font-family--' . $slug_familia[$clave] . ')' : null;
                } else {
                    $variables[$nombre] = is_string($t) ? $t : COD_ADN_Js::numero_a_texto($t);
                }
            }
            foreach ((array) ($grupos->medidas ?? []) as $nombre => $m) {
                $variables[$nombre] = (string) $m;
            }
            foreach ((array) ($grupos->sombras ?? []) as $nombre => $sh) {
                $clave = COD_ADN_Requisitos::es_ref($sh) && count($sh->refPath) >= 2 ? $sh->refPath[0] . ':' . $sh->refPath[1] : '';
                $variables[$nombre] = $sh === 'none' ? 'none' : ($sombra_de[$clave] ?? null);
            }
            foreach ($variables as $nombre => $valor) {
                if ($valor === null) {
                    $avisos[] = ['codigo' => 'ADN_FORMULARIO_SIN_VALOR', 'mensaje' => 'La variable "' . $nombre . '" del tema del formulario no llega a un valor emitido; no se proyectó.', 'variable' => (string) $nombre];
                    continue;
                }
                $agregar('--wp--custom--form--' . self::kebab((string) $nombre), 'libre', $valor, 'dim7.req09', 'temaFormulario.' . $nombre);
                $tema['settings']['custom']['form'][(string) $nombre] = $valor;
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

        // --- valores por punto de quiebre (porQuiebre) y los anchos de dim3.req10 ---
        if ($usa_quiebres) {
            $media = ['tablet' => self::QUIEBRE_TABLET, 'mobile' => self::QUIEBRE_MOVIL];
            $anchos = $valor_de('dim3.req10');
            $declarados = [];
            foreach ($lista_de($anchos, 'quiebres', 'sinQuiebres', 'dim3.req10') as $q) {
                $hasta = (string) $q->hasta;
                $desde = property_exists($q, 'desde') ? (string) $q->desde : '';
                $media[(string) $q->nombre] = ($desde !== '' ? '(min-width: ' . $desde . ') and ' : '') . '(max-width: ' . $hasta . ')';
                $declarados[(string) $q->nombre] = true;
            }
            foreach (['tablet', 'mobile'] as $q) {
                if ($quiebres_de[$q] !== [] && !isset($declarados[$q])) {
                    $avisos[] = ['codigo' => 'ADN_QUIEBRES_HEREDADOS', 'mensaje' => 'Hay valores para "' . $q . '" y dim3.req10 no declara su ancho: se usa el de la web (' . $media[$q] . ').', 'quiebre' => $q];
                }
            }
            $css = '';
            foreach (['tablet', 'mobile'] as $q) {
                if ($quiebres_de[$q] === []) {
                    continue;
                }
                $declaraciones = '';
                foreach ($quiebres_de[$q] as $variable => $valor) {
                    $declaraciones .= $variable . ':' . $valor . ';';
                }
                $css .= '@media ' . $media[$q] . '{:root{' . $declaraciones . '}}';
            }
            $tema['styles']['css'] = '/*' . self::MARCA_CSS_ESCALA . '*/' . $css . '/*/' . self::MARCA_CSS_ESCALA . '*/';
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
