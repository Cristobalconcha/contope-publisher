# Módulo de trama — superficie de puntos

Fondo generativo para una sección: una lámina 3D de líneas punteadas que se
pliega en el espacio, viva (se mueve y reacciona al cursor) o fija. No es un
video ni una imagen: es un **código de captura** que el navegador vuelve a
dibujar, exacto, a cualquier tamaño.

- Archivo: `contope-publisher/assets/js/cod-trama.js` (sin dependencias, sin
  red, sin fuentes externas).
- Marcado: `data-cod-trama="SP1.…"` sobre el elemento que lleva el fondo.
- Se encola en la página publicada, en el editor Canvas y en el editor en
  línea, igual que el módulo de video con luma matte.

## De dónde sale el código

El código se obtiene en el **editor de la superficie de puntos** (la
herramienta donde se exploran presets, se capturan estados y se exportan SVG y
PNG). En su galería, se selecciona una captura y se pulsa **Copiar código**.
El resultado es una línea que empieza con `SP1.`.

El código contiene la forma completa: geometría, cámara, colores y el instante
de la evolución. El mismo código produce siempre los mismos puntos, en
cualquier equipo; por eso una pieza se puede volver a generar meses después.

## Cómo se usa

```html
<section class="cod-section"
         data-cod-trama="SP1.eyJ0aW1lIjo2LC…"
         data-cod-trama-modo="vivo"
         data-cod-trama-interaccion="1">
  <h1>Título de la sección</h1>
  <p>Contenido normal: queda encima del fondo y se puede seleccionar y clicar.</p>
</section>
```

| Atributo | Valores | Por defecto |
| --- | --- | --- |
| `data-cod-trama` | código de captura `SP1.…` (obligatorio) | — |
| `data-cod-trama-modo` | `vivo` · `estatico` | `vivo` |
| `data-cod-trama-interaccion` | `1` · `0` (sin reacción al cursor) | `1` |

En el editor Canvas: **Importar → HTML**, pegar el fragmento y aplicar. El
lienzo muestra la trama con el mismo runtime de la página publicada.

### Reglas

- **El elemento necesita alto.** La trama ocupa el tamaño del elemento; si la
  sección no tiene alto propio ni contenido, no hay dónde dibujar. Dale un
  `min-height`.
- **Fondo oscuro.** Los puntos suman luz (modo de fusión aditivo): sobre negro
  o casi negro brillan como en el editor; sobre fondos claros se pierden.
- **Una o dos por página.** Cada trama viva usa un worker y un contexto WebGL.
  Para más secciones, usar `estatico` (dibuja una vez y no consume nada).
- **El contenido manda.** El runtime agrega un `<canvas aria-hidden>` detrás
  del contenido del elemento y nada más. Si no corre —sin JavaScript, con el
  archivo bloqueado o con un código roto— la sección y su contenido quedan
  intactos. Un código roto deja un aviso en la consola, una sola vez.

## Costo y comportamiento

Medido en el editor de la superficie: dibujar 30.000 puntos en canvas 2D
costaba ~22 ms por cuadro y calcularlos ~6 ms. Por eso el módulo reparte el
trabajo como un sistema de audio:

1. **Buffer de entrada.** Un Web Worker calcula la geometría por adelantado, a
   12 cuadros por segundo y hasta un segundo adelante, con el mismo motor.
2. **Interpolación.** La pantalla mezcla los dos cuadros vecinos del buffer
   (~1 ms).
3. **Dibujo en la GPU** con WebGL; canvas 2D como respaldo.
4. **Monitoreo directo.** La deformación del cursor no pasa por el buffer: se
   aplica al dibujar, sin retraso.

Además:

- No trabaja si nadie lo ve: se detiene fuera de pantalla y con la pestaña
  oculta.
- Con `prefers-reduced-motion`, muestra un cuadro fijo.
- Si una política de seguridad (CSP) impide crear el worker, el buffer se
  llena en pausas cortas del hilo principal.

En la prueba de comparación, el trabajo del hilo principal bajó de ~70 ms a
menos de 1 ms por cuadro.

## Motor y compatibilidad de códigos

El motor de `cod-trama.js` es **el mismo** del editor de la superficie: la
función `TRAMA_ENGINE` se ejecuta en la página y su texto se reutiliza para el
worker. No hay dos motores que puedan divergir.

Un código publicado depende de que el motor no cambie. `scripts/probar-trama.mjs`
guarda la huella de un código de referencia: si un cambio en el motor alterara
la imagen de los códigos existentes, la prueba falla. Un cambio así exige un
prefijo nuevo (`SP2.`) y conservar el motor anterior para `SP1.`.

## Prueba

```bash
node scripts/probar-trama.mjs
```

Verifica decodificación (y que un código roto no lance), determinismo, tamaño
fijo de cada cuadro (condición para interpolar), la huella del código de
referencia y que el worker use el mismo motor.

## Pendiente (segunda fase)

- Componente propio en el catálogo del editor, con un campo para pegar el
  código y elegir el modo.
- Campo `trama` en las recetas del MCP, para que un asistente pueda aplicar un
  código a una sección.
- Secuencias (varias capturas encadenadas con morf, incluido el loop que
  empieza y termina en la misma captura).
