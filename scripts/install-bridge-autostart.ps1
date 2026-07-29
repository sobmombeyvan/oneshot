# ONE SHOT - install printer bridge on the cashier PC (NO Node.js required)
# Works on Windows 7, 8, 10, 11.
#
# Run ONCE as administrator:
#   right-click Windows PowerShell > Run as administrator
#   cd <this folder>
#   powershell -ExecutionPolicy Bypass -File .\install-bridge-autostart.ps1

$ErrorActionPreference = "Stop"

$bat = Join-Path $PSScriptRoot "start-xprinter-bridge.bat"
$taskName = "ONE-SHOT-XPrinter-Bridge"
$port = 17809
if ($env:XPRINTER_BRIDGE_PORT) { $port = [int]$env:XPRINTER_BRIDGE_PORT }
$prefix = "http://127.0.0.1:" + $port + "/"

if (-not (Test-Path $bat)) {
  throw "Missing $bat"
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "Please re-run this script as administrator." -ForegroundColor Yellow
  Write-Host "Right-click Windows PowerShell > Run as administrator, then run it again."
  exit 1
}

# 1) Allow the bridge to listen on the port without admin rights (needed on Windows 7)
Write-Host "Reserving $prefix for all users..."
& netsh http add urlacl url=$prefix user=Everyone | Out-Null
Write-Host "URL reservation done (an 'already exists' message is fine)."

# 2) Allow the port through the firewall (loopback usually needs nothing, harmless otherwise)
& netsh advfirewall firewall add rule name="ONE SHOT Printer Bridge" dir=in action=allow protocol=TCP localport=$port 2>$null | Out-Null

# 3) Start the bridge automatically at every Windows logon
& schtasks /Delete /TN $taskName /F 2>$null | Out-Null
$tr = 'cmd.exe /c "' + $bat + '"'
& schtasks /Create /TN $taskName /TR $tr /SC ONLOGON /RL HIGHEST /F | Out-Null

Write-Host ""
Write-Host "DONE." -ForegroundColor Green
Write-Host "The printer bridge will start automatically at every Windows logon."
Write-Host ""
Write-Host "Start it right now:"
Write-Host "  schtasks /Run /TN `"$taskName`""
Write-Host ""
Write-Host "Then check in the browser:"
Write-Host ("  " + $prefix + "health")
Write-Host ""
Write-Host "Default printer name: POS-58"
Write-Host "To change it, edit start-xprinter-bridge.bat (XPRINTER_NAME)."
