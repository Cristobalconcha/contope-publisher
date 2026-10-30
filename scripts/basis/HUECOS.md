# Basis sobre ContOpe: huecos, diferencias y pendientes

Escrito el 30-oct-2026, al terminar la primera reconstrucción local (WordPress en `wp-local-basis`, puerto 8894).
Nada de esto se rodeó con CSS a mano: cada punto es un hueco del plugin o una decisión que queda para Cristóbal.

## Huecos del plugin (lo que el catálogo de ContOpe no alcanza)

Resueltos en esta rama, con su prueba (`scripts/probar-lista-anidada.php`, 12 comprobaciones, TODO OK):

1. **Saltos de línea en títulos, párrafos e ítems.** El nodo de texto escapaba todo y un `<br>` del original se perdía
   (el título de la portada se parte a propósito en «eficiente / a su demanda»). Ahora un salto de línea del texto plano se
   dibuja como `<br>`; el HTML sigue escapado.
2. **Listas anidadas.** `list` sólo admitía ítems de texto; la lista de «Características» tiene sublistas. Ahora un ítem
   puede ser `{ text, items }` hasta tres niveles.
3. **El mini del mapa no llenaba su caja** cuando se usa grande (la imagen interna quedaba en 60×60). Se agregó
   `width/height:100%` a la imagen del mini. *Ojo:* sin clave de Mapbox el plugin ni siquiera monta la conducta, así que
   esto sólo se nota con clave (ver 6).

Sin resolver (anotados, no rodeados):

4. **Degradados de fondo.** El original usa dos: la portada (azul → transparente sobre la foto) y el aviso naranja
   (negro → transparente a 65°). El set de diseño no usa degradados, así que se aplanan en un velo de opacidad pareja
   (50%). Diferencia visible: la portada queda más azul abajo y el bloque naranja final sale marrón en vez de naranja con
   un borde oscuro. Un interruptor en el perfil (`degradados: conservar`) los pasaría por la regla `properties`
   (`background-image` está permitido); no se activó porque Cristóbal fijó «nada de degradados». **Decisión suya.**
