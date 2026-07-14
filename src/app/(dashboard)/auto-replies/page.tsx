"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AutoReply } from "@/lib/types";

const emptyForm = {
  trigger_keyword: "",
  match_type: "contains" as AutoReply["match_type"],
  response_text: "",
};

export default function AutoRepliesPage() {
  const supabase = useRef(supabaseBrowser()).current;
  const [rules, setRules] = useState<AutoReply[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("auto_replies")
      .select("*")
      .order("created_at", { ascending: true });
    setRules((data as AutoReply[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
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
    const { error } = editingId
      ? await supabase.from("auto_replies").update(payload).eq("id", editingId)
      : await supabase.from("auto_replies").insert(payload);
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
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">🤖 Auto-replies</h1>
        <p className="text-sm text-zinc-400 mt-1">
          When an incoming message matches a keyword, the bot sends the response.
          First match wins. No match → fallback message.
        </p>
      </div>

      {/* Editor */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <h2 className="text-sm font-semibold">
          {editingId ? "Edit rule" : "New rule"}
        </h2>
        <div className="flex gap-2">
          <input
            value={form.trigger_keyword}
            onChange={(e) => setForm({ ...form, trigger_keyword: e.target.value })}
            placeholder="Keyword (e.g. price)"
            className="flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          />
          <select
            value={form.match_type}
            onChange={(e) =>
              setForm({ ...form, match_type: e.target.value as AutoReply["match_type"] })
            }
            className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
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
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={save}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold"
          >
            {editingId ? "Update" : "Add rule"}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
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
            className={`rounded-xl border border-zinc-800 p-4 flex items-start gap-3 ${
              r.active ? "" : "opacity-50"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-mono bg-zinc-800 rounded px-1.5 py-0.5">
                  {r.trigger_keyword}
                </span>{" "}
                <span className="text-zinc-500 text-xs">({r.match_type})</span>
              </p>
              <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap">
                {r.response_text}
              </p>
            </div>
            <div className="flex gap-2 text-xs shrink-0">
              <button
                onClick={() => toggle(r)}
                className="text-zinc-400 hover:text-zinc-100"
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
                className="text-zinc-400 hover:text-zinc-100"
              >
                Edit
              </button>
              <button
                onClick={() => remove(r.id)}
                className="text-red-400/70 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {rules.length === 0 && (
          <p className="text-sm text-zinc-500">No rules yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
