import { redirect } from "next/navigation";
import { BrandMark } from "@/components/ui/icons";
import { supabaseServer } from "@/lib/supabase/server";
import { AccountPanel, MobileNavigation, NavLinks } from "./nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Multi-tenant: users without a workspace go through onboarding first
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");
  const role = profile.role as "owner" | "admin" | "agent";
  const email = user.email ?? "Signed-in user";

  return (
    <div className="app-shell lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <a href="#dashboard-content" className="skip-link">
        Skip to content
      </a>

      <aside
        aria-label="Workspace sidebar"
        className="h-app-screen sticky top-0 hidden border-r border-app-border bg-surface/95 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col"
      >
        <div className="flex items-center gap-3 border-b border-app-border px-2 pb-5">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-slate-950">
              WhatsApp Bot
            </p>
            <p className="truncate text-xs font-medium text-slate-500">
              Customer operations
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-5">
          <NavLinks />
        </div>

        <AccountPanel email={email} role={role} />
      </aside>

      <div className="min-w-0">
        <MobileNavigation email={email} role={role} />
        <main
          id="dashboard-content"
          tabIndex={-1}
          className="min-h-[calc(100dvh-4.0625rem)] min-w-0 lg:min-h-screen"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
