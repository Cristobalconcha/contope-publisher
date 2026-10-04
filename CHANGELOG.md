# Registro de versiones

Qué cambió en cada versión publicada, en lenguaje de quien usa el plugin y no
de quien lo escribe. Lo más nuevo, arriba.

---

## 0.3.72 — 4 de octubre de 2026

### El formulario de Contacto, traído de donde estaba

La receta de Contacto dejaba la tarjeta vacía porque el formulario no existía en
el espejo local, y yo lo había anotado como una limitación. Cristóbal: *«el hecho
de que no exista no significa que no tengas cómo acceder a él… siempre te quedas
pegado en cosas que no necesitas resolver»*.

Tenía razón y no había nada que resolver: el formulario estaba publicado y su
definición se pide por una ruta REST **pública**, la misma que usa el runtime
para dibujarlo. `scripts/santaluisa/traer-formulario.mjs` la trae y la instala,
para que la próxima vez sea un comando y no una investigación.

Contacto lleva ahora su nodo `form` apuntando a `contacto-santa-luisa`, estilado
**por variables** y nunca por reglas sobre sus campos —el contrato del tipo—, con
el dorado de la marca, el oliva del texto y la tipografía del tema.

### Una variable con dos nombres rompía la portabilidad

Los nombres de las variables de diseño del formulario salen del runtime de
Orugantt Forms cuando está instalado, y de una lista de respaldo de este plugin
cuando no. De 29, **28 coinciden**. La que no: el runtime la llama `surfaceAlt`
y el respaldo `superficieAlt`, las dos apuntando a `--ofr-color-surface-alt`.

El efecto, medido al traer el formulario: **la misma receta pasaba en un sitio y
se rechazaba en el otro** según si el plugin de formularios estaba instalado. Una
composición que depende de eso no es portable, y la portabilidad es la razón de
ser de todo esto. Ahora se admiten los dos nombres.

No se renombra la variable en el runtime: eso rompería los formularios que ya la
usan, y es una decisión del repo de Orugantt, no de éste.

### Y una foto que se había perdido entre el espejo y el sitio

La sección de contacto lleva en producción una foto de fondo —la mesa de la
firma— que el ESPEJO no tenía: su copia de la regla decía `background-image:
none`. Al componer medí el espejo y reproduje con fidelidad su carencia.

**La lección no es la foto: es que el espejo puede divergir del sitio y medirlo a
él no basta.** Comprobado después en el CSS de las cinco páginas del respaldo de
producción: era la única imagen que vivía en una hoja y se había perdido.

Va en dos reglas porque cada parte tiene su sitio: la imagen por `surface`
—`properties` rechaza `url(` a propósito, para que las imágenes entren por donde
el sistema las conoce— y la posición por `properties`, porque lleva un `calc()`
con `100vw` que `surface.backgroundPosition` no admite.

### Resultado

Las cuatro páginas interiores pasan el revisor en 390, 768, 1024 y 1440 sin un
solo hallazgo, y la batería en verde.

---

## 0.3.71 — 4 de octubre de 2026

### Un revisor que mide el sitio en vez de mirarlo

`scripts/revisar-sitio.mjs` recorre un sitio entero en varios anchos y busca lo
que se rompe: desborde horizontal, elementos que se salen de la pantalla,
imágenes rotas, texto encima de texto, contraste insuficiente y zonas de toque
demasiado chicas para un dedo.

**Por qué existe.** Revisar a ojo con capturas falla de las dos formas. En esta
misma sesión leí mal una captura dos veces: una por mirarla a media escala y
concluir que una columna estaba a la mitad, otra por leer una imagen de doble
densidad como si fuera el viewport. Lo que se mide no se discute.

**Y la primera pasada demostró el punto al revés**: de 14 hallazgos graves, doce
eran defectos del detector, no del sitio. Están corregidos, y cada corrección
está escrita donde se hizo:

- **Texto encima de texto se mide por LÍNEAS, no por cajas.** Dos cajas pueden
  cruzarse sin que se toque una sola letra.
- **Una línea que no se alcanza a sí misma está tapada y no cuenta.** Era el menú
  de teléfono: sus enlaces tienen caja, pero un ancestro los recorta, así que
  `elementFromPoint` sobre ellos devuelve la sección de abajo. La comprobación
  anterior pedía que *alguno* de los dos estuviera arriba, cuando lo que prueba
  un solape real es que **los dos** sean alcanzables. Daba cinco falsos positivos
  por pantalla, que es la forma más rápida de que un informe deje de leerse.
- **Dos tramos del mismo título no se solapan: se encajan.** La cara de caja alta
  sube para que el trazo bajo de la script la toque.
- **Una imagen de 0×0 no está rota.** Era el hueco del lightbox cerrado.
- **44,0 px no es menos de 44.** El umbral se redondea.

### Lo que el revisor encontró de verdad, y quedó arreglado

- **El botón «Enviar por WhatsApp» tenía 2,0:1 de contraste** —blanco sobre el
  verde claro—. Pasó al verde oscuro de la propia paleta de WhatsApp: 4,6:1.
- **Zonas de toque bajo los 44 px**: los enlaces del pie medían 18, los datos de
  contacto 41, los resúmenes del acordeón 22 y las flechas del carrusel 21.
- Las flechas no se podían alcanzar: el runtime las fabrica sin clase propia. La
  galería gana la parte **`flecha`**, que es la única forma de darles medida y
  color desde el diseño.

### Resultado

Las cuatro páginas recompuestas quedan **sin un solo hallazgo** en 390, 768, 1024
y 1440. Lo que queda son seis avisos de zona de toque en la portada, que no está
recompuesta y los traía de antes.

---

## 0.3.70 — 4 de octubre de 2026

### El divisor: el aire se declara aparte de la forma

El divisor gana el campo **`espacio`**: una longitud que se SUMA a su alto en el
hueco que le pide al contenido. Antes el único aire era el relleno de la sección,
que sirve para todo y por eso no se podía ajustar sólo ahí: subir la onda
obligaba a tocar el relleno de la banda entera.

Cristóbal, viendo el primer intento: *«es tan poco pronunciada que parece un
defecto y además el espacio es muy grande; deberías poder asignar un espacio y se
debería sumar al alto del separador»*. Las dos cosas eran la misma: la forma se
dibuja en un lienzo de 120 de alto, así que a 44px queda casi plana, mientras el
vacío alrededor lo ponía otra cosa. Ahora la onda y su aire se declaran por
separado.

**Y un corte lleva UN divisor, no dos.** La página legal tenía uno abajo de la
banda beige y otro arriba de la blanca: el segundo dibujaba ondas blancas sobre
blanco —invisible— y lo único que hacía era reservarse 96px de vacío. Cristóbal:
*«lo puedes poner en cualquiera de las dos secciones, pero no en las dos»*. El
segundo divisor pasó al otro corte, el de vuelta al beige, volteado para que no
sea la misma curva dos veces.

### El catálogo del divisor deja de decir «ver el validador»

Los esquemas de `divisor`, `posicion`, `desborde` e `icono` publicaban ese
relleno en cada campo —obra mía en la 0.3.67— en vez de decir qué admiten. Por
eso mismo adiviné mal los nombres `opacidad` y `desplazamiento` al escribir el
separador. Ahora cada campo se describe.

### El espejo local se puede navegar

Pinchar «Términos y privacidad» en el pie llevaba a la portada aunque la
dirección fuera la correcta. No era del sitio —en producción esa misma URL
responde bien— sino dos cosas del espejo: `permalink_structure` estaba vacío, así
que WordPress generaba `?page_id=` y no conocía la ruta con nombre; y `php -S` no
reescribe direcciones. Ahora el espejo usa la misma estructura que producción y
tiene su enrutador (`wp-local/wordpress/router.php`).

---

## 0.3.69 — 4 de octubre de 2026

### Las cuatro páginas interiores de Santa Luisa, por el constructor

Contacto, Diferenciales, Preguntas frecuentes y Términos dejan de ser HTML
escrito a mano y pasan a ser composiciones registradas, editables desde el page
builder. El número que mejor lo resume: el sitio pasó de **50,7 KB de CSS
repartidos en cuatro hojas de página** a **16,9 KB en una sola hoja de diseño**.

El trinquete de páginas sin composición baja de 8 a 4, y las cuatro que quedan
son la portada y tres páginas de prueba.

### El acordeón, y el error que lo rodeó

Dos de esas páginas son acordeón casi enteras —9 pliegues en Preguntas y 27 en
Términos—, así que hubo que construir el módulo. **Y acá me equivoqué de una
forma que conviene dejar escrita**, porque el arreglo de fondo no es el módulo.

Ese mismo día, antes de una compactación de la conversación, ya habíamos
establecido que WordPress trae `core/tabs`, `core/accordion` y `core/details`, y
había dos páginas de muestra probando el anidamiento. Después de la compactación
miré `INTERACTION_BEHAVIORS` —el único lugar donde suelo mirar—, no encontré
«acordeón», **lo di por inexistente y lo construí de nuevo**, duplicando el
bloque de core. El historial de la sesión estaba en disco y no lo leí.

Cristóbal, al corregirlo: *«tu falla es doble, porque por un lado no miras dónde
están las cosas y por otro lado no registras en el lugar que sueles mirar. Si
siempre miras en el lugar equivocado, entonces es en ese lugar equivocado donde
tienes que hacer tu registro»*.

Así que el registro quedó en los dos lugares donde miro:

- **`EQUIVALENCIA_GUTENBERG`**, una constante nueva justo encima de la lista de
  behaviors, que dice a qué familia de bloques corresponde cada módulo nuestro y
  obliga a mirar `wp-includes/blocks/` antes de construir uno nuevo. Se publica
  además en el catálogo de capacidades.
- La regla 11 del `CLAUDE.md` del proyecto, con el inventario de los bloques
  propios que ya existen y las páginas de muestra.

### La regla de arquitectura que quedó clara

No es que las pestañas o el acordeón «no sean nuestros». Cristóbal:
*«nuestro módulo tiene que ser coherente con el de WordPress… vamos a tomar esas
familias de bloques y les vamos a dar formato»*.

El acordeón quedó entonces **correspondiendo** con `core/accordion`, no
duplicándolo ni reemplazándolo. Cada parte apunta a nuestro atributo **y** a la
clase del bloque de core, en un solo selector:

```
.cod-node-id-terminos :is([data-cod-acordeon-rol="item"], .wp-block-accordion-item){…}
```

Una página armada con el bloque de Gutenberg recibe el mismo formato que una
compuesta en el lienzo, sin escribir el diseño dos veces. Y tiene las dos
capacidades que le faltaban frente a core: `autoclose` (varios abiertos a la vez)
y elegir cuál pliegue nace abierto. Anida, comprobado: un acordeón dentro del
pliegue de otro, cada uno con sus propias opciones.

### Además

- **Las piezas de una galería ya se pueden estilar.** Leyenda, flechas, pista y
  diapositiva no eran alcanzables por ninguna regla —las leyendas salían a 16 px
  donde el original las tiene a 11,5— porque los contratos de partes existían
  sólo para behaviors. Ahora existen también por TIPO DE NODO.
- **Y al agregarlas apareció que `parts_css()` miraba un solo registro**: las
  partes se guardaban en la composición y no emitían una línea de CSS, en
  silencio.
- `text-shadow` y las ocho fotos que faltaban en la biblioteca de medios del
  espejo (todas las de `/2026/09/`, siete del carrusel más la de Preguntas).
- Un respaldo del contenido de un sitio publicado, `scripts/respaldar-sitio.mjs`,
  que **falla si las páginas vienen vacías**: la primera versión devolvió seis
  páginas de 0 B y dijo «6 páginas respaldadas». Un respaldo que miente es peor
  que no tenerlo.
- `probar-marquesina.php` fijaba la POSICIÓN de su behavior en la lista, así que
  se rompió al meterle un hermano. Mismo defecto que ya había tenido
  `probar-mapa.php`.

### El separador de ondas y las tres bandas

La página legal pasa a tres bandas —beige, blanca, beige— separadas por un
divisor de ondas bajo, de 44 px y en tres capas con opacidad decreciente. El
documento es largo y de una sola tinta: las bandas le dan al ojo dónde parar y
dejan claro que son dos documentos, no uno. Pedido de Cristóbal señalando el
corte exacto.

Las 14 formas de divisor estaban sólo en la biblioteca de Econut; se llevaron
también a la de Santa Luisa y se dieron de alta como adjuntos.

---

## 0.3.68 — 4 de octubre de 2026

### La primera página de Santa Luisa construida por el constructor

Contacto ya no es HTML escrito a mano: es una composición registrada, editable
desde el page builder, con sus clases del sistema y su CSS saliendo de la hoja
del diseño `santaluisa-web` en vez de los 11,5 KB propios que llevaba.

Comparada con la página anterior, medida en el navegador: grilla 542+542 con 48
de separación dentro de 1180, sección `125px 0px 70px`, pie a 12 px, lista con
sus separadores de 1 px, y el título como **un solo `<h2>`** con sus dos caras.
En móvil, una columna y sin desborde.

### Tres defectos que aparecieron al hacerlo

- **El CSS de un documento sin diseño se perdía.** `reglas_de_diseno()` reunía
  los diseños de encabezado, cuerpo y pie, y si todos tenían hoja encolaba los
  archivos y devolvía vacío, **descartando el CSS de los tres**. Eso funcionaba
  mientras todos venían de una composición; dejó de funcionar en cuanto el
  cuerpo pasó a tener diseño y el encabezado siguió siendo una región heredada
  con 9 KB de CSS plano: el logo del sitio quedó a 526 px de alto. Ahora cada
  documento se decide por separado, sin servir dos veces el CSS de un diseño.
  **Esto habría ocurrido en producción en la primera página que se recompusiera.**

- **`wa-mensaje` no estaba en el catálogo.** La ventana para redactar el mensaje
  antes de abrir WhatsApp existía en el motor desde hacía tiempo, pero una
  composición no podía pedirla, así que las páginas que la usaban llevaban su
  marcado a mano. Ahora se declara con una regla `interaction` que apunta a los
  nodos de la propia composición —igual que `nav-toggle` con su `targetId`— y el
  plugin pone la mecánica de mostrarla y ocultarla con especificidad cero, para
  que las reglas de diseño le ganen. El campo de texto lo sigue fabricando el
  runtime: el sanitizador bloquea `<textarea>` a propósito, y ese bloqueo no se
  debilita por una ventana de contacto.

- **La hoja base del motor daba 24 px laterales a toda sección**, que se sumaban
  a los del contenedor y dejaban el contenido 24 px más adentro.

### Y una medida que conviene tener antes de tocar la portada

En producción, la portada **no usa región de encabezado**: lleva el suyo dentro
del HTML de la página, y sólo las interiores usan la región. El espejo local no
refleja eso —ahí la portada muestra el menú dos veces—, y es la trampa que
espera a quien recomponga la portada.

El trinquete de páginas sin composición baja de 8 a 7.

---

## 0.3.67 — 4 de octubre de 2026

### Lo que el catálogo decía y lo que el código hacía

Al empezar a recomponer el sitio de Santa Luisa por el constructor aparecieron
varias listas que se habían quedado atrás del código. Cristóbal lo nombró mejor
que yo: **«simplemente se trata de desactualizaciones»**. Tiene razón, y cambia
el arreglo: no se trata de escribir cada lista al día —volvería a pasar— sino de
que el validador y el catálogo lean la MISMA constante.

- **Cinco familias de regla no estaban publicadas.** `divisor`, `posicion`,
  `desborde`, `transformacion` e `icono` existen y funcionan desde el 3 y 4 de
  octubre, pero `cod_get_capabilities` no traía su esquema: quien lo leyera no
  tenía cómo saber que existían ni qué admitían. Ahora sus campos son constantes
  que usan los dos lados.
- `preferencias-cookies` faltaba además en `safeRuntimeBehaviors`, que ahora se
  arma a partir de la lista de behaviors en vez de repetirla.
- **Una prueba que compara las listas por su relación real**, que no siempre es
  la igualdad: los tipos de regla y sus esquemas tienen que coincidir
  exactamente; `safeRuntimeBehaviors` tiene que ser superconjunto (hay behaviors
  que se piden con una regla `motion`, no `interaction`); y los contratos de
  partes, subconjunto (sólo algunos fabrican partes). Comparar todo por igualdad
  daba siete falsos desfases, y una prueba con falsos positivos no la mira nadie.

### La identidad del tema, referenciable desde una regla

En este sistema el tema declara la paleta y las tipografías como variables y el
lienzo las extiende. Pero las reglas semánticas —`typography`, `color`,
`surface`— rechazaban `var()`, y eso dejaba dos salidas, las dos malas: copiar
los valores de la marca como literales dentro del diseño, o escribirlo todo con
reglas `properties`, que aceptan var() pero pierden el rol y la procedencia.

Ahora aceptan `var(--nombre)` y `var(--nombre, respaldo)`. El respaldo no admite
paréntesis, así que no se puede anidar otra función ni colar `url(`.

**Y la mitad que importa**, que salió de una precisión de Cristóbal —*«lo que
rechaza son las abreviaciones, pero no las variables»*—: admitir variables es
seguro sólo si lo que se EMITE va en forma larga, porque GrapesJS descarta en
silencio una abreviada con var(). Al permitirlas apareció justo ese caso:
`surface` con `borderColor` emitía `border-color:var(--x)`, que es abreviada de
las cuatro `border-<lado>-color`. Se validaba, se guardaba y no pintaba. Ahora
emite la forma larga cuando hay variable, y la prueba vigila la salida.

### Además

- `text-shadow` entra a la lista de propiedades: un párrafo sobre una foto lo
  necesita para separarse del fondo, y sin él había que dejarlo en CSS plano.
- `probar-mapa.php` fijaba el FINAL de la lista de behaviors en vez de que
  `mapa` estuviera en ella, así que se rompía al agregarle un hermano.

---

## 0.3.66 — 4 de octubre de 2026

### El constructor no podía decir lo que el sitio necesitaba

Cristóbal reclamó, con razón, que el sitio de Santa Luisa se hubiera subido como
HTML en vez de construirse por el constructor: «Tenemos un MCP hecho
especialmente para poder intervenir con nuestro Page Builder, tenemos un editor
de plantillas, tenemos unos módulos que permiten construir las piezas de la
página. ¿Y por qué lo subimos como HTML?».

Medido ese día, en el equipo y también en producción pidiendo las páginas como
cualquier visitante: **ninguna de las páginas de Santa Luisa tiene composición
registrada**. La portada son 578 KB con cinco nodos del sistema y **cero reglas
de diseño**; toda su apariencia sale de 77 KB de hoja plana propia de esa
página. La de términos es la única que asoma, con once clases de regla.

Al ir a recomponer la primera página aparecieron dos agujeros de vocabulario.
No excusan el método, pero explican el atajo: había cosas del sitio que el
constructor no podía expresar.

- **Un título con dos caras tipográficas.** Los títulos de Santa Luisa mezclan
  una cara script y una de caja alta —«Agenda» + «tu visita»— y un encabezado
  sólo aceptaba texto plano. Ahora acepta `segments`: de dos a cuatro tramos,
  cada uno con sus propias reglas, que salen como `<span>` dentro de un único
  encabezado. Sigue siendo **un solo título** para el lector de pantalla y para
  los buscadores, y el texto completo se **deriva** de los tramos, así que no
  puede desincronizarse. Lo que se lee del sitio se puede reenviar sin tocar: el
  primer intento rompía eso, que es el issue #8, y se corrigió antes de entrar.

- **El catálogo mentía sobre un behavior.** El botón de preferencias de cookies
  funcionaba desde siempre, pero la lista que `cod_get_capabilities` publica no
  lo mencionaba. Había dos listas y no coincidían. Eso importa más de lo que
  parece: quien lee el catálogo —una persona o una IA— concluye que la pieza no
  existe y la resuelve a mano en HTML. Un catálogo que miente empuja justo a lo
  que el catálogo existe para evitar. Ahora hay **una sola lista** y una prueba
  que pide cada behavior anunciado y comprueba que se acepta.

  (`reveal-on-scroll` parecía un tercer desajuste y no lo era: llega por una
  regla `motion`, no por `interaction`. Queda anotado para que nadie lo
  «arregle».)

### Para que esto no vuelva a pasar en silencio

- **Una página sin composición ahora sale en rojo en la batería.** Es un
  trinquete, no un semáforo: cada sitio declara cuánta deuda se le acepta hoy
  —Econut cero, el espejo de Santa Luisa ocho—, y si aparece una página nueva
  construida por fuera del constructor, la batería falla. Cuando se recompone
  una, el número baja y hay que bajar el techo. La deuda sólo puede ir en una
  dirección y no se puede volver a esconder en un comentario al pasar.

