import { createClient } from "@supabase/supabase-js";

// Server-only client using the service-role key (bypasses RLS).
// Used by the webhook and other API routes. NEVER import in client components.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
