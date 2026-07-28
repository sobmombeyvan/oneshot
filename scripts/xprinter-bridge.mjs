/**
 * Local bridge: sends ESC/POS cash-drawer kick to XPrinter (TCP port 9100).
 *
 * Usage:
 *   XPRINTER_HOST=192.168.1.50 node scripts/xprinter-bridge.mjs
 *   # USB shared on this PC:
 *   XPRINTER_HOST=127.0.0.1 node scripts/xprinter-bridge.mjs
 *
 * POST http://127.0.0.1:17809/open-drawer
 * POST http://127.0.0.1:17809/print-receipt  { "lines": ["..."] }
 */

import http from "node:http";
import net from "node:net";

const BRIDGE_PORT = parseInt(process.env.XPRINTER_BRIDGE_PORT || "17809", 10);
const PRINTER_HOST = process.env.XPRINTER_HOST || "127.0.0.1";
const PRINTER_PORT = parseInt(process.env.XPRINTER_PORT || "9100", 10);

/** ESC p m t1 t2 — pin 2, 25ms on, 250ms off (XPrinter default) */
const DRAWER_CMD = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
const INIT_CMD = Buffer.from([0x1b, 0x40]);
const ALIGN_CENTER = Buffer.from([0x1b, 0x61, 0x01]);
const ALIGN_LEFT = Buffer.from([0x1b, 0x61, 0x00]);
const CUT_CMD = Buffer.from([0x1d, 0x56, 0x00]);

function openDrawer() {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ host: PRINTER_HOST, port: PRINTER_PORT }, () => {
      client.write(DRAWER_CMD);
      client.end();
      resolve();
    });
    client.setTimeout(5000, () => {
      client.destroy();
      reject(new Error(`Printer timeout (${PRINTER_HOST}:${PRINTER_PORT})`));
    });
    client.on("error", reject);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 128000) {
        reject(new Error("Payload too large"));
      }
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

function toEscPosBuffer(lines) {
  const parts = [INIT_CMD, ALIGN_LEFT];
  for (const line of lines) {
    parts.push(Buffer.from(String(line), "utf8"));
    parts.push(Buffer.from("\n", "utf8"));
  }
  parts.push(Buffer.from("\n\n", "utf8"));
  parts.push(CUT_CMD);
  return Buffer.concat(parts);
}

function printReceipt(lines) {
  const payload = toEscPosBuffer(lines);
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
    res.end(JSON.stringify({ ok: true, printer: `${PRINTER_HOST}:${PRINTER_PORT}` }));
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
      await printReceipt(lines);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
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
  console.log(`XPrinter bridge → ${PRINTER_HOST}:${PRINTER_PORT}`);
  console.log(`POST http://127.0.0.1:${BRIDGE_PORT}/open-drawer`);
  console.log(`POST http://127.0.0.1:${BRIDGE_PORT}/print-receipt`);
});
