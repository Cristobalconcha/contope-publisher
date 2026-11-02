<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Capas 1 y 2 del validador del ADN: el puerto de los dos parsers del Core.
 *
 *   parseDesignContract       (packages/core/src/design-contract.ts)
 *   parsePortableDesignModel  (packages/core/src/design-contract-portable.ts)
 *
 * PARIDAD EXACTA con el Core: el mismo contrato es válido o inválido en los dos lados, y
 * cuando es inválido cada rama `return null` que el Core recorre se anota en `traza` con
 * su `archivo:línea` del fuente del Core. El corpus (fixtures/adn/core) declara en
 * `cubre` esa misma traza, así que "misma razón de rechazo" se MIDE, no se afirma
 * (P1.1). Si el Core cambia sus líneas, scripts/adn/cobertura-corpus.mjs lo grita y hay
 * que releer este archivo contra el fuente nuevo.
 *
 * Entrada: lo que sale de `json_decode($texto, false)`: objetos como stdClass y listas
 * como arreglos. (Con `assoc = true` un `{}` y un `[]` son lo mismo, y el Core los
 * distingue: `isRecord` rechaza los arreglos.)
 *
 * No habla con WordPress.
 */
final class COD_ADN_Parser
{
    public const ARCHIVO_CONTRATO = 'packages/core/src/design-contract.ts';
    public const ARCHIVO_PORTABLE = 'packages/core/src/design-contract-portable.ts';

    public const SOURCE_USER = 'user';
    public const AUTORIDADES = ['human-confirmed', 'approved-guideline', 'deterministic-extraction', 'model-proposal'];
    public const ESTADOS_DEFINICION = ['observed', 'proposed', 'confirmed', 'rejected'];
    public const ESTADOS_TAREA = ['active', 'proposed', 'resolved', 'rejected'];
    public const PROPOSITOS = ['observation', 'guideline'];

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------

    private static function es_registro($v): bool
    {
        return $v instanceof stdClass;
    }

    /** ¿La clave está definida (el equivalente de `value[k] !== undefined`)? */
    private static function def(stdClass $o, string $k): bool
    {
        return property_exists($o, $k);
    }

    /** @return mixed */
    private static function get(stdClass $o, string $k)
    {
        return property_exists($o, $k) ? $o->{$k} : null;
    }

    private static function texto_no_vacio($v): bool
    {
        return COD_ADN_Js::texto_no_vacio($v);
    }

    private static function fecha($v): bool
    {
        return COD_ADN_Js::texto_no_vacio($v) && COD_ADN_Js::fecha_valida($v);
    }

    /** `Array.isArray(v) && v.every(nonEmptyString)` */
    private static function lista_de_textos($v): bool
    {
        if (!is_array($v)) {
            return false;
        }
        foreach ($v as $item) {
            if (!self::texto_no_vacio($item)) {
                return false;
            }
        }
        return true;
    }

    /** `SET.has(String(valor))` */
    private static function en_conjunto(stdClass $o, string $k, array $conjunto): bool
    {
        $texto = self::def($o, $k) ? COD_ADN_Js::a_texto($o->{$k}) : 'undefined';
        return in_array($texto, $conjunto, true);
    }

    private static function sin_repetidos(array $lista): bool
    {
        $vistos = [];
        foreach ($lista as $v) {
            $clave = 's' . $v;
            if (isset($vistos[$clave])) {
                return false;
            }
            $vistos[$clave] = true;
        }
        return true;
    }

    private static function marca(array &$traza, string $archivo, int $linea): void
    {
        $traza[] = $archivo . ':' . $linea;
    }

    // ------------------------------------------------------------------
    // parseDesignContract
    // ------------------------------------------------------------------

    private static function parse_source($v, array &$traza): ?stdClass
    {
        $c = self::ARCHIVO_CONTRATO;
        if (
            !self::es_registro($v)
            || !self::texto_no_vacio(self::get($v, 'id'))
            || !self::texto_no_vacio(self::get($v, 'technicalKind'))
            || !self::texto_no_vacio(self::get($v, 'label'))
            || !self::en_conjunto($v, 'purpose', self::PROPOSITOS)
            || !self::fecha(self::get($v, 'importedAt'))
        ) {
            self::marca($traza, $c, 130);
            return null;
        }
        if (self::def($v, 'locator') && !self::texto_no_vacio($v->locator)) {
            self::marca($traza, $c, 131);
            return null;
        }
        if (self::def($v, 'path') && !self::texto_no_vacio($v->path)) {
            self::marca($traza, $c, 132);
            return null;
        }
        $s = new stdClass();
        $s->id = $v->id;
        $s->technicalKind = $v->technicalKind;
        $s->purpose = $v->purpose;
        $s->label = $v->label;
        if (self::def($v, 'locator')) {
            $s->locator = $v->locator;
        }
        if (self::def($v, 'path')) {
            $s->path = $v->path;
        }
        $s->importedAt = $v->importedAt;
        return $s;
    }

