@echo off
setlocal
cd /d "%~dp0"

echo.
echo Installing the ONE SHOT printer bridge autostart...
echo (no administrator rights needed)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-bridge-autostart.ps1"
