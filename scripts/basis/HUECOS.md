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

Corrida del 30-oct-2026 (original en vivo, local en `wp-local-basis`, plugin 0.3.84), con `comparar-vivo.mjs todas todos`. «Cajas» son sobre todo
emparejamientos imposibles (el `header`/`footer` de ContOpe contra las `et_pb_section` de Divi, los controles internos de Mapbox, los campos de
Gravity contra los de Orugantt, el divisor de la sección que Divi dibuja con fondo SVG y ContOpe con un SVG en línea); las láminas confirman que no se ven.

| página | ancho | alto original / local | diferencias | textos con diferencia | textos que faltan o sobran | imágenes | cajas |
|---|---|---|---|---|---|---|---|
| inicio | 1440 | 4347 / 4352 (+5) | **12** | 3 | 1 | 0 | 8 |
| inicio | 768 | 5827 / 5804 (-23) | **16** | 6 | 1 | 0 | 9 |
| inicio | 393 | 5776 / 5770 (-6) | **14** | 4 | 1 | 1 | 8 |
| basis-carpas-industriales | 1440 | 950 / 950 (+0) | **14** | 2 | 5 | 0 | 7 |
| basis-carpas-industriales | 768 | 950 / 950 (+0) | **16** | 4 | 5 | 0 | 7 |
| basis-carpas-industriales | 393 | 852 / 852 (+0) | **17** | 4 | 5 | 1 | 7 |
| preguntas-frecuentes | 1440 | 1754 / 1753 (-1) | **7** | 2 | 0 | 0 | 5 |
| preguntas-frecuentes | 768 | 2661 / 2649 (-12) | **9** | 4 | 0 | 0 | 5 |
| preguntas-frecuentes | 393 | 3305 / 3293 (-12) | **9** | 4 | 0 | 1 | 4 |
| contactos | 1440 | 1354 / 1285 (-69) | **26** | 5 | 7 | 0 | 14 |
| contactos | 768 | 2313 / 2241 (-72) | **27** | 6 | 7 | 0 | 14 |
| contactos | 393 | 2653 / 2568 (-85) | **28** | 6 | 7 | 1 | 14 |

Diferencias de texto e imagen (sin las de cajas, que son sobre todo emparejamientos imposibles de implementación), agrupadas:

- «Cuente con todas las alternativas para gesti» (p/p): x -8 — inicio 1440, inicio 768
- «Av 18 de Septiembre sn Hijuela 2 Fundo San R» (p/div): y +15 (antes +5) — inicio 1440, inicio 768, basis-carpas-industriales 1440, basis-carpas-industriales 768, preguntas-frecuentes 1440, preguntas-frecuentes 768, contactos 1440, contactos 768
- «Diseño y desarrollo» (p/p): x -10 · y +5 (antes +15) — inicio 1440, inicio 768, inicio 393, basis-carpas-industriales 1440, basis-carpas-industriales 768, basis-carpas-industriales 393, preguntas-frecuentes 1440, preguntas-frecuentes 768, preguntas-frecuentes 393, contactos 1440, contactos 768, contactos 393
- falta en el local: «Reproductor de vídeo» — inicio 1440, inicio 768, inicio 393
- «Cotizaciones / Contactos» (a/a): y +14 (antes 0) — inicio 768, inicio 393, basis-carpas-industriales 768, basis-carpas-industriales 393, preguntas-frecuentes 768, preguntas-frecuentes 393, contactos 768, contactos 393
- «La respuesta eficiente a su demanda de bodeg» (h1/h1): y 0 (antes +14) — inicio 768, inicio 393
- «Descubre Más Sobre Nuestras Carpas» (h2/h2): y -13 (antes -4) — inicio 768
- «Av 18 de Septiembre sn Hijuela 2 Fundo San R» (p/div): x +7 · y +14 (antes +4) — inicio 393, basis-carpas-industriales 393, preguntas-frecuentes 393, contactos 393
- imagen Altfx-2-Calado.png: x -95 — inicio 393, basis-carpas-industriales 393, preguntas-frecuentes 393, contactos 393
- falta en el local: «Buscar» — basis-carpas-industriales 1440, basis-carpas-industriales 768, basis-carpas-industriales 393
- falta en el local: «Recent Posts» — basis-carpas-industriales 1440, basis-carpas-industriales 768, basis-carpas-industriales 393
- falta en el local: «Hello world!» — basis-carpas-industriales 1440, basis-carpas-industriales 768, basis-carpas-industriales 393
- falta en el local: «Recent Comments» — basis-carpas-industriales 1440, basis-carpas-industriales 768, basis-carpas-industriales 393
- falta en el local: «No hay comentarios que mostrar.» — basis-carpas-industriales 1440, basis-carpas-industriales 768, basis-carpas-industriales 393
- «BASIS: Carpas Industriales» (h1/h1): y 0 (antes +14) — basis-carpas-industriales 768, basis-carpas-industriales 393
- «Preguntas Frecuentes» (h1/h1): y 0 (antes +14) — preguntas-frecuentes 768, preguntas-frecuentes 393

Lo que queda, agrupado (de verdad visible o de verdad distinto):

- **Contactos, alto −69 / −72 / −85 px (≈5%).** El formulario de Orugantt Forms es más compacto que el de Gravity en cuatro cosas que el contrato de
  variables todavía no expresa: (1) la casilla de consentimiento: Gravity la dibuja con 24 px de relleno a la izquierda y el texto cae en 3 renglones
  (59 px) contra 2 (39 px) aquí; (2) la descripción tiene 10 px de relleno arriba y abajo y 8 px de margen; (3) el contador mide 39 px (relleno de 10);
  (4) el pie del formulario lleva 16 px de relleno y 6 de margen. Cada una es una variable más del contrato (`ayudaRelleno`, `contadorRelleno`,
  `pieRelleno`, `opcionRelleno`); no se agregaron para no seguir ampliando el runtime de otro repositorio sin que Cristóbal lo mire primero.
  El texto del contador («0/600» a la derecha contra «0 de 600 caracteres máximos» a la izquierda) es del runtime (ver C).
- **Inicio, alto +5 / −23 / −6 px; pie +5 px.** Las posiciones verticales de la dirección y del crédito del pie quedan 5 a 15 px más abajo
  (el mini mapa y su dirección se alinean al centro en el original y al borde superior aquí) y el título del aviso naranja 13 px más arriba a 768.
  No se alcanzó a medir por qué; es lo único de Inicio que se ve si uno mira con regla.
- **Dirección del pie a 393 (x +7) y crédito a 393 (la imagen del crédito queda 95 px más a la izquierda):** a 393 el original apila el texto
  y la imagen del crédito de otra forma; el transcriptor ordena los módulos que se pisan por su posición a escritorio.
- **«Cuente con todas las alternativas…» (x −8 / −6):** el párrafo de «Opciones comerciales» queda 8 px a la izquierda; sin explicar.
- **Encabezado a 768 y 393:** el enlace «Cotizaciones / Contactos» queda recortado en los dos sitios (la comparación lo ve 14 px más abajo en el local;
  no se ve en pantalla).
- **«Reproductor de vídeo»:** texto de accesibilidad de MediaElement (el reproductor de Divi); el video de fondo local no lo necesita.
- **Página `basis-carpas-industriales`:** el buscador, «Recent Posts», «Hello world!», «Recent Comments» y su texto faltan (hueco A).
- **Contactos, «*» y «Enviar mensaje»:** la comparación los lista «sobra» porque el original dibuja el asterisco en otro elemento y su botón es un
  `<input>` (su texto está en `value`); están en las dos páginas.


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
