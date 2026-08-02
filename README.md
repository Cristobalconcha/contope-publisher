# Open CoDesign Publisher

Prototipo de integración entre proyectos de Open CoDesign y WordPress/Gutenberg.

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

## Estructura

```text
open-codesign-publisher/
├── open-codesign-publisher.php
└── includes/
    ├── class-ocd-admin.php
    ├── class-ocd-block-serializer.php
    ├── class-ocd-importer.php
    └── class-ocd-package-validator.php
docs/
└── package-format-v0.md
fixtures/
└── minimal-project.json
```

## Instalación de desarrollo

1. Copiar `open-codesign-publisher/` a `wp-content/plugins/`.
2. Activar **Open CoDesign Publisher**.
3. Abrir **Herramientas → Open CoDesign**.
4. Importar un documento compatible en modo borrador.

