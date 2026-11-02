# Formato de paquete portable `.ocdsite` v1

> Estado: **contrato verificable e implementado en el plugin** (fase F1b, ver §10).
> Las secciones 1 a 9 definen y verifican el contrato; la §10 dice qué lee y qué
> escribe hoy el plugin (exportar e importar por ContOpe Design → Portabilidad).

Este documento es la especificación del contenedor `.ocdsite` versión 1 y reemplaza
a `docs/package-format-v0.md` para el paquete completo. El contrato v0 (nodos del
recorrido ContOpe Design → Gutenberg) sigue vigente para el documento de
**contenido** que vive dentro de este contenedor.

- Esquema JSON estricto (draft 2020-12): [`../schemas/manifest-v1.schema.json`](../schemas/manifest-v1.schema.json)
- Chequeo focalizado: `npm run check:package` → [`../scripts/check-package-v1.mjs`](../scripts/check-package-v1.mjs)
- Fixtures: [`../fixtures/package-v1/`](../fixtures/package-v1/) (un caso válido de Santa
  Luisa y casos inválidos representativos).

## 1. Cinco ámbitos que el paquete distingue

Un `.ocdsite` NO es un blob opaco. El manifiesto distingue cinco ámbitos
diferentes, cada uno con su propio propósito, ciclo de vida y reglas. Esta
distinción es **requisito de aceptación** del contrato:

| Ámbito                       | Dónde vive en el ZIP           | Rol en `files[]`     | Qué es y qué no es                                                                                          |
|------------------------------|--------------------------------|----------------------|-------------------------------------------------------------------------------------------------------------|
| **1. Manifiesto**            | `manifest.json` (raíz del ZIP) | — (autoreferente)    | Índice, identidad, revisión, requisitos, entrypoints, inventario, hashes y capacidades. No es contenido.   |
| **2. Contenido**             | `content/`                     | `content`            | Grafo de páginas y bloques editables (el documento v0: `schemaVersion: 0`, páginas, nodos). Es lo que el editor modifica. |
| **3. Tema hijo**             | `themes/<proyecto>/`           | `theme-config`, `theme-stylesheet`, `template`, `part`, `fonts` | Tokens visuales, `theme.json`, `style.css`, templates, parts y fuentes del proyecto. Identidad visual administrada. |
| **4. Estado WordPress en BD**| `wordpress/`                   | `wordpress-state`    | Modificaciones del Editor del Sitio almacenadas en base de datos: global styles user, navegación, asignación de página de inicio y patterns guardados. **No** es contenido ni tema; es estado editorial persistido en la BD. |
| **5. Activos**               | `assets/`                      | (arreglo `assets[]`) | Medios y binarios (imágenes, video, fuentes como bytes) con ID OCD estable, MIME, tamaño y SHA-256.        |

La separación existe para que importar un paquete pueda decidir, por ámbito, qué
se sobrescribe, qué se preserva y qué se versiona, sin mezclar identidad visual
con contenido editorial ni con estado de base de datos.

> Tras la separación del tema padre Canvas, el tema hijo de Santa Luisa sólo
> aporta `templates/index.html` y las `parts/` del proyecto; `front-page.html` y
> `page.html` viven en el tema padre `contope-canvas`. El fixture válido
> refleja exactamente eso.

## 2. Contenedor `.ocdsite`

Un `.ocdsite` es un archivo ZIP con codificación portable y `manifest.json` en su
raíz. El nombre del contenedor es un convenio de extensión; la **identidad** real
es el `package.id` del manifiesto, no el nombre del archivo ni ningún slug.

```
santa-luisa-de-palpi.ocdsite (ZIP)
├── manifest.json            # ámbito 1
├── content/pages.json       # ámbito 2
├── themes/santa-luisa/...   # ámbito 3 (tema hijo)
│   ├── theme.json
│   ├── style.css
│   ├── templates/index.html
│   └── parts/{header,footer}.html
├── wordpress/state.json     # ámbito 4
└── assets/                  # ámbito 5
    ├── banner-familia.jpg
    ├── aerial-0174.jpg
    └── fonts/Inter.woff2
```

El fixture `fixtures/package-v1/valid/santa-luisa/manifest.json` es un ejemplo
fiel de este layout para Santa Luisa de Palpi.

