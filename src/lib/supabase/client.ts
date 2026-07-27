import { createBrowserClient } from "@supabase/ssr";
import { isDemoMode } from "@/lib/demo/config";
import { createDemoClient } from "@/lib/demo/mock-client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.local.example to .env.local and set your Supabase credentials, or set NEXT_PUBLIC_DEMO_MODE=true.`
    );
  }
  return value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient(): any {
  if (isDemoMode()) {
    return createDemoClient();
  }

  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}
