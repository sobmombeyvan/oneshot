/**
 * Testing mode: in-memory demo data, no Supabase, no login.
 * On by default. Set NEXT_PUBLIC_DEMO_MODE=false only for live Supabase.
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}

export const DEMO_USER = {
  id: "demo-admin-001",
  email: "admin@oneshot.cm",
  fullname: "Admin Demo",
  role: "administrator" as const,
};