## 3. Manifiesto `manifest.json`

Esquema: `https://contope.org/schemas/package/manifest-v1.schema.json`
(`$schema` dentro del documento, draft 2020-12).

Campos de primer nivel (todos requeridos salvo `$schema`):

- **`formatVersion`** *(entero, `const` 1)*: versión del formato de paquete.
  Es independiente del `schemaVersion` 0 del grafo de contenido v0.
- **`package`**: identidad de **esta revisión** del paquete.
  - `id` *(URN `urn:ocd:package:<opaco>`)*: identificador estable y opaco de la
    revisión del paquete. **Nunca un slug de WordPress.** Distinto del proyecto y
    del sitio: un proyecto tiene muchas revisiones de paquete.
  - `revision` *(cadena)*: revisión inmutable del contenido (timestamp, semver
    u opaco). Permite detectar reimportaciones del mismo paquete.
  - `createdAt` *(fecha-hora, opcional)*.
- **`project`**: identidad del **proyecto** ContOpe Design al que pertenece el
  paquete. Identidad estable entre revisiones; distinta de la identidad del
  paquete y de la del sitio.
  - `id` *(URN `urn:ocd:project:<opaco>`)*: identificador estable, opaco e
    inmutable del proyecto.
  - `name` *(cadena)*: nombre humano del proyecto.
- **`origin`**: procedencia.
  - `producer` *(p. ej. `contope-publisher`)* y `producerVersion`
    *(requeridos)*.
  - `siteId` *(URN `urn:ocd:site:<opaco>`, opcional)*: identificador estable del
    sitio WordPress de origen. Distinto del proyecto.
  - `siteUrl` *(URI absoluta, opcional)* y `exportedAt` *(fecha-hora, opcional)*.
- **`requirements`**: versiones mínimas requeridas para reconstruir con
  fidelidad. Los tres son requeridos:
  - `canvas` (ContOpe Canvas / tema padre), `publisher` (plugin),
    `wordpress` (versión mínima de WordPress). Patrón semver-like.
- **`entrypoints`**: referencias con nombre hacia el inventario `files[]`.
  - `content` y `theme` requeridos; `wordpressState`, `designModel`,
    `desktopSource` e `idml` opcionales. Los tres últimos son puntos de
    intercambio con ContOpe Design Desktop (modelo de diseño, fuente de proyecto
    e IDML para *round-trip* de diseño); **no** se exigen en un paquete sólo
    WordPress como el de Santa Luisa.
  - Cada valor **debe** resolverse a un `files[].path` y los valores **deben**
    ser únicos. `manifest.json` no se lista como entrypoint: vive siempre en la
    raíz del ZIP, por convención.
- **`files[]`**: inventario de archivos no-activos.
  - `path` *(ruta portable)*, `role` *(enum)*, `size` *(bytes ≥ 0)*,
    `sha256` *(64 hex minúsculas)*.
  - Roles: `manifest`, `content`, `wordpress-state`, `theme-config`,
    `theme-stylesheet`, `template`, `part`, `pattern`, `navigation`, `fonts`,
    `design-model`, `desktop-source`, `idml`, `readme`, `other`.
- **`assets[]`**: medios y binarios.
  - `id` *(URN `urn:ocd:asset:<opaco>`)* estable, `path`, `mime`, `size`,
    `sha256`. Los IDs deben ser únicos y las rutas únicas globalmente con
    `files[]`.
- **`capabilities`**: necesidades declaradas en tiempo de ejecución, para que
  un importador pueda **rechazar con explicación** en vez de descartar datos en
  silencio.
  - `blockEditor`, `fullSiteEditing`, `localFonts`, `networkAccess` *(booleans,
    requeridos)* y `requiredBlocks[]` *(nombres de bloque únicos)*.
  - `localFonts: true` y `networkAccess: false` son los valores recomendados en
    v1: el sitio debe funcionar sin fuentes de red ni IA.

El esquema usa `additionalProperties: false` en todos los objetos y declara
`$schema` como `const` exacta del `$id` canónico. Cualquier campo desconocido
invalida el manifiesto; esto rechaza también, a nivel estructural, **symlinks
declarados** (campos como `symlink`/`target`) y un `$schema` ajeno
(`SCHEMA_ID_MISMATCH`), para que un manifiesto no pueda reclamar silenciosamente
conformidad a otro contrato.