    private static function parse_provenance_entry($v, array &$traza): ?stdClass
    {
        $c = self::ARCHIVO_CONTRATO;
        if (!self::es_registro($v) || !self::texto_no_vacio(self::get($v, 'sourceId'))) {
            self::marca($traza, $c, 145);
            return null;
        }
        if (self::def($v, 'locator') && !self::texto_no_vacio($v->locator)) {
            self::marca($traza, $c, 146);
            return null;
        }
        if (self::def($v, 'excerpt') && !self::texto_no_vacio($v->excerpt)) {
            self::marca($traza, $c, 147);
            return null;
        }
        $e = new stdClass();
        $e->sourceId = $v->sourceId;
        if (self::def($v, 'locator')) {
            $e->locator = $v->locator;
        }
        if (self::def($v, 'excerpt')) {
            $e->excerpt = $v->excerpt;
        }
        return $e;
    }

    private static function parse_definition($v, array &$traza): ?stdClass
    {
        $c = self::ARCHIVO_CONTRATO;
        if (
            !self::es_registro($v)
            || !self::texto_no_vacio(self::get($v, 'id'))
            || !self::texto_no_vacio(self::get($v, 'category'))
            || !self::texto_no_vacio(self::get($v, 'name'))
            || !self::en_conjunto($v, 'authority', self::AUTORIDADES)
            || !self::en_conjunto($v, 'state', self::ESTADOS_DEFINICION)
            || !self::lista_de_textos(self::get($v, 'evidenceSourceIds'))
            || !is_array(self::get($v, 'provenance'))
            || !self::lista_de_textos(self::get($v, 'constraintDefinitionIds'))
        ) {
            self::marca($traza, $c, 169);
            return null;
        }
        $procedencia = [];
        $alguna_nula = false;
        foreach ($v->provenance as $entrada) {
            $p = self::parse_provenance_entry($entrada, $traza);
            if ($p === null) {
                $alguna_nula = true;
            }
            $procedencia[] = $p;
        }
        if ($alguna_nula) {
            self::marca($traza, $c, 171);
            return null;
        }
        if (self::def($v, 'reviewedAt') && !self::fecha($v->reviewedAt)) {
            self::marca($traza, $c, 172);
            return null;
        }
        $d = new stdClass();
        $d->id = $v->id;
        $d->category = $v->category;
        $d->name = $v->name;
        if (self::def($v, 'value')) {
            $d->value = $v->value;
        }
        if (self::def($v, 'supersededValue')) {
            $d->supersededValue = $v->supersededValue;
        }
        $d->state = $v->state;
        $d->authority = $v->authority;
        $d->evidenceSourceIds = array_values($v->evidenceSourceIds);
        $d->provenance = $procedencia;
        $d->constraintDefinitionIds = array_values($v->constraintDefinitionIds);
        if (self::def($v, 'reviewedAt')) {
            $d->reviewedAt = $v->reviewedAt;
        }
        return $d;
    }

