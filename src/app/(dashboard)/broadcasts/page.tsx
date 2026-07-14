"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Broadcast = {
  id: string;
  template_name: string;
  audience_tag: string | null;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

export default function BroadcastsPage() {
  const supabase = useRef(supabaseBrowser()).current;
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [languageCode, setLanguageCode] = useState("en_US");
  const [audienceTag, setAudienceTag] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("broadcasts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setBroadcasts((data as Broadcast[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    if (!templateName.trim()) return;
    setSending(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateName: templateName.trim(),
        languageCode,
        audienceTag: audienceTag.trim() || undefined,
      }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      setResult(`Sent to ${body.sent} contacts (${body.failed} failed).`);
      setTemplateName("");
      setAudienceTag("");
      load();
    } else {
      setError(
        typeof body?.error === "string" ? body.error : `Failed (${res.status})`
      );
    }
    setSending(false);
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">📣 Broadcasts</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Send a pre-approved <strong>template message</strong> to all opted-in
          contacts, or only those with a tag. Templates are required by Meta for
          messages outside the 24-hour window — create them in the Meta dashboard
          under WhatsApp → Message Templates.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name (e.g. hello_world)"
            className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 sm:col-span-2"
          />
          <input
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            placeholder="Language (en_US)"
            className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <input
          value={audienceTag}
          onChange={(e) => setAudienceTag(e.target.value)}
          placeholder="Audience tag (leave empty = all opted-in contacts)"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        {result && <p className="text-sm text-emerald-400">{result}</p>}
        <button
          onClick={send}
          disabled={sending || !templateName.trim()}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold"
        >
          {sending ? "Sending…" : "Send broadcast"}
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Template</th>
              <th className="px-4 py-2 font-medium">Audience</th>
              <th className="px-4 py-2 font-medium">Sent</th>
              <th className="px-4 py-2 font-medium">Failed</th>
              <th className="px-4 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((b) => (
              <tr key={b.id} className="border-t border-zinc-900">
                <td className="px-4 py-2 font-mono text-xs">{b.template_name}</td>
                <td className="px-4 py-2">{b.audience_tag ?? "everyone"}</td>
                <td className="px-4 py-2 text-emerald-400">{b.sent_count}</td>
                <td className="px-4 py-2 text-red-400">{b.failed_count}</td>
                <td className="px-4 py-2 text-zinc-500 text-xs">
                  {new Date(b.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {broadcasts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  No broadcasts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
