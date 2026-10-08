# CLAUDE-TRAMA-001 — Módulo de trama (superficie de puntos)

## Base y alcance

- Base: `da1089e`.
- Objetivo: agregar el módulo de trama como fondo declarativo
  (`data-cod-trama="SP1.…"`), con el mismo patrón de encolado y vista previa
  que el módulo de video con luma matte, y registrarlo en la documentación.
- Estado de entrega: diff sin commit; Codex revisa e integra. No se declara
  completo: falta probarlo en un WordPress real.

## Allowlist

- `contope-publisher/assets/js/cod-trama.js` (nuevo)
- `contope-publisher/includes/class-cod-canvas-page-publisher.php`
- `contope-publisher/includes/class-cod-canvas-editor-admin.php`
- `contope-publisher/includes/class-cod-inline-editor-frontend.php`
- `contope-publisher/assets/js/cod-editor-core.js`
- `contope-publisher/assets/js/cod-computed-inspector.js`
- `scripts/check-canvas-editor.mjs` (solo el conteo de scripts encolados: 13 → 14)
- `scripts/probar-trama.mjs` (nuevo)
- `docs/modulo-trama.md` (nuevo), `docs/agent-tasks/CLAUDE-TRAMA-001.md` (nuevo)
- `README.md` (una línea en «Qué hace»), `CHANGELOG.md` (entrada 0.3.78)

## Qué se hizo

1. `cod-trama.js`: runtime UMD, mismo contrato dual que `cod-luma-matte-video.js`
   (arranque propio en la página publicada; `OcdTrama.createRuntime({ window, document })`
   para el iframe del lienzo). Motor determinista en `TRAMA_ENGINE`, reutilizado
   como texto para el worker. Buffer en worker + interpolación + WebGL, con canvas
   2D y llenado en hilo principal como respaldos. `MutationObserver` para el
   editor (crea y destruye instancias al agregar, quitar o cambiar el código).
2. Encolado `cod-trama` junto a `cod-luma-matte-video` en los tres lugares, y
   `cod-trama` agregado a las dependencias de `cod-editor-core` en el editor
   Canvas y en el editor en línea.
3. `installCanvasTramaRuntime()` en `cod-editor-core.js` y en
   `cod-computed-inspector.js`, llamado en los mismos puntos que el del luma
   matte. Tipo de componente `cod-trama` (contenedor que admite contenido).
4. El saneador ya permite `data-*`; no se tocó.

## Resultados de los chequeos (literales)

- `npm run check` → código de salida 0:
  `OK: parsed 52 PHP files and validated three fixtures (7 pages).`
  `OK: Canvas editor: 354 comprobaciones estáticas correctas.`
  (antes del cambio: 353; el chequeo que cuenta los scripts encolados se
  actualizó de 13 a 14.)
- `node scripts/probar-trama.mjs` → código de salida 0, 9 de 9 verificaciones.
- `git diff --check` → sin salida.
- `npm run check:canvas-runtime` y `npm run check:inline-split` → código de
  salida 1, **también en la base sin este cambio**: en este entorno no hay el
  Chrome que esos chequeos lanzan. Deben correrse en la máquina de integración.
- `scripts/correr-pruebas.mjs` no se corrió: exige el PHP de `wp-local`.

## Verificación en navegador (fuera de WordPress)

Página de prueba con tres secciones: viva, estática y con código roto. Las dos
primeras crean su canvas detrás del contenido; el enlace de la primera sigue
siendo el elemento que recibe el clic; la de código roto queda intacta, sin
canvas, con un solo aviso en consola. Al quitar la sección viva del DOM, su
instancia se destruye.

## Riesgos y pendientes

- **No leí `vault_contope-design/arquitectura-page-builder-compositivo.md`**
  (fuera del repositorio). Revisar contra §7–8 (bibliotecas de módulos) y §11
  (contrato de CSS) antes de integrar.
- El runtime agrega una regla global a los elementos con `data-cod-trama`:
  `position: relative; isolation: isolate`. Si una sección ya usa otro
  `position`, la trama la cambia.
- Worker desde `blob:`: una CSP estricta (`worker-src`) lo bloquea; hay
  respaldo, pero con más carga en el hilo principal.
- Versión del plugin: la entrada del CHANGELOG dice 0.3.78 «pendiente de
  integración»; la cabecera de `contope-publisher.php` sigue en 0.3.77 hasta
  que el integrador publique.
- Segunda fase sin hacer: componente en el catálogo, campo `trama` en las
  recetas del MCP, secuencias.
