# Conecta tu asistente con un sitio WordPress que tenga ContOpe Publisher.
#
# Empieza en Windows y termina comprobando que WordPress responde: instala Node
# si falta, pide los datos, PRUEBA la conexion de verdad y recien entonces
# escribe la configuracion.
#
# POR QUE EXISTE: los tres pasos manuales tienen tres trampas, y las tres le
# pasan a todo el mundo la primera vez.
#   1. La conexion usa npx, o sea que necesita Node. Quien no programa no tiene
#      por que saberlo, y el mensaje de error no lo dice.
#   2. La clave no va tal cual: va "usuario:clave" convertido a Base64.
#   3. Si algo quedo mal, el asistente simplemente no ve el servidor y no hay
#      forma de saber cual de las tres cosas fallo.
# Este script resuelve las tres y avisa cual fallo cuando falla.
#
# Uso:  .\instalar-conexion.ps1
#       .\instalar-conexion.ps1 -Sitio "https://misitio.cl" -Usuario "cristobal"

param(
    [string]$Sitio = '',
    [string]$Usuario = '',
    [string]$Nombre = '',
    [switch]$SinInstalarNode,
    [switch]$Forzar
)

$ErrorActionPreference = 'Stop'

function Titulo($t) { Write-Host ''; Write-Host $t -ForegroundColor Cyan }
function Bien($t)   { Write-Host "  OK  $t" -ForegroundColor Green }
function Mal($t)    { Write-Host "  --  $t" -ForegroundColor Red }
function Nota($t)   { Write-Host "      $t" -ForegroundColor DarkGray }

Write-Host ''
Write-Host '  Conectar tu asistente con tu sitio WordPress' -ForegroundColor White
Write-Host '  ---------------------------------------------'

# ─────────────────────────────────────────────────────────────────────────
# 1 · Node
# ─────────────────────────────────────────────────────────────────────────
Titulo '1 · Node.js'

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $v = (& node --version) 2>$null
    Bien "ya instalado ($v)"
} elseif ($SinInstalarNode) {
    Mal 'no esta instalado y se pidio no instalarlo. Instalalo desde https://nodejs.org y vuelve a correr esto.'
    exit 1
} else {
    Mal 'no esta instalado.'
    Nota 'La conexion lo necesita: el asistente arranca el puente con "npx", que viene con Node.'
    $r = Read-Host '      Lo instalo ahora con winget? (s/n)'
    if ($r -notmatch '^[sSyY]') {
        Nota 'Instalalo desde https://nodejs.org (version LTS) y vuelve a correr esto.'
        exit 1
    }
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        Mal 'winget no esta disponible en este Windows.'
        Nota 'Instala Node manualmente desde https://nodejs.org (version LTS).'
        exit 1
    }
    Nota 'Instalando Node.js LTS. Windows puede pedirte permiso.'
    & winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    # winget no refresca el PATH de esta sesion: se busca donde queda por defecto.
    $posible = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path $posible) {
        $env:Path = "$env:Path;$(Split-Path $posible)"
    }
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Mal 'Node quedo instalado pero esta ventana no lo ve todavia.'
        Nota 'Cierra esta ventana, abre PowerShell de nuevo y vuelve a correr el script.'
        exit 1
    }
    Bien "instalado ($(& node --version))"
}

# ─────────────────────────────────────────────────────────────────────────
# 2 · Datos
# ─────────────────────────────────────────────────────────────────────────
Titulo '2 · Datos de tu sitio'

if (-not $Sitio)   { $Sitio   = Read-Host '      Direccion del sitio (ej: https://misitio.cl)' }
if (-not $Usuario) { $Usuario = Read-Host '      Tu nombre de usuario de WordPress' }

$Sitio = $Sitio.Trim().TrimEnd('/')
if ($Sitio -notmatch '^https://') {
    if ($Sitio -match '^http://') {
        Mal 'El sitio tiene que estar en https. WordPress no permite contrasenas de aplicacion sobre http.'
        exit 1
    }
    $Sitio = "https://$Sitio"
}
if (-not $Nombre) {
    $sugerido = ([Uri]$Sitio).Host -replace '^www\.', '' -replace '\..*$', ''
    $Nombre = Read-Host "      Nombre para verlo en el asistente [$sugerido]"
    if (-not $Nombre) { $Nombre = $sugerido }
}

