import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateTotal } from "@/lib/utils";
import { VAT_RATE } from "@/lib/constants";
import { isUnpaidOrder } from "@/lib/orders/settle";

function getStation(categoryType?: string | null): string {
  if (categoryType === "lounge") return "bar";
  return "kitchen";
}

function withClientNote(notes: string | null | undefined, customerName: string | null) {
  const base = (notes ?? "")
    .split("\n")
    .filter((line) => !/^Client\s*:/i.test(line.trim()))
    .join("\n")
    .trim();
  const name = customerName?.trim();
  if (!name) return base || null;
  return base ? `Client: ${name}\n${base}` : `Client: ${name}`;
}

export function customerNameFromNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  const match = notes.match(/^Client\s*:\s*(.+)$/im);
  return match?.[1]?.trim() ?? "";
}

/**
 * Edit an unpaid order: add products, change quantities, set client name, recalc totals.
 * No invoice / stock impact until payment is validated.
 */
export async function amendOpenOrder(
  supabase: SupabaseClient,
  orderId: string,
  options: {
    customerName?: string | null;
    tableNumber?: number | null;
    discount?: number;
    quantityUpdates?: { item_id: string; quantity: number }[];
    addItems?: { product_id: string; quantity: number }[];
  }
): Promise<{ order_id: string; total: number }> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .single();

  if (error || !order) throw new Error(error?.message ?? "Commande introuvable");
  if (!isUnpaidOrder(order)) {
    throw new Error("Cette facture est déjà encaissée — modifiez-la dans Déjà payées");
  }

  for (const update of options.quantityUpdates ?? []) {
    if (update.quantity <= 0) {
      const { error: delError } = await supabase
        .from("order_items")
        .delete()
        .eq("id", update.item_id)
        .eq("order_id", orderId);
      if (delError) throw new Error(delError.message);
    } else {
      const { error: updError } = await supabase
        .from("order_items")
        .update({ quantity: update.quantity })
        .eq("id", update.item_id)
        .eq("order_id", orderId);
      if (updError) throw new Error(updError.message);
    }
  }

  for (const item of options.addItems ?? []) {
    if (item.quantity < 1) continue;

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, selling_price, status, category:categories(type)")
      .eq("id", item.product_id)
      .single();

    if (productError || !product || product.status !== "active") {
      throw new Error("Produit indisponible");
    }

    const categoryType = Array.isArray(product.category)
      ? product.category[0]?.type
      : (product.category as { type?: string } | null)?.type;

    const { data: existing } = await supabase
      .from("order_items")
      .select("id, quantity")
      .eq("order_id", orderId)
      .eq("product_id", item.product_id)
      .maybeSingle();

    if (existing) {
      const { error: mergeError } = await supabase
        .from("order_items")
        .update({ quantity: existing.quantity + item.quantity })
        .eq("id", existing.id);
      if (mergeError) throw new Error(mergeError.message);
    } else {
      const { error: insertError } = await supabase.from("order_items").insert({
        order_id: orderId,
        product_id: item.product_id,
        quantity: item.quantity,
        price: product.selling_price,
        station: getStation(categoryType),
      });
      if (insertError) throw new Error(insertError.message);
    }
  }

  const { data: lines, error: linesError } = await supabase
    .from("order_items")
    .select("quantity, price")
    .eq("order_id", orderId);
  if (linesError) throw new Error(linesError.message);

  const subtotal = (lines ?? []).reduce(
    (sum, line) => sum + Number(line.price) * Number(line.quantity),
    0
  );
  const discount =
    options.discount != null ? Math.max(0, options.discount) : Number(order.discount ?? 0);
  const totals = calculateTotal(subtotal, discount, VAT_RATE);

  let tableId = order.table_id as string | null;
  let tableNumber =
    options.tableNumber !== undefined ? options.tableNumber : (order.table_number as number | null);

  if (options.tableNumber !== undefined) {
    if (options.tableNumber == null) {
      tableId = null;
    } else {
      const { data: table } = await supabase
        .from("restaurant_tables")
        .select("id")
        .eq("number", options.tableNumber)
        .maybeSingle();
      tableId = table?.id ?? null;
      if (tableId) {
        await supabase
          .from("restaurant_tables")
          .update({ status: "occupied" })
          .eq("id", tableId);
      }
    }
  }

  const notes =
    options.customerName !== undefined
      ? withClientNote(order.notes, options.customerName)
      : order.notes;

  const { error: orderError } = await supabase
    .from("orders")
    .update({
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      table_number: tableNumber,
      table_id: tableId,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (orderError) throw new Error(orderError.message);

  return { order_id: orderId, total: totals.total };
}
