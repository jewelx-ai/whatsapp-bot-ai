"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Conversation, Message } from "@/lib/types";

const statusStyles: Record<string, string> = {
  bot: "bg-sky-500/15 text-sky-400",
  open: "bg-amber-500/15 text-amber-400",
  closed: "bg-zinc-500/15 text-zinc-400",
};

export default function InboxPage() {
  const supabase = useRef(supabaseBrowser()).current;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select("*, contacts(*)")
      .order("last_message_at", { ascending: false })
      .limit(100);
    setConversations((data as Conversation[]) ?? []);
  }, [supabase]);

  // Initial load + realtime: refresh list on any conversation change,
  // append messages for the open thread.
  useEffect(() => {
    loadConversations();

    const channel = supabase
      .channel("inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => loadConversations()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) =>
            msg.conversation_id === selectedIdRef.current &&
            !prev.some((m) => m.id === msg.id)
              ? [...prev, msg]
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadConversations]);

  // keep a ref so the realtime callback sees the current selection
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Load messages when a conversation is selected
  useEffect(() => {
    if (!selectedId) return;
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", selectedId)
      .order("created_at", { ascending: true })
      .limit(500)
      .then(({ data }) => setMessages((data as Message[]) ?? []));
  }, [selectedId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!draft.trim() || !selectedId) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selectedId, text: draft.trim() }),
    });
    if (res.ok) {
      setDraft("");
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? `Send failed (${res.status})`);
    }
    setSending(false);
  }

  async function setStatus(status: "bot" | "open" | "closed") {
    if (!selectedId) return;
    await supabase.from("conversations").update({ status }).eq("id", selectedId);
    loadConversations();
  }

  return (
    <div className="h-screen flex">
      {/* Conversation list */}
      <div className="w-80 shrink-0 border-r border-zinc-800 overflow-y-auto">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="font-semibold">Inbox</h1>
        </div>
        {conversations.length === 0 && (
          <p className="p-4 text-sm text-zinc-500">
            No conversations yet. They appear here when someone messages your
            WhatsApp number.
          </p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`w-full text-left px-4 py-3 border-b border-zinc-900 hover:bg-zinc-900 ${
              c.id === selectedId ? "bg-zinc-900" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">
                {c.contacts?.name || c.contacts?.wa_phone || "Unknown"}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyles[c.status]}`}
              >
                {c.status}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {new Date(c.last_message_at).toLocaleString()}
            </p>
          </button>
        ))}
      </div>

      {/* Chat window */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">
                  {selected.contacts?.name || selected.contacts?.wa_phone}
                </p>
                <p className="text-xs text-zinc-500">
                  {selected.contacts?.wa_phone}
                </p>
              </div>
              <div className="flex gap-1 text-xs">
                {(["bot", "open", "closed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-2 py-1 rounded-lg border ${
                      selected.status === s
                        ? "border-emerald-500 text-emerald-400"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    {s === "bot" ? "🤖 bot" : s === "open" ? "👤 human" : "✓ closed"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.direction === "out"
                        ? "bg-emerald-700/60"
                        : "bg-zinc-800"
                    }`}
                  >
                    {m.body}
                    <div className="text-[10px] text-zinc-400 mt-1 text-right">
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {m.direction === "out" && ` · ${m.status}`}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-zinc-800">
              {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder="Type a reply… (sending switches the conversation to human mode)"
                  className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={send}
                  disabled={sending || !draft.trim()}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
