# ONE SHOT POS printer bridge - NO Node.js required
# Works on PowerShell 2.0+ (Windows 7 / 10 / 11 / Server)
#
# Start with: start-xprinter-bridge.bat
# Health:     http://127.0.0.1:17809/health

param(
  [string]$PrinterName = "",
  [int]$Port = 0
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrEmpty($PrinterName)) {
  if ($env:XPRINTER_NAME) { $PrinterName = $env:XPRINTER_NAME } else { $PrinterName = "POS-58" }
}
if ($Port -le 0) {
  if ($env:XPRINTER_BRIDGE_PORT) { $Port = [int]$env:XPRINTER_BRIDGE_PORT } else { $Port = 17809 }
}

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

  # init + center + double size + bold (header)
  $writer.Write([byte[]](0x1B, 0x40))
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

    if ($phase -eq "body" -and $text.StartsWith("TOTAL")) {
      $writer.Write([byte[]](0x1D, 0x21, 0x01))
      $writer.Write([byte[]](0x1B, 0x45, 0x01))
      $writer.Write($enc.GetBytes($text))
      $writer.Write([byte]0x0A)
      $writer.Write([byte[]](0x1D, 0x21, 0x00))
      $writer.Write([byte[]](0x1B, 0x45, 0x00))
      continue
    }

    $writer.Write($enc.GetBytes($text))
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

  # partial cut with minimal feed
  $writer.Write([byte[]](0x1D, 0x56, 0x42, 0x03))
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

function Add-CorsHeaders {
  param($Response)
  $Response.Headers["Access-Control-Allow-Origin"] = "*"
  $Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
  $Response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
  # Chrome Private Network Access (HTTPS page -> 127.0.0.1)
  $Response.Headers["Access-Control-Allow-Private-Network"] = "true"
  $Response.Headers["Access-Control-Max-Age"] = "86400"
}

function Send-Json {
  param($Context, [int]$Status, [string]$Json)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
  $Context.Response.StatusCode = $Status
  $Context.Response.ContentType = "application/json"
  Add-CorsHeaders $Context.Response
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.Close()
}

function Send-NoContent {
  param($Context)
  $Context.Response.StatusCode = 200
  Add-CorsHeaders $Context.Response
  $Context.Response.ContentLength64 = 0
  $Context.Response.Close()
}

function Test-IsAdmin {
  try {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:" + $Port + "/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "ERROR: cannot open port $Port"
  Write-Host $_.Exception.Message
  Write-Host ""

  if (Test-IsAdmin) {
    Write-Host "Reserving URL for all users, then retrying..."
    $cmd = "http add urlacl url=" + $prefix + " user=Everyone"
    Start-Process -FilePath "netsh" -ArgumentList $cmd -Wait -WindowStyle Hidden
    try {
      $listener.Start()
      Write-Host "OK: URL reserved, bridge started."
    } catch {
      Write-Host "Still failing. Another program may already use port $Port."
      Write-Host "Press any key to close."
      $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
      exit 1
    }
  } else {
    Write-Host "FIX (Windows 7): right-click start-xprinter-bridge.bat > Run as administrator"
    Write-Host "Or run this once in an admin prompt:"
    Write-Host ("  netsh http add urlacl url=" + $prefix + " user=Everyone")
    Write-Host ""
    Write-Host "Press any key to close."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
  }
}

Write-Host ""
Write-Host "ONE SHOT printer bridge is RUNNING (no Node.js)"
Write-Host ("Printer : " + $PrinterName)
Write-Host ("Health  : " + $prefix + "health")
Write-Host "Keep this window OPEN while using the POS."
Write-Host ""

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $path = $request.Url.AbsolutePath.ToLower().TrimEnd('/')
  if ($path -eq "") { $path = "/" }

  try {
    if ($request.HttpMethod -eq "OPTIONS") {
      Send-NoContent $context
      continue
    }

    if ($path -eq "/health") {
      $names = Get-PrinterNames
      $parts = @()
      foreach ($n in $names) { $parts += ('"' + (Escape-Json $n) + '"') }
      $printersJson = [string]::Join(",", $parts)
      $json = '{"ok":true,"mode":"winspool-ps","printer":"' + (Escape-Json $PrinterName) + '","printers":[' + $printersJson + ']}'
      Send-Json $context 200 $json
      continue
    }

    $targetPrinter = $PrinterName
    $queryPrinter = $request.QueryString["printer"]
    if ($queryPrinter -and $queryPrinter.Trim().Length -gt 0) { $targetPrinter = $queryPrinter }

    if ($path -eq "/open-drawer") {
      Send-Raw $targetPrinter (Get-DrawerBytes)
      Send-Json $context 200 '{"ok":true}'
      continue
    }

    if ($path -eq "/print-receipt") {
      $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
      $raw = $reader.ReadToEnd()
      $reader.Close()

      if ($raw -eq $null -or $raw.Trim().Length -eq 0) {
        Send-Json $context 400 '{"ok":false,"error":"empty body"}'
        continue
      }

      $lines = $raw -split "`n"
      for ($i = 0; $i -lt $lines.Length; $i++) { $lines[$i] = ([string]$lines[$i]).TrimEnd("`r") }

      $drawerParam = $request.QueryString["drawer"]
      $openDrawer = ($drawerParam -eq "1" -or $drawerParam -eq "true")

      Send-Raw $targetPrinter (Get-EscPosBytes $lines $openDrawer)

      $drawerJson = "false"
      if ($openDrawer) { $drawerJson = "true" }
      Send-Json $context 200 ('{"ok":true,"drawer":' + $drawerJson + '}')
      continue
    }

    Send-Json $context 404 '{"ok":false,"error":"not found"}'
  } catch {
    $message = Escape-Json ([string]$_.Exception.Message)
    Write-Host ("ERROR: " + $message)
    try { Send-Json $context 500 ('{"ok":false,"error":"' + $message + '"}') } catch { }
  }
}
