"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Printer, CheckCircle, XCircle, Eye, Banknote, Smartphone, CreditCard, Layers,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptPrintView, printReceipt, type ReceiptData } from "@/components/print/receipt";
import { openCashDrawer, shouldOpenCashDrawer } from "@/lib/printer/cash-drawer";
import { createClient } from "@/lib/supabase/client";
import { getOpenCashSession } from "@/lib/cash";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import { ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/constants";
import {
  buildPaymentSplits,
  cancelOrder,
  isUnpaidOrder,
  roundMoney,
  validateOrderPayment,
} from "@/lib/orders/settle";
import type { Order, OrderItem, PaymentMethod } from "@/types/database";

type OrderRow = Order & {
  order_items?: (OrderItem & { product?: { name: string } })[];
};

type PayMode = "single" | "mixed";
type LineMethod = "cash" | "orange_money" | "mtn_momo" | "bank_card";

const paymentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  orange_money: Smartphone,
  mtn_momo: Smartphone,
  bank_card: CreditCard,
  mixed: Layers,
};

const LINE_METHODS: { value: LineMethod; label: string }[] = [
  { value: "cash", label: "Espèces" },
  { value: "orange_money", label: "Orange Money" },
  { value: "mtn_momo", label: "MTN MoMo" },
  { value: "bank_card", label: "Carte" },
];