5. **Ícono de los pliegues.** Divi pone un «+» gris en un círculo (glifo ETmodules) en cada pliegue; las partes del
   acordeón no admiten la regla `icono`, así que los pliegues salen sin ese ícono. También se probó que el color del
   título del pliegue abierto (#333 contra #666 cerrado) no cambia con `state: current` sobre la parte `resumen`.
6. **Mapa siempre abierto.** La página Contactos trae un mapa de Mapbox interactivo de 379×800. ContOpe sólo tiene el
   «mini que se abre al pincharlo». Quedó como una imagen del mapa (recorte de la captura) con enlace a OpenStreetMap.
   Con la clave pública de Mapbox en Configuración → Mapa el pie sí abre el mapa grande. **La clave NO se cargó**:
   viene en el HTML del original, pero es una credencial y la pone quien publica (`cod_set_mapbox_token`).
7. **Íconos rellenos.** Los íconos de «Opciones comerciales» (FontAwesome sólidos) quedan en Material Symbols
   «rounded», que es de contorno; el ícono de ayuda del botón fijo es un disco con «?» y sale como círculo con «?».
8. **Texto en línea.** Negrita, cursiva o enlaces *dentro* de un párrafo no existen en los nodos de texto (`richText` son
   párrafos planos). En Basis sólo había un enlace que ocupa todo su bloque (el «Cotizaciones / Contactos» del
   encabezado) y quedó como `link`.
9. **WhatsApp.** El nodo `whatsapp` es de un solo color; el original era verde con degradado dentro de un círculo negro.
10. **Catálogo contra validador.** `cod_get_capabilities` dice que `icono.donde` admite `antes | despues | fondo`, pero
    el validador rechaza `fondo` («icono.donde admite: antes, despues»). Hallazgo colateral, no tocado.
11. **Formulario.** El estilo del formulario es sólo por variables (contrato de Orugantt Forms): el original tiene los
    campos blancos sobre el panel gris, con la etiqueta pequeña encima y el botón a todo el ancho. Aquí el formulario
    queda como una tarjeta blanca dentro del panel y el botón no se estira.
12. **Tablet.** Sólo se midió escritorio (1440) y celular (393).

## Medios: lo que se recuperó y lo que es reemplazo

El hosting estaba caído y la descarga quedó a medias (3 de 39 medios). Se rescató **de la caché del Chrome sin ventana que
hizo la descarga** (`%TEMP%\pz-*`; ver `Sesión Claude/entregables/basis/original/medios-cache/`):

| medio | origen |
|---|---|
| Imagen-4, Cierre-lateral, Estructura3, Imagen-6, Interior-doble-pilar, aBlanco@4x, Header-logo, Altfx-2-Calado, aiconopdf | **originales, íntegros** (tamaño completo) |
| aRecurso-12.png (logo BASIS del pie), mapa de Contactos | **recorte de la captura a 1440** (131×60 y 379×800, a 1×): quedan algo blandos |
| Video-Aereo-Carpas.mp4 (video de fondo de «Características») | **NO se pudo recuperar** (la caché sólo guardó 1 MB, 0,27 s): el fondo es una imagen armada con las bandas limpias de la captura |
| mini mapa del pie | el de Econut (mismo lugar, mismo estilo, 120×120) |
| tipografías (Big Shoulders Display, Open Sans, Roboto, Montserrat) | los archivos de la descarga, variables, subconjunto latino |

Antes de subir: volver a bajar de `basisbodegas.com` los originales que hoy son recorte o reemplazo
(`node scripts/basis/descarga/descargar-medios.mjs`, retoma lo que falta) y recomponer: no hay que tocar nada más.

## Diferencias visibles que quedan contra el original

- Portada: velo azul plano (ver 4) y la foto de fondo un poco distinta a 393 de ancho.
- Aviso naranja de cierre: marrón en lugar de naranja con degradado negro (ver 4).
- «Características»: la banda de fondo es una imagen de reemplazo en vez del video.
- Pliegues de Preguntas frecuentes: sin el ícono «+» y el título del pliegue abierto no se oscurece (ver 5).
- Contactos: mapa estático (ver 6) y formulario con otro dibujo de campos (ver 11).
- Pie: 6 px más alto que el original (126 contra 120) y el mini mapa trae su leyenda de «Mapbox» abajo.
- Botones «Explorar Soluciones» y «Solicita Información»: **no llevan a ninguna parte en el original** (`href` vacío y `#`).
  Se respetó; si Cristóbal quiere que lleven a Contactos, es una línea en el perfil.
- La globo del mapa dice «Planta Econut / www.econut.cl»: es lo que dice el original de Basis (copia del código de Econut).
- Banner de cookies: el original no tiene; aquí está como en Econut (pedido), con la paleta de Basis. Se oculta sólo en las capturas.
- El texto «Gracias» del formulario no se pudo medir (nunca se envió): es uno mínimo.

## Para subirlo (cuando vuelva el hosting)

1. Subdominio de prueba en el hosting (p. ej. `nuevo.basisbodegas.com`) con WordPress, plugin ContOpe 0.3.82+ (con las dos
   ampliaciones de esta rama), Orugantt Forms, CookieAdmin y los temas `contope-canvas` y `contope-basis`.
2. Copiar `uploads/2025/07/*` y `uploads/divisores/*`; bajar de nuevo los originales marcados arriba.
3. `SITIO=… AUTH_FILE=… node scripts/basis/aplicar.mjs` (todo por el canal MCP y REST; no sube ningún guion).
4. Poner la clave de Mapbox, la casilla real de destino del formulario `contacto-basis` (hoy apagado, con
   `PENDIENTE-DESTINO@basis.invalid`) y SMTP; revisar los `[PENDIENTE: …]` del texto legal (P1, P2, P3, P6, P10).
5. Comparar: `node scripts/basis/capturar-comparar.mjs <subdominio>` y `comparar-estilos.mjs`.
