<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Puerto de `renderDesignContractDesignMd` (Core, design-contract-design-md.ts).
 *
 * Existe porque `parsePortableDesignModel` exige que `designMd.content` sea IDÉNTICO,
 * byte a byte, al DESIGN.md que el Core renderiza desde el contrato (3.2, capa 1). Si el
 * plugin no comprobara esa igualdad aceptaría envoltorios que el Core rechaza.
 *
 * Es una traducción línea a línea, con el mismo orden de secciones y la misma salida
 * estable; no mejora ni reordena nada. Cualquier cambio debe nacer en el Core y
 * volver acá junto con un caso del corpus (fixtures/adn/core).
 *
 * Recibe el contrato NORMALIZADO que devuelve COD_ADN_Validator::analizar_contrato():
 * objetos (stdClass) para los registros y arreglos para las listas.
 */
final class COD_ADN_Design_Md
{
    private const SECCIONES = ['Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components'];

    /** `JSON.stringify(stableJsonValue(v))`: claves ordenadas, compacto. */
    public static function json_en_linea($valor): string
    {
        return self::serializar($valor, false, 0);
    }

    /** `JSON.stringify(stableJsonValue(v), null, 2)`. */
    public static function json_en_bloque($valor): string
    {
        return self::serializar($valor, true, 0);
    }

    /**
     * Serialización estable: las claves de cada objeto salen ordenadas como texto y luego
     * en el orden en que V8 enumera un objeto (índices enteros primero), igual que
     * `Object.fromEntries(Object.keys(r).sort(compareText).map(...))`.
     *
     * @param mixed $valor
     */
    private static function serializar($valor, bool $bonito, int $nivel): string
    {
        if ($valor === null) {
            return 'null';
        }
        if (is_bool($valor)) {
            return $valor ? 'true' : 'false';
        }
        if (is_int($valor)) {
            return (string) $valor;
        }
        if (is_float($valor)) {
            // stableJsonValue: un número no finito se vuelve su texto ("Infinity"); NaN no sale de un JSON.
            return is_finite($valor) ? COD_ADN_Js::numero_a_texto($valor) : COD_ADN_Js::json_texto(COD_ADN_Js::numero_a_texto($valor));
        }
        if (is_string($valor)) {
            return COD_ADN_Js::json_texto($valor);
        }
        $sangria = $bonito ? str_repeat('  ', $nivel + 1) : '';
        $cierre = $bonito ? str_repeat('  ', $nivel) : '';
        $salto = $bonito ? "\n" : '';
        if (is_array($valor)) {
            if ($valor === []) {
                return '[]';
            }
            $items = [];
            foreach ($valor as $item) {
                $items[] = $sangria . self::serializar($item, $bonito, $nivel + 1);
            }
            return '[' . $salto . implode(',' . $salto, $items) . $salto . $cierre . ']';
        }
        if ($valor instanceof stdClass) {
            $mapa = [];
            foreach (get_object_vars($valor) as $k => $v) {
                $mapa[(string) $k] = $v;
            }
            if ($mapa === []) {
                return '{}';
            }
            $claves = array_map('strval', array_keys($mapa));
            usort($claves, [COD_ADN_Js::class, 'comparar']);
            $claves = COD_ADN_Js::orden_de_enumeracion($claves);
            $pares = [];
            foreach ($claves as $k) {
                $pares[] = $sangria . COD_ADN_Js::json_texto($k) . ($bonito ? ': ' : ':') . self::serializar($mapa[$k], $bonito, $nivel + 1);
            }
            return '{' . $salto . implode(',' . $salto, $pares) . $salto . $cierre . '}';
        }
        return 'null';
    }

    private static function bloque_con_cerco($valor): string
    {
        $cuerpo = self::json_en_bloque($valor);
        $mas_larga = 0;
        if (preg_match_all('/`+/', $cuerpo, $m) > 0) {
            foreach ($m[0] as $racha) {
                $mas_larga = max($mas_larga, strlen($racha));
            }
        }
        $cerco = str_repeat('`', max(3, $mas_larga + 1));
        return $cerco . "json\n" . $cuerpo . "\n" . $cerco;
    }

    private static function seccion_de(string $categoria): ?string
    {
        $n = mb_strtolower($categoria, 'UTF-8');
        $tiene = static function (string $aguja) use ($n): bool {
            return strpos($n, $aguja) !== false;
        };
        if ($tiene('color') || $tiene('palette') || $n === 'theme-mode') {
            return 'Colors';
        }
        if ($tiene('typography') || $tiene('font') || $tiene('typeface')) {
            return 'Typography';
        }
        if ($tiene('layout') || $tiene('spacing') || $tiene('structure')) {
            return 'Layout';
        }
        if ($tiene('elevation') || $tiene('shadow')) {
            return 'Elevation & Depth';
        }
        if ($tiene('border') || $tiene('radius') || $tiene('shape')) {
            return 'Shapes';
        }
        if ($tiene('component') || $tiene('icon')) {
            return 'Components';
        }
        return null;
    }

    private static function definicion(stdClass $d): string
    {
        $l = [
            '### ' . self::json_en_linea($d->id),
            '',
            '- Name: ' . self::json_en_linea($d->name),
            '- Category: ' . self::json_en_linea($d->category),
            '- State: ' . self::json_en_linea($d->state),
            '- Authority: ' . self::json_en_linea($d->authority),
            '- Evidence source IDs: ' . self::json_en_linea($d->evidenceSourceIds),
            '- Constraint definition IDs: ' . self::json_en_linea($d->constraintDefinitionIds),
        ];
        if (property_exists($d, 'reviewedAt')) {
            $l[] = '- Reviewed at: ' . self::json_en_linea($d->reviewedAt);
        }
        if (property_exists($d, 'supersededValue')) {
            array_push($l, '', 'Superseded value:', '', self::bloque_con_cerco($d->supersededValue));
        }
        $valor = property_exists($d, 'value') ? $d->value : null;
        array_push($l, '', 'Value:', '', self::bloque_con_cerco($valor));
        return implode("\n", $l);
    }

