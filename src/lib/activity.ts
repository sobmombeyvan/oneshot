import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityAction = "create" | "update" | "delete" | "stock" | "purchase" | "order";

export interface ActivityEntry {
  action: ActivityAction;
  entity: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Records an audit entry in the `notifications` table (type = "activity").
 * These entries feed the "Journal des modifications" section of the Reports page.
 * Fails silently so a logging error never blocks the main action.
 */
export async function logActivity(
  supabase: SupabaseClient,
  entry: ActivityEntry
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("notifications").insert({
      user_id: null,
      title: entry.title,
      message: entry.message,
      type: "activity",
      read: false,
      data: {
        action: entry.action,
        entity: entry.entity,
        actor: user?.id ?? null,
        ...entry.data,
      },
    });
  } catch {
    /* logging must never break the main flow */
  }
}
