# 08 — Changelog

All notable work on this project, newest first. Historical “verified” notes describe checks run at that time; the latest readiness audit supersedes earlier completion claims.

## 2026-07-31 — Post-audit hardening fixes

Implemented the immediate fixes from the client/SaaS audit.

### Changed

- Upgraded Next.js from `16.2.10` to `16.2.12`.
- Added scoped npm overrides for Next's transitive `postcss` and `sharp`
  packages so `npm audit --omit=dev` passes.
- Migrated the session refresh and route guard from deprecated
  `src/middleware.ts` to `src/proxy.ts`.
- Made `supabase/migrations/` the documented database setup path and disabled
  the missing local seed-file reference.
- Added optional `KB_INGEST_ALLOWED_HOSTS` production allowlisting and
  content-type checks for website ingestion.
- Surfaced manual-send persistence failures and made webhook database failures
  return non-200 responses so Meta can retry.
- Added `POST /api/worker/broadcasts`, protected by `CRON_SECRET`, for
  independent broadcast queue processing and stale-recipient recovery.
- Added `npm test` with baseline hardening tests.
- Added an analytics API fallback plus
  `20260731000003_dashboard_analytics_signature_fix.sql` so `/analytics` still
  loads when Supabase has not cached the original RPC signature.
- Added and pushed `20260731000004_reload_postgrest_schema.sql` to force the
  Supabase API schema cache to reload after the RPC change.
- Added [19-hardening-fixes.md](19-hardening-fixes.md).

### Verified

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm audit --audit-level=moderate --omit=dev`

## 2026-07-31 — Operator-managed plan enforcement

Plan limits are now enforced without adding Stripe or billing automation.

### Added

- `src/lib/limits.ts` as the central definition for `free`, `starter`, and `pro`
  limits.
- [18-plan-enforcement.md](18-plan-enforcement.md) with the full limit table and
  operator workflow.

### Limits

| Plan | AI replies/day | Broadcast recipients/campaign | KB documents | KB chars/document |
|---|---:|---:|---:|---:|
| `free` | 25 | 25 | 3 | 50,000 |
| `starter` | 500 | 500 | 25 | 250,000 |
| `pro` | 2,000 | 1,000 | 100 | 500,000 |

### Changed

- AI replies now use the workspace plan's daily cap through `bump_ai_usage()`.
- `past_due` or `canceled` plan status blocks AI replies, broadcast creation and
  processing, and KB ingestion.
- `POST /api/broadcasts` counts the target audience before creating a campaign
  and rejects audiences above the workspace plan.
- KB text, file, and URL ingestion enforce plan document-count and document-size
  limits.
- The operator organization controls now state that plan changes apply
  immediately.

### Still required

Stripe checkout, billing webhooks, invoice/payment state sync, per-minute rate
limits, and spend alerts are not built.

## 2026-07-31 — Durable broadcast recipient queue

Broadcast sending no longer performs an untracked, duplicate-prone fan-out inside
one request.

### Added

- `supabase/migrations/20260731000002_durable_broadcasts.sql`.
- `broadcasts.language_code`, `status`, `idempotency_key`, `audience_size`,
  `processed_count`, and `completed_at`.
- `broadcast_recipients` with one durable row per contact, delivery status,
  attempts, Meta message ID, and failure details.
- `PATCH /api/broadcasts` to process the next bounded batch for an existing
  campaign.

### Changed

- `POST /api/broadcasts` creates or reuses a campaign by idempotency key,
  enqueues up to 1,000 opted-in contacts, and processes one bounded batch.
- Recipient rows are claimed from `queued` to `processing` before Graph sends, so
  overlapping dashboard requests do not double-send the same queued recipient.
- `/broadcasts` shows campaign status and progress, then keeps calling `PATCH`
  until the campaign reaches `completed`, `partial_failed`, or `failed`.

### Still required

Processing can now run from the dashboard or from the worker endpoint.
Production still needs scheduler configuration, cancellation, template preflight
checks, and scheduled execution.

## 2026-07-31 — Analytics aggregate RPC

The analytics dashboard no longer downloads raw message rows into the browser.

### Added

- `supabase/migrations/20260731000001_dashboard_analytics.sql` with
  `dashboard_analytics(p_org_id, p_days)`.
- `GET /api/analytics`, which resolves the current workspace and calls the
  service-role-only aggregate RPC.

### Changed

- `/analytics` now renders total contacts, total/open conversations, and the
  14-day incoming/outgoing chart from aggregate data.
- The old Supabase `max_rows` undercount for busy workspaces is removed for the
  current 14-day dashboard.

### Still required

Longer reporting windows, exports, cohorts, and richer campaign analytics are
not built.

## 2026-07-31 — Contact consent controls

Broadcast eligibility is now manageable from both the dashboard and WhatsApp
messages.

### Added

- `/contacts` shows a consent badge for each contact and lets operators toggle
  `opted_in` between `Opted in` and `Opted out`.
- The webhook recognizes exact inbound opt-out commands: `STOP`, `STOP ALL`,
  `UNSUBSCRIBE`, `CANCEL`, `END`, and `QUIT`.
- The webhook recognizes exact inbound opt-in commands: `START`, `SUBSCRIBE`,
  and `UNSTOP`.
- Consent commands store the inbound message, update `contacts.opted_in`, send a
  confirmation reply, and skip normal keyword/AI automation for that message.

### Still required

Broadcasts already filter on `opted_in = true`, but the product still needs a
formal consent policy and evidence/history fields before public launch.

## 2026-07-31 — WhatsApp token encryption at rest

New WhatsApp access tokens saved through `/api/settings` are now encrypted before
being written to `organizations.wa_access_token`.

### Added

- `src/lib/secrets.ts` with server-only AES-256-GCM helpers for tenant WhatsApp
  tokens.
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`, a server-only 32-byte key accepted as base64,
  hex, or raw UTF-8.
- [17-token-encryption.md](17-token-encryption.md) documenting setup, migration,
  and rotation caveats.

### Changed

- `POST /api/settings` encrypts any submitted `accessToken`.
- `GET /api/settings` decrypts only server-side to return `connected` and a
  non-secret `tokenHint`; the token itself is still never sent to the browser.
