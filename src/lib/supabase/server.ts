import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Profile } from "@/types/database";
import { DEMO_USER, isDemoMode } from "@/lib/demo/config";
import { createDemoClient } from "@/lib/demo/mock-client";
import { getDemoStore } from "@/lib/demo/store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createClient(): Promise<any> {
  if (isDemoMode()) {
    return createDemoClient();
  }

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
  if (isDemoMode()) {
    const store = getDemoStore();
    const profile = store.profiles.find((p) => p.id === DEMO_USER.id);
    return (
      profile ?? {
        id: DEMO_USER.id,
        fullname: DEMO_USER.fullname,
        email: DEMO_USER.email,
        phone: null,
        role: DEMO_USER.role,
        avatar: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );
  }

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

  return (profile as Profile | null) ?? null;
}
