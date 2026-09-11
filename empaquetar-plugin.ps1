# Empaqueta el plugin para subir a WordPress.
#
# POR QUÉ EXISTE ESTE SCRIPT: `Compress-Archive` de Windows PowerShell 5.1
# escribe las rutas internas del zip con CONTRABARRA (open-codesign-publisher\assets\...).
# Windows lo abre igual, así que el zip "se ve bien" en el equipo — pero WordPress
# descomprime en Linux, donde la contrabarra es parte del nombre y no un separador
# de carpetas. Resultado: el plugin se sube, y al activarlo WordPress dice que el
# archivo no existe. Pasó de verdad con la 0.2.78 (2026-09-05).
#
# Acá se arman las entradas a mano justamente para forzar la barra normal.

param(
    [string]$Origen  = "$PSScriptRoot\open-codesign-publisher",
    [string]$Destino = "$env:USERPROFILE\wp-local\releases\open-codesign-publisher"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path $Origen)) { throw "No existe la carpeta del plugin: $Origen" }

$principal = Join-Path $Origen 'open-codesign-publisher.php'
if (-not (Test-Path $principal)) { throw "Falta el archivo principal del plugin: $principal" }

$version = (Select-String -Path $principal -Pattern '^\s*\*\s*Version:\s*(.+)$' |
            Select-Object -First 1).Matches[0].Groups[1].Value.Trim()
if (-not $version) { throw "No pude leer la version del encabezado del plugin." }

if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Path $Destino | Out-Null }
$salida = Join-Path $Destino "open-codesign-publisher-$version.zip"
if (Test-Path $salida) { Remove-Item $salida -Force }

$raiz = Split-Path $Origen -Parent
$archivos = Get-ChildItem -Path $Origen -Recurse -File |
            Where-Object { $_.FullName -notmatch '\\(node_modules|\.git)\\' }

# Ningún .php puede llevar BOM. Los tres bytes EF BB BF se imprimen al cargar el
# archivo, así que WordPress ya no puede enviar cabeceras: cualquier dirección
# que necesite redirección (p. ej. /inicio/ o ?page_id=) responde 200 con el
# cuerpo vacío. Pasó de verdad (2026-09-08): PowerShell 5.1 escribe BOM con
# `Set-Content -Encoding utf8`, y así se coló en el archivo principal.
$conBom = @()
foreach ($archivo in (Get-ChildItem -Path $Origen -Recurse -File -Filter *.php)) {
    $bytes = [System.IO.File]::ReadAllBytes($archivo.FullName)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $conBom += $archivo.FullName
    }
}
if ($conBom.Count -gt 0) {
    throw "No empaqueto: $($conBom.Count) archivo(s) PHP con BOM -> $($conBom -join ', ')"
}

$zip = [System.IO.Compression.ZipFile]::Open($salida, 'Create')
try {
    foreach ($archivo in $archivos) {
        # La ruta relativa se pasa a barra normal ANTES de escribirla: es el
        # punto entero de este script.
        $relativa = $archivo.FullName.Substring($raiz.Length).TrimStart('\')
        $entrada  = $relativa -replace '\\', '/'
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $archivo.FullName, $entrada, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $zip.Dispose()
}

# Verificación: si alguna entrada trae contrabarra, el zip no sirve y se borra,
# para que nunca salga de acá uno roto.
$zip = [System.IO.Compression.ZipFile]::OpenRead($salida)
try {
    $malas   = @($zip.Entries | Where-Object { $_.FullName -like '*\*' })
    $tieneMain = @($zip.Entries | Where-Object { $_.FullName -eq 'open-codesign-publisher/open-codesign-publisher.php' }).Count -eq 1
    $total   = $zip.Entries.Count
} finally {
    $zip.Dispose()
}

if ($malas.Count -gt 0) {
    Remove-Item $salida -Force
    throw "Zip invalido: $($malas.Count) entradas con contrabarra. Se borro."
}
if (-not $tieneMain) {
    Remove-Item $salida -Force
    throw "Zip invalido: no esta open-codesign-publisher/open-codesign-publisher.php en la raiz. Se borro."
}

$kb = [int]((Get-Item $salida).Length / 1KB)
Write-Output "ok  version $version  ·  $total archivos  ·  ${kb}KB"
Write-Output $salida
