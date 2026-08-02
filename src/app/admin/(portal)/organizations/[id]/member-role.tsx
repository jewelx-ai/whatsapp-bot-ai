"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";

const ROLES: Profile["role"][] = ["owner", "admin", "agent"];

/**
 * Operator-side role control. Tenants cannot change roles themselves — the
 * client dashboard has no admin surface — so this is the only path.
 */
export function MemberRole({
  userId,
  role: initialRole,
}: {
  userId: string;
  role: Profile["role"];
}) {
  const router = useRouter();
  const [role, setRole] = useState<Profile["role"]>(initialRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: Profile["role"]) {
    const previous = role;
    setRole(next);
    setBusy(true);
    setError(null);

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: next }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      setError(typeof body.error === "string" ? body.error : "Update failed");
      setRole(previous);
    }
    setBusy(false);
  }

  return (
    <div>
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Role
      </label>
      <select
        id={`role-${userId}`}
        value={role}
        disabled={busy}
        onChange={(e) => change(e.target.value as Profile["role"])}
        className="field capitalize"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && <p className="field-error mt-1">{error}</p>}
    </div>
  );
}
