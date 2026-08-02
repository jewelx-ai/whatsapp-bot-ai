"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

// Operator portal sign-in. Deliberately separate from the tenant login:
// no sign-up and no social auth. Credentials are verified by Supabase Auth;
// whether the account is the super admin is enforced server-side by
// requirePlatformAdmin(). Password recovery by email is supported so the
// operator is not locked out (passwords are hashed and cannot be recovered).
export default function PlatformLoginPage() {
  const router = useRouter();
  // "signin" is the normal form; "reset" swaps it for the recovery request.
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: "signin" | "reset") {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  // Send a Supabase recovery email. The response is intentionally identical
  // whether or not the address exists, so this page cannot be used to discover
  // which accounts are real.
  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const address = email.trim();
    if (!address) {
      setError("Enter the operator email address first.");
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabaseBrowser().auth.resetPasswordForEmail(
      address,
      { redirectTo: `${window.location.origin}/reset-password` }
    );
    setLoading(false);

    // Only surface genuine transport failures (e.g. rate limiting), never
    // "user not found".
    if (resetError && !/user not found|not found/i.test(resetError.message)) {
      setError(resetError.message);
      return;
    }

    setNotice(
      "If that address is registered, a password reset link is on its way. " +
        "Check the inbox and spam folder, then follow the link to set a new password."
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const supabase = supabaseBrowser();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Confirm this account is actually the platform operator. If not, drop the
    // session again so a tenant login can't linger on the operator portal.
    const res = await fetch("/api/admin/session");
    if (!res.ok) {
      await supabase.auth.signOut();
      setError(
        "This account does not have platform access. Use the workspace sign-in instead."
      );
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/admin");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-950/40">
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3.5l7 2.5v5.5c0 4-3 7.2-7 9-4-1.8-7-5-7-9V6l7-2.5Z" />
              <path d="m9.25 12 2 2 3.5-3.5" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-white">
            Platform Admin
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === "signin"
              ? "Operator access for all workspaces"
              : "Reset the operator password"}
          </p>
        </div>

        <form
          onSubmit={mode === "signin" ? handleSubmit : handleResetRequest}
          className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-black/40"
        >
          <div>
            <label
              htmlFor="platform-email"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Email
            </label>
            <input
              id="platform-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@example.com"
              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
            />
          </div>

          {mode === "signin" && (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label
                  htmlFor="platform-password"
                  className="block text-sm font-medium text-slate-300"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => switchMode("reset")}
                  className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="platform-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 pr-20 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-400 hover:text-white"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          )}

          <div aria-live="polite" className="space-y-2">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-200"
              >
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
                {notice}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-lg bg-emerald-600 text-sm font-semibold text-white shadow-lg shadow-emerald-950/30 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? mode === "signin"
                ? "Signing in…"
                : "Sending reset link…"
              : mode === "signin"
                ? "Sign in to platform"
                : "Send reset link"}
          </button>

          {mode === "reset" && (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 text-sm font-medium text-slate-300 hover:bg-slate-900 hover:text-white"
            >
              Back to sign in
            </button>
          )}

          <p className="text-center text-xs leading-5 text-slate-500">
            Restricted area. Access is limited to the platform operator account.
          </p>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          Looking for your workspace?{" "}
          <Link href="/login" className="font-semibold text-emerald-400 hover:text-emerald-300">
            Workspace sign-in
          </Link>
        </p>
      </div>
    </main>
  );
}