- Credential users (`GET /api/settings/verify`, manual replies, broadcasts, and
  webhook auto-replies) decrypt server-side before calling Meta.
- Legacy plaintext rows remain readable so existing tenants can continue working
  until an owner/admin re-saves the token.

### Still required

Existing plaintext rows must be migrated by re-saving each tenant token after
`WHATSAPP_TOKEN_ENCRYPTION_KEY` is configured. The implementation currently
supports one active key, so key rotation needs a maintenance path before changing
the key in production.

## 2026-07-25 — Operator password rotated; hydration warning diagnosed

### Operator password

Generated a 24-character random password (alphanumeric plus `-`/`_`, guaranteed
to contain lower, upper, and digit so it satisfies the project's
`password_requirements`), set it on the Supabase auth user via
`PUT /auth/v1/admin/users/{id}`, and **verified it by performing a real
`grant_type=password` sign-in**. Admin calls are retried with backoff because
this project's ES256 keys make them intermittently fail.

Recorded as `PLATFORM_SUPER_ADMIN_PASSWORD` in `.env.local` next to the operator
email, with a comment stating it is **not read by any code** — Supabase stores
only a bcrypt hash, so this is purely a convenience record. `.gitignore` already
covers `.env*`, so it is not committed. Re-parsed `.env.local` afterwards: 12
keys, no duplicates, no empty values.

### Hydration warning — not an application defect

The reported "tree hydrated but some attributes… didn't match" console error on
`/admin/login` is caused by **browser extensions**, identifiable from the
attributes in the diff:

- `bis_skin_checked="1"` — Bitdefender extension, added to many `<div>`s.
- `sweezy-custom-cursor-…` class plus an injected
  `style={{cursor:"url(\"data…"}}` on the `<label>` — Sweezy Custom Cursor
  extension.

Both mutate the DOM before React hydrates, which is the last cause listed in
React's own message. There is no code fix; `suppressHydrationWarning` only
applies one level deep and would mask genuine mismatches. Confirm by loading the
page in an incognito window or a profile without extensions.

Audited our own code for real hydration hazards while investigating: the
`toLocaleDateString()` calls in the `/admin` portal are in **server** components
(rendered once, never re-hydrated), and the client pages that format dates load
their rows in `useEffect`, so no date is present in the server HTML to mismatch.
No `Math.random()` or `Date.now()` in render paths.

## 2026-07-25 — Password reset on the admin login page

The operator portal previously had no recovery path by design, which meant a
forgotten password locked the operator out permanently: Supabase stores only a
bcrypt hash, so the old password cannot be read back from anywhere.

### Added

- **"Forgot password?" on `/admin/login`.** Toggles the form into recovery mode
  (the password field is hidden) and calls
  `resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`, with a
  "Back to sign in" control to return.
- **Account-enumeration protection.** The success message is identical whether or
  not the address is registered, and `user not found` errors are deliberately
  swallowed. Only real transport failures such as `429` rate limiting surface.
- **Correct destination after reset.** `/reset-password` is shared with tenants,
  so it now calls `GET /api/admin/session` after the update and sends the
  operator to `/admin` instead of a workspace `/inbox` it cannot access. The
  notice text matches the destination.

### Verified

`tsc`, `eslint`, and `npm run build` exit 0. `/admin/login` and
`/reset-password` return `200`, `/admin` still `307`s when signed out, and the
"Forgot password?" control is present in the rendered page (the reset-mode
strings appear after the client toggles mode). `POST /auth/v1/recover` against
the live project for the operator address returned **HTTP 200**, so recovery mail
is accepted and queued.

### Caveats

- The recovery link only lands correctly if `<origin>/reset-password` is
  allow-listed in Supabase → Authentication → URL Configuration; otherwise
  Supabase redirects to the project Site URL. `supabase/config.toml` already
  allow-lists the local origin.
- Supabase's built-in SMTP is rate limited (`[auth.rate_limit] email_sent = 2`
  per hour locally). Configure real SMTP before production.

## 2026-07-25 — Operator portal moved from `/platform` to `/admin`

The super-admin control panel now lives at **`/admin`** instead of `/platform`,
per request. Both the pages and their API namespace moved, so the naming is
consistent.

### Moved

| Before | After |
|---|---|
| `/platform` | `/admin` |
| `/platform/login` | `/admin/login` |
| `/platform/organizations`, `/platform/organizations/[id]` | `/admin/organizations`, `/admin/organizations/[id]` |
| `/platform/users` | `/admin/users` |
| `/platform/access` | `/admin/access` |
| `/api/platform/orgs`, `/api/platform/orgs/[id]` | `/api/admin/orgs`, `/api/admin/orgs/[id]` |
| `/api/platform/users` | `/api/admin/users` |
| `/api/platform/session` | `/api/admin/session` |
| `src/app/platform/(portal)/` | `src/app/admin/(portal)/` |
| `src/app/api/platform/` | `src/app/api/admin/` |

`src/lib/platform.ts` keeps its name (it is the operator guard, not a route), and
`PLATFORM_SUPER_ADMIN_EMAIL` is unchanged so no environment edit is needed.
`PLATFORM_LOGIN_PATH` now resolves to `/admin/login`, and the Access page renders
that constant instead of a hardcoded string. Middleware matcher, guards, and
operator redirects were updated; the locals were renamed to `isAdminLogin` /
`isAdminArea`.

### Note on the earlier `/admin` removal

`/admin` used to be a *tenant* page and was deleted on 2026-07-25. It is now the
*operator* URL, so docs that said "`/admin` returns 404" were corrected: a
signed-out visitor is redirected to `/admin/login`, and a signed-in tenant is
bounced to `/inbox` by `requirePlatformAdmin()`. The `/api/admin/*` namespace is
operator-only and returns `403` otherwise. The removed tenant endpoint
(`PATCH /api/admin/members`) does not exist, so there is no collision.

### Verified

`tsc`, `eslint`, and `npm run build` all exit 0, and the build manifest lists the
six `/admin*` pages and four `/api/admin/*` handlers with no `/platform` routes
remaining. Live checks against the dev server:

- `/admin`, `/admin/organizations`, `/admin/users`, `/admin/access` → `307` to
  `/admin/login` when signed out; `/admin/login` → `200`.
