# Guiones para editar el folleto de Santa Luisa por dentro del IDML

Estos guiones nacieron el 21 y 22 de septiembre de 2026, trabajando el folleto
`Santa_Luisa_Folleto_Limpio.idml` (carpeta `KPI\Folleto` en Google Drive). No hay
todavía un destino InDesign en ContOpe, así que el camino es el archivo: un IDML es
un ZIP con XML adentro, y esto lo edita por código y lo vuelve a empaquetar.

Se corren con Node 22, sin dependencias, desde una carpeta de trabajo donde el IDML
esté descomprimido (`unzip archivo.idml -d idml`). Los guiones asumen esas carpetas
por nombre (`idml`, `idml-corregido`, `idml-16`, `suyo`); si se reutilizan para otra
pieza, cambiar las constantes del principio de cada uno.

## Qué hace cada uno

| Guion | Para qué |
|---|---|
| `inventario.mjs` | Lista páginas, marcos de texto y el texto de cada historia, en orden de lectura. Primer paso siempre. |
| `jerarquia.mjs` | Vuelca la jerarquía de ítems de uno o más pliegos con sus posiciones en coordenadas de pliego, grupos incluidos. `node jerarquia.mjs <carpeta> Spread_xxx …` |
| `corregir.mjs` | Normaliza colores sin nombre a la paleta (dorado / oliva / tierra), corrige erratas con reemplazos que deben calzar exactamente una vez, borra un marco huérfano y reempaqueta. |
| `construir-pliego-casas.mjs` | Arma el pliego «Parcela + casa» (6-7) desde cero: fondo, foto, dos fotogramas, columna de texto, bloque de precio, estilos `OCD * Claro`. Es la partida que Cristóbal después rehízo a su manera. |
| `construir-directorio.mjs` | Rehace las siete tablas del directorio con el lenguaje del sitio (estilos `OCD Tabla *`, `OCD Celda *`, `OCD Tabla Directorio`) y arma tres pliegos con tarjetas. Las tablas sirvieron; la diagramación final es la suya. |
| `construir-destacado-cordillera.mjs` | Documento aparte de una página con el destacado «Cordillera · próximamente», para copiar y pegar. |
| `minutos.mjs` | Reemplaza la columna de distancia de las tablas por los minutos en auto del JSON del mapa de la web (`data-cod-geo-places`, guardado en `geo-places.2026-09-21.json`). Sólo toca el texto de esas celdas. |
| `minutos-faltantes.mjs` | Los dos lugares que el mapa no tenía, con tiempos de Google Maps. |
| `empaquetar.mjs` | Vuelve a armar el IDML: `node empaquetar.mjs <carpeta> <salida.idml>`. Pone `mimetype` primero y sin comprimir, que es lo que InDesign exige. |

## Reglas que costaron una noche

- **Cada párrafo termina con `<Br />`** dentro de su `CharacterStyleRange`. Sin eso, InDesign
  funde los `ParagraphStyleRange` consecutivos en un solo párrafo con el último estilo.
- **En `designmap.xml` las historias (`<idPkg:Story>`) van después de los pliegos**, justo antes
  de `BackingStory`. Declaradas antes, el marco abre vacío.
- **Un relleno vacío se escribe `FillColor="Swatch/None"`**, nunca `Color/n` ni parecido.
- **Coordenadas:** los puntos del trazado más el `ItemTransform` dan la posición en el pliego,
  cuyo origen es el centro; la página izquierda va de x −612 a 0 y la derecha de 0 a 612.
- **Verificar con InDesign de verdad, no con una vista previa propia.** El conector de Adobe
  renderiza IDML en la nube: `asset_initialize_file_upload` (subir el archivo con `curl -X PUT`
  a la URL de transferencia), `asset_finalize_file_upload` y `document_render_layout` con
  `exportingSpread`. Las fuentes salen sustituidas y los enlaces locales en gris, pero la
  composición y los estilos son los reales.
- **Los enlaces de imagen apuntan a Google Drive** (`file:G:/Mi%20unidad/…`); las imágenes
  nuevas viven en `KPI\Folleto\fotos\casas` y `fotos\web-galeria`.

## Lo que aprendimos del reparto

Los guiones producen componentes y datos: tablas, destacados, minutos, paleta. La
diagramación de página la hace Cristóbal; lo que sale de aquí es una partida, y una partida
tiene que proponer composición de verdad (solapes, cortes, siluetas con los recursos que la
pieza ya tiene), no una grilla de tarjetas.
