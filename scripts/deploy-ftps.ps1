param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pluginRoot = Join-Path $repoRoot 'open-codesign-publisher'
$pluginRootPrefix = $pluginRoot.TrimEnd('\') + '\'
$envFile = Join-Path $repoRoot '.env.local'
$expectedRemoteRoot = '/wp-content/plugins/'
$pluginSlug = 'open-codesign-publisher'

function Read-DotEnv([string]$path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "No existe el archivo local de configuración: $path"
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

$remoteRoot = '/' + $config['OCD_FTP_REMOTE_PATH'].Trim().Trim('/') + '/'
if ($remoteRoot -ne $expectedRemoteRoot) {
    throw "Ruta remota rechazada: $remoteRoot. Se esperaba exactamente $expectedRemoteRoot"
}
if (-not (Test-Path -LiteralPath $pluginRoot -PathType Container)) {
    throw "No existe el plugin local: $pluginRoot"
}

$files = @(Get-ChildItem -LiteralPath $pluginRoot -Recurse -File | Sort-Object FullName)
if ($files.Count -eq 0) { throw 'El plugin local no contiene archivos.' }
$allowedRuntimePath = '^(open-codesign-publisher\.php|includes/[^/]+\.php|templates/[^/]+\.php|assets/(css|js)/[^/]+\.(css|js)|assets/vendor/grapesjs/(grapes\.min\.(css|js)|LICENSE|README\.md))$'
$unexpected = @($files | Where-Object {
    $relative = $_.FullName.Substring($pluginRootPrefix.Length).Replace('\', '/')
    $relative -notmatch $allowedRuntimePath
})
if ($unexpected.Count -gt 0) {
    throw "Archivo fuera de la lista segura de despliegue: $($unexpected[0].FullName)"
}

Write-Output "Modo: $(if ($Apply) { 'APLICAR' } else { 'SIMULACIÓN' })"
Write-Output "Destino limitado: $expectedRemoteRoot$pluginSlug/"
foreach ($file in $files) {
    $relative = $file.FullName.Substring($pluginRootPrefix.Length).Replace('\', '/')
    Write-Output ("{0} ({1} bytes)" -f $relative, $file.Length)
}

if (-not $Apply) {
    Write-Output 'SIMULACIÓN_OK'
    exit 0
}

$remotePluginRoot = "$expectedRemoteRoot$pluginSlug"
Ensure-RemoteDirectory $config $remotePluginRoot
$directorySet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($file in $files) {
    if ($file.DirectoryName -eq $pluginRoot) { continue }
    $relativeDirectory = $file.DirectoryName.Substring($pluginRootPrefix.Length).Replace('\', '/')
    $current = ''
    foreach ($segment in $relativeDirectory.Split('/')) {
        $current = if ($current.Length -eq 0) { $segment } else { "$current/$segment" }
        [void]$directorySet.Add($current)
    }
}
$directories = @($directorySet | Sort-Object { ($_ -split '/').Count }, { $_ })
foreach ($directory in $directories) {
    Ensure-RemoteDirectory $config "$remotePluginRoot/$directory"
}

foreach ($file in $files) {
    $relative = $file.FullName.Substring($pluginRootPrefix.Length).Replace('\', '/')
    $remotePath = "$remotePluginRoot/$relative"
    $localSize = Upload-File $config $file.FullName $remotePath
    $remoteSize = Remote-FileSize $config $remotePath
    if ($remoteSize -ne $localSize) {
        throw "Verificación de tamaño fallida para $relative ($localSize local, $remoteSize remoto)."
    }
}

Write-Output "DEPLOY_OK: $($files.Count) archivos verificados"
