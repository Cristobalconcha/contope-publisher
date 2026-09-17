param(
    [switch]$Apply
)

# Despliegue de los temas al sitio publicado.
#
# Por que este script cambio el 2026-09-16
# ----------------------------------------
# Antes subia a carpetas de nombre fijo escritas aca adentro. El sitio tenia
# activo un tema con OTRO nombre —el del proyecto antes de renombrarse— y nadie
# se dio cuenta durante cinco dias: cada despliegue transferia sus archivos sin
# error, verificaba el tamano remoto, e imprimia DEPLOY_OK. Todo era cierto y
# todo era inutil: los archivos caian en una carpeta que el sitio no leia.
#
# Se descubrio al quitar la tipografia Lora del tema, desplegar, ver DEPLOY_OK
# y encontrar que el sitio seguia sirviendo Lora.
#
# Un despliegue que no puede fallar tampoco puede avisar. Ahora:
#
#   1. Le pregunta al SITIO cual es su tema activo, en vez de suponerlo.
#   2. Exige que las carpetas locales se llamen igual que las activas, y si no,
#      se detiene diciendo los dos nombres. No adivina, no renombra, no sube.
#   3. Despues de subir, vuelve a pedir cada archivo POR HTTP —por la misma
#      direccion que usa el navegador— y compara los bytes con los locales.
#      Recien ahi dice DEPLOY_OK.
#
# El paso 3 es el que importa: verificar contra el FTP solo prueba que el
# archivo viajo; verificar contra la web prueba que llego a donde se lee.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envFile = Join-Path $repoRoot '.env.local'
$expectedPluginRoot = '/wp-content/plugins/'
$expectedThemeRoot = '/wp-content/themes/'
$allowedExtensions = @('.css', '.html', '.json', '.php')

# Las carpetas del repositorio. Cual es padre y cual es hijo NO se declara aca:
# se lee de la cabecera Template de cada style.css, que es donde WordPress
# tambien lo lee. Un dato escrito en dos partes se contradice tarde o temprano.
$localThemeFolders = @('contope-canvas', 'contope-santa-luisa')

function Read-DotEnv([string]$path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "No existe el archivo local de configuracion: $path"
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $path) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) { continue }
        $parts = $trimmed.Split('=', 2)
        if ($parts.Count -eq 2) { $values[$parts[0].Trim()] = $parts[1] }
    }
    # El proyecto cambio de nombre y las variables pasaron de OCD_ a COD_. Un
    # archivo de configuracion escrito antes del cambio sigue sirviendo: se le
    # agrega el nombre nuevo sin tocar el viejo ni el archivo en disco. Si
    # alguien ya escribio el nombre nuevo, ese manda.

    foreach ($clave in @($values.Keys)) {
        if ($clave.StartsWith('OCD_')) {
            $equivalente = 'COD_' + $clave.Substring(4)
            if (-not $values.ContainsKey($equivalente)) { $values[$equivalente] = $values[$clave] }
        }
    }

    return $values
}

function New-FtpRequest([string]$uri, [string]$method, [hashtable]$config) {
    $request = [System.Net.FtpWebRequest]::Create([Uri]::new($uri))
    $request.Method = $method
    $request.Credentials = [System.Net.NetworkCredential]::new(
        $config['COD_FTP_USERNAME'],
        $config['COD_FTP_PASSWORD']
    )
    $request.EnableSsl = $config['COD_FTP_TLS'].Trim().ToLowerInvariant() -eq 'true'
    $request.UsePassive = $config['COD_FTP_PASSIVE'].Trim().ToLowerInvariant() -ne 'false'
    $request.UseBinary = $true
    $request.KeepAlive = $false
    $request.Timeout = 30000
    return $request
}

function Remote-Uri([hashtable]$config, [string]$path) {
    $hostName = $config['COD_FTP_HOST'].Trim() -replace '^ftps?://', '' -replace '/.*$', ''
    $port = if ($config['COD_FTP_PORT'] -match '^\d+$') { [int]$config['COD_FTP_PORT'] } else { 21 }
    $normalized = '/' + $path.Trim().TrimStart('/')
    return 'ftp://{0}:{1}{2}' -f $hostName, $port, $normalized
}

function Ensure-RemoteDirectory([hashtable]$config, [string]$path) {
    $request = New-FtpRequest (Remote-Uri $config $path) ([System.Net.WebRequestMethods+Ftp]::MakeDirectory) $config
    try {
        $response = $request.GetResponse()
        $response.Dispose()
    } catch [System.Net.WebException] {
        $response = $_.Exception.Response
        if ($null -eq $response -or [int]$response.StatusCode -ne 550) { throw }
        $response.Dispose()
    }
}

function Upload-File([hashtable]$config, [string]$localPath, [string]$remotePath) {
    $bytes = [System.IO.File]::ReadAllBytes($localPath)
    $request = New-FtpRequest (Remote-Uri $config $remotePath) ([System.Net.WebRequestMethods+Ftp]::UploadFile) $config
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    $response = $request.GetResponse()
    try { return $bytes.Length } finally { $response.Dispose() }
}

