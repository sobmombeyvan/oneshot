@echo off
setlocal
cd /d "%~dp0"

rem ---- Settings you can change ----
rem XPRINTER_NAME  = exact printer name from Devices and Printers
rem XPRINTER_LEFT_PAD = left margin of the ticket, in characters (0-8)
if "%XPRINTER_NAME%"=="" set XPRINTER_NAME=POS-58
if "%XPRINTER_BRIDGE_PORT%"=="" set XPRINTER_BRIDGE_PORT=17809
if "%XPRINTER_LEFT_PAD%"=="" set XPRINTER_LEFT_PAD=2

echo.
echo ONE SHOT Printer Bridge (no Node.js needed)
echo Printer     : %XPRINTER_NAME%
echo Left margin : %XPRINTER_LEFT_PAD% characters
echo Health      : http://127.0.0.1:%XPRINTER_BRIDGE_PORT%/health
echo Keep this window OPEN while using the POS.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0xprinter-bridge.ps1" -PrinterName "%XPRINTER_NAME%" -Port %XPRINTER_BRIDGE_PORT% -LeftPad %XPRINTER_LEFT_PAD%
if errorlevel 1 goto failed

echo.
echo Bridge stopped.
goto end

:failed
echo.
echo The bridge could not start.
echo Right-click this file and choose "Run as administrator" (needed once).
echo.

:end
echo Press any key to close.
pause >nul
