# CLAUDE-CANVAS-001 — Tema padre Canvas y tema hijo Santa Luisa

## Base y alcance

- Base: `05429a7`.
- Objetivo: separar el motor genérico del proyecto Santa Luisa sin modificar el plugin ni el contrato de paquetes.
- Estado de entrega: diff sin commit; Codex revisa e integra.

## Allowlist

- `contope-canvas/**`
- `contope-santa-luisa/**`

Todo otro archivo está prohibido. Si un check necesita cambios fuera de esta lista, informarlo sin editarlo.

## Requisitos

1. Crear un block theme padre reconocido por WordPress, neutral y sin contenido Santa Luisa.
2. Convertir `contope-santa-luisa` en tema hijo mediante `Template: contope-canvas`.
3. Llevar al padre sólo reglas estructurales reutilizables: layout, contenedores, columnas, responsive y templates mínimos.
4. Conservar en el hijo paleta, identidad, parts/templates específicos y variantes del proyecto.
5. Corregir `index.html`: `post-template` debe vivir dentro de `query`.
6. El sitio debe funcionar sin una petición obligatoria a Google Fonts. Usar fallbacks portables; no descargar dependencias ni activos en esta tarea.
7. Mantener contenido y estilos editables mediante bloques y `theme.json`; no usar iframe ni HTML opaco.

## Aceptación

- Ambos temas tienen `style.css`, `theme.json` y `templates/index.html` válidos.
- El hijo declara correctamente el padre.
- No quedan nombres, colores o textos de Santa Luisa en Canvas.
- Header/footer de proyecto permanecen en el hijo o se expresan como overrides deliberados.
- `npm run check` y `git diff --check` se ejecutan y sus resultados se informan literalmente.
- Entregar inventario de archivos, decisiones, riesgos y pendientes. No declarar cerrada la fase de hidratación porque falta despliegue real.

