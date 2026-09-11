# Vendor — GrapesJS

Copia local y sin CDN de la distribución oficial de GrapesJS. La pantalla
**Herramientas → ContOpe Canvas (Experimental)** la carga con
`plugins_url()`; el sitio no realiza ninguna petición de red para editar.

## Procedencia

- Paquete: `grapesjs`
- Versión: **0.23.4**
- Licencia: **BSD-3-Clause** (texto íntegro en `LICENSE`, © 2017–actual Artur Arseniev)
- Origen del copiado: `node_modules/grapesjs/dist` del spike de investigación
  `grapesjs-santa-spike`, que instaló el paquete publicado en npm.
- Repositorio original: `https://github.com/GrapesJS/grapesjs`

## Archivos incluidos

| Archivo | Origen en el paquete | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `grapes.min.js` | `dist/grapes.min.js` | 1150929 | `66155421db3a640add8eaf77391b6a744d36af80833cd91d44f8d3220fb76231` |
| `grapes.min.css` | `dist/css/grapes.min.css` | 61053 | `fb55e939b3349c280d68c0617dc87e56baa3eab55ea56a1855db9f5efcc7268d` |
| `LICENSE` | `LICENSE` | 1485 | — |

Total incorporado al plugin: **1 212 kB** aproximadamente (1 211 982 bytes sin el
texto de licencia).

## Archivos deliberadamente excluidos

`grapes.min.js.map` (3,7 MB), `grapes.mjs` (2,8 MB), `grapes.mjs.map` (3,9 MB),
`index.d.ts` (527 kB), `locale/` y `src/`. No hacen falta en tiempo de ejecución
y multiplicarían por seis el peso del plugin.

## Naturaleza de la dependencia

`grapes.min.js` es un bundle UMD que expone el global `window.grapesjs` y no
carga nada más en tiempo de ejecución. Es la única dependencia de ejecución que
introduce el módulo experimental; el resto del plugin sigue funcionando sin ella.

## Actualización

Al reemplazar estos archivos hay que actualizar en el mismo cambio la versión, los
bytes y los SHA-256 en este documento, en `scripts/check-canvas-editor.mjs` y en
`COD_Canvas_Editor_Admin::GRAPESJS_VERSION`. `npm run check` falla si divergen.