### Medido

- Las cuatro páginas interiores de Santa Luisa son **113 reglas** de contenido
  propio en total; la portada sola, **343**; y **33** selectores son cromo
  repetido en todas, que es material de región y no de página.

---

## 0.3.65 — 4 de octubre de 2026

### Corregido en el sitio de Econut (local)

- **El vídeo de la portada tapaba texto en escritorio.** No el panel blanco —eso
  es el diseño—, sino las palabras: medido en una ventana de 1440, el vídeo
  cubría **41 px del párrafo (cinco de sus siete líneas)** y la «e» final de
  «Servicio de verdad». El original de econut.cl tiene el mismo defecto; ésta es
  una divergencia deliberada, como la del icono de alerta.

  Se arregla dejando libre la franja por donde pasa el vídeo, y devolviéndole al
  texto por la izquierda el ancho que pierde por la derecha: **mover el bloque
  es mejor que estrechar la medida**. Con el primer intento el título se partía
  en tres líneas donde el original lo parte en dos.

  **La aritmética tiene truco y me equivoqué en el primer intento**, así que
  queda escrito: un relleno en porcentaje se mide contra el ancho del
  **contenedor**, no contra el del propio elemento. Puse 18% creyendo que eran
  151 px y eran 256.

  Comprobado sin texto tapado en 1024, 1280, 1440 y 1920.

### Corregido en las pruebas

- **`probar-precedencia-css.php` seguía exigiendo la arquitectura anterior.**
  Nació en la 0.3.42, cuando cada documento llevaba una copia de la hoja base y
  el problema era el orden entre esa copia y las reglas. La 0.3.63 quitó la
  copia, así que el defecto original ya no puede ocurrir: ahora comprueba que el
  documento salga limpio, y que el descarte siga actuando sobre los documentos
  antiguos, que sí la traen.

  **Llevaba dos versiones fallando sin que se viera, y la culpa es mía**: al
  resumir la batería filtré las líneas por su texto y uno de los filtros —`de
  17`— tapaba justamente su resultado. Un filtro que esconde un fallo es peor
  que no filtrar.

---

## 0.3.64 — 4 de octubre de 2026

### Cambiado

- **Las reglas de diseño salen del HTML: una hoja por DISEÑO.** Segundo paso de
  lo que empezó la 0.3.63, y el que Cristóbal pedía: «no tiene por qué
  generarse una hoja de estilo por cada página de un sitio; la hoja tiene que
  ser centralizada».

  La base es del **motor**, las reglas son del **sitio**, y ninguna de las dos
  es de la **página**. Ahora cada diseño tiene su hoja, escrita al aplicar una
  composición y servida como archivo con la huella de su contenido en el nombre
  —así el navegador la guarda para siempre y, si el diseño cambia, cambia el
  nombre—.

  | | antes | ahora |
  |---|---|---|
  | reglas en línea en la portada | 138 | **0** |
  | HTML de la portada | 198 KB | **179 KB** |
  | HTML de la página legal | 136 KB | **125 KB** |

  Y lo que no se ve en la tabla: esos 22 KB de reglas se descargaban **con cada
  página**; ahora se descargan una vez para todo el sitio.

### Lo que hubo que arreglar antes, y es lo más importante

- **Siete nombres de regla significaban dos cosas distintas.** Al medir qué se
  repetía apareció algo peor que la repetición: de 205 clases sólo 9 estaban en
  más de un documento, y siete de esas nueve decían cosas diferentes.
  `.cod-rule--titulo` era 40 px en una página y 34 en otra; `.cod-rule--aire`,
  54, 64 y 56; `.cod-rule--caja`, una rejilla de 1080 px en una y una caja de
  lectura de 760 en otra.

  Funcionaba **por casualidad**, porque cada página cargaba sólo su documento.
  Fundir las hojas sin arreglarlo habría cambiado el aspecto de páginas que
  nadie tocó.

  Significa además algo de fondo: el diseño todavía no era un sistema, sino
  variables locales de cada página que compartían nombre.

  - Las páginas de **muestra** del publicador (`/divisores/`, `/primitivas/`)
    pasan a su propio diseño, `contope-muestras`. Enseñan lo que la herramienta
    sabe hacer; no son páginas de Econut y no tienen por qué ocupar sus
    nombres. **El `designId` es el espacio de nombres**: dos diseños pueden
    llamar `caja` a cosas distintas sin estorbarse.
  - El **aire de la página legal** pasa a ser el mismo del sitio (54 px, antes
    64). Si algún día necesitara respirar distinto, la regla se llamará
    distinto: una excepción tiene que decir que lo es.

- **`probar-reglas-sin-colision.php`**, el guardarraíl: dentro de un mismo
  diseño, un identificador no puede compilar a dos declaraciones distintas. El
  compilador no puede verlo solo —sólo ve un documento a la vez—, así que hace
  falta mirar el sitio entero.

- **O todas por archivo, o todas en línea.** Encolar sobre la marcha y
  rendirse a mitad dejaba la página con las hojas de los diseños que sí tenían
  **y además** todo el CSS en línea: lo mismo dos veces. Ahora se miran todas
  antes de encolar ninguna.

Un sitio que todavía no haya aplicado ninguna composición desde esta versión se
sigue sirviendo como antes: actualizar el plugin no deja a nadie sin estilos.

---

## 0.3.63 — 4 de octubre de 2026

### Cambiado

- **La hoja base del lienzo sale de los documentos y pasa a ser un archivo del
  plugin.** Es el arreglo de fondo del que la 0.3.62 era sólo el parche.

  Hasta ahora `compile()` empezaba con `$styles = self::base_styles()` y esa
  copia quedaba escrita **dentro de cada documento**. Cada documento conservaba
  así una foto de la hoja del día en que se compiló, una página con encabezado,
  cuerpo y pie servía **tres copias de versiones distintas**, y la última ganaba
  y pisaba el diseño. La 0.3.62 lo resolvió descartando las repetidas al
  servir.

  Cristóbal, el 4 de octubre de 2026: «el proceso de deduplicación es como que
  hubieras pinchado un neumático y después lo tuvieras que parchar. Lo que
  necesitamos es que el neumático no se pinche. No tiene por qué generarse una
  hoja de estilo por cada página de un sitio; la hoja tiene que ser
  centralizada».

  **La razón de fondo es qué ES esta hoja**: no describe este sitio ni esta
  página, describe cómo se comporta una sección, una columna o una imagen en
  cualquier sitio hecho con el publicador. Es del motor, no del contenido, y le
  corresponde viajar con el plugin y versionarse con él.

  Qué cambia, medido sobre la portada de Econut:

  | | antes | ahora |
  |---|---|---|
  | copias de la hoja base en el HTML | 3 | **0** |
  | documento del encabezado | 3,6 KB | **1,2 KB** |
  | documento del pie | 4,7 KB | **2,3 KB** |
  | documento de la portada | 18,8 KB | **16,4 KB** |

  Y como archivo, el navegador la guarda **una vez** y la reusa en todas las
  páginas; incrustada en el HTML se volvía a descargar con cada página.

  **La fuente sigue siendo una sola**: `base_styles()`. El archivo se genera de
  ella con `scripts/generar-css-base.php`, y `probar-css-base.php` comprueba
  que digan lo mismo, así que un olvido se nota en la batería y no en el sitio.

  **Hay que encolarla temprano**, y costó una vuelta descubrirlo: pedida
  durante el dibujado de la página, WordPress la imprime en el **pie** —después
  de las reglas de diseño— y vuelve a pisarlas. El mismo defecto, movido de
  sitio. Va en `wp_enqueue_scripts`.

  El editor la carga en su lienzo desde el mismo archivo, para que muestre lo
  mismo que la página publicada.

  **El descarte de la 0.3.62 se queda**, pero ya sólo como red para los
  documentos compilados antes de este cambio: cuando se recompilan, dejan de
  traerla.

---

## 0.3.62 — 4 de octubre de 2026

### Corregido

- **La hoja de estilos base se emitía TRES veces, y la última pisaba el
  diseño.** Es el defecto de fondo del día y explica desprolijidades repartidas
  por todo el sitio.

  El deduplicador comparaba **la línea entera**. Bastó cambiar una declaración
  de la base —añadirle `height:auto` a las imágenes, en la 0.3.61— para que la
  copia guardada dentro de cada documento dejara de coincidir, sobreviviera, y
  al quedar **después** en la hoja ganara sobre todas las reglas de diseño
  anteriores.

  Se vio en el encabezado de Econut: `.cod-group{display:grid}` de una base
  vieja vencía a la regla que ponía los iconos de redes en fila, y los dejaba
  apilados en vertical, con el encabezado midiendo 168 px en un teléfono.

  Ahora se compara por **selector**: una base de cualquier versión anterior se
  reconoce igual y se descarta, y la única que queda es la de esta versión,
  delante de todo.

- **Una imagen con alto y ancho declarados perdía su proporción.** La 0.3.61
  les puso `width` y `height` para reservar el hueco, pero sin `height:auto` el
  atributo se impone: la foto conserva el alto del **archivo** mientras el
  ancho se limita al de su caja. En las tarjetas de servicio la caja daba
  200×462 para una foto que se dibujaba 200×150, con **312 px de hueco muerto**
  debajo. Es el espacio que Cristóbal señaló.

### Corregido en el sitio de Econut (local)

Todo esto salió de auditar la página midiendo, no mirando.

- **El vídeo de la portada se montaba sobre los tres textos en teléfono**: 48 px
  sobre el título, 65 sobre el subtítulo y 273 sobre el párrafo. Los ajustes
  móviles cambiaban el ancho de las dos piezas pero ninguna salía de la celda
  de rejilla, así que seguían apiladas. En escritorio ese apilado es el efecto
  buscado; en un teléfono, no.
- **Lo mismo en tablet**, que además es una banda aparte y hay que escribirla
  aparte: a 768 px la columna de texto quedaba en 248 px dentro de una caja de
  444 —el texto corría en una tira de unos 30 caracteres—.
- **Los logos de certificación se aplastaban a 32 px.** La marquesina reparte
  el ancho de su caja entre los visibles descontando las separaciones; con
  cuatro a la vista y 97 px entre medio —medidas del original, para una caja de
  810 px— en la columna de 419 px de una tablet quedaban 32 px por logo. La
  separación es lo que se encoge, no el logo.
- **El texto de sustentabilidad corría en 121 px en teléfono.** Una regla
  `properties` sin alcance pisaba la rama móvil de la regla `layout`. **Es una
  trampa del sistema que conviene tener presente**: cuando una `properties`
  toca algo que una `layout` ya resuelve por breakpoint, hay que darle su
  propia versión móvil o gana en todas partes.
- **En el encabezado, dos iconos de redes caían sobre el logotipo.** La barra
  reparte en tres y a 375 px cada lateral queda en 65 px para cuatro cuentas
  que necesitan 150. Ahora se parte en dos filas: apilar es mejor que achicar,
  porque el logotipo es la identidad.

---

## 0.3.61 — 4 de octubre de 2026

### Agregado

- **El selector de iconos.** Busca sobre el catálogo de Material —6.126 iconos—
  con filtro por categoría, ordenado por uso real en la web, y al elegir uno lo
  trae al sitio en sus tres estilos.

  **Se busca en castellano.** Las etiquetas de Material están en inglés, así
  que sin esto el buscador era inútil: medido, «truck» encontraba cuatro
  camiones y «camión» ninguno. Hay una tabla de sinónimos con las palabras con
  las que uno busca un icono; si falta una, se agrega en una línea.

  La vista previa la dibuja la tipografía de Material, **alojada en el sitio y
  cargada sólo en el panel** —el editor no puede referenciar un CDN, es regla
  del proyecto y hay una prueba que la hace cumplir—. A la página publicada no
  llega nunca: allá cada icono es su propio SVG.

  Y se dibuja **por punto de código, no por ligadura**: escribir el nombre
  falla en los que empiezan por un número, como `10k`.

- **El estilo de los iconos se elige en Configuración.** Uno para todo el
  sitio. Cambiarlo no exige rehacer ninguna página, porque los documentos
  guardan el nombre del icono y no el archivo.

- **Un panel de icono en el inspector**, con el set, un SVG propio, dónde va,
  tamaño, separación y color —o heredarlo del texto, que es lo normal—.

### Corregido

- **Las imágenes se descargaban enteras y todas a la vez.** Medido en la
  portada de Econut: 33 imágenes, **ninguna** con `srcset`, **ninguna** diferida
  y **una sola** con alto y ancho. La página pedía siempre el archivo original
  —la línea de selección venía de 2560×1707 para mostrarse a 400×300— y sumaba
  **6,6 MB**. WordPress ya tenía generados los tamaños intermedios; no los
  usábamos.

  Cristóbal lo planteó con la analogía justa: «pienso en lo que pesa un mapa y
  cómo se hace streaming para que la descarga sea gradual a medida que se
  navega o se hace zoom». Son las mismas dos ideas:

  - `srcset` es el nivel de zoom: el navegador pide la resolución que de verdad
    va a dibujar.
  - `loading="lazy"` es el encuadre: lo que está fuera de pantalla no se baja
    hasta acercarse.

  Y una tercera que no se ve pero que Google mide: **declarar alto y ancho
  reserva el hueco**, así la página no salta cuando cada foto llega.

  **La primera imagen no se difiere**: es la que decide cuándo se considera
  cargada la página, así que va con prioridad.

  Resultado sobre la portada: **de 4.874 KB a 827 KB de imágenes**, y de 6,6 MB
  a 1,9 MB en la primera pantalla.

  El fallo que lo mantenía a medias merece quedar escrito: las composiciones
  guardan rutas **relativas** —a propósito, para sobrevivir a un cambio de
  dominio— y la búsqueda en Medios sólo entiende la dirección completa. Sin
  completarla, el `srcset` salía vacío en las 33.

- **Los JPEG se guardan en descarga progresiva.** Uno normal se dibuja línea a
  línea y hasta el último byte la mitad de abajo es un hueco; uno progresivo
  aparece entero y borroso enseguida y se afina. Es la misma idea del mapa,
  dentro de un archivo. Idea de Cristóbal. Y pesan entre un 3% y un 16% menos.

  WordPress no expone ningún filtro para esto, así que el plugin registra su
  propio editor de imágenes: el de siempre, encendiendo el entrelazado justo
  antes de guardar. Sin recomprimir nada de más.

  Para lo ya subido está `scripts/pasar-jpeg-a-progresivo.php`, que no toca un
  archivo si la conversión no gana tamaño: no vale una generación de pérdida
  a cambio de nada.

---

## 0.3.60 — 4 de octubre de 2026

### Agregado

- **Un set base de iconos, y un icono puede pedirse POR NOMBRE.**

  Cristóbal ofreció poner gente a mirar cientos de sitios para deducir un set
  estándar. No hizo falta: el catálogo de Material publica, por cada uno de sus
  **6.126 iconos, cuántas veces se usa en la web**. `search` encabeza con
  863.455.

  Pero ese ranking no se puede tomar tal cual, y conviene saber por qué: lo
  dominan **aplicaciones y paneles**, no sitios. Su top 50 está lleno de
  `account_circle`, `logout`, `manage_accounts`, `dashboard` y `fingerprint`.
  Así que el set usa el ranking como espina dorsal y lo filtra por lo que un
  sitio necesita. **69 iconos**, y en el código cada uno lleva su puesto
  mundial, para que una elección se discuta con el dato a la vista.

  Más **las 9 redes** —Instagram, Facebook, LinkedIn, YouTube, TikTok, X,
  Threads, Pinterest y WhatsApp—, que no están en Material porque son marcas
  registradas pero el plugin ya las llevaba dibujadas, y en la misma retícula
  de 24, de un solo trazo y sin color propio. WhatsApp deja así de estar
  escrito dentro del compilador, que es el reclamo que originó todo esto.

- **El estilo es un ajuste del SITIO, no de cada icono.** Material trae cada
  icono en tres estilos, y elegirlo uno por uno es justamente como se desordena
  un sistema: si un sitio es redondeado, lo son sus cuarenta iconos. Cristóbal:
  «creo que debería quedar en sus 3 estilos cuando se selecciona».

  De ahí sale la decisión que ordena todo lo demás: **el documento guarda el
  NOMBRE, no el archivo.** Si guardara el archivo, cambiar el estilo del sitio
  obligaría a reescribir todas las páginas una por una. Guardando el nombre, se
  cambia un ajuste y cambian todos los iconos de golpe. Comprobado sobre la
  página servida: el mismo documento, sin tocar una letra, da otro dibujo.

  Es el mismo patrón que la forma del divisor —la ruta en el documento, el
  dibujo al servir— un escalón más arriba.

  La regla admite las dos vías y **sólo una a la vez**: `forma` para cualquier
  SVG del sitio —lo que mantiene el sistema abierto— y `nombre` para un icono
  del set.

- **El set vive en `uploads/contope-iconos`, sin año ni mes.** WordPress archiva
  lo que se sube por fecha, y para una foto está bien; para esto no. Un icono
  se busca por nombre, y repartirlo entre `2026/10` y `2026/11` según cuándo se
  descargó obligaría a recorrer carpetas o a guardar la fecha junto al nombre.

### Decisiones que conviene conocer

- **No se incrusta la tipografía de Material.** La familia completa pesa ~3,7 MB
  y volvería a ser un repertorio cerrado —lo mismo que rechazamos para los
  divisores—. Como SVG, cada icono es un recurso del sitio: se recolorea con
  `currentColor` y se reemplaza por el dibujo que uno quiera. La tipografía sí
  sirve, pero en el SELECTOR del panel, donde su peso no le cuesta nada al
  visitante. La idea es de Cristóbal y es mejor que la primera propuesta.
- **El peso y el relleno no se precargan**: tres estilos por cinco pesos por dos
  rellenos son treinta archivos por icono. Se traen cuando el sitio cambie su
  ajuste.
- **Nunca se descarga al servir una página.** Una visita no puede depender de
  que Google responda. Si el estilo pedido no está, se cae a otro que sí esté:
  un icono con el estilo equivocado se nota y se arregla; un hueco, no.
- Licencia: Material Symbols es Apache 2.0, redistribuible y compatible con la
  GPLv3 del plugin.

---

## 0.3.59 — 4 de octubre de 2026

### Corregido

- **El divisor pasa a ir DETRÁS del contenido.** La 0.3.58 le dio su propio
  hueco, y eso evita el solape, pero no lo resuelve: Cristóbal lo vio enseguida
  —«no sé si está resuelto, porque se ve bien en la página porque dejaste el
  espacio»—. En cuanto el solape ocurre por cualquier otra vía —un texto más
  largo, otro breakpoint, una previsualización— el divisor volvía a tapar las
  letras.

  La causa: **un elemento posicionado se pinta encima del texto en flujo aunque
  no declare `z-index`.** Así funciona el orden de pintado, y no hacía falta
  ningún `z-index:1` para que tapara —aunque lo teníamos—.

  Ahora va en capa negativa. Entre una forma y una palabra, gana la palabra.
  Con `profundidad: "delante"` vuelve a montarse encima, para cuando eso sea lo
  buscado.

  El contenedor se **aísla** (`isolation`), que es lo que hace posible la capa
  negativa: sin eso, un hijo en capa negativa se va detrás del fondo de su
  propio contenedor y desaparece.

  Son dos mecanismos independientes y los dos hacen falta: la reserva evita que
  se solapen, y la profundidad decide quién gana cuando igual se solapan.

  La comprobación cubre además que **los dos motores digan lo mismo** —el del
  editor y el de la página publicada son copias distintas—, porque un divisor
  que se ve de una forma al componer y de otra al publicar es el defecto más
  caro de encontrar.

---

## 0.3.58 — 4 de octubre de 2026

### Agregado

- **El divisor se reserva su propio hueco.** Un divisor está posicionado contra
  el borde de su sección —tiene que estarlo, o no toca el filo—, así que no
  ocupa sitio en el flujo y se monta sobre lo que haya debajo. Divi tiene el
  mismo comportamiento y deja el cálculo al que diseña.

  Cristóbal, al ver una cordillera comerse un párrafo: «no genera el espacio
  que necesita, cae sobre el texto». Ahora el divisor emite un bloque vacío de
  su alto dentro del flujo, antes o después del contenido según dónde vaya, y
  con el alto de la **capa más alta**, que es la que asoma.

  **Por qué un bloque y no relleno en la sección:** el relleno ya lo declara la
  regla de espaciado, y sumarle algo desde acá exigiría conocer su valor, que
  puede venir de varias reglas y cambiar por breakpoint. Un bloque en el flujo
  se suma solo, sin saber nada de lo que hay.

  Con `reserva: false` vuelve a flotar, que es lo que se quiere cuando el
  solape ES el efecto buscado.

