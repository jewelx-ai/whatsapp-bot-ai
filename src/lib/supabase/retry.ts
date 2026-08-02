// Retry wrapper for Supabase Auth admin (GoTrue) calls.
//
// On projects using asymmetric (ES256) JWT signing keys, the auth admin
// endpoints intermittently reject valid service-role requests with:
//   "invalid JWT: unable to parse or verify signature, token is unverifiable:
//    error while executing keyfunc: unrecognized JWT kid <nil> for algorithm ES256"
//
// The failure is transient — the same call succeeds moments later — and it only
// affects auth admin endpoints, not PostgREST queries. Retrying with a short
// backoff turns these into successful calls instead of user-visible errors.

const TRANSIENT =
  /unrecognized JWT kid|token is unverifiable|invalid JWT|signature is invalid/i;

export function isTransientAuthError(message: string | undefined | null): boolean {
  return !!message && TRANSIENT.test(message);
}

// Any Supabase admin response: a discriminated union whose error member carries
// a message. Generic over the whole result so the caller's exact type (and its
// data/error union) is preserved.
type AdminResponse = { error: { message: string } | null };

/**
 * Runs a Supabase auth admin call, retrying only on the transient JWT fault.
 * Real errors (duplicate email, weak password, ...) are returned immediately.
 */
export async function withAuthRetry<R extends AdminResponse>(
  label: string,
  call: () => Promise<R>,
  attempts = 4
): Promise<R> {
  let result = await call();

  for (let attempt = 1; attempt < attempts; attempt++) {
    if (!result.error || !isTransientAuthError(result.error.message)) return result;
    const wait = attempt * 300;
    console.warn(
      `${label}: transient auth error, retry ${attempt}/${attempts - 1} in ${wait}ms`
    );
    await new Promise((r) => setTimeout(r, wait));
    result = await call();
  }

  return result;
}
