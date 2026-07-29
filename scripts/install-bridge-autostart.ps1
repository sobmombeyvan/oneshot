# ONE SHOT - start the printer bridge automatically at every Windows logon.
# Works on Windows 7 / 8 / 10 / 11, PowerShell 2.0+, NO administrator needed.
#
# Run it by double-clicking install-autostart.bat, or:
#   powershell -ExecutionPolicy Bypass -File .\install-bridge-autostart.ps1

$ErrorActionPreference = "Continue"

# $PSScriptRoot does not exist in PowerShell 2.0
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$bat = Join-Path $scriptDir "start-xprinter-bridge.bat"

function Wait-Key {
  Write-Host ""
  Write-Host "Press any key to close."
  try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 15 }
}

if (-not (Test-Path $bat)) {
  Write-Host "ERROR: start-xprinter-bridge.bat was not found next to this script."
  Write-Host ("Looked in: " + $scriptDir)
  Wait-Key
  exit 1
}

# Per-user Startup folder: no admin rights, no Task Scheduler, no netsh.
$startup = [Environment]::GetFolderPath("Startup")
if (-not $startup -or -not (Test-Path $startup)) {
  $startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
}
if (-not (Test-Path $startup)) {
  Write-Host "ERROR: could not find the Windows Startup folder."
  Wait-Key
  exit 1
}

$launcher = Join-Path $startup "ONE-SHOT-Printer-Bridge.vbs"

# VBScript launcher: starts the bridge minimized at logon.
# A quote inside a VBScript string literal is written twice, so the path
# ends up wrapped in "..." to survive spaces in folder names.
$q = [string][char]34
$vbs = @()
$vbs += "' ONE SHOT - starts the thermal printer bridge at Windows logon."
$vbs += "' Delete this file to disable the automatic start."
$vbs += 'Set shell = CreateObject(' + $q + 'WScript.Shell' + $q + ')'
$vbs += 'shell.Run ' + $q + $q + $q + $bat + $q + $q + $q + ', 7, False'

Set-Content -Path $launcher -Value $vbs -Encoding ASCII

Write-Host ""
Write-Host "AUTOSTART INSTALLED"
Write-Host ""
Write-Host "The bridge will start by itself at every Windows logon, minimized."
Write-Host ("Launcher: " + $launcher)
Write-Host ""
Write-Host "To disable it later, simply delete that file."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1) double-click test-print.bat        -> checks printer + margins"
Write-Host "  2) double-click start-xprinter-bridge.bat -> starts the bridge now"
Write-Host "  3) open http://127.0.0.1:17809/health in Chrome"
Write-Host ""
Write-Host "Default printer name: POS-58"
Write-Host "To change it, edit start-xprinter-bridge.bat (XPRINTER_NAME)."
Wait-Key
