import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and guards dashboard routes.
export async function middleware(request: NextRequest) {
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
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isDashboard =
    path.startsWith("/inbox") ||
    path.startsWith("/contacts") ||
    path.startsWith("/auto-replies") ||
    path.startsWith("/knowledge") ||
    path.startsWith("/broadcasts") ||
    path.startsWith("/analytics") ||
    path.startsWith("/settings") ||
    path.startsWith("/onboarding");

  if (!user && isDashboard) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/inbox";
    return NextResponse.redirect(url);
  }

  return response;
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
  ],
};