Write-Host ''
# La clave se pide oculta y NO se acepta como parametro: un parametro queda
# escrito en el historial de PowerShell, que es justo lo que no se quiere con
# una credencial. Para automatizar, se admite por variable de entorno, que
# tampoco queda en el historial.
if ($env:WP_APP_PASSWORD) {
    $clave = $env:WP_APP_PASSWORD
    Nota 'Contrasena tomada de la variable de entorno WP_APP_PASSWORD.'
} else {
    Nota 'Ahora la contrasena de aplicacion (Usuarios -> Perfil -> Contrasenas de aplicacion).'
    Nota 'No es tu contrasena normal. Se escribe oculta y no queda en el historial.'
    $claveSegura = Read-Host '      Contrasena de aplicacion' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($claveSegura)
    try { $clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

if (-not $clave) { Mal 'No escribiste ninguna contrasena.'; exit 1 }

# WordPress la muestra con espacios por comodidad; los acepta con o sin ellos.
$par = "$($Usuario.Trim()):$($clave.Trim())"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($par))
$autorizacion = "Basic $b64"
$endpoint = "$Sitio/wp-json/contope/v1/mcp"

# ─────────────────────────────────────────────────────────────────────────
# 3 · Probar ANTES de escribir nada
# ─────────────────────────────────────────────────────────────────────────
Titulo '3 · Probando la conexion'
Nota $endpoint

$cuerpo = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
$respuesta = $null
try {
    $respuesta = Invoke-WebRequest -Uri $endpoint -Method Post -Body $cuerpo -TimeoutSec 30 `
        -ContentType 'application/json' `
        -Headers @{ 'Authorization' = $autorizacion; 'Accept' = 'application/json, text/event-stream' } `
        -UseBasicParsing
} catch {
    $codigo = $null
    if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
    Mal "no se pudo conectar$(if ($codigo) { " (HTTP $codigo)" })."
    switch ($codigo) {
        401 { Nota 'La clave no fue aceptada. Revisa el usuario y la contrasena de aplicacion.' }
        403 { Nota 'La cuenta existe pero no es administradora. El plugin solo atiende a administradores.' }
        404 { Nota 'El sitio responde pero no encuentra el plugin. Comprueba que ContOpe Publisher este INSTALADO y ACTIVO.' }
        default { Nota 'Revisa que la direccion este bien escrita y que el sitio este en linea.' }
    }
    Nota 'No se escribio ninguna configuracion.'
    exit 1
}

$texto = $respuesta.Content
$linea = ($texto -split "`n" | Where-Object { $_ -like 'data:*' } | Select-Object -First 1)
if ($linea) { $texto = $linea -replace '^data:\s*', '' }
$datos = $null
try { $datos = $texto | ConvertFrom-Json } catch { }
$cuantas = 0
if ($datos -and $datos.result -and $datos.result.tools) { $cuantas = @($datos.result.tools).Count }

if ($cuantas -lt 1) {
    Mal 'el sitio respondio, pero no como se esperaba.'
    Nota 'Puede ser una version distinta del plugin. No se escribio ninguna configuracion.'
    exit 1
}
Bien "conectado. El sitio ofrece $cuantas herramientas."

# ─────────────────────────────────────────────────────────────────────────
# 4 · Escribir la configuracion
# ─────────────────────────────────────────────────────────────────────────
Titulo '4 · Guardando la configuracion'

$config = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
$carpeta = Split-Path $config
if (-not (Test-Path $carpeta)) { New-Item -ItemType Directory -Path $carpeta -Force | Out-Null }

$actual = [ordered]@{}
if (Test-Path $config) {
    $respaldo = "$config.respaldo-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $config $respaldo
    Bien "respaldo de tu configuracion anterior: $(Split-Path $respaldo -Leaf)"
    try {
        $leido = Get-Content $config -Raw | ConvertFrom-Json
        foreach ($p in $leido.PSObject.Properties) { $actual[$p.Name] = $p.Value }
    } catch {
        Mal 'tu configuracion actual no es un JSON valido. Se detiene para no perderla.'
        Nota "Esta respaldada en: $respaldo"
        exit 1
    }
}

$servidores = [ordered]@{}
if ($actual.Contains('mcpServers') -and $actual['mcpServers']) {
    foreach ($p in $actual['mcpServers'].PSObject.Properties) { $servidores[$p.Name] = $p.Value }
}
if ($servidores.Contains($Nombre) -and -not $Forzar) {
    $r = Read-Host "      Ya existe un servidor llamado '$Nombre'. Lo reemplazo? (s/n)"
    if ($r -notmatch '^[sSyY]') { Nota 'No se cambio nada.'; exit 0 }
}

$variable = 'WP_AUTH_' + ($Nombre -replace '[^A-Za-z0-9]', '').ToUpper()
$servidores[$Nombre] = [ordered]@{
    command = 'npx'
    args    = @('-y', 'mcp-remote', $endpoint, '--header', "Authorization:`${$variable}")
    env     = [ordered]@{ $variable = $autorizacion }
}
$actual['mcpServers'] = $servidores

# UTF-8 SIN BOM a proposito: el asistente lee este archivo como JSON, y un BOM
# al principio lo hace fallar al interpretarlo. Set-Content -Encoding utf8 en
# Windows PowerShell 5.1 SI escribe BOM, por eso no se usa aca.
$json = $actual | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($config, $json, (New-Object System.Text.UTF8Encoding($false)))

Bien "escrita en $config"

Write-Host ''
Write-Host '  Listo.' -ForegroundColor Green
Write-Host "  Cierra el asistente por completo y vuelve a abrirlo." -ForegroundColor White
Write-Host "  Despues pidele: `"lista las paginas del sitio`"" -ForegroundColor White
Write-Host ''
