import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { NavLinks, SignOutButton } from "./nav";

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <aside className="w-56 shrink-0 border-r border-zinc-800 p-4 flex flex-col gap-1">
        <div className="px-2 py-3 mb-2">
          <span className="font-bold">💬 WhatsApp Bot</span>
        </div>
        <NavLinks />
        <div className="mt-auto px-2 space-y-2">
          <p className="text-xs text-zinc-500 truncate">{user.email}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
