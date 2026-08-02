"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Broadcast = {
  id: string;
  template_name: string;
  language_code: string;
  audience_tag: string | null;
  status: "queued" | "processing" | "completed" | "partial_failed" | "failed";
  audience_size: number;
  processed_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

export default function BroadcastsPage() {
  const [supabase] = useState(() => supabaseBrowser());
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
    void Promise.resolve().then(load);
  }, [load]);

  async function send() {
    if (!templateName.trim()) return;
    setSending(true);
    setError(null);
    setResult(null);
    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: templateName.trim(),
          languageCode,
          audienceTag: audienceTag.trim() || undefined,
          idempotencyKey,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(
          typeof body?.error === "string" ? body.error : `Failed (${res.status})`
        );
        setSending(false);
        return;
      }

      let current = body.broadcast as Broadcast;
      setResult(formatBroadcastResult(current));
      await load();

      while (!isDone(current)) {
        const next = await processNextBatch(current.id);
        if (!next) break;
        current = next;
        setResult(formatBroadcastResult(current));
        await load();
      }

      setTemplateName("");
      setAudienceTag("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Broadcast could not be processed."
      );
    }
    setSending(false);
  }

  async function processNextBatch(broadcastId: string): Promise<Broadcast | null> {
    const res = await fetch("/api/broadcasts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broadcastId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      setError(typeof body?.error === "string" ? body.error : `Failed (${res.status})`);
      return null;
    }
    return body.broadcast as Broadcast;
  }

  return (
    <div className="app-page-narrow space-y-6">
      <div>
        <h1 className="page-title">Broadcasts</h1>
        <p className="page-copy">
          Send a pre-approved <strong>template message</strong> to all opted-in
          contacts, or only those with a tag. Templates are required by Meta for
          messages outside the 24-hour window — create them in the Meta dashboard
          under WhatsApp → Message Templates.
        </p>
      </div>

      <div className="app-panel space-y-3 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name (e.g. hello_world)"
            className="field sm:col-span-2"
          />
          <input
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            placeholder="Language (en_US)"
            className="field"
          />
        </div>
        <input
          value={audienceTag}
          onChange={(e) => setAudienceTag(e.target.value)}
          placeholder="Audience tag (leave empty = all opted-in contacts)"
          className="field"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && <p className="text-sm text-teal-700">{result}</p>}
        <button
          onClick={send}
          disabled={sending || !templateName.trim()}
          className="btn-primary"
        >
          {sending ? "Sending…" : "Send broadcast"}
        </button>
      </div>

      <div className="table-shell">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2">Template</th>
              <th className="px-4 py-2">Audience</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Progress</th>
              <th className="px-4 py-2">Sent</th>
              <th className="px-4 py-2">Failed</th>
              <th className="px-4 py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{b.template_name}</td>
                <td className="px-4 py-3 text-slate-700">{b.audience_tag ?? "everyone"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={b.status} />
                </td>
                <td className="px-4 py-3 text-xs tabular-nums text-slate-600">
                  {b.processed_count}/{b.audience_size}
                </td>
                <td className="px-4 py-3 font-medium text-teal-700">{b.sent_count}</td>
                <td className="px-4 py-3 font-medium text-red-600">{b.failed_count}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(b.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {broadcasts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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

function isDone(broadcast: Broadcast) {
  return ["completed", "partial_failed", "failed"].includes(broadcast.status);
}

function formatBroadcastResult(broadcast: Broadcast) {
  if (!isDone(broadcast)) {
    return `Processing ${broadcast.processed_count} of ${broadcast.audience_size} contacts...`;
  }
  if (broadcast.failed_count > 0) {
    return (
      `Processed ${broadcast.audience_size} contacts: ${broadcast.sent_count} sent, ` +
      `${broadcast.failed_count} failed. Common causes: test-recipient limits or a wrong template/language.`
    );
  }
  return `Sent to ${broadcast.sent_count} contact${broadcast.sent_count === 1 ? "" : "s"}.`;
}

function StatusBadge({ status }: { status: Broadcast["status"] }) {
  const label = status.replace("_", " ");
  const classes =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "partial_failed"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : status === "failed"
          ? "bg-red-50 text-red-700 ring-red-200"
          : "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${classes}`}>
      {label}
    </span>
  );
}
