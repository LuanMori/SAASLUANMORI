@echo off
rem teste-local.bat - de dois cliques para subir o sistema no Windows.
rem Repassa os parametros para o teste-local.ps1 (ex.: teste-local.bat -Parar).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0teste-local.ps1" %*
pause
