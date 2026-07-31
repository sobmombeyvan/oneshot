"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, FileText } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ReceiptPrintView, printReceipt, type ReceiptData } from "@/components/print/receipt";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Invoice, InvoicePayment, OrderItem } from "@/types/database";

type InvoiceWithOrder = Invoice & {
  order?: {
    table_number?: number | null;
    order_items?: (OrderItem & { product?: { name: string } })[];
  };
  payments?: InvoicePayment[];
  cashier?: { fullname?: string } | null;
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  bank_card: "Carte",
  mixed: "Mixte",
};

export default function InvoicesPage() {
  const supabase = createClient();
  const [printData, setPrintData] = useState<ReceiptData | null>(null);

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select(
          "*, cashier:profiles(fullname), payments:invoice_payments(*), order:orders(table_number, order_items(*, product:products(name)))"
        )
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as InvoiceWithOrder[];
    },
  });

  const handlePrint = (invoice: InvoiceWithOrder) => {
    const items = (invoice.order?.order_items ?? []).map((item) => ({
      name: item.product?.name ?? "Article",
      quantity: item.quantity,
      price: item.price,
    }));

    const receiptData: ReceiptData = {
      title: "Facture",
      invoiceNumber: invoice.invoice_number,
      orderId: invoice.order_id ?? undefined,
      tableNumber: invoice.order?.table_number,
      createdAt: invoice.created_at,
      items: items.length
        ? items
        : [{ name: "Total facture", quantity: 1, price: invoice.total }],
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      tax: invoice.tax,
      total: invoice.total,
      paymentMethod: invoice.payment_method,
      paymentSplits: (invoice.payments ?? []).map((p) => ({
        method: p.method,
        amount: p.amount,
      })),
      amountReceived: invoice.amount_received,
      changeDue: invoice.change_due,
    };
    setPrintData(receiptData);
    toast.success(`Impression ${invoice.invoice_number}`);
    void printReceipt(receiptData);
  };

  return (
    <div>
      <Header title="Factures" subtitle="Gestion & impression des factures" />
      {printData && <ReceiptPrintView data={printData} />}

      <div className="p-6 lg:p-8 space-y-4 no-print">
        {invoices.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-off-white/40">
              Aucune facture — validez un paiement dans Commandes.
            </CardContent>
          </Card>
        ) : (
          invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold truncate">{invoice.invoice_number}</p>
                    <p className="text-xs text-off-white/40">
                      {formatDateTime(invoice.created_at)}
                      {invoice.cashier?.fullname ? ` · ${invoice.cashier.fullname}` : ""}
                      {invoice.order?.table_number != null
                        ? ` · Table ${invoice.order.table_number}`
                        : ""}
                    </p>
                    <p className="text-xs text-off-white/50 mt-1 capitalize">
                      {(invoice.payments ?? []).length > 0
                        ? (invoice.payments ?? [])
                            .map(
                              (p) =>
                                `${METHOD_LABELS[p.method] ?? p.method} ${formatCurrency(p.amount)}`
                            )
                            .join(" · ")
                        : METHOD_LABELS[invoice.payment_method ?? ""] ?? "—"}
                      {invoice.amount_received != null && (
                        <> · reçu {formatCurrency(invoice.amount_received)}</>
                      )}
                      {(invoice.change_due ?? 0) > 0 && (
                        <> · monnaie {formatCurrency(invoice.change_due!)}</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="font-bold text-primary">{formatCurrency(invoice.total)}</p>
                    <Badge variant="secondary" className="capitalize">{invoice.status}</Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handlePrint(invoice)}>
                    <Printer className="h-4 w-4" /> Imprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
