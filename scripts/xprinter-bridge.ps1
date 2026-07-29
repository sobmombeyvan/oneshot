# ONE SHOT POS printer bridge (NO Node.js required)
# Default printer: POS-58
# Start: double-click start-xprinter-bridge.bat
# Or:   powershell -ExecutionPolicy Bypass -File scripts\xprinter-bridge.ps1

param(
  [string]$PrinterName = $(if ($env:XPRINTER_NAME) { $env:XPRINTER_NAME } else { "POS-58" }),
  [int]$Port = $(if ($env:XPRINTER_BRIDGE_PORT) { [int]$env:XPRINTER_BRIDGE_PORT } else { 17809 })
)

$ErrorActionPreference = "Stop"

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

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

  public static bool SendBytes(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
    var di = new DOCINFOA();
    di.pDocName = "ONE SHOT Ticket";
    di.pDataType = "RAW";
    if (!StartDocPrinter(hPrinter, 1, di)) { ClosePrinter(hPrinter); return false; }
    StartPagePrinter(hPrinter);
    IntPtr p = Marshal.AllocHGlobal(bytes.Length);
    Marshal.Copy(bytes, 0, p, bytes.Length);
    int written;
    bool ok = WritePrinter(hPrinter, p, bytes.Length, out written);
    Marshal.FreeHGlobal(p);
    EndPagePrinter(hPrinter);
    EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);
    return ok;
  }
}
"@

function Get-EscPosBytes([string[]]$Lines, [bool]$OpenDrawer) {
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)

  # INIT, center, double size, bold
  $bw.Write([byte[]](0x1B, 0x40))
  $bw.Write([byte[]](0x1B, 0x61, 0x01))
  $bw.Write([byte[]](0x1D, 0x21, 0x11))
  $bw.Write([byte[]](0x1B, 0x45, 0x01))

  $phase = "header"
  foreach ($line in $Lines) {
    if ($null -eq $line) { continue }
    $text = ([string]$line).TrimEnd()
    if ([string]::IsNullOrWhiteSpace($text)) { continue }

    if ($text.StartsWith("---") -or $text.StartsWith("===")) {
      if ($phase -eq "header") {
        $bw.Write([byte[]](0x1B, 0x45, 0x00))
        $bw.Write([byte[]](0x1D, 0x21, 0x00))
        $bw.Write([byte[]](0x1B, 0x61, 0x00))
        $phase = "body"
      }
      $bw.Write([Text.Encoding]::GetEncoding(437).GetBytes($text))
      $bw.Write([byte]0x0A)
      continue
    }

    if ($phase -eq "header") {
      $bw.Write([Text.Encoding]::GetEncoding(437).GetBytes($text))
      $bw.Write([byte]0x0A)
      $bw.Write([byte[]](0x1D, 0x21, 0x01))
      $bw.Write([byte[]](0x1B, 0x45, 0x00))
      continue
    }

    if ($text.StartsWith("TOTAL")) {
      $bw.Write([byte[]](0x1D, 0x21, 0x01))
      $bw.Write([byte[]](0x1B, 0x45, 0x01))
      $bw.Write([Text.Encoding]::GetEncoding(437).GetBytes($text))
      $bw.Write([byte]0x0A)
      $bw.Write([byte[]](0x1D, 0x21, 0x00))
      $bw.Write([byte[]](0x1B, 0x45, 0x00))
      continue
    }

    $bw.Write([Text.Encoding]::GetEncoding(437).GetBytes($text))
    $bw.Write([byte]0x0A)
  }

  if ($OpenDrawer) {
    # ESC p 0 25 250 — pin 2
    $bw.Write([byte[]](0x1B, 0x70, 0x00, 0x19, 0xFA))
    # also pulse pin 5 for some POS-58 models
    $bw.Write([byte[]](0x1B, 0x70, 0x01, 0x19, 0xFA))
  }

  # partial cut
  $bw.Write([byte[]](0x1D, 0x56, 0x42, 0x03))
  $bw.Flush()
  return $ms.ToArray()
}

function Send-Raw([string]$Name, [byte[]]$Bytes) {
  $ok = [RawPrinterHelper]::SendBytes($Name, $Bytes)
  if (-not $ok) { throw "Winspool raw print failed for printer: $Name" }
}

function Get-PrinterNames {
  try {
    return @(Get-Printer | Select-Object -ExpandProperty Name)
  } catch {
    return @()
  }
}

function Write-JsonResponse($Context, [int]$Status, $Obj) {
  $json = ($Obj | ConvertTo-Json -Compress -Depth 6)
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $Context.Response.StatusCode = $Status
  $Context.Response.ContentType = "application/json; charset=utf-8"
  $Context.Response.Headers["Access-Control-Allow-Origin"] = "*"
  $Context.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
  $Context.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.Close()
}

function Read-Body($Request) {
  $reader = New-Object IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
  try {
    $raw = $reader.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
    return ($raw | ConvertFrom-Json)
  } finally {
    $reader.Close()
  }
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "ONE SHOT bridge (no Node) running"
Write-Host "Printer: $PrinterName"
Write-Host "URL: $prefix"
Write-Host "Health: ${prefix}health"
Write-Host "Keep this window open."

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $path = $req.Url.AbsolutePath.TrimEnd("/").ToLowerInvariant()

  try {
    if ($req.HttpMethod -eq "OPTIONS") {
      $context.Response.StatusCode = 204
      $context.Response.Headers["Access-Control-Allow-Origin"] = "*"
      $context.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
      $context.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
      $context.Response.Close()
      continue
    }

    if ($path -eq "/health" -and $req.HttpMethod -eq "GET") {
      Write-JsonResponse $context 200 @{
        ok = $true
        mode = "winspool-ps"
        printer = $PrinterName
        printers = @(Get-PrinterNames)
      }
      continue
    }

    if ($path -eq "/open-drawer" -and $req.HttpMethod -eq "POST") {
      $body = Read-Body $req
      $name = if ($body.printerName) { [string]$body.printerName } else { $PrinterName }
      $bytes = Get-EscPosBytes @() $true
      # drawer-only payload
      $ms = New-Object IO.MemoryStream
      $bw = New-Object IO.BinaryWriter($ms)
      $bw.Write([byte[]](0x1B, 0x40))
      $bw.Write([byte[]](0x1B, 0x70, 0x00, 0x19, 0xFA))
      $bw.Write([byte[]](0x1B, 0x70, 0x01, 0x19, 0xFA))
      $bw.Flush()
      Send-Raw $name $ms.ToArray()
      Write-JsonResponse $context 200 @{ ok = $true }
      continue
    }

    if ($path -eq "/print-receipt" -and $req.HttpMethod -eq "POST") {
      $body = Read-Body $req
      $name = if ($body.printerName) { [string]$body.printerName } else { $PrinterName }
      $lines = @()
      if ($body.lines) { $lines = @($body.lines | ForEach-Object { [string]$_ }) }
      if ($lines.Count -eq 0) {
        Write-JsonResponse $context 400 @{ ok = $false; error = "Missing lines[]" }
        continue
      }
      $openDrawer = [bool]$body.openDrawer
      $payload = Get-EscPosBytes $lines $openDrawer
      Send-Raw $name $payload
      Write-JsonResponse $context 200 @{ ok = $true; drawer = $openDrawer }
      continue
    }

    Write-JsonResponse $context 404 @{ ok = $false; error = "Not found" }
  } catch {
    Write-JsonResponse $context 500 @{ ok = $false; error = $_.Exception.Message }
  }
}
