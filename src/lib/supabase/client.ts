import { createBrowserClient } from "@supabase/ssr";

function ensureValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.local.example to .env.local and set your Supabase credentials.`
    );
  }
  return value;
}

export function createClient() {
  // IMPORTANT: use explicit NEXT_PUBLIC_* access in client code.
  // Dynamic access like process.env[name] is not reliably inlined in browser bundles.
  const url = ensureValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL"
  );
  const anonKey = ensureValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );

  return createBrowserClient(
    url,
    anonKey
  );
}
