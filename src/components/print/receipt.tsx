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

export function ReceiptPrintView({ data, id = "receipt-print" }: { data: ReceiptData; id?: string }) {
  return (
    <div id={id} className="print-only receipt-80mm hidden">
      <div className="receipt-header">
        <h1 className="receipt-brand">{BRAND.name}</h1>
        <p className="receipt-sub">{BRAND.subtitle}</p>
        {data.title && <p className="receipt-title">{data.title}</p>}
        {data.invoiceNumber && <p>Facture: {data.invoiceNumber}</p>}
        {data.orderId && <p>Cmd: #{data.orderId.slice(0, 8).toUpperCase()}</p>}
        {data.tableNumber != null && <p className="receipt-strong">Table {data.tableNumber}</p>}
        {data.station && <p className="capitalize">Station: {data.station}</p>}
        <p>{formatDateTime(data.createdAt)}</p>
      </div>

      <div className="receipt-rule" />

      <div className="receipt-items">
        {data.items.map((item, i) => (
          <div key={i} className="receipt-row">
            <span className="receipt-item-name">
              {item.name} x{item.quantity}
            </span>
            {item.price > 0 && (
              <span className="receipt-item-price">
                {formatCurrency(item.price * item.quantity)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="receipt-rule" />

      {data.subtotal > 0 && (
        <div className="receipt-totals">
          <div className="receipt-row">
            <span>Sous-total</span>
            <span>{formatCurrency(data.subtotal)}</span>
          </div>
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
          <div className="receipt-row receipt-total">
            <span>TOTAL</span>
            <span>{formatCurrency(data.total)}</span>
          </div>
        </div>
      )}

      {data.paymentMethod && (
        <p className="receipt-center capitalize">
          Paiement: {data.paymentMethod.replace(/_/g, " ")}
        </p>
      )}
      {data.notes && <p className="receipt-notes">Note: {data.notes}</p>}
      <p className="receipt-center receipt-thanks">Merci de votre visite !</p>
    </div>
  );
}

function toReceiptLines(data: ReceiptData): string[] {
  const lines: string[] = [];
  lines.push(BRAND.name.toUpperCase());
  lines.push(BRAND.subtitle);
  if (data.title) lines.push(data.title.toUpperCase());
  if (data.invoiceNumber) lines.push(`Facture: ${data.invoiceNumber}`);
  if (data.orderId) lines.push(`Cmd: #${data.orderId.slice(0, 8).toUpperCase()}`);
  if (data.tableNumber != null) lines.push(`Table ${data.tableNumber}`);
  if (data.station) lines.push(`Station: ${data.station}`);
  lines.push(formatDateTime(data.createdAt));
  lines.push("--------------------------------");
  for (const item of data.items) {
    const left = `${item.name} x${item.quantity}`;
    const right = item.price > 0 ? formatCurrency(item.price * item.quantity) : "";
    lines.push(right ? `${left}  ${right}` : left);
  }
  lines.push("--------------------------------");
  if (data.subtotal > 0) {
    lines.push(`Sous-total: ${formatCurrency(data.subtotal)}`);
    if ((data.discount ?? 0) > 0) lines.push(`Remise: -${formatCurrency(data.discount ?? 0)}`);
    if (VAT_RATE > 0) lines.push(`TVA (${VAT_RATE}%): ${formatCurrency(data.tax)}`);
    lines.push(`TOTAL: ${formatCurrency(data.total)}`);
  }
  if (data.paymentMethod) lines.push(`Paiement: ${data.paymentMethod.replace(/_/g, " ")}`);
  if (data.notes) lines.push(`Note: ${data.notes}`);
  lines.push("");
  lines.push("Merci de votre visite !");
  lines.push("");
  return lines;
}

async function printViaBridge(data: ReceiptData): Promise<boolean> {
  const settings = getCashDrawerSettings();
  if (!settings.bridgeUrl) return false;
  const base = settings.bridgeUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/print-receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines: toReceiptLines(data) }),
  });
  if (!response.ok) return false;
  const json = (await response.json().catch(() => ({ ok: false }))) as BridgePrintResponse;
  return !!json.ok;
}

export async function printReceipt(data?: ReceiptData) {
  if (data) {
    try {
      const ok = await printViaBridge(data);
      if (ok) return;
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
      // Fallback if afterprint never fires
      setTimeout(cleanup, 2000);
    }, 50);
  });
}