### Corregido

- **Un color con la sintaxis moderna de barra se perdía sin avisar.**
  `rgb(229 0 126 / 0.3)` es CSS correcto, pasaba nuestra validación, se
  guardaba… y no pintaba: `safecss_filter_attr` de WordPress lo descarta al
  limpiar el atributo `style`. La declaración existía en el documento y no
  hacía nada, que es la peor forma de fallar.

  Ahora se rechaza al componer. La opacidad se escribe dentro del propio
  color, con un hexadecimal de ocho dígitos: `#E5007E4D`.

  Lo destapó el icono de alerta de Econut, que salía gris en vez de rosa.

### En el sitio de Econut (local)

- **El triángulo de alerta dejó de ser un fondo.** Iba como fondo de la sección
  al «7% auto» —un porcentaje del **ancho**—, con dos defectos a la vez: en una
  ventana de 1440 la franja mide 38px y el icono se dibujaba de 100×91, cortado
  arriba y abajo; y al ser fondo no participa de la línea, así que el texto se
  le montaba encima.

  Ahora va con la familia `icono`, dentro del párrafo. El dibujo se vectorizó
  desde el PNG original midiendo su canal alfa: resultó ser de **un solo color**
  con el signo de exclamación como **hueco**, no una forma blanca. Por eso el
  color viene de la regla y puede cambiarse desde el panel.

- **Una cordillera en tres capas** entre «Nuestra historia» y las cifras, con
  la transparencia bajando hacia atrás: perspectiva aérea, lo lejano más
  pálido. El color es el de la banda siguiente entrando sobre el blanco, así
  que no se introduce ningún color nuevo.

---

## 0.3.57 — 3 de octubre de 2026

### Agregado

Cuatro familias que hasta hoy había que escribir como CSS suelto —por la
salida de emergencia de `properties`— y que ahora tienen su propia clase de
regla, su control y su declaración en el catálogo. Son las que Divi reparte
entre su pestaña «Avanzado» y subsistemas aparte; acá son lo que son:
propiedades visuales del objeto, en Diseño, con el mismo trato que un color.

- **Posición**, con el orden de capas dentro. `pegada` es **un modo más** y no
  un subsistema: criterio de Cristóbal —«para mí sticky es una propiedad
  visual que se maneja igual que cualquier posición de css»— y es donde más
  nos separamos de Divi, que le dedica 483 referencias de código aparte.

  Dos cosas que resuelve sola, y son las dos formas en que una posición pegada
  falla **sin avisar**:

  - **Sin distancia no se pega nunca.** El navegador la deja quieta y parece un
    control roto. Si no se declara, se pone en cero.
  - **Dentro de algo que recorta, tampoco.** Y la causa está en un
    ANTEPASADO, no donde uno la busca. Esa combinación ahora se rechaza al
    componer **nombrando los dos nodos**.

  El orden de capas va acotado a ±100 a propósito. Un z-index de 9999 es
  siempre el síntoma de una pelea que se ganó a martillazos, y obliga al
  siguiente a poner 10000.

- **Desborde**, que existe por dos razones concretas y no por completitud:
  recortar es la única forma de que una esquina redondeada afecte al contenido
  de dentro, y es además lo que rompe una posición pegada. **No se ofrece sobre
  un texto**, a diferencia de Divi, que la da a todos sus módulos: lo que
  recorta es una caja con algo dentro que puede salirse; un texto que no cabe
  se resuelve con tipografía, no cortándolo.

- **Transformación**: girar, escalar, mover o inclinar sin tocar el espacio que
  ocupa. No es `movimiento` —aquélla es una animación, algo que pasa en el
  tiempo; ésta es un estado—. Lo mejor sale gratis: **«crece al pasar el ratón»
  es la misma regla con estado hover**, porque cualquier regla tiene alcance.
  Divi necesita para eso declarar un gemelo de hover por cada campo.

  El orden de `transform` no es arbitrario y está escrito: mover y después
  girar no es lo mismo que girar y después mover.

- **Icono**, de donde salió: Cristóbal, mirando el icono de WhatsApp del pie,
  «eso no debería ser hardcoded; todo elemento de un módulo debería tener su
  propia configuración». Mismo principio abierto que el divisor —el dibujo es
  un SVG de Medios, no una lista cerrada— y **la decisión contraria en lo único
  que importa**: un divisor se estira a lo ancho y esa deformación es lo que se
  le pide; un icono no se deforma nunca.

  El color no se declara por omisión: lo hereda del texto al que acompaña, que
  es lo que hace que cambiar la tinta del sistema lo arrastre sin tocar la
  página.

- **Cinco iconos de partida** en Medios —flecha, hoja, reloj, ubicación,
  correo—, igual que las formas de divisor: no son el catálogo, son para que la
  biblioteca no esté vacía el primer día.

- **La ventana del lápiz** suma orden de capas, desborde y transformación, con
  un aviso cuando recortar va a impedir que algo se pegue. Girar y escalar se
  escriben juntos, porque `transform` es UNA propiedad y escribir uno por su
  lado borra al otro.

- **Una página de muestra: `/primitivas/`.** Tres de las cuatro sólo se ven
  funcionando —una pegada necesita que la página se desplace, un recorte
  necesita algo que se salga, un hover necesita un ratón—, así que una hoja de
  contactos no servía.

### Corregido

- **`.4em` ya no se rechaza.** Es CSS válido y se escribe así a menudo; que no
  pasara era una trampa de la expresión regular, no una regla de diseño.

---

## 0.3.56 — 3 de octubre de 2026

### Agregado

- **Un divisor puede tener capas.** La misma forma repetida detrás de sí misma,
  corrida a lo ancho y con menos opacidad. Cristóbal, al ver la muestra: «los
  divisores quedan como un poco duros; tal vez que se puedan aplicar dos capas
  con diferentes niveles de alfa, y con desplazamiento».

  Tiene razón y el porqué vale anotarlo: **una forma sola lee como un recorte**
  —la banda de abajo mordiendo a la de arriba, y nada más—. Dos o tres corridas
  entre sí leen como profundidad, que es lo que uno quiere de una onda. Divi no
  tiene esto: sus divisores son de una sola capa.

  Tres decisiones:

  - **Una capa hereda del divisor todo lo que no declara** —forma, color, alto,
    repetición, volteado—. No son divisores apilados, es un divisor con grosor;
    por eso cambiar la forma cambia las tres capas de una vez.
  - **El desplazamiento es horizontal.** Mover una capa hacia arriba dejaría al
    descubierto la franja de abajo, porque un divisor es una masa que tapa
    apoyada en el borde. La variación vertical se consigue dándole a la capa
    otro alto, que además deforma la silueta y queda mejor.
  - **Cuatro capas como tope.** No es una limitación técnica: pasadas tres o
    cuatro translúcidas el degradado se empasta y la forma deja de leerse.

  Y un detalle que no se ve pero sin el cual nada de esto funciona: al correr
  una capa, su dibujo se hace **más ancho que su caja** y se corre hacia atrás
  la misma medida. Sin eso, desplazar una capa 60 px abre un hueco de 60 px en
  un borde.

- **El control de capas en el inspector**, con opacidad, desplazamiento y alto
  por capa. Una capa nueva entra ya tenue y ya corrida: en 1 y sin desplazar
  sería invisible y parecería que el botón no hizo nada.

### Corregido

- **Los colores de la muestra de divisores salen de un ciclo y no escritos a
  mano.** Al insertar dos muestras al principio quedaron catorce bandas con el
  color del divisor equivocado —el de un divisor es el de la banda siguiente—.
  Ahora insertar una muestra en medio no obliga a recolorear las demás.

---

## 0.3.55 — 3 de octubre de 2026

### Agregado

- **Catorce formas de divisor, de partida.** Pendiente, pendiente suave, onda,
  onda suave, ondas, curva, curva invertida, cerros, cordillera, triángulo,
  dientes, escalones, nubes y asimétrica. Están en Medios y se ven en
  `/divisores/`.

  **No son el catálogo.** Son para que la biblioteca no esté vacía el primer
  día: cualquier SVG del sitio sirve como divisor. Divi trae 27 y ahí se acaba.

  Se generan con `scripts/generar-formas-divisor.mjs` y no están dibujadas a
  mano, porque una onda tiene amplitud y número de crestas y unos cerros tienen
  cumbres y valles: escritas como geometría se ajustan cambiando un número.

  Van **sin `fill` propio** —el color lo pone el diseño— y con el área cerrada
  contra el borde inferior, porque un divisor no es una línea sino una masa que
  tapa.

- **El color entra al contrato de la regla `divisor`.** El color de un divisor
  es casi siempre el de la sección **siguiente**: es la banda de abajo
  invadiendo a la de arriba, no una pieza de un tercer color. Equivocarse en
  eso es el error más común al usarlos.

### Corregido

- **Una `section` no dibujaba su divisor.** El marcador se inyectaba sólo en
  los `group`, y una sección —que es donde un divisor tiene sentido y donde el
  catálogo lo ofrece— se quedaba sin él. Ahora va en `section`, `header` y
  `footer`.

  Y va **fuera** de la caja de columnas: tiene que apoyarse en el borde de la
  sección y no en el de su contenido, o queda metido hacia adentro por el
  relleno.

- El ancla de posición pasa a `:where(section, header, footer, .cod-node):has(> .cod-divisor)`,
  para que el contenedor se vuelva relativo solo en vez de exigírselo al diseño.

### Comprobado

- Sobre la página servida `/divisores/`: 15 divisores —las 14 formas más la
  segunda pieza de «arriba y abajo»—, todos con su SVG, posicionados, y con el
  color de la banda siguiente.

---

## 0.3.54 — 3 de octubre de 2026

### Agregado

- **Divisores: el borde no recto entre una sección y la siguiente**, con la
  forma abierta. Controles: forma, color, alto, repetición, voltear y dónde
  (arriba, abajo o ambos).

  Tres decisiones, con su porqué:

  - **El SVG va en línea y no en una `<img>`**, porque el color tiene que poder
    cambiarse y una imagen externa no se recolorea desde CSS.
  - **Se inyecta al mostrar la página y no al componer.** El documento guarda
    sólo la ruta, así que reemplazar el archivo llega a todas las páginas sin
    recomponer ninguna. Mismo patrón que la clave de Mapbox y las cuentas de
    redes.
  - **Se limpia otra vez al inyectarlo**, aunque ya se hubiera limpiado al
    subirlo: un archivo puede haber llegado a `uploads` por FTP o por una
    migración sin pasar nunca por nuestra subida.

  El volteado es CSS y no un archivo distinto —que es la mitad de las 27 formas
  de Divi: son pares de lo mismo invertido—.

- **El control del divisor en el inspector.** La forma se elige de la
  biblioteca de Medios, pidiendo sólo SVG. El panel aparece únicamente donde el
  catálogo declara la familia; no hay condiciones escritas en la interfaz.

  La previsualización **no se guarda**: dentro del editor el runtime le pone la
  forma como máscara leyendo su atributo, y la quita al salir.

---

## 0.3.53 — 3 de octubre de 2026

### Corregido

- **El contenido en bloques respeta el ancho de la página.** El texto iba de
  borde a borde: 1837 px en una ventana de 1900. La medida no se inventó —el
  tema ya declara `contentSize: 1180px` en su `theme.json` y WordPress la
  publica como variable CSS—; lo que faltaba era usarla.

  `supports.layout` **no sirve en este bloque** y conviene saberlo: su render
  emite también el encabezado del sitio, así que la salida empieza con un
  `<header>` y WordPress le pone la clase de disposición al primer elemento que
  encuentra. Medido: `is-layout-constrained` terminó en el `<header>`.

---

## 0.3.52 — 3 de octubre de 2026

### Corregido

- **El cuadrante es una unidad con identidad, y su contenido es libre.** La
  0.3.51 lo dejaba clavado a imagen + título + párrafo. El patrón bueno estaba
  en el propio WordPress: `core/tab-panel` tiene identidad y acepta cualquier
  cosa dentro. Lo que se bloquea es la **cantidad** —cuatro, porque es una
  cuadrícula de 2×2— y no lo que va dentro de cada uno.

---

## 0.3.51 — 3 de octubre de 2026

### Agregado

- **El módulo de cuadrantes toma bloques de WordPress.** Las cuatro fotos, los
  cuatro títulos y los cuatro textos son `core/image`, `core/heading` y
  `core/paragraph`, editables en el editor de WordPress. El módulo sólo los
  redistribuye.

  No hubo que tocar el runtime, y eso es lo que hace barato seguir con los
  demás módulos: de sus hijos sólo exige que sean cuatro y que cada uno tenga
  una imagen más algo de texto.

---

## 0.3.50 — 3 de octubre de 2026

### Corregido

- **El encabezado del sitio es global de verdad.** Se resolvía dentro de
  `render_shortcode`, así que una página tenía encabezado sólo si su contenido
  estaba guardado dentro del publisher. Una página con su contenido en bloques
  salía sin encabezado, sin pie y sin estilos.

### Agregado

- **El bloque `contope/lienzo`**: un contenedor cuyo contenido son bloques de
  WordPress de verdad, editables en su editor. ContOpe pone la forma alrededor.
  Es aditivo: las páginas con shortcode siguen funcionando igual.

---

## 0.3.49 — 3 de octubre de 2026

### Agregado

- **Se pueden subir SVG a Medios, y se limpian al subirlos.** WordPress no lo
  permite, y la razón técnica es real: un SVG es un documento XML y puede
  traer JavaScript dentro. Pero la consecuencia práctica es que un sitio no
  puede usar vectores, que es la forma correcta de un logotipo, un icono o un
  pin de mapa. Un PNG de un pin se ve borroso en cuanto alguien amplía.

  Lo que hacen los plugins habituales para esto es abrir el tipo de archivo y
  guardar lo que llegue tal cual, y por eso tienen mala fama: eso deja el
  agujero entero. Acá el SVG **se limpia antes de escribirse en el disco**, así
  que lo que queda guardado ya no puede ejecutar nada:

  | Se va | Por qué |
  |---|---|
  | `<script>` | lo evidente |
  | `<foreignObject>` | mete HTML dentro del SVG, y con él cualquier cosa |
  | atributos `on*` (`onload`, `onclick`…) | son guiones escritos en un atributo |
  | `javascript:` y `vbscript:` | lo mismo, en una dirección |
  | `<use>`, `<image>` o `<a>` hacia otro servidor | traen un fragmento ajeno y lo dibujan como propio |
  | `<!ENTITY>` y entidades externas | por ahí entra el ataque de XML que lee archivos del servidor |
  | `<?xml-stylesheet?>` | trae una hoja de estilos de fuera |

  Y lo que **no** se toca, porque es dibujo legítimo: los `href` internos
  (`#pieza`), los gradientes `url(#g)`, las rutas relativas del propio sitio y
  las imágenes incrustadas en base64.

  Sólo puede subirlos quien ya tiene `unfiltered_html` —administradores y
  editores—, que es la capacidad con la que WordPress ya marca «de esta persona
  nos fiamos para meter marcado». En un sitio con autores o colaboradores, para
  ellos el SVG sigue rechazado: limpiar está bien, pero no es razón para
  ampliarle los permisos a quien no los tenía.

  Un archivo que no se puede leer como XML se rechaza con un mensaje que dice
  qué hacer, en vez de guardarse a medias. Lo que no se puede analizar tampoco
  se puede limpiar.

  Esto **no** toca los SVG que genera el propio plugin dentro de una página
  —el mapa de OpenStreetMap, por ejemplo—: ésos no pasan por la subida de
  archivos. Son dos caminos distintos.

  Se apaga entero con el filtro `cod_permitir_svg`.

### Corregido

- **El mapa abierto ya no se encierra en la columna donde está el mini.** El
  mapa grande mide 100% de la raíz de la conducta, y cerrada esa raíz mide lo
  que mide el mini: 60 píxeles. Puesto como el sitio lo necesita —el mini al
  lado de la dirección, en una columna del pie— el mapa se abría dentro de esa
  columna: 347 píxeles de ancho en un pie de 1080, y en una fila flexible salía
  directamente de ancho cero, descargando Mapbox y levantando su lienzo para no
  mostrar nada.

  Ahora, al abrirse, la raíz reclama su ancho: `flex-basis:100%` para bajar a su
  propia línea en una fila flexible, y `grid-column:1 / -1` para abarcar todas
  las columnas de una grilla. Donde el contenedor no sea ni una cosa ni la otra,
  ninguna de las dos declaraciones hace nada. El tope lo sigue poniendo el
  sitio, que es quien sabe cuánto mide su contenido.

  Medido en el pie de Econut: de **347×400 a 961×400**.

### Cambiado

- **El mapa ofrece la salida desde el primer segundo, no sólo cuando falla.**
  Mapbox GL necesita WebGL. Donde no lo hay, el módulo ya lo detectaba y lo
  decía en el acto. Pero quedaba un caso peor: WebGL presente y el mapa que no
  termina de cargar nunca. Ahí se veía un recuadro **en blanco durante 20
  segundos** antes de que apareciera ningún mensaje.

  Ahora el enlace «Cómo llegar» —a OpenStreetMap, con las coordenadas— aparece
  junto a «Cargando el mapa…» desde el principio, y la espera baja de 20
  segundos a 8. Nunca queda un recuadro muerto.

  Esto salió de una pregunta de Cristóbal que vale la pena dejar escrita: «no
  estamos trabajando para un navegador específico». La escalera completa,
  comprobada sobre la página servida:

  | Situación | Qué ve |
  |---|---|
  | sin JavaScript | el mini es un enlace real a OpenStreetMap con las coordenadas, y su imagen es del propio sitio |
  | con JavaScript, sin WebGL | el aviso y «Cómo llegar», de inmediato |
  | con WebGL que no carga | «Cargando el mapa… / Cómo llegar» desde el primer segundo; a los 8 s, el aviso |
  | todo bien | el mapa |

  Los dos motores —`cod-behaviors.js` y `cod-canvas-public.js`— son copias
  separadas y llevan el cambio los dos.

### Comprobado

- `scripts/probar-svg.php`: el pin real del sitio sobrevive entero —mismos
  `<path>`, mismo `viewBox`, mismos colores—, y diez formas de meter código
  dentro de un SVG salen todas. Están las dos mitades a propósito: comprobar
  sólo que un SVG limpio pasa es comprobar que la puerta abre, no que haya un
  guardia en ella.

  La prueba encontró un fallo real en lo recién escrito: con un archivo **vacío**
  —lo que deja una subida cortada— el limpiador lanzaba un error fatal de PHP 8
  en vez de rechazarlo.

---

## 0.3.48 — 3 de octubre de 2026

### Corregido

- **Las etiquetas de medición ya no se cargan antes de que el visitante
  acepte.** Es el cambio más importante de esta versión y se publica como
  corrección y no como mejora, porque lo que había era un defecto.

  Lo que pasaba, medido el 3 de octubre en un sitio en pruebas: la portada
  pedía `googletagmanager.com` y `ad.doubleclick.net`, y dejaba puesta la
  cookie publicitaria `_gcl_au`, **con el banner de cookies todavía en
  pantalla y sin que nadie lo hubiera tocado**. Las etiquetas se imprimían en
  cuanto se cargaba la página, sin preguntarle nada a nadie.

  No era un error de configuración del sitio. Importa la diferencia, porque
  decide dónde se arregla: un sitio puede configurar mal su banner, pero que la
  etiqueta se imprima antes del consentimiento no es algo que el sitio pueda
  configurar. Si el plugin pone la etiqueta, el plugin tiene que poner la
  puerta.

  **Cómo quedó.** Cada etiqueta declara a qué categoría pertenece —medición o
  publicidad— y espera a que esa categoría esté concedida:

  | Etiqueta | Espera |
  |---|---|
  | Google Analytics 4 | medición |
  | Google Ads y sus conversiones | publicidad |
  | Pixel de Meta | publicidad |
  | Google Tag Manager | cualquiera de las dos |
  | Verificaciones de propiedad | nada: son `<meta>`, no piden nada a la red |

  Tag Manager espera cualquiera de las dos porque no es una herramienta de
  medición: es el transporte de las que se cuelguen dentro. Atarlo sólo a
  medición dejaría sin funcionar una conversión de publicidad en el caso —poco
  común, pero real— de quien acepta publicidad y rechaza medición.

  **Y empieza a medir en el momento en que se acepta, sin recargar.** La
  etiqueta no se omite: se imprime dormida, como `type="text/plain"`, que es un
  guion que el navegador no ejecuta. El gestor de consentimiento la despierta
  cuando la persona concede la categoría. Con CookieAdmin funciona así; con
  otro gestor la etiqueta se queda dormida y la medición empieza en la página
  siguiente, cuando el plugin ya lee la respuesta desde el servidor. Peor, pero
  el orden sigue siendo el correcto: primero el permiso.

  **Consent Mode v2 de Google**, además de la puerta y no en vez de ella. Se
  imprime siempre —es inline, no pide nada a la red y no pone ninguna cookie— y
  declara todo denegado de partida. Hace falta porque la puerta cubre lo que
  imprime este plugin, y esto cubre lo que el sitio cuelgue desde dentro de Tag
  Manager, donde el plugin no manda. `security_storage` va concedido: es lo que
  impide un fraude, y denegarlo no protege a nadie.

