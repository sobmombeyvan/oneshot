import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Profile, UserRole } from "@/types/database";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component — ignore
        }
      },
    },
  });
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile) {
    return profile as Profile;
  }

  // Bootstrap a minimal profile when Auth user exists but trigger/profile is missing.
  // Role is forced to cashier; admin promotion is done explicitly by SQL.
  const { data: inserted } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      fullname:
        (user.user_metadata?.fullname as string | undefined) ||
        user.email ||
        "User",
      email: user.email || "",
      phone: (user.user_metadata?.phone as string | null | undefined) ?? null,
      role:
        user.email?.toLowerCase() === "sobmombeyvan@gmail.com"
          ? ("administrator" as UserRole)
          : ("cashier" as UserRole),
      avatar: null,
    })
    .select("*")
    .single();

  if (inserted) {
    return inserted as Profile;
  }

  const fallbackProfile: Profile = {
    id: user.id,
    fullname:
      (user.user_metadata?.fullname as string | undefined) ||
      user.email ||
      "User",
    email: user.email || "",
    phone: (user.user_metadata?.phone as string | null | undefined) ?? null,
    role: "cashier",
    avatar: null,
    created_at: user.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return fallbackProfile;
}
