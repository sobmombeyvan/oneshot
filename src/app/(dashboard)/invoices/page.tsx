"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Printer, FileText, Eye, Pencil, Plus, Minus, Search, Banknote, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptPrintView, printReceipt, type ReceiptData } from "@/components/print/receipt";
import { SettlePaymentDialog } from "@/components/orders/settle-payment-dialog";
import { createClient } from "@/lib/supabase/client";
import { amendInvoice } from "@/lib/orders/amend-invoice";
import { isUnpaidOrder, type SettlePaymentResult } from "@/lib/orders/settle";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import type {
  Invoice,
  InvoicePayment,
  Order,
  OrderItem,
  PaymentSplit,
  Product,
} from "@/types/database";

type InvoiceWithOrder = Invoice & {
  order?: {
    table_number?: number | null;
    order_items?: (OrderItem & { product?: { name: string } })[];
  };
  payments?: InvoicePayment[];
  cashier?: { fullname?: string } | null;
};

type OpenOrder = Order & {
  order_items?: (OrderItem & { product?: { name: string } })[];
  cashier?: { fullname?: string } | null;
};

type AddLine = { product: Product; quantity: number };
type TabKey = "open" | "paid";

const METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  bank_card: "Carte",
  mixed: "Mixte",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  preparing: "En préparation",
  ready: "Prête",
  served: "Servie",
  completed: "Terminée",
  cancelled: "Annulée",
};