> **No es una garantía de secretos.** `additionalProperties:false` sólo rechaza
> campos **desconocidos**; **no** detecta secretos codificados dentro de campos
> **permitidos** (un `path`, `sha256`, `name` o `revision` podría codificar un
> secreto). Tampoco inspecciona código ejecutable. La política de secretos y de
> código ejecutable es responsabilidad del empaquetador/importador (véase §7).

## 4. Reglas de ruta portable

`portablePath` (`schemas/$defs/portablePath`) exige:

- POSIX: sólo barras `/` como separador.
- Relativa: sin barra inicial, sin letra de unidad (`C:\`).
- Normalizada: sin segmentos `.` o `..`, sin segmentos vacíos (`//`, barra
  final), y `posix.normalize(p) === p`.
- Sin barras invertidas.
- Cada segmento comienza con un carácter alfanumérico (sin dotfiles, sin
  espacios, sin guion inicial que pueda confundir flags).

Esto prohíbe traversal y rutas ambiguas antes de tocar el ZIP. La verificación
es sobre la **ruta declarada** en el manifiesto; véase §6 para los límites que
requieren inspeccionar el ZIP.

## 5. Integridad e identificadores

- **IDs únicos**: cada `assets[].id` es único; `package.id` es único por
  definición. Los IDs OCD son URN opacas, no slugs.
- **Dominios distintos y deliberados**: `package.id` (`urn:ocd:package`),
  `project.id` (`urn:ocd:project`), `origin.siteId` (`urn:ocd:site`) y
  `assets[].id` (`urn:ocd:asset`) son dominios separados: el paquete no es el
  proyecto ni el sitio. Usar el dominio equivocado se rechaza con su propio
  código (`PACKAGE_ID_FORMAT`, `PROJECT_ID_FORMAT`, `SITE_ID_FORMAT`,
  `ASSET_ID_FORMAT`).
- **Rutas únicas globales**: no puede haber rutas repetidas dentro de `files[]`,
  dentro de `assets[]`, ni compartidas entre ambos. La unicidad es además
  **insensible a mayúsculas**: dos rutas que difieran sólo en caja (p. ej.
  `content/Pages.json` y `content/pages.json`) se rechazan con
  `DUPLICATE_PATH_CASE`, porque en sistemas de archivos insensibles a mayúsculas
  (Windows, macOS por omisión) colisionarían al extraer el ZIP.
- **Hashes**: `sha256` es 64 hex minúsculas (formato). Tamaño entero ≥ 0.
- **Referencias sin duplicados**: los valores de `entrypoints` son únicos y
  cada uno resuelve a un `files[].path`.
- **Correspondencia entrypoint → rol**: cada entrypoint resuelto debe apuntar al
  rol que le corresponde: `content`→`content`, `theme`→`theme-config`,
  `wordpressState`→`wordpress-state`, `designModel`→`design-model`,
  `desktopSource`→`desktop-source`, `idml`→`idml`. La violación se emite como
  `ENTRYPOINT_ROLE_MISMATCH`.
- **`$schema` exacta**: si el campo opcional `$schema` está presente, debe ser
  exactamente el `$id` canónico; un valor ajeno se rechaza con
  `SCHEMA_ID_MISMATCH`.
- **Formatos verificados de verdad**: `createdAt`, `exportedAt` (palabra clave
  `format: date-time`) y `siteUrl` (`format: uri`) se validan con ajv-formats
  como aserciones, no como meras anotaciones.

Los fixtures válidos muestran estas reglas satisfechas. Cada fixture inválido
declara el conjunto exacto de errores que debe producir; algunas reglas pueden
coexistir de forma inevitable, como una referencia duplicada que además apunta
al rol equivocado.

> Los valores `sha256` de los **fixtures** son placeholders de formato
> (digestos reales de semillas derivadas de la ruta declarada), no digestos de
> los bytes reales del ZIP. El empaquetador debe recalcularlos al cerrar el
> `.ocdsite`; el importador debe verificarlos al extraer.

## 6. Lo que el esquema NO promete (límites)