function Remote-FileSize([hashtable]$config, [string]$remotePath) {
    $request = New-FtpRequest (Remote-Uri $config $remotePath) ([System.Net.WebRequestMethods+Ftp]::GetFileSize) $config
    $response = $request.GetResponse()
    try { return $response.ContentLength } finally { $response.Dispose() }
}

function Get-ThemeHeader([string]$styleCssPath, [string]$field) {
    foreach ($line in Get-Content -LiteralPath $styleCssPath -TotalCount 30) {
        if ($line -match ('^\s*' + [regex]::Escape($field) + '\s*:\s*(.+?)\s*$')) {
            return $Matches[1]
        }
    }
    return ''
}

function Get-Sha256([byte[]]$bytes) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return (-join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })) }
    finally { $sha.Dispose() }
}

function Download-Bytes([string]$url) {
    $client = New-Object System.Net.WebClient
    try { return $client.DownloadData($url) } finally { $client.Dispose() }
}

# --- Configuracion -----------------------------------------------------------

$config = Read-DotEnv $envFile
$required = @('COD_FTP_HOST', 'COD_FTP_USERNAME', 'COD_FTP_PASSWORD', 'COD_FTP_REMOTE_PATH',
              'COD_WP_URL', 'COD_WP_USERNAME', 'COD_WP_APPLICATION_PASSWORD')
$missing = @($required | Where-Object {
    -not $config.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($config[$_])
})
if ($missing.Count -gt 0) { throw "Faltan variables locales: $($missing -join ', ')" }

$configuredRoot = '/' + $config['COD_FTP_REMOTE_PATH'].Trim().Trim('/') + '/'
if ($configuredRoot -notin @($expectedPluginRoot, $expectedThemeRoot)) {
    throw "Ruta base rechazada. Se esperaba exactamente $expectedPluginRoot o $expectedThemeRoot"
}

$siteUrl = $config['COD_WP_URL'].Trim().TrimEnd('/')
if ($siteUrl -notmatch '^https://[^/]+$') {
    throw 'COD_WP_URL debe ser el origen HTTPS del sitio, sin ruta adicional.'
}

# --- 1. Que tema tiene activo el sitio --------------------------------------

$pair = $config['COD_WP_USERNAME'].Trim() + ':' + ($config['COD_WP_APPLICATION_PASSWORD'] -replace '\s', '')
$basic = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$activeResponse = Invoke-RestMethod -UseBasicParsing -TimeoutSec 30 `
    -Uri ($siteUrl + '/wp-json/wp/v2/themes?status=active') `
    -Headers @{ Authorization = $basic }
$active = @($activeResponse)[0]
if ($null -eq $active -or [string]::IsNullOrWhiteSpace($active.stylesheet)) {
    throw 'El sitio no informo un tema activo. Sin ese dato no se despliega: seria volver a adivinar la carpeta.'
}
$activeChild = [string]$active.stylesheet
$activeParent = [string]$active.template

Write-Output "Sitio: $siteUrl"
Write-Output "Tema activo segun el sitio: $activeChild sobre $activeParent"

# --- 2. Los temas locales, y si sus nombres calzan con los activos ----------

$themes = @()
foreach ($folder in $localThemeFolders) {
    $themeRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $folder))
    if (-not (Test-Path -LiteralPath $themeRoot -PathType Container)) {
        throw "No existe el tema local esperado: $folder"
    }
    $styleCss = Join-Path $themeRoot 'style.css'
    if (-not (Test-Path -LiteralPath $styleCss -PathType Leaf)) {
        throw "El tema $folder no tiene style.css: no es un tema."
    }
    $themes += [PSCustomObject]@{
        Slug     = $folder
        Root     = $themeRoot
        Template = Get-ThemeHeader $styleCss 'Template'
        Version  = Get-ThemeHeader $styleCss 'Version'
    }
}

$hijos = @($themes | Where-Object { $_.Template -ne '' })
$padres = @($themes | Where-Object { $_.Template -eq '' })
if ($hijos.Count -ne 1 -or $padres.Count -ne 1) {
    throw "Se esperaba exactamente un tema hijo (con cabecera Template) y uno padre. Hay $($hijos.Count) y $($padres.Count)."
}
$localChild = $hijos[0]
$localParent = $padres[0]

Write-Output "Tema local: $($localChild.Slug) $($localChild.Version) sobre $($localParent.Slug)"

$desalineado = @()
if ($localChild.Slug -ne $activeChild) {
    $desalineado += "  hijo:  el sitio usa '$activeChild' y el repositorio trae '$($localChild.Slug)'"
}
if ($localParent.Slug -ne $activeParent) {
    $desalineado += "  padre: el sitio usa '$activeParent' y el repositorio trae '$($localParent.Slug)'"
}
if ($localChild.Template -ne $localParent.Slug) {
    $desalineado += "  el hijo declara Template: $($localChild.Template), que no es la carpeta del padre local"
}
if ($desalineado.Count -gt 0) {
    throw (
        "El repositorio y el sitio no llaman igual al tema, asi que subir seria escribir en una carpeta que nadie lee:`n" +
        ($desalineado -join "`n") +
        "`n`nResolver una de dos maneras, nunca a ciegas:`n" +
        "  a) activar en el sitio el tema del repositorio: scripts/activate-santa-theme-once.ps1 -Apply`n" +
        "  b) renombrar las carpetas del repositorio para que coincidan con las activas`n" +
        "Este script no elige por su cuenta: el nombre del tema activo es una decision del sitio."
    )
}

