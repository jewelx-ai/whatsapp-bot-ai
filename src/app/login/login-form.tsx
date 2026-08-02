"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  // A failed OAuth round trip comes back as /login?error=…, so the first render
  // has to be able to show an error that no local action produced.
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const busy = loading || googleLoading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = supabaseBrowser();

    if (mode === "forgot") {
      const origin = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/reset-password`,
      });
      if (error) setError(error.message);
      else {
        setNotice("Password reset link sent. Check your email to continue.");
      }
    } else if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else {
        router.push("/inbox");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) setError(error.message);
      else if (!data.session)
        setNotice("Check your email to confirm your account, then sign in.");
      else {
        router.push("/inbox");
        router.refresh();
      }
    }
    setLoading(false);
  }

  // Google sign-in uses the PKCE flow: Supabase sends the browser to Google,
  // Google returns to /auth/callback?code=…, and that route exchanges the code
  // for the session cookie. A first-time Google user gets a profiles row from
  // the handle_new_user() trigger and is sent to /onboarding by the dashboard
  // layout, exactly like an email sign-up.
  async function handleGoogleSignIn() {
    setError(null);
    setNotice(null);
    setGoogleLoading(true);

    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/inbox`,
        // Always let the user pick which Google account to use instead of
        // silently reusing whichever one the browser is already signed into.
        queryParams: { prompt: "select_account" },
      },
    });

    // On success the browser is already navigating to Google, so the button
    // only needs to be released when the redirect could not be started.
    if (error) {
      // Supabase reports a project with the Google provider switched off as
      // "Unsupported provider: provider is not enabled". That is a deployment
      // detail, not something a customer can act on, so show plain copy.
      const notConfigured = /provider is not enabled|unsupported provider/i.test(
        error.message
      );
      setError(
        notConfigured
          ? "Google sign-in is not available yet. Please use your email and password."
          : error.message
      );
      setGoogleLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#dff5e6] p-4 text-slate-950 sm:p-6 lg:p-10">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[20px] bg-white shadow-2xl shadow-emerald-900/12 lg:min-h-[min(760px,calc(100vh-5rem))] lg:grid-cols-2">
          <AuthVisual />

          <section className="flex min-h-[calc(100vh-2rem)] flex-col justify-center px-6 py-8 sm:min-h-[680px] sm:px-14 lg:min-h-0 lg:px-16">
            <div className="mb-9 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white shadow-lg shadow-teal-700/20">
                WB
              </div>
              <p className="text-2xl font-semibold tracking-normal text-slate-950">
                WhatsApp Bot
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {mode === "signin"
                  ? "Sign in to your workspace"
                  : mode === "signup"
                    ? "Create your workspace account"
                    : "Get a password reset email"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === "signup" && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-500">
                    Full name
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <UserIcon />
                    </span>
                    <input
                      type="text"
                      placeholder="Full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    className="h-12 w-full rounded-md border border-slate-200 bg-white px-11 text-sm text-slate-950 outline-none placeholder:text-slate-400 shadow-sm focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                    />
                  </div>
                </label>
              )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-500">
                Username or email
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <MailIcon />
                </span>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 w-full rounded-md border border-slate-200 bg-white px-11 text-sm text-slate-950 outline-none placeholder:text-slate-400 shadow-sm focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                />
              </div>
            </label>

            {mode !== "forgot" && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-500">
                  Password
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <LockIcon />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Password"
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
            )}

            <div className="flex min-h-5 justify-end text-sm">
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setError(null);
                    setNotice(null);
                    setShowPassword(false);
                  }}
                  className="font-medium text-teal-700 underline decoration-teal-700/40 underline-offset-2"
                >
                  Forgot password?
                </button>
              )}
            </div>

            <div aria-live="polite">
              {error && (
                <p
                  role="alert"
                  className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {error}
                </p>
              )}
              {notice && (
                <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">
                  {notice}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 h-12 w-full rounded-md bg-slate-800 text-sm font-semibold text-white shadow-lg shadow-slate-800/15 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </button>
            </form>

            {mode !== "forgot" && (
              <>
                <div className="flex items-center gap-5 py-4 text-sm text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span>or</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={busy}
                  className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon />
                  {googleLoading
                    ? "Redirecting to Google…"
                    : mode === "signin"
                      ? "Sign in with Google"
                      : "Sign up with Google"}
                </button>
              </>
            )}

            <div className="mt-7 text-center text-sm text-slate-500">
              {mode === "signin"
                ? "Are you new? "
                : mode === "signup"
                  ? "Already have an account? "
                  : "Remembered your password? "}
              <button
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setNotice(null);
                  setShowPassword(false);
                }}
                className="font-semibold text-teal-700 hover:text-teal-600"
              >
                {mode === "signin" ? "Create an Account" : "Sign in"}
              </button>
            </div>
          </section>
      </div>
    </main>
  );
}

function AuthVisual() {
  return (
    <section className="hidden min-h-full flex-col items-center justify-center overflow-hidden bg-[#e7faec] px-10 py-12 lg:flex">
      <div className="relative h-96 w-full max-w-lg overflow-hidden">
        <Image
          src="/login-illustration.png"
          alt="WhatsApp automation workspace illustration"
          fill
          priority
          className="scale-[1.55] object-contain"
          sizes="520px"
        />
      </div>

      <div className="mt-6 max-w-md text-center">
        <p className="text-4xl font-semibold tracking-normal text-slate-800">
          WhatsApp automation hub
        </p>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-slate-500">
          Manage customer chats, auto-replies, broadcasts, and AI support from one workspace.
        </p>
      </div>

      <div className="mt-8 flex justify-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-200" />
        <span className="h-2 w-6 rounded-full bg-emerald-400" />
        <span className="h-2 w-2 rounded-full bg-emerald-200" />
      </div>
    </section>
  );
}

// Google's brand mark, required by their sign-in branding guidelines.
function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.97-6.19A23.9 23.9 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 21a8 8 0 0 0-16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 6h16v12H4V6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m4 7 8 6 8-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
