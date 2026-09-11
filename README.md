# ContOpe Publisher

Prototipo de integración entre proyectos de ContOpe Design y WordPress/Gutenberg.

El primer caso conductor es **Santa Luisa de Palpi**. El objetivo del MVP es reconstruir Inicio, Preguntas frecuentes y Contacto como páginas Gutenberg nativas y editables; no incrustar la aplicación React mediante `iframe`.

## Alcance inicial

- importar una descripción JSON versionada;
- validar el documento antes de modificar WordPress;
- crear páginas como borradores;
- serializar estructura y contenido a bloques Gutenberg;
- conservar identificadores estables de proyecto, página y nodo;
- permitir edición nativa de textos, imágenes y enlaces.

## Fuera del primer checkpoint

- publicación automática;
- servidor MCP;
- sincronización bidireccional;
- importación genérica de cualquier JSX;
- constructor visual completo;
- modificaciones remotas del hosting.

## Editor Canvas (experimental)

`Herramientas → ContOpe Canvas (Experimental)` es un slice vertical aislado:
edita un único documento con GrapesJS 0.23.4 local (BSD-3-Clause, sin CDN) y guarda
datos estructurados, HTML y CSS por separado en la entidad `cod_canvas_doc`, con
`manage_options` y nonce. No publica páginas ni sustituye al importador.
Incluye inspector de estilos realmente renderizados, edición local o por clase,
presets y manejadores de columnas, comportamiento declarativo de navegación y
reapertura verificada. El CSS fuente se conserva literalmente y los cambios se
guardan como una capa de overrides para evitar pérdidas por interpretación.
Las rutas locales se resuelven contra los activos administrados del sitio y el
documento puede publicarse o actualizarse como una página WordPress standalone.
Detalle en [`docs/canvas-editor-experimental.md`](docs/canvas-editor-experimental.md).

## Estructura

```text
contope-publisher/
├── contope-publisher.php
└── includes/
    ├── class-cod-admin.php
    ├── class-cod-block-serializer.php
    ├── class-cod-importer.php
    └── class-cod-package-validator.php
docs/
└── package-format-v0.md
fixtures/
└── minimal-project.json
```

## Instalación de desarrollo

1. Copiar `contope-publisher/` a `wp-content/plugins/`.
2. Activar **ContOpe Publisher**.
3. Abrir **Herramientas → ContOpe Design**.
4. Importar un documento compatible en modo borrador.

## Despliegue FTPS de desarrollo

El script se limita de forma rígida a `/wp-content/plugins/contope-publisher/` y utiliza `.env.local`.

```powershell
# Solo muestra el plan
.\scripts\deploy-ftps.ps1

# Sube y verifica tamaños, sin activar el plugin
.\scripts\deploy-ftps.ps1 -Apply
```

## Licencia

ContOpe Publisher es software libre, bajo la **Licencia Pública General GNU,
versión 2 o posterior**. El texto íntegro está en [`LICENSE`](LICENSE).

Copyright © 2026 Cristóbal Concha — https://contope.com

## Software de terceros

Este proyecto incluye y redistribuye:

- **GrapesJS 0.23.4** — © 2017–actual Artur Arseniev, bajo licencia
  **BSD-3-Clause**. Copia local en `contope-publisher/assets/vendor/grapesjs/`,
  con su aviso de licencia íntegro en el `LICENSE` de esa misma carpeta.

  La licencia BSD-3-Clause prohíbe usar el nombre "GrapesJS" o el de sus
  colaboradores para respaldar o promocionar productos derivados. ContOpe
  Publisher menciona a GrapesJS como un hecho técnico —está construido sobre
  él— y no da a entender ningún respaldo por parte de sus autores.

ContOpe Publisher no contiene código del proyecto OpenDesign de manalkaff, con
el que comparte una raíz conceptual pero ninguna línea de código: aquel es una
colección de habilidades en markdown para agentes de IA, éste es un plugin de
WordPress.
