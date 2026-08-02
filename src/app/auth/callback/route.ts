import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Supabase redirects here (or to / with ?code=) after email confirmation,
// magic links, and Google OAuth. Exchange the code for a session cookie, then
// enter the app. Failures go back to /login with a short code that the login
// page turns into fixed copy (never the raw provider text).
function backToLogin(req: NextRequest, code: string) {
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const next = params.get("next");

  // OAuth providers report refusals on the redirect itself, without a code:
  // ?error=access_denied&error_description=…
  const oauthError = params.get("error") ?? params.get("error_code");
  if (oauthError) {
    console.error(
      "OAuth callback error:",
      oauthError,
      params.get("error_description") ?? ""
    );
    return backToLogin(
      req,
      oauthError === "access_denied" ? "oauth_denied" : "oauth_failed"
    );
  }

  if (!code) return backToLogin(req, "link_expired");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Auth code exchange failed:", error.message);
    return backToLogin(req, "link_expired");
  }

  const redirectPath = next?.startsWith("/") && !next.startsWith("//") ? next : "/inbox";
  return NextResponse.redirect(new URL(redirectPath, req.nextUrl.origin));
}
