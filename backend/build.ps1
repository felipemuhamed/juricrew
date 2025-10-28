# Requires: PowerShell 5+ and Docker Desktop
# Run from an elevated PowerShell if your policy blocks scripts:
#   Set-ExecutionPolicy -Scope Process Bypass

$ErrorActionPreference = 'Stop'

# Resolve paths relative to this script's folder
$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$SOURCE_DIR = Join-Path $scriptDir '..\shared'
$DEST_DIR   = Join-Path $scriptDir 'shared'

Write-Host "Copiando a pasta shared..."

try {
    if (-not (Test-Path $SOURCE_DIR)) {
        throw "Fonte não encontrada: $SOURCE_DIR"
    }

    # Ensure a clean destination (avoids nested shared/shared)
    if (Test-Path $DEST_DIR) {
        Remove-Item -LiteralPath $DEST_DIR -Recurse -Force
    }

    Copy-Item -LiteralPath $SOURCE_DIR -Destination $DEST_DIR -Recurse -Force
    Write-Host "Pasta shared copiada com sucesso."
}
catch {
    Write-Host "Erro ao copiar a pasta shared. Detalhes: $($_.Exception.Message)"
    exit 1
}

Write-Host "Construindo a imagem Docker..."
# No 'sudo' on Windows; Docker Desktop should be running
docker build -t juricrew "$scriptDir"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao construir a imagem Docker."
    Write-Host "Removendo a pasta shared copiada..."
    try { Remove-Item -LiteralPath $DEST_DIR -Recurse -Force } catch {}
    exit 1
}
Write-Host "Imagem Docker construída com sucesso."

Write-Host "Removendo a pasta shared copiada..."
try {
    Remove-Item -LiteralPath $DEST_DIR -Recurse -Force
    Write-Host "Pasta shared removida com sucesso."
}
catch {
    Write-Host "Erro ao remover a pasta shared. Detalhes: $($_.Exception.Message)"
    exit 1
}

Write-Host "Script concluído com sucesso."
