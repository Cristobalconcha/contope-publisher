<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Los estilos de bloque que salen del ADN: dim9.req09 (arquetipo -> familia de bloque) y dim9.req08 (diferencia por variante).
 *
 * El Core guarda DATOS: «la variante `altura-321-255-264` del arquetipo `contenedor` cambia `min-height` a 255px en tablet». Qué familia
 * de bloque es un arquetipo (dim9.req09), qué propiedades sabe emitir un bloque y sobre QUÉ elemento del bloque cae cada una es del
 * destino (así lo dice el contrato del Core): este archivo es esa decisión, en un solo lugar y cerrada.
 *
 * COMO SE EMITE (lo mismo que escribía a mano el theme.json de Basis):
 *   - variante `base` (el estilo del bloque sin variación) sin punto de quiebre -> `styles.blocks.<bloque>.<ruta>` del theme.json
 *     (p. ej. `core/group` -> `spacing.padding.left`). Las propiedades sin ruta estructurada en theme.json no se emiten.
 *   - cualquier otra variante, o cualquier cambio con punto de quiebre -> una regla de CSS, entre las marcas
 *     `cod-estilos-responsivos` de `styles.css`: `.wp-block-<bloque>.is-style-<variante> <elemento>{<propiedad>:<valor>}`, dentro de
 *     `@media` del quiebre (los mismos de dim3.req10 / COD_ADN_Projection) o suelta si no hay quiebre. La variante `base` con quiebre
 *     no lleva clase `is-style-`.
 *   - el valor base de una variante con nombre (contorno, desenfoque, ícono de un pliegue…) vive en `styles/blocks/<variante>.json` del
 *     tema: es un archivo del tema, no del ADN (COD_ADN_Theme::fuera_del_adn()). Si el ADN lo declara sin quiebre, se emite igual como
 *     regla suelta (el ADN manda), pero el ADN de Basis no lo declara.
 *
 * NADA SE INVENTA: una propiedad que el catálogo no conoce para esa familia, un tipo de valor que no cabe en la propiedad, una referencia
 * que no llega a una variable emitida o un arquetipo sin familia se omiten y se AVISAN (códigos ADN_*); el resto sigue. Todo lo que llega
 * al CSS pasa por `seguro()` (sólo letras, dígitos y `# % . , ( ) / + - _` y espacio): ni `;`, ni llaves, ni comentarios, ni comillas.
 */
final class COD_ADN_Block_Styles
{
    /** Las marcas del bloque de CSS de los estilos de bloque dentro de `styles.css`. */
    public const MARCA_CSS = 'cod-estilos-responsivos';
    /** El nombre (slug) de la variante que es el estilo del propio bloque, no una variación. */
    public const VARIANTE_BASE = 'base';

    /**
     * familia de bloque -> propiedad -> {destino: elemento del bloque donde cae ('' = el propio bloque), ruta: dónde va en
     * `styles.blocks.<bloque>` del theme.json (null = no tiene), tipos: tipos de valor del Core que caben}.
     *
     * @var array<string, array<string, array{destino: string, ruta: array<int, string>|null, tipos: array<int, string>}>>
     */
    private const CATALOGO = [
        'core/image' => [
            'aspect-ratio' => ['destino' => 'img', 'ruta' => ['dimensions', 'aspectRatio'], 'tipos' => ['proporcion', 'palabra', 'referencia']],
            'border-radius' => ['destino' => 'img', 'ruta' => ['border', 'radius'], 'tipos' => ['longitud', 'referencia']],
            'object-fit' => ['destino' => 'img', 'ruta' => null, 'tipos' => ['palabra']],
        ],
        'core/group' => [
            'min-height' => ['destino' => '', 'ruta' => ['dimensions', 'minHeight'], 'tipos' => ['longitud', 'referencia']],
            'padding-top' => ['destino' => '', 'ruta' => ['spacing', 'padding', 'top'], 'tipos' => ['longitud', 'referencia']],
            'padding-right' => ['destino' => '', 'ruta' => ['spacing', 'padding', 'right'], 'tipos' => ['longitud', 'referencia']],
            'padding-bottom' => ['destino' => '', 'ruta' => ['spacing', 'padding', 'bottom'], 'tipos' => ['longitud', 'referencia']],
            'padding-left' => ['destino' => '', 'ruta' => ['spacing', 'padding', 'left'], 'tipos' => ['longitud', 'referencia']],
        ],
    ];

