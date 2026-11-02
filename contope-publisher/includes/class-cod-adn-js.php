<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Las pocas semánticas de JavaScript de las que depende el Core y que PHP no trae.
 *
 * POR QUÉ EXISTE. El validador del ADN (COD_ADN_Validator) es un PUERTO de
 * `parseDesignContract` y `parsePortableDesignModel`, que corren en V8. Para que
 * "mismo válido/inválido" sea cierto (P1.1) hay que reproducir cuatro cosas en las
 * que PHP y V8 no coinciden:
 *
 *   - `String.prototype.trim` quita espacios Unicode (NBSP, U+FEFF, U+2028…); el
 *     `trim()` de PHP sólo quita ASCII;
 *   - `length` cuenta unidades UTF-16, no bytes ni caracteres;
 *   - `Date.parse`, que el Core usa como criterio de "fecha ISO" (y que en V8 acepta
 *     más de lo que dice su nombre);
 *   - el orden de `Array.prototype.sort` sobre texto (unidades UTF-16) y la forma en
 *     que `JSON.stringify` imprime números y claves enteras.
 *
 * Esta clase NO usa WordPress: la prueba del corpus la carga con PHP solo.
 */
final class COD_ADN_Js
{
    /** Espacio en blanco de ECMAScript (WhiteSpace + LineTerminator). */
    private const ESPACIO = '\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

    public static function trim(string $texto): string
    {
        $r = preg_replace('/^[' . self::ESPACIO . ']+|[' . self::ESPACIO . ']+$/u', '', $texto);
        // Un texto que no es UTF-8 válido no llega acá (json_decode lo rechaza); si llegara, no se recorta.
        return is_string($r) ? $r : $texto;
    }

    /** Equivale a `typeof v === 'string' && v.trim().length > 0`. */
    public static function texto_no_vacio($valor): bool
    {
        return is_string($valor) && self::trim($valor) !== '';
    }

    /** Longitud en unidades UTF-16, como `String.prototype.length`. */
    public static function longitud(string $texto): int
    {
        if ($texto === '') {
            return 0;
        }
        $u16 = function_exists('mb_convert_encoding') ? @mb_convert_encoding($texto, 'UTF-16LE', 'UTF-8') : false;
        if (!is_string($u16)) {
            return strlen($texto);
        }
        return intdiv(strlen($u16), 2);
    }

    /** Orden de `a < b` de JavaScript: por unidades UTF-16. */
    public static function comparar(string $a, string $b): int
    {
        if ($a === $b) {
            return 0;
        }
        $sin_astrales = static function (string $s): bool {
            // Sin caracteres fuera del plano básico (cuatro bytes en UTF-8), strcmp coincide con el orden UTF-16.
            return preg_match('/[\x{10000}-\x{10FFFF}]/u', $s) !== 1;
        };
        if ($sin_astrales($a) && $sin_astrales($b)) {
            return strcmp($a, $b) <=> 0;
        }
        $x = @mb_convert_encoding($a, 'UTF-16BE', 'UTF-8');
        $y = @mb_convert_encoding($b, 'UTF-16BE', 'UTF-8');
        if (!is_string($x) || !is_string($y)) {
            return strcmp($a, $b) <=> 0;
        }
        return strcmp($x, $y) <=> 0;
    }

    /** `Number.isInteger(v)` para un valor salido de json_decode. */
    public static function es_entero($valor): bool
    {
        if (is_int($valor)) {
            return true;
        }
        return is_float($valor) && is_finite($valor) && floor($valor) === $valor;
    }

    /** `typeof v === 'number' && Number.isFinite(v)`. */
    public static function es_numero_finito($valor): bool
    {
        return is_int($valor) || (is_float($valor) && is_finite($valor));
    }

