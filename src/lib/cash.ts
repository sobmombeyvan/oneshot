import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashMovement, CashSession } from "@/types/database";

export async function getOpenCashSession(
  supabase: SupabaseClient,
  cashierId?: string
): Promise<CashSession | null> {
  let query = supabase
    .from("cash_sessions")
    .select("*, cashier:profiles(*)")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1);

  if (cashierId) query = query.eq("cashier_id", cashierId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CashSession | null) ?? null;
}

export async function openCashSession(
  supabase: SupabaseClient,
  openingFloat: number
): Promise<string> {
  const { data, error } = await supabase.rpc("open_cash_session", {
    p_opening_float: openingFloat,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function addCashMovement(
  supabase: SupabaseClient,
  sessionId: string,
  type: "cash_in" | "cash_out",
  amount: number,
  reason: string
): Promise<string> {
  const { data, error } = await supabase.rpc("add_cash_movement", {
    p_session_id: sessionId,
    p_type: type,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function closeCashSession(
  supabase: SupabaseClient,
  sessionId: string,
  countedCash: number,
  notes?: string
): Promise<{ expected_cash: number; counted_cash: number; variance: number }> {
  const { data, error } = await supabase.rpc("close_cash_session", {
    p_session_id: sessionId,
    p_counted_cash: countedCash,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { expected_cash: number; counted_cash: number; variance: number };
}

export async function listSessionMovements(
  supabase: SupabaseClient,
  sessionId: string
): Promise<CashMovement[]> {
  const { data, error } = await supabase
    .from("cash_movements")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CashMovement[];
}

export const CASH_MOVEMENT_LABELS: Record<string, string> = {
  opening_float: "Fond d'ouverture",
  cash_sale: "Espèces reçues",
  change_out: "Monnaie rendue",
  cash_in: "Entrée caisse",
  cash_out: "Sortie caisse",
  closing: "Clôture",
};
