import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResetSalesResult {
  ok: boolean;
  deleted_orders: number;
  deleted_invoices: number;
}

export interface DeleteTransactionResult {
  ok: boolean;
  invoice_number: string;
  order_id: string | null;
  total: number;
}

export async function adminResetAllSales(
  supabase: SupabaseClient,
  password: string
): Promise<ResetSalesResult> {
  const { data, error } = await supabase.rpc("admin_reset_all_sales", {
    p_password: password,
  });
  if (error) throw new Error(error.message);
  return data as ResetSalesResult;
}

export async function adminDeleteTransaction(
  supabase: SupabaseClient,
  password: string,
  invoiceNumber: string
): Promise<DeleteTransactionResult> {
  const { data, error } = await supabase.rpc("admin_delete_transaction", {
    p_password: password,
    p_invoice_number: invoiceNumber.trim(),
  });
  if (error) throw new Error(error.message);
  return data as DeleteTransactionResult;
}
