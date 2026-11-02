<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Lo que el Core dice de la FORMA de cada requisito que la web consume (R2).
 *
 * Es el puerto de los `payloadSchema` de packages/core/src/requirement-manifest
 * (manifest-v0-dim{1,2,3,4,8}.ts) y de su validador (payload.ts, css-values.ts), sólo
 * para los requisitos que el plugin proyecta:
 *
 *   dim1.req01 paleta · dim1.req02 roles de color · dim2.req01 familias ·
 *   dim2.req02 roles tipográficos · dim2.req07 correspondencia con el almacén plano ·
 *   dim3.req01 escala de espacio · dim3.req02 roles de espacio · dim4.req02 formas ·
 *   dim8.req03 escala de duraciones
 *
 * (`dim9.req03` queda fuera mientras dure Q3). Los demás requisitos se GUARDAN y se
 * listan en `ignored[]` (R4); nunca se descartan ni se emiten.
 *
 * Las listas cerradas (roles) están en un solo lugar a propósito: si el Core las abre
 * (Q1) se cambia acá y se agrega un caso al corpus.
 *
 * Lo que NO hace este archivo: leer el manifiesto del Core en tiempo de ejecución (el
 * hosting no tiene el repositorio del Core). Si el manifiesto cambia, esta tabla se
 * actualiza a mano; scripts/adn/validar-adn.mjs (la barrera de Node) es el que lo
 * detectaría si el Core está disponible.
 */
final class COD_ADN_Requisitos
{
    public const ROLES_COLOR = ['background', 'surface', 'text', 'border', 'accent', 'action', 'info', 'success', 'warning', 'error', 'active', 'inactive', 'focus'];
    public const ROLES_TIPOGRAFICOS = ['display', 'título', 'subtítulo', 'cuerpo', 'cita', 'nota', 'leyenda', 'dato', 'control'];
    public const ROLES_ESPACIO = ['intraelemento', 'interelemento', 'entre-secciones'];
    public const RADIOS = ['longitud', 'none', 'pill', 'circle'];
    public const CAMPOS_PLANOS = ['font_heading', 'font_body', 'font_accent', 'size_base', 'h1_size', 'h2_size', 'h3_size', 'h4_size', 'h5_size', 'h6_size'];
    public const MAX_MOTIVOS = 20;

    /** Requisitos que la web proyecta. */
    public const PROYECTADOS = ['dim1.req01', 'dim1.req02', 'dim2.req01', 'dim2.req02', 'dim2.req07', 'dim3.req01', 'dim3.req02', 'dim4.req02', 'dim8.req03'];

    /** @var array<string, array<string, mixed>>|null */
    private static ?array $esquemas = null;

    /** El requisito de una definición: `dim1.req01.def2` → `dim1.req01`; si no calza, null. */
    public static function requisito_de(string $id_definicion): ?string
    {
        if (preg_match('/^(dim(?:[1-9]|10)\.req[0-9]{2})\.def[0-9]+$/D', $id_definicion, $m) === 1) {
            return $m[1];
        }
        return null;
    }

    public static function es_proyectado(?string $requisito): bool
    {
        return $requisito !== null && in_array($requisito, self::PROYECTADOS, true);
    }

    // ------------------------------------------------------------------
    // Constructores del esquema
    // ------------------------------------------------------------------

    private static function t(string $k, array $extra = []): array
    {
        return ['k' => $k] + $extra;
    }

    private static function lista(array $de): array
    {
        return ['k' => 'lista', 'of' => $de];
    }

    /** @param array<string, array<string, mixed>> $campos */
    private static function objeto(array $campos): array
    {
        return ['k' => 'objeto', 'f' => $campos];
    }

    private static function campo(array $tipo, bool $opcional = false): array
    {
        return ['t' => $tipo, 'opt' => $opcional];
    }

    private static function conjunto(array $valores): array
    {
        return ['k' => 'enum', 'v' => $valores];
    }

