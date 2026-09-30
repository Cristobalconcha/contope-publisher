# Econut sobre ContOpe Publisher

La landing de econut.cl, rearmada en el page builder propio. Acá vive **la
única fuente** de esa página: `componer.mjs` la genera entera y la escribe por
el canal MCP. Si se edita la página a mano en el editor y después se vuelve a
correr este guion, gana el guion.

## Por qué existe esta carpeta

El sitio original corre sobre Divi. Rehacerlo no es mirarlo y aproximarlo: el
primer intento se compuso a ojo, con un puñado de colores medidos y el resto
por criterio propio, y quedó mal — un menú inventado que el original no tiene,
fotos asignadas por el nombre del archivo, el encabezado dentro del cuerpo.

La forma que sí funciona es preguntarle al navegador, sobre el sitio real, qué
pinta de verdad. Para eso son los guiones de medición.

## Los guiones

| guion | para qué |
|---|---|
| `componer.mjs` | genera `composicion-fiel.json`: reglas de diseño y árbol de nodos. `REV=<n>` fija la revisión esperada |
| `lienzo.mjs` | habla con el plugin por su JSON-RPC. `node lienzo.mjs <herramienta> [args.json]` |
| `leer-identidad.mjs` | con qué colores y tipografías pinta un sitio, preguntándole al navegador y no leyendo su CSS |
| `mapa-imagenes-original.mjs` | qué imagen usa el original en cada bloque, con su encabezado como referencia |
| `hoja-contactos.mjs` | todas las imágenes con su nombre debajo, para elegirlas mirándolas |
| `../piezas/foto-pagina.mjs` | foto de página completa **recorriéndola primero**, para que las animaciones de entrada ya hayan ocurrido |

## El circuito

```
node scripts/econut/componer.mjs                       # con REV=<revisión actual>
node scripts/econut/lienzo.mjs cod_preview_canvas_composition composicion-fiel.json
node scripts/econut/lienzo.mjs cod_apply_canvas_composition aplicar-fiel.json
```

El `apply` exige el `previewId` exacto de su `preview`, y crea un respaldo
antes de escribir. La revisión esperada se lee con
`cod_get_canvas_page_state`; si no calza, el servidor rechaza en vez de pisar
una edición más nueva.

## Trampas que ya costaron tiempo

**Capturar sin recorrer la página miente.** Los bloques con animación de
entrada están en opacidad 0 hasta que se los cruza, así que una foto tomada de
inmediato los muestra vacíos aunque tengan todo su contenido. Pasó, y llevó a
declarar rota una página que estaba bien. Usar `foto-pagina.mjs`.

**Elegir una foto por el nombre del archivo falla.** `Perspectiva-2.jpg` es una
nuez sobre un huerto, no el interior de una planta; uno de los «logotipos» de
certificación era una fotografía aérea. Mirar la hoja de contactos.

**Una afirmación negativa no es un hallazgo.** «El original no tiene menú» sólo
vale si el selector alcanzó el encabezado; con el selector equivocado devuelve
lo mismo que si no existiera.

## Configuración

`lienzo.mjs` lee el endpoint de `ENDPOINT` (por omisión el local de Econut en
el puerto 8891) y la credencial del archivo que indique `AUTH_FILE`. Ninguna
credencial se guarda acá.

## Lo que falta

- El encabezado y el pie deberían ser **regiones globales** del plugin, no
  secciones dentro de la página. Hoy no existe ninguna región en esa
  instalación y el MCP no tiene herramienta para crearlas: se crean en el
  panel de WordPress y después se escriben con `pageId 0`.
- La marquesina de certificaciones y el encabezado que se encoge al bajar.
- El original oscurece la foto de la portada con un degradado; acá no se copió,
  por la regla de no usar degradados. La legibilidad la da la columna blanca,
  que es el mismo mecanismo que usa el original.