export default function OrdersPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [payOrder, setPayOrder] = useState<OrderRow | null>(null);
  const [payMode, setPayMode] = useState<PayMode>("single");
  const [selectedPayment, setSelectedPayment] = useState<LineMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [mixed, setMixed] = useState<Record<LineMethod, string>>({
    cash: "",
    orange_money: "",
    mtn_momo: "",
    bank_card: "",
  });
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

  const { data: openSession } = useQuery({
    queryKey: ["open-cash-session"],
    queryFn: () => getOpenCashSession(supabase),
    refetchInterval: 15000,
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
    queryClient.invalidateQueries({ queryKey: ["open-cash-session"] });
    queryClient.invalidateQueries({ queryKey: ["cash-movements"] });
  };

  const openPayDialog = (order: OrderRow) => {
    setPayOrder(order);
    setPayMode("single");
    setSelectedPayment("cash");
    setCashReceived(String(order.total));
    setCustomerName("");
    setMixed({ cash: "", orange_money: "", mtn_momo: "", bank_card: "" });
  };

  const total = payOrder?.total ?? 0;

  const mixedAmounts = useMemo(() => {
    const out: Partial<Record<LineMethod, number>> = {};
    LINE_METHODS.forEach(({ value }) => {
      out[value] = roundMoney(parseFloat(mixed[value]) || 0);
    });
    return out;
  }, [mixed]);

  const mixedSum = useMemo(
    () => roundMoney(Object.values(mixedAmounts).reduce((s, n) => s + (n ?? 0), 0)),
    [mixedAmounts]
  );

  const cashDue = useMemo(() => {
    if (payMode === "single") {
      return selectedPayment === "cash" ? total : 0;
    }
    return mixedAmounts.cash ?? 0;
  }, [payMode, selectedPayment, total, mixedAmounts]);

  const receivedNum = roundMoney(parseFloat(cashReceived) || 0);
  const changeDue = cashDue > 0 ? roundMoney(Math.max(0, receivedNum - cashDue)) : 0;
  const cashOk = cashDue <= 0 || receivedNum >= cashDue;
  const mixedOk = payMode === "single" || Math.abs(mixedSum - total) < 0.01;
  const needsCashSession = cashDue > 0;
  const canPay =
    !!payOrder &&
    cashOk &&
    mixedOk &&
    (!needsCashSession || !!openSession);

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payOrder) throw new Error("Aucune commande");

      const payments = buildPaymentSplits({
        mode: payMode,
        method: selectedPayment,
        total,
        mixed: mixedAmounts,
      });

      if (!payments.length) throw new Error("Aucun montant saisi");

      const result = await validateOrderPayment(
        supabase,
        payOrder.id,
        payments,
        cashDue > 0 ? receivedNum : null,
        customerName
      );

      return { order: payOrder, result, payments, customerName: customerName.trim() || null };
    },
    onSuccess: ({ order, result, payments, customerName: paidName }) => {
      const items = (order.order_items ?? []).map((i) => ({
        name: i.product?.name ?? "Article",
        quantity: i.quantity,
        price: i.price,
      }));
      const receiptData: ReceiptData = {
        title: "Ticket de caisse",
        invoiceNumber: result.invoice_number,
        orderId: order.id,
        tableNumber: order.table_number,
        customerName: paidName ?? result.customer_name ?? null,
        createdAt: order.created_at,
        items,
        subtotal: order.subtotal,
        discount: order.discount,
        tax: order.tax,
        total: order.total,
        paymentMethod: result.payment_method,
        paymentSplits: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
        })),
        amountReceived: result.amount_received,
        changeDue: result.change_due,
      };
      setReceipt(receiptData);
      setPayOrder(null);
      setSelected(null);
      refresh();
      toast.success(
        result.change_due > 0
          ? `Payé — monnaie à rendre ${formatCurrency(result.change_due)}`
          : "Paiement validé — ajouté à la comptabilité"
      );

      const hasCash = result.has_cash;
      void printReceipt(receiptData).then((printResult) => {
        if (printResult.via === "bridge") {
          toast.success(hasCash ? "Ticket imprimé + tiroir" : "Ticket imprimé");
          return;
        }
        toast.warning(
          printResult.error
            ? `Impression navigateur — ${printResult.error}`
            : "Impression navigateur: bridge XPrinter indisponible",
          { duration: 8000 }
        );
        if (hasCash && shouldOpenCashDrawer("cash")) void openCashDrawer();
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
          <div className="text-sm text-off-white/50 space-y-1">
            <p>
              {unpaidCount > 0 ? (
                <>
                  <span className="text-amber-400 font-medium">{unpaidCount}</span> à encaisser
                  {" · "}comptabilité seulement après « Valider paiement »
                </>
              ) : (
                "Aucune commande en attente d'encaissement"
              )}
            </p>
            {openSession ? (
              <p className="text-emerald-400/90 text-xs">
                Caisse ouverte · solde théorique {formatCurrency(openSession.expected_cash)}
              </p>
            ) : (
              <p className="text-amber-400/90 text-xs flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Caisse fermée —{" "}
                <Link href="/cash" className="underline text-primary">
                  ouvrir la caisse
                </Link>{" "}
                pour encaisser en espèces
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/cash">Caisse</Link>
            </Button>
            <Button asChild>
              <Link href="/pos">
                <Plus className="h-4 w-4" /> Nouvelle commande
              </Link>
            </Button>
          </div>
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
                        <Button size="sm" onClick={() => openPayDialog(order)}>
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
                    <Button onClick={() => openPayDialog(selected)}>
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
        <DialogContent className="no-print max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Valider paiement — {payOrder ? formatCurrency(payOrder.total) : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-off-white/50">
            Table {payOrder?.table_number ?? "—"} · crée la facture et met à jour la caisse
          </p>

          <div className="space-y-2">
            <Label>Nom du client (optionnel)</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ex: Jean Dupont"
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPayMode("single")}
              className={cn(
                "rounded-xl border p-3 text-sm",
                payMode === "single" ? "border-primary bg-primary/10 text-primary" : "border-smoked-brown/40"
              )}
            >
              Un seul mode
            </button>
            <button
              type="button"
              onClick={() => setPayMode("mixed")}
              className={cn(
                "rounded-xl border p-3 text-sm",
                payMode === "mixed" ? "border-primary bg-primary/10 text-primary" : "border-smoked-brown/40"
              )}
            >
              Paiement mixte
            </button>
          </div>

          {payMode === "single" ? (
            <div className="grid grid-cols-2 gap-3">
              {PAYMENT_METHODS.filter((m) => m.value !== "mixed").map((method) => {
                const Icon = paymentIcons[method.value] ?? CreditCard;
                return (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => {
                      setSelectedPayment(method.value as LineMethod);
                      if (method.value === "cash" && payOrder) {
                        setCashReceived(String(payOrder.total));
                      }
                    }}
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
          ) : (
            <div className="space-y-3">
              {LINE_METHODS.map(({ value, label }) => (
                <div key={value} className="space-y-1">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    placeholder="0"
                    value={mixed[value]}
                    onChange={(e) => setMixed((prev) => ({ ...prev, [value]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="flex justify-between text-sm">
                <span className="text-off-white/50">Somme saisie</span>
                <span className={cn(Math.abs(mixedSum - total) < 0.01 ? "text-emerald-400" : "text-amber-400")}>
                  {formatCurrency(mixedSum)} / {formatCurrency(total)}
                </span>
              </div>
            </div>
          )}

          {cashDue > 0 && (
            <div className="space-y-3 rounded-xl border border-smoked-brown/40 bg-black/30 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-off-white/50">Espèces dues</span>
                <span className="font-semibold">{formatCurrency(cashDue)}</span>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cash-received">Espèces reçues du client</Label>
                <Input
                  id="cash-received"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  className="h-12 text-lg"
                />
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Monnaie à rendre</span>
                <span className={cn(changeDue > 0 ? "text-amber-300" : "text-primary")}>
                  {formatCurrency(changeDue)}
                </span>
              </div>
              {!cashOk && (
                <p className="text-xs text-red-400">Montant reçu inférieur aux espèces dues</p>
              )}
              {!openSession && (
                <p className="text-xs text-amber-400">
                  Ouvrez votre caisse avant d&apos;encaisser des espèces.{" "}
                  <Link href="/cash" className="underline text-primary">
                    Aller à la caisse
                  </Link>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setPayOrder(null)}>Retour</Button>
            <Button
              disabled={!canPay || payMutation.isPending}
              onClick={() => payMutation.mutate()}
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
