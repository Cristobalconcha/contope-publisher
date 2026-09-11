#> El identificador del documento no lleva el prefijo nuevo. Es un nombre opaco
> que se guardó una vez y viaja con el contenido: en un sitio que viene de la
> versión anterior sigue siendo `ocd-canvas-page-14`. Pedilo tal cual está
> guardado — `cod_list_canvas_pages` te lo dice.

 Runner de Grapes — editar nodos con el motor real, desde tu máquina

## Qué hace

Edita un nodo de una página del sitio usando **el motor real de GrapesJS** (los mismos
archivos que corren en el editor de wp-admin), no parches de texto sobre el HTML.

El circuito completo, en un solo comando:

1. Le pide el documento real al sitio (`cod_read_canvas_document`)
2. Se lo entrega al motor de Grapes en un navegador headless local, que ubica el nodo
   con `editor.getWrapper().find(selector)` y lo muta con la API real de componentes
3. Guarda de vuelta el HTML/CSS/árbol que **Grapes mismo** generó (`cod_write_canvas_document`)

## Por qué existe

El hosting del sitio no tiene Node ni navegador headless instalado, así que el motor de
Grapes no puede correr allá. Corre acá, en tu máquina, y el sitio solo guarda el resultado.

Además, el contenido del documento **nunca pasa por el chat**: va del sitio al motor y de
vuelta al sitio. Eso garantiza que nada se reescriba, abrevie ni se pierda por el camino.

## Requisitos

- Node.js (ya lo tenés)
- Un navegador Chrome, Chromium o Edge instalado (ya lo tenés)
- El plugin ContOpe Publisher 0.2.77 o superior en el sitio

## Configuración (una sola vez)

1. Copiá `cod-grapes-runner.config.example.json` como `cod-grapes-runner.config.json`
2. Completá `siteUrl`, `username` y `applicationPassword`

Para la clave: **wp-admin → Usuarios → tu perfil → Contraseñas de aplicación** → creá una
nueva llamada "Grapes runner". WordPress te la muestra una sola vez. No es tu contraseña
normal, y la podés revocar cuando quieras desde ese mismo lugar.

El archivo con las credenciales está en `.gitignore` — no se sube al repositorio.

## Uso

```bash
cd scripts/cod-grapes-runner

# Cambiar el texto de un nodo
node cod-grapes-runner.mjs --page 44 --document ocd-canvas-page-14 \
  --selector "#iktkn" --set-content "Escríbenos directo y te respondemos a la brevedad."

# Agregar una clase y un estilo
node cod-grapes-runner.mjs --page 44 --document ocd-canvas-page-14 \
  --selector ".wa-bubble" --add-class "destacado" --style '{"bottom":"40px"}'

# Ver qué pasaría, sin guardar nada
node cod-grapes-runner.mjs --page 44 --document ocd-canvas-page-14 \
  --selector "#iktkn" --set-content "Hola" --dry-run
```

### Mutaciones disponibles

| Opción | Qué hace | Método real de Grapes |
|---|---|---|
| `--set-content "texto"` | Reemplaza el contenido del nodo | `component.components(...)` |
| `--add-class "a,b"` | Agrega clases | `component.addClass(...)` |
| `--remove-class "a,b"` | Quita clases | `component.removeClass(...)` |
| `--attributes '{"data-x":"1"}'` | Fusiona atributos | `component.addAttributes(...)` |
| `--style '{"color":"red"}'` | Fusiona estilos del nodo | `component.addStyle(...)` |

## Seguridad de tus cambios

- Antes de tocar nada, guarda un **respaldo completo** del documento en `backups/`
  (proyecto + html + css, con su número de revisión).
- Si el tamaño del HTML o CSS cambia más de 15%, **avisa explícitamente** antes de que
  publiques — puede ser normal (Grapes reescribe el CSS desde su modelo) o señal de que
  se perdió algo. No lo deja pasar en silencio.
- `--dry-run` te deja ver el resultado completo sin escribir nada en el sitio.
- El guardado usa `expectedRevision`: si alguien más tocó la página mientras tanto,
  el sitio rechaza la escritura en vez de pisar el trabajo ajeno.

## Limitación conocida

En modo edición (`--selector`), solo toca **un nodo por corrida**, y ese nodo debe existir.
Para crear contenido nuevo está el modo `--build`, más abajo.
Lo que todavía no hace ninguno de los dos: **mover** nodos existentes de lugar.

---

## Modo CREAR (el conducto regular)

Editar un nodo que ya existe es la excepción. Lo habitual es **crear**: describir el
tema, los estilos y las secciones, y que eso se construya en la página.

Para eso está `--build`, que toma una receta en JSON:

```bash
node cod-grapes-runner.mjs --page 44 --document ocd-canvas-page-14 \
  --build ejemplo-construccion.json --dry-run
```

La receta tiene dos partes, que se corresponden con cómo lo describís hablando:

- **`styles`** — "estos son los estilos que quiero usar". Cada regla es un selector
  más sus propiedades, con `media` opcional para el comportamiento en móvil.
- **`structure`** — "quiero un header así, cinco secciones, la primera con una imagen
  grande y destacados apilados". Un árbol de nodos: `tag`, `classes`, `attributes`,
  `text`, `children`, y `type` cuando querés un componente propio del plugin.

`"mode": "append"` agrega al final de la página; `"replace"` reemplaza todo su contenido.

### Por qué esto no es "pegar HTML"

Cada nodo se crea pasándole a Grapes una **definición de componente** (un objeto), no
una cadena de HTML — `wrapper.append(definición)`. Y cada estilo entra por su gestor de
estilos — `editor.Css.setRule(...)`. Por eso el resultado es una página **nativa**: se
puede abrir en el editor visual y seguir trabajándola a mano, y los componentes propios
del plugin (como el video con transparencia) se crean como tales, no como marcado suelto.

Mirá `ejemplo-construccion.json` para una receta completa y comentada.

### Nota

El motor de construcción (`contope-publisher/tools/cod-headless-build.mjs`) corre
desde este repositorio local, no desde el servidor. No hace falta actualizar el plugin
del sitio para usarlo: el sitio solo lee y guarda.
