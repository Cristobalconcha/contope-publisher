# Correcciones a la especificación tras la auditoría de Aymara (01-nov-2026)

Auditoría hostil de `ESPEC-adn-unica-puerta-y-bloques.md` hecha por Aymara (Dot de OpenAI)
sobre Publisher `9b08f88` y Core `6115353` (master de GitHub, lo más reciente: las ramas de
octubre sólo agregan `design-set/dim3-fixture.ts`). Cada hallazgo se verificó después contra
el código real, con archivo:línea, por tres revisiones independientes.

**Resultado: 12 confirmados, 2 parciales (10 y 14), 0 falsos.** Veredicto que se acepta:
el objetivo (ADN como única fuente del diseño, contenido en bloques) se mantiene; hay que
rehacer cómo se hace cumplir.

Nota de versión: la copia local de Core estaba en `c3a96f3` (19-sep), 9 commits atrás. La
espec se escribió contra esa copia. Los archivos citados son idénticos en ambas. La copia
local ya se adelantó a `6115353`.

Leyenda de decisiones: **[D]** = decidido aquí con criterio conservador (regla 4 de CLAUDE.md),
reversible; **[C]** = decisión de Cristóbal, la espec la deja como pregunta abierta.

---

## Contrato 1 — Qué ve el público y cómo se activa

### H1 (crítico, confirmado y agravado) — bloquear «publicar» no protege nada
- `apply_canvas_composition` (`class-cod-canvas-mcp-service.php:395-458`) guarda sobre las
  mismas meta que lee `render_shortcode` (`class-cod-canvas-page-publisher.php:1707-1738`);
  no hay revisión publicada separada. Las regiones se resuelven en vivo (1731, 1790-1799).
- Agravantes: publicar una página ya pública devuelve `alreadyPublished` sin revisar nada
  (`page-publisher.php:1179-1185`); la hoja compartida junta documentos con
  `post_status => 'any'` (`class-cod-diseno-hoja.php:193-197`): una propuesta en un BORRADOR
  entra a la hoja que cargan las páginas públicas.
- **[D] Corrección:** el rechazo va en la ESCRITURA, no en la publicación. En `enforce`,
  preview/apply/patch/write rechazan toda referencia a una definición `proposed` cuando el
  objetivo está publicado, es una región, o aporta a una hoja compartida que carga alguna
  página pública. Las propuestas sólo viven en un documento de ensayo que no aporta a ninguna
  hoja pública. (Se descarta por ahora la alternativa de una «revisión publicada» separada:
  es más grande y se puede agregar después; queda anotada.)
- Prueba nueva: aplicar una propuesta → lo que recibe un visitante (HTML+CSS servidos) no
  cambia, en página pública, región y página borrador que comparte hoja.

### H5 (alto, confirmado) — la atomicidad no está resuelta
- `COD_Theme_Definitions::get()` lee la opción en vivo (`class-cod-theme-definitions.php:193-212`),
  usada por `class-cod-design-core.php:294`, `class-cod-settings-admin.php:160` y el propio
  emisor. El orden «CPT → proyecciones → puntero» deja ver proyección nueva con puntero viejo.
- Bloqueo sólo por documento (`repository:630-680`). Carrera: compile valida contra r2,
  import r3, apply guarda lo validado contra r2. En escrituras crudas la revisión se compara
  en `target()` (servicio 1552-1605) ANTES del bloqueo; `save()` no la recompara.
- **[D] Corrección:** proyecciones guardadas por revisión (`cod_adn_proj_r<N>`); el puntero
  `cod_adn_activa` es lo único que se lee en tiempo de ejecución, así que moverlo es la única
  escritura que cambia lo visible. Bloqueo global de diseño: el import lo toma exclusivo, cada
  escritura de documento lo toma compartido; `expectedDesignRevision` y la revisión del
  documento se recomparan DENTRO del bloqueo, justo antes de guardar, en todas las vías
  (también `save()` crudo). `cod_theme_definitions` pasa a ser proyección derivada leída por
  el puntero; su escritura directa queda prohibida fuera de la proyección.