- `POST`/`PATCH`/`DELETE /api/admin/users`, `POST /api/admin/orgs`,
  `GET /api/admin/session` → `403` when signed out.
- Old `/platform`, `/platform/login`, `/platform/organizations`,
  `/api/platform/users` → `404`.
- Tenant app unaffected: `/login` `200`; `/inbox`, `/settings`, `/knowledge`
  `307`.

Docs updated across README, 03, 04, 06, 09, 11, 14, 15, 16 (including the
flowchart nodes and the manual test-guide expectation that `/admin` 404s).

## 2026-07-25 — Documentation accuracy audit

Swept every doc for claims that no longer match the code. Historical entries in
this changelog were left as written; only current-state documents were corrected.

### Corrected

- **Stale production verdicts.** `README.md`, `docs/README.md`, and
  `07-deployment.md` still declared a flat **NO-GO as of 2026-07-21** and cited
  "lint fails" plus authorization/SSRF/webhook blockers that are now fixed. All
  three now state the accurate position: security and correctness blockers
  closed, build/typecheck/lint passing, live WhatsApp round trip confirmed, and
  the genuinely remaining items listed (plaintext tokens, no billing,
  synchronous non-idempotent broadcasts, analytics undercounting, no test suite,
  unverified Docker *image* build).
- **`13-feature-readiness-audit.md`** now carries a superseded banner naming it a
  2026-07-21 snapshot, since `README.md` had pointed to it as current guidance.
- **Stale model references.** `06-setup-guide.md` documented `ZAI_MODEL` default
  `glm-5.1`; `10-phase3-growth.md` said the bot "calls glm-5.1". Both now describe
  the `AI_PROVIDER` selection, the `glm-4.7-flashx` default, the Gemini option,
  and failover.
- **Removed `/admin` still drawn as live.** `15-flowcharts.md` listed `/admin` in
  the tenant dashboard node and in the role-check guard box. Both corrected; the
  AI nodes no longer hardcode GLM-5.1.
- **`02-architecture.md`** reply pipeline and `ai.ts` description now mention both
  providers and failover.
- **Env documentation.** `07-deployment.md` and `06-setup-guide.md` now list
  `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and the Google OAuth variables.
- **Index and top-level scope** updated for Google sign-in, `.docx` ingestion, and
  provider failover.

### Verified

Re-grepped after editing: zero `glm-5.1` references and zero stale NO-GO verdicts
outside the changelog and the superseded audit. Every remaining `/admin` mention
explicitly documents its removal. Open items were re-checked against code rather
than assumed: no test runner or test files exist, no Stripe/billing code exists,
and `api/broadcasts/route.ts` still awaits `sendTemplate` inside a per-contact
loop in the request.

## 2026-07-25 — Full health sweep + error fixes

Ran a 53-check sweep over static analysis, page/API reachability, auth guards,
RLS isolation, database objects, and every external integration. 47 passed
first time; three "failures" were faults in the check script itself, not the app
(`GET` called on platform routes that only expose POST/PATCH/DELETE — the real
methods correctly return 403; and `match_kb_chunks` called with a
`p_min_similarity` argument that does not exist in its signature).

### Fixed

- **React lint error in Settings** (`react-hooks/set-state-in-effect`).
  `verify()` wrote state synchronously inside the mount effect, which can cause
  cascading re-renders. Split into `runCheck()` (network only, safe from an
  effect) and `verify()` (shows the spinner, used by the post-save path), and
  deferred both loaders to a microtask, matching the inbox pattern.
- **Dead code**: removed the unused `ROLE_BADGE` map from the platform org
  detail page; role styling belongs to the `MemberRole` client component.
- **Stale refresh-token loop in middleware.** A revoked/expired session cookie
  was re-presented on every request, costing a failed Supabase round trip each
  time and logging `AuthApiError: Invalid Refresh Token: Refresh Token Not
  Found`. Middleware now expires `sb-*-auth-token` cookies when auth fails and
  yields no user, so the visitor is cleanly signed out. Applied through a
  `finalize()` helper so the deletion rides on redirects too, and gated on
  `authError && !user` so valid sessions are never disturbed.
- **Duplicate dev server** on port 3001 shut down; ngrok points at 3000.

### Investigated, not a bug

`ReferenceError: pickAxisLabels is not defined` in the dev log was a transient
Fast Refresh artefact recorded while the analytics chart was being edited (the
next log line is "Fast Refresh had to perform a full reload"). The function is
declared at module scope and hoisted, and the production build compiles it.

### Verified

`tsc`, `eslint`, and `npm run build` all exit 0. Re-checked every route guard
after the middleware change: `/login` and `/admin/login` return 200, and all
eight dashboard routes plus `/admin` still return 307 when signed out. A
request carrying a garbage auth cookie now returns
`set-cookie: sb-…-auth-token=; Max-Age=0` alongside the `/login` redirect.
Vector RAG confirmed live: a Voyage-embedded query returned the correct
company-info passage as top hit (0.52 similarity). RLS confirmed blocking
anonymous reads on all six tenant tables.

### Outstanding (needs action in Meta, not code)

The tenant WhatsApp access token expired again mid-session (`code 190`), the
third time in one day. Replies cannot send until a fresh token is saved in
Settings. A permanent System User token is the fix and remains the last real
blocker.

## 2026-07-25 — Google sign-in wired up end to end

Google sign-in/sign-up was already implemented client-side (PKCE
`signInWithOAuth`, branded button on both sign-in and sign-up, `/auth/callback`
code exchange, safe error-code mapping). Audit found it would not have worked
correctly, for two reasons.

### Fixed

- **Profile names for OAuth users** (migration `20260725000002`).
  `handle_new_user()` read only `raw_user_meta_data->>'full_name'`, which our
  email form sets but Google does not always provide. Google users would have
  been created with a NULL name and shown blank in member lists and the account
  panel. The trigger now falls back `full_name` → `name` → `given_name` +
  `family_name` → email local part, and existing nameless profiles are
  backfilled without overwriting real names.
- **Readable failure when the provider is off.** Supabase returns
  `Unsupported provider: provider is not enabled`, which was rendered verbatim.
  The login form now maps it to "Google sign-in is not available yet. Please use
  your email and password."

### Added

- `[auth.external.google]` in `supabase/config.toml`, reading
  `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `…_SECRET` so the provider can be
  enabled with `supabase config push` instead of only by dashboard clicks.
  `skip_nonce_check = true` is required for Google against the local stack.
