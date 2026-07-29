"use client";

import { BRAND, VAT_RATE } from "@/lib/constants";
import { getCashDrawerSettings } from "@/lib/printer/cash-drawer";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
}

export interface ReceiptData {
  title?: string;
  invoiceNumber?: string;
  orderId?: string;
  tableNumber?: number | null;
  createdAt: string;
  items: ReceiptItem[];
  subtotal: number;
  discount?: number;
  tax: number;
  total: number;
  paymentMethod?: string | null;
  station?: string;
  notes?: string | null;
}

interface BridgePrintResponse {
  ok: boolean;
  error?: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  bank_card: "Carte bancaire",
  mixed: "Mixte",
};

function paymentLabel(method?: string | null) {
  if (!method) return "";
  return PAYMENT_LABELS[method] ?? method.replace(/_/g, " ");
}

/** Pad two columns for ~32-char thermal width */
function padRow(left: string, right: string, width = 32) {
  const l = left.slice(0, Math.max(0, width - right.length - 1));
  const spaces = Math.max(1, width - l.length - right.length);
  return `${l}${" ".repeat(spaces)}${right}`;
}

export function ReceiptPrintView({ data, id = "receipt-print" }: { data: ReceiptData; id?: string }) {
  const isInvoice = Boolean(data.invoiceNumber) || data.title?.toLowerCase().includes("facture");

  return (
    <div id={id} className="print-only receipt-80mm hidden">
      <div className="receipt-header">
        <h1 className="receipt-brand">{BRAND.name}</h1>
        <p className="receipt-sub">{BRAND.subtitle}</p>
        <p className="receipt-title">{isInvoice ? "FACTURE" : (data.title ?? "TICKET")}</p>
      </div>

      <div className="receipt-meta">
        {data.invoiceNumber && (
          <div className="receipt-row">
            <span>N°</span>
            <span className="receipt-strong">{data.invoiceNumber}</span>
          </div>
        )}
        {data.orderId && (
          <div className="receipt-row">
            <span>Cmd</span>
            <span>#{data.orderId.slice(0, 8).toUpperCase()}</span>
          </div>
        )}
        {data.tableNumber != null && (
          <div className="receipt-row">
            <span>Table</span>
            <span className="receipt-strong">{data.tableNumber}</span>
          </div>
        )}
        {data.station && (
          <div className="receipt-row">
            <span>Station</span>
            <span className="capitalize">{data.station}</span>
          </div>
        )}
        <div className="receipt-row">
          <span>Date</span>
          <span>{formatDateTime(data.createdAt)}</span>
        </div>
      </div>

      <div className="receipt-rule" />

      <div className="receipt-cols">
        <span>Article</span>
        <span>Qté</span>
        <span>Montant</span>
      </div>
      <div className="receipt-rule thin" />

      <div className="receipt-items">
        {data.items.map((item, i) => (
          <div key={i} className="receipt-item">
            <div className="receipt-item-name">{item.name}</div>
            <div className="receipt-item-line">
              <span className="receipt-qty">x{item.quantity}</span>
              {item.price > 0 && (
                <span className="receipt-item-price">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {(data.subtotal > 0 || data.total > 0) && (
        <>
          <div className="receipt-rule" />
          <div className="receipt-totals">
            {data.subtotal > 0 && (
              <div className="receipt-row">
                <span>Sous-total</span>
                <span>{formatCurrency(data.subtotal)}</span>
              </div>
            )}
            {(data.discount ?? 0) > 0 && (
              <div className="receipt-row">
                <span>Remise</span>
                <span>-{formatCurrency(data.discount!)}</span>
              </div>
            )}
            {VAT_RATE > 0 && (
              <div className="receipt-row">
                <span>TVA ({VAT_RATE}%)</span>
                <span>{formatCurrency(data.tax)}</span>
              </div>
            )}
            <div className="receipt-total-block">
              <div className="receipt-row receipt-total">
                <span>TOTAL</span>
                <span>{formatCurrency(data.total)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {data.paymentMethod && (
        <div className="receipt-row receipt-pay">
          <span>Paiement</span>
          <span>{paymentLabel(data.paymentMethod)}</span>
        </div>
      )}
      {data.notes && <p className="receipt-notes">Note: {data.notes}</p>}

      <div className="receipt-rule" />
      <p className="receipt-thanks">Merci de votre visite !</p>
    </div>
  );
}

function toReceiptLines(data: ReceiptData): string[] {
  const isInvoice = Boolean(data.invoiceNumber) || data.title?.toLowerCase().includes("facture");
  const lines: string[] = [];

  lines.push(BRAND.name.toUpperCase());
  lines.push(BRAND.subtitle);
  lines.push(isInvoice ? "FACTURE" : (data.title?.toUpperCase() ?? "TICKET"));
  lines.push("--------------------------------");

  if (data.invoiceNumber) lines.push(padRow("N°", data.invoiceNumber));
  if (data.orderId) lines.push(padRow("Cmd", `#${data.orderId.slice(0, 8).toUpperCase()}`));
  if (data.tableNumber != null) lines.push(padRow("Table", String(data.tableNumber)));
  if (data.station) lines.push(padRow("Station", data.station));
  lines.push(padRow("Date", formatDateTime(data.createdAt)));
  lines.push("--------------------------------");

  for (const item of data.items) {
    lines.push(item.name);
    const qty = `x${item.quantity}`;
    const amount = item.price > 0 ? formatCurrency(item.price * item.quantity) : "";
    lines.push(amount ? padRow(qty, amount) : qty);
  }

  if (data.subtotal > 0 || data.total > 0) {
    lines.push("--------------------------------");
    if (data.subtotal > 0) lines.push(padRow("Sous-total", formatCurrency(data.subtotal)));
    if ((data.discount ?? 0) > 0) lines.push(padRow("Remise", `-${formatCurrency(data.discount ?? 0)}`));
    if (VAT_RATE > 0) lines.push(padRow(`TVA (${VAT_RATE}%)`, formatCurrency(data.tax)));
    lines.push("================================");
    lines.push(padRow("TOTAL", formatCurrency(data.total)));
  }

  if (data.paymentMethod) lines.push(padRow("Paiement", paymentLabel(data.paymentMethod)));
  if (data.notes) lines.push(`Note: ${data.notes}`);

  lines.push("--------------------------------");
  lines.push("Merci de votre visite !");
  return lines;
}

async function printViaBridge(data: ReceiptData): Promise<boolean> {
  const settings = getCashDrawerSettings();
  if (!settings.bridgeUrl) return false;
  const base = settings.bridgeUrl.replace(/\/$/, "");
  const openDrawer =
    settings.enabled &&
    (data.paymentMethod === "cash" || data.paymentMethod === "Cash");
  const response = await fetch(`${base}/print-receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines: toReceiptLines(data), openDrawer }),
  });
  if (!response.ok) return false;
  const json = (await response.json().catch(() => ({ ok: false }))) as BridgePrintResponse;
  return !!json.ok;
}

export async function printReceipt(data?: ReceiptData): Promise<{ ok: boolean; via: "bridge" | "browser"; drawer?: boolean }> {
  if (data) {
    try {
      const settings = getCashDrawerSettings();
      const openDrawer =
        settings.enabled !== false &&
        (data.paymentMethod === "cash" || data.paymentMethod === "Cash");
      const ok = await printViaBridge(data);
      if (ok) return { ok: true, via: "bridge", drawer: openDrawer };
    } catch {
      // fallback to browser dialog
    }
  }

  requestAnimationFrame(() => {
    setTimeout(() => {
      document.body.classList.add("printing-receipt");
      const cleanup = () => {
        document.body.classList.remove("printing-receipt");
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      window.print();
      setTimeout(cleanup, 2000);
    }, 50);
  });
  return { ok: true, via: "browser", drawer: false };
}
