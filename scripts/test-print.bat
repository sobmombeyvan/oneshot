@echo off
setlocal
cd /d "%~dp0"

rem Prints one sample ticket and opens the drawer, to check margins and name.
if "%XPRINTER_NAME%"=="" set XPRINTER_NAME=POS-58
if "%XPRINTER_LEFT_PAD%"=="" set XPRINTER_LEFT_PAD=1

echo.
echo Test print on: %XPRINTER_NAME%
echo Left margin  : %XPRINTER_LEFT_PAD% characters
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0xprinter-bridge.ps1" -PrinterName "%XPRINTER_NAME%" -LeftPad %XPRINTER_LEFT_PAD% -SelfTest