    /**
     * `String(v)` para lo que puede llegar de un JSON. El Core lo usa en
     * `PURPOSE_VALUES.has(String(value['purpose']))`: una lista ["observation"] pasa
     * porque String(["observation"]) es "observation".
     *
     * @param mixed $valor
     */
    public static function a_texto($valor): string
    {
        if (is_string($valor)) {
            return $valor;
        }
        if (is_int($valor) || is_float($valor)) {
            return self::numero_a_texto($valor);
        }
        if (is_bool($valor)) {
            return $valor ? 'true' : 'false';
        }
        if ($valor === null) {
            return 'null';
        }
        if (is_array($valor)) {
            return implode(',', array_map(static function ($v): string {
                return $v === null ? '' : self::a_texto($v);
            }, $valor));
        }
        return '[object Object]';
    }

    /** `Number.prototype.toString()` (y por tanto lo que imprime JSON.stringify). */
    public static function numero_a_texto($n): string
    {
        if (is_int($n)) {
            return (string) $n;
        }
        if (is_nan($n)) {
            return 'NaN';
        }
        if (is_infinite($n)) {
            return $n > 0 ? 'Infinity' : '-Infinity';
        }
        if ($n == 0.0) {
            return '0';
        }
        $negativo = $n < 0;
        $previa = ini_set('serialize_precision', '-1');
        $s = json_encode(abs($n));
        if ($previa !== false) {
            ini_set('serialize_precision', (string) $previa);
        }
        if (!is_string($s) || preg_match('/^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/', $s, $m) !== 1) {
            return (string) $n;
        }
        $entera = $m[1];
        $fraccion = $m[2] ?? '';
        $exponente = isset($m[3]) ? (int) $m[3] : 0;
        $digitos = $entera . $fraccion;
        $punto = strlen($entera) + $exponente; // posición del punto decimal contando desde el primer dígito
        while (strlen($digitos) > 1 && $digitos[0] === '0') {
            $digitos = substr($digitos, 1);
            --$punto;
        }
        $digitos = rtrim($digitos, '0');
        if ($digitos === '') {
            return '0';
        }
        $k = strlen($digitos);
        $n10 = $punto;
        if ($k <= $n10 && $n10 <= 21) {
            $texto = $digitos . str_repeat('0', $n10 - $k);
        } elseif (0 < $n10 && $n10 <= 21) {
            $texto = substr($digitos, 0, $n10) . '.' . substr($digitos, $n10);
        } elseif (-6 < $n10 && $n10 <= 0) {
            $texto = '0.' . str_repeat('0', -$n10) . $digitos;
        } else {
            $e = $n10 - 1;
            $signo = $e < 0 ? '-' : '+';
            $texto = ($k === 1 ? $digitos : $digitos[0] . '.' . substr($digitos, 1)) . 'e' . $signo . abs($e);
        }
        return ($negativo ? '-' : '') . $texto;
    }