    private static function numero(?float $min = null, ?float $max = null): array
    {
        return ['k' => 'numero', 'min' => $min, 'max' => $max];
    }

    private static function ref(?string $req = null): array
    {
        return ['k' => 'ref', 'req' => $req];
    }

    private static function union(array $miembros): array
    {
        return ['k' => 'union', 'of' => $miembros];
    }

    /** @return array<string, array<string, mixed>> requisito → slot → campo */
    public static function esquemas(): array
    {
        if (self::$esquemas !== null) {
            return self::$esquemas;
        }
        $color = self::t('color');
        $largo = self::t('longitud');
        $texto = self::t('texto');
        $derivacion = static function (string $de): array {
            return self::objeto(['of' => self::campo(self::conjunto([$de, 'direct'])), 'rule' => self::campo(self::t('texto'), true)]);
        };
        self::$esquemas = [
            'dim1.req01' => [
                'institucionales' => self::campo(self::lista(self::objeto(['name' => self::campo($texto), 'value' => self::campo($color)]))),
                'neutros' => self::campo(self::lista(self::objeto(['name' => self::campo($texto), 'value' => self::campo($color)]))),
            ],
            'dim1.req02' => [
                'roleColors' => self::campo(self::lista(self::objeto([
                    'role' => self::campo(self::conjunto(self::ROLES_COLOR)),
                    'color' => self::campo(self::union([self::ref('dim1.req01'), $color])),
                    'source' => self::campo($texto),
                    'derivation' => self::campo($derivacion('dim1.req01')),
                ]))),
            ],
            'dim2.req01' => [
                'familias' => self::campo(self::lista(self::objeto([
                    'name' => self::campo($texto),
                    'stack' => self::campo(self::lista($texto)),
                    'idiomas' => self::campo(self::lista($texto)),
                    'licencia' => self::campo($texto),
                ]))),
            ],
            'dim2.req02' => [
                'roleStyles' => self::campo(self::lista(self::objeto([
                    'role' => self::campo(self::conjunto(self::ROLES_TIPOGRAFICOS)),
                    'family' => self::campo(self::union([self::ref('dim2.req01'), $texto])),
                    'fontSize' => self::campo($largo),
                    'fontWeight' => self::campo(self::numero(100, 900)),
                    'lineHeight' => self::campo(self::numero(0.8, 3)),
                    'letterSpacing' => self::campo($largo, true),
                    'source' => self::campo($texto),
                    'derivation' => self::campo($derivacion('dim2.req01')),
                ]))),
            ],
            'dim2.req07' => [
                'correspondencias' => self::campo(self::lista(self::objeto([
                    'campoPlano' => self::campo(self::conjunto(self::CAMPOS_PLANOS)),
                    'role' => self::campo(self::ref('dim2.req02')),
                    'nota' => self::campo($texto),
                ]))),
            ],
            'dim3.req01' => [
                'unidad' => self::campo($largo),
                'escala' => self::campo(self::lista(self::objeto(['step' => self::campo(self::numero(1)), 'value' => self::campo($largo)]))),
            ],
            'dim3.req02' => [
                'roleSpacing' => self::campo(self::lista(self::objeto([
                    'role' => self::campo(self::conjunto(self::ROLES_ESPACIO)),
                    'value' => self::campo(self::union([self::ref('dim3.req01'), $largo])),
                    'source' => self::campo($texto),
                    'derivation' => self::campo($derivacion('dim3.req01')),
                ]))),
            ],
            'dim4.req02' => [
                'formas' => self::campo(self::lista(self::objeto([
                    'rol' => self::campo(self::ref()),
                    'vocabulario' => self::campo($texto),
                    'radio' => self::campo(self::conjunto(self::RADIOS)),
                    'radioValor' => self::campo($largo, true),
                ]))),
            ],
            'dim8.req03' => [
                'escala' => self::campo(self::lista(self::objeto(['nombre' => self::campo($texto), 'duracion' => self::campo(self::numero(0, 5000))]))),
                'ritmo' => self::campo(self::objeto([
                    'descripcion' => self::campo($texto),
                    'pausas' => self::campo(self::lista($texto), true),
                    'sinPausas' => self::campo($texto, true),
                ])),
            ],
        ];
        return self::$esquemas;
    }

