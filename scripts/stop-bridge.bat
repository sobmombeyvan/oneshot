@echo off
setlocal
cd /d "%~dp0"

rem Frees the port when a bridge is already running (for example the copy
rem started automatically at logon) so start-xprinter-bridge.bat can run.
if "%XPRINTER_BRIDGE_PORT%"=="" set XPRINTER_BRIDGE_PORT=17809

echo.
echo Stopping the ONE SHOT printer bridge on port %XPRINTER_BRIDGE_PORT%...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0xprinter-bridge.ps1" -Port %XPRINTER_BRIDGE_PORT% -Stop

echo.
echo You can now run start-xprinter-bridge.bat again.
echo.
echo Press any key to close.
pause >nul
