# ONE SHOT - install the printer bridge on the cashier PC (NO Node.js)
# Compatible with PowerShell 2.0 (Windows 7) and newer.
#
# Run ONCE as administrator:
#   Start > type: powershell
#   right-click "Windows PowerShell" > Run as administrator
#   then:
#     cd C:\ONESHOT\scripts
#     powershell -ExecutionPolicy Bypass -File .\install-bridge-autostart.ps1

$ErrorActionPreference = "Continue"

# $PSScriptRoot does not exist in PowerShell 2.0
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$bat = Join-Path $scriptDir "start-xprinter-bridge.bat"
$taskName = "ONE-SHOT-XPrinter-Bridge"

$port = 17809
if ($env:XPRINTER_BRIDGE_PORT) { $port = [int]$env:XPRINTER_BRIDGE_PORT }
$prefix = "http://127.0.0.1:" + $port + "/"

if (-not (Test-Path $bat)) {
  Write-Host "ERROR: start-xprinter-bridge.bat not found next to this script."
  Write-Host ("Looked in: " + $scriptDir)
  Write-Host "Press any key to close."
  try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 15 }
  exit 1
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "This installer must run as administrator."
  Write-Host "Right-click Windows PowerShell > Run as administrator, then run it again."
  Write-Host "Press any key to close."
  try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 15 }
  exit 1
}

Write-Host ""
Write-Host "1/3 Reserving the local port..."
# SDDL works on every Windows language (WD = Everyone).
& netsh http add urlacl url=$prefix "sddl=D:(A;;GX;;;WD)" 2>&1 | Out-Null
$me = $env:USERNAME
if ($env:USERDOMAIN) { $me = $env:USERDOMAIN + "\" + $env:USERNAME }
& netsh http add urlacl url=$prefix user=$me 2>&1 | Out-Null
Write-Host "    done (an 'already exists' message is normal)"

Write-Host "2/3 Allowing the port in the firewall..."
& netsh advfirewall firewall add rule name="ONE SHOT Printer Bridge" dir=in action=allow protocol=TCP localport=$port 2>&1 | Out-Null
Write-Host "    done"

Write-Host "3/3 Starting the bridge at every Windows logon..."
& schtasks /Delete /TN $taskName /F 2>&1 | Out-Null
$tr = 'cmd.exe /c "' + $bat + '"'
& schtasks /Create /TN $taskName /TR $tr /SC ONLOGON /RL HIGHEST /F 2>&1 | Out-Null
Write-Host "    done"

Write-Host ""
Write-Host "INSTALLATION COMPLETE"
Write-Host ""
Write-Host "Start the bridge right now:"
Write-Host ("  schtasks /Run /TN " + $taskName)
Write-Host "or double-click start-xprinter-bridge.bat"
Write-Host ""
Write-Host "Then open this address in Chrome on this PC:"
Write-Host ("  " + $prefix + "health")
Write-Host ""
Write-Host "Default printer name: POS-58"
Write-Host "To change it, edit start-xprinter-bridge.bat (XPRINTER_NAME)."
Write-Host ""
Write-Host "Press any key to close."
try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 20 }
