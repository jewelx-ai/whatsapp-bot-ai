"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepareRecoverySession() {
      const supabase = supabaseBrowser();
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = params.get("code");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          window.history.replaceState({}, "", "/reset-password");
        }
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          window.history.replaceState({}, "", "/reset-password");
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (code || accessToken || refreshToken) {
          setError("Reset link is invalid or expired. Request a new password reset email.");
        } else {
          setError("Open this page from the password reset email link.");
        }
        setReady(false);
        return;
      }

      setError(null);
      setReady(true);
    }

    void prepareRecoverySession();
  }, []);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // This page serves both tenants and the platform operator. Ask the server
    // which one just signed in so the operator lands on the admin portal
    // instead of a workspace inbox it has no access to.
    let destination = "/inbox";
    try {
      const res = await fetch("/api/admin/session");
      if (res.ok) destination = "/admin";
    } catch {
      // Fall back to the tenant inbox; the dashboard layout re-checks access.
    }

    setNotice(
      destination === "/admin"
        ? "Password updated. Redirecting to the admin portal..."
        : "Password updated. Redirecting to your inbox..."
    );
    setTimeout(() => {
      router.push(destination);
      router.refresh();
    }, 800);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#dff5e6] p-4 text-slate-950 sm:p-6 lg:p-10">
      <section className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-2xl shadow-emerald-900/12 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white shadow-lg shadow-teal-700/20">
            WB
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
            Reset password
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter a new password for your WhatsApp Bot account.
          </p>
        </div>

        <form onSubmit={updatePassword} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-500">
              New password
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <LockIcon />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-md border border-slate-200 bg-white px-11 pr-14 text-sm text-slate-950 outline-none placeholder:text-slate-400 shadow-sm focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-950"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-500">
              Confirm password
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <LockIcon />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-12 w-full rounded-md border border-slate-200 bg-white px-11 text-sm text-slate-950 outline-none placeholder:text-slate-400 shadow-sm focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              />
            </div>
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !ready}
            className="h-12 w-full rounded-md bg-slate-800 text-sm font-semibold text-white shadow-lg shadow-slate-800/15 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Updating..." : ready ? "Update password" : "Waiting for reset link"}
          </button>

          {!ready && (
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="h-11 w-full rounded-md border border-slate-200 bg-white text-sm font-medium text-teal-700 hover:bg-slate-50"
            >
              Request a new reset link
            </button>
          )}
        </form>
      </section>
    </main>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 10h12v10H6V10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M8 10V8a4 4 0 0 1 8 0v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="m3 3 18 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10.6 10.6A2 2 0 0 0 13.4 13.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a15.5 15.5 0 0 1-3.2 4.1M6.6 6.8C3.6 8.8 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.4-1.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
