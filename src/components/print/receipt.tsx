"use client";

import { useEffect, useState } from "react";
import { BRAND, VAT_RATE } from "@/lib/constants";
import {
  bridgeFetch,
  charsPerLine,
  describeBridgeError,
  getCashDrawerSettings,
  type PaperWidth,
} from "@/lib/printer/cash-drawer";
import { formatReceiptAmount, toThermalText } from "@/lib/printer/text";
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

/** Pad two columns to the printer line width */
function padRow(left: string, right: string, width: number) {
  const l = left.slice(0, Math.max(0, width - right.length - 1));
  const spaces = Math.max(1, width - l.length - right.length);
  return `${l}${" ".repeat(spaces)}${right}`;
}

export function ReceiptPrintView({ data, id = "receipt-print" }: { data: ReceiptData; id?: string }) {
  const isInvoice = Boolean(data.invoiceNumber) || data.title?.toLowerCase().includes("facture");
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(58);

  useEffect(() => {
    setPaperWidth(getCashDrawerSettings().paperWidth);
  }, []);

  return (
    <div
      id={id}
      className={`print-only receipt-thermal hidden ${paperWidth === 80 ? "paper-80" : "paper-58"}`}
    >
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

function toReceiptLines(data: ReceiptData, paperWidth: PaperWidth): string[] {
  const isInvoice = Boolean(data.invoiceNumber) || data.title?.toLowerCase().includes("facture");
  const width = charsPerLine(paperWidth);
  const dashes = "-".repeat(width);
  const equals = "=".repeat(width);
  const amount = (value: number) => formatReceiptAmount(value);
  const row = (left: string, right: string) => padRow(toThermalText(left), toThermalText(right), width);
  // Wrapped lines would lose the left margin the bridge adds, so keep them short
  const clamp = (text: string) => {
    const safe = toThermalText(text);
    return safe.length > width ? safe.slice(0, width - 1) + "." : safe;
  };
  const lines: string[] = [];

  lines.push(clamp(BRAND.name.toUpperCase()));
  lines.push(clamp(BRAND.subtitle));
  lines.push(clamp(isInvoice ? "FACTURE" : (data.title?.toUpperCase() ?? "TICKET")));
  lines.push(dashes);

  if (data.invoiceNumber) lines.push(row("No", data.invoiceNumber));
  if (data.orderId) lines.push(row("Cmd", `#${data.orderId.slice(0, 8).toUpperCase()}`));
  if (data.tableNumber != null) lines.push(row("Table", String(data.tableNumber)));
  if (data.station) lines.push(row("Station", data.station));
  lines.push(row("Date", formatDateTime(data.createdAt)));
  lines.push(dashes);
  lines.push(row("Article", "Montant XAF"));
  lines.push(dashes);

  for (const item of data.items) {
    lines.push(clamp(item.name));
    const qty = `x${item.quantity}`;
    lines.push(item.price > 0 ? row(qty, amount(item.price * item.quantity)) : qty);
  }

  if (data.subtotal > 0 || data.total > 0) {
    lines.push(dashes);
    if (data.subtotal > 0) lines.push(row("Sous-total", amount(data.subtotal)));
    if ((data.discount ?? 0) > 0) lines.push(row("Remise", `-${amount(data.discount ?? 0)}`));
    if (VAT_RATE > 0) lines.push(row(`TVA (${VAT_RATE}%)`, amount(data.tax)));
    lines.push(equals);
    lines.push(row("TOTAL", amount(data.total)));
  }

  if (data.paymentMethod) lines.push(row("Paiement", paymentLabel(data.paymentMethod)));
  if (data.notes) lines.push(clamp(`Note: ${data.notes}`));

  lines.push(dashes);
  lines.push(clamp("Merci de votre visite !"));
  return lines;
}

function wantsDrawer(data: ReceiptData): boolean {
  const settings = getCashDrawerSettings();
  return (
    settings.enabled !== false &&
    (data.paymentMethod === "cash" || data.paymentMethod === "Cash")
  );
}

async function printViaBridge(data: ReceiptData): Promise<boolean> {
  const settings = getCashDrawerSettings();
  if (!settings.bridgeUrl) throw new Error("Aucune URL de bridge configuree");

  const params = new URLSearchParams({ drawer: wantsDrawer(data) ? "1" : "0" });
  if (settings.windowsPrinterName) params.set("printer", settings.windowsPrinterName);

  const response = await bridgeFetch(`/print-receipt?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: toReceiptLines(data, settings.paperWidth).join("\n"),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(err || `Bridge HTTP ${response.status}`);
  }

  const json = (await response.json().catch(() => ({ ok: true }))) as BridgePrintResponse;
  if (json.ok === false) throw new Error(json.error || "Le bridge a refuse le ticket");
  return true;
}

export async function printReceipt(data?: ReceiptData): Promise<{
  ok: boolean;
  via: "bridge" | "browser";
  drawer?: boolean;
  error?: string;
}> {
  let bridgeError: string | undefined;

  if (data) {
    try {
      await printViaBridge(data);
      return { ok: true, via: "bridge", drawer: wantsDrawer(data) };
    } catch (err) {
      bridgeError = describeBridgeError(err);
      console.warn("[print] Bridge failed, falling back to browser:", err);
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

  return { ok: true, via: "browser", drawer: false, error: bridgeError };
}
