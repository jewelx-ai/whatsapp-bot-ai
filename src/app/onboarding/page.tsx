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
    <main className="app-shell flex min-h-screen items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-sm space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-teal-700">
            First setup
          </p>
          <h1 className="text-xl font-semibold text-slate-950">
            Create your workspace
          </h1>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            One workspace per business. Your team, contacts, and WhatsApp number
            live inside it.
          </p>
        </div>

        <form onSubmit={createOrg} className="app-panel space-y-3 p-5">
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Business name (e.g. Acme Foods)"
            className="field"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || name.trim().length < 2}
            className="btn-primary w-full"
          >
            {loading ? "Creating…" : "Create workspace"}
          </button>
        </form>

        <p className="text-xs text-slate-500">
          Next step: connect your WhatsApp number in Settings.
        </p>
      </div>
    </main>
  );
}
