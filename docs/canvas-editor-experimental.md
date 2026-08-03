# Open CoDesign Canvas (Experimental) — slice vertical del editor

Pantalla de administración aislada que edita **un** documento experimental con
GrapesJS y lo persiste en WordPress. No es un page builder: no publica páginas,
no genera bloques Gutenberg y no interviene en el importador de paquetes.

## Qué hace

1. Registra `Herramientas → Open CoDesign Canvas (Experimental)` con capacidad
   `manage_options`.
2. Carga GrapesJS **0.23.4** desde `open-codesign-publisher/assets/vendor/grapesjs`
   con `plugins_url()`. Sin CDN y sin ninguna petición de red.
3. Acepta HTML y CSS pegados o cargados desde archivo (lectura en el navegador,
   nunca subida) y los vuelca en el lienzo.
4. Permite editar el lienzo con el conjunto mínimo de bloques `Open CoDesign`
   (sección, dos columnas, título, párrafo, imagen, botón).
5. Lee estilos efectivos desde el iframe del lienzo y muestra su procedencia
   (selector y variables CSS). Los cambios pueden aplicarse sólo al elemento o
   a una clase reutilizable.
6. Reconoce contenedores CSS Grid y ofrece presets como `1/2/1`, proporciones
   libres, gap, reglas responsive y manejadores arrastrables.
7. Modela el cambio de navegación al hacer scroll como comportamiento
   declarativo `scroll-threshold`, sin aceptar JavaScript arbitrario.
8. Guarda y reabre el documento contra WordPress mediante `admin-ajax.php` con
   nonce y comprobación de capacidad en cada petición.
9. Exporta HTML autosuficiente —CSS y runtime declarativo incluidos— o CSS por
   separado desde el navegador.

## Fidelidad del CSS

GrapesJS no conserva necesariamente toda declaración que todavía no comprende;
por ejemplo, puede normalizar o descartar un `border-radius` expresado mediante
`var()`. Por eso `_ocd_canvas_css` contiene dos capas delimitadas por
`OCD-CANVAS-EDITABLE-OVERRIDES`:

1. CSS fuente preservado literalmente, que sigue siendo la autoridad visual.
2. CSS editable producido por GrapesJS, que contiene las modificaciones del
   usuario y puede sobrescribir la primera capa.

El lienzo vuelve a inyectar la primera capa tras cada carga de frame o proyecto.
Así el inspector ve los valores reales y una reapertura no degrada el diseño.

## Entidad y ID estable

| Concepto | Valor |
| --- | --- |
| Post type | `ocd_canvas_doc` (privado: `public`, `publicly_queryable`, `show_ui` y `show_in_rest` en `false`) |
| ID estable del documento | `ocd-canvas-experimental-0001` |
| Meta de identidad | `_ocd_canvas_document_id` |
| Datos estructurados | `_ocd_canvas_project_data` (JSON canónico del `projectData` de GrapesJS) |
| HTML | `_ocd_canvas_html` |
| CSS | `_ocd_canvas_css` |
| Revisión | `_ocd_canvas_revision` (entero monótono) |
| Marca temporal | `_ocd_canvas_updated_at` (ISO-8601 UTC) |

El documento se localiza **siempre** por su ID estable mediante `meta_query`,
nunca por slug ni por el ID numérico del post, que es un detalle interno de cada
instalación. El post se crea en estado `draft` y nunca se publica. Las tres
representaciones viven en metas separadas: el HTML no es el `post_content` y el
CSS no se mezcla con el HTML.

## Seguridad

- **Capacidad**: `manage_options` en el registro del menú, en el render, en el
  encolado de assets y como primera sentencia de cada endpoint AJAX.
- **Nonce**: acción `ocd_canvas_editor`, emitida con `wp_create_nonce()` y
  verificada con `check_ajax_referer()` justo después de la capacidad.
- **Metas**: registradas con `auth_callback` que exige `manage_options` y con
  `show_in_rest => false`.
