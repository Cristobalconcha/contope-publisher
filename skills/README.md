# Paquete de vinculación IA ↔ Contope Design

Sistematiza cómo un asistente —Claude, Codex, Z o el que venga— conecta las tres
piezas del sistema y trabaja dentro de la herramienta real, no como un canal para
subir cosas hechas afuera.

```
Contope Design Desktop  →  contrato portable  →  MCP de WordPress  →  Page Builder Web
   (dueño del set)          design/model.json      (frontera)          (dueño del sitio)
```

## Qué hay acá

| Skill | Cubre |
|---|---|
| **`aplicar-set-de-diseno`** | El puente completo: qué emite Desktop, qué acepta el MCP, cómo se traduce cada definición, las operaciones reales de este destino y las brechas que hoy existen. |
| **`operar-canvas`** | Operar el page builder sin romperlo: las dos vías de trabajo, el circuito de edición y las reglas duras que costaron horas y defectos en producción. |

Del lado del escritorio ya existen `design-contract-builder` y
`design-system-baton` (en `Contope-Design/resources/templates/skills/`). Este
paquete **no los reemplaza**: el primero describe un builder genérico, y acá
están las capacidades reales de este destino.

## Instalar

```powershell
.\skills\instalar-skills.ps1                                    # Claude
.\skills\instalar-skills.ps1 -Destino "$env:USERPROFILE\.codex\skills"
```

La fuente de verdad es este repo, para que los skills viajen con el proyecto.
Cada asistente los lee de su propia carpeta y Windows pide privilegios de
administrador para enlazarlos, así que se copian: el script existe para que
volver a sincronizar sea un comando y no un acto de memoria. Si editas un skill,
edítalo acá y vuelve a correrlo.

## Herramientas de verificación

| Comando | Para qué |
|---|---|
| `node scripts/auditar-abreviadas.mjs` | Lista los estilos que desaparecieron sin que nadie lo viera. |
| `node scripts/revisar-php.mjs` | Sintaxis de todos los PHP del plugin, sin PHP instalado. |
| `--dry-run` en `ocd-grapes-runner` | Simula la edición y deja el resultado completo para revisar. |
