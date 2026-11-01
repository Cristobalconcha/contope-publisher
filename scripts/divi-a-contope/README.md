# Divi → ContOpe

Transcribe un sitio hecho con Divi a composiciones de ContOpe Publisher (reglas de
diseño + árbol de nodos, el mismo formato de `scripts/econut/componer.mjs`) listas
para `cod_preview_canvas_composition` / `cod_apply_canvas_composition`.

No lee el CSS de Divi: lee **lo que el navegador pintó** (estilos computados) en una
medición hecha sobre el sitio vivo. Por eso el sitio tiene que medirse antes de que
se caiga o se cambie (ver `scripts/basis/descarga/medir.mjs` y `medir-pagina.js`).

## Entrada

Una carpeta de descarga con:

```
datos/medida-<pagina>-1440.json     medición a escritorio  (secciones › filas › columnas › módulos)
datos/medida-<pagina>-393.json      medición a celular     (misma página, mismo recorrido)
datos/medida-<pagina>-768.json      medición a tablet      (opcional: con ella salen las reglas con scope `tablet`)
datos/glifos.json                   contorno de los glifos de las fuentes de íconos del sitio (opcional; ver basis/descarga/glifos.mjs)
html/<pagina>.html                  HTML renderizado       (sólo para leer animaciones)
```

y un **perfil** (`perfil.json`) con lo que es decisión del sitio: origen, carpeta de medios
local, formularios, imagen del mini mapa, reemplazos de medios faltantes, rutas. Ver
`scripts/basis/perfil.json`.

## Uso

```
node transcribir.mjs --original <carpeta> --perfil <perfil.json> --salida <carpeta> [--paginas a,b] [--anchos 1440,393,768]
node formulario-a-orugantt.mjs --original <carpeta> --pagina contactos --perfil <perfil.json> --salida fixture.json [--instalar]
node aplicar.mjs pagina <x.componer.json> [--probar] [--sin-publicar]
node aplicar.mjs region <header|footer> <x.componer.json> [--probar]
```

`transcribir.mjs` deja por página `<pagina>.componer.json`, más `region-header/footer`,
`informe.json` / `INFORME.md` y `ajustes.json` (lo que descubrió del sitio: número de
WhatsApp, íconos que hay que traer, mapa). Como biblioteca: `transcribirSitio()`.
`aplicar.mjs` es el ciclo de siempre (revisión → preview → apply con el `previewId` → publicar).
`ENDPOINT` y `AUTH_FILE` por variable de entorno; la credencial nunca se guarda en el repo.

## Qué transcribe