### Cambiado

- **Sin gestor de consentimiento, el sitio queda como estaba.** Esto es una
  decisión y no un olvido. El repositorio es público y hay forks instalados en
  sitios que no conozco; un plugin que al actualizarse apagara en silencio la
  medición de un sitio que no tiene banner haría un daño peor que el que viene
  a arreglar, y silencioso, que es la peor clase. Donde hay banner la puerta
  funciona; donde no lo hay, la pantalla de Configuración ahora lo dice con
  todas sus letras, nombrando la Ley 21.719 y su fecha.

  Se reconocen CookieAdmin, CookieYes, Complianz, Cookie Notice, Borlabs e
  iubenda. Para otro gestor están los filtros `cod_consentimiento_hay_gestor`,
  `cod_consentimiento_exigir`, `cod_consentimiento_concedidas`,
  `cod_consentimiento_cookie` y `cod_consentimiento_atributo`.

- **El modo de fallo es «no se mide».** Si la cookie del gestor cambia de
  formato y el plugin deja de reconocerla, todo queda denegado. Es a propósito:
  el formato de la cookie de un plugin de terceros no es un contrato, y entre
  equivocarse hacia «no medí» y equivocarse hacia «medí sin permiso», sólo una
  de las dos es un problema legal.

### Comprobado

- `scripts/probar-consentimiento.php` —**63 comprobaciones**— arma el HTML que
  el plugin produce con la cookie puesta a mano en sus seis estados: sin
  responder, rechazado, aceptado todo, sólo medición, sólo publicidad y sin
  gestor. Comprueba que un guion dormido no cuenta como cargado, que un
  `<iframe>` o una `<img>` de un `<noscript>` sí cuentan —se cargan solos—, y
  que ningún guion vivo nombra a un tercero antes del consentimiento. Esa
  última no lleva lista de etiquetas: es la que sobrevive a que mañana se
  agregue otra y nadie se acuerde de añadirla a la prueba.

  Las tres formas de la cookie de CookieAdmin están **medidas** en el
  navegador, pulsando cada botón y leyendo `document.cookie`, no leídas de su
  documentación.

### Agregado

- **«Preferencias de cookies» ya se puede componer, sin parchear HTML.** La
  conducta `preferencias-cookies` existía en el runtime desde hace meses, pero
  el compilador no la aceptaba: la única forma de ponerla era editar el HTML a
  mano con un guion aparte, que es justo lo que el page builder viene a evitar
  —un parche de HTML no queda en el documento, así que después nadie lo puede
  editar, y no sobrevive a la siguiente recomposición—. En Santa Luisa se puso
  así. Ahora se declara como cualquier otra conducta, sobre un `link` o un
  `button`.

  El `href` es obligatorio y no puede ser `#`. No es relleno: sin JavaScript no
  hay panel de cookies que reabrir, así que el enlace tiene que llevar a algún
  lugar que sirva —la página de términos y privacidad—. Con JavaScript, el
  runtime le quita el salto al clic y abre el panel.

- **Se puede preguntar en qué revisión está una región global.**
  `cod_get_canvas_page_state` acepta ahora `pageId: 0` con `documentId`
  (`cod-region-header`, `cod-region-body`, `cod-region-footer`).

  Antes una región se podía escribir pero no consultar, y como el apply exige
  la revisión exacta, quien quisiera corregir un pie tenía que adivinarla:
  mandar una equivocada a propósito y leer la revisión real del mensaje de
  conflicto. Eso no es un circuito, es un rebote que funciona por accidente, y
  deja un intento fallido en el registro cada vez. Una región que nunca se
  escribió responde revisión 0 y `exists: false`, en vez de un error que parece
  una avería.

### Corregido

- **Escribir una región ya no responde un error después de haber funcionado.**
  Al aplicar una composición sobre una región, el servicio intentaba leer «la
  página» de vuelta. Una región no tiene página, así que respondía «La página
  Canvas no pudo leerse después de aplicar la composición» —DESPUÉS de haber
  guardado bien y subido la revisión—.

  Un fallo así es peor que un fallo de verdad: quien lo recibe reintenta, el
  reintento manda la revisión anterior, choca con un conflicto, y ahora hay dos
  errores distintos para una operación que salió bien a la primera.

### Comprobado

- `scripts/probar-preferencias-cookies.php`: la conducta sobre `link` y sobre
  `button`, el rechazo de `#` y de un destino vacío nombrando el porqué, el
  rechazo sobre un nodo que no es enlace nombrando lo que llegó, que el
  saneador no se coma el atributo, y las seis respuestas del estado de región.

- `scripts/probar-conversion-formulario.php` gana tres comprobaciones del otro
  lado de la puerta: tras rechazar, la conversión no engancha, queda dormida
  bajo publicidad y la cuenta de Ads no se configura en ningún guion vivo.

  La última estuvo mal escrita a propósito y por eso se deja anotado: buscaba
  el texto `gtag('config'` en el HTML, y ese texto SÍ aparece —dentro del guion
  dormido—. Lo que hay que mirar es si está en un guion que se ejecuta. Esa
  comprobación mal hecha fue, de todas formas, la que destapó un defecto real:
  los dos `gtag('config')` viajaban en UN solo guion dormido, de modo que
  aceptar nada más que medición lo despertaba entero y configuraba también la
  cuenta de publicidad. Un consentimiento a medias que en realidad concedía
  todo, y sin que se notara, porque la página se ve igual. Ahora cada
  identificador duerme bajo su propia categoría, y hay tres comprobaciones que
  lo sujetan.

- `scripts/probar-mapa.php` dejó de exigir la versión exacta `0.3.47`: ahora
  pide «esa o posterior». Una prueba atada a un número falla en cuanto sale la
  versión siguiente, y hay que tocarla sin que nada de lo que prueba haya
  cambiado.

---

## 0.3.47 — 3 de octubre de 2026

### Agregado

- **«mapa»: un mini mapa que, al pincharlo, despliega uno grande con un
  marcador.** Es el cuadradito con esquinas redondeadas que hay junto a la
  dirección en el pie de muchos sitios. Hasta acá, para tenerlo había que pegar
  JavaScript a mano en la configuración del tema; el plugin no deja hacer eso, y
  con razón. Ahora es una conducta del plugin: se declara una regla
  `interaction` con `behavior: "mapa"` sobre un grupo, y los datos del lugar
  van en el propio grupo.

  ```json
  { "id": "mapa-pie", "kind": "group", "ruleIds": ["r-mapa"],
    "content": { "lat": -33.804136, "lng": -70.681617, "zoom": 17,
                 "mini": "/wp-content/uploads/mini-mapa.png",
                 "globo": "Av 18 de Septiembre sn Hijuela 2, Paine",
                 "globoEnlaceTexto": "www.econut.cl", "globoEnlaceHref": "https://www.econut.cl" },
    "children": [ { "id": "direccion", "kind": "paragraph", "content": { "text": "Av 18 de Septiembre sn Hijuela 2…" } } ] }
  ```

  **Qué se ve y qué no se carga:**

  - **El mini mapa es una imagen de tu propio sitio**, no un mapa. Se genera una
    sola vez (ver más abajo), se sube como cualquier otra imagen y se declara en
    `mini`. Por eso el mini se ve **aunque no haya clave, aunque no haya
    JavaScript y aunque no haya internet hacia afuera**, no gasta nada de la
    cuenta de Mapbox y **no le pide nada a ningún tercero**: mientras nadie abra
    el mapa, la página no habla con nadie más. Eso también importa para el
    consentimiento de cookies.
  - **El mapa grande sí es de Mapbox**, y se descarga **sólo cuando alguien lo
    abre**, nunca al cargar la página: son unos 700 KB que una visita que sólo
    mira la dirección nunca paga. Se descarga una vez; las siguientes aperturas
    no vuelven a pedir nada. Mientras llega dice «Cargando el mapa…».
  - **La dirección escrita queda siempre a la vista**, al lado del mini: es lo
    que de verdad importa y no depende de que nada cargue.
  - Si Mapbox **no llega** (sin conexión, bloqueado, sin WebGL, clave rechazada o
    demasiada espera), **se dice** —ya no queda un recuadro gris para siempre— y
    se ofrece un enlace **«Cómo llegar»** a OpenStreetMap. Pinchar otra vez
    vuelve a intentarlo.

  **La clave de Mapbox se guarda una sola vez y sirve para todas las páginas.**
  Va en *ContOpe Design → Configuración → Mapa (Mapbox)*, **no** dentro de la
  página: si mañana cambia, se cambia ahí y llega a todos los mapas sin recomponer
  ninguna página. Acepta sólo la clave pública (la que empieza con `pk.`); una
  secreta (`sk.`) se rechaza, porque la clave queda a la vista en el código de la
  página. La pantalla recuerda que conviene **restringirla al dominio del sitio**
  desde el panel de Mapbox: sin eso cualquiera que la vea puede gastar la cuota.
  Sin clave, el mini se ve igual pero no se ofrece abrir el mapa grande (queda como
  enlace a «cómo llegar»), y el aviso aparece en `summary.omittedNodes` al compilar.

  **Para que el mini no tenga que armarse a mano**, hay un guion que lo genera con
  la API de imágenes estáticas de Mapbox y deja el archivo:

  ```
  MAPBOX_TOKEN=pk.… node scripts/generar-mini-mapa.mjs --lng -70.6816 --lat -33.8041 --zoom 2 --salida mini-mapa.png
  ```

  **Se corre una sola vez** por mapa: la vista del mini nunca cambia. Sale a 60×60
  al doble de resolución. El mini va con zoom bajo a propósito (muestra el país):
  ahí funciona como un icono, no como un mapa.

  **Cómo se comporta el mapa grande:**

  - El mini es un **botón de verdad**: se alcanza con Tab y se abre con Enter o
    Espacio, no sólo con el ratón. La X también.
  - **No atrapa el foco.** Al abrir, el foco pasa a la X; Escape o la X lo cierran
    y el foco vuelve al mini. El mini desaparece mientras está abierto.
  - El desplazamiento hacia el mapa **respeta `prefers-reduced-motion`**: con
    movimiento reducido salta sin animar.
  - El **texto del globo es texto**, nunca HTML. Su enlace, si lo hay, es un enlace
    de verdad (en el sitio original se veía literalmente
    `[www.econut.cl](https://www.econut.cl)`, con corchetes). La **atribución** de
    Mapbox y de OpenStreetMap queda activada en el mapa grande, como piden sus
    términos, y en el mini viene dentro de la propia imagen (no se recorta).
  - Partes dirigibles con reglas de diseño: `mini`, `grande` y `cerrar`. El
    alto y el ancho máximo del mapa grande salen de `--cod-mapa-alto` (25rem por
    omisión) y `--cod-mapa-ancho-maximo` (80rem), con una regla `properties`.
    Radio, sombra y colores son del diseño del sitio. Si el grupo es una fila, el
    mapa grande se despliega debajo con `flex-wrap: wrap`.
  - Dentro del editor no se ejecuta: el grupo se ve apilado y editable.

  **Pendiente que conviene saber:** Mapbox GL se descarga con su versión fija
  (2.14.1) pero sin comprobación de integridad (SRI); no se pudo calcular el hash
  sin conectarse. Y las condiciones de Mapbox sobre guardar sus imágenes estáticas
  son suyas y pueden cambiar: antes de dejar el mini en producción conviene leer
  sus términos.

## 0.3.46 — 3 de octubre de 2026

### Agregado

- **«aviso»: una ventana emergente que aparece una vez por visitante y se puede
  cerrar.** Hasta acá no había forma de mostrar algo que no puede esperar a que
  alguien lo busque: un aviso de seguridad, un cierre por vacaciones, un cambio
  de dirección. Ahora es una conducta del plugin: se declara una regla
  `interaction` con `behavior: "aviso"` sobre un grupo, y los hijos del grupo
  pasan a ser el contenido de la ventana.

  ```json
  { "id": "aviso-estafas", "kind": "interaction", "value": { "behavior": "aviso" } }
  ```

  **Para qué se hizo:** hay estafadores vendiendo a nombre de una empresa y llegó
  gente a la planta a buscar productos que había pagado por internet y que nunca
  existieron. Una franja de advertencia de media pantalla cumplía su función pero
  era invasiva, y además sólo advertía. El aviso es donde va el detalle que ya no
  cabe en una línea, y lo importante: **no basta con advertir, tiene que permitir
  verificar**. Dentro del aviso van las cuentas oficiales enlazadas (por ejemplo
  con la pieza `social` de 0.3.44), para que la persona pueda comprobar en el
  momento cuál es la verdadera.

  **Cómo se comporta:**

  - Aparece solo al cargar la página, **una vez por visitante**: el navegador
    recuerda que ya lo vio. Al recargar o volver otro día no reaparece. Si se
    quiere que vuelva cada cierto tiempo, se dice con `--cod-aviso-vuelve-dias`
    (por omisión 0: una vez y no vuelve).
  - **Se cierra de tres maneras**: con la X, con la tecla Escape y pinchando el
    fondo. Es la parte que lo hace aceptable: un aviso difícil de cerrar o que
    vuelve sin parar sería peor que la franja que reemplaza. Arrastrar el ratón
    para seleccionar texto del aviso y soltar fuera no lo cierra por error.
  - **No bloquea la página.** El desplazamiento de la página sigue libre. Y si el
    JavaScript no corre, el contenido **no se esconde**: queda en su lugar, como
    un bloque más, legible. Por eso el grupo conviene ponerlo al final de la
    página (donde no estorba si el guion no corre), como nodo de primer nivel o
    dentro de una sección sin movimiento: un ancestro con animación de entrada lo
    escondería o lo desplazaría, porque la ventana es de posición fija.
  - **Accesible de verdad**: `role="dialog"` y `aria-modal="true"`, con el título
    del aviso como nombre; el foco entra a la ventana al abrir, no se sale de ella
    con Tab ni con Mayús+Tab mientras está abierta, y al cerrar vuelve a donde
    estaba. La X es un botón real de al menos 44 píxeles. Con movimiento reducido
    (`prefers-reduced-motion`) aparece sin animar.
  - **Si el navegador bloquea el almacenamiento** (navegación privada, cookies
    rechazadas), no se rompe: el aviso aparece, se puede cerrar, y no hay dónde
    recordarlo, así que vuelve a aparecer en la visita siguiente.
  - **Reabrirlo.** Si el grupo lleva un marcador, cualquier enlace a `#marcador`
    lo vuelve a abrir aunque ya se haya visto, y entrar a la página con
    `#marcador` en la dirección también. Sirve para dejar una línea permanente y
    discreta («cómo verificar nuestras cuentas») en lugar de una franja grande.
  - Dentro del editor no se ejecuta: allí el grupo se ve apilado y editable, y
    editar no gasta el «una vez» del visitante.

  **Los parámetros no son de la regla**: se escriben con una regla `properties`
  sobre el grupo, que admite `scope.breakpoint`:

  ```json
  { "id": "aviso-medidas", "kind": "properties",
    "value": { "declarations": {
      "--cod-aviso-vuelve-dias": "7",
      "--cod-aviso-ancho-maximo": "36rem" } } }
  ```

  Sin ellas: una sola vez, y el panel mide 32rem como máximo. Un parámetro que no
  existe en la regla (`dias`, `delay`, `ancho`…) se rechaza diciendo cuál es.

  **Tres partes dirigibles** con el campo `partes` de siempre: `panel` (la
  ventana), `velo` (el fondo que la separa de la página) y `cerrar` (el botón de
  la X). Por omisión el panel usa los colores del sistema y no trae ningún color
  ni tipografía de marca; la marca la ponen las reglas de diseño del sitio sobre
  esas partes.

  Si el contenido es más alto que la pantalla, la ventana se desplaza por dentro
  y la X queda a la vista.

### Cómo se actualiza

- No cambia nada en las páginas existentes: el aviso sólo existe donde una
  composición lo declara.
- El plugin no pone avisos por su cuenta: para que uno aparezca en una página
  hay que componerla con el grupo y la regla `interaction`, y volver a aplicar
  la composición.

---

## 0.3.45 — 3 de octubre de 2026

### Agregado

- **Las cuentas de redes sociales se cambian desde el panel, sin tocar las
  páginas.** En Configuración hay una sección nueva, «Redes sociales», con un par
  de campos por cada red (Instagram, Facebook, LinkedIn, YouTube, TikTok, X,
  Threads y Pinterest): la dirección de la cuenta y, si se quiere, su nombre de
  usuario. Todos son opcionales. Los enlaces con logotipo que hay en las páginas
  (desde 0.3.44) toman la cuenta de ahí.

  Para qué sirve: las cuentas las administra otra gente —el equipo de redes de la
  empresa— y cambian. Una se consolida, otra se verifica, otra se cierra. Antes,
  la dirección iba escrita dentro de cada página, y cambiarla obligaba a rehacer
  la página entera. Ahora quien mantiene el sitio entra a Configuración, cambia la
  dirección y guarda, y el cambio llega a todas las páginas en ese momento. Si una
  cuenta se cierra, se vacía su dirección y el logotipo desaparece de todo el
  sitio.

- **Una red que no está configurada no se muestra.** Si una página pide el
  logotipo de una red y en el panel no hay cuenta para ella, ese logotipo no se
  dibuja: ni un icono que no lleva a ninguna parte ni un enlace vacío. En un sitio
  que existe para que la gente verifique cuál es la cuenta verdadera, un icono
  muerto es peor que no tenerlo. Al componer la página, el resumen avisa qué
  nodos quedaron sin dibujar y por qué.

- **Una página puede seguir apuntando a otra cuenta.** Si un enlace trae su propia
  dirección, esa manda sobre el panel: sirve para un caso suelto, como enlazar la
  cuenta de otra empresa. En ese caso tampoco se muestra el nombre de usuario del
  panel junto a ella, porque no sería de la misma cuenta.

- **El panel no deja guardar una cuenta falsa por descuido.** Las mismas reglas de
  0.3.44 valen al guardar: la dirección tiene que empezar con `https://` y ser del
  dominio de esa red, y el nombre de usuario no puede llevar caracteres
  invisibles, marcas de escritura inversa ni HTML. Si algo no pasa, el aviso dice
  de qué red y de qué campo se trata, y esa red conserva lo que tenía: nunca queda
  una dirección nueva con un nombre de usuario viejo, que mostraría un enlace y un
  nombre que no son de la misma cuenta.

### Corregido

- **El botón de WhatsApp ya no se dibuja si no hay número guardado.** Antes salía
  un botón que no llevaba a ninguna parte (apuntaba a `#`). Ahora no aparece, y el
  resumen de la composición lo anota. Al activarlo en las secciones, si falta el
  número, avisa en lugar de insertar un hueco. Ojo: el número sigue quedando
  escrito en la página cuando ésta se compone, así que si se cambia después en
  Configuración hay que volver a aplicar la composición (lo de las redes sí se
  actualiza solo; lo de WhatsApp todavía no).

### Cómo se actualiza

- Las páginas que ya traen la dirección de una red escrita dentro siguen
  funcionando igual: esa dirección manda. Para pasar una cuenta al panel, se
  configura ahí y se vuelve a aplicar la página sin la dirección en el enlace.
- Si una página se compuso cuando una red todavía no estaba en el panel, ese
  logotipo no quedó guardado; hay que configurar la red y volver a aplicar la
  composición para que aparezca. Lo contrario no pasa: cambiar o vaciar una
  cuenta que ya estaba se ve de inmediato.

---

## 0.3.44 — 3 de octubre de 2026

### Agregado

- **Enlaces a las redes sociales de la empresa, con el nombre de usuario a la
  vista.** Hay una pieza nueva, `social`, que dibuja el logotipo de una red
  (Instagram, Facebook, LinkedIn, YouTube, TikTok, X, Threads o Pinterest) como un
  enlace a la cuenta. Si se le da el nombre de usuario (por ejemplo
  `@econutchile.oficial`), éste se escribe junto al logotipo; si no, va sólo el
  logotipo.

  Para qué sirve, con el caso que la pidió: Econut tiene en su portada una franja
  enorme que avisa que hay estafadores vendiendo nueces a nombre de la empresa, y
  llegó gente a la planta a buscar productos que había pagado por internet. Pero
  el sitio no tenía ni un enlace a sus redes: advertía que existen cuentas falsas
  y no daba forma de saber cuál es la verdadera. Los enlaces oficiales son la
  herramienta con la que una persona comprueba que está hablando con la empresa de
  verdad, y por eso esto no es decoración.

