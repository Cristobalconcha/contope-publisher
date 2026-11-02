# Basis sobre ContOpe: huecos, diferencias y pendientes

Primera reconstrucción local el 30-oct-2026 (WordPress en `wp-local-basis`, puerto 8894); segunda y tercera pasada el mismo día para dejarla
**visualmente idéntica al original** en escritorio (1440), tablet (768) y celular (393) (la tercera cerró los cuatro puntos que quedaban: Contactos, la barra lateral, el pie y las diferencias restantes). Nada de esto se rodeó con CSS a mano: cada
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

**Mediciones complementarias.** `descarga/medir.mjs` mide el sitio entero; dos cosas se miden aparte y se guardan DENTRO de los `medida-<pagina>-<ancho>.json`
(sin tocar lo demás): `descarga/medir-formulario.mjs` (`forma.extra`: rellenos, márgenes, separaciones y casilla del formulario de Gravity) y
`descarga/medir-barra-lateral.mjs` (`contenidoPlano.lateral`: la barra lateral del tema). Si se vuelve a correr `medir.mjs`, hay que volver a correr
esas dos. `sincronizar-local.mjs` lleva el plugin, el tema y el runtime de Orugantt Forms a `wp-local-basis` (nunca a producción).

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

## Resuelto en la tercera pasada (plugin 0.3.85, Orugantt Forms `basis-tokens` y transcriptor)

13. **Contactos: el formulario mide lo mismo que el de Gravity (899 px a 1440 y a 768, 1248 a 393, contra −69 / −72 / −85 de antes).** El
    contrato de variables de Orugantt Forms se amplió por segunda vez (sigue en el clon `orugantt-forms-basis`, rama `basis-tokens`; el
    repositorio que usa Santa Luisa no se tocó). Variables nuevas: relleno y margen de la ayuda (`ayudaRellenoY`, `ayudaSeparacion`), del
    contador (`contadorRellenoY`, `contadorSeparacion`, `contadorInterlineado`, `contadorAlineacion`) y del pie (`pieRellenoY`,
    `pieSeparacion`); separación entre un título de grupo y sus campos y entre una etiqueta y su campo; relleno superior de la etiqueta (la de
    una casilla lleva el suyo); separación vertical entre ayuda, cuadro y contador (`controlSeparacion`); separación entre columnas de una
    fila, de un grupo con título y entre filas al apilarse (`rejilla*`); y la **casilla propia** (`casillaApariencia: none`, tamaño, fondo,
    marca, márgenes, sangría y separación con su texto, alineación vertical): el cuadrado liso de 18 px gris de Gravity, no el del navegador.
    Para los valores de lista cerrada hay un tipo nuevo, `keyword`, con su lista en `values`. La separación que Gravity pone como relleno y
    margen de cada parte se escribe igual; la automática del runtime entre ayuda, cuadro y contador queda en cero para ese diseño. Todo se
    MIDE en vivo (`scripts/basis/descarga/medir-formulario.mjs` guarda `forma.extra` en la medición) y nada se escribe a mano.
    **El contador** dice ahora «0 de 600 caracteres máximos», a la izquierda: el texto es la propiedad `contadorFormato` del campo
    («{n} de {max} caracteres máximos»; sin ella, «{n}/{max}») y la alineación es la variable `contadorAlineacion`. El parche contra `main` del
    repositorio de Orugantt Forms está al día en `docs/orugantt-forms-contrato-ampliado-2026-10-30.patch` (verificado: aplica limpio).
14. **La barra lateral de `basis-carpas-industriales` (buscador, entradas y comentarios recientes) son los bloques NATIVOS de WordPress.**
    Gutenberg ya tiene esa familia (`core/search`, `core/latest-posts`, `core/latest-comments`), así que ContOpe se CORRESPONDE con ella en
    vez de imitarla. Lo que faltaba era una forma de decir «aquí va ese bloque» dentro de una composición: **nodo nuevo `block`** (0.3.85),
    `content: { name, attrs }`. El compilador deja un marcador que conserva su caja (la que recibe las reglas) y al mostrar la página
    WordPress dibuja adentro con los datos de ese momento: la entrada nueva aparece sola, nada se copia (lo comprueba la prueba creando y
    borrando una entrada). Lista permitida cerrada (bloques dinámicos) ampliable con el filtro `cod_canvas_bloques_permitidos`; atributos como
    pares simples que WordPress valida contra el esquema del propio bloque. La forma sale de las reglas del nodo y de **partes** que alcanzan
    lo que dibuja WordPress por dentro (`etiqueta`, `envoltura`, `entrada`, `boton`, `lista`, `item`, `enlace`, `fecha`, `vacio`: clases de
    Gutenberg). La composición es el contenedor de Divi (80 %, máx. 1080), la columna del título (79,125 % con su línea vertical gris, que
    en Divi es un seudoelemento del contenedor y aquí es el borde de esa columna) y la barra lateral (20,875 %, apilada debajo del título a
    768 y 393); los textos «Recent Posts» y «Recent Comments» son los títulos de los widgets del original, tal cual. `scripts/basis/descarga/medir-barra-lateral.mjs`
    mide la barra del original (cajas y estilos computados, tres anchos) y `lib/barra-lateral.mjs` la transcribe. El local necesitó dos
    cosas de datos, no de diseño: el idioma del sitio en español (el texto «No hay comentarios que mostrar.» lo pone WordPress según el idioma;
    se copiaron los archivos `es_ES` de `wp-local`, ya descargados) y sin el comentario de ejemplo que trae WordPress.