    /** @param array<string, true> $ids_de_definicion */
    private static function parse_development_task($v, array $ids_de_definicion, array &$traza): ?stdClass
    {
        $c = self::ARCHIVO_CONTRATO;
        if (
            !self::es_registro($v)
            || !self::texto_no_vacio(self::get($v, 'id'))
            || !self::texto_no_vacio(self::get($v, 'definitionId'))
            || !self::en_conjunto($v, 'state', self::ESTADOS_TAREA)
            || !self::lista_de_textos(self::get($v, 'constraintDefinitionIds'))
            || !self::lista_de_textos(self::get($v, 'candidateDefinitionIds'))
        ) {
            self::marca($traza, $c, 204);
            return null;
        }
        if (self::def($v, 'resolvedDefinitionId') && !self::texto_no_vacio($v->resolvedDefinitionId)) {
            self::marca($traza, $c, 206);
            return null;
        }
        if (self::def($v, 'reviewedAt') && !self::fecha($v->reviewedAt)) {
            self::marca($traza, $c, 207);
            return null;
        }
        $resuelta = self::def($v, 'resolvedDefinitionId');
        if (
            ($v->state === 'resolved') !== $resuelta
            || !self::sin_repetidos($v->constraintDefinitionIds)
            || !self::sin_repetidos($v->candidateDefinitionIds)
        ) {
            self::marca($traza, $c, 215);
            return null;
        }
        $candidatas = $v->candidateDefinitionIds;
        $id_resuelta = $resuelta ? $v->resolvedDefinitionId : null;
        if ($v->state === 'proposed' && count($candidatas) === 0) {
            self::marca($traza, $c, 218);
            return null;
        }
        if ($v->state === 'resolved' && !in_array($id_resuelta ?? '', $candidatas, true)) {
            self::marca($traza, $c, 220);
            return null;
        }
        $referencias = array_merge([$v->definitionId], $v->constraintDefinitionIds, $candidatas, $id_resuelta !== null ? [$id_resuelta] : []);
        foreach ($referencias as $ref) {
            if (!isset($ids_de_definicion['s' . $ref])) {
                self::marca($traza, $c, 227);
                return null;
            }
        }
        $t = new stdClass();
        $t->id = $v->id;
        $t->definitionId = $v->definitionId;
        $t->state = $v->state;
        $t->constraintDefinitionIds = array_values($v->constraintDefinitionIds);
        $t->candidateDefinitionIds = array_values($candidatas);
        if ($id_resuelta !== null) {
            $t->resolvedDefinitionId = $id_resuelta;
        }
        if (self::def($v, 'reviewedAt')) {
            $t->reviewedAt = $v->reviewedAt;
        }
        return $t;
    }

    /**
     * Lo mismo que `parseDesignContract(value)`.
     *
     * @param mixed $valor
     * @return array{valido: bool, salida: ?stdClass, traza: array<int, string>}
     */
    public static function analizar_contrato($valor): array
    {
        $traza = [];
        $salida = self::contrato($valor, $traza);
        return ['valido' => $salida !== null, 'salida' => $salida, 'traza' => array_values(array_unique($traza))];
    }

