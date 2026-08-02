"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Settings = {
  id: string;
  name: string;
  phoneNumberId: string | null;
  aiEnabled: boolean;
  plan: string;
  planStatus: string;
  role: "owner" | "admin" | "agent";
  connected: boolean;
  /** Masked confirmation that a token is stored; never the token itself. */
  tokenHint: { length: number; last4: string } | null;
};

// Live result of checking the stored credentials against Meta.
type WaCheck =
  | { status: "checking" }
  | { status: "not_configured" }
  | { status: "ok"; displayPhoneNumber?: string; verifiedName?: string; qualityRating?: string }
  | { status: "invalid"; reason: string }
  | { status: "error"; reason: string };

const STATUS_LABEL: Record<WaCheck["status"], string> = {
  checking: "checking…",
  not_configured: "not connected",
  ok: "connected",
  invalid: "token expired",
  error: "unverified",
};

const STATUS_BADGE: Record<WaCheck["status"], string> = {
  checking: "badge-neutral",
  not_configured: "badge-warning",
  ok: "badge-success",
  invalid: "badge-danger",
  error: "badge-warning",
};

export default function SettingsPage() {
  const router = useRouter();
  const [data, setData] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [loadedPhoneNumberId, setLoadedPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState(""); // write-only; never populated from server
  const [aiEnabled, setAiEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<WaCheck>({ status: "checking" });

  const canEditWa = data?.role === "owner" || data?.role === "admin";

  // Ask Meta whether the stored credentials actually work. Done separately from
  // the settings fetch so the page renders immediately.
  // Only the network call: state is written after the await, so this is safe to
  // start from an effect. `check` already initialises to "checking".
  const runCheck = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/verify");
      setCheck(res.ok ? ((await res.json()) as WaCheck) : { status: "error", reason: "Check failed" });
    } catch {
      setCheck({ status: "error", reason: "Check failed" });
    }
  }, []);

  // User-triggered re-check (e.g. after saving new credentials), which should
  // show the spinner again before the request goes out.
  const verify = useCallback(async () => {
    setCheck({ status: "checking" });
    await runCheck();
  }, [runCheck]);

  const handleAuthState = useCallback(
    (status: number, code?: string) => {
      if (status === 401 || code === "no_session") {
        setError("Your session expired. Sign in again to continue.");
        router.replace("/login");
        return true;
      }
      if (code === "no_workspace") {
        setError("This account no longer has a workspace. Create one to continue.");
        router.replace("/onboarding");
        return true;
      }
      return false;
    },
    [router]
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/settings");
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      handleAuthState(res.status, body?.code);
      return;
    }
    const o = (await res.json()) as Settings;
    setData(o);
    setName(o.name);
    setPhoneNumberId(o.phoneNumberId ?? "");
    setLoadedPhoneNumberId(o.phoneNumberId ?? "");
    setAiEnabled(o.aiEnabled);
  }, [handleAuthState]);

  // Deferred to a microtask so no state is written during the effect pass,
  // matching the pattern used by the inbox loader.
  useEffect(() => {
    void Promise.resolve().then(load);
    void Promise.resolve().then(runCheck);
  }, [load, runCheck]);

  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const payload: Record<string, unknown> = {
      name: name.trim(),
      aiEnabled,
    };
    // Only include WhatsApp fields when the user actually changed them, so a
    // no-op save by a non-privileged member doesn't trip the role check.
    if (canEditWa) {
      if (phoneNumberId.trim() !== loadedPhoneNumberId) {
        payload.phoneNumberId = phoneNumberId.trim();
      }
      if (accessToken.trim()) {
        payload.accessToken = accessToken.trim();
      }
    }

    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      setSaved(true);
      setAccessToken("");
      load();
      // Re-check against Meta: a new token may have just been saved.
      verify();
    } else {
      if (handleAuthState(res.status, body?.code)) {
        setSaving(false);
        return;
      }
      setError(typeof body?.error === "string" ? body.error : `Save failed (${res.status})`);
    }
    setSaving(false);
  }

  if (!data) {
    return <div className="app-page-narrow text-sm text-slate-500">Loading settings…</div>;
  }

  return (
    <div className="app-page-narrow space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-copy">
          Workspace: <strong className="text-slate-700">{data.name}</strong> · plan{" "}
          <span className="font-semibold uppercase text-teal-700">{data.plan}</span>
        </p>
      </div>

      <section className="app-panel space-y-3 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-950">Workspace</h2>
        <input
          name="workspace_display_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Business name"
          className="field"
          autoComplete="organization"
        />
      </section>

      <section className="app-panel space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-950">WhatsApp connection</h2>
          <span className={`badge ${STATUS_BADGE[check.status]}`}>
            {STATUS_LABEL[check.status]}
          </span>
        </div>

        {check.status === "ok" && (
          <p className="text-xs leading-5 text-teal-700">
            Verified with Meta
            {check.displayPhoneNumber ? ` · ${check.displayPhoneNumber}` : ""}
            {check.verifiedName ? ` · ${check.verifiedName}` : ""}
            {check.qualityRating ? ` · quality ${check.qualityRating.toLowerCase()}` : ""}
          </p>
        )}
        {check.status === "invalid" && (
          <div className="feedback-danger">
            <div>
              <p className="feedback-title">Token expired or invalid</p>
              <p className="feedback-copy">
                {check.reason} Generate a new access token in Meta → WhatsApp →
                API Setup and paste it below. Until then, sending messages will
                fail.
              </p>
            </div>
          </div>
        )}
        {check.status === "error" && (
          <div className="feedback-warning">
            <div>
              <p className="feedback-title">Could not verify with Meta</p>
              <p className="feedback-copy">{check.reason}</p>
            </div>
          </div>
        )}

        <p className="text-xs leading-5 text-slate-500">
          From Meta for Developers → your app → WhatsApp → API Setup. Incoming
          messages are routed to your workspace by the Phone Number ID.
          {!canEditWa && " Only an owner or admin can change these."}
        </p>
        <input
          id="wa-phone-number-id"
          name="wa_phone_number_id_no_autofill"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value.replace(/\D/g, ""))}
          placeholder="Phone Number ID"
          className="field-mono"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          disabled={!canEditWa}
        />
        <div className="field-group">
          <input
            id="wa-token"
            name="wa_cloud_api_token_no_autofill"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            type="password"
            placeholder={
              check.status === "invalid"
                ? "Paste a new access token to fix the connection"
                : data.tokenHint
                  ? "Enter a new token to replace the saved one"
                  : "Permanent access token"
            }
            className="field-mono"
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            disabled={!canEditWa}
          />
          {data.tokenHint ? (
            <p className="field-hint">
              Saved token:{" "}
              <span className="font-mono">
                {"•".repeat(12)}
                {data.tokenHint.last4}
              </span>{" "}
              · {data.tokenHint.length} characters. For security the token is
              never shown again — leave this blank to keep it.
            </p>
          ) : (
            <p className="field-hint">No access token saved yet.</p>
          )}
        </div>
      </section>

      <section className="app-panel p-4 sm:p-5">
        <label className="flex cursor-pointer flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">AI replies</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              When no keyword rule matches, GLM answers from conversation
              context and hands off to a human when unsure.
            </p>
          </div>
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={(e) => setAiEnabled(e.target.checked)}
            className="h-5 w-5 accent-teal-700"
          />
        </label>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-teal-700">Saved</p>}
      <div className="flex justify-start">
        <button onClick={save} disabled={saving} className="btn-primary w-full sm:w-auto">
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
