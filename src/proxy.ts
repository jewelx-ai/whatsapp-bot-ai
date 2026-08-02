import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and guards dashboard routes.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // A dead refresh token is still presented by the browser on every request.
  // Expire stale cookies so the visitor is cleanly signed out.
  const staleAuthCookies =
    Boolean(authError) && !user
      ? request.cookies
          .getAll()
          .filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))
          .map((c) => c.name)
      : [];

  const finalize = (res: NextResponse) => {
    for (const name of staleAuthCookies) {
      res.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
    return res;
  };

  const path = request.nextUrl.pathname;

  const isAdminLogin = path === "/admin/login";
  const isAdminArea = path === "/admin" || path.startsWith("/admin/");

  if (!user && isAdminArea && !isAdminLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return finalize(NextResponse.redirect(url));
  }
  if (user && isAdminLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return finalize(NextResponse.redirect(url));
  }

  const operatorEmail = process.env.PLATFORM_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const isOperator =
    !!operatorEmail && (user?.email ?? "").toLowerCase() === operatorEmail;

  const isDashboard =
    path.startsWith("/inbox") ||
    path.startsWith("/contacts") ||
    path.startsWith("/auto-replies") ||
    path.startsWith("/knowledge") ||
    path.startsWith("/broadcasts") ||
    path.startsWith("/analytics") ||
    path.startsWith("/settings") ||
    path.startsWith("/onboarding");

  if (isOperator && (isDashboard || path === "/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return finalize(NextResponse.redirect(url));
  }

  if (!user && isDashboard) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return finalize(NextResponse.redirect(url));
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/inbox";
    return finalize(NextResponse.redirect(url));
  }

  return finalize(response);
}

export const config = {
  matcher: [
    "/inbox/:path*",
    "/contacts/:path*",
    "/auto-replies/:path*",
    "/knowledge/:path*",
    "/broadcasts/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/onboarding",
    "/login",
    "/admin",
    "/admin/:path*",
  ],
};