    /** @return array<string, array<string, array{destino: string, ruta: array<int, string>|null, tipos: array<int, string>}>> */
    public static function catalogo(): array
    {
        return self::CATALOGO;
    }

    /** La clase que WordPress le pone al bloque: `core/image` -> `wp-block-image`, `acme/mapa` -> `wp-block-acme-mapa`. */
    public static function clase_de_bloque(string $familia): string
    {
        return 'wp-block-' . str_replace('/', '-', strpos($familia, 'core/') === 0 ? substr($familia, 5) : $familia);
    }

    /** ¿Es un valor que puede ir tal cual dentro de una declaración de CSS? (ni `;` ni llaves ni comillas ni comentarios) */
    public static function seguro(string $valor): bool
    {
        return $valor !== '' && preg_match('/^[A-Za-z0-9#%.,()\/ +_-]+$/D', $valor) === 1 && strpos($valor, '/*') === false;
    }

    /**
     * El valor de CSS de un `valor` de dim9.req08, o [null, motivo].
     *
     * @param array<int, string> $tipos
     * @return array{0: string|null, 1: string}
     */
    private static function valor_css(stdClass $v, array $tipos, callable $referencia): array
    {
        $tipo = (string) ($v->tipo ?? '');
        if (!in_array($tipo, $tipos, true)) {
            return [null, 'el tipo de valor «' . $tipo . '» no cabe en esta propiedad (caben: ' . implode(', ', $tipos) . ')'];
        }
        switch ($tipo) {
            case 'color':
                $c = $v->color ?? null;
                $css = COD_ADN_Requisitos::es_ref($c) ? $referencia($c) : (is_string($c) ? COD_ADN_Js::trim($c) : null);
                break;
            case 'longitud':
                $css = is_string($v->longitud ?? null) ? COD_ADN_Js::trim($v->longitud) : null;
                break;
            case 'numero':
                $css = COD_ADN_Js::es_numero_finito($v->numero ?? null) ? COD_ADN_Js::numero_a_texto($v->numero) : null;
                break;
            case 'proporcion':
                $css = COD_ADN_Js::es_numero_finito($v->ancho ?? null) && COD_ADN_Js::es_numero_finito($v->alto ?? null)
                    ? COD_ADN_Js::numero_a_texto($v->ancho) . '/' . COD_ADN_Js::numero_a_texto($v->alto)
                    : null;
                break;
            case 'palabra':
                $p = is_string($v->palabra ?? null) ? COD_ADN_Js::trim($v->palabra) : '';
                $css = preg_match('/^[a-z]+(?:-[a-z]+)*$/D', $p) === 1 ? $p : null;
                break;
            default: // referencia
                $r = $v->referencia ?? null;
                $css = COD_ADN_Requisitos::es_ref($r) ? $referencia($r) : null;
        }
        if ($css === null || !self::seguro($css)) {
            return [null, $tipo === 'referencia' || ($tipo === 'color' && COD_ADN_Requisitos::es_ref($v->color ?? null))
                ? 'la referencia no llega a una variable que el ADN emita'
                : 'el valor no se puede escribir como CSS'];
        }
        return [$css, ''];
    }

