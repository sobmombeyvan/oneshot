@echo off
cd /d "%~dp0.."

REM USB XPrinter (Windows printer name as shown in Settings > Printers)
if "%XPRINTER_MODE%"=="" set XPRINTER_MODE=share
if "%XPRINTER_SHARE%"=="" set XPRINTER_SHARE=Xprinter

REM Optional LAN mode:
REM set XPRINTER_MODE=tcp
REM set XPRINTER_HOST=192.168.1.50
REM set XPRINTER_PORT=9100

echo Starting ONE SHOT XPrinter bridge...
echo Mode=%XPRINTER_MODE% Share=%XPRINTER_SHARE%
npm run printer:bridge
