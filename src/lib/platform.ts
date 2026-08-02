import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

// Platform (super) admin auth.
//
// This deployment has exactly ONE super admin: the account whose email matches
// PLATFORM_SUPER_ADMIN_EMAIL. Identity and passwords are handled by Supabase
// Auth (the same user table as tenants), so there is no separate credential
// store; this env var only decides which authenticated account is the operator.
//
// The operator signs in through its own portal at /admin/login, which is
// kept separate from the tenant login at /login.

export const PLATFORM_LOGIN_PATH = "/admin/login";

export type PlatformSession = { userId: string; email: string };

/** The single configured super-admin email, lowercased. */
export function superAdminEmail(): string | null {
  const raw = process.env.PLATFORM_SUPER_ADMIN_EMAIL?.trim();
  return raw ? raw.toLowerCase() : null;
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const configured = superAdminEmail();
  if (!configured || !email) return false;
  return email.trim().toLowerCase() === configured;
}

/** For API routes: the platform session, or null when not the super admin. */
export async function getPlatformAdmin(): Promise<PlatformSession | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const email = user.email ?? "";
  return isSuperAdminEmail(email) ? { userId: user.id, email } : null;
}

/**
 * For pages/layouts: send anyone who is not the super admin to the platform
 * login. Tenant users who stumble onto /admin go back to their dashboard.
 */
export async function requirePlatformAdmin(): Promise<PlatformSession> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(PLATFORM_LOGIN_PATH);

  const email = user.email ?? "";
  if (!isSuperAdminEmail(email)) redirect("/inbox");

  return { userId: user.id, email };
}
