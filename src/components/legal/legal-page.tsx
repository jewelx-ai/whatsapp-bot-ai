import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/data-deletion", label: "Data Deletion" },
];

// Shared chrome for /privacy, /terms, /data-deletion: title, last-updated
// date, cross-links between the three, and a way back to the app. Plain
// server component — no client-side JS needed for static legal copy.
export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 text-slate-900">
      <Link
        href="/"
        className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700 hover:text-emerald-800"
      >
        JewelX AI — WhatsApp AI Platform
      </Link>
      <h1 className="mt-3 text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">Last updated: {updatedAt}</p>

      <section className="mt-8 space-y-4 text-sm leading-6 text-slate-700">
        {children}
      </section>

      <footer className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 pt-6 text-sm">
        {LEGAL_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
          >
            {link.label}
          </Link>
        ))}
        <Link
          href="/login"
          className="font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
        >
          Back to sign in
        </Link>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
        >
          Contact support
        </a>
      </footer>
    </main>
  );
}
