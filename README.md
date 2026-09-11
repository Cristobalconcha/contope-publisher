# ContOpe Publisher

Constructor visual de páginas para WordPress. Editas el sitio **dentro de la
herramienta real**, no subiendo archivos hechos por fuera — y puedes hacerlo
conversando con un asistente de IA, que opera el mismo editor que usa una
persona.

Se desarrolló construyendo un sitio de verdad, [Santa Luisa de
Palpi](https://santaluisadepalpi.com), que sigue siendo el caso de prueba de
cada cambio.

## Instalación

**→ [Guía de instalación y conexión](docs/INSTALAR.md)**

Tres pasos: instalar el plugin, crear una contraseña de aplicación y pegar la
configuración del servidor en tu asistente. No requiere programar.

Requiere WordPress 6.5+, PHP 8.0+ y una cuenta de administrador.

## Qué hace

- **Editor visual** sobre GrapesJS: secciones, grillas anidadas, galerías con
  lightbox, mapas, gráficos, videos con transparencia.
- **Servidor MCP** en `/wp-json/contope/v1/mcp`: un asistente lee y modifica
  las páginas a través del editor real, con las mismas validaciones que una
  persona.
- **Cabecera y pie compartidos** entre páginas, con reglas de dónde aplican.
- **Comportamientos declarativos** —carruseles, acordeones, visores de
  contenido externo, ventana de WhatsApp con evento medible— sin escribir
  JavaScript en el contenido.
- **Portabilidad**: exportar e importar un sitio completo entre instalaciones.

## Qué NO hace todavía

- importación genérica de cualquier JSX;
- sincronización bidireccional automática;
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
