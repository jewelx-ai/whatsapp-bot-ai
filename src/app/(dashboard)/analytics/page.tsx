"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type DayCount = { day: string; incoming: number; outgoing: number };

type Stats = {
  totalContacts: number;
  totalConversations: number;
  openConversations: number;
  messagesIn: number;
  messagesOut: number;
  days: DayCount[];
};

export default function AnalyticsPage() {
  const supabase = useRef(supabaseBrowser()).current;
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 13);
      since.setHours(0, 0, 0, 0);

      const [contacts, conversations, open, recent] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }),
        supabase.from("conversations").select("id", { count: "exact", head: true }),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
        supabase
          .from("messages")
          .select("direction, created_at")
          .gte("created_at", since.toISOString())
          .limit(10000),
      ]);

      const days: DayCount[] = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(since);
        d.setDate(d.getDate() + i);
        days.push({
          day: d.toLocaleDateString([], { month: "short", day: "numeric" }),
          incoming: 0,
          outgoing: 0,
        });
      }
      let messagesIn = 0;
      let messagesOut = 0;
      for (const m of recent.data ?? []) {
        const idx = Math.floor(
          (new Date(m.created_at).getTime() - since.getTime()) / 86400000
        );
        if (idx < 0 || idx > 13) continue;
        if (m.direction === "in") {
          days[idx].incoming++;
          messagesIn++;
        } else {
          days[idx].outgoing++;
          messagesOut++;
        }
      }

      setStats({
        totalContacts: contacts.count ?? 0,
        totalConversations: conversations.count ?? 0,
        openConversations: open.count ?? 0,
        messagesIn,
        messagesOut,
        days,
      });
    })();
  }, [supabase]);

  if (!stats) {
    return <div className="p-6 text-sm text-zinc-500">Loading analytics…</div>;
  }

  const maxDay = Math.max(1, ...stats.days.map((d) => d.incoming + d.outgoing));

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">📊 Analytics</h1>
        <p className="text-sm text-zinc-400 mt-1">Last 14 days of activity.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatTile label="Contacts" value={stats.totalContacts} />
        <StatTile label="Conversations" value={stats.totalConversations} />
        <StatTile label="Waiting on human" value={stats.openConversations} highlight />
        <StatTile label="Msgs in (14d)" value={stats.messagesIn} />
        <StatTile label="Msgs out (14d)" value={stats.messagesOut} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Messages per day</h2>
          <div className="flex gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block" /> incoming
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> outgoing
            </span>
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-40">
          {stats.days.map((d) => (
            <div
              key={d.day}
              className="flex-1 flex flex-col justify-end items-stretch gap-px group relative"
              title={`${d.day}: ${d.incoming} in, ${d.outgoing} out`}
            >
              <div
                className="bg-emerald-500 rounded-t-sm min-h-0"
                style={{ height: `${(d.outgoing / maxDay) * 100}%` }}
              />
              <div
                className="bg-sky-500 min-h-0"
                style={{ height: `${(d.incoming / maxDay) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mt-2">
          {stats.days.map((d, i) => (
            <div key={d.day} className="flex-1 text-center text-[9px] text-zinc-500">
              {i % 2 === 0 ? d.day : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight && value > 0
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-zinc-400 mt-1">{label}</p>
    </div>
  );
}