    private static function contrato($valor, array &$traza): ?stdClass
    {
        $c = self::ARCHIVO_CONTRATO;
        if (!self::es_registro($valor) || !self::igual_estricto(self::get($valor, 'schemaVersion'), 1)) {
            self::marca($traza, $c, 245);
            return null;
        }
        $diseno = self::get($valor, 'design');
        if (
            !self::es_registro($diseno)
            || !self::texto_no_vacio(self::get($diseno, 'id'))
            || !COD_ADN_Js::es_entero(self::get($diseno, 'revision'))
            || self::get($diseno, 'revision') < 1
            || !self::fecha(self::get($diseno, 'createdAt'))
            || !self::fecha(self::get($diseno, 'updatedAt'))
        ) {
            self::marca($traza, $c, 255);
            return null;
        }
        if (!is_array(self::get($valor, 'sources')) || !is_array(self::get($valor, 'definitions'))) {
            self::marca($traza, $c, 256);
            return null;
        }
        $fuentes = [];
        $definiciones = [];
        $alguna_nula = false;
        foreach ($valor->sources as $item) {
            $r = self::parse_source($item, $traza);
            $alguna_nula = $alguna_nula || $r === null;
            $fuentes[] = $r;
        }
        foreach ($valor->definitions as $item) {
            $r = self::parse_definition($item, $traza);
            $alguna_nula = $alguna_nula || $r === null;
            $definiciones[] = $r;
        }
        if ($alguna_nula) {
            self::marca($traza, $c, 260);
            return null;
        }
        $ids_fuente = array_map(static function (stdClass $s): string {
            return (string) $s->id;
        }, $fuentes);
        if (!self::sin_repetidos($ids_fuente)) {
            self::marca($traza, $c, 263);
            return null;
        }
        if (in_array(self::SOURCE_USER, $ids_fuente, true)) {
            self::marca($traza, $c, 264);
            return null;
        }
        $ids_def = array_map(static function (stdClass $d): string {
            return (string) $d->id;
        }, $definiciones);
        if (!self::sin_repetidos($ids_def)) {
            self::marca($traza, $c, 268);
            return null;
        }
        $set_fuentes = array_fill_keys(array_map(static function (string $s): string {
            return 's' . $s;
        }, $ids_fuente), true);
        $set_defs = array_fill_keys(array_map(static function (string $s): string {
            return 's' . $s;
        }, $ids_def), true);
        foreach ($definiciones as $d) {
            foreach ($d->evidenceSourceIds as $id) {
                if ($id === self::SOURCE_USER || !isset($set_fuentes['s' . $id])) {
                    self::marca($traza, $c, 288);
                    return null;
                }
            }
            foreach ($d->provenance as $p) {
                if ($p->sourceId !== self::SOURCE_USER && !isset($set_fuentes['s' . $p->sourceId])) {
                    self::marca($traza, $c, 288);
                    return null;
                }
            }
            foreach ($d->constraintDefinitionIds as $id) {
                if (!isset($set_defs['s' . $id])) {
                    self::marca($traza, $c, 288);
                    return null;
                }
            }
        }
        if (!is_array(self::get($valor, 'developmentTasks'))) {
            self::marca($traza, $c, 290);
            return null;
        }
        $tareas = [];
        $alguna_nula = false;
        foreach ($valor->developmentTasks as $t) {
            $r = self::parse_development_task($t, $set_defs, $traza);
            $alguna_nula = $alguna_nula || $r === null;
            $tareas[] = $r;
        }
        if ($alguna_nula) {
            self::marca($traza, $c, 293);
            return null;
        }
        $ids_tarea = array_map(static function (stdClass $t): string {
            return (string) $t->id;
        }, $tareas);
        if (!self::sin_repetidos($ids_tarea)) {
            self::marca($traza, $c, 295);
            return null;
        }
        $proyecciones = self::get($valor, 'projections');
        if (!self::es_registro($proyecciones)) {
            self::marca($traza, $c, 298);
            return null;
        }
        $designmd = self::get($proyecciones, 'designMd');
        if ($designmd !== null || !self::def($proyecciones, 'designMd')) {
            // `designMd !== null` también es verdad cuando falta la clave (undefined): el Core entra y falla.
            if (
                !self::es_registro($designmd)
                || self::get($designmd, 'path') !== 'DESIGN.md'
                || !COD_ADN_Js::es_entero(self::get($designmd, 'revision'))
                || self::get($designmd, 'revision') < 1
                || !self::fecha(self::get($designmd, 'generatedAt'))
            ) {
                self::marca($traza, $c, 308);
                return null;
            }
        }
        $salida = new stdClass();
        $salida->schemaVersion = 1;
        $salida->design = new stdClass();
        $salida->design->id = $diseno->id;
        $salida->design->revision = (int) $diseno->revision;
        $salida->design->createdAt = $diseno->createdAt;
        $salida->design->updatedAt = $diseno->updatedAt;
        $salida->sources = $fuentes;
        $salida->definitions = $definiciones;
        $salida->developmentTasks = $tareas;
        $salida->projections = new stdClass();
        if ($designmd === null) {
            $salida->projections->designMd = null;
        } else {
            $md = new stdClass();
            $md->path = 'DESIGN.md';
            $md->revision = (int) $designmd->revision;
            $md->generatedAt = $designmd->generatedAt;
            $salida->projections->designMd = $md;
        }
        return $salida;
    }

    // ------------------------------------------------------------------
    // parsePortableDesignModel
    // ------------------------------------------------------------------

    private static function claves_exactas(stdClass $o, array $claves): bool
    {
        $reales = array_map('strval', array_keys(get_object_vars($o)));
        if (count($reales) !== count($claves)) {
            return false;
        }
        foreach ($reales as $k) {
            if (!in_array($k, $claves, true)) {
                return false;
            }
        }
        return true;
    }

    private static function texto_acotado($v, ?int $max = null): bool
    {
        return is_string($v) && COD_ADN_Js::trim($v) !== '' && ($max === null || COD_ADN_Js::longitud($v) <= $max);
    }

    private static function fecha_hora($v): bool
    {
        return self::texto_acotado($v)
            && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/D', $v) === 1
            && COD_ADN_Js::fecha_valida($v);
    }

    private static function parse_transport($v, array &$traza): ?stdClass
    {
        $p = self::ARCHIVO_PORTABLE;
        if (!self::es_registro($v) || !self::claves_exactas($v, ['package', 'project'])) {
            self::marca($traza, $p, 106);
            return null;
        }
        if (!self::es_registro($v->package) || !self::es_registro($v->project)) {
            self::marca($traza, $p, 107);
            return null;
        }
        $pk = $v->package;
        $pr = $v->project;
        if (
            !self::claves_exactas($pk, ['id', 'revision'])
            || !self::claves_exactas($pr, ['id', 'name'])
            || !self::texto_acotado(self::get($pk, 'id'))
            || preg_match('/^urn:ocd:package:[A-Za-z0-9._-]+$/D', (string) $pk->id) !== 1
            || !self::texto_acotado(self::get($pk, 'revision'), 128)
            || !self::texto_acotado(self::get($pr, 'id'))
            || preg_match('/^urn:ocd:project:[A-Za-z0-9._-]+$/D', (string) $pr->id) !== 1
            || !self::texto_acotado(self::get($pr, 'name'), 200)
        ) {
            self::marca($traza, $p, 120);
            return null;
        }
        $t = new stdClass();
        $t->package = new stdClass();
        $t->package->id = $pk->id;
        $t->package->revision = $pk->revision;
        $t->project = new stdClass();
        $t->project->id = $pr->id;
        $t->project->name = $pr->name;
        return $t;
    }