    /**
     * @param array<int, mixed> $correspondencias lista de dim9.req09 ({arquetipo, familiaDeBloque}); [] si no hay
     * @param array<int, mixed> $diferencias lista de dim9.req08 ({arquetipo, variante, cambios[]}); [] si no hay
     * @param callable(): array<string, string> $media_de nombre de quiebre (tablet|mobile) -> condición de @media; sólo se llama si hace falta
     * @param callable(stdClass): ?string $referencia una referencia del Core -> `var(--…)` de lo que el ADN emitió, o null
     * @return array{bloques: array<string, mixed>, css: string, quiebres: array<string, bool>, avisos: array<int, array<string, mixed>>}
     */
    public static function proyectar(array $correspondencias, array $diferencias, callable $media_de, callable $referencia): array
    {
        $avisos = [];
        $bloques = [];
        $reglas = ['' => [], 'tablet' => [], 'mobile' => []]; // quiebre -> selector -> declaraciones
        $familia_de = [];
        foreach ($correspondencias as $c) {
            if ($c instanceof stdClass && !isset($familia_de[(string) $c->arquetipo])) {
                $familia_de[(string) $c->arquetipo] = COD_ADN_Js::trim((string) $c->familiaDeBloque);
            }
        }
        foreach ($diferencias as $i => $d) {
            if (!$d instanceof stdClass) {
                continue;
            }
            $arquetipo = (string) $d->arquetipo;
            $variante = (string) $d->variante;
            $familia = $familia_de[$arquetipo] ?? null;
            if ($familia === null) {
                $avisos[] = ['codigo' => 'ADN_VARIANTE_SIN_FAMILIA', 'mensaje' => 'dim9.req09 no le da una familia de bloque al arquetipo «' . $arquetipo . '»: la variante «' . $variante . '» no se proyectó.', 'arquetipo' => $arquetipo, 'variante' => $variante];
                continue;
            }
            if (!isset(self::CATALOGO[$familia])) {
                $avisos[] = ['codigo' => 'ADN_FAMILIA_SIN_DESTINO', 'mensaje' => 'La familia de bloque «' . $familia . '» no tiene destino en este plugin (' . implode(', ', array_keys(self::CATALOGO)) . '): la variante «' . $variante . '» no se proyectó.', 'familia' => $familia, 'variante' => $variante];
                continue;
            }
            $slug = COD_ADN_Projection::slug($variante);
            $es_base = $slug === self::VARIANTE_BASE;
            foreach ((array) $d->cambios as $j => $cambio) {
                $propiedad = COD_ADN_Js::trim((string) $cambio->propiedad);
                $donde = 'diferencias[' . $i . '].cambios[' . $j . ']';
                $spec = self::CATALOGO[$familia][$propiedad] ?? null;
                if ($spec === null) {
                    $avisos[] = ['codigo' => 'ADN_PROPIEDAD_NO_EMITIDA', 'mensaje' => 'El bloque ' . $familia . ' no sabe emitir la propiedad «' . $propiedad . '» (variante «' . $variante . '»): no se proyectó. Caben: ' . implode(', ', array_keys(self::CATALOGO[$familia])) . '.', 'familia' => $familia, 'propiedad' => $propiedad, 'ruta' => $donde];
                    continue;
                }
                [$valor, $motivo] = self::valor_css($cambio->valor, $spec['tipos'], $referencia);
                if ($valor === null) {
                    $avisos[] = ['codigo' => 'ADN_VALOR_NO_EMITIDO', 'mensaje' => 'El valor de «' . $propiedad . '» en la variante «' . $variante . '» no se proyectó: ' . $motivo . '.', 'familia' => $familia, 'propiedad' => $propiedad, 'ruta' => $donde];
                    continue;
                }
                $quiebre = property_exists($cambio, 'quiebre') ? (string) $cambio->quiebre : '';
                if ($es_base && $quiebre === '') {
                    if ($spec['ruta'] === null) {
                        $avisos[] = ['codigo' => 'ADN_PROPIEDAD_NO_EMITIDA', 'mensaje' => 'La propiedad «' . $propiedad . '» de ' . $familia . ' no tiene equivalente en el theme.json: sólo se emite por punto de quiebre o en una variante con nombre.', 'familia' => $familia, 'propiedad' => $propiedad, 'ruta' => $donde];
                        continue;
                    }
                    $nodo = &$bloques[$familia];
                    foreach ($spec['ruta'] as $segmento) {
                        $nodo = &$nodo[$segmento];
                    }
                    $nodo = $valor;
                    unset($nodo);
                    continue;
                }
                $selector = '.' . self::clase_de_bloque($familia) . ($es_base ? '' : '.is-style-' . $slug) . ($spec['destino'] !== '' ? ' ' . $spec['destino'] : '');
                $reglas[$quiebre][$selector][] = $propiedad . ':' . $valor;
            }
        }
        $css = '';
        $usados = ['tablet' => false, 'mobile' => false];
        $media = null;
        foreach (['', 'tablet', 'mobile'] as $q) {
            if ($reglas[$q] === []) {
                continue;
            }
            $texto = '';
            foreach ($reglas[$q] as $selector => $declaraciones) {
                $texto .= $selector . '{' . implode(';', $declaraciones) . '}';
            }
            if ($q === '') {
                $css .= $texto;
                continue;
            }
            $usados[$q] = true;
            $media = $media ?? $media_de();
            $css .= '@media ' . $media[$q] . '{' . $texto . '}';
        }
        return [
            'bloques' => $bloques,
            'css' => $css === '' ? '' : '/*' . self::MARCA_CSS . '*/' . $css . '/*/' . self::MARCA_CSS . '*/',
            'quiebres' => $usados,
            'avisos' => $avisos,
        ];
    }
}