- `additional_redirect_urls` now allow-lists `/auth/callback` (and
  `/reset-password`) for local origins; unlisted hosts are rejected by Supabase.
- Google OAuth env placeholders in `.env.local.example`.
- Setup guide: config-as-code path, the name-resolution order, and a curl
  one-liner to check whether the provider is live.

### Verified

Migration pushed to the linked project (`supabase db push`, exit 0) and
confirmed against live data: 0 profiles missing a display name. Traced the
first-time Google path in code — trigger creates the profile with `org_id` NULL,
and `(dashboard)/layout.tsx` redirects to `/onboarding` to create a workspace.
`npm run build` passes.

### Still required (needs your Google account, cannot be done from the repo)

`https://<project-ref>.supabase.co/auth/v1/settings` currently reports
`"google": false`. Create a Google Cloud OAuth **Web application** client with
redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`, then enable
the provider with its client ID/secret. Until then the button shows the friendly
unavailable message.

## 2026-07-25 — Live incident: no reply, then wrong reply (two separate faults)

A customer message in Tanglish ("300 eruthu 500 budget kule ethahcu laptop
eruhta solu") first got **no reply at all**, then later got the static
"Sorry, I didn't understand that" instead of a real answer.

### Root causes (two, unrelated)

1. **Expired WhatsApp token → no reply.** The inbound message was received and
   stored correctly, but the send failed:
   `Authentication Error (code 190)` for phone_number_id 1021734921030952.
   Meta's test-number access tokens from the API Setup page expire in ~24 hours.
   The error classification added earlier reported this accurately.
2. **Gemini key rejected → static fallback.** Once the token was refreshed the
   send worked, but `generateAIReply()` returned `null` because Gemini answered
   `400 "API key not valid"`. The key is Google's **new `AQ.` "authorization
   key" format**, which is currently rejected intermittently by the
   `generativelanguage` REST endpoint — the same key succeeded from curl and
   Node immediately before and after the failure. Google is migrating away from
   the older `AIza` traffic keys, and `AQ.` key rejections on this endpoint are
   widely reported. (See the [Google AI developer forum thread](https://discuss.ai.google.dev/t/account-restricted-to-aq-keys-all-return-401-access-token-type-unsupported-on-generativelanguage-googleapis-com-requesting-fix-aiza-restoration/175424); content rephrased for licensing compliance.)

Ruled out during diagnosis: conversation was `status=bot` (not a human
handoff), the key in `.env.local` was byte-for-byte correct (53 chars, single
definition, no stray `.env` files, nothing shadowing it in the shell), and the
identical request succeeded from both curl and Node.

### Fixed — AI providers now fail over automatically

`generateAIReply()` no longer depends on one vendor. `AI_PROVIDER` selects the
**primary** model and the other provider becomes an automatic **fallback**:

- Try primary → if it returns nothing, try the other provider.
- Only when *every* configured provider fails does the bot send the static
  reply. A fallback answer logs a warning naming the failed primary.
- Providers with no key configured are skipped, so a single-provider setup
  still works unchanged.

### Verified

With a deliberately invalid Gemini key, the customer's real Tanglish question
still returned a grounded answer naming in-stock laptops and prices via the GLM
fallback (previously this produced the static "didn't understand" reply). With a
working key, Gemini answered in fluent Tanglish. `npx tsc --noEmit` passes.

### Operational note

The WhatsApp test-number token expires daily — replies stop until it is
re-pasted in Settings. A permanent System User token (Meta Business Settings)
removes this recurring failure and is required before production.

## 2026-07-25 — Model benchmark + selectable AI provider (GLM / Gemini)

### Benchmark

Ran an 8-case multilingual test (English, Tamil, Chinese, Malay, Tanglish,
Singlish) scoring KB grounding, language mirroring, latency, and cost per 1,000
replies across the Z.ai GLM line-up:

| Model | Grounded | Language | ~$/1k | Avg latency | Notes |
| --- | --- | --- | --- | --- | --- |
| glm-4.7-flashx | 8/8 | 6/8 | $0.17 | 940 ms | best value |
| glm-4.6 | 8/8 | 6/8 | $1.39 | 1,682 ms | pricier |
| glm-4.5-flash | 8/8 | 6/8 | free | 1,278 ms | free-tier rate limits |
| glm-4.7-flash | 7/8 | 6/8 | free | 1,328 ms | one 429 |
| glm-5.1 (old default) | 6/8 | 5/8 | $2.07 | 24,000 ms | slowest, two 500s |

### Changed

- **Default GLM model is now `glm-4.7-flashx`** (was `glm-5.1`), set via
  `ZAI_MODEL` and as the code fallback. Equal top grounding to the flagship,
  fastest, ~16x cheaper.
- **AI replies are now provider-pluggable.** `src/lib/ai.ts` supports two
  backends selected by the `AI_PROVIDER` env:
  - `glm` — GLM via Z.ai's OpenAI-compatible API (the existing path).
  - `gemini` — Google Gemini via the native `generateContent` REST endpoint.
- **Gemini is the active provider** (`AI_PROVIDER=gemini`, default model
  `gemini-3.5-flash-lite`). It mirrors non-Latin scripts more reliably: on the
  Tamil bulk-order escalation case — which every GLM model answered in English —
  Gemini replied in Tamil script with the correct `[HANDOFF]`.

### Fixed — multilingual replies (root cause of "LANG OFF")

The benchmark's language failures were not a model problem: the production
system prompt had **no language rule at all**, so the model chose freely and
often defaulted to English. Added an explicit, high-priority LANGUAGE rule to
`SYSTEM_PROMPT`:

- Reply in the same language *and script* the customer used.
- Tamil script → Tamil script; romanised Tamil (Tanglish) / Singlish → stay
  romanised (do not switch to Tamil script); Chinese → Chinese; Malay → Malay.
- Keep KB facts and proper nouns (addresses, model names, prices, phone numbers)
  verbatim even inside a reply written in another language.

This applies to **both** providers. Re-tested through Gemini with the real
prompt: Tamil script for Tamil, romanised for Tanglish, Chinese stays Chinese,
Malay stays Malay, and grounding/`[HANDOFF]` all held. (Minor: flash-lite can
garble a few characters in longer decorative non-Latin sentences; factual
content stayed clean.)

### Notes

- The newer-format Google key (`AQ.…`) authenticates via the `x-goog-api-key`
  header; the older `?key=` query param returns 401 for these keys.
- `gemini-2.5-flash-lite` is retired for new keys; `gemini-3.5-flash-lite` is
  the current flash-lite stable tier.
- Flip `AI_PROVIDER` back to `glm` at any time — both keys stay configured.
- Either provider returns the static fallback on error/empty output.

### Verified

`npx tsc --noEmit` passes; the dev server boots with the new env; a live
`generateContent` call with the Tamil escalation prompt returned grounded Tamil
script in ~1.07 s. The GLM path is unchanged and still available via
`AI_PROVIDER=glm`.

## 2026-07-25 — Semantic retrieval enabled (Voyage embeddings)

### Changed

- `VOYAGE_API_KEY` configured, so retrieval now uses pgvector cosine similarity
  (`voyage-3.5-lite`, 1024 dims) with the keyword stages as fallback.
- Backfilled embeddings for the 5 passages ingested before embeddings were
  enabled; without this the vector search would have matched nothing.

### Fixed (resilience, found while testing)

- **A Voyage failure no longer aborts retrieval.** The embedding query is now
  isolated in its own try/catch, so a rate limit or outage falls through to
  full-text search instead of returning no context at all. This matters because
  the free tier without a payment method allows only **3 requests per minute**,
  and every AI reply makes one query embedding.
- **A Voyage failure no longer loses an upload.** Ingestion stores passages
  without embeddings and marks the document `ready` (full-text retrieval still
  works) rather than failing the whole document with status `error`.

### Verified

Voyage key returns 1024-dimension vectors matching the `vector(1024)` column;
5/5 passages embedded; and semantic search succeeds on wording absent from the
document — "cheapest laptop for a programmer" retrieves the Latitude 5420
passage, "can I pay using my phone app" retrieves the PayNow answer. Neither
would match with keyword search.

### Note

The 3 RPM free-tier limit is a real production constraint: under load, replies
silently degrade to keyword retrieval. Adding a payment method in the Voyage
dashboard raises it (the 200M free tokens still apply).

## 2026-07-25 — Fixed AI inventing business facts (RAG grounding)

A customer asked "where is your shop" and the bot answered "T. Nagar, Chennai"
although the knowledge base says 180 Race Course Road, Singapore.

### Root cause

Retrieval used full-text search with AND semantics, so "where is your shop"
reduced to the single term `shop` after stopword removal. That word does not
appear in the document ("STORE FAQ", "located at"), so **no passages matched**,
the model received no knowledge base at all, and the prompt did not forbid
answering business questions from general knowledge.

### Fixed

- `retrieveContext()` now degrades in stages: pgvector (when embeddings are
  configured) → full-text AND → full-text **OR** over meaningful terms
  (stopwords removed, input sanitised so it cannot produce invalid tsquery) →
  for a small knowledge base (≤ 12 chunks) **return every passage**, because
  keyword search cannot bridge vocabulary gaps like "shop" vs "store". Context
  is capped at 12,000 characters.
- The system prompt now states that every business-specific fact (address,
  city, phone, hours, prices, stock, warranty, delivery, payment, policies) must
  come verbatim from the knowledge base or the conversation, and that the model
  has no other information about the business.
- When retrieval returns nothing, an explicit note is appended instructing the
  model to state no business facts and to hand off.

### Verified

6 checks against the live knowledge base and GLM: retrieval now returns 5
passages (previously zero) and includes the real address; the model answers
*"We are located at 180 Race Course Road, Singapore 218609, near Farrer Park MRT
Exit F"* with no mention of Chennai or T. Nagar; and an unanswerable question
("what time do you close on Sunday?") produces a handoff rather than an invented
time.

## 2026-07-25 — Word (.docx) knowledge uploads

### Added

- `POST /api/kb/upload` now accepts **Word `.docx`** alongside PDF, extracting
  text with `mammoth` (pinned `1.11.0`). The Knowledge tab is labelled
  "PDF / Word" and the file picker accepts both.
- `kb_documents.source_type` gained `docx`
  (migration `20260725000001_kb_docx_source.sql`, applied to the remote), so Word
  files are labelled correctly instead of masquerading as PDFs.
- Uploads that yield under 20 characters of text are rejected with a message
  about scanned/image-only documents needing OCR, instead of silently storing an
  empty document.
- Legacy `.doc` (binary Word 97) is rejected with a hint to save as `.docx`,
  since `mammoth` cannot read it.

### Verified

11 checks with a real 3.59 MB Word file: upload accepted, 4 passages indexed,
`source_type = docx`, status `ready`, title derived from the filename, and the
extracted text contains the company name, a product price (`SGD 625`), and the
escalation rule. A `.txt` upload is rejected naming both supported formats, and
`.doc` gets the specific conversion hint.

### Note

`sharp` reports 3 high-severity advisories in `npm audit`; it is a transitive
dependency of `next@16.2.10`, unrelated to this change.

## 2026-07-25 — WhatsApp error classification and saved-token confirmation

### Fixed

- **Non-auth WhatsApp errors were reported as "token expired".** Auth failures
  were detected from Graph's `type: "OAuthException"`, which the WhatsApp Cloud
  API also returns for unrelated problems — so "recipient not in allowed list"
  (`131030`) and "parameter value is not valid" (`131009`) told operators to
  replace a perfectly valid token. Failures are now classified by error **code**
  (`auth`, `recipient_not_allowed`, `outside_window`, `undeliverable`,
  `rate_limited`, `invalid_request`) and `/api/messages/send` returns a message
  that names the actual fix, with `429` for rate limits.
- Failed read receipts are logged as a warning instead of an error; a missing
  blue tick is cosmetic and was adding noise to the log.
- **Settings gave no sign that a token had been saved.** The field is
  intentionally write-only, so it always looked empty. `GET /api/settings` now
  also returns a masked `tokenHint` (length plus last four characters) and the
  page renders it under the field.

### Verified

- 7 checks: the hint's length and last four characters match the stored token,
  and the full token (and even its first 40 characters) never appears in the
  response body.
- Live: `#131030` now logs as `sendText failed [recipient_not_allowed]` and
  `#131009` as `read receipt skipped`, instead of both claiming auth failure.

