# ONE SHOT POS printer bridge - NO Node.js required
# Works on PowerShell 2.0+ (Windows 7 / 10 / 11 / Server)
#
# Start with: start-xprinter-bridge.bat
# Health:     http://127.0.0.1:17809/health

param(
  [string]$PrinterName = "",
  [int]$Port = 0,
  [int]$LeftPad = -1,
  [switch]$SelfTest,
  [string]$DumpTo = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrEmpty($PrinterName)) {
  if ($env:XPRINTER_NAME) { $PrinterName = $env:XPRINTER_NAME } else { $PrinterName = "POS-58" }
}
if ($Port -le 0) {
  if ($env:XPRINTER_BRIDGE_PORT) { $Port = [int]$env:XPRINTER_BRIDGE_PORT } else { $Port = 17809 }
}
# Left margin, in blank characters, added to every printed line
if ($LeftPad -lt 0) {
  if ($env:XPRINTER_LEFT_PAD) { $LeftPad = [int]$env:XPRINTER_LEFT_PAD } else { $LeftPad = 2 }
}
if ($LeftPad -lt 0) { $LeftPad = 0 }
if ($LeftPad -gt 8) { $LeftPad = 8 }

$script:LeftMargin = ""
if ($LeftPad -gt 0) { $script:LeftMargin = "".PadRight($LeftPad, [char]' ') }

# Keep a log next to the script so failures are visible after the window closes
$script:LogFile = ""
try {
  $here = Split-Path -Parent $MyInvocation.MyCommand.Definition
  if ($here) { $script:LogFile = Join-Path $here "bridge-log.txt" }
} catch { }

# C# 2.0 compatible (no 'var', no LINQ) so it compiles on old PowerShell
$csharp = @'
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static string SendBytes(string printerName, byte[] bytes) {
    IntPtr hPrinter = IntPtr.Zero;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
      return "OpenPrinter failed (code " + Marshal.GetLastWin32Error() + ") for: " + printerName;
    }

    DOCINFOA di = new DOCINFOA();
    di.pDocName = "ONE SHOT Ticket";
    di.pDataType = "RAW";

    if (!StartDocPrinter(hPrinter, 1, di)) {
      ClosePrinter(hPrinter);
      return "StartDocPrinter failed (code " + Marshal.GetLastWin32Error() + ")";
    }

    StartPagePrinter(hPrinter);

    IntPtr buffer = Marshal.AllocHGlobal(bytes.Length);
    Marshal.Copy(bytes, 0, buffer, bytes.Length);
    int written = 0;
    bool ok = WritePrinter(hPrinter, buffer, bytes.Length, out written);
    int err = Marshal.GetLastWin32Error();
    Marshal.FreeHGlobal(buffer);

    EndPagePrinter(hPrinter);
    EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);

    if (!ok) { return "WritePrinter failed (code " + err + ")"; }
    return "";
  }
}
'@

Add-Type -TypeDefinition $csharp -Language CSharp

$enc = [System.Text.Encoding]::GetEncoding(437)

