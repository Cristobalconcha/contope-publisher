# CLAUDE.md — contope-publisher (Santa Luisa de Palpi)

## Regla no negociable: infraestructura y credenciales

Antes de tocar CUALQUIER cosa de despliegue, credenciales, o acceso al sitio
real (`santaluisadepalpi.kpispublicitarios.com`), es **obligatorio** leer
primero:

- `C:\Users\Cristobal concha\Contope-Design\vault_contope-design\bitacora.md`
  — buscar por fecha reciente y por palabras clave del tema (deploy, FTP,
  credenciales, zip) antes de asumir que un archivo encontrado en el
  filesystem (como `.env.local`) es la fuente de verdad vigente.

Esto aplica siempre, incluso cuando el usuario haya pedido explícitamente
"no preguntes, resuelve tú mismo" — esa instrucción es sobre decisiones de
implementación (diseño de una función, elección de una librería, etc.), no
sobre credenciales o despliegue a producción. Encontrar un archivo con
credenciales no es lo mismo que confirmar que sigue vigente y que
corresponde a este sitio.

**Por qué esta regla existe:** el 2026-09-02 Claude usó credenciales FTP de
`.env.local` sin verificar su vigencia ni su destino real, terminó
conectándose (probablemente) a un sitio de otro proyecto, y por separado
repitió un bug de construcción de zip ya resuelto meses antes — ambos
errores eran evitables leyendo la bitácora primero. Ver la entrada
"2026-09-02 — Incidente de despliegue" en la bitácora para el detalle
completo.

## Procedimiento de despliegue vigente

- **Sitio real:** `santaluisadepalpi.kpispublicitarios.com`. Solo hay acceso
  por WordPress (wp-admin) — no hay FTP/SFTP/SSH para este sitio. Cualquier
  credencial FTP encontrada en este repo pertenece a otro proyecto; no
  usarla aquí sin confirmación explícita y fresca de Cristobal.
- **Cómo se despliega el plugin:** construir un `.zip` de la carpeta
  `contope-publisher/` y subirlo a mano por el panel de WordPress
  (Plugins → Añadir nuevo → Subir plugin, reemplazando la versión
  instalada). El .zip se construye con `System.IO.Compression.ZipFile`
  directo (rutas internas con `/`) — **nunca** con `Compress-Archive` de
  PowerShell, que genera rutas con `\` y WordPress lo rechaza con "El
  archivo del plugin no existe".
- **Contraseña de aplicación de WordPress** (`COD_WP_APPLICATION_PASSWORD`
  en `.env.local`, bajo el usuario real `cristobal concha`): sirve solo
  para la API REST/MCP (Basic Auth). No sirve para el login normal de
  wp-admin ni para subir plugins por el panel — son mecanismos distintos.
  Si falla la autenticación contra el MCP real, probablemente está vencida;
  pedir una nueva desde el perfil de WordPress antes de reintentar, no
  adivinar variantes.
- **Copia de prueba local:** `C:\Users\Cristobal concha\wp-local`
  (`localhost:8890`), útil para probar cambios antes de construir el .zip
  de despliegue.

## Antes de cualquier otra decisión de arquitectura o alcance

Revisar `Contope-Design/vault_contope-design/` (bitácora, CURRENT_STATE.md,
ARCHITECTURE.md) — es la memoria persistente y compartida entre agentes de
este proyecto (Claude, Z, Codex, Cline). No asumir que una sesión nueva
parte de cero.
