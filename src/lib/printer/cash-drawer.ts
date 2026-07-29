/**
 * XPrinter / ESC-POS cash drawer kick (RJ11 on printer).
 * Pin 2 pulse — works with most XPrinter thermal models (XP-80, XP-N160, etc.).
 */
export const CASH_DRAWER_ESC_POS = "\x1B\x70\x00\x19\xFA";

export interface CashDrawerSettings {
  enabled: boolean;
  /** Local bridge URL, e.g. http://127.0.0.1:17809 */
  bridgeUrl: string;
  /** QZ Tray printer name (optional, if QZ Tray is installed) */
  qzPrinterName: string;
  /** Try direct USB serial first when available */
  usbDirect: boolean;
}

const SETTINGS_KEY = "oneshot-printer";

const DEFAULT_SETTINGS: CashDrawerSettings = {
  enabled: true,
  bridgeUrl:
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_XPRINTER_BRIDGE_URL ?? "http://127.0.0.1:17809"
      : "http://127.0.0.1:17809",
  qzPrinterName:
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_XPRINTER_NAME ?? ""
      : "",
  usbDirect: true,
};

export function getCashDrawerSettings(): CashDrawerSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

export function saveCashDrawerSettings(settings: Partial<CashDrawerSettings>) {
  const next = { ...getCashDrawerSettings(), ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

declare global {
  interface Window {
    qz?: {
      websocket: {
        isActive: () => boolean;
        connect: (opts?: { retries?: number; delay?: number }) => Promise<void>;
      };
      configs: {
        create: (name: string, opts?: { encoding?: string }) => unknown;
      };
      print: (config: unknown, data: unknown[]) => Promise<void>;
    };
  }
}

const CASH_DRAWER_BYTES = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);

async function openViaBridge(bridgeUrl: string): Promise<boolean> {
  const base = bridgeUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/open-drawer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: "escpos" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Bridge HTTP ${res.status}`);
  }
  return true;
}

async function openViaQZTray(printerName: string): Promise<boolean> {
  const qz = window.qz;
  if (!qz) return false;

  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 2, delay: 1 });
  }

  const config = qz.configs.create(printerName || undefined, { encoding: "UTF-8" });
  await qz.print(config, [
    {
      type: "raw",
      format: "command",
      data: CASH_DRAWER_ESC_POS,
    },
  ]);
  return true;
}

async function pairWebSerialPort(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serial" in navigator)) return false;
  try {
    const serialNavigator = navigator as Navigator & {
      serial: { requestPort: () => Promise<unknown> };
    };
    await serialNavigator.serial.requestPort();
    return true;
  } catch {
    return false;
  }
}

async function openViaWebSerial(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serial" in navigator)) return false;

  const serialNavigator = navigator as Navigator & {
    serial: { getPorts: () => Promise<unknown[]> };
  };
  const ports = await serialNavigator.serial.getPorts();
  if (!ports.length) return false;

  for (const port of ports) {
    const serialPort = port as {
      open: (opts: { baudRate: number; dataBits?: number; stopBits?: number; parity?: "none" | "even" | "odd" }) => Promise<void>;
      writable: WritableStream<Uint8Array> | null;
      close: () => Promise<void>;
    };
    try {
      await serialPort.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" });
      const writer = serialPort.writable?.getWriter();
      if (writer) {
        await writer.write(CASH_DRAWER_BYTES);
        writer.releaseLock();
      }
      await serialPort.close();
      return true;
    } catch (err) {
      try {
        await serialPort.close();
      } catch {
        /* ignore */
      }
      console.warn("[cash-drawer] WebSerial port failed:", err);
    }
  }
  return false;
}

export async function connectUsbCashDrawer(): Promise<boolean> {
  return pairWebSerialPort();
}

/** Open cash drawer when payment is cash. Prefer local bridge (USB/share). */
export async function openCashDrawer(): Promise<{ ok: boolean; method?: string; error?: string }> {
  const settings = getCashDrawerSettings();
  // Always force enabled for POS cash — drawer must open automatically
  const enabled = settings.enabled !== false;
  if (!enabled) {
    return { ok: false, error: "disabled" };
  }

  // 1) Local XPrinter bridge (USB share / TCP) — most reliable for POS
  if (settings.bridgeUrl) {
    try {
      await openViaBridge(settings.bridgeUrl);
      return { ok: true, method: "bridge" };
    } catch (err) {
      console.warn("[cash-drawer] Bridge failed:", err);
    }
  }

  // 2) Direct USB serial (if user authorized a COM port)
  if (settings.usbDirect) {
    try {
      const ok = await openViaWebSerial();
      if (ok) return { ok: true, method: "usb-serial" };
    } catch (err) {
      console.warn("[cash-drawer] USB serial failed:", err);
    }
  }

  // 3) QZ Tray
  if (settings.qzPrinterName && typeof window !== "undefined" && window.qz) {
    try {
      await openViaQZTray(settings.qzPrinterName);
      return { ok: true, method: "qz-tray" };
    } catch (err) {
      console.warn("[cash-drawer] QZ Tray failed:", err);
    }
  }

  return {
    ok: false,
    error: "Bridge XPrinter non demarre. Sur le PC caisse: npm run printer:bridge",
  };
}

export function shouldOpenCashDrawer(paymentMethod: string | null | undefined): boolean {
  if (!paymentMethod) return false;
  return paymentMethod.toLowerCase() === "cash";
}
