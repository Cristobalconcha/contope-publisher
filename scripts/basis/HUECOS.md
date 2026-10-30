# Basis sobre ContOpe: huecos, diferencias y pendientes

Primera reconstrucción local el 30-oct-2026 (WordPress en `wp-local-basis`, puerto 8894); segunda pasada el mismo día para dejarla
**visualmente idéntica al original** en escritorio (1440), tablet (768) y celular (393). Nada de esto se rodeó con CSS a mano: cada
punto es un hueco del plugin que se amplió (con prueba y en el catálogo), una diferencia que se explica, o una decisión de Cristóbal.

## Cómo se mide la identidad

`node scripts/basis/comparar-vivo.mjs todas todos` abre el ORIGINAL EN VIVO y el local al mismo ancho, recorre cada página y compara
**nodo a nodo** el estilo computado de cada elemento con texto propio (familia, tamaño, peso, interlineado, color, alineación,
espaciado, mayúsculas, subrayado, cursiva), la posición y el alto de sus renglones, las imágenes (nombre de archivo y caja) y las cajas con
fondo, borde, radio o sombra. Deja `comparacion-estilos-<pagina>-<ancho>.json` en `entregables/basis/capturas-comparacion/` y un resumen.
El resultado de la última corrida está en la sección «Qué queda» más abajo.

Las láminas «original | local» las arma `node scripts/basis/capturar-comparar.mjs`: **captura el original en vivo** con el mismo
procedimiento que el local (las capturas viejas del original, de cuando el hosting estaba caído, mostraban la foto de la portada cortada
al 84% y comparar contra ellas inventaba una diferencia que no existe; ver el punto 2 de «Resuelto»).

`node scripts/basis/auditoria-sitio.mjs` prueba el comportamiento en celular de verdad (agente y toque de teléfono): desborde lateral,
imágenes y video, cada pliegue (abre, cierra, autoclose, ícono), botones fijos dentro de la pantalla, formulario (campos que caben y se
escriben), encabezado pegado y errores de consola.

## Resuelto en esta pasada (plugin 0.3.84 y transcriptor)

1. **Tipografía de los textos.** La causa: la medición guardaba el estilo del contenedor (`.et_pb_promo_description`, `.et_pb_blurb_description`,
   `.et_pb_toggle_content`) y no el del texto que se ve; y cuando todo el texto de un bloque va dentro de un `<span>` o un `<a>`, Divi pone ahí
   el color, el tamaño o el peso. Ahora la medición toma «la hoja del texto» (`tipoTexto`: desciende por `<span>`/`<a>` que envuelven TODO el
   texto, nunca por un enlace que sólo envuelve una imagen). El párrafo del aviso naranja pasó de 14 px gris Open Sans a 18 px Roboto
   oscuro con su interlineado; el contenido de los pliegues recuperó su peso 400; el enlace del encabezado, su interlineado. La comparación
   nodo a nodo ya no encuentra diferencias de familia, tamaño, peso, color ni interlineado en ninguna página ni ancho (salvo lo listado abajo).
2. **Portada de Inicio: no había diferencia.** Medido en vivo (viewport y página completa, 1440 y 393): la sección mide 650, el fondo es
   `cover` + `scroll` (sin paralaje) y la foto llega hasta el final. La foto «cortada al 84%» era un defecto de las capturas viejas del
   original (se tomaron con el hosting a medias). `capturar-comparar.mjs` ahora captura el original vivo.
