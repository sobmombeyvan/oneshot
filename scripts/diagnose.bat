@echo off
setlocal
cd /d "%~dp0"

echo.
echo Collecting information about this PC...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose.ps1"