- Pruebas: fallo inyectado entre escrituras (lo visible queda en la revisión anterior entera);
  import y apply/patch concurrentes (el que llega con revisión vieja se rechaza).

## Contrato 2 — Datos tipados y dependencias

### H6 (alto, confirmado) — el Core no tiene valores de sombra ni variantes tipadas
- `dim4.req04` (`manifest-v0-dim4.ts:384-423`) sólo trae rol/nivel/stacking/oclusión; su
  propio `mappingNotes` lo llama «BRECHA DECLARADA». `dim4.req05` (436-474) es política de
  efectos. `dim9.req03.diferencia` es TEXTO (`manifest-v0-dim9.ts:345`) y `arquetipo` es una
  lista abstracta, no un bloque.
- **Corrección:** la espec dice explícitamente que hoy el Core no puede expresar sombras con
  valores ni variantes con datos. F4b (presets de sombra) y F8 (variaciones de bloque) quedan
  BLOQUEADAS hasta que el Core tenga: (a) un requisito con escala de sombras tipada
  `{nombre, x, y, desenfoque, expansión, color→ref}`; (b) diferencia por variante tipada
  `propiedad → valor|ref`, más correspondencia arquetipo → familia de bloque. Hasta entonces,
  una sombra o variante pedida da `ADN_NAME_UNRESOLVED`; nunca se interpreta prosa ni se
  inventa un valor en el adaptador.
- **[C] Pregunta Q3:** ¿se abren esos dos requisitos en el Core? Tocan la taxonomía del set
  de diseño, que es de Cristóbal. Para Basis hoy: la sombra/variantes que usa el sitio, ¿se
  dejan fuera hasta entonces (quedan como hueco declarado) o se espera?

### H7 (alto, confirmado) — validar la forma no valida las dependencias
- `payload.ts:71-80` sólo comprueba la forma `{refReqId, refPath}`; `adapter.ts:81-94` sólo
  que exista una entrada; `resolveRefValue` (136-177) recorre la ruta sin mirar el estado.
  `refReqId` nombra un requisito, no una definición: con `.def1` y `.def2` es ambiguo.
- **[D] Corrección — regla R6 del destino:** toda referencia dentro de `value` debe resolver
  en el mismo contrato (requisito existe, `refPath` llega a un valor del tipo esperado, sin
  ciclos); el estado efectivo de una definición es el MÍNIMO de su estado y el de todas sus
  dependencias (rechazada/inexistente bloquea; propuesta contagia: un rol confirmado que
  apunta a una paleta propuesta se trata como propuesto); referencia a un requisito con varias
  definiciones = ambigua, se rechaza. Códigos `ADN_REF_UNRESOLVED`, `ADN_REF_STATE`,
  `ADN_REF_AMBIGUOUS`. Se declara regla del destino, no del Core.

### H13 (medio, confirmado) — la paridad 100 % PHP/TS es imposible como está escrita
- El portable exige igualdad de `designMd.content` (`design-contract-portable.ts:233-237`,
  prueba 132-137) y la espec dice que PHP no la comprobará. El Core mapea `fact`/`restriction`
  a `deterministic-extraction` con estado `confirmed` (`design-contract.ts:350-373`, prueba
  456-463) y R1 lo rechaza — o sea, R1 rechaza contratos que el propio Core produce (p. ej.
  restricciones legales activas).
- **[D] Corrección:** separar tres capas con expectativas propias: (1) compatibilidad del
  parser (paridad exacta con el Core, incluida la igualdad de DESIGN.md: se PORTA); (2)
  validación semántica del Core (paridad exacta); (3) política del destino (R1, R2, R6:
  divergencias deliberadas, con su resultado escrito). Corpus en `core/` y `destino/`. P1.1 =
  100 % en capas 1 y 2. R1 admite `deterministic-extraction` para `restriction` confirmada
  (lo legal no lo confirma una persona del proyecto); para el resto de definiciones
  confirmadas sigue exigiendo autoridad humana o pauta aprobada. Ningún caso incómodo se saca
  del corpus.

