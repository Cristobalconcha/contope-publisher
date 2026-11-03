<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Validador del ADN: las tres capas de la espec (3.2).
 *
 *   1. compatibilidad del parser (COD_ADN_Parser)        paridad EXACTA con el Core
 *   2. validación semántica del Core (COD_ADN_Parser)    paridad EXACTA con el Core
 *   3. política del destino: R1, R2, R4, R5, R6          divergencias DELIBERADAS
 *
 * La capa 3 NO existe en el Core. Cada divergencia está escrita en el corpus
 * `fixtures/adn/destino/` con su resultado esperado, y es lo que mide
 * scripts/probar-adn-validador.php. Si cambia una regla, cambia primero un caso.
 *
 *   R1  una definición `confirmed` necesita autoridad humana o pauta aprobada. Excepción
 *       (H13): `deterministic-extraction` con `reviewedAt` en una definición que no alimenta
 *       ninguna variable (las restricciones legales que el propio Core produce).
 *   R2  la forma del `value` de los requisitos que la web consume. `value` ausente, nulo o
 *       `{}` = "declarada y sin resolver" (H14): se guarda, no se emite.
 *   R4  lo que la web no proyecta se guarda y se lista en `ignored[]`; nunca se descarta ni
 *       se emite.
 *   R5  1 MB, 2000 definiciones, profundidad 12.
 *   R6  las referencias dentro de `value` se RESUELVEN: el requisito existe y es único, la
 *       ruta llega a un valor del tipo esperado, no hay ciclos, y el estado efectivo es el
 *       mínimo entre el propio y el de todas las dependencias (H7).
 *
 * R3 (colisión de *slugs*) es de la proyección, no de la validación.
 *
 * Entrada: un TEXTO JSON, o lo que sale de `json_decode($texto, false)` (objetos como
 * stdClass). No acepta arreglos asociativos: un `{}` y un `[]` serían indistinguibles.
 */
final class COD_ADN_Validator
{
    public const MAX_BYTES = 1048576;
    public const MAX_DEFINICIONES = 2000;
    public const MAX_PROFUNDIDAD = 12;

    public const RANGO = ['confirmed' => 2, 'proposed' => 1];

