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
  [switch]$Stop,
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
  if ($env:XPRINTER_LEFT_PAD) { $LeftPad = [int]$env:XPRINTER_LEFT_PAD } else { $LeftPad = 1 }
}
if ($LeftPad -lt 0) { $LeftPad = 0 }
if ($LeftPad -gt 8) { $LeftPad = 8 }

$script:LeftMargin = ""
if ($LeftPad -gt 0) { $script:LeftMargin = "".PadRight($LeftPad, [char]' ') }

# Keep a log next to the script so failures are visible after the window closes
$script:LogFile = ""
$script:StatusFile = ""
$script:SelfPath = ""
try {
  $script:SelfPath = $MyInvocation.MyCommand.Definition
  $here = Split-Path -Parent $script:SelfPath
  if ($here) {
    $script:LogFile = Join-Path $here "bridge-log.txt"
    $script:StatusFile = Join-Path $here "bridge-status.txt"
  }
} catch { }

# PowerShell 2.0 (Windows 7) ignores exit codes when launched with -File: it
# always reports 0, even after a crash. The .bat therefore reads this file
# instead of %ERRORLEVEL% to know what really happened.
function Set-Status {
  param([string]$Value)
  if ($script:StatusFile -eq "") { return }
  try { [System.IO.File]::WriteAllText($script:StatusFile, $Value) } catch { }
}

function Wait-AnyKey {
  Write-Host ""
  Write-Host "Press any key to close."
  try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 30 }
}

Set-Status "STARTING"