- **El nombre de usuario es texto, no una imagen.** Se puede seleccionar, copiar,
  buscar con la página y lo lee un lector de pantalla. Así quien recibió un
  mensaje de una cuenta que dice ser la empresa puede comparar el nombre letra por
  letra con el que muestra el sitio. No admite caracteres invisibles ni marcas de
  escritura inversa, que es justamente lo que usa una cuenta falsa para parecerse
  a la verdadera.

- **El enlace tiene que ser de la red que dice ser.** No basta con que sea
  `https://`: un enlace marcado como Instagram que lleva a otro sitio se rechaza,
  y el aviso dice a qué dominio apuntaba. Tampoco se aceptan `javascript:`,
  `data:`, direcciones sin cifrar, con usuario antes de la arroba ni con puerto.
  Una red que no está en la lista se rechaza nombrándola.

- Los logotipos son las siluetas oficiales, de un solo color y sin alterar,
  tomadas del bloque «Enlaces a redes sociales» del propio WordPress. Son marcas
  registradas de sus dueños y están aquí sólo para señalar la cuenta de quien las
  pone en su sitio. El tamaño, el relleno, los colores y el redondeo se ajustan
  igual que en el botón de WhatsApp.

---

## 0.3.43 — 3 de octubre de 2026

### Agregado

- **Contar una conversión de Google Ads cuando alguien envía un formulario o
  escribe por WhatsApp, sin pasar por Tag Manager.** En Configuración →
  «Etiquetas de medición» hay dos campos nuevos: «Conversión de Ads: envío de
  formulario» y «Conversión de Ads: envío por WhatsApp». Se pega lo que Google da
  al crear la conversión, por ejemplo `AW-751289133/dnRYCLmy84odEK2Gn-YC` (también
  sirve pegar el fragmento completo de Google; el plugin saca el par). Los dos
  son opcionales.

  Antes el sitio sólo podía medir la visita; la conversión había que armarla a
  mano en el código del tema o en Tag Manager. Ahora basta con la etiqueta.

- **Sirve para los dos motores de formularios, y para los dos a la vez.** El
  sitio cuenta el envío tanto si el formulario es el propio de ContOpe
  (Orugantt Forms) como si es Gravity Forms, que es lo que tenían los sitios que
  migran desde otro WordPress. Si el sitio tiene los dos, cuenta los dos.

- **No se cuenta dos veces.** Es el riesgo de escuchar varios avisos a la vez, y
  inflaría los números de la campaña. El sitio cuenta como mucho una conversión
  por motor dentro de una ventana de 2 segundos (Gravity avisa por dos vías a la
  vez y a veces se repite), y aunque otro plugin imprima el guion dos veces, sólo
  se engancha una. Dos envíos reales, separados, sí cuentan los dos.

- **Avisa cuando la configuración no mediría nada.** Una etiqueta de conversión
  sin el identificador de Google Ads (ni el de Analytics 4) no mide, y no se nota
  mirando el sitio. La pantalla de Configuración lo dice con un aviso, y también
  cuando la etiqueta es de una cuenta distinta a la del identificador de Ads
  configurado. Una etiqueta mal escrita no se guarda y el aviso nombra el campo.

- Qué NO viaja a Google: nada de lo que la persona escribió en el formulario. El
  evento lleva sólo la etiqueta de la conversión; ni el nombre del formulario ni
  el nombre, correo o teléfono de quien lo envió.

- Si ya configuraste estas conversiones dentro de Tag Manager, deja estos
  campos vacíos: en los dos lados se contarían doble.

---

## 0.3.42 — 1 de octubre de 2026

### Corregido

- **Una regla de diseño ahora le gana al CSS base del canvas.** Una regla
  `layout` con `gap` sobre un grupo no cambiaba la separación: el grupo seguía
  con 16px aunque la regla pidiera 165. Pasaba con cualquier regla cuya
  declaración chocara con el CSS base (`.cod-group`, `.cod-columns`,
  `.cod-section`, `.cod-node--layout`, `.cod-node--gallery`, etc.), en cualquier
  sitio.

  La causa, medida en la página 20 de econut: cada documento compilado
  (cabecera, cuerpo y pie) lleva el CSS base al comienzo de su hoja, y la página
  concatenaba las tres hojas tal cual. Así `.cod-group{display:grid;gap:16px}`
  salía tres veces (posiciones 66, 99 y 241 de la hoja) y la última copia, la del
  pie, caía después de `.cod-rule--caja-certificaciones` (posición 206, `gap:165px`).
  Las dos tienen una clase de especificidad, y con la misma especificidad gana la
  que va después.

  Ahora el CSS base sale una sola vez y antes de todas las reglas de los
  documentos. No se usó `!important` ni se subió la especificidad de las reglas:
  se arregló el orden. El base sólo se quita de un documento cuando éste empieza
  por las mismas líneas del base vigente; un documento reexportado por el editor,
  que no las trae, se deja intacto.

  **Atención: esta versión puede cambiar el aspecto de páginas existentes.** Una
  página que dependía, sin saberlo, de que el CSS base le ganara a su regla de
  diseño (por ejemplo, una regla con un `gap` que nunca se vio porque el base lo
  tapaba) ahora mostrará lo que la regla declara. Conviene revisar un sitio en un
  entorno de prueba antes de desplegar esta versión en producción, en particular
  Santa Luisa.

---

## 0.3.41 — 1 de octubre de 2026

### Agregado

- **Una imagen de fondo se puede colocar y dimensionar con medidas, no sólo con
  palabras.** La regla `surface` aceptaba `backgroundPosition` únicamente como
  palabras (`left`, `center`, `right`, `top`, `bottom`) y `backgroundSize`
  únicamente como `cover`, `contain` o `auto`. Eso dejaba fuera lo que Divi sí
  hace. Ahora:

  - `backgroundPosition` acepta una o dos medidas (`2% 50%`, `20px 10px`, `50%`)
    y la mezcla de palabra y medida (`left 20px`, `center 30%`).
  - `backgroundSize` acepta una o dos medidas, donde `auto` vale como componente
    (`7% auto`, `200px`, `50% 100%`).
  - `backgroundRepeat` es un campo nuevo y opcional: `repeat`, `no-repeat`,
    `repeat-x`, `repeat-y`, `space` o `round`. Sin él sigue saliendo `no-repeat`,
    como siempre.

  Lo pidió la barra de aviso de econut.cl, que pinta su triángulo de advertencia
  como fondo de la sección (`7% auto`, a `2% 50%`, sin repetir). Antes esa regla
  se rechazaba con «backgroundPosition no es válido».

  ```json
  { "id": "aviso-fondo", "kind": "surface",
    "value": { "backgroundAssetUrl": "/wp-content/uploads/triangulo.svg",
               "backgroundSize": "7% auto", "backgroundPosition": "2% 50%",
               "backgroundRepeat": "no-repeat" } }
  ```

  Las unidades que se aceptan son `px em rem vh vw vmin vmax ch ex cm mm in pt pc q`
  y `%`; cualquier otra cosa (`calc(...)`, `var(...)`, `url(...)`, una unidad
  inventada, tres componentes) se rechaza diciendo qué campo falló. El tamaño no
  acepta números negativos.

  **Con velo, la medida es sólo de la foto.** Si la superficie trae también
  `overlayColor`, el velo sigue ocupando toda la caja (siempre `cover`, centrado)
  y la medida se aplica únicamente a la capa de la foto, para que el velo no se
  encoja ni se corra. Lo que ya se declaraba con palabras sale exactamente igual
  que en 0.3.40.

---

## 0.3.40 — 30 de septiembre de 2026

### Agregado

- **Un velo plano sobre la foto de fondo de una superficie.** Una foto de fondo
  que compite con el texto se vuelve la protagonista de la sección; para que
  quede atrás hay que oscurecerla o aclararla. La regla `surface` ya aceptaba
  `overlayColor` y `overlayOpacity`; ahora, cuando la superficie trae también
  `backgroundAssetUrl`, el velo viaja **dentro del propio fondo**: dos capas de
  `background-image`, el velo arriba y la foto debajo, sin elementos extra y sin
  tocar a los hijos de la sección.

  ```json
  { "id": "portada-fondo", "kind": "surface",
    "value": { "backgroundAssetUrl": "/wp-content/uploads/portada.jpg",
               "overlayColor": "#000000", "overlayOpacity": 0.75 } }
  ```

  **El velo es de opacidad pareja, y no es un degradado.** El mismo color, con
  la misma opacidad, de un extremo al otro. CSS no tiene una «capa de color
  sólido» para `background-image`, así que se escribe como un `linear-gradient`
  con el mismo valor en sus dos puntas: por dentro es un truco de CSS, a la vista
  es un color liso. Esto es a propósito: en este proyecto no se usan degradados,
  y un velo que varía (por ejemplo de 0.6 a 0.9, como el del sitio original de
  econut.cl) sí lo sería. Si se copia esa portada, se elige **un** valor.

  Sin `overlayOpacity` el velo sale a opacidad 1, que tapa la foto por completo:
  la opacidad conviene declararla siempre.

### Corregido

- **Una opacidad de velo sin color ya no se descarta en silencio.** Una regla
  `surface` con `overlayOpacity` pero sin `overlayColor` se aceptaba y no
  pintaba nada, y parecía aplicada. Ahora se rechaza diciendo que la opacidad
  necesita un color.
- **Con foto de fondo, el velo ya no obliga a los hijos de la sección a quedar
  `position: relative`.** Hasta acá el velo se dibujaba con un `::before` y, para
  que quedara bajo el contenido, la regla forzaba `position: relative` en cada
  hijo directo, lo que descolocaba a los que ya venían posicionados. Una
  superficie sin foto sigue usando ese `::before`, sin cambios.

---

## 0.3.39 — 30 de septiembre de 2026

### Agregado

- **«marquesina»: una fila que se desplaza sola, en bucle y sin controles.**
  Hasta acá, una franja de logos que corre de lado a lado (los sellos de
  certificación de una landing, una cinta de marcas) había que armarla con una
  librería externa o con código pegado a mano. Ahora es una conducta del plugin:
  se declara una regla `interaction` con `behavior: "marquesina"` sobre un grupo
  de 2 a 24 hijos, y cada hijo pasa a ser una pieza de la fila.

  ```json
  { "id": "logos", "kind": "interaction", "value": { "behavior": "marquesina" } }
  ```

  Cuántas piezas se ven a la vez, el espacio entre ellas y la velocidad **no son
  parámetros de la regla**: se escriben con una regla `properties` sobre el
  grupo, que ya admite `scope.breakpoint`, así que el número cambia por ancho
  como cualquier otra regla y no hay un sistema de breakpoints aparte:

  ```json
  { "id": "logos-medidas", "kind": "properties",
    "value": { "declarations": {
      "--cod-marquesina-visibles": "4",
      "--cod-marquesina-separacion": "60px",
      "--cod-marquesina-duracion-pieza": "8s" } } }
  ```

  Sin ellas, la fila muestra cuatro piezas, sin separación, a ocho segundos por
  pieza: un desplazamiento lento y continuo, que es lo que hace hoy econut.cl
  (medido: `speed: 8000`, 4 piezas desde 1024px, 60px entre ellas).

  El nodo puede dirigir reglas a las dos partes de la fila, `pista` (lo que se
  mueve) y `pieza` (cada elemento), con el campo `partes` de siempre. Si hay
  menos piezas que las que caben a la vez, el juego se repite solo hasta llenar
  el ancho. Las copias que cierran el bucle no estorban: no llevan ids, quedan
  fuera de lo que leen los lectores de pantalla y no reciben el foco del
  teclado.

  **Por qué sin librerías:** el mecanismo es CSS puro (`@keyframes` y
  `translateX(-50%)` sobre un juego de piezas duplicado), así el plugin no
  depende de un tercero para una fila que se mueve y no hay JavaScript
  trabajando en cada cuadro.

  **Movimiento reducido:** con `prefers-reduced-motion: reduce` la fila se
  detiene y las piezas quedan quietas y a la vista, en filas que envuelven, sin
  copias. Nada queda escondido fuera del ancho.

  Dentro del editor no se ejecuta: allí las piezas se ven apiladas y editables,
  igual que pestañas y cuadrantes.

### Corregido

- **Un parámetro inventado en una regla `interaction` se rechaza diciendo cuál
  es.** Antes, escribir una clave que ninguna interacción conoce (por ejemplo
  `velocidad`) devolvía «`interaction.behavior` no es un comportamiento
  disponible», que mandaba a revisar el nombre del behavior cuando el problema
  era otra cosa. Ahora el error nombra la clave y lista las que existen. Lo
  mismo para los behaviors que no admiten parámetros (`cuadrantes`, `pestanas`
  y `marquesina`): el mensaje dice cuál se recibió.

---

## 0.3.38 — 30 de septiembre de 2026

### Corregido

- **Pedir cuatro columnas con un ancho mínimo ahora da cuatro columnas.** Una
  regla de disposición puede declarar dos cosas a la vez: cuántas columnas
  quiere (`columns`) y cuánto debe medir una antes de que convenga bajar de
  número (`minColumnWidth`). Hasta acá, cuando venían juntas la segunda
  descartaba a la primera **en silencio**: la rejilla ponía las columnas que
  cupieran y nadie avisaba que el número pedido se había ignorado. Se destapó
  con los cuatro logos de certificación de la landing de Econut, que pedían
  cuatro y salían en 2×2.

  Ahora las dos se respetan: el ancho mínimo de cada columna es el mayor entre
  el que se pidió y el que le toca a una de `columns` columnas. Así nunca se
  pasa de ese número, y la rejilla igual baja sola cuando el espacio no alcanza
  para el ancho mínimo.

  Una regla que declara sólo `minColumnWidth` **no cambia**: sigue poniendo las
  columnas que quepan, sin techo. Esto es a propósito — `columns` tiene un valor
  por omisión de 2, y aplicarle el techo también a ese caso le habría puesto un
  máximo de dos columnas a todo lo que hoy funciona, Santa Luisa incluida.

  Nada de esto altera una página ya publicada: el compilador corre al aplicar
  una composición, no al mostrar el sitio, así que el CSS que ya está escrito en
  un documento se queda como está.

### Agregado

- `scripts/sincronizar-plugin.mjs`: lleva el plugin del repo a un WordPress
  local (`--a econut` o `--a santaluisa`) e imprime las dos versiones antes de
  copiar. Existe porque esa copia se hacía a mano y el local de Econut se había
  quedado dos versiones atrás sin que nada lo dijera.
- `scripts/probar-rejilla-columnas.php`: los cuatro casos de la rejilla, con el
  que protege el comportamiento anterior entre ellos.

---

## 0.3.37 — 30 de septiembre de 2026

### Agregado

- **Ninguna propiedad queda inalcanzable desde una composición.** Hasta acá el
  canal de composición sólo sabía hablar quince tipos de regla cerrados: no
  había forma de fijar un ancho, un alto, una sombra o una propiedad
  personalizada (`--algo`), aunque el editor visual sí puede hacerlo desde
  siempre. El caso que lo destapó: el módulo de pestañas expone variables para
  su color y su aire, y la composición no podía escribir ninguna. Ahora existe
  el tipo de regla `properties`, que declara propiedades directamente:

  ```json
  { "id": "pestana", "kind": "properties",
    "value": { "declarations": {
      "background-color": "#FFFFFF",
      "--cod-pestanas-etiqueta-aire-x": "30px" } } }
  ```

  Los quince tipos de antes **no cambian y siguen siendo el camino preferido**
  cuando aplican, porque llevan rol y procedencia: el catálogo semántico está
  para dar trazabilidad, no para dar permiso. Se exige forma larga (una
  abreviada con `var()` se rechaza, porque el editor la descarta en silencio),
  los nombres se validan contra una lista y los valores no admiten `url(` ni
  nada que permita colar otra cosa. `scope` funciona igual que siempre,
  incluido el estado `current`.

- **Se pueden estilar las partes que un módulo fabrica al vuelo.** El botón de
  una pestaña no existe en el documento: lo crea el runtime en el navegador y
  no recibía ninguna clase, así que era inalcanzable — y es justo el que pone
  el relleno de la pestaña. Un nodo ahora puede dirigir reglas a las **partes**
  de su módulo:

  ```json
  { "id": "cifras", "kind": "group", "ruleIds": ["caja"],
    "partes": { "etiqueta": ["normal", "elegida"], "lista": ["franja"],
                "panel": ["fondo"] } }
  ```

  Las partes de cada módulo (`lista`, `etiqueta` y `panel` en pestañas;
  `imagen`, `miniatura` y `texto` en cuadrantes) viven ahora en **un solo**
  registro dentro del compilador, sacado de lo que el runtime emite de verdad.
  Una parte que no exista se rechaza nombrando las que sí.

### Corregido

- **La tabla de «el elegido» dejó de estar escrita a mano en tres lugares.**
  Agregar un módulo con noción de elemento seleccionado obligaba a copiar su
  atributo en una constante, en el texto del catálogo y en un mensaje de error.
  Los tres salen ahora del registro de módulos. El selector que se emite es el
  mismo de antes, comprobado contra el texto exacto.

### Medido

- Las pestañas de una página compuesta pintan en el navegador los colores
  pedidos en el botón real, la variable del módulo se aplica, y el estado viaja
  al pinchar.
- Lo nuevo **sobrevive a un viaje por el editor visual**: la propiedad
  personalizada, el selector por atributo, el estado elegido, el `@media` y el
  `:hover` aguantan tanto reexportar como guardar el proyecto y recargarlo.

---
## 0.3.36 — 30 de septiembre de 2026

### Corregido

- **«pestanas»: la hoja del módulo impedía que la composición pintara la
  etiqueta.** La regla que hace que el título de adentro de la etiqueta tome el
  color del botón iba con el prefijo completo de la raíz
  (`.cod-pestanas[data-cod-behavior="pestanas"] > .cod-pestanas__lista > .cod-pestanas__etiqueta > *`,
  especificidad 0-3-1) y le ganaba a cualquier regla de la composición: un
  `h3` con una regla de color `#E09900` (una clase) se pintaba `rgb(51,51,51)`.
  Ahora va con **una sola clase** (`.cod-pestanas__etiqueta > *`): sigue ganándole
  al color propio del tema (`h3{color}`) pero pierde, por orden, contra la regla
  de la composición, que se emite después. Además dos valores por omisión que
  estaban fuera de `:where()` sin necesidad (`flex-wrap` y `align-items` de la
  lista) pasaron adentro. Lo que queda fuera de `:where()` es sólo estructura:
  `display` del grupo y de la lista, `appearance`, el panel inactivo
  (`display:none !important`), el alto en viaje y la aparición del panel.
  Medido en la página 20 del espejo de Econut: las cuatro etiquetas pintan
  `rgb(224,153,0)`.

### Agregado

- **`scope.state = "current"`: pintar «el elegido».** El runtime de `pestanas`
  ya marcaba la etiqueta activa con `data-cod-pestanas-estado="activa"`, pero el
  vocabulario de reglas sólo admitía `default`, `hover`, `focus` y `active`, y
  `active` en CSS significa «mientras se aprieta», no «seleccionada»: no había
  forma de declarar que la pestaña elegida va de otro color. Ahora una regla
  puede declarar `scope.state: "current"`. El compilador la emite atada al
  atributo que pone el runtime del behavior, para el nodo mismo y para sus
  descendientes (`:is(.regla[atributo], [atributo] .regla)`; una clase más un
  atributo, o sea que le gana a la regla del mismo nodo sin estado). Hoy sirve
  para:
  - `pestanas`: la etiqueta con `data-cod-pestanas-estado="activa"` y el panel
    con `data-cod-pestanas-visible="true"`.
  - `cuadrantes`: la celda con `data-cod-cuadrantes-rol="activa"` y el texto con
    `data-cod-cuadrantes-visible="true"`.

  Otro behavior con noción de «el elegido» se suma agregando su atributo a
  `CURRENT_MARKERS` en el compilador. Nada se acepta y se ignora: una regla
  `current` sobre un nodo que no está dentro de un `pestanas` o `cuadrantes`, en
  `rootRuleIds` o repartida por una cadencia devuelve
  `cod_mcp_current_state_target_invalid` con el nodo y el motivo. Queda
  documentado en el catálogo de capacidades (`scope.stateCurrent`).
  Ejemplo (las cifras de econut.cl): etiqueta inactiva `#E09900` con una regla
  `color` por omisión y activa `#4D7A76` con la misma regla `color` y
  `scope.state: "current"`, ambas en los nodos de las etiquetas. Medido en la
  página 20 del espejo de Econut, a 1280px y a 375px: al pinchar cada una queda
  `rgb(77,122,118)` sólo la activa y las otras tres `rgb(224,153,0)`.
