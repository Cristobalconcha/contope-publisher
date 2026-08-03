param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envFile = Join-Path $repoRoot '.env.local'
$expectedPluginRoot = '/wp-content/plugins/'
$expectedThemeRoot = '/wp-content/themes/'
$remoteMuPluginDirectory = '/wp-content/mu-plugins'
$remoteHelperPath = "$remoteMuPluginDirectory/ocd-one-time-theme-switch.php"
$routePath = '/wp-json/open-codesign/v1/one-time-theme-switch'
$parentSlug = 'open-codesign-canvas'
$childSlug = 'open-codesign-santa-luisa'

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

function Remote-FileSizeOrNull([hashtable]$config, [string]$remotePath) {
    $request = New-FtpRequest (Remote-Uri $config $remotePath) ([System.Net.WebRequestMethods+Ftp]::GetFileSize) $config
    try {
        $response = $request.GetResponse()
        try { return $response.ContentLength } finally { $response.Dispose() }
    } catch [System.Net.WebException] {
        $response = $_.Exception.Response
        if ($null -ne $response -and [int]$response.StatusCode -eq 550) {
            $response.Dispose()
            return $null
        }
        if ($null -ne $response) { $response.Dispose() }
        throw
    }
}

function Upload-Bytes([hashtable]$config, [byte[]]$bytes, [string]$remotePath) {
    $request = New-FtpRequest (Remote-Uri $config $remotePath) ([System.Net.WebRequestMethods+Ftp]::UploadFile) $config
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    $response = $request.GetResponse()
    $response.Dispose()
}

function Remove-RemoteFile([hashtable]$config, [string]$remotePath) {
    $request = New-FtpRequest (Remote-Uri $config $remotePath) ([System.Net.WebRequestMethods+Ftp]::DeleteFile) $config
    $response = $request.GetResponse()
    $response.Dispose()
}

$config = Read-DotEnv $envFile
$required = @('OCD_WP_URL', 'OCD_FTP_HOST', 'OCD_FTP_USERNAME', 'OCD_FTP_PASSWORD', 'OCD_FTP_REMOTE_PATH')
$missing = @($required | Where-Object {
    -not $config.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($config[$_])
})
if ($missing.Count -gt 0) { throw "Faltan variables locales: $($missing -join ', ')" }

$configuredRoot = '/' + $config['OCD_FTP_REMOTE_PATH'].Trim().Trim('/') + '/'
if ($configuredRoot -notin @($expectedPluginRoot, $expectedThemeRoot)) {
    throw "Ruta base rechazada. Se esperaba exactamente $expectedPluginRoot o $expectedThemeRoot"
}

$siteUrl = $config['OCD_WP_URL'].Trim().TrimEnd('/')
if ($siteUrl -notmatch '^https://[^/]+$') {
    throw 'OCD_WP_URL debe ser el origen HTTPS del sitio, sin ruta adicional.'
}

Write-Output "Modo: $(if ($Apply) { 'APLICAR' } else { 'SIMULACION' })"
Write-Output "Tema padre requerido: $parentSlug"
Write-Output "Tema hijo objetivo: $childSlug"
Write-Output "Helper temporal: $remoteHelperPath"

if (-not $Apply) {
    Write-Output 'SIMULACION_OK'
    exit 0
}

$existingSize = Remote-FileSizeOrNull $config $remoteHelperPath
if ($null -ne $existingSize) {
    throw "Se rechazo sobrescribir un helper remoto existente: $remoteHelperPath"
}

$tokenBytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($tokenBytes) } finally { $random.Dispose() }
$token = -join ($tokenBytes | ForEach-Object { $_.ToString('x2') })

