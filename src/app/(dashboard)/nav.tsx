"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const links = [
  { href: "/inbox", label: "📥 Inbox" },
  { href: "/contacts", label: "👥 Contacts" },
  { href: "/auto-replies", label: "🤖 Auto-replies" },
  { href: "/knowledge", label: "📚 Knowledge" },
  { href: "/broadcasts", label: "📣 Broadcasts" },
  { href: "/analytics", label: "📊 Analytics" },
  { href: "/settings", label: "⚙️ Settings" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-lg px-3 py-2 text-sm ${
            pathname.startsWith(l.href)
              ? "bg-zinc-800 text-zinc-100 font-medium"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="text-sm text-zinc-400 hover:text-zinc-100"
    >
      Sign out
    </button>
  );
}