# Catches ANY terminating error anywhere below, so the window can never just
# vanish without telling the cashier what went wrong.
trap {
  $reason = "unknown error"
  try { $reason = [string]$_.Exception.Message } catch { }
  $where = ""
  try { $where = [string]$_.InvocationInfo.PositionMessage } catch { }

  Write-Host ""
  Write-Host "=============================================="
  Write-Host " THE BRIDGE CRASHED"
  Write-Host "=============================================="
  Write-Host ""
  Write-Host $reason
  if ($where -ne "") { Write-Host $where }
  Write-Host ""
  Write-Host "This text was also saved in bridge-log.txt."
  Write-Host "Send that file to the developer if it keeps happening."

  if ($script:LogFile -ne "") {
    try {
      $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
      $entry = $stamp + "  CRASH: " + $reason + [Environment]::NewLine + $where + [Environment]::NewLine
      [System.IO.File]::AppendAllText($script:LogFile, $entry)
    } catch { }
  }

  Set-Status "ERROR"
  Wait-AnyKey
  exit 1
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

// Listening socket built straight on Winsock.
// System.Net.Sockets cannot even be constructed when the .NET configuration
// system fails to initialise, which is what happens on Windows 7 PCs whose
// powershell.exe.config carries .NET 4 only sections. ws2_32.dll has no such
// dependency, so this keeps working where the managed classes do not.
public class WinsockServer {
  const int AF_INET = 2;
  const int SOCK_STREAM = 1;
  const int IPPROTO_TCP = 6;
  const int SOL_SOCKET = 0xffff;
  const int SO_RCVTIMEO = 0x1006;
  const int SO_SNDTIMEO = 0x1005;

  [DllImport("ws2_32.dll")]
  static extern int WSAStartup(ushort version, byte[] data);
  [DllImport("ws2_32.dll")]
  static extern int WSACleanup();
  [DllImport("ws2_32.dll")]
  static extern int WSAGetLastError();
  [DllImport("ws2_32.dll")]
  static extern IntPtr socket(int af, int type, int protocol);
  [DllImport("ws2_32.dll")]
  static extern int bind(IntPtr s, byte[] addr, int addrlen);
  [DllImport("ws2_32.dll")]
  static extern int listen(IntPtr s, int backlog);
  [DllImport("ws2_32.dll")]
  static extern IntPtr accept(IntPtr s, IntPtr addr, IntPtr addrlen);
  [DllImport("ws2_32.dll")]
  static extern int recv(IntPtr s, byte[] buf, int len, int flags);
  [DllImport("ws2_32.dll")]
  static extern int send(IntPtr s, byte[] buf, int len, int flags);
  [DllImport("ws2_32.dll")]
  static extern int closesocket(IntPtr s);
  [DllImport("ws2_32.dll")]
  static extern int setsockopt(IntPtr s, int level, int name, ref int val, int len);

  static IntPtr listenSocket = IntPtr.Zero;
  static bool started = false;

  public static int LastError() { return WSAGetLastError(); }

  public static string Start(int port) {
    byte[] wsaData = new byte[512];
    int rc = WSAStartup((ushort)0x0202, wsaData);
    if (rc != 0) { return "WSAStartup failed (code " + rc + ")"; }
    started = true;

    listenSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listenSocket == IntPtr.Zero || listenSocket.ToInt64() == -1) {
      return "socket() failed (code " + WSAGetLastError() + ")";
    }

    // sockaddr_in for 127.0.0.1:port, port in network byte order
    byte[] addr = new byte[16];
    addr[0] = (byte)AF_INET;
    addr[1] = 0;
    addr[2] = (byte)((port >> 8) & 0xFF);
    addr[3] = (byte)(port & 0xFF);
    addr[4] = 127; addr[5] = 0; addr[6] = 0; addr[7] = 1;

    if (bind(listenSocket, addr, 16) != 0) {
      int err = WSAGetLastError();
      if (err == 10048) { return "port " + port + " is already taken (code 10048)"; }
      return "bind() failed (code " + err + ")";
    }

    if (listen(listenSocket, 16) != 0) {
      return "listen() failed (code " + WSAGetLastError() + ")";
    }
    return "";
  }

  public static WinsockStream Accept() {
    IntPtr client = accept(listenSocket, IntPtr.Zero, IntPtr.Zero);
    if (client == IntPtr.Zero || client.ToInt64() == -1) {
      throw new System.IO.IOException("accept() failed (code " + WSAGetLastError() + ")");
    }
    return new WinsockStream(client);
  }

  public static void Stop() {
    if (listenSocket != IntPtr.Zero && listenSocket.ToInt64() != -1) {
      closesocket(listenSocket);
      listenSocket = IntPtr.Zero;
    }
    if (started) { WSACleanup(); started = false; }
  }

  internal static int Receive(IntPtr s, byte[] buf, int len) { return recv(s, buf, len, 0); }
  internal static int Transmit(IntPtr s, byte[] buf, int len) { return send(s, buf, len, 0); }
  internal static void Shut(IntPtr s) { closesocket(s); }
  internal static void Timeout(IntPtr s, bool read, int ms) {
    int value = ms;
    setsockopt(s, SOL_SOCKET, read ? SO_RCVTIMEO : SO_SNDTIMEO, ref value, 4);
  }
}

// A normal Stream on top of a raw socket, so the HTTP code does not need to
// know which transport it is talking to.
public class WinsockStream : System.IO.Stream {
  IntPtr sock;
  int readMs = 15000;
  int writeMs = 15000;

  public WinsockStream(IntPtr s) { sock = s; }

  public override bool CanRead { get { return true; } }
  public override bool CanWrite { get { return true; } }
  public override bool CanSeek { get { return false; } }
  public override bool CanTimeout { get { return true; } }
  public override long Length { get { throw new NotSupportedException(); } }
  public override long Position {
    get { throw new NotSupportedException(); }
    set { throw new NotSupportedException(); }
  }
  public override void SetLength(long value) { throw new NotSupportedException(); }
  public override long Seek(long offset, System.IO.SeekOrigin origin) { throw new NotSupportedException(); }
  public override void Flush() { }