$phpTemplate = @'
<?php
/** Temporary, token-protected theme switch. Removed immediately after use. */
if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', static function (): void {
    register_rest_route('open-codesign/v1', '/one-time-theme-switch', array(
        'methods' => WP_REST_Server::CREATABLE,
        'permission_callback' => '__return_true',
        'callback' => static function (WP_REST_Request $request) {
            $provided = $request->get_header('x-ocd-one-time-token');
            if (!is_string($provided) || !hash_equals('__TOKEN__', $provided)) {
                return new WP_Error('ocd_forbidden', 'Token invalido.', array('status' => 403));
            }

            $parent = wp_get_theme('open-codesign-canvas');
            $child = wp_get_theme('open-codesign-santa-luisa');
            if (!$parent->exists() || !$child->exists()) {
                return new WP_Error('ocd_theme_missing', 'Falta el tema padre o hijo.', array('status' => 409));
            }
            if ($child->get_template() !== 'open-codesign-canvas') {
                return new WP_Error('ocd_parent_mismatch', 'El tema hijo no declara el padre esperado.', array('status' => 409));
            }

            switch_theme('open-codesign-santa-luisa');
            $active = wp_get_theme();
            if ($active->get_stylesheet() !== 'open-codesign-santa-luisa' || $active->get_template() !== 'open-codesign-canvas') {
                return new WP_Error('ocd_switch_failed', 'WordPress no confirmo el tema esperado.', array('status' => 500));
            }

            return rest_ensure_response(array(
                'activated' => true,
                'stylesheet' => $active->get_stylesheet(),
                'template' => $active->get_template(),
            ));
        },
    ));
});
'@

$php = $phpTemplate.Replace('__TOKEN__', $token)
$bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($php)
$uploaded = $false
$removed = $false

try {
    Ensure-RemoteDirectory $config $remoteMuPluginDirectory
    Upload-Bytes $config $bytes $remoteHelperPath
    $uploaded = $true

    $remoteSize = Remote-FileSizeOrNull $config $remoteHelperPath
    if ($null -eq $remoteSize -or $remoteSize -ne $bytes.Length) {
        throw "Verificacion de tamano fallida para el helper temporal."
    }

    $response = Invoke-WebRequest -UseBasicParsing -Uri ($siteUrl + $routePath) -Method Post -Headers @{
        'X-OCD-One-Time-Token' = $token
    } -ContentType 'application/json' -Body '{}' -TimeoutSec 30
    if ([int]$response.StatusCode -ne 200) {
        throw "WordPress respondio HTTP $([int]$response.StatusCode) al activar el tema."
    }

    $body = $response.Content | ConvertFrom-Json
    if ($body.activated -ne $true -or $body.stylesheet -ne $childSlug -or $body.template -ne $parentSlug) {
        throw 'La respuesta de WordPress no confirmo la pareja padre/hijo esperada.'
    }

    Write-Output "THEME_SWITCH_OK: $($body.stylesheet) sobre $($body.template)"
} finally {
    if ($uploaded) {
        try {
            Remove-RemoteFile $config $remoteHelperPath
            $removed = $true
        } catch {
            Write-Error "No se pudo retirar el helper temporal: $remoteHelperPath"
        }
    }
}

if (-not $removed) {
    throw 'El helper temporal no fue retirado.'
}
if ($null -ne (Remote-FileSizeOrNull $config $remoteHelperPath)) {
    throw 'El helper temporal sigue presente despues de la eliminacion.'
}

$verificationUri = $siteUrl + '/?ocd_verify_theme=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$homeResponse = Invoke-WebRequest -UseBasicParsing -Uri $verificationUri -Method Get -TimeoutSec 30
if ([int]$homeResponse.StatusCode -ne 200) {
    throw "La portada respondio HTTP $([int]$homeResponse.StatusCode) despues del cambio de tema."
}
if ($homeResponse.Content -notmatch 'open-codesign-santa-luisa') {
    throw 'La portada no contiene una referencia al tema hijo activo.'
}

Write-Output 'HELPER_REMOVED_OK'
Write-Output 'HOME_HTTP_200_THEME_REFERENCE_OK'
