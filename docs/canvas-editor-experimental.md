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
5. Guarda y reabre el documento contra WordPress mediante `admin-ajax.php` con
   nonce y comprobación de capacidad en cada petición.
6. Exporta HTML y CSS como descargas separadas desde el navegador.

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
| HTML | `wp_kses` sobre el conjunto `post` de WordPress más etiquetas estructurales; `iframe`, `script`, `style`, `object`, `embed`, `form`, `input`, `select` y `textarea` se retiran del conjunto permitido. Las etiquetas fuera de la lista **se rechazan con `WP_Error`** en vez de descartarse en silencio. | 2 MB |
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

El formato guardado y el exportado son HTML y CSS; no se publica ni se almacena
ningún `iframe`, y `iframe` está explícitamente fuera del conjunto permitido por
`wp_kses`. El lienzo interno de GrapesJS sí usa un `iframe` en el navegador: es un
detalle de la herramienta de edición, no del formato.

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
- No se ha ejecutado en un WordPress real desde este worktree; las comprobaciones
  son estáticas. Falta verificación en ejecución del guardado y la reapertura.
