param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envFile = Join-Path $repoRoot '.env.local'
$expectedPluginRoot = '/wp-content/plugins/'
$expectedThemeRoot = '/wp-content/themes/'
$allowedExtensions = @('.css', '.html', '.json', '.php')
$themes = @(
    @{
        Slug = 'open-codesign-canvas'
        Root = Join-Path $repoRoot 'open-codesign-canvas'
    },
    @{
        Slug = 'open-codesign-santa-luisa'
        Root = Join-Path $repoRoot 'open-codesign-santa-luisa'
    }
)

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
    return $values
}

function New-FtpRequest([string]$uri, [string]$method, [hashtable]$config) {
    $request = [System.Net.FtpWebRequest]::Create([Uri]::new($uri))
    $request.Method = $method
    $request.Credentials = [System.Net.NetworkCredential]::new(
        $config['OCD_FTP_USERNAME'],
        $config['OCD_FTP_PASSWORD']
    )
    $request.EnableSsl = $config['OCD_FTP_TLS'].Trim().ToLowerInvariant() -eq 'true'
    $request.UsePassive = $config['OCD_FTP_PASSIVE'].Trim().ToLowerInvariant() -ne 'false'
    $request.UseBinary = $true
    $request.KeepAlive = $false
    $request.Timeout = 30000
    return $request
}

function Remote-Uri([hashtable]$config, [string]$path) {
    $hostName = $config['OCD_FTP_HOST'].Trim() -replace '^ftps?://', '' -replace '/.*$', ''
    $port = if ($config['OCD_FTP_PORT'] -match '^\d+$') { [int]$config['OCD_FTP_PORT'] } else { 21 }
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

$config = Read-DotEnv $envFile
$required = @('OCD_FTP_HOST', 'OCD_FTP_USERNAME', 'OCD_FTP_PASSWORD', 'OCD_FTP_REMOTE_PATH')
$missing = @($required | Where-Object {
    -not $config.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($config[$_])
})
if ($missing.Count -gt 0) { throw "Faltan variables locales: $($missing -join ', ')" }

$configuredRoot = '/' + $config['OCD_FTP_REMOTE_PATH'].Trim().Trim('/') + '/'
if ($configuredRoot -notin @($expectedPluginRoot, $expectedThemeRoot)) {
    throw "Ruta base rechazada. Se esperaba exactamente $expectedPluginRoot o $expectedThemeRoot"
}

$plan = @()
foreach ($theme in $themes) {
    $themeRoot = [System.IO.Path]::GetFullPath($theme.Root)
    if (-not (Test-Path -LiteralPath $themeRoot -PathType Container)) {
        throw "No existe el tema local esperado: $($theme.Slug)"
    }

    $themeRootPrefix = $themeRoot.TrimEnd('\') + '\'
    $items = @(Get-ChildItem -LiteralPath $themeRoot -Recurse -Force)
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
    Write-Output "SIMULACION_OK: $($plan.Count) archivos"
    exit 0
}

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

Write-Output "DEPLOY_OK: $($plan.Count) archivos verificados"
