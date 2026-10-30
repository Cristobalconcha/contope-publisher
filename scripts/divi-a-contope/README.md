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
html/<pagina>.html                  HTML renderizado       (sólo para leer animaciones)
```

y un **perfil** (`perfil.json`) con lo que es decisión del sitio: origen, carpeta de medios
local, formularios, imagen del mini mapa, reemplazos de medios faltantes, rutas. Ver
`scripts/basis/perfil.json`.

## Uso

```
node transcribir.mjs --original <carpeta> --perfil <perfil.json> --salida <carpeta> [--paginas a,b] [--anchos 1440,393]
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
| sección (fondo, imagen de fondo, relleno, alto/min-alto) | `section` (`header` / `footer` si viene del constructor de temas) + `surface` + `properties` |
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
| reglas repetidas | UNA regla por valor (el id lleva un hash del contenido; estable entre páginas) |

## Lo que NO sabe hacer (y lo dice)

Todo módulo o patrón sin transcribir queda en `INFORME.md` con página › sección › fila › columna › módulo ›
clase Divi, con severidad `faltante` / `sin-transcribir` / `aproximado` / `ok`. Nada se descarta en silencio.

- **Sin transcriptor todavía** (se reportan): pestañas, slider, galería, contadores, video, mapa nativo de Divi,
  testimonios, menús, blog, pricing, portafolio, etc. Están en la lista de `despachador` de `lib/modulos.mjs`.
  *No hay una sola muestra de ellos en Basis, así que no se escribió nada sin poder medirlo.* Las pestañas
  deben salir a la conducta `pestanas` (`core/tabs`) y las galerías a `gallery`.
- **Animaciones:** la lectura está hecha según el marcado de Divi 4 pero **probada sólo con HTML sintético**
  (`pruebas/probar-animacion.mjs`); Basis no anima nada.
- **Tablet:** sólo se mide y transcribe escritorio y celular. Las reglas por ancho tienen el hueco para `tablet`
  (`Registro.conAnchos`) pero el transcriptor no lo alimenta: haría falta una tercera medición (p. ej. 768).
- **Degradados:** se aplanan en un velo de opacidad pareja (el set de diseño no usa degradados) y se avisa.
- **Formato en línea** (negrita, enlaces dentro de un párrafo): el nodo de texto es plano; se avisa. Sólo un bloque
  que es *entero* un enlace pasa a `link`.
- **Código a mano** no reconocido (HTML/JS/CSS pegado en un módulo de código): se reporta con un resumen.
- **Video de fondo:** el nodo se omite y se avisa; si el perfil trae una imagen de reemplazo, se usa como fondo.
- **Ícono «+» de los pliegues**, **mapa siempre abierto**, **degradados**: huecos del plugin (ver `scripts/basis/HUECOS.md`).

## Cómo se prueba

`pruebas/probar-animacion.mjs` (animaciones con HTML sintético) y, contra un sitio real, el circuito
`componer → preview → apply → capturar` de `scripts/basis` más `comparar-estilos.mjs`, que busca cada texto medido en
el sitio local y compara tamaño, interlineado, peso, familia, color y posición.
