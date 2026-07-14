import { createBrowserClient } from "@supabase/ssr";

// Browser client for the dashboard (uses anon key + RLS).
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