3. **Pliegues de Preguntas frecuentes.** El ícono «+» en círculo gris es el glifo `e050` de ETmodules (rellena), 16 px, color #ccc, que el
   original esconde con el pliegue abierto. Se lleva con las ampliaciones del acordeón de 0.3.84: `showIcon` / `iconPosition` (igual que
   `core/accordion-heading`), `iconoCerrado` / `iconoAbierto` (SVG de Medios; el abierto admite `"ninguno"`) y la parte `icono`. El SVG es
   el contorno del glifo sacado de la propia fuente del sitio. El título del pliegue abierto (#333) ya sale oscuro: el hueco que se había
   anotado («`state: current` sobre `resumen` no cambia el color») era una medición vieja; verificado en vivo con el color computado.
   La separación entre los bloques del pliegue (la imagen del PDF con `margin: 20px auto` y su texto) sale de las cajas medidas, no de un 12.
4. **Íconos rellenos.** Los de «Opciones comerciales» (FontAwesome sólido: carrito, bodega; ETmodules: reloj de arena) se llevan como SVG del
   glifo ORIGINAL con la regla `icono` + `forma` (`descarga/glifos.mjs` lee la versión SVG de la fuente que Divi publica junto a las
   otras). El ícono de ayuda del botón fijo es el trazado original (Material «help» relleno) guardado como forma del sitio.
5. **Formulario de Contactos.** Campos blancos sobre el panel gris, título de grupo («Nombre*», «Email*») con la etiqueta chica debajo,
   teléfono y consentimiento lado a lado, la ayuda arriba del cuadro de texto, el cuadro del alto del original y el botón a todo el ancho. Se
   hizo **ampliando el contrato de variables** de Orugantt Forms (nunca con reglas sobre sus campos): 28 variables nuevas (campo, etiqueta,
   etiqueta chica, ayuda, contador, opciones, botón, interlineado, peso) con los valores por omisión de siempre, más `GridSection` con
   `titulo` / `obligatorio` / `etiquetaChica` y `ayudaArriba` en el campo. El compilador de ContOpe las acepta en `form.theme` (tipos nuevos
   `weight` y `ratio`). **El runtime vive en otro repositorio:** el clon `C:\Users\Cristobal concha\orugantt-forms-basis`, rama
   `basis-tokens` (4 commits sobre `main` del de Santa Luisa, que NO se tocó), y su diferencia está en
   `docs/orugantt-forms-contrato-ampliado-2026-10-30.patch`. Sólo se copió al local de Basis. Para subirlo hay que fusionar esa rama en
   el repositorio de Orugantt Forms (o aplicar el parche), compilar (`npm run build` en `runtime-src`) y llevar el plugin.
6. **Sangría de las listas.** Medida por nivel (14 px el primer nivel, 20 px las sublistas) y escrita con la parte nueva `sublista` del nodo
   `list` (más `item`), no con la sangría del navegador.
7. **Botón WhatsApp.** `iconStyle: "logo"` del nodo `whatsapp`: la marca con su degradado verde (#57d163 → #23b33a), contorno y teléfono
   blancos, dentro del círculo negro, y el verde del original al pasar el mouse. El sanitizador del lienzo admite ahora `linearGradient` y
   `stop`. Se omitió la sombra gris desenfocada del SVG original (un `feGaussianBlur` bajo la burbuja, invisible sobre el fondo negro).
8. **Pie.** Eran las direcciones con el doble salto de línea (`<br>` más el salto del código fuente: la dirección medía 84 px en vez de 51):
   el transcriptor ahora trata el salto de línea del código fuente como espacio, como HTML.
9. **`icono.donde: fondo`.** Se sacó del catálogo (no hace falta para Basis y el validador nunca lo aceptó): el catálogo publica
   `COD_Icono::DONDE`, la misma constante que valida, y declara `forma` o `nombre` como lo que sí se exige en vez de un `required: donde`
   que el validador no pide. Prueba: `scripts/probar-basis-0384.php`.
10. **Tablet (768).** Se midió el original a 768 (las cinco páginas) y el transcriptor aprendió reglas con scope `tablet`: transcribe la
    página una segunda vez contra la medición de 768 «como si fuera el celular» y re-escopa lo que esa pasada guarda como `mobile` a
    `tablet` (`fusionarTablet`). Las columnas se apilan o no según lo medido (antes se suponía apiladas a todo lo que no fuera escritorio).
    A 768 Inicio pasó de 5395 px (con escritorio comprimido) a ±0,5% del original.
11. **Mapa de Contactos: dejado listo para la clave.** `content.fijo: true` (0.3.84): el mapa grande queda ABIERTO siempre, sin mini que
    pinchar ni X, con el alto del original (`--cod-mapa-alto: 800px` en la parte `grande`). **Con la clave pública de Mapbox cargada en
    Configuración → Mapa es un mapa en vivo del mismo tamaño; sin ella** (hoy) el mini —la imagen recortada— llena esa misma caja y sigue
    siendo un enlace a «cómo llegar». La clave NO se buscó ni se cargó: la pone quien publica.
12. **Tablet y celular de verdad.** `auditoria-sitio.mjs` pasa en las cinco páginas a 1440, 768 y 393.

## Huecos del plugin que quedan abiertos

A. **Los widgets de la página `basis-carpas-industriales` (buscador, «Recent Posts», «Recent Comments»).** El original es una página de
   WordPress con la barra lateral del tema Divi, que lleva bloques nativos de core (`wp-block-search`, últimas entradas, últimos
   comentarios). Son contenido DINÁMICO de WordPress, no de la página, y ContOpe no tiene todavía la correspondencia con esas familias de
   Gutenberg (`core/search`, `core/latest-posts`, `core/latest-comments`; regla de arquitectura: tomar la familia de Gutenberg y darle
   formato). No se imitaron con texto fijo: una lista de entradas copiada a mano envejece desde el primer día y un buscador que no busca
   engaña. Lo que sí se transcribió es el título, el encabezado y el pie. Es el único módulo del original que quedó sin transcribir.
B. **Texto en línea** (negrita, cursiva o enlaces *dentro* de un párrafo): los nodos de texto son planos. En Basis sólo había un enlace que
   ocupa todo su bloque y se transcribe como `link`.
C. **Contador de caracteres y orden de la ayuda.** Orugantt Forms escribe «0/600» a la derecha del cuadro; Gravity escribe «0 de 600
   caracteres máximos» a la izquierda. Es el texto y la posición de un componente del runtime de formularios, no del diseño.
D. **Casilla de consentimiento:** se dibuja con la del navegador (que Orugantt estila con `accent-color`); la de Gravity es una casilla
   gris propia.
E. **Entre 981 y 1023 px** el plugin aplica lo de tablet (corta tablet en 768–1023) donde Divi ya muestra escritorio (corta en 980). No
   se midió ahí porque el encargo era 768; los anchos de prueba no caen en ese tramo.

## Diferencias visibles que quedan contra el original

Ver la tabla de la última corrida de `comparar-vivo.mjs` (abajo). Lo que no es un defecto del sitio local:

- **Botones «Explorar Soluciones» y «Solicita Información»:** no llevan a ninguna parte en el original (`href` vacío y `#`). Se respetó.
- **«Planta Econut / www.econut.cl»** en el globo del mapa: es lo que dice el original de Basis (copia del código de Econut).
- **Banner de cookies:** el original no tiene; aquí está como en Econut (pedido), con la paleta de Basis. Se oculta sólo en las capturas.
- **«Reproductor de vídeo»:** texto de accesibilidad de MediaElement (el reproductor de Divi) que el video de fondo local no necesita.
- **Mapa y mini mapa:** el original dibuja los dos con Mapbox en vivo; sin clave quedan como imagen (ver 11).
- **El encabezado a 393/768 mide 80 px con `overflow: hidden`** en los dos sitios: el enlace «Cotizaciones / Contactos» queda recortado
  en los dos (la comparación lo ve 14 px más abajo en el local; no se ve en pantalla).
- **Cajas que la comparación no puede emparejar** (el encabezado y el pie como `et_pb_section` contra `header`/`footer`, los
  controles internos de Mapbox, el divisor de la sección de Preguntas que Divi dibuja con fondo SVG y ContOpe con un SVG en línea): son
  de implementación, no de lo que se ve; las láminas lo confirman.
- **El texto «Gracias»** del formulario no se pudo medir (nunca se envió): es uno mínimo.

## Qué queda (última corrida)

<<TABLA>>

## Medios

Los 39 originales (`original/medios/`) están en `uploads/2025/07/`. El mapa de Contactos y el mini mapa del pie siguen siendo recortes de
captura: en el original los dibuja Mapbox en vivo (ver 11). Las tipografías son los archivos de la descarga. Los íconos de Divi se guardan
en `uploads/iconos-divi/` y las formas del divisor en `uploads/divisores/` y `uploads/formas/` (los genera el transcriptor; no se versionan).

## Para subirlo

1. Subdominio de prueba (p. ej. `nuevo.basisbodegas.com`) con WordPress, plugin ContOpe **0.3.84**, **Orugantt Forms con el runtime de la rama
   `basis-tokens`** (ver 5), CookieAdmin y los temas `contope-canvas` y `contope-basis`.
2. Copiar `uploads/2025/07/*`, `uploads/divisores/*`, `uploads/formas/*` (`scripts/instalar-formas-de-divisor.php`) y `uploads/iconos-divi/*`.
3. `SITIO=… AUTH_FILE=… node scripts/basis/aplicar.mjs` (todo por el canal MCP y REST; no sube ningún guion).
4. Poner la clave de Mapbox (Configuración → Mapa: con ella el mapa de Contactos es el de verdad), la casilla real de destino del
   formulario `contacto-basis` (hoy apagado, con `PENDIENTE-DESTINO@basis.invalid`) y SMTP; revisar los `[PENDIENTE: …]` del texto legal.
5. Comparar: `node scripts/basis/comparar-vivo.mjs todas todos http://<subdominio>`, `capturar-comparar.mjs <subdominio>` y `auditoria-sitio.mjs <subdominio>`.