El esquema valida el **documento manifiesto**. No puede inspeccionar los bytes
del ZIP, por lo que **no promete** las siguientes protecciones; éstas son
responsabilidad del empaquetador/extractor y se documentan como límites
recomendados:

- **ZIP traversal**: el esquema sólo puede validar las rutas **declaradas**. Un
  ZIP malicioso podría contener entradas no listadas en el manifiesto, o
  entradas con `..`. El extractor debe usar una biblioteca que rechace rutas
  fuera del directorio de destino, ignorar entradas no listadas en el
  manifiesto y nunca sobrescribir fuera de la raíz.
- **ZIP bomb**: el esquema valida `size` (descomprimido) declarado, no la
  relación de compresión ni el total acumulado. El extractor debe imponer un
  tamaño total y un ratio máximos.
- **MIME engañoso**: el esquema valida la **forma** del MIME declarado, no que
  los bytes coincidan con ese tipo. El importador debe sniffar/confiar según su
  política de subida a la biblioteca multimedia.
- **Archivos excesivos**: el esquema no limita la cardinalidad de `files[]` ni
  `assets[]`. El extractor debe imponer un máximo de entradas.
- **Veracidad del hash**: el esquema valida el **formato** del digesto, no que
  coincida con los bytes. La verificación contra bytes reales es obligación del
  empaquetador (al cerrar) y del importador (al abrir).
- **Secretos y código ejecutable**: el esquema no detecta secretos dentro de
  campos permitidos ni inspecciona código (p. ej. PHP) declarado con un rol/path
  válido. Política recomendada en §7.

## 7. Secretos y código ejecutable (política recomendada, no implementada)

El contrato de manifiesto **no** inspecciona bytes ni código. Estas dos
exposiciones quedan fuera del esquema y son política del empaquetador/importador:

- **Secretos.** `additionalProperties:false` sólo rechaza campos **desconocidos**.
  Un campo **permitido** (p. ej. `path`, `sha256`, `name`, `revision`) podría
  codificar un secreto y pasar el contrato. El empaquetador debe evitar incluir
  secretos; el importador debe **escanearlos** según su política antes de
  persistir rutas, nombres o estados en la BD o en la biblioteca multimedia, y
  nunca loguear valores sospechosos. Esta verificación **no** la implementa el
  contrato.
- **Payload ejecutable (RCE).** Archivos como `functions.php` u otros `.php` /
  `.phtml`, o binarios ejecutables, pueden producir **ejecución remota de
  código** al instalar o activar un tema/plugin. El manifiesto **no** inspecciona
  código; sólo declara `role` y `path`, lo que basta para decidir la política sin
  *sniffar* bytes. Política recomendada para el futuro importador: **rechazar
  código ejecutable por defecto** (p. ej. cualquier `path` `.php`/`.phtml` bajo
  `themes/` o `wordpress/`, o binarios ejecutables nativos), **salvo** paquete
  confiable/verificado (firma o origen verificable) o una *allowlist* explícita
  del operador. Esta política **no** la implementa este contrato; queda para la
  fase de importación.

## 8. Chequeo focalizado

`scripts/check-package-v1.mjs` valida el contrato con un motor estándar: el
esquema JSON draft 2020-12 se compila con **Ajv 2020** (`ajv`, MIT) más
**ajv-formats** (`ajv-formats`, MIT). Así las palabras clave `format`
(`date-time`, `uri`) y los `pattern` se hacen cumplir de verdad y no son una
aproximación escrita a mano. Ajv se configura en modo `strict` y `allErrors`.

Estas dos bibliotecas son **dependencias sólo de desarrollo (MIT)** y nunca las
carga el plugin ni el tema en producción; sólo se ejecutan en este *toolchain*
local de chequeo. La licencia y la necesidad quedan documentadas en
`package.json` (`//devDependencies`). No se añade ninguna dependencia *runtime*:
el sitio funciona sin ellas.

Sobre la validación estructural de Ajv, el chequeo añade una capa de
**referencias cruzadas** que un JSON Schema no puede expresar solo: resolución de
entrypoints, **correspondencia entrypoint → rol**, unicidad global de rutas,
**colisión insensible a mayúsculas** entre rutas, IDs de activo únicos y
referencias de entrypoint únicas. Los errores de Ajv se traducen a códigos
estables para que las expectativas de los fixtures no dependan de los internos de
Ajv.

