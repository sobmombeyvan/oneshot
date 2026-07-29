@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ---- Settings you can change ----
rem XPRINTER_NAME     = exact printer name from Devices and Printers
rem XPRINTER_LEFT_PAD = left margin of the ticket, in characters (0-8)
if "%XPRINTER_NAME%"=="" set XPRINTER_NAME=POS-58
if "%XPRINTER_BRIDGE_PORT%"=="" set XPRINTER_BRIDGE_PORT=17809
if "%XPRINTER_LEFT_PAD%"=="" set XPRINTER_LEFT_PAD=1

set STATUSFILE=%~dp0bridge-status.txt
set RETRIES=0

echo.
echo ONE SHOT Printer Bridge - starting (no Node.js, no administrator)
echo Printer : %XPRINTER_NAME%
echo.

:run
if exist "%STATUSFILE%" del /q "%STATUSFILE%"
set STATUS=NONE

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0xprinter-bridge.ps1" -PrinterName "%XPRINTER_NAME%" -Port %XPRINTER_BRIDGE_PORT% -LeftPad %XPRINTER_LEFT_PAD%

rem PowerShell 2.0 on Windows 7 always reports exit code 0, even after a
rem crash, so the script reports what happened through this file instead.
if exist "%STATUSFILE%" set /p STATUS=<"%STATUSFILE%"

if "%STATUS%"=="ALREADY_RUNNING" goto quiet
if "%STATUS%"=="PORT_BUSY" goto stop
if "%STATUS%"=="ERROR" goto stop
if "%STATUS%"=="NONE" goto nostart

rem Status RUNNING means it really was serving, so a restart is safe.
set /a RETRIES+=1
if %RETRIES% GEQ 5 goto toomany
echo.
echo Bridge stopped. Restarting in 5 seconds... (attempt %RETRIES% of 5)
echo Close this window to stop it for good.
ping -n 6 127.0.0.1 >nul
goto run

:nostart
echo.
echo ==============================================
echo  THE BRIDGE DID NOT START
echo ==============================================
echo.
echo PowerShell closed before the bridge was ready and left no message.
echo.
echo Run diagnose.bat and send the file report.txt to the developer.
echo.
goto end

:toomany
echo.
echo The bridge keeps stopping. Not restarting again.
echo Run diagnose.bat and send report.txt to the developer.
echo.
goto end

:stop
echo.
echo See the message above. Details are in bridge-log.txt
echo.
goto end

:quiet
rem The message was already shown by the script.

:end
