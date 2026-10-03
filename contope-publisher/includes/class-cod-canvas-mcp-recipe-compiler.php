<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Compila una composición declarativa y un conjunto de reglas de diseño a las
 * tres representaciones persistentes de Canvas.
 *
 * No lee ni escribe design-contract.json. El objeto `design` que recibe es una
 * instantánea explícita, revisable y con procedencia; Desktop podrá producirla
 * desde referencias, DESIGN.md o una decisión humana sin que Canvas invente o
 * mutile un contrato por su cuenta.
 */
final class COD_Canvas_MCP_Recipe_Compiler
{
    public const VERSION = '3.0.0';

    /** @var array<int, string> */
    public const RULE_KINDS = [
        'color',
        'typography',
        'spacing',
        'layout',
        'surface',
        'shape',
        'media',
        'button',
        'gallery',
        'table',
        'form',
        'motion',
        'interaction',
        'cadence',
        'anchor',
        'properties',
    ];

    /** @var array<int, string> */
    public const NODE_KINDS = [
        'section',
        'header',
        'footer',
        'navigation',
        'group',
        'layout',
        'heading',
        'paragraph',
        'richText',
        'image',
        'video',
        'audio',
        'button',
        'link',
        'list',
        'table',
        'gallery',
        'form',
        'dynamic',
        'separator',
        'chart',
        'whatsapp',
        'social',
        'shortcode',
    ];

    /** @var array<int, string> */
    private const REVIEW_STATES = ['session', 'reviewed'];

    /** @var array<int, string> */
    private const RULE_STATUSES = ['proposed', 'reviewed'];

    /**
     * Contrato de los behaviors que fabrican partes en el navegador.
     *
     * UNA sola fuente de verdad. De acá se derivan: la marca de «el elegido»
     * (scope.state = "current"), el texto del catálogo, el mensaje de error
     * y las partes a las que un nodo puede dirigir reglas (campo `partes`).
     * Para sumar un behavior nuevo basta declararlo acá.
     *
     * Se llenó leyendo lo que el runtime emite de verdad (cod-behaviors.js,
     * gemelo cod-canvas-public.js), no lo que se supone:
     *   pestanas:   data-cod-pestanas-rol = lista | etiqueta | panel. La etiqueta
     *               es un <button> que fabrica el runtime; lleva
     *               data-cod-pestanas-estado = activa | inactiva. El panel es el
     *               hijo del grupo; lleva data-cod-pestanas-visible = true | false.
     *   cuadrantes: data-cod-cuadrantes-rol vale cuadrante (en reposo), activa o
     *               miniatura, y va en la celda de imagen; el texto lleva
     *               data-cod-cuadrantes-visible = true | false. Acá el rol ya
     *               mezcla parte y estado, por eso la parte «imagen» no fija valor.
     *   marquesina: data-cod-marquesina-rol = pista | pieza. La pista es el
     *               contenedor que fabrica el runtime y que se desplaza; la pieza
     *               es cada hijo del grupo, y también cada copia que el runtime
     *               agrega para cerrar el bucle (ésas llevan además
     *               data-cod-marquesina-copia). Ninguna de las dos partes tiene
     *               estado elegido: el movimiento es continuo, no hay «la activa».
     *
     * Por parte: `selector` es un fragmento de selector de atributo que se
     * pega tras un espacio (descendiente del nodo); `elegido` es la marca que
     * pone el runtime en la parte elegida (o null si esa parte no tiene estado
     * elegido); `descripcion` es lo que ve quien lee el catálogo.
     *
     * Los demás behaviors (carousel-basic, lightbox, nav-toggle, scroll-threshold)
     * no emiten ningún atributo de rol: sus partes se alcanzan por clase y no
     * entran acá.
     *
     * @var array<string, array{atributoRol: string, partes: array<string, array{selector: string, elegido: string|null, descripcion: string}>}>
     */
    private const BEHAVIOR_CONTRACTS = [
        'pestanas' => [
            'atributoRol' => 'data-cod-pestanas-rol',
            'partes' => [
                'lista' => [
                    'selector' => '[data-cod-pestanas-rol="lista"]',
                    'elegido' => null,
                    'descripcion' => 'la fila que junta las etiquetas (role="tablist")',
                ],
                'etiqueta' => [
                    'selector' => '[data-cod-pestanas-rol="etiqueta"]',
                    'elegido' => '[data-cod-pestanas-estado="activa"]',
                    'descripcion' => 'el botón de cada pestaña: lo fabrica el runtime y trae adentro la etiqueta original; su relleno lo pone este botón',
                ],
                'panel' => [
                    'selector' => '[data-cod-pestanas-rol="panel"]',
                    'elegido' => '[data-cod-pestanas-visible="true"]',
                    'descripcion' => 'el contenido de cada pestaña (el propio hijo del grupo)',
                ],
            ],
        ],
        'cuadrantes' => [
            'atributoRol' => 'data-cod-cuadrantes-rol',
            'partes' => [
                'imagen' => [
                    'selector' => '[data-cod-cuadrantes-rol]',
                    'elegido' => '[data-cod-cuadrantes-rol="activa"]',
                    'descripcion' => 'la celda de imagen de cada cuadrante, sea cual sea su estado (cuadrante, activa o miniatura)',
                ],
                'miniatura' => [
                    'selector' => '[data-cod-cuadrantes-rol="miniatura"]',
                    'elegido' => null,
                    'descripcion' => 'sólo las celdas de imagen que quedan reducidas mientras hay una activa',
                ],
                'texto' => [
                    'selector' => '[data-cod-cuadrantes-visible]',
                    'elegido' => '[data-cod-cuadrantes-visible="true"]',
                    'descripcion' => 'el bloque de texto de cada cuadrante (sólo se ve el del activo)',
                ],
            ],
        ],
        'marquesina' => [
            'atributoRol' => 'data-cod-marquesina-rol',
            'partes' => [
                'pista' => [
                    'selector' => '[data-cod-marquesina-rol="pista"]',
                    'elegido' => null,
                    'descripcion' => 'el contenedor que fabrica el runtime y que se desplaza en bucle; la separación entre piezas y la velocidad salen de variables (--cod-marquesina-*), no de la regla de layout',
                ],
                'pieza' => [
                    'selector' => '[data-cod-marquesina-rol="pieza"]',
                    'elegido' => null,
                    'descripcion' => 'cada elemento de la fila (el propio hijo del grupo), incluidas las copias que el runtime agrega para cerrar el bucle',
                ],
            ],
        ],
    ];

    /**
     * Tipos de regla que pueden dirigirse a una parte de un behavior. Quedan
     * fuera los auto-selectivos (media, gallery, table, motion), que arman sus
     * propios selectores para elementos internos de un nodo de su tipo; los
     * que no emiten CSS de clase (interaction, anchor, cadence); y form, que
     * estila un contenedor de formulario. Una parte fabricada por el runtime
     * no es nada de eso.
     *
     * @var array<int, string>
     */
    private const PART_RULE_KINDS = ['color', 'typography', 'spacing', 'layout', 'surface', 'shape', 'button', 'properties'];

    /**
     * Propiedades que acepta el kind `properties`. Lista blanca cerrada: una
     * propiedad que no esté acá se rechaza nombrándola, y se puede pedir que se
     * agregue. Las propiedades personalizadas (--nombre) se validan por forma,
     * no por lista. Las imágenes no entran por acá: van por el kind media.
     *
     * @var array<int, string>
     */
    private const PROPERTIES_ALLOWED = [
        'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'display',
        'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-auto-flow',
        'place-items', 'place-content', 'align-items', 'align-content', 'align-self',
        'justify-items', 'justify-content', 'justify-self',
        'flex-direction', 'flex-wrap', 'flex-basis', 'flex-grow', 'flex-shrink', 'order',
        'gap', 'row-gap', 'column-gap',
        'padding-block-start', 'padding-block-end', 'padding-inline-start', 'padding-inline-end',
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'margin-block-start', 'margin-block-end', 'margin-inline-start', 'margin-inline-end',
        'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'color', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
        'border-style', 'border-width', 'border-color',
        'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
        'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
        'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
        'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
        'box-shadow', 'backdrop-filter', 'filter', 'opacity', 'mix-blend-mode',
        'transform', 'transform-origin', 'translate', 'rotate', 'scale',
        'position', 'top', 'right', 'bottom', 'left',
        'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end', 'z-index',
        'overflow', 'overflow-x', 'overflow-y', 'cursor', 'pointer-events', 'visibility',
        'aspect-ratio', 'object-fit', 'object-position', 'fill', 'stroke', 'stroke-width',
        'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
        'text-align', 'text-transform', 'text-decoration-line', 'text-wrap', 'white-space', 'word-break', 'writing-mode',
        'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
        'animation-name', 'animation-duration', 'animation-timing-function', 'animation-iteration-count', 'animation-delay',
        'list-style-type', 'list-style-position', 'vertical-align', 'table-layout', 'border-collapse', 'border-spacing',
        'isolation', 'contain', 'scroll-margin-block-start', 'scroll-behavior', 'inset',
    ];

    /**
     * Abreviadas reales de CSS. GrapesJS las expande a sus partes y, si el valor
     * lleva una variable, no puede resolverla y DESCARTA la declaración entera
     * en silencio (defecto medido y documentado; ver
     * scripts/auditar-abreviadas.mjs). Por eso el kind `properties` rechaza
     * una abreviada cuyo valor contenga var(). Las que no están en
     * PROPERTIES_ALLOWED se rechazan de todos modos, pero con este motivo,
     * que es el que orienta a quien escribe la regla. El valor es la pista de
     * cómo escribirla en forma larga.
     *
     * @var array<string, string>
     */
    private const SHORTHAND_PROPERTIES = [
        'background' => 'background-color, background-image, background-size, background-position y background-repeat',
        'background-position' => 'object-position no aplica; usa un valor literal (sin var())',
        'border' => 'border-<lado>-width, border-<lado>-style y border-<lado>-color',
        'border-top' => 'border-top-width, border-top-style y border-top-color',
        'border-right' => 'border-right-width, border-right-style y border-right-color',
        'border-bottom' => 'border-bottom-width, border-bottom-style y border-bottom-color',
        'border-left' => 'border-left-width, border-left-style y border-left-color',
        'border-width' => 'border-top-width, border-right-width, border-bottom-width y border-left-width',
        'border-style' => 'border-top-style, border-right-style, border-bottom-style y border-left-style',
        'border-color' => 'border-top-color, border-right-color, border-bottom-color y border-left-color',
        'border-radius' => 'border-top-left-radius, border-top-right-radius, border-bottom-right-radius y border-bottom-left-radius',
        'font' => 'font-family, font-size, font-weight, font-style y line-height',
        'margin' => 'margin-top, margin-right, margin-bottom y margin-left',
        'padding' => 'padding-top, padding-right, padding-bottom y padding-left',
        'transition' => 'transition-property, transition-duration, transition-timing-function y transition-delay',
        'animation' => 'animation-name, animation-duration, animation-timing-function, animation-iteration-count y animation-delay',
        'grid' => 'grid-template-columns, grid-template-rows y grid-auto-flow',
        'grid-area' => 'grid-column y grid-row con valores literales',
        'grid-column' => 'un valor literal (sin var())',
        'grid-row' => 'un valor literal (sin var())',
        'flex' => 'flex-grow, flex-shrink y flex-basis',
        'gap' => 'row-gap y column-gap',
        'place-items' => 'align-items y justify-items',
        'place-content' => 'align-content y justify-content',
        'place-self' => 'align-self y justify-self',
        'overflow' => 'overflow-x y overflow-y',
        'inset' => 'top, right, bottom y left (o inset-block-start, inset-inline-start…)',
        'text-wrap' => 'un valor literal (sin var())',
    ];

    /** @var array<int, string> */
    private const SOURCE_KINDS = ['reference', 'user', 'ai'];

    /**
     * Tipos cuyo ayudante recibe el selector y devuelve reglas CSS completas,
     * porque alcanzan elementos internos del nodo. No deben volver a envolverse.
     *
     * Se distinguen de los demás por la firma: media_css, gallery_css,
     * table_css y motion_css reciben $selector; button_css y form_css no,
     * porque sólo producen declaraciones sueltas para el nodo mismo.
     *
     * @var array<int, string>
     */
    private const SELF_SELECTED_RULE_KINDS = ['media', 'gallery', 'table', 'motion'];

    private const MAX_RULES = 256;
    private const MAX_NODES = 240;
    private const MAX_DEPTH = 12;

    public function __construct(private COD_Canvas_Document_Sanitizer $sanitizer)
    {
    }