    // ------------------------------------------------------------------
    // css-values.ts
    // ------------------------------------------------------------------

    private static function es_numero_plano(string $crudo): bool
    {
        return preg_match('/^(?:\d{1,3}(?:\.\d+)?)$/D', $crudo) === 1;
    }

    private static function componentes_rgb_validos(string $s, int $cuenta): bool
    {
        if (preg_match('/^rgba?\(\s*(.*?)\s*\)$/iD', $s, $m) !== 1) {
            return false;
        }
        $partes = array_map([COD_ADN_Js::class, 'trim'], explode(',', $m[1]));
        if (count($partes) !== $cuenta) {
            return false;
        }
        foreach ($partes as $p) {
            if ($p === '') {
                return false;
            }
        }
        foreach (array_slice($partes, 0, 3) as $p) {
            if (substr($p, -1) === '%') {
                $n = substr($p, 0, -1);
                if (!self::es_numero_plano($n) || (float) $n > 100) {
                    return false;
                }
            } elseif (!self::es_numero_plano($p) || (float) $p > 255) {
                return false;
            }
        }
        if ($cuenta === 4) {
            $alfa = $partes[3];
            if (substr($alfa, -1) === '%') {
                $n = substr($alfa, 0, -1);
                if (!self::es_numero_plano($n) || (float) $n > 100) {
                    return false;
                }
            } elseif (preg_match('/^(?:0(?:\.[0-9]+)?|1(?:\.0+)?|\.[0-9]+)$/D', $alfa) !== 1 || (float) $alfa > 1) {
                return false;
            }
        }
        return true;
    }

