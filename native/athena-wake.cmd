@echo off
rem Athena Chrome Bridge — shim do native host (uso manual em desenvolvimento)
rem O install.ps1 gera uma cópia com o caminho ABSOLUTO do node em %LOCALAPPDATA%.
node "%~dp0athena-wake.js" %*