    /**
     * Catálogo que consume la IA. Expone una gramática, no una lista cerrada de
     * plantillas: una tarjeta, galería, ficha, encabezado o bloque editorial se
     * compone con los mismos nodos y reglas.
     *
     * @return array<string, mixed>
     */
    public function capability_catalog(): array
    {
        return [
            'version' => self::VERSION,
            'designRuleSet' => [
                'requiredEnvelope' => [
                    'schemaVersion',
                    'designId',
                    'expectedDesignRevision',
                    'reviewState',
                    'rules',
                ],
                'reviewStates' => self::REVIEW_STATES,
                'ruleRecord' => [
                    'required' => ['id', 'kind', 'scope', 'provenance', 'status', 'value'],
                    // provenance es un OBJETO, no una cadena. Antes acá sólo se
                    // publicaba 'provenanceSources' => ['reference','user','ai'],
                    // que se leía como "provenance es uno de estos textos" —
                    // y con esa forma el servidor rechaza el 100% de las
                    // reglas. Quien seguía la documentación al pie de la letra
                    // no tenía manera de acertar ni de saber por qué fallaba.
                    'provenance' => [
                        'type' => 'object',
                        'required' => ['sources'],
                        'sources' => [
                            'type' => 'array',
                            'minItems' => 1,
                            'maxItems' => 16,
                            'itemRequired' => ['kind'],
                            'itemKinds' => self::SOURCE_KINDS,
                            'itemOptional' => [
                                'label' => 'texto, hasta 200 caracteres',
                                'reference' => 'texto, hasta 300 caracteres',
                                'rationale' => 'texto, hasta 1000 caracteres',
                            ],
                        ],
                        'confidence' => 'número opcional entre 0 y 1',
                        'ejemplo' => [
                            'sources' => [
                                ['kind' => 'reference', 'reference' => 'https://ejemplo.cl/guia', 'rationale' => 'Paleta de la marca.'],
                            ],
                            'confidence' => 0.9,
                        ],
                    ],
                    'ruleStatuses' => self::RULE_STATUSES,
                    'scope' => [
                        'breakpoint' => ['all', 'desktop', 'tablet', 'mobile'],
                        'state' => ['default', 'hover', 'focus', 'active', 'current'],
                        'stateCurrent' => $this->state_current_text(),
                        'roles' => 'Lista opcional de roles semánticos afectados.',
                    ],
                ],
                'ruleKinds' => [
                    'color' => 'Roles cromáticos, no sólo una paleta nominal. Emite siempre la variable --cod-color-<rol> y además pinta el nodo: apply ("text" o "background"; por omisión "text") elige si el color va a color o a background-color. Los fondos de bloque van por la regla surface.',
                    'typography' => 'Jerarquía editorial: escala, medida, interlineado, tracking, transformación, énfasis y alineación.',
                    'spacing' => 'Ritmo, padding, margen, gap, sangría y sangrado.',
                    'layout' => 'Stack, columnas, grid, metro, masonry, cluster o carrusel; incluye respuesta móvil.',
                    'surface' => 'Fondos, overlays, borde, sombra, densidad y tratamientos de superficie.',
                    'shape' => 'Radio, contorno y máscara geométrica segura.',
                    'media' => 'Relación, recorte, foco, marco, overlay, caption, tratamiento hover y filtro (none|grayscale) de imagen/video.',
                    'button' => 'Variantes, tono, tamaño, ancho y respuesta de interacción de enlaces de acción.',
                    'gallery' => 'Regla de presentación para una colección de primitivas: grilla, metro, masonry o carrusel. No define QUÉ se muestra (eso lo dice el kind de cada item), solo CÓMO.',
                    'table' => 'Jerarquía de cabecera, rayado, borde y respuesta horizontal.',
                    'form' => 'Contenedor de un formulario publicado; no crea campos arbitrarios ni reescribe sus campos internos.',
                    'motion' => 'Paleta por ítem: load, scroll u hover con efecto, duración, easing, delay y stagger.',
                    'interaction' => 'Comportamientos declarativos ya presentes en Canvas, sin código remoto.',
                    'cadence' => 'Ciclo de reglas aplicado a hijos para alternancia visual y ritmo de una colección.',
                    'anchor' => 'Ancla CUALQUIER nodo a un borde/esquina de su contenedor position:relative más cercano, con cuánto cuelga afuera y cómo entra en vista al hacer scroll. No es exclusiva de whatsapp: separa "dónde nace y cómo entra" (esta regla) de "cómo se ve" (propiedades propias del nodo).',
                    'properties' => 'Escribe propiedades CSS directamente, cualquiera de la lista permitida más cualquier propiedad personalizada (--nombre), con scope completo (breakpoint y state, incluido current). Los 15 tipos semánticos anteriores siguen siendo el camino preferido cuando aplican, porque llevan rol y procedencia y son lo que el set de diseño reconoce y reutiliza; este tipo existe para que ninguna propiedad quede inalcanzable. Forma larga obligatoria: una abreviada (background, border-radius, gap…) con var() se rechaza, porque GrapesJS la descartaría en silencio. Las imágenes van por media, no por acá.',
                ],
                'ruleValueSchemas' => $this->rule_value_schemas(),
            ],
            'composition' => [
                'schemaVersion' => 2,
                'root' => 'nodes[]',
                'nodeKinds' => self::NODE_KINDS,
                'nodeRecord' => [
                    'required' => ['id', 'kind'],
                    'optional' => ['role', 'marker', 'ruleIds', 'cadenceRuleId', 'partes', 'children', 'content'],
                    'ruleApplication' => 'Cada nodo refiere reglas por id. No acepta CSS, HTML, JS, selectores ni componentes serializados por el cliente.',
                    'marker' => 'Destino estable al que puede llegar un enlace, un QR o el menú: se emite como id de HTML y por eso debe ser único en la página. Es identidad del nodo, no una regla —una regla se aplica a muchos nodos y repetiría el id. El aire de aterrizaje, en cambio, sí es una regla: spacing.landing.',
                    'partes' => 'Opcional, sólo en un nodo que lleve un behavior que fabrica partes en el navegador (ver composition.behaviorContracts: hoy pestanas, cuadrantes y marquesina). Mapa parte → lista de ids de regla, por ejemplo {"etiqueta":["pestana-normal","pestana-activa"],"lista":["fila"]}. Cada regla se emite con un selector de descendiente anclado al nodo (.cod-node-id-<id> [data-cod-pestanas-rol="etiqueta"]), que es lo único que alcanza un elemento que el runtime fabrica y que no recibe clases de regla. Con scope.state="current" se combina con la marca del elegido de ESA parte. La misma regla puede ir además en ruleIds: las dos formas conviven. Sólo admiten partes las reglas color, typography, spacing, layout, surface, shape, button y properties.',
                ],
                'nodeContentSchemas' => $this->node_content_schemas(),
                'behaviorContracts' => $this->behavior_contracts_catalog(),
            ],
            'realization' => [
                'canvasPrimitives' => [
                    'section', 'header', 'footer', 'navigation', 'columns', 'column', 'group', 'heading', 'paragraph', 'image',
                    'video', 'video con transparencia real (matte)', 'button', 'dynamic value', 'dynamic group', 'table', 'published Orugantt form',
                ],
                'safeRuntimeBehaviors' => [
                    'scroll-threshold', 'nav-toggle', 'carousel-basic', 'reveal-on-scroll', 'lightbox', 'cuadrantes', 'pestanas', 'marquesina',
                    'load-transition', 'scroll-transition',
                ],
                'assetPolicy' => 'cod_resolve_canvas_assets devuelve activos ya gestionados por Canvas. El compilador acepta URLs seguras, no carga archivos ni verifica recursos remotos.',
                'formPolicy' => 'Los formularios se eligen desde cod_list_canvas_forms; Canvas no recibe HTML de formulario remoto.',
            ],
            'existingButNotCallableYet' => [
                [
                    'id' => 'dynamicCollection',
                    'reason' => 'Canvas tiene grupo dinámico visual, pero aún no una consulta remota versionada con filtros, paginación y plantilla de ítem.',
                ],
                [
                    'id' => 'geoMap',
                    'reason' => 'Existe bloque y runtime especializado; falta contrato MCP seguro para sus datos geográficos.',
                ],
                [
                    'id' => 'parcelMap',
                    'reason' => 'Existe bloque y runtime especializado; falta contrato MCP seguro para sus datos de lotes.',
                ],
                [
                    'id' => 'heroCollapse',
                    'reason' => 'El video con transparencia real (matte) que usa este banner ya es composable (nodo video con matte:true). Lo que falta es solo el efecto de encogerse/moverse al hacer scroll (el "collapse"): existe su runtime específico, pero aún no una semántica portable de objetivos y transiciones para MCP.',
                ],
                [
                    'id' => 'externalEmbed',
                    'reason' => 'El saneador de Canvas excluye iframe deliberadamente. Hasta definir una política de proveedores y sandbox no se materializan embeds remotos por MCP.',
                ],
                [
                    'id' => 'formFieldStyling',
                    'reason' => 'Resuelto parcialmente: la regla form acepta "theme", que fija las variables de diseño publicadas por el runtime de formularios (colores, tipografía, radio, espaciados). Lo que sigue sin existir es apuntar a un CAMPO concreto — eso ataría el diseño a la estructura interna del formulario.',
                ],
            ],
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private function rule_value_schemas(): array
    {
        return [
            'color' => [
                'required' => ['role', 'color'],
                'fields' => [
                    'role' => 'stable id',
                    'color' => 'hex, rgb(), hsl(), oklch(), transparent o currentColor',
                    'apply' => 'opcional: "text" (color, por omisión) o "background" (background-color); los fondos de bloque van por surface',
                ],
            ],
            'typography' => [
                'required' => ['role'],
                'fields' => [
                    'role' => 'stable id editorial', 'family' => 'familia segura', 'fontSize' => 'longitud o clamp()',
                    'fontWeight' => '100..900 paso 100', 'lineHeight' => '0.8..3', 'letterSpacing' => 'longitud, admite negativo',
                    'measure' => 'longitud', 'align' => ['start', 'center', 'end', 'justify'],
                    'transform' => ['none', 'uppercase', 'lowercase', 'capitalize'], 'style' => ['normal', 'italic'],
                    'decoration' => ['none', 'underline'],
                ],
            ],
            'spacing' => [
                'atLeastOneOf' => ['paddingBlock', 'paddingInline', 'marginBlockStart', 'marginBlockEnd', 'gap', 'indent', 'bleed', 'landing'],
                'notes' => 'bleed admite valor negativo; las demás medidas son seguras y positivas. landing es el aire que queda arriba cuando el scroll aterriza en el nodo por un enlace (normalmente el alto del header fijo); es reutilizable y suele ser el mismo en todo el sitio.',
            ],
            'layout' => [
                'required' => ['mode'],
                'fields' => [
                    'mode' => ['stack', 'columns', 'grid', 'metro', 'masonry', 'cluster', 'carousel'],
                    'columns' => '1..8', 'gap' => 'longitud', 'minColumnWidth' => 'longitud', 'maxWidth' => 'longitud',
                    'align' => ['start', 'center', 'end', 'stretch'],
                    'justify' => ['start', 'center', 'end', 'between', 'around', 'evenly'],
                    'mobile' => ['mode' => ['stack', 'grid', 'columns', 'carousel'], 'columns' => '1..4', 'gap' => 'longitud'],
                ],
            ],
            'surface' => [
                'atLeastOneOf' => ['backgroundColor', 'foregroundColor', 'backgroundAssetUrl', 'overlayColor', 'borderColor', 'borderWidth', 'shadow'],
                'fields' => [
                    'backgroundAssetUrl' => 'URL HTTP(S) o raíz relativa segura; usa cod_resolve_canvas_assets para material existente',
                    'backgroundPosition' => 'una o dos componentes: palabras (left|center|right, top|center|bottom) y/o medidas (número con px em rem vh vw vmin vmax ch ex cm mm in pt pc q o %); ej. center, 2% 50%, left 20px',
                    'backgroundSize' => 'cover|contain|auto, o una o dos medidas (auto vale como componente); ej. 7% auto, 200px, 50% 100%',
                    'backgroundRepeat' => ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round'],
                    'overlayColor' => 'color seguro; con backgroundAssetUrl se emite como velo plano de opacidad pareja sobre la imagen (nunca degradado)',
                    'overlayOpacity' => '0..1 (por omisión 1); necesita overlayColor', 'shadow' => ['none', 'sm', 'md', 'lg'],
                ],
            ],
            'shape' => [
                'atLeastOneOf' => ['radius', 'borderStyle', 'borderWidth', 'mask'],
                'fields' => ['radius' => 'longitud|none|pill|circle', 'borderStyle' => ['none', 'solid', 'dashed'], 'mask' => ['none', 'rounded', 'circle', 'arch']],
            ],
            'media' => [
                'atLeastOneOf' => ['aspectRatio', 'fit', 'position', 'frame', 'overlayColor', 'hover', 'caption', 'filter'],
                'fields' => [
                    'aspectRatio' => 'p. ej. 4/3 o 16/9', 'fit' => ['cover', 'contain', 'fill', 'none', 'scale-down'],
                    'frame' => ['none', 'rounded', 'circle', 'arch'], 'hover' => ['none', 'zoom', 'lift', 'dim'],
                    'caption' => ['none', 'overlay', 'below'], 'overlayOpacity' => '0..1',
                    'filter' => ['none', 'grayscale'],
                ],
            ],
            'button' => [
                'atLeastOneOf' => ['variant', 'tone', 'size', 'width', 'interaction', 'zIndex'],
                'fields' => [
                    'variant' => ['solid', 'outline', 'ghost', 'text'], 'tone' => ['primary', 'secondary', 'inverse'],
                    'size' => ['sm', 'md', 'lg'], 'width' => ['auto', 'full'], 'interaction' => ['none', 'lift', 'underline'],
                    'zIndex' => '-999..999. Solo gana contra HERMANOS en el mismo contexto de apilamiento — si un ancestro tiene z-index negativo (p. ej. un fondo de video/imagen tipo "capítulo"), esto no basta para escapar de esa trampa; ahí hace falta reubicar el nodo en otro contenedor, no un número más alto.',
                ],
            ],
            'gallery' => [
                'required' => ['mode'],
                'fields' => [
                    'mode' => ['grid', 'metro', 'masonry', 'carousel'], 'columns' => '1..8', 'mobileColumns' => '1..8',
                    'gap' => 'longitud', 'caption' => ['none', 'overlay', 'below'], 'controls' => ['none', 'arrows', 'arrows-and-dots'],
                ],
                'constraint' => 'controls distinto de none requiere una regla interaction con behavior carousel-basic en el mismo nodo gallery.',
            ],
            'table' => [
                'atLeastOneOf' => ['variant', 'header', 'responsive', 'density'],
                'fields' => [
                    'variant' => ['plain', 'lined', 'striped', 'cards'], 'header' => ['plain', 'accent', 'inverse'],
                    'responsive' => ['scroll', 'stack'], 'density' => ['compact', 'comfortable', 'spacious'],
                ],
            ],
            'form' => [
                'atLeastOneOf' => ['maxWidth', 'surface'],
                'fields' => ['maxWidth' => 'longitud', 'surface' => ['none', 'card', 'outlined'], 'theme' => 'variables de diseño del runtime del formulario (colores, tipografía, radio, espaciados)'],
                'constraint' => 'El contenedor se estila con maxWidth/surface; el interior con theme, que fija las variables del runtime — nunca reglas sobre sus campos.',
            ],
            'motion' => [
                'required' => ['trigger'],
                'fields' => [
                    'trigger' => ['load', 'scroll', 'hover'], 'effect' => ['fade', 'rise', 'slide-left', 'slide-right', 'scale'],
                    'duration' => '0..5000 ms', 'delay' => '0..5000 ms', 'stagger' => '0..2000 ms',
                    'easing' => ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'], 'threshold' => '0..1, sólo scroll',
                ],
                'constraints' => ['load exige delay=0 y stagger=0', 'hover exige stagger=0', 'scroll permite stagger por ítem'],
            ],
            'interaction' => [
                'required' => ['behavior'],
                'fields' => [
                    'behavior' => ['scroll-threshold', 'nav-toggle', 'carousel-basic', 'lightbox', 'cuadrantes', 'pestanas', 'marquesina'],
                    'threshold' => '0..4000', 'targetId' => 'requerido por nav-toggle', 'toggleClass' => 'clase segura',
                    'mode' => ['single', 'track'], 'visible' => '1..8', 'visibleMobile' => '1..8',
                ],
                'constraints' => [
                    'carousel-basic sólo en gallery', 'lightbox sólo en gallery', 'nav-toggle requiere targetId presente en la composición',
                    'cuadrantes sólo en un nodo group con EXACTAMENTE 4 hijos; cada hijo es un contenedor (group) con una imagen y su texto (título y párrafo). En reposo las cuatro imágenes forman una grilla 2x2; al activar una, su imagen ocupa la mitad del bloque, su texto aparece en la otra mitad y las otras tres pasan a miniaturas que conservan su disposición 2x2 (un hueco donde estaba la activa), pegadas a la esquina de la imagen que mira al centro (ítems 1 y 3: imagen a la izquierda; 2 y 4: a la derecha; 1 y 2: miniaturas abajo; 3 y 4: arriba). El compilador sólo emite data-cod-behavior="cuadrantes"; el runtime arma botones, ×, atributos y clases. Sin colores ni tipografía: eso lo ponen las reglas de diseño del sitio.',
                    'cuadrantes no admite threshold, targetId, toggleClass, mode, visible ni visibleMobile',
                    'pestanas sólo en un nodo group con 2 a 8 hijos; cada hijo es una pestaña: su PRIMER hijo es la etiqueta (lo que se pincha: un título, un número, un texto) y el RESTO es el panel de contenido. Al cargar queda activa la primera; al pinchar una etiqueta se muestra su panel y se ocultan los demás, sin que el alto salte de golpe. El runtime pone las etiquetas en una lista de botones reales (role="tablist" / role="tab"; flechas izquierda y derecha, Inicio y Fin) y convierte a cada hijo en su panel (role="tabpanel"). Para estilar el estado, la composición usa los atributos que emite el runtime: [data-cod-pestanas-rol="etiqueta"][data-cod-pestanas-estado="activa"|"inactiva"] y [data-cod-pestanas-rol="panel"][data-cod-pestanas-visible="true"|"false"]. Sin colores ni tipografía: eso lo ponen las reglas de diseño del sitio. Si la forma interna no calza (algún hijo con menos de 2 hijos propios) el runtime no toca nada y el contenido queda apilado.',
                    'pestanas no admite threshold, targetId, toggleClass, mode, visible ni visibleMobile',
                    'marquesina sólo en un nodo group con 2 a 24 hijos; cada hijo es una pieza de una fila que se desplaza sola, de derecha a izquierda y en bucle continuo, sin controles (logos de certificación, sellos, una frase de cinta). El runtime mete las piezas en una pista y agrega una copia del juego (marcada aria-hidden y sin ids) para que el bucle cierre sin salto; si hay pocas piezas para llenar el ancho, repite el juego las veces que haga falta. La pista se mueve con CSS puro (@keyframes y translateX(-50%)): sin librerías ni JavaScript por cuadro. Con prefers-reduced-motion: reduce el movimiento se detiene y las piezas quedan quietas y a la vista, sin copias. Cuántas piezas se ven a la vez, la separación y la velocidad NO son parámetros de la regla interaction: se escriben con una regla properties sobre el nodo, que admite scope.breakpoint, así que el número cambia por ancho como cualquier otra regla: --cod-marquesina-visibles (piezas a la vez; por omisión 4), --cod-marquesina-separacion (espacio entre piezas; por omisión 0px) y --cod-marquesina-duracion-pieza (cuánto tarda en pasar una pieza; por omisión 8s, un desplazamiento lento y continuo). Para estilar la pista o cada pieza se usan las partes pista y pieza del nodo. Sin colores ni tipografía: eso lo ponen las reglas de diseño del sitio. Si el grupo no calza el runtime no toca nada y las piezas quedan apiladas.',
                    'marquesina no admite threshold, targetId, toggleClass, mode, visible ni visibleMobile (las piezas visibles se declaran con la variable --cod-marquesina-visibles, no con visible)',
                ],
            ],
            'properties' => [
                'required' => ['declarations'],
                'fields' => [
                    'declarations' => 'objeto propiedad → valor, de 1 a 40 declaraciones. Propiedades: las de la lista permitida (' . implode(', ', self::PROPERTIES_ALLOWED) . ') o una propiedad personalizada --[a-z0-9-]+. Valores: texto de 1 a 300 caracteres, sin { } ; < > \\ @ url( expression( javascript: ni /*.',
                ],
                'notes' => 'Los 15 tipos semánticos anteriores siguen siendo el camino preferido cuando aplican, porque llevan rol y procedencia; este tipo existe para que ninguna propiedad quede inalcanzable. Acepta scope completo: breakpoint y state (default, hover, focus, active, current). Nunca una abreviada con var(): background, border, font, margin, padding, transition, animation, grid, flex, gap, overflow, inset, place-*, border-radius y border-width/style/color se escriben en su forma larga cuando llevan variable. Se puede dirigir a una parte que fabrica un behavior con el campo partes del nodo. Una propiedad fuera de la lista se rechaza nombrándola; se puede pedir que se agregue.',
            ],
            'cadence' => [
                'required' => ['cycleRuleIds'],
                'fields' => ['cycleRuleIds' => '1..12 ids de reglas no-cadence', 'offset' => '0..11'],
            ],
            'anchor' => [
                'fields' => [
                    'edge' => ['bottom', 'top', 'left', 'right', 'bottom-left', 'bottom-right', 'top-left', 'top-right', 'center'],
                    'offset' => '-100..100 (% del tamaño del propio nodo; 50 = mitad afuera del borde, 0 = completamente adentro, negativo = hacia adentro más allá del borde), por defecto 50',
                    'animation' => '{routine: rise|fade|scale|pop, level: 1..3}, por defecto rise/2. Con routine=rise la dirección de entrada sigue el edge (sube desde abajo, baja desde arriba, entra desde el lado correspondiente; en center cae a scale). rise también respira: arranca un poco más chico y rebota hasta su tamaño real.',
                    'repeat' => 'boolean, por defecto true. true = la animación de entrada vuelve a jugar cada vez que el nodo sale y vuelve a aparecer en pantalla (bueno para CTAs vistosos, como whatsapp). false = se revela una sola vez y queda fijo, como una aparición normal de contenido.',
                ],
                'constraint' => 'El nodo con esta regla necesita un ancestro position:relative (p. ej. una section/group con esa propiedad) para anclarse correctamente, no a la ventana.',
            ],
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private function node_content_schemas(): array
    {
        return [
            'section|header|footer|navigation|group|layout' => ['content' => 'No usar; declara children: node[].'],
            'heading' => ['content' => ['text' => 'texto plano <=500', 'level' => '1..6']],
            'paragraph' => ['content' => ['text' => 'texto plano <=5000']],
            'richText' => ['content' => ['paragraphs' => '1..24 textos planos']],
            'image' => ['content' => [
                'assetUrl' => 'URL de activo',
                'alt' => 'texto requerido',
                'caption' => 'opcional',
                'rotation' => 'opcional, 0|90|180|270 (por defecto 0). Cuarto de vuelta de la imagen, en sentido horario. Es propiedad de la IMAGEN, no del marco: dentro de una galería cada ítem lleva el suyo, y el giro se respeta también al ampliar en el lightbox. Sirve para material de teléfono al que WordPress le borró la orientación EXIF sin girar los píxeles.',
            ]],
            'video' => ['content' => [
                'sourceUrl' => 'URL de activo',
                'posterUrl' => 'opcional',
                'caption' => 'opcional',
                'matte' => 'opcional, boolean, default false. true = video con transparencia real (compositor cod-luma-matte): el archivo fuente debe traer el video RGB arriba y su máscara blanco/negro abajo (mismo ancho, el doble de alto; blanco = visible, negro = transparente). Se renderiza como video oculto + canvas compuesto en vivo; ignora posterUrl.',
                'ambient' => 'opcional, boolean, default false. true = video ambiental: emite <video autoplay loop muted playsinline> SIN controles y sin botón de sonido (va solo, en bucle y mudo, como fondo o textura viva). false o ausente = el video de siempre, con controles. Si viene junto con matte:true manda matte y ambient se ignora (el compositor de luma matte ya arranca el video por su cuenta).',
            ]],
            'audio' => ['content' => ['sourceUrl' => 'URL de activo', 'label' => 'opcional']],
            'button|link' => ['content' => ['label' => 'texto', 'href' => 'enlace seguro', 'target' => ['self', 'blank']]],
            'list' => ['content' => ['ordered' => 'boolean', 'items' => '1..100 textos planos']],
            'table' => ['content' => ['headers' => '1..20 textos', 'rows' => '0..100 filas con el mismo ancho']],
            'gallery' => ['content' => ['items' => "1..80 items. Cada item declara su primitiva con 'kind': image (por defecto) {assetUrl, alt, caption?}, video {sourceUrl?, posterUrl?, caption?, matte?, ambient?, pendingLabel?} o dynamic {token, fallback?}. La galería solo aporta presentación (grilla/metro/masonry/carrusel, leyenda, controles): el dibujo de cada item lo hace su propia primitiva. Galería de fotos, de videos y de artículos son la misma máquina con distinta primitiva adentro."]],
            'form' => ['content' => ['formSlug' => 'valor devuelto por cod_list_canvas_forms']],
            'shortcode' => ['content' => [
                'tag' => 'nombre del shortcode, de la lista permitida del sitio (hoy: instagram-feed). No ejecuta cualquiera: fuera de esa lista no se renderiza.',
                'atts' => 'opcional, objeto de pares simples (texto) que se pasan al shortcode; por ejemplo {"feed":"1"}',
            ]],
            'dynamic' => ['content' => ['token' => 'post_title|post_excerpt|featured_image|permalink|acf:*|acf_image:*', 'fallback' => 'opcional']],
            'separator' => ['content' => 'Objeto vacío'],
            'chart' => ['content' => ['type' => ['bar', 'line'], 'labels' => '1..48 textos', 'values' => '1..48 números', 'color' => 'opcional']],
            // whatsapp es una primitiva ESTÁTICA: solo su forma/color/tamaño.
            // Dónde nace y cómo entra en vista es trabajo de una regla
            // anchor aplicada al nodo (ver ruleKinds.anchor) — cualquier
            // nodo puede llevar esa regla, no solo whatsapp.
            'whatsapp' => ['content' => [
                'message' => 'texto plano ≤300, mensaje precargado del wa.me de esta instancia',
                'ariaLabel' => 'opcional, ≤150',
                'size' => 'opcional, 24..200 (px), por defecto 56',
                'iconPadding' => 'opcional, 0..80 (px), por defecto 14',
                'iconColor' => 'opcional, color CSS seguro, por defecto #ffffff',
                'backgroundColor' => 'opcional, color CSS seguro, por defecto #25D366',
                'borderRadius' => 'opcional, longitud CSS segura (ej. 999px para pill, 8px para casi-cuadrado), por defecto 999px',
            ]],
            // social: enlace a la cuenta OFICIAL de una red. Existe para que una persona pueda
            // comprobar que habla con la empresa de verdad (hay cuentas falsas que se hacen
            // pasar por ella), así que el handle sale como texto seleccionable y la URL se
            // valida contra los dominios de la red elegida.
            'social' => ['content' => [
                'network' => 'una de: ' . implode(', ', array_keys(self::SOCIAL_NETWORKS)) . '. Lista cerrada: cualquier otra se rechaza.',
                'url' => 'dirección de la cuenta. Sólo https://, y el dominio tiene que ser el de la red elegida (p. ej. instagram.com para instagram). Nada de javascript:, data: ni usuario@ en la dirección.',
                'handle' => 'opcional, ≤80, el nombre de usuario (p. ej. @econutchile.oficial). Si viene, se dibuja como TEXTO seleccionable junto al icono, para poder compararlo letra por letra con la cuenta que escribió; si no, va sólo el icono. Letras, números y @ . _ - / (sin caracteres invisibles).',
                'ariaLabel' => 'opcional, ≤150; por defecto «<Red> de <handle>» o «<Red>»',
                'size' => 'opcional, 24..200 (px), por defecto 40',
                'iconPadding' => 'opcional, 0..80 (px), por defecto 8',
                'iconColor' => 'opcional, color CSS seguro, por defecto currentColor',
                'backgroundColor' => 'opcional, color CSS seguro, por defecto transparent',
                'borderRadius' => 'opcional, longitud CSS segura, por defecto 999px',
            ]],
        ];
    }

    /**
     * @param array<string, mixed> $composition
     * @param array<string, mixed> $design
     * @return array<string, mixed>|WP_Error
     */
    /**
     * Genera el HTML de un único módulo whatsapp aislado (sin composición
     * completa), para insertarlo directo como hijo de un contenedor ya
     * existente (p. ej. una sección real con data-wa-msg). Reutiliza la
     * misma validación y el mismo render que usa una composición normal,
     * así el resultado es idéntico a si se hubiera construido por
     * cod_apply_canvas_composition.
     *
     * @return string|WP_Error
     */
    /**
     * @param array<string, mixed> $style offset, animation (van a la regla
     *   anchor) y size, iconPadding, iconColor, backgroundColor, borderRadius
     *   (van al módulo whatsapp mismo) — todos opcionales, mezclados en un
     *   solo array por comodidad de quien llama (mismo contrato externo de
     *   siempre); acá adentro se separan en las dos primitivas reales.
     */
    public function render_whatsapp_module(string $node_id, string $message, string $position, array $style = [])
    {
        if (!$this->is_stable_id($node_id)) {
            return new WP_Error('cod_mcp_whatsapp_invalid', 'node_id no es un id estable válido.');
        }
        $anchor_input = array_intersect_key($style, array_flip(['offset', 'animation'])) + ['edge' => $position];
        $anchor_value = $this->normalize_anchor_rule($anchor_input);
        if (is_wp_error($anchor_value)) {
            return $anchor_value;
        }
        $whatsapp_input = array_intersect_key($style, array_flip(['size', 'iconPadding', 'iconColor', 'backgroundColor', 'borderRadius']));
        $normalized = $this->normalize_whatsapp_content(array_merge($whatsapp_input, ['message' => $message]));
        if (is_wp_error($normalized)) {
            return $normalized;
        }
        $anchor_style = $this->anchor_style($anchor_value, 0);
        $attrs = 'class="cod-node cod-node--whatsapp cod-node-id-' . esc_attr($node_id) . '" data-cod-node="' . esc_attr($node_id) . '"'
            . ' data-cod-behavior="anchor" data-cod-anchor-reveal-transform="' . esc_attr($anchor_style['revealedTransform']) . '"'
            . ' data-cod-anchor-repeat="' . ($anchor_value['repeat'] ? '1' : '0') . '"'
            . ' style="' . esc_attr($anchor_style['style']) . '"';
        return $this->render_whatsapp($normalized, $attrs, $node_id);
    }

    public function compile(array $composition, array $design)
    {
        $normalized_design = $this->normalize_design($design);
        if (is_wp_error($normalized_design)) {
            return $normalized_design;
        }

        $normalized_composition = $this->normalize_composition($composition, $normalized_design['ruleIndex']);
        if (is_wp_error($normalized_composition)) {
            return $normalized_composition;
        }

        $rendered = $this->render_composition($normalized_composition, $normalized_design);
        if (is_wp_error($rendered)) {
            return $rendered;
        }

        $markup = $this->sanitizer->sanitize_html($rendered['markup']);
        if (is_wp_error($markup)) {
            return $markup;
        }
        if (strpos($rendered['markup'], '--cod-motion-delay:') !== false && strpos($markup, '--cod-motion-delay:') === false) {
            return new WP_Error('cod_mcp_motion_sanitized_away', 'El saneador Canvas no preservó el stagger de movimiento; la composición no se guardó parcialmente.');
        }

        $styles = $this->sanitizer->sanitize_css($rendered['styles']);
        if (is_wp_error($styles)) {
            return $styles;
        }

        $project = [
            'pages' => [[
                'name' => 'ContOpe Design MCP composition',
                'component' => [
                    'type' => 'wrapper',
                    'components' => $markup,
                ],
                'styles' => $styles,
            ]],
            'assets' => [],
        ];
        $project_json = wp_json_encode($project, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($project_json)) {
            return new WP_Error('cod_mcp_composition_project_encode', 'No se pudo codificar el proyecto Canvas compuesto.');
        }
        $project_json = $this->sanitizer->sanitize_project_data($project_json);
        if (is_wp_error($project_json)) {
            return $project_json;
        }

        $composition_digest = hash(
            'sha256',
            wp_json_encode([
                'composition' => $normalized_composition,
                'design' => $normalized_design['evidence'],
                'compilerVersion' => self::VERSION,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        );

        return [
            'storage' => [
                'project' => $project_json,
                'markup' => $markup,
                'styles' => $styles,
            ],
            'compositionDigest' => $composition_digest,
            // Alias temporal para la ruta de snapshot existente. No significa que
            // la entrada sea una receta de secciones fijas.
            'recipeDigest' => $composition_digest,
            'design' => $normalized_design['evidence'],
            // Forma exacta y resubmitible de lo que se compiló: a diferencia de
            // storage.*/design.evidence (derivados para lectura), esto es lo que
            // hay que volver a mandar tal cual a cod_preview_canvas_composition /
            // cod_apply_canvas_composition para editar un nodo puntual sin
            // reconstruir el resto a ciegas. Ver COD_Canvas_Document_Repository::
            // META_COMPOSITION — es lo único que se persiste de esta llamada
            // aparte del resultado ya compilado.
            'compositionSnapshot' => $normalized_composition,
            'designSnapshot' => [
                'schemaVersion' => $normalized_design['schemaVersion'],
                'designId' => $normalized_design['designId'],
                'expectedDesignRevision' => $normalized_design['expectedDesignRevision'],
                'reviewState' => $normalized_design['reviewState'],
                'label' => $normalized_design['label'],
                'rules' => $normalized_design['rules'],
                'rootRuleIds' => $normalized_design['rootRuleIds'],
            ],
            'summary' => $rendered['summary'],
            'schema' => [
                'compositionVersion' => 2,
                'designRuleSetVersion' => 1,
                'compilerVersion' => self::VERSION,
            ],
        ];
    }

    public function preview_id(string $composition_digest, int $page_id, string $document_id, int $revision): string
    {
        return hash('sha256', implode('|', [self::VERSION, $composition_digest, (string) $page_id, $document_id, (string) $revision]));
    }

    /**
     * @return array<int, array{slug: string, title: string}>
     */
    public function available_forms(): array
    {
        if (!class_exists('OFR_Runtime') || !method_exists('OFR_Runtime', 'published_forms')) {
            return [];
        }

        $forms = [];
        foreach (OFR_Runtime::published_forms() as $form) {
            if (!is_array($form)) {
                continue;
            }
            $slug = isset($form['slug']) ? sanitize_key((string) $form['slug']) : '';
            if ($slug === '') {
                continue;
            }
            $forms[] = [
                'slug' => $slug,
                'title' => isset($form['title']) ? sanitize_text_field((string) $form['title']) : $slug,
            ];
        }

        return $forms;
    }

    /**
     * @param array<string, mixed> $design
     * @return array<string, mixed>|WP_Error
     */
    private function normalize_design(array $design)
    {
        $allowed = [
            'schemaVersion', 'designId', 'expectedDesignRevision', 'reviewState', 'rules', 'rootRuleIds', 'label',
        ];
        if (!$this->has_only_keys($design, $allowed)
            || !isset($design['schemaVersion'], $design['designId'], $design['expectedDesignRevision'], $design['reviewState'], $design['rules'])
            || $design['schemaVersion'] !== 1
            || !$this->is_stable_id($design['designId'])
            || !is_int($design['expectedDesignRevision'])
            || $design['expectedDesignRevision'] < 0
            || !is_string($design['reviewState'])
            || !in_array($design['reviewState'], self::REVIEW_STATES, true)
            || !is_array($design['rules'])
            || !$this->is_list($design['rules'])
            || count($design['rules']) > self::MAX_RULES) {
            return new WP_Error('cod_mcp_design_rule_set_invalid', 'El conjunto de reglas de diseño no tiene la forma permitida.');
        }

        if (isset($design['label']) && (!is_string($design['label']) || mb_strlen($design['label']) > 160)) {
            return new WP_Error('cod_mcp_design_rule_set_invalid', 'label del conjunto de reglas no es válido.');
        }

        $rules = [];
        $rule_index = [];
        foreach ($design['rules'] as $raw_rule) {
            if (!is_array($raw_rule)) {
                return new WP_Error('cod_mcp_design_rule_invalid', 'Cada regla de diseño debe ser un objeto.');
            }
            $rule = $this->normalize_rule($raw_rule);
            if (is_wp_error($rule)) {
                return $rule;
            }
            if (isset($rule_index[$rule['id']])) {
                return new WP_Error('cod_mcp_design_rule_duplicate', 'Los identificadores de reglas de diseño deben ser únicos.');
            }
            $rule_index[$rule['id']] = $rule;
            $rules[] = $rule;
        }

        foreach ($rules as $rule) {
            if ($rule['kind'] !== 'cadence') {
                continue;
            }
            foreach ($rule['value']['cycleRuleIds'] as $cycle_rule_id) {
                if (!isset($rule_index[$cycle_rule_id]) || $rule_index[$cycle_rule_id]['kind'] === 'cadence') {
                    return new WP_Error('cod_mcp_cadence_rule_invalid', 'Una regla de cadencia sólo puede referir reglas existentes no-cadencia.');
                }
                if ($rule_index[$cycle_rule_id]['scope']['state'] === 'current') {
                    return new WP_Error('cod_mcp_current_state_target_invalid', 'La regla "' . $cycle_rule_id . '" tiene scope.state="current" y una cadencia no puede repartirla: hay que aplicarla directo al nodo que va dentro de un ' . $this->current_behaviors_text(' o ') . '.');
                }
            }
        }

        $root_rule_ids = $design['rootRuleIds'] ?? [];
        if (!is_array($root_rule_ids) || !$this->is_list($root_rule_ids) || count($root_rule_ids) > 32) {
            return new WP_Error('cod_mcp_design_rule_set_invalid', 'rootRuleIds debe ser una lista acotada.');
        }
        foreach ($root_rule_ids as $rule_id) {
            if (!is_string($rule_id) || !isset($rule_index[$rule_id])) {
                return new WP_Error('cod_mcp_design_rule_reference_invalid', 'rootRuleIds contiene una regla inexistente.');
            }
            if ($rule_index[$rule_id]['scope']['state'] === 'current') {
                return new WP_Error('cod_mcp_current_state_target_invalid', 'La regla "' . $rule_id . '" tiene scope.state="current" y no puede ir en rootRuleIds: el raíz no está dentro de ningún ' . $this->current_behaviors_text(' ni ') . '.');
            }
        }

        $evidence_rules = [];
        foreach ($rules as $rule) {
            $evidence_rules[] = [
                'id' => $rule['id'],
                'kind' => $rule['kind'],
                'scope' => $rule['scope'],
                'status' => $rule['status'],
                'provenance' => $rule['provenance'],
            ];
        }

        return [
            'schemaVersion' => 1,
            'designId' => (string) $design['designId'],
            'expectedDesignRevision' => (int) $design['expectedDesignRevision'],
            'reviewState' => (string) $design['reviewState'],
            'label' => isset($design['label']) ? (string) $design['label'] : '',
            'rules' => $rules,
            'ruleIndex' => $rule_index,
            'rootRuleIds' => array_values($root_rule_ids),
            'evidence' => [
                'designId' => (string) $design['designId'],
                'expectedDesignRevision' => (int) $design['expectedDesignRevision'],
                'reviewState' => (string) $design['reviewState'],
                'portableContractPersisted' => false,
                'notice' => 'Esta es una instantánea explícita de reglas. Canvas no ha leído, escrito ni actualizado design-contract.json.',
                'rules' => $evidence_rules,
            ],
        ];
    }

    /**
     * @param array<string, mixed> $rule
     * @return array<string, mixed>|WP_Error
     */
    private function normalize_rule(array $rule)
    {
        // Cada condición avisa POR SEPARADO qué falló. Antes las once estaban
        // en un solo if con un mensaje único, así que quien recibía el error
        // sólo sabía que "algo" estaba mal en la regla: había que ir probando
        // campo por campo, o leer el código del plugin, para dar con la causa.
        // Un cliente del MCP no tiene el código a mano.
        $permitidas = ['id', 'label', 'kind', 'scope', 'provenance', 'status', 'value'];
        if (!$this->has_only_keys($rule, $permitidas)) {
            $sobran = array_diff(array_keys($rule), $permitidas);
            return new WP_Error(
                'cod_mcp_design_rule_invalid',
                sprintf(
                    'La regla trae campos que no existen: %s. Los permitidos son: %s.',
                    implode(', ', $sobran),
                    implode(', ', $permitidas)
                )
            );
        }
        foreach (['id', 'kind', 'scope', 'provenance', 'status', 'value'] as $obligatorio) {
            if (!isset($rule[$obligatorio])) {
                return new WP_Error(
                    'cod_mcp_design_rule_invalid',
                    sprintf('A la regla le falta el campo obligatorio "%s".', $obligatorio)
                );
            }
        }
        if (!$this->is_stable_id($rule['id'])) {
            return new WP_Error('cod_mcp_design_rule_invalid', 'El campo "id" de la regla no es un identificador estable válido.');
        }
        if (!is_string($rule['kind']) || !in_array($rule['kind'], self::RULE_KINDS, true)) {
            return new WP_Error(
                'cod_mcp_design_rule_invalid',
                sprintf('El campo "kind" debe ser uno de: %s.', implode(', ', self::RULE_KINDS))
            );
        }
        if (!is_array($rule['scope'])) {
            return new WP_Error('cod_mcp_design_rule_invalid', 'El campo "scope" debe ser un objeto con breakpoint y state.');
        }
        if (!is_array($rule['provenance'])) {
            return new WP_Error(
                'cod_mcp_design_rule_invalid',
                'El campo "provenance" debe ser un OBJETO con "sources" (una lista de al menos una fuente), no un texto. '
                    . 'Ejemplo: {"sources":[{"kind":"reference","reference":"https://ejemplo.cl/guia"}]}. '
                    . 'Los valores de "kind" admitidos son: ' . implode(', ', self::SOURCE_KINDS) . '.'
            );
        }
        if (!is_string($rule['status']) || !in_array($rule['status'], self::RULE_STATUSES, true)) {
            return new WP_Error(
                'cod_mcp_design_rule_invalid',
                sprintf('El campo "status" debe ser uno de: %s.', implode(', ', self::RULE_STATUSES))
            );
        }
        if (!is_array($rule['value'])) {
            return new WP_Error('cod_mcp_design_rule_invalid', 'El campo "value" debe ser un objeto, y su forma depende de "kind".');
        }
        if (isset($rule['label']) && (!is_string($rule['label']) || mb_strlen($rule['label']) > 160)) {
            return new WP_Error('cod_mcp_design_rule_invalid', 'El campo "label" debe ser texto de hasta 160 caracteres.');
        }

        $scope = $this->normalize_scope($rule['scope']);
        if (is_wp_error($scope)) {
            return $scope;
        }
        $provenance = $this->normalize_provenance($rule['provenance']);
        if (is_wp_error($provenance)) {
            return $provenance;
        }
        $value = $this->normalize_rule_value((string) $rule['kind'], $rule['value']);
        if (is_wp_error($value)) {
            return $value;
        }

        return [
            'id' => (string) $rule['id'],
            'label' => isset($rule['label']) ? (string) $rule['label'] : '',
            'kind' => (string) $rule['kind'],
            'scope' => $scope,
            'provenance' => $provenance,
            'status' => (string) $rule['status'],
            'value' => $value,
        ];
    }

    /**
     * @param array<string, mixed> $scope
     * @return array<string, mixed>|WP_Error
     */
    private function normalize_scope(array $scope)
    {
        if (!$this->has_only_keys($scope, ['breakpoint', 'state', 'roles'])) {
            return new WP_Error('cod_mcp_design_scope_invalid', 'scope contiene un campo no permitido.');
        }
        $breakpoint = $scope['breakpoint'] ?? 'all';
        $state = $scope['state'] ?? 'default';
        $roles = $scope['roles'] ?? [];
        if (!is_string($breakpoint) || !in_array($breakpoint, ['all', 'desktop', 'tablet', 'mobile'], true)
            || !is_string($state) || !in_array($state, ['default', 'hover', 'focus', 'active', 'current'], true)
            || !is_array($roles) || !$this->is_list($roles) || count($roles) > 32) {
            return new WP_Error('cod_mcp_design_scope_invalid', 'scope debe declarar breakpoint, state y roles válidos.');
        }
        foreach ($roles as $role) {
            if (!is_string($role) || !$this->is_stable_id($role)) {
                return new WP_Error('cod_mcp_design_scope_invalid', 'scope.roles contiene un rol no válido.');
            }
        }
        return [
            'breakpoint' => $breakpoint,
            'state' => $state,
            'roles' => array_values($roles),
        ];
    }

    /**
     * @param array<string, mixed> $provenance
     * @return array<string, mixed>|WP_Error
     */
    private function normalize_provenance(array $provenance)
    {
        if (!$this->has_only_keys($provenance, ['sources', 'confidence'])
            || !isset($provenance['sources'])
            || !is_array($provenance['sources'])
            || !$this->is_list($provenance['sources'])
            || count($provenance['sources']) < 1
            || count($provenance['sources']) > 16) {
            return new WP_Error('cod_mcp_design_provenance_invalid', 'Toda regla debe declarar al menos una fuente de procedencia.');
        }

        $sources = [];
        foreach ($provenance['sources'] as $source) {
            if (!is_array($source)
                || !$this->has_only_keys($source, ['kind', 'label', 'reference', 'rationale'])
                || !isset($source['kind'])
                || !is_string($source['kind'])
                || !in_array($source['kind'], self::SOURCE_KINDS, true)
                || (isset($source['label']) && (!is_string($source['label']) || mb_strlen($source['label']) > 200))
                || (isset($source['reference']) && (!is_string($source['reference']) || mb_strlen($source['reference']) > 300))
                || (isset($source['rationale']) && (!is_string($source['rationale']) || mb_strlen($source['rationale']) > 1000))) {
                return new WP_Error('cod_mcp_design_provenance_invalid', 'Una fuente de procedencia no tiene la forma permitida.');
            }
            $sources[] = [
                'kind' => $source['kind'],
                'label' => isset($source['label']) ? $source['label'] : '',
                'reference' => isset($source['reference']) ? $source['reference'] : '',
                'rationale' => isset($source['rationale']) ? $source['rationale'] : '',
            ];
        }

        $confidence = $provenance['confidence'] ?? null;
        if ($confidence !== null && (!is_float($confidence) && !is_int($confidence) || $confidence < 0 || $confidence > 1)) {
            return new WP_Error('cod_mcp_design_provenance_invalid', 'confidence debe estar entre 0 y 1.');
        }

        return [
            'sources' => $sources,
            'confidence' => $confidence === null ? null : (float) $confidence,
        ];
    }

    /**
     * @param array<string, mixed> $value
     * @return array<string, mixed>|WP_Error
     */
    private function normalize_rule_value(string $kind, array $value)
    {
        switch ($kind) {
            case 'color':
                return $this->normalize_color_rule($value);
            case 'typography':
                return $this->normalize_typography_rule($value);
            case 'spacing':
                return $this->normalize_spacing_rule($value);
            case 'layout':
                return $this->normalize_layout_rule($value);
            case 'surface':
                return $this->normalize_surface_rule($value);
            case 'shape':
                return $this->normalize_shape_rule($value);
            case 'media':
                return $this->normalize_media_rule($value);
            case 'button':
                return $this->normalize_button_rule($value);
            case 'gallery':
                return $this->normalize_gallery_rule($value);
            case 'table':
                return $this->normalize_table_rule($value);
            case 'form':
                return $this->normalize_form_rule($value);
            case 'motion':
                return $this->normalize_motion_rule($value);
            case 'interaction':
                return $this->normalize_interaction_rule($value);
            case 'cadence':
                return $this->normalize_cadence_rule($value);
            case 'anchor':
                return $this->normalize_anchor_rule($value);
            case 'properties':
                return $this->normalize_properties_rule($value);
        }

        return new WP_Error('cod_mcp_design_rule_invalid', 'El tipo de regla no está disponible.');
    }

    /** @param array<string, mixed> $value */
    private function normalize_color_rule(array $value)
    {
        if (!$this->has_only_keys($value, ['role', 'color', 'apply'])
            || !isset($value['role'], $value['color'])
            || !$this->is_stable_id($value['role'])
            || !is_string($value['color']) || !$this->is_css_color($value['color'])) {
            return new WP_Error('cod_mcp_color_rule_invalid', 'La regla color requiere role y color seguros.');
        }
        $normalizado = ['role' => $value['role'], 'color' => $value['color']];
        if (array_key_exists('apply', $value)) {
            // apply elige qué propiedad pinta el color: sólo texto o fondo, nada más.
            if (!is_string($value['apply']) || !in_array($value['apply'], ['text', 'background'], true)) {
                return new WP_Error('cod_mcp_color_rule_apply_invalid', 'La regla color admite apply "text" o "background"; se recibió otro valor.');
            }
            $normalizado['apply'] = $value['apply'];
        }
        return $normalizado;
    }

    /** @param array<string, mixed> $value */
    private function normalize_typography_rule(array $value)
    {
        $allowed = ['role', 'family', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'measure', 'align', 'transform', 'style', 'decoration'];
        if (!$this->has_only_keys($value, $allowed) || !isset($value['role']) || !$this->is_stable_id($value['role'])) {
            return new WP_Error('cod_mcp_typography_rule_invalid', 'La regla typography requiere un role editorial.');
        }
        $normalized = ['role' => $value['role']];
        if (isset($value['family'])) {
            if (!is_string($value['family']) || !$this->is_css_font_family($value['family'])) {
                return new WP_Error('cod_mcp_typography_rule_invalid', 'family tipográfica no es segura.');
            }
            $normalized['family'] = $value['family'];
        }
        foreach (['fontSize', 'letterSpacing', 'measure'] as $key) {
            if (isset($value[$key])) {
                if (!is_string($value[$key]) || !$this->is_css_length($value[$key], $key === 'letterSpacing')) {
                    return new WP_Error('cod_mcp_typography_rule_invalid', $key . ' debe ser una longitud CSS segura.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        if (isset($value['fontWeight'])) {
            if (!is_int($value['fontWeight']) || $value['fontWeight'] < 100 || $value['fontWeight'] > 900 || $value['fontWeight'] % 100 !== 0) {
                return new WP_Error('cod_mcp_typography_rule_invalid', 'fontWeight debe estar entre 100 y 900 en pasos de 100.');
            }
            $normalized['fontWeight'] = $value['fontWeight'];
        }
        if (isset($value['lineHeight'])) {
            if ((!is_int($value['lineHeight']) && !is_float($value['lineHeight'])) || $value['lineHeight'] < 0.8 || $value['lineHeight'] > 3) {
                return new WP_Error('cod_mcp_typography_rule_invalid', 'lineHeight debe estar entre 0.8 y 3.');
            }
            $normalized['lineHeight'] = (float) $value['lineHeight'];
        }
        foreach ([
            'align' => ['start', 'center', 'end', 'justify'],
            'transform' => ['none', 'uppercase', 'lowercase', 'capitalize'],
            'style' => ['normal', 'italic'],
            'decoration' => ['none', 'underline'],
        ] as $key => $allowed_values) {
            if (isset($value[$key])) {
                if (!is_string($value[$key]) || !in_array($value[$key], $allowed_values, true)) {
                    return new WP_Error('cod_mcp_typography_rule_invalid', $key . ' no es un tratamiento editorial permitido.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_spacing_rule(array $value)
    {
        $allowed = ['paddingBlock', 'paddingInline', 'marginBlockStart', 'marginBlockEnd', 'gap', 'indent', 'bleed', 'landing'];
        if (!$this->has_only_keys($value, $allowed) || $value === []) {
            return new WP_Error('cod_mcp_spacing_rule_invalid', 'La regla spacing debe declarar al menos una medida.');
        }
        $normalized = [];
        foreach ($allowed as $key) {
            if (!isset($value[$key])) {
                continue;
            }
            // bleed y landing admiten negativo. bleed saca el bloque de su caja;
            // un aterrizaje negativo hace que el scroll caiga MÁS ADENTRO del
            // bloque en vez de antes. Sin eso hay que mover el marcador a un
            // párrafo vecino por razones ópticas, y ahí el marcador deja de
            // nombrar su propio destino: si después se reordena el contenido,
            // el enlace apunta a otra cosa.
            $admite_negativo = in_array($key, ['bleed', 'landing'], true);
            if (!is_string($value[$key]) || !$this->is_css_length($value[$key], $admite_negativo)) {
                return new WP_Error('cod_mcp_spacing_rule_invalid', $key . ' debe ser una longitud CSS segura.');
            }
            $normalized[$key] = $value[$key];
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_layout_rule(array $value)
    {
        $allowed = ['mode', 'columns', 'gap', 'minColumnWidth', 'maxWidth', 'align', 'justify', 'mobile'];
        if (!$this->has_only_keys($value, $allowed) || !isset($value['mode'])
            || !is_string($value['mode'])
            || !in_array($value['mode'], ['stack', 'columns', 'grid', 'metro', 'masonry', 'cluster', 'carousel'], true)) {
            return new WP_Error('cod_mcp_layout_rule_invalid', 'layout.mode no es una composición disponible.');
        }
        $normalized = ['mode' => $value['mode']];
        foreach (['columns'] as $key) {
            if (isset($value[$key])) {
                if (!is_int($value[$key]) || $value[$key] < 1 || $value[$key] > 8) {
                    return new WP_Error('cod_mcp_layout_rule_invalid', $key . ' debe estar entre 1 y 8.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        foreach (['gap', 'minColumnWidth', 'maxWidth'] as $key) {
            if (isset($value[$key])) {
                if (!is_string($value[$key]) || !$this->is_css_length($value[$key])) {
                    return new WP_Error('cod_mcp_layout_rule_invalid', $key . ' debe ser una longitud CSS segura.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        foreach ([
            'align' => ['start', 'center', 'end', 'stretch'],
            'justify' => ['start', 'center', 'end', 'between', 'around', 'evenly'],
        ] as $key => $allowed_values) {
            if (isset($value[$key])) {
                if (!is_string($value[$key]) || !in_array($value[$key], $allowed_values, true)) {
                    return new WP_Error('cod_mcp_layout_rule_invalid', $key . ' no es válido.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        if (isset($value['mobile'])) {
            if (!is_array($value['mobile']) || !$this->has_only_keys($value['mobile'], ['mode', 'columns', 'gap'])
                || (isset($value['mobile']['mode']) && (!is_string($value['mobile']['mode']) || !in_array($value['mobile']['mode'], ['stack', 'grid', 'columns', 'carousel'], true)))
                || (isset($value['mobile']['columns']) && (!is_int($value['mobile']['columns']) || $value['mobile']['columns'] < 1 || $value['mobile']['columns'] > 4))
                || (isset($value['mobile']['gap']) && (!is_string($value['mobile']['gap']) || !$this->is_css_length($value['mobile']['gap'])))) {
                return new WP_Error('cod_mcp_layout_rule_invalid', 'layout.mobile no tiene la forma permitida.');
            }
            $normalized['mobile'] = $value['mobile'];
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_surface_rule(array $value)
    {
        $allowed = ['backgroundColor', 'foregroundColor', 'backgroundAssetUrl', 'backgroundPosition', 'backgroundSize', 'backgroundRepeat', 'overlayColor', 'overlayOpacity', 'borderColor', 'borderWidth', 'shadow'];
        if (!$this->has_only_keys($value, $allowed) || $value === []) {
            return new WP_Error('cod_mcp_surface_rule_invalid', 'La regla surface debe declarar al menos un tratamiento.');
        }
        $normalized = [];
        foreach (['backgroundColor', 'foregroundColor', 'overlayColor', 'borderColor'] as $key) {
            if (isset($value[$key])) {
                if (!is_string($value[$key]) || !$this->is_css_color($value[$key])) {
                    return new WP_Error('cod_mcp_surface_rule_invalid', $key . ' no es un color seguro.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        if (isset($value['backgroundAssetUrl'])) {
            if (!is_string($value['backgroundAssetUrl']) || !$this->is_safe_asset_url($value['backgroundAssetUrl'])) {
                return new WP_Error('cod_mcp_surface_rule_invalid', 'backgroundAssetUrl debe provenir de la resolución de activos Canvas.');
            }
            $normalized['backgroundAssetUrl'] = $value['backgroundAssetUrl'];
        }
        if (isset($value['backgroundPosition'])) {
            if (!is_string($value['backgroundPosition']) || !$this->is_background_position($value['backgroundPosition'])) {
                return new WP_Error('cod_mcp_surface_rule_invalid', 'backgroundPosition no es válido: use palabras (left, center, right, top, bottom) o medidas (2%, 20px), una o dos componentes.');
            }
            $normalized['backgroundPosition'] = $value['backgroundPosition'];
        }
        if (isset($value['backgroundSize'])) {
            if (!is_string($value['backgroundSize']) || !$this->is_background_size($value['backgroundSize'])) {
                return new WP_Error('cod_mcp_surface_rule_invalid', 'backgroundSize no es válido: use cover, contain, auto, o una o dos medidas (7% auto, 200px).');
            }
            $normalized['backgroundSize'] = $value['backgroundSize'];
        }
        if (isset($value['backgroundRepeat'])) {
            if (!is_string($value['backgroundRepeat']) || !in_array($value['backgroundRepeat'], ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round'], true)) {
                return new WP_Error('cod_mcp_surface_rule_invalid', 'backgroundRepeat no es válido: repeat, no-repeat, repeat-x, repeat-y, space o round.');
            }
            $normalized['backgroundRepeat'] = $value['backgroundRepeat'];
        }
        if (isset($value['overlayOpacity'])) {
            if ((!is_int($value['overlayOpacity']) && !is_float($value['overlayOpacity'])) || $value['overlayOpacity'] < 0 || $value['overlayOpacity'] > 1) {
                return new WP_Error('cod_mcp_surface_rule_invalid', 'overlayOpacity debe estar entre 0 y 1.');
            }
            $normalized['overlayOpacity'] = (float) $value['overlayOpacity'];
            // Una opacidad sin color no pinta nada: antes se descartaba en
            // silencio y la regla parecía aplicada. Ahora se dice.
            if (!isset($normalized['overlayColor'])) {
                return new WP_Error('cod_mcp_surface_rule_invalid', 'overlayOpacity necesita overlayColor: sin color no hay velo que atenuar.');
            }
        }
        if (isset($value['borderWidth'])) {
            if (!is_string($value['borderWidth']) || !$this->is_css_length($value['borderWidth'])) {
                return new WP_Error('cod_mcp_surface_rule_invalid', 'borderWidth debe ser una longitud CSS segura.');
            }
            $normalized['borderWidth'] = $value['borderWidth'];
        }
        if (isset($value['shadow'])) {
            if (!is_string($value['shadow']) || !in_array($value['shadow'], ['none', 'sm', 'md', 'lg'], true)) {
                return new WP_Error('cod_mcp_surface_rule_invalid', 'shadow no es válido.');
            }
            $normalized['shadow'] = $value['shadow'];
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_shape_rule(array $value)
    {
        $allowed = ['radius', 'borderStyle', 'borderWidth', 'mask'];
        if (!$this->has_only_keys($value, $allowed) || $value === []) {
            return new WP_Error('cod_mcp_shape_rule_invalid', 'La regla shape debe declarar al menos un tratamiento.');
        }
        $normalized = [];
        if (isset($value['radius'])) {
            if (!is_string($value['radius']) || (!$this->is_css_length($value['radius']) && !in_array($value['radius'], ['none', 'pill', 'circle'], true))) {
                return new WP_Error('cod_mcp_shape_rule_invalid', 'radius no es válido.');
            }
            $normalized['radius'] = $value['radius'];
        }
        if (isset($value['borderStyle'])) {
            if (!is_string($value['borderStyle']) || !in_array($value['borderStyle'], ['none', 'solid', 'dashed'], true)) {
                return new WP_Error('cod_mcp_shape_rule_invalid', 'borderStyle no es válido.');
            }
            $normalized['borderStyle'] = $value['borderStyle'];
        }
        if (isset($value['borderWidth'])) {
            if (!is_string($value['borderWidth']) || !$this->is_css_length($value['borderWidth'])) {
                return new WP_Error('cod_mcp_shape_rule_invalid', 'borderWidth no es válido.');
            }
            $normalized['borderWidth'] = $value['borderWidth'];
        }
        if (isset($value['mask'])) {
            if (!is_string($value['mask']) || !in_array($value['mask'], ['none', 'rounded', 'circle', 'arch'], true)) {
                return new WP_Error('cod_mcp_shape_rule_invalid', 'mask no es válido.');
            }
            $normalized['mask'] = $value['mask'];
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_media_rule(array $value)
    {
        $allowed = ['aspectRatio', 'fit', 'position', 'frame', 'overlayColor', 'overlayOpacity', 'hover', 'caption', 'filter'];
        if (!$this->has_only_keys($value, $allowed) || $value === []) {
            return new WP_Error('cod_mcp_media_rule_invalid', 'La regla media debe declarar al menos un tratamiento.');
        }
        $normalized = [];
        if (isset($value['aspectRatio'])) {
            if (!is_string($value['aspectRatio']) || preg_match('/^[1-9][0-9]?[ ]*\/[ ]*[1-9][0-9]?$/', $value['aspectRatio']) !== 1) {
                return new WP_Error('cod_mcp_media_rule_invalid', 'aspectRatio debe tener la forma 4/3, 16/9 u otra proporción segura.');
            }
            $normalized['aspectRatio'] = str_replace(' ', '', $value['aspectRatio']);
        }
        if (isset($value['fit'])) {
            if (!is_string($value['fit']) || !in_array($value['fit'], ['cover', 'contain', 'fill', 'none', 'scale-down'], true)) {
                return new WP_Error('cod_mcp_media_rule_invalid', 'fit no es válido.');
            }
            $normalized['fit'] = $value['fit'];
        }
        if (isset($value['position'])) {
            if (!is_string($value['position']) || !$this->is_object_position($value['position'])) {
                return new WP_Error('cod_mcp_media_rule_invalid', 'position no es válido.');
            }
            $normalized['position'] = $value['position'];
        }
        foreach ([
            'frame' => ['none', 'rounded', 'circle', 'arch'],
            'hover' => ['none', 'zoom', 'lift', 'dim'],
            'caption' => ['none', 'overlay', 'below'],
            'filter' => ['none', 'grayscale'],
        ] as $key => $allowed_values) {
            if (isset($value[$key])) {
                if (!is_string($value[$key]) || !in_array($value[$key], $allowed_values, true)) {
                    return new WP_Error('cod_mcp_media_rule_invalid', $key . ' no es válido; admite: ' . implode(', ', $allowed_values) . '.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        if (isset($value['overlayColor'])) {
            if (!is_string($value['overlayColor']) || !$this->is_css_color($value['overlayColor'])) {
                return new WP_Error('cod_mcp_media_rule_invalid', 'overlayColor no es válido.');
            }
            $normalized['overlayColor'] = $value['overlayColor'];
        }
        if (isset($value['overlayOpacity'])) {
            if ((!is_int($value['overlayOpacity']) && !is_float($value['overlayOpacity'])) || $value['overlayOpacity'] < 0 || $value['overlayOpacity'] > 1) {
                return new WP_Error('cod_mcp_media_rule_invalid', 'overlayOpacity debe estar entre 0 y 1.');
            }
            $normalized['overlayOpacity'] = (float) $value['overlayOpacity'];
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_button_rule(array $value)
    {
        $allowed = ['variant', 'tone', 'size', 'width', 'interaction', 'zIndex'];
        if (!$this->has_only_keys($value, $allowed) || $value === []) {
            return new WP_Error('cod_mcp_button_rule_invalid', 'La regla button debe declarar al menos un tratamiento.');
        }
        $normalized = [];
        foreach ([
            'variant' => ['solid', 'outline', 'ghost', 'text'],
            'tone' => ['primary', 'secondary', 'inverse'],
            'size' => ['sm', 'md', 'lg'],
            'width' => ['auto', 'full'],
            'interaction' => ['none', 'lift', 'underline'],
        ] as $key => $allowed_values) {
            if (!isset($value[$key])) {
                continue;
            }
            if (!is_string($value[$key]) || !in_array($value[$key], $allowed_values, true)) {
                return new WP_Error('cod_mcp_button_rule_invalid', $key . ' no es válido.');
            }
            $normalized[$key] = $value[$key];
        }
        // zIndex sólo saca a un botón adelante de sus HERMANOS en el mismo
        // contexto de apilamiento — no lo rescata de un ancestro con z-index
        // negativo (esa es una decisión de en qué contenedor vive el nodo,
        // no un número; ver instalación del botón de sonido de video para
        // ese otro caso).
        if (isset($value['zIndex'])) {
            if (!is_int($value['zIndex']) || $value['zIndex'] < -999 || $value['zIndex'] > 999) {
                return new WP_Error('cod_mcp_button_rule_invalid', 'zIndex debe ser un entero entre -999 y 999.');
            }
            $normalized['zIndex'] = $value['zIndex'];
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_gallery_rule(array $value)
    {
        $allowed = ['mode', 'columns', 'gap', 'mobileColumns', 'caption', 'controls'];
        if (!$this->has_only_keys($value, $allowed) || !isset($value['mode'])
            || !is_string($value['mode']) || !in_array($value['mode'], ['grid', 'metro', 'masonry', 'carousel'], true)) {
            return new WP_Error('cod_mcp_gallery_rule_invalid', 'gallery.mode debe ser grid, metro, masonry o carousel.');
        }
        $normalized = ['mode' => $value['mode']];
        foreach (['columns', 'mobileColumns'] as $key) {
            if (isset($value[$key])) {
                if (!is_int($value[$key]) || $value[$key] < 1 || $value[$key] > 8) {
                    return new WP_Error('cod_mcp_gallery_rule_invalid', $key . ' debe estar entre 1 y 8.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        if (isset($value['gap'])) {
            if (!is_string($value['gap']) || !$this->is_css_length($value['gap'])) {
                return new WP_Error('cod_mcp_gallery_rule_invalid', 'gap debe ser una longitud CSS segura.');
            }
            $normalized['gap'] = $value['gap'];
        }
        foreach ([
            'caption' => ['none', 'overlay', 'below'],
            'controls' => ['none', 'arrows', 'arrows-and-dots'],
        ] as $key => $allowed_values) {
            if (isset($value[$key])) {
                if (!is_string($value[$key]) || !in_array($value[$key], $allowed_values, true)) {
                    return new WP_Error('cod_mcp_gallery_rule_invalid', $key . ' no es válido.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_table_rule(array $value)
    {
        $allowed = ['variant', 'header', 'responsive', 'density'];
        if (!$this->has_only_keys($value, $allowed) || $value === []) {
            return new WP_Error('cod_mcp_table_rule_invalid', 'La regla table debe declarar al menos un tratamiento.');
        }
        $normalized = [];
        foreach ([
            'variant' => ['plain', 'lined', 'striped', 'cards'],
            'header' => ['plain', 'accent', 'inverse'],
            'responsive' => ['scroll', 'stack'],
            'density' => ['compact', 'comfortable', 'spacious'],
        ] as $key => $allowed_values) {
            if (isset($value[$key])) {
                if (!is_string($value[$key]) || !in_array($value[$key], $allowed_values, true)) {
                    return new WP_Error('cod_mcp_table_rule_invalid', $key . ' no es válido.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        return $normalized;
    }

    /**
     * Variables de diseño del runtime de formularios Orugantt.
     *
     * Esto es el "contrato propio del runtime" que faltaba para poder diseñar
     * un formulario por dentro desde el lienzo. No se escriben reglas CSS
     * sobre sus campos —eso ataría el diseño a una estructura interna que el
     * runtime puede cambiar— sino sus VARIABLES: quien diseña fija valores y
     * el runtime decide dónde se aplican.
     *
     * La lista la publica el propio plugin de formularios cuando está
     * presente; el espejo de acá cubre el caso de que no lo esté, para que una
     * composición guardada no se invalide por eso.
     *
     * @return array<string, array{token: string, type: string}>
     */
    private function form_theme_tokens(): array
    {
        if (class_exists('OFR_Design_Tokens')) {
            $desde_runtime = [];
            foreach (OFR_Design_Tokens::advanced() as $clave => $def) {
                if (is_array($def) && isset($def['token'], $def['type'])) {
                    $desde_runtime[(string) $clave] = ['token' => (string) $def['token'], 'type' => (string) $def['type']];
                }
            }
            if ($desde_runtime !== []) {
                return $desde_runtime;
            }
        }

        return [
            'texto' => ['token' => '--ofr-color-text', 'type' => 'color'],
            'textoSuave' => ['token' => '--ofr-color-text-muted', 'type' => 'color'],
            'fondo' => ['token' => '--ofr-color-bg', 'type' => 'color'],
            'superficie' => ['token' => '--ofr-color-surface', 'type' => 'color'],
            'superficieAlt' => ['token' => '--ofr-color-surface-alt', 'type' => 'color'],
            'borde' => ['token' => '--ofr-color-border', 'type' => 'color'],
            'bordeFuerte' => ['token' => '--ofr-color-border-strong', 'type' => 'color'],
            'principal' => ['token' => '--ofr-color-primary', 'type' => 'color'],
            'principalHover' => ['token' => '--ofr-color-primary-hover', 'type' => 'color'],
            'principalContraste' => ['token' => '--ofr-color-primary-contrast', 'type' => 'color'],
            'error' => ['token' => '--ofr-color-error', 'type' => 'color'],
            'errorFondo' => ['token' => '--ofr-color-error-bg', 'type' => 'color'],
            'errorBorde' => ['token' => '--ofr-color-error-border', 'type' => 'color'],
            'calculadoFondo' => ['token' => '--ofr-color-calculated-bg', 'type' => 'color'],
            'calculadoTexto' => ['token' => '--ofr-color-calculated-text', 'type' => 'color'],
            'cebraA' => ['token' => '--ofr-color-zebra-a', 'type' => 'color'],
            'cebraB' => ['token' => '--ofr-color-zebra-b', 'type' => 'color'],
            'notaInfo' => ['token' => '--ofr-color-nota-info', 'type' => 'color'],
            'notaExito' => ['token' => '--ofr-color-nota-success', 'type' => 'color'],
            'notaAviso' => ['token' => '--ofr-color-nota-warning', 'type' => 'color'],
            'notaPeligro' => ['token' => '--ofr-color-nota-danger', 'type' => 'color'],
            'tipografia' => ['token' => '--ofr-font', 'type' => 'font'],
            'radio' => ['token' => '--ofr-radius', 'type' => 'length'],
            'espacioXs' => ['token' => '--ofr-space-xs', 'type' => 'length'],
            'espacioSm' => ['token' => '--ofr-space-sm', 'type' => 'length'],
            'espaciado' => ['token' => '--ofr-space-md', 'type' => 'length'],
            'espacioLg' => ['token' => '--ofr-space-lg', 'type' => 'length'],
            'sombra' => ['token' => '--ofr-shadow', 'type' => 'shadow'],
            'anilloFoco' => ['token' => '--ofr-focus-ring', 'type' => 'shadow'],
        ];
    }

    /** @param array<string, mixed> $value */
    private function normalize_form_rule(array $value)
    {
        $allowed = ['maxWidth', 'surface', 'theme'];
        if (!$this->has_only_keys($value, $allowed) || $value === []) {
            return new WP_Error('cod_mcp_form_rule_invalid', 'La regla form debe declarar al menos un tratamiento.');
        }
        $normalized = [];
        if (isset($value['theme'])) {
            $tema = $this->normalize_form_theme($value['theme']);
            if (is_wp_error($tema)) {
                return $tema;
            }
            $normalized['theme'] = $tema;
        }
        if (isset($value['maxWidth'])) {
            if (!is_string($value['maxWidth']) || !$this->is_css_length($value['maxWidth'])) {
                return new WP_Error('cod_mcp_form_rule_invalid', 'maxWidth debe ser una longitud CSS segura.');
            }
            $normalized['maxWidth'] = $value['maxWidth'];
        }
        foreach (['surface' => ['none', 'card', 'outlined']] as $key => $allowed_values) {
            if (isset($value[$key])) {
                if (!is_string($value[$key]) || !in_array($value[$key], $allowed_values, true)) {
                    return new WP_Error('cod_mcp_form_rule_invalid', $key . ' no es válido.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_motion_rule(array $value)
    {
        $allowed = ['trigger', 'effect', 'duration', 'delay', 'stagger', 'easing', 'threshold'];
        if (!$this->has_only_keys($value, $allowed) || !isset($value['trigger'])
            || !is_string($value['trigger']) || !in_array($value['trigger'], ['load', 'scroll', 'hover'], true)) {
            return new WP_Error('cod_mcp_motion_rule_invalid', 'motion.trigger debe ser load, scroll u hover.');
        }
        $normalized = [
            'trigger' => $value['trigger'],
            'effect' => isset($value['effect']) ? $value['effect'] : 'fade',
            'duration' => isset($value['duration']) ? $value['duration'] : 400,
            'delay' => isset($value['delay']) ? $value['delay'] : 0,
            'stagger' => isset($value['stagger']) ? $value['stagger'] : 0,
            'easing' => isset($value['easing']) ? $value['easing'] : 'ease-out',
        ];
        if (!is_string($normalized['effect']) || !in_array($normalized['effect'], ['fade', 'rise', 'slide-left', 'slide-right', 'scale'], true)
            || !is_int($normalized['duration']) || $normalized['duration'] < 0 || $normalized['duration'] > 5000
            || !is_int($normalized['delay']) || $normalized['delay'] < 0 || $normalized['delay'] > 5000
            || !is_int($normalized['stagger']) || $normalized['stagger'] < 0 || $normalized['stagger'] > 2000
            || !is_string($normalized['easing']) || !in_array($normalized['easing'], ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'], true)) {
            return new WP_Error('cod_mcp_motion_rule_invalid', 'La paleta de movimiento contiene un valor no permitido.');
        }
        if ($normalized['trigger'] === 'scroll') {
            $threshold = isset($value['threshold']) ? $value['threshold'] : 0.15;
            if ((!is_int($threshold) && !is_float($threshold)) || $threshold < 0 || $threshold > 1) {
                return new WP_Error('cod_mcp_motion_rule_invalid', 'threshold de scroll debe estar entre 0 y 1.');
            }
            $normalized['threshold'] = (float) $threshold;
        } elseif (isset($value['threshold'])) {
            return new WP_Error('cod_mcp_motion_rule_invalid', 'threshold sólo puede usarse con motion.trigger=scroll.');
        }
        if ($normalized['trigger'] === 'load' && ($normalized['delay'] !== 0 || $normalized['stagger'] !== 0)) {
            return new WP_Error('cod_mcp_motion_rule_invalid', 'El runtime load actual no admite delay ni stagger; usa motion.trigger=scroll para entrada escalonada.');
        }
        if ($normalized['trigger'] === 'hover' && $normalized['stagger'] !== 0) {
            return new WP_Error('cod_mcp_motion_rule_invalid', 'motion.trigger=hover no admite stagger por ítem.');
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_interaction_rule(array $value)
    {
        $allowed = ['behavior', 'threshold', 'targetId', 'toggleClass', 'mode', 'visible', 'visibleMobile'];
        // Un parámetro que ninguna interacción conoce se rechaza NOMBRÁNDOLO:
        // «interaction.behavior no es un comportamiento disponible» no le dice a
        // quien lo escribió que el problema era la clave inventada.
        $desconocidos = [];
        foreach (array_keys($value) as $clave) {
            if (!is_string($clave) || !in_array($clave, $allowed, true)) {
                $desconocidos[] = (string) $clave;
            }
        }
        if ($desconocidos !== []) {
            return new WP_Error(
                'cod_mcp_interaction_rule_invalid',
                'interaction no admite el parámetro ' . implode(', ', array_map(static fn(string $c): string => '"' . $c . '"', $desconocidos))
                . '. Los parámetros que existen son: ' . implode(', ', $allowed) . '.'
            );
        }
        if (!isset($value['behavior'])
            || !is_string($value['behavior'])
            || !in_array($value['behavior'], ['scroll-threshold', 'nav-toggle', 'carousel-basic', 'lightbox', 'cuadrantes', 'pestanas', 'marquesina'], true)) {
            return new WP_Error('cod_mcp_interaction_rule_invalid', 'interaction.behavior no es un comportamiento Canvas disponible.');
        }
        $normalized = ['behavior' => $value['behavior']];
        if (isset($value['threshold'])) {
            if (!is_int($value['threshold']) || $value['threshold'] < 0 || $value['threshold'] > 4000) {
                return new WP_Error('cod_mcp_interaction_rule_invalid', 'threshold debe estar entre 0 y 4000.');
            }
            $normalized['threshold'] = $value['threshold'];
        }
        if (isset($value['targetId'])) {
            if (!is_string($value['targetId']) || !$this->is_stable_id($value['targetId'])) {
                return new WP_Error('cod_mcp_interaction_rule_invalid', 'targetId no es válido.');
            }
            $normalized['targetId'] = $value['targetId'];
        }
        if (isset($value['toggleClass'])) {
            if (!is_string($value['toggleClass']) || preg_match('/^[a-z][a-z0-9_-]{0,63}$/', $value['toggleClass']) !== 1) {
                return new WP_Error('cod_mcp_interaction_rule_invalid', 'toggleClass no es una clase segura.');
            }
            $normalized['toggleClass'] = $value['toggleClass'];
        }
        if (isset($value['mode'])) {
            if (!is_string($value['mode']) || !in_array($value['mode'], ['single', 'track'], true)) {
                return new WP_Error('cod_mcp_interaction_rule_invalid', 'mode sólo admite single o track.');
            }
            $normalized['mode'] = $value['mode'];
        }
        foreach (['visible', 'visibleMobile'] as $key) {
            if (isset($value[$key])) {
                if (!is_int($value[$key]) || $value[$key] < 1 || $value[$key] > 8) {
                    return new WP_Error('cod_mcp_interaction_rule_invalid', $key . ' debe estar entre 1 y 8.');
                }
                $normalized[$key] = $value[$key];
            }
        }
        if ($normalized['behavior'] === 'nav-toggle' && !isset($normalized['targetId'])) {
            return new WP_Error('cod_mcp_interaction_rule_invalid', 'nav-toggle requiere targetId.');
        }
        // cuadrantes, pestanas y marquesina no tienen parámetros: la geometría
        // sale del CSS del plugin y el estado del propio runtime. Aceptar uno y
        // no usarlo engañaría. Se nombra el que venía.
        if (in_array($normalized['behavior'], ['cuadrantes', 'pestanas', 'marquesina'], true) && count($normalized) > 1) {
            $recibidos = array_values(array_diff(array_keys($normalized), ['behavior']));
            return new WP_Error('cod_mcp_interaction_rule_invalid', $normalized['behavior'] . ' no admite threshold, targetId, toggleClass, mode, visible ni visibleMobile (se recibió: ' . implode(', ', $recibidos) . ').');
        }
        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function normalize_cadence_rule(array $value)
    {
        if (!$this->has_only_keys($value, ['cycleRuleIds', 'offset'])
            || !isset($value['cycleRuleIds'])
            || !is_array($value['cycleRuleIds'])
            || !$this->is_list($value['cycleRuleIds'])
            || count($value['cycleRuleIds']) < 1
            || count($value['cycleRuleIds']) > 12) {
            return new WP_Error('cod_mcp_cadence_rule_invalid', 'cadence requiere una lista acotada cycleRuleIds.');
        }
        $cycle_rule_ids = [];
        foreach ($value['cycleRuleIds'] as $rule_id) {
            if (!is_string($rule_id) || !$this->is_stable_id($rule_id) || in_array($rule_id, $cycle_rule_ids, true)) {
                return new WP_Error('cod_mcp_cadence_rule_invalid', 'cycleRuleIds debe contener ids estables únicos.');
            }
            $cycle_rule_ids[] = $rule_id;
        }
        $offset = $value['offset'] ?? 0;
        if (!is_int($offset) || $offset < 0 || $offset > 11) {
            return new WP_Error('cod_mcp_cadence_rule_invalid', 'offset de cadence debe estar entre 0 y 11.');
        }
        return ['cycleRuleIds' => $cycle_rule_ids, 'offset' => $offset];
    }

    /**
     * Regla `properties`: un mapa propiedad → valor. Es el kind que evita que
     * una propiedad quede inalcanzable; los kinds semánticos siguen siendo el
     * camino preferido cuando aplican porque llevan rol y procedencia.
     *
     * @param array<string, mixed> $value
     * @return array<string, mixed>|WP_Error
     */
    private function normalize_properties_rule(array $value)
    {
        $codigo = 'cod_mcp_properties_rule_invalid';
        if (!$this->has_only_keys($value, ['declarations'])
            || !isset($value['declarations'])
            || !is_array($value['declarations'])
            || $value['declarations'] === []) {
            return new WP_Error($codigo, 'La regla properties requiere "declarations": un objeto no vacío propiedad → valor, por ejemplo {"background-color":"#2E594A"}.');
        }
        if (count($value['declarations']) > 40) {
            return new WP_Error($codigo, 'Una regla properties admite hasta 40 declaraciones; ésta trae ' . count($value['declarations']) . '. Repártelas en varias reglas.');
        }
        $declarations = [];
        foreach ($value['declarations'] as $propiedad => $valor) {
            if (!is_string($propiedad)) {
                return new WP_Error($codigo, 'declarations debe ser un objeto propiedad → valor, no una lista.');
            }
            $es_personalizada = preg_match('/^--[a-z0-9-]+$/', $propiedad) === 1 && strlen($propiedad) <= 100;
            if (!$es_personalizada) {
                if (preg_match('/^[a-z][a-z0-9-]*$/', $propiedad) !== 1 || strlen($propiedad) > 64) {
                    return new WP_Error($codigo, 'El nombre de propiedad "' . $propiedad . '" no es válido: va en minúsculas y con guiones (por ejemplo background-color), o es una propiedad personalizada (--nombre).');
                }
                $permitida = in_array($propiedad, self::PROPERTIES_ALLOWED, true);
                $abreviada = isset(self::SHORTHAND_PROPERTIES[$propiedad]);
                if (!$permitida && $abreviada) {
                    return new WP_Error($codigo, 'La propiedad "' . $propiedad . '" es una abreviada y no se admite: GrapesJS descarta en silencio las abreviadas que llevan var(). Escribe sus partes por separado: ' . self::SHORTHAND_PROPERTIES[$propiedad] . '.');
                }
                if (!$permitida) {
                    return new WP_Error($codigo, 'La propiedad "' . $propiedad . '" no está en la lista de propiedades permitidas de una regla properties. Se puede pedir que se agregue a la lista.');
                }
            }
            if (!is_string($valor)) {
                return new WP_Error($codigo, 'El valor de "' . $propiedad . '" debe ser texto (por ejemplo "0.5" y no 0.5).');
            }
            $valor = trim($valor);
            $largo = function_exists('mb_strlen') ? mb_strlen($valor) : strlen($valor);
            if ($largo < 1 || $largo > 300) {
                return new WP_Error($codigo, 'El valor de "' . $propiedad . '" debe tener entre 1 y 300 caracteres.');
            }
            if (preg_match('/[{};<>\\\\@\\x00-\\x1f\\x7f]/', $valor) === 1
                || stripos($valor, 'url(') !== false
                || stripos($valor, 'expression(') !== false
                || stripos($valor, 'javascript:') !== false
                || strpos($valor, '/*') !== false) {
                return new WP_Error($codigo, 'El valor de "' . $propiedad . '" trae un carácter o una función que no se admite ({ } ; < > \\ @ url( expression( javascript: /* ni caracteres de control). Las imágenes entran por el tipo media.');
            }
            if (isset(self::SHORTHAND_PROPERTIES[$propiedad]) && stripos($valor, 'var(') !== false) {
                return new WP_Error($codigo, 'La propiedad "' . $propiedad . '" es una abreviada y su valor usa var(): GrapesJS descarta la declaración entera en silencio. Escribe sus partes por separado: ' . self::SHORTHAND_PROPERTIES[$propiedad] . '.');
            }
            $declarations[$propiedad] = $valor;
        }
        return ['declarations' => $declarations];
    }

    /**
     * @param array<string, mixed> $composition
     * @param array<string, array<string, mixed>> $rule_index
     * @return array<string, mixed>|WP_Error
     */
    private function normalize_composition(array $composition, array $rule_index)
    {
        if (!$this->has_only_keys($composition, ['schemaVersion', 'label', 'nodes'])
            || !isset($composition['schemaVersion'], $composition['nodes'])
            || $composition['schemaVersion'] !== 2
            || !is_array($composition['nodes'])
            || !$this->is_list($composition['nodes'])
            || count($composition['nodes']) < 1
            || count($composition['nodes']) > self::MAX_NODES
            || (isset($composition['label']) && (!is_string($composition['label']) || mb_strlen($composition['label']) > 160))) {
            return new WP_Error('cod_mcp_composition_invalid', 'La composición debe declarar schemaVersion=2 y una lista no vacía de nodos.');
        }

        $seen_node_ids = [];
        $seen_markers = [];
        $node_count = 0;
        $nodes = [];
        foreach ($composition['nodes'] as $node) {
            if (!is_array($node)) {
                return new WP_Error('cod_mcp_composition_node_invalid', 'Cada nodo de la composición debe ser un objeto.');
            }
            $normalized = $this->normalize_node($node, $rule_index, $seen_node_ids, $seen_markers, $node_count, 0);
            if (is_wp_error($normalized)) {
                return $normalized;
            }
            $nodes[] = $normalized;
        }

        return [
            'schemaVersion' => 2,
            'label' => isset($composition['label']) ? $composition['label'] : '',
            'nodes' => $nodes,
            'nodeIds' => array_keys($seen_node_ids),
            'markers' => array_keys($seen_markers),
            'nodeCount' => $node_count,
        ];
    }

    /**
     * @param array<string, mixed> $node
     * @param array<string, array<string, mixed>> $rule_index
     * @param array<string, bool> $seen_node_ids
     * @param array<string, bool> $seen_markers
     * @return array<string, mixed>|WP_Error
     */
    private function normalize_node(array $node, array $rule_index, array &$seen_node_ids, array &$seen_markers, int &$node_count, int $depth)
    {
        if ($depth > self::MAX_DEPTH
            || !$this->has_only_keys($node, ['id', 'kind', 'role', 'marker', 'ruleIds', 'cadenceRuleId', 'partes', 'children', 'content'])
            || !isset($node['id'], $node['kind'])
            || !$this->is_stable_id($node['id'])
            || !is_string($node['kind'])
            || !in_array($node['kind'], self::NODE_KINDS, true)
            // Un valor vacío es la AUSENCIA del campo, no un identificador
            // inválido. La normalización emite role y marker como '' cuando no
            // están, así que exigir is_stable_id sobre '' hacía que ninguna
            // composición leída del sitio se pudiera reenviar.
            || (isset($node['role']) && $node['role'] !== '' && (!is_string($node['role']) || !$this->is_stable_id($node['role'])))
            || (isset($node['marker']) && $node['marker'] !== '' && (!is_string($node['marker']) || !$this->is_stable_id($node['marker'])))) {
            return new WP_Error('cod_mcp_composition_node_invalid', 'Un nodo tiene una forma, tipo o profundidad no permitidos.');
        }
        if (isset($seen_node_ids[$node['id']])) {
            return new WP_Error('cod_mcp_composition_node_duplicate', 'Los ids de nodos deben ser únicos.');
        }
        $seen_node_ids[$node['id']] = true;
        // marker se emite como id de HTML: es el destino al que llega un
        // enlace, un QR o el menú. A diferencia de una regla —que se aplica a
        // muchos nodos y emite una clase— tiene que ser único en la página.
        if (isset($node['marker']) && $node['marker'] !== '') {
            if (isset($seen_markers[$node['marker']])) {
                return new WP_Error('cod_mcp_composition_marker_duplicate', 'Dos nodos declaran el mismo marker; un destino de enlace debe ser único.');
            }
            $seen_markers[$node['marker']] = true;
        }
        ++$node_count;
        if ($node_count > self::MAX_NODES) {
            return new WP_Error('cod_mcp_composition_too_large', 'La composición excede el máximo de nodos permitido.');
        }

        $rule_ids = $node['ruleIds'] ?? [];
        if (!is_array($rule_ids) || !$this->is_list($rule_ids) || count($rule_ids) > 32) {
            return new WP_Error('cod_mcp_composition_rule_reference_invalid', 'ruleIds debe ser una lista acotada.');
        }
        $normalized_rule_ids = [];
        foreach ($rule_ids as $rule_id) {
            if (!is_string($rule_id) || !isset($rule_index[$rule_id]) || $rule_index[$rule_id]['kind'] === 'cadence' || in_array($rule_id, $normalized_rule_ids, true)) {
                return new WP_Error('cod_mcp_composition_rule_reference_invalid', 'ruleIds refiere una regla inexistente, cadencia directa o repetida.');
            }
            $normalized_rule_ids[] = $rule_id;
        }

        $normalized_partes = $this->normalize_node_partes($node, $normalized_rule_ids, $rule_index);
        if (is_wp_error($normalized_partes)) {
            return $normalized_partes;
        }

        $cadence_rule_id = $node['cadenceRuleId'] ?? '';
        if ($cadence_rule_id !== '') {
            if (!is_string($cadence_rule_id) || !isset($rule_index[$cadence_rule_id]) || $rule_index[$cadence_rule_id]['kind'] !== 'cadence') {
                return new WP_Error('cod_mcp_composition_cadence_reference_invalid', 'cadenceRuleId debe referir una regla cadence existente.');
            }
        }

        $children = $node['children'] ?? [];
        if (!is_array($children) || !$this->is_list($children) || count($children) > 80) {
            return new WP_Error('cod_mcp_composition_children_invalid', 'children debe ser una lista acotada.');
        }
        $allows_children = in_array($node['kind'], ['section', 'header', 'footer', 'navigation', 'group', 'layout'], true);
        if (!$allows_children && $children !== []) {
            return new WP_Error('cod_mcp_composition_children_invalid', 'Este tipo de nodo no admite children; usa una estructura o colección declarada.');
        }
        // Un content VACÍO no es «usar content». La normalización devuelve
        // 'content' => [] para todo nodo estructural, así que rechazarlo por
        // estar presente impedía reenviar una composición leída del propio
        // sitio. Se rechaza sólo si trae algo adentro.
        if ($allows_children && !empty($node['content'])) {
            return new WP_Error('cod_mcp_composition_content_invalid', 'Un nodo estructural usa children, no content.');
        }

        $normalized_children = [];
        foreach ($children as $child) {
            if (!is_array($child)) {
                return new WP_Error('cod_mcp_composition_children_invalid', 'Cada child debe ser un nodo.');
            }
            $normalized_child = $this->normalize_node($child, $rule_index, $seen_node_ids, $seen_markers, $node_count, $depth + 1);
            if (is_wp_error($normalized_child)) {
                return $normalized_child;
            }
            $normalized_children[] = $normalized_child;
        }

        $content = $node['content'] ?? [];
        if (!is_array($content) || (!$allows_children && !isset($node['content']))) {
            return new WP_Error('cod_mcp_composition_content_invalid', 'El contenido del nodo debe ser un objeto declarativo.');
        }
        if (!$allows_children) {
            $content = $this->normalize_node_content($node['kind'], $content);
            if (is_wp_error($content)) {
                return $content;
            }
        }

        $normalized_node = [
            'id' => $node['id'],
            'kind' => $node['kind'],
            'role' => isset($node['role']) ? $node['role'] : '',
            'marker' => isset($node['marker']) ? $node['marker'] : '',
            'ruleIds' => $normalized_rule_ids,
            'cadenceRuleId' => $cadence_rule_id,
            'children' => $normalized_children,
            'content' => $allows_children ? [] : $content,
        ];
        // partes sólo viaja cuando el nodo la usa: así una composición sin
        // partes conserva exactamente la misma forma (y el mismo digest) de siempre.
        if ($normalized_partes !== []) {
            $normalized_node['partes'] = $normalized_partes;
        }
        return $normalized_node;
    }

    /**
     * Valida el campo `partes` de un nodo: mapa parte → ids de regla que se
     * dirigen a una parte que fabrica el behavior del nodo (ver
     * BEHAVIOR_CONTRACTS). Devuelve el mapa normalizado, o [] si no hay.
     *
     * @param array<string, mixed> $node
     * @param array<int, string> $rule_ids ids ya validados de este nodo
     * @param array<string, array<string, mixed>> $rule_index
     * @return array<string, array<int, string>>|WP_Error
     */
    private function normalize_node_partes(array $node, array $rule_ids, array $rule_index)
    {
        $partes = $node['partes'] ?? [];
        if (!is_array($partes)) {
            return new WP_Error('cod_mcp_composition_partes_invalid', 'partes debe ser un objeto parte → lista de ids de regla, por ejemplo {"etiqueta":["mi-regla"]}.');
        }
        if ($partes === []) {
            return [];
        }
        $behavior = $this->contract_behavior_of($rule_ids, $rule_index);
        if ($behavior === '') {
            return new WP_Error(
                'cod_mcp_composition_partes_invalid',
                'El nodo "' . $node['id'] . '" declara partes pero no lleva un behavior que fabrique partes. Hoy lo hacen: ' . implode(', ', array_keys(self::BEHAVIOR_CONTRACTS)) . '. El nodo tiene que llevar en ruleIds una regla interaction con uno de ellos.'
            );
        }
        $contrato = self::BEHAVIOR_CONTRACTS[$behavior];
        $validas = implode(', ', array_keys($contrato['partes']));
        $normalized = [];
        foreach ($partes as $parte => $ids) {
            if (!is_string($parte) || !isset($contrato['partes'][$parte])) {
                return new WP_Error(
                    'cod_mcp_composition_partes_invalid',
                    'El behavior ' . $behavior . ' del nodo "' . $node['id'] . '" no tiene la parte "' . (string) $parte . '". Las partes válidas son: ' . $validas . '.'
                );
            }
            if (!is_array($ids) || !$this->is_list($ids) || $ids === [] || count($ids) > 32) {
                return new WP_Error('cod_mcp_composition_partes_invalid', 'La parte "' . $parte . '" del nodo "' . $node['id'] . '" debe ser una lista de 1 a 32 ids de regla.');
            }
            $lista = [];
            foreach ($ids as $rule_id) {
                if (!is_string($rule_id) || !isset($rule_index[$rule_id])) {
                    return new WP_Error('cod_mcp_composition_rule_reference_invalid', 'La parte "' . $parte . '" del nodo "' . $node['id'] . '" refiere una regla inexistente.');
                }
                $rule = $rule_index[$rule_id];
                if ($rule['kind'] === 'cadence') {
                    return new WP_Error('cod_mcp_composition_rule_reference_invalid', 'La regla "' . $rule_id . '" es una cadencia y no puede dirigirse a una parte: una cadencia reparte reglas entre hermanos, no estila una parte.');
                }
                if (!in_array($rule['kind'], self::PART_RULE_KINDS, true)) {
                    return new WP_Error(
                        'cod_mcp_composition_partes_invalid',
                        'La regla "' . $rule_id . '" es de tipo ' . $rule['kind'] . ', que no se puede dirigir a una parte. Los tipos que sí: ' . implode(', ', self::PART_RULE_KINDS) . '.'
                    );
                }
                if ($rule['scope']['state'] === 'current' && $contrato['partes'][$parte]['elegido'] === null) {
                    return new WP_Error(
                        'cod_mcp_current_state_target_invalid',
                        'La regla "' . $rule_id . '" tiene scope.state="current" pero la parte "' . $parte . '" de ' . $behavior . ' no tiene un estado elegido. Las partes con estado elegido son: ' . $this->parts_with_current($behavior) . '.'
                    );
                }
                if (in_array($rule_id, $lista, true)) {
                    return new WP_Error('cod_mcp_composition_rule_reference_invalid', 'La regla "' . $rule_id . '" está repetida en la parte "' . $parte . '".');
                }
                $lista[] = $rule_id;
            }
            $normalized[$parte] = $lista;
        }
        return $normalized;
    }

    /**
     * Behavior del registro (BEHAVIOR_CONTRACTS) que lleva un nodo por sus
     * reglas interaction directas; '' si no lleva ninguno.
     *
     * @param array<int, string> $rule_ids
     * @param array<string, array<string, mixed>> $rule_index
     */
    private function contract_behavior_of(array $rule_ids, array $rule_index): string
    {
        foreach ($rule_ids as $rule_id) {
            $rule = $rule_index[$rule_id] ?? null;
            if ($rule !== null && $rule['kind'] === 'interaction' && isset(self::BEHAVIOR_CONTRACTS[$rule['value']['behavior']])) {
                return (string) $rule['value']['behavior'];
            }
        }
        return '';
    }

    /**
     * Marcas de «el elegido» por behavior, derivadas de BEHAVIOR_CONTRACTS.
     * Sólo entran los behaviors que tienen al menos una parte con estado elegido.
     *
     * @return array<string, array<int, string>>
     */
    private function current_markers(): array
    {
        $marcas = [];
        foreach (self::BEHAVIOR_CONTRACTS as $behavior => $contrato) {
            foreach ($contrato['partes'] as $parte) {
                if ($parte['elegido'] !== null) {
                    $marcas[$behavior][] = $parte['elegido'];
                }
            }
        }
        return $marcas;
    }

    /** Nombres de los behaviors con estado elegido, unidos con $union («pestanas o cuadrantes»). */
    private function current_behaviors_text(string $union): string
    {
        return implode($union, array_keys($this->current_markers()));
    }

    /** Partes de un behavior que tienen estado elegido, como lista legible. */
    private function parts_with_current(string $behavior): string
    {
        $nombres = [];
        foreach (self::BEHAVIOR_CONTRACTS[$behavior]['partes'] as $nombre => $parte) {
            if ($parte['elegido'] !== null) {
                $nombres[] = $nombre;
            }
        }
        return implode(', ', $nombres);
    }

    /** Texto del catálogo para scope.state = "current", armado desde el registro. */
    private function state_current_text(): string
    {
        $behaviors = [];
        foreach (self::BEHAVIOR_CONTRACTS as $behavior => $contrato) {
            $partes = [];
            foreach ($contrato['partes'] as $nombre => $parte) {
                if ($parte['elegido'] !== null) {
                    $partes[] = 'la parte ' . $nombre . ' con ' . $parte['elegido'];
                }
            }
            if ($partes !== []) {
                $behaviors[] = $behavior . ' (' . implode(' y ', $partes) . ')';
            }
        }
        return '"current" = «el elegido» de un behavior que tiene uno: la regla sólo se aplica cuando el nodo, o un ancestro suyo, está marcado por el runtime como elegido. Hoy: ' . implode('; ', $behaviors) . '. No es "active" (que en CSS es «mientras se aprieta»). Se declara como cualquier otra regla, con scope.state="current", y se aplica al nodo que se quiere pintar distinto cuando es el elegido; por ejemplo, el título de una etiqueta de pestañas. Para pintar la parte que fabrica el runtime (el botón de la pestaña, por ejemplo) se usa el campo partes del nodo; ahí "current" se combina con la marca de esa parte. Un nodo que no está dentro de un ' . $this->current_behaviors_text(' o ') . ' devuelve error cod_mcp_current_state_target_invalid, no se acepta para nada.';
    }

    /**
     * Contrato de partes que ve la IA en el catálogo.
     *
     * @return array<string, array<string, mixed>>
     */
    private function behavior_contracts_catalog(): array
    {
        $catalogo = [];
        foreach (self::BEHAVIOR_CONTRACTS as $behavior => $contrato) {
            $partes = [];
            foreach ($contrato['partes'] as $nombre => $parte) {
                $partes[$nombre] = [
                    'descripcion' => $parte['descripcion'],
                    'selector' => $parte['selector'],
                    'elegido' => $parte['elegido'] ?? 'sin estado elegido',
                ];
            }
            $catalogo[$behavior] = ['atributoRol' => $contrato['atributoRol'], 'partes' => $partes];
        }
        return $catalogo;
    }

    /**
     * @param array<string, mixed> $content
     * @return array<string, mixed>|WP_Error
     */
    private function normalize_node_content(string $kind, array $content)
    {
        switch ($kind) {
            case 'heading':
                if (!$this->has_only_keys($content, ['text', 'level']) || !isset($content['text'], $content['level'])
                    || !$this->is_plain_text($content['text'], 500)
                    || !is_int($content['level']) || $content['level'] < 1 || $content['level'] > 6) {
                    return new WP_Error('cod_mcp_heading_invalid', 'heading requiere text y level entre 1 y 6.');
                }
                return ['text' => $content['text'], 'level' => $content['level']];
            case 'paragraph':
                if (!$this->has_only_keys($content, ['text']) || !isset($content['text']) || !$this->is_plain_text($content['text'], 5000)) {
                    return new WP_Error('cod_mcp_paragraph_invalid', 'paragraph requiere texto plano acotado.');
                }
                return ['text' => $content['text']];
            case 'richText':
                if (!$this->has_only_keys($content, ['paragraphs']) || !isset($content['paragraphs']) || !is_array($content['paragraphs'])
                    || !$this->is_list($content['paragraphs']) || count($content['paragraphs']) < 1 || count($content['paragraphs']) > 24) {
                    return new WP_Error('cod_mcp_rich_text_invalid', 'richText requiere una lista acotada de párrafos de texto plano.');
                }
                foreach ($content['paragraphs'] as $paragraph) {
                    if (!$this->is_plain_text($paragraph, 5000)) {
                        return new WP_Error('cod_mcp_rich_text_invalid', 'Cada párrafo de richText debe ser texto plano acotado.');
                    }
                }
                return ['paragraphs' => array_values($content['paragraphs'])];
            case 'image':
                return $this->normalize_image_content($content, false);
            case 'video':
                return $this->normalize_video_content($content);
            case 'audio':
                if (!$this->has_only_keys($content, ['sourceUrl', 'label']) || !isset($content['sourceUrl'])
                    || !is_string($content['sourceUrl']) || !$this->is_safe_asset_url($content['sourceUrl'])
                    || (isset($content['label']) && !$this->is_plain_text($content['label'], 300))) {
                    return new WP_Error('cod_mcp_audio_invalid', 'audio requiere sourceUrl de activo Canvas y label opcional.');
                }
                return ['sourceUrl' => $content['sourceUrl'], 'label' => isset($content['label']) ? $content['label'] : ''];
            case 'button':
            case 'link':
                if (!$this->has_only_keys($content, ['label', 'href', 'target']) || !isset($content['label'], $content['href'])
                    || !$this->is_plain_text($content['label'], 300)
                    || !is_string($content['href']) || !$this->is_safe_link($content['href'])
                    || (isset($content['target']) && (!is_string($content['target']) || !in_array($content['target'], ['self', 'blank'], true)))) {
                    return new WP_Error('cod_mcp_link_invalid', $kind . ' requiere label y href seguros.');
                }
                return ['label' => $content['label'], 'href' => $content['href'], 'target' => isset($content['target']) ? $content['target'] : 'self'];
            case 'list':
                if (!$this->has_only_keys($content, ['ordered', 'items']) || !isset($content['ordered'], $content['items'])
                    || !is_bool($content['ordered']) || !is_array($content['items']) || !$this->is_list($content['items'])
                    || count($content['items']) < 1 || count($content['items']) > 100) {
                    return new WP_Error('cod_mcp_list_invalid', 'list requiere ordered e items.');
                }
                foreach ($content['items'] as $item) {
                    if (!$this->is_plain_text($item, 1000)) {
                        return new WP_Error('cod_mcp_list_invalid', 'Cada item de list debe ser texto plano.');
                    }
                }
                return ['ordered' => $content['ordered'], 'items' => array_values($content['items'])];
            case 'table':
                return $this->normalize_table_content($content);
            case 'gallery':
                return $this->normalize_gallery_content($content);
            case 'form':
                if (!$this->has_only_keys($content, ['formSlug']) || !isset($content['formSlug']) || !is_string($content['formSlug'])) {
                    return new WP_Error('cod_mcp_form_content_invalid', 'form requiere formSlug de un formulario publicado.');
                }
                $slug = sanitize_key($content['formSlug']);
                $available = array_column($this->available_forms(), 'slug');
                if ($slug === '' || !in_array($slug, $available, true)) {
                    return new WP_Error('cod_mcp_form_not_published', 'formSlug no corresponde a un formulario Orugantt publicado.');
                }
                return ['formSlug' => $slug];
            case 'shortcode':
                // La validación fuerte (¿está permitido? ¿existe el plugin?)
                // ocurre al RENDERIZAR la página, en el renderizador de
                // shortcodes, porque depende del sitio y de qué plugins estén
                // activos en ese momento. Acá solo se valida la forma.
                if (!$this->has_only_keys($content, ['tag', 'atts']) || !isset($content['tag'])
                    || !is_string($content['tag'])
                    || preg_match('/^[a-z0-9_-]{1,40}$/i', $content['tag']) !== 1) {
                    return new WP_Error('cod_mcp_shortcode_invalid', 'shortcode requiere tag con el nombre del shortcode (letras, números, guiones).');
                }
                $atts = [];
                if (isset($content['atts'])) {
                    if (!is_array($content['atts'])) {
                        return new WP_Error('cod_mcp_shortcode_atts_invalid', 'atts debe ser un objeto de pares simples.');
                    }
                    foreach ($content['atts'] as $nombre => $valor) {
                        if (!is_string($nombre) || preg_match('/^[a-z0-9_-]{1,40}$/i', $nombre) !== 1) {
                            return new WP_Error('cod_mcp_shortcode_atts_invalid', 'Los nombres de atts deben ser simples: letras, números, guiones.');
                        }
                        if (!is_string($valor) && !is_int($valor) && !is_float($valor) && !is_bool($valor)) {
                            return new WP_Error('cod_mcp_shortcode_atts_invalid', 'Los valores de atts deben ser texto o número.');
                        }
                        $atts[strtolower($nombre)] = is_bool($valor) ? ($valor ? 'true' : 'false') : (string) $valor;
                    }
                }
                return ['tag' => strtolower($content['tag']), 'atts' => $atts];
            case 'dynamic':
                return $this->normalize_dynamic_content($content);
            case 'separator':
                if ($content !== []) {
                    return new WP_Error('cod_mcp_separator_invalid', 'separator no acepta content.');
                }
                return [];
            case 'chart':
                return $this->normalize_chart_content($content);
            case 'whatsapp':
                return $this->normalize_whatsapp_content($content);
            case 'social':
                return $this->normalize_social_content($content);
        }
        return new WP_Error('cod_mcp_content_kind_invalid', 'El tipo de contenido no está disponible.');
    }

    /** @param array<string, mixed> $content */
    private function normalize_image_content(array $content, bool $gallery_item)
    {
        $allowed = ['assetUrl', 'alt', 'caption', 'rotation'];
        if (!$this->has_only_keys($content, $allowed) || !isset($content['assetUrl'], $content['alt'])
            || !is_string($content['assetUrl']) || !$this->is_safe_asset_url($content['assetUrl'])
            || !$this->is_plain_text($content['alt'], 1000)
            || (isset($content['caption']) && !$this->is_plain_text($content['caption'], 2000))) {
            return new WP_Error('cod_mcp_image_invalid', 'image requiere assetUrl resuelto y alt; caption es opcional.');
        }
        // rotation es propiedad de la IMAGEN, no del marco: dentro de una galería
        // puede haber un item girado y el resto derecho, y el giro tiene que
        // viajar con el archivo hasta el lightbox, que solo copia src y alt.
        // Solo cuartos de vuelta: el caso real es material de teléfono al que
        // WordPress le borró la orientación EXIF sin girar los píxeles.
        $rotation = 0;
        if (isset($content['rotation'])) {
            if (!is_int($content['rotation']) || !in_array($content['rotation'], [0, 90, 180, 270], true)) {
                return new WP_Error('cod_mcp_image_invalid', 'rotation debe ser 0, 90, 180 o 270.');
            }
            $rotation = $content['rotation'];
        }
        return [
            'assetUrl' => $content['assetUrl'],
            'alt' => $content['alt'],
            'caption' => isset($content['caption']) ? $content['caption'] : '',
            'rotation' => $rotation,
        ];
    }

    /**
     * Validación de la primitiva dinámica (módulo ACF). Extraída del switch
     * para que la galería pueda reutilizarla tal cual: una galería de
     * artículos no es un tipo aparte, es esta misma primitiva repetida.
     *
     * @param array<string, mixed> $content
     * @return array<string, mixed>|WP_Error
     */
    private function normalize_dynamic_content(array $content)
    {
        if (!$this->has_only_keys($content, ['token', 'fallback']) || !isset($content['token'])
            || !is_string($content['token']) || !$this->is_dynamic_token($content['token'])
            || (isset($content['fallback']) && !$this->is_plain_text($content['fallback'], 1000))) {
            return new WP_Error('cod_mcp_dynamic_invalid', 'dynamic requiere un token Canvas disponible y fallback opcional.');
        }
        return ['token' => $content['token'], 'fallback' => isset($content['fallback']) ? $content['fallback'] : ''];
    }

    /** @param array<string, mixed> $content */
    private function normalize_video_content(array $content)
    {
        // sourceUrl es OPCIONAL: un video sin fuente todavía es un estado válido
        // de la primitiva (se dibuja como pendiente, con su leyenda). Eso evita
        // inventar un "item de galería especial" para los por-venir.
        $sin_fuente = !isset($content['sourceUrl']) || $content['sourceUrl'] === '';
        if (!$this->has_only_keys($content, ['sourceUrl', 'posterUrl', 'caption', 'matte', 'ambient', 'pendingLabel'])
            || (!$sin_fuente && (!is_string($content['sourceUrl']) || !$this->is_safe_asset_url($content['sourceUrl'])))
            || (isset($content['pendingLabel']) && !$this->is_plain_text($content['pendingLabel'], 120))
            || (isset($content['posterUrl']) && (!is_string($content['posterUrl']) || !$this->is_safe_asset_url($content['posterUrl'])))
            || (isset($content['caption']) && !$this->is_plain_text($content['caption'], 2000))
            || (isset($content['matte']) && !is_bool($content['matte']))
            || (isset($content['ambient']) && !is_bool($content['ambient']))) {
            return new WP_Error('cod_mcp_video_invalid', 'video acepta sourceUrl de activo Canvas (o ninguno, y queda pendiente); poster, caption, matte, ambient (boolean: true o false) y pendingLabel son opcionales.');
        }
        return [
            'sourceUrl' => $sin_fuente ? '' : $content['sourceUrl'],
            'posterUrl' => isset($content['posterUrl']) ? $content['posterUrl'] : '',
            'caption' => isset($content['caption']) ? $content['caption'] : '',
            'matte' => isset($content['matte']) ? $content['matte'] : false,
            // ambient se guarda tal cual; la precedencia (matte gana) se resuelve
            // al dibujar, en render_video.
            'ambient' => isset($content['ambient']) ? $content['ambient'] : false,
            'pendingLabel' => isset($content['pendingLabel']) ? $content['pendingLabel'] : 'Próximamente',
        ];
    }

    /** @param array<string, mixed> $content */
    private function normalize_table_content(array $content)
    {
        if (!$this->has_only_keys($content, ['headers', 'rows']) || !isset($content['headers'], $content['rows'])
            || !is_array($content['headers']) || !$this->is_list($content['headers']) || count($content['headers']) < 1 || count($content['headers']) > 20
            || !is_array($content['rows']) || !$this->is_list($content['rows']) || count($content['rows']) > 100) {
            return new WP_Error('cod_mcp_table_content_invalid', 'table requiere headers y rows acotados.');
        }
        foreach ($content['headers'] as $header) {
            if (!$this->is_plain_text($header, 500)) {
                return new WP_Error('cod_mcp_table_content_invalid', 'Cada encabezado de tabla debe ser texto plano.');
            }
        }
        $rows = [];
        foreach ($content['rows'] as $row) {
            if (!is_array($row) || !$this->is_list($row) || count($row) !== count($content['headers'])) {
                return new WP_Error('cod_mcp_table_content_invalid', 'Cada fila debe coincidir con el número de headers.');
            }
            foreach ($row as $cell) {
                if (!$this->is_plain_text($cell, 1000)) {
                    return new WP_Error('cod_mcp_table_content_invalid', 'Cada celda debe ser texto plano.');
                }
            }
            $rows[] = array_values($row);
        }
        return ['headers' => array_values($content['headers']), 'rows' => $rows];
    }

    /** @param array<string, mixed> $content */
    private function normalize_gallery_content(array $content)
    {
        if (!$this->has_only_keys($content, ['items']) || !isset($content['items']) || !is_array($content['items'])
            || !$this->is_list($content['items']) || count($content['items']) < 1 || count($content['items']) > 80) {
            return new WP_Error('cod_mcp_gallery_content_invalid', 'gallery requiere una lista acotada de items (primitivas image, video o dynamic).');
        }
        $items = [];
        foreach ($content['items'] as $item) {
            if (!is_array($item)) {
                return new WP_Error('cod_mcp_gallery_content_invalid', 'Cada item de galería debe ser un objeto de primitiva.');
            }
            // 'kind' declara de qué primitiva es el item. Ausente = image, para
            // que todo lo ya guardado siga siendo válido sin migración.
            $kind = isset($item['kind']) ? $item['kind'] : 'image';
            if (!is_string($kind) || !in_array($kind, ['image', 'video', 'dynamic'], true)) {
                return new WP_Error('cod_mcp_gallery_content_invalid', 'kind de item de galería debe ser image, video o dynamic.');
            }
            $limpio = $item;
            unset($limpio['kind']);
            switch ($kind) {
                case 'video':
                    $normalizado = $this->normalize_video_content($limpio);
                    break;
                case 'dynamic':
                    $normalizado = $this->normalize_dynamic_content($limpio);
                    break;
                default:
                    $normalizado = $this->normalize_image_content($limpio, true);
            }
            if (is_wp_error($normalizado)) {
                return $normalizado;
            }
            $normalizado['kind'] = $kind;
            $items[] = $normalizado;
        }
        return ['items' => $items];
    }

    /** @param array<string, mixed> $content */
    private function normalize_chart_content(array $content)
    {
        if (!$this->has_only_keys($content, ['type', 'labels', 'values', 'color']) || !isset($content['type'], $content['labels'], $content['values'])
            || !is_string($content['type']) || !in_array($content['type'], ['bar', 'line'], true)
            || !is_array($content['labels']) || !$this->is_list($content['labels'])
            || !is_array($content['values']) || !$this->is_list($content['values'])
            || count($content['labels']) < 1 || count($content['labels']) > 48 || count($content['labels']) !== count($content['values'])
            || (isset($content['color']) && (!is_string($content['color']) || !$this->is_css_color($content['color'])))) {
            return new WP_Error('cod_mcp_chart_invalid', 'chart requiere type, labels y values del mismo tamaño.');
        }
        foreach ($content['labels'] as $label) {
            if (!$this->is_plain_text($label, 100)) {
                return new WP_Error('cod_mcp_chart_invalid', 'Las etiquetas de chart deben ser texto plano.');
            }
        }
        foreach ($content['values'] as $number) {
            if ((!is_int($number) && !is_float($number)) || !is_finite((float) $number)) {
                return new WP_Error('cod_mcp_chart_invalid', 'Los valores de chart deben ser números finitos.');
            }
        }
        return [
            'type' => $content['type'],
            'labels' => array_values($content['labels']),
            'values' => array_map('floatval', $content['values']),
            // Sin color declarado no se inventa uno: queda vacío y el runtime
            // resuelve el rol de acento del núcleo. Antes caía en el azul del
            // panel de WordPress, que no es un color de este proyecto ni de
            // ninguno.
            'color' => isset($content['color']) ? $content['color'] : '',
        ];
    }

    /**
     * Regla anchor: usadas por CUALQUIER nodo (no exclusivas de whatsapp) —
     * dónde "nace" dentro de su contenedor position:relative y cómo entra.
     * @var array<int, string>
     */
    private const ANCHOR_ROUTINES = ['rise', 'fade', 'scale', 'pop'];
    private const ANCHOR_EDGES = ['bottom', 'top', 'left', 'right', 'bottom-left', 'bottom-right', 'top-left', 'top-right', 'center'];

    /**
     * Redes que admite la primitiva `social`: lista blanca cerrada. Cada una
     * lleva su nombre legible, los dominios a los que puede apuntar su enlace y
     * la silueta del logotipo (una sola ruta, monocroma, sin alterar).
     *
     * Las siluetas son las del bloque «Enlaces a redes sociales» del núcleo de
     * WordPress (wp-includes/blocks/social-link.php, GPL-2.0-or-later), copiadas
     * tal cual. Los logotipos son marcas registradas de sus dueños; acá sólo se
     * usan para señalar la cuenta oficial de quien las pone en su propio sitio.
     *
     * @var array<string, array{name: string, hosts: array<int, string>, viewBox: string, path: string}>
     */
    private const SOCIAL_NETWORKS = [
        'instagram' => [
            'name' => 'Instagram',
            'hosts' => ['instagram.com', 'instagr.am'],
            'viewBox' => '0 0 24 24',
            'path' => 'M12,4.622c2.403,0,2.688,0.009,3.637,0.052c0.877,0.04,1.354,0.187,1.671,0.31c0.42,0.163,0.72,0.358,1.035,0.673 c0.315,0.315,0.51,0.615,0.673,1.035c0.123,0.317,0.27,0.794,0.31,1.671c0.043,0.949,0.052,1.234,0.052,3.637 s-0.009,2.688-0.052,3.637c-0.04,0.877-0.187,1.354-0.31,1.671c-0.163,0.42-0.358,0.72-0.673,1.035 c-0.315,0.315-0.615,0.51-1.035,0.673c-0.317,0.123-0.794,0.27-1.671,0.31c-0.949,0.043-1.233,0.052-3.637,0.052 s-2.688-0.009-3.637-0.052c-0.877-0.04-1.354-0.187-1.671-0.31c-0.42-0.163-0.72-0.358-1.035-0.673 c-0.315-0.315-0.51-0.615-0.673-1.035c-0.123-0.317-0.27-0.794-0.31-1.671C4.631,14.688,4.622,14.403,4.622,12 s0.009-2.688,0.052-3.637c0.04-0.877,0.187-1.354,0.31-1.671c0.163-0.42,0.358-0.72,0.673-1.035 c0.315-0.315,0.615-0.51,1.035-0.673c0.317-0.123,0.794-0.27,1.671-0.31C9.312,4.631,9.597,4.622,12,4.622 M12,3 C9.556,3,9.249,3.01,8.289,3.054C7.331,3.098,6.677,3.25,6.105,3.472C5.513,3.702,5.011,4.01,4.511,4.511 c-0.5,0.5-0.808,1.002-1.038,1.594C3.25,6.677,3.098,7.331,3.054,8.289C3.01,9.249,3,9.556,3,12c0,2.444,0.01,2.751,0.054,3.711 c0.044,0.958,0.196,1.612,0.418,2.185c0.23,0.592,0.538,1.094,1.038,1.594c0.5,0.5,1.002,0.808,1.594,1.038 c0.572,0.222,1.227,0.375,2.185,0.418C9.249,20.99,9.556,21,12,21s2.751-0.01,3.711-0.054c0.958-0.044,1.612-0.196,2.185-0.418 c0.592-0.23,1.094-0.538,1.594-1.038c0.5-0.5,0.808-1.002,1.038-1.594c0.222-0.572,0.375-1.227,0.418-2.185 C20.99,14.751,21,14.444,21,12s-0.01-2.751-0.054-3.711c-0.044-0.958-0.196-1.612-0.418-2.185c-0.23-0.592-0.538-1.094-1.038-1.594 c-0.5-0.5-1.002-0.808-1.594-1.038c-0.572-0.222-1.227-0.375-2.185-0.418C14.751,3.01,14.444,3,12,3L12,3z M12,7.378 c-2.552,0-4.622,2.069-4.622,4.622S9.448,16.622,12,16.622s4.622-2.069,4.622-4.622S14.552,7.378,12,7.378z M12,15 c-1.657,0-3-1.343-3-3s1.343-3,3-3s3,1.343,3,3S13.657,15,12,15z M16.804,6.116c-0.596,0-1.08,0.484-1.08,1.08 s0.484,1.08,1.08,1.08c0.596,0,1.08-0.484,1.08-1.08S17.401,6.116,16.804,6.116z',
        ],
        'facebook' => [
            'name' => 'Facebook',
            'hosts' => ['facebook.com', 'fb.com', 'fb.me'],
            'viewBox' => '0 0 24 24',
            'path' => 'M12 2C6.5 2 2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7C18.3 21.1 22 17 22 12c0-5.5-4.5-10-10-10z',
        ],
        'linkedin' => [
            'name' => 'LinkedIn',
            'hosts' => ['linkedin.com', 'lnkd.in'],
            'viewBox' => '0 0 24 24',
            'path' => 'M19.7,3H4.3C3.582,3,3,3.582,3,4.3v15.4C3,20.418,3.582,21,4.3,21h15.4c0.718,0,1.3-0.582,1.3-1.3V4.3 C21,3.582,20.418,3,19.7,3z M8.339,18.338H5.667v-8.59h2.672V18.338z M7.004,8.574c-0.857,0-1.549-0.694-1.549-1.548 c0-0.855,0.691-1.548,1.549-1.548c0.854,0,1.547,0.694,1.547,1.548C8.551,7.881,7.858,8.574,7.004,8.574z M18.339,18.338h-2.669 v-4.177c0-0.996-0.017-2.278-1.387-2.278c-1.389,0-1.601,1.086-1.601,2.206v4.249h-2.667v-8.59h2.559v1.174h0.037 c0.356-0.675,1.227-1.387,2.526-1.387c2.703,0,3.203,1.779,3.203,4.092V18.338z',
        ],
        'youtube' => [
            'name' => 'YouTube',
            'hosts' => ['youtube.com', 'youtu.be'],
            'viewBox' => '0 0 24 24',
            'path' => 'M21.8,8.001c0,0-0.195-1.378-0.795-1.985c-0.76-0.797-1.613-0.801-2.004-0.847c-2.799-0.202-6.997-0.202-6.997-0.202 h-0.009c0,0-4.198,0-6.997,0.202C4.608,5.216,3.756,5.22,2.995,6.016C2.395,6.623,2.2,8.001,2.2,8.001S2,9.62,2,11.238v1.517 c0,1.618,0.2,3.237,0.2,3.237s0.195,1.378,0.795,1.985c0.761,0.797,1.76,0.771,2.205,0.855c1.6,0.153,6.8,0.201,6.8,0.201 s4.203-0.006,7.001-0.209c0.391-0.047,1.243-0.051,2.004-0.847c0.6-0.607,0.795-1.985,0.795-1.985s0.2-1.618,0.2-3.237v-1.517 C22,9.62,21.8,8.001,21.8,8.001z M9.935,14.594l-0.001-5.62l5.404,2.82L9.935,14.594z',
        ],
        'tiktok' => [
            'name' => 'TikTok',
            'hosts' => ['tiktok.com'],
            'viewBox' => '0 0 32 32',
            'path' => 'M16.708 0.027c1.745-0.027 3.48-0.011 5.213-0.027 0.105 2.041 0.839 4.12 2.333 5.563 1.491 1.479 3.6 2.156 5.652 2.385v5.369c-1.923-0.063-3.855-0.463-5.6-1.291-0.76-0.344-1.468-0.787-2.161-1.24-0.009 3.896 0.016 7.787-0.025 11.667-0.104 1.864-0.719 3.719-1.803 5.255-1.744 2.557-4.771 4.224-7.88 4.276-1.907 0.109-3.812-0.411-5.437-1.369-2.693-1.588-4.588-4.495-4.864-7.615-0.032-0.667-0.043-1.333-0.016-1.984 0.24-2.537 1.495-4.964 3.443-6.615 2.208-1.923 5.301-2.839 8.197-2.297 0.027 1.975-0.052 3.948-0.052 5.923-1.323-0.428-2.869-0.308-4.025 0.495-0.844 0.547-1.485 1.385-1.819 2.333-0.276 0.676-0.197 1.427-0.181 2.145 0.317 2.188 2.421 4.027 4.667 3.828 1.489-0.016 2.916-0.88 3.692-2.145 0.251-0.443 0.532-0.896 0.547-1.417 0.131-2.385 0.079-4.76 0.095-7.145 0.011-5.375-0.016-10.735 0.025-16.093z',
        ],
        'x' => [
            'name' => 'X',
            'hosts' => ['x.com', 'twitter.com'],
            'viewBox' => '0 0 24 24',
            'path' => 'M13.982 10.622 20.54 3h-1.554l-5.693 6.618L8.745 3H3.5l6.876 10.007L3.5 21h1.554l6.012-6.989L15.868 21h5.245l-7.131-10.378Zm-2.128 2.474-.697-.997-5.543-7.93H8l4.474 6.4.697.996 5.815 8.318h-2.387l-4.745-6.787Z',
        ],
        'threads' => [
            'name' => 'Threads',
            'hosts' => ['threads.net', 'threads.com'],
            'viewBox' => '0 0 24 24',
            'path' => 'M16.3 11.3c-.1 0-.2-.1-.2-.1-.1-2.6-1.5-4-3.9-4-1.4 0-2.6.6-3.3 1.7l1.3.9c.5-.8 1.4-1 2-1 .8 0 1.4.2 1.7.7.3.3.5.8.5 1.3-.7-.1-1.4-.2-2.2-.1-2.2.1-3.7 1.4-3.6 3.2 0 .9.5 1.7 1.3 2.2.7.4 1.5.6 2.4.6 1.2-.1 2.1-.5 2.7-1.3.5-.6.8-1.4.9-2.4.6.3 1 .8 1.2 1.3.4.9.4 2.4-.8 3.6-1.1 1.1-2.3 1.5-4.3 1.5-2.1 0-3.8-.7-4.8-2S5.7 14.3 5.7 12c0-2.3.5-4.1 1.5-5.4 1.1-1.3 2.7-2 4.8-2 2.2 0 3.8.7 4.9 2 .5.7.9 1.5 1.2 2.5l1.5-.4c-.3-1.2-.8-2.2-1.5-3.1-1.3-1.7-3.3-2.6-6-2.6-2.6 0-4.7.9-6 2.6C4.9 7.2 4.3 9.3 4.3 12s.6 4.8 1.9 6.4c1.4 1.7 3.4 2.6 6 2.6 2.3 0 4-.6 5.3-2 1.8-1.8 1.7-4 1.1-5.4-.4-.9-1.2-1.7-2.3-2.3zm-4 3.8c-1 .1-2-.4-2-1.3 0-.7.5-1.5 2.1-1.6h.5c.6 0 1.1.1 1.6.2-.2 2.3-1.3 2.7-2.2 2.7z',
        ],
        'pinterest' => [
            'name' => 'Pinterest',
            'hosts' => ['pinterest.com', 'pin.it'],
            'viewBox' => '0 0 24 24',
            'path' => 'M12.289,2C6.617,2,3.606,5.648,3.606,9.622c0,1.846,1.025,4.146,2.666,4.878c0.25,0.111,0.381,0.063,0.439-0.169 c0.044-0.175,0.267-1.029,0.365-1.428c0.032-0.128,0.017-0.237-0.091-0.362C6.445,11.911,6.01,10.75,6.01,9.668 c0-2.777,2.194-5.464,5.933-5.464c3.23,0,5.49,2.108,5.49,5.122c0,3.407-1.794,5.768-4.13,5.768c-1.291,0-2.257-1.021-1.948-2.277 c0.372-1.495,1.089-3.112,1.089-4.191c0-0.967-0.542-1.775-1.663-1.775c-1.319,0-2.379,1.309-2.379,3.059 c0,1.115,0.394,1.869,0.394,1.869s-1.302,5.279-1.54,6.261c-0.405,1.666,0.053,4.368,0.094,4.604 c0.021,0.126,0.167,0.169,0.25,0.063c0.129-0.165,1.699-2.419,2.142-4.051c0.158-0.59,0.817-2.995,0.817-2.995 c0.43,0.784,1.681,1.446,3.013,1.446c3.963,0,6.822-3.494,6.822-7.833C20.394,5.112,16.849,2,12.289,2',
        ],
    ];

    /** Acepta hex, rgb()/rgba(), hsl()/hsla(), var(--nombre) y colores con nombre — nada de ; : {} <> ni comillas. */
    private function is_safe_css_color(string $value): bool
    {
        return preg_match('/^[a-zA-Z0-9#(),.\-\s%]{1,80}$/', $value) === 1;
    }

    /** Acepta valores tipo "999px", "12px", "50%", o varios separados por espacio. */
    private function is_safe_css_length_list(string $value): bool
    {
        return preg_match('/^[0-9.\-\s%pxem]{1,60}$/', $value) === 1;
    }

    /**
     * whatsapp es una primitiva ESTÁTICA: solo define cómo se ve el módulo
     * (mensaje, tamaño, colores, radio). Dónde nace y cómo entra es trabajo
     * de la regla `anchor` aplicada al nodo (ver normalize_anchor_rule) —
     * antes vivía acá mezclado, ver [[project_operate_the_real_tool_not_upload_filter]].
     * @param array<string, mixed> $content
     */
    private function normalize_whatsapp_content(array $content)
    {
        $allowed = ['message', 'ariaLabel', 'size', 'iconPadding', 'iconColor', 'backgroundColor', 'borderRadius'];
        if (!$this->has_only_keys($content, $allowed) || !isset($content['message'])
            || !$this->is_plain_text($content['message'], 300)
            || (isset($content['ariaLabel']) && !$this->is_plain_text($content['ariaLabel'], 150))) {
            return new WP_Error('cod_mcp_whatsapp_invalid', 'whatsapp requiere message y ariaLabel opcional, texto plano acotado.');
        }
        $size = $content['size'] ?? 56;
        if (!is_int($size) || $size < 24 || $size > 200) {
            return new WP_Error('cod_mcp_whatsapp_invalid', 'size debe ser un entero entre 24 y 200 (px).');
        }
        $icon_padding = $content['iconPadding'] ?? 14;
        if (!is_int($icon_padding) || $icon_padding < 0 || $icon_padding > 80) {
            return new WP_Error('cod_mcp_whatsapp_invalid', 'iconPadding debe ser un entero entre 0 y 80 (px).');
        }
        $icon_color = $content['iconColor'] ?? '#ffffff';
        $background_color = $content['backgroundColor'] ?? '#25D366';
        if (!is_string($icon_color) || !$this->is_safe_css_color($icon_color)
            || !is_string($background_color) || !$this->is_safe_css_color($background_color)) {
            return new WP_Error('cod_mcp_whatsapp_invalid', 'iconColor y backgroundColor deben ser colores CSS seguros (hex, rgb/hsl, var(--token), o nombre).');
        }
        $border_radius = $content['borderRadius'] ?? '999px';
        if (!is_string($border_radius) || !$this->is_safe_css_length_list($border_radius)) {
            return new WP_Error('cod_mcp_whatsapp_invalid', 'borderRadius debe ser una longitud CSS segura (p. ej. 999px, 12px, 50%).');
        }
        return [
            'message' => $content['message'],
            'ariaLabel' => isset($content['ariaLabel']) && $content['ariaLabel'] !== '' ? $content['ariaLabel'] : 'Contactar por WhatsApp',
            'size' => $size,
            'iconPadding' => $icon_padding,
            'iconColor' => $icon_color,
            'backgroundColor' => $background_color,
            'borderRadius' => $border_radius,
        ];
    }

    /**
     * social: enlace a la cuenta oficial de una red. Es una primitiva estática,
     * igual que whatsapp: sólo define el contenido y cómo se ve; dónde nace y
     * cómo entra es trabajo de la regla `anchor`, si el nodo la lleva.
     *
     * La dirección no se acepta por buena fe: tiene que ser https y su dominio
     * tiene que ser uno de los de la red declarada. Un enlace rotulado
     * «Instagram» que lleva a otro sitio es justo la suplantación que esta
     * primitiva existe para desenmascarar.
     *
     * @param array<string, mixed> $content
     */
    private function normalize_social_content(array $content)
    {
        $allowed = ['network', 'url', 'handle', 'ariaLabel', 'size', 'iconPadding', 'iconColor', 'backgroundColor', 'borderRadius'];
        if (!$this->has_only_keys($content, $allowed)) {
            return new WP_Error('cod_mcp_social_invalid', 'social acepta sólo network, url, handle, ariaLabel, size, iconPadding, iconColor, backgroundColor y borderRadius.');
        }
        $networks = implode(', ', array_keys(self::SOCIAL_NETWORKS));
        if (!isset($content['network']) || !is_string($content['network']) || !isset(self::SOCIAL_NETWORKS[$content['network']])) {
            $shown = isset($content['network']) && is_string($content['network'])
                ? preg_replace('/[^\p{L}\p{N} ._-]/u', '?', function_exists('mb_substr') ? mb_substr($content['network'], 0, 40) : substr($content['network'], 0, 40))
                : '(falta)';
            return new WP_Error('cod_mcp_social_network_invalid', 'La red «' . $shown . '» no está disponible en social. Redes admitidas: ' . $networks . '.');
        }
        $network = $content['network'];
        $spec = self::SOCIAL_NETWORKS[$network];

        $url = $content['url'] ?? null;
        $parts = is_string($url) && strlen($url) <= 500 && $this->is_safe_asset_url($url) ? wp_parse_url($url) : false;
        if (!is_array($parts) || strtolower((string) ($parts['scheme'] ?? '')) !== 'https' || empty($parts['host'])
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
            return new WP_Error('cod_mcp_social_invalid', 'url debe ser una dirección https:// de la cuenta (sin usuario, sin puerto, sin javascript: ni data:).');
        }
        $host = strtolower((string) $parts['host']);
        $matches = false;
        foreach ($spec['hosts'] as $domain) {
            if ($host === $domain || substr($host, -strlen($domain) - 1) === '.' . $domain) {
                $matches = true;
                break;
            }
        }
        if (!$matches) {
            return new WP_Error('cod_mcp_social_invalid', 'La url apunta a «' . preg_replace('/[^a-z0-9.-]/', '?', $host) . '», que no es un dominio de ' . $spec['name'] . ' (' . implode(', ', $spec['hosts']) . ').');
        }

        $handle = '';
        if (isset($content['handle']) && $content['handle'] !== '') {
            if (!is_string($content['handle']) || preg_match('/^[\p{L}\p{N}@._\/ -]{1,80}$/u', $content['handle']) !== 1
                || trim($content['handle']) !== $content['handle']) {
                return new WP_Error('cod_mcp_social_invalid', 'handle debe ser texto de hasta 80 caracteres: letras, números y @ . _ - / (sin caracteres invisibles ni espacios en los extremos).');
            }
            $handle = $content['handle'];
        }
        if (isset($content['ariaLabel']) && !$this->is_plain_text($content['ariaLabel'], 150)) {
            return new WP_Error('cod_mcp_social_invalid', 'ariaLabel debe ser texto plano de hasta 150 caracteres.');
        }
        $aria_label = isset($content['ariaLabel']) && $content['ariaLabel'] !== ''
            ? $content['ariaLabel']
            : $spec['name'] . ($handle !== '' ? ' de ' . $handle : '');

        $size = $content['size'] ?? 40;
        if (!is_int($size) || $size < 24 || $size > 200) {
            return new WP_Error('cod_mcp_social_invalid', 'size debe ser un entero entre 24 y 200 (px).');
        }
        $icon_padding = $content['iconPadding'] ?? 8;
        if (!is_int($icon_padding) || $icon_padding < 0 || $icon_padding > 80) {
            return new WP_Error('cod_mcp_social_invalid', 'iconPadding debe ser un entero entre 0 y 80 (px).');
        }
        $icon_color = $content['iconColor'] ?? 'currentColor';
        $background_color = $content['backgroundColor'] ?? 'transparent';
        if (!is_string($icon_color) || !$this->is_safe_css_color($icon_color)
            || !is_string($background_color) || !$this->is_safe_css_color($background_color)) {
            return new WP_Error('cod_mcp_social_invalid', 'iconColor y backgroundColor deben ser colores CSS seguros (hex, rgb/hsl, var(--token), o nombre).');
        }
        $border_radius = $content['borderRadius'] ?? '999px';
        if (!is_string($border_radius) || !$this->is_safe_css_length_list($border_radius)) {
            return new WP_Error('cod_mcp_social_invalid', 'borderRadius debe ser una longitud CSS segura (p. ej. 999px, 12px, 50%).');
        }
        return [
            'network' => $network,
            'url' => $url,
            'handle' => $handle,
            'ariaLabel' => $aria_label,
            'size' => $size,
            'iconPadding' => $icon_padding,
            'iconColor' => $icon_color,
            'backgroundColor' => $background_color,
            'borderRadius' => $border_radius,
        ];
    }

    /**
     * anchor: regla de posicionamiento+animación reutilizable en CUALQUIER
     * nodo (no exclusiva de whatsapp) — ancla el nodo a un borde/esquina de
     * su contenedor position:relative más cercano, con cuánto "cuelga"
     * afuera y cómo entra en vista. El tamaño/forma visual del nodo lo
     * define el nodo mismo (whatsapp, image, button, lo que sea).
     *
     * @param array<string, mixed> $value
     */
    private function normalize_anchor_rule(array $value)
    {
        $allowed = ['edge', 'offset', 'animation', 'repeat'];
        if (!$this->has_only_keys($value, $allowed)) {
            return new WP_Error('cod_mcp_anchor_rule_invalid', 'anchor admite solo edge, offset, animation y repeat.');
        }
        $edge = $value['edge'] ?? 'bottom';
        if (!is_string($edge) || !in_array($edge, self::ANCHOR_EDGES, true)) {
            return new WP_Error('cod_mcp_anchor_rule_invalid', 'edge debe ser una de: ' . implode(', ', self::ANCHOR_EDGES) . '.');
        }
        $offset = $value['offset'] ?? 50;
        if ((!is_int($offset) && !is_float($offset)) || $offset < -100 || $offset > 100) {
            return new WP_Error('cod_mcp_anchor_rule_invalid', 'offset debe ser un número entre -100 y 100 (% del tamaño del nodo).');
        }
        $animation = ['routine' => 'rise', 'level' => 2];
        if (isset($value['animation'])) {
            if (!is_array($value['animation']) || !$this->has_only_keys($value['animation'], ['routine', 'level'])) {
                return new WP_Error('cod_mcp_anchor_rule_invalid', 'animation admite solo routine y level.');
            }
            $routine = $value['animation']['routine'] ?? 'rise';
            $level = $value['animation']['level'] ?? 2;
            if (!is_string($routine) || !in_array($routine, self::ANCHOR_ROUTINES, true)
                || !is_int($level) || $level < 1 || $level > 3) {
                return new WP_Error('cod_mcp_anchor_rule_invalid', 'animation.routine debe ser rise|fade|scale|pop y level entre 1 y 3.');
            }
            $animation = ['routine' => $routine, 'level' => $level];
        }
        // repeat: si la animación de entrada vuelve a jugar cada vez que el
        // nodo sale y vuelve a entrar en pantalla (true, útil para CTAs
        // llamativos como whatsapp) o solo la primera vez (false, para algo
        // que no debe "parpadear" en cada scroll). Real y asignable por MCP
        // — no hardcodeado en el runtime, ver instalación en cod-canvas-public.js.
        $repeat = true;
        if (isset($value['repeat'])) {
            if (!is_bool($value['repeat'])) {
                return new WP_Error('cod_mcp_anchor_rule_invalid', 'repeat debe ser boolean.');
            }
            $repeat = $value['repeat'];
        }
        return ['edge' => $edge, 'offset' => (float) $offset, 'animation' => $animation, 'repeat' => $repeat];
    }

    /**
     * @param array<string, mixed> $composition
     * @param array<string, mixed> $design
     * @return array<string, mixed>|WP_Error
     */
    private function render_composition(array $composition, array $design)
    {
        $current = $this->check_current_state($composition['nodes'], $design['ruleIndex'], false, $this->current_markers());
        if (is_wp_error($current)) {
            return $current;
        }
        $body = $this->render_nodes(
            $composition['nodes'],
            $design['ruleIndex'],
            $composition['nodeIds'],
            0,
            '',
            false
        );
        if (is_wp_error($body)) {
            return $body;
        }

        $root_classes = ['cod-mcp-page'];
        foreach ($design['rootRuleIds'] as $rule_id) {
            $root_classes[] = $this->rule_class($rule_id);
        }
        $label = $design['label'] !== '' ? $design['label'] : $design['designId'];
        $markup = '<main class="' . esc_attr(implode(' ', array_unique($root_classes))) . '" data-cod-composition="v2" aria-label="'
            . esc_attr($label) . '">' . $body . '</main>';

        $styles = self::base_styles();
        foreach ($design['rules'] as $rule) {
            $styles .= $this->css_for_rule($rule);
        }
        // Reglas dirigidas a partes que fabrica un behavior (campo `partes`):
        // van DESPUÉS de las de clase y con selector de descendiente anclado al nodo.
        $styles .= $this->parts_css($composition['nodes'], $design['ruleIndex']);

        $kind_counts = [];
        $this->count_node_kinds($composition['nodes'], $kind_counts);
        $reviewed_rules = 0;
        foreach ($design['rules'] as $rule) {
            if ($rule['status'] === 'reviewed') {
                ++$reviewed_rules;
            }
        }

        return [
            'markup' => $markup,
            'styles' => $styles,
            'summary' => [
                'nodeCount' => $composition['nodeCount'],
                'nodeKinds' => $kind_counts,
                'ruleCount' => count($design['rules']),
                'reviewedRuleCount' => $reviewed_rules,
                'proposedRuleCount' => count($design['rules']) - $reviewed_rules,
                'visualPreviewPersisted' => false,
                'previewMeaning' => 'La previsualización MCP valida composición, reglas, URLs seguras, formularios publicados y representación Canvas; no sustituye una revisión visual en el Canvas del navegador.',
            ],
        ];
    }

    /**
     * Una regla con scope.state="current" sólo tiene sentido dentro de un
     * behavior que tenga un «elegido» (ver BEHAVIOR_CONTRACTS). Fuera de uno nunca
     * se cumpliría el selector y la regla quedaría aceptada e ignorada en
     * silencio: acá se rechaza con el nodo y el motivo.
     *
     * @param array<int, array<string, mixed>> $nodes
     * @param array<string, array<string, mixed>> $rule_index
     * @param array<string, array<int, string>> $marcas marcas del elegido por behavior (current_markers())
     * @return true|WP_Error
     */
    private function check_current_state(array $nodes, array $rule_index, bool $dentro, array $marcas)
    {
        foreach ($nodes as $node) {
            $ahora = $dentro;
            foreach ($node['ruleIds'] as $rule_id) {
                $rule = $rule_index[$rule_id];
                if ($rule['kind'] === 'interaction' && isset($marcas[$rule['value']['behavior']])) {
                    $ahora = true;
                }
            }
            foreach ($node['ruleIds'] as $rule_id) {
                if (!$ahora && $rule_index[$rule_id]['scope']['state'] === 'current') {
                    return new WP_Error(
                        'cod_mcp_current_state_target_invalid',
                        'La regla "' . $rule_id . '" tiene scope.state="current" pero el nodo "' . $node['id'] . '" no está dentro de un grupo con behavior ' . implode(' o ', array_keys($marcas)) . '; no habría nada que lo marque como elegido.'
                    );
                }
            }
            if (!empty($node['children']) && is_array($node['children'])) {
                $hijos = $this->check_current_state($node['children'], $rule_index, $ahora, $marcas);
                if (is_wp_error($hijos)) {
                    return $hijos;
                }
            }
        }
        return true;
    }

    /**
     * @param array<int, array<string, mixed>> $nodes
     * @param array<string, array<string, mixed>> $rule_index
     * @param array<int, string> $node_ids
     * @return string|WP_Error
     */
    private function render_nodes(array $nodes, array $rule_index, array $node_ids, int $depth, string $cadence_rule_id, bool $wrap_columns)
    {
        $parts = [];
        $cadence = null;
        if ($cadence_rule_id !== '') {
            $cadence = $rule_index[$cadence_rule_id]['value'];
        }
        foreach ($nodes as $index => $node) {
            $effective_rule_ids = $node['ruleIds'];
            if (is_array($cadence)) {
                $cycle = $cadence['cycleRuleIds'];
                $cycle_index = ($index + $cadence['offset']) % count($cycle);
                $effective_rule_ids[] = $cycle[$cycle_index];
            }
            $effective_rule_ids = array_values(array_unique($effective_rule_ids));
            $rendered = $this->render_node($node, $effective_rule_ids, $rule_index, $node_ids, $depth, $index);
            if (is_wp_error($rendered)) {
                return $rendered;
            }
            $parts[] = $wrap_columns
                ? '<div class="cod-column">' . $rendered . '</div>'
                : $rendered;
        }
        return implode('', $parts);
    }

    /**
     * @param array<string, mixed> $node
     * @param array<int, string> $rule_ids
     * @param array<string, array<string, mixed>> $rule_index
     * @param array<int, string> $node_ids
     * @return string|WP_Error
     */
    private function render_node(array $node, array $rule_ids, array $rule_index, array $node_ids, int $depth, int $item_index)
    {
        $behavior = $this->node_behavior($node, $rule_ids, $rule_index, $node_ids, $item_index);
        if (is_wp_error($behavior)) {
            return $behavior;
        }

        $classes = [
            'cod-node',
            'cod-node--' . sanitize_html_class($node['kind']),
            'cod-node-id-' . sanitize_html_class($node['id']),
        ];
        $canvas_class = [
            'section' => 'cod-section',
            'group' => 'cod-group',
            'layout' => 'cod-columns',
            'gallery' => 'cod-dynamic-group',
            'form' => 'cod-orugantt-form',
            'shortcode' => 'cod-shortcode',
            'button' => 'cod-button',
        ][$node['kind']] ?? '';
        if ($canvas_class !== '') {
            $classes[] = $canvas_class;
        }
        foreach ($rule_ids as $rule_id) {
            $classes[] = $this->rule_class($rule_id);
        }
        $attributes = array_merge([
            'class' => implode(' ', array_unique($classes)),
            'data-cod-node' => $node['id'],
        ], $behavior['attributes']);
        if ($node['role'] !== '') {
            $attributes['data-cod-role'] = $node['role'];
        }
        if (($node['marker'] ?? '') !== '') {
            $attributes['id'] = $node['marker'];
        }
        $attrs = $this->html_attributes($attributes);
        $child_cadence = $node['cadenceRuleId'];

        switch ($node['kind']) {
            case 'section':
                $children = $this->render_nodes($node['children'], $rule_index, $node_ids, $depth + 1, $child_cadence, false);
                if (is_wp_error($children)) {
                    return $children;
                }
                return '<section ' . $attrs . '><div class="cod-columns cod-columns--single"><div class="cod-column">' . $children . '</div></div></section>';
            case 'header':
            case 'footer':
                $children = $this->render_nodes($node['children'], $rule_index, $node_ids, $depth + 1, $child_cadence, false);
                if (is_wp_error($children)) {
                    return $children;
                }
                return '<' . $node['kind'] . ' ' . $attrs . '><div class="cod-columns cod-columns--single"><div class="cod-column">' . $children . '</div></div></' . $node['kind'] . '>';
            case 'navigation':
                $children = $this->render_nodes($node['children'], $rule_index, $node_ids, $depth + 1, $child_cadence, false);
                if (is_wp_error($children)) {
                    return $children;
                }
                return '<nav ' . $attrs . '>' . $children . '</nav>';
            case 'group':
                $children = $this->render_nodes($node['children'], $rule_index, $node_ids, $depth + 1, $child_cadence, false);
                if (is_wp_error($children)) {
                    return $children;
                }
                return '<div ' . $attrs . '>' . $children . '</div>';
            case 'layout':
                $children = $this->render_nodes($node['children'], $rule_index, $node_ids, $depth + 1, $child_cadence, true);
                if (is_wp_error($children)) {
                    return $children;
                }
                return '<div ' . $attrs . '>' . $children . '</div>';
            case 'heading':
                $level = $node['content']['level'];
                return '<h' . $level . ' ' . $attrs . '>' . esc_html($node['content']['text']) . '</h' . $level . '>';
            case 'paragraph':
                return '<p ' . $attrs . '>' . esc_html($node['content']['text']) . '</p>';
            case 'richText':
                $paragraphs = [];
                foreach ($node['content']['paragraphs'] as $paragraph) {
                    $paragraphs[] = '<p>' . esc_html($paragraph) . '</p>';
                }
                return '<div ' . $attrs . '>' . implode('', $paragraphs) . '</div>';
            case 'image':
                return $this->render_image($node['content'], $attrs);
            case 'video':
                return $this->render_video($node['content'], $attrs);
            case 'audio':
                return $this->render_audio($node['content'], $attrs);
            case 'button':
                return $this->render_link($node['content'], $attrs);
            case 'link':
                return $this->render_link($node['content'], $attrs);
            case 'list':
                return $this->render_list($node['content'], $attrs);
            case 'table':
                return $this->render_table($node['content'], $attrs);
            case 'gallery':
                return $this->render_gallery($node, $attrs, $behavior);
            case 'form':
                return '<div ' . $attrs . ' data-orugantt-form="' . esc_attr($node['content']['formSlug']) . '"></div>';
            case 'shortcode':
                // Marcador vacío: su rótulo en el editor lo pinta el CSS y al
                // publicar el div entero se reemplaza por la salida real.
                $atts_json = $node['content']['atts'] === []
                    ? ''
                    : ' data-cod-shortcode-atts="' . esc_attr((string) wp_json_encode($node['content']['atts'])) . '"';
                return '<div ' . $attrs . ' data-cod-shortcode="' . esc_attr($node['content']['tag']) . '"'
                    . $atts_json . '></div>';
            case 'dynamic':
                return $this->render_dynamic($node['content'], $attrs);
            case 'separator':
                return '<hr ' . $attrs . '>';
            case 'chart':
                $data = wp_json_encode([
                    'labels' => $node['content']['labels'],
                    'values' => $node['content']['values'],
                ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                return '<div ' . $attrs . ' data-cod-behavior="chart" data-cod-chart-type="' . esc_attr($node['content']['type'])
                    . '" data-cod-chart-data="' . esc_attr((string) $data) . '" data-cod-chart-color="'
                    . esc_attr($node['content']['color']) . '"></div>';
            case 'whatsapp':
                return $this->render_whatsapp($node['content'], $attrs, (string) $node['id']);
            case 'social':
                return $this->render_social($node['content'], $attrs);
        }

        return new WP_Error('cod_mcp_render_node_invalid', 'El tipo de nodo no puede materializarse en Canvas.');
    }

    /**
     * @param array<string, mixed> $node
     * @param array<int, string> $rule_ids
     * @param array<string, array<string, mixed>> $rule_index
     * @param array<int, string> $node_ids
     * @return array<string, mixed>|WP_Error
     */
    private function node_behavior(array $node, array $rule_ids, array $rule_index, array $node_ids, int $item_index)
    {
        $attributes = [];
        $runtime_behavior = '';
        $is_lightbox = false;
        $carousel = null;
        $gallery = null;

        foreach ($rule_ids as $rule_id) {
            $rule = $rule_index[$rule_id];
            if ($rule['kind'] === 'gallery') {
                if ($gallery !== null) {
                    return new WP_Error('cod_mcp_gallery_rule_conflict', 'Un nodo gallery sólo puede aplicar una regla de galería a la vez.');
                }
                $gallery = $rule['value'];
                continue;
            }
            if ($rule['kind'] === 'motion') {
                $motion = $rule['value'];
                if ($motion['trigger'] === 'scroll') {
                    if ($runtime_behavior !== '') {
                        return new WP_Error('cod_mcp_behavior_conflict', 'Un nodo no puede tener dos comportamientos runtime incompatibles.');
                    }
                    $runtime_behavior = 'reveal-on-scroll';
                    $attributes['data-cod-behavior'] = 'reveal-on-scroll';
                    $attributes['data-cod-reveal-class'] = 'is-revealed';
                    $attributes['data-cod-reveal-threshold'] = (string) $motion['threshold'];
                } elseif ($motion['trigger'] === 'load') {
                    $data = wp_json_encode([
                        'trigger' => ['tipo' => 'load', 'duration' => $motion['duration']],
                        'states' => [
                            ['label' => 'inicio', 'properties' => ['opacity' => '0', 'transform' => $this->motion_transform($motion['effect'])]],
                            ['label' => 'fin', 'properties' => ['opacity' => '1', 'transform' => 'none']],
                        ],
                    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                    $attributes['data-cod-interaction'] = (string) $data;
                }
                if ($motion['stagger'] > 0) {
                    $attributes['style'] = '--cod-motion-delay:' . ($motion['delay'] + $motion['stagger'] * $item_index) . 'ms';
                }
                continue;
            }
            if ($rule['kind'] === 'anchor') {
                if ($runtime_behavior !== '') {
                    return new WP_Error('cod_mcp_behavior_conflict', 'Un nodo no puede tener dos comportamientos runtime incompatibles.');
                }
                $runtime_behavior = 'anchor';
                $anchor_style = $this->anchor_style($rule['value'], $item_index);
                $attributes['data-cod-behavior'] = 'anchor';
                $attributes['data-cod-anchor-reveal-transform'] = $anchor_style['revealedTransform'];
                $attributes['data-cod-anchor-repeat'] = $rule['value']['repeat'] ? '1' : '0';
                $attributes['style'] = $anchor_style['style'];
                continue;
            }
            if ($rule['kind'] !== 'interaction') {
                continue;
            }
            $interaction = $rule['value'];
            if ($interaction['behavior'] === 'lightbox') {
                if ($node['kind'] !== 'gallery') {
                    return new WP_Error('cod_mcp_lightbox_target_invalid', 'lightbox sólo puede aplicarse a un nodo gallery.');
                }
                $is_lightbox = true;
                continue;
            }
            if ($runtime_behavior !== '') {
                return new WP_Error('cod_mcp_behavior_conflict', 'Un nodo no puede tener dos comportamientos runtime incompatibles.');
            }
            $runtime_behavior = $interaction['behavior'];
            $attributes['data-cod-behavior'] = $interaction['behavior'];
            if ($interaction['behavior'] === 'scroll-threshold') {
                $attributes['data-cod-scroll-threshold'] = (string) ($interaction['threshold'] ?? 40);
                $attributes['data-cod-scrolled-class'] = $interaction['toggleClass'] ?? 'nav--scrolled';
            } elseif ($interaction['behavior'] === 'nav-toggle') {
                if (!in_array($interaction['targetId'], $node_ids, true)) {
                    return new WP_Error('cod_mcp_interaction_target_missing', 'nav-toggle refiere un targetId que no está en esta composición.');
                }
                $attributes['data-cod-toggle-target'] = '[data-cod-node="' . $interaction['targetId'] . '"]';
                $attributes['data-cod-toggle-class'] = $interaction['toggleClass'] ?? 'is-menu-open';
            } elseif ($interaction['behavior'] === 'carousel-basic') {
                if ($node['kind'] !== 'gallery') {
                    return new WP_Error('cod_mcp_carousel_target_invalid', 'carousel-basic sólo puede aplicarse a un nodo gallery.');
                }
                $carousel = [
                    'mode' => $interaction['mode'] ?? 'single',
                    'visible' => $interaction['visible'] ?? 1,
                    'visibleMobile' => $interaction['visibleMobile'] ?? 1,
                ];
                $attributes['data-cod-carousel-mode'] = $carousel['mode'];
                $attributes['data-cod-carousel-slide-selector'] = '.cod-carousel__slide';
                $attributes['data-cod-carousel-active-class'] = 'is-active';
                $attributes['data-cod-carousel-visible'] = (string) $carousel['visible'];
                $attributes['data-cod-carousel-visible-mobile'] = (string) $carousel['visibleMobile'];
            } elseif ($interaction['behavior'] === 'cuadrantes') {
                // Un display de CUATRO contenidos: el runtime necesita exactamente
                // cuatro hijos (uno por cuadrante) para saber de qué lado queda
                // cada imagen y en qué esquina van las miniaturas. Con otra
                // cantidad no hay grilla 2x2 posible, y es mejor fallar acá, con
                // un mensaje claro, que publicar un bloque que no se comporta.
                // El único atributo que se emite es el data-cod-behavior que ya
                // se puso arriba: el resto lo arma el runtime.
                if ($node['kind'] !== 'group') {
                    return new WP_Error('cod_mcp_cuadrantes_target_invalid', 'cuadrantes sólo puede aplicarse a un nodo group.');
                }
                $hijos = is_array($node['children'] ?? null) ? count($node['children']) : 0;
                if ($hijos !== 4) {
                    return new WP_Error('cod_mcp_cuadrantes_children_invalid', 'cuadrantes exige un group con exactamente 4 hijos (uno por cuadrante); este tiene ' . $hijos . '.');
                }
            } elseif ($interaction['behavior'] === 'pestanas') {
                // Un juego de pestañas: cada hijo del group es una pestaña (su
                // primer hijo es la etiqueta, el resto es el panel). Con menos
                // de 2 no hay nada que alternar, y más de 8 etiquetas no caben
                // en una fila legible: mejor fallar acá, con un mensaje claro,
                // que publicar un bloque que no se comporta. El único atributo
                // que se emite es el data-cod-behavior que ya se puso arriba:
                // el resto lo arma el runtime.
                if ($node['kind'] !== 'group') {
                    return new WP_Error('cod_mcp_pestanas_target_invalid', 'pestanas sólo puede aplicarse a un nodo group.');
                }
                $hijos = is_array($node['children'] ?? null) ? count($node['children']) : 0;
                if ($hijos < 2 || $hijos > 8) {
                    return new WP_Error('cod_mcp_pestanas_children_invalid', 'pestanas exige un group con 2 a 8 hijos (uno por pestaña: su primer hijo es la etiqueta y el resto el panel); este tiene ' . $hijos . '.');
                }
            } elseif ($interaction['behavior'] === 'marquesina') {
                // Una fila que se desplaza sola: cada hijo del group es una
                // pieza. Con una sola no hay fila que desplazar; con más de 24
                // el navegador duplica un DOM que ya no se lee como una cinta.
                // El único atributo que se emite es el data-cod-behavior que ya
                // se puso arriba: la pista, la copia del juego y el resto de los
                // atributos los arma el runtime.
                if ($node['kind'] !== 'group') {
                    return new WP_Error('cod_mcp_marquesina_target_invalid', 'marquesina sólo puede aplicarse a un nodo group.');
                }
                $hijos = is_array($node['children'] ?? null) ? count($node['children']) : 0;
                if ($hijos < 2 || $hijos > 24) {
                    return new WP_Error('cod_mcp_marquesina_children_invalid', 'marquesina exige un group con 2 a 24 hijos (uno por pieza de la fila); este tiene ' . $hijos . '.');
                }
            }
        }

        if ($gallery !== null && ($gallery['controls'] ?? 'none') !== 'none' && $carousel === null) {
            return new WP_Error('cod_mcp_gallery_controls_unavailable', 'Los controles de galería requieren una regla interaction.carousel-basic en el mismo nodo gallery.');
        }

        return ['attributes' => $attributes, 'lightbox' => $is_lightbox, 'carousel' => $carousel, 'gallery' => $gallery];
    }

    /**
     * Suma una clase a la cadena de atributos ya armada, sin rearmarla: si ya
     * hay class="…" se agrega adentro; si no, se crea. Devuelve la cadena tal
     * cual cuando no hay nada que sumar.
     */
    private function add_class_to_attrs(string $attrs, string $extra): string
    {
        $extra = trim($extra);
        if ($extra === '') {
            return $attrs;
        }
        if (preg_match('/class="([^"]*)"/', $attrs) === 1) {
            return preg_replace('/class="([^"]*)"/', 'class="$1 ' . $extra . '"', $attrs, 1);
        }
        return trim($attrs . ' class="' . $extra . '"');
    }

    /** @param array<string, mixed> $content */
    private function render_image(array $content, string $attrs): string
    {
        $caption = $content['caption'] !== '' ? '<figcaption>' . esc_html($content['caption']) . '</figcaption>' : '';
        // El giro se estampa en la propia <img>: como clase (para que la página
        // se vea bien sin JavaScript) y como data-* (para que el lightbox pueda
        // reponerlo al ampliar, ya que ahí solo se copian src y alt).
        $rotation = isset($content['rotation']) ? (int) $content['rotation'] : 0;
        $rot_attrs = $rotation !== 0
            ? ' class="cod-rot-' . $rotation . '" data-cod-rotation="' . $rotation . '"'
            : '';
        $marco = $rotation === 90 || $rotation === 270 ? ' cod-marco-girado' : '';
        return '<figure ' . $this->add_class_to_attrs($attrs, $marco) . '><img src="' . esc_url($content['assetUrl'])
            . '" alt="' . esc_attr($content['alt']) . '"' . $rot_attrs . '>' . $caption . '</figure>';
    }

    /** @param array<string, mixed> $content */
    private function render_video(array $content, string $attrs): string
    {
        if (!empty($content['matte'])) {
            return $this->render_matte_video($content, $attrs);
        }
        $caption = $content['caption'] !== '' ? '<figcaption>' . esc_html($content['caption']) . '</figcaption>' : '';
        // Sin fuente: la primitiva se dibuja como pendiente. No es un placeholder
        // cosmético metido a mano — es el estado propio del video cuando todavía
        // no hay material, y cualquier galería lo hereda sin saber nada de esto.
        if (($content['sourceUrl'] ?? '') === '') {
            $etiqueta = $content['pendingLabel'] !== '' ? $content['pendingLabel'] : 'Próximamente';
            return '<figure ' . $attrs . '><div class="cod-video cod-video--pendiente" role="img" aria-label="'
                . esc_attr($etiqueta) . '"><span>' . esc_html($etiqueta) . '</span></div>' . $caption . '</figure>';
        }
        $poster = $content['posterUrl'] !== '' ? ' poster="' . esc_url($content['posterUrl']) . '"' : '';
        // Video ambiental: solo, en bucle, mudo y sin controles. El runtime
        // público (activateAutoplayVideos) ya arranca todo video[autoplay];
        // lo que faltaba era poder pedirlo desde la composición. Aquí no hay
        // rama para matte porque ese caso ya salió arriba: matte gana sobre
        // ambient.
        $reproduccion = !empty($content['ambient']) ? 'autoplay loop muted playsinline' : 'controls';
        return '<figure ' . $attrs . '><video ' . $reproduccion . $poster . '><source src="' . esc_url($content['sourceUrl']) . '"></video>' . $caption . '</figure>';
    }

    /**
     * Video con transparencia real vía el compositor cod-luma-matte (ya
     * registrado como primitiva del editor GrapesJS, ver
     * assets/js/cod-editor-core.js `addType('cod-luma-matte', ...)` y el
     * runtime público assets/js/cod-luma-matte-video.js). El wrapper con
     * data-cod-luma-matte="1" es lo único que ese runtime busca: video oculto
     * + canvas visible, compuestos cuadro a cuadro en el navegador.
     *
     * @param array<string, mixed> $content
     */
    private function render_matte_video(array $content, string $attrs): string
    {
        $caption = $content['caption'] !== '' ? '<figcaption>' . esc_html($content['caption']) . '</figcaption>' : '';
        $wrapper = '<div ' . $attrs . ' data-cod-luma-matte="1">'
            . '<video class="cod-luma-matte__video" muted playsinline autoplay loop preload="auto"><source src="' . esc_url($content['sourceUrl']) . '"></video>'
            . '<canvas class="cod-luma-matte__canvas"></canvas>'
            . '</div>';
        return $caption === '' ? $wrapper : '<figure>' . $wrapper . $caption . '</figure>';
    }

    /** @param array<string, mixed> $content */
    private function render_audio(array $content, string $attrs): string
    {
        $label = $content['label'] !== '' ? '<figcaption>' . esc_html($content['label']) . '</figcaption>' : '';
        return '<figure ' . $attrs . '><audio controls src="' . esc_url($content['sourceUrl']) . '"></audio>' . $label . '</figure>';
    }

    /** @param array<string, mixed> $content */
    private function render_link(array $content, string $attrs): string
    {
        $target = $content['target'] === 'blank' ? ' target="_blank" rel="noopener noreferrer"' : '';
        return '<a ' . $attrs . ' href="' . esc_url($content['href']) . '"' . $target . '>' . esc_html($content['label']) . '</a>';
    }

    /** @param array<string, mixed> $content */
    private function render_list(array $content, string $attrs): string
    {
        $tag = $content['ordered'] ? 'ol' : 'ul';
        $items = [];
        foreach ($content['items'] as $item) {
            $items[] = '<li>' . esc_html($item) . '</li>';
        }
        return '<' . $tag . ' ' . $attrs . '>' . implode('', $items) . '</' . $tag . '>';
    }

    /** @param array<string, mixed> $content */
    private function render_table(array $content, string $attrs): string
    {
        $headers = [];
        foreach ($content['headers'] as $header) {
            $headers[] = '<th scope="col">' . esc_html($header) . '</th>';
        }
        $rows = [];
        foreach ($content['rows'] as $row) {
            $cells = [];
            foreach ($row as $cell) {
                $cells[] = '<td>' . esc_html($cell) . '</td>';
            }
            $rows[] = '<tr>' . implode('', $cells) . '</tr>';
        }
        return '<div ' . $attrs . '><table><thead><tr>' . implode('', $headers) . '</tr></thead><tbody>' . implode('', $rows) . '</tbody></table></div>';
    }

    /**
     * @param array<string, mixed> $node
     * @param array<string, mixed> $behavior
     */
    private function render_gallery(array $node, string $attrs, array $behavior): string
    {
        $items = [];
        $gallery = $behavior['gallery'];
        $show_caption = !is_array($gallery) || ($gallery['caption'] ?? 'below') !== 'none';
        foreach ($node['content']['items'] as $index => $item) {
            $kind = isset($item['kind']) ? $item['kind'] : 'image';
            $caption = $show_caption && ($item['caption'] ?? '') !== '' ? '<figcaption>' . esc_html($item['caption']) . '</figcaption>' : '';
            $active = $index === 0 ? ' is-active' : '';
            $clases = 'class="cod-mcp-gallery__item cod-carousel__slide' . $active . '"';
            // La galería NO redibuja la primitiva: la delega. Así una galería de
            // fotos, de videos o de artículos comparte una sola máquina, y todo
            // lo que gane una primitiva (p. ej. el estado pendiente del video)
            // lo hereda la galería sin tocar este código.
            if ($kind === 'video') {
                $items[] = '<div ' . $clases . '>' . $this->render_video($item, '') . '</div>';
                continue;
            }
            if ($kind === 'dynamic') {
                $items[] = '<div ' . $clases . '>' . $this->render_dynamic($item, '') . '</div>';
                continue;
            }
            // La imagen también se delega (antes se redibujaba acá a mano, que
            // era justo lo que este comentario dice que no hay que hacer): así
            // el giro por ítem, y cualquier cosa que gane la primitiva después,
            // funciona igual suelta que dentro de una galería.
            $item_imagen = $item;
            if (!$show_caption) {
                $item_imagen['caption'] = '';
            }
            $items[] = $this->render_image($item_imagen, $clases);
        }
        $body = implode('', $items);
        if ((is_array($gallery) && ($gallery['mode'] ?? '') === 'carousel')
            || ($behavior['carousel'] !== null && $behavior['carousel']['mode'] === 'track')) {
            $body = '<div class="cod-carousel__track">' . $body . '</div>';
        }
        $controls = is_array($gallery) ? ($gallery['controls'] ?? 'none') : 'arrows';
        if ($behavior['carousel'] !== null && $controls !== 'none') {
            $body .= '<div class="cod-mcp-gallery__controls"><button type="button" data-cod-carousel-prev aria-label="Anterior">‹</button>'
                . '<button type="button" data-cod-carousel-next aria-label="Siguiente">›</button></div>';
            if ($controls === 'arrows-and-dots') {
                $body .= '<div class="cod-mcp-gallery__dots" data-cod-carousel-dots></div>';
            }
        }
        if ($behavior['lightbox']) {
            $source = '.cod-node-id-' . sanitize_html_class($node['id']);
            $body .= '<div class="cod-mcp-lightbox" data-cod-behavior="lightbox" data-cod-lightbox-source="'
                . esc_attr($source) . '" data-cod-lightbox-image-selector="img" data-cod-lightbox-open-class="is-open" aria-hidden="true">'
                . '<button type="button" data-cod-lightbox-close aria-label="Cerrar">×</button>'
                . '<button type="button" data-cod-lightbox-prev aria-label="Anterior">‹</button>'
                . '<img data-cod-lightbox-img alt=""><button type="button" data-cod-lightbox-next aria-label="Siguiente">›</button></div>';
        }
        return '<div ' . $attrs . '>' . $body . '</div>';
    }

    /** @param array<string, mixed> $content */
    private function render_dynamic(array $content, string $attrs): string
    {
        $token = $content['token'];
        $fallback = $content['fallback'] !== '' ? $content['fallback'] : '{{' . $token . '}}';
        if ($token === 'featured_image' || strncmp($token, 'acf_image:', 10) === 0) {
            return '<img ' . $attrs . ' data-cod-dynamic="' . esc_attr($token) . '" src="" alt="">';
        }
        if ($token === 'permalink') {
            return '<a ' . $attrs . ' data-cod-dynamic="permalink" href="#">' . esc_html($fallback) . '</a>';
        }
        return '<span ' . $attrs . ' data-cod-dynamic="' . esc_attr($token) . '">' . esc_html($fallback) . '</span>';
    }

    /** @param array<string, mixed> $content */
    private function render_whatsapp(array $content, string $attrs, string $node_id): string
    {
        $number = preg_replace('/[^0-9]/', '', (string) get_option('cod_whatsapp_number', ''));
        $href = $number !== '' && $number !== null
            ? 'https://wa.me/' . $number . '?text=' . rawurlencode($content['message'])
            : '#';
        $icon = '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">'
            . '<path fill="currentColor" d="M16 3C9 3 3.3 8.6 3.3 15.5c0 2.4.7 4.7 1.9 6.7L3 29l7-2.1c1.9 1 4 1.6 6 1.6 7 0 12.7-5.6 12.7-12.5S23 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.2 1.2 1.2-4-.3-.4a10.2 10.2 0 0 1-1.6-5.4C5.4 9.7 10.1 5 16 5s10.6 4.7 10.6 10.5S21.9 25.7 16 25.7zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-2.6-1.6 9.7 9.7 0 0 1-1.8-2.2c-.2-.3 0-.5.1-.7l.5-.6.3-.5a.6.6 0 0 0 0-.5c-.1-.2-.7-1.7-1-2.3s-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.6 3.6 0 0 0-1.1 2.7c0 1.6 1.2 3.1 1.3 3.3.2.2 2.3 3.6 5.7 5a19.6 19.6 0 0 0 1.9.7 4.6 4.6 0 0 0 2.1.1c.6-.1 1.9-.8 2.2-1.5s.3-1.4.2-1.5-.3-.2-.6-.4z"/>'
            . '</svg>';

        // Solo lo estático: forma/color/tamaño del módulo. El position/
        // transform/opacity/transition (dónde nace, cómo entra) ya viene
        // resuelto en $attrs por node_behavior() si el nodo tiene una regla
        // anchor — esta función no sabe ni le importa si la tiene. Sin ella,
        // whatsapp simplemente no se posiciona (fluye normal en el documento).
        $size = (int) $content['size'];
        $icon_padding = (int) $content['iconPadding'];
        $icon_box = max(8, $size - $icon_padding * 2);
        // box-shadow queda fuera: wp_kses rechaza su valor multi-token dentro
        // de un atributo style inline (no es el nombre de la propiedad, es el
        // parser de valores). Cosmético, no crítico para la función del CTA.
        $visual_style = 'width:' . $size . 'px;height:' . $size . 'px;border-radius:' . esc_attr($content['borderRadius'])
            . ';display:flex;align-items:center;justify-content:center;background-color:' . esc_attr($content['backgroundColor'])
            . ';color:' . esc_attr($content['iconColor']) . ';';
        $icon = str_replace(
            'width="28" height="28"',
            'width="' . $icon_box . '" height="' . $icon_box . '"',
            $icon
        );
        // Sin <style>: el sanitizador de HTML de Canvas no admite esa etiqueta,
        // así que todo viaja en el atributo style inline — el que ya trae
        // $attrs (de la regla anchor, si hay) más lo estático de acá.
        $attrs = $this->append_inline_style($attrs, $visual_style);
        return '<a ' . $attrs . ' data-cod-whatsapp-message="' . esc_attr($content['message'])
            . '" href="' . esc_url($href) . '" target="_blank" rel="noopener noreferrer" aria-label="'
            . esc_attr($content['ariaLabel']) . '">' . $icon . '</a>';
    }

    /**
     * Dibuja un enlace a una red social: el logotipo en SVG en línea y, si hay
     * handle, el nombre de usuario como texto real (seleccionable, legible por
     * lector de pantalla y buscable), nunca dentro de una imagen: es lo que
     * permite compararlo con la cuenta que le escribió a alguien.
     *
     * @param array<string, mixed> $content
     */
    private function render_social(array $content, string $attrs): string
    {
        $spec = self::SOCIAL_NETWORKS[$content['network']];
        $size = (int) $content['size'];
        $icon_box = max(8, $size - (int) $content['iconPadding'] * 2);
        $icon = '<svg viewBox="' . esc_attr($spec['viewBox']) . '" width="' . $icon_box . '" height="' . $icon_box . '" aria-hidden="true" focusable="false">'
            . '<path fill="currentColor" d="' . esc_attr($spec['path']) . '"/></svg>';
        // Forma larga siempre (background-color, nunca la abreviada). Todo en
        // línea: el sanitizador de Canvas no admite <style>.
        $icon_style = 'display:flex;align-items:center;justify-content:center;flex:none;width:' . $size . 'px;height:' . $size . 'px'
            . ';border-radius:' . esc_attr($content['borderRadius']) . ';background-color:' . esc_attr($content['backgroundColor'])
            . ';color:' . esc_attr($content['iconColor']) . ';';
        $handle = $content['handle'] !== ''
            ? '<span class="cod-social__handle">' . esc_html($content['handle']) . '</span>'
            : '';
        $attrs = $this->append_inline_style($attrs, 'display:inline-flex;align-items:center;gap:10px;color:inherit;text-decoration:none;');
        return '<a ' . $attrs . ' data-cod-social="' . esc_attr($content['network']) . '" href="' . esc_url($content['url'])
            . '" target="_blank" rel="noopener noreferrer" aria-label="' . esc_attr($content['ariaLabel']) . '">'
            . '<span class="cod-social__icon" style="' . esc_attr($icon_style) . '">' . $icon . '</span>' . $handle . '</a>';
    }

    /**
     * Agrega declaraciones CSS al atributo style="" ya serializado en $attrs
     * (o crea uno si no había ninguno). Usado por nodos cuyo estilo final
     * combina el de una regla (anchor, motion) con el propio del nodo
     * (whatsapp visual) — ambos terminan en el mismo elemento, un solo
     * atributo style.
     */
    private function append_inline_style(string $attrs, string $additional_style): string
    {
        if (preg_match('/style="([^"]*)"/', $attrs, $matches) === 1) {
            $combined = $matches[1] . $additional_style;
            return str_replace($matches[0], 'style="' . esc_attr($combined) . '"', $attrs);
        }
        return $attrs . ' style="' . esc_attr($additional_style) . '"';
    }

    /**
     * Calcula el estilo inline de posicionamiento+animación para una regla
     * anchor (ver normalize_anchor_rule) — extraído de lo que antes era
     * exclusivo de render_whatsapp, ahora aplicable a cualquier nodo.
     *
     * @param array<string, mixed> $value
     * @return array{style: string, revealedTransform: string}
     */
    private function anchor_style(array $value, int $item_index): array
    {
        $level = $value['animation']['level'];
        $duration = [1 => 280, 2 => 420, 3 => 650][$level];

        // offset: cuánto "cuelga" el módulo fuera del borde de anclaje, en
        // % de su propio tamaño (-100..100). 50 = mitad afuera. 0 = queda
        // completamente adentro del contenedor — evita que una sección con
        // overflow:hidden (marcos con borde, tarjetas) le corte la mitad.
        // Negativo = se mete hacia adentro más allá del borde.
        $hang = (float) $value['offset'];

        // edge: dónde se ancla el nodo dentro de su contenedor (que debe ser
        // position:relative — normalmente la fila/sección donde se inserta).
        // Cada borde define su propio anclaje CSS, cuál eje es de centrado
        // puro (perpendicular) y cuál es el eje de "colgado" (donde aplica
        // offset) — ese mismo eje es por donde el rise emerge.
        $edge = $value['edge'];
        $edges = [
            'bottom' => ['css' => 'left:50%;bottom:0', 'centerX' => -50, 'centerY' => null, 'axis' => 'y', 'dir' => 1],
            'top' => ['css' => 'left:50%;top:0', 'centerX' => -50, 'centerY' => null, 'axis' => 'y', 'dir' => -1],
            'left' => ['css' => 'left:0;top:50%', 'centerX' => null, 'centerY' => -50, 'axis' => 'x', 'dir' => -1],
            'right' => ['css' => 'right:0;top:50%', 'centerX' => null, 'centerY' => -50, 'axis' => 'x', 'dir' => 1],
            'bottom-left' => ['css' => 'left:0;bottom:0', 'centerX' => null, 'centerY' => null, 'axis' => 'y', 'dir' => 1, 'fixedX' => -50],
            'bottom-right' => ['css' => 'right:0;bottom:0', 'centerX' => null, 'centerY' => null, 'axis' => 'y', 'dir' => 1, 'fixedX' => 50],
            'top-left' => ['css' => 'left:0;top:0', 'centerX' => null, 'centerY' => null, 'axis' => 'y', 'dir' => -1, 'fixedX' => -50],
            'top-right' => ['css' => 'right:0;top:0', 'centerX' => null, 'centerY' => null, 'axis' => 'y', 'dir' => -1, 'fixedX' => 50],
            'center' => ['css' => 'left:50%;top:50%', 'centerX' => -50, 'centerY' => -50, 'axis' => null, 'dir' => 0],
        ][$edge];

        // Compone (restX, restY) a partir de: eje de centrado puro (fijo,
        // no depende de offset), eje de colgado (= offset * dir), y para
        // esquinas un valor fijo en el eje que no es el de colgado.
        if ($edges['axis'] === 'y') {
            $restX = $edges['centerX'] ?? $edges['fixedX'];
            $restY = $hang * $edges['dir'];
        } elseif ($edges['axis'] === 'x') {
            $restX = $hang * $edges['dir'];
            $restY = $edges['centerY'] ?? ($edges['fixedX'] ?? 0);
        } else {
            $restX = $edges['centerX'];
            $restY = $edges['centerY'];
        }
        $rest = 'translate(' . $restX . '%,' . $restY . '%)';

        switch ($value['animation']['routine']) {
            case 'fade':
                $initial_transform = $rest;
                $revealed_transform = $rest;
                $transition = 'opacity ' . $duration . 'ms ease-out';
                break;
            case 'scale':
                $start_scale = [1 => 0.6, 2 => 0.3, 3 => 0.05][$level];
                $initial_transform = $rest . ' scale(' . $start_scale . ')';
                $revealed_transform = $rest . ' scale(1)';
                $transition = 'transform ' . $duration . 'ms ease-out,opacity ' . $duration . 'ms ease-out';
                break;
            case 'pop':
                // "desde fuera hacia adentro": arranca más grande que el
                // tamaño final y se encoge hasta asentarse — al contrario
                // de scale, que arranca más chico y crece.
                $start_scale = [1 => 1.2, 2 => 1.4, 3 => 1.7][$level];
                $initial_transform = $rest . ' scale(' . $start_scale . ')';
                $revealed_transform = $rest . ' scale(1)';
                $transition = 'transform ' . $duration . 'ms cubic-bezier(.34,1.56,.64,1),opacity ' . $duration . 'ms ease-out';
                break;
            case 'rise':
            default:
                // Además de deslizarse, arranca un poco más chico y "rebota"
                // hasta su tamaño real (cubic-bezier con overshoot, la misma
                // curva que pop) — no es solo movimiento, también respira.
                $slide = [1 => 70, 2 => 100, 3 => 150][$level];
                $pop_scale = [1 => 0.85, 2 => 0.78, 3 => 0.68][$level];
                if ($edges['axis'] === null) {
                    // center no tiene borde del cual emerger: cae a scale.
                    $start_scale = [1 => 0.6, 2 => 0.3, 3 => 0.05][$level];
                    $initial_transform = $rest . ' scale(' . $start_scale . ')';
                } elseif ($edges['axis'] === 'y') {
                    $initial_transform = 'translate(' . $restX . '%,' . ($restY + $slide * $edges['dir']) . '%) scale(' . $pop_scale . ')';
                } else {
                    $initial_transform = 'translate(' . ($restX + $slide * $edges['dir']) . '%,' . $restY . '%) scale(' . $pop_scale . ')';
                }
                $revealed_transform = $rest . ' scale(1)';
                $transition = 'transform ' . $duration . 'ms cubic-bezier(.34,1.56,.64,1),opacity ' . $duration . 'ms ease-out';
        }

        // position:absolute (no fixed): el nodo se ancla a su CONTENEDOR (la
        // fila/sección donde se inserta, que debe ser position:relative), no
        // a la ventana — así "nace" de esa sección, no de la página.
        $style = 'position:absolute;' . $edges['css'] . ';transform:' . $initial_transform . ';opacity:0;transition:' . $transition . ';';

        return ['style' => $style, 'revealedTransform' => $revealed_transform];
    }

    /**
     * CSS base del canvas: lo que hace que un documento sin reglas de diseño
     * se vea razonable. NO es una decisión de diseño y nunca debe ganarle a una
     * regla `.cod-rule--*` (misma especificidad: manda el orden). Cada documento
     * compilado lo lleva al comienzo de su CSS; quien junta varios documentos en
     * una página (cabecera, cuerpo, pie) lo emite una sola vez, antes de todas las
     * reglas — ver COD_Canvas_Page_Publisher::unir_css_de_documentos().
     *
     * @return string
     */
    public static function base_styles(): string
    {
        return "\n"
            // La tinta y la superficie salen del núcleo del set, no del panel de
            // WordPress. Si el set no las declara, el navegador resuelve el
            // texto como siempre lo hizo y COD_Design_Core dice cuál falta.
            . ".cod-mcp-page{color:var(--cod-color-ink);background-color:var(--cod-color-surface);line-height:1.5;}\n"
            . ".cod-mcp-page *{box-sizing:border-box;}\n"
            . ".cod-mcp-page img,.cod-mcp-page video,.cod-mcp-page audio{display:block;max-width:100%;}\n"
            . ".cod-section{width:100%;padding:48px 24px;position:relative;}\n"
            . ".cod-columns{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;width:100%;}\n"
            . ".cod-column{min-width:0;}\n"
            . ".cod-group{display:grid;gap:16px;}\n"
            . ".cod-node--layout{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;}\n"
            . ".cod-node--gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;}\n"
            . ".cod-mcp-gallery__item{margin:0;min-width:0;overflow:hidden;}\n"
            . ".cod-mcp-gallery__item img{width:100%;height:100%;object-fit:cover;}\n"
            . ".cod-mcp-gallery__item video,.cod-mcp-gallery__item figure{width:100%;height:100%;margin:0;}\n"
            . ".cod-mcp-gallery__item video{object-fit:cover;display:block;}\n"
            . ".cod-video--pendiente{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:16/9;background-color:rgba(0,0,0,0.06);opacity:.75;font-size:.8em;letter-spacing:.06em;text-transform:uppercase;}\n"
            // Giro de la imagen. 180 no cambia la forma de la caja, así que basta
            // el transform. 90 y 270 sí la cambian: la imagen girada necesita
            // medir el ALTO del marco de ancho y el ANCHO de alto, y eso es lo
            // que hacen las unidades de contenedor (cqh/cqw) sobre el marco
            // marcado como contenedor de tamaño. Sin ese intercambio, girar deja
            // franjas vacías a los lados.
            . ".cod-rot-180{transform:rotate(180deg);}\n"
            . ".cod-marco-girado{position:relative;overflow:hidden;container-type:size;}\n"
            . ".cod-marco-girado>.cod-rot-90,.cod-marco-girado>.cod-rot-270{position:absolute;top:50%;left:50%;width:100cqh;height:100cqw;max-width:none;object-fit:cover;}\n"
            . ".cod-marco-girado>.cod-rot-90{transform:translate(-50%,-50%) rotate(90deg);}\n"
            . ".cod-marco-girado>.cod-rot-270{transform:translate(-50%,-50%) rotate(270deg);}\n"
            // Fuera de un marco de tamaño definido (imagen suelta que fluye con
            // el texto) no hay alto contra el cual intercambiar: ahí el giro se
            // aplica igual y se reserva el espacio con la proporción invertida.
            . "@supports not (width:100cqh){.cod-marco-girado>.cod-rot-90,.cod-marco-girado>.cod-rot-270{position:static;width:100%;height:auto;transform:rotate(90deg);}}\n"
            . ".cod-mcp-gallery__controls{grid-column:1/-1;display:flex;gap:8px;}\n"
            . ".cod-mcp-lightbox{display:none;position:fixed;inset:0;z-index:9999;padding:32px;background-color:rgba(0,0,0,.86);align-items:center;justify-content:center;gap:12px;}\n"
            . ".cod-mcp-lightbox.is-open{display:flex;}\n"
            . ".cod-mcp-lightbox img{max-width:min(80vw,1100px);max-height:80vh;}\n"
            . ".cod-node--table{overflow-x:auto;}\n"
            . ".cod-node--table table{border-collapse:collapse;width:100%;}\n"
            . ".cod-node--table th,.cod-node--table td{padding:.75rem;text-align:start;}\n"
            . ".cod-button{display:inline-flex;align-items:center;justify-content:center;padding:.75rem 1.25rem;text-decoration:none;}\n"
            . "@media(max-width:767px){.cod-section{padding:32px 16px;}.cod-node--layout,.cod-node--gallery{grid-template-columns:minmax(0,1fr);}}\n";
    }

    /**
     * CSS de las reglas que los nodos dirigen a una parte de su behavior.
     * El selector es un descendiente anclado al nodo por su clase de id:
     * `.cod-node-id-<nodo> [data-cod-pestanas-rol="etiqueta"]`. No se puede
     * usar la clase de la regla porque el elemento lo fabrica el runtime en el
     * navegador y nunca la recibe.
     *
     * @param array<int, array<string, mixed>> $nodes
     * @param array<string, array<string, mixed>> $rule_index
     */
    private function parts_css(array $nodes, array $rule_index): string
    {
        $css = '';
        foreach ($nodes as $node) {
            $partes = $node['partes'] ?? [];
            if ($partes !== []) {
                $behavior = $this->contract_behavior_of($node['ruleIds'], $rule_index);
                $ancla = '.cod-node-id-' . sanitize_html_class($node['id']);
                foreach ($partes as $parte => $rule_ids) {
                    $definicion = self::BEHAVIOR_CONTRACTS[$behavior]['partes'][$parte];
                    $destino = [
                        'selector' => $ancla . ' ' . $definicion['selector'],
                        'elegido' => $definicion['elegido'],
                    ];
                    foreach ($rule_ids as $rule_id) {
                        $css .= $this->css_for_rule($rule_index[$rule_id], $destino);
                    }
                }
            }
            if (!empty($node['children']) && is_array($node['children'])) {
                $css .= $this->parts_css($node['children'], $rule_index);
            }
        }
        return $css;
    }

    /**
     * @param array<string, mixed> $rule
     * @param array{selector: string, elegido: string|null}|null $destino Parte de un behavior a la que se
     *   dirige la regla: el selector completo del descendiente y la marca de su elegido. Null = el nodo
     *   que lleva la clase de la regla (la forma de siempre).
     */
    private function css_for_rule(array $rule, ?array $destino = null): string
    {
        $selector = '.' . $this->rule_class($rule['id']);
        if ($destino !== null) {
            $selector = $destino['selector'];
            if ($rule['scope']['state'] === 'current') {
                // La marca es la de ESTA parte (etiqueta activa, panel visible…),
                // no la unión de todos los behaviors. Ya se validó que existe.
                $selector .= (string) $destino['elegido'];
            } elseif ($rule['scope']['state'] !== 'default') {
                $selector .= ':' . $rule['scope']['state'];
            }
        } elseif ($rule['scope']['state'] === 'current') {
            // Un solo selector (con :is) y no una lista, para que los sufijos que
            // más abajo se le agregan a $selector (' img', ':hover img'…) sigan
            // valiendo. Especificidad: la de su argumento más alto, una clase
            // más un atributo; le gana a la regla del mismo nodo sin estado.
            $variantes = [];
            foreach ($this->current_markers() as $marcas) {
                foreach ($marcas as $marca) {
                    $variantes[] = $selector . $marca;
                    $variantes[] = $marca . ' ' . $selector;
                }
            }
            $selector = ':is(' . implode(',', $variantes) . ')';
        } elseif ($rule['scope']['state'] !== 'default') {
            $selector .= ':' . $rule['scope']['state'];
        }
        $value = $rule['value'];
        $css = '';

        switch ($rule['kind']) {
            case 'color':
                $css = '--cod-color-' . sanitize_html_class($value['role']) . ':' . $value['color'] . ';';
                // La variable siempre se emite; además el color tiene que pintar el nodo.
                // apply explícito manda. Sin apply, se conservan los atajos por nombre de
                // rol (para no cambiar lo ya compuesto) y, si el rol no es ninguno de
                // ellos, se pinta como texto: un color suelto sobre un nodo sólo puede
                // significar eso (los fondos tienen su propia regla surface).
                $aplica = $value['apply'] ?? null;
                if ($aplica === null) {
                    $aplica = in_array($value['role'], ['background', 'surface', 'canvas'], true) ? 'background' : 'text';
                }
                if ($aplica === 'background') {
                    $css .= 'background-color:' . $value['color'] . ';';
                } else {
                    $css .= 'color:' . $value['color'] . ';';
                }
                break;
            case 'typography':
                $map = [
                    'family' => 'font-family', 'fontSize' => 'font-size', 'fontWeight' => 'font-weight',
                    'lineHeight' => 'line-height', 'letterSpacing' => 'letter-spacing', 'measure' => 'max-width',
                    'style' => 'font-style', 'decoration' => 'text-decoration',
                ];
                foreach ($map as $key => $property) {
                    if (isset($value[$key])) {
                        $css .= $property . ':' . $value[$key] . ';';
                    }
                }
                if (isset($value['align'])) {
                    $css .= 'text-align:' . ['start' => 'left', 'center' => 'center', 'end' => 'right', 'justify' => 'justify'][$value['align']] . ';';
                }
                if (isset($value['transform'])) {
                    $css .= 'text-transform:' . $value['transform'] . ';';
                }
                break;
            case 'spacing':
                $map = [
                    'paddingBlock' => 'padding-block', 'paddingInline' => 'padding-inline',
                    'marginBlockStart' => 'margin-block-start', 'marginBlockEnd' => 'margin-block-end',
                    'gap' => 'gap', 'indent' => 'padding-inline-start', 'bleed' => 'margin-inline',
                    // landing: aire que queda arriba cuando el scroll aterriza
                    // en este nodo por un enlace. Sin esto el título del
                    // destino queda debajo del header fijo.
                    'landing' => 'scroll-margin-block-start',
                ];
                foreach ($map as $key => $property) {
                    if (isset($value[$key])) {
                        $css .= $property . ':' . $value[$key] . ';';
                    }
                }
                break;
            case 'layout':
                $css = $this->layout_css($value);
                break;
            case 'surface':
                $css = $this->surface_css($value);
                break;
            case 'shape':
                $css = $this->shape_css($value);
                break;
            case 'media':
                $css = $this->media_css($selector, $value);
                break;
            case 'button':
                $css = $this->button_css($value);
                break;
            case 'gallery':
                $css = $this->gallery_css($selector, $value);
                break;
            case 'table':
                $css = $this->table_css($selector, $value);
                break;
            case 'form':
                $css = $this->form_css($value);
                break;
            case 'motion':
                $css = $this->motion_css($selector, $value);
                break;
            case 'properties':
                foreach ($value['declarations'] as $propiedad => $valor) {
                    $css .= $propiedad . ':' . $valor . ';';
                }
                break;
            case 'interaction':
            case 'cadence':
            case 'anchor':
                // anchor no genera una regla CSS de clase: su estilo va
                // inline por nodo en node_behavior(), igual que motion/
                // interaction — necesita el índice del ítem (stagger) y
                // valores por-instancia que una clase compartida no puede
                // expresar.
                $css = '';
                break;
        }

        if ($css === '') {
            return '';
        }
        // media, gallery, table y motion reciben el selector y devuelven reglas
        // completas — alcanzan elementos internos (img, .cod-mcp-gallery__item,
        // th/td) que el nodo mismo no es. Envolverlas otra vez producía
        // .x{.x img{…}}, que el anidamiento CSS resuelve como ".x .x img": un
        // descendiente de sí mismo, que no existe. La regla figuraba aplicada
        // en la evidencia y no pintaba nada, que es la peor forma de fallar.
        $rule_css = in_array($rule['kind'], self::SELF_SELECTED_RULE_KINDS, true)
            ? $css
            : $selector . '{' . $css . '}';
        if ($rule['kind'] === 'form' && isset($value['theme']) && is_array($value['theme']) && $value['theme'] !== []) {
            // El runtime del formulario declara sus valores por defecto sobre
            // .ofr-form, que está DENTRO de este contenedor. Heredar no basta:
            // esa declaración interna ganaría. Por eso la misma variable se
            // repite alcanzando el elemento interno, que sí tiene más peso.
            $contrato = $this->form_theme_tokens();
            $vars = '';
            foreach ($value['theme'] as $clave => $valor) {
                if (isset($contrato[$clave])) {
                    $vars .= $contrato[$clave]['token'] . ':' . $valor . ';';
                }
            }
            if ($vars !== '') {
                $rule_css .= $selector . ' .ofr-form{' . $vars . '}';
            }
        }
        if ($rule['kind'] === 'layout' && isset($value['mobile'])) {
            $mobile_layout = $value;
            $mobile_layout['mode'] = $value['mobile']['mode'] ?? $value['mode'];
            $mobile_layout['columns'] = $value['mobile']['columns'] ?? ($value['columns'] ?? 2);
            $mobile_layout['gap'] = $value['mobile']['gap'] ?? ($value['gap'] ?? '24px');
            unset($mobile_layout['mobile']);
            $rule_css .= '@media(max-width:767px){' . $selector . '{' . $this->layout_css($mobile_layout) . '}}';
        }
        // Con imagen de fondo el velo ya salió como capa de background-image
        // (surface_css); este ::before sólo queda para superficies sin imagen.
        if ($rule['kind'] === 'surface' && isset($value['overlayColor']) && !isset($value['backgroundAssetUrl'])) {
            $rule_css .= $selector . '::before{content:"";position:absolute;inset:0;background-color:' . $value['overlayColor'] . ';opacity:'
                . ($value['overlayOpacity'] ?? 1) . ';pointer-events:none;}'
                . $selector . '>*{position:relative;}';
        }
        if ($rule['kind'] === 'button' && ($value['interaction'] ?? 'none') === 'lift') {
            $rule_css .= $selector . ':hover{transform:translateY(-2px);}';
        }
        if ($rule['kind'] === 'button' && ($value['interaction'] ?? 'none') === 'underline') {
            $rule_css .= $selector . ':hover{text-decoration:underline;}';
        }
        return $this->wrap_breakpoint_css($rule['scope']['breakpoint'], $rule_css) . "\n";
    }

    /** @param array<string, mixed> $value */
    private function layout_css(array $value): string
    {
        $mode = $value['mode'];
        $columns = $value['columns'] ?? 2;
        $gap = $value['gap'] ?? '24px';
        $css = 'gap:' . $gap . ';';
        if (isset($value['maxWidth'])) {
            $css .= 'max-width:' . $value['maxWidth'] . ';margin-inline:auto;';
        }
        if ($mode === 'stack') {
            $css .= 'display:grid;grid-template-columns:minmax(0,1fr);';
        } elseif ($mode === 'cluster') {
            $css .= 'display:flex;flex-wrap:wrap;';
        } elseif ($mode === 'masonry') {
            $css .= 'columns:' . $columns . ';';
        } elseif ($mode === 'carousel') {
            $css .= 'display:flex;overflow-x:auto;scroll-snap-type:x mandatory;';
        } else {
            $css .= 'display:grid;grid-template-columns:' . $this->grid_template_columns($value, $columns, $gap) . ';';
            if ($mode === 'metro') {
                $css .= 'grid-auto-flow:dense;';
            }
        }
        if (isset($value['align'])) {
            $css .= 'align-items:' . ['start' => 'flex-start', 'center' => 'center', 'end' => 'flex-end', 'stretch' => 'stretch'][$value['align']] . ';';
        }
        if (isset($value['justify'])) {
            $css .= 'justify-content:' . ['start' => 'flex-start', 'center' => 'center', 'end' => 'flex-end', 'between' => 'space-between', 'around' => 'space-around', 'evenly' => 'space-evenly'][$value['justify']] . ';';
        }
        return $css;
    }

    /**
     * Las pistas de una rejilla.
     *
     * `columns` y `minColumnWidth` son dos exigencias distintas y compatibles: cuántas
     * columnas como máximo, y cuánto mide una antes de que convenga bajar de número.
     * Antes `minColumnWidth` descartaba `columns` en silencio, así que una regla que
     * pedía cuatro logos con ancho mínimo salía en 2x2 sin que nada lo dijera.
     *
     * Con las dos presentes, el mínimo de cada pista es el mayor entre el ancho pedido y
     * el que le toca a una de `columns` columnas: así nunca se pasa de ese número y aun
     * así baja sola cuando el contenedor no alcanza para el ancho mínimo.
     *
     * El techo se aplica sólo cuando `columns` viene escrito en la regla, porque
     * $columns trae un valor por omisión y usarlo acá le pondría un máximo de dos
     * columnas a toda regla que hoy declara nada más el ancho mínimo.
     *
     * @param array<string, mixed> $value
     */
    private function grid_template_columns(array $value, int $columns, string $gap): string
    {
        if (!isset($value['minColumnWidth'])) {
            return 'repeat(' . $columns . ',minmax(0,1fr))';
        }
        $min = $value['minColumnWidth'];
        if (!array_key_exists('columns', $value)) {
            return 'repeat(auto-fit,minmax(' . $min . ',1fr))';
        }
        if ($columns === 1) {
            return 'minmax(0,1fr)';
        }
        $share = 'calc((100% - ' . ($columns - 1) . ' * ' . $gap . ') / ' . $columns . ')';
        return 'repeat(auto-fit,minmax(max(' . $min . ',' . $share . '),1fr))';
    }

    /**
     * El color del velo con su opacidad aplicada. color-mix() resuelve cualquier
     * color que is_css_color() acepta (hex, rgb, hsl, oklch, transparent,
     * currentColor) sin tener que leer sus canales; con opacidad 1 el color pasa
     * tal cual.
     */
    private function overlay_layer_color(string $color, float $opacity): string
    {
        if ($opacity >= 1.0) {
            return $color;
        }
        $porcentaje = rtrim(rtrim(number_format($opacity * 100, 2, '.', ''), '0'), '.');
        return 'color-mix(in srgb,' . $color . ' ' . ($porcentaje === '' ? '0' : $porcentaje) . '%,transparent)';
    }

    /** @param array<string, mixed> $value */
    private function surface_css(array $value): string
    {
        $css = 'position:relative;';
        if (isset($value['backgroundColor'])) {
            $css .= 'background-color:' . $value['backgroundColor'] . ';';
        }
        if (isset($value['foregroundColor'])) {
            $css .= 'color:' . $value['foregroundColor'] . ';';
        }
        if (isset($value['backgroundAssetUrl'])) {
            $posicion = $value['backgroundPosition'] ?? 'center';
            $tamano = $value['backgroundSize'] ?? 'cover';
            $repite = $value['backgroundRepeat'] ?? 'no-repeat';
            if (isset($value['overlayColor'])) {
                // Velo plano dentro del propio fondo: dos capas de background-image,
                // el velo arriba y la foto abajo. Cada propiedad lleva dos valores
                // (uno por capa) o la capa se desalinea.
                //
                // La capa del velo es un gradiente sin tamaño propio: debe ocupar
                // TODA la caja. Con las palabras de siempre (cover, contain, auto;
                // posición por palabras) repetir el valor de la foto ya da eso y se
                // conserva byte a byte lo emitido desde 0.3.40. Con una medida
                // (7% auto, 2% 50%) repetirla encogería o correría el velo, así que
                // la capa del velo va fija en cover y 50% 50%, y la medida es sólo
                // de la foto. El velo no se repite nunca.
                //
                // OJO, es a propósito y no se "arregla": el velo es de OPACIDAD
                // PAREJA, el mismo color en los dos extremos de linear-gradient(),
                // que es la única forma que da CSS de poner un color sólido como
                // capa de background-image. En este proyecto no hay degradados:
                // un velo uniforme no lo es, uno que varía de 0.6 a 0.9 sí. Aunque
                // el sitio de origen (la portada de econut.cl) use 0.6 -> 0.9, acá
                // se emite un solo valor. Copiar el original rompería la regla.
                $velo = $this->overlay_layer_color($value['overlayColor'], (float) ($value['overlayOpacity'] ?? 1.0));
                $posicionVelo = $this->is_object_position($posicion) ? $posicion : '50% 50%';
                $tamanoVelo = in_array($tamano, ['cover', 'contain', 'auto'], true) ? $tamano : 'cover';
                $css .= 'background-image:linear-gradient(' . $velo . ',' . $velo . '),url("' . $value['backgroundAssetUrl'] . '");'
                    . 'background-repeat:no-repeat,' . $repite . ';'
                    . 'background-position:' . $posicionVelo . ',' . $posicion . ';background-size:' . $tamanoVelo . ',' . $tamano . ';';
            } else {
                $css .= 'background-image:url("' . $value['backgroundAssetUrl'] . '");background-repeat:' . $repite . ';'
                    . 'background-position:' . $posicion . ';background-size:' . $tamano . ';';
            }
        }
        if (isset($value['borderColor']) || isset($value['borderWidth'])) {
            $css .= 'border-color:' . ($value['borderColor'] ?? 'currentColor') . ';border-style:solid;border-width:' . ($value['borderWidth'] ?? '1px') . ';';
        }
        if (isset($value['shadow'])) {
            $shadows = ['none' => 'none', 'sm' => '0 1px 3px rgba(0,0,0,.12)', 'md' => '0 8px 24px rgba(0,0,0,.16)', 'lg' => '0 18px 48px rgba(0,0,0,.2)'];
            $css .= 'box-shadow:' . $shadows[$value['shadow']] . ';';
        }
        return $css;
    }

    /** @param array<string, mixed> $value */
    private function shape_css(array $value): string
    {
        $css = '';
        if (isset($value['radius'])) {
            $radius = ['none' => '0', 'pill' => '9999px', 'circle' => '50%'][$value['radius']] ?? $value['radius'];
            $css .= 'border-radius:' . $radius . ';';
        }
        if (isset($value['borderStyle'])) {
            $css .= 'border-style:' . $value['borderStyle'] . ';';
        }
        if (isset($value['borderWidth'])) {
            $css .= 'border-width:' . $value['borderWidth'] . ';';
        }
        if (isset($value['mask'])) {
            if ($value['mask'] === 'rounded') {
                $css .= 'border-radius:1.25rem;overflow:hidden;';
            } elseif ($value['mask'] === 'circle') {
                $css .= 'border-radius:50%;overflow:hidden;';
            } elseif ($value['mask'] === 'arch') {
                $css .= 'border-radius:50% 50% 0 0 / 25% 25% 0 0;overflow:hidden;';
            }
        }
        return $css;
    }

    /** @param array<string, mixed> $value */
    private function media_css(string $selector, array $value): string
    {
        // canvas se suma acá para que fit/position también recorten el video
        // con matte (cod-luma-matte): su pieza visible es el <canvas>, el
        // <video> real queda oculto por el compositor.
        $target = $selector . ' img,' . $selector . ' video,' . $selector . ' canvas';
        $css = '';
        $declarations = '';
        if (isset($value['aspectRatio'])) {
            $declarations .= 'aspect-ratio:' . $value['aspectRatio'] . ';';
        }
        if (isset($value['fit'])) {
            $declarations .= 'object-fit:' . $value['fit'] . ';';
        }
        if (isset($value['position'])) {
            $declarations .= 'object-position:' . $value['position'] . ';';
        }
        // filter:grayscale(1) sobre imagen, video y canvas (el video con matte
        // se ve por su canvas). Con hover "dim" se suma brillo al gris en vez
        // de pisarlo.
        $gris = isset($value['filter']) && $value['filter'] === 'grayscale';
        if ($gris) {
            $declarations .= 'filter:grayscale(1);';
        }
        if ($declarations !== '') {
            $css .= $target . '{' . $declarations . '}';
        }
        if (isset($value['frame'])) {
            $frames = ['rounded' => '1.25rem', 'circle' => '50%', 'arch' => '50% 50% 0 0 / 25% 25% 0 0'];
            if (isset($frames[$value['frame']])) {
                $css .= $selector . '{overflow:hidden;border-radius:' . $frames[$value['frame']] . ';}';
            }
        }
        if (isset($value['caption']) && $value['caption'] === 'none') {
            $css .= $selector . ' figcaption{display:none;}';
        } elseif (isset($value['caption']) && $value['caption'] === 'overlay') {
            $css .= $selector . '{position:relative;overflow:hidden;}'
                . $selector . ' figcaption{position:absolute;inset:auto 0 0;padding:.75rem;background-color:rgba(0,0,0,.62);color:#fff;}';
        }
        if (isset($value['overlayColor'])) {
            $overlay_target = $selector . '::after,' . $selector . ' .cod-mcp-gallery__item::after';
            $css .= $selector . ',' . $selector . ' .cod-mcp-gallery__item{position:relative;isolation:isolate;}'
                . $overlay_target . '{content:"";position:absolute;inset:0;background-color:' . $value['overlayColor'] . ';opacity:'
                . ($value['overlayOpacity'] ?? 1) . ';pointer-events:none;}';
        }
        if (isset($value['hover']) && $value['hover'] !== 'none') {
            $transform = ['zoom' => 'scale(1.04)', 'lift' => 'translateY(-4px)', 'dim' => 'none'][$value['hover']];
            $css .= $target . '{transition:transform .3s ease,filter .3s ease;}'
                . $selector . ':hover img,' . $selector . ':hover video{' . ($value['hover'] === 'dim' ? 'filter:' . ($gris ? 'grayscale(1) ' : '') . 'brightness(.78);' : 'transform:' . $transform . ';') . '}';
        }
        return $css;
    }

    /** @param array<string, mixed> $value */
    private function button_css(array $value): string
    {
        $size = [
            'sm' => '.5rem .8rem',
            'md' => '.75rem 1.25rem',
            'lg' => '1rem 1.6rem',
        ][$value['size'] ?? 'md'];
        $tone = $value['tone'] ?? 'primary';
        $colors = [
            // Sin valores de respaldo. Hasta el 2026-09-16 estos tres tonos
            // caían en el azul, el gris y el casi negro del panel de
            // administración de WordPress. Un botón pintado así no parece roto,
            // parece decidido, y por eso nadie iba a ir a arreglarlo.
            //
            // Ahora los tres tonos son combinaciones de los mismos tres roles
            // del núcleo. Si el set no declara uno, el botón queda sin ese color
            // y COD_Design_Core lo informa por su nombre. Un aviso que dice qué
            // falta vale más que un azul que no eligió nadie.
            'primary' => ['background' => 'var(--cod-color-accent)', 'foreground' => 'var(--cod-color-surface)'],
            'secondary' => ['background' => 'var(--cod-color-surface)', 'foreground' => 'var(--cod-color-ink)'],
            'inverse' => ['background' => 'var(--cod-color-ink)', 'foreground' => 'var(--cod-color-surface)'],
        ][$tone];
        $variant = $value['variant'] ?? 'solid';
        $css = 'display:inline-flex;align-items:center;justify-content:center;padding:' . $size . ';text-decoration:none;transition:transform .2s ease,text-decoration-color .2s ease;';
        if ($variant === 'solid') {
            $css .= 'background-color:' . $colors['background'] . ';color:' . $colors['foreground'] . ';border-width:1px;border-style:solid;border-color:' . $colors['background'] . ';';
        } elseif ($variant === 'outline') {
            $css .= 'background-color:transparent;color:' . $colors['foreground'] . ';border-width:1px;border-style:solid;border-color:currentColor;';
        } elseif ($variant === 'ghost') {
            $css .= 'background-color:transparent;color:' . $colors['foreground'] . ';border-width:1px;border-style:solid;border-color:transparent;';
        } else {
            $css .= 'background-color:transparent;color:' . $colors['foreground'] . ';border-width:0;border-style:none;padding-inline:0;';
        }
        if (($value['width'] ?? 'auto') === 'full') {
            $css .= 'display:flex;width:100%;';
        } else {
            // width "auto" es ancho de contenido de verdad. Hasta 0.3.32 no emitía nada y el
            // botón quedaba a merced del padre: dentro de una grilla o un flex que estira
            // salía de ancho completo igual. justify-self/align-self lo sueltan del estirado.
            $css .= 'width:auto;justify-self:start;align-self:start;';
        }
        if (($value['interaction'] ?? 'none') === 'lift') {
            $css .= 'transform:translateY(0);';
        }
        if (isset($value['zIndex'])) {
            // z-index no hace nada sobre un elemento sin posicionar — position:
            // relative lo activa sin sacarlo del flujo normal del documento.
            $css .= 'position:relative;z-index:' . $value['zIndex'] . ';';
        }
        return $css;
    }

    /** @param array<string, mixed> $value */
    private function gallery_css(string $selector, array $value): string
    {
        $columns = $value['columns'] ?? 3;
        $gap = $value['gap'] ?? '16px';
        if ($value['mode'] === 'masonry') {
            $css = $selector . '{display:block;columns:' . $columns . ';column-gap:' . $gap . ';}'
                . $selector . ' .cod-mcp-gallery__item{break-inside:avoid;margin-bottom:' . $gap . ';}';
        } elseif ($value['mode'] === 'carousel') {
            $css = $selector . '{display:block;}'
                . $selector . ' .cod-carousel__track{display:flex;overflow-x:auto;gap:' . $gap . ';scroll-snap-type:x mandatory;}'
                . $selector . ' .cod-carousel__track .cod-mcp-gallery__item{flex:0 0 calc((100% - ' . (($columns - 1) * 1) . '*' . $gap . ')/' . $columns . ');scroll-snap-align:start;}';
        } else {
            $css = $selector . '{display:grid;grid-template-columns:repeat(' . $columns . ',minmax(0,1fr));gap:' . $gap . ';}';
            if ($value['mode'] === 'metro') {
                $css .= $selector . ' .cod-mcp-gallery__item:nth-child(5n+1){grid-column:span 2;grid-row:span 2;}';
            }
        }
        if (isset($value['mobileColumns'])) {
            if ($value['mode'] === 'carousel') {
                $mobile_columns = $value['mobileColumns'];
                $css .= '@media(max-width:767px){' . $selector . ' .cod-carousel__track .cod-mcp-gallery__item{flex-basis:calc((100% - '
                    . (($mobile_columns - 1) * 1) . '*' . $gap . ')/' . $mobile_columns . ');}}';
            } else {
                $css .= '@media(max-width:767px){' . $selector . '{grid-template-columns:repeat(' . $value['mobileColumns'] . ',minmax(0,1fr));columns:' . $value['mobileColumns'] . ';}}';
            }
        }
        return $css;
    }

    /** @param array<string, mixed> $value */
    private function table_css(string $selector, array $value): string
    {
        $css = '';
        if (($value['variant'] ?? '') === 'lined') {
            $css .= $selector . ' th,' . $selector . ' td{border-bottom:1px solid currentColor;}';
        } elseif (($value['variant'] ?? '') === 'striped') {
            $css .= $selector . ' tbody tr:nth-child(even){background-color:rgba(0,0,0,.05);}';
        } elseif (($value['variant'] ?? '') === 'cards') {
            $css .= '@media(max-width:767px){' . $selector . ' table,' . $selector . ' thead,' . $selector . ' tbody,' . $selector . ' tr,' . $selector . ' th,' . $selector . ' td{display:block;}}';
        }
        if (($value['responsive'] ?? 'scroll') === 'stack' && ($value['variant'] ?? '') !== 'cards') {
            $css .= '@media(max-width:767px){' . $selector . ' table,' . $selector . ' thead,' . $selector . ' tbody,' . $selector . ' tr,' . $selector . ' th,' . $selector . ' td{display:block;}}';
        }
        if (($value['header'] ?? '') === 'accent') {
            // Los mismos tres roles del núcleo, sin respaldo inventado.
            $css .= $selector . ' th{background-color:var(--cod-color-accent);color:var(--cod-color-surface);}';
        } elseif (($value['header'] ?? '') === 'inverse') {
            $css .= $selector . ' th{background-color:var(--cod-color-ink);color:var(--cod-color-surface);}';
        }
        $padding = ['compact' => '.4rem', 'comfortable' => '.75rem', 'spacious' => '1.15rem'][$value['density'] ?? 'comfortable'];
        $css .= $selector . ' th,' . $selector . ' td{padding:' . $padding . ';}';
        return $css;
    }

    /** @param array<string, mixed> $value */
    /**
     * Valida el tema de un formulario: pares "clave del contrato → valor".
     * Cada valor se comprueba según el tipo que el contrato declara, así que
     * un color no puede colarse donde va una longitud ni al revés.
     *
     * @param mixed $value
     * @return array<string, string>|WP_Error
     */
    private function normalize_form_theme($value)
    {
        if (!is_array($value) || $value === []) {
            return new WP_Error('cod_mcp_form_rule_invalid', 'theme debe declarar al menos una variable de diseño.');
        }
        if (count($value) > 40) {
            return new WP_Error('cod_mcp_form_rule_invalid', 'theme declara demasiadas variables.');
        }

        $contrato = $this->form_theme_tokens();
        $normalized = [];

        foreach ($value as $clave => $bruto) {
            if (!is_string($clave) || !isset($contrato[$clave])) {
                return new WP_Error(
                    'cod_mcp_form_rule_invalid',
                    'theme: "' . (is_string($clave) ? $clave : '?') . '" no es una variable de diseño del formulario.'
                );
            }
            if (!is_string($bruto) || trim($bruto) === '') {
                return new WP_Error('cod_mcp_form_rule_invalid', 'theme: el valor de "' . $clave . '" debe ser texto.');
            }

            $bruto = trim($bruto);
            $tipo = $contrato[$clave]['type'];
            $valido = false;
            switch ($tipo) {
                case 'color':
                    $valido = $this->is_css_color($bruto);
                    break;
                case 'length':
                    $valido = $this->is_css_length($bruto);
                    break;
                case 'font':
                    $valido = $this->is_css_font_family($bruto);
                    break;
                case 'shadow':
                    // Sombra y anillo de foco: se acepta una lista corta de
                    // valores seguros, sin funciones ni url().
                    $valido = preg_match('/^[0-9a-zA-Z#().,%\s\/-]{1,120}$/', $bruto) === 1
                        && stripos($bruto, 'url(') === false
                        && stripos($bruto, 'expression') === false;
                    break;
            }
            if (!$valido) {
                return new WP_Error('cod_mcp_form_rule_invalid', 'theme: el valor de "' . $clave . '" no es válido para un valor de tipo ' . $tipo . '.');
            }

            $normalized[$clave] = $bruto;
        }

        return $normalized;
    }

    /** @param array<string, mixed> $value */
    private function form_css(array $value): string
    {
        $css = '';
        if (isset($value['theme']) && is_array($value['theme'])) {
            $contrato = $this->form_theme_tokens();
            foreach ($value['theme'] as $clave => $valor) {
                if (isset($contrato[$clave])) {
                    $css .= $contrato[$clave]['token'] . ':' . $valor . ';';
                }
            }
        }
        if (isset($value['maxWidth'])) {
            $css .= 'max-width:' . $value['maxWidth'] . ';margin-inline:auto;';
        }
        if (($value['surface'] ?? '') === 'card') {
            $css .= 'padding:1.5rem;background-color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.12);';
        } elseif (($value['surface'] ?? '') === 'outlined') {
            $css .= 'padding:1.5rem;border-width:1px;border-style:solid;border-color:currentColor;';
        }
        return $css;
    }

    /** @param array<string, mixed> $value */
    private function motion_css(string $selector, array $value): string
    {
        $delay = $value['delay'] . 'ms';
        $transition = 'opacity ' . $value['duration'] . 'ms ' . $value['easing'] . ' var(--cod-motion-delay,' . $delay . '),transform '
            . $value['duration'] . 'ms ' . $value['easing'] . ' var(--cod-motion-delay,' . $delay . ');';
        if ($value['trigger'] === 'scroll') {
            return $selector . '{opacity:0;transform:' . $this->motion_transform($value['effect']) . ';transition:' . $transition . '}'
                . $selector . '.is-revealed{opacity:1;transform:none;}';
        }
        if ($value['trigger'] === 'hover') {
            return $selector . '{transition:' . $transition . '}' . $selector . ':hover{transform:' . $this->motion_transform($value['effect']) . ';}';
        }
        return $selector . '{transition:' . $transition . '}';
    }

    private function motion_transform(string $effect): string
    {
        return [
            'fade' => 'none',
            'rise' => 'translateY(20px)',
            'slide-left' => 'translateX(-24px)',
            'slide-right' => 'translateX(24px)',
            'scale' => 'scale(.96)',
        ][$effect];
    }

    private function wrap_breakpoint_css(string $breakpoint, string $css): string
    {
        if ($breakpoint === 'mobile') {
            return '@media(max-width:767px){' . $css . '}';
        }
        if ($breakpoint === 'tablet') {
            return '@media(min-width:768px) and (max-width:1023px){' . $css . '}';
        }
        if ($breakpoint === 'desktop') {
            return '@media(min-width:1024px){' . $css . '}';
        }
        return $css;
    }

    /** @param array<int, array<string, mixed>> $nodes @param array<string, int> $counts */
    private function count_node_kinds(array $nodes, array &$counts): void
    {
        foreach ($nodes as $node) {
            $counts[$node['kind']] = ($counts[$node['kind']] ?? 0) + 1;
            $this->count_node_kinds($node['children'], $counts);
        }
    }

    /** @param array<string, string> $attributes */
    private function html_attributes(array $attributes): string
    {
        $parts = [];
        foreach ($attributes as $name => $value) {
            $parts[] = esc_attr($name) . '="' . esc_attr($value) . '"';
        }
        return implode(' ', $parts);
    }

    private function rule_class(string $rule_id): string
    {
        return 'cod-rule--' . sanitize_html_class($rule_id);
    }

    /** @param array<string, mixed> $value */
    private function has_only_keys(array $value, array $allowed): bool
    {
        foreach (array_keys($value) as $key) {
            if (!is_string($key) || !in_array($key, $allowed, true)) {
                return false;
            }
        }
        return true;
    }

    /** @param mixed $value */
    private function is_stable_id($value): bool
    {
        return is_string($value) && preg_match('/^[a-z][a-z0-9._:-]{0,127}$/', $value) === 1;
    }

    /** @param array<mixed> $value */
    private function is_list(array $value): bool
    {
        $index = 0;
        foreach (array_keys($value) as $key) {
            if ($key !== $index) {
                return false;
            }
            ++$index;
        }
        return true;
    }

    /** @param mixed $value */
    private function is_plain_text($value, int $max_length): bool
    {
        return is_string($value) && strpos($value, "\0") === false && (function_exists('mb_strlen') ? mb_strlen($value) : strlen($value)) <= $max_length;
    }

    private function is_css_length(string $value, bool $allow_negative = false): bool
    {
        if (preg_match('/^clamp\(([^,]+),([^,]+),([^\)]+)\)$/', $value, $matches) === 1) {
            return $this->is_css_length(trim($matches[1]), $allow_negative)
                && $this->is_css_length(trim($matches[2]), $allow_negative)
                && $this->is_css_length(trim($matches[3]), $allow_negative);
        }
        if ($value === '0') {
            return true;
        }
        $sign = $allow_negative ? '-?' : '';
        return preg_match('/^' . $sign . '[0-9]+(?:\.[0-9]+)?(?:px|rem|em|%|vw|vh|vmin|vmax|ch)$/', $value) === 1;
    }

    private function is_css_color(string $value): bool
    {
        return preg_match('/^(?:#[0-9a-fA-F]{3,8}|transparent|currentColor|(?:rgb|hsl|oklch)\([0-9.%\s,\/+-]+\))$/', $value) === 1;
    }

    private function is_css_font_family(string $value): bool
    {
        return preg_match('/^[a-zA-Z0-9\s,\-\'\"]{1,240}$/', $value) === 1;
    }

    private function is_object_position(string $value): bool
    {
        return preg_match('/^(?:(?:left|center|right)(?:\s+(?:top|center|bottom))?|(?:top|center|bottom)(?:\s+(?:left|center|right))?)$/', $value) === 1;
    }

    /** Una medida de fondo: número (con decimales, y signo si $conSigno) más unidad de longitud o %. El 0 pelado también. */
    private function is_background_measure(string $value, bool $conSigno): bool
    {
        $signo = $conSigno ? '[+-]?' : '\+?';
        return preg_match('/^' . $signo . '(?:\d+(?:\.\d+)?|\.\d+)(?:(?i:px|em|rem|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc|q)|%)$/D', $value) === 1
            || preg_match('/^' . $signo . '0+(?:\.0+)?$/D', $value) === 1;
    }

    /**
     * Posición del fondo: palabras y/o medidas, una o dos componentes separadas por
     * un espacio. Lista blanca por componente; nada de calc(), var(), url(), comillas,
     * punto y coma, llaves ni paréntesis. Las palabras solas valen igual que con
     * is_object_position(), que se deja intacta (la usan otras reglas).
     */
    private function is_background_position(string $value): bool
    {
        if ($value === '' || strlen($value) > 64 || preg_match('/^\S+(?: \S+)?$/D', $value) !== 1) {
            return false;
        }
        $x = ['left', 'center', 'right'];
        $y = ['top', 'center', 'bottom'];
        $partes = explode(' ', $value);
        if (count($partes) === 1) {
            return in_array($partes[0], array_merge($x, $y), true) || $this->is_background_measure($partes[0], true);
        }
        [$a, $b] = $partes;
        // Horizontal y luego vertical; cada uno palabra o medida.
        if ((in_array($a, $x, true) || $this->is_background_measure($a, true)) && (in_array($b, $y, true) || $this->is_background_measure($b, true))) {
            return true;
        }
        // Orden invertido sólo entre palabras (top left).
        return in_array($a, $y, true) && in_array($b, $x, true);
    }

    /** Tamaño del fondo: cover|contain|auto, o una o dos medidas (auto vale como componente). Sin negativos. */
    private function is_background_size(string $value): bool
    {
        if ($value === '' || strlen($value) > 64 || preg_match('/^\S+(?: \S+)?$/D', $value) !== 1) {
            return false;
        }
        $partes = explode(' ', $value);
        if (count($partes) === 1 && in_array($partes[0], ['cover', 'contain'], true)) {
            return true;
        }
        foreach ($partes as $parte) {
            if ($parte !== 'auto' && !$this->is_background_measure($parte, false)) {
                return false;
            }
        }
        return true;
    }

    private function is_safe_asset_url(string $value): bool
    {
        if ($value === '' || preg_match('/[\s\'\"<>{};()\\\\]/', $value) === 1) {
            return false;
        }
        if (strpos($value, '/') === 0) {
            return strpos($value, '//') !== 0;
        }
        $parts = wp_parse_url($value);
        return is_array($parts)
            && isset($parts['scheme'], $parts['host'])
            && in_array(strtolower((string) $parts['scheme']), ['http', 'https'], true);
    }

    private function is_safe_link(string $value): bool
    {
        if ($value === '' || preg_match('/[\s\'\"<>]/', $value) === 1) {
            return false;
        }
        if ($value[0] === '#' || $value[0] === '/') {
            return strpos($value, '//') !== 0;
        }
        if (preg_match('/^(?:mailto:|tel:)/i', $value) === 1) {
            return true;
        }
        return $this->is_safe_asset_url($value);
    }

    private function is_dynamic_token(string $token): bool
    {
        if (in_array($token, ['post_title', 'post_excerpt', 'featured_image', 'permalink'], true)) {
            return true;
        }
        return preg_match('/^(?:acf:[a-zA-Z0-9_]{1,64}(?::html)?|acf_image:[a-zA-Z0-9_]{1,64})$/', $token) === 1;
    }
}
