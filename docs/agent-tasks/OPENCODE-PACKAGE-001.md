# OPENCODE-PACKAGE-001 — Contrato portable `.ocdsite` v1

## Base y alcance

- Base: `05429a7`.
- Objetivo: definir y verificar el contrato del paquete integral sin implementar todavía importación/exportación WordPress.
- Estado de entrega: diff sin commit; Codex revisa e integra.

## Allowlist

- `docs/package-format-v1.md`
- `schemas/**`
- `fixtures/package-v1/**`
- `scripts/check-package-v1.mjs`
- `package.json`
- `package-lock.json` sólo si una dependencia de desarrollo resulta indispensable y queda justificada.

No modificar plugin, temas, `scripts/check.mjs`, despliegue ni otros archivos.

## Requisitos

1. Definir un JSON Schema estricto para `manifest.json` de un contenedor ZIP `.ocdsite`.
2. Incluir: versión de formato; IDs y revisión; origen; Canvas/Publisher/WordPress requeridos; entrypoints; inventario de archivos; activos con ruta relativa, MIME, tamaño y SHA-256; capacidades/dependencias.
3. Validar rutas relativas normalizadas, IDs únicos, rutas únicas, hashes SHA-256, tamaños no negativos y referencias sin duplicados.
4. Prohibir rutas absolutas, `..`, barras invertidas ambiguas, symlinks declarados y secretos.
5. Documentar límites recomendados contra ZIP traversal, ZIP bomb, MIME engañoso y archivos excesivos; el schema no debe prometer validaciones que requieren inspeccionar el ZIP.
6. Añadir un fixture válido de Santa Luisa y fixtures inválidos representativos.
7. Crear un check Node sin dependencia runtime. Una dependencia de desarrollo sólo se acepta con justificación de licencia y necesidad.

## Aceptación

- El fixture válido aprueba y todos los inválidos fallan por la razón esperada.
- El check termina con código distinto de cero ante una regresión.
- `npm run check`, el check enfocado y `git diff --check` se ejecutan con resultados literales.
- Documentación distingue claramente manifiesto, contenido, tema hijo, estado WordPress en base de datos y activos.
- Entregar inventario, decisiones, riesgos y pendientes. No declarar implementada la portabilidad: esto sólo cierra el contrato verificable.