Ejecución:

```
npm run check:package
```

Salida: una línea por fixture indicando `PASS`/`FAIL`, el resultado esperado y
los códigos de error producidos, y un resumen final. El proceso termina con
código distinto de cero ante cualquier regresión (esquema que no compila, un
caso válido que produce errores, o un caso inválido que no produce el código
esperado).

**Guard estricto de negativos.** Un caso `invalid` declara en su `case.json` un
arreglo `expectedErrors`. El chequeo exige que el **conjunto único** de códigos
producidos sea **exactamente** ese conjunto: no basta con la mera inclusión del
código principal, y ningún error espurio puede pasar. Las repeticiones del mismo
código (p. ej. dos `PATH_NOT_NORMALIZED`) se aceptan (se deducen). Los casos
`valid` deben producir cero errores.

Códigos de error estables que puede emitir el validador. La matriz de fixtures
de §9 cubre las reglas actualmente contratadas; los códigos de forma estructural
permanecen disponibles para manifiestos mal tipados y futuras ampliaciones:
`SCHEMA_ID_MISMATCH`, `FORMAT_VERSION`, `MISSING_REQUIRED`, `UNKNOWN_FIELD`,
`PATH_NOT_NORMALIZED`, `DUPLICATE_PATH`, `DUPLICATE_PATH_CASE`, `DUPLICATE_ID`,
`INVALID_SHA256`, `INVALID_SIZE`, `INVALID_MIME`, `UNRESOLVED_REFERENCE`,
`DUPLICATE_REFERENCE`, `ENTRYPOINT_ROLE_MISMATCH`, `PACKAGE_ID_FORMAT`,
`PROJECT_ID_FORMAT`, `SITE_ID_FORMAT`, `ASSET_ID_FORMAT`, `INVALID_DATE_TIME`,
`INVALID_URI`, `INVALID_REVISION`, `INVALID_NAME`, `INVALID_PRODUCER`,
`VERSION_FORMAT`, `INVALID_ROLE`, `INVALID_BLOCK`, `DUPLICATE_BLOCK`,
`NOT_OBJECT`, `NOT_ARRAY`, `NOT_BOOLEAN`, `MANIFEST_NOT_OBJECT`, `INVALID_JSON`.

Códigos *fallback* (violación estructural sin código dedicado, posible al añadir
futuros campos al esquema): `SCHEMA_PATTERN`, `SCHEMA_MINIMUM`, `SCHEMA_LENGTH`,
`TYPE_MISMATCH`, `INVALID_FORMAT`, `SCHEMA_VIOLATION`.

## 9. Fixtures

Ver [`../fixtures/package-v1/README.md`](../fixtures/package-v1/README.md). Hay
dos casos válidos: Santa Luisa de Palpi (cinco ámbitos, tema hijo post-split
Canvas) y un caso de **intercambio con Desktop** que incluye los entrypoints
opcionales `designModel`/`desktopSource`/`idml` y los roles
`pattern`/`navigation`/`fonts`. Los casos inválidos cubren, cada uno bajo el
guard estricto de `expectedErrors`: `$schema` ajena, versión de formato (valor y
tipo), campos requeridos, campos desconocidos (raíz y anidados), dominios de
identidad (package/project/site/asset), correspondencia entrypoint→rol, ruta
absoluta, traversal, barras invertidas, rutas duplicadas (exactas e insensibles a
mayúsculas), IDs duplicados, digesto mal formado, tamaño negativo, MIME inválido,
fecha-hora inválida, URI inválida, versión mal formada, rol inválido, booleano
esperado, bloque duplicado, productor/nombre/revisión vacíos, referencia sin
resolver, referencia duplicada, symlink declarado y JSON mal formado.

## 10. Implementación en el plugin (F1b)

El plugin ya EXPORTA e IMPORTA este formato (`COD_Site_Package_Exporter`, `COD_Site_Package_Importer`, el lector
`COD_Site_Package_Format`), por la pantalla de wp-admin «ContOpe Design → Portabilidad» y por WP-CLI
(`wp ocd export-site` / `wp ocd import-site`). Es la vía de producción: se exporta en el local y se importa en la
web. Lo que pasa por cada ámbito:

