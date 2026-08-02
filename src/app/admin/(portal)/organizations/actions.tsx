"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Organization } from "@/lib/types";

const PLANS: Organization["plan"][] = ["free", "starter", "pro"];

export function CreateOrg() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<Organization["plan"]>("free");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const res = await fetch("/api/admin/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), plan }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (res.ok) {
      setName("");
      setPlan("free");
      setOpen(false);
      router.refresh();
    } else {
      setError(typeof body.error === "string" ? body.error : "Could not create workspace");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        New workspace
      </button>
    );
  }

  return (
    <div className="app-panel w-full p-4 sm:w-auto sm:min-w-[22rem]">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">New workspace</h2>
      <div className="space-y-3">
        <div className="field-group">
          <label htmlFor="new-org-name" className="field-label">
            Business name
          </label>
          <input
            id="new-org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            placeholder="Acme Foods"
            className="field"
            autoFocus
          />
        </div>
        <div className="field-group">
          <label htmlFor="new-org-plan" className="field-label">
            Plan
          </label>
          <select
            id="new-org-plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value as Organization["plan"])}
            className="field capitalize"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <p className="field-hint">
          The workspace starts empty. Add its owner from the Users page, then
          connect WhatsApp in the workspace settings.
        </p>
        {error && <p className="field-error">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={create}
            disabled={busy || name.trim().length < 2}
            className="btn-primary"
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : "Create"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="btn-ghost"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteOrg({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/admin/orgs/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: confirmName.trim() }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError(typeof body.error === "string" ? body.error : "Delete failed");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete workspace ${name}`}
        className="btn-danger"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="space-y-2 text-left">
      <p className="text-xs leading-5 text-slate-600">
        This permanently deletes <strong>{name}</strong> with all its contacts,
        conversations, messages, auto-replies, broadcasts, and knowledge base.
        Members keep their accounts but lose this workspace. This cannot be
        undone.
      </p>
      <label htmlFor={`confirm-${id}`} className="field-label text-xs">
        Type the workspace name to confirm
      </label>
      <input
        id={`confirm-${id}`}
        value={confirmName}
        onChange={(e) => setConfirmName(e.target.value)}
        placeholder={name}
        className="field"
        autoFocus
      />
      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={busy || confirmName.trim() !== name}
          className="btn-danger"
        >
          {busy ? <span className="spinner" aria-hidden="true" /> : "Delete forever"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmName("");
            setError(null);
          }}
          className="btn-ghost"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
