# Registro de versiones

Qué cambió en cada versión publicada, en lenguaje de quien usa el plugin y no
de quien lo escribe. Lo más nuevo, arriba.

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
