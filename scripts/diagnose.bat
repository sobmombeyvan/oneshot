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

call :both "--- .NET compilers (csc.exe) ---"
rem csc.exe is what Add-Type uses, so its presence is what actually matters
set NETDIR=%WINDIR%\Microsoft.NET\Framework
if exist "%NETDIR%\v2.0.50727\csc.exe" (call :both "v2.0.50727 : yes") else (call :both "v2.0.50727 : NO")
if exist "%NETDIR%\v3.5\csc.exe" (call :both "v3.5       : yes") else (call :both "v3.5       : NO")
if exist "%NETDIR%\v4.0.30319\csc.exe" (call :both "v4.0.30319 : yes") else (call :both "v4.0.30319 : NO")
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
set PSCFG=%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe.config
if exist "%PSCFG%" (
  call :both "config file : PRESENT - can break .NET sockets on old .NET"
  call :both "config content follows in the report"
  rem Typed straight into the file: the XML contains angle brackets, which
  rem echo would treat as redirection.
  type "%PSCFG%" >> "%REPORT%" 2>&1
) else (
  call :both "config file : absent (good)"
)
call :both ""

call :both "--- PowerShell answers ---"
powershell -NoProfile -Command "Write-Output ('PSVersion : ' + $PSVersionTable.PSVersion.ToString())" >> "%REPORT%" 2>&1
powershell -NoProfile -Command "Write-Output ('CLR       : ' + [System.Environment]::Version.ToString())" >> "%REPORT%" 2>&1
powershell -NoProfile -Command "try { $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0); $l.Start(); $l.Stop(); Write-Output '.NET socket: OK' } catch { Write-Output ('.NET socket: FAILED -> ' + $_.Exception.Message) }" >> "%REPORT%" 2>&1
rem Add-Type must work: it is how the printing and Winsock code is compiled
powershell -NoProfile -Command "try { Add-Type -TypeDefinition 'public class Probe { public static int Go() { return 7; } }' -Language CSharp; Write-Output ('Add-Type  : OK (' + [Probe]::Go() + ')') } catch { Write-Output ('Add-Type  : FAILED -> ' + $_.Exception.Message) }" >> "%REPORT%" 2>&1
rem Winsock is the fallback used when .NET sockets are unavailable
powershell -NoProfile -Command "try { Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class WS{[DllImport(\"ws2_32.dll\")]static extern int WSAStartup(ushort v,byte[] d);[DllImport(\"ws2_32.dll\")]static extern IntPtr socket(int a,int t,int p);[DllImport(\"ws2_32.dll\")]static extern int closesocket(IntPtr s);public static string Go(){byte[] d=new byte[512];int r=WSAStartup((ushort)0x0202,d);if(r!=0)return \"WSAStartup \"+r;IntPtr s=socket(2,1,6);if(s.ToInt64()==-1)return \"socket failed\";closesocket(s);return \"OK\";}}' -Language CSharp; Write-Output ('Winsock   : ' + [WS]::Go()) } catch { Write-Output ('Winsock   : FAILED -> ' + $_.Exception.Message) }" >> "%REPORT%" 2>&1
call :both ""

call :both "--- Printers ---"
rem Piped through findstr on purpose: wmic writes UTF-16 when redirected to a
rem file, which comes out as "X P - 5 8". Going through a pipe converts it.
wmic printer get name 2>&1 | findstr /r /v "^$" >> "%REPORT%"
call :both ""

call :both "--- Port %XPRINTER_BRIDGE_PORT% ---"
netstat -ano | findstr ":%XPRINTER_BRIDGE_PORT%" >> "%REPORT%" 2>&1
if errorlevel 1 call :both "free"
call :both ""

call :both "--- Files in this folder ---"
for %%f in (xprinter-bridge.ps1 start-xprinter-bridge.bat stop-bridge.bat test-print.bat install-autostart.bat install-bridge-autostart.ps1) do (
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
rem No parentheses on purpose: a ) inside the text would close the block early.
rem The redirection is written BEFORE echo so a line ending in a digit is not
rem read as a stream number (echo foo2>> file).
if "%~1"=="" goto both_blank
echo %~1
>> "%REPORT%" echo %~1
goto :eof

:both_blank
echo.
>> "%REPORT%" echo.
goto :eof