    /**
     * `JSON.stringify` de un TEXTO. Comillas, barra invertida y controles se escapan;
     * lo demás (Unicode, "/") queda tal cual. PHP escribe U+2028/2029 como
     * salvo que se le pida lo contrario: JSON.stringify no lo hace.
     */
    public static function json_texto(string $texto): string
    {
        $r = json_encode($texto, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
        return is_string($r) ? $r : '""';
    }

    // ------------------------------------------------------------------
    // Date.parse: ¿es NaN o no?
    // ------------------------------------------------------------------

    /**
     * ¿`Number.isNaN(Date.parse($texto))` es falso? Sólo importa la VALIDEZ, no el
     * instante, porque el Core usa `Date.parse` únicamente como criterio.
     *
     * Reproduce la gramática ISO de ECMAScript con las extensiones de V8 que se midieron
     * (día no validado contra el mes: 2026-02-30 vale; "t" y "z" en minúscula; zona
     * ±HHMM; "Z" tras una fecha sola) y un subconjunto de los formatos "legados" de V8:
     * nombre de mes, RFC 2822 y M/D/A. NO reproduce las demás indulgencias del motor
     * (por ejemplo, ignorar palabras desconocidas antes del primer número:
     * `Date.parse("foo 1")` es válido en V8). Esas divergencias están medidas y listadas
     * en fixtures/adn/fechas-v8.json (`noReproducidas`) y la prueba las exige tal cual.
     */
    public static function fecha_valida(string $texto): bool
    {
        if (self::iso_valida($texto)) {
            return true;
        }
        $recortado = self::trim($texto);
        if ($recortado === '') {
            return false;
        }
        // V8 admite espacios alrededor de una fecha sola, pero no después de una forma con "T".
        if ($recortado !== $texto && !self::tiene_t($recortado) && self::iso_valida($recortado)) {
            return true;
        }
        return self::legada_valida($recortado);
    }

    private static function tiene_t(string $s): bool
    {
        return preg_match('/\d[Tt]\d/', $s) === 1;
    }

    private static function iso_valida(string $s): bool
    {
        $re = '/^(?:(?<anio>[+-]\d{6}|\d{4})(?:-(?<mes>\d{2})(?:-(?<dia>\d{2}))?)?)'
            . '(?:[Tt](?<h>\d{2}):(?<mi>\d{2})(?::(?<s>\d{2})(?:\.(?<ms>\d+))?)?)?'
            . '(?<tz>[Zz]|[+-]\d{2}:?\d{2})?$/D';
        if (preg_match($re, $s, $m) !== 1) {
            return false;
        }
        $anio = $m['anio'];
        if ($anio === '-000000') {
            return false;
        }
        $anio_n = (int) $anio;
        if (abs($anio_n) > 275760) {
            return false;
        }
        $mes = ($m['mes'] ?? '') === '' ? 1 : (int) $m['mes'];
        $dia = ($m['dia'] ?? '') === '' ? 1 : (int) $m['dia'];
        if ($mes < 1 || $mes > 12 || $dia < 1 || $dia > 31) {
            return false;
        }
        $hay_hora = ($m['h'] ?? '') !== '';
        $h = $hay_hora ? (int) $m['h'] : 0;
        $mi = $hay_hora ? (int) $m['mi'] : 0;
        $seg = ($m['s'] ?? '') === '' ? 0 : (int) $m['s'];
        $ms = ($m['ms'] ?? '') === '' ? 0 : (int) substr(str_pad(substr($m['ms'], 0, 3), 3, '0'), 0, 3);
        if ($h > 24 || $mi > 59 || $seg > 59) {
            return false;
        }
        if ($h === 24 && ($mi !== 0 || $seg !== 0 || $ms !== 0)) {
            return false;
        }
        if (($m['tz'] ?? '') !== '' && $m['tz'][0] !== 'Z' && $m['tz'][0] !== 'z') {
            $dig = str_replace(':', '', substr($m['tz'], 1));
            if ((int) substr($dig, 0, 2) > 23 || (int) substr($dig, 2, 2) > 59) {
                return false;
            }
        }
        if (abs($anio_n) === 275760) {
            // Límite del rango de Date: 275760-09-13T00:00:00.000Z.
            if ($anio_n < 0) {
                return $mes > 4 || ($mes === 4 && $dia >= 20);
            }
            if ($mes > 9 || ($mes === 9 && $dia > 13) || ($mes === 9 && $dia === 13 && ($h !== 0 || $mi !== 0 || $seg !== 0 || $ms !== 0))) {
                return false;
            }
        }
        return true;
    }

    private static function legada_valida(string $s): bool
    {
        // Los paréntesis son comentario en el analizador legado de V8.
        $s = preg_replace('/\([^)]*\)/', ' ', $s) ?? $s;
        $s = trim(preg_replace('/[\s,]+/', ' ', $s) ?? $s);
        if ($s === '') {
            return false;
        }
        $mes = '(?<mon>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?';
        $dow = '(?:(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*\.? )?';
        $hora = '(?: (?<h>\d{1,2}):(?<mi>\d{2})(?::(?<s>\d{2})(?:\.\d+)?)?(?: ?(?<ap>am|pm))?)?';
        $zona = '(?: ?(?:z|gmt|utc|ut|[ecmp][sd]t)(?: ?[+-]\d{1,2}:?\d{2})?| ?[+-]\d{2}:?\d{2})?';
        $patrones = [
            // Aug 2 2026 [hora] [zona]
            ['/^' . $dow . $mes . ' (?<d>\d{1,2})(?:st|nd|rd|th)? (?<y>\d{1,4})' . $hora . $zona . '$/i', 'mdy'],
            // 2 Aug 2026 ; Thu 01-Jan-1970 ; Sun 02 Aug 2026 10:00:00 GMT
            ['/^' . $dow . '(?<d>\d{1,2})[ \-\/]' . $mes . '[ \-\/](?<y>\d{1,4})' . $hora . $zona . '$/i', 'dmy'],
            // 2026 Aug 2
            ['/^(?<y>\d{4})[ \-\/]' . $mes . '[ \-\/](?<d>\d{1,2})' . $hora . $zona . '$/i', 'ymd'],
            // Aug 2026
            ['/^' . $mes . ' (?<y>\d{4})' . $hora . $zona . '$/i', 'my'],
        ];
        $m = [];
        $forma = '';
        foreach ($patrones as [$re, $f]) {
            if (preg_match($re, $s, $m) === 1) {
                $forma = $f;
                break;
            }
        }
        if ($forma !== '') {
            $dia = isset($m['d']) && $m['d'] !== '' ? (int) $m['d'] : 1;
            return self::dia_hora_validos($dia, $m);
        }
        // Numéricos: 2026/08/02, 2026-8-2, 8/2/2026, 12/31/99 (+ hora y zona).
        $num = '/^(?<a>\d{1,4})[\/\-](?<b>\d{1,2})[\/\-](?<c>\d{1,4})' . $hora . $zona . '$/i';
        if (preg_match($num, $s, $m) === 1) {
            if (strlen($m['a']) === 4) {
                $mes_n = (int) $m['b'];
                $dia = (int) $m['c'];
            } else {
                $mes_n = (int) $m['a'];
                $dia = (int) $m['b'];
            }
            if ($mes_n < 1 || $mes_n > 12) {
                return false;
            }
            return self::dia_hora_validos($dia, $m);
        }
        return false;
    }

    /** @param array<string|int, string> $m */
    private static function dia_hora_validos(int $dia, array $m): bool
    {
        if ($dia < 1 || $dia > 31) {
            return false;
        }
        if (($m['h'] ?? '') === '') {
            return true;
        }
        $h = (int) $m['h'];
        $mi = (int) $m['mi'];
        $seg = ($m['s'] ?? '') === '' ? 0 : (int) $m['s'];
        $ap = strtolower($m['ap'] ?? '');
        if ($ap !== '' && ($h < 1 || $h > 12)) {
            return false;
        }
        return $h <= 24 && $mi <= 60 && $seg <= 60;
    }

    // ------------------------------------------------------------------
    // Objetos y claves: JSON.stringify(Object.fromEntries(...sort)) a la manera de V8.
    // ------------------------------------------------------------------

    /**
     * Las claves de un objeto en el orden que JavaScript las enumera: primero las que
     * son índices de arreglo (enteros canónicos 0..2^32-2), en orden numérico; después
     * las demás, en el orden dado. `stableJsonValue` del Core ordena las claves como
     * texto, pero `Object.fromEntries` las vuelve a ordenar así, y eso es lo que imprime
     * `JSON.stringify`.
     *
     * @param array<int, string> $claves ya ordenadas como texto
     * @return array<int, string>
     */
    public static function orden_de_enumeracion(array $claves): array
    {
        $indices = [];
        $resto = [];
        foreach ($claves as $c) {
            $c = (string) $c;
            if (preg_match('/^(?:0|[1-9]\d{0,9})$/D', $c) === 1 && (int) $c <= 4294967294) {
                $indices[] = $c;
            } else {
                $resto[] = $c;
            }
        }
        usort($indices, static function (string $a, string $b): int {
            return (int) $a <=> (int) $b;
        });
        return array_merge($indices, $resto);
    }
}
