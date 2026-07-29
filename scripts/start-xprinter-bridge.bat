@echo off
cd /d "%~dp0.."

REM USB XPrinter via Windows printer name (Settings > Printers)
if "%XPRINTER_MODE%"=="" set XPRINTER_MODE=winspool
if "%XPRINTER_NAME%"=="" set XPRINTER_NAME=Xprinter

echo Starting ONE SHOT XPrinter bridge...
echo Mode=%XPRINTER_MODE% Printer=%XPRINTER_NAME%
echo Open http://127.0.0.1:17809/health to verify
npm run printer:bridge
