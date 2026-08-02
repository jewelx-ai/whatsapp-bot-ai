import { LoginForm } from "./login-form";

// A sign-in round trip that fails away from this page (Google OAuth denial,
// expired email link) comes back from /auth/callback as /login?error=<code>.
// Codes map to fixed copy here so the screen can never render an
// attacker-supplied message from the query string.
const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied:
    "Google sign-in was cancelled. Try again, or use your email and password.",
  oauth_failed:
    "Google sign-in failed. Try again, or use your email and password.",
  link_expired:
    "That sign-in link is invalid or has already been used. Please sign in again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return <LoginForm initialError={error ? ERROR_MESSAGES[error] : undefined} />;
}
