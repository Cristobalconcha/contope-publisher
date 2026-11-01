# ESPEC — El ADN como única puerta del diseño, y el contenido como bloques de WordPress

Estado: **especificación para decisión. No se implementó nada.** Fecha: 2026-11-01. Rama: `basis-transcriptor`
(sobre `b7b0478`, `d4860a0`, `bc19101`). Plugin medido: `contope-publisher` 0.3.85.

Lo que mandó el dueño (Cristóbal), textual, y de lo que cuelga todo este documento:

> «nuestro MCP no admita una incorporación de parámetros de diseño que no sea a través de lo que ContOpe Core es
> capaz de construir, a través de un archivo de ADN de diseño. Y si no tenemos el ContOpe Core para hacerlo, la
> única forma de usar el MCP y el skill es descargando los parámetros directamente desde el otro sitio y
> convirtiéndolos en un archivo de ADN de diseño. La fuente del ADN es otra, pero el ADN sigue siéndolo, y si
> queremos usar ese mismo ADN para construir otra cosa nos va a seguir sirviendo.»

Y la regla 11 de `CLAUDE.md`: el contenido va en bloques de WordPress; el módulo propio **se corresponde** con la
familia de Gutenberg, no la duplica.

---

## 0. Resumen: las decisiones centrales

1. **El ADN es un archivo `design-contract.json` (o el `design/model.json` portable) y es la única fuente de
   valores de diseño.** El plugin lo valida, lo guarda con revisión y de él **deriva** todo lo demás: variables
   `--wp--preset--*`, `--wp--custom--*`, los alias `--cod-*` del núcleo, el `theme.json` y la opción
   `cod_theme_definitions`. Nadie edita una proyección a mano.
2. **Validación en PHP, portada 1:1 desde `parseDesignContract` / `parsePortableDesignModel`**, más un corpus de
   casos compartido que corre en TypeScript y en PHP para detectar deriva. Justificación en 3.2 (el hosting no
   tiene Node; un JSON Schema no expresa las invariantes).
3. **Seis herramientas MCP nuevas para el ADN** (`cod_adn_get`, `cod_adn_preview_import`, `cod_adn_apply_import`,
   `cod_adn_audit`, `cod_adn_set_mode`, `cod_adn_export`; más tres de contenido, en 6.4) y una pantalla de wp-admin para subir el ADN donde no hay
   MCP (Basis en producción **no tiene credencial MCP**).
4. **La compuerta** rechaza, en el MCP, todo valor de diseño literal de nueve clases (color, familia, tamaño de
   letra, peso/interlineado/tracking, espaciado, radio, grosor de borde, sombra, movimiento) y el ancho de caja
   (`max-width` absoluto). Un valor se referencia **por variable** (`var(--wp--preset--color--accent)`); el id de
   la definición se recupera del registro y viaja en la evidencia del `preview`.
5. **Cuatro modos por sitio**: `off` → `observe` → `ratchet` → `enforce`. Santa Luisa y Econut parten en `off`; un
   sitio sólo sube de modo con números (`cod_adn_audit`), y `ratchet` impide **agregar** deuda sin obligar a
   saldar la heredada.
6. **El conjunto es cerrado.** No hay excepciones ni "proponer un valor desde el MCP". Si el diseño necesita un
   valor que el ADN no tiene, se hace otra revisión del ADN (Desktop, o el extractor y una confirmación humana).
7. **Extractor** `scripts/adn/medicion-a-adn.mjs`: de la medición del transcriptor a un ADN con fuentes
   `observation`, definiciones `proposed` / `deterministic-extraction` y evidencia trazable. Emite el **contrato
   desnudo** (no el envoltorio portable), porque `provenance.producer` del envoltorio sólo admite
   `'contope-design-desktop'` y el extractor no puede declararse Desktop.
8. **Desktop hoy NO puede importar un ADN ajeno** (buscado y confirmado, 2.2). Hace falta una función chica
   (fase 6). Mientras tanto hay una vía provisoria, trazada, para que el dueño confirme.
9. **Contenido = bloques de WordPress puros en `post_content`**, con presets por slug y variaciones de estilo
   declaradas en el ADN. **Ningún valor de diseño dentro de un bloque.** El mapa nodo→bloque está en 6.2; sólo
   faltan tres bloques propios (`contope/formulario`, `contope/mapa`, `contope/whatsapp`).
10. **Lo que apareció midiendo y cambia el plan:** colores y familias de Basis ya están gobernados (0 literales),
    pero **la escala no**: 262 espaciados, 26 valores tipográficos, 23 radios y 11 grosores literales en reglas
    `properties`, más 49 tamaños de letra en reglas `typography`. Y el plugin lleva **valores de diseño dentro de
    su propio código** (sombras `sm/md/lg`, rellenos de botón, defaults de WhatsApp) que saltan cualquier compuerta
    sobre las reglas.
11. **La tensión que sólo el dueño resuelve** (9, Q1): `dim2.req02` del Core enumera **9 roles tipográficos**
    y Basis mide **14 tamaños de letra** en **20 combinaciones** familia-peso-tamaño. O se abre la lista en el Core, o
    Basis se normaliza y cambia de tamaño en algunos títulos.
12. **Orden de subida a producción:** plugin (sin efecto visible) → tema con `theme.json` generado (misma paleta)
    → ADN → páginas al final. Cada paso reversible; en ningún momento el sitio depende de algo que aún no subió.

---

## 1. Vocabulario

| Término | Qué es aquí |
|---|---|
| **ADN** | El contrato de diseño `DesignContractV1` (`design-contract.json`) o su envoltorio portable `design/model.json` (`kind: contope/design-model`). Único origen de valores de diseño. |
| **Definición** | Un elemento de `contract.definitions[]` con `id`, `category`, `state`, `authority`, `value`. Los `id` que produce Desktop son `<requirementId>.defN` (p. ej. `dim1.req01.def1`; ver `capsula.ts`). |
| **Proyección** | Algo **derivado** del ADN y regenerable: `theme.json`, `cod_theme_definitions`, hoja `:root`, registro de variables. Se sobreescribe; no se edita. |
| **Registro** | La tabla `variable CSS → {definitionId, ruta dentro del payload, valor, estado, autoridad}`. Es lo que la compuerta consulta. |
| **Compuerta** | La verificación del MCP de que un valor de diseño referencia el registro. |
| **Heredada / nueva** | Deuda de literales ya presente en un documento (heredada) frente a la que agrega una operación (nueva). |

---

## 2. Estado verificado hoy

Lo que sigue sale de leer código y correr guiones (anexo C). Donde dice "no encontré", dice **dónde busqué**.

### 2.1 El formato del ADN (Core)

| Hecho | Dónde | Consecuencia |
|---|---|---|
| `parseDesignContract` valida identidad, fuentes únicas, `'user'` reservado, definiciones únicas, referencias de evidencia/procedencia/restricciones, tareas de desarrollo con invariantes y `projections.designMd`. `value` es `unknown`. | `packages/core/src/design-contract.ts:244-333` | Lo que el contrato no valida (la **forma del payload** de cada requisito) hay que validarlo en el destino (3.2, reglas R2). |
| `parsePortableDesignModel` exige **claves exactas** y que `designMd.content` sea **idéntico byte a byte** a `renderDesignContractDesignMd(contract)`. `provenance.producer` sólo puede ser `'contope-design-desktop'`; `transport` exige URNs `urn:ocd:package:*` / `urn:ocd:project:*`. | `design-contract-portable.ts:204-254`, `:128-144`, `:105-126` | Portar la igualdad de `DESIGN.md` a PHP obligaría a portar el renderizador entero (257 líneas con orden y JSON estables). Y un extractor **no puede** emitir el envoltorio sin falsear el productor. |
| Nadie llama a `createPortableDesignPackageContribution` fuera de su propio módulo. | `grep` en `ContOpeDesign-Core` (sólo definición y pruebas) | **Hoy ningún emisor produce `design/model.json`.** Desktop exporta `design-contract.json` + `DESIGN.md` (`packages/desktop/src/dominio/capsula.ts: proyectarCapsula`). |
| Los payloads de cada requisito están tipados: `dim1.req01` → `{institucionales:[{name,value}], neutros:[…]}`; `dim1.req02` → `roleColors`; `dim2.req01` → `familias:[{name,stack,idiomas,licencia}]`; `dim2.req02` → `roleStyles` con `role ∈ CORE_ROLES_9`; `dim2.req07` → correspondencia con el **almacén plano** de WordPress; `dim3.req01` → `{unidad, escala:[{step,value}]}`; `dim3.req02` → `roleSpacing`; `dim4.req02` → `formas[].radioValor`; `dim8.req03` → `escala:[{nombre,duracion}]`; `dim9.req03` → `variantes`. | `requirement-manifest/manifest-v0-dim{1,2,3,4,8,9}.ts` | El ADN **ya tiene dónde poner** paleta, familias, escala de espacio, radios, duraciones y variantes. Faltan por leer antes de fijar el mapeo: `dim4.req03/req04` (borde, profundidad), `dim8.req02/req04` (roles y trayectoria de movimiento), los requisitos de contenedores/retícula de `dim3`. |

### 2.2 ¿Puede Desktop importar un `design/model.json` ajeno? **No.**

Busqué en `packages/desktop/src` y `packages/desktop/electron` (`parsePortableDesignModel`, `model.json`,
`design-contract`, `contope/design-model`, `parseDesignContract`, "importar"). Sólo aparecen:

- `dominio/persistencia.ts`: usa `parseDesignContract` para validar **`capsulaAnterior`**, que vive **dentro** de un
  archivo `.contope.json` (`kind: contope/sistema`).
- `dominio/capsula.ts`: exporta.
- `puente/tipos.ts`: `abrirSistema()` abre sólo `.contope.json`; `exportarCapsula()` escribe.

Lo que sí existe y sirve de puente: los extractores de Desktop (`dominio/extractores/{css,tokens-w3c,idml,imagen}.ts`)
producen `Candidato{requirementId, fragmento}` para `dim1.req01`, `dim2.req01` y `dim3.req01` (los **fundamentos**).
Eso permite una vía alternativa (5.6), pero **no** conserva procedencia ni roles.

### 2.3 El plugin

