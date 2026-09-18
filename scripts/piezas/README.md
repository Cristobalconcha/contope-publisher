# Piezas: sacar del sitio material para diseñar

Seis guiones para llevarse **lo que el sitio ya muestra** a un archivo con el
que se pueda trabajar: un PDF vectorial para Illustrator, un PNG en alta, o un
par de imágenes que comparan un cambio antes de hacerlo.

Nacieron el 2026-09-17, cuando Arturo pidió gráfica para redes sociales a
partir del sitio de Santa Luisa.

## Cómo funcionan, en una línea

Abren **la página real** en un Chrome sin ventana, la esperan, le quitan en
vivo lo que sólo tiene sentido en pantalla, y capturan.

Eso último importa: la primera versión reconstruía el bloque en un documento
aparte y **perdía CSS** — el título se montaba sobre sí mismo y la tipografía
cambiaba. Lo que no se reconstruye no se puede perder.

No hay dependencias: se maneja Chrome por su protocolo de depuración, con el
WebSocket que Node ya trae.

## Los guiones

| Guion | Qué saca |
|---|---|
| `bloque-pdf.mjs` | Un bloque a PDF vectorial, del alto exacto de ese bloque |
| `pieza-pdf.mjs` | Una pantalla a PDF, con la mesa de trabajo del tamaño que se pida |
| `pagina-a-pdf.mjs` | La página entera en una sola hoja larga, para recortar a mano |
| `historia.mjs` | Una pantalla a PNG, al triple de resolución |
| `capturar.mjs` | Un bloque a PNG, recortado justo |
| `comparar-antes-despues.mjs` | Dos imágenes de un elemento, con y sin un CSS de prueba |

`chrome.mjs` no se llama directo: es el arranque del navegador y los cuatro
pasos que todos comparten (esperar, recorrer, fijar animaciones, quitar).

### Ejemplos

```
SELECTOR=".pilares" node bloque-pdf.mjs \
  "https://santaluisadepalpi.cl/diferenciales/" salida.pdf ".cierre,#siteNav"

ANCHO=360 ALTO=640 node pieza-pdf.mjs "https://santaluisadepalpi.cl/" portada.pdf

node comparar-antes-despues.mjs "http://localhost:8890/" ".plano-frame" \
  prueba.css ./comparacion
```

El tercer argumento de los exportadores es la lista de selectores a quitar,
separada por comas: el encabezado, la ficha del lote, el bloque de cierre.

## Tres decisiones que costaron un archivo inservible

**1. Cada PDF guarda una foto junto al archivo** (`-comprobacion.png`). Es el
mismo motor, el mismo DOM y el mismo momento que lo impreso. Existe porque se
entregó un PDF **entero negro** sin haberlo abierto: el paso que enciende las
animaciones a medias le había subido la opacidad a `#difGalleryLightbox`, un
telón casi negro de pantalla completa.

**2. Ese paso no toca dos familias de elementos.** Los **telones** en
`position: fixed` o `absolute` —galería ampliada, ventana de WhatsApp, visor
360—, que taparían el documento entero; y los **carruseles**, cuya posición
*es* una transformación: borrarla no termina ninguna animación, desarma el
carrusel y encima dos diapositivas.

**3. Toda espera lleva tope de tiempo.** Una imagen diferida que nunca entra en
pantalla no dispara `load` ni `error`, así que esperarla es esperar para
siempre. Colgó cinco exportaciones seguidas y dejó **22 Chrome** de fondo, que
a su vez trababan todo lo demás. Sin mensaje de error: simplemente nunca
terminaba.

## Dos medidas que conviene no volver a deducir

**Puntos contra píxeles.** Chrome mide el papel en pulgadas; en impresión 1 px
de CSS es 1/96 de pulgada y un punto de PDF es 1/72. Pasar `ancho/96` deja el
documento a tres cuartos del tamaño esperado: 360 llegan como 270. Y Chrome
topa el factor de escala en 2, así que con maquetación de teléfono (360) el
máximo es 540 pt de ancho — la mitad justa de los 1080 de Instagram. **No
importa**: se amplía al 200% y queda en medida sin perder nada, porque lo que
manda es la resolución de lo incrustado, no el tamaño de la mesa.

**Instagram.** Post vertical 1080×1350 · cuadrado 1080×1080 · historia y reel
1080×1920. No pasa de 1080 de ancho: ése es el piso y el techo.

## De dónde leer

Del **sitio en producción**, salvo que se esté probando un cambio. El espejo
local sólo baja los medios de la portada, así que una página interior aparece
con las fotos rotas — y eso no es un defecto del sitio. Leer no tiene riesgo.
