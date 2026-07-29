# Install ONE SHOT printer bridge auto-start (NO Node.js required)
# Run once (Admin recommended):
#   powershell -ExecutionPolicy Bypass -File "scripts\install-bridge-autostart.ps1"

$ErrorActionPreference = "Stop"

$bat = Join-Path $PSScriptRoot "start-xprinter-bridge.bat"
$taskName = "ONE-SHOT-XPrinter-Bridge"

if (-not (Test-Path $bat)) {
  throw "Missing $bat"
}

schtasks /Delete /TN $taskName /F 2>$null | Out-Null

$tr = "cmd.exe /c `"$bat`""
schtasks /Create /TN $taskName /TR $tr /SC ONLOGON /RL HIGHEST /F | Out-Null

Write-Host "OK: Task '$taskName' created (starts at Windows logon)."
Write-Host "Default printer: POS-58"
Write-Host ""
Write-Host "Start now:"
Write-Host "  schtasks /Run /TN $taskName"
Write-Host "Or double-click:"
Write-Host "  $bat"
Write-Host "Health check:"
Write-Host "  http://127.0.0.1:17809/health"
