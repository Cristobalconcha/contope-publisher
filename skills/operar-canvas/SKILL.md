---
name: operar-canvas
description: Operar el page builder de ContOpe Design / Contope Design en WordPress a través de su servidor MCP — crear y editar páginas dentro de la herramienta real, con las reglas que impiden romper el sitio. Usar en cualquier tarea que toque un sitio Canvas (crear una página o sección, cambiar textos, estilos, imágenes, mapas o formularios), antes de escribir nada.
---

# Operar el page builder

Este skill existe para que cualquier asistente —Claude, Codex, Z o el que venga— pueda entrar al WordPress donde vive el plugin y **construir lo que se le pida, dentro de la herramienta real**. No es un canal para subir cosas hechas afuera.

> "Lo que necesito es que la inteligencia artificial tenga construido su skill para poder conectarse con el MCP server y pueda entrar a la página donde está nuestro plugin y construir lo que se le pida." — Cristóbal, 2026-09-04

## El principio, antes que cualquier técnica

**Crear es el camino normal; reparar es la excepción.** Si alguien describe lo que quiere —"un header así, con un video sobre una imagen, cinco secciones, la primera con una foto grande"—, eso se construye llamando al motor real. Compilar HTML en otra parte y empujarlo adentro es exactamente lo que este proyecto rechaza, por bueno que sea el HTML.

El criterio de que algo quedó bien hecho: **una persona puede abrir esa página en el editor visual después y seguir trabajándola a mano, sin notar que la hizo una máquina.**

Nunca arreglar un defecto visual con una búsqueda-y-reemplazo sobre el CSS o el HTML guardados. Si el elemento no es alcanzable por el sistema, eso se dice y se decide con Cristóbal; no se parchea por cuenta propia.

## Las dos vías, y cuándo usar cada una

**1. Composición MCP — para crear.** Se declara un conjunto de reglas de diseño (color, tipografía, espaciado, layout, superficie, forma, media, botón, galería, tabla, formulario, motion, interacción, cadencia, ancla) y un árbol de nodos (section, header, group, heading, image, video, gallery, form…). El servidor lo compila llamando al motor real.

Circuito: consultar capacidades y páginas → si la página ya existe, `cod_read_canvas_composition` y **modificar solo lo que corresponde, conservando el resto** → `cod_preview_canvas_composition` → `cod_apply_canvas_composition` con el `previewId` exacto → revisar → `cod_publish_canvas_page`.

Ojo: si `cod_read_canvas_composition` responde `found:false`, esa página se armó a mano en el editor y **una composición nueva reemplazaría todo su contenido**. En ese caso se usa la vía 2.

**2. Puente headless (`cod-grapes-runner`) — para editar lo que ya existe.** Corre el motor real de GrapesJS fuera del servidor, sobre el documento vivo. Es la vía para cambiar un texto, un atributo, una imagen o un estilo de una página existente sin tocar el resto.

```
node scripts/cod-grapes-runner/cod-grapes-runner.mjs \
  --page <id> --document <documento> --selector "<css>" \
  [--set-content "texto" | --set-content-file archivo] \
  [--attributes '{...}' | --attributes-file archivo] \
  [--add-class a,b] [--remove-class c] [--remove] [--index N] \
  [--build receta.json] [--dry-run]
```

`--build` con `{mode:"append", styles:[{selector, style, media}]}` es la forma correcta de agregar o cambiar estilos: quedan **dentro del JSON del proyecto**, visibles y editables desde el editor visual. Parchear la hoja de estilos por fuera los deja invisibles para el editor y se pierden en la siguiente edición.

**Siempre `--dry-run` primero** en cualquier cambio grande, y revisar el archivo de simulación que deja en `backups/`.

## El CSS compartido entre páginas (`cod-shared-styles`)

Hasta el 2026-09-09 cada página guardaba su CSS por separado, sin ninguna capa
común — copiar una clase reutilizable como `.cod-btn` a cada documento a mano
era el único camino, y eso fue lo que rompió el sistema de botones: quedó
definido en una página y ausente en las otras tres. Cristóbal lo señaló
explícitamente: **"no podemos trabajar como si la web fueran compartimientos
estancos"** — no es una advertencia a recordar, es un defecto de arquitectura
que había que corregir en el propio Page Builder, y ya está corregido.

Existe un documento especial, `cod-shared-styles`, cuyo CSS se carga en la
cabecera de **todas** las páginas, antes del CSS propio de cada una. No
corresponde a ninguna página real: se edita con las mismas herramientas que
cualquier documento, usando `--page 0`:

```
node scripts/cod-grapes-runner/cod-grapes-runner.mjs \
  --page 0 --document cod-shared-styles --build receta.json
```

**Cuándo va ahí y cuándo va en la página:**
- Una clase que un elemento pueda tener en **más de una página** — el sistema
  de botones (`.cod-btn`, `.cod-btn--primario`), un componente compartido —
  va en `cod-shared-styles`. Una sola fuente, nunca copiada.
