import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Supabase redirects here (or to / with ?code=) after email confirmation /
// magic links. Exchange the code for a session cookie, then enter the app.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Auth code exchange failed:", error.message);
      return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
    }
  }
  return NextResponse.redirect(new URL("/inbox", req.nextUrl.origin));
}
