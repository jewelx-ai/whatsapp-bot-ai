import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { decryptWaToken } from "@/lib/secrets";
import type { Organization } from "@/lib/types";
import type { WaCredentials } from "@/lib/whatsapp";

/** Look up a tenant by the phone_number_id Meta sends in webhook payloads. */
export async function getOrgByPhoneNumberId(
  phoneNumberId: string
): Promise<Organization | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("organizations")
    .select("*")
    .eq("wa_phone_number_id", phoneNumberId)
    .maybeSingle();
  return (data as Organization) ?? null;
}

/**
 * Resolve the signed-in dashboard user's organization (or null if not
 * logged in / not onboarded). Used by API routes.
 */
export async function getOrgForCurrentUser(): Promise<Organization | null> {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return null;

  const { data: org } = await db
    .from("organizations")
    .select("*")
    .eq("id", profile.org_id)
    .single();
  return (org as Organization) ?? null;
}

export function orgWaCredentials(org: Organization): WaCredentials {
  return {
    phoneNumberId: org.wa_phone_number_id ?? "",
    token: decryptWaToken(org.wa_access_token),
  };
}

/**
 * The signed-in user's id, org_id, and role — used by settings routes that
 * need a role check. Returns null when not logged in.
 */
export async function getCurrentProfile(): Promise<
  { userId: string; orgId: string | null; role: "owner" | "admin" | "agent" } | null
> {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    orgId: (profile?.org_id as string | null) ?? null,
    role: (profile?.role as "owner" | "admin" | "agent") ?? "agent",
  };
}