  public override int ReadTimeout {
    get { return readMs; }
    set { readMs = value; WinsockServer.Timeout(sock, true, value); }
  }
  public override int WriteTimeout {
    get { return writeMs; }
    set { writeMs = value; WinsockServer.Timeout(sock, false, value); }
  }

  public override int Read(byte[] buffer, int offset, int count) {
    if (count <= 0) { return 0; }
    byte[] tmp = new byte[count];
    int n = WinsockServer.Receive(sock, tmp, count);
    // A closed peer or a timeout both mean "no more data": reported as EOF so
    // one dead browser connection cannot bring the bridge down.
    if (n <= 0) { return 0; }
    Buffer.BlockCopy(tmp, 0, buffer, offset, n);
    return n;
  }

  public override void Write(byte[] buffer, int offset, int count) {
    int sent = 0;
    while (sent < count) {
      int remaining = count - sent;
      byte[] slice = new byte[remaining];
      Buffer.BlockCopy(buffer, offset + sent, slice, 0, remaining);
      int n = WinsockServer.Transmit(sock, slice, remaining);
      if (n <= 0) {
        throw new System.IO.IOException("send() failed (code " + WinsockServer.LastError() + ")");
      }
      sent += n;
    }
  }

  public override void Close() {
    if (sock != IntPtr.Zero) {
      WinsockServer.Shut(sock);
      sock = IntPtr.Zero;
    }
    base.Close();
  }
}
'@

Add-Type -TypeDefinition $csharp -Language CSharp

$enc = [System.Text.Encoding]::GetEncoding(437)

# Codepage 437 has no Unicode spaces. Left as-is they print as "?", which is
# what turned amounts like "1 500 000" into "1?500?000".
function Get-PrintableText {
  param([string]$Text)
  if ($Text -eq $null) { return "" }
  $out = $Text
  foreach ($cp in @(0x00A0, 0x1680, 0x2007, 0x2008, 0x2009, 0x200A, 0x202F, 0x205F, 0x3000)) {
    $out = $out.Replace([string][char]$cp, " ")
  }
  foreach ($cp in @(0x2018, 0x2019)) { $out = $out.Replace([string][char]$cp, "'") }
  foreach ($cp in @(0x201C, 0x201D)) { $out = $out.Replace([string][char]$cp, '"') }
  foreach ($cp in @(0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015)) {
    $out = $out.Replace([string][char]$cp, "-")
  }
  foreach ($cp in @(0x200B, 0x200C, 0x200D, 0xFEFF)) { $out = $out.Replace([string][char]$cp, "") }
  $out = $out.Replace([string][char]0x2026, "...")
  $out = $out.Replace([string][char]0x00B0, "o")
  return $out
}

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
    $text = (Get-PrintableText ([string]$line)).TrimEnd()
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
      # Only the brand line is enlarged; subtitle and title stay normal size
      # so long amounts always fit on one line.
      $writer.Write([byte[]](0x1D, 0x21, 0x00))
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
  # 30 columns wide, with a million so the widest amount can be checked
  $sample = @(
    "ONE SHOT",
    "Restaurant",
    "TICKET DE TEST",
    "------------------------------",
    "Article          Montant XAF",
    "------------------------------",
    "Cafe expresso",
    "x1                        500",
    "Jus d'orange",
    "x2                      2 000",
    "Menu complet",
    "x3                  1 500 000",
    "------------------------------",
    "Sous-total          1 502 500",
    "==============================",
    "TOTAL               1 502 500",
    "Paiement            Especes",
    "------------------------------",
    "Merci de votre visite !"
  )
  $bytes = Get-EscPosBytes $sample $true

  if ($DumpTo -ne "") {
    [System.IO.File]::WriteAllBytes($DumpTo, $bytes)
    Write-Host ("Wrote " + $bytes.Length + " bytes to " + $DumpTo)
    Set-Status "DUMPED"
    exit 0
  }

  Write-Host ("Test ticket -> " + $PrinterName + " (left margin: " + $LeftPad + " chars)")
  try {
    Send-Raw $PrinterName $bytes
    Write-Host ""
    Write-Host "OK: ticket sent. The drawer should also have opened."
    Write-Host "Check the paper: a left margin, and 1 500 000 printed in full."
    Set-Status "TEST_OK"
  } catch {
    Write-Host ""
    Write-Host ("FAILED: " + $_.Exception.Message)
    Write-Host ""
    Write-Host "Printers installed on this PC:"
    foreach ($n in (Get-PrinterNames)) { Write-Host ("  " + $n) }
    Write-Host ""
    Write-Host "Copy the exact name above into start-xprinter-bridge.bat and"
    Write-Host "test-print.bat, on the line: set XPRINTER_NAME=..."
    Set-Status "TEST_FAILED"
  }
  Wait-AnyKey
  exit 0
}

