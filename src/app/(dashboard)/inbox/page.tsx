"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Conversation, Message } from "@/lib/types";

const statusStyles: Record<string, string> = {
  bot: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  open: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  closed: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

export default function InboxPage() {
  const [supabase] = useState(() => supabaseBrowser());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const jumpToBottomRef = useRef(true);
  // Read the open thread inside the realtime handler without making the
  // subscription depend on it (otherwise every click re-subscribes and reloads).
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const contactName =
    selected?.contacts?.name || selected?.contacts?.wa_phone || "Contact";
  const rows = buildThreadRows(messages);

  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select("*, contacts(*)")
      .order("last_message_at", { ascending: false })
      .limit(100);
    setConversations(uniqueLatestByContact((data as Conversation[]) ?? []));
  }, [supabase]);

  // Initial load + realtime: refresh list on any conversation change,
  // append messages for the open thread.
  useEffect(() => {
    void Promise.resolve().then(loadConversations);

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
          if (msg.conversation_id !== selectedIdRef.current) return;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadConversations]);

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

  // Opening a thread should land on the newest message immediately; only
  // messages that arrive while you are reading animate into view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: jumpToBottomRef.current ? "auto" : "smooth",
      block: "end",
    });
    jumpToBottomRef.current = false;
  }, [messages]);

  useEffect(() => {
    jumpToBottomRef.current = true;
  }, [selectedId]);

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

  async function deleteChat() {
    if (!selected) return;
    const label = selected.contacts?.name || selected.contacts?.wa_phone || "this contact";
    if (!confirm(`Delete all chat history for ${label}?`)) return;

    setDeleting(true);
    setError(null);
    const { error: deleteErr } = await supabase
      .from("conversations")
      .delete()
      .eq("org_id", selected.org_id)
      .eq("contact_id", selected.contact_id);
    if (deleteErr) {
      setError(deleteErr.message);
      setDeleting(false);
      return;
    }
    setMessages([]);
    setSelectedId(null);
    await loadConversations();
    setDeleting(false);
  }

  return (
    <div className="flex h-[calc(100vh-65px)] lg:h-screen">
      {/* Conversation list */}
      <div
        className={`w-full shrink-0 overflow-y-auto border-r border-slate-200 bg-white sm:w-80 xl:w-96 ${
          selected ? "hidden sm:block" : "block"
        }`}
      >
        <div className="border-b border-slate-200 p-4">
          <h1 className="page-title">Inbox</h1>
          <p className="mt-1 text-xs text-slate-500">Live WhatsApp conversations</p>
        </div>
        {conversations.length === 0 && (
          <p className="p-4 text-sm leading-6 text-slate-500">
            No conversations yet. They appear here when someone messages your
            WhatsApp number.
          </p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
              c.id === selectedId ? "bg-teal-50" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-slate-950">
                {c.contacts?.name || c.contacts?.wa_phone || "Unknown"}
              </span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusStyles[c.status]}`}
              >
                {c.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(c.last_message_at).toLocaleString()}
            </p>
          </button>
        ))}
      </div>

      {/* Chat window */}
      <div
        className={`min-w-0 flex-1 flex-col bg-[#f6f7f4] ${
          selected ? "flex" : "hidden sm:flex"
        }`}
      >
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 bg-white p-4">
              <button
                onClick={() => setSelectedId(null)}
                className="btn-ghost -ml-2 sm:hidden"
              >
                Back
              </button>
              <ContactAvatar name={contactName} className="h-10 w-10 text-sm" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-semibold text-slate-950">
                  {selected.contacts?.name || selected.contacts?.wa_phone}
                </p>
                <p className="text-xs text-slate-500">
                  {selected.contacts?.wa_phone}
                </p>
              </div>
              <div className="flex gap-1 text-xs">
                {(["bot", "open", "closed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`rounded-md border px-2 py-1 font-medium ${
                      selected.status === s
                        ? "border-teal-600 bg-teal-50 text-teal-800"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {s === "bot" ? "bot" : s === "open" ? "human" : "closed"}
                  </button>
                ))}
                <button
                  onClick={deleteChat}
                  disabled={deleting}
                  className="rounded-md border border-red-200 bg-white px-2 py-1 font-medium text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting ? "deleting" : "delete"}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 sm:px-6">
              {/* min-h-full + justify-end anchors the thread to the composer:
                  a short conversation sits at the bottom and grows upward
                  instead of hanging from the top of an empty pane. Vertical
                  padding lives here (not on the scroll parent) so the column
                  is exactly one viewport tall when the thread is short. */}
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end py-4">
                {rows.length === 0 && (
                  <p className="text-center text-sm text-slate-500">
                    No messages in this conversation yet.
                  </p>
                )}

                {rows.map(({ message: m, dayLabel, startsRun, endsRun }) => {
                  const outbound = m.direction === "out";
                  return (
                    <div key={m.id}>
                      {dayLabel && (
                        <div className="flex justify-center py-3">
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                            {dayLabel}
                          </span>
                        </div>
                      )}

                      <div
                        className={`flex items-end gap-2 ${
                          startsRun && !dayLabel ? "mt-3" : "mt-0.5"
                        } ${outbound ? "flex-row-reverse" : ""}`}
                      >
                        {endsRun ? (
                          outbound ? (
                            <WorkspaceAvatar />
                          ) : (
                            <ContactAvatar name={contactName} />
                          )
                        ) : (
                          <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                        )}

                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm sm:max-w-[72%] ${
                            outbound
                              ? `bg-teal-700 text-white ${endsRun ? "rounded-br-md" : ""}`
                              : `border border-slate-200 bg-white text-slate-900 ${
                                  endsRun ? "rounded-bl-md" : ""
                                }`
                          }`}
                        >
                          {startsRun && !outbound && (
                            <p className="mb-0.5 text-xs font-semibold text-slate-700">
                              {contactName}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap break-words">
                            {m.body || `[${m.type}]`}
                          </p>
                          <div
                            className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                              outbound ? "text-teal-50/80" : "text-slate-400"
                            }`}
                          >
                            <span>{formatTime(m.created_at)}</span>
                            {outbound && <DeliveryState status={m.status} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-3 py-3 sm:px-6">
              <div className="mx-auto w-full max-w-3xl">
                {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-4 pr-1.5 shadow-sm focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-600/10">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                    placeholder="Type a reply..."
                    aria-label="Reply message"
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                  />
                  <button
                    onClick={send}
                    disabled={sending || !draft.trim()}
                    title="Send"
                    aria-label="Send message"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending ? (
                      <span className="spinner h-4 w-4" />
                    ) : (
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m4 11.5 15.5-6.5-6 15.5-2.6-6.4L4 11.5Z" />
                        <path d="m10.9 14.1 8.6-9.1" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function uniqueLatestByContact(conversations: Conversation[]) {
  const byContact = new Map<string, Conversation>();
  for (const conversation of conversations) {
    const key = conversation.contact_id;
    if (!key || byContact.has(key)) continue;
    byContact.set(key, conversation);
  }
  return [...byContact.values()];
}

// ---------- thread grouping ----------
// Consecutive messages from the same side within this window render as one
// run: the name appears on the first bubble, the avatar on the last.
const RUN_WINDOW_MS = 5 * 60 * 1000;

type ThreadRow = {
  message: Message;
  dayLabel: string | null;
  startsRun: boolean;
  endsRun: boolean;
};

function buildThreadRows(messages: Message[]): ThreadRow[] {
  return messages.map((message, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const newDay = !prev || !isSameDay(prev.created_at, message.created_at);

    return {
      message,
      dayLabel: newDay ? formatDayLabel(message.created_at) : null,
      startsRun:
        !prev ||
        newDay ||
        prev.direction !== message.direction ||
        !isWithinRun(prev.created_at, message.created_at),
      endsRun:
        !next ||
        next.direction !== message.direction ||
        !isSameDay(message.created_at, next.created_at) ||
        !isWithinRun(message.created_at, next.created_at),
    };
  });
}

function isWithinRun(a: string, b: string) {
  return (
    Math.abs(new Date(b).getTime() - new Date(a).getTime()) <= RUN_WINDOW_MS
  );
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------- thread chrome ----------
function ContactAvatar({
  name,
  className = "h-8 w-8 text-xs",
}: {
  name: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600 ${className}`}
    >
      {initial}
    </span>
  );
}

// Outbound messages can come from the bot or a teammate; the thread only knows
// they were sent by this workspace, so both share the workspace mark.
function WorkspaceAvatar() {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 5.75h14v9.5H9.2L5 19v-13.25Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function DeliveryState({ status }: { status: string }) {
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-0.5 font-semibold">
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 4.5 21 20H3l9-15.5ZM12 10v4M12 17h.01" />
        </svg>
        failed
      </span>
    );
  }

  const delivered = status === "delivered" || status === "read";
  return (
    <span
      title={status}
      className={`inline-flex ${status === "read" ? "text-white" : ""}`}
    >
      <svg
        className={delivered ? "h-3.5 w-4" : "h-3.5 w-3"}
        viewBox={delivered ? "0 0 20 16" : "0 0 14 16"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m1 9 3.5 3.5L11 5" />
        {delivered && <path d="m8 9 3.5 3.5L18 5" />}
      </svg>
      <span className="sr-only">{status}</span>
    </span>
  );
}