- Un estilo propio de una sección de una sola página (el layout del hero, el
  fondo de una sección puntual) sigue en el documento de esa página.

Antes de escribir una clase nueva de uso general, revisar si ya existe en
`cod-shared-styles` con `inventariar-regla.mjs` — evita crear una segunda
copia divergente de lo mismo.

**Para quitar una regla que ya se migró** (la copia de página que sobra una
vez que la clase vive en `cod-shared-styles`): `--build` con
`{selector, remove:true}`, por la API real de Grapes (`Css.getRule` +
`Css.remove`), nunca editando el CSS como texto.

## El rescate protege contra lo accidental, nunca contra lo pedido

El runner reconstruye el CSS pasándolo por el motor real de Grapes, y eso
puede tirar una regla como efecto secundario de una edición que no tenía nada
que ver — pasó de verdad varias veces esta sesión (el fondo de preguntas
frecuentes, el degradado de contacto, ninguno de los dos tocado a propósito).
El rescate existe para eso: compara antes/después y repone lo que desapareció
sin que nadie lo pidiera.

Pero **un `remove:true` explícito en la misma receta nunca se repone** — el
rescate sabe qué selectores tocó esta operación a propósito (los de
`styles[]`, tanto los que fija como los que quita) y los excluye de la
protección. Antes de esto, quitar una regla a propósito obligaba a
`--sin-rescate`, que apaga la protección entera — el instrumento equivocado,
porque también desprotege lo que de verdad hay que cuidar. Cristóbal lo
resumió así: proteger por fuera después del hecho es un parche; lo correcto
es que el propio pedido diga qué se está tocando, y que el sistema respete
eso — la misma idea de [[feedback_ir_al_json_no_blindar]], aplicada al CSS.
`--sin-rescate` sigue existiendo, pero ya no debería hacer falta para un
`--build` con removals explícitos.

El resumen final del runner ahora separa **"quitadas a propósito"** (lo que
la receta pidió) de **"ATENCIÓN: desaparecerían SIN que se pidieran"** (lo
que de verdad hay que revisar). Solo lo segundo es una alarma real.

## Antes de modificar una regla: el inventario

Ninguna modificación de estilo empieza escribiendo. Empieza averiguando **a qué
se aplica hoy lo que se va a tocar**. Cuatro preguntas, siempre, en este orden:

**1. ¿Qué dice la regla completa ahora mismo?** Leerla entera desde el documento
publicado, no de memoria ni del respaldo. `Css.setRule` **reemplaza la regla
completa**: lo que no se vuelva a escribir, se pierde. Reparar una declaración
sin devolver las demás borra el resto.

**2. ¿La regla agrupa varios selectores?** Una regla escrita como
`#mapa-interactivo, #ubicacion { … }` **se disuelve al pasar por el motor**: cada
selector queda por su cuenta. Si después se reescribe pensando en uno solo, el
otro se queda sin ese estilo y nadie lo nota, porque la regla sigue existiendo.
Pasó el 2026-09-09: el fondo del mapa quedó aplicado a una de las dos secciones
y la otra apareció en blanco al día siguiente. **Cada selector del grupo se
reescribe explícitamente.**

**3. ¿Cuántos elementos usan esa clase, y en qué páginas?** Una clase puede estar
en cuatro documentos distintos. Contar antes y volver a contar después: si el
número cambió sin que se haya tocado el HTML, algo se rompió. Y si la clase no la
usa ningún elemento, el estilo que se está por escribir no se va a ver — pasó con
un sistema de botones que quedó definido y sin aplicar a nada.

**4. ¿Hay otra regla con el mismo selector, después, que le gane?** El orden
decide. Una regla repuesta al final de la hoja le gana a la del JSON aunque sea
más vieja. Si el cambio "no se aplica", es lo primero que hay que mirar.

**Después de guardar, la comprobación es en la página, no en el código**: pedirle
al navegador el valor que realmente pinta, para el elemento que motivó el cambio
**y para los demás casos del inventario**. Un cambio que arregla un caso y rompe
otro se ve igual de bien si solo se mira el primero.

## El campo de contenido en el panel de control