| Hecho | Dónde | Consecuencia |
|---|---|---|
| `designRuleSet` es una instantánea; `expectedDesignRevision` sólo se valida como entero ≥ 0 y se **repite** en la evidencia; nada lo compara con una revisión guardada. `capabilities.designRuleSet.portableContractPersisted = false`, `readsDesktopContract = false`. | `class-cod-canvas-mcp-recipe-compiler.php:1186-1280`, `class-cod-canvas-mcp-service.php:51-60` | Brecha 1 del skill `aplicar-set-de-diseno`. Con un ADN persistido, `expectedDesignRevision` pasa a significar algo. |
| Hay **tres** lugares donde vive la identidad: el `theme.json` del tema (a mano), la opción `cod_theme_definitions` (almacén plano: 4 colores, 3 familias, `size_base`, `h1..h6`, `radius`, `spacing`, movimiento), y `COD_Design_Core`, que lee ambos (definiciones > theme.json). `scripts/basis/definiciones-del-set.php` copia del primero al segundo: **dos autoridades sincronizadas por un guion**. | `class-cod-design-core.php:138-166`, `class-cod-theme-definitions.php:33-150`, `scripts/basis/definiciones-del-set.php` | Esto es lo que se colapsa en una sola fuente. |
| El plugin **no** usa `wp_theme_json_data_*` en ninguna parte. | `grep` en `contope-publisher/` | La proyección a `theme.json` es terreno nuevo, no una modificación. |
| Validadores de valores: `is_css_color` y `is_css_font_family` aceptan **literal o `var()`**; `is_css_length` **no acepta `var()`**; `properties` acepta cualquier texto de ≤300 caracteres sin `{};<>@` ni `url(`. | `…recipe-compiler.php:7180-7280`, `:3073-3131` | La compuerta no puede ser "sólo exigir `var()`": antes hay que enseñar a los validadores de longitud a aceptar variables del registro. |
| **Cinco vías por fuera del compilador** escriben diseño sin validarlo: `cod_patch_css`, `cod_patch_html`, `cod_write_canvas_document`, `cod_grapes_edit_node` (`mutation.style`, `mutation.attributes`) y `cod_activate_section_whatsapp` (`style`). | `class-cod-canvas-mcp-service.php:613-724, 729-760, 1236-1405` | Una compuerta sólo sobre `cod_apply_canvas_composition` es decorativa. |
| El compilador lleva **valores de diseño dentro de su propio código**: sombras `sm/md/lg` (`rgba(0,0,0,.12/.16/.2)`, línea 6652), rellenos de botón `.5rem .8rem` / `.75rem 1.25rem` / `1rem 1.6rem` (6787-6789), `transition: transform .2s ease` (6807), zebra de tabla `rgba(0,0,0,.05)` (6873), caja de formulario `0 8px 24px rgba(0,0,0,.12)` (6982), pie de imagen `rgba(0,0,0,.62)` (6767), WhatsApp `#25D366` / `#ffffff` por defecto (4103-4104). | `class-cod-canvas-mcp-recipe-compiler.php` (líneas citadas) | Es el mismo defecto del issue #9 (el azul de WordPress), un nivel más adentro. Un nombre cerrado como `shadow: "md"` **debe resolver por el ADN, sin respaldo**. |
| Las páginas de muestra con bloques (Econut, págs. 68 y 72) tienen `wp:contope/lienzo {"documentId":""}`: **no hay documento, luego ninguna regla de diseño les llega.** | `wp-local-econut/.../database.sqlite`, `wp_posts` 68 y 72 | El camino "bloques + diseño" **no existe todavía**; sólo existe el contenedor. Esta especificación lo define (6.3). |
| El nodo `block` de la composición (0.3.85) sólo admite **bloques dinámicos de una lista cerrada** (`core/search`, `latest-posts`, `latest-comments`, `archives`, `categories`, `tag-cloud`, `calendar`, `page-list`); se dibuja con `render_block()` en un `<div data-cod-bloque>`. **No es contenido en bloques.** | `class-cod-canvas-bloque-renderer.php` | No se reutiliza como vía de contenido. |
| `COD_Block_Serializer` produce bloques desde un vocabulario **distinto** (`section/group/columns/column/heading/paragraph/list/details/video/separator/spacer/buttons/button/image`) y sin presets. Es el importador del paquete v0. | `class-cod-block-serializer.php` | Precedente de qué markup escribir; no se puede reutilizar tal cual. |
| `scripts/econut/legal-a-bloques.php` convirtió la página legal a bloques escribiendo `{"style":{"color":{"background":"#dbd4c0"}}}`: **un literal dentro del bloque**. | línea 70 | Es exactamente lo que no debe repetirse. |
| El paquete `.ocdsite` v1 ya prevé `entrypoints.designModel` (`design/model.json`), pero **ningún código del plugin lo lee**. | `docs/package-format-v1.md:99,307`; `schemas/manifest-v1.schema.json:135`; `grep designModel` en `*.php` (sin resultados) | Hay un punto de entrada natural para el ADN en el importador de paquetes (fase 1b). |

### 2.4 Basis: dónde está el sitio

Publicado en `https://basisbodegas.com` desde 2026-11-01. Se actualiza **sin MCP**: se compara fila a fila la base
local contra `basis_prueba`, se arma un SQL con las filas cambiadas y se importa por phpMyAdmin; los archivos del
plugin se suben por el Administrador de archivos (memoria `project_basis_sitio_y_hosting.md`). WordPress local:
**7.1.4**; en `wp-includes/blocks/` existen `accordion`, `accordion-item`, `accordion-heading`, `accordion-panel`,
`tabs`, `tab-list`, `tab-panel`, `tab-panels`, `details`, `cover`, `media-text`, `gallery`, `columns`, `column`,
`group`, `buttons`, `button`, `icon`, `navigation`, `social-link`. **La versión de WordPress de producción no está
verificada**: es precondición de las fases 8-10 (que `core/accordion` y `core/tabs` existan allá).

### 2.5 Medición del estado de Basis (reglas ya con variables, tras `b7b0478`)

Guion de una pasada sobre `scripts/basis/salida/*.componer.json` (reproducible; se vuelve `cod_adn_audit`):

| | Resultado |
|---|---|
| Reglas totales en las 7 composiciones (5 páginas + 2 regiones) | **312**; **199** (64 %) son `properties` |
| Colores literales en reglas | **0** (sólo `transparent`) |
| Familias literales | **0** |
| Declaraciones `properties` con valor de clase de diseño, **distinto de 0**, sin `var()` | espaciado **262** (**48** valores distintos), tipografía **26** (8), radio **23** (6), grosor de borde **11** (2) |
| Reglas `typography` con `fontSize` literal | **49** apariciones, **13** valores distintos |
| Reglas `layout.gap`, `icono.tamano`, `form.*` con medidas literales | 9 / 4 / ≈35 |
| Colores distintos en la medición del sitio original (hex + rgb(a)) | **31**; el transcriptor ya traduce **11** exactos y **15** aproximados (**7** "fuera del set") (`scripts/basis/salida/tokens.json`) |
| Tamaños de letra en `IDENTIDAD.md` | **14** distintos (12 a 80 px), **20** combinaciones familia-peso-tamaño en **33** entradas de rol |

Lectura: el trabajo de gobierno de color y familia está hecho; **lo que le falta al ADN es la escala** (espacio,
tamaños, radios, bordes), que es justo donde el Core es más estricto (9 roles tipográficos).

---

## 3. El ADN como única puerta

### 3.1 Formatos que acepta el plugin

| Formato | Quién lo produce | Aceptado |
|---|---|---|
| **A. Contrato desnudo** — `DesignContractV1` (`design-contract.json`) | Desktop (hoy), el extractor | **Sí. Es el formato principal.** |
| **B. Envoltorio portable** — `contope/design-model` (`design/model.json`) | Desktop (cuando exporte el paquete), `.ocdsite` | **Sí**, validado con las claves exactas de `parsePortableDesignModel`; el plugin guarda y usa sólo `contract`. |
| `DESIGN.md` suelto | cualquiera | **No.** Es proyección; "nunca se promueve Markdown suelto a definición" (skill `leer-contrato-de-diseno`). |
| `designRuleSet` | MCP | No es ADN: sigue siendo la **entrada de composición**, no la fuente de valores. |

### 3.2 Validación: decisión y por qué

**Opciones.** (a) JSON Schema compartido; (b) portar los parsers a PHP; (c) validar sólo en Node con el Core.

**Decisión: (b), con un corpus compartido que corre en ambos lados, y (c) como segunda barrera donde haya Node.**

| Criterio | JSON Schema | **Port a PHP + corpus** | Sólo Node |
|---|---|---|---|
| ¿Corre donde está el sitio? | sí | **sí** | **no** (el hosting no tiene Node: `cod_read_canvas_document` ya documenta ese límite) |
| ¿Expresa unicidad de ids, integridad referencial y las invariantes de `developmentTasks`? | no (y el repo ya tuvo que escribir comprobaciones a mano junto a `manifest-v1.schema.json`) | **sí** | sí |
| Costo | schema + comprobaciones igual | ≈ 330 líneas PHP; el dominio es chico y estable | 0 |
| Riesgo | deriva silenciosa | **deriva controlada por el corpus** | depende de que haya Node |

Componentes:

1. **`COD_ADN_Validator`** (PHP). Reproduce 1:1 las reglas de `parseDesignContract` y de `parsePortableDesignModel`
   (lista exacta en el anexo A). **Una diferencia deliberada**: no recalcula `designMd.content`; verifica
   `designMd.path === 'design/DESIGN.md'`, `designMd.revision === contract.design.revision` y que `content` sea texto.
   `DESIGN.md` es proyección y el plugin no lo usa. La igualdad byte a byte la sigue exigiendo la barrera de Node.
2. **Reglas del destino** (no existen en el Core; se declaran como tales, no se hacen pasar por él):
   - **R1.** `state: confirmed` exige `authority ∈ {human-confirmed, approved-guideline}`. Sin una persona o una guía
     aprobada detrás no hay confirmación (skill: "confirmado por una persona > guía aprobada > …").
   - **R2.** Para cada requisito que la web consume, el `value` debe tener la **forma de su payloadSchema**
     (hoy: `dim1.req01/02`, `dim2.req01/02/07`, `dim3.req01/02`, `dim4.req02`, `dim8.req03`, `dim9.req03`). Un
     `value` ausente = "declarada y sin resolver", **no es error** (skill). Un `value` con forma incorrecta sí.
   - **R3.** Los *slugs* derivados de nombres dentro de una misma clase son únicos (colisión → `-2`, `-3` y se avisa).
   - **R4.** Una definición cuyo requisito la web no proyecta se **guarda** y se lista en `ignored[]`; nunca se
     descarta ni se emite.
   - **R5.** Tamaño máximo 1 MB, 2000 definiciones, profundidad de `value` ≤ 12. El ADN es entrada no confiable.
3. **Corpus compartido** `fixtures/adn/{valid,invalid}/*.json`: se genera desde Core con
   `scripts/exportar-corpus-adn.ts` (nuevo, en `ContOpeDesign-Core`) a partir de los casos de
   `design-contract.test.ts` (828 líneas) y `design-contract-portable.test.ts`; cada `return null` de los dos
   parsers tiene al menos un caso inválido. Lo corren `packages/core` (TS) y `scripts/probar-adn-validador.php`
   (PHP, dentro de `npm run pruebas`). **Aceptación:** coincidencia 100 % válido/inválido.
4. **Barrera de Node** `scripts/adn/validar-adn.mjs`: si `../ContOpeDesign-Core` está, llama los parsers reales
   (estricto, con la igualdad de `DESIGN.md`); si no, avisa que sólo hubo validación PHP.

### 3.3 Dónde se guarda y cómo se versiona

- **Almacén.** CPT privado `cod_adn` (`public=false`, `show_ui=false`, `show_in_rest=false`), **un post por
  revisión**: `post_name = <designId>-r<revision>`, `post_content` = JSON canónico (claves ordenadas,
  `JSON_UNESCAPED_UNICODE|SLASHES`), meta `_cod_adn_digest` (sha256), `_cod_adn_source` (`desktop` | `extractor` |
  `upload`), `_cod_adn_importado_por`. Puntero: opción `cod_adn_activa` =
  `{designId, revision, digest, postId, importadoEn, modo, emitirPropuestas}`.
