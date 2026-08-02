import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Organization } from "@/lib/types";
import { StatCard } from "./stat-card";

export const dynamic = "force-dynamic";

async function tableCount(table: string): Promise<number> {
  const db = supabaseAdmin();
  const { count } = await db.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

export default async function PlatformOverview() {
  const db = supabaseAdmin();

  const [{ data: orgsData }, users, contacts, conversations, messages] =
    await Promise.all([
      db
        .from("organizations")
        .select(
          "id, name, plan, plan_status, suspended, wa_phone_number_id, wa_access_token, created_at"
        )
        .order("created_at", { ascending: false }),
      tableCount("profiles"),
      tableCount("contacts"),
      tableCount("conversations"),
      tableCount("messages"),
    ]);

  const orgs = (orgsData ?? []) as Organization[];

  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRows } = await db
    .from("usage_daily")
    .select("ai_replies")
    .eq("day", today);
  const aiToday = (usageRows ?? []).reduce(
    (sum, r) => sum + ((r.ai_replies as number) ?? 0),
    0
  );

  const planCounts: Record<Organization["plan"], number> = {
    free: 0,
    starter: 0,
    pro: 0,
  };
  let connected = 0;
  let suspended = 0;
  for (const o of orgs) {
    planCounts[o.plan] = (planCounts[o.plan] ?? 0) + 1;
    if (o.wa_phone_number_id && o.wa_access_token) connected += 1;
    if (o.suspended) suspended += 1;
  }

  return (
    <div className="app-page">
      <header className="page-header">
        <div className="page-heading">
          <p className="page-kicker">Platform</p>
          <h1 className="page-title">Overview</h1>
          <p className="page-copy">
            Aggregate activity across every workspace on this deployment.
          </p>
        </div>
      </header>

      <div className="page-section grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Workspaces" value={orgs.length} />
        <StatCard label="Users" value={users} />
        <StatCard label="Contacts" value={contacts} />
        <StatCard label="Conversations" value={conversations} />
        <StatCard label="Messages" value={messages} />
        <StatCard label="AI replies today" value={aiToday} />
      </div>

      <div className="page-section grid gap-4 lg:grid-cols-2">
        <section className="app-panel">
          <div className="card-header">
            <h2 className="card-title">Plans</h2>
            <p className="card-copy">Workspace distribution by plan tier.</p>
          </div>
          <div className="card-body grid grid-cols-3 gap-3">
            <StatCard label="Free" value={planCounts.free} />
            <StatCard label="Starter" value={planCounts.starter} />
            <StatCard label="Pro" value={planCounts.pro} />
          </div>
        </section>

        <section className="app-panel">
          <div className="card-header">
            <h2 className="card-title">WhatsApp &amp; state</h2>
            <p className="card-copy">
              Workspaces with credentials configured, and any suspended tenants.
            </p>
          </div>
          <div className="card-body grid grid-cols-2 gap-3">
            <StatCard label="Connected" value={connected} />
            <StatCard label="Suspended" value={suspended} />
          </div>
        </section>
      </div>

      <section className="page-section app-panel">
        <div className="card-header sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="card-title">Recent workspaces</h2>
            <p className="card-copy">The five most recently created tenants.</p>
          </div>
          <Link href="/admin/organizations" className="btn-secondary">
            View all
          </Link>
        </div>

        {orgs.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No workspaces yet</p>
            <p className="empty-state-copy">
              Workspaces appear here once a customer completes onboarding.
            </p>
          </div>
        ) : (
          <ul className="card-body space-y-2">
            {orgs.slice(0, 5).map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-app-border px-3 py-2.5"
              >
                <Link
                  href={`/admin/organizations/${o.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 hover:text-emerald-800"
                >
                  {o.name}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  {o.suspended && <span className="badge-danger">suspended</span>}
                  <span className="badge-neutral uppercase">{o.plan}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