### H14 (medio, parcial) — una pendiente `value: {}` haría caer el import
- Desktop genera pendientes con `value: {}` (`capsula.ts:103,127`) y `design-contract.ts:480,485`
  siempre escribe `value`: el caso «ausente» que R2 tolera nunca ocurre; llega `{}`, que no
  cumple los campos obligatorios. La espec no decía que el rechazo fuera del contrato entero,
  pero con import atómico lo sería.
- **[D] Corrección R2:** `value` ausente o `{}` = «declarada y sin resolver» (igual que una
  apuntada por una `developmentTask` abierta): se guarda, no se emite, va a `ignored[]`. R2
  rechaza la forma incorrecta sólo en definiciones `confirmed` (falla el import) o en
  `proposed` que se vayan a emitir (falla esa definición). Prueba: tarea pendiente de color y
  de tipografía se conserva y no aparece como diseño resuelto.

## Contrato 3 — Inspección completa de las entradas

### H2 (alto, confirmado) — se puede redefinir una variable gobernada
- `normalize_properties_rule` (`recipe-compiler.php:3073-3121`) acepta cualquier `--[a-z0-9-]+`
  con valor libre (salvo `{};<>\@`, `url(`, etc.). La espec clasifica por nombre de propiedad;
  una `--*` no cae en ninguna clase. Lo mismo por `cod_patch_css` y `cod_write_canvas_document`.
- **[D] Corrección:** nueva clase `declaracion-de-variable`. Quedan RESERVADOS los nombres del
  registro y los prefijos `--wp--preset--`, `--wp--custom--`, `--wp--style--` y `--cod-*`: sólo
  los escribe la proyección del ADN (`ADN_VAR_RESERVED` en todos los caminos, en cualquier
  ámbito, @media o selector). Una `--*` local hereda la clase de su valor (un literal de color
  en `--x` es violación). Una variable local usada en `var()` debe estar en el registro o
  declararse en la misma regla. Se inspeccionan también los fallbacks de `var(--a, #123)`.
  Aceptación: valor CALCULADO en el navegador igual al del ADN, no sólo que el nombre exista.

### H3 (alto, confirmado) — projectData y atributos SVG quedan fuera del barrido
- `write_canvas_document` (servicio 1296-1320) guarda projectData, HTML y CSS por separado;
  `sanitize_project_data` (`sanitizer.php:257-296`) no mira estilos; el editor carga projectData
  como fuente del CSS (`cod-editor-core.js:1645-1664`), así que un literal escondido ahí
  reaparece al guardar desde el editor. La lista blanca admite `fill`, `stroke`, `stop-color` y
  en `text/tspan` `font-family`, `font-size`, `font-weight`, `letter-spacing` (`sanitizer.php:545-560`).
- **[D] Corrección:** el delta se calcula sobre CSS + `style=""` + atributos de presentación SVG
  (mapeados a su clase) + `styles` de projectData. En `cod_write_canvas_document` se exige que
  el CSS derivado de projectData coincida con el CSS enviado; si no, rechazo. La excepción de
  edición humana en el editor no blanquea valores que entró antes el MCP: se marca su origen.
  Prueba: literal sólo en projectData → rechazo; ciclo MCP → editor → guardado → público sin
  literal nuevo.

### H4 (alto, confirmado y agravado) — el inventario de referencias mira un registro que se borra
- `repository::save()` vacía `META_COMPOSITION` (`class-cod-canvas-document-repository.php:413`);
  lo llaman todos los parches MCP (geo, WhatsApp, patch_css, write, grapes_edit_node,
  sync_project_data, patch_html), el editor, el publicador y el importador.
