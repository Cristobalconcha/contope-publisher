param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envFile = Join-Path $repoRoot '.env.local'
$expectedPluginRoot = '/wp-content/plugins/'
$expectedThemeRoot = '/wp-content/themes/'
$remoteMuPluginDirectory = '/wp-content/mu-plugins'
$remoteHelperPath = "$remoteMuPluginDirectory/cod-one-time-santa-publish.php"
$routePath = '/wp-json/contope/v1/one-time-santa-publish'

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
$required = @('COD_WP_URL', 'COD_FTP_HOST', 'COD_FTP_USERNAME', 'COD_FTP_PASSWORD', 'COD_FTP_REMOTE_PATH')
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

Write-Output "Modo: $(if ($Apply) { 'APLICAR' } else { 'SIMULACION' })"
Write-Output 'Proyecto requerido: santa-luisa-de-palpi-real'
Write-Output 'Paginas requeridas: home-real, faq-real, contact-real'
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
/** Temporary, token-protected publication of the imported Santa Luisa pages. */
if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', static function (): void {
    register_rest_route('contope/v1', '/one-time-santa-publish', array(
        'methods' => WP_REST_Server::CREATABLE,
        'permission_callback' => '__return_true',
        'callback' => static function (WP_REST_Request $request) {
            $provided = $request->get_header('x-cod-one-time-token');
            if (!is_string($provided) || !hash_equals('__TOKEN__', $provided)) {
                return new WP_Error('cod_forbidden', 'Token invalido.', array('status' => 403));
            }

            $expected = array(
                'home-real' => 'santa-luisa-inicio',
                'faq-real' => 'preguntas-frecuentes',
                'contact-real' => 'contacto',
            );
            $posts = get_posts(array(
                'post_type' => 'page',
                'post_status' => array('draft', 'pending', 'private', 'publish', 'future'),
                'posts_per_page' => -1,
                'orderby' => 'ID',
                'order' => 'DESC',
                'meta_key' => '_cod_project_id',
                'meta_value' => 'santa-luisa-de-palpi-real',
            ));

            $selected = array();
            foreach ($expected as $page_key => $slug) {
                foreach ($posts as $post) {
                    if (get_post_meta($post->ID, '_cod_page_id', true) === $page_key) {
                        $selected[$page_key] = $post;
                        break;
                    }
                }
                if (!isset($selected[$page_key])) {
                    return new WP_Error('cod_page_missing', 'Falta una pagina importada requerida: ' . $page_key, array('status' => 409));
                }
            }

            $previous = array(
                'show_on_front' => get_option('show_on_front'),
                'page_on_front' => (int) get_option('page_on_front'),
            );
            $result = array();
            foreach ($expected as $page_key => $slug) {
                $post = $selected[$page_key];
                $updated = wp_update_post(array(
                    'ID' => $post->ID,
                    'post_status' => 'publish',
                    'post_name' => $slug,
                ), true);
                if (is_wp_error($updated)) {
                    return $updated;
                }
                $result[$page_key] = array(
                    'id' => (int) $updated,
                    'slug' => get_post_field('post_name', $updated),
                    'status' => get_post_status($updated),
                );
            }

            update_option('show_on_front', 'page');
            update_option('page_on_front', (int) $result['home-real']['id']);
            if (get_option('show_on_front') !== 'page' || (int) get_option('page_on_front') !== (int) $result['home-real']['id']) {
                return new WP_Error('cod_front_assignment_failed', 'WordPress no confirmo la portada esperada.', array('status' => 500));
            }

            return rest_ensure_response(array(
                'published' => $result,
                'previousFront' => $previous,
                'pageOnFront' => (int) get_option('page_on_front'),
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
        throw 'Verificacion de tamano fallida para el helper temporal.'
    }

    $response = Invoke-WebRequest -UseBasicParsing -Uri ($siteUrl + $routePath) -Method Post -Headers @{
        'X-OCD-One-Time-Token' = $token
    } -ContentType 'application/json' -Body '{}' -TimeoutSec 30
    if ([int]$response.StatusCode -ne 200) {
        throw "WordPress respondio HTTP $([int]$response.StatusCode) al publicar las paginas."
    }

    $body = $response.Content | ConvertFrom-Json
    $published = @($body.published.'home-real', $body.published.'faq-real', $body.published.'contact-real')
    if ($published.Count -ne 3 -or @($published | Where-Object { $_.status -ne 'publish' }).Count -gt 0) {
        throw 'La respuesta de WordPress no confirmo las tres paginas publicadas.'
    }
    if ([int]$body.pageOnFront -ne [int]$body.published.'home-real'.id) {
        throw 'La respuesta de WordPress no confirmo home-real como portada.'
    }

    Write-Output ("PAGES_PUBLISHED_OK: home={0}, faq={1}, contact={2}" -f `
        $body.published.'home-real'.id,
        $body.published.'faq-real'.id,
        $body.published.'contact-real'.id)
    Write-Output ("PREVIOUS_FRONT: mode={0}, page={1}" -f $body.previousFront.show_on_front, $body.previousFront.page_on_front)
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

$checks = @(
    @{ Path = '/'; Marker = 'Plano de parcelas'; Name = 'Inicio' },
    @{ Path = '/preguntas-frecuentes/'; Marker = 'Preguntas frecuentes'; Name = 'FAQ' },
    @{ Path = '/contacto/'; Marker = 'Contacto'; Name = 'Contacto' }
)
foreach ($check in $checks) {
    $separator = if ($check.Path.Contains('?')) { '&' } else { '?' }
    $verificationUri = $siteUrl + $check.Path + $separator + 'cod_verify_content=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $pageResponse = Invoke-WebRequest -UseBasicParsing -Uri $verificationUri -Method Get -TimeoutSec 30
    if ([int]$pageResponse.StatusCode -ne 200) {
        throw "$($check.Name) respondio HTTP $([int]$pageResponse.StatusCode)."
    }
    if ($pageResponse.Content -notmatch [regex]::Escape($check.Marker)) {
        throw "$($check.Name) no contiene el marcador esperado."
    }
    Write-Output "$($check.Name)_HTTP_200_MARKER_OK"
}

Write-Output 'HELPER_REMOVED_OK'
