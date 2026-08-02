"use client";

import { useEffect, useState } from "react";

type DayCount = {
  day: string;
  iso: string;
  incoming: number;
  outgoing: number;
};

type Stats = {
  totalContacts: number;
  totalConversations: number;
  openConversations: number;
  messagesIn: number;
  messagesOut: number;
  days: DayCount[];
};

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/analytics");
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setLoadError(data?.error ?? "Analytics could not be loaded.");
        setStats(emptyStats());
        return;
      }

      setStats({
        totalContacts: data.totalContacts,
        totalConversations: data.totalConversations,
        openConversations: data.openConversations,
        messagesIn: data.messagesIn,
        messagesOut: data.messagesOut,
        days: data.days.map((d: Omit<DayCount, "day">) => ({
          ...d,
          day: formatDayLabel(d.iso),
        })),
      });
      setLoadError(null);
    })();
  }, []);

  if (!stats) {
    return <div className="app-page text-sm text-slate-500">Loading analytics…</div>;
  }

  return (
    <div className="app-page space-y-6">
      <div>
        <h1 className="page-title">Analytics</h1>
        <p className="page-copy">Last 14 days of activity.</p>
      </div>

      {loadError && (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Some figures could not be loaded, so the numbers below may be incomplete.{" "}
          {loadError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Contacts" value={stats.totalContacts} />
        <StatTile label="Conversations" value={stats.totalConversations} />
        <StatTile label="Waiting on human" value={stats.openConversations} highlight />
        <StatTile label="Msgs in (14d)" value={stats.messagesIn} dot="incoming" />
        <StatTile label="Msgs out (14d)" value={stats.messagesOut} dot="outgoing" />
      </div>

      <MessagesChart days={stats.days} />
    </div>
  );
}

function formatDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function emptyStats(): Stats {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: DayCount[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;
    days.push({ iso, day: formatDayLabel(iso), incoming: 0, outgoing: 0 });
  }
  return {
    totalContacts: 0,
    totalConversations: 0,
    openConversations: 0,
    messagesIn: 0,
    messagesOut: 0,
    days,
  };
}

// ---------- chart ----------
// "Trend over time" with two series: line + 20% fill, distinguished by line style
// as well as colour, hover/tap readout, and a data table as the a11y fallback.

const CHART_W = 640;
const CHART_H = 220;
const CHART_PAD = 8;
const STEP_LADDER = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

function MessagesChart({ days }: { days: DayCount[] }) {
  const [active, setActive] = useState<number | null>(null);

  const peak = Math.max(...days.map((d) => Math.max(d.incoming, d.outgoing)));
  const step = STEP_LADDER.find((s) => s * 4 >= peak) ?? Math.ceil(peak / 4);
  const axisMax = step * 4;
  const total = days.reduce((sum, d) => sum + d.incoming + d.outgoing, 0);
  const busiest = days.reduce(
    (best, d) => (d.incoming + d.outgoing > best.incoming + best.outgoing ? d : best),
    days[0]
  );
  const axisLabels = pickAxisLabels(days);

  const x = (i: number) => ((i + 0.5) / days.length) * CHART_W;
  const y = (v: number) => CHART_H - CHART_PAD - (v / axisMax) * (CHART_H - CHART_PAD * 2);

  const linePath = (key: "incoming" | "outgoing") =>
    days
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`)
      .join(" ");
  const areaPath = (key: "incoming" | "outgoing") =>
    `${linePath(key)} L${x(days.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(
      1
    )},${y(0).toFixed(1)} Z`;

  const shown = active === null ? null : days[active];

  return (
    <figure className="app-panel p-4 sm:p-5">
      <figcaption className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Messages per day</h2>
          <p className="mt-1 text-xs text-slate-500">
            {total === 0
              ? "No messages in the last 14 days"
              : `${total} message${total === 1 ? "" : "s"} over 14 days · busiest ${
                  busiest.day
                } (${busiest.incoming + busiest.outgoing})`}
          </p>
        </div>
        <div className="flex shrink-0 gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <SeriesSwatch series="incoming" /> incoming
          </span>
          <span className="flex items-center gap-1.5">
            <SeriesSwatch series="outgoing" /> outgoing
          </span>
        </div>
      </figcaption>

      {total === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-200 text-center">
          <p className="text-sm font-medium text-slate-600">Nothing to chart yet</p>
          <p className="max-w-sm text-xs leading-5 text-slate-500">
            Daily volume appears here once your WhatsApp number sends or receives
            messages.
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            {/* Absolute positions so each tick sits exactly on its gridline. */}
            <div className="relative h-56 w-8 shrink-0 text-right text-[10px] tabular-nums text-slate-400">
              {[4, 3, 2, 1, 0].map((n, idx) => (
                <span
                  key={n}
                  className="absolute right-0 -translate-y-1/2"
                  style={{ top: `${idx * 25}%` }}
                >
                  {n * step}
                </span>
              ))}
            </div>

            <div className="relative min-w-0 flex-1">
              <div className="absolute inset-0 flex flex-col justify-between" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((n) => (
                  <span
                    key={n}
                    className={`h-px w-full ${n === 4 ? "bg-slate-200" : "bg-slate-100"}`}
                  />
                ))}
              </div>

              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                preserveAspectRatio="none"
                className="relative block h-56 w-full overflow-visible"
                aria-hidden="true"
              >
                <g className="text-teal-600">
                  <path d={areaPath("outgoing")} fill="currentColor" fillOpacity={0.12} />
                  <path
                    d={linePath("outgoing")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
                <g className="text-blue-500">
                  <path d={areaPath("incoming")} fill="currentColor" fillOpacity={0.14} />
                  <path
                    d={linePath("incoming")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>

                {active !== null && (
                  <g>
                    <line
                      x1={x(active)}
                      x2={x(active)}
                      y1={CHART_PAD}
                      y2={y(0)}
                      stroke="currentColor"
                      strokeWidth={1}
                      className="text-slate-300"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={x(active)}
                      cy={y(days[active].outgoing)}
                      r={4}
                      className="text-teal-600"
                      fill="currentColor"
                      stroke="white"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={x(active)}
                      cy={y(days[active].incoming)}
                      r={4}
                      className="text-blue-500"
                      fill="currentColor"
                      stroke="white"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                )}
              </svg>

              {/* Pointer bands: one per day, aligned with the plotted points. */}
              <div className="absolute inset-0 flex" onPointerLeave={() => setActive(null)}>
                {days.map((d, i) => (
                  <div
                    key={d.iso}
                    className="flex-1"
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={() => setActive(i)}
                  />
                ))}
              </div>

              {shown && (
                <div
                  className="pointer-events-none absolute top-1 z-10 w-max rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg"
                  style={{ left: `${((active! + 0.5) / days.length) * 100}%` }}
                >
                  <div
                    className={
                      active! < 2
                        ? ""
                        : active! > days.length - 3
                          ? "-translate-x-full"
                          : "-translate-x-1/2"
                    }
                  >
                    <p className="font-semibold text-slate-950">{shown.day}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-slate-600">
                      <SeriesSwatch series="incoming" />
                      <span className="tabular-nums">{shown.incoming}</span> in
                    </p>
                    <p className="flex items-center gap-1.5 text-slate-600">
                      <SeriesSwatch series="outgoing" />
                      <span className="tabular-nums">{shown.outgoing}</span> out
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 flex gap-0 pl-11">
            {days.map((d, i) => (
              <div
                key={d.iso}
                className={`flex-1 text-center text-[9px] ${
                  active === i
                    ? "font-semibold text-slate-950"
                    : d.incoming + d.outgoing > 0
                      ? "font-semibold text-slate-700"
                      : "text-slate-500"
                }`}
              >
                {axisLabels[i] || active === i ? d.day : ""}
              </div>
            ))}
          </div>

          <details className="mt-4 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
              Show data table
            </summary>
            <table className="mt-3 w-full text-left text-xs">
              <caption className="sr-only">
                Incoming and outgoing messages per day for the last 14 days
              </caption>
              <thead className="text-slate-500">
                <tr>
                  <th scope="col" className="py-1 font-medium">
                    Day
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Incoming
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Outgoing
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {days.map((d) => (
                  <tr key={d.iso} className="border-t border-slate-100">
                    <th scope="row" className="py-1 font-normal">
                      <time dateTime={d.iso}>{d.day}</time>
                    </th>
                    <td className="py-1 text-right tabular-nums">{d.incoming}</td>
                    <td className="py-1 text-right tabular-nums">{d.outgoing}</td>
                    <td className="py-1 text-right font-medium tabular-nums">
                      {d.incoming + d.outgoing}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  );
}

function SeriesSwatch({ series }: { series: "incoming" | "outgoing" }) {
  return (
    <svg
      viewBox="0 0 24 8"
      className={`h-2 w-6 shrink-0 ${
        series === "incoming" ? "text-blue-500" : "text-teal-600"
      }`}
      aria-hidden="true"
    >
      <path
        d="M0 4h24"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={series === "outgoing" ? "5 3" : undefined}
      />
    </svg>
  );
}

// 14 columns cannot all carry a readable date, so labels are thinned out — but a
// day with activity must never be the one that gets dropped, otherwise the only
// point on the chart ends up unlabelled. Priority: days with messages, then today
// and the window start, then every other day where it will not crowd a neighbour.
function pickAxisLabels(days: DayCount[]): boolean[] {
  const show = days.map((d) => d.incoming + d.outgoing > 0);
  const claim = (i: number) => {
    if (i < 0 || i >= days.length) return;
    if (show[i] || show[i - 1] || show[i + 1]) return;
    show[i] = true;
  };

  claim(days.length - 1);
  claim(0);
  days.forEach((_, i) => {
    if (i % 2 === 0) claim(i);
  });

  return show;
}

function StatTile({
  label,
  value,
  highlight,
  dot,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  dot?: "incoming" | "outgoing";
}) {
  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${
        highlight && value > 0
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
        {dot && (
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${
              dot === "incoming" ? "bg-blue-500" : "bg-teal-600"
            }`}
          />
        )}
        {label}
      </p>
    </div>
  );
}
