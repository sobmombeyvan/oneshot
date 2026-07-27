/** Testing mode: no Supabase, no login required. */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export const DEMO_USER = {
  id: "demo-admin-001",
  email: "admin@oneshot.cm",
  fullname: "Admin Demo",
  role: "administrator" as const,
};
