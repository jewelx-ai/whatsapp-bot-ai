import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Organization } from "@/lib/types";
import { CreateOrg, DeleteOrg } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();

  const db = supabaseAdmin();
  let query = db
    .from("organizations")
    .select(
      "id, name, plan, plan_status, suspended, wa_phone_number_id, wa_access_token, created_at"
    );
  if (term) query = query.ilike("name", `%${term}%`);
  const { data } = await query.order("created_at", { ascending: false });
  const orgs = (data ?? []) as Organization[];

  return (
    <div className="app-page">
      <header className="page-header">
        <div className="page-heading">
          <p className="page-kicker">Platform</p>
          <h1 className="page-title">Organizations</h1>
          <p className="page-copy">
            Every workspace on this deployment. Open one to change its plan or
            suspend it.
          </p>
        </div>
        <div className="page-actions">
          <form className="flex flex-wrap items-center gap-2" role="search">
            <label htmlFor="org-search" className="sr-only">
              Search workspaces by name
            </label>
            <input
              id="org-search"
              name="q"
              type="search"
              defaultValue={term}
              placeholder="Search by name"
              className="field sm:w-56"
            />
            <button type="submit" className="btn-secondary">
              Search
            </button>
            {term && (
              <Link href="/admin/organizations" className="btn-ghost">
                Clear
              </Link>
            )}
          </form>
          <CreateOrg />
        </div>
      </header>

      <div className="page-section">
        <div className="table-shell">
          <div className="table-toolbar">
            <p className="text-sm font-semibold text-slate-800">
              {orgs.length} workspace{orgs.length === 1 ? "" : "s"}
              {term && <span className="font-normal text-slate-500"> matching “{term}”</span>}
            </p>
          </div>

          {orgs.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">No workspaces found</p>
              <p className="empty-state-copy">
                {term
                  ? "No workspace matches that name. Try a different search."
                  : "Workspaces appear here once a customer completes onboarding."}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <caption className="sr-only">
                All workspaces with plan, billing status, and connection state
              </caption>
              <thead>
                <tr>
                  <th scope="col">Workspace</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Billing</th>
                  <th scope="col">WhatsApp</th>
                  <th scope="col">State</th>
                  <th scope="col">Created</th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link
                        href={`/admin/organizations/${o.id}`}
                        className="font-semibold text-slate-900 hover:text-emerald-800"
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td>
                      <span className="badge-neutral uppercase">{o.plan}</span>
                    </td>
                    <td>
                      <span
                        className={
                          o.plan_status === "active"
                            ? "badge-success"
                            : o.plan_status === "past_due"
                              ? "badge-warning"
                              : "badge-danger"
                        }
                      >
                        {o.plan_status}
                      </span>
                    </td>
                    <td>
                      {o.wa_phone_number_id && o.wa_access_token ? (
                        <span className="badge-accent">connected</span>
                      ) : (
                        <span className="text-xs text-slate-400">not connected</span>
                      )}
                    </td>
                    <td>
                      {o.suspended ? (
                        <span className="badge-danger">suspended</span>
                      ) : (
                        <span className="badge-neutral">active</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-400">
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                    <td className="text-right align-top">
                      <DeleteOrg id={o.id} name={o.name} />
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
