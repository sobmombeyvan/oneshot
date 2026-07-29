/**
 * Local POS bridge for XPrinter (USB or LAN) + cash drawer.
 *
 * USB (recommended on Windows):
 *   set XPRINTER_MODE=share
 *   set XPRINTER_SHARE=XP-80C
 *   node scripts/xprinter-bridge.mjs
 *
 * LAN / Ethernet printer:
 *   set XPRINTER_MODE=tcp
 *   set XPRINTER_HOST=192.168.1.50
 *   set XPRINTER_PORT=9100
 *   node scripts/xprinter-bridge.mjs
 *
 * Endpoints:
 *   GET  /health
 *   POST /open-drawer
 *   POST /print-receipt  { "lines": ["..."], "openDrawer": true }
 */

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const BRIDGE_PORT = parseInt(process.env.XPRINTER_BRIDGE_PORT || "17809", 10);
const MODE = (process.env.XPRINTER_MODE || "share").toLowerCase(); // share | tcp
const PRINTER_HOST = process.env.XPRINTER_HOST || "127.0.0.1";
const PRINTER_PORT = parseInt(process.env.XPRINTER_PORT || "9100", 10);
const PRINTER_SHARE = process.env.XPRINTER_SHARE || "Xprinter";

/** ESC p m t1 t2 — pin 2, 25ms on, 250ms off */
const DRAWER_CMD = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
const INIT_CMD = Buffer.from([0x1b, 0x40]);
const ALIGN_CENTER = Buffer.from([0x1b, 0x61, 0x01]);
const ALIGN_LEFT = Buffer.from([0x1b, 0x61, 0x00]);
/** GS V 66 n — feed n lines then partial cut */
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
  const parts = [INIT_CMD];
  let centered = true;
  parts.push(ALIGN_CENTER);

  for (const line of lines) {
    const text = String(line ?? "").trimEnd();
    if (!text) continue;

    if (text.startsWith("---") || text.startsWith("===")) {
      if (centered) {
        parts.push(ALIGN_LEFT);
        centered = false;
      }
    }

    parts.push(Buffer.from(text, "utf8"));
    parts.push(Buffer.from("\n", "utf8"));
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

function sendWindowsShare(payload) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `oneshot-print-${Date.now()}.bin`);
    try {
      fs.writeFileSync(tmp, payload);
    } catch (err) {
      reject(err);
      return;
    }

    // Raw copy to Windows shared/local printer (USB works this way)
    const target = `\\\\localhost\\${PRINTER_SHARE}`;
    const child = spawn("cmd.exe", ["/c", `copy /b "${tmp}" "${target}"`], {
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      reject(err);
    });
    child.on("close", (code) => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `copy failed (code ${code}) → ${target}`));
    });
  });
}

async function sendToPrinter(payload) {
  if (MODE === "tcp") return sendTcp(payload);
  return sendWindowsShare(payload);
}

async function openDrawer() {
  await sendToPrinter(Buffer.concat([INIT_CMD, DRAWER_CMD]));
}

async function printReceipt(lines, openDrawerFlag = false) {
  await sendToPrinter(toEscPosBuffer(lines, openDrawerFlag));
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
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        mode: MODE,
        printer:
          MODE === "tcp"
            ? `${PRINTER_HOST}:${PRINTER_PORT}`
            : `\\\\localhost\\${PRINTER_SHARE}`,
      })
    );
    return;
  }

  if (req.url === "/open-drawer" && req.method === "POST") {
    try {
      await openDrawer();
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
      await printReceipt(lines, !!body?.openDrawer);
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
  else console.log(`Printer USB/share → \\\\localhost\\${PRINTER_SHARE}`);
  console.log(`POST http://127.0.0.1:${BRIDGE_PORT}/open-drawer`);
  console.log(`POST http://127.0.0.1:${BRIDGE_PORT}/print-receipt`);
});