El editor de texto nativo de GrapesJS (doble clic sobre el elemento, en el
lienzo) tiene un defecto documentado: no siempre inserta espacios al escribir
dentro de un botón o enlace (GrapesJS/grapesjs#3375). Cristóbal lo vivió en
carne propia intentando corregir un botón el 2026-09-09, y fue tajante:
pedirle que escriba en el Bloc de notas y pegue no es una solución seria para
una herramienta de producción, y el panel de control — donde ya se ajusta
forma, color y estilo — debía poder editar el **contenido** también, no solo
la presentación.

Desde 0.2.88 el panel de control (`cod-computed-inspector.js`) tiene una
sección **"Contenido de texto"** que aparece cuando el elemento seleccionado
es una hoja de texto simple (un botón, un enlace, un título, un párrafo — sin
componentes hijos propios adentro). Escribe con normalidad ahí; Enter o clic
afuera aplica el cambio por la API real de Grapes (`component.components()`,
la misma vía que usa el puente headless), sin pasar por el editor del lienzo.
**Esa es ahora la vía preferida para cambiar un texto desde la interfaz del
editor** — el doble clic en el lienzo queda para cuando hace falta texto con
formato mixto (negritas, enlaces internos) que el campo simple no cubre.

## Reglas duras

Cada una de estas costó horas y un defecto visible en producción.

**Nunca una abreviada con variable.** GrapesJS expande las abreviadas a sus partes y, si no puede resolver la variable, **descarta la declaración entera**. La regla sigue existiendo, vacía de ese estilo, y ninguna comparación por selectores lo detecta.

```
background: var(--tierra-50);        ← se pierde
background-color: var(--tierra-50);  ← sobrevive
```

Vale para `background`, `border`, `font`, `margin`, `padding`. Siempre en forma larga. Ya se perdieron así ocho fondos, el del bloque de preguntas frecuentes (que dejó el texto sobre una fotografía, ilegible) y el dorado de un botón.

**Una regla se reemplaza entera.** `Css.setRule` no fusiona: reparar una declaración borra las demás. Hay que leer el cuerpo actual y devolverlo completo con el cambio.

**El runtime está duplicado.** `cod-canvas-public.js` (página publicada) y `cod-behaviors.js` (editor, más una copia serializada adentro). Un cambio de comportamiento se aplica en **las tres** o el editor y el sitio se comportan distinto.

**Los identificadores numéricos no son portables.** El id de página cambia en cada instalación; solo el `document_id` y la meta viajan.

**Los archivos usan finales de línea de Windows.** Un patrón multilínea con `\n` no calza nunca. Editar por líneas, comparando líneas completas.

**Nunca escribir PHP con PowerShell.** Deja una marca invisible al inicio del archivo (BOM) que impide a WordPress enviar cabeceras: cualquier dirección que necesite redirección responde vacía.

**El árbol no puede pasar de 512 niveles.** El servidor deja de leer ahí. Pasa al entregarle a un `<svg>` un fragmento que trae adentro su propio `<style>` y otro `<svg>`: el lector encaja los trazos uno dentro de otro, en cadena.

**La conexión se corta sola con documentos cercanos al mega.** No es un límite del servidor: el mismo pedido funciona al segundo intento. El runner ya reintenta cuatro veces; cualquier cliente nuevo debe hacerlo igual. Reintentar un guardado es seguro porque el número de revisión rechaza el duplicado.

**Al desplegar, subir la versión del plugin.** En el encabezado y en `COD_PUBLISHER_VERSION`, los dos. WordPress usa ese número para refrescar los archivos en el navegador: con el mismo número, el visitante sigue viendo el código viejo. Empaquetar con `empaquetar-plugin.ps1`, nunca con `Compress-Archive`.

## Verificar

**Mirar, no deducir.** Un cambio no está bien porque la estructura diga que sí. Abrir la página y comprobar lo que se ve: el color con que el navegador realmente pinta, el contraste real, si el elemento está dentro del marco. Un feed de Instagram "correcto por estructura" quedó pésimo en pantalla y hubo que rehacerlo.

Herramientas del repo:

| comando | para qué |
|---|---|
| `node scripts/inventariar-regla.mjs "<selector>"` | **antes de modificar**: dónde está declarado, si viene agrupado con otros, si está declarado dos veces en el mismo contexto y cuántos elementos lo usan |
| `node scripts/auditar-abreviadas.mjs` | **después**: lista los estilos que desaparecieron sin que nadie lo viera, marcando los que llevaban variable |
| `node scripts/revisar-php.mjs` | sintaxis de todos los PHP del plugin, sin necesitar PHP instalado |
| `--dry-run` en el runner | simula la edición y deja el resultado completo para revisar |

El runner ya informa por su cuenta si perdió reglas de estilo, si desaparecieron declaraciones con variable y si repuso atributos de datos. Leer esa salida, no ignorarla.

## Lo que todavía no es alcanzable

`cod_get_capabilities` lo dice al día en `existingButNotCallableYet`. Hoy: colecciones dinámicas con consulta remota, los mapas geográfico y de lotes (existen como bloque y runtime, falta contrato para sus datos), el encogimiento del banner al hacer scroll, los embeds externos y el estilo de un campo concreto de formulario.

Si la tarea cae ahí, **decirlo** y decidir con Cristóbal: hacerlo alcanzable de verdad, o autorizar explícitamente un parche temporal y anotarlo como deuda. Nunca elegir el parche por cuenta propia.

## Configuración

`scripts/cod-grapes-runner/cod-grapes-runner.config.json` guarda `siteUrl`, `username` y `applicationPassword` (contraseña de aplicación de WordPress, no la del usuario). El servidor MCP se llama `santaluisa-wordpress` en esta instalación; el endpoint es `<sitio>/wp-json/contope/v1/mcp`.
