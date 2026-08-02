"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Organization } from "@/lib/types";

type Props = {
  org: Pick<Organization, "id" | "plan" | "plan_status" | "suspended">;
};

const PLANS: Organization["plan"][] = ["free", "starter", "pro"];
const STATUSES: Organization["plan_status"][] = ["active", "past_due", "canceled"];

export function OrgControls({ org }: Props) {
  const router = useRouter();
  const [plan, setPlan] = useState<Organization["plan"]>(org.plan);
  const [status, setStatus] = useState<Organization["plan_status"]>(org.plan_status);
  const [suspended, setSuspended] = useState(org.suspended);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, onOk: () => void) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/admin/orgs/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onOk();
      setSaved(true);
      router.refresh();
    } else {
      const b = (await res.json().catch(() => ({}))) as { error?: unknown };
      setError(typeof b.error === "string" ? b.error : "Update failed");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field-group">
          <label htmlFor="org-plan" className="field-label">
            Plan
          </label>
          <select
            id="org-plan"
            value={plan}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as Organization["plan"];
              patch({ plan: next }, () => setPlan(next));
            }}
            className="field capitalize"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="field-hint">
            Plans limit AI replies, broadcast audience size, and knowledge-base
            ingestion. Changes apply immediately.
          </p>
        </div>

        <div className="field-group">
          <label htmlFor="org-status" className="field-label">
            Billing status
          </label>
          <select
            id="org-status"
            value={status}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as Organization["plan_status"];
              patch({ planStatus: next }, () => setStatus(next));
            }}
            className="field"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="field-hint">Set manually until billing is wired up.</p>
        </div>
      </div>

      <div className="app-panel-muted flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {suspended ? "Workspace is suspended" : "Workspace is active"}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            While suspended, the bot ignores this tenant&apos;s inbound WhatsApp
            messages and sends no replies.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => patch({ suspended: !suspended }, () => setSuspended(!suspended))}
          className={suspended ? "btn-primary shrink-0" : "btn-danger shrink-0"}
        >
          {busy ? (
            <span className="spinner" aria-hidden="true" />
          ) : suspended ? (
            "Unsuspend workspace"
          ) : (
            "Suspend workspace"
          )}
        </button>
      </div>

      <div aria-live="polite">
        {error && <p className="field-error">{error}</p>}
        {saved && !error && <p className="field-success">Saved</p>}
      </div>
    </div>
  );
}
