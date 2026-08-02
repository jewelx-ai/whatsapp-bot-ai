"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AutoReply } from "@/lib/types";

const emptyForm = {
  trigger_keyword: "",
  match_type: "contains" as AutoReply["match_type"],
  response_text: "",
};

export default function AutoRepliesPage() {
  const [supabase] = useState(() => supabaseBrowser());
  const [rules, setRules] = useState<AutoReply[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // New rules need an explicit org_id: the column is NOT NULL and the RLS
    // insert policy requires it to equal the caller's workspace.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .maybeSingle();
      setOrgId((profile?.org_id as string | null) ?? null);
    }

    const { data } = await supabase
      .from("auto_replies")
      .select("*")
      .order("created_at", { ascending: true });
    setRules((data as AutoReply[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function save() {
    setError(null);
    if (!form.trigger_keyword.trim() || !form.response_text.trim()) {
      setError("Keyword and response are required.");
      return;
    }
    const payload = {
      trigger_keyword: form.trigger_keyword.trim(),
      match_type: form.match_type,
      response_text: form.response_text.trim(),
    };
    if (!editingId && !orgId) {
      setError("Workspace not loaded yet. Refresh and try again.");
      return;
    }

    const { error } = editingId
      ? await supabase.from("auto_replies").update(payload).eq("id", editingId)
      : await supabase.from("auto_replies").insert({ ...payload, org_id: orgId });
    if (error) {
      setError(error.message);
      return;
    }
    setForm(emptyForm);
    setEditingId(null);
    load();
  }

  async function toggle(rule: AutoReply) {
    await supabase
      .from("auto_replies")
      .update({ active: !rule.active })
      .eq("id", rule.id);
    load();
  }

  async function remove(id: string) {
    await supabase.from("auto_replies").delete().eq("id", id);
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyForm);
    }
    load();
  }

  return (
    <div className="app-page-narrow space-y-6">
      <div>
        <h1 className="page-title">Auto-replies</h1>
        <p className="page-copy">
          When an incoming message matches a keyword, the bot sends the response.
          First match wins. No match → fallback message.
        </p>
      </div>

      {/* Editor */}
      <div className="app-panel space-y-3 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-950">
          {editingId ? "Edit rule" : "New rule"}
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={form.trigger_keyword}
            onChange={(e) => setForm({ ...form, trigger_keyword: e.target.value })}
            placeholder="Keyword or phrases (e.g. price, cost, how much)"
            className="field flex-1"
          />
          <select
            value={form.match_type}
            onChange={(e) =>
              setForm({ ...form, match_type: e.target.value as AutoReply["match_type"] })
            }
            className="field sm:w-44"
          >
            <option value="contains">contains</option>
            <option value="exact">exact</option>
            <option value="starts_with">starts with</option>
          </select>
        </div>
        <textarea
          value={form.response_text}
          onChange={(e) => setForm({ ...form, response_text: e.target.value })}
          placeholder="Bot response…"
          rows={3}
          className="field"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={save}
            className="btn-primary"
          >
            {editingId ? "Update" : "Add rule"}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Rule list */}
      <div className="space-y-2">
        {rules.map((r) => (
          <div
            key={r.id}
            className={`app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start ${
              r.active ? "" : "opacity-50"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-950">
                  {r.trigger_keyword}
                </span>{" "}
                <span className="text-xs text-slate-500">({r.match_type})</span>
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {r.response_text}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1 text-xs">
              <button
                onClick={() => toggle(r)}
                className="btn-ghost"
              >
                {r.active ? "Disable" : "Enable"}
              </button>
              <button
                onClick={() => {
                  setEditingId(r.id);
                  setForm({
                    trigger_keyword: r.trigger_keyword,
                    match_type: r.match_type,
                    response_text: r.response_text,
                  });
                }}
                className="btn-ghost"
              >
                Edit
              </button>
              <button
                onClick={() => remove(r.id)}
                className="btn-ghost text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {rules.length === 0 && (
          <p className="text-sm text-slate-500">No rules yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