- **Por qué en la base de datos y no en archivos de `uploads/`:** el método de subida vigente de Basis es SQL por
  filas cambiadas; el ADN debe viajar con él, con historial. Lo mismo vale para el export de WordPress.
- **Identidad.** `design.id` del ADN **=** `designId` de las composiciones (`basis-web`). Un sitio tiene **un** ADN
  activo; el primer import fija el `design.id` y cambiarlo se rechaza (`ADN_DESIGN_ID_MISMATCH`).
- **Revisión.** `design.revision` **=** `expectedDesignRevision`. Reglas de import:
  - `revision` estrictamente mayor que la activa (`ADN_REVISION_NOT_NEWER`);
  - mismo `digest` → `unchanged`, idempotente;
  - `expectedCurrentRevision` (control optimista, como `expectedRevision` de los documentos) distinto de la activa
    → `ADN_STALE_BASE`;
  - **no hay "volver atrás" del puntero:** se reimporta el contenido viejo como revisión nueva (así lo haría
    Desktop: siempre `revision + 1`). Así `expectedDesignRevision` nunca retrocede.
- **Atomicidad.** validar → construir proyección en memoria → verificar integridad referencial contra los
  documentos guardados (3.6) → escribir el CPT → actualizar proyecciones → mover el puntero. Si algo falla, el
  puntero no se mueve y las proyecciones previas siguen.
- **Qué cambia en la composición.** `design.expectedDesignRevision` debe ser igual a la revisión activa
  (`ADN_REVISION_STALE`, que dice cuál es la activa y manda a refrescar con `cod_adn_get`). En `off` sigue libre.

### 3.4 Herramientas MCP

Todas con `manage_options`; las de lectura con las anotaciones `readOnlyHint` ya usadas.