function Get-EscPosBytes {
  param([string[]]$Lines, [bool]$OpenDrawer)

  $stream = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter($stream)

  # init + PC437 codepage + top margin
  $writer.Write([byte[]](0x1B, 0x40))
  $writer.Write([byte[]](0x1B, 0x74, 0x00))
  $writer.Write([byte]0x0A)

  # centered + double size + bold for the header block
  $writer.Write([byte[]](0x1B, 0x61, 0x01))
  $writer.Write([byte[]](0x1D, 0x21, 0x11))
  $writer.Write([byte[]](0x1B, 0x45, 0x01))

  $phase = "header"

  foreach ($line in $Lines) {
    if ($line -eq $null) { continue }
    $text = ([string]$line).TrimEnd()
    if ($text.Length -eq 0) { continue }

    $isRule = $text.StartsWith("---") -or $text.StartsWith("===")

    if ($isRule -and $phase -eq "header") {
      $writer.Write([byte[]](0x1B, 0x45, 0x00))
      $writer.Write([byte[]](0x1D, 0x21, 0x00))
      $writer.Write([byte[]](0x1B, 0x61, 0x00))
      $phase = "body"
    }

    # Centered lines already have margins; only indent left-aligned body lines
    $out = $text
    if ($phase -eq "body") { $out = $script:LeftMargin + $text }

    if ($phase -eq "body" -and $text.StartsWith("TOTAL")) {
      $writer.Write([byte[]](0x1D, 0x21, 0x01))
      $writer.Write([byte[]](0x1B, 0x45, 0x01))
      $writer.Write($enc.GetBytes($out))
      $writer.Write([byte]0x0A)
      $writer.Write([byte[]](0x1D, 0x21, 0x00))
      $writer.Write([byte[]](0x1B, 0x45, 0x00))
      continue
    }

    $writer.Write($enc.GetBytes($out))
    $writer.Write([byte]0x0A)

    if ($phase -eq "header") {
      # brand line printed big, remaining header lines smaller
      $writer.Write([byte[]](0x1D, 0x21, 0x01))
      $writer.Write([byte[]](0x1B, 0x45, 0x00))
    }
  }

  if ($OpenDrawer) {
    $writer.Write([byte[]](0x1B, 0x70, 0x00, 0x19, 0xFA))
    $writer.Write([byte[]](0x1B, 0x70, 0x01, 0x19, 0xFA))
  }

  # feed a little then partial cut
  $writer.Write([byte[]](0x1D, 0x56, 0x42, 0x04))
  $writer.Flush()

  return $stream.ToArray()
}

function Get-DrawerBytes {
  $stream = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter($stream)
  $writer.Write([byte[]](0x1B, 0x40))
  $writer.Write([byte[]](0x1B, 0x70, 0x00, 0x19, 0xFA))
  $writer.Write([byte[]](0x1B, 0x70, 0x01, 0x19, 0xFA))
  $writer.Flush()
  return $stream.ToArray()
}

function Send-Raw {
  param([string]$Name, [byte[]]$Bytes)
  $err = [RawPrinterHelper]::SendBytes($Name, $Bytes)
  if ($err -ne "") { throw $err }
}

function Get-PrinterNames {
  try {
    $list = @()
    $wmi = Get-WmiObject -Class Win32_Printer -ErrorAction SilentlyContinue
    foreach ($p in $wmi) { $list += [string]$p.Name }
    return $list
  } catch {
    return @()
  }
}