- **Contenido** (`entrypoints.content`, `content/pages.json`, esquema propio `contope/site-content` v1): las páginas, de
  dos clases. Una página del lienzo viaja como `kind: "canvas"` (su `documentId`; en el destino vuelve a ser el
  shortcode `[contope_canvas …]`). Una página EN BLOQUES viaja como `kind: "blocks"` y su `post_content` va tal cual en
  un archivo propio (`content/pages/NNN-slug.html`, rol `content`) con su sha256 en `files[]`. Además: los documentos
  del lienzo que referencian, TODAS las regiones (encabezado, cuerpo, pie), la plantilla global, los estilos
  compartidos y la lista de medios (ruta real relativa a uploads + sha256). Un documento de contenido v0
  (`schemaVersion: 0`) NO es este esquema: lo importa otra herramienta (ContOpe Design → Importar).
- **Diseño** (`entrypoints.designModel`, `design/model.json`): el ADN activo, en el envoltorio `contope/design-model`.
  El importador lo entrega al MISMO apply del almacén que usan la pantalla «Diseño (ADN)» y el MCP
  (`COD_ADN_Store::aplicar`): misma validación, mismo diff, misma atomicidad. Si no hay ADN activo, el paquete no
  lleva `designModel`. `provenance.producer` es siempre `contope-design-desktop` (el único valor que acepta
  `parsePortableDesignModel`): es la procedencia del modelo, la del paquete va en `origin.producer`.
- **Estado de WordPress** (`entrypoints.wordpressState`, `wordpress/state.json`, `contope/wordpress-state`): cómo se
  aplicó el ADN (`emitirPropuestas` sí se respeta; el `modo` de la compuerta es informativo y NO se aplica) y qué
  página es la portada (por slug; sólo se fija si el destino aún no eligió una).
- **Tema** (`entrypoints.theme`): el `theme.json` del tema activo, como referencia. El importador no lo aplica.
- **Activos** (`assets[]`): los medios que las páginas, los documentos y las fuentes citan. Dentro del ZIP se llaman por su
  hash (`assets/<sha256>.<ext>`) porque las rutas portables no admiten `@`, espacios ni tildes; la ruta real viaja en
  `content/pages.json`. Se deduplican por contenido.

El importador REVISA todo antes de escribir nada (manifiesto, sha256 de lo que lee, requisitos del plugin y de WordPress,
bloques que hacen falta, documentos saneados, la compuerta del diseño, el ADN y las páginas) y recién entonces escribe:
primero el ADN, luego los medios (a archivos temporales ya verificados), los documentos y las páginas. Sólo lee y verifica
los archivos que usa: el resto del inventario se ignora. Rechaza rutas fuera de la raíz, enlaces simbólicos y bombas de
compresión.

**H9.** Una página en bloques no se convierte jamás en shortcode, y una página en bloques editada en el sitio de destino
no se pisa: si el paquete trae una página que allí ya está en bloques con un contenido distinto del que dejó la última
importación (`_cod_package_content_sha`), el paquete ENTERO se rechaza con `cod_package_block_page_edited` y no se
escribe nada. Se puede pedir el reemplazo expreso (casilla de la pantalla, `--reemplazar-editadas` en WP-CLI). Un
paquete que trae como página del lienzo una página que allí ya es de bloques se rechaza siempre
(`cod_package_would_revert_block_page`), sin excepción.

Los paquetes del esquema anterior (`schemaVersion` + `pages`/`documents`, sin `formatVersion`) se siguen importando.

## 11. Pendientes fuera de alcance

El esquema del manifiesto (secciones 1 a 9) sigue sin inspeccionar bytes: lo hace el plugin (§10).
Siguen pendientes, y fuera del plugin: el *round-trip* con ContOpe Design Desktop de `desktopSource` e `idml`
(el importador del plugin los ignora), la firma o verificación de origen del paquete (§7: el importador no escanea
secretos ni código ejecutable más allá de no leer lo que el manifiesto no declara) y aplicar el `theme.json` del paquete
al tema de destino (depende de la proyección del ADN, fase F2).
