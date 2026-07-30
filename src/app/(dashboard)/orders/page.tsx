"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Printer, CheckCircle, XCircle, Eye, Banknote, Smartphone, CreditCard, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptPrintView, printReceipt, type ReceiptData } from "@/components/print/receipt";
import { openCashDrawer, shouldOpenCashDrawer } from "@/lib/printer/cash-drawer";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import { ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/constants";
import {
  cancelOrder,
  isUnpaidOrder,
  validateOrderPayment,
} from "@/lib/orders/settle";
import type { Order, OrderItem, PaymentMethod } from "@/types/database";

type OrderRow = Order & {
  order_items?: (OrderItem & { product?: { name: string } })[];
};

const paymentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  orange_money: Smartphone,
  mtn_momo: Smartphone,
  bank_card: CreditCard,
  mixed: Layers,
};

export default function OrdersPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [payOrder, setPayOrder] = useState<OrderRow | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>("cash");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ["all-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, cashier:profiles(fullname), order_items(*, product:products(name))")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as OrderRow[];
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("orders-page-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["all-orders"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["all-orders"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, queryClient]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["all-orders"] });
    queryClient.invalidateQueries({ queryKey: ["restaurant-tables"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["recent-orders"] });
    queryClient.invalidateQueries({ queryKey: ["products-pos"] });
  };

  const payMutation = useMutation({
    mutationFn: async ({
      order,
      method,
    }: {
      order: OrderRow;
      method: PaymentMethod;
    }) => {
      const { invoiceNumber } = await validateOrderPayment(supabase, order.id, method);
      return { order, method, invoiceNumber };
    },
    onSuccess: ({ order, method, invoiceNumber }) => {
      const items = (order.order_items ?? []).map((i) => ({
        name: i.product?.name ?? "Article",
        quantity: i.quantity,
        price: i.price,
      }));
      const receiptData: ReceiptData = {
        title: "Ticket de caisse",
        invoiceNumber,
        orderId: order.id,
        tableNumber: order.table_number,
        createdAt: order.created_at,
        items,
        subtotal: order.subtotal,
        discount: order.discount,
        tax: order.tax,
        total: order.total,
        paymentMethod: method,
      };
      setReceipt(receiptData);
      setPayOrder(null);
      setSelected(null);
      refresh();
      toast.success("Paiement validé — ajouté à la comptabilité");

      const needsDrawer = shouldOpenCashDrawer(method);
      void printReceipt(receiptData).then((printResult) => {
        if (printResult.via === "bridge") {
          toast.success(needsDrawer ? "Ticket imprimé + tiroir ouvert" : "Ticket imprimé");
          return;
        }
        toast.warning(
          printResult.error
            ? `Impression navigateur — ${printResult.error}`
            : "Impression navigateur: bridge XPrinter indisponible",
          { duration: 8000 }
        );
        if (needsDrawer) void openCashDrawer();
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => cancelOrder(supabase, orderId),
    onSuccess: () => {
      setSelected(null);
      refresh();
      toast.success("Commande annulée — rien en comptabilité");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const getStatusBadge = (status: string) => {
    const s = ORDER_STATUSES.find((o) => o.value === status);
    return s ? <span className={`px-2 py-0.5 rounded-lg text-xs ${s.color}`}>{s.label}</span> : status;
  };

  const handlePrint = (order: OrderRow) => {
    const items = (order.order_items ?? []).map((i) => ({
      name: i.product?.name ?? "Article",
      quantity: i.quantity,
      price: i.price,
    }));
    const paid = order.status === "completed" && !!order.payment_method;
    const receiptData: ReceiptData = {
      title: paid ? "Ticket de caisse" : "Bon de commande",
      orderId: order.id,
      tableNumber: order.table_number,
      createdAt: order.created_at,
      items,
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      paymentMethod: order.payment_method,
      notes: paid ? order.notes : "À encaisser — pas encore en comptabilité",
    };
    setReceipt(receiptData);
    void printReceipt(receiptData);
  };

  const unpaidCount = orders.filter(isUnpaidOrder).length;

  return (
    <div>
      <Header
        title="Commandes"
        subtitle="Recevoir · imprimer reçu · valider paiement (compta) ou annuler"
      />
      {receipt && <ReceiptPrintView data={receipt} />}

      <div className="p-6 lg:p-8 space-y-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-off-white/50">
            {unpaidCount > 0 ? (
              <>
                <span className="text-amber-400 font-medium">{unpaidCount}</span> à encaisser
                {" · "}comptabilité seulement après « Valider paiement »
              </>
            ) : (
              "Aucune commande en attente d'encaissement"
            )}
          </p>
          <Button asChild>
            <Link href="/pos">
              <Plus className="h-4 w-4" /> Nouvelle commande
            </Link>
          </Button>
        </div>

        {orders.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <p className="text-off-white/40">Aucune commande</p>
              <Button asChild>
                <Link href="/pos">Créer au Point de Vente</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          orders.map((order) => {
            const unpaid = isUnpaidOrder(order);
            return (
              <Card key={order.id} className="hover:border-primary/20 transition-colors">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-bold">Table {order.table_number ?? "—"}</p>
                      {getStatusBadge(order.status)}
                      <Badge variant="secondary">#{order.id.slice(0, 8).toUpperCase()}</Badge>
                      {(order.notes?.toLowerCase().includes("tablette") ||
                        order.notes?.toLowerCase().includes("menu public") ||
                        order.notes?.toLowerCase().includes("caisse")) && (
                        <Badge variant="default">
                          {order.notes?.toLowerCase().includes("menu public")
                            ? "Menu public"
                            : order.notes?.toLowerCase().includes("tablette")
                              ? "Tablette"
                              : "Caisse"}
                        </Badge>
                      )}
                      {unpaid && <Badge variant="warning">À encaisser</Badge>}
                    </div>
                    <p className="text-xs text-off-white/40 mt-1">{formatDateTime(order.created_at)}</p>
                    <p className="text-xs text-off-white/50 mt-1">
                      {(order.order_items ?? [])
                        .map((i) => `${i.product?.name}×${i.quantity}`)
                        .join(", ") || "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-right mr-2">
                      <p className="text-lg font-bold text-primary">{formatCurrency(order.total)}</p>
                      <p className="text-xs text-off-white/40 capitalize">
                        {order.payment_method?.replace("_", " ") ?? "non payé"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelected(order)} title="Détails">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handlePrint(order)} title="Imprimer reçu">
                      <Printer className="h-4 w-4" />
                    </Button>
                    {unpaid && (
                      <>
                        <Button size="sm" onClick={() => { setSelectedPayment("cash"); setPayOrder(order); }}>
                          <CheckCircle className="h-4 w-4" /> Valider paiement
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => cancelMutation.mutate(order.id)}
                          disabled={cancelMutation.isPending}
                        >
                          <XCircle className="h-4 w-4" /> Annuler
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="no-print max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Commande #{selected?.id.slice(0, 8).toUpperCase()} — Table {selected?.table_number ?? "—"}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                {getStatusBadge(selected.status)}
                {isUnpaidOrder(selected) && <Badge variant="warning">À encaisser</Badge>}
                <span className="text-xs text-off-white/40">{formatDateTime(selected.created_at)}</span>
              </div>
              <ul className="space-y-2">
                {(selected.order_items ?? []).map((item) => (
                  <li key={item.id} className="flex justify-between text-sm border-b border-smoked-brown/20 pb-2">
                    <span>{item.product?.name} ×{item.quantity}</span>
                    <span className="text-primary">{formatCurrency(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(selected.total)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => handlePrint(selected)}>
                  <Printer className="h-4 w-4" /> Imprimer reçu
                </Button>
                {isUnpaidOrder(selected) && (
                  <>
                    <Button onClick={() => { setSelectedPayment("cash"); setPayOrder(selected); }}>
                      <CheckCircle className="h-4 w-4" /> Valider paiement
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => cancelMutation.mutate(selected.id)}
                      disabled={cancelMutation.isPending}
                    >
                      <XCircle className="h-4 w-4" /> Annuler
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!payOrder} onOpenChange={(open) => !open && setPayOrder(null)}>
        <DialogContent className="no-print max-w-md">
          <DialogHeader>
            <DialogTitle>
              Valider paiement — {payOrder ? formatCurrency(payOrder.total) : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-off-white/50">
            Table {payOrder?.table_number ?? "—"} · cette action crée la facture et ajoute le montant à la comptabilité
          </p>
          <div className="grid grid-cols-2 gap-3 py-2">
            {PAYMENT_METHODS.map((method) => {
              const Icon = paymentIcons[method.value] ?? CreditCard;
              return (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setSelectedPayment(method.value as PaymentMethod)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                    selectedPayment === method.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-smoked-brown/30 text-off-white/60 hover:border-primary/30"
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-xs font-medium">{method.label}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setPayOrder(null)}>Retour</Button>
            <Button
              disabled={!payOrder || payMutation.isPending}
              onClick={() => payOrder && payMutation.mutate({ order: payOrder, method: selectedPayment })}
            >
              <CheckCircle className="h-4 w-4" />
              {payMutation.isPending ? "Validation..." : "Confirmer & comptabiliser"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
