"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Contact } from "@/lib/types";

export default function ContactsPage() {
  const supabase = useRef(supabaseBrowser()).current;
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
    load();
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
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">👥 Contacts</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Everyone who has messaged your WhatsApp number. Tags power broadcast
            audiences.
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, tag…"
          className="w-64 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
        />
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Tags</th>
              <th className="px-4 py-2 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-zinc-900">
                <td className="px-4 py-2">{c.name ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{c.wa_phone}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 bg-zinc-800 rounded-full px-2 py-0.5 text-xs"
                      >
                        {t}
                        <button
                          onClick={() => removeTag(c, t)}
                          className="text-zinc-500 hover:text-red-400"
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
                      className="w-16 bg-transparent border-b border-zinc-800 text-xs px-1 py-0.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </td>
                <td className="px-4 py-2 text-zinc-500 text-xs">
                  {c.last_seen_at ? new Date(c.last_seen_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
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