# Answers /health on the port: is OUR bridge already serving there?
function Test-BridgeAlreadyRunning {
  param([int]$ProbePort)
  try {
    $probe = New-Object System.Net.Sockets.TcpClient
    $probe.Connect("127.0.0.1", $ProbePort)
    $ps = $probe.GetStream()
    $ps.ReadTimeout = 4000
    $ps.WriteTimeout = 4000
    $req = "GET /health HTTP/1.1`r`nHost: 127.0.0.1`r`nConnection: close`r`n`r`n"
    $rb = [System.Text.Encoding]::ASCII.GetBytes($req)
    $ps.Write($rb, 0, $rb.Length)
    $ps.Flush()
    $sr = New-Object System.IO.StreamReader($ps)
    $answer = $sr.ReadToEnd()
    $probe.Close()
    if ($answer -eq $null) { return $false }
    return $answer.Contains("winspool-ps")
  } catch {
    return $false
  }
}

# PID holding the port, so the user can be told exactly what to close
function Get-PortOwnerPid {
  param([int]$ProbePort)
  try {
    $needle = ":" + $ProbePort
    foreach ($line in (& netstat -ano)) {
      $text = ([string]$line).Trim()
      if ($text.StartsWith("TCP") -eq $false) { continue }
      $fields = $text -split "\s+"
      if ($fields.Length -lt 4) { continue }
      if ($fields[1].EndsWith($needle) -eq $false) { continue }
      $owner = $fields[$fields.Length - 1]
      try { return [int]$owner } catch { return 0 }
    }
  } catch { }
  return 0
}

if ($Stop) {
  $owner = Get-PortOwnerPid $Port
  if ($owner -le 0) {
    Write-Host ("No bridge is listening on port " + $Port + ". Nothing to stop.")
    Set-Status "STOPPED"
    exit 0
  }
  Write-Host ("Stopping the bridge (process " + $owner + ")...")
  try {
    Stop-Process -Id $owner -Force
    Write-Host "Stopped."
    Set-Status "STOPPED"
  } catch {
    Write-Host ("Could not stop it: " + $_.Exception.Message)
    Set-Status "ERROR"
    exit 1
  }
  exit 0
}

# Transport selection.
# .NET's own socket classes need the .NET configuration system, and Windows
# ships powershell.exe.config with .NET 4 only sections. Under the older .NET
# that Windows 7 uses, that config fails to load and then NOTHING in
# System.Net can even be constructed - printing keeps working, only the
# network side dies. When that happens we fall back to calling Winsock
# directly, which needs no config, no admin and no extra software.
$script:Transport = "net"

$listener = $null
$socketError = ""
try {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
} catch {
  $socketError = [string]$_.Exception.Message
}