    /**
     * @param string|object $entrada
     * @return array{ok: bool, valor: mixed, error: string}
     */
    public static function decodificar($entrada): array
    {
        if (!is_string($entrada)) {
            return ['ok' => true, 'valor' => $entrada, 'error' => ''];
        }
        if (strlen($entrada) > self::MAX_BYTES) {
            return ['ok' => false, 'valor' => null, 'error' => 'ADN_TOO_LARGE'];
        }
        // Un BOM al principio es habitual al guardar desde Windows; JSON no lo admite.
        if (strncmp($entrada, "\xEF\xBB\xBF", 3) === 0) {
            $entrada = substr($entrada, 3);
        }
        $valor = json_decode($entrada, false, 512);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return ['ok' => false, 'valor' => null, 'error' => json_last_error_msg()];
        }
        return ['ok' => true, 'valor' => $valor, 'error' => ''];
    }

    /** JSON canónico: claves ordenadas, compacto, Unicode y barras sin escapar. Lo que se guarda y se firma. */
    public static function json_canonico($valor): string
    {
        return COD_ADN_Design_Md::json_en_linea($valor);
    }

    public static function digest($contrato): string
    {
        return hash('sha256', self::json_canonico($contrato));
    }

    private static function profundidad($v, int $nivel = 0): int
    {
        if (is_array($v)) {
            $max = $nivel + 1;
            foreach ($v as $item) {
                $max = max($max, self::profundidad($item, $nivel + 1));
            }
            return $max;
        }
        if ($v instanceof stdClass) {
            $max = $nivel + 1;
            foreach (get_object_vars($v) as $item) {
                $max = max($max, self::profundidad($item, $nivel + 1));
                if ($max > self::MAX_PROFUNDIDAD + 2) {
                    return $max; // cortar: ya excede
                }
            }
            return $max;
        }
        return $nivel;
    }

    private static function error(string $codigo, string $mensaje, array $extra = []): array
    {
        return ['codigo' => $codigo, 'mensaje' => $mensaje] + $extra;
    }

    private static function sin_resolver(stdClass $d): bool
    {
        if (!property_exists($d, 'value') || $d->value === null) {
            return true;
        }
        return $d->value instanceof stdClass && get_object_vars($d->value) === [];
    }

    /**
     * Valida un ADN y dice qué haría un import con él.
     *
     * @param string|object $entrada texto JSON, o el valor ya decodificado (objetos stdClass)
     * @param array{emitirPropuestas?: bool} $opciones
     * @return array{
     *   ok: bool, formato: string, contrato: ?stdClass, errores: array<int, array<string, mixed>>,
     *   definiciones: array<string, array<string, mixed>>, ignoradas: array<int, array<string, mixed>>,
     *   traza: array<int, string>, digest: string
     * }
     */
    public static function validar($entrada, array $opciones = []): array
    {
        $vacio = ['ok' => false, 'formato' => '', 'contrato' => null, 'errores' => [], 'definiciones' => [], 'ignoradas' => [], 'traza' => [], 'digest' => ''];
        $emitir_propuestas = !empty($opciones['emitirPropuestas']);

        // --- R5 (tamaño) y decodificación ---
        $dec = self::decodificar($entrada);
        if (!$dec['ok']) {
            $codigo = $dec['error'] === 'ADN_TOO_LARGE' ? 'ADN_TOO_LARGE' : 'ADN_INVALID';
            $mensaje = $codigo === 'ADN_TOO_LARGE'
                ? 'El ADN pesa más de ' . self::MAX_BYTES . ' bytes.'
                : 'No es JSON válido: ' . $dec['error'] . '.';
            $vacio['errores'][] = self::error($codigo, $mensaje);
            return $vacio;
        }
        $valor = $dec['valor'];
        if (!is_string($entrada)) {
            $texto = json_encode($valor);
            if (is_string($texto) && strlen($texto) > self::MAX_BYTES) {
                $vacio['errores'][] = self::error('ADN_TOO_LARGE', 'El ADN pesa más de ' . self::MAX_BYTES . ' bytes.');
                return $vacio;
            }
        }

        // --- capas 1 y 2 ---
        $es_portable = $valor instanceof stdClass && property_exists($valor, 'kind') && $valor->kind === 'contope/design-model';
        $analisis = $es_portable ? COD_ADN_Parser::analizar_portable($valor) : COD_ADN_Parser::analizar_contrato($valor);
        $vacio['formato'] = $es_portable ? 'portable' : 'contract';
        $vacio['traza'] = $analisis['traza'];
        if (!$analisis['valido'] || $analisis['salida'] === null) {
            $vacio['errores'][] = self::error(
                'ADN_INVALID',
                'No cumple el contrato de diseño (' . ($es_portable ? 'envoltorio portable' : 'contrato') . '). Rama del Core: ' . implode(', ', $analisis['traza']) . '.',
                ['traza' => $analisis['traza']]
            );
            return $vacio;
        }
        /** @var stdClass $contrato */
        $contrato = $es_portable ? $analisis['salida']->contract : $analisis['salida'];

        // --- R5 (cantidad y profundidad) ---
        if (count($contrato->definitions) > self::MAX_DEFINICIONES) {
            $vacio['errores'][] = self::error('ADN_TOO_LARGE', 'El ADN trae más de ' . self::MAX_DEFINICIONES . ' definiciones.');
            return $vacio;
        }
        foreach ($contrato->definitions as $d) {
            foreach (['value', 'supersededValue'] as $campo) {
                if (property_exists($d, $campo) && self::profundidad($d->{$campo}) > self::MAX_PROFUNDIDAD) {
                    $vacio['errores'][] = self::error('ADN_TOO_LARGE', 'El valor de la definición supera la profundidad máxima de ' . self::MAX_PROFUNDIDAD . '.', ['definicion' => $d->id]);
                    return $vacio;
                }
            }
        }

        $resultado = self::politica_del_destino($contrato, $emitir_propuestas);
        return [
            'ok' => $resultado['errores'] === [],
            'formato' => $vacio['formato'],
            'contrato' => $contrato,
            'errores' => $resultado['errores'],
            'definiciones' => $resultado['definiciones'],
            'ignoradas' => $resultado['ignoradas'],
            'traza' => [],
            'digest' => self::digest($contrato),
        ];
    }

    /**
     * Capa 3.
     *
     * @return array{errores: array<int, array<string, mixed>>, definiciones: array<string, array<string, mixed>>, ignoradas: array<int, array<string, mixed>>}
     */
    private static function politica_del_destino(stdClass $contrato, bool $emitir_propuestas): array
    {
        $errores = [];
        $definiciones = [];
        $ignoradas = [];

        // Índices.
        $por_id = [];
        $por_requisito = [];
        foreach ($contrato->definitions as $d) {
            $por_id['s' . $d->id] = $d;
            $req = COD_ADN_Requisitos::requisito_de((string) $d->id);
            if ($req !== null) {
                $por_requisito[$req][] = $d;
            }
        }

        // R6, fase 1: resolver las referencias de cada definición que cuente.
        $resolucion = [];
        foreach ($contrato->definitions as $d) {
            if (!isset(self::RANGO[$d->state]) || self::sin_resolver($d)) {
                continue;
            }
            $resolucion['s' . $d->id] = self::resolver_referencias($d, $por_requisito);
        }

        // R6, fase 2: estado efectivo = mínimo con todas las dependencias (punto fijo).
        $efectivo = [];
        foreach ($contrato->definitions as $d) {
            $efectivo['s' . $d->id] = self::RANGO[$d->state] ?? 0;
        }
        do {
            $cambio = false;
            foreach ($resolucion as $clave => $r) {
                foreach ($r['dependencias'] as $dep) {
                    $rango_dep = $efectivo['s' . $dep] ?? 0;
                    if ($rango_dep < $efectivo[$clave]) {
                        $efectivo[$clave] = $rango_dep;
                        $cambio = true;
                    }
                }
            }
        } while ($cambio);

        foreach ($contrato->definitions as $d) {
            $id = (string) $d->id;
            $req = COD_ADN_Requisitos::requisito_de($id);
            $proyectado = COD_ADN_Requisitos::es_proyectado($req);
            $con_forma = COD_ADN_Requisitos::tiene_esquema($req); // proyectado, o forma conocida sin proyectar (dim9.req08/09)
            $ficha = ['estadoEfectivo' => $d->state, 'guardada' => true, 'emitida' => false, 'ignorada' => null];

            if ($d->state === 'confirmed') {
                // R1.
                $humana = in_array($d->authority, ['human-confirmed', 'approved-guideline'], true);
                $restriccion = $d->authority === 'deterministic-extraction' && property_exists($d, 'reviewedAt') && !$proyectado;
                if (!$humana && !$restriccion) {
                    $errores[] = self::error(
                        'ADN_CONFIRMED_WITHOUT_HUMAN',
                        'La definición "' . $id . '" está `confirmed` con autoridad `' . $d->authority . '`: sin una persona o una pauta aprobada detrás no hay confirmación.',
                        ['definicion' => $id, 'autoridad' => $d->authority]
                    );
                }
            }

            if (!isset(self::RANGO[$d->state])) {
                $definiciones[$id] = $ficha; // observed / rejected: evidencia, nunca se emite.
                continue;
            }

            $ficha['estadoEfectivo'] = ($efectivo['s' . $id] ?? 0) >= 2 ? 'confirmed' : 'proposed';
            $motivo = null; // por qué no se emite (proposed) o por qué se rechaza (confirmed)
            $detalle = [];

            if (!$con_forma) {
                $motivo = 'R4-no-proyectada';
            } elseif (self::sin_resolver($d)) {
                if ($d->state === 'confirmed') {
                    $errores[] = self::error(
                        'ADN_PAYLOAD_SHAPE',
                        'La definición "' . $id . '" está `confirmed` y no trae `value`: una definición confirmada tiene que traer la forma de su requisito.',
                        ['definicion' => $id, 'ruta' => '']
                    );
                } else {
                    $motivo = 'R2-sin-resolver';
                }
            } else {
                $motivos = COD_ADN_Requisitos::validar_forma((string) $req, $d->value);
                $codigo_forma = 'ADN_PAYLOAD_SHAPE';
                if ($motivos === []) {
                    // Lo que el Core deja al destino (nombre único y con slug propio): código propio.
                    $motivos = COD_ADN_Requisitos::validar_destino((string) $req, $d->value);
                    $codigo_forma = (string) ($motivos[0]['codigo'] ?? $codigo_forma);
                }
                if ($motivos !== []) {
                    if ($d->state === 'confirmed') {
                        $errores[] = self::error(
                            $codigo_forma,
                            'La definición "' . $id . '" no cumple ' . ($codigo_forma === 'ADN_PAYLOAD_SHAPE' ? 'la forma de ' : 'las reglas del destino para ') . $req . ': ' . $motivos[0]['mensaje'],
                            ['definicion' => $id, 'ruta' => $motivos[0]['ruta'], 'motivos' => $motivos]
                        );
                    } else {
                        $motivo = $codigo_forma;
                        $detalle = ['ruta' => $motivos[0]['ruta']];
                    }
                }
            }

            if ($motivo === null && !$proyectado) {
                $motivo = 'R4-no-proyectada'; // la forma es conocida (dim9.req08/09), pero la web aún no emite sus propiedades.
            }

            // R6 (también para lo que la web no proyecta: una referencia rota es una referencia rota).
            $r6 = $resolucion['s' . $id]['error'] ?? null;
            if ($r6 !== null && ($motivo === null || $motivo === 'R4-no-proyectada')) {
                if ($d->state === 'confirmed') {
                    $errores[] = self::error($r6['codigo'], $r6['mensaje'], ['definicion' => $id] + $r6['detalles']);
                    $motivo = $motivo ?? $r6['codigo'];
                } elseif ($motivo === null) {
                    $motivo = $r6['codigo'];
                    $detalle = $r6['detalles'];
                }
            }

            if ($motivo !== null) {
                $ficha['ignorada'] = $motivo;
                $ficha['emitida'] = false;
                $ignoradas[] = ['definicion' => $id, 'motivo' => $motivo] + $detalle;
            } else {
                $ficha['emitida'] = $ficha['estadoEfectivo'] === 'confirmed' || $emitir_propuestas;
            }
            $definiciones[$id] = $ficha;
        }

        return ['errores' => $errores, 'definiciones' => $definiciones, 'ignoradas' => $ignoradas];
    }

    // ------------------------------------------------------------------
    // R6
    // ------------------------------------------------------------------

    /**
     * Recorre `value` y devuelve cada referencia con su ruta.
     *
     * @param mixed $v
     * @param array<int, string|int> $ruta
     * @param array<int, array{ruta: array<int, string|int>, ref: stdClass}> $out
     */
    private static function buscar_refs($v, array $ruta, array &$out): void
    {
        if (COD_ADN_Requisitos::es_ref($v)) {
            $out[] = ['ruta' => $ruta, 'ref' => $v];
            return;
        }
        if (is_array($v)) {
            foreach ($v as $i => $item) {
                self::buscar_refs($item, array_merge($ruta, [(int) $i]), $out);
            }
        } elseif ($v instanceof stdClass) {
            foreach (get_object_vars($v) as $k => $item) {
                self::buscar_refs($item, array_merge($ruta, [(string) $k]), $out);
            }
        }
    }

    /**
     * Navega `refPath` dentro del valor de la definición destino (resolveRefValue del Core).
     *
     * @param array<int, string|int|float> $ruta
     * @return array{ok: bool, valor: mixed}
     */
    private static function navegar($raiz, array $ruta): array
    {
        $actual = $raiz;
        foreach ($ruta as $seg) {
            if (is_string($seg)) {
                if (!$actual instanceof stdClass || !property_exists($actual, $seg)) {
                    return ['ok' => false, 'valor' => null];
                }
                $actual = $actual->{$seg};
            } else {
                if (!is_array($actual) || !COD_ADN_Js::es_entero($seg) || $seg < 0 || $seg >= count($actual)) {
                    return ['ok' => false, 'valor' => null];
                }
                $actual = $actual[(int) $seg];
            }
        }
        return ['ok' => true, 'valor' => $actual];
    }

    private static function falla(string $codigo, string $mensaje, array $detalles = []): array
    {
        return ['codigo' => $codigo, 'mensaje' => $mensaje, 'detalles' => $detalles];
    }

    /**
     * @param array<string, array<int, stdClass>> $por_requisito
     * @return array{error: ?array<string, mixed>, dependencias: array<int, string>}
     */
    private static function resolver_referencias(stdClass $d, array $por_requisito): array
    {
        $refs = [];
        self::buscar_refs($d->value, [], $refs);
        $dependencias = [];
        $id = (string) $d->id;
        $req_propio = COD_ADN_Requisitos::requisito_de($id);

        foreach ($refs as $r) {
            $ruta_origen = $r['ruta'];
            $visitadas = [$id . '#' . json_encode($ruta_origen)];
            $actual_ref = $r['ref'];
            $esperado = $req_propio !== null ? COD_ADN_Requisitos::tipo_esperado_de_ref($req_propio, $ruta_origen) : null;
            $recorrido = [$id . '#' . self::ruta_a_texto($ruta_origen)];

            while (true) {
                $destino_req = (string) $actual_ref->refReqId;
                $candidatas = $por_requisito[$destino_req] ?? [];
                if (count($candidatas) === 0) {
                    return ['error' => self::falla('ADN_REF_UNRESOLVED', 'La referencia de "' . $id . '" apunta a ' . $destino_req . ', que no está en el contrato.', ['requisito' => $destino_req, 'recorrido' => $recorrido]), 'dependencias' => $dependencias];
                }
                if (count($candidatas) > 1) {
                    return ['error' => self::falla('ADN_REF_AMBIGUOUS', 'La referencia de "' . $id . '" apunta a ' . $destino_req . ', que tiene ' . count($candidatas) . ' definiciones: no hay una sola a la que apuntar.', ['requisito' => $destino_req, 'definiciones' => array_map(static function (stdClass $c): string {
                        return (string) $c->id;
                    }, $candidatas)]), 'dependencias' => $dependencias];
                }
                $destino = $candidatas[0];
                $dependencias[] = (string) $destino->id;
                if (!isset(self::RANGO[$destino->state])) {
                    return ['error' => self::falla('ADN_REF_STATE', 'La referencia de "' . $id . '" apunta a "' . $destino->id . '", que está `' . $destino->state . '`: una dependencia ' . ($destino->state === 'rejected' ? 'rechazada' : 'observada') . ' bloquea.', ['dependencia' => (string) $destino->id, 'estado' => $destino->state]), 'dependencias' => $dependencias];
                }
                if (self::sin_resolver($destino)) {
                    return ['error' => self::falla('ADN_REF_UNRESOLVED', 'La referencia de "' . $id . '" apunta a "' . $destino->id . '", que está declarada y sin resolver.', ['dependencia' => (string) $destino->id, 'recorrido' => $recorrido]), 'dependencias' => $dependencias];
                }
                $nav = self::navegar($destino->value, $actual_ref->refPath);
                if (!$nav['ok']) {
                    return ['error' => self::falla('ADN_REF_UNRESOLVED', 'La ruta de la referencia de "' . $id . '" no llega a ningún valor de "' . $destino->id . '".', ['dependencia' => (string) $destino->id, 'ruta' => self::ruta_a_texto($actual_ref->refPath), 'recorrido' => $recorrido]), 'dependencias' => $dependencias];
                }
                $valor = $nav['valor'];
                if (COD_ADN_Requisitos::es_ref($valor)) {
                    $clave = $destino->id . '#' . json_encode($actual_ref->refPath);
                    // La referencia siguiente vive en (destino, refPath): su origen es esa ubicación.
                    $recorrido[] = $clave;
                    if (in_array($clave, $visitadas, true)) {
                        return ['error' => self::falla('ADN_REF_UNRESOLVED', 'Las referencias de "' . $id . '" forman un ciclo.', ['recorrido' => $recorrido]), 'dependencias' => $dependencias];
                    }
                    $visitadas[] = $clave;
                    $actual_ref = $valor;
                    continue;
                }
                if ($valor === null) {
                    return ['error' => self::falla('ADN_REF_UNRESOLVED', 'La referencia de "' . $id . '" llega a un valor vacío.', ['dependencia' => (string) $destino->id, 'recorrido' => $recorrido]), 'dependencias' => $dependencias];
                }
                if ($esperado !== null && !COD_ADN_Requisitos::cumple_alguno($valor, $esperado)) {
                    return ['error' => self::falla('ADN_REF_UNRESOLVED', 'La referencia de "' . $id . '" llega a un valor que no es del tipo esperado.', ['dependencia' => (string) $destino->id, 'ruta' => self::ruta_a_texto($actual_ref->refPath), 'recorrido' => $recorrido]), 'dependencias' => $dependencias];
                }
                break;
            }
        }
        return ['error' => null, 'dependencias' => array_values(array_unique($dependencias))];
    }

    /** @param array<int, mixed> $ruta */
    private static function ruta_a_texto(array $ruta): string
    {
        $t = '';
        foreach ($ruta as $seg) {
            $t .= is_string($seg) ? ($t === '' ? $seg : '.' . $seg) : '[' . $seg . ']';
        }
        return $t;
    }
}