| Divi | ContOpe |
|---|---|
| sección (fondo, imagen de fondo, degradado, relleno, alto/min-alto) | `section` (`header` / `footer` si viene del constructor de temas) + `surface` (color, imagen, `backgroundGradient`) + `properties` |
| fila, columnas (anchos, separación, relleno, fondo, radio, sombra) | grupo con rejilla; columnas desiguales por `grid-template-columns`; en celular una columna |
| divisor de sección (SVG en línea) | regla `divisor` (el SVG se guarda como archivo del sitio) |
| encabezado «pegajoso» | regla `posicion` pegada |
| texto (títulos, párrafos, listas anidadas, `<br>`) | `heading` / `paragraph` / `list` (con sublistas) / `link` si todo el bloque es un enlace |
| título, imagen (recorte `cover`, radio, enlace), botón (colores, radio, relleno, alineación) | `heading`, `image` (+`link`), `button` |
| blurb con ícono (FontAwesome/ETmodules → Material Symbols, tabla `GLIFOS`) | título con regla `icono` + párrafo |
| promo / CTA | grupo con caja + título + párrafo + botón |
| acordeón / toggle (abierto/cerrado, autoclose) | grupo con conducta `acordeon` (= `core/accordion`), partes item / resumen / panel y `state: current` |
| formulario de Gravity Forms | `form` + fixture de Orugantt Forms (nombre, correo con repetición, teléfono, texto, casilla…) |
| código: botón fijo de WhatsApp / de ícono SVG; mini mapa o mapa de Mapbox | `whatsapp`, enlace con ícono, grupo con conducta `mapa` |
| módulos que se pisan lado a lado en una columna | fila flexible (separación inferida) |
| módulos más angostos que su columna | `max-width` (centrado si lo estaba) |
| animación de entrada (`et_pb_animation_*`, `data-animation-*`) | regla `motion` (`slide-left/right`, `rise`, `fade`, `scale`); apagada en celular → duración 0 |
| valores distintos en celular | variante `mobile` atada a la regla base |
| valores distintos en tablet (768) | variante `tablet`: la página se transcribe OTRA VEZ contra la medición de 768 como si fuera «el celular» y lo que esa pasada guarda como `mobile` se re-escopa a `tablet` (`fusionarTablet`); si los árboles no calzan se avisa y esa rama queda con escritorio |
| ícono de FontAwesome / ETmodules (blurb, pliegue del acordeón) | el contorno del glifo sale de la fuente del propio sitio (`glifos.json`) y va como SVG de Medios con la regla `icono` (`forma`) o como `iconoCerrado` del acordeón: el ícono es el mismo, relleno y todo |
| ícono SVG de un botón fijo | el trazado original guardado como forma del sitio + regla `icono` |
| lista con sublistas | `list` con la sangría de cada nivel medida y la parte `sublista` |
| reglas repetidas | UNA regla por valor (el id lleva un hash del contenido; estable entre páginas) |

## Ningún color ni tipografía literal: el set de diseño

El transcriptor mide VALORES (`#F26621`, `rgba(0,0,0,0.2)`, `'Open Sans', sans-serif`), pero copiarlos a las reglas deja la identidad duplicada: cambiar el set no cambia el sitio. Por eso, si el perfil declara un bloque `tokens`, **cada valor se traduce al set ANTES de que la regla reciba su id** (`lib/tokens.mjs`, enganchado en `Registro.R`):

```json
"tokens": {
  "tema": "../../contope-basis/theme.json",              paleta y familias del set (ruta relativa al perfil)
  "colores": { "roles": { "accent": "var(--cod-color-accent)", ... }, "distanciaMaxima": 8 },
  "familias": { "Open Sans": "var(--cod-font-body)", ... }
}
```

| medido | queda |
|---|---|
| color opaco que calza EXACTO con la paleta | `var(--wp--preset--color--<slug>)` (o la variable que el perfil asigne a ese slug en `roles`, p. ej. el acento del núcleo `--cod-color-accent`) |
| color que no calza | el color de la paleta MÁS CERCANO (distancia en OKLab × 100), anotado en el informe; si está a más de `distanciaMaxima`, queda marcado «fuera del set» |
| color con alfa (sombras, velos, degradados) | `color-mix(in srgb, <variable> N%, transparent)`; alfa 0 → `transparent` |
| `font-family` | la variable de la familia (`roles` del perfil, o `--wp--preset--font-family--<slug>` del theme.json); una familia que el set no conoce queda literal y marcada |
| nombre de un rol `color` (`c-0e0c19`) | el nombre del token (`c-ink`): el hex deja de aparecer en cualquier parte |

Lo decide el SITIO (qué variable representa a qué), no el transcriptor; el informe (`INFORME.md` › «Traducción al set de diseño» y `salida/tokens.json`) lista cada color acercado y cada familia. Lo que escribe `correcciones.json` pasa por la misma traducción. Para comprobar que el resultado de verdad gobierna el sitio: `scripts/basis/gobierno-del-set.mjs` (lo corre `auditoria-sitio.mjs`).

## Lo que NO sabe hacer (y lo dice)

Todo módulo o patrón sin transcribir queda en `INFORME.md` con página › sección › fila › columna › módulo ›
clase Divi, con severidad `faltante` / `sin-transcribir` / `aproximado` / `ok`. Nada se descarta en silencio.

