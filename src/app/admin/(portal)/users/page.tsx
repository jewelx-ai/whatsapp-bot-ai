import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSuperAdminEmail } from "@/lib/platform";
import type { Profile } from "@/lib/types";
import { CreateUser, DeleteUser } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_BADGE: Record<Profile["role"], string> = {
  owner: "badge-accent",
  admin: "badge-info",
  agent: "badge-neutral",
};

export default async function UsersPage() {
  const db = supabaseAdmin();

  const [{ data: profileRows }, { data: orgRows }] = await Promise.all([
    db.from("profiles").select("*").order("created_at", { ascending: false }),
    db.from("organizations").select("id, name").order("name"),
  ]);

  const profiles = (profileRows ?? []) as Profile[];
  const orgs = (orgRows ?? []) as { id: string; name: string }[];
  const orgName = new Map<string, string>(orgs.map((o) => [o.id, o.name]));

  return (
    <div className="app-page">
      <header className="page-header">
        <div className="page-heading">
          <p className="page-kicker">Platform</p>
          <h1 className="page-title">Users</h1>
          <p className="page-copy">
            Everyone with an account, across all workspaces.
          </p>
        </div>
        <div className="page-actions">
          <CreateUser orgs={orgs} />
        </div>
      </header>

      <div className="page-section">
        <div className="table-shell">
          <div className="table-toolbar">
            <p className="text-sm font-semibold text-slate-800">
              {profiles.length} user{profiles.length === 1 ? "" : "s"}
            </p>
          </div>

          {profiles.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">No users yet</p>
              <p className="empty-state-copy">
                Users appear here after they sign up.
              </p>
            </div>
          ) : (
            <table className="data-table">
              <caption className="sr-only">All users across every workspace</caption>
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Workspace</th>
                  <th scope="col">Joined</th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-slate-900">{p.email ?? "—"}</td>
                    <td>{p.full_name?.trim() || "—"}</td>
                    <td>
                      <span className={`${ROLE_BADGE[p.role]} capitalize`}>{p.role}</span>
                    </td>
                    <td>
                      {p.org_id ? (
                        <Link
                          href={`/admin/organizations/${p.org_id}`}
                          className="font-medium text-slate-900 hover:text-emerald-800"
                        >
                          {orgName.get(p.org_id) ?? p.org_id}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">no workspace</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-400">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="text-right align-top">
                      <DeleteUser
                        userId={p.id}
                        email={p.email ?? ""}
                        isOperator={isSuperAdminEmail(p.email)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
