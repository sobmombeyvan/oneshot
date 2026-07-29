# ONE SHOT - collects everything needed to explain why the bridge will not run.
# Writes report.txt next to this script. Safe to run, changes nothing.
# Compatible with PowerShell 2.0 (Windows 7).

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$report = Join-Path $scriptDir "report.txt"
$lines = @()

function Add-Line {
  param([string]$Text)
  $script:lines += $Text
  Write-Host $Text
}

$port = 17809
if ($env:XPRINTER_BRIDGE_PORT) { $port = [int]$env:XPRINTER_BRIDGE_PORT }

Add-Line "ONE SHOT bridge diagnostic"
Add-Line ("Date        : " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
Add-Line ""

Add-Line "--- Windows / PowerShell ---"
try { Add-Line ("Windows     : " + (Get-WmiObject Win32_OperatingSystem).Caption) } catch { Add-Line "Windows     : unknown" }
Add-Line ("PowerShell  : " + $PSVersionTable.PSVersion.ToString())
Add-Line ("CLR         : " + [System.Environment]::Version.ToString())
Add-Line ("Pointer size: " + [IntPtr]::Size + " bytes (4 = 32-bit, 8 = 64-bit)")
Add-Line ("Config file : " + [System.AppDomain]::CurrentDomain.SetupInformation.ConfigurationFile)

$cfg = [System.AppDomain]::CurrentDomain.SetupInformation.ConfigurationFile
if ($cfg -and (Test-Path $cfg)) {
  Add-Line "Config content:"
  foreach ($l in (Get-Content $cfg)) { Add-Line ("   " + $l) }
} else {
  Add-Line "Config file does not exist (this is normal and good)."
}
Add-Line ""

Add-Line "--- Can .NET create a socket? ---"
try {
  $probe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  $probe.Start()
  $probe.Stop()
  Add-Line "TcpListener : OK"
} catch {
  Add-Line ("TcpListener : FAILED -> " + $_.Exception.Message)
  if ($_.Exception.InnerException) {
    Add-Line ("   inner    : " + $_.Exception.InnerException.Message)
  }
  Add-Line "   This is the reason the bridge cannot start."
}
Add-Line ""

Add-Line "--- Can PowerShell compile C#? ---"
try {
  Add-Type -TypeDefinition "public class OneShotProbe { public static int Ping() { return 1; } }" -Language CSharp
  Add-Line ("Add-Type    : OK (returned " + [OneShotProbe]::Ping() + ")")
} catch {
  Add-Line ("Add-Type    : FAILED -> " + $_.Exception.Message)
}
Add-Line ""

Add-Line "--- Printers installed ---"
try {
  $found = $false
  foreach ($p in (Get-WmiObject -Class Win32_Printer)) {
    Add-Line ("   " + $p.Name)
    $found = $true
  }
  if (-not $found) { Add-Line "   (none found)" }
} catch {
  Add-Line ("   FAILED -> " + $_.Exception.Message)
}
Add-Line ("Configured  : " + $(if ($env:XPRINTER_NAME) { $env:XPRINTER_NAME } else { "POS-58 (default)" }))
Add-Line ""

Add-Line ("--- Port " + $port + " ---")
try {
  $busy = $false
  foreach ($line in (& netstat -ano)) {
    $text = ([string]$line).Trim()
    if ($text.StartsWith("TCP") -and $text.Contains(":" + $port)) {
      Add-Line ("   " + $text)
      $busy = $true
    }
  }
  if (-not $busy) { Add-Line "   free" }
} catch {
  Add-Line ("   could not run netstat -> " + $_.Exception.Message)
}
Add-Line ""

Add-Line "--- Files present ---"
foreach ($f in @("xprinter-bridge.ps1", "start-xprinter-bridge.bat", "test-print.bat", "stop-bridge.bat")) {
  $full = Join-Path $scriptDir $f
  if (Test-Path $full) {
    Add-Line ("   OK      " + $f + "  (" + (Get-Item $full).Length + " bytes)")
  } else {
    Add-Line ("   MISSING " + $f)
  }
}
Add-Line ""

Add-Line "--- Last lines of bridge-log.txt ---"
$log = Join-Path $scriptDir "bridge-log.txt"
if (Test-Path $log) {
  $content = Get-Content $log
  $start = 0
  if ($content.Length -gt 40) { $start = $content.Length - 40 }
  for ($i = $start; $i -lt $content.Length; $i++) { Add-Line ("   " + $content[$i]) }
} else {
  Add-Line "   (no log yet)"
}

Set-Content -Path $report -Value $lines -Encoding UTF8

Write-Host ""
Write-Host "=============================================="
Write-Host (" Report saved to: " + $report)
Write-Host "=============================================="
Write-Host ""
Write-Host "Send that file to the developer."
Write-Host ""
Write-Host "Press any key to close."
try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 30 }
