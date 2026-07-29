/**
 * Local POS bridge for XPrinter USB/LAN + cash drawer.
 *
 * USB (default, recommended):
 *   set XPRINTER_MODE=winspool
 *   set XPRINTER_NAME=XP-80C
 *   node scripts/xprinter-bridge.mjs
 *
 * Shared printer fallback:
 *   set XPRINTER_MODE=share
 *   set XPRINTER_SHARE=XP-80C
 *
 * LAN:
 *   set XPRINTER_MODE=tcp
 *   set XPRINTER_HOST=192.168.1.50
 *   set XPRINTER_PORT=9100
 */

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";

const BRIDGE_PORT = parseInt(process.env.XPRINTER_BRIDGE_PORT || "17809", 10);
const MODE = (process.env.XPRINTER_MODE || "winspool").toLowerCase();
const PRINTER_HOST = process.env.XPRINTER_HOST || "127.0.0.1";
const PRINTER_PORT = parseInt(process.env.XPRINTER_PORT || "9100", 10);
const PRINTER_SHARE = process.env.XPRINTER_SHARE || process.env.XPRINTER_NAME || "POS-58";
const PRINTER_NAME = process.env.XPRINTER_NAME || process.env.XPRINTER_SHARE || "POS-58";

const DRAWER_CMD = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
const INIT_CMD = Buffer.from([0x1b, 0x40]);
const ALIGN_CENTER = Buffer.from([0x1b, 0x61, 0x01]);
const ALIGN_LEFT = Buffer.from([0x1b, 0x61, 0x00]);
const BOLD_ON = Buffer.from([0x1b, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([0x1b, 0x45, 0x00]);
const SIZE_NORMAL = Buffer.from([0x1d, 0x21, 0x00]);
const SIZE_DOUBLE = Buffer.from([0x1d, 0x21, 0x11]); // double W+H
const SIZE_TALL = Buffer.from([0x1d, 0x21, 0x01]); // double height
const CUT_CMD = Buffer.from([0x1d, 0x56, 0x42, 0x03]);

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 128000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function toEscPosBuffer(lines, openDrawer = false) {
  const parts = [INIT_CMD, ALIGN_CENTER, SIZE_DOUBLE, BOLD_ON];
  let phase = "header"; // header | body

  for (const line of lines) {
    const text = String(line ?? "").trimEnd();
    if (!text) continue;

    if (text.startsWith("---") || text.startsWith("===")) {
      if (phase === "header") {
        parts.push(BOLD_OFF, SIZE_NORMAL, ALIGN_LEFT);
        phase = "body";
      }
      parts.push(Buffer.from(text, "utf8"), Buffer.from("\n", "utf8"));
      continue;
    }

    if (phase === "header") {
      // Brand first line stays double; next header lines tall
      parts.push(Buffer.from(text, "utf8"), Buffer.from("\n", "utf8"));
      parts.push(SIZE_TALL, BOLD_OFF);
      continue;
    }

    if (text.startsWith("TOTAL")) {
      parts.push(SIZE_TALL, BOLD_ON);
      parts.push(Buffer.from(text, "utf8"), Buffer.from("\n", "utf8"));
      parts.push(SIZE_NORMAL, BOLD_OFF);
      continue;
    }

    parts.push(Buffer.from(text, "utf8"), Buffer.from("\n", "utf8"));
  }

  if (openDrawer) parts.push(DRAWER_CMD);
  parts.push(CUT_CMD);
  return Buffer.concat(parts);
}

function sendTcp(payload) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ host: PRINTER_HOST, port: PRINTER_PORT }, () => {
      client.write(payload);
      client.end();
      resolve();
    });
    client.setTimeout(8000, () => {
      client.destroy();
      reject(new Error(`Printer timeout (${PRINTER_HOST}:${PRINTER_PORT})`));
    });
    client.on("error", reject);
  });
}

function sendWindowsShare(payload, shareName) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `oneshot-print-${Date.now()}.bin`);
    fs.writeFileSync(tmp, payload);
    const target = `\\\\localhost\\${shareName}`;
    const child = spawn("cmd.exe", ["/c", `copy /b "${tmp}" "${target}"`], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      reject(err);
    });
    child.on("close", (code) => {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `copy failed → ${target}`));
    });
  });
}

function sendWinspool(payload, printerName) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `oneshot-print-${Date.now()}.bin`);
    const ps1 = path.join(os.tmpdir(), `oneshot-rawprint-${Date.now()}.ps1`);
    fs.writeFileSync(tmp, payload);

    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.IO;
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
$printer = '${printerName.replace(/'/g, "''")}'
$bytes = [System.IO.File]::ReadAllBytes('${tmp.replace(/'/g, "''")}')
if (-not [RawPrinterHelper]::SendBytes($printer, $bytes)) {
  throw "Winspool raw print failed for printer: $printer"
}
`;
    fs.writeFileSync(ps1, script, "utf8");

    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { windowsHide: true, timeout: 15000 },
      (err, _stdout, stderr) => {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        try { fs.unlinkSync(ps1); } catch { /* ignore */ }
        if (err) reject(new Error((stderr || err.message || "Winspool failed").toString().trim()));
        else resolve();
      }
    );
  });
}

async function sendToPrinter(payload, printerOverride) {
  const name = (printerOverride || PRINTER_NAME || PRINTER_SHARE || "").trim();
  if (MODE === "tcp") return sendTcp(payload);
  if (MODE === "share") return sendWindowsShare(payload, name || PRINTER_SHARE);
  return sendWinspool(payload, name || PRINTER_NAME);
}

async function openDrawer(printerOverride) {
  await sendToPrinter(Buffer.concat([INIT_CMD, DRAWER_CMD]), printerOverride);
}

async function printReceipt(lines, openDrawerFlag = false, printerOverride) {
  await sendToPrinter(toEscPosBuffer(lines, openDrawerFlag), printerOverride);
}

function listPrinters() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        if (err) return resolve([]);
        resolve(
          stdout
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        );
      }
    );
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    const printers = await listPrinters();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        mode: MODE,
        printer: MODE === "tcp" ? `${PRINTER_HOST}:${PRINTER_PORT}` : PRINTER_NAME,
        printers,
      })
    );
    return;
  }

  if (req.url === "/open-drawer" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      await openDrawer(body?.printerName);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.url === "/print-receipt" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const lines = Array.isArray(body?.lines) ? body.lines : [];
      if (lines.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Missing lines[]" }));
        return;
      }
      await printReceipt(lines, !!body?.openDrawer, body?.printerName);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, drawer: !!body?.openDrawer }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(BRIDGE_PORT, "127.0.0.1", () => {
  console.log(`XPrinter bridge mode=${MODE}`);
  if (MODE === "tcp") console.log(`Printer TCP → ${PRINTER_HOST}:${PRINTER_PORT}`);
  else console.log(`Printer USB name → ${PRINTER_NAME}`);
  console.log(`POST http://127.0.0.1:${BRIDGE_PORT}/print-receipt`);
  console.log(`POST http://127.0.0.1:${BRIDGE_PORT}/open-drawer`);
});
