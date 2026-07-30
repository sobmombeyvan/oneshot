import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInvoiceNumber } from "@/lib/utils";
import type { PaymentMethod } from "@/types/database";

/**
 * Marks an unpaid order as paid: invoice + stock OUT + status completed.
 * This is the only step that adds the sale to accounting.
 */
export async function validateOrderPayment(
  supabase: SupabaseClient,
  orderId: string,
  paymentMethod: PaymentMethod
): Promise<{ invoiceNumber: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? "Commande introuvable");
  }

  if (order.status === "cancelled") {
    throw new Error("Commande déjà annulée");
  }

  if (order.status === "completed" && order.payment_method) {
    throw new Error("Commande déjà encaissée");
  }

  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id, invoice_number, status")
    .eq("order_id", orderId)
    .eq("status", "paid")
    .maybeSingle();

  if (existingInvoice) {
    throw new Error("Facture déjà émise pour cette commande");
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "completed",
      payment_method: paymentMethod,
    })
    .eq("id", orderId);

  if (updateError) throw new Error(updateError.message);

  const invoiceNumber = generateInvoiceNumber();
  const { error: invoiceError } = await supabase.from("invoices").insert({
    invoice_number: invoiceNumber,
    order_id: orderId,
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    total: order.total,
    payment_method: paymentMethod,
    status: "paid",
    cashier_id: user.id,
  });

  if (invoiceError) throw new Error(invoiceError.message);

  const items = (order.order_items ?? []) as {
    product_id: string;
    quantity: number;
  }[];

  for (const item of items) {
    await supabase.from("stock_movements").insert({
      product_id: item.product_id,
      type: "OUT",
      quantity: item.quantity,
      reason: `Paiement validé #${orderId.slice(0, 8)}`,
      user_id: user.id,
    });
  }

  if (order.table_id) {
    await supabase
      .from("restaurant_tables")
      .update({ status: "cleaning" })
      .eq("id", order.table_id);
  }

  return { invoiceNumber };
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
  // Paid only after manager validates payment (completed + payment method)
  if (order.status === "completed" && order.payment_method) return false;
  return true;
}