- **Entrada**: todo `$_POST` pasa por `isset()` y `wp_unslash()`. El módulo no lee
  `$_GET`, `$_REQUEST`, `$_COOKIE` ni `$_SERVER`.

## Saneamiento y validación

| Representación | Regla | Límite |
| --- | --- | ---: |
| HTML | `wp_kses` sobre el conjunto `post` de WordPress más etiquetas estructurales. Los iframe sólo admiten embeds HTTPS de Google Maps, YouTube/YouTube No-Cookie y Vimeo. `script`, `style`, `object`, `embed`, `form`, `input`, `select` y `textarea` se retiran. Las etiquetas fuera de la lista **se rechazan con `WP_Error`** en vez de descartarse en silencio. | 2 MB |
| CSS | Rechaza `<`, `javascript:`, `vbscript:`, `expression(`, `@import`, `behavior:`, `-moz-binding` y `data:text/html`; valida el esquema de cada `url()` (relativo, `http(s)` o `data:image/*`). | 512 kB |
| `projectData` | Debe ser un objeto JSON válido con profundidad acotada; si trae `pages`, debe ser una lista. Se reencodifica de forma canónica. | 4 MB |

`safecss_filter_attr` se amplía temporalmente (filtro `safe_style_css` añadido y
retirado dentro del propio saneamiento) con propiedades de maquetación como
`display`, `flex-*`, `grid-*` y `gap`, que el lienzo necesita en atributos
`style`.

La configuración que consume el navegador se inyecta con `wp_add_inline_script()`
y `wp_json_encode(..., JSON_HEX_TAG | ...)`, de modo que ningún `<` del documento
puede cerrar el `<script>` de la página.

## Sobre el iframe

El formato guardado y el exportado son HTML y CSS. Puede conservar iframes de
servicios explícitamente permitidos —por ejemplo el mapa de Santa Luisa—, pero
rechaza otros orígenes. El lienzo interno de GrapesJS también usa un `iframe` en
el navegador: es un detalle de la herramienta de edición, no del formato.

## Vendor

GrapesJS 0.23.4, licencia **BSD-3-Clause**. `grapes.min.js` (1 150 929 bytes) y
`grapes.min.css` (61 053 bytes), con SHA-256 documentados y verificados por
`npm run check`. Detalle completo en
`open-codesign-publisher/assets/vendor/grapesjs/README.md`.

## Verificación

`npm run check:canvas` (incluido en `npm run check`) comprueba sobre el AST de PHP:
capacidad, nonce, saneamiento y validación de las tres representaciones,
persistencia por ID estable, aislamiento respecto al importador, ausencia de CDN e
iframe, y la integridad byte a byte del vendor.

`npm run check:canvas-runtime` abre un navegador real, verifica radios de 16 px y
12 px derivados de variables, aplica una cuadrícula `1/2/1`, guarda, la altera,
recarga y comprueba que columnas, CSS y comportamiento sobrevivieron.

## Límites conocidos

- Es un **slice vertical**, no un page builder: un único documento, sin lista de
  documentos, sin publicación a páginas y sin bloques Gutenberg.
- No hay subida de imágenes: el gestor de activos de GrapesJS está sin `upload`.
  Las imágenes deben referenciarse por URL o `data:`.
- Los límites de saneamiento (2 MB + 512 kB + 4 MB) son mayores que el
  `post_max_size` habitual de PHP (8 MB) una vez aplicada la codificación
  `application/x-www-form-urlencoded`. Un documento muy grande puede llegar con
  `$_POST` vacío; entonces falla la verificación del nonce y el editor muestra un
  error de rechazo genérico, no uno de tamaño. Falta un preflight de tamaño en el
  cliente.
- Si `loadProjectData()` falla, el lienzo se reconstruye desde el HTML y el CSS
  guardados: se conserva el resultado visual, pero se pierden capas y símbolos.
- La prueba de navegador cubre el runtime del editor y simula la misma petición
  AJAX; falta todavía la validación manual del ciclo contra la instalación remota
  de WordPress después del despliegue.
