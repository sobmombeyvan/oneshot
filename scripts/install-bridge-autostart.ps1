# Install ONE SHOT XPrinter bridge to start automatically at Windows logon.
# Run once in PowerShell (as Admin recommended):
#   powershell -ExecutionPolicy Bypass -File "scripts\install-bridge-autostart.ps1"

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$bat = Join-Path $PSScriptRoot "start-xprinter-bridge.bat"
$taskName = "ONE-SHOT-XPrinter-Bridge"

if (-not (Test-Path $bat)) {
  throw "Missing $bat"
}

# Remove old task if present
schtasks /Delete /TN $taskName /F 2>$null | Out-Null

$tr = "cmd.exe /c `"$bat`""
schtasks /Create /TN $taskName /TR $tr /SC ONLOGON /RL HIGHEST /F | Out-Null

Write-Host "OK: Task '$taskName' created (starts at logon)."
Write-Host "Printer share name used by default: Xprinter"
Write-Host "Change it if needed in scripts\start-xprinter-bridge.bat (XPRINTER_SHARE)."
Write-Host ""
Write-Host "Start now:"
Write-Host "  schtasks /Run /TN $taskName"
Write-Host "Health check:"
Write-Host "  http://127.0.0.1:17809/health"
