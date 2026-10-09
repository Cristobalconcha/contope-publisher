# Módulo de trama — reproductor de tramas generativas

Fondo generativo para una sección: la «superficie de puntos», una lámina 3D de
puntos o líneas que se pliega y evoluciona, dibujada detrás del contenido. No
es un video ni una imagen: es un **archivo de trama** (una receta, sólo datos)
que el navegador vuelve a calcular, exacto, a cualquier tamaño.

> **Core genera las tramas; Publisher sólo las muestra.** (Decisión 36,
> Cristóbal, 2026-10-09, en `vault_contope-design/decisiones.md`.) El motor,
> la línea de tiempo y el formato viven **una sola vez** en
> `contopedesign-core/packages/trama/`. Este plugin trae esos archivos tal
> cual y no tiene motor propio. El generador (donde se diseña una trama y se
> exporta el archivo) es de core; acá no hay ninguna interfaz para crearlas.

## Piezas

| archivo | qué es |
| --- | --- |
| `contope-publisher/assets/vendor/contope-trama/contope-trama.js` | El motor de core (`window.ContopeTrama`): lector del formato, línea de tiempo, cuadros, tramos, tiras. **No se edita**: lo escribe `scripts/traer-motor-trama.mjs`. |
| `contope-publisher/assets/vendor/contope-trama/contope-trama-worker.js` | El worker autónomo de core (puntos). |
| `contope-publisher/assets/vendor/contope-trama/MOTOR.json` | Versiones (paquete, motor, formato), sha256 y bytes de cada archivo, y el commit de core del que salieron. |
| `contope-publisher/assets/js/cod-trama.js` | **El reproductor**: busca el marcado, lee la trama con `ContopeTrama`, pide los cuadros al worker y dibuja. Sin interfaz visible. |
| `contope-publisher/assets/js/cod-trama-tiras-worker.js` | Worker para líneas y mixto: el atendedor de core más las tiras de las líneas (`tirasDeTramos`), calculadas fuera del hilo principal. Carga el motor con `importScripts`. |
| `contope-publisher/includes/class-cod-trama.php` | Archivos de trama en Medios, validación PHP, receta en línea al servir la página, encolado. |

## El archivo de trama

Un JSON con `kind: "contope/trama"` (extensión sugerida `.trama.json`). El
formato completo, campo por campo, está en
`contopedesign-core/packages/trama/README.md`. Lo esencial para quien lo usa:

- `version` (formato, hoy `1`) y `motor` (`superficie-de-puntos`, `1.x`): este
  Publisher rechaza otro formato u otra versión mayor del motor, porque la
  imagen sería otra.
- `dibujo.modo`: `puntos`, `lineas` o `mixto` (líneas debajo, puntos encima).
- `dibujo.tinta`: `luz` (los puntos suman luz, para fondos oscuros), `tinta`
  (oscurecen, como en papel) o `auto` (según la luminancia del fondo).
- `color.lejos`, `color.cerca`, `color.fondo`: con o sin ADN (cada color anota
  de dónde viene).
- `tiempo.modo`: `vivo` (evoluciona sin final desde `inicio`) o `secuencia`
  (escenas en el tiempo, `duracion`, `cerrarCiclo`, `alTerminar: repetir |
  detener`).
- `interaccion.cursor` / `interaccion.paralaje`: qué hace el cursor real en
  una trama en vivo.
- `cuadroQuieto`: el instante que se muestra quieto con
  `prefers-reduced-motion` o en modo estático.
- `lienzo`: `libre` (llena la sección), o `proporcion`/`medida`, y entonces el
  cuadro se calcula con esa proporción y **cubre** la sección (como
  `background-size: cover`).

Formas de una línea, para un atributo o una receta: **`CT1.…`** (el mismo
documento compactado en base64url) y **`SP1.…`** (los códigos de captura
viejos, compatibilidad).

**Variantes.** El formato v1 no tiene variantes. Una variante de una trama
(otros colores, otro modo, otra secuencia) es **otro archivo de trama**: se
exporta del generador y se sube a Medios como cualquier otro.

## Cómo se marca una sección

```html
<!-- con un archivo de Medios (lo normal) -->
<section class="cod-section" style="min-height:420px"
         data-cod-trama=""
         data-cod-trama-fuente="/wp-content/uploads/2026/10/portada.trama.json"
         data-cod-trama-modo="vivo"
         data-cod-trama-interaccion="1">
  <h1>Título de la sección</h1>
</section>

<!-- con un código pegado -->
<section data-cod-trama="CT1.eyJraW5kIjoi…" style="min-height:420px">…</section>
```

