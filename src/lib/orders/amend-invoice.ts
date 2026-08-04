import type { SupabaseClient } from "@supabase/supabase-js";

export interface AmendInvoiceResult {
  ok: boolean;
  invoice_id: string;
  invoice_number: string;
  customer_name: string | null;
  subtotal: number;
  total: number;
  added_amount: number;
}

export async function amendInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  options: {
    customerName?: string | null;
    items?: { product_id: string; quantity: number }[];
  }
): Promise<AmendInvoiceResult> {
  const { data, error } = await supabase.rpc("amend_invoice", {
    p_invoice_id: invoiceId,
    p_customer_name: options.customerName ?? null,
    p_items: options.items ?? [],
  });
  if (error) throw new Error(error.message);
  return data as AmendInvoiceResult;
}
