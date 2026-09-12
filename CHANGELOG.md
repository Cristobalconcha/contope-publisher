# Registro de versiones

Qué cambió en cada versión publicada, en lenguaje de quien usa el plugin y no
de quien lo escribe. Lo más nuevo, arriba.

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
