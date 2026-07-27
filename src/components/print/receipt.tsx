"use client";

import { BRAND, VAT_RATE } from "@/lib/constants";
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

export function ReceiptPrintView({ data, id = "receipt-print" }: { data: ReceiptData; id?: string }) {
  return (
    <div id={id} className="print-only hidden bg-white text-black p-6 max-w-sm mx-auto font-mono text-sm">
      <div className="text-center mb-3">
        <h1 className="text-lg font-bold tracking-wide">{BRAND.name}</h1>
        <p className="text-xs">{BRAND.subtitle}</p>
        {data.title && <p className="text-xs font-bold mt-2 uppercase">{data.title}</p>}
        {data.invoiceNumber && <p className="text-xs mt-1">Facture: {data.invoiceNumber}</p>}
        {data.orderId && <p className="text-xs">Cmd: #{data.orderId.slice(0, 8).toUpperCase()}</p>}
        {data.tableNumber != null && <p className="text-xs font-bold">Table {data.tableNumber}</p>}
        {data.station && <p className="text-xs capitalize">Station: {data.station}</p>}
        <p className="text-xs mt-1">{formatDateTime(data.createdAt)}</p>
      </div>
      <hr className="border-dashed border-black my-2" />
      {data.items.map((item, i) => (
        <div key={i} className="flex justify-between text-xs py-0.5 gap-2">
          <span className="flex-1">{item.name} ×{item.quantity}</span>
          {item.price > 0 && <span>{formatCurrency(item.price * item.quantity)}</span>}
        </div>
      ))}
      <hr className="border-dashed border-black my-2" />
      {data.subtotal > 0 && (
        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between"><span>Sous-total</span><span>{formatCurrency(data.subtotal)}</span></div>
          {(data.discount ?? 0) > 0 && (
            <div className="flex justify-between"><span>Remise</span><span>-{formatCurrency(data.discount!)}</span></div>
          )}
          <div className="flex justify-between"><span>TVA ({VAT_RATE}%)</span><span>{formatCurrency(data.tax)}</span></div>
          <div className="flex justify-between font-bold text-sm pt-1">
            <span>TOTAL</span><span>{formatCurrency(data.total)}</span>
          </div>
        </div>
      )}
      {data.paymentMethod && (
        <p className="text-center text-xs mt-3 capitalize">
          Paiement: {data.paymentMethod.replace(/_/g, " ")}
        </p>
      )}
      {data.notes && <p className="text-xs mt-2">Note: {data.notes}</p>}
      <p className="text-center text-xs mt-3">Merci de votre visite !</p>
    </div>
  );
}

export function printReceipt() {
  // Let React paint the print-only node before invoking the browser dialog
  requestAnimationFrame(() => {
    setTimeout(() => window.print(), 50);
  });
}
