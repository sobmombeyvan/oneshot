import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentSplit } from "@/types/database";

export interface SettlePaymentResult {
  invoice_id: string;
  invoice_number: string;
  payment_method: string;
  amount_received: number | null;
  change_due: number;
  cash_session_id: string | null;
  has_cash: boolean;
  customer_name?: string | null;
}

/**
 * Marks an unpaid order as paid via atomic RPC:
 * invoice + payment splits + cash movements + stock OUT + completed.
 */
export async function validateOrderPayment(
  supabase: SupabaseClient,
  orderId: string,
  payments: PaymentSplit[],
  cashReceived: number | null = null,
  customerName: string | null = null
): Promise<SettlePaymentResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  if (!payments.length) throw new Error("Aucun paiement fourni");

  const sum = payments.reduce((s, p) => s + p.amount, 0);
  if (sum <= 0) throw new Error("Montants de paiement invalides");

  const cashPart = payments
    .filter((p) => p.method === "cash")
    .reduce((s, p) => s + p.amount, 0);

  if (cashPart > 0) {
    if (cashReceived == null || cashReceived < cashPart) {
      throw new Error("Espèces reçues insuffisantes");
    }
  }

  const { data, error } = await supabase.rpc("settle_order_payment", {
    p_order_id: orderId,
    p_payments: payments,
    p_cash_received: cashPart > 0 ? cashReceived : null,
  });

  if (error) throw new Error(error.message);

  const result = data as SettlePaymentResult;
  if (!result?.invoice_number) {
    throw new Error("Paiement non confirmé");
  }

  const name = customerName?.trim() || null;
  if (name && result.invoice_id) {
    const { error: nameError } = await supabase.rpc("set_invoice_customer_name", {
      p_invoice_id: result.invoice_id,
      p_customer_name: name,
    });
    if (nameError) {
      // Fallback direct update if RPC not deployed yet
      await supabase
        .from("invoices")
        .update({ customer_name: name })
        .eq("id", result.invoice_id);
    }
    result.customer_name = name;
  }

  return result;
}

/** Cancels an order. Never creates an invoice — no accounting impact. */
export async function cancelOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, table_id, payment_method")
    .eq("id", orderId)
    .single();

  if (error || !order) throw new Error(error?.message ?? "Commande introuvable");
  if (order.status === "cancelled") return;
  if (order.status === "completed" && order.payment_method) {
    throw new Error("Impossible d'annuler une commande déjà encaissée");
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);

  if (updateError) throw new Error(updateError.message);

  if (order.table_id) {
    await supabase
      .from("restaurant_tables")
      .update({ status: "available" })
      .eq("id", order.table_id);
  }
}

export function isUnpaidOrder(order: {
  status: string;
  payment_method: string | null;
}): boolean {
  if (order.status === "cancelled") return false;
  if (order.status === "completed" && order.payment_method) return false;
  return true;
}

/** Build payment splits from UI state (single method or mixed). */
export function buildPaymentSplits(input: {
  mode: "single" | "mixed";
  method: PaymentMethodLineSafe;
  total: number;
  mixed: Partial<Record<PaymentMethodLineSafe, number>>;
}): PaymentSplit[] {
  if (input.mode === "single") {
    return [{ method: input.method, amount: roundMoney(input.total) }];
  }

  const splits: PaymentSplit[] = [];
  (["cash", "orange_money", "mtn_momo", "bank_card"] as PaymentMethodLineSafe[]).forEach(
    (method) => {
      const amount = roundMoney(Number(input.mixed[method] ?? 0));
      if (amount > 0) splits.push({ method, amount });
    }
  );
  return splits;
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type PaymentMethodLineSafe = "cash" | "orange_money" | "mtn_momo" | "bank_card";