| Herramienta | Mutación | Qué hace |
|---|---|---|
| `cod_adn_get` | no | Resumen: `{activo, designId, revision, digest, modo, fuente, importadoEn, conteos{confirmed,proposed,observed,rejected}, proyeccion{themeJson, themeDefinitions}, ignoradas[]}`; `incluir: ["definiciones","registro","auditoria"]` agrega el detalle. |
| `cod_adn_preview_import` | no | Recibe `{model, expectedCurrentRevision, emitirPropuestas}`. Devuelve validación con códigos, `diff` (agregadas/quitadas/cambiadas/**renombradas**), `rompe[]` (variables que se quitan y qué documentos/reglas las usan), `previewId` (sha256 de digest + revisión base + opciones) y el resumen de proyección. |
| `cod_adn_apply_import` | sí | Igual argumento + `previewId` exacto. Atómico (3.3). Un import con `rompe[]` no vacío se rechaza (`ADN_REF_BROKEN`) salvo `permitirRuptura: true`, que sólo acepta wp-admin, no el MCP. |
| `cod_adn_audit` | no | Escanea documentos y composiciones guardadas y devuelve literales **por clase** (conteo, valores distintos, los N más frecuentes), variables desconocidas, y por documento. Es la línea base y el instrumento de ratchet. |
| `cod_adn_set_mode` | sí | Sólo hacia **más estricto** (`observe → ratchet → enforce`). Bajar el modo se hace en wp-admin (decisión humana). |
| `cod_adn_export` | no | `formato: "contract" | "tokens-w3c" | "theme-json"`. El primero cierra el ciclo con Desktop; el último es el artefacto que se commitea en el tema (3.6). |

Además `cod_get_capabilities` cambia: `designRuleSet.portableContractPersisted` pasa a `true` cuando hay ADN y se
agrega `adn: {activo, designId, revision, modo, digest}`; `readsDesktopContract` **sigue en `false`** (no hay
conexión viva con Desktop) y se agrega `importsPortableModel: true`. `designCore.roles[*].origen` agrega el valor
`'adn'`.

**Pantalla de wp-admin** "ContOpe → Diseño (ADN)": subir archivo, ver la misma validación y el mismo diff, aplicar
(nonce + `manage_options`), cambiar el modo en ambos sentidos, ver el estado de la proyección. Es la vía de
**producción**, donde no hay MCP.

**Paquetes `.ocdsite`:** `COD_Site_Package_Importer` pasa `entrypoints.designModel` al mismo `apply` (fase 1b),
de modo que "la transferencia sin conexión y la conexión en vivo se refieren a la misma identidad de diseño".

### 3.5 Qué se emite según estado y autoridad

| `state` | `authority` | ¿Se emite variable? | ¿Una regla puede referenciarla? | Efecto |
|---|---|---|---|---|
| `confirmed` | `human-confirmed` / `approved-guideline` | **Sí** | **Sí** | Las reglas quedan `reviewed`. **Es lo único que permite publicar.** |
| `confirmed` | otra | — | — | **Import rechazado** (R1). |
| `proposed` | cualquiera | Sólo si el import trae `emitirPropuestas: true` (por defecto **false** en producción) | Sí, **marcada**: la regla queda `status: proposed`, el sobre `reviewState: session` | `cod_publish_canvas_page` se rechaza con `ADN_PUBLISH_BLOCKED_PROPOSED` listando las definiciones. |
| `observed` | — | **Nunca** | No | Evidencia. Aparece en `cod_adn_audit` y en el informe de ajuste del transcriptor. |
| `rejected` | — | **Nunca** | `ADN_VAR_REJECTED` (nombra la definición y la revisión) | Evita que una variable quitada reaparezca por costumbre. |

**Conflicto en una misma clase** (dos definiciones compiten por un mismo rol): gana la de mayor autoridad
(`human-confirmed > approved-guideline > deterministic-extraction > model-proposal`); empate → `ADN_SLOT_CONFLICT`
con ambas, sin elegir. Se aplica el orden del skill, sin excepciones.

### 3.6 Derivación: una sola fuente

```
ADN activo (CPT cod_adn, puntero cod_adn_activa)
        │
        ▼
COD_ADN_Projection::build()  ──►  registro (variable → definición)          ◄── consulta la compuerta
        ├─► theme.json (fragmento v3) ──► filtro wp_theme_json_data_theme ──► WordPress imprime --wp--preset--*
        │                          └─► cod_adn_export(theme-json) ──► se commitea en el tema (respaldo si se apaga el plugin)
        ├─► :root{--cod-color-accent: var(--wp--preset--color--…); …}  (alias de COD_Design_Core)
        ├─► cod_theme_definitions (opción) ──► emisores existentes y pantalla de Configuración (sólo lectura)
        └─► informe: ignoradas[], roles del núcleo sin definición
```

**Quién escribe qué** (hoy → después):

| Destino | Hoy | Con ADN activo |
|---|---|---|
| `theme.json` (paleta, familias, tamaños, espacios) | a mano en el tema | **generado** desde `theme.base.json` (estructura sin valores de diseño) + proyección; lleva `settings.custom.adn = {designId, revision, digest}` |
| `cod_theme_definitions` | a mano / `definiciones-del-set.php` | **sobreescrito** por la proyección en cada import; la pantalla muestra los campos gobernados en sólo lectura ("Gobernado por ADN `basis-web` r3") y `COD_Theme_Definitions` rechaza editarlos |
| `COD_Design_Core::estado()` | definiciones > `theme.json` | **sólo ADN** (origen `adn`). No consulta el `theme.json` como segunda fuente: un `theme.json` viejo no puede volver a taparle un hueco al ADN (el defecto del issue #9) |
| `--cod-color-accent`, `--cod-font-*`, `--cod-motion-*` | `:root` desde definiciones | **alias** de variables del registro; mismos nombres, así nada del sitio se rompe |

**Respaldo si el plugin se apaga.** El `theme.json` del tema es un artefacto generado (`cod_adn_export`) y se
commitea; el filtro en tiempo de ejecución es un *no-op* cuando el `digest` del archivo coincide con el del ADN, y
superpone sólo cuando el ADN va por delante (`cod_adn_get.proyeccion.themeJson`: `sincronizado` | `adelantado` |
`ausente`). No son dos autoridades: el archivo es una salida del ADN con sello.

**Familias de variables** (nombres deterministas: *slug* de `name`, con `_` y acentos normalizados):

| Clase | Variable | Declarada en `theme.json` como | Origen en el ADN |
|---|---|---|---|
| color | `--wp--preset--color--<slug>` | `settings.color.palette` | `dim1.req01` (`institucionales` + `neutros`) |
| rol de color (alias) | `--cod-color-surface` ← rol Core `background`; `--cod-color-ink` ← `text`; `--cod-color-accent` ← `accent`; almacén plano `color_primary` ← rol Core `surface` | `styles.color`, `styles.elements.link/button` | `dim1.req02` |
| familia | `--wp--preset--font-family--<slug>` | `settings.typography.fontFamilies` | `dim2.req01` |
| tamaño de letra | `--wp--preset--font-size--<rol>` | `settings.typography.fontSizes` | `dim2.req02` |
| peso/interlineado/tracking | `--wp--custom--typography--<rol>--{weight,line-height,letter-spacing}` | `settings.custom` | `dim2.req02` |
| espacio | `--wp--preset--spacing--<step>` | `settings.spacing.spacingSizes` | `dim3.req01` |
| espacio por rol | `--wp--custom--spacing--{intra,inter,entre-secciones}` | `settings.custom`, `styles.spacing.blockGap` | `dim3.req02` |
| ancho de caja | `--wp--style--global--content-size` / `wide-size` | `settings.layout` | requisito de contenedores de `dim3` (por identificar en fase 2) |
| radio | `--wp--custom--radius--<rol>` | `settings.custom.radius` | `dim4.req02` (`radioValor`) |
| sombra | `--wp--preset--shadow--<slug>` | `settings.shadow.presets` | `dim4.req04` (por leer) |
| movimiento | `--wp--custom--motion--<nombre>`; `--cod-motion-enter/response` como alias | `settings.custom.motion` | `dim8.req03` + roles de `dim8.req02` (por leer) |
| variante de bloque | clase `is-style-<slug>` | `styles.blocks.<bloque>.variations` | `dim9.req03` |

**Dos hallazgos de nombres, que se resuelven con una tabla fija y no con otro vocabulario:**
(1) el plugin llama `surface` al **fondo de la página** (`--cod-color-surface = color_bg`), el Core llama
`background` a eso y `surface` a la superficie de una tarjeta; se conservan los nombres del plugin como alias y se
documenta la tabla. (2) El Core tiene correspondencia explícita con el almacén plano para **tipografía**
(`dim2.req07`) pero **no** para color; hasta que el Core agregue su equivalente (pedido a registrar), la tabla de
color vive en `COD_ADN_Projection::MAPA_PLANO_COLOR` y se prueba contra Basis.

**Integridad referencial al importar.** Antes de mover el puntero se recorren las composiciones guardadas
(`META_COMPOSITION`) y se listan las variables que usan; si la revisión nueva **quita o renombra** una que está en
uso, el import se rechaza con la lista `{variable, documentId, ruleId}`. Un *slug* cambia cuando cambia el `name`:
por eso el diff separa "renombradas" de "quitadas".

### 3.7 Seguridad

El ADN que llega por MCP o por subida es **entrada no confiable**. Los valores que van a CSS o a `theme.json`
pasan por los mismos validadores de la lista blanca del compilador (`is_css_color`, `is_css_length`,
`is_css_font_family`); nunca se concatenan strings crudos del ADN a CSS. Los *slugs* se normalizan a
`[a-z0-9-]`. La subida de wp-admin lleva nonce y `manage_options`. `cod_adn_set_mode` no puede relajar nada.

---

## 4. La compuerta

### 4.1 Alcance: qué se rechaza y qué queda fuera

La unidad de decisión es la **clase de diseño**, y cada clase está atada a un requisito del ADN. La clasificación
vive **declarada en el catálogo del compilador** (`rule_value_schemas()` gana un `adnClass` por campo) y de ahí
la leen la compuerta y `cod_get_capabilities`: quien construya ve qué campos están gobernados *antes* de componer.

| Clase | Propiedades CSS | Campos semánticos | Forma aceptada | Requisito ADN |
|---|---|---|---|---|
| `color` | `color`, `background-color`, `border-*-color`, `outline-color`, `fill`, `stroke`, `text-decoration-color`, `caret-color` | `color.color`, `surface.{backgroundColor,foregroundColor,overlayColor,borderColor}`, paradas de `backgroundGradient`, `backgroundPattern/Mask.color`, `divisor.color`, `icono.color`, colores de `form.theme`, `whatsapp.iconColor/backgroundColor` | `var(--…)` del registro; `color-mix(in srgb, var(--…) N%, transparent)`; `transparent`, `currentColor`, `inherit` | `dim1.req01/02` |
| `familia` | `font-family` | `typography.family`, `form.theme` (familias) | `var(--wp--preset--font-family--…)` / `var(--cod-font-*)` | `dim2.req01` |
| `tamano` | `font-size` | `typography.fontSize`, tamaños de `form.theme` | `var(--wp--preset--font-size--…)` | `dim2.req02` |
| `tipografia-fina` | `font-weight`, `line-height`, `letter-spacing` | `typography.{fontWeight,lineHeight,letterSpacing}` | `var(--wp--custom--typography--…)` | `dim2.req02` |
| `espaciado` | `padding-*`, `margin-*`, `gap`, `row-gap`, `column-gap`, `scroll-margin-*`, `inset*` de separación | `spacing.*`, `layout.gap/minColumnWidth`, `gallery.gap`, `icono.tamano/separacion`, medidas de `form.theme` | `var(--wp--preset--spacing--…)`, `var(--wp--custom--spacing--…)`, `0`, `auto`; negativos como `calc(-1 * var(--…))` | `dim3.req01/02` |
| `radio` | `border-*-radius` | `shape.radius`, `form.theme` (radios) | `var(--wp--custom--radius--…)`, `0`; `pill`/`circle` resuelven por el ADN | `dim4.req02` |
| `borde-grosor` | `border-*-width`, `outline-width` | `shape.borderWidth`, `surface.borderWidth` | `var(--wp--custom--border--…)`, `0` | `dim4.req03` (por leer) |
| `sombra` | `box-shadow`, `text-shadow`, `filter: drop-shadow()` | `surface.shadow` (`sm/md/lg`) | `var(--wp--preset--shadow--…)`, `none` | `dim4.req04` (por leer) |
| `movimiento` | `transition-*`, `animation-*` (duración, curva, retraso) | `motion.{duration,delay,easing}` | `var(--wp--custom--motion--…)`, `0s` | `dim8.req02/03` |
| `ancho-de-caja` | `max-width` con unidad **absoluta** | `layout.maxWidth` | `var(--wp--style--global--content-size/wide-size)`, `none`, `100%`, `fit-content` | contenedores de `dim3` (por identificar) |

**Fuera de alcance, y por qué** (no es olvido; queda medido en `cod_adn_audit` bajo `sinRequisito`, para que el Core
los incorpore si corresponde):

| Queda fuera | Razón |
|---|---|
| `width`, `height`, `min-height`, `aspect-ratio`, `grid-template-*`, `flex-*`, `order`, `position`, `inset` de ubicación, `z-index`, `overflow`, `object-fit/position` | Es **composición de esta página**, no identidad. Gobernarla obligaría a catalogar cada caja de imagen. |
| `opacity`, `backdrop-filter`/blur, `filter`, `mix-blend-mode`, `transform` | El manifiesto del Core no tiene requisito para ellos. El conjunto es cerrado: lo que no está declarado no se puede exigir ni inventar. |
| `url()`, rutas de medios | Son activos, no valores. Los resuelve `cod_resolve_canvas_assets`. |
| Cromo del motor (`lightbox` rgba(0,0,0,.86), placeholder de video pendiente, logo de WhatsApp de terceros) | No es el diseño del sitio. Se inventaría y se mueve a variables del motor en la fase 4b; mientras, el audit del plugin lo lista. |
| Edición humana en el editor Canvas / Gutenberg del wp-admin | La regla del dueño es sobre el **MCP**. La edición humana no se bloquea; `cod_adn_audit` la mide. Revisable. |

### 4.2 Cómo se referencia una definición

Se referencia **por variable**: es la única sintaxis (sin atajos tipo `adn:…`, que obligarían a cambiar el esquema
de cada `kind`). El **id de la definición** se recupera del registro y se devuelve en la evidencia:

```json
"adnGate": {
  "modo": "enforce", "designId": "basis-web", "revision": 3,
  "revisadas": 312, "violaciones": [],
  "referencias": [
    {"regla": "c-0e0c19", "variable": "--wp--preset--color--ink",
     "definicion": "dim1.req01.def1", "ruta": "neutros[2]", "estado": "confirmed"}
  ]
}
```

Así el cierre que pide el skill ("qué definiciones del contrato lo justifican") sale gratis. Para que `spacing`,
`layout` y `typography` admitan variables, `is_css_length()` se amplía: acepta `var(--x)` **sólo si `--x` está en
el registro** y `calc(-1 * var(--x))` para los campos que admiten negativos.

### 4.3 Dónde se engancha (un solo punto por camino, no cheques sueltos)

Nueva clase **`COD_ADN_Gate`** con tres operaciones: `clasificar(propiedad|campo)`, `revisar(valor, clase)` y
`barrer(reglas)` / `delta(antes, despues)`.

| Camino | Enganche |
|---|---|
| `cod_preview_canvas_composition` y `cod_apply_canvas_composition` | en `COD_Canvas_MCP_Recipe_Compiler::compile()`, **después de `normalize_design()`** y antes de renderizar. Preview y apply pasan por el mismo `compile()`, así que no se pueden desalinear. |
| `cod_patch_css`, `cod_patch_html`, `cod_write_canvas_document`, `cod_grapes_edit_node` (`mutation.style`, `mutation.attributes["style"]`), `cod_activate_section_whatsapp(style)` | antes de `repository->save()`: `delta(documentoActual, documentoNuevo)` — se extraen las declaraciones del CSS y de los `style=""`; **cada literal de una clase gobernada que no estaba antes** es violación. Un `replace` que cambia un `var()` del registro por `#F26621` se rechaza. |
| Valores nombrados del motor (`shadow: md`, `button.size`, `tone`) | se resuelven **por el ADN sin valor de respaldo** (fase 4b): si el ADN no declara la sombra `md`, el nombre falla con `ADN_NAME_UNRESOLVED` en vez de pintar `rgba(0,0,0,.16)`. |
| Contenido en bloques (6.4) | `COD_Block_Content::compile()`: los `attrs` de cada bloque pasan por el mismo `COD_ADN_Gate` (`style.color.*`, `style.typography.*`, `style.spacing.*`, `style.border.*`, `style.shadow`). |

### 4.4 Mensajes de error (qué dicen y qué sugieren)

Estructura: `details.violaciones[] = {regla|ruta, propiedad, valor, clase, codigo, mensaje, sugerencias[]}` con
`sugerencias[] = {variable, definicion, nombre, valorResuelto, distancia?}`. La sugerencia se calcula así: color →
mismo valor exacto, luego tres más cercanos en OKLab (distancia ×100, la misma que ya usa `tokens.mjs`); espaciado,
radios y tamaños → los dos escalones vecinos.

Ejemplo (color exacto):

> `ADN_LITERAL_COLOR` — `design.rules[bas-c-1].value.color` = `#F26621` es un color literal. Este sitio sólo admite
> colores del ADN `basis-web` r3. `#F26621` coincide exactamente con **Naranja Basis** (`dim1.req01.def1 ›
> institucionales[0]`): usa `var(--wp--preset--color--naranja-basis)`. Si necesitas un color que el ADN no tiene,
> no se agrega desde aquí: pide una revisión del ADN (Desktop o el extractor) y reimporta.

Ejemplo (sin con qué reemplazar):

> `ADN_NO_DEFINITION` — `box-shadow: 0 8px 24px rgba(0,0,0,.16)`. El ADN `basis-web` r3 no declara escala de
> sombras (`dim4.req04`), así que no hay variable que referenciar. Declara la profundidad en el ADN y reimporta.

Códigos (anexo B): `ADN_LITERAL_{COLOR,FONT,SIZE,FINE,SPACING,RADIUS,BORDER,SHADOW,MOTION,MEASURE}`,
`ADN_VAR_UNKNOWN`, `ADN_VAR_REJECTED`, `ADN_NO_DEFINITION`, `ADN_NAME_UNRESOLVED`, `ADN_REVISION_STALE`,
`ADN_MISSING`, `ADN_PUBLISH_BLOCKED_PROPOSED`, y los de import.

### 4.5 Los cuatro modos

| Modo | Qué hace la compuerta | Para qué |
|---|---|---|
| `off` | nada; el comportamiento de hoy | Sitios sin ADN (Santa Luisa, Econut, hoy). |
| `observe` | revisa y **informa** en `adnGate.violaciones` y en `cod_adn_audit`; **nunca rechaza** | Primer paso tras importar un ADN: medir sin romper. |
| `ratchet` | rechaza lo que **agrega** deuda: `literales(nuevo) ⊆ literales(guardado)` como multiconjuntos de `(clase, valor)`. Las heredadas pasan y se cuentan (`heredadas: n, nuevas: 0`) | Poder tocar un nodo antiguo sin saldar toda la deuda, pero sin agregarle. (Se compara por `(clase, valor)` y no por id de regla, porque el id lleva un hash del contenido y cambia al editarla.) |
| `enforce` | rechaza **todo** literal de las clases gobernadas en la operación | Estado objetivo. Para entrar: `cod_adn_audit.total === 0` (o lo aceptado explícitamente por el dueño y registrado). |

Se guarda en `cod_adn_activa.modo`. Primer import exitoso: `off → observe`. `cod_adn_set_mode` sólo endurece.

### 4.6 Sitios ya hechos (Santa Luisa, Econut)

No se tocan. Siguen en `off` y lo medible es cuánto falta:

1. Hoy, `COD_Design_Core` y las definiciones siguen funcionando exactamente igual cuando no hay ADN (la rama
   "sin ADN" del código **conserva** el comportamiento actual; prueba P2.5).
2. Para cada sitio: correr el extractor sobre **su propio `theme.json` + definiciones + composiciones guardadas**
   (fuente `observation`, la misma mecánica de 5) → ADN `proposed` → confirmación humana → import → `observe`.
   Santa Luisa usa variables propias (`--dorado-600`, `--oliva-700`) que hoy el compilador acepta por forma;
   con ADN pasan a `ADN_VAR_UNKNOWN` en `observe` hasta que el ADN las declare — esa lista **es** el trabajo.
3. `observe → ratchet` cuando `cod_adn_audit` no crece entre dos auditorías; `ratchet → enforce` cuando llega a 0.
4. Medible por sitio: `cod_adn_audit.literales.total` por clase y fecha. Se registra en el vault.

---

## 5. Extracción: de un sitio existente a un ADN

### 5.1 Dónde vive y qué entra

`scripts/adn/medicion-a-adn.mjs` (más `scripts/adn/lib/`), **en este repositorio**, porque el formato que consume
es el del transcriptor y el ADN sólo necesita ser válido, no vivir en el Core. Sin dependencia del Core para
correr; con Core disponible, valida con sus parsers.

Entradas:

- `datos/medida-<pagina>-<ancho>.json` (1440, 393, 768) producidos por `scripts/basis/descarga/medir*.mjs`. Claves
  que usa: `roles`, `colores`, `radios`, `fuentes`, `fondos`, `variablesCss`, `cuerpo`, `secciones`
  (`relleno`/`margen` de filas y columnas), `formularios`.
- `identidad.json` / `IDENTIDAD.md` (agregado del sitio) y `botones`.
- Opcional: el `theme.json` de destino (como segunda observación) y un bloque `adn` en el perfil del sitio
  (`designId`, nombres de marca, umbrales).

Salida: `adn/<designId>.contract.json` (formato A, **primario**) y el informe `adn/<designId>.informe.md`.
Opcionales: `--formato portable` (sólo con Core presente: lo emitiría Desktop, no el extractor; ver 5.5) y
`--formato tokens-w3c` (insumo para el extractor DTCG que Desktop ya tiene).

### 5.2 Qué produce, sin inventar

- `sources[]`: `src-medicion-<designId>-<fecha>` (`purpose: observation`, `technicalKind: site-measurement`,
  `locator` = origen, `path` = carpeta de medición); `src-tema-json` si se usó. `importedAt` = fecha de la
  medición (no del reloj: el resultado es determinista).
- `definitions[]`: ids `<requirementId>.defN` (la misma forma que escribe Desktop, así Desktop puede revertirla a
  `DesignSetEntryV0`), `state: proposed`, `authority: deterministic-extraction`, `evidenceSourceIds` no vacío,
  `provenance[]` con `locator` (`inicio › contenido:h2`) y `excerpt` (el valor medido tal cual, p. ej.
  `rgb(242, 102, 33) · 19 caracteres`).
- Todo lo que no tenga evidencia **no se declara**: se lista en el informe como `rolesSinEvidencia`. Sin
  `developmentTasks` (el skill: un aspecto abierto no se convierte en tarea por inferencia).

### 5.3 Cómo se agrupan los valores en roles (no 31 colores sueltos)

Algoritmo determinista, sin modelo:

1. **Normalizar** a sRGB + alfa. El alfa no crea color nuevo: `rgba(0,0,0,.2)` es negro con 20 % (en el sitio se
   expresa con `color-mix`, como ya hace el transcriptor).
2. **Pesar el uso** con lo ya medido: caracteres de texto, superficie ocupada (`fondosPorArea`), apariciones en
   botones, bordes y degradados, y número de páginas distintas.
3. **Entra a la paleta** un color que cumpla cualquiera: ≥ 2 páginas o roles distintos, ≥ 1 % de la superficie,
   ≥ 3 % de los caracteres, o es color de un botón o enlace. Los demás **no se descartan**: van a una sola
   definición `observed` (`obs.colores-de-uso-puntual`) con valor, usos y sitio; **nunca se emite**. El
   transcriptor los lleva al color más cercano y los marca "fuera del set", como hoy.
4. **Neutro o institucional** por croma en OKLab (< 0,03 → `neutros`; si no, `institucionales`).
5. **Nombres**: si el perfil trae los de marca (Basis tiene los 12 del `theme.json`: «Naranja Basis», «Gris»…) se
   usan; si no, `neutro-<L%>` / `color-<tono°>-<L%>`. Los nombres se proponen y la persona los cambia: **cambiar
   un nombre cambia el slug, que cambia la variable**; por eso el diff de 3.6 los llama "renombradas".
6. **Roles de `dim1.req02`** sólo con evidencia inequívoca: `background` (fondo del cuerpo), `text` (texto
   dominante por caracteres), `accent` (color saturado dominante en botones/enlaces/títulos), `surface`
   (fondo de encabezado y pie por superficie). Los otros nueve (`border`, `action`, `info`, `success`, `warning`,
   `error`, `active`, `inactive`, `focus`) **no se asignan** sin evidencia: los dos rojos de Basis están en
   títulos, no en validaciones, y llamarlos `error` sería inventar.
7. **Familias** (`dim2.req01`): las cargadas y usadas, con su pila medida; `licencia` desde
   `catalogo/familias-google.json` (OFL) y `"sin verificar"` si no está.
8. **Espacio** (`dim3.req01`): `unidad` y `escala` por agrupamiento de los rellenos/márgenes/separaciones medidos
   con la tolerancia del perfil (por defecto ±1 px o ±3 %). **Nunca se descarta un valor**: si queda fuera de
   tolerancia, abre un escalón nuevo. La lista `escala` del Core es libre (`step ≥ 1`), así que cabe todo.
   Con los 48 valores distintos de Basis el resultado esperado es una escala de unas dos docenas de escalones, no
   de ocho; **ése es el costo de la fidelidad al píxel** (Q1).
9. **Radios, bordes, sombras, duraciones**: roles/escalones por la misma regla (radios: 6 valores distintos en
   Basis; grosores: 2; movimiento: se lee de `data-animation-*`, hoy sólo duración).
10. **Tipografía** (`dim2.req02`): agrupa las 20 combinaciones en los 9 roles del Core por heurística (h1 → `display`,
    h2 → `título`, h3/h4 → `subtítulo`, texto de párrafo → `cuerpo`, botones/campos → `control`, cita → `cita`,
    pie → `nota`, leyenda → `leyenda`). **Lo que no cabe** (14 tamaños contra 9 roles) queda en definiciones
    `observed` con el valor exacto y se informa. Es la tensión de Q1; el extractor no la resuelve, la expone.

### 5.4 Cómo confirma una persona

El extractor jamás emite `confirmed`. Para pasar de `proposed` a `confirmed` hace falta una persona. Dos vías:

- **Vía A (la correcta): Desktop.** Fase 6: "Abrir ADN" en `packages/desktop` — lee `design-contract.json` (o
  `design/model.json`), arma un `Sistema` con `capsulaAnterior` = el contrato (para que continúe el linaje:
  mismo `design.id`, `revision + 1`), y por cada definición con id `^(dim\d+\.req\d+)\.def\d+$` crea una
  `DesignSetEntryV0` (`requirementId`, `effectiveDefinitionId`, `payload = value`, `resolutionPath: 'insumo'`,
  `cicloDeVida: 'propuesta'`, `provenance.fuente: 'referente'`) y reconstruye `insumos[]` desde `sources[]`. La
  persona ve los candidatos con **muestra visual** (color, especimen), confirma o corrige, y Desktop exporta con
  `proyectarCapsula` el contrato en `revision + 1`. Trabajo estimado: una función de dominio con pruebas
  (`dominio/importar-adn.ts`) y un botón en `Inicio`. Es lo que cumple "la fuente del ADN es otra, pero el ADN
  sigue siéndolo".
- **Vía B (provisoria, sólo mientras A no exista): hoja de revisión + sello.** El extractor genera una hoja HTML
  de revisión con **muestras** (swatches, especímenes, escalones dibujados — nada de listas de hex, que el dueño
  rechazó: «no voy a poner un color que es un código, necesito mostrarlo»). Cuando el dueño lo dice en el chat, un
  guion `scripts/adn/confirmar-adn.mjs --por "Cristóbal Concha" --hoja <sha>` estampa `state: confirmed`,
  `authority: human-confirmed`, `reviewedAt` y una entrada `provenance {sourceId: "user", excerpt: "Confirmado el
  <fecha> tras revisar la hoja <sha256>"}`. **El agente nunca confirma por su cuenta**; sólo ejecuta el sello
  cuando el dueño lo dijo en la conversación. Es lo mismo que haría el clic de Desktop, con la misma huella.

### 5.5 Por qué el contrato desnudo y no el envoltorio

`parsePortableDesignModel` fija `provenance.producer === 'contope-design-desktop'` y exige URNs de paquete y
proyecto. Un extractor que emitiera el envoltorio **mentiría sobre quién lo produjo**. El contrato desnudo es
válido por `parseDesignContract`, lo acepta el plugin (formato A) y Desktop lo abre (vía A); al exportar,
**Desktop** emite el envoltorio con su propio nombre. No hace falta tocar el Core.

### 5.6 Vía alternativa con lo que Desktop ya tiene

`--formato tokens-w3c` escribe los fundamentos medidos como tokens DTCG. Desktop ya los incorpora como insumo y
produce `dim1.req01`, `dim2.req01`, `dim3.req01`. Pierde procedencia por valor y los roles, así que **no
reemplaza** a 5.4-A; sirve para un diseñador que quiera partir en Desktop sin el extractor.

### 5.7 "El mismo ADN sirve para otro destino"

El extractor no emite nada de WordPress: ni `--wp--*`, ni `theme.json`, ni slugs de bloques. Todo eso lo deriva el
plugin (3.6). Un ADN de Basis que se lleva a otro destino (impreso, otro CMS) sólo trae paleta, familias, escala,
roles, radios y variantes; la parte web es una proyección más.

---

## 6. Contenido como bloques de WordPress

### 6.1 Principios

1. **El contenido es de WordPress; la forma es del ADN.** `post_content` queda con bloques que cualquier tema lee.
2. **Ningún valor de diseño dentro del bloque.** Un bloque lleva a lo más: *slugs* de preset (`backgroundColor:
   "accent"`, `fontSize:"titulo"`, `style.spacing.padding.top:"var:preset|spacing|40"`) y `className:
   "is-style-<variante>"`. Un `style.color.background:"#dbd4c0"` (como en `legal-a-bloques.php`) se rechaza.
3. **Coherencia, no duplicación (regla 11).** Antes de cualquier módulo: ¿está en `wp-includes/blocks/`? Si está,
   se usa. `EQUIVALENCIA_GUTENBERG` del compilador ya declara `acordeon ↔ core/accordion` y `pestanas ↔ core/tabs`.
4. **El estilo vive donde el ADN lo proyecta**, en este orden: (a) estilos globales de `theme.json`
   (`styles.elements`, `styles.blocks`); (b) **variaciones de estilo** de bloque declaradas en el ADN
   (`dim9.req03`) — el contenido guarda sólo `is-style-x`; (c) atributos de preset del bloque; (d) módulo ContOpe
   (documento del lienzo) **sólo** para comportamiento sin bloque equivalente.
5. **Si una declaración no tiene atributo nativo ni variación**, el compilador falla con `ADN_NO_VARIATION` y dice
   qué variante falta. No se cae a CSS en línea.

### 6.2 Mapa nodo / módulo → bloque (las 5 páginas y las 2 regiones de Basis)

Conteos de nodos tomados de `scripts/basis/salida/*.componer.json`.

| Nodo / módulo | Aparece en | Bloque destino | Atributos semánticos que lleva | Dónde vive la forma | Por qué |
|---|---|---|---|---|---|
| `section` | inicio 5, carpas 1, FAQ 2, contactos 1, términos 1 | `core/group` (`tagName: section`, `align: full`, layout `constrained`) | `backgroundColor`/`gradient` por slug, `style.spacing.padding` por preset | variación `is-style-seccion-<x>` (ADN) | Es un contenedor con fondo y relleno. |
| `section` con foto o video de fondo y velo | inicio (portada, Características) | `core/cover` | `url`, `id`, `dimRatio`, `overlayColor`/`gradient` por slug, `minHeight`, `hasParallax`, `backgroundType` (image/video) | variación de `core/cover`; el desenfoque (`backdrop-filter`) va en la variación | `core/cover` ya resuelve fondo, velo, alto mínimo y video. |
| `group` con rejilla de columnas | 78 en total | `core/columns` + `core/column` (ancho en %) cuando son 2-4 columnas; `core/group` con `layout: grid` si es auto | `width` de la columna, `isStackedOnMobile` | `style.spacing.blockGap` por preset | Es la familia nativa de columnas. |
| `group` flex/apilado | mayoría | `core/group` (`layout: flex` / `default`) | `justifyContent`, `orientation` | — | Idem. |
| `heading` | 39 | `core/heading` | `level`, `fontSize` y `textColor` por slug | `styles.elements.h1..h6` (del rol tipográfico) | Título nativo. |
| `paragraph` | 94 | `core/paragraph` | `fontSize`, `textColor` por slug | `styles.elements`/`styles.blocks` | Texto nativo. |
| `list` (con sublistas) | 8 | `core/list` + `core/list-item` anidados | `ordered` | sangría por nivel en `styles.blocks['core/list']` (14 px / 20 px medidos, como valores del ADN) | Nativo; las sublistas son `innerBlocks`. |
| `button` | 3 | `core/buttons` > `core/button` | `url`, `text`, `backgroundColor`/`textColor` por slug | variación `is-style-boton-<x>` (relleno, radio, familia) | Nativo; `core/button` ya trae `fill`/`outline`. |
| `image` | 11 | `core/image` | `id` (adjunto vía `COD_Media_Attachment_Sync`), `sizeSlug`, `lightbox`, `href` | variación `is-style-foto-linea` (outline separado de 4 px), `rounded` | Nativo. |
| `link` que envuelve una imagen (PDF) | FAQ 4 | `core/image` con `href` y `linkDestination: media`, `linkTarget` | — | — | Un enlace a PDF con su ícono. |
| `video` (ambiente) | inicio 1 | `core/video` (`autoplay`, `muted`, `loop`, `playsInline`, `poster`) o `core/cover` si lleva velo | — | — | Nativo. |
| `separator` | FAQ 1 | `core/separator` | — | variación | Nativo. |
| `table` | términos 3 | `core/table` | `head`/`body`, `hasFixedLayout` | `styles.blocks['core/table']` | Nativo. |
| acordeón (`interaction: acordeon`) | inicio 1, FAQ 3 | `core/accordion` > `core/accordion-item` (`openByDefault`) > `core/accordion-heading` (`title`, `level`) + `core/accordion-panel` | `autoclose`, `showIcon`, `iconPosition` | variación de `core/accordion`; **ícono propio** (`etmodules-e050.svg`) como definición de activo del ADN (candidato `dim5` gráfica/marca: por verificar) | Es la familia nativa y los nombres de atributo ya coinciden. |
| `divisor` (forma de sección) | FAQ 1 | variación de `core/group` con máscara | — | máscara de forma (`dim4.req06`) | No requiere bloque nuevo. |
| `icono` (glifos de Opciones) | inicio 3 | `core/icon` (existe en 7.1.4) o `core/image` con SVG | — | — | A verificar si `core/icon` admite el SVG propio; si no, `core/image`. |
| `form` (Orugantt Forms) | contactos 1 | **`contope/formulario`** (propio) | `formSlug` | variables `--wp--custom--form--*` proyectadas de las variantes del ADN (reemplaza `form.theme`) | Core no tiene bloque de formulario. |
| `interaction: mapa` | contactos 1 | **`contope/mapa`** (propio, dinámico) | `lat`, `lng`, `zoom`, `fijo`, `mini` | variables del ADN | Core no tiene mapa. |
| `block` (`core/search`, `latest-posts`, `latest-comments`) | carpas 3 | los mismos bloques, **directos en `post_content`** | los de WordPress | partes por clase de Gutenberg | Desaparece el nodo `block` y su lista cerrada. |
| `header` / `footer` (regiones) | 2 | primero, siguen como regiones del lienzo (con el gate); luego **plantillas de parte** `header`/`footer` del tema (fase 11) | `core/navigation` + `core/navigation-link` para los 3 enlaces | ADN | Es cromo del sitio, no contenido de página. |
| `whatsapp` (botón fijo) | encabezado 1 | **`contope/whatsapp`** (propio, dinámico, en la parte `header`) | `mensaje`; el número sale de la opción (no del contenido) | variables del ADN | El número es configuración, no contenido. El vínculo puede apoyarse en `core/social-link` (`service: whatsapp`); el posicionamiento fijo es del módulo. |
| `link` fijo (ayuda → `/preguntas-frecuentes/`) | encabezado 1 | `contope/flotante` **sólo si** se confirma que no basta `position: sticky` de `core/group` | — | — | Se decide en fase 11; no bloquea las páginas. |

**Bloques propios que faltan construir (3):** `contope/formulario`, `contope/mapa`, `contope/whatsapp`.
Ya existen y **no se usan** en Basis: `contope/lienzo`, `contope/cuadrantes` + `contope/cuadrante`. Existe y **se
deprecia** (no se borra): `ocd/heading` — su propio archivo lo llama POC y duplica `core/heading`.

### 6.3 Qué queda en `post_content` y qué se ve sin el plugin

```
<!-- wp:contope/lienzo {"documentId":""} -->       ← envoltorio transitorio (regiones del lienzo); fase 11 lo elimina
  <!-- wp:group {"tagName":"section","className":"is-style-seccion-gris","backgroundColor":"gris", ...} -->
    <!-- wp:heading {"level":2,"fontSize":"titulo","textColor":"ink"} --> … <!-- /wp:heading -->
    …
<!-- /wp:contope/lienzo -->
```

| Situación | Resultado esperado (se mide en fase 8) |
|---|---|
| Plugin activo | Igual a hoy: ADN → `theme.json` + hoja → regiones + módulos. |
| **Plugin desactivado** | Los bloques core se dibujan; los presets y las variaciones **siguen estilados** porque viven en el `theme.json` generado y commiteado del tema. Se pierden: regiones del lienzo (hasta la fase 11), mapa, formulario y WhatsApp flotante. **Textos e imágenes, en orden y legibles.** Por verificar: que WordPress dibuje los hijos de un `wp:contope/lienzo` no registrado (hipótesis con prueba P8.2; si falla, se elimina el envoltorio antes). |
| **Cambio de tema** a uno de bloques estándar | Textos, imágenes, listas, tablas y pliegues se conservan y se ordenan. La apariencia depende del `theme.json` del tema nuevo. No se pide fidelidad visual. |

### 6.4 Herramientas de contenido

Tres herramientas MCP; el **contenido** y el **diseño** entran por puertas separadas:

- `cod_read_page_content(pageId)` → árbol de bloques (`parse_blocks`) + `contentRevision`.
- `cod_preview_page_content(pageId, expectedContentRevision, blocks[])` / `cod_apply_page_content(…, previewId)`:
  recibe un árbol `{name, attrs, innerBlocks, texto?}` de la **lista blanca** de la sección 6.2; valida los `attrs`
  contra el esquema del bloque registrado, pasa la **compuerta** (6.1.2), serializa con `serialize_blocks` y
  escribe `post_content` guardando antes una revisión de WordPress. `contentRevision` es un entero en meta
  `_cod_content_revision`.
- Un compilador del transcriptor produce `*.bloques.json` desde el mismo `*.componer.json` (6.5).

**Riesgo propio de este camino.** Para un bloque estático WordPress exige que el HTML guardado coincida con el
`save()` del bloque; si no, el editor lo marca "inválido". Por eso la fase 8 incluye una prueba que carga el
contenido generado en `@wordpress/block-library` de la versión de destino y exige validez del 100 % (sin
servidor; igual que el puente headless de Grapes, es una herramienta de desarrollo, no de runtime).

### 6.5 Reglas de diseño → atributos, paso a paso

El transcriptor ya produce reglas con `var()` (tras `b7b0478`). Para bloques, cada declaración se resuelve así:

| Declaración | Va a |
|---|---|
| `color`/`background-color` = `var(--wp--preset--color--X)` | `textColor` / `backgroundColor` = `X` |
| `font-size` = `var(--wp--preset--font-size--X)` | `fontSize` = `X` |
| `padding-*`/`margin-*`/`gap` = `var(--wp--preset--spacing--N)` | `style.spacing.*` = `var:preset|spacing|N` |
| `border-radius`, `box-shadow`, `outline-*`, `backdrop-filter`, `text-transform`… sin atributo nativo | **variación** declarada en el ADN (`dim9.req03`, `heredaDe`, `diferencia`); el bloque lleva `is-style-<x>` |
| geometría (anchos, columnas, `min-height`, `position`) | atributos nativos (`width` de `core/column`, `minHeight` de `core/cover`, `layout`) |

### 6.6 Relación con el plan de fases de agosto

(`wp-local/PLAN-gutenberg-migracion-fases.md`, `PLAN-arquitectura-bloques-gutenberg.md`)

| Fase de agosto | Qué pasa |
|---|---|
| Política "gradual, una sola fuente por página, el discriminador es `post_content`" (§1, §4) | **Se conserva.** |
| F0 registro y whitelist, F3 publicador híbrido (`standalone_template` sólo si hay shortcode) | **Se reusa**; `ocd/` → `contope/`. |
| F1 `ocd/heading` con `ocdEnhancements` (CSS y `style` en píxeles dentro del bloque) | **Se descarta.** `core/heading` basta, y los valores de diseño **no viven en el bloque** sino en el ADN. El campo `ocdEnhancements.style/css/grid` contradice la decisión actual. Se conserva la idea de `behavior` **sólo** para runtime sin bloque equivalente. |
| F2 puente GrapesJS ↔ bloques | **No hace falta para el MCP** (escribe bloques directo). Queda fuera de alcance. |
| F4 hojas `ocd/paragraph|button|list…` | **Se descarta:** son `core/*`. |
| F5 dinámicos ACF como atributo | **Se re-evalúa** contra el *Block Bindings API* de WordPress antes de construir; no se decide aquí. |
| F6 `ocd/section|row|column` | **Se descarta:** duplicaría `core/group|columns|column` (regla 11). |
| F7 "Guardar como módulo" | Pasa a **patrones sincronizados** + variantes del ADN. Fuera de este alcance. |
| F8 regiones sobre bloques | **Se mantiene** como fase 11 (plantillas de parte). |
| F9 portabilidad v2 y medios | Medios: ya hay `COD_Media_Attachment_Sync` y `wp ocd backfill-media-attachments`. Portabilidad: `designModel` se conecta en la fase 1b. |
| F10 migración on-demand con snapshot | **Es la fase 9** de esta especificación (por página, reversible). |

---

## 7. Basis de punta a punta

Todo se prueba primero en el espejo local (`wp-local-basis`, 8894) y se compara contra producción (regla 12 de
`CLAUDE.md`). El guion que existe hoy es `scripts/santaluisa/paridad-espejo-produccion.mjs`, hecho para Santa Luisa;
Basis **no tiene el suyo**: se crea en la fase 10 con el mismo molde y compara además `digest` y `revision` del ADN,
el sello del `theme.json` y el hash de `post_content` de las cinco páginas.

### 7.1 Construcción (local)

1. **Medición** (ya hecha: `entregables/basis/original/datos`, `medicion-3`).
2. **Extractor** → `adn/basis-web.contract.json` r1 (todo `proposed`) + informe + hoja de revisión.
3. **Confirmación** (5.4) → r2 con las definiciones confirmadas.
4. **Plugin 0.4.0** local (validador, almacén, proyección, compuerta en `observe`). Import de r2.
5. **Prueba de equivalencia (P2.1):** la paleta (12 slugs/hex), las 4 familias y `contentSize` proyectados son
   idénticos a los del `theme.json` actual. `definiciones-del-set.php` se retira; `perfil.json › tokens` se retira.
6. **Tema:** `contope-basis/theme.base.json` (estructura sin valores) + `cod_adn_export(theme-json)` →
   `theme.json`. Comparación visual: 0 diferencias de color y familia.
7. **Recomponer** las 5 páginas y 2 regiones con el registro del ADN (el transcriptor lee el registro en lugar de
   `tokens`). Compuerta en `enforce` local. El informe de ajuste lista cada valor que cayó en un escalón.
8. **Bloques:** el transcriptor emite `*.bloques.json`; se aplican a **copias** (`<slug>-bloques`, borrador) y
   se comparan con `comparar-vivo.mjs` contra el original y contra la versión de lienzo.
9. **Intercambio:** se cambia el `post_content` de las páginas reales; los documentos del lienzo quedan huérfanos
   (no se borran, como en `legal-a-bloques.php`).

### 7.2 Subida a producción (sin MCP arriba)

Orden y por qué ninguno deja el sitio sin estilos:

| # | Paso | Cómo | Invariante | Reversa |
|---|---|---|---|---|
| 0 | Precondiciones | verificar `wp core version` ≥ el que trae `core/accordion` y `core/tabs`; respaldo de base | — | — |
| 1 | **Plugin 0.4.0** | Administrador de archivos, «Overwrite», chmod 0644 | Sin ADN → modo `off` → **comportamiento idéntico al 0.3.85** (P2.5). Cero cambio visual. | subir el 0.3.85 |
| 2 | **Tema con `theme.json` generado** | zip del tema | La paleta/familias son **las mismas** (P2.1); el sello `adn` es sólo metadato. Si se subió antes que el ADN, sigue estilado. | zip anterior |
| 3 | **ADN r2** | pantalla de wp-admin «Diseño (ADN)» (misma validación y diff); alternativa: filas SQL del CPT `cod_adn` y de `cod_adn_activa` por el método de diferencias | La proyección sobrescribe `cod_theme_definitions` con valores **iguales**; se verifica `themeJson: sincronizado` y `themeDefinitions: sincronizado`. Si la proyección dejara sin valor un rol que hoy tiene valor, el import se aborta. | reimportar r1 como r3 |
| 4 | Modo `observe` | wp-admin | Informa, no rechaza. | `off` |
| 5 | **Regiones** (encabezado, pie) recompuestas | SQL por filas (postmeta del documento + `cod_disenos_hojas`) | Mismas reglas, mismo CSS resuelto | filas anteriores |
| 6 | **Páginas** en bloques, **una por una**, la más simple primero (términos → FAQ → carpas → contactos → inicio) | SQL de `wp_posts.post_content` | Cada una se compara en vivo antes de pasar a la siguiente | restaurar `post_content` (shortcode) |
| 7 | `ratchet` → `enforce` cuando `cod_adn_audit` es 0 | wp-admin | — | bajar el modo |

Ningún paso depende de uno posterior: (a) el tema siempre lleva la paleta; (b) el plugin nuevo sin ADN no cambia
nada; (c) el ADN llega con valores iguales; (d) las páginas se cambian al final. Y un import **no puede quitar una
variable en uso** (3.6).

---

## 8. Fases

Cada fase es chica, termina en algo que se puede correr y tiene una prueba de aceptación **medible**.

| Fase | Contenido | Prueba de aceptación |
|---|---|---|
| **F0 — Corpus y decisiones** | `scripts/exportar-corpus-adn.ts` en Core; registrar los pedidos al Core (Q1, correspondencia de color con el almacén plano). | P0.1 el corpus tiene ≥ 1 caso inválido por cada `return null` de los dos parsers (se cuenta por inspección). |
| **F1 — Validador y almacén** | `COD_ADN_Validator`, CPT, puntero, `cod_adn_get`, `preview_import`, `apply_import`, pantalla de wp-admin, capacidades honestas. | P1.1 PHP y TS coinciden 100 % en el corpus. P1.2 import de Basis r1 → `revision: 1` y `digest` = sha256 del JSON canónico. P1.3 mismo archivo → `unchanged`; misma revisión → `ADN_REVISION_NOT_NEWER`; otro `design.id` → `ADN_DESIGN_ID_MISMATCH`. P1.4 `confirmed` con `deterministic-extraction` → rechazado (R1). |
| **F1b — Paquete `.ocdsite`** | el importador pasa `entrypoints.designModel` al mismo `apply`. | P1b.1 el fixture `fixtures/package-v1/valid/desktop-interchange` deja un ADN activo con su `design.id`. |
| **F2 — Proyección única** | `COD_ADN_Projection`, filtro `wp_theme_json_data_theme`, escritura de `cod_theme_definitions`, `COD_Design_Core` lee sólo ADN, Configuración de sólo lectura, `cod_adn_export`. | P2.1 con un ADN derivado del `theme.json` actual de Basis, `wp_get_global_settings()` da la **misma** paleta (12 slugs) y las mismas 4 familias (diff vacío). P2.2 `COD_Design_Core::faltantes() == []`. P2.3 cambiar `accent` en el ADN (r+1) cambia `--cod-color-accent`, `--wp--preset--color--accent`, el color del botón del `theme.json` y `color_accent` **en un solo import**, sin editar otro archivo. P2.4 Configuración rechaza editar `color_accent`. P2.5 sin ADN, la salida del plugin es **idéntica byte a byte** a la 0.3.85 en las 5 páginas. |
| **F3 — Auditoría y modo `observe`** | `COD_ADN_Gate` (sólo medir), `cod_adn_audit`, `adnGate` en la evidencia. | P3.1 sobre el local de Basis, el audit reproduce el guion de la sección 2.5 (espaciado 262/48, tipografía 26/8, radio 23/6, borde 11/2, color 0, familia 0). P3.2 en `observe`, aplicar una composición con un literal **no** se rechaza y aparece en la evidencia. |
| **F4 — Compuerta `ratchet` / `enforce` en todos los caminos** | `is_css_length` acepta variables del registro; enganches de 4.3; mensajes de 4.4; `cod_adn_set_mode`. | P4.1 `color:"#F26621"` → `ADN_LITERAL_COLOR` con la sugerencia `var(--wp--preset--color--accent)`. P4.2 `properties{padding-top:"9.8px"}` → `ADN_LITERAL_SPACING` con los dos escalones vecinos. P4.3 `cod_patch_css` que cambia un `var()` por `#F26621` → rechazado. P4.4 `cod_write_canvas_document` con +1 literal → rechazado. P4.5 `ratchet`: reaplicar hoy las 7 composiciones de Basis sin cambios pasa con `nuevas: 0`; agregar un literal falla. P4.6 `var(--no-existe)` → `ADN_VAR_UNKNOWN`. P4.7 una regla que referencia una definición `proposed` fuerza `status: proposed` y `cod_publish_canvas_page` se rechaza. P4.8 `expectedDesignRevision` distinto de la activa → `ADN_REVISION_STALE`. |
| **F4b — Valores del motor** | resolver `shadow sm/md/lg`, `button.size`, `tone`, zebra, caja de formulario y defaults de WhatsApp **por el ADN, sin respaldo**; inventario del cromo del motor. | P4b.1 `grep` de `rgba(`/`#hex`/`rem`/`px` dentro de `button_css`, `surface_css`, `table_css`, `form_css`, `media_css` no encuentra valores de diseño de sitio (la lista de excepciones del motor está escrita y justificada). P4b.2 sin sombras en el ADN, `shadow: "md"` → `ADN_NAME_UNRESOLVED`, no pinta nada. |
| **F5 — Extractor** | `scripts/adn/medicion-a-adn.mjs`, informe, hoja de revisión. | P5.1 dos corridas dan el mismo SHA-256. P5.2 el resultado pasa `parseDesignContract` (barrera de Node) y el validador PHP. P5.3 **cobertura**: cada uno de los 31 colores medidos aparece en la paleta propuesta **o** en `obs.colores-de-uso-puntual`; 0 perdidos; ídem los 14 tamaños de letra. P5.4 la paleta tiene entre 11 y 16 colores (los 11 exactos ya adoptados más los de uso real). P5.5 el 100 % de las definiciones tiene `evidenceSourceIds` no vacío y ≥ 1 `provenance` con `locator`. P5.6 ninguna definición sale `confirmed` ni con autoridad distinta de `deterministic-extraction`. |
| **F6 — Desktop abre un ADN** (repo Core) | `dominio/importar-adn.ts` y botón en `Inicio`. | P6.1 abrir el `contract.json` del extractor muestra las propuestas con muestra visual; confirmar tres definiciones y exportar produce `revision + 1` con el mismo `design.id` que `parseDesignContract` **y** el validador PHP aceptan. P6.2 `typecheck` y pruebas del Core en verde. |
| **F7 — Transcriptor sobre el ADN** | `componer.mjs` lee el registro (`cod_adn_get` o archivo) en vez de `perfil.json › tokens`; informe de ajuste. | P7.1 con la compuerta en `enforce` local, `aplicar.mjs` pasa en las 5 páginas y 2 regiones sin violaciones. P7.2 `comparar-vivo.mjs`: 0 diferencias de familia y color; diferencias de tamaño y espaciado **sólo** las del informe de ajuste (lista cerrada, sin otras). |
| **F8 — Contenido en bloques** | `COD_Block_Content`, tres herramientas, bloques `contope/formulario|mapa|whatsapp`, registro de variaciones desde el ADN. | P8.1 el contenido generado de las 5 páginas es válido en `@wordpress/block-library` de la versión de destino (100 %). P8.2 **plugin desactivado**: `inicio` entrega la **misma secuencia** de textos e imágenes que la composición (comparación de secuencias), sin errores PHP. P8.3 con un tema de bloques estándar activo: misma secuencia de textos/imágenes/listas/tablas. P8.4 `core/paragraph` con `style.color.text:"#FF0000"` → `ADN_LITERAL_COLOR`; con `textColor:"accent"` → aceptado. P8.5 una variación declarada en el ADN aparece en el selector de estilos del editor y se guarda como `is-style-<x>`. |
| **F9 — Basis en bloques (local)** | 7.1 pasos 7-9. | P9.1 `comparar-vivo` contra el original en 1440/768/393: mismos resultados que el baseline (0 diferencias de texto e imagen, altos ±0-3 px). P9.2 `auditoria-sitio.mjs` 5×3 sin problemas. |
| **F10 — Producción** | 7.2. | P10.1 en cada paso del cuadro: verificación visual y `auditoria-sitio.mjs` en vivo sin problemas. P10.2 guion de paridad de Basis (nuevo, con el molde de `scripts/santaluisa/paridad-espejo-produccion.mjs`): mismo `digest`, `revision`, modo y hashes de `post_content`. |
| **F11 — Cromo y otros sitios** | encabezado/pie como plantillas de parte; eliminar el envoltorio `contope/lienzo`; extractor sobre el `theme.json` de Santa Luisa y de Econut → `observe`. | P11.1 sin plugin, Basis mantiene encabezado y pie. P11.2 el `cod_adn_audit` de cada sitio queda registrado con su línea base. |

---

## 9. Riesgos y preguntas abiertas

### 9.1 Preguntas que sólo el dueño puede resolver

**Q1. Fidelidad al píxel o sistema normalizado — en tipografía.** `dim2.req02` enumera 9 roles
(`enumOf(...CORE_ROLES_9)`) y exige cubrir los 9. Basis mide 14 tamaños de letra en 20 combinaciones; en espacio,
color, radios, bordes y duraciones el Core admite listas libres y **todo cabe** (la escala de espacio de Basis
quedaría de ~2 docenas de escalones). En tipografía no.
Opciones: **(a)** abrir `dim2.req02` en el Core a roles adicionales con nombre libre manteniendo los 9
cubiertos (hay precedente: en `dim4.req01` «la lista queda ABIERTA por D12: lo cerrado es el SET (lo que el diseñador declaró es todo lo que hay), no el vocabulario que el manifiesto acepta»); es un
cambio de manifiesto en versión menor; **(b)** normalizar Basis a 9 roles: varios títulos cambian de tamaño
(p. ej. 55 → 50, 42 → 40, 30 → 28), con el desvío escrito en el informe de ajuste.
**Recomendación: (a)**, porque la migración se pidió "visualmente idéntica al original" y la armonización (b) es
una decisión de diseño que se hace después, en Desktop, con muestras a la vista, no por un umbral del extractor.

**Q2. Cómo confirma el dueño mientras Desktop no abra un ADN.** Vía A (esperar la fase 6) o vía B provisoria
(hoja de revisión + sello que ejecuto cuando tú lo digas en el chat, con huella). **Recomendación:** hacer las
dos: la fase 6 en paralelo, y la B sólo para Basis, con la hoja y su sha256 guardados como evidencia.

### 9.2 Decisiones técnicas ya tomadas (con su razón)

| Decisión | Razón |
|---|---|
| Validación en PHP + corpus + barrera Node | El hosting no tiene Node; un schema no expresa las invariantes. |
| Contrato desnudo como formato de intercambio del extractor | El envoltorio obliga a declararse `contope-design-desktop`. |
| Una sola sintaxis de referencia (`var()`), id por registro | Cambiar el esquema de cada `kind` costaría más y no agrega información. |
| Sin excepciones ni "proponer valor" desde el MCP | El conjunto es cerrado; lo contrario es el defecto del issue #9. |
| Compuerta sobre el MCP, no sobre el editor humano | Es lo que pidió el dueño; la edición humana se mide en el audit. Revisable. |
| `observed` nunca se emite | Skill `leer-contrato-de-diseno`: es evidencia, no definición. |
| El ADN en CPT + opción, no en archivos | Viaja con el método de subida SQL y conserva historial. |
| El `theme.json` es artefacto generado y commiteado + filtro de respaldo | La apariencia de bloques core sobrevive al plugin apagado. |
| Íconos propios del sitio = activos del ADN | Evita volver a `url()` suelto en un bloque. Requisito de `dim5` por confirmar. |

### 9.3 Riesgos

| Riesgo | Mitigación |
|---|---|
| Deriva entre el validador PHP y el parser del Core | Corpus compartido en las dos cadenas; barrera de Node cuando hay Core. |
| `core/accordion`/`core/tabs` no existen en el WordPress de producción | Precondición medible del paso 0 de 7.2; si falla, esas dos secciones quedan en lienzo. |
| El HTML guardado de un bloque no coincide con su `save()` | Prueba P8.1 contra `@wordpress/block-library` antes de aplicar nada. |
| Los *slugs* derivados de nombres cambian al renombrar | El diff separa "renombradas" y el import se rechaza si rompe referencias. |
| Una escala de espacio de ~2 docenas de escalones no es un "sistema" | Es el costo explícito de la fidelidad; la armonización posterior la reduce con muestras. |
| Un `value` con forma no prevista por el plugin | R2 lo rechaza con la ruta; R4 guarda sin emitir lo que la web no consume. |
| Hay requisitos que no leí aún (`dim4.req03/04`, `dim8.req02/04`, contenedores de `dim3`) | La fase 2 empieza leyéndolos; el mapeo de sombra, borde, movimiento y ancho queda como borrador hasta entonces. |
| Cromo del motor con valores propios (`lightbox`, placeholder) | Inventario en F4b; fuera de la compuerta con la razón escrita. |
| La edición humana en el wp-admin reintroduce literales | `cod_adn_audit` la mide; una notificación de admin lista las nuevas. |

---

## Anexo A — Reglas del validador a portar

De `parseDesignContract` (`design-contract.ts`):
`schemaVersion === 1`; `design.id` texto no vacío, `design.revision` entero ≥ 1, `createdAt`/`updatedAt` fechas
ISO; `sources`/`definitions` listas; **fuente**: `id`, `technicalKind`, `label` no vacíos, `purpose ∈ {observation,
guideline}`, `importedAt` fecha, `locator`/`path` (si vienen) no vacíos; ids de fuente únicos y distintos de `'user'`;
**definición**: `id`, `category`, `name` no vacíos, `authority ∈ {human-confirmed, approved-guideline,
deterministic-extraction, model-proposal}`, `state ∈ {observed, proposed, confirmed, rejected}`,
`evidenceSourceIds[]` y `constraintDefinitionIds[]` de textos no vacíos, `provenance[]` con `sourceId` no vacío y
`locator`/`excerpt` opcionales no vacíos, `reviewedAt` fecha si viene; ids únicos; `evidenceSourceIds` ⊆ fuentes
declaradas y **sin `'user'`**; `provenance[].sourceId` ⊆ fuentes ∪ `{'user'}`; `constraintDefinitionIds` ⊆ ids de
definiciones; **tareas**: `developmentTasks` lista; `id`, `definitionId` no vacíos; `state ∈ {active, proposed,
resolved, rejected}`; listas sin repetidos; `(state === resolved) ⇔ resolvedDefinitionId` presente; `proposed` exige
candidatas; `resolved` exige que `resolvedDefinitionId ∈ candidateDefinitionIds`; toda referencia existe; ids de
tarea únicos; `projections.designMd` es `null` o `{path: 'DESIGN.md', revision ≥ 1, generatedAt}`.

De `parsePortableDesignModel` (`design-contract-portable.ts`): claves **exactas** `schemaVersion, kind, design,
transport, provenance, contract, designMd`; `schemaVersion === 1`, `kind === 'contope/design-model'`;
`transport` = `{package:{id ~ /^urn:ocd:package:[A-Za-z0-9._-]+$/, revision ≤ 128}, project:{id ~
/^urn:ocd:project:[A-Za-z0-9._-]+$/, name ≤ 200}}`; `provenance` = `{producer:'contope-design-desktop',
producerVersion ≤ 40 ~ VERSION_RE, exportedAt RFC 3339}`; `design` duplicado igual a `contract.design`;
`designMd` = `{path:'design/DESIGN.md', revision === contract.design.revision, content}` (la igualdad del
contenido **no** se porta, 3.2).

## Anexo B — Códigos de error nuevos

Import: `ADN_INVALID`, `ADN_DESIGN_ID_MISMATCH`, `ADN_REVISION_NOT_NEWER`, `ADN_STALE_BASE`,
`ADN_CONFIRMED_WITHOUT_HUMAN`, `ADN_PAYLOAD_SHAPE`, `ADN_SLOT_CONFLICT`, `ADN_REF_BROKEN`, `ADN_TOO_LARGE`.
Compuerta: `ADN_LITERAL_COLOR|FONT|SIZE|FINE|SPACING|RADIUS|BORDER|SHADOW|MOTION|MEASURE`, `ADN_VAR_UNKNOWN`,
`ADN_VAR_REJECTED`, `ADN_NO_DEFINITION`, `ADN_NAME_UNRESOLVED`, `ADN_NO_VARIATION`. Revisión y publicación:
`ADN_MISSING`, `ADN_REVISION_STALE`, `ADN_PUBLISH_BLOCKED_PROPOSED`. Todos viajan por el `tool_error` existente
(`code`, `message`, `details`).

## Anexo C — Qué comprobé y cómo (para reproducirlo)

| Dato | Comando / archivo |
|---|---|
| Parsers y sus reglas | lectura de `ContOpeDesign-Core/packages/core/src/design-contract*.ts` |
| Desktop no importa | `grep -rn "parsePortableDesignModel\|model.json\|parseDesignContract" packages/desktop/{src,electron}`; lectura de `persistencia.ts`, `capsula.ts`, `puente/tipos.ts` |
| Nadie emite `model.json` | `grep -rn createPortableDesignPackageContribution` sobre el repo del Core |
| Payloads por requisito | `packages/core/src/requirement-manifest/manifest-v0-dim{1,2,3,4,8,9}.ts` |
| Plugin: compuerta, vías sin validar, valores del motor | `class-cod-canvas-mcp-service.php` (herramientas y `call_tool`), `class-cod-canvas-mcp-recipe-compiler.php` (validadores, `button_css`, `surface_css`…) |
| Páginas de muestra sin documento | `node:sqlite` de sólo lectura sobre `wp-local-econut/.../database.sqlite`, `wp_posts` 68 y 72 |
| Bloques disponibles y atributos | `wp-local-basis/wordpress/wp-includes/blocks/*/block.json` (WordPress 7.1.4) |
| Reglas y nodos de Basis | guion de una pasada sobre `scripts/basis/salida/*.componer.json` (por nodo: `kind`; por regla: `kind`; por declaración `properties`: clase por nombre de propiedad, sin `var()` y distinta de `0|auto|none|inherit|initial|normal`) |
| Colores y tamaños medidos | `entregables/basis/original/secciones.json` (31 colores distintos), `IDENTIDAD.md` (33 entradas de rol, 20 combinaciones, 14 tamaños), `scripts/basis/salida/tokens.json` (11 exactos, 15 aproximados, 7 fuera del set) |

**Lo que no verifiqué y queda declarado:** la versión de WordPress de producción; el contenido de `dim4.req03/04`,
`dim8.req02/04` y los requisitos de contenedores de `dim3`; si `core/icon` admite SVG propios; si WordPress dibuja
los hijos de un bloque no registrado (`contope/lienzo` con el plugin apagado); si Desktop tolera varias definiciones
por requisito (`.def1`, `.def2`) en una revisión importada.
