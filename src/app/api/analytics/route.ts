import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOrgForCurrentUser } from "@/lib/org";

type AggregateDay = {
  iso: string;
  incoming: number;
  outgoing: number;
};

type AnalyticsPayload = {
  totalContacts: number;
  totalConversations: number;
  openConversations: number;
  messagesIn: number;
  messagesOut: number;
  days: AggregateDay[];
};

function isAnalyticsPayload(value: unknown): value is AnalyticsPayload {
  const data = value as Partial<AnalyticsPayload> | null;
  return (
    !!data &&
    typeof data.totalContacts === "number" &&
    typeof data.totalConversations === "number" &&
    typeof data.openConversations === "number" &&
    typeof data.messagesIn === "number" &&
    typeof data.messagesOut === "number" &&
    Array.isArray(data.days)
  );
}

export async function GET() {
  const org = await getOrgForCurrentUser();
  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin().rpc("dashboard_analytics", {
    p_org_id: org.id,
    p_days: 14,
  });

  if (error) {
    try {
      return NextResponse.json(await analyticsFallback(org.id, 14));
    } catch (fallbackErr) {
      return NextResponse.json(
        {
          error:
            fallbackErr instanceof Error
              ? fallbackErr.message
              : "Analytics could not be loaded",
        },
        { status: 500 }
      );
    }
  }

  if (!isAnalyticsPayload(data)) {
    return NextResponse.json({ error: "Analytics response was malformed" }, { status: 500 });
  }

  return NextResponse.json(data);
}

async function analyticsFallback(orgId: string, days: number): Promise<AnalyticsPayload> {
  const db = supabaseAdmin();
  const dates = lastNDates(days);
  const since = `${dates[0]}T00:00:00.000Z`;

  const [
    contacts,
    conversations,
    openConversations,
    messagesIn,
    messagesOut,
    ...dayCounts
  ] = await Promise.all([
    db.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    db
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    db
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "open"),
    db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("direction", "in")
      .gte("created_at", since),
    db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("direction", "out")
      .gte("created_at", since),
    ...dates.flatMap((iso) => {
      const start = `${iso}T00:00:00.000Z`;
      const next = new Date(`${iso}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const end = next.toISOString();
      return [
        db
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("direction", "in")
          .gte("created_at", start)
          .lt("created_at", end),
        db
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("direction", "out")
          .gte("created_at", start)
          .lt("created_at", end),
      ];
    }),
  ]);

  const errors = [
    contacts.error,
    conversations.error,
    openConversations.error,
    messagesIn.error,
    messagesOut.error,
    ...dayCounts.map((result) => result.error),
  ].filter(Boolean);
  if (errors.length > 0) {
    throw new Error(errors[0]?.message ?? "Analytics fallback query failed");
  }

  return {
    totalContacts: contacts.count ?? 0,
    totalConversations: conversations.count ?? 0,
    openConversations: openConversations.count ?? 0,
    messagesIn: messagesIn.count ?? 0,
    messagesOut: messagesOut.count ?? 0,
    days: dates.map((iso, index) => ({
      iso,
      incoming: dayCounts[index * 2]?.count ?? 0,
      outgoing: dayCounts[index * 2 + 1]?.count ?? 0,
    })),
  };
}

function lastNDates(days: number): string[] {
  const count = Math.max(1, days);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (count - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}
