<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Lo que se DERIVA del ADN: el registro de variables, el fragmento de theme.json y los
 * valores del almacén plano (ESPEC 3.6). Es una función pura del contrato validado y de
 * las decisiones de la validación (qué definiciones se emiten); no escribe nada.
 *
 * EN F1 SÓLO SE CONSTRUYE Y SE GUARDA (cod_adn_proj_r<N>). Nadie lo lee todavía para
 * pintar: el filtro de theme.json, COD_Design_Core, COD_Theme_Definitions y el emisor de
 * `:root` pasan a leerlo por el puntero en F2. Por eso importar un ADN en F1 no cambia una
 * sola página.
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
    private const ALIAS_ROL_COLOR = ['background' => 'surface', 'text' => 'ink', 'accent' => 'accent'];
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

        /** Resuelve un ref de color/familia/espacio a `var(--…)` si apunta a un elemento emitido; si no, al literal. */
        $resolver = static function ($valor, string $req_destino, array $mapa_slug, string $prefijo) use ($valor_de) {
            if (!COD_ADN_Requisitos::es_ref($valor)) {
                return is_string($valor) ? $valor : null;
            }
            $raiz = $valor_de($req_destino);
            if ($raiz === null) {
                return null;
            }
            $ruta = $valor->refPath;
            if (count($ruta) >= 2 && is_string($ruta[0])) {
                $clave = $ruta[0] . ':' . $ruta[1];
                if (isset($mapa_slug[$clave])) {
                    return 'var(' . $prefijo . $mapa_slug[$clave] . ')';
                }
            }
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
            return is_string($actual) ? $actual : null;
        };

        // --- roles de color (dim1.req02) ---
        if (($v = $valor_de('dim1.req02')) !== null) {
            $roles = [];
            foreach ($v->roleColors as $i => $rc) {
                $color = $resolver($rc->color, 'dim1.req01', $slug_color, '--wp--preset--color--');
                if ($color === null) {
                    continue;
                }
                $alias = self::ALIAS_ROL_COLOR[$rc->role] ?? $rc->role;
                $agregar('--cod-color-' . $alias, 'color', $color, 'dim1.req02', 'roleColors[' . $i . '].color');
                $roles[$rc->role] = $color;
            }
            foreach (['background' => 'color_bg', 'text' => 'color_text', 'surface' => 'color_primary', 'accent' => 'color_accent'] as $rol => $campo) {
                if (isset($roles[$rol])) {
                    $plano[$campo] = $roles[$rol];
                }
            }
        }

        // --- familias (dim2.req01) ---
        $slug_familia = [];
        $pila_de = [];
        if (($v = $valor_de('dim2.req01')) !== null) {
            $familias = [];
            foreach ($v->familias as $i => $f) {
                $slug = self::slug_unico((string) $f->name, 'familia', $usados, $avisos);
                $slug_familia['familias:' . $i] = $slug;
                $pila = implode(', ', array_map('strval', $f->stack));
                $pila_de['familias:' . $i] = $pila;
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
                $rol = self::slug((string) $r->role);
                $familia = $resolver($r->family, 'dim2.req01', $slug_familia, '--wp--preset--font-family--');
                $estilos_de_rol[(string) $r->role] = ['familia' => $familia, 'size' => (string) $r->fontSize, 'ruta' => 'roleStyles[' . $i . ']'];
                $agregar('--wp--preset--font-size--' . $rol, 'tamano', (string) $r->fontSize, 'dim2.req02', 'roleStyles[' . $i . '].fontSize');
                $agregar('--wp--custom--typography--' . $rol . '--weight', 'tipografia-fina', COD_ADN_Js::numero_a_texto($r->fontWeight), 'dim2.req02', 'roleStyles[' . $i . '].fontWeight');
                $agregar('--wp--custom--typography--' . $rol . '--line-height', 'tipografia-fina', COD_ADN_Js::numero_a_texto($r->lineHeight), 'dim2.req02', 'roleStyles[' . $i . '].lineHeight');
                if (property_exists($r, 'letterSpacing')) {
                    $agregar('--wp--custom--typography--' . $rol . '--letter-spacing', 'tipografia-fina', (string) $r->letterSpacing, 'dim2.req02', 'roleStyles[' . $i . '].letterSpacing');
                }
                $tamanos[] = ['slug' => $rol, 'name' => (string) $r->role, 'size' => (string) $r->fontSize];
                $tema['settings']['custom']['typography'][$rol] = [
                    'weight' => COD_ADN_Js::numero_a_texto($r->fontWeight),
                    'line-height' => COD_ADN_Js::numero_a_texto($r->lineHeight),
                ] + (property_exists($r, 'letterSpacing') ? ['letter-spacing' => (string) $r->letterSpacing] : []);
            }
            $tema['settings']['typography']['fontSizes'] = $tamanos;
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
                if (strpos($campo, 'font_') === 0 && $estilos_de_rol[$rol_nombre]['familia'] !== null) {
                    $plano[$campo] = $estilos_de_rol[$rol_nombre]['familia'];
                } elseif (strpos($campo, '_size') !== false) {
                    $plano[$campo] = $estilos_de_rol[$rol_nombre]['size'];
                }
            }
        }

        // --- espacio (dim3.req01 y dim3.req02) ---
        $slug_espacio = [];
        if (($v = $valor_de('dim3.req01')) !== null) {
            $tamanos = [];
            foreach ($v->escala as $i => $e) {
                $slug = self::slug_unico(str_replace('.', '-', COD_ADN_Js::numero_a_texto($e->step)), 'espacio', $usados, $avisos);
                $slug_espacio['escala:' . $i] = $slug;
                $agregar('--wp--preset--spacing--' . $slug, 'espaciado', (string) $e->value, 'dim3.req01', 'escala[' . $i . '].value');
                $tamanos[] = ['slug' => $slug, 'name' => (string) $e->step, 'size' => (string) $e->value];
            }
            $tema['settings']['spacing']['spacingSizes'] = $tamanos;
        }
        if (($v = $valor_de('dim3.req02')) !== null) {
            foreach ($v->roleSpacing as $i => $rs) {
                $valor = $resolver($rs->value, 'dim3.req01', $slug_espacio, '--wp--preset--spacing--');
                if ($valor === null) {
                    continue;
                }
                $nombre = self::ROL_ESPACIO[$rs->role] ?? self::slug((string) $rs->role);
                $agregar('--wp--custom--spacing--' . $nombre, 'espaciado', $valor, 'dim3.req02', 'roleSpacing[' . $i . '].value');
                $tema['settings']['custom']['spacing'][$nombre] = $valor;
            }
        }

        // --- formas (dim4.req02) ---
        if (($v = $valor_de('dim4.req02')) !== null) {
            foreach ($v->formas as $i => $f) {
                $nombre = null;
                if (COD_ADN_Requisitos::es_ref($f->rol)) {
                    $ult = $f->rol->refPath === [] ? null : end($f->rol->refPath);
                    $nombre = is_string($ult) ? $ult : null;
                    if (isset($ganadoras[$f->rol->refReqId])) {
                        $dest = $ganadoras[$f->rol->refReqId]['def']->value ?? null;
                        $actual = $dest;
                        foreach ($f->rol->refPath as $seg) {
                            if (is_string($seg) && $actual instanceof stdClass && property_exists($actual, $seg)) {
                                $actual = $actual->{$seg};
                            } elseif (!is_string($seg) && is_array($actual) && isset($actual[(int) $seg])) {
                                $actual = $actual[(int) $seg];
                            } else {
                                $actual = null;
                                break;
                            }
                        }
                        $nombre = is_string($actual) ? $actual : $nombre;
                    }
                }
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