15. **Tipografía: Open Sans no tiene peso 500 en el original.** Medido: el original sólo declara Open Sans en 300, 400, 600, 700 y 800, así que
    TODO texto de peso 500 se dibuja con la cara de 400 (en la página sólo se carga «Open Sans 400»). El tema local declaraba el archivo variable
    en rango (300 a 800) y dibujaba un 500 verdadero: 1,7 % más ancho y más pesado en cada texto del cuerpo (por eso «Cuente con todas las
    alternativas…» salía 8 px a la izquierda y «Hello world!» 1,5 px más ancho). El tema `contope-basis` declara ahora esas caras por peso (y
    Roboto en 100, 300, 400, 500, 700 y 900, como el original): el mismo archivo, declarado como lo hace el original. La composición conserva el
    peso medido (500).
16. **Pie e Inicio: causas medidas.** (a) El módulo de código que abre la columna de la dirección lleva margen superior de −10 px y un
    «aire» de 20 px debajo (un `<div>` vacío con ese margen): el transcriptor excluía a los módulos de código del desfase del primer módulo; ahora
    los aplica. (b) Los módulos que se pisan se agrupan en una fila: el crédito («Diseño y desarrollo» + logo) se acomodaba a la izquierda cuando
    es la imagen la que está pegada al borde derecho, y el logo traía un margen automático además del `gap`. (c) El mini mapa y la dirección:
    el `<div>` de Mapbox del original se encoge de 60 a 52,8 px a 393; aquí la dirección tenía ancho forzado y el mapa no cedía. (d) La sección
    «Descubre más» sube 5 px sobre la del video (margen superior de −5 px de la sección, no medido antes): el transcriptor deduce ahora el
    margen de cada sección de la caja de la anterior. (e) El título del aviso naranja a 768 (−13 px): venía de la lista de «Características»,
    cuyo relleno de abajo se pisaba con el del módulo (`padding-block-end` y `padding-bottom` son lo mismo; ahora se suman: 14 + 30). (f) Un
    «resto» de ±1 px sobre el último módulo de una columna es ruido del redondeo de las cajas medidas (un texto de 52,5 medido como 53), no un
    margen: dejaba cada columna apilada 1 px más corta. (g) El logo enlazado del encabezado a 393 y 768 salía 14 px más alto (el `<figure>`
    traía el margen de la hoja base cuando su margen pasa al enlace): ahora lleva margen cero explícito.

**Resultado de la comparación nodo a nodo contra el vivo (30-oct-2026, tercera pasada): cero textos con diferencia, cero imágenes con diferencia
en las cinco páginas × tres anchos.** Lo que queda son cajas sin pareja (ver más abajo) y diferencias de alto de ±3 px.

## Huecos del plugin que quedan abiertos

B. **Texto en línea** (negrita, cursiva o enlaces *dentro* de un párrafo): los nodos de texto son planos. En Basis sólo había un enlace que
   ocupa todo su bloque y se transcribe como `link`.
E. **Entre 981 y 1023 px** el plugin aplica lo de tablet (corta tablet en 768–1023) donde Divi ya muestra escritorio (corta en 980). No
   se midió ahí porque el encargo era 768; los anchos de prueba no caen en ese tramo.

Cerrados en esta pasada (ya no son huecos): A (los widgets de la barra lateral: nodo `block`), C (texto y alineación del contador) y D
(la casilla de consentimiento: casilla propia).

## El sitio está gobernado por el set (1-nov-2026)

Ningún color ni tipografía literal en la hoja del diseño: el transcriptor traduce cada valor al set (`perfil.json` › `tokens`; ver el README del transcriptor) y las definiciones de estilo del tema se declaran con `php scripts/basis/definiciones-del-set.php`. `auditoria-sitio.mjs` lo comprueba (`gobierno-del-set.mjs`) y lo cuenta como problema si deja de cumplirse. Lo que eso cambió a la vista, listado en `salida/INFORME.md` › «Traducción al set de diseño»:

- **Las tipografías no cambian**: las cuatro (Big Shoulders Display, Open Sans, Roboto, Montserrat) son del set; cero diferencias tipográficas contra el original.
- **Colores que se acercaron al de la paleta** (diferencias de 1 a 8 en OKLab×100: #DDDDDD, #CCCCCC, #EEEEEE, #E2E2E2, #333333, #999999, #112337, #585E6A). Casi no se notan.
- **FUERA DEL SET, DECISIÓN DEL DUEÑO.** Seis colores del original no tienen un color parecido en la paleta y se tradujeron al más cercano, que cambia lo que se ve:
  el **azul del velo de la portada** (#0C71C3, degradado sobre la foto de «La respuesta eficiente…») queda como un velo **gris** (--cod-color-ink, #666666); el **verde de WhatsApp al pasar el mouse** (#57D163) y el **azul del botón de ayuda al pasar el mouse** (#0056B3) quedan grises;
  el **ámbar del botón «Enviar» del formulario** (#E09900) queda naranja de marca; el tinte azulado de sus sombras (#121961) y un gris violáceo del texto de varios párrafos de la portada (#3C3A47) quedan en el negro del set (#222222). Si el azul de la portada es parte de la marca, se agrega a la paleta del `theme.json` (p. ej. `azul`), se vuelve a correr `node componer.mjs && node aplicar.mjs` y la traducción lo toma exacto.

## Diferencias visibles que quedan contra el original

Ninguna en lo que se ve, medida nodo a nodo. Lo que no es un defecto del sitio local:

- **Botones «Explorar Soluciones» y «Solicita Información»:** no llevan a ninguna parte en el original (`href` vacío y `#`). Se respetó.
- **«Planta Econut / www.econut.cl»** en el globo del mapa: es lo que dice el original de Basis (copia del código de Econut).
- **Banner de cookies:** el original no tiene; aquí está como en Econut (pedido), con la paleta de Basis. Se oculta sólo en las capturas.
- **«Reproductor de vídeo»:** texto de accesibilidad de MediaElement (el reproductor de Divi) que el video de fondo local no necesita.
- **Mapa y mini mapa:** el original dibuja los dos con Mapbox en vivo; sin clave quedan como imagen (ver 11). Su etiqueta «Econut» (el
  rótulo del marcador del mapa en vivo) es parte de ese dibujo.
- **Encabezado a 393/768:** 80 px con `overflow: hidden` en los dos sitios; el enlace «Cotizaciones / Contactos» queda recortado en los dos
  y no se ve. Ya no se desplaza 14 px (la causa era el margen del logo, 16g).
- **Altos de página:** a 768, Inicio mide 5824 contra 5827 (−3; la sección de las tres columnas mide 1853,8 contra 1855,7 y la siguiente
  1080,4 contra 1081,4: el redondeo de las cajas medidas, no un margen); a 393, ±1 a ±2 px en Preguntas y Contactos. Ningún texto cambia de lugar.
- **El texto «Gracias»** del formulario no se pudo medir (nunca se envió): es uno mínimo.

### Emparejamientos imposibles entre Divi y ContOpe (no son defectos)

La comparación empareja por texto y por posición; estas cajas no tienen pareja porque son de implementación, y las láminas confirman que no
se ven. Ejemplos concretos, con el sitio y el ancho donde salen:

| caja del original | por qué no tiene pareja | ejemplo |
|---|---|---|
| `et_pb_section_0_tb_header` / `_tb_footer` («fondo blanco ≠ gris») | Divi pinta el gris en una fila interna y deja la sección blanca; ContOpe pinta el `header` / `footer` entero | todas las páginas, 3 anchos |
| `et_pb_row_0_tb_header`, `et_pb_row_0`, `et_pb_text_6` | contenedores de Divi que ContOpe no emite (su fila es un grupo sin fondo, borde ni sombra que medir) | `inicio 1440`: la fila de la portada, de 1080 × 439 |
| `mapboxgl-*`, `div.pin`, `div.label`, `mejs-container` | los dibuja Mapbox o MediaElement al cargar la página; no existen en el HTML | `contactos 1440`: el globo «Econut» en (1021, 618) |
| `div.et_pb_module ds_gravity_forms_for_divi` | el módulo del formulario de Gravity envuelve al `.gform_wrapper`; el local lo pinta Orugantt Forms con otro DOM (ya mide 899 px, igual) | `contactos`, 3 anchos |
| `input.gform_button` («borde `rgb(224,153,0)` ≠ transparente») | el original dibuja el borde del botón transparente sobre su fondo; el local lo dibuja del mismo color: se ve igual | `contactos`, 3 anchos |
| `et_pb_bottom_inside_divider` («fondo gris ≠ transparente · imagen —≠ url(svg)») | el divisor de la sección de Preguntas es un fondo SVG de Divi; en ContOpe es un SVG en línea de la regla `divisor` | `preguntas-frecuentes 1440` y `768` |
| `*` y «Enviar mensaje» «sobran» en el local | el original dibuja el asterisco en otro elemento y su botón es un `<input>` (el texto está en `value`) | `contactos`, 3 anchos |

## Qué queda (última corrida)

Corrida del 30-oct-2026 (original en vivo, local en `wp-local-basis`, plugin 0.3.85), con `comparar-vivo.mjs todas todos`. «Cajas» son
emparejamientos imposibles (tabla de arriba).

| página | ancho | alto original / local | diferencias | textos con diferencia | textos que faltan o sobran | imágenes | cajas |
|---|---|---|---|---|---|---|---|
| inicio | 1440 | 4347 / 4347 (0) | **8** | 0 | 1 | 0 | 7 |
| inicio | 768 | 5827 / 5824 (−3) | **8** | 0 | 1 | 0 | 7 |
| inicio | 393 | 5776 / 5777 (+1) | **8** | 0 | 1 | 0 | 7 |
| basis-carpas-industriales | 1440 | 950 / 950 (0) | **4** | 0 | 0 | 0 | 4 |
| basis-carpas-industriales | 768 | 950 / 950 (0) | **4** | 0 | 0 | 0 | 4 |
| basis-carpas-industriales | 393 | 852 / 852 (0) | **4** | 0 | 0 | 0 | 4 |
| preguntas-frecuentes | 1440 | 1754 / 1753 (−1) | **5** | 0 | 0 | 0 | 5 |
| preguntas-frecuentes | 768 | 2661 / 2661 (0) | **5** | 0 | 0 | 0 | 5 |
| preguntas-frecuentes | 393 | 3305 / 3303 (−2) | **4** | 0 | 0 | 0 | 4 |
| contactos | 1440 | 1354 / 1354 (0) | **18** | 0 | 5 | 0 | 13 |
| contactos | 768 | 2313 / 2313 (0) | **18** | 0 | 5 | 0 | 13 |
| contactos | 393 | 2653 / 2654 (+1) | **18** | 0 | 5 | 0 | 13 |

Antes de esta pasada (segunda pasada, misma fecha): 12 / 16 / 14 diferencias en Inicio, 14 / 16 / 17 en Basis carpas, 7 / 9 / 9 en Preguntas y
26 / 27 / 28 en Contactos, con altos de −69 / −72 / −85 px en Contactos y 5 a 15 px de desfase en el pie.

Lo que sigue en las columnas «faltan o sobran»: Inicio, «Reproductor de vídeo» (MediaElement); Contactos, «Econut» (rótulo del mapa en vivo) y,
del lado del local, `*` ×3 y «Enviar mensaje» (el original los dibuja en otro elemento).

## Medios

Los 39 originales (`original/medios/`) están en `uploads/2025/07/`. El mapa de Contactos y el mini mapa del pie siguen siendo recortes de
captura: en el original los dibuja Mapbox en vivo (ver 11). Las tipografías son los archivos de la descarga. Los íconos de Divi se guardan
en `uploads/iconos-divi/` y las formas del divisor en `uploads/divisores/` y `uploads/formas/` (los genera el transcriptor; no se versionan).

## Para subirlo

1. Subdominio de prueba (p. ej. `nuevo.basisbodegas.com`) con WordPress, plugin ContOpe **0.3.85**, **Orugantt Forms con el runtime de la rama
   `basis-tokens`** (ver 5 y 13; el parche contra `main` está en `docs/`), CookieAdmin y los temas `contope-canvas` y `contope-basis`.
1b. El sitio de destino en **español** (los textos de los bloques de WordPress, como «No hay comentarios que mostrar.», salen del idioma del
   sitio) y con sus entradas reales: el buscador y las listas de la barra lateral de `basis-carpas-industriales` las dibuja WordPress con lo que haya.
2. Copiar `uploads/2025/07/*`, `uploads/divisores/*`, `uploads/formas/*` (`scripts/instalar-formas-de-divisor.php`) `uploads/iconos-divi/*` y, para los bloques, **`uploads/contope-iconos/*`** (los glifos del set como `icono-<nombre>.svg`, más el «+» y el «−» del pliegue: los copia `componer-bloques.mjs`; el plugin los registra como íconos del bloque `core/icon`, colección `contope`). El tema `contope-basis` tiene que llevar su carpeta **`styles/blocks/`** (los estilos de bloque registrados) y su `theme.json` completo (paleta con transparencias, sombras, desenfoques, escalas y el CSS entre marcas de los puntos de quiebre).
3. `SITIO=… AUTH_FILE=… node scripts/basis/aplicar.mjs` (todo por el canal MCP y REST; no sube ningún guion).
3b. **Antes de aplicar, declarar las definiciones de estilo del tema** (ContOpe → Configuración → «Definiciones de estilo del tema»: ícono, modo claro, paleta, Títulos = Big Shoulders Display, Cuerpo = Open Sans, Acento = Montserrat, ancho máximo 1080 px, movimiento). Sin ellas las variables `--cod-*` que usa el diseño quedan sin resolver y el sitio se ve sin color ni tipografía; `definiciones-del-set.php` las deja en el local con los valores exactos (léanse de ahí). El plugin del destino tiene que ser el de este repositorio (color-mix y familias de Google).
4. Poner la clave de Mapbox (Configuración → Mapa: con ella el mapa de Contactos es el de verdad), la casilla real de destino del
   formulario `contacto-basis` (hoy apagado, con `PENDIENTE-DESTINO@basis.invalid`) y SMTP; revisar los `[PENDIENTE: …]` del texto legal.
5. Comparar: `node scripts/basis/comparar-vivo.mjs todas todos http://<subdominio>`, `capturar-comparar.mjs <subdominio>` y `auditoria-sitio.mjs <subdominio>`.

---

## Pasada de bloques (1-nov-2026): las cinco páginas son bloques de WordPress

Las páginas `inicio`, `basis-carpas-industriales`, `preguntas-frecuentes`, `contactos` y `terminos-y-privacidad` dejaron de ser documentos Canvas
dibujados por shortcode: son **bloques de WordPress** dentro de `contope/lienzo` (que les pone el encabezado y el pie, que siguen siendo regiones
del lienzo). Se rearman con `node scripts/basis/componer-bloques.mjs`, que escribe **sólo por `cod_write_block_page`** con la compuerta del diseño
en `enforce`. Los documentos Canvas de las páginas quedan intactos en la base (y en `wp-local-basis/respaldos/antes-de-bloques-<fecha>/`); para volver:
`php scripts/basis/respaldar-paginas.php --restaurar <carpeta>`. Para rehacer todo desde cero: `componer.mjs`, `componer-legal.mjs`,
`aplicar.mjs` (sólo las regiones y el formulario importan; sus páginas Canvas ya no se muestran), `escalas-del-sitio.mjs`,
`definiciones-del-set.php --theme-json` y `componer-bloques.mjs`.

### Las escalas (`escalas-del-sitio.mjs` → `escalas.json` → definiciones → theme.json)

Medido: **502 valores literales** en las composiciones (290 espaciado, 89 peso/interlineado, 65 tamaño, 26 radio, 15 ancho, 11 borde, 6 sombra; 0 color,
0 familia) más 2 colores con transparencia y 1 desenfoque. Cada escala se deriva de lo que el sitio usa; el informe de cuánto se aparta cada valor
medido de su paso está en `escalas.json`. **El espaciado y los tamaños de letra son «escritorio / tablet / celular»** (un paso con su valor en cada
punto de quiebre del lienzo: tablet 768 a 1023, celular hasta 767): WordPress imprime UNA variable por paso y el CSS del tema (`styles.css` del
`theme.json`, entre marcas) la redefine dentro de cada punto de quiebre. El bloque no cambia (`fontSize: "160"`, `var:preset|spacing|200`).

| escala | pasos | de cuántos literales salió |
|---|---|---|
| espaciado (`--wp--preset--spacing--*`) | 31 pasos (desktop/tablet/celular en px; 16 con valor propio en un punto de quiebre): 10=0/0/20; 20=4; 30=10; 40=12; 50=16; 60=20/19/20; 70=20/20/19; 80=20; 90=24/0/0; 100=24; 110=24/30/20; 120=27; 130=27/30/30; 140=30/0/0; 150=30/10/10; 160=30; 170=40/30/20; 180=40; 190=50; 200=54/50/50; 210=54/54/32; 220=54; 230=56/0/0; 240=56/50/50; 250=56; 260=59.39/0/0; 270=59.39/30/20; 280=59.39; 290=72; 300=128/69.12/35.37; 310=128; y `gutter` (el margen de una fila: 80 % con tope de 1080) | 263 (206 exactos, 57 acercados al paso de escritorio, el mayor a 4.6 px) + 12 filas |
| tamaños de letra (`--wp--preset--font-size--*`) | 20 pasos, todos EXACTOS (ya no se redondean al escritorio; 9 con tamaño propio en tablet o celular): 10=12; 20=14; 30=16/15/14; 40=16; 50=18/16/14; 60=18; 70=20/16/14; 80=20; 90=22; 100=24; 110=26; 120=28/15/14; 130=30; 140=32; 150=42; 160=50/28/20; 170=50/40/32; 180=50/50/34; 190=55/55/39; 200=80/50/28 | 134 textos |
| radios (`--wp--custom--radius--*`) | xs 3, s 6, m 8, l 10 px, circle 50 %, pill 9999 px | 25 (todos exactos) |
| bordes (`--wp--custom--border--*`) | hairline 1 px, thick 2 px | 11 |
| pesos (`--wp--custom--typography--font-weight--*`) | light 300, regular 400, medium 500, bold 700, extrabold 800, black 900 | 40 |
| interlineados (`--wp--custom--typography--line-height--*`) | none 1, tight 1.2, snug 1.4, cozy 1.5, comfy 1.6, normal 1.7, relaxed 1.75, airy 1.8, loose 2 (se sumaron 1,5, 1,6, 1,75 y 1,8: un interlineado distinto mueve el salto de renglón) | 37 (37 exactos) |
| medidas de texto (`--wp--custom--layout--measure--*`) | s 700, m 760 px (el 1080 ya es `--wp--style--global--content-size`) | 2 |
| transparencias de la paleta (`--wp--preset--color--*`, en `settings.color.palette`) | fondo-pagina-88 = fondo-pagina 88%, ink-15 = ink 15% | 2 |
| sombras (`--wp--preset--shadow--*`, en `settings.shadow.presets`) | 3 pasos: 10 = 0 4px 10px ink 20 %; 20 = 2px 2px 10px ink 20 %; 30 = ink 12 % 0px 24px 72px -12px | 4 |
| desenfoques (`--wp--custom--blur--*`) | s = 6px | 1 |

### Cómo se cerró cada regresión de la comparación antes/después (segunda pasada, 1-nov-2026)

Regla del dueño: el diseño sólo entra como referencia a lo que el sistema define; si algo no se puede expresar, **se amplía el sistema**, nunca se rodea con un
literal, WP-CLI, la base ni apagando la compuerta (`enforce` en todas las escrituras). Cada ampliación tiene su prueba.

| regresión | por qué pasaba | ampliación del sistema que la cerró |
|---|---|---|
| **Características** (recuadro blanco sólido, enorme, sin márgenes; títulos de pliegue sin relleno, peso ni «+» rojo) | el contenedor del video no centraba su contenido (`flow`, no `constrained`); el color con transparencia se aplanaba a un blanco sólido; la foto no descontaba su `calc(100 % − 30 px)`; la alineación vertical de una columna se perdía; el pliegue perdía su relleno, el peso 700 del propio título y el ícono | contenedor **`constrained`** (la caja «100 % con tope» queda centrada con su relleno por dentro); escala de **transparencias** (`fondo-pagina-88` es un color de la paleta); escala de **desenfoques** + estilo de bloque `desenfoque-s`; margen derecho de la foto; `verticalAlignment` por columna; relleno del bloque `core/accordion`; título con su peso; estilo de bloque **`pliegue-…`** (el «+» rojo de 14 px sale de la parte `icono`: color de la paleta, paso de espaciado y el dibujo del set) |
| **Opciones comerciales** (íconos blancos desaparecidos) | un SVG puesto como imagen conserva el color de su archivo (negro) y no puede tomar uno de la paleta | **`core/icon`** (la familia «ícono» de WordPress 7.1) + `COD_Iconos_De_Bloque`: colección `contope` con los glifos del set; `textColor: "fondo-pagina"` |
| **Soluciones inteligentes** (fotos sin el marco blanco de 2 px a 4 px) | no hay atributo de bloque ni escala para `outline` | **estilo de bloque registrado** de `core/image` (`…contorno-thick-fondo-pagina-20`): `outline` con el paso `thick` de la escala de bordes, un color de la paleta y un paso del espaciado; no admite un valor libre |
| **Descubre más sobre nuestras carpas** (degradado oscuro→gris claro en vez de oscuro→naranja) | el original apila un color de fondo bajo un degradado «color→transparente»; el preset de WordPress REEMPLAZA el fondo, así que el naranja se perdía | el preset se declara «ink → accent» (es lo que se ve: un degradado a transparente sobre un fondo opaco termina en ese fondo) |
| **Ícono del pliegue** (FAQ: «+» en círculo gris que se esconde al abrir) | `core/accordion` trae su propio «+» de texto | estilo de bloque `pliegue-…` con el glifo del set como máscara, color de la paleta y paso de espaciado; el estado abierto (fondo blanco, título oscuro) sale de las partes en estado «current» |
| **Divisor curvo de Preguntas frecuentes** | no hay bloque equivalente | estilo de bloque `divisor-abajo-…` de `core/group`: la forma del sitio (SVG de Medios) como máscara, con un color de la paleta |
| **Barra lateral** (buscador, entradas y comentarios recientes) | las «partes» de un bloque de WordPress no tienen atributo de bloque | estilo de bloque `partes-…` de `core/search`, `core/latest-posts` y `core/latest-comments`: cada declaración medida se traduce a una referencia al sistema |
| **Términos y privacidad** (texto pegado a la izquierda, 24 px del borde) | el tope de 760 px con `margin: auto` se tradujo a «contenido a la izquierda»; y el relleno de 24 px iba por FUERA del tope (el original mide el tope con `border-box`) | la sección es `constrained` con la medida `--wp--custom--layout--measure--m` (la caja queda centrada y el relleno por dentro) |
| **Tamaños de título y cuerpo por punto de quiebre** | los tamaños de bloque son uno solo (fluido); el original define uno por punto de quiebre | escalas «escritorio / tablet / celular» (arriba) |
| **Relleno, margen y separación por punto de quiebre** | igual | escala de espaciado «escritorio / tablet / celular» |
| **Proporción de las fotos en tablet y celular** | `core/image` tiene UNA proporción | estilo de bloque con la proporción de escritorio y, en el CSS del tema (entre marcas), la de tablet y celular: sólo la clase del estilo registrado y `aspect-ratio` |
| **Sombras y desenfoque** | el Core no tiene escala de sombras (Q3) | escalas de **sombras** (`settings.shadow.presets`; `style.shadow`) y de **desenfoques**; `contope/mapa` declara el soporte de sombra de Gutenberg |

### Huecos que SIGUEN abiertos (listados, no inventados)

- **Interlineado en píxeles** (`line-height: 40px`, 3 usos, sólo en el encabezado, que sigue siendo una región del lienzo): es una altura fija, no un interlineado.
- **Variante del formulario:** las ~70 variables (`settings.custom.form`) viven en `contope-basis/theme.json`, generadas de la medición del formulario de Gravity. No
  están en las definiciones del set (el Core no expresa «variantes con datos»). Esos nombres son `neutro` en el registro: no sirven como valor de diseño en ninguna clase.
- **Degradados:** los dos que usa el sitio (`texto-cuerpo → transparente` sobre la foto de la portada y `ink → accent`) se declaran como presets del tema
  (`settings.color.gradients`) desde `componer-bloques.mjs`, no desde las definiciones (no hay un campo de degradados).
- **Relleno derecho en porcentaje** (`padding-right: 5,499 %` de una columna de la barra lateral): la escala de espaciado es en px.
- **Ancho propio en tablet** de la foto grande de «Características» (704 px centrada con un margen calculado): el bloque de imagen tiene un solo ancho.
- **Columnas:** `core/columns` apila a los 782 px y el original a los 767 (entre 768 y 781 px las columnas ya están apiladas en el local).
- **Azul de la portada, verde del botón de WhatsApp y azul del botón de ayuda al pasar el mouse, ámbar del botón «Enviar»:** colores del original que no están en la
  paleta (decisión del dueño, ver arriba).
- **Varias variaciones de bloque a la vez:** WordPress procesa UN estilo por bloque, así que lo que una foto necesita (contorno y proporción) se junta en un solo estilo.

### Diferencias visibles que quedan respecto del original (medidas con `comparar-vivo.mjs`, original en vivo)

Corrida del 1-nov-2026 (original en vivo, local en `wp-local-basis`, plugin 0.3.85 + lo «sin publicar»), con `comparar-vivo.mjs todas todos` y `capturar-bloques.mjs`.
Las láminas «antes | después» están en `Sesión Claude/entregables/basis/bloques/` (`antes/` es el sitio anterior dibujado por el lienzo, `despues/` el de bloques;
la primera pasada de bloques, con las regresiones, quedó en `primera-pasada/`).

| página | ancho | alto original / local | diferencia |
|---|---|---|---|
| inicio | 1440 / 768 / 393 | 4381 / 4382 · 5734 / 5737 · 5777 / 5778 | +1 / +3 / +1 (antes de esta pasada: −36 / +480 / +384) |
| basis-carpas-industriales | 1440 / 768 / 393 | 950 / 950 · 950 / 950 · 852 / 852 | 0 / 0 / 0 |
| preguntas-frecuentes | 1440 / 768 / 393 | 1753 / 1755 · 2586 / 2587 · 3202 / 3205 | +2 / +1 / +3 (antes: −57 / +100 / −136) |
| contactos | 1440 / 768 / 393 | 1354 / 1356 · 2313 / 2313 · 2654 / 2654 | +2 / 0 / 0 |
| terminos-y-privacidad (el sitio anterior, sin original en vivo) | 1440 / 768 / 393 | 9801 / 9826 · 9931 / 9956 · 15367 / 15392 | +25 en los tres (+0,3 %); antes de esta pasada 7790 / 8092 / 13518: la columna de texto quedaba pegada a la izquierda y sin la separación de 16 px del motor entre sus hijos, y las tablas traían las líneas de `core/table` |

Todos los textos, en todas las páginas y anchos, tienen el tamaño, el peso, el interlineado y la familia del original (0 diferencias de tipografía por punto de quiebre).
Lo que queda a la vista, y por qué:

- **Colores que la paleta redondeó al más cercano** (decisión ya tomada, ver «El sitio está gobernado por el set»): el texto de los párrafos de la portada (#3C3A47 → #222222), el negro puro de los títulos de la columna de «Características» (#000000 → `ink` #0E0C19), los grises de las etiquetas del formulario, el azul del velo de la portada (gris), el ámbar del botón «Enviar» (naranja).
- **Sombras:** el original usa `rgba(0,0,0,.12)` y `rgba(0,0,0,.2)`; la escala usa el negro del set (`ink`) a la misma opacidad (el tinte es 14, 12, 25).
- **Barra lateral de `basis-carpas-industriales`:** su texto queda 24 px a la izquierda del original (la columna del contenido lleva un relleno derecho de 5,499 %: la escala de espaciado es en px).
- **Cajas sin pareja** que la herramienta lista y las láminas confirman que no se ven: el contenedor `main` del lienzo, el `<input>` y el botón del buscador (WordPress los dibuja con otro DOM), los textos de los pliegues cerrados (la herramienta los cuenta como visibles en WordPress; las láminas y la auditoría confirman que no se ven), el mapa de Mapbox.
- **Desplazamientos de ±1 a ±3 px** en alto de página: el redondeo de las cajas medidas.

---

## El pie: línea legal y celular (2-nov-2026)

**Qué se hizo.** (1) El pie no tenía ningún enlace a los términos ni a las preferencias de cookies; la Ley 21.719 (1-dic-2026) pide uno siempre visible y Basis usa CookieAdmin gratis (sin ícono flotante), así que el pie es el único camino. Se agregó la línea «Términos y privacidad · Preferencias de cookies» (como en Econut: `/terminos-y-privacidad/`, y la conducta `preferencias-cookies` con esa dirección de respaldo). (2) En celular el contenido del pie quedaba a 58 px de cada lado; ahora a 24 (paso 24 del espaciado), con todo alineado a la izquierda y el interlineado de celular en 1,5.

**Cómo.** Todo vive en `correcciones.json` (región «pie»), que `componer.mjs` ahora aplica también al pie: `agregarNodos` (la línea legal), `reglasNuevas` (`bas-pie-*`), `agregarReglas` con los selectores nuevos `hijoDe` y `nodoConTexto`, y `declaraciones` (el relleno de 20 px por columna pasa a 0). Como la compuerta (`enforce`) no deja entrar valores medidos en las regiones, `escalar-regiones.mjs` (con `lib/regiones.mjs`) los pasa a referencias del sistema antes de aplicar (`salida/bloques/region-<k>.escalada.json`); `aplicar.mjs` usa esos archivos. `probar-pie.mjs` lo comprueba en el navegador y `capturar-pie.mjs` arma las láminas «antes | después» (`entregables/basis/bloques/pie-<ancho>.png`).

**Para subirlo a producción** (nada del plugin ni del tema: ya están): `componer.mjs` → `escalar-regiones.mjs` → `aplicar.mjs` (o `divi-a-contope/aplicar.mjs region footer salida/bloques/region-footer.escalada.json`) apuntando a basisbodegas.com. Requiere que exista `/terminos-y-privacidad/` y que CookieAdmin esté activo.

**Diferencias de escritorio que quedan, y por qué.** El pie al pasar por las escalas redondea al paso más cercano cuatro medidas que no son paso propio: relleno superior de la fila 36→40 px, inferior 6→4, márgenes del logo −28→−27 y separación del mapa 15→16 px (cambian como mucho 4 px; agregar pasos propios renumeraría los slugs y obligaría a rehacer las cinco páginas). La altura del pie sube de 120 a 186 px por la línea legal.

**Pendiente / hallazgos.**
- El **encabezado** no se puede volver a aplicar: su región trae una sombra (`box-shadow` de 0 4px 10px), un `gap: 42px` de ícono y un radio `50% 0 0 50%` del botón de WhatsApp que la compuerta rechaza (el que está en la base se aplicó antes de `enforce`). `aplicar.mjs` lo dice y sale con error sin frenar el pie. Hay que ampliar el sistema (paso de sombra y radio asimétrico en la escala) para poder reaplicarlo.
- **`aplicar.mjs`, el paso «páginas»:** sigue mandando las composiciones del lienzo (`salida/<pagina>.componer.json`, con valores medidos) y la compuerta las rechaza (212 valores en `inicio`); las páginas ya son bloques y se escriben con `componer-bloques.mjs`. El paso quedó obsoleto: las regiones se aplican antes y no se ven afectadas, pero el guion termina con error ahí.
- **Tablet (768):** el crédito «Diseño y desarrollo» sigue a la derecha (es una sola columna, pero la alineación a la izquierda sólo se pidió para celular).
- `componer.mjs` regenera los ids y roles de color de las páginas y del encabezado (`c-bd95c9` → `c-c3ef5d`, `c-background` → `c-fondo-pagina`) porque la paleta del tema cambió de slugs desde la última vez; sólo se dejaron los archivos del pie, el resto de `salida/` se mantuvo como estaba.