- **Sin transcriptor todavía** (se reportan): pestañas, slider, galería, contadores, video, mapa nativo de Divi,
  testimonios, menús, blog, pricing, portafolio, etc. Están en la lista de `despachador` de `lib/modulos.mjs`.
  *No hay una sola muestra de ellos en Basis, así que no se escribió nada sin poder medirlo.* Las pestañas
  deben salir a la conducta `pestanas` (`core/tabs`) y las galerías a `gallery`.
- **Animaciones:** la lectura está hecha según el marcado de Divi 4 pero **probada sólo con HTML sintético**
  (`pruebas/probar-animacion.mjs`); Basis no anima nada.
- **Tablet:** con la medición de 768 hay variantes `tablet` (ver arriba). El plugin corta tablet en 768–1023 y Divi en 768–980: entre 981 y 1023 el plugin aplica lo de tablet donde Divi ya muestra escritorio (ahí no se mide).
- **Degradados:** se traducen a `backgroundGradient` (ángulo, paradas, encima o debajo de la foto) y salen `ok`. Se avisa `aproximado` de lo que no cabe: puntos medios, tamaños de radial distintos del predeterminado, esquinas (`to top right`), más de 8 paradas, más de un degradado en la sección. Código: `lib/fondos.mjs`.
- **Trama y máscara de fondo de Divi** (`et_pb_background_pattern` / `_mask`): la medición las registra (`fondoTrama`, `fondoMascara`) y se avisa si una sección las trae con imagen; no se traducen solas porque su dibujo viene incrustado y no es un recurso de Medios. Se componen con `backgroundPattern` / `backgroundMask` de la regla `surface`, eligiendo una forma de Medios (las mismas del divisor).
- **Formato en línea** (negrita, enlaces dentro de un párrafo): el nodo de texto es plano; se avisa. Sólo un bloque
  que es *entero* un enlace pasa a `link`.
- **Código a mano** no reconocido (HTML/JS/CSS pegado en un módulo de código): se reporta con un resumen.
- **Video de fondo:** si el archivo está en el sitio, va como nodo `video` ambiental detrás del contenido (sección aislada, `media` con la proporción de la sección y recorte cover); si falta, se avisa como «faltante» y se usa la imagen de reemplazo del perfil.
- **Ícono de los pliegues:** resuelto en 0.3.84 (`showIcon` + parte `icono`). **Mapa siempre abierto:** `content.fijo` (0.3.84); necesita la clave de Mapbox para ser un mapa en vivo (ver `scripts/basis/HUECOS.md`).

- **Barra lateral del tema** (buscador, entradas y comentarios recientes de una página que no usa el constructor): resuelta en 0.3.85 con nodos
  `block` (bloques nativos de WordPress que dibuja el propio WordPress); necesita la medición `descarga/medir-barra-lateral.mjs` (`lib/barra-lateral.mjs`).
- **Formulario de Gravity Forms:** va a Orugantt Forms por su contrato de diseño (rellenos, separaciones, casilla propia, contador); necesita la
  medición `descarga/medir-formulario.mjs` (`forma.extra`). Ver `scripts/basis/HUECOS.md`.

## Cómo se prueba

`pruebas/probar-animacion.mjs` (animaciones con HTML sintético) y, contra un sitio real, el circuito
`componer → preview → apply → capturar` de `scripts/basis` más `comparar-estilos.mjs`, que busca cada texto medido en
el sitio local y compara tamaño, interlineado, peso, familia, color y posición.

## Qué guarda la medición (y por qué)

Para cada módulo, `estiloCaja` (relleno y margen por lado en px, ancho, ancho máximo, posición) y `estiloInterior`
(relleno de `.et_pb_text_inner` y similares); para cada bloque de texto, su caja y márgenes. Sin el relleno propio del
módulo (Design → Spacing) el contenido queda pegado al borde de su columna. Las imágenes con carga diferida se fuerzan a
cargar antes de medir; si una igual sale con caja 0×0, `perfil.medicionComplemento` apunta a otra medición de la que se
toman esos módulos por posición.
