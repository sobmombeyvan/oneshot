"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CheckCircle, CreditCard, Layers, Smartphone } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { getOpenCashSession } from "@/lib/cash";
import {
  buildPaymentSplits,
  roundMoney,
  validateOrderPayment,
  type SettlePaymentResult,
} from "@/lib/orders/settle";
import { formatCurrency, cn } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/constants";
import type { Order, PaymentSplit } from "@/types/database";

type LineMethod = "cash" | "orange_money" | "mtn_momo" | "bank_card";
type PayMode = "single" | "mixed";

const methods: { value: LineMethod; label: string }[] = [
  { value: "cash", label: "Espèces" },
  { value: "orange_money", label: "Orange Money" },
  { value: "mtn_momo", label: "MTN MoMo" },
  { value: "bank_card", label: "Carte" },
];

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  orange_money: Smartphone,
  mtn_momo: Smartphone,
  bank_card: CreditCard,
  mixed: Layers,
};

export function SettlePaymentDialog({
  order,
  open,
  onOpenChange,
  onPaid,
}: {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid: (
    order: Order,
    result: SettlePaymentResult,
    payments: PaymentSplit[]
  ) => void;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<PayMode>("single");
  const [method, setMethod] = useState<LineMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [mixed, setMixed] = useState<Record<LineMethod, string>>({
    cash: "",
    orange_money: "",
    mtn_momo: "",
    bank_card: "",
  });

  const { data: session } = useQuery({
    queryKey: ["open-cash-session"],
    queryFn: () => getOpenCashSession(supabase),
    refetchInterval: 15000,
  });

  const total = order?.total ?? 0;
  const mixedAmounts = useMemo(() => {
    const values: Partial<Record<LineMethod, number>> = {};
    methods.forEach(({ value }) => {
      values[value] = roundMoney(parseFloat(mixed[value]) || 0);
    });
    return values;
  }, [mixed]);
  const mixedSum = roundMoney(
    Object.values(mixedAmounts).reduce((sum, amount) => sum + (amount ?? 0), 0)
  );
  const cashDue =
    mode === "single"
      ? method === "cash"
        ? total
        : 0
      : mixedAmounts.cash ?? 0;
  const received = roundMoney(parseFloat(cashReceived) || 0);
  const change = cashDue > 0 ? roundMoney(Math.max(0, received - cashDue)) : 0;
  const valid =
    !!order &&
    (mode === "single" || Math.abs(mixedSum - total) < 0.01) &&
    (cashDue === 0 || (received >= cashDue && !!session));

  const resetForOrder = () => {
    setMode("single");
    setMethod("cash");
    setCashReceived(String(total));
    setCustomerName("");
    setMixed({ cash: "", orange_money: "", mtn_momo: "", bank_card: "" });
  };

  useEffect(() => {
    if (open && order) resetForOrder();
    // Reset only when a different order is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("Commande introuvable");
      const payments = buildPaymentSplits({
        mode,
        method,
        total,
        mixed: mixedAmounts,
      });
      const result = await validateOrderPayment(
        supabase,
        order.id,
        payments,
        cashDue > 0 ? received : null,
        customerName
      );
      return { result, payments, customerName: customerName.trim() || null };
    },
    onSuccess: ({ result, payments, customerName: paidName }) => {
      if (!order) return;
      queryClient.invalidateQueries({ queryKey: ["open-cash-session"] });
      onPaid(
        { ...order, notes: paidName ? `Client: ${paidName}` : order.notes },
        { ...result, customer_name: paidName ?? result.customer_name },
        payments
      );
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) resetForOrder();
        onOpenChange(next);
      }}
    >
      <DialogContent className="no-print max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Encaisser — {formatCurrency(total)}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-off-white/50">
          Table {order?.table_number ?? "—"} · facture créée après confirmation
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
            onClick={() => setMode("single")}
            className={cn(
              "rounded-xl border p-3 text-sm",
              mode === "single"
                ? "border-primary bg-primary/10 text-primary"
                : "border-smoked-brown/40"
            )}
          >
            Un seul mode
          </button>
          <button
            type="button"
            onClick={() => setMode("mixed")}
            className={cn(
              "rounded-xl border p-3 text-sm",
              mode === "mixed"
                ? "border-primary bg-primary/10 text-primary"
                : "border-smoked-brown/40"
            )}
          >
            Paiement mixte
          </button>
        </div>

        {mode === "single" ? (
          <div className="grid grid-cols-2 gap-3">
            {PAYMENT_METHODS.filter((item) => item.value !== "mixed").map((item) => {
              const Icon = icons[item.value] ?? CreditCard;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setMethod(item.value as LineMethod);
                    if (item.value === "cash") setCashReceived(String(total));
                  }}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border",
                    method === item.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-smoked-brown/30 text-off-white/60"
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {methods.map((item) => (
              <div key={item.value} className="space-y-1">
                <Label>{item.label}</Label>
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={mixed[item.value]}
                  onChange={(event) =>
                    setMixed((current) => ({
                      ...current,
                      [item.value]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
            <p
              className={cn(
                "text-sm text-right",
                Math.abs(mixedSum - total) < 0.01
                  ? "text-emerald-400"
                  : "text-amber-400"
              )}
            >
              {formatCurrency(mixedSum)} / {formatCurrency(total)}
            </p>
          </div>
        )}

        {cashDue > 0 && (
          <div className="space-y-3 rounded-xl border border-smoked-brown/40 bg-black/30 p-3">
            <div className="flex justify-between text-sm">
              <span>Espèces dues</span>
              <strong>{formatCurrency(cashDue)}</strong>
            </div>
            <Label>Montant reçu</Label>
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              className="h-12 text-lg"
              value={cashReceived}
              onChange={(event) => setCashReceived(event.target.value)}
            />
            <div className="flex justify-between font-bold">
              <span>À rendre</span>
              <span className="text-primary">{formatCurrency(change)}</span>
            </div>
            {!session && (
              <p className="text-xs text-amber-400">
                Ouvrez d&apos;abord votre caisse.{" "}
                <Link href="/cash" className="text-primary underline">
                  Ouvrir
                </Link>
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Retour
          </Button>
          <Button
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <CheckCircle className="h-4 w-4" />
            {mutation.isPending ? "Validation…" : "Valider & imprimer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
