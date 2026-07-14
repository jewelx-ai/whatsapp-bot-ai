"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.rpc("create_organization", {
      org_name: name.trim(),
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/settings");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-8">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold">🏢 Create your workspace</h1>
          <p className="text-zinc-400 text-sm mt-1">
            One workspace per business. Your team, contacts, and WhatsApp number
            live inside it.
          </p>
        </div>

        <form onSubmit={createOrg} className="space-y-3">
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Business name (e.g. Acme Foods)"
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || name.trim().length < 2}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold"
          >
            {loading ? "Creating…" : "Create workspace"}
          </button>
        </form>

        <p className="text-xs text-zinc-500">
          Next step: connect your WhatsApp number in Settings.
        </p>
      </div>
    </main>
  );
}
