export default function Home() {
  const envOk = {
    supabase:
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    whatsapp:
      !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: !!process.env.WHATSAPP_VERIFY_TOKEN,
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
          <StatusRow ok={envOk.whatsapp} label="WhatsApp token & phone number ID" />
          <StatusRow ok={envOk.verifyToken} label="Webhook verify token set" />
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-300 space-y-2">
          <p className="font-semibold text-zinc-100">Webhook endpoint</p>
          <code className="block bg-zinc-950 rounded-lg px-3 py-2 text-emerald-400">
            POST /api/webhook
          </code>
          <p className="text-zinc-500">
            Point Meta&apos;s webhook here after deploying. See README for the
            full setup checklist.
          </p>
        </div>
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
