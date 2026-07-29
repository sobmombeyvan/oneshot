@echo off
cd /d "%~dp0.."

REM USB thermal printer via Windows printer name (Settings > Printers)
if "%XPRINTER_MODE%"=="" set XPRINTER_MODE=winspool
if "%XPRINTER_NAME%"=="" set XPRINTER_NAME=POS-58

echo Starting ONE SHOT printer bridge...
echo Mode=%XPRINTER_MODE% Printer=%XPRINTER_NAME%
echo Verify: http://127.0.0.1:17809/health
npm run printer:bridge