export default function InvoicesPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("open");
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  const [previewData, setPreviewData] = useState<ReceiptData | null>(null);
  const [editInvoice, setEditInvoice] = useState<InvoiceWithOrder | null>(null);
  const [orderToSettle, setOrderToSettle] = useState<OpenOrder | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [addLines, setAddLines] = useState<AddLine[]>([]);

  const { data: openOrders = [] } = useQuery({
    queryKey: ["invoices-open-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "*, cashier:profiles(fullname), order_items(*, product:products(name))"
        )
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return ((data ?? []) as OpenOrder[]).filter(isUnpaidOrder);
    },
    refetchInterval: 8000,
  });

  const { data: invoices = [], refetch } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select(
          "*, cashier:profiles(fullname), payments:invoice_payments(*), order:orders(table_number, order_items(*, product:products(name)))"
        )
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(80);
      return (data ?? []) as InvoiceWithOrder[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-invoice-amend"],
    enabled: !!editInvoice,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*, category:categories(*)")
        .eq("status", "active")
        .order("name")
        .limit(200);
      return (data ?? []) as Product[];
    },
  });

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 40);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [products, productSearch]);

  const addLinesTotal = useMemo(
    () =>
      addLines.reduce((sum, line) => sum + line.product.selling_price * line.quantity, 0),
    [addLines]
  );

  const openTotal = useMemo(
    () => openOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
    [openOrders]
  );
  const paidTotal = useMemo(
    () => invoices.reduce((sum, inv) => sum + Number(inv.total ?? 0), 0),
    [invoices]
  );

  const buildReceipt = (invoice: InvoiceWithOrder): ReceiptData => {
    const items = (invoice.order?.order_items ?? []).map((item) => ({
      name: item.product?.name ?? "Article",
      quantity: item.quantity,
      price: item.price,
    }));

    return {
      title: "Facture",
      invoiceNumber: invoice.invoice_number,
      orderId: invoice.order_id ?? undefined,
      tableNumber: invoice.order?.table_number,
      customerName: invoice.customer_name,
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
  };

  const buildOpenOrderReceipt = (order: OpenOrder): ReceiptData => ({
    title: "Bon de commande",
    orderId: order.id,
    tableNumber: order.table_number,
    createdAt: order.created_at,
    items: (order.order_items ?? []).map((item) => ({
      name: item.product?.name ?? "Article",
      quantity: item.quantity,
      price: item.price,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    total: order.total,
    paymentMethod: null,
    notes: "En cours — pas encore payée",
  });

  const handlePrint = (invoice: InvoiceWithOrder) => {
    const receiptData = buildReceipt(invoice);
    setPrintData(receiptData);
    toast.success(`Impression ${invoice.invoice_number}`);
    void printReceipt(receiptData);
  };

  const openEdit = (invoice: InvoiceWithOrder) => {
    setEditInvoice(invoice);
    setCustomerName(invoice.customer_name ?? "");
    setAddLines([]);
    setProductSearch("");
  };

  const upsertLine = (product: Product, delta: number) => {
    setAddLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (!existing) {
        return delta > 0 ? [...prev, { product, quantity: delta }] : prev;
      }
      const quantity = existing.quantity + delta;
      if (quantity <= 0) return prev.filter((l) => l.product.id !== product.id);
      return prev.map((l) =>
        l.product.id === product.id ? { ...l, quantity } : l
      );
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editInvoice) throw new Error("Facture introuvable");
      return amendInvoice(supabase, editInvoice.id, {
        customerName,
        items: addLines.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
        })),
      });
    },
    onSuccess: async (result) => {
      toast.success(
        result.added_amount > 0
          ? `Facture mise à jour (+${formatCurrency(result.added_amount)})`
          : "Nom client enregistré"
      );
      setEditInvoice(null);
      setAddLines([]);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["open-cash-session"] });
      const { data } = await refetch();
      const updated = (data as InvoiceWithOrder[] | undefined)?.find(
        (inv) => inv.id === result.invoice_id
      );
      if (updated) {
        const receipt = buildReceipt(updated);
        setPrintData(receipt);
        void printReceipt(receipt);
        toast.message("Réimpression de la facture…");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handlePaid = (
    order: Order,
    result: SettlePaymentResult,
    payments: PaymentSplit[]
  ) => {
    const full = order as OpenOrder;
    const receiptData: ReceiptData = {
      title: "Facture",
      invoiceNumber: result.invoice_number,
      orderId: order.id,
      tableNumber: order.table_number,
      customerName: result.customer_name ?? null,
      createdAt: new Date().toISOString(),
      items: (full.order_items ?? []).map((item) => ({
        name: item.product?.name ?? "Article",
        quantity: item.quantity,
        price: item.price,
      })),
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      paymentMethod: result.payment_method,
      paymentSplits: payments,
      amountReceived: result.amount_received,
      changeDue: result.change_due,
    };
    setPrintData(receiptData);
    setOrderToSettle(null);
    setTab("paid");
    queryClient.invalidateQueries({ queryKey: ["invoices-open-orders"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    toast.success("Paiement validé — facture dans « Déjà payées »");
    void printReceipt(receiptData);
  };

  return (
    <div>
      <Header
        title="Factures"
        subtitle="En cours à encaisser · déjà payées à réimprimer"
      />
      {printData && <ReceiptPrintView data={printData} />}

      <div className="p-6 lg:p-8 space-y-4 no-print">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTab("open")}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              tab === "open"
                ? "border-primary bg-primary/10"
                : "border-smoked-brown/40 hover:border-primary/40"
            )}
          >
            <div className="flex items-center gap-2 text-sm text-off-white/60">
              <Clock className="h-4 w-4" /> En cours
            </div>
            <p className="mt-1 text-2xl font-bold">{openOrders.length}</p>
            <p className="text-sm text-primary">{formatCurrency(openTotal)}</p>
          </button>
          <button
            type="button"
            onClick={() => setTab("paid")}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              tab === "paid"
                ? "border-primary bg-primary/10"
                : "border-smoked-brown/40 hover:border-primary/40"
            )}
          >
            <div className="flex items-center gap-2 text-sm text-off-white/60">
              <FileText className="h-4 w-4" /> Déjà payées
            </div>
            <p className="mt-1 text-2xl font-bold">{invoices.length}</p>
            <p className="text-sm text-primary">{formatCurrency(paidTotal)}</p>
          </button>
        </div>

        {tab === "open" ? (
          openOrders.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-off-white/40 space-y-3">
                <p>Aucune facture en cours.</p>
                <Button asChild>
                  <Link href="/pos">Ouvrir le POS</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            openOrders.map((order) => (
              <Card key={order.id}>
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-lg">
                        Table {order.table_number ?? "—"}
                      </p>
                      <Badge variant="warning">
                        {STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                      {order.notes?.toLowerCase().includes("menu public") && (
                        <Badge>Menu public</Badge>
                      )}
                      {order.notes?.toLowerCase().includes("tablette") && (
                        <Badge>Tablette</Badge>
                      )}
                    </div>
                    <p className="text-xs text-off-white/40 mt-1">
                      {formatDateTime(order.created_at)}
                      {order.cashier?.fullname ? ` · ${order.cashier.fullname}` : ""}
                      {" · "}#{order.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="text-xs text-off-white/50 mt-1 truncate">
                      {(order.order_items ?? [])
                        .map((item) => `${item.product?.name ?? "Article"} ×${item.quantity}`)
                        .join(", ") || "Aucun article"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <p className="font-bold text-primary text-lg mr-2">
                      {formatCurrency(order.total)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewData(buildOpenOrderReceipt(order))}
                    >
                      <Eye className="h-4 w-4" /> Aperçu
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const receipt = buildOpenOrderReceipt(order);
                        setPrintData(receipt);
                        void printReceipt(receipt);
                      }}
                    >
                      <Printer className="h-4 w-4" /> Bon
                    </Button>
                    <Button size="sm" onClick={() => setOrderToSettle(order)}>
                      <Banknote className="h-4 w-4" /> Encaisser
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )
        ) : invoices.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-off-white/40">
              Aucune facture payée pour le moment.
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
                      {invoice.customer_name ? ` · ${invoice.customer_name}` : ""}
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
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className="text-right mr-2">
                    <p className="font-bold text-primary">{formatCurrency(invoice.total)}</p>
                    <Badge variant="secondary">Payée</Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(invoice)}>
                    <Pencil className="h-4 w-4" /> Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewData(buildReceipt(invoice))}
                  >
                    <Eye className="h-4 w-4" /> Aperçu
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handlePrint(invoice)}>
                    <Printer className="h-4 w-4" /> Imprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <SettlePaymentDialog
        order={orderToSettle}
        open={!!orderToSettle}
        onOpenChange={(open) => !open && setOrderToSettle(null)}
        onPaid={handlePaid}
      />

      <Dialog open={!!previewData} onOpenChange={(open) => !open && setPreviewData(null)}>
        <DialogContent className="no-print max-w-lg">
          <DialogHeader>
            <DialogTitle>Aperçu</DialogTitle>
          </DialogHeader>
          {previewData && (
            <>
              <div className="rounded-xl bg-black/40 p-4 overflow-auto">
                <ReceiptPrintView data={previewData} id="invoice-preview" preview />
              </div>
              <Button
                className="w-full h-12"
                onClick={() => {
                  setPrintData(previewData);
                  void printReceipt(previewData);
                }}
              >
                <Printer className="h-4 w-4" /> Imprimer
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editInvoice}
        onOpenChange={(open) => {
          if (!open) {
            setEditInvoice(null);
            setAddLines([]);
          }
        }}
      >
        <DialogContent className="no-print max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Modifier {editInvoice?.invoice_number} — {formatCurrency(editInvoice?.total ?? 0)}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Nom du client</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nom qui apparaîtra sur la facture"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label>Articles déjà sur la facture</Label>
            <div className="rounded-xl border border-smoked-brown/30 bg-black/20 p-3 space-y-1 max-h-36 overflow-y-auto text-sm">
              {(editInvoice?.order?.order_items ?? []).length === 0 ? (
                <p className="text-off-white/40">Aucun article</p>
              ) : (
                (editInvoice?.order?.order_items ?? []).map((item) => (
                  <div key={item.id} className="flex justify-between gap-2">
                    <span>
                      {item.product?.name ?? "Article"} ×{item.quantity}
                    </span>
                    <span>{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Ajouter des produits</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Rechercher un produit…"
                className="pl-10"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => upsertLine(product, 1)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-smoked-brown/30 bg-charcoal/50 px-3 py-2 text-left hover:border-primary/40"
                >
                  <span className="truncate text-sm">{product.name}</span>
                  <span className="text-primary text-sm shrink-0">
                    {formatCurrency(product.selling_price)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {addLines.length > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-sm font-medium">À ajouter</p>
              {addLines.map((line) => (
                <div key={line.product.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{line.product.name}</span>
                  <button
                    type="button"
                    className="p-1 rounded-lg hover:bg-smoked-brown/30"
                    onClick={() => upsertLine(line.product, -1)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center font-bold">{line.quantity}</span>
                  <button
                    type="button"
                    className="p-1 rounded-lg hover:bg-smoked-brown/30"
                    onClick={() => upsertLine(line.product, 1)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-24 text-right">
                    {formatCurrency(line.product.selling_price * line.quantity)}
                  </span>
                </div>
              ))}
              <p className="text-right font-bold text-primary">
                + {formatCurrency(addLinesTotal)}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" onClick={() => setEditInvoice(null)}>
              Annuler
            </Button>
            <Button
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <Printer className="h-4 w-4" />
              {saveMutation.isPending ? "Enregistrement…" : "Sauver & réimprimer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
