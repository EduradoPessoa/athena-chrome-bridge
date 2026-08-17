# ====================================================================
# Athena Chrome Bridge — instala o companion (Camada 2)
# Registra o native messaging host (com.phoenyx.athena) + auto-início
# do daemon no logon (HKCU Run) e copia o host para %LOCALAPPDATA%.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File native/install.ps1 -ExtensionId <ID>
# (ID = o ID da extensão em chrome://extensions, ex.: "abcdefghijklmnop")
# ====================================================================
param(
  [Parameter(Mandatory = $true)][string]$ExtensionId,
  [string]$NodePath = ''
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $env:LOCALAPPDATA 'AthenaWake'
$hostDir = Join-Path $appDir 'host'
$nativeName = 'com.phoenyx.athena'

# 1) Node
if (-not $NodePath) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { throw 'Node.js não encontrado. Informe -NodePath. (Instale em https://nodejs.org)' }
  $NodePath = $cmd.Source
}

# 2) Copia o host para %LOCALAPPDATA%\AthenaWake\host
New-Item -ItemType Directory -Path $hostDir -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'athena-wake.js') $hostDir -Force

# 3) Shim .cmd (o Chrome spawna esse caminho, sem argumentos)
$shim = Join-Path $hostDir 'athena-wake.cmd'
@"
@echo off
"$NodePath" "%~dp0athena-wake.js" %*
"@ | Set-Content -Path $shim -Encoding ASCII

# 4) config.json com o caminho do Chrome
$chromePath = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction SilentlyContinue).'(default)'
if (-not $chromePath) { $chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
@{ chromePath = $chromePath } | ConvertTo-Json | Set-Content (Join-Path $appDir 'config.json') -Encoding UTF8

# 5) Manifest do native messaging host (com caminhos absolutos)
$hostManifest = Join-Path $appDir 'manifest.json'
@{
  name = $nativeName
  description = 'Athena Chrome Bridge — agendador com Chrome fechado (abre o Chrome na hora devida)'
  path = $shim
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json | Set-Content $hostManifest -Encoding UTF8

# 6) Registro do native messaging host (usuário)
$reg = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$nativeName"
New-Item -Path $reg -Force | Out-Null
Set-ItemProperty -Path $reg -Name '(default)' -Value $hostManifest

# 7) Auto-início do daemon (janela oculta via wscript)
$vbs = Join-Path $appDir 'daemon.vbs'
$nodeArg = $NodePath.Replace('"', '""')
$jsArg = (Join-Path $hostDir 'athena-wake.js').Replace('"', '""')
$vbsContent = 'CreateObject("Wscript.Shell").Run """' + $nodeArg + '"" ""' + $jsArg + '"" --daemon", 0, False'
Set-Content -Path $vbs -Value $vbsContent -Encoding ASCII
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'AthenaWake' -Value "wscript.exe `"$vbs`""

Write-Host ''
Write-Host "✅ Companion instalado" -ForegroundColor Green
Write-Host "   Host:        $shim"
Write-Host "   Manifest:    $hostManifest"
Write-Host "   Registro:    $reg"
Write-Host "   Auto-início: AthenaWake (logon)"
Write-Host ''
Write-Host 'Recarregue a extensão em chrome://extensions e abra ⏰ Agendamentos para ver "Companion: conectado".' -ForegroundColor Cyan
