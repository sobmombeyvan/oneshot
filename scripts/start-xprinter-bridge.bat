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
echo ONE SHOT Printer Bridge - starting (no Node.js, no administrator)
echo.

:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0xprinter-bridge.ps1" -PrinterName "%XPRINTER_NAME%" -Port %XPRINTER_BRIDGE_PORT% -LeftPad %XPRINTER_LEFT_PAD%
if errorlevel 1 goto failed

rem The bridge should never exit on its own. If it does, restart it so the
rem cashier is never left without a printer.
echo.
echo Bridge stopped unexpectedly. Restarting in 5 seconds...
echo Close this window to stop it for good.
ping -n 6 127.0.0.1 >nul
goto run

:failed
echo.
echo The bridge could not start. See the message above.
echo Details are also saved in: bridge-log.txt
echo.
