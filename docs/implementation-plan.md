# Plan de implementación — Open CoDesign para WordPress

## Resultado de producto

Construir un sistema abierto capaz de:

1. recibir diseños de Open CoDesign Desktop y convertirlos en WordPress nativo y editable;
2. hidratar esos contenidos mediante un tema de bloques propio;
3. exportar el proyecto completo y reconstruirlo con fidelidad en otro WordPress;
4. abrir el paquete exportado en Open CoDesign Desktop directamente en flujo de Edición;
5. incorporar posteriormente sitios creados con Gutenberg, HTML/CSS y otros page builders mediante adaptadores;
6. permitir intervención remota controlada mediante MCP, sin hacer que el funcionamiento normal dependa de IA.

## Arquitectura objetivo

### Tema padre: Open CoDesign Canvas

Motor neutro y versionado. Contiene retículas, contenedores, comportamiento responsive, estilos estructurales, templates mínimos y capacidades comunes. No contiene identidad ni contenido de Santa Luisa.

### Tema hijo generado por proyecto

Contiene tokens visuales, estilos, templates, parts, patterns, fuentes y activos propios del proyecto. Debe declarar la versión compatible de Canvas y separar archivos administrados por Open CoDesign de personalizaciones humanas.

### Plugin Publisher/Tools

Servicios compartidos de paquete, identidad, activos, importación, exportación, revisiones, conflictos y adaptadores. La interfaz administrativa, REST y MCP deberán utilizar estos servicios; MCP no escribirá directamente en archivos o base de datos.

### Paquete `.ocdsite`

Contenedor ZIP versionado con manifiesto, configuración visual, contenido, navegación, templates/parts, tema hijo, activos e integridad. No incluye secretos. Conserva IDs estables y declara versiones requeridas de Canvas, Publisher y WordPress.

## Principios no negociables

- WordPress funciona y se edita completamente sin IA ni Desktop.
- Importación y exportación son bidireccionales y no destructivas.
- Una segunda importación no duplica páginas ni activos.
- Todo cambio distingue ámbito local, de plantilla o global.
- Las modificaciones del Editor del Sitio almacenadas en base de datos también forman parte de la exportación.
- Los formatos desconocidos o no representables producen un informe de pérdida; nunca se descartan silenciosamente.
- El original no se modifica durante una migración hasta aprobar un preflight.
- Cada importación genera un plan, una revisión recuperable y un registro de auditoría.

## Fases

### Fase 0 — Base coordinada

- checkpoint verificable del prototipo;
- instrucciones multiagente;
- contrato y propiedad de archivos;
- ramas/worktrees aislados;
- checks reproducibles.

### Fase 1 — Hidratación correcta

- extraer `open-codesign-canvas` como tema padre;
- convertir Santa Luisa en tema hijo;
- corregir templates de bloques;
- desplegar ambos temas en el WordPress de prueba;
- comprobar las tres páginas en editor y frontend, escritorio y móvil.

### Fase 2 — Paquete portable v1

- JSON Schema y manifiesto con IDs, revisiones, dependencias, archivos y hashes;
- activos locales con MIME, tamaño y SHA-256;
- protección contra rutas peligrosas, duplicados y paquetes excesivos;
- fixtures válidos e inválidos.

### Fase 3 — Importación idempotente

- mapa persistente OCD ID ↔ entidad WordPress;
- carga a biblioteca multimedia y remapeo;
- actualización por ID estable;
- preflight, transacción lógica y rollback;
- no duplicar en una segunda importación.

### Fase 4 — Exportación integral

- páginas, bloques y metadatos administrados;
- medios relacionados;
- tema hijo y configuración;
- templates, parts, global styles, navegación y patterns guardados en base de datos;
- ajustes de página de inicio y asignaciones;
- creación descargable de `.ocdsite` con hashes.

### Fase 5 — Roundtrip y Desktop

- WordPress A → `.ocdsite` → WordPress B limpio;
- igualdad estructural, editorial y visual documentada;
- apertura del mismo paquete en Desktop como proyecto existente;
- checklist de Edición y publicación incremental posterior.

### Fase 6 — MCP

- primera versión de sólo lectura: manifiesto, páginas, templates, tokens y activos;
- luego `changes.plan`, `changes.apply` y `changes.rollback` con revisión base y permisos WordPress;
- HTTPS y autenticación revocable; sin SQL, shell o escritura arbitraria.

### Fase 7 — Migradores

Orden inicial: Gutenberg/Open CoDesign, HTML/CSS, Divi y luego otros builders. Cada adaptador ejecuta detección, preflight, extracción, normalización e informe de fidelidad.

## Sprint demostrable de una semana

El objetivo es probar Santa Luisa de extremo a extremo, no terminar todavía un page builder universal.

- Día 1: Fase 0 y contrato v1.
- Días 1–2: Canvas + tema hijo y prueba visual en el WordPress actual.
- Días 2–3: activos e identidad; importación idempotente.
- Días 3–4: exportación integral del universo soportado.
- Día 5: roundtrip en un segundo WordPress limpio y apertura del paquete en Desktop.

## Criterio de demostración

- tres páginas sin duplicados;
- textos, jerarquía, imágenes y video locales;
- columnas y anchos equivalentes;
- mismo header, footer, paleta, tipografía y responsive;
- edición nativa en Gutenberg;
- exportación e importación repetible;
- paquete reconocido como proyecto de Edición;
- checks automatizados, revisión manual y checkpoint Git.

