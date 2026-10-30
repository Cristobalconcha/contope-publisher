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

## Medios

Al principio el hosting estaba caído y la descarga quedó a medias; ese día se rescató lo posible de la caché del Chrome sin
ventana y se armaron reemplazos con recortes de las capturas. **Ya llegaron los 39 originales** (`original/medios/`, 0 errores) y
se reemplazó todo en `uploads/2025/07/`:

| medio | estado |
|---|---|
| fotos, logos, dibujo de fondo, íconos, PDF, favicon | originales íntegros (incluye `aRecurso-12.png`, el logo BASIS del pie, que antes era un recorte) |
| Video-Aereo-Carpas.mp4 (fondo de «Características») | **original, 34 MB**: vuelve a ser VIDEO (nodo `video` ambiental, sin controles, en bucle y mudo, detrás del contenido; `media` con la proporción de la sección y recorte «cover») |
| mapa de Contactos | **sigue siendo un recorte de la captura**: en el original es un mapa de Mapbox en vivo, no hay archivo que recuperar |
| mini mapa del pie | el de Econut (mismo lugar y estilo); en el original también lo dibuja Mapbox en vivo |
| tipografías | archivos de la descarga (variables, subconjunto latino) |

Desaparecieron del perfil los reemplazos de `aRecurso-12.png` y del fondo de «Características». Si algún día un medio vuelve a faltar,
el transcriptor lo avisa como «faltante» y el perfil admite un reemplazo (`reemplazos.medios` / `reemplazos.fondos`).

## Diferencias visibles que quedan contra el original

- Portada: velo azul plano (ver 4) y la foto de fondo un poco distinta a 393 de ancho.
- Aviso naranja de cierre: marrón en lugar de naranja con degradado negro (ver 4).
- «Características»: con el video original de fondo y el relleno del módulo (30 px) ya aplicado: el título, la foto y el panel calzan. Falta la sangría de las sublistas: el `<ul>` anidado trae la del navegador (40 px) y el original usa ~1 em; la regla `properties` sólo alcanza la lista de primer nivel (hueco: no hay forma de estilar el `<ul>` interior).
- Pliegues de Preguntas frecuentes: sin el ícono «+» y el título del pliegue abierto no se oscurece (ver 5).
- Contactos: mapa estático (ver 6) y formulario con otro dibujo de campos (ver 11).
- Pie: 6 px más alto que el original (126 contra 120) y el mini mapa trae su leyenda de «Mapbox» abajo.
- Botones «Explorar Soluciones» y «Solicita Información»: **no llevan a ninguna parte en el original** (`href` vacío y `#`).
  Se respetó; si Cristóbal quiere que lleven a Contactos, es una línea en el perfil.
- La globo del mapa dice «Planta Econut / www.econut.cl»: es lo que dice el original de Basis (copia del código de Econut).
- Banner de cookies: el original no tiene; aquí está como en Econut (pedido), con la paleta de Basis. Se oculta sólo en las capturas.
- El texto «Gracias» del formulario no se pudo medir (nunca se envió): es uno mínimo.

## Medición nueva (30-oct-2026): relleno y margen de cada módulo

**Qué faltaba.** La primera medición guardaba el relleno de sección, fila y columna pero no el del módulo (Divi: Design → Spacing). Un
módulo de texto con 30 px de relleno medía 866 px de alto y su texto empezaba 30 px más adentro; sin ese dato el transcriptor lo
dejaba pegado al borde y 37 px más bajo. **Arreglo de fondo:** `descarga/medir-pagina.js` ahora guarda, para TODO módulo,
`estiloCaja` (relleno, margen por lado, ancho, ancho máximo, posición) y, si lo hay, `estiloInterior` (el `.et_pb_text_inner`,
el contenedor del blurb, etc.); de cada bloque de texto guarda además su caja y sus márgenes. El transcriptor lo consume
(`aplicarRellenoPropio`: texto, título y blurb; imágenes: el relleno pasa a márgenes de la imagen).
Se midió una vez Inicio, Preguntas frecuentes y Contactos a 1440 y 393 (carpeta `entregables/basis/medicion-2/`).

**Un defecto de esa medición, resuelto sin repetirla.** Dos imágenes del pie (logo BASIS y crédito de diseño) tienen
`loading="lazy"` y no se alcanzaron a cargar: salieron con caja 0×0. El transcriptor acepta una *medición complementaria*
(`perfil.medicionComplemento`, aquí la primera) y toma de ella esos módulos por posición. `medir.mjs` ahora fuerza la carga
de las imágenes diferidas antes de medir (sin probar: no se volvió a pedir nada al sitio).

**Por qué Preguntas frecuentes medía 3671 y Contactos 1182/2334.**

| página y ancho | antes | ahora | original | causa |
|---|---|---|---|---|
| Preguntas frecuentes 393 | 3671 | **3308** | 3305 | los pliegues se separan 10 px en celular y 30 en escritorio (margen inferior de cada pliegue, ahora con variante móvil); el pie se rompía en celular por los márgenes negativos del logo (−28 px) y por el texto de la dirección, que saltaba debajo del mini mapa |
| Inicio 393 | 5894 | **5778** | 5776 | el aviso naranja conservaba el alto mínimo de escritorio (321) también en celular (264); el mismo pie |
| Preguntas frecuentes 1440 | 1757 | 1757 | 1754 | — |
| Contactos 1440 / 393 | 1182 / 2392 | 1182 / 2334 | 1354 / 2653 | **el formulario**: Orugantt Forms lo dibuja más compacto que Gravity Forms (campos más bajos, sin la etiqueta pequeña encima, botón del ancho del contenido) y su estilo sólo se toca por variables: −178 px en escritorio y −320 en celular. No es un error de transcripción sino la diferencia entre los dos motores de formularios |

## Para subirlo

1. Subdominio de prueba en el hosting (p. ej. `nuevo.basisbodegas.com`) con WordPress, plugin ContOpe 0.3.82+ (con las dos
   ampliaciones de esta rama), Orugantt Forms, CookieAdmin y los temas `contope-canvas` y `contope-basis`.
2. Copiar `uploads/2025/07/*` y `uploads/divisores/*`; bajar de nuevo los originales marcados arriba.
3. `SITIO=… AUTH_FILE=… node scripts/basis/aplicar.mjs` (todo por el canal MCP y REST; no sube ningún guion).
4. Poner la clave de Mapbox, la casilla real de destino del formulario `contacto-basis` (hoy apagado, con
   `PENDIENTE-DESTINO@basis.invalid`) y SMTP; revisar los `[PENDIENTE: …]` del texto legal (P1, P2, P3, P6, P10).
5. Comparar: `node scripts/basis/capturar-comparar.mjs <subdominio>` y `comparar-estilos.mjs`.
