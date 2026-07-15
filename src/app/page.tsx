import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Supabase email-confirmation links land on the Site URL (/) with ?code=…
  // Hand the code to the auth callback so the user gets a session.
  const { code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  const envOk = {
    supabase:
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    verifyToken: !!process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: !!process.env.WHATSAPP_APP_SECRET,
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-lg w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold">💬 WhatsApp Bot</h1>
          <p className="text-zinc-400 mt-1">
            Next.js + Supabase + Meta WhatsApp Cloud API
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-zinc-400">
            Setup status
          </h2>
          <StatusRow ok={envOk.supabase} label="Supabase keys configured" />
          <StatusRow ok={envOk.verifyToken} label="Webhook verify token set" />
          <StatusRow ok={envOk.appSecret} label="Meta app secret set" />
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-300 space-y-2">
          <p className="font-semibold text-zinc-100">Webhook endpoint</p>
          <code className="block bg-zinc-950 rounded-lg px-3 py-2 text-emerald-400">
            POST /api/webhook
          </code>
          <p className="text-zinc-500">
            One webhook serves every workspace — incoming messages are routed
            by Phone Number ID. Each business connects its own WhatsApp number
            in Settings.
          </p>
        </div>

        <a
          href="/inbox"
          className="block text-center rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-3 font-semibold"
        >
          Open dashboard →
        </a>
      </div>
    </main>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? "text-emerald-400" : "text-amber-400"}>
        {ok ? "●" : "○"}
      </span>
      <span className={ok ? "" : "text-zinc-400"}>{label}</span>
      {!ok && <span className="text-xs text-amber-400 ml-auto">missing env</span>}
    </div>
  );
}