- Pruebas: `scripts/probar-pestanas.php` cubre `current` (selector emitido,
  cuadrantes, nodo fuera del behavior, raíz, state inventado, catálogo) y que lo
  que queda fuera de `:where()` sea sólo estructura.

---

## 0.3.35 — 30 de septiembre de 2026

### Agregado

- **Una conducta nueva: «pestanas».** Un juego de pestañas: una fila de
  etiquetas arriba y, debajo, el panel de la activa. Se aplica con una regla
  `interaction` de `behavior: "pestanas"` sobre un nodo `group` con **2 a 8
  hijos**. Cada hijo es una pestaña: su **primer hijo es la etiqueta** (lo que se
  pincha: un título, un número, un texto) y **el resto es el panel**. Al cargar
  queda activa la primera; al pinchar una etiqueta se muestra su panel y se
  ocultan los demás, y el alto del bloque **viaja** del valor viejo al nuevo en
  vez de saltar. Sin parámetros: `threshold`, `targetId`, `toggleClass`,
  `mode`, `visible` y `visibleMobile` devuelven error, no se ignoran en
  silencio. Un nodo que no sea `group`, o con menos de 2 o más de 8 hijos,
  devuelve `cod_mcp_pestanas_target_invalid` / `cod_mcp_pestanas_children_invalid`
  con el motivo. Queda descrita en el catálogo de capacidades
  (`cod_get_capabilities`).
- **Cómo se hizo: se miró el módulo de Tabs de Divi** (el de las cifras de
  econut.cl) y se tomó lo que resuelve bien, y se dejó lo que no:
  - Se tomó: la separación en fila de etiquetas y paneles con uno solo visible;
    las etiquetas de una misma fila con el mismo alto; el estado activo marcado
    en la etiqueta para que la composición pinte activa e inactiva como quiera;
    abrir una pestaña desde la URL (`#id` del panel o de la etiqueta); apilar las
    etiquetas en el teléfono (bajo 700px, una por fila, a todo el ancho) porque
    así **nunca se esconde una pestaña**.
  - No se tomó su marcado: Divi usa `<li><a href="#">` sin `role`, sin
    `aria-selected` y sin teclado. Acá las etiquetas son `button` de verdad
    dentro de un `role="tablist"`, cada hijo es un `role="tabpanel"` con
    `aria-labelledby`, y hay tabulación por la activa (roving tabindex), flechas
    izquierda y derecha (con vuelta al otro extremo; se invierten en escritura de
    derecha a izquierda), Inicio y Fin. Medido con el árbol de accesibilidad del
    navegador: cada pestaña sale con su nombre, la activa como seleccionada y sólo
    el panel visible como `tabpanel`.
  - No se tomó su transición. Medido en econut.cl: Divi desvanece el panel viejo
    (500 ms), lo oculta, y recién ahí desvanece el nuevo (otros 500 ms), bloquea
    los clics mientras tanto y **el alto salta de golpe** a mitad de camino (765px
    a 652px en un solo cuadro). Acá el panel nuevo aparece de inmediato con
    `--cod-motion-enter` y el alto viaja con `--cod-motion-response` (medido: de
    1175px a 201px en ~200 ms, sin saltos). Todo dentro de
    `prefers-reduced-motion: no-preference`; con movimiento reducido el cambio es
    instantáneo y el estado es el mismo.
- **Contrato para componer** (los atributos los pone el runtime; la composición
  estila sobre ellos y no toca el runtime):
  - raíz: `data-cod-pestanas-listo="1"`, `data-cod-pestanas-activa="1..N"`
  - lista de etiquetas: `data-cod-pestanas-rol="lista"`
  - etiqueta (un `button`): `data-cod-pestanas-item="n"`,
    `data-cod-pestanas-rol="etiqueta"`, `data-cod-pestanas-estado="activa|inactiva"`
  - panel (el propio hijo del grupo): `data-cod-pestanas-item="n"`,
    `data-cod-pestanas-rol="panel"`, `data-cod-pestanas-visible="true|false"`
  - El color de la etiqueta se pone **sobre el botón**
    (`[data-cod-pestanas-rol="etiqueta"][data-cod-pestanas-estado="activa"]`); el
    título que viaja adentro lo hereda. Su tipografía sigue siendo la del propio
    nodo.
  - Ajustes opcionales por variable: `--cod-pestanas-alineacion`,
    `--cod-pestanas-separacion`, `--cod-pestanas-espacio-lista`,
    `--cod-pestanas-etiqueta-aire-y` / `-x` y `--cod-pestanas-movil-base` (ancho de
    cada etiqueta en el teléfono; por omisión 100%, o sea apiladas; con 45% quedan
    dos por fila). Los valores por omisión van dentro de `:where()`, con
    especificidad cero: cualquier regla de la composición los pisa sin `!important`.
  - Sólo geometría y movimiento: ningún color de marca, ninguna tipografía,
    ningún degradado, ninguna abreviada con variable.
- **Los dos motores.** El runtime está en `cod-canvas-public.js` (el sitio) y en
  `cod-behaviors.js` (el editor); se escribieron los dos. En la vista previa del
  editor **no monta** (el bloque se ve apilado y editable, con todos los paneles
  a la vista), igual que `cuadrantes`. Si la forma interna no calza (algún hijo
  con menos de 2 hijos propios) no toca nada y el contenido queda apilado. La
  función que devuelve deja el DOM como estaba.
- Pruebas nuevas: `scripts/probar-pestanas.php` (compilador, catálogo y hoja) y
  `scripts/probar-pestanas.mjs` (navegador real: pincha cada pestaña con el
  ratón, mueve con el teclado, mide el alto durante el cambio y retrata cada
  estado; con `ORIGINAL=1` mide el módulo de Divi para comparar).

---

## 0.3.34 — 30 de septiembre de 2026

### Agregado

- **Video ambiental: `ambient` en el nodo `video`.** El compilador emitía
  siempre `<video controls>`, sin forma de pedir otra cosa. Medido el 30-09-2026
  en la portada de la página 20 del espejo local: un nodo `video` salió con
  controles y pausado, mientras que en el sitio original ese mismo video va solo,
  en bucle y sin controles. Lo irónico es que el runtime público ya sabía
  hacerlo (`activateAutoplayVideos` arranca todo `video[autoplay]`), pero la
  capacidad no era alcanzable desde una composición. Ahora el contenido del nodo
  acepta `ambient` (booleano, `false` por omisión): con `true` emite
  `<video autoplay loop muted playsinline>` sin `controls` y sin botón de sonido;
  con `false` o ausente queda exactamente como antes. Si viene junto con
  `matte:true` manda `matte` y `ambient` se ignora (el compositor de luma matte
  ya arranca el video por su cuenta). Un valor que no sea booleano devuelve error
  `cod_mcp_video_invalid`. Aplica también a los videos dentro de una galería.
- **Regla `media`: `filter` para desaturar.** El sitio original muestra los
  logos de certificación en gris y la regla `media` no tenía cómo pedirlo. Ahora
  acepta `filter` con `none` (por omisión) o `grayscale`; con `grayscale` emite
  `filter:grayscale(1)` sobre la imagen, el video y el canvas del video con
  matte. `filter` cuenta en el `atLeastOneOf` de la regla. Con `hover:"dim"` el
  gris se conserva y se le suma el brillo, en vez de pisarlo. Un valor fuera de la
  lista devuelve error `cod_mcp_media_rule_invalid` con las opciones admitidas.
- Ambas capacidades quedan descritas en el catálogo de capacidades
  (`cod_get_capabilities`).

---

## 0.3.33 — 30 de septiembre de 2026

### Corregido

- **`width: "auto"` en un botón se aceptaba y no hacía nada.** Sólo `full`
  emitía CSS; con `auto` el botón no llevaba ninguna regla de ancho y quedaba a
  merced de su padre: dentro de una grilla o de un flex que estira (lo normal),
  salía de ancho completo igual. Medido el 30-09-2026 en la página 20 del espejo
  local: un botón con `width:"auto"` declarado midió 286 px, el ancho entero de
  su columna. Ahora `auto` emite `width:auto;justify-self:start;align-self:start`
  y el botón mide lo que mide su contenido. `full` no cambia.
- **El compilador escribía abreviadas con variable.** GrapesJS expande las
  abreviadas y, si no puede resolver la variable, descarta la declaración
  entera; era la misma trampa que ya había costado fondos perdidos. El propio
  compilador las emitía: el fondo de la página (`.cod-mcp-page`), el encabezado
  de las tablas (`th`, dos variantes), el fondo y el borde de los botones y la
  capa de color de las superficies. Todo pasó a propiedades largas
  (`background-color`, `border-width`, `border-style`, `border-color`). Efecto
  colateral que también se corrige: el borde del botón `solid` quedaba del color
  del tono (naranja) aunque una regla posterior le cambiara el fondo, porque la
  abreviada `border` no se podía sobrescribir sólo en el color. Se convirtieron
  además las abreviadas sin variable (`background:transparent`, `border:0`,
  `border:1px solid currentColor`, etc.) para que no quede ninguna en el archivo.

---

## 0.3.32 — 30 de septiembre de 2026

### Corregido

- **Una regla de color con un rol propio no pintaba nada.** La regla «color» de
  las recetas sólo pintaba si el rol se llamaba con una de ocho palabras en
  inglés (`background`, `surface`, `canvas`, `text`, `foreground`, `ink`,
  `muted`); con cualquier otro nombre —`titulo`, `texto`, `acento`— emitía una
  variable que ningún estilo consumía y el elemento seguía con su color de antes,
  sin error ni aviso. Medido en vivo: un rol `titulo` con `#DC4017` aplicado a un
  `h2` emitió solo `--cod-color-titulo` y el título siguió en `rgb(51,51,51)`.
  Ahora la regla siempre emite la variable y además pinta: por omisión, como
  texto (`color`).
- **Nuevo campo opcional `apply` en la regla «color»** (`"text"` o
  `"background"`, por omisión `"text"`) para elegir si el color va a `color` o a
  `background-color`. Cualquier otro valor se rechaza con un error claro. Los
  atajos por nombre de rol se mantienen cuando no se indica `apply`, así que lo
  ya compuesto no cambia. Los fondos de bloque siguen yendo por la regla
  «surface». El catálogo de capacidades lo deja dicho.

---

## 0.3.31 — 29 de septiembre de 2026

### Corregido

- **«cuadrantes»: el texto del ítem activo tenía un hueco enorme entre el título
  y el párrafo.** Causa: el bloque de texto del ítem es un grupo del sitio con
  `display:grid`, y el módulo le fija la altura de una celda. Una grilla más alta
  que su contenido reparte el espacio sobrante entre sus filas, y por eso el
  título quedaba a unos 120 px del primer párrafo (y los párrafos entre sí). Ahora
  el panel de texto alinea su contenido al inicio (`align-content:start`) y el
  texto queda junto, como en el original.
- **«cuadrantes»: la «×» quedaba pegada al borde del bloque y parecía flotar en
  el margen.** Ahora lleva un respiro de 0,5 rem desde la esquina superior
  derecha, dentro del área visible del módulo.

### Aclarado

- **Las miniaturas nunca se salen de la imagen activa.** Se calculan contra la
  caja de la imagen activa (una celda), no contra el envoltorio completo; medido
  a 1280 px, la mini grilla termina exactamente en el borde de la imagen. Lo que
  parecía lo contrario era el guion de captura: Chrome sin ventana no avanza las
  transiciones entre cuadros y, al retratar, dejaba las miniaturas a medio camino
  (más anchas que altas, montadas sobre el texto). El guion
  `scripts/piezas/probar-cuadrantes.mjs` ahora pide `prefers-reduced-motion`
  para retratar la disposición final.

---

## 0.3.30 — 29 de septiembre de 2026

### Agregado

- **Una conducta nueva: «cuadrantes».** Es un display de **cuatro contenidos**,
  cada uno con imagen, título y texto. Lo diseñó Cristóbal para el sitio de
  Econut y se porta acá para que cualquier sitio lo pueda reusar.

  **En reposo** son las cuatro imágenes en una grilla 2×2 de cuadrantes
  cuadrados e iguales. **Al activar uno**, esa imagen crece hasta ocupar la
  mitad del bloque, su título y su texto aparecen en la otra mitad, y las otras
  tres imágenes pasan a miniaturas pegadas a la esquina de la imagen que mira
  hacia el centro del bloque. El bloque baja de alto (de dos celdas a una) y
  aparece una «×» para volver a reposo.

  Lo que hace bueno al módulo, y por eso no es un carrusel: **las tres
  miniaturas conservan la disposición 2×2 que tenían**. Forman una mini grilla
  con un hueco justo donde estaba la activa: la que estaba a la derecha sigue a
  la derecha, la que estaba abajo sigue abajo. Así no se pierde la referencia
  espacial. De qué lado queda la imagen y en qué esquina las miniaturas depende
  de dónde estaba el cuadrante:

  | Ítem (posición en reposo) | Imagen    | Texto     | Miniaturas       |
  |---------------------------|-----------|-----------|------------------|
  | 1 arriba-izquierda        | izquierda | derecha   | abajo-derecha    |
  | 2 arriba-derecha          | derecha   | izquierda | abajo-izquierda  |
  | 3 abajo-izquierda         | izquierda | derecha   | arriba-derecha   |
  | 4 abajo-derecha           | derecha   | izquierda | arriba-izquierda |

  Al tocar una miniatura, pasa a ser la activa, con su lado y su esquina según
  **su** cuadrante de origen.

  **Es el port de la hoja original del sitio de Econut**, que estaba clavada en
  900 px con celdas de 440 px. Se conserva en proporción: celdas cuadradas con
  20 px de separación sobre 900 px; miniaturas de 88 px sobre celdas de 440 px
  (el 20 % del lado) con 14 px entre ellas y borde de 1 px; la «×» arriba a la
  derecha; el radio de 8 px. Medido a 900 px de ancho, las posiciones de las
  miniaturas coinciden al píxel con las coordenadas de la hoja original en los
  cuatro casos. Lo único que cambia: (1) es fluido, todo se mide en % del ancho
  del bloque; (2) no usa `!important`, que allá sólo peleaba contra Divi; (3) el
  movimiento usa los tokens del set en vez de `all 0.4s ease-in-out`; (4) en
  móvil, la grilla 2×2 se mantiene en reposo y al activar la imagen va arriba,
  el texto abajo y las miniaturas en fila dentro de la imagen (ahí sí se rompe
  la disposición, porque no hay espacio).

  **Cómo se declara.** En una composición MCP, con una regla `interaction`
  `behavior: "cuadrantes"` sobre un nodo `group` con **exactamente cuatro
  hijos**; cada hijo es un contenedor con una imagen y su texto (título y
  párrafo). Si el nodo no es un `group` o no tiene cuatro hijos, el compilador
  responde con un error claro en vez de publicar un bloque que no se comporta.
  El compilador emite un solo atributo, `data-cod-behavior="cuadrantes"`; el
  resto (botones, «×», estados) lo arma el runtime al cargar la página. En el
  editor GrapesJS se declara poniendo ese mismo atributo al grupo.

  **Qué hace por dentro.** Ningún elemento cambia de lugar en el DOM: cada
  imagen es siempre la misma celda y lo que cambia, por CSS, es su posición y su
  tamaño. Cada imagen queda envuelta en un `div` (`cod-cuadrantes__media`) con
  un `button` transparente encima (`cod-cuadrantes__disparador`); el texto se
  marca como panel (`cod-cuadrantes__info`) y se agrega un botón «×»
  (`cod-cuadrantes__cerrar`). El estado vive en atributos del bloque:
  `data-cod-cuadrantes-estado` (`reposo` o `activo`), `-activo` (1 a 4),
  `-lado` (`izquierda` o `derecha`) y `-esquina` (`arriba` o `abajo`); y en cada
  imagen, `-item` (su origen), `-rol` (`cuadrante`, `activa` o `miniatura`) y
  `-slot` (el orden de las miniaturas, que usa el móvil).

  **Accesibilidad.** Los cuadrantes y las miniaturas son `button` de verdad,
  con `aria-label` (el título) y `aria-expanded`. Escape cierra. El foco pasa
  a la «×» al abrir y vuelve al cuadrante que se había abierto al cerrar.
  Con `prefers-reduced-motion` no hay transición ni animación, pero el cambio
  de estado funciona igual.

  **Estilos.** El plugin aporta sólo la geometría y el movimiento
  (`COD_Canvas_Page_Publisher::cuadrantes_css()`, que se emite únicamente si la
  página usa la conducta). No trae ningún color de marca ni tipografía: eso lo
  ponen las reglas de diseño de cada sitio; los únicos colores son las palabras
  clave del sistema (`Canvas`, `CanvasText`) del borde de las miniaturas, la «×»
  y el anillo de foco. El cambio de estado (el bloque baja de alto y las
  imágenes viajan) usa `--cod-motion-response`, y el texto al aparecer usa
  `--cod-motion-enter`. Si el sitio no declara esos tokens el cambio es
  instantáneo; no se inventan duraciones. Ajustes opcionales por variables:
  `--cod-cuadrantes-separacion` (fracción del ancho), `--cod-cuadrantes-radio`
  (por omisión `--cod-radius` y, si no, 8 px), `--cod-cuadrantes-aire` (relleno
  del texto) y, para el móvil, `--cod-cuadrantes-movil-miniatura-ancho`,
  `-separacion` y `-margen`.

  **Dentro del editor no se ejecuta**, igual que otras conductas de página
  pública: allí el bloque se ve apilado, con el texto visible y cada imagen
  seleccionable, sin botones encima ni textos ocultos.

  **Por qué existe.** Cristóbal lo resolvió a mano para Econut. Sin una
  conducta del plugin, cada sitio que lo quisiera tendría que repetir el
  JavaScript y la geometría a mano, y esa geometría (las cuatro combinaciones
  de lado y esquina, con la mini grilla y su hueco) es justo lo que se rompe al
  copiar.

---

## 0.3.29 — 17 de septiembre de 2026

### Agregado

- **Una conducta nueva: «preferencias-cookies».** Cualquier elemento del
  documento puede reabrir el panel de preferencias del banner de cookies. Va
  en el pie, que es donde la ley espera encontrarlo: sirve para que alguien
  cambie de opinión después de haber respondido el banner.

  Se declara como se declara cualquier conducta:

  ```html
  <button type="button" data-cod-behavior="preferencias-cookies">Preferencias de cookies</button>
  ```

  **Por qué existe en vez de usar la clase del propio plugin de cookies.** Se
  probó primero ponerle al elemento la clase que CookieAdmin escucha. No
  sirve: esa clase no es un gancho, es su **ícono flotante**. Trae
  `position:fixed`, 50×50 y su color, y además su JavaScript le cambia el
  `display` al primer elemento que la tenga. Un enlace del pie con esa clase
  se habría arrancado del pie y habría aparecido y desaparecido solo.

  Así que el documento declara una conducta nuestra y el runtime le reenvía el
  clic al disparador que el plugin de cookies ya tiene. Si ese plugin no está
  activo, el elemento no hace nada y tampoco estorba.

  Es un `<button>` y no un `<a>` a propósito: no navega a ninguna parte,
  ejecuta una acción en la misma página. Un `<a href="#">` saltaría al inicio
  del documento y no se anunciaría bien a quien navegue con teclado.

---

## 0.3.28 — 17 de septiembre de 2026

### Agregado

- **El movimiento entra al núcleo del set de diseño, con dos definiciones.**
  Hasta ahora el núcleo declaraba seis roles —tres colores, dos tipografías y
  una medida— y el movimiento no estaba en ninguna parte. Por eso terminó
  escrito **trece veces a mano** repartido entre los documentos, cinco de ellas
  atadas a identificadores generados como `#irnrp6`, que no se pueden reusar.

  Ahora son ocho roles. Los dos nuevos son **Aparecer** y **Responder**, y son
  dos y no uno por una razón medible: los dos gestos que el sitio ya usa
  agrupan en 420–500 ms y en 160–200 ms, con un factor de 2,5 entre medias.

  No son variantes de lo mismo porque sus tiempos se calibran contra cosas
  distintas. **Aparecer** se mide contra la vista: el movimiento tiene que
  durar lo suficiente para que el ojo lo siga. **Responder** se mide contra la
  mano: pasados unos 150 ms deja de sentirse como respuesta y empieza a
  sentirse como lentitud. Al ajustar una se rompería la otra.

  Se declaran en ContOpe → Configuración, en un grupo nuevo llamado
  «Movimiento». El valor es una duración y una curva juntas, para poder
  escribirse tal cual dentro de un `transition`:

  ```css
  transition: opacity var(--cod-motion-enter);
  ```

  El campo acepta sólo lo que compone ese par —números, `ms`/`s`, las curvas
  por nombre, `cubic-bezier()` y `steps()`— y exige que haya una duración. Un
  punto y coma o una llave permitirían cerrar la declaración y escribir otra
  regla, así que se rechazan.