- Agravante: `COD_Diseno_Hoja::regenerar` sólo incluye documentos con composición
  (`class-cod-diseno-hoja.php:103-106`): un documento parchado deja de aportar reglas a la hoja.
- **[D] Corrección:** la integridad referencial recorre lo efectivamente servido: CSS guardado
  y `style=""` de TODOS los documentos y regiones (sin depender de `META_COMPOSITION`),
  `styles` de projectData, `attrs` e `is-style-*` de los bloques en `post_content` de todas las
  páginas y estados, partes del tema, y las hojas generadas. Además se arregla la regeneración
  de la hoja para que no pierda documentos parchados (defecto existente, independiente).
  Prueba: composición con variable → patch_css legítimo → import que quita la variable = rechazo.

## Contrato 4 — Ida y vuelta sin pérdidas

### H8 (alto, confirmado y agravado) — el regreso a Desktop pierde información
- `persistence.ts:91-93` rechaza dos entradas con el mismo `requirementId`. Al exportar,
  `capsula.ts:98,109` rehace la procedencia (se pierden `locator` y `excerpt` medidos), `:163`
  pone toda fuente como `observation`, `design-contract.ts:493` deja `constraintDefinitionIds: []`.
- Agravante: una propuesta sin aprobar con `resolutionPath: 'insumo'` vuelve como `fact` →
  `deterministic-extraction` / `observed` (`capsula.ts:92-96`, `design-contract.ts:351,375-381`):
  se pierde el estado `proposed`. Las `obs.*` no entran al patrón de importación y desaparecen.
- **[D] Corrección:** el extractor emite UNA definición efectiva por requisito; alternativas y
  observaciones se conservan aparte (no como entradas del set). La importación a Desktop
  conserva procedencia original, `purpose`, `constraintDefinitionIds`, estado `proposed` y las
  `obs.*` intactas, y la fusión sólo aplica lo que la persona cambió. Esto ES trabajo del Core
  (capsula/persistence), no «un botón y una función»: la fase se reestima. Prueba P6.1:
  importar → exportar sin tocar → comparación campo a campo idéntica (sources, provenance,
  constraints, estados, obs.*).

### H9 (alto, confirmado y agravado) — exportar/importar devuelve la página al lienzo
- Exportador (`class-cod-site-package-exporter.php:112-138`) elige por `_cod_canvas_document_id`
  y no lleva `post_content`; importador (`class-cod-site-package-importer.php:216-224`) escribe
  SIEMPRE el shortcode. Exige `schemaVersion==1` + `pages/documents` (54-58); `entrypoints` y
  `designModel` no aparecen en ningún PHP. El otro importador exige `schemaVersion: 0`.
- Agravante: `fixtures/package-v1/valid/desktop-interchange/` no trae `design/model.json`: la
  prueba P1b.1 no se puede correr como está escrita.
- **[D] Corrección:** F1b es un lector NUEVO del manifiesto `formatVersion`/`entrypoints`, que
  convive con el esquema `pages/documents`. Exportador e importador distinguen página Canvas de
  página en bloques, transportan `post_content` y medios completos, y rechazan sobrescribir una
  página en bloques con el shortcode. Se completa la carpeta de ejemplo con un `design/model.json`
  real. Prueba: migrar → editar en Gutenberg → exportar → importar → ediciones intactas byte a byte.

## Contrato 5 — Migración, reversa y pruebas que fallen de verdad

### H10 (alto, parcial) — la frase sobre la plantilla es falsa
- La plantilla se elige por el metadato `_cod_canvas_document_id`, no por el shortcode
  (`page-publisher.php:1916-1927`); «sólo si hay shortcode» era una propuesta de agosto
  (`wp-local/PLAN-gutenberg-migracion-fases.md:78,249`) nunca construida. `templates/canvas-document.php:12-19`
  imprime sólo `the_content()`.
