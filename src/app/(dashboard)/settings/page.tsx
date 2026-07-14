"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Organization } from "@/lib/types";

export default function SettingsPage() {
  const supabase = useRef(supabaseBrowser()).current;
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("organizations").select("*").maybeSingle();
    if (data) {
      const o = data as Organization;
      setOrg(o);
      setName(o.name);
      setPhoneNumberId(o.wa_phone_number_id ?? "");
      setAccessToken(o.wa_access_token ?? "");
      setAiEnabled(o.ai_enabled);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!org) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: name.trim(),
        wa_phone_number_id: phoneNumberId.trim() || null,
        wa_access_token: accessToken.trim() || null,
        ai_enabled: aiEnabled,
      })
      .eq("id", org.id);
    if (error) setError(error.message);
    else {
      setSaved(true);
      load();
    }
    setSaving(false);
  }

  if (!org) {
    return <div className="p-6 text-sm text-zinc-500">Loading settings…</div>;
  }

  const waConnected = !!(org.wa_phone_number_id && org.wa_access_token);

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">⚙️ Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Workspace: <strong>{org.name}</strong> · plan{" "}
          <span className="uppercase text-emerald-400">{org.plan}</span>
        </p>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <h2 className="text-sm font-semibold">Workspace</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Business name"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
        />
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">WhatsApp connection</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              waConnected
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {waConnected ? "connected" : "not connected"}
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          From Meta for Developers → your app → WhatsApp → API Setup. Incoming
          messages are routed to your workspace by the Phone Number ID.
        </p>
        <input
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          placeholder="Phone Number ID"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm font-mono focus:outline-none focus:border-emerald-500"
        />
        <input
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          type="password"
          placeholder="Permanent access token"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm font-mono focus:outline-none focus:border-emerald-500"
        />
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <h2 className="text-sm font-semibold">🤖 AI replies</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              When no keyword rule matches, Claude answers from conversation
              context and hands off to a human when unsure.
            </p>
          </div>
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={(e) => setAiEnabled(e.target.checked)}
            className="w-5 h-5 accent-emerald-500"
          />
        </label>
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {saved && <p className="text-sm text-emerald-400">Saved ✓</p>}
      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}