### Cambiado

- **El aviso del núcleo dice dónde se declara cada cosa.** Antes remataba
  siempre con «en el theme.json del tema activo o en Configuración». Para el
  movimiento eso es falso: esa dimensión no existe en el esquema de un
  theme.json, y habría mandado a alguien a buscar donde no está.

---

## 0.3.27 — 16 de septiembre de 2026

### Cambiado

- **El plugin dejó de inventar colores cuando el set de diseño no los declara.**
  Hasta ahora, si el set no definía el acento, la tinta o la superficie, el
  plugin ponía `#2271b1`, `#1d2327` y `#f0f0f1`: el azul, el casi negro y el
  gris del **panel de administración de WordPress**. También el color de los
  gráficos y el fondo de la cortina de precarga salían de valores escritos a
  mano adentro del código.

  El problema no es que el respaldo estuviera mal elegido. Es que un sitio
  pintado así **no parece roto: parece decidido**, y por eso nadie iba nunca a
  ir a arreglarlo. Contradice la premisa del sistema, escrita en varias partes:
  el set de diseño es cerrado, lo declarado es todo lo que hay, y que algo no
  esté prohibido no significa que esté disponible.

  Ahora hay **un núcleo declarado** para el mundo «sitio web»: seis clases de
  definición sin las cuales no hay con qué dibujar — tres colores (acento,
  tinta, superficie), dos tipografías (títulos, cuerpo) y una medida (el ancho
  de la caja de lectura). No es una lista de valores: es una lista de roles. No
  importa cuál es el color; importa que exista la definición.

  El plugin busca cada rol en dos lugares reales: las definiciones guardadas en
  Configuración y el `theme.json` del tema activo, que es donde WordPress mismo
  lee la identidad. **Leer la declaración del tema es lo contrario de
  inventarla**: el origen queda escrito en vez de adivinado. Si ningún lugar la
  trae, el plugin no pinta nada y **dice cuál falta, por su nombre**.

### Agregado

- **Configuración muestra el núcleo**: qué rol está declarado, con qué valor y
  desde dónde. Si falta alguno, sale un aviso que dice cuál y dónde declararlo.

- **`cod_get_capabilities` informa el núcleo** antes de componer, y la
  previsualización y la aplicación lo repiten junto a su evidencia. Quien
  construye se entera de que falta una definición **antes** de escribir, no
  después de mirar el resultado y encontrarlo raro.

- **`npm run check` rechaza el defecto**: falla si alguna de las tres variables
  de color del núcleo vuelve a llevar un valor de respaldo dentro de `var()`, o
  si el compilador vuelve a escribir un color del panel de WordPress. El defecto
  vivió meses sin que nadie lo viera; una nota depende de que alguien la
  recuerde, esto no.

### Detalle

- El fondo de la cortina de precarga sale del rol «superficie». Antes devolvía
  `#f6f6f3` cuando nadie lo definía, y daba la casualidad de que en Santa Luisa
  ese era el fondo real: **un respaldo que acierta es más peligroso que uno que
  falla**, porque no deja rastro. Ahora sale el mismo color, pero declarado por
  el tema. Si nadie lo declara, la cortina va sin fondo.

- El color de los gráficos toma el rol de acento leído del documento; si no hay
  acento declarado usa `currentColor`, que hereda la tinta del texto. Tocado en
  los dos motores —el del editor y el de la página publicada—, que son copias
  separadas.

- Los dos respaldos del carrusel (`--cod-carousel-columnas`, `--cod-carousel-gap`)
  **se conservan**: viajan escritos en el punto de uso, a la vista de cualquiera
  que lea el CSS, y son parámetros del módulo, no definiciones del set.

---

## 0.3.26 — 16 de septiembre de 2026

### Corregido

- **Un recorrido 360° dentro de la página se quedaba cargando para siempre.** El
  visor abría, el contenido llegaba entero —todos sus archivos respondían bien—
  y aun así se quedaba en «Loading virtual tour. Please wait…».

  La causa: el limpiador de documentos borraba el atributo `allow` de los
  iframes. Ese atributo es la lista de permisos que el marco le concede a lo que
  muestra: pantalla completa, acelerómetro, giroscopio, brújula, seguimiento
  espacial. Un recorrido 360 los pide al arrancar, y sin el atributo el
  navegador se los niega en silencio. El recorrido no falla con un mensaje: se
  queda esperando.

  Se veía bien mientras el marco apuntaba a un dominio ajeno porque entonces el
  recorrido corría en su propia página completa, no dentro de un marco nuestro.
  Al traer la copia al sitio, el marco pasó a ser el único camino.

  `allow` ahora se conserva. No amplía a qué sitios se puede apuntar —eso lo
  sigue decidiendo la lista de orígenes permitidos— sino qué puede hacer el
  contenido que ya fue admitido.

---

## 0.3.25 — 16 de septiembre de 2026

### Agregado

- **Dos fechas que las páginas pueden mostrar solas: `{{post_date}}` y
  `{{post_modified}}`.** El resolutor de contenido dinámico sabía traer título,
  extracto, imagen destacada, enlace permanente y campos de ACF, pero ninguna
  fecha.

  Salieron de una necesidad concreta: una política de privacidad debe indicar
  desde cuándo rige. Escribir esa fecha a mano es garantizar que algún día quede
  vieja. Son dos y no una porque responden preguntas distintas — desde cuándo
  rige el documento, y cuándo se tocó por última vez — y la de modificación sola
  no sirve para lo legal: cambiaría al corregir una coma y haría parecer que la
  política es nueva sin serlo.

  Ambas salen en el formato de fecha del sitio y en su idioma, así que la página
  no decide por su cuenta cómo escribir una fecha.

### Cambiado

- **Una comprobación exigía «los cuatro built-ins» y contaba.** Al agregar dos
  tokens legítimos, falló. Ahora comprueba que **cada token esté, por nombre**,
  en vez de cuántos hay: contar rompe la prueba cada vez que el sistema crece de
  forma correcta, y una prueba así estorba en lugar de proteger. Es la misma
  fragilidad de la issue #11.

---

## 0.3.24 — 16 de septiembre de 2026

### Cambiado

- **El CSS sale de los datos estructurados y de ninguna otra parte.** Hasta acá
  el documento guardaba una hoja de CSS plana que el editor volvía a tomar como
  «CSS fuente» y a escribir en el guardado siguiente. Eso es una segunda fuente,
  y es la puerta por la que entró la duplicación de la 0.3.23: mientras exista
  un lugar donde escribir estilos sin pasar por el motor, tarde o temprano
  alguien escribe ahí.

  Ahora, al abrir un documento, se resta **siempre** del CSS guardado lo que el
  modelo ya conoce — antes sólo se hacía cuando faltaba el marcador. En un
  documento completo eso deja la hoja en nada, que es exactamente el fin
  buscado.

  Los seis documentos de Santa Luisa se migraron primero, y recién después se
  hizo el cambio: **cortar antes de migrar habría perdido estilos.** Entre lo
  mudado estaban el menú de celular, el hero en teléfono acostado y la barra del
  visor 360.

### Agregado

- **`scripts/cod-grapes-runner/migrar-css-al-json.mjs`**, que hace esa mudanza y
  **se niega a escribir si algo cambiaría en pantalla**.

  Compara los dos resultados —con hoja y sólo con el JSON— por *qué valor
  termina teniendo cada propiedad*, no por el texto de las reglas. Comparar el
  texto da falsos positivos apenas se fusionan dos `@media` de la misma
  condición: el texto cambia y la página se ve igual. Las seis migraciones
  dieron **cero diferencias**.

### Nota

Si un documento trae CSS que el modelo no conoce, **no se descarta en
silencio**: se conserva y el editor avisa cuántas reglas son y por qué conviene
migrarlas. Perder estilos de un sitio publicado por aplicar una regla nueva
sería peor que la regla vieja.

---

## 0.3.23 — 15 de septiembre de 2026

### Corregido

- **El CSS del documento se duplicaba en cada guardado.** El editor copiaba
  dentro del documento, cada vez que guardabas, las once reglas base del Grupo
  Dinámico: las raspaba de la hoja de estilos del panel de administración y las
  pegaba encima de las que ya había dejado el guardado anterior. Una copia por
  ciclo. La portada de Santa Luisa tenía cada una **siete veces**, un 13,6% de
  su CSS en copias exactas, y hay reportes de haber visto hasta 25.

  Esto ya se había tapado deduplicando al serializar. Eso limpia el resultado
  pero no impide que se siga copiando, y además sólo actúa cuando el guardado
  sale del editor: los del runner y los del MCP escriben la hoja plana, así que
  en esos documentos las copias quedaban intactas.

  **El CSS base de un módulo del plugin es del plugin, no del documento.** Ahora
  lo emite el plugin en la página publicada, antes del CSS del documento para
  que lo que personalizaste siga ganando la cascada, y el editor dejó de
  escribirlo. El documento vuelve a llevar sólo lo que es suyo.

  La deduplicación se conserva como red, no como solución: hay documentos
  guardados que todavía arrastran las copias viejas.

  Issue #12.

### Cambiado

- **Las reglas de un módulo sólo viajan si la página lo usa.** Al medir se vio
  que **ninguna página de Santa Luisa usa el Grupo Dinámico**: las once reglas
  llevaban meses cargándose en las cinco sin dibujar nada. Ahora se emiten sólo
  cuando el HTML de la página realmente contiene el módulo.

  La comprobación mira el HTML y nunca el CSS, a propósito: el CSS de los
  documentos viejos todavía menciona esas clases, así que mirarlo daría siempre
  verdadero y no serviría de nada.

---

## 0.3.22 — 15 de septiembre de 2026

### Corregido

- **Los mensajes de límite decían un tamaño que no era.** El tope de CSS se
  subió de 512 KB a 2 MB el 21 de agosto y el mensaje de error siguió diciendo
  512 KB durante casi un mes. Quien topara el límite recibía un número falso: con
  512 KB en la cabeza uno parte su CSS en pedazos para bajar de una cifra que el
  sistema hace rato dejó de aplicar, o concluye que el guardado está roto.

  Ahora los tres mensajes —HTML, CSS y datos estructurados— **arman el número a
  partir del propio límite**, así que no pueden volver a desincronizarse. Se
  escribió como un ayudante y no como tres textos corregidos a mano, porque
  corregir el texto sólo arregla esta vez.

- **El error ahora dice cuánto traía el documento.** Antes decía únicamente cuál
  era el tope. Saber que el límite son 2 MB no ayuda si no sabes si te pasaste
  por diez kilobytes o por el doble: en el primer caso se borran cuatro reglas
  huérfanas, en el segundo hay que mirar por qué se acumuló tanto. Es la misma
  lección de la 0.3.20: un error que sólo dice «no se pudo» manda a buscar a
  ciegas.

  Issue #10.

---

## 0.3.21 — 15 de septiembre de 2026

### Corregido

- **Un sitio no podía incrustar contenido propio.** La regla que decide qué
  puede aparecer dentro de un `iframe` exigía una dirección `https://` con el
  dominio declarado en Configuración. Eso deja afuera un caso que no es el que
  la regla quería atajar: **una ruta del propio sitio**, como `/360/`.

  La regla existe para que un documento traído de afuera —una plantilla, un
  paquete de otro sitio— no pueda meter una página ajena dentro de la tuya con
  tu dominio en la barra. Una ruta que empieza con una barra no es un tercero:
  es este mismo WordPress sirviendo algo suyo. No hay origen que declarar
  porque ya es el del dueño del sitio.

  Ahora se admite la ruta absoluta de una sola barra. Quedan fuera a propósito
  `//otro.com/x`, que es relativa al esquema y apunta afuera, y `/\otro.com`,
  que varios navegadores leen como lo mismo.

  El caso real: un recorrido 360 alojado en el propio servidor. Antes había que
  escribir el dominio completo adentro del documento, lo que además ata el
  contenido a ese dominio — justo lo que hace doloroso mudar un sitio. Con la
  ruta relativa, el contenido sigue al dominio que lo sirva, igual que las
  imágenes.

---

## 0.3.20 — 14 de septiembre de 2026

### Corregido

- **El plugin no encontraba Node.js en hosting compartido, y sí estaba.** El
  puente headless a Grapes buscaba el ejecutable en cuatro rutas fijas
  —`/usr/bin/node`, `/usr/local/bin/node`, homebrew y Windows— más
  `command -v node`. Ninguna sirve en un cPanel con CloudLinux, que instala
  Node bajo `/opt/alt/alt-nodejs*/root/usr/bin/node` y **no lo deja en el PATH
  del proceso de PHP**.

  Desde el 4 de septiembre se daba por hecho, y estaba anotado como verificado,
  que el servidor de Santa Luisa no tenía Node. **Lo tenía.** Lo que no
  teníamos era la ruta.

  Ahora se buscan también `/opt/alt/alt-nodejs*/root/usr/bin/node` y
  `/opt/cpanel/ea-nodejs*/bin/node`, ordenadas de mayor a menor versión para
  tomar la más nueva disponible.

- **El error dice dónde buscó.** Antes decía sólo «no se encontró el
  ejecutable», que obliga a volver a averiguar lo mismo desde cero cada vez.
  Ahora lista las rutas probadas y avisa si `shell_exec` está deshabilitado.
  Esa falta de detalle es la razón de que una conclusión equivocada durara diez
  días.

### Lo que sigue faltando

Con Node resuelto, el puente falla un paso más adelante: **no hay un navegador
headless** en el servidor —Chrome, Chromium o Edge—. El propio error lo dice
ahora, con la lista de lo que probó.

Eso es lo único que falta para que `cod_grapes_edit_node` funcione sin depender
de la máquina de nadie, y es el punto que decide si el sistema es portable o si
el motor tiene que seguir corriendo en un computador propio.

---

## 0.3.19 — 14 de septiembre de 2026

### Agregado

- **La ventana de WhatsApp ahora avisa también cuando se abre, no sólo cuando
  se envía.** Antes sólo se medía a quien escribía un mensaje y lo mandaba.
  Quien pinchaba el ícono, miraba la ventana y la cerraba no quedaba registrado
  en ninguna parte — y esa persona también mostró interés, en una zona concreta
  de la página.

  Se emite `whatsapp_abierto` con el mismo campo `origen` que ya llevaba
  `whatsapp_enviado`: el `id` de la sección de la que salió el botón. Con los
  dos eventos se puede ver, por zona, cuántos pincharon y cuántos de ésos
  llegaron a escribir.

  El nombre es configurable con `data-cod-wa-event-open`, igual que el de envío
  con `data-cod-wa-event`. Va por las tres vías de siempre —evento del
  navegador, `dataLayer` y `gtag`— y ninguna depende de las otras. **Nunca
  viaja lo que la persona escribió**: sólo de qué zona salió.

- **`remove` en `cod_grapes_edit_node`.** El puente headless sabía quitar un
  nodo desde el principio; el esquema del MCP declaraba las otras seis
  mutaciones y no ésa, así que por MCP no se podía borrar nada y había que
  bajar al script local.

  El PHP nunca filtró la mutación —la pasa tal cual al puente—, o sea que lo
  único que faltaba era declararla. Ahora las siete están disponibles por MCP:
  `attributes`, `content`, `addClass`, `removeClass`, `style`, `move` y
  `remove`.

  Lo protege lo mismo que a las demás: `expectedRevision` rechaza el cambio si
  alguien tocó el documento entremedio, y Canvas guarda una instantánea al
  escribir.

### Cambiado

- **El consentimiento sólo viaja si existe la casilla.** El evento mandaba
  siempre `consentimiento: true|false`. En un sitio sin casilla eso significaba
  mandar `false` en cada envío, que al leerlo parece «nadie acepta» cuando en
  realidad es «no se pregunta». Ahora el campo se omite cuando no hay control
  de consentimiento en la ventana.

### Nota para quien mantenga esto

La ventana de WhatsApp **no corre dentro del editor**, a propósito:
`cod-behaviors.js` sólo declara el comportamiento y la implementación vive
únicamente en `cod-canvas-public.js`. No es un caso de los tres runtimes
duplicados; acá hay una sola copia.

---

## 0.3.18 — 14 de septiembre de 2026

### Cambiado

- **El campo de valor del mapa de lotes ya no se oculta en las parcelas
  vendidas.** El panel del plano mostraba una raya en vez del contenido de
  `data-cod-parcel-valor` cuando la parcela estaba vendida:

  ```js
  fieldVal.textContent = esDisponible && valor ? valor : '—';
  ```

  Tenía sentido mientras ese campo fuera un precio: el precio de una parcela ya
  vendida no le importa a nadie. Pero el campo no está atado a un precio —
  guarda lo que el sitio quiera mostrar ahí— y en Santa Luisa pasó a mostrar si
  la parcela es central o perimetral, que es un dato de ubicación y vale igual
  para las vendidas.

  Ahora el runtime muestra lo que haya y deja la raya sólo cuando de verdad no
  hay nada:

  ```js
  fieldVal.textContent = valor ? valor : '—';
  ```

  `esDisponible` sigue decidiendo lo que sí depende del estado: el color del
  acento y el rótulo Disponible/Vendida.

  Cambiado en las **tres** copias del runtime, como exige la regla de la casa:
  `cod-canvas-public.js` (página publicada), `cod-behaviors.js` (editor) y la
  copia serializada que ese mismo archivo lleva adentro.

  Quien tenga un mapa de lotes con precios y quiera conservar el
  comportamiento anterior sólo tiene que no declarar el valor en las parcelas
  vendidas, que es como ya estaba en Santa Luisa.

---

## 0.3.17 — 13 de septiembre de 2026

### Corregido

- **Tercera causa del mismo defecto: un campo vacío se trataba como inválido.**
  La 0.3.16 arregló dos de las tres razones por las que una composición leída
  del sitio no se podía reenviar. La prueba de ida y vuelta destapó la que
  faltaba, que era la más extendida de todas.

  La normalización emite `role` y `marker` como cadena vacía cuando el nodo no
  los declara. El validador, en cambio, exigía que fueran identificadores
  válidos apenas estuvieran presentes — y `''` no lo es, porque un
  identificador tiene que empezar con letra.

  Resultado: **fallaba en casi todos los nodos**, porque la mayoría no tiene ni
  rol ni marcador. Y el mensaje —«un nodo tiene una forma, tipo o profundidad
  no permitidos»— no daba ninguna pista de cuál nodo ni de cuál campo.

  Ahora un valor vacío se trata como lo que es: la **ausencia** del campo, no un
  valor mal escrito. Es la misma corrección que la de `content` en 0.3.16, en
  otros dos campos.

## 0.3.16 — 13 de septiembre de 2026

### Corregido