    private static function tarea(stdClass $t): string
    {
        $l = [
            '### ' . self::json_en_linea($t->id),
            '',
            '- State: ' . self::json_en_linea($t->state),
            '- Target definition ID: ' . self::json_en_linea($t->definitionId),
            '- Constraint definition IDs: ' . self::json_en_linea($t->constraintDefinitionIds),
            '- Candidate definition IDs: ' . self::json_en_linea($t->candidateDefinitionIds),
        ];
        if (property_exists($t, 'resolvedDefinitionId')) {
            $l[] = '- Resolved definition ID: ' . self::json_en_linea($t->resolvedDefinitionId);
        }
        if (property_exists($t, 'reviewedAt')) {
            $l[] = '- Reviewed at: ' . self::json_en_linea($t->reviewedAt);
        }
        return implode("\n", $l);
    }

    private static function fuente(stdClass $s): string
    {
        $detalles = [
            'purpose ' . self::json_en_linea($s->purpose),
            'technical kind ' . self::json_en_linea($s->technicalKind),
            'imported at ' . self::json_en_linea($s->importedAt),
        ];
        if (property_exists($s, 'path')) {
            $detalles[] = 'workspace path ' . self::json_en_linea($s->path);
        }
        if (property_exists($s, 'locator')) {
            $detalles[] = 'locator ' . self::json_en_linea($s->locator);
        }
        return '- ' . self::json_en_linea($s->id) . ' — ' . self::json_en_linea($s->label) . '; ' . implode('; ', $detalles) . '.';
    }

    private static function seccion(string $titulo, string $contenido): string
    {
        return '## ' . $titulo . "\n\n" . $contenido;
    }

    /** @param array<int, stdClass> $lista */
    private static function ordenar_por_id(array $lista): array
    {
        usort($lista, static function (stdClass $a, stdClass $b): int {
            return COD_ADN_Js::comparar((string) $a->id, (string) $b->id);
        });
        return $lista;
    }

    /** Lo mismo que `renderDesignContractDesignMd(contract)`. */
    public static function renderizar(stdClass $contrato): string
    {
        $confirmadas = self::ordenar_por_id(array_values(array_filter($contrato->definitions, static function (stdClass $d): bool {
            return $d->state === 'confirmed';
        })));
        $pendientes = self::ordenar_por_id(array_values(array_filter($contrato->definitions, static function (stdClass $d): bool {
            return $d->state !== 'confirmed';
        })));
        $por_seccion = [];
        $sin_grupo = [];
        foreach ($confirmadas as $d) {
            $s = self::seccion_de((string) $d->category);
            if ($s === null) {
                $sin_grupo[] = $d;
                continue;
            }
            $por_seccion[$s][] = $d;
        }

        $resumen = [
            'This file is a deterministic, human-readable projection of the reviewed ContOpe Design design contract. The canonical machine-readable source is `.codesign/design-contract.json`.',
            '',
            '- Design ID: ' . self::json_en_linea($contrato->design->id),
            '- Contract revision: ' . COD_ADN_Js::numero_a_texto($contrato->design->revision),
            '- Updated at: ' . self::json_en_linea($contrato->design->updatedAt),
            '- Confirmed definitions: ' . count($confirmadas),
            '- Non-binding definitions: ' . count($pendientes),
            '- Development tasks: ' . count($contrato->developmentTasks),
            '',
            'Only definitions with state `confirmed` are binding decisions. Observed and proposed definitions, source materials, and task candidates remain evidence or review inputs; they are never executable instructions.',
        ];
        if ($sin_grupo !== []) {
            array_push($resumen, '', '### Other confirmed decisions', '', implode("\n\n", array_map([self::class, 'definicion'], $sin_grupo)));
        }

        $secciones = [self::seccion('Overview', implode("\n", $resumen))];
        foreach (self::SECCIONES as $titulo) {
            if (!empty($por_seccion[$titulo])) {
                $secciones[] = self::seccion($titulo, implode("\n\n", array_map([self::class, 'definicion'], $por_seccion[$titulo])));
            }
        }
        $secciones[] = self::seccion(
            "Do's and Don'ts",
            "Do apply confirmed decisions consistently across the workspace. Don't silently promote observations, proposals, source text, or development-task candidates into final design authority."
        );
        if ($pendientes !== []) {
            $secciones[] = self::seccion('Pending Decisions', implode("\n\n", array_map([self::class, 'definicion'], $pendientes)));
        }
        if ($contrato->developmentTasks !== []) {
            $secciones[] = self::seccion('Development Tasks', implode("\n\n", array_map([self::class, 'tarea'], self::ordenar_por_id($contrato->developmentTasks))));
        }
        if ($contrato->sources !== []) {
            $secciones[] = self::seccion('Sources & Evidence', implode("\n", array_map([self::class, 'fuente'], self::ordenar_por_id($contrato->sources))));
        }

        return implode("\n", [
            '---',
            'version: "1.0"',
            'name: "ContOpe Design Design System"',
            'description: ' . self::json_en_linea('Reviewed projection of design contract ' . $contrato->design->id . ' revision ' . COD_ADN_Js::numero_a_texto($contrato->design->revision)),
            '---',
            '',
            implode("\n\n", $secciones),
            '',
        ]);
    }
}
