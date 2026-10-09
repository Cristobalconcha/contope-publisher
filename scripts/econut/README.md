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

## La marquesina de certificaciones, medida

El original la hace con **Swiper** metido en un módulo de código de Divi
(`mySwiperCertificaciones` dentro de `et_pb_code`), no con un módulo nativo.
Medido el 30 de septiembre con el viewport en 1440x900:

| qué | valor |
|---|---|
| movimiento | `loop: true`, `autoplay.delay: 0`, `speed: 8000` — continuo y lento, no de paso en paso |
| piezas a la vista | 4 desde 1024px · 2 en 768 y 480 · 1 en 320 |
| separación | 60px (`spaceBetween`, y 60px medidos en pantalla) |
| cada logo | 120x120px; son 4, y en el DOM salen 8 porque Swiper duplica el juego para cerrar el bucle |
| su sección | fondo `#DBD4C0`, padding `54px 0 50px` |

En el plugin esto **no** se rehace con Swiper: el bucle continuo se arma con
CSS, duplicando el juego de piezas. Un tercero no entra al plugin por esto.

## El encabezado no se encoge

Estuvo anotado como pendiente y es falso: el encabezado de econut.cl es
`position: static`, mide 100px y se va con la página al bajar. No hay
`et-fixed-header`, no se fija y no cambia de alto. Comprobado con el scroll a
2500px, donde el encabezado reporta `top: -2500`.

**Ojo con cómo se mide esto.** La primera medición dio justo lo contrario de lo
que vale: el panel del navegador estaba oculto, `innerHeight` era 0, y con el
viewport en cero la página declaraba 73.756px de alto (son 6.906), ningún
elemento quedaba fijo y la marquesina no aparecía por ninguna parte. Un
navegador sin tamaño contesta cualquier cosa. Antes de preguntar: fijar el
viewport, recargar, y confirmar que `innerHeight` no es 0.

Y la marquesina tampoco se encuentra buscando animaciones CSS infinitas:
Swiper mueve por `transform` desde JS, así que ese barrido devuelve sólo las
dos animaciones del reproductor de medios de WordPress. Lo que sí la delata es
el juego de logos duplicado.

## Tramas generativas en la migración

Si una sección del original lleva un fondo animado de puntos o líneas (la
«superficie de puntos»), **no se rehace con un video ni con un `<canvas>` a
mano**: es una trama. La trama la genera el generador de core y se exporta
como archivo (`.trama.json`); el plugin sólo la reproduce.

1. Pedirle a Cristóbal el archivo de trama (o el código `CT1.…` / `SP1.…`) de
   esa sección. No inventarlo ni escribirlo a mano.
2. Subirlo a Medios del WordPress de Econut. Medios sólo acepta un `.json` si
   es una trama válida, así que si lo rechaza, el archivo está mal: no forzarlo.
3. En `componer.mjs`, una regla `trama` con `fuente` = la ruta de Medios, y en
   el nodo de la sección esa regla más una `properties` con `min-height`:

   ```js
   R('trama-portada', 'trama', { fuente: '/wp-content/uploads/2026/10/portada.trama.json', modo: 'vivo' });
   ```

4. `cod_preview_canvas_composition` valida el archivo; si no existe o no es
   una trama, lo dice y no aplica.

Un código `SP1.…` publicado antes se sigue viendo igual. Detalle en
`docs/modulo-trama.md` y en el skill `operar-canvas`.

## Lo que falta

- La marquesina de certificaciones en la página (la capacidad en el plugin
  entra en 0.3.39; falta componerla acá).
- El mapa.
- Nuestra página mide más alto que el original: sobra aire en varios bloques.
- El original oscurece la foto de la portada con un degradado; acá no se copió,
  por la regla de no usar degradados. La legibilidad la da la columna blanca,
  que es el mismo mecanismo que usa el original.
