@echo off
title ONE SHOT Printer Bridge
cd /d "%~dp0"

REM No Node.js needed — PowerShell only
if "%XPRINTER_NAME%"=="" set XPRINTER_NAME=POS-58
if "%XPRINTER_BRIDGE_PORT%"=="" set XPRINTER_BRIDGE_PORT=17809

echo.
echo  ONE SHOT Printer Bridge (no Node required)
echo  Printer: %XPRINTER_NAME%
echo  Health:  http://127.0.0.1:%XPRINTER_BRIDGE_PORT%/health
echo  Keep this window OPEN while using POS.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0xprinter-bridge.ps1" -PrinterName "%XPRINTER_NAME%" -Port %XPRINTER_BRIDGE_PORT%

echo.
echo Bridge stopped. Press any key to close.
pause >nul