| atributo | valores | por omisión |
| --- | --- | --- |
| `data-cod-trama` | código `CT1.…`, `SP1.…` o JSON; vacío si la trama viene de `-fuente` | — |
| `data-cod-trama-fuente` | ruta del sitio a un archivo de trama de Medios | — |
| `data-cod-trama-modo` | `vivo` (se mueve como diga el archivo) · `estatico` (el `cuadroQuieto`) | `vivo` |
| `data-cod-trama-interaccion` | `1` (lo que diga el archivo) · `0` · `cursor` · `paralaje` · `ambos` | `1` |
| `data-cod-trama-fondo` | `1` pinta el fondo del archivo · `0` lienzo transparente | `1` (un SP1: `0`) |

Al servir la página, PHP lee el archivo de `-fuente`, lo valida otra vez y
pone la receta **en línea**, dentro del elemento:
`<script type="application/json" data-cod-trama-receta>…</script>`. El
navegador no hace ninguna petición extra. Si el archivo falta o no valida, se
le quita el atributo: la sección se publica sin trama y con su contenido.

### Reglas

- **El elemento necesita alto.** La trama ocupa el tamaño del elemento.
- **Una o dos vivas por página.** Cada trama viva usa un worker y un contexto
  WebGL. Para más, `estatico` (dibuja una vez y no consume nada).
- **El contenido manda.** El reproductor agrega un `<canvas aria-hidden>`
  detrás del contenido (`z-index:-1`, `pointer-events:none`) y, sólo en los
  elementos donde corre, `position:relative; isolation:isolate`. Sin
  JavaScript, con un archivo roto o sin WebGL ni canvas, la sección queda
  igual. Una trama inválida no le cambia el `position` a nadie.
- **Cero interfaz.** Nada de paneles, presets ni cifras en el front.

## Cómo se elige en el back

**Editor Canvas (GrapesJS).** Cualquier contenedor con `data-cod-trama` es un
componente *trama*. Hay un bloque **Sección con trama** (viene con la trama
por omisión del motor). En los ajustes del componente:

- **Elegir archivo de trama…**: abre Medios filtrado a JSON. Medios sólo
  acepta un `.json` si es un archivo de trama válido, así que lo que aparece
  ahí son tramas.
- **O pegar un código**: un `CT1.…` o `SP1.…`. Pegar un código quita el
  archivo, y elegir un archivo borra el código: nunca quedan los dos.
- **Modo** e **Interacción**.

El lienzo muestra la trama con el mismo reproductor y el mismo motor de la
página publicada (allí la receta de Medios se lee del propio sitio, porque no
pasó por PHP).

**Subir un archivo de trama.** Medios → Añadir nuevo → el `.trama.json`
exportado del generador. Quien puede subir archivos (`upload_files`) puede
subir tramas: una trama validada no puede llevar marcado. Cualquier otro JSON
se rechaza con el motivo. Se desactiva con el filtro `cod_permitir_trama`.

**Recetas MCP.** Regla `trama` (ver más abajo, «Uso para agentes»).

## Cómo funciona el reproductor

1. **Lectura.** `ContopeTrama.leerTrama` (JSON, CT1 o SP1; nunca lanza).
2. **Buffer.** Un worker —archivo del plugin, nunca `blob:`— calcula los
   cuadros a 12 por segundo y hasta 1 s adelante. Para puntos es el worker de
   core tal cual; con líneas, `cod-trama-tiras-worker.js` agrega a cada cuadro
   sus tiras de triángulos (armarlas cuesta ~27 ms por cuadro con la
   configuración por omisión: en el hilo principal sería un tirón por cuadro).
3. **Interpolación.** La pantalla mezcla los dos cuadros vecinos
   (`mezclarCuadros`), **sólo si miden lo mismo** (una secuencia que anima la
   cantidad de líneas salta en ese keyframe). Las tiras se interpolan vértice
   a vértice cuando tienen la misma forma; si no, se usa la más cercana.
4. **Dibujo en la GPU** (WebGL): líneas como `TRIANGLE_STRIP` con grosor real,
   puntos encima; tinta luz = mezcla aditiva, tinta = multiplicar, sobre el
   color de fondo del archivo. Canvas 2D de respaldo con los mismos tonos,
   niveles de alfa y tramos del motor.
5. **Cursor sin retraso.** La deformación del cursor (y el paralaje, que es
   una aproximación en pantalla del giro de cámara del motor) se aplica al
   dibujar. En una secuencia manda lo grabado en el archivo.