function Escape-Json {
  param([string]$Value)
  if ($Value -eq $null) { return "" }
  $out = $Value.Replace('\', '\\')
  $out = $out.Replace('"', '\"')
  $out = $out.Replace("`r", " ")
  $out = $out.Replace("`n", " ")
  return $out
}

function Write-Log {
  param([string]$Message)
  $stamp = (Get-Date).ToString("HH:mm:ss")
  Write-Host ($stamp + "  " + $Message)
  if ($script:LogFile -ne "") {
    try {
      $line = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") + "  " + $Message
      [System.IO.File]::AppendAllText($script:LogFile, $line + [Environment]::NewLine)
    } catch { }
  }
}

# --- Minimal HTTP server over raw TCP -------------------------------------
# HttpListener is NOT used on purpose: it goes through http.sys, which needs
# an admin "netsh http add urlacl" reservation on Windows 7. A TcpListener on
# 127.0.0.1 needs no rights at all and behaves the same on every Windows.

function Send-Http {
  param($Stream, [int]$Status, [string]$Reason, [string]$Body)

  $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
  $head = "HTTP/1.1 " + $Status + " " + $Reason + "`r`n"
  $head += "Content-Type: application/json; charset=utf-8`r`n"
  $head += "Content-Length: " + $bodyBytes.Length + "`r`n"
  $head += "Access-Control-Allow-Origin: *`r`n"
  $head += "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n"
  $head += "Access-Control-Allow-Headers: Content-Type`r`n"
  # Chrome Private Network Access (HTTPS page -> 127.0.0.1)
  $head += "Access-Control-Allow-Private-Network: true`r`n"
  $head += "Access-Control-Max-Age: 86400`r`n"
  $head += "Cache-Control: no-store`r`n"
  $head += "Connection: close`r`n`r`n"

  $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
  $Stream.Write($headBytes, 0, $headBytes.Length)
  if ($bodyBytes.Length -gt 0) { $Stream.Write($bodyBytes, 0, $bodyBytes.Length) }
  $Stream.Flush()
}

function Read-HttpHead {
  param($Stream)
  $buffer = New-Object System.IO.MemoryStream
  $crlf = 0
  while ($true) {
    $b = $Stream.ReadByte()
    if ($b -lt 0) { break }
    $buffer.WriteByte([byte]$b)
    if ($b -eq 10) {
      $crlf = $crlf + 1
      if ($crlf -ge 2) { break }
    } elseif ($b -ne 13) {
      $crlf = 0
    }
    if ($buffer.Length -gt 32768) { break }
  }
  return [System.Text.Encoding]::ASCII.GetString($buffer.ToArray())
}

function Get-QueryValue {
  param([string]$Query, [string]$Key)
  if ($Query -eq $null -or $Query -eq "") { return "" }
  foreach ($pair in ($Query -split "&")) {
    $eq = $pair.IndexOf("=")
    if ($eq -lt 0) { continue }
    if ($pair.Substring(0, $eq) -eq $Key) {
      $raw = $pair.Substring($eq + 1).Replace("+", " ")
      try { return [System.Uri]::UnescapeDataString($raw) } catch { return $raw }
    }
  }
  return ""
}

if ($SelfTest -or $DumpTo -ne "") {
  $sample = @(
    "ONE SHOT",
    "Restaurant",
    "----------------------------",
    "Test marges / margin test",
    "1 x Cafe expresso       500",
    "2 x Jus d'orange      2 000",
    "----------------------------",
    "TOTAL                 2 500",
    "Paiement: Especes",
    "Merci et a bientot !"
  )
  $bytes = Get-EscPosBytes $sample $true

  if ($DumpTo -ne "") {
    [System.IO.File]::WriteAllBytes($DumpTo, $bytes)
    Write-Host ("Wrote " + $bytes.Length + " bytes to " + $DumpTo)
    exit 0
  }

  Write-Host ("Test ticket -> " + $PrinterName + " (left margin: " + $LeftPad + " chars)")
  try {
    Send-Raw $PrinterName $bytes
    Write-Host "OK: ticket sent. The drawer should also have opened."
  } catch {
    Write-Host ("FAILED: " + $_.Exception.Message)
    Write-Host ""
    Write-Host "Printers installed on this PC:"
    foreach ($n in (Get-PrinterNames)) { Write-Host ("  " + $n) }
    Write-Host ""
    Write-Host "Copy the exact name into start-xprinter-bridge.bat (XPRINTER_NAME)."
  }
  Write-Host ""
  Write-Host "Press any key to close."
  try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 15 }
  exit 0
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "COULD NOT START THE BRIDGE"
  Write-Host ("Port " + $Port + ": " + $_.Exception.Message)
  Write-Host ""
  Write-Host "The port is most likely already used by another bridge window."
  Write-Host "Close the other black window, then start this one again."
  Write-Host ""
  Write-Host "Press any key to close."
  try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 20 }
  exit 1
}

Write-Host ""
Write-Host "ONE SHOT printer bridge is RUNNING (no Node.js, no admin)"
Write-Host ("Printer     : " + $PrinterName)
Write-Host ("Left margin : " + $LeftPad + " characters")
Write-Host ("Health      : http://127.0.0.1:" + $Port + "/health")
Write-Host "Keep this window OPEN while using the POS."
Write-Host ""

