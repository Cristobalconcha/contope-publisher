# Formato de importación v0

Este contrato es deliberadamente pequeño. Sirve para validar el recorrido ContOpe Design → Gutenberg y no pretende ser un lenguaje universal de interfaz.

## Documento

```json
{
  "schemaVersion": 0,
  "project": {
    "id": "santa-luisa-de-palpi",
    "name": "Santa Luisa de Palpi"
  },
  "pages": []
}
```

Cada página requiere `id`, `title`, `slug` y `nodes`. Los identificadores deben permanecer estables entre importaciones.

## Nodos admitidos en el checkpoint inicial

- `section`: contenedor de nivel superior;
- `group`: agrupación genérica;
- `columns`: composición de columnas;
- `column`: hijo directo de `columns`, con `width` opcional;
- `heading`: título con niveles 1–6;
- `paragraph`: texto enriquecido limitado;
- `image`: referencia de activo o URL;
- `buttons`: agrupador de botones;
- `button`: etiqueta y enlace;
- `details`: resumen desplegable con bloques hijos;
- `list`: lista ordenada o no ordenada;
- `video`: video HTML5 con poster opcional;
- `separator`;
- `spacer`.

Los nodos desconocidos invalidan la importación. Esta decisión evita pérdidas silenciosas.

## Autoridad

La importación inicial crea borradores. Una reimportación futura deberá diferenciar estructura controlada por ContOpe Design y contenido editorial controlado por WordPress; esa política todavía no forma parte de v0.
