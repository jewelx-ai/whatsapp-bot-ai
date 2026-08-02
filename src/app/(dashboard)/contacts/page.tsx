"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Contact } from "@/lib/types";

export default function ContactsPage() {
  const [supabase] = useState(() => supabaseBrowser());
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(500);
    setContacts((data as Contact[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function addTag(c: Contact) {
    const tag = (tagDraft[c.id] ?? "").trim().toLowerCase();
    if (!tag || c.tags.includes(tag)) return;
    await supabase
      .from("contacts")
      .update({ tags: [...c.tags, tag] })
      .eq("id", c.id);
    setTagDraft({ ...tagDraft, [c.id]: "" });
    load();
  }

  async function removeTag(c: Contact, tag: string) {
    await supabase
      .from("contacts")
      .update({ tags: c.tags.filter((t) => t !== tag) })
      .eq("id", c.id);
    load();
  }

  async function toggleConsent(c: Contact) {
    await supabase
      .from("contacts")
      .update({ opted_in: !c.opted_in })
      .eq("id", c.id);
    load();
  }

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.wa_phone.includes(q) ||
      (c.name ?? "").toLowerCase().includes(q) ||
      c.tags.some((t) => t.includes(q))
    );
  });

  return (
    <div className="app-page space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-copy">
            Everyone who has messaged your WhatsApp number. Tags power broadcast
            audiences.
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, tag…"
          className="field w-full sm:w-72"
        />
      </div>

      <div className="table-shell">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Consent</th>
              <th className="px-4 py-2">Tags</th>
              <th className="px-4 py-2">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{c.name ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.wa_phone}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleConsent(c)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      c.opted_in
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                    }`}
                  >
                    {c.opted_in ? "Opted in" : "Opted out"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                      >
                        {t}
                        <button
                          onClick={() => removeTag(c, t)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagDraft[c.id] ?? ""}
                      onChange={(e) =>
                        setTagDraft({ ...tagDraft, [c.id]: e.target.value })
                      }
                      onKeyDown={(e) => e.key === "Enter" && addTag(c)}
                      placeholder="+ tag"
                      className="w-16 border-b border-slate-200 bg-transparent px-1 py-0.5 text-xs text-slate-700 outline-none focus:border-teal-600"
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {c.last_seen_at ? new Date(c.last_seen_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {contacts.length === 0
                    ? "No contacts yet — they appear when someone messages the bot."
                    : "No matches."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