try {
  while ($true) {
    $client = $null
    $stream = $null
    try {
      $client = $listener.AcceptTcpClient()
      $client.NoDelay = $true
      $stream = $client.GetStream()
      $stream.ReadTimeout = 15000
      $stream.WriteTimeout = 15000

      $head = Read-HttpHead $stream
      if ($head -eq $null -or $head.Trim().Length -eq 0) { continue }

      $headLines = $head -split "`n"
      $requestLine = ([string]$headLines[0]).Trim()
      $bits = $requestLine -split " "
      if ($bits.Length -lt 2) { continue }

      $method = $bits[0].ToUpper()
      $target = $bits[1]
      $query = ""
      $qm = $target.IndexOf("?")
      if ($qm -ge 0) {
        $query = $target.Substring($qm + 1)
        $target = $target.Substring(0, $qm)
      }
      $path = $target.ToLower().TrimEnd('/')
      if ($path -eq "") { $path = "/" }

      $contentLength = 0
      foreach ($h in $headLines) {
        $line = ([string]$h).Trim()
        if ($line.ToLower().StartsWith("content-length:")) {
          $value = $line.Substring(15).Trim()
          try { $contentLength = [int]$value } catch { $contentLength = 0 }
        }
      }

      $body = ""
      if ($contentLength -gt 0 -and $contentLength -le 1048576) {
        $buf = New-Object byte[] $contentLength
        $read = 0
        while ($read -lt $contentLength) {
          $n = $stream.Read($buf, $read, $contentLength - $read)
          if ($n -le 0) { break }
          $read = $read + $n
        }
        $body = [System.Text.Encoding]::UTF8.GetString($buf, 0, $read)
      }

      if ($method -eq "OPTIONS") {
        Send-Http $stream 200 "OK" "{}"
        continue
      }

      if ($path -eq "/health") {
        $parts = @()
        foreach ($n in (Get-PrinterNames)) { $parts += ('"' + (Escape-Json $n) + '"') }
        $json = '{"ok":true,"mode":"winspool-ps","printer":"' + (Escape-Json $PrinterName) + '"'
        $json = $json + ',"leftPad":' + $LeftPad
        $json = $json + ',"printers":[' + [string]::Join(",", $parts) + ']}'
        Send-Http $stream 200 "OK" $json
        continue
      }

      $targetPrinter = $PrinterName
      $queryPrinter = Get-QueryValue $query "printer"
      if ($queryPrinter -ne "" -and $queryPrinter.Trim().Length -gt 0) { $targetPrinter = $queryPrinter.Trim() }

      $drawerParam = Get-QueryValue $query "drawer"
      $openDrawer = ($drawerParam -eq "1" -or $drawerParam -eq "true")

      if ($path -eq "/open-drawer") {
        Send-Raw $targetPrinter (Get-DrawerBytes)
        Write-Log ("drawer opened on " + $targetPrinter)
        Send-Http $stream 200 "OK" '{"ok":true}'
        continue
      }

      if ($path -eq "/print-receipt") {
        if ($body.Trim().Length -eq 0) {
          Send-Http $stream 400 "Bad Request" '{"ok":false,"error":"empty body"}'
          continue
        }

        $lines = $body -split "`n"
        for ($i = 0; $i -lt $lines.Length; $i++) { $lines[$i] = ([string]$lines[$i]).TrimEnd("`r") }

        Send-Raw $targetPrinter (Get-EscPosBytes $lines $openDrawer)

        $drawerJson = "false"
        if ($openDrawer) { $drawerJson = "true" }
        Write-Log ("ticket printed on " + $targetPrinter + " (drawer: " + $drawerJson + ")")
        Send-Http $stream 200 "OK" ('{"ok":true,"drawer":' + $drawerJson + '}')
        continue
      }

      Send-Http $stream 404 "Not Found" '{"ok":false,"error":"not found"}'
    } catch {
      # One bad request must never kill the bridge
      $message = Escape-Json ([string]$_.Exception.Message)
      Write-Log ("ERROR: " + $message)
      if ($stream -ne $null) {
        try { Send-Http $stream 500 "Server Error" ('{"ok":false,"error":"' + $message + '"}') } catch { }
      }
    } finally {
      if ($stream -ne $null) { try { $stream.Close() } catch { } }
      if ($client -ne $null) { try { $client.Close() } catch { } }
    }
  }
} finally {
  try { $listener.Stop() } catch { }
}
