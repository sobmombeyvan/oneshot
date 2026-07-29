/**
 * XPrinter / ESC-POS cash drawer kick (RJ11 on printer).
 * Pin 2 pulse — works with most XPrinter thermal models (XP-80, XP-N160, etc.).
 */
export const CASH_DRAWER_ESC_POS = "\x1B\x70\x00\x19\xFA";

export type PaperWidth = 58 | 80;

export interface CashDrawerSettings {
  enabled: boolean;
  /** Local bridge URL, e.g. http://127.0.0.1:17809 */
  bridgeUrl: string;
  /** Exact Windows printer name (Settings > Printers) */
  windowsPrinterName: string;
  /** Thermal paper width in mm */
  paperWidth: PaperWidth;
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
      ? process.env.NEXT_PUBLIC_XPRINTER_NAME ?? "POS-58"
      : "POS-58",
  paperWidth: 58,
  qzPrinterName: "",
  usbDirect: false,
};

/**
 * Characters per line for ESC/POS font A, minus a right margin.
 * Full width is 32 (58mm) / 48 (80mm); we shrink it slightly so the ticket
 * is not printed edge to edge, while still fitting amounts in the millions.
 */
export function charsPerLine(paperWidth: PaperWidth): number {
  return paperWidth === 80 ? 44 : 30;
}

export function getCashDrawerSettings(): CashDrawerSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const stored = JSON.parse(raw) as Partial<CashDrawerSettings>;
    const merged = { ...DEFAULT_SETTINGS, ...stored };

    // A blank value saved earlier must not wipe out the default, otherwise the
    // app silently stops talking to the bridge and prints via the browser.
    if (!merged.bridgeUrl?.trim()) merged.bridgeUrl = DEFAULT_SETTINGS.bridgeUrl;
    if (!merged.windowsPrinterName?.trim()) {
      merged.windowsPrinterName = DEFAULT_SETTINGS.windowsPrinterName;
    }
    if (merged.paperWidth !== 58 && merged.paperWidth !== 80) {
      merged.paperWidth = DEFAULT_SETTINGS.paperWidth;
    }
    return merged;
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

/** A hung bridge must never freeze the checkout */
const BRIDGE_TIMEOUT_MS = 8000;

/** fetch against the local bridge, with a timeout */
export async function bridgeFetch(path: string, init?: RequestInit): Promise<Response> {
  const settings = getCashDrawerSettings();
  if (!settings.bridgeUrl) throw new Error("Aucune URL de bridge configuree");

  const base = settings.bridgeUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Turns a fetch failure into something a cashier can act on */
export function describeBridgeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.name === "AbortError") {
    return "Le bridge ne repond pas (delai depasse)";
  }
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Bridge injoignable — lancez start-xprinter-bridge.bat sur le PC caisse";
  }
  return message;
}

async function openViaBridge(printerName?: string): Promise<boolean> {
  const params = new URLSearchParams();
  if (printerName) params.set("printer", printerName);
  const query = params.toString();

  const res = await bridgeFetch(`/open-drawer${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: "",
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
    const res = await bridgeFetch("/health", { method: "GET" });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { ok?: boolean; printers?: string[]; printer?: string };
    return { ok: !!json.ok, printers: json.printers, printer: json.printer };
  } catch (err) {
    return { ok: false, error: describeBridgeError(err) };
  }
}

/** Open cash drawer when payment is cash. Prefer local bridge (USB). */
export async function openCashDrawer(): Promise<{ ok: boolean; method?: string; error?: string }> {
  const settings = getCashDrawerSettings();
  if (settings.enabled === false) {
    return { ok: false, error: "disabled" };
  }

  let bridgeError = "";
  if (settings.bridgeUrl) {
    try {
      await openViaBridge(settings.windowsPrinterName);
      return { ok: true, method: "bridge" };
    } catch (err) {
      bridgeError = describeBridgeError(err);
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
    error:
      bridgeError ||
      "Bridge XPrinter non demarre. Sur le PC caisse: scripts\\start-xprinter-bridge.bat",
  };
}

export function shouldOpenCashDrawer(paymentMethod: string | null | undefined): boolean {
  if (!paymentMethod) return false;
  return paymentMethod.toLowerCase() === "cash";
}
