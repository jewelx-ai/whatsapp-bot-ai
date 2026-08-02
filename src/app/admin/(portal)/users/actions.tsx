"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";

const ROLES: Profile["role"][] = ["owner", "admin", "agent"];

export function CreateUser({ orgs }: { orgs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState<Profile["role"]>("agent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function suggestPassword() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const body = btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "");
    setPassword(`${body}aZ9!`);
  }

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        fullName: fullName.trim() || undefined,
        orgId: orgId || undefined,
        role,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (res.ok) {
      setEmail("");
      setPassword("");
      setFullName("");
      setOrgId("");
      setRole("agent");
      setOpen(false);
      router.refresh();
    } else {
      setError(typeof body.error === "string" ? body.error : "Could not create user");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        New user
      </button>
    );
  }

  return (
    <div className="app-panel w-full p-4 sm:w-auto sm:min-w-[24rem]">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">New user</h2>
      <div className="space-y-3">
        <div className="field-group">
          <label htmlFor="nu-email" className="field-label">
            Email
          </label>
          <input
            id="nu-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            className="field"
            autoFocus
          />
        </div>

        <div className="field-group">
          <label htmlFor="nu-name" className="field-label">
            Full name <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="nu-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            className="field"
          />
        </div>

        <div className="field-group">
          <label htmlFor="nu-password" className="field-label">
            Temporary password
          </label>
          <div className="flex gap-2">
            <input
              id="nu-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="field-mono flex-1"
              autoComplete="off"
            />
            <button type="button" onClick={suggestPassword} className="btn-secondary shrink-0">
              Generate
            </button>
          </div>
          <p className="field-hint">
            Share it with the user and ask them to change it after signing in.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field-group">
            <label htmlFor="nu-org" className="field-label">
              Workspace
            </label>
            <select
              id="nu-org"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="field"
            >
              <option value="">No workspace</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="nu-role" className="field-label">
              Role
            </label>
            <select
              id="nu-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Profile["role"])}
              className="field capitalize"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="field-error">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={create}
            disabled={busy || !email.trim() || password.length < 8}
            className="btn-primary"
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : "Create user"}
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

export function DeleteUser({
  userId,
  email,
  isOperator,
}: {
  userId: string;
  email: string;
  isOperator: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isOperator) {
    return <span className="text-xs text-slate-400">operator</span>;
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, confirmEmail: confirmEmail.trim() }),
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
        aria-label={`Delete user ${email}`}
        className="btn-danger"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="space-y-2 text-left">
      <p className="text-xs leading-5 text-slate-600">
        This permanently deletes the account <strong>{email}</strong> and their
        profile. Conversations and messages they handled stay with the workspace.
        This cannot be undone.
      </p>
      <label htmlFor={`cu-${userId}`} className="field-label text-xs">
        Type the email to confirm
      </label>
      <input
        id={`cu-${userId}`}
        value={confirmEmail}
        onChange={(e) => setConfirmEmail(e.target.value)}
        placeholder={email}
        className="field"
        autoFocus
      />
      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={busy || confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
          className="btn-danger"
        >
          {busy ? <span className="spinner" aria-hidden="true" /> : "Delete forever"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmEmail("");
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
