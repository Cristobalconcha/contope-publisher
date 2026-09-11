# Módulo de mapas — geo-map y parcel-map

Dos comportamientos declarativos para el editor Canvas:

- **`geo-map`** — mapa de ubicación con calles reales de OpenStreetMap, pan/zoom,
  y selector dependiente Categoría → Lugar. Los datos geográficos se generan
  **antes de publicar** con un script de Node; el navegador sólo ejecuta el
  runtime declarativo.
- **`parcel-map`** — plano de lotes/parcelas clickeable con estado y valor.
  No usa Overpass: los lotes son polígonos del proyecto y se dibujan a mano o
  desde el plano del proyecto.

## Cuándo usar cada uno

| Caso | Comportamiento |
| --- | --- |
| Mostrar dónde está el proyecto en calles reales, con lugares de interés por categoría | `geo-map` |
| Mostrar el plano interno de un condominio/loteo con lotes disponibles/vendidos | `parcel-map` |

No son intercambiables. `geo-map` necesita una bbox real y un archivo de lugares
curados; `parcel-map` necesita los polígonos de los lotes del proyecto.

---

## `geo-map`: pipeline de datos (corre antes de publicar)

El fetch a Overpass y la simplificación de calles **no se hacen en el editor**.
No intentes armar un selector de lugares en tiempo real dentro de GrapesJS ni un
fetch a Overpass desde el navegador: el pipeline es un paso de terminal/Node.

### 1. Crear el archivo de lugares curados

Es un JSON a mano. `dist` (km) y `tiempoMin` (minutos) se cargan a mano
mirando la ruta real en Google Maps — igual que se hace hoy con
nombre/categoría/contacto. Medir en línea recta no representa nada útil
("un gimnasio a 10 km" suena lejos; "a 10 minutos" suena cerca, y eso es lo
que el cliente pidió mostrar). Si se carga `tiempoMin`, ese es el dato que
se muestra en el mapa; `dist` queda solo de respaldo si algún lugar no
tiene tiempo cargado. El script todavía completa `dist` con Haversine
(línea recta) cuando ninguno de los dos se cargó, solo para no dejar el
campo vacío — no lo tomes como el dato real de ningún lugar.

`icons` es un mapa opcional `categoria → path SVG` (mismo set de Material
Symbols que el resto del sitio, viewBox 24×24). Si una categoría no tiene
ícono, el marcador usa la estrella por defecto.

`descripcionLarga` es un texto opcional por lugar para la ficha del mapa.

```json
{
  "categories": {
    "salud": "Salud",
    "educacion": "Educación",
    "comercio": "Comercio"
  },
  "icons": {
    "salud": "M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-8.5-2h3v-3.5H17v-3h-3.5V7h-3v3.5H7v3h3.5z"
  },
  "places": [
    {
      "nombre": "Hospital Regional",
      "categoria": "salud",
      "lat": -38.7392,
      "lng": -72.5854,
      "dist": 1.8,
      "tiempoMin": 6,
      "contacto": "+56 45 220 5000",
      "descripcionLarga": "Urgencia y consultas generales, atención todo el día."
    }
  ]
}
```

No pongas 30 pines siempre visibles: el runtime muestra un solo marcador a partir
del selector Categoría → Lugar. Curaduría de ~6 lugares relevantes es mejor que
volcar todos los resultados de Overpass.

### 2. Crear la configuración del mapa

```json
{
  "name": "temuco-centro",
  "project": { "lat": -38.7359, "lng": -72.5904 },
  "bbox": { "south": -38.7560, "west": -72.6250, "north": -38.7160, "east": -72.5650 },
  "scale": 12,
  "padding": 20,
  "accentColor": "#b8860b",
  "minZoomRatio": 0.2,
  "placesFile": "temuco-centro-places.json"
}
```

Reglas de la receta:

- La bbox debe ser apaisada y **no más de ~40 km de ancho**; cajas más grandes
  devuelven demasiadas vías y el SVG se vuelve inmanejable.
- `scale` son unidades de canvas por km. Ajustalo para que la bbox completa
  quede en unos pocos cientos de unidades.
- `project` es el punto que se usa como referencia (la estrella del proyecto) y
  el centro de la proyección.

### 3. Correr el script

```bash
node scripts/build-geo-map.mjs config/temuco-centro.json --out-dir build/
```

El script hace el fetch a Overpass (calles + opcionalmente landuse/place),
proyecta lat/lng a unidades de canvas, simplifica las calles con
Ramer-Douglas-Peucker y genera:

- `<out-dir>/<name>.fragment.html` — fragmento completo con `<style>` y markup.
  Se pega **tal cual** en el textarea HTML del editor; el importador separa el
  `<style>` automáticamente.
- `<out-dir>/<name>.css` — CSS solo, por si preferís pegarlo en el textarea CSS.

El HTML generado ya trae `data-ocd-behavior="geo-map"` y todos los
`data-ocd-geo-*` (`data-ocd-geo-places`, `data-ocd-geo-categories`,
`data-ocd-geo-data-bounds`) como JSON válido.

### 4. Pegar en el editor

1. Abrí **Herramientas → Open CoDesign Canvas (Experimental)**.
2. Abrí el panel **Importar**.
3. En el textarea **HTML** pegá el contenido de `<name>.fragment.html` (o el
   markup y en **CSS** el contenido de `<name>.css`).
4. Aplicá la importación y guardá.

El runtime reconoce el nodo por `data-ocd-behavior="geo-map"` y el mapa queda
interactivo: pan por arrastre, zoom con rueda y selector Categoría → Lugar.

---

## `parcel-map`: uso directo en el editor

Arrastrá el bloque **Mapa de lotes/parcelas** del catálogo. Trae 4 lotes de
ejemplo y todos los atributos necesarios. Después editá los polígonos y sus
atributos:

```html
<g class="lote" data-lote="L-01"
   data-ocd-parcel-estado="disponible"
   data-ocd-parcel-valor="145.000.000">
  <polygon points="60,80 280,80 270,220 70,210" .../>
</g>
```

Cada lote es un `<g class="lote">` con:

- `data-lote` — identificador visible.
- `data-ocd-parcel-estado` — `disponible` o `vendido`.
- `data-ocd-parcel-valor` — texto que muestra el panel al fijar el lote.

El panel, el acento de color y los contadores se referencian por selector en el
root con `data-ocd-parcel-*`.

---

## Reglas de diseño no negociables

1. **Ajuste inicial `cover`, nunca `contain`.** El mapa debe llenar el recuadro
   por completo, aunque recorte el eje de datos sobrante. `contain` deja bandas
   vacías grandes para un recuadro apaisado con datos verticales.
2. **`vector-effect: non-scaling-stroke` en todas las clases de calle.** Si no,
   el grosor de las calles crece con el zoom y se ve mal.
3. **Marcadores y texto con `.zoom-constant`.** El runtime escribe
   `--zoom-k` en el SVG; `.zoom-constant { transform: scale(var(--zoom-k, 1));
   transform-origin: 0 0; }` mantiene el tamaño de pines y etiquetas constante
   en todo el rango de zoom.
4. **Categoría → Lugar en dropdown, no 30 pines.** El ruido de todos los POI a
   la vez es ilegible. Un solo marcador dinámico + una ficha compacta es el
   patrón validado.
5. **Atribución obligatoria a OpenStreetMap.** Los datos de OSM se publican con
   licencia ODbL y exigen atribución. El fragmento generado ya incluye
   `© OpenStreetMap contributors (ODbL)`; no la borres.
6. **Regenerá todo junto.** Si cambia la bbox, la escala o un lugar, volvé a
   correr el script y pegá el fragmento nuevo. No edites a mano coordenadas del
   SVG: los errores de este mapa siempre aparecieron por coordenadas
   copiadas/obsoletas después de un re-fetch.
7. **Íconos del marcador: mismo set de Material Symbols del resto del sitio.**
   No inventes un ícono nuevo por mapa; reusá el path ya usado en otra parte
   del sitio si la categoría coincide (p. ej. naturaleza). El marcador cae
   solo en la estrella por defecto si la categoría no tiene ícono en `icons`.

---

## Límites conocidos

- El runtime busca los nodos por `document.querySelector` desde selectores en el
  root. Si una página lleva más de un `geo-map` (o más de un `parcel-map`), cada
  instancia necesita IDs únicos en sus atributos `data-ocd-geo-svg`,
  `data-ocd-geo-panel`, etc. El script ya genera IDs derivados del `name`; si
  pegás dos fragmentos, cambiá el `name` y regenerá.
- El saneador del editor admite `select`/`option` como marcado inerte, pero
  retira `script`, `style`, `form`, `input` y `textarea`. Por eso el CSS va en
  el campo CSS (o se extrae del `<style>` del fragmento al importar), no como
  `<style>` persistido dentro del HTML.
- El script asume Overpass accesible por red. Si el fetch falla, no genera
  nada: corregí red/query y reintentá.