Además: no trabaja fuera de pantalla (`IntersectionObserver`) ni con la
pestaña oculta; con `prefers-reduced-motion` o en modo estático dibuja el
`cuadroQuieto` y no crea worker; una secuencia con `alTerminar: detener` se
queda en su último instante y deja de trabajar; si una CSP impide el worker
(`worker-src`), los cuadros se calculan en pausas cortas del hilo principal.

**Diagnóstico, sólo en desarrollo.** Con `WP_DEBUG`, o para un usuario con
`manage_options` que agrega `?cod-trama-diagnostico=1` a la URL, el reproductor
escribe en la consola qué leyó (origen, modo, tinta, lienzo, worker, GPU) y
cada 5 s cuántos cuadros dibujó y cuánto costó cada uno en el hilo principal.
El público nunca ve nada.

## Compatibilidad con SP1

Todo lo publicado con un código `SP1.…` se sigue viendo igual. El lector del
motor lo convierte en una trama en vivo que parte en ese instante, y el
reproductor, para un SP1, **no pinta el fondo** (lienzo transparente sobre el
fondo de la sección) y **ignora la medida del lienzo** que anotara la
captura, como hacía la primera versión. Comprobado en Chromium: el mismo SP1
en modo estático, con el reproductor viejo y el nuevo, da **cero píxeles
distintos**. Si la captura pedía líneas o tinta (`render`, `inkMode` de v7),
ahora se respeta (la primera versión dibujaba siempre puntos).

## Cómo se trae el motor

```bash
node scripts/traer-motor-trama.mjs                 # core en ../contopedesign-core
node scripts/traer-motor-trama.mjs /ruta/a/core    # o CONTOPE_CORE=/ruta/a/core
```

Lee `packages/trama/dist/` de core, verifica el sha256 y los bytes de cada
archivo contra su `MOTOR.json` (si uno no calza, no escribe nada) y deja los
dos `.js` tal cual en `assets/vendor/contope-trama/`, con un `MOTOR.json` que
además anota el commit de core. Esos archivos se versionan: son los que viajan
en el zip. Nunca se copian ni se editan a mano.

Hoy: motor `superficie-de-puntos` 1.0.0, formato 1, paquete `@contope/trama`
0.1.0, de core `c7a8ef5` (rama `claude/trama`). Pesan ~70 KB y ~54 KB sin
minificar (se sirven comprimidos); sólo se cargan en las páginas que llevan
una trama.

## Prueba

```bash
node scripts/probar-trama.mjs     # sin navegador
php scripts/probar-trama.php      # o: node scripts/correr-pruebas.mjs trama
```

`probar-trama.mjs`: sha256 de vendor contra `MOTOR.json`; la **huella**
`9c130d7e7d11640b` del cuadro de referencia con el motor de vendor (y a
través de un SP1); que `cod-trama.js` no contiene motor ni arma workers con
`blob:`; lectura de JSON, CT1 y SP1; determinismo y tamaño fijo; y el worker
de líneas corrido en una sandbox, con tiras idénticas a las de
`tirasDeTramos`. Si la huella cambia, cambió la imagen de toda trama
publicada: eso es una versión mayor del motor en core, no un arreglo acá.

`probar-trama.php`: lo que pasa y lo que se rechaza al subir y al servir
(otro JSON, marcado, versiones, límites, rutas fuera del sitio), que la
receta en línea no puede cerrar su `<script>` y que una sección con un archivo
malo queda sin trama. Con el WordPress local de Econut prueba además la regla
`trama` del compilador; sin él, usa funciones mínimas de prueba.

## Uso para agentes (recetas MCP)

`cod_get_capabilities` publica la regla en
`designRuleSet.ruleValueSchemas.trama`:

```json
{ "id": "trama-portada", "kind": "trama",
  "scope": { "breakpoint": "all", "state": "default" },
  "provenance": { "sources": [{ "kind": "user", "rationale": "Fondo de la portada." }] },
  "status": "reviewed",
  "value": { "fuente": "/wp-content/uploads/2026/10/portada.trama.json",
             "modo": "vivo", "interaccion": "archivo" } }
```

- `fuente` (obligatoria): ruta `.json` de Medios del propio sitio (se valida
  al compilar) o un código `CT1.…` / `SP1.…`.
- `modo`: `vivo` | `estatico`. `interaccion`: `archivo` | `ninguna` |
  `cursor` | `paralaje` | `ambos`. `fondo`: verdadero o falso.
- `variante` se rechaza con su explicación: es otro archivo.
- Va en un nodo `section`, `header`, `footer` o `group`, con alto propio
  (`min-height` con una regla `properties`), sin `scope` por ancho ni estado.

El agente **no genera tramas**: usa archivos exportados del generador de core
que ya estén en Medios (o el código que le den).