    /** `isColorCss` del Core. */
    public static function es_color_css($valor): bool
    {
        if (!is_string($valor)) {
            return false;
        }
        $s = COD_ADN_Js::trim($valor);
        if ($s === '') {
            return false;
        }
        $comp = '(?:\d{1,3}(?:\.\d+)?%?|\d{1,3})';
        $alfa = '(?:\d+(?:\.\d+)?%|0(?:\.\d+)?|1(?:\.0+)?|\.\d+)';
        $matiz = '(?:\d{1,3}(?:\.\d+)?)';
        $pct = '(?:\d{1,3}(?:\.\d+)?%)';
        if (preg_match('/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iD', $s) === 1) {
            return true;
        }
        if (preg_match('/^oklch\(\s*\d{1,3}(?:\.\d+)?%?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?%?)?\s*\)$/iD', $s) === 1) {
            return true;
        }
        if (preg_match('/^rgb\(\s*' . $comp . '\s*,\s*' . $comp . '\s*,\s*' . $comp . '\s*\)$/iD', $s) === 1) {
            return self::componentes_rgb_validos($s, 3);
        }
        if (preg_match('/^rgba\(\s*' . $comp . '\s*,\s*' . $comp . '\s*,\s*' . $comp . '\s*,\s*' . $alfa . '\s*\)$/iD', $s) === 1) {
            return self::componentes_rgb_validos($s, 4);
        }
        if (preg_match('/^hsl\(\s*' . $matiz . '\s*,\s*' . $pct . '\s*,\s*' . $pct . '\s*\)$/iD', $s) === 1) {
            if (preg_match('/^hsl\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*\)$/iD', $s, $m) === 1) {
                $matiz_txt = $m[1];
                if ($matiz_txt === '' || !self::es_numero_plano($matiz_txt) || (float) $matiz_txt > 360) {
                    return false;
                }
            }
            return true;
        }
        if (preg_match('/^hsla\(\s*' . $matiz . '\s*,\s*' . $pct . '\s*,\s*' . $pct . '\s*,\s*' . $alfa . '\s*\)$/iD', $s) === 1) {
            if (preg_match('/^hsla\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*\)$/iD', $s, $m) === 1) {
                $matiz_txt = $m[1];
                if ($matiz_txt === '' || !self::es_numero_plano($matiz_txt) || (float) $matiz_txt > 360) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    /** `isLengthCss` del Core. */
    public static function es_longitud_css($valor): bool
    {
        if (!is_string($valor)) {
            return false;
        }
        $s = COD_ADN_Js::trim($valor);
        if ($s === '') {
            return false;
        }
        return preg_match('/^(?:0(?:\.0+)?|(?:\d+(?:\.\d+)?)(?:px|rem|em|%|vh|vw|ch|ex|pt|pc|cm|mm|in|q))$/iD', $s) === 1;
    }

    // ------------------------------------------------------------------
    // payload.ts
    // ------------------------------------------------------------------

    /** `isRefValue` del Core. */
    public static function es_ref($v): bool
    {
        if (!$v instanceof stdClass || !property_exists($v, 'refReqId') || !property_exists($v, 'refPath')) {
            return false;
        }
        if (!is_string($v->refReqId) || !is_array($v->refPath)) {
            return false;
        }
        foreach ($v->refPath as $seg) {
            if (!is_string($seg) && !COD_ADN_Js::es_numero_finito($seg)) {
                return false;
            }
        }
        return true;
    }

    /**
     * `validateAgainstType`: agrega los motivos como ['ruta' => ..., 'mensaje' => ...].
     *
     * @param mixed $valor
     * @param array<int, array{ruta: string, mensaje: string}> $motivos
     */
    private static function validar_tipo($valor, array $tipo, string $ruta, array &$motivos): void
    {
        $agregar = static function (string $mensaje) use (&$motivos, $ruta): void {
            if (count($motivos) < self::MAX_MOTIVOS) {
                $motivos[] = ['ruta' => $ruta, 'mensaje' => $mensaje];
            }
        };
        switch ($tipo['k']) {
            case 'color':
                if (!self::es_color_css($valor)) {
                    $agregar("slot '$ruta': no es un color-css válido (hex/rgb/hsl/oklch plano)");
                }
                return;
            case 'longitud':
                if (!self::es_longitud_css($valor)) {
                    $agregar("slot '$ruta': no es una longitud-css válida");
                }
                return;
            case 'texto':
                if (!is_string($valor)) {
                    $agregar("slot '$ruta': se esperaba texto");
                }
                return;
            case 'enum':
                if (!is_string($valor) || !in_array($valor, $tipo['v'], true)) {
                    $agregar("slot '$ruta': se esperaba uno de enum(" . implode('|', $tipo['v']) . ')');
                }
                return;
            case 'numero':
                if (!COD_ADN_Js::es_numero_finito($valor)) {
                    $agregar("slot '$ruta': se esperaba numero");
                    return;
                }
                if ($tipo['min'] !== null && $valor < $tipo['min']) {
                    $agregar("slot '$ruta': numero " . COD_ADN_Js::numero_a_texto($valor) . ' por debajo del mínimo');
                }
                if ($tipo['max'] !== null && $valor > $tipo['max']) {
                    $agregar("slot '$ruta': numero " . COD_ADN_Js::numero_a_texto($valor) . ' por encima del máximo');
                }
                return;
            case 'ref':
                if (!self::es_ref($valor)) {
                    $agregar("slot '$ruta': se esperaba ref (objeto { refReqId, refPath })");
                    return;
                }
                if ($tipo['req'] !== null && $valor->refReqId !== $tipo['req']) {
                    $agregar("slot '$ruta': ref apunta a '{$valor->refReqId}', se esperaba '{$tipo['req']}'");
                }
                return;
            case 'lista':
                if (!is_array($valor)) {
                    $agregar("slot '$ruta': se esperaba lista(...)");
                    return;
                }
                foreach ($valor as $i => $item) {
                    self::validar_tipo($item, $tipo['of'], $ruta . '[' . $i . ']', $motivos);
                }
                return;
            case 'objeto':
                if (!$valor instanceof stdClass) {
                    $agregar("slot '$ruta': se esperaba objeto");
                    return;
                }
                foreach ($tipo['f'] as $nombre => $campo) {
                    $nombre = (string) $nombre;
                    if (!property_exists($valor, $nombre)) {
                        if (!$campo['opt'] && count($motivos) < self::MAX_MOTIVOS) {
                            $motivos[] = ['ruta' => $ruta . '.' . $nombre, 'mensaje' => "slot '$ruta': campo obligatorio '$nombre' ausente"];
                        }
                        continue;
                    }
                    self::validar_tipo($valor->{$nombre}, $campo['t'], $ruta . '.' . $nombre, $motivos);
                }
                return;
            case 'union':
                foreach ($tipo['of'] as $miembro) {
                    $propios = [];
                    self::validar_tipo($valor, $miembro, $ruta, $propios);
                    if ($propios === []) {
                        return;
                    }
                }
                $agregar("slot '$ruta': no cumple ningún miembro de la unión");
                return;
        }
    }

    /**
     * `validatePayload`: la forma del `value` contra el esquema del requisito.
     *
     * @param mixed $valor
     * @return array<int, array{ruta: string, mensaje: string}> vacío = cumple
     */
    public static function validar_forma(string $requisito, $valor): array
    {
        $esquema = self::esquemas()[$requisito] ?? null;
        if ($esquema === null) {
            return [];
        }
        if (!$valor instanceof stdClass) {
            return [['ruta' => '', 'mensaje' => 'el payload debe ser un objeto (la definición efectiva del requisito)']];
        }
        $motivos = [];
        foreach ($esquema as $slot => $campo) {
            $slot = (string) $slot;
            if (!property_exists($valor, $slot)) {
                if (!$campo['opt']) {
                    $motivos[] = ['ruta' => $slot, 'mensaje' => "slot obligatorio '$slot' ausente del payload"];
                }
                continue;
            }
            self::validar_tipo($valor->{$slot}, $campo['t'], $slot, $motivos);
        }
        return $motivos;
    }

    /**
     * El tipo que un `ref` en la ruta dada debe alcanzar, o null si el esquema no lo dice.
     * Si el slot es una unión, el valor alcanzado debe cumplir alguno de los miembros que NO
     * son ref (p. ej. `color`): es lo que distingue "llegó al nombre «Verde oliva»" de
     * "llegó a un color".
     *
     * @param array<int, string|int> $ruta
     * @return array<int, array<string, mixed>>|null miembros aceptables (no ref)
     */
    public static function tipo_esperado_de_ref(string $requisito, array $ruta): ?array
    {
        $esquema = self::esquemas()[$requisito] ?? null;
        if ($esquema === null || $ruta === []) {
            return null;
        }
        $slot = (string) $ruta[0];
        if (!isset($esquema[$slot])) {
            return null;
        }
        $tipo = $esquema[$slot]['t'];
        foreach (array_slice($ruta, 1) as $segmento) {
            if ($tipo['k'] === 'lista') {
                $tipo = $tipo['of'];
            } elseif ($tipo['k'] === 'objeto' && isset($tipo['f'][(string) $segmento])) {
                $tipo = $tipo['f'][(string) $segmento]['t'];
            } else {
                return null;
            }
        }
        if ($tipo['k'] !== 'union') {
            return null;
        }
        $miembros = array_values(array_filter($tipo['of'], static function (array $m): bool {
            return $m['k'] !== 'ref';
        }));
        return $miembros === [] ? null : $miembros;
    }

    /**
     * ¿El valor alcanzado por un ref cumple alguno de los miembros esperados?
     *
     * @param array<int, array<string, mixed>> $miembros
     */
    public static function cumple_alguno($valor, array $miembros): bool
    {
        foreach ($miembros as $m) {
            $propios = [];
            self::validar_tipo($valor, $m, '', $propios);
            if ($propios === []) {
                return true;
            }
        }
        return false;
    }
}