    private static function parse_provenance($v, array &$traza): ?stdClass
    {
        $p = self::ARCHIVO_PORTABLE;
        if (
            !self::es_registro($v)
            || !self::claves_exactas($v, ['producer', 'producerVersion', 'exportedAt'])
            || self::get($v, 'producer') !== 'contope-design-desktop'
            || !self::texto_acotado(self::get($v, 'producerVersion'), 40)
            || preg_match('/^[0-9]+(?:\.[0-9]+){0,3}(?:[-+][A-Za-z0-9._-]+)?$/D', (string) $v->producerVersion) !== 1
            || !self::fecha_hora(self::get($v, 'exportedAt'))
        ) {
            self::marca($traza, $p, 137);
            return null;
        }
        $r = new stdClass();
        $r->producer = 'contope-design-desktop';
        $r->producerVersion = $v->producerVersion;
        $r->exportedAt = $v->exportedAt;
        return $r;
    }

    /** `value === contract.design.x` para un escalar de JSON. */
    private static function igual_estricto($a, $b): bool
    {
        if (COD_ADN_Js::es_numero_finito($a) && COD_ADN_Js::es_numero_finito($b)) {
            return (float) $a === (float) $b;
        }
        return $a === $b;
    }

    private static function mismo_diseno($v, stdClass $contrato): bool
    {
        return self::es_registro($v)
            && self::claves_exactas($v, ['id', 'revision', 'createdAt', 'updatedAt'])
            && self::igual_estricto(self::get($v, 'id'), $contrato->design->id)
            && self::igual_estricto(self::get($v, 'revision'), $contrato->design->revision)
            && self::igual_estricto(self::get($v, 'createdAt'), $contrato->design->createdAt)
            && self::igual_estricto(self::get($v, 'updatedAt'), $contrato->design->updatedAt);
    }

    /**
     * Lo mismo que `parsePortableDesignModel(value)`.
     *
     * @param mixed $valor
     * @return array{valido: bool, salida: ?stdClass, traza: array<int, string>}
     */
    public static function analizar_portable($valor): array
    {
        $traza = [];
        $salida = self::portable($valor, $traza);
        return ['valido' => $salida !== null, 'salida' => $salida, 'traza' => array_values(array_unique($traza))];
    }

    private static function portable($valor, array &$traza): ?stdClass
    {
        $p = self::ARCHIVO_PORTABLE;
        if (
            !self::es_registro($valor)
            || !self::claves_exactas($valor, ['schemaVersion', 'kind', 'design', 'transport', 'provenance', 'contract', 'designMd'])
            || !self::igual_estricto(self::get($valor, 'schemaVersion'), 1)
            || self::get($valor, 'kind') !== 'contope/design-model'
        ) {
            self::marca($traza, $p, 222);
            return null;
        }
        $contrato = self::contrato($valor->contract, $traza);
        $transporte = self::parse_transport($valor->transport, $traza);
        $procedencia = self::parse_provenance($valor->provenance, $traza);
        $md = self::get($valor, 'designMd');
        if (
            $contrato === null
            || $transporte === null
            || $procedencia === null
            || !self::mismo_diseno($valor->design, $contrato)
            || !self::es_registro($md)
            || !self::claves_exactas($md, ['path', 'revision', 'content'])
            || self::get($md, 'path') !== 'design/DESIGN.md'
            || !self::igual_estricto(self::get($md, 'revision'), $contrato->design->revision)
            || !is_string(self::get($md, 'content'))
            || $md->content !== COD_ADN_Design_Md::renderizar($contrato)
        ) {
            self::marca($traza, $p, 239);
            return null;
        }
        $salida = new stdClass();
        $salida->schemaVersion = 1;
        $salida->kind = 'contope/design-model';
        $salida->design = clone $contrato->design;
        $salida->transport = $transporte;
        $salida->provenance = $procedencia;
        $salida->contract = $contrato;
        $salida->designMd = new stdClass();
        $salida->designMd->path = 'design/DESIGN.md';
        $salida->designMd->revision = $contrato->design->revision;
        $salida->designMd->content = $md->content;
        return $salida;
    }
}
