# Copia los skills de este repo a la carpeta donde el asistente los carga.
#
# POR QUÉ EXISTE: la fuente de verdad es este repo, para que el skill viaje con
# el proyecto y lo pueda usar cualquier asistente. Pero cada asistente los lee
# de su propia carpeta, y crear un enlace simbólico en Windows pide permisos de
# administrador. Así que se copia — y este script existe para que volver a
# sincronizar sea un comando y no un acto de memoria.
#
# Uso:  .\skills\instalar-skills.ps1            (Claude, por defecto)
#       .\skills\instalar-skills.ps1 -Destino "$env:USERPROFILE\.codex\skills"

param(
    [string]$Destino = "$env:USERPROFILE\.claude\skills"
)

$ErrorActionPreference = 'Stop'
$origen = $PSScriptRoot

if (-not (Test-Path $Destino)) {
    New-Item -ItemType Directory -Path $Destino -Force | Out-Null
}

$copiados = 0
foreach ($carpeta in Get-ChildItem -Path $origen -Directory) {
    $archivo = Join-Path $carpeta.FullName 'SKILL.md'
    if (-not (Test-Path $archivo)) { continue }

    $destinoCarpeta = Join-Path $Destino $carpeta.Name
    if (-not (Test-Path $destinoCarpeta)) {
        New-Item -ItemType Directory -Path $destinoCarpeta -Force | Out-Null
    }
    Copy-Item -Path (Join-Path $carpeta.FullName '*') -Destination $destinoCarpeta -Recurse -Force
    Write-Output "  $($carpeta.Name)  ->  $destinoCarpeta"
    $copiados += 1
}

if ($copiados -eq 0) {
    Write-Output 'No hay skills que copiar.'
} else {
    Write-Output ''
    Write-Output "$copiados skill(s) instalado(s). La fuente sigue siendo este repo:"
    Write-Output "  $origen"
    Write-Output 'Si editas el skill, edítalo ahí y vuelve a correr este script.'
}
