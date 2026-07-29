/**
 * XPrinter / ESC-POS cash drawer kick (RJ11 on printer).
 * Pin 2 pulse — works with most XPrinter thermal models (XP-80, XP-N160, etc.).
 */
export const CASH_DRAWER_ESC_POS = "\x1B\x70\x00\x19\xFA";

export interface CashDrawerSettings {
  enabled: boolean;
  /** Local bridge URL, e.g. http://127.0.0.1:17809 */
  bridgeUrl: string;
  /** Exact Windows printer name (Settings > Printers) */
  windowsPrinterName: string;
  /** QZ Tray printer name (optional) */
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
  windowsPrinterName:
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_XPRINTER_NAME ?? ""
      : "",
  qzPrinterName: "",
  usbDirect: false,
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

async function openViaBridge(bridgeUrl: string, printerName?: string): Promise<boolean> {
  const base = bridgeUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/open-drawer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printerName: printerName || undefined }),
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

  const name = printerName.trim();
  if (!name) return false;

  const config = qz.configs.create(name, { encoding: "UTF-8" });
  await qz.print(config, [
    {
      type: "raw",
      format: "command",
      data: CASH_DRAWER_ESC_POS,
    },
  ]);
  return true;
}

export async function checkPrinterBridge(): Promise<{
  ok: boolean;
  printers?: string[];
  printer?: string;
  error?: string;
}> {
  const settings = getCashDrawerSettings();
  if (!settings.bridgeUrl) return { ok: false, error: "no-bridge-url" };
  try {
    const res = await fetch(`${settings.bridgeUrl.replace(/\/$/, "")}/health`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { ok?: boolean; printers?: string[]; printer?: string };
    return { ok: !!json.ok, printers: json.printers, printer: json.printer };
  } catch {
    return { ok: false, error: "Bridge offline — lancez scripts\\start-xprinter-bridge.bat" };
  }
}

/** Open cash drawer when payment is cash. Prefer local bridge (USB). */
export async function openCashDrawer(): Promise<{ ok: boolean; method?: string; error?: string }> {
  const settings = getCashDrawerSettings();
  if (settings.enabled === false) {
    return { ok: false, error: "disabled" };
  }

  if (settings.bridgeUrl) {
    try {
      await openViaBridge(settings.bridgeUrl, settings.windowsPrinterName);
      return { ok: true, method: "bridge" };
    } catch (err) {
      console.warn("[cash-drawer] Bridge failed:", err);
    }
  }

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
    error: "Bridge XPrinter non demarre. Sur le PC caisse: scripts\\start-xprinter-bridge.bat",
  };
}

export function shouldOpenCashDrawer(paymentMethod: string | null | undefined): boolean {
  if (!paymentMethod) return false;
  return paymentMethod.toLowerCase() === "cash";
}