- **Una composición leída del sitio no se podía reenviar.** El flujo que el
  propio MCP documenta dice, en su paso 2: leé la composición aplicada,
  modificá sólo el nodo que corresponda y *«conservá el resto tal cual»*.

  Eso no funcionaba. Al reenviar lo que `cod_read_canvas_composition` devolvía,
  el sitio respondía *«La composición debe declarar schemaVersion=2 y una lista
  no vacía de nodos»* — aunque la composición declarara `schemaVersion: 2` y
  trajera todos sus nodos.

  Dos causas, las dos por campos que el propio servidor agrega al leer:

  La lectura devolvía **campos derivados** dentro de la composición —`nodeIds`,
  `markers`, `nodeCount`—, y el validador no admite claves de más. Ahora viajan
  aparte, en `resumen`, y `composition` queda exactamente como hay que
  reenviarla.

  Y los nodos con hijos volvían con **`content` vacío**, que el validador
  rechazaba por estar presente. Un `content` vacío no es «usar content»: ahora
  se rechaza sólo si trae algo adentro.

  El mensaje de error tampoco ayudaba: acusaba a `schemaVersion` y a la lista de
  nodos, que eran justo las dos cosas que sí estaban bien.

  Reportado en [#8](https://github.com/Cristobalconcha/contope-publisher/issues/8).

### Agregado

- **Una prueba del ciclo completo.** `scripts/probar-ida-y-vuelta.mjs` lee la
  composición de una página real y la reenvía sin tocar nada. Es la única forma
  de comprobar que el paso 2 del flujo funciona de verdad; todo lo demás prueba
  partes sueltas.

  Verificada de las dos maneras: contra el código viejo falla y reproduce el
  mensaje engañoso; contra el nuevo pasa.

## 0.3.15 — 13 de septiembre de 2026

### Agregado

- **Un grupo Marca en Configuración, y el ícono del sitio dentro.** El favicon
  es una definición de **marca**, no un ajuste de WordPress: pertenece al tema,
  igual que la paleta o la tipografía. Por eso ahora vive en Configuración y no
  en Ajustes → Generales.

  WordPress trae su propio «Icono del sitio», así que quedan dos lugares donde
  definirlo. La respuesta no es evitar el duplicado: es **declarar cuál manda**.
  Si el tema declara un ícono, el tema gana y el de WordPress se apaga. Si el
  tema no declara ninguno, WordPress sigue haciendo lo suyo y nadie se entera
  de que esto existe.

- **Un tipo de campo nuevo: imagen.** Abre la biblioteca de medios de WordPress
  y guarda la dirección del archivo elegido. Sólo acepta archivos **de este
  sitio**: el valor termina dentro de un `<link>` en la cabecera de todas las
  páginas, así que una dirección ajena sería un recurso de un tercero cargándose
  en cada visita.

  Es el primer campo que no es color, número ni lista. Los tipos son la capa que
  vive en código; lo que se construye encima es lo que puede venir de una
  definición importada.

### Corregido

- **La revisión de PHP no revisaba sintaxis.** `scripts/revisar-php.mjs` existía
  porque *«esta máquina no tiene PHP instalado, así que no hay `php -l`»* — y eso
  dejó de ser cierto: hay un PHP en `wp-local`.

  La diferencia no es teórica. Hoy la revisión casera dio «ninguno con
  problemas» sobre un archivo que PHP rechazaba, porque el error tenía **todas**
  las comillas y **todos** los corchetes balanceados: estaba bien formado y mal
  escrito, que es justo lo que un balanceador no puede ver.

  Ahora usa `php -l` cuando hay intérprete, y la revisión casera sólo como
  respaldo. Dice al final con cuál de los dos revisó.

- **La prueba del CSS del tema medía la copia equivocada.** El WordPress local
  carga *su* copia del plugin, no la del repo. Sin sincronizar, la prueba
  aprobaba código que ni siquiera había visto. Ahora sincroniza ella misma antes
  de medir, en vez de confiar en que alguien se acuerde.

## 0.3.14 — 13 de septiembre de 2026

### Corregido

- **Publicar una página por MCP nunca funcionó.** La herramienta
  `cod_publish_canvas_page` respondía siempre *"Guarda contenido en el Canvas
  antes de publicarlo"*, incluso con páginas que tenían contenido guardado.

  La causa no era el contenido: era el llamado. El servicio invocaba el método
  equivocado —`publish()`, el del editor, que recibe identificador de documento,
  título y página— en vez de `publish_existing_if_revision()`, que es el que
  recibe una página existente y una revisión esperada.

  Los dos métodos existen y se parecen; los argumentos iban en otro orden y eran
  cinco para un método de tres. **PHP no se queja de eso**: acepta argumentos de
  más y convierte el número en texto sin avisar. Así, el número de página
  entraba donde se esperaba el identificador del documento, el documento salía
  vacío, y el mensaje de error terminaba acusando al contenido.

  Se descubrió al crear la página de Términos y condiciones, que es la primera
  página nueva publicada íntegramente por MCP.

### Agregado

- **Una prueba que compara cada llamado con la firma del método.**
  `scripts/probar-firmas.mjs` revisa los 132 llamados internos del plugin y
  avisa si alguno pasa más o menos argumentos de los que el método declara.

  Existe porque este defecto no se podía ver leyendo: el código se veía
  razonable y el error apuntaba a otro lado. Una nota en la documentación
  habría dependido de que alguien la recordara; esto no.

## 0.3.13 — 13 de septiembre de 2026

### Agregado

- **La capa a pantalla completa se puede enlazar.** El visor que muestra algo
  de afuera —un recorrido 360, un video— tenía una sola manera de abrirse:
  apretar su botón. Y por lo tanto no tenía dirección: no se podía enlazar
  desde el menú, un correo ni un código QR.

  Ahora, llegar a la página con el nombre de la capa en la dirección la abre
  sola. El nombre es el **Marcador** del bloque —el mismo que identifica
  cualquier destino— así que no hay un segundo sistema de nombres al lado del
  primero. Se puede declarar otro con `data-cod-visor-hash` si conviene.

  Tres cosas que se cuidaron:

  El iframe **sigue sin cargarse** hasta que alguien abre la capa. Ese era el
  punto de todo el diseño —un recorrido 360 pesa, y la portada no debe
  arrastrar ese peso para quien nunca lo abre— y sigue en pie: llegar sin el
  nombre en la dirección no carga nada.

  **Al cerrar se limpia la dirección**, para que recargar o volver atrás no
  reabra lo que la persona acaba de cerrar.

  **El botón de siempre sigue funcionando igual.** Esto se suma, no reemplaza.

## 0.3.12 — 13 de septiembre de 2026

### Agregado

- **Un bloque se puede reubicar por MCP, no sólo restilar.** El puente a
  GrapesJS sabía cambiarle a un bloque sus atributos, sus clases, su estilo y
  su texto, y sabía eliminarlo — pero no sabía **moverlo**. Por eso un bloque
  mal ubicado quedaba sin arreglo posible desde la IA: había que abrir el
  editor y arrastrarlo a mano.

  La mutación acepta ahora `move`, con tres formas de decir dónde: `into`
  (adentro de otro bloque, al final o en la posición que se indique), `before`
  y `after` (como hermano, antes o después de otro).

  Usa la API real de Grapes, o sea **el mismo movimiento que haría alguien
  arrastrándolo con el mouse**: el bloque cambia de padre de verdad. La
  alternativa —simular la posición con `position`, `order` o un margen
  negativo— deja el árbol mintiendo: el editor lo sigue mostrando donde estaba
  y quien lo toque después pelea contra reglas que no explican nada.

  Rechaza lo que no puede terminar bien: declarar dos destinos a la vez, un
  destino que no existe, uno que calza con más de un bloque, y mover un bloque
  adentro de sí mismo o de un descendiente suyo.

## 0.3.11 — 13 de septiembre de 2026

### Agregado

- **El Marcador se puede poner desde el editor.** La versión anterior trajo la
  función pero sólo por el canal del MCP: había que pedirla por texto, no se
  podía hacer abriendo el editor. Ahora el inspector tiene un panel
  **Marcador** con dos campos.

  El primero es el **nombre del destino**. Al escribirlo te muestra el enlace
  que queda —`#plano`— que es lo que se pega en un QR o en el menú. Limpia
  solo los acentos, espacios y mayúsculas, porque un enlace con esos
  caracteres no funciona igual escrito a mano que copiado.

  Y **avisa si el nombre ya está usado en la página**. Sin ese aviso se
  publican dos bloques con la misma dirección y el enlace llega a cualquiera
  de los dos: sin error, sin señal, sin nada que mirar.

- **El aire de aterrizaje, en Configuración y una sola vez.** Cuando un enlace
  hace saltar la página hasta un bloque, el encabezado fijo queda encima y tapa
  el título al que se quería llegar. Configuración tiene ahora **Aire al llegar
  por un enlace**, que se aplica solo a todo bloque con Marcador.

  Va ahí y no en cada bloque porque el alto del encabezado es un dato del
  sitio, no de cada sección: declarado una vez, el día que cambie el encabezado
  no hay que acordarse de corregir nada.

- **Y un ajuste por bloque, para la excepción.** El mismo panel tiene un campo
  de aterrizaje propio, que en blanco usa el valor del sitio. Sirve para los
  casos en que no se quiere llegar justo arriba del bloque.

  **Admite valores negativos**, que hacen caer el scroll más adentro. Eso
  reemplaza el truco de mover el marcador a un párrafo vecino por razones
  ópticas — un truco que funciona hasta que se reordena el contenido, porque
  ahí el marcador ya no nombra su destino y el enlace apunta a otra cosa.

### Corregido

- **Un campo numérico de Configuración con mínimo negativo guardaba el signo
  cambiado.** Todos los campos pasaban por la misma limpieza, que descartaba el
  signo. Ningún campo existente lo notaba porque ninguno admitía negativos; el
  aire de aterrizaje es el primero. Ahora sólo se descarta el signo en los
  campos que declaran un mínimo de cero o más.

### Cambiado

- El campo que en 0.3.10 se llamaba `referenceId` se llama ahora **`marker`**.
  El nombre viajó en esa versión pero la función no se había usado en ningún
  sitio, así que el cambio no rompe nada. "Marcador" dice lo que es y no se
  confunde con la regla `anchor`, que es otra cosa: posicionar un bloque contra
  un borde de su contenedor y animarlo al entrar en vista.

## 0.3.10 — 13 de septiembre de 2026

### Agregado

- **Un bloque puede declarar a dónde llega un enlace.** Hasta ahora los bloques
  publicados no tenían dirección propia: un código QR, un enlace del menú o un
  botón no podían apuntar a una sección determinada de la página. Cada bloque
  puede ahora declarar un **destino** (`referenceId`) y aparece en la página
  publicada como `id`, que es lo que un enlace sabe buscar. Dos QR distintos
  pueden llevar así a los dos mapas.

  El destino es **identidad del bloque, no una regla de diseño**. La distinción
  importa y es la razón de que se haya construido así: una regla se aplica a
  muchos bloques a la vez, y si el destino fuera una regla, aplicarla dos veces
  crearía dos bloques con la misma dirección. El enlace llegaría a cualquiera
  de los dos, sin aviso. Por eso el plugin rechaza ahora dos destinos iguales
  en la misma página, en vez de publicar algo que falla en silencio.

- **Una medida nueva de espaciado: el aterrizaje.** Cuando un enlace hace saltar
  la página hasta una sección, el encabezado fijo del sitio queda encima y tapa
  justamente el título al que se quería llegar. La regla de espaciado acepta
  ahora `landing`, que es el aire que debe quedar arriba al aterrizar. A
  diferencia del destino, esto **sí** es una regla: es una decisión de diseño,
  suele ser la misma en todo el sitio —el alto del encabezado— y por eso
  corresponde declararla una vez y reutilizarla.

- **El logotipo de ContOpe viaja con el plugin** (`assets/img/`), en su versión
  corregida: gris frío y bronce en lugar de gris y oro, para que los dos colores
  se distingan entre sí y del fondo cuando trabajan en una interfaz. Todavía no
  se muestra en ninguna pantalla; queda disponible para cuando se vista la
  interfaz completa.

### Corregido

- **El selector de páginas del editor era negro sobre negro.** El editor visual
  tiene fondo oscuro propio, pero el navegador seguía dibujando las listas
  desplegables con su apariencia clara por omisión: al abrir una, las opciones
  salían en texto oscuro sobre fondo oscuro y no se leía ninguna. Se declara
  ahora el esquema de color de esa pantalla y el color de las opciones.

## 0.3.9 — 12 de septiembre de 2026

### Corregido

- **Un identificador de medición podía rechazarse sin decir por qué.** Al copiar
  desde una página web viajan pegados caracteres invisibles —espacio duro,
  espacio de ancho cero, marca de orden de bytes— que la limpieza de PHP no
  quita. Con uno de ellos adherido, el identificador no calzaba con su formato:
  el campo quedaba en blanco y no había nada que mirar para entenderlo. Pasó en
  el primer uso real de la pantalla.

  Ahora se limpian antes de validar. Y la pantalla **acepta también el fragmento
  completo** —el bloque `<script>` tal como lo entrega Google— del que extrae el
  identificador. Ésa es la forma en que estos códigos llegan a las manos de
  quien los pega, así que rechazarla sólo producía un campo vacío.

- **Un valor nuevo mal escrito ya no borra el que estaba funcionando.** Antes,
  un error de tipeo apagaba la medición que el sitio ya tenía. Vaciar un campo
  ahora sólo ocurre cuando se hace a propósito.

- **Un comentario del plugin tenía los acentos rotos** (`MÃ³dulo` en vez de
  `Módulo`), resto de una vez en que un archivo se escribió con la codificación
  equivocada. No afectaba al funcionamiento, pero estaba a la vista de quien lee
  el código.

  Para que no vuelva a colarse, la revisión que ya se ejecuta antes de cada
  despliegue ahora **detiene el despliegue** si encuentra acentos rotos en
  cualquier archivo. Una nota depende de que alguien se acuerde; esto no.

### Interno

- `scripts/probar-medicion.mjs` comprueba la normalización de identificadores.
  Lee los formatos **desde el propio PHP** en vez de repetirlos, para que no
  siga pasando en verde si mañana el original cambia.

---

## 0.3.8 — 12 de septiembre de 2026

### Nuevo

- **Etiquetas de medición**, en *ContOpe Design → Configuración*. Un lugar en el
  sitio para Google Tag Manager, Google Analytics 4, Google Ads, el pixel de
  Meta y las etiquetas de verificación de propiedad (Search Console, Bing,
  Meta). El sitio arma solo el fragmento oficial de cada herramienta y lo pone
  donde corresponde: Tag Manager lo más arriba posible del `head`, y su copia
  para navegadores sin JavaScript apenas abre el `body`.

  Se pegan **identificadores**, no código. Un cuadro donde se pega código suelto
  es la vía más común por la que un sitio termina ejecutando JavaScript ajeno, y
  cuando falla no queda nada que revisar salvo el propio pegado. Cada
  identificador se valida al guardar y, si está mal copiado, la pantalla lo dice
  con el ejemplo del formato esperado — porque un identificador equivocado no se
  nota mirando la página: la herramienta simplemente no recibe nada.

  Las verificaciones de propiedad aceptan las dos formas en que llegan en la
  vida real: la etiqueta completa copiada del proveedor, o el par
  `nombre=valor`.

  Incluye **"no medir las visitas de quien administra el sitio"**, porque
  mientras se trabaja en una página se la recorre decenas de veces y esas
  visitas ensucian los números de las campañas.

  Tag Manager queda cargado antes que cualquier evento que la página empuje, así
  que los avisos que el sitio ya emitía por su cuenta —**formulario enviado** y
  **WhatsApp abierto**— quedan disponibles en el contenedor apenas se conecta,
  sin tocar nada más.

---

## 0.3.7 — 12 de septiembre de 2026

### Corregido

- **Cuatro tipos de regla de diseño se aplicaban y no pintaban nada.** Las
  reglas de imagen, galería, tabla y movimiento (`media`, `gallery`, `table`,
  `motion`) alcanzan elementos que están *dentro* del módulo —la `img`, cada
  ítem de la galería, las celdas de la tabla— y por eso su ayudante ya devuelve
  la regla completa, con su selector. El compilador la volvía a envolver en el
  selector del módulo, produciendo `.x{.x img{…}}`: una regla que el navegador
  entiende como "una `img` dentro de un `.x` que está dentro de otro `.x`", algo
  que no existe en la página.

  El efecto era el peor posible: la evidencia de la previsualización mostraba la
  regla aplicada, el CSS quedaba escrito, y en pantalla no cambiaba nada. No
  había ningún error que seguir.

  Las demás reglas —color, tipografía, espaciado, botón, formulario— nunca
  estuvieron afectadas: sus ayudantes devuelven declaraciones sueltas y sí
  necesitan que el compilador las envuelva. Esa diferencia ahora está declarada
  en el código, con su nombre, en vez de quedar implícita en la firma de cada
  función.

> Reportado y corregido por quien lo encontró trabajando en otro sitio. Lo
> incorporamos verificando antes la causa: de los seis ayudantes de CSS, sólo
> esos cuatro reciben el selector.

---

## 0.3.6 — 11 de septiembre de 2026

### Corregido

- **Las reglas de diseño por MCP fallaban siempre.** El catálogo que publica
  `cod_get_capabilities` describía mal el campo `provenance`: decía
  `"provenanceSources": ["reference", "user", "ai"]`, lo que se lee como
  "provenance es uno de estos textos". En realidad tiene que ser un objeto con
  una lista `sources`. Cualquier asistente que siguiera la documentación al pie
  de la letra veía rechazada **el 100%** de sus reglas — justamente en el
  mecanismo pensado para que una IA declare estilos.

  Ahora el catálogo publica la forma real: tipo, campos obligatorios, límites de
  cada texto y un ejemplo completo.

- **El error no decía qué estaba mal.** Once condiciones distintas compartían un
  único mensaje: *"Una regla de diseño contiene campos no permitidos o
  incompletos"*. Quien lo recibía sólo sabía que algo fallaba, y para dar con la
  causa había que ir probando campo por campo o leer el código del plugin — que
  es lo que un consumidor del MCP no tiene a mano.

  Cada condición devuelve ahora su propio mensaje, diciendo qué campo falló y
  qué se esperaba. El de `provenance` incluye un ejemplo, porque es el que nadie
  adivina.

> Gracias a quien lo reportó con un diagnóstico que llegaba hasta la línea
> exacta. Salió de un ejercicio real: reproducir con el constructor una página
> que ya existía hecha con un tema de WordPress.

---

## 0.3.5 — 11 de septiembre de 2026

### Nuevo

- **Ventana para redactar el mensaje antes de abrir WhatsApp**
  (comportamiento `wa-mensaje`). Intercepta los enlaces a `wa.me` en vez de
  reemplazarlos, así cada botón conserva el mensaje propio de su sección y, si
  el JavaScript no cargara, los enlaces siguen funcionando como siempre.

  Incluye una casilla de consentimiento opcional —desmarcada, porque
  premarcada no es consentimiento— cuya aceptación se agrega como una línea al
  mensaje, de modo que queda escrita en la conversación con fecha y número.

  Al enviar emite un evento medible **antes** de salir del sitio. Ésa es la
  razón de existir del módulo: un clic que se va a WhatsApp se mide mal, sobre
  todo en teléfono, donde la aplicación toma el control antes de que la
  herramienta de medición alcance a registrar nada.

---

## 0.3.4 — 11 de septiembre de 2026

### Nuevo

- **Visor de contenido externo** (comportamiento `visor-embed`): una capa a
  pantalla completa que muestra una página de otro sitio —un recorrido 360, un
  video— sin sacar al visitante de la página. La dirección se carga recién al
  abrir y se descarga al cerrar, para que la página no arrastre ese peso para
  quien nunca lo abre.

- **Pantalla de sitios que puedes incrustar**, en *ContOpe Design →
  Configuración*. Hasta ahora sólo se admitían YouTube, Vimeo y Google Maps.
  Ahora el dueño del sitio declara qué otros dominios permite, uno por línea.

  Se declara en vez de abrirse a cualquier dirección porque un iframe muestra
  una página ajena **dentro** de la tuya, con tu dominio en la barra, y un
  documento importado de otro sitio podría traer uno sin que se note.

---

## 0.3.2 — 11 de septiembre de 2026

### Corregido

- **Abrir una página en el editor la guardaba sola.** GrapesJS avisa de cambios
  también al cargar un documento, y el editor lo tomaba como una edición: cada
  apertura generaba una revisión nueva sin que nadie tocara nada.

- **Cada guardado duplicaba la hoja de estilos.** Un documento cuya hoja no
  llevaba el marcador interno —cualquiera guardado desde el MCP— tomaba la hoja
  entera como CSS fuente mientras GrapesJS reexportaba las mismas reglas. Medido
  en un caso real: de 8.490 a 16.229 bytes con sólo abrir la página.

- **Las consultas `@media` se rompían al guardar.** La función que quitaba
  reglas repetidas partía el CSS por `}`, y un `@media` termina en `}}`: se
  perdía la llave de cierre y todo lo que venía después quedaba encerrado dentro
  de esa consulta. Reglas de escritorio convertidas en reglas de un solo ancho,
  sin ningún error a la vista.

- **Las reglas base de los módulos se acumulaban** en cada guardado, una copia
  por ciclo.

---

## 0.3.0 — 11 de septiembre de 2026

### Cambiado

- **El proyecto pasó a llamarse ContOpe.** El plugin era Open CoDesign. El
  cambio llega hasta adentro: el tipo de contenido, las claves de base de datos
  y el prefijo de las clases.

  Un sitio que venía de la versión anterior **migra solo** al activar, una única
  vez. No se pierde nada: se conservan los snapshots tal como estaban —son fotos
  del pasado— y los identificadores de documento, que son opacos y renombrarlos
  sólo traería referencias rotas.

  El servidor MCP pasó de `/wp-json/open-codesign/v1/mcp` a
  `/wp-json/contope/v1/mcp`, y sus herramientas de `ocd_*` a `cod_*`. Si
  conectaste un asistente, hay que actualizar esa dirección.

### Nuevo

- **Salvaguardas del guardado dentro del plugin**: repone las reglas de estilo
  que GrapesJS no conoce y que se perderían al reexportar, y avisa de las
  declaraciones abreviadas con variables, que desaparecen en silencio.
