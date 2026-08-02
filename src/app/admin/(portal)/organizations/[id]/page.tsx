import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Organization, Profile } from "@/lib/types";
import { StatCard } from "../../stat-card";
import { OrgControls } from "./controls";
import { MemberRole } from "./member-role";

export const dynamic = "force-dynamic";

// Role styling lives in the MemberRole client component, which owns the select.

async function orgCount(table: string, orgId: string): Promise<number> {
  const db = supabaseAdmin();
  const { count } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  return count ?? 0;
}

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = supabaseAdmin();

  const { data: orgData } = await db
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!orgData) notFound();
  const org = orgData as Organization;

  const { data: profileRows } = await db
    .from("profiles")
    .select("*")
    .eq("org_id", id)
    .order("created_at", { ascending: true });
  const profiles = (profileRows ?? []) as Profile[];
  const members = profiles.map((p) => ({ ...p, email: p.email ?? "—" }));

  const [contacts, conversations, messages] = await Promise.all([
    orgCount("contacts", id),
    orgCount("conversations", id),
    orgCount("messages", id),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await db
    .from("usage_daily")
    .select("ai_replies")
    .eq("org_id", id)
    .eq("day", today)
    .maybeSingle();
  const aiToday = (usage?.ai_replies as number) ?? 0;

  const connected = !!(org.wa_phone_number_id && org.wa_access_token);

  return (
    <div className="app-page">
      <header className="page-header">
        <div className="page-heading">
          <Link
            href="/admin/organizations"
            className="page-kicker hover:underline"
          >
            ← Organizations
          </Link>
          <h1 className="page-title">{org.name}</h1>
          <p className="page-copy">
            Created {new Date(org.created_at).toLocaleDateString()} ·{" "}
            {org.wa_phone_number_id
              ? `Phone Number ID ${org.wa_phone_number_id}`
              : "no WhatsApp number configured"}
          </p>
        </div>
        <div className="page-actions">
          {org.suspended ? (
            <span className="badge-danger">suspended</span>
          ) : (
            <span className="badge-success">active</span>
          )}
          {connected ? (
            <span className="badge-accent">WhatsApp connected</span>
          ) : (
            <span className="badge-warning">not connected</span>
          )}
          <span className="badge-neutral">AI {org.ai_enabled ? "on" : "off"}</span>
        </div>
      </header>

      <div className="page-section grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Contacts" value={contacts} />
        <StatCard label="Conversations" value={conversations} />
        <StatCard label="Messages" value={messages} />
        <StatCard label="AI replies today" value={aiToday} />
      </div>

      <section className="page-section app-panel">
        <div className="card-header">
          <h2 className="card-title">Plan &amp; state</h2>
          <p className="card-copy">
            Platform-level controls. Changes apply immediately.
          </p>
        </div>
        <div className="card-body">
          <OrgControls org={org} />
        </div>
      </section>

      <section className="page-section app-panel">
        <div className="card-header">
          <h2 className="card-title">Members ({members.length})</h2>
          <p className="card-copy">
            Team members belonging to this workspace. Roles are managed here —
            tenants have no admin screen of their own. A workspace must keep at
            least one owner.
          </p>
        </div>

        {members.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No members</p>
            <p className="empty-state-copy">
              This workspace has no user profiles attached.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">Workspace members</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col" className="text-right">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium text-slate-900">
                      {m.full_name?.trim() || "—"}
                    </td>
                    <td>{m.email}</td>
                    <td>
                      <MemberRole userId={m.id} role={m.role} />
                    </td>
                    <td className="text-right text-xs text-slate-400">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
