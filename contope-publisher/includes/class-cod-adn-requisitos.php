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
 * A eso se suman los doce que el Core agregó el 02-nov-2026 (pedidos Q1, Q3 y Q4; contrato en
 * docs/PEDIDOS-AL-CORE.md del Core, sección «Resuelto el 02-nov-2026»):
 *
 *   dim1.req15 transparencias · dim1.req16 degradados · dim2.req09 pesos e interlineados ·
 *   dim3.req10 quiebres · dim3.req11 margen lateral (gutter) · dim3.req12 medidas de texto ·
 *   dim4.req09 sombras · dim4.req10 grosores de borde · dim4.req11 desenfoques ·
 *   dim7.req09 tema del formulario (68 variables) · dim9.req08 variantes · dim9.req09 arquetipo → familia de bloque
 *
 * y los campos opcionales nuevos de dim2.req02 y dim3.req01 (`porQuiebre`). Los nueve primeros y el tema
 * del formulario se PROYECTAN al theme.json; dim9.req08 y dim9.req09 se validan (forma) y se guardan, pero
 * el destino aún no emite sus propiedades (PROYECTADOS no los lista; ver COD_ADN_Theme::fuera_del_adn()).
 * Los demás requisitos se GUARDAN y se listan en `ignored[]` (R4); nunca se descartan ni se emiten.
 *
 * Las listas cerradas (roles) están en un solo lugar a propósito: si el Core las cambia se cambia acá y
 * se agrega un caso al corpus. La PARIDAD con el manifiesto se mide: scripts/probar-adn-validador.php compara
 * `esquema_como_core()` con fixtures/adn/payload-schemas.json y corre los 176 casos de la capa 4 (fixtures/adn/esquemas).
 *
 * La FORMA (validar_forma) es la del Core y nada más. Lo que el Core deja al destino (nombre único y slug
 * propio de roles y escalas) está en `validar_destino()`, con códigos propios.
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
    public const PROYECTADOS = [
        'dim1.req01', 'dim1.req02', 'dim1.req15', 'dim1.req16',
        'dim2.req01', 'dim2.req02', 'dim2.req07', 'dim2.req09',
        'dim3.req01', 'dim3.req02', 'dim3.req05', 'dim3.req10', 'dim3.req11', 'dim3.req12',
        'dim4.req02', 'dim4.req09', 'dim4.req10', 'dim4.req11',
        'dim7.req09',
        'dim8.req03', 'dim8.req04',
    ];

    /**
     * Requisitos cuya forma el plugin conoce y valida aunque no los proyecte todavía (se guardan y se listan
     * en `ignored[]` como R4-no-proyectada; una `confirmed` con forma incorrecta sí se rechaza).
     */
    public const SOLO_FORMA = ['dim9.req08', 'dim9.req09'];

    /**
     * El grupo de cada variable de `dim7.req09.temaFormulario` (los nombres son los de `settings.custom.form`;
     * `FORM_TOKENS` en manifest-v0-dim7.ts del Core las exporta). Una variable pertenece a UN grupo: el grupo es
     * un nivel del `value`, la variable es su clave. Sólo `tipografia.familia` se renombra (la variable del tema
     * se llama `tipografia`).
     */
    public const FORM_COLORES = ['texto', 'textoSuave', 'fondo', 'superficie', 'superficieAlt', 'borde', 'bordeFuerte', 'principal', 'principalHover', 'principalContraste', 'campoFondo', 'campoTexto', 'etiquetaColor', 'subetiquetaColor', 'opcionColor', 'casillaFondo', 'casillaMarca'];
    public const FORM_TAMANOS = ['campoTamano', 'etiquetaTamano', 'subetiquetaTamano', 'ayudaTamano', 'contadorTamano', 'opcionTamano', 'botonTamano'];
    public const FORM_PESOS = ['peso', 'etiquetaPeso', 'subetiquetaPeso', 'opcionPeso', 'botonPeso'];
    public const FORM_INTERLINEADOS = ['interlineado', 'ayudaInterlineado', 'opcionInterlineado', 'contadorInterlineado'];
    public const FORM_MEDIDAS = ['radio', 'espaciado', 'campoBordeAncho', 'campoRellenoY', 'campoRellenoX', 'grupoTituloSeparacion', 'etiquetaSeparacion', 'etiquetaRellenoSuperior', 'opcionEtiquetaRellenoSuperior', 'controlSeparacion', 'ayudaRellenoY', 'ayudaSeparacion', 'contadorRellenoY', 'contadorSeparacion', 'pieRellenoY', 'pieSeparacion', 'rejillaSeparacion', 'rejillaFilaSeparacion', 'rejillaSubSeparacion', 'opcionesRellenoY', 'casillaTamano', 'casillaMargenSuperior', 'casillaMargenLateral', 'opcionSangria', 'opcionSeparacion', 'botonAncho', 'botonRellenoY', 'botonRellenoX', 'botonRadio'];
    public const FORM_ALINEACIONES = ['contadorAlineacion', 'opcionAlineacion'];
    public const FORM_SOMBRAS = ['sombra', 'botonSombra'];
    public const ALINEACIONES = ['left', 'center', 'right'];
    public const APARIENCIAS = ['none', 'auto'];
    public const QUIEBRES = ['tablet', 'mobile'];
    public const ARQUETIPOS = ['accion', 'contenedor', 'navegacion', 'feedback', 'entrada', 'secuencia-editorial', 'lista', 'tabla', 'metricas', 'representacion-de-datos'];

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

    /**
     * Un campo opcional por cada variable de un grupo del tema del formulario.
     *
     * @param array<int, string> $nombres
     * @param array<string, mixed> $tipo
     * @return array<string, array<string, mixed>>
     */
    private static function variables_de_formulario(array $nombres, array $tipo): array
    {
        $out = [];
        foreach ($nombres as $n) {
            $out[$n] = self::campo($tipo, true);
        }
        return $out;
    }

    /** @return array<string, array<string, mixed>> requisito → slot → campo */
    public static function esquemas(): array
    {
        if (self::$esquemas !== null) {
            return self::$esquemas;
        }
        $color = self::t('color');
        $largo = self::t('longitud');
        $largo_signo = self::t('longitud', ['signo' => true]);
        $texto = self::t('texto');
        $transparente = self::conjunto(['transparent']);
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
                    'role' => self::campo($texto),
                    'family' => self::campo(self::union([self::ref('dim2.req01'), $texto])),
                    'fontSize' => self::campo($largo),
                    'fontWeight' => self::campo(self::numero(100, 900)),
                    'lineHeight' => self::campo(self::numero(0.8, 3)),
                    'letterSpacing' => self::campo($largo, true),
                    'porQuiebre' => self::campo(self::lista(self::objeto([
                        'quiebre' => self::campo(self::conjunto(self::QUIEBRES)),
                        'fontSize' => self::campo($largo),
                    ])), true),
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
                'escala' => self::campo(self::lista(self::objeto([
                    'step' => self::campo(self::numero(1)),
                    'value' => self::campo($largo),
                    'porQuiebre' => self::campo(self::lista(self::objeto([
                        'quiebre' => self::campo(self::conjunto(self::QUIEBRES)),
                        'value' => self::campo($largo),
                    ])), true),
                ]))),
            ],
            'dim3.req02' => [
                'roleSpacing' => self::campo(self::lista(self::objeto([
                    'role' => self::campo(self::conjunto(self::ROLES_ESPACIO)),
                    'value' => self::campo(self::union([self::ref('dim3.req01'), $largo])),
                    'source' => self::campo($texto),
                    'derivation' => self::campo($derivacion('dim3.req01')),
                ]))),
            ],
            'dim3.req05' => [
                'contenedores' => self::campo(self::lista(self::objeto([
                    'nombre' => self::campo($texto),
                    'maxWidth' => self::campo($largo),
                    'padding' => self::campo(self::ref('dim3.req02')),
                    'relacionSoporte' => self::campo($texto),
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
            'dim8.req04' => [
                'movimientos' => self::campo(self::lista(self::objeto([
                    'caso' => self::campo($texto),
                    'curva' => self::campo($texto),
                    'trayectoria' => self::campo($texto),
                    'continuidadEspacial' => self::campo($texto),
                    'amplitud' => self::campo($largo, true),
                    'tiempo' => self::campo(self::ref('dim8.req03'), true),
                    'duracionMs' => self::campo(self::numero(0, 5000), true),
                ]))),
                'sinAmplitud' => self::campo($texto, true),
            ],
            'dim1.req15' => [
                'transparencias' => self::campo(self::lista(self::objeto([
                    'nombre' => self::campo($texto),
                    'base' => self::campo(self::ref('dim1.req01')),
                    'opacidad' => self::campo(self::numero(0, 100)),
                ])), true),
                'sinTransparencias' => self::campo($texto, true),
            ],
            'dim1.req16' => [
                'degradados' => self::campo(self::lista(self::objeto([
                    'nombre' => self::campo($texto),
                    'tipo' => self::campo(self::conjunto(['linear', 'radial'])),
                    'angulo' => self::campo(self::numero(0, 360), true),
                    'paradas' => self::campo(self::lista(self::objeto([
                        'color' => self::campo(self::union([self::ref('dim1.req01'), self::ref('dim1.req15'), $transparente])),
                        'posicion' => self::campo(self::numero(0, 100)),
                    ]))),
                ])), true),
                'sinDegradados' => self::campo($texto, true),
            ],
            'dim2.req09' => [
                'pesos' => self::campo(self::lista(self::objeto([
                    'nombre' => self::campo($texto),
                    'valor' => self::campo(self::numero(100, 900)),
                ])), true),
                'interlineados' => self::campo(self::lista(self::objeto([
                    'nombre' => self::campo($texto),
                    'valor' => self::campo(self::numero(0.8, 3)),
                ])), true),
                'sinEscalas' => self::campo($texto, true),
            ],
            'dim3.req10' => [
                'quiebres' => self::campo(self::lista(self::objeto([
                    'nombre' => self::campo(self::conjunto(['tablet', 'mobile'])),
                    'desde' => self::campo($largo, true),
                    'hasta' => self::campo($largo),
                ])), true),
                'sinQuiebres' => self::campo($texto, true),
            ],
            'dim3.req11' => [
                'margenLateral' => self::campo(self::objeto([
                    'nombre' => self::campo($texto),
                    'minimo' => self::campo($largo),
                    'contenedor' => self::campo(self::ref('dim3.req05')),
                ]), true),
                'sinMargenLateral' => self::campo($texto, true),
            ],
            'dim3.req12' => [
                'medidas' => self::campo(self::lista(self::objeto([
                    'nombre' => self::campo($texto),
                    'valor' => self::campo($largo),
                ])), true),
                'sinMedidas' => self::campo($texto, true),
            ],
            'dim4.req09' => [
                'sombras' => self::campo(self::lista(self::objeto([
                    'nombre' => self::campo($texto),
                    'x' => self::campo($largo_signo),
                    'y' => self::campo($largo_signo),
                    'desenfoque' => self::campo($largo),
                    'expansion' => self::campo($largo_signo),
                    'color' => self::campo(self::union([self::ref('dim1.req15'), self::ref('dim1.req01')])),
                ])), true),
                'sinSombras' => self::campo($texto, true),
            ],
            'dim4.req10' => [
                'grosores' => self::campo(self::lista(self::objeto([
                    'nombre' => self::campo($texto),
                    'valor' => self::campo($largo),
                ])), true),
                'sinGrosores' => self::campo($texto, true),
            ],
            'dim4.req11' => [
                'desenfoques' => self::campo(self::lista(self::objeto([
                    'nombre' => self::campo($texto),
                    'valor' => self::campo($largo),
                ])), true),
                'sinDesenfoques' => self::campo($texto, true),
            ],
            'dim7.req09' => [
                'temaFormulario' => self::campo(self::objeto([
                    'colores' => self::campo(self::objeto(self::variables_de_formulario(self::FORM_COLORES, self::union([self::ref('dim1.req01'), self::ref('dim1.req15'), $color, $transparente]))), true),
                    'tipografia' => self::campo(self::objeto(
                        ['familia' => self::campo(self::ref('dim2.req01'), true)]
                        + self::variables_de_formulario(self::FORM_TAMANOS, $largo)
                        + self::variables_de_formulario(self::FORM_PESOS, self::numero(100, 900))
                        + self::variables_de_formulario(self::FORM_INTERLINEADOS, self::numero(0.8, 3))
                    ), true),
                    'medidas' => self::campo(self::objeto(
                        self::variables_de_formulario(self::FORM_MEDIDAS, $largo)
                        + self::variables_de_formulario(self::FORM_ALINEACIONES, self::conjunto(self::ALINEACIONES))
                        + ['casillaApariencia' => self::campo(self::conjunto(self::APARIENCIAS), true)]
                    ), true),
                    'sombras' => self::campo(self::objeto(self::variables_de_formulario(self::FORM_SOMBRAS, self::union([self::ref('dim4.req09'), self::conjunto(['none'])]))), true),
                ]), true),
                'sinTemaFormulario' => self::campo($texto, true),
            ],
            'dim9.req08' => [
                'diferencias' => self::campo(self::lista(self::objeto([
                    'arquetipo' => self::campo(self::conjunto(['accion', 'contenedor', 'navegacion', 'feedback', 'entrada', 'secuencia-editorial', 'lista', 'tabla', 'metricas', 'representacion-de-datos'])),
                    'variante' => self::campo($texto),
                    'cambios' => self::campo(self::lista(self::objeto([
                        'propiedad' => self::campo($texto),
                        'valor' => self::campo(self::union([self::objeto([
                            'tipo' => self::campo(self::conjunto(['color'])),
                            'color' => self::campo(self::union([self::ref('dim1.req01'), self::ref('dim1.req15'), $color])),
                        ]), self::objeto([
                            'tipo' => self::campo(self::conjunto(['longitud'])),
                            'longitud' => self::campo($largo_signo),
                        ]), self::objeto([
                            'tipo' => self::campo(self::conjunto(['numero'])),
                            'numero' => self::campo(self::numero(null, null)),
                        ]), self::objeto([
                            'tipo' => self::campo(self::conjunto(['proporcion'])),
                            'ancho' => self::campo(self::numero(0.01, null)),
                            'alto' => self::campo(self::numero(0.01, null)),
                        ]), self::objeto([
                            'tipo' => self::campo(self::conjunto(['palabra'])),
                            'palabra' => self::campo($texto),
                        ]), self::objeto([
                            'tipo' => self::campo(self::conjunto(['referencia'])),
                            'referencia' => self::campo(self::ref()),
                        ])])),
                        'quiebre' => self::campo(self::conjunto(['tablet', 'mobile']), true),
                    ]))),
                ])), true),
                'sinDiferencias' => self::campo($texto, true),
            ],
            'dim9.req09' => [
                'correspondencias' => self::campo(self::lista(self::objeto([
                    'arquetipo' => self::campo(self::conjunto(['accion', 'contenedor', 'navegacion', 'feedback', 'entrada', 'secuencia-editorial', 'lista', 'tabla', 'metricas', 'representacion-de-datos'])),
                    'familiaDeBloque' => self::campo($texto),
                ])), true),
                'sinCorrespondencias' => self::campo($texto, true),
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

    /** El slug de un nombre de rol abierto, o '' si no es un nombre válido (vacío, símbolos sueltos, demasiado largo). */
    public static function slug_de_rol(string $nombre): string
    {
        $limpio = COD_ADN_Js::trim($nombre);
        if ($limpio === '' || mb_strlen($limpio, 'UTF-8') > 40 || preg_match('/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u', $limpio) !== 1) {
            return '';
        }
        $slug = COD_ADN_Projection::slug($limpio);
        return $slug === 'x' && mb_strtolower($limpio, 'UTF-8') !== 'x' ? '' : $slug;
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

    /**
     * `isSignedLengthCss` del Core: la misma longitud precedida de un `-` pegado al número (`-12px`, `-0`). Sin `+`
     * y sin espacio entre el signo y el número. Sólo la usan los campos con `conSigno: true`.
     */
    public static function es_longitud_con_signo($valor): bool
    {
        if (!is_string($valor)) {
            return false;
        }
        $s = COD_ADN_Js::trim($valor);
        if (strncmp($s, '-', 1) !== 0) {
            return self::es_longitud_css($s);
        }
        $resto = substr($s, 1);
        return $resto === COD_ADN_Js::trim($resto) && self::es_longitud_css($resto);
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
                if (!empty($tipo['signo'])) {
                    if (!self::es_longitud_con_signo($valor)) {
                        $agregar("slot '$ruta': no es una longitud-css válida (con signo opcional)");
                    }
                } elseif (!self::es_longitud_css($valor)) {
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
                    $agregar("slot '$ruta': numero " . COD_ADN_Js::numero_a_texto($valor) . ' por debajo del mínimo ' . COD_ADN_Js::numero_a_texto($tipo['min']));
                }
                if ($tipo['max'] !== null && $valor > $tipo['max']) {
                    $agregar("slot '$ruta': numero " . COD_ADN_Js::numero_a_texto($valor) . ' por encima del máximo ' . COD_ADN_Js::numero_a_texto($tipo['max']));
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

    // ------------------------------------------------------------------
    // El esquema, en el formato del manifiesto del Core (para medir la paridad)
    // ------------------------------------------------------------------

    /**
     * El tipo de nuestro esquema escrito como lo publica el manifiesto del Core (`payloadSchema` de
     * fixtures/adn/payload-schemas.json): `{kind: 'lista', of: …}`, `{kind: 'objeto', fields: {campo: {type, optional?}}}`…
     *
     * @param array<string, mixed> $tipo
     * @return array<string, mixed>
     */
    private static function tipo_como_core(array $tipo): array
    {
        switch ($tipo['k']) {
            case 'texto':
                return ['kind' => 'texto'];
            case 'color':
                return ['kind' => 'color-css'];
            case 'longitud':
                return empty($tipo['signo']) ? ['kind' => 'longitud-css'] : ['kind' => 'longitud-css', 'conSigno' => true];
            case 'enum':
                return ['kind' => 'enum', 'values' => $tipo['v']];
            case 'numero':
                $n = ['kind' => 'numero'];
                if ($tipo['min'] !== null) {
                    $n['min'] = $tipo['min'];
                }
                if ($tipo['max'] !== null) {
                    $n['max'] = $tipo['max'];
                }
                return $n;
            case 'ref':
                return $tipo['req'] === null ? ['kind' => 'ref'] : ['kind' => 'ref', 'reqId' => $tipo['req']];
            case 'lista':
                return ['kind' => 'lista', 'of' => self::tipo_como_core($tipo['of'])];
            case 'union':
                return ['kind' => 'union', 'of' => array_map([self::class, 'tipo_como_core'], $tipo['of'])];
            default: // objeto
                $campos = [];
                foreach ($tipo['f'] as $nombre => $campo) {
                    $campos[(string) $nombre] = self::campo_como_core($campo);
                }
                return ['kind' => 'objeto', 'fields' => $campos];
        }
    }

    /**
     * @param array<string, mixed> $campo
     * @return array<string, mixed>
     */
    private static function campo_como_core(array $campo): array
    {
        return $campo['opt'] ? ['type' => self::tipo_como_core($campo['t']), 'optional' => true] : ['type' => self::tipo_como_core($campo['t'])];
    }

    /**
     * El `payloadSchema` de cada requisito que el plugin conoce, en el formato del manifiesto del Core.
     * scripts/probar-adn-validador.php lo compara con fixtures/adn/payload-schemas.json: si el Core cambia un esquema y
     * esta tabla no, la prueba falla.
     *
     * @return array<string, array<string, array<string, mixed>>> requisito → slot → {type, optional?}
     */
    public static function esquema_como_core(): array
    {
        $out = [];
        foreach (self::esquemas() as $req => $slots) {
            foreach ($slots as $slot => $campo) {
                $out[(string) $req][(string) $slot] = self::campo_como_core($campo);
            }
        }
        return $out;
    }

    /** ¿El plugin conoce la forma de este requisito (lo proyecta o lo valida sin proyectarlo)? */
    public static function tiene_esquema(?string $requisito): bool
    {
        return $requisito !== null && isset(self::esquemas()[$requisito]);
    }

    // ------------------------------------------------------------------
    // Lo que el Core deja al DESTINO
    // ------------------------------------------------------------------

    /**
     * ¿El nombre de una escala da un slug propio? (no vacío, no sólo símbolos, no más de 80 caracteres).
     * A diferencia de un rol tipográfico (slug_de_rol, que además limita los caracteres), una escala puede
     * llamarse «ink a accent (65°)»: sólo importa que el slug no quede vacío.
     */
    public static function nombre_con_slug(string $nombre): bool
    {
        $limpio = COD_ADN_Js::trim($nombre);
        if ($limpio === '' || mb_strlen($limpio, 'UTF-8') > 80) {
            return false;
        }
        return COD_ADN_Projection::slug($limpio) !== 'x' || mb_strtolower($limpio, 'UTF-8') === 'x';
    }

    /**
     * Las reglas que el manifiesto del Core NO mide y deja explícitamente al destino (sus `mappingNotes`):
     * nombre único y con slug propio en roles y escalas. La forma ya cumple el esquema.
     *
     * Códigos propios: ADN_NAME_INVALID (el nombre no da un slug) y ADN_NAME_DUPLICATE (dos entradas de la misma lista
     * con el mismo nombre; dos nombres distintos que den el mismo slug NO se rechazan: R3 los desambigua con -2).
     *
     * @param mixed $valor
     * @return array<int, array{codigo: string, ruta: string, mensaje: string}>
     */
    public static function validar_destino(string $requisito, $valor): array
    {
        if (!$valor instanceof stdClass) {
            return [];
        }
        // slot de lista → campo del nombre, y si el nombre es de un rol tipográfico (regla más estricta).
        $listas = [
            'dim1.req15' => [['transparencias', 'nombre', false]],
            'dim1.req16' => [['degradados', 'nombre', false]],
            'dim2.req02' => [['roleStyles', 'role', true]],
            'dim2.req09' => [['pesos', 'nombre', false], ['interlineados', 'nombre', false]],
            'dim3.req10' => [['quiebres', 'nombre', false]],
            'dim3.req12' => [['medidas', 'nombre', false]],
            'dim4.req09' => [['sombras', 'nombre', false]],
            'dim4.req10' => [['grosores', 'nombre', false]],
            'dim4.req11' => [['desenfoques', 'nombre', false]],
        ];
        $motivos = [];
        foreach ($listas[$requisito] ?? [] as [$slot, $campo, $es_rol]) {
            if (!property_exists($valor, $slot) || !is_array($valor->{$slot})) {
                continue;
            }
            $vistos = [];
            foreach ($valor->{$slot} as $i => $item) {
                if (!$item instanceof stdClass || !property_exists($item, $campo) || !is_string($item->{$campo})) {
                    continue;
                }
                $nombre = COD_ADN_Js::trim($item->{$campo});
                $ruta = $slot . '[' . $i . '].' . $campo;
                $da_slug = $es_rol ? self::slug_de_rol($nombre) !== '' : self::nombre_con_slug($nombre);
                if (!$da_slug) {
                    $motivos[] = ['codigo' => 'ADN_NAME_INVALID', 'ruta' => $ruta, 'mensaje' => "slot '$ruta': el nombre " . json_encode($item->{$campo}, JSON_UNESCAPED_UNICODE) . ' no da un slug propio (no puede quedar vacío ni ser sólo símbolos)'];
                    continue;
                }
                if (isset($vistos[$nombre])) {
                    $motivos[] = ['codigo' => 'ADN_NAME_DUPLICATE', 'ruta' => $ruta, 'mensaje' => "slot '$ruta': el nombre " . json_encode($nombre, JSON_UNESCAPED_UNICODE) . ' ya está en ' . $slot . '[' . $vistos[$nombre] . ']'];
                    continue;
                }
                $vistos[$nombre] = $i;
            }
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
     * Una referencia puede llegar a un VALOR del tipo esperado (`dim1.req01 → institucionales[0].value`, un color) o a la ENTRADA
     * completa del requisito destino (`institucionales[0]`, un objeto `{name, value}`): así apuntan todas las referencias de los requisitos
     * que el Core agregó el 02-nov-2026 (transparencias, degradados, sombras, formulario…) y el destino lee de la entrada lo que necesita
     * (`name` para el slug, `value` para el color). Una entrada se acepta; lo que sigue rechazándose es llegar a un texto, número o
     * lista que no es del tipo esperado (el NOMBRE «Verde oliva» donde va un color).
     *
     * @param array<int, array<string, mixed>> $miembros
     */
    public static function cumple_alguno($valor, array $miembros): bool
    {
        if ($valor instanceof stdClass) {
            return true;
        }
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
