import Link from "next/link";
import { redirect } from "next/navigation";

const FEATURES = [
  {
    title: "AI-assisted replies",
    body: "Automatic, on-brand responses grounded in your own knowledge base, with human handoff when a conversation needs a person.",
  },
  {
    title: "Live team inbox",
    body: "See every WhatsApp conversation in one place, with keyword auto-replies for the routine questions.",
  },
  {
    title: "Broadcasts & analytics",
    body: "Reach opted-in contacts with template campaigns and track delivery and engagement.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Supabase email-confirmation links land on the Site URL (/) with ?code=…
  // Hand the code to the auth callback so the user gets a session.
  const { code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f5ee] text-slate-900">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">
          JewelX AI
        </span>
        <Link
          href="/login"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-6 py-12 text-center sm:py-20">
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
          JewelX AI &mdash; WhatsApp AI Platform
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          AI-powered WhatsApp automation for businesses, providing customer
          conversations, knowledge-base responses and messaging workflows
          through the official WhatsApp Business Platform.
        </p>
        <Link
          href="/login"
          className="mt-8 rounded-md bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-700/20 hover:bg-emerald-800"
        >
          Sign in to your workspace
        </Link>

        <div className="mt-16 grid w-full gap-6 text-left sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-sm font-semibold text-slate-900">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-slate-200 px-6 py-8 text-sm text-slate-600">
        <Link href="/privacy" className="underline underline-offset-2 hover:text-slate-900">
          Privacy Policy
        </Link>
        <Link href="/terms" className="underline underline-offset-2 hover:text-slate-900">
          Terms of Service
        </Link>
        <Link href="/data-deletion" className="underline underline-offset-2 hover:text-slate-900">
          Data Deletion
        </Link>
      </footer>
    </main>
  );
}