- Parcial: mientras el contenido vaya dentro de `wp:contope/lienzo`, su `render.php` llama a
  `salida_con_regiones()` y la página conserva encabezado y pie. El fallo aparece al quitar el
  envoltorio con el metadato puesto, o al pasar encabezado/pie a partes del tema.
- **[D] Corrección:** corregir la frase; construir de verdad el discriminador (página en bloques
  → plantilla del tema; sólo `[contope_canvas` → plantilla Canvas); migrar metadato y plantilla
  con reversa explícita. Requisito de F11. Prueba: encabezado, pie y navegación con plugin
  activo, apagado y con cambio de tema. Ojo: `scripts/econut/legal-a-bloques.php:165` lee
  `_cod_document_id`, otro metadato; no usarlo como molde.

### H11 (alto, confirmado y agravado) — apagar el plugin rompe también theme.json
- `contope-basis/style.css:33-56` y `cookies.css:13` usan `--cod-color-*` / `--cod-font-*`, que
  sólo define el plugin (`class-cod-design-core.php:77-83`, `class-cod-theme-definitions.php:297-315`,
  inyectado en `page-publisher.php:1690`). Con el plugin apagado esas propiedades quedan sin
  valor y, con la misma especificidad, ANULAN también fondo, texto y fuente de theme.json.
- **[D] Corrección:** las hojas del tema consumen directamente `--wp--preset--*` /
  `--wp--custom--*` (no `--cod-*`); si un alias hace falta, lo declara el propio tema en su
  theme.json generado. El theme.json se regenera con cada revisión activada del ADN (uno viejo
  no es respaldo). P8.2: con el plugin desactivado, estilos CALCULADOS de body y títulos = ADN,
  legibilidad comprobada, y `grep var(--cod-` en `contope-basis/*.css` = 0.

### H12 (alto, confirmado) — pruebas que quedan verdes sin probar
- `scripts/basis/auditoria-sitio.mjs`: acordeones sólo si hay `[data-cod-acordeon-rol]` (100),
  formulario sólo si hay `.ofr-form` (141-142), bloques sólo si hay `[data-cod-bloque]` (157-158):
  con bloques nativos, 0 coincidencias = salto silencioso.
- `scripts/basis/comparar-vivo.mjs`: 4 páginas (falta términos), original = producción (que ya es
  ContOpe y que F10 cambia), tolerancias de 4-6 px y 10 % (no ±0-3), y siempre termina en 0.
- **[D] Corrección:** inventario esperado por página (cuántos acordeones, formularios, bloques…);
  0 donde se espera >0 = FALLO. Selectores de bloques nativos (`.wp-block-accordion*`,
  `.wp-block-search`…) y pruebas funcionales (abrir/cerrar, enviar). Referencia original
  CONGELADA del Divi (`entregables/basis/original/`), 5 páginas × 3 anchos, tolerancias
  escritas y respetadas por el guion, salida con error fuera de criterio. Se mantienen las
  regresiones Canvas propias de Santa Luisa y Econut (`scripts/santaluisa/auditoria-sitio.cjs`,
  paridad espejo-producción): probar sólo Basis no prueba que ellos sigan iguales.

---

## Preguntas abiertas para Cristóbal (se suman a Q1 y Q2 de la espec)

- **Q1** (sigue): abrir en el Core los 9 roles tipográficos.
- **Q2** (sigue): confirmación provisoria del ADN con hoja de revisión y sello.
- **Q3** (nueva, H6): abrir en el Core la escala de sombras tipada y la diferencia de variantes
  tipada; mientras tanto, qué pasa con las sombras/variantes de Basis.
- **Colores fuera del set** (siguen): los 7 colores de Basis sin equivalente en la paleta.

## Qué cambia en el plan

Antes de cualquier fase de construcción se cierran los cinco contratos de arriba en la espec.
F4b y F8 quedan bloqueadas por Q3. F6 se reestima como trabajo del Core. La espec corregida
vuelve a auditoría de Aymara (disponible hasta el 20-nov) antes de construir.
