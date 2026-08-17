# ====================================================================
# Athena Chrome Bridge — empacota a extensão para o Chrome Web Store
# Gera dist/athena-chrome-bridge-v<versao>.zip com o manifest.json
# na RAIZ do pacote (requisito da loja).
#
# Uso (PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts/empacotar-extension.ps1
# ====================================================================
$ErrorActionPreference = 'Stop'

$root  = Split-Path -Parent $PSScriptRoot
$ext   = Join-Path $root 'extension'
$dist  = Join-Path $root 'dist'

# 1) Lê e valida o manifest.json
$manifestPath = Join-Path $ext 'manifest.json'
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
Write-Host "manifest.json OK (versão $version)" -ForegroundColor Green

# 2) Confere arquivos essenciais
foreach ($f in @('manifest.json','background.js','content.js','popup.html','popup.js','options.html','options.js')) {
    if (-not (Test-Path (Join-Path $ext $f))) { throw "Arquivo obrigatório ausente: $f" }
}
foreach ($size in 16,32,48,128) {
    if (-not (Test-Path (Join-Path $ext "icons\icon$size.png"))) { throw "Ícone ausente: icons\icon$size.png" }
}
Write-Host 'Arquivos essenciais presentes.' -ForegroundColor Green

# 3) Gera o zip com o conteúdo de extension/ na raiz
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$zipName = "athena-chrome-bridge-v$version.zip"
$zipPath = Join-Path $dist $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Compress-Archive -Path (Join-Path $ext '*') -DestinationPath $zipPath -CompressionLevel Optimal

# 4) Valida: manifest.json na raiz do zip
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$hasManifest = $zip.Entries | Where-Object { $_.FullName -eq 'manifest.json' }
$count = $zip.Entries.Count
$zip.Dispose()

if (-not $hasManifest) { throw 'manifest.json não está na raiz do zip!' }

Write-Host ""
Write-Host "✅ Pacote gerado: $zipPath" -ForegroundColor Green
Write-Host "   Arquivos no zip: $count (manifest.json na raiz OK)"
Write-Host "   Pronto para upload em https://chrome.google.com/webstore/devconsole" -ForegroundColor Cyan
