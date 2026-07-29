@echo off
setlocal
cd /d "%~dp0"

if "%XPRINTER_NAME%"=="" set XPRINTER_NAME=POS-58
if "%XPRINTER_BRIDGE_PORT%"=="" set XPRINTER_BRIDGE_PORT=17809

echo.
echo ONE SHOT Printer Bridge (no Node.js needed)
echo Printer: %XPRINTER_NAME%
echo Health : http://127.0.0.1:%XPRINTER_BRIDGE_PORT%/health
echo Keep this window OPEN while using the POS.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0xprinter-bridge.ps1" -PrinterName "%XPRINTER_NAME%" -Port %XPRINTER_BRIDGE_PORT%

echo.
echo Bridge stopped.
echo If it failed to open the port, right-click this file and choose
echo "Run as administrator" (required once on Windows 7).
echo.
echo Press any key to close.
pause >nul
