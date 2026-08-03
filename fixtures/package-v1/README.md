# Fixtures del contrato `.ocdsite` v1

Cada subdirectorio contiene un `manifest.json` de ejemplo y un `case.json` que
declara el resultado esperado (`expect: valid|invalid`) y, para los negativos, el
arreglo `expectedErrors` con el conjunto **exacto** de códigos que debe producir
el validador.

El chequeo focalizado (`scripts/check-package-v1.mjs`) recorre estos directorios,
compila el contrato con Ajv 2020 + ajv-formats, ejecuta las referencias cruzadas
(incluida la correspondencia entrypoint → rol) y aplica un **guard estricto**: el
conjunto único de códigos producidos debe ser exactamente `expectedErrors`
(duplicados del mismo código se aceptan; ningún error espurio puede pasar). Los
casos válidos deben producir cero errores.

## Casos válidos

- `valid/santa-luisa/`: paquete completo de Santa Luisa de Palpi con contenido,
  tema hijo (post-split Canvas: `templates/index.html` + `parts/`), estado
  WordPress en base de datos, fuentes y activos. La identidad se separa en
  `package.id` (`urn:ocd:package`) y `project.id` (`urn:ocd:project`), opacos
  **distintos**, y `origin.siteId` (`urn:ocd:site`). No incluye `front-page.html`
  ni `page.html` (viven en el tema padre Canvas) ni los entrypoints de
  intercambio con Desktop, que son opcionales.
- `valid/desktop-interchange/`: cobertura positiva de los entrypoints opcionales
  `designModel`, `desktopSource` e `idml` (con sus roles `design-model`,
  `desktop-source`, `idml`) y de los roles `pattern`, `navigation` y `fonts`.

Los valores `sha256` de los fixtures son *placeholders* de formato (digestos
reales de semillas derivadas de la ruta declarada), no digestos de los bytes
reales del ZIP. El empaquetador debe recalcularlos al cerrar el `.ocdsite`.

## Casos inválidos (cada uno rompe sólo su regla declarada)

| Directorio                       | `expectedErrors`                                | Razón                                                   |
|----------------------------------|-------------------------------------------------|---------------------------------------------------------|
| `invalid-schema-id-mismatch`      | `["SCHEMA_ID_MISMATCH"]`                         | `$schema` ajena; la propiedad es `const` del `$id`.     |
| `invalid-format-version`          | `["FORMAT_VERSION"]`                             | `formatVersion` no es el entero `1`.                   |
| `invalid-format-version-type`     | `["FORMAT_VERSION"]`                             | `formatVersion` con tipo incorrecto (string).           |
| `invalid-missing-required`        | `["MISSING_REQUIRED"]`                           | Falta la sección `requirements`.                        |
| `invalid-root-unknown-field`      | `["UNKNOWN_FIELD"]`                              | Campo top-level desconocido (raíz).                     |
| `invalid-declared-symlink`        | `["UNKNOWN_FIELD"]`                              | Un activo declara `symlink` (campo desconocido).        |
| `invalid-wrong-package-id-domain` | `["PACKAGE_ID_FORMAT"]`                          | `package.id` usa el dominio `urn:ocd:project`.          |
| `invalid-wrong-project-id-domain` | `["PROJECT_ID_FORMAT"]`                          | `project.id` usa el dominio `urn:ocd:package`.          |
| `invalid-wrong-site-id-domain`    | `["SITE_ID_FORMAT"]`                             | `origin.siteId` usa el dominio `urn:ocd:project`.       |
| `invalid-wrong-asset-id-domain`   | `["ASSET_ID_FORMAT"]`                            | `assets[].id` usa el dominio `urn:ocd:project`.         |
| `invalid-entrypoint-role-mismatch`| `["ENTRYPOINT_ROLE_MISMATCH"]`                   | `content` apunta a un archivo con rol `idml`.           |
| `invalid-version-format`          | `["VERSION_FORMAT"]`                             | `requirements.canvas` no es versión semver-like.        |
| `invalid-role`                    | `["INVALID_ROLE"]`                               | Un archivo declara un rol fuera del enum.               |
| `invalid-not-boolean`             | `["NOT_BOOLEAN"]`                                | `capabilities.fullSiteEditing` no es boolean.           |
| `invalid-duplicate-block`         | `["DUPLICATE_BLOCK"]`                            | `requiredBlocks` repite un nombre de bloque.            |
| `invalid-producer`                | `["INVALID_PRODUCER"]`                           | `origin.producer` vacío (minLength).                    |
| `invalid-name`                    | `["INVALID_NAME"]`                               | `project.name` vacío (minLength).                       |
| `invalid-revision`                | `["INVALID_REVISION"]`                           | `package.revision` vacío (minLength).                   |
| `invalid-path-absolute`           | `["PATH_NOT_NORMALIZED"]`                        | Ruta absoluta (barra inicial).                          |
| `invalid-path-traversal`          | `["PATH_NOT_NORMALIZED"]`                        | Segmento `..` de traversal.                             |
| `invalid-path-backslash`          | `["PATH_NOT_NORMALIZED"]`                        | Barras invertidas en lugar de separador POSIX.          |
| `invalid-duplicate-path`          | `["DUPLICATE_PATH"]`                             | Dos archivos con la misma ruta exacta.                  |
| `invalid-duplicate-path-case`     | `["DUPLICATE_PATH_CASE"]`                        | Dos rutas que difieren sólo en mayúsculas/minúsculas.   |
| `invalid-duplicate-asset-id`      | `["DUPLICATE_ID"]`                               | Dos activos con el mismo ID OCD.                        |
| `invalid-bad-sha256`              | `["INVALID_SHA256"]`                             | Digesto que no es 64 hex minúsculas.                    |
| `invalid-negative-size`           | `["INVALID_SIZE"]`                               | Tamaño negativo.                                        |
| `invalid-bad-mime`                | `["INVALID_MIME"]`                               | MIME sin forma `type/subtype`.                          |
| `invalid-bad-date-time`           | `["INVALID_DATE_TIME"]`                          | `createdAt` no es una fecha-hora RFC 3339 válida.       |
| `invalid-bad-uri`                 | `["INVALID_URI"]`                                | `origin.siteUrl` no es una URI absoluta válida.         |
| `invalid-unresolved-entrypoint`   | `["UNRESOLVED_REFERENCE"]`                       | `entrypoints.content` no existe en el inventario.       |
| `invalid-duplicate-entrypoint`    | `["DUPLICATE_REFERENCE","ENTRYPOINT_ROLE_MISMATCH"]` | Dos entrypoints aliasan la misma ruta; el segundo además queda con rol incorrecto. |
| `invalid-malformed-json`          | `["INVALID_JSON"]`                               | `manifest.json` no es JSON válido.                      |
