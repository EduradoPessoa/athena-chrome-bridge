# ====================================================================
# Athena Chrome Bridge — desinstala o companion (Camada 2)
# Uso: powershell -ExecutionPolicy Bypass -File native/uninstall.ps1
# ====================================================================
$ErrorActionPreference = 'SilentlyContinue'
$nativeName = 'com.phoenyx.athena'
$appDir = Join-Path $env:LOCALAPPDATA 'AthenaWake'

Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'AthenaWake'
Remove-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$nativeName" -Recurse -Force

if (Test-Path $appDir) {
  Remove-Item -Path $appDir -Recurse -Force
}

Write-Host '✅ Companion desinstalado (registro, auto-início e arquivos removidos).' -ForegroundColor Green