## 2026-07-25 — Settings shows a truthful WhatsApp status

### Fixed

- The **connection badge no longer lies**. It previously showed "connected"
  whenever a token was merely stored, so an expired token still read as
  connected while every send failed. Settings now calls the new
  `GET /api/settings/verify`, which asks Meta about the stored credentials, and
  renders `checking…`, `connected` (with display number, verified name, quality
  rating), `token expired` (with Graph's reason and how to fix it),
  `not connected`, or `unverified` when Meta is unreachable. It re-checks after a
  save, and the token field prompts for a replacement when the token is invalid.

### Added

- `GET /api/settings/verify` and `verifyCredentials()` in `src/lib/whatsapp.ts` —
  a read-only Graph check with a 10-second timeout; the token never leaves the
  server.

### Verified

13 end-to-end checks passed: settings load with role, the token is never returned
to the client, save persists name and the AI toggle to the database and survives a
reload, values restore, an empty name is rejected, both endpoints return `401`
without a session, and the verify endpoint correctly reports the currently
expired token as `invalid`.

## 2026-07-25 — Administration removed from the client dashboard

Customers now see customer features only; every administrative action lives in
the operator portal.

### Removed

- The tenant-facing `/admin` page and its members component. `/admin` returns 404.
- `PATCH /api/admin/members` — tenants can no longer change roles.
- The **Admin** sidebar link, and the role-conditional navigation plumbing that
  supported it (nav is a static list again).
- `/admin` from the middleware dashboard guard and route matcher.

### Added

- `PATCH /api/admin/users` — operator-only role and workspace assignment. A
  workspace can never be left without an owner (demoting or moving its last owner
  is refused), and the operator's own profile cannot be role-changed because it
  belongs to no workspace.
- An editable **role** control on the members table at
  `/admin/organizations/[id]`.

### Verified

15 end-to-end checks passed: `/admin` returns 404 signed out and signed in; the
last-owner guard refuses the demotion and leaves the database unchanged;
demotion succeeds once a second owner exists; promotion works; the operator
profile and empty payloads are rejected; and a tenant session gets `403` with no
role change applied. Test workspaces and accounts were removed afterwards.

## 2026-07-24 — Testing tooling and send-error clarity

### Added

- `scripts/simulate-inbound.mjs` — signs a Meta-shaped payload with
  `WHATSAPP_APP_SECRET` and posts it to `/api/webhook`, so Inbox, Contacts,
  Auto-replies, and AI replies can be exercised without Meta or a tunnel.
- [16-manual-test-guide.md](16-manual-test-guide.md) — per-feature manual test
  steps with expected results.
- [15-flowcharts.md](15-flowcharts.md) — Mermaid diagrams of every flow.

### Fixed

- **Creating an auto-reply from the dashboard** now works. The insert omitted the
  required `org_id`; the page resolves the caller's workspace and includes it.
  This was a long-standing release blocker.
- **Expired/invalid WhatsApp token is now reported clearly.** Graph errors with
  `code 190` / `OAuthException` are detected as a credentials problem:
  `/api/messages/send` returns `409` with "the access token is expired or
  invalid. Update it in Settings" instead of a generic `502 WhatsApp send
  failed`, and the server logs one actionable line instead of two cryptic ones.
- **Inbox no longer re-subscribes on every click.** The realtime effect depended
  on `selectedId`, so selecting a conversation tore down the channel and reloaded
  the list; the open thread is now read through a ref.
- **`.env.local` had two `WHATSAPP_APP_SECRET` entries** (placeholder plus the
  real value in the wrong section). Next.js used the last one, so the app worked,
  but tooling reading the first failed. Reduced to a single correct entry.

## 2026-07-25 — Inbox thread reads bottom-up

### Changed

- The `/inbox` message column is bottom-anchored. A short conversation now sits
  directly above the composer and grows upward; previously it hung from the top
  of the pane with the empty space below the last bubble.
- Message runs: consecutive messages from the same side within five minutes
  share one block — contact name on the first bubble, avatar on the last, and a
  squared bottom corner on the last bubble. Both sides reserve one avatar column;
  outbound uses a single workspace mark because the schema does not record
  whether the bot or a teammate sent the reply.
- Day dividers (Today / Yesterday / date) separate the thread.
- Outbound delivery state is shown as ticks — one for `sent`, two for
  `delivered`, two highlighted for `read`, and a warning glyph plus "failed" —
  instead of the raw status word. The status text is kept as screen-reader-only
  content and a tooltip.
- Composer is a single rounded field with a circular send button (labelled for
  assistive tech) and a spinner while the send is in flight.
- Opening a thread jumps straight to the newest message; only messages arriving
  while you read animate into view.
- Palette unchanged: teal outbound bubbles, white inbound bubbles, existing
  neutral pane and borders.

### Verified

- `npm run build`, `tsc --noEmit`, and `eslint` on the inbox page all clean.
- **Not verified:** rendered appearance. There is no browser automation in this
  repo, so the layout was reasoned about rather than screenshotted.

## 2026-07-25 — Google sign-in on the tenant login page

### Added

- **Sign in with Google** on `/login` is now functional. It calls
  `supabase.auth.signInWithOAuth({ provider: "google" })` (PKCE) with
  `redirectTo = <origin>/auth/callback?next=/inbox` and `prompt=select_account`,
  shows a redirecting state, and disables the email form while in flight. The
  button previously had no handler. Label follows the mode (sign in / sign up),
  and the placeholder letter "G" is replaced by the Google brand mark.
- `/login` is now a server page (`page.tsx`) that translates `?error=<code>`
  from the auth callback into fixed copy, plus a client `login-form.tsx`. Only
  known codes render (`oauth_denied`, `oauth_failed`, `link_expired`), so the
  page cannot echo an attacker-supplied message from the query string.
- Google OAuth setup steps (Google Cloud client, Supabase provider, redirect
  URLs) in [06-setup-guide.md](06-setup-guide.md#google-sign-in-optional). No new
  environment variable: the redirect is derived from `window.location.origin`.

### Fixed

- `/auth/callback` previously ignored provider errors and sent codeless requests
  to `/inbox`, where middleware bounced them to a blank `/login`. It now reports
  `access_denied` as a cancellation, other provider errors and failed code
  exchanges as retryable, and logs the provider's `error_description`.
- Login errors and notices are wrapped in an `aria-live="polite"` region and the
  error carries `role="alert"`, so screen readers announce failures.

### Verified

- `npm run build` and `tsc --noEmit` clean; `eslint` clean for `src/app/login`
  and `src/app/auth` (the pre-existing `settings/page.tsx` lint error is
  unchanged).
- Against a running dev server: `/auth/callback?error=access_denied` →
  `/login?error=oauth_denied`, `?error=server_error` → `oauth_failed`, missing
  or invalid `code` → `link_expired`; `/login?error=oauth_denied` renders the
  mapped message with `role="alert"`, and an unknown or injected `error` value
  renders no banner.
- **Not verified end to end:** the Google round trip itself. The Supabase
  project used for this check still answers
  `/auth/v1/authorize?provider=google` with
  `Unsupported provider: provider is not enabled`, so the dashboard
  configuration in the setup guide is still outstanding.

## 2026-07-23 — Platform admin: add/remove workspaces and users

### Added

- `POST /api/admin/orgs` — provision a workspace (name + plan).
- `DELETE /api/admin/orgs/[id]` — permanent workspace deletion, guarded by an
  exact-name confirmation. Tenant data cascades; members are detached
  (`profiles.org_id` → null).
- `POST /api/admin/users` — create an account (pre-confirmed) with optional
  workspace and role assignment.
- `DELETE /api/admin/users` — permanent account deletion, guarded by an
  exact-email confirmation. Refuses to delete the platform operator.
- **New workspace** / **New user** forms and per-row **Delete** controls with
  typed confirmations on the Organizations and Users screens.
- `profiles.email`: synced copy of `auth.users.email`
  (migration `20260723000003_profile_email.sql`), backfilled, maintained by the
  signup trigger and a new email-change trigger, and not client-writable.
- `src/lib/supabase/retry.ts` — `withAuthRetry()` for transient Supabase Auth
  admin failures.

### Fixed

- Member and user lists no longer call the Supabase Auth admin API per row. They
  read `profiles.email`, which removed intermittent blank ("—") emails, dropped
  N admin requests per page to zero, and stopped the operator row from rendering
  a delete control when a lookup failed. Also corrects the same latent defect on
  the workspace `/admin` page.
- Supabase Auth admin endpoints on this project intermittently fail with
  `unrecognized JWT kid <nil> for algorithm ES256`. Account create/delete now
  retry that specific fault and return `503` with a retry message instead of a
  misleading `400`/`404`. See [14-platform-admin.md](14-platform-admin.md).

### Verified

- 27 automated end-to-end checks passed against a running server as the operator:
  create/delete workspace, create/delete user with workspace+role assignment,
  confirmation-mismatch rejections, input validation, operator self-delete
  protection, and `403` for a tenant account on every platform endpoint with the
  real workspace left untouched.

## 2026-07-23 — Separate platform operator portal

### Added

- `/admin/login` — dedicated operator sign-in (Supabase password auth, no
  sign-up, no social auth), isolated from the tenant `/login`.
- `GET /api/admin/session` — server-side confirmation that the signed-in
  account is the operator.
- `/admin/access` — read-only operator identity and rotation instructions.
- Dedicated operator account with no workspace membership; `/admin` is not
  linked from any tenant UI.
- Middleware now refreshes sessions on `/platform/*`, redirects signed-out
  visitors to `/admin/login`, and keeps the operator out of the tenant app
  (`/inbox`, `/onboarding`, `/login` → `/admin`).
- Workspace **Admin** link now appears in the tenant sidebar for owners/admins.

### Changed

- Single operator model: `PLATFORM_SUPER_ADMIN_EMAIL` replaced the former
  `PLATFORM_ADMIN_EMAILS` allowlist, and the in-app add/remove-admins screen and
  `/api/admin/admins` route were removed.
- Platform pages moved into the `src/app/platform/(portal)/` route group (URLs
  unchanged) so the login page sits outside the authenticated shell.
- Platform UI rebuilt on the tenant design system, so both areas look identical.
- Auth policy tightened in `supabase/config.toml`: minimum password length 8 and
  `lower_upper_letters_digits` complexity.

### Verified

- Operator: portal pages render live cross-tenant data; plan/suspend writes
  confirmed in the database.
- Non-operator (throwaway account) and tenant account: portal pages redirect and
  platform APIs return `403`, with no tenant data modified.

## 2026-07-23 — Cross-tenant platform admin

### Added

- `/admin` operator area: Overview (platform-wide counts, plan mix,
  connected/suspended), Organizations (search + list), Organization detail
  (per-tenant metrics, members, plan/billing/suspend controls), Users.
- `PATCH /api/admin/orgs/[id]` — plan, billing status, suspension.
- `organizations.suspended` and `platform_admins` +`is_platform_admin()`
  (migration `20260723000002_platform_admin.sql`). `platform_admins` became
  unused when the single-operator model was adopted.
- Suspension enforcement in the shared webhook: inbound events for a suspended
  tenant are skipped entirely.
- New icons (`grid`, `building`, `shield`) in the shared icon set.

## 2026-07-23 — Security hardening

Fixes for the findings in the security audit of the same date.

### Fixed

- **Critical — tenant hijack via profile self-update.** Column privileges on
  `profiles` now limit client updates to `full_name`, so a user can no longer
  change their own `org_id` or `role` to join or take over another workspace
  (migration `20260723000001_security_hardening.sql`).
- **High — webhook signature bypass.** Verification fails closed when
  `WHATSAPP_APP_SECRET` is unset; local development can opt out explicitly with
  `ALLOW_UNSIGNED_WEBHOOKS=true`.
- **High — WhatsApp token exposure.** `select` on `organizations.wa_access_token`
  is revoked for `anon`/`authenticated`, and Settings no longer loads the token
  into the browser. Credentials are written through `/api/settings`, which
  requires the `owner`/`admin` role. The token is still plaintext at rest.
- **High — SSRF in URL ingestion.** `/api/kb/url` resolves the host and blocks
  private, loopback, link-local, and reserved addresses (including cloud
  metadata), re-validates every redirect hop, and caps the response at 5 MB.
- **Medium — org settings and plan self-service.** Client updates on
  `organizations` are limited to `name` and `ai_enabled`; plan/billing columns are
  server-only.
- **Medium — webhook reliability.** Deduplication is now atomic via the unique
  `wa_message_id` insert, and processing failures return `500` so Meta retries
  instead of silently dropping events.
- **Medium — no AI cost controls.** Added a per-tenant daily AI reply cap
  (`usage_daily` + `bump_ai_usage()` RPC, `AI_DAILY_REPLY_LIMIT`, default 500).
- **Low** — `messages/send` no longer returns raw provider error details to
  clients.

### Added

- `GET`/`POST /api/settings` — safe workspace settings read plus role-checked
  credential writes.

## 2026-07-23 — AI provider switched to GLM (Z.ai)

### Changed

- Migrated AI replies from Anthropic Claude to GLM (`glm-5.1`) served over Z.ai's OpenAI-compatible Chat Completions API in `src/lib/ai.ts`.
- Replaced the `ANTHROPIC_API_KEY` platform env var with `ZAI_API_KEY`; added optional `ZAI_BASE_URL` (default `https://api.z.ai/api/paas/v4/`) and `ZAI_MODEL` (default `glm-5.1`) overrides.
- Updated README and the setup, bot-logic, growth, and project-plan docs to reference GLM (Z.ai).

### Notes

- Historical entries below still reference Claude/Anthropic and describe behavior that was accurate when written.

## 2026-07-21 — Feature readiness audit and documentation correction

### Audited

- Reviewed all documented Phase 0–4 features against dashboard pages, route handlers, libraries, Supabase schema/migrations, and deployment files.
- `npm run build` passed on Next.js 16.2.10.
- `npm run lint` failed with seven React hook/ref errors in Analytics and Inbox.
- Confirmed that no automated test script or test files exist.
- Docker and live Supabase/Meta/Anthropic/Voyage behavior were not exercised.

### Release blockers recorded

- Auto-reply creation omits required tenant `org_id`.
- Profile/organization policies permit unsafe security-field and settings updates.
- Tenant WhatsApp tokens are plaintext and returned to the browser settings client.
- URL knowledge ingestion permits SSRF and unbounded response reads.
- Webhook errors are acknowledged with 200 and dedupe is not atomic.
- Broadcast fan-out is synchronous and non-idempotent.
- Analytics can undercount because Supabase caps results at 1,000 rows.
- Contact consent/opt-out controls, rate limits, quotas, and robust provider timeouts are missing.
- Supabase local config references missing `seed.sql`; migration/config paths were untracked during the audit.

### Documentation

- Added [13-feature-readiness-audit.md](13-feature-readiness-audit.md) as the canonical NO-GO report.
- Updated setup, architecture, database, API, bot, deployment, dashboard, growth, tenant, and RAG docs to reflect current behavior and limitations.
- Removed obsolete global tenant WhatsApp env instructions and stale “all phases complete” claims.

## 2026-07-15 — Knowledge Base, RAG, and Docker implementation

### Added

- Per-org `kb_documents` and `kb_chunks`, pgvector embedding, generated FTS, HNSW/GIN indexes, RLS, and `match_kb_chunks` RPC.
- Chunking, optional Voyage `voyage-3.5-lite` embeddings, vector retrieval, and FTS fallback in `src/lib/kb.ts`.
- RAG context wired into Claude replies.
- Authenticated PDF, URL, and pasted-text ingestion APIs.
- `/knowledge` management page.
- Standalone, non-root Docker image and Compose configuration.
- Auth callback fixes and real application metadata.

### Historical verification

- Build completed and protected KB endpoints returned unauthorized without a session.
- Current security/runtime readiness is governed by the 2026-07-21 audit.

## 2026-07-14 — Multi-tenant SaaS conversion

### Changed

- Added `organizations`, `profiles.org_id`, tenant IDs on all business data, tenant-scoped RLS, and workspace creation RPC.
- Shared webhook now routes by Meta Phone Number ID and sends with per-org credentials.
- WhatsApp Phone Number ID and access token moved from platform env into `/settings`.
- AI enabling became a per-workspace setting.
- Added `/onboarding`, `/settings`, and tenant resolution helpers.

### Deferred at the time

- Billing, team invitations, Meta Embedded Signup, role permissions, and encrypted token storage.

## 2026-07-14 — Phase 3 growth implementation

### Added

- Authenticated template broadcasts by opted-in audience/tag with aggregate history.
- Client-computed Analytics tiles and 14-day chart.
- Claude fallback from recent conversation history with `[HANDOFF]` support.

### Current caveats

- Broadcasts require a durable idempotent worker architecture.
- Analytics requires server-side aggregation.
- AI requires quotas, rate limits, spend controls, and live provider tests.

## 2026-07-14 — Phase 2 dashboard implementation

### Added

- Email/password sign-in/up, session middleware, dashboard guard, and sidebar.
- Realtime inbox, manual reply API, delivery states, and bot/human/closed controls.
- Auto-reply editor and searchable contacts with tags.

### Current caveats

- New-rule creation is broken because `org_id` is omitted.
- Inbox and Analytics fail current lint rules.
- Contact opt-in/opt-out management is absent.

## 2026-07-14 — Phase 0 and Phase 1 implementation

### Added

- Next.js/Supabase project foundation and environment template.
- Database schema, signup profile trigger, default keyword rules, and Realtime publication.
- Webhook verification/events, contact/conversation/message persistence, status updates, bot logic, Graph helpers, and manual send API.
- Initial status page and project documentation.

## Current backlog

### Release blockers

See [13-feature-readiness-audit.md](13-feature-readiness-audit.md#release-blockers).

### Explicitly deferred product scope

- Stripe billing and enforced plans.
- Team invitations and membership management.
- Owner/admin/agent permissions.
- Meta Embedded Signup.
- Encrypted/vault-backed WhatsApp credentials.
- CSV contact import.
- Durable jobs and scheduled broadcast execution.
- Automated test suite.