# --- 3. Que archivos se van a subir -----------------------------------------

$plan = @()
foreach ($theme in $themes) {
    $themeRootPrefix = $theme.Root.TrimEnd('\') + '\'
    $items = @(Get-ChildItem -LiteralPath $theme.Root -Recurse -Force)
    $reparse = @($items | Where-Object {
        ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
    })
    if ($reparse.Count -gt 0) {
        throw "El tema contiene un enlace o reparse point no permitido: $($reparse[0].FullName)"
    }

    $files = @($items | Where-Object { -not $_.PSIsContainer } | Sort-Object FullName)
    if ($files.Count -eq 0) { throw "El tema $($theme.Slug) no contiene archivos." }

    $unexpected = @($files | Where-Object { $_.Extension.ToLowerInvariant() -notin $allowedExtensions })
    if ($unexpected.Count -gt 0) {
        throw "Extension no permitida en $($theme.Slug): $($unexpected[0].Name)"
    }

    foreach ($file in $files) {
        if (-not $file.FullName.StartsWith($themeRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Ruta local fuera del tema: $($file.FullName)"
        }
        $relative = $file.FullName.Substring($themeRootPrefix.Length).Replace('\', '/')
        $plan += [PSCustomObject]@{
            Slug = $theme.Slug
            LocalPath = $file.FullName
            RelativePath = $relative
            Length = $file.Length
        }
    }
}

Write-Output "Modo: $(if ($Apply) { 'APLICAR' } else { 'SIMULACION' })"
Write-Output "Destino limitado: $expectedThemeRoot"
foreach ($item in $plan) {
    Write-Output ("{0}/{1} ({2} bytes)" -f $item.Slug, $item.RelativePath, $item.Length)
}

if (-not $Apply) {
    Write-Output "SIMULACION_OK: $($plan.Count) archivos, destino confirmado contra el tema activo"
    exit 0
}

# --- 4. Subir ----------------------------------------------------------------

Ensure-RemoteDirectory $config $expectedThemeRoot.TrimEnd('/')
foreach ($theme in $themes) {
    $remoteThemeRoot = "$expectedThemeRoot$($theme.Slug)"
    Ensure-RemoteDirectory $config $remoteThemeRoot

    $directories = @($plan | Where-Object { $_.Slug -eq $theme.Slug } | ForEach-Object {
        $directory = [System.IO.Path]::GetDirectoryName($_.RelativePath).Replace('\', '/')
        if (-not [string]::IsNullOrWhiteSpace($directory)) { $directory }
    } | Sort-Object -Unique)

    foreach ($directory in $directories) {
        $current = $remoteThemeRoot
        foreach ($segment in $directory.Split('/')) {
            $current = "$current/$segment"
            Ensure-RemoteDirectory $config $current
        }
    }
}

foreach ($item in $plan) {
    $remotePath = "$expectedThemeRoot$($item.Slug)/$($item.RelativePath)"
    $localSize = Upload-File $config $item.LocalPath $remotePath
    $remoteSize = Remote-FileSize $config $remotePath
    if ($remoteSize -ne $localSize) {
        throw "Verificacion de tamano fallida para $($item.Slug)/$($item.RelativePath) ($localSize local, $remoteSize remoto)."
    }
}

# --- 5. Comprobar por la web, que es por donde el sitio lee ------------------
#
# Los .php no se comparan: el servidor los ejecuta y devuelve su salida, no su
# texto. Para esos queda la verificacion de tamano por FTP de mas arriba.

$marca = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$verificados = 0
$noComparables = 0
foreach ($item in $plan) {
    if ([System.IO.Path]::GetExtension($item.RelativePath).ToLowerInvariant() -eq '.php') {
        $noComparables++
        continue
    }
    $url = "$siteUrl/wp-content/themes/$($item.Slug)/$($item.RelativePath)?v=$marca"
    $remoteBytes = Download-Bytes $url
    $localBytes = [System.IO.File]::ReadAllBytes($item.LocalPath)
    if ((Get-Sha256 $remoteBytes) -ne (Get-Sha256 $localBytes)) {
        throw (
            "El sitio no devuelve lo que se acaba de subir: $($item.Slug)/$($item.RelativePath)`n" +
            "  local $($localBytes.Length) bytes, servido $($remoteBytes.Length) bytes`n" +
            "  $url"
        )
    }
    $verificados++
}

Write-Output "DEPLOY_OK: $($plan.Count) archivos subidos"
Write-Output "WEB_OK: $verificados comprobados por HTTP contra el tema activo ($noComparables .php no comparables)"
