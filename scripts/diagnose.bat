@echo off
cd /d "%~dp0"

rem Pure batch on purpose: this must still work when PowerShell or .NET is the
rem thing that is broken. Writes the report to the Desktop AND shows it here.

set REPORT=%USERPROFILE%\Desktop\oneshot-report.txt
if not exist "%USERPROFILE%\Desktop" set REPORT=%TEMP%\oneshot-report.txt

if "%XPRINTER_BRIDGE_PORT%"=="" set XPRINTER_BRIDGE_PORT=17809

echo ONE SHOT bridge report > "%REPORT%" 2>nul
if errorlevel 1 set REPORT=%TEMP%\oneshot-report.txt
echo ONE SHOT bridge report > "%REPORT%"

call :both "Date: %DATE% %TIME%"
call :both "Folder: %~dp0"
call :both ""

call :both "--- Windows ---"
for /f "delims=" %%v in ('ver') do call :both "%%v"
call :both "Arch: %PROCESSOR_ARCHITECTURE%"
call :both ""

call :both "--- .NET Framework folders present ---"
if exist "%WINDIR%\Microsoft.NET\Framework\v2.0.50727\nul" (call :both "v2.0.50727 : yes") else (call :both "v2.0.50727 : NO")
if exist "%WINDIR%\Microsoft.NET\Framework\v3.5\nul" (call :both "v3.5       : yes") else (call :both "v3.5       : NO")
if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\nul" (call :both "v4.0.30319 : yes") else (call :both "v4.0.30319 : NO")
call :both ""

call :both "--- PowerShell ---"
where powershell >nul 2>nul
if errorlevel 1 (
  call :both "powershell.exe NOT FOUND in PATH - this is the problem"
) else (
  call :both "powershell.exe found"
)
if exist "%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe" (
  call :both "exe present : yes"
) else (
  call :both "exe present : NO"
)
if exist "%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe.config" (
  call :both "config file : PRESENT  <-- may break sockets on old .NET"
  call :both "config content:"
  for /f "delims=" %%l in ('type "%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe.config"') do call :both "   %%l"
) else (
  call :both "config file : absent (good)"
)
call :both ""

call :both "--- PowerShell answers ---"
powershell -NoProfile -Command "Write-Output ('PSVersion : ' + $PSVersionTable.PSVersion.ToString())" >> "%REPORT%" 2>&1
powershell -NoProfile -Command "Write-Output ('CLR       : ' + [System.Environment]::Version.ToString())" >> "%REPORT%" 2>&1
powershell -NoProfile -Command "try { $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0); $l.Start(); $l.Stop(); Write-Output 'Socket    : OK' } catch { Write-Output ('Socket    : FAILED -> ' + $_.Exception.Message) }" >> "%REPORT%" 2>&1
call :both ""

call :both "--- Printers (wmic) ---"
wmic printer get name >> "%REPORT%" 2>&1
call :both ""

call :both "--- Port %XPRINTER_BRIDGE_PORT% ---"
netstat -ano | findstr ":%XPRINTER_BRIDGE_PORT%" >> "%REPORT%" 2>&1
if errorlevel 1 call :both "free"
call :both ""

call :both "--- Files in this folder ---"
for %%f in (xprinter-bridge.ps1 start-xprinter-bridge.bat stop-bridge.bat test-print.bat diagnose.ps1) do (
  if exist "%~dp0%%f" (call :both "OK      %%f") else (call :both "MISSING %%f"))
call :both ""

call :both "--- bridge-status.txt ---"
if exist "%~dp0bridge-status.txt" (type "%~dp0bridge-status.txt" >> "%REPORT%") else (call :both "(none)")
call :both ""

call :both "--- bridge-log.txt (last lines) ---"
if exist "%~dp0bridge-log.txt" (type "%~dp0bridge-log.txt" >> "%REPORT%") else (call :both "(none)")

echo.
echo ==================================================
echo  REPORT SAVED TO:
echo  %REPORT%
echo ==================================================
echo.
echo Open that file and send it to the developer.
echo.
echo Opening it now...
start notepad "%REPORT%"
echo.
echo Press any key to close.
pause >nul
goto :eof

:both
echo %~1
echo %~1>> "%REPORT%"
goto :eof