if ($listener -eq $null) {
  Write-Host ""
  Write-Host ".NET sockets are unavailable on this PC:"
  Write-Host ("  " + $socketError)
  Write-Host ""
  Write-Host "Switching to direct Winsock mode..."

  $winsockError = [WinsockServer]::Start($Port)
  if ($winsockError -ne "") {
    Write-Host ""
    Write-Host "COULD NOT START THE BRIDGE"
    Write-Host ("Winsock refused too: " + $winsockError)
    Write-Host ""
    if ($winsockError.Contains("10048")) {
      Write-Host "A bridge is probably already running."
      Write-Host "Run stop-bridge.bat, then start this again."
      Set-Status "PORT_BUSY"
    } else {
      Write-Host "Run diagnose.bat and send oneshot-report.txt to the developer."
      Set-Status "SOCKET_BLOCKED"
    }
    Wait-AnyKey
    exit 1
  }

  $script:Transport = "winsock"
  Write-Host "Winsock mode active - the bridge will work normally."
}

try {
  if ($script:Transport -eq "net") { $listener.Start() }
} catch {
  # The usual cause is the copy started automatically at logon, which runs
  # minimized and is easy to miss. That is not an error: it is already working.
  if (Test-BridgeAlreadyRunning $Port) {
    Write-Host ""
    Write-Host "THE BRIDGE IS ALREADY RUNNING - nothing to do."
    Write-Host ""
    Write-Host "It was most likely started automatically when you logged in."
    Write-Host "Look for a minimized window in the taskbar."
    Write-Host ""
    Write-Host ("Check it here: http://127.0.0.1:" + $Port + "/health")
    Write-Host "To restart it from scratch, run stop-bridge.bat first."
    Write-Host ""
    Write-Host "You can close this window and keep using the POS."
    Set-Status "ALREADY_RUNNING"
    Wait-AnyKey
    exit 2
  }

  Write-Host ""
  Write-Host "COULD NOT START THE BRIDGE"
  Write-Host ("Port " + $Port + " is taken by another program.")
  Write-Host ""
  $owner = Get-PortOwnerPid $Port
  if ($owner -gt 0) {
    $ownerName = "unknown"
    try { $ownerName = (Get-Process -Id $owner).ProcessName } catch { }
    Write-Host ("It is held by: " + $ownerName + " (process " + $owner + ")")
    Write-Host "Run stop-bridge.bat to free the port, then start this again."
  } else {
    Write-Host "Run stop-bridge.bat to free the port, then start this again."
  }
  Write-Host ""
  Write-Host ("Or use a different port: set XPRINTER_BRIDGE_PORT=17810")
  Write-Host "in start-xprinter-bridge.bat (and in the app settings)."
  Set-Status "PORT_BUSY"
  Wait-AnyKey
  exit 1
}

Set-Status "RUNNING"

Write-Host ""
Write-Host "ONE SHOT printer bridge is RUNNING (no Node.js, no admin)"
Write-Host ("Printer     : " + $PrinterName)
Write-Host ("Left margin : " + $LeftPad + " characters")
Write-Host ("Transport   : " + $script:Transport)
Write-Host ("Health      : http://127.0.0.1:" + $Port + "/health")
Write-Host "Keep this window OPEN while using the POS."
Write-Host ""

try {
  while ($true) {
    $client = $null
    $stream = $null
    try {
      if ($script:Transport -eq "net") {
        $client = $listener.AcceptTcpClient()
        $client.NoDelay = $true
        $stream = $client.GetStream()
      } else {
        $stream = [WinsockServer]::Accept()
      }
      $stream.ReadTimeout = 15000
      $stream.WriteTimeout = 15000

      # Browsers open spare connections and send nothing on them. That is
      # normal, so a read failure here must not be reported as an error.
      $head = ""
      $gotHead = $true
      try { $head = Read-HttpHead $stream } catch { $gotHead = $false }
      if (-not $gotHead) { continue }
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
        $json = $json + ',"transport":"' + $script:Transport + '"'
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
  if ($listener -ne $null) { try { $listener.Stop() } catch { } }
  if ($script:Transport -eq "winsock") { try { [WinsockServer]::Stop() } catch { } }
}
