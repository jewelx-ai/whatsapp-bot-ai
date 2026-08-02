# 13 — Feature Readiness Audit

**Audit date:** 2026-07-21  
**Scope:** Repository implementation, documented Phase 0–4 features, database schema and migrations, authentication and tenant boundaries, API routes, dashboard pages, AI/RAG integrations, and deployment configuration.

## Executive verdict

> **Superseded snapshot.** This is the audit as it stood on **2026-07-21** and is
> kept for history. Many findings below (tenant isolation, webhook signature
> bypass, SSRF, webhook replay, auto-reply `org_id`, failing lint) have since been
> fixed. For current state read [08-changelog.md](08-changelog.md) and the status
> banner in [README.md](README.md).

**Status at the time of this audit: NO-GO for production.**

Most advertised features have an implementation path and the optimized Next.js build succeeds. However, the current repository is not production-ready because one advertised CRUD operation is broken, lint fails, and there are release-blocking authorization, credential-handling, SSRF, webhook-reliability, broadcast-delivery, and data-accuracy issues.

This was a static/local audit. It did **not** send real WhatsApp messages or modify live Supabase, Meta, Anthropic, or Voyage data.

## Status of this audit's findings (updated 2026-07-23)

A security review and hardening pass on 2026-07-23 resolved several blockers
recorded below. Treat this document as the baseline and
[08-changelog.md](08-changelog.md) as the current state.

| Finding | Status |
|---|---|
| Profile self-update allows `org_id`/`role` change (tenant hijack) | **Fixed** — column privileges |
| Webhook accepts unsigned requests when app secret absent | **Fixed** — fails closed |
| WhatsApp token readable by browser clients | **Fixed** — column select revoked; write-only via `/api/settings` |
| SSRF in URL knowledge ingestion | **Fixed** — host/redirect validation, size cap |
| Webhook loses events / non-atomic dedupe | **Fixed** — atomic insert gate, `500` on failure |
| Org updates lack role checks; plan self-service | **Fixed** — column privileges + role-checked routes |
| No AI cost controls | **Partly fixed** — per-plan daily tenant caps; no per-minute limit or spend alerts |
| Roles defined but not enforced | **Partly fixed** — enforced for admin/settings, not for tenant data access |
| WhatsApp token plaintext at rest | **Fixed for new saves 2026-07-31** — legacy rows need re-saving |
| Broadcasts synchronous and non-idempotent | **Partly fixed 2026-07-31** — durable recipient rows and idempotency; no background worker |
| Analytics undercounts above 1,000 messages | **Fixed 2026-07-31** — aggregate RPC |
| New auto-reply omits `org_id` | **Fixed** — dashboard insert includes current org |
| `npm run lint` fails | **Fixed** |
| No automated test suite | **Open** — ad-hoc end-to-end scripts were used for verification |
| Live Meta / Docker validation | **Open** — webhook handshake and signed-payload flow exercised locally through a tunnel; a real phone round trip was not completed |

Verification on 2026-07-23 used temporary scripts against a running dev server and
the live Supabase project, cleaning up any records created. Confirmed: GLM replies;
webhook verify, signature, dedupe, and inbound pipeline; platform portal read and
write paths; and authorization for operator, non-operator, and tenant accounts.

## Validation performed

| Check | Result | Evidence / limitation |
|---|---|---|
| `npm run build` | **Pass** | Next.js 16.2.10 compiled TypeScript and generated all application routes. |
| `npm run lint` | **Fail** | 7 React hook/ref errors in `analytics/page.tsx` and `inbox/page.tsx`. |
| Automated tests | **Unavailable** | No test script or test files are present. |
| Next.js convention check | **Warning** | `src/middleware.ts` is deprecated by this Next.js version in favor of `proxy.ts`. |
| Docker image / Compose | **Not run** | Docker is not installed in the audit environment. |
| Supabase local reset | **Not run / config incomplete** | `supabase/config.toml` references missing `supabase/seed.sql`. |
| Git secret hygiene | **Pass for local env file** | `.env.local` is ignored by `.gitignore`; secret values were not read. |
| Git deployment state | **Warning** | `supabase/config.toml` and `supabase/migrations/` were untracked at audit time. |
| Live external integrations | **Not run** | Valid sandbox credentials and explicit approval are required. |

### Lint failures

- `src/app/(dashboard)/analytics/page.tsx:18` — ref accessed during render.
- `src/app/(dashboard)/inbox/page.tsx:14` — ref accessed during render.
- `src/app/(dashboard)/inbox/page.tsx:64` — ref-derived value used as an effect dependency.
- `src/app/(dashboard)/inbox/page.tsx:69` — ref mutation rejected by the React hooks immutability rule.
- ESLint reports seven errors in total because some ref violations are emitted more than once.

## Feature status matrix

Legend: **Implemented** means the code path exists and passed compilation; it does not imply live integration verification.

| Area | Status | Audit result |
|---|---|---|
| Home/setup-status page | Implemented | Environment-presence display compiles. It does not validate credentials or connectivity. |
| Email/password sign-in and sign-up | Implemented, live test required | Supabase calls and callback route exist; current Supabase email/session behavior was not exercised. |
| Auth callback | Implemented, live test required | PKCE code exchange and redirect paths exist. |
| Workspace onboarding | Implemented, live test required | `create_organization()` creates an org, promotes the caller, and seeds rules. Authorization hardening is still required. |
| Dashboard route guard | Implemented with warning | Server guard and session-refresh middleware exist; middleware convention is deprecated. |
| Multi-tenant schema | Partial / unsafe | Tenant columns and RLS exist, but profile updates can change security-sensitive fields. |
| Workspace settings | Partial / unsafe | Name, Phone Number ID, token, and AI toggle are editable. Credentials are neither validated nor safely isolated from browser users. |
| Webhook verification GET | Implemented, live test required | Verify-token comparison exists. |
| Webhook HMAC verification | Partial | Timing-safe verification exists, but verification silently disables itself if `WHATSAPP_APP_SECRET` is missing. |
| Tenant webhook routing | Implemented, live test required | Incoming events resolve the org by Meta Phone Number ID. |
| Incoming contact/conversation/message persistence | Partial | Main flow exists, but many database errors are ignored and acknowledgement behavior can lose events. |
| Message deduplication | Partial | Unique WhatsApp IDs and a pre-check exist; the check-then-insert sequence can race and duplicate replies. |
| Delivery/read status updates | Implemented, live test required | Status webhooks update outgoing messages by org and WhatsApp message ID. |
| Keyword matching | Implemented | Exact, contains, starts-with, first-match-wins, fallback, and `help` handoff paths exist. |
| Auto-reply rule editor | **Broken for create** | Editing/toggling/deleting existing rules is implemented, but new inserts omit required `org_id`. |
| Human handoff | Implemented, live test required | `open` suppresses bot replies; manual replies switch a conversation to `open`. |
| Inbox and Realtime | Partial | Queries/subscriptions/manual reply UI exist, but the page fails lint and has unhandled query/update failures. |
| Manual reply API | Mostly implemented | Authentication and conversation-org ownership checks are present. Post-send DB failures can still return an incomplete success. |
| Contacts and tags | Partial | List/search/tag changes exist. Dashboard consent toggle and STOP/START commands were added 2026-07-31; consent-evidence history is still absent. |
| Broadcasts | Partial / request-driven batches | Auth, tenant audience filtering, tags, templates, idempotency keys, durable recipient rows, and aggregate history exist. Processing still depends on dashboard requests, not a worker. |
| Analytics | Implemented | Tiles and 14-day chart use the `dashboard_analytics()` aggregate RPC added 2026-07-31. |
| GLM AI fallback | Implemented, live-tested 2026-07-23 | Recent history, prompt, fallback, and handoff token logic exist. No rate, quota, or spend controls exist. |
| KB pasted-text ingestion | Implemented, live test required | Auth, validation, chunking, persistence, and optional embeddings exist. |
| KB PDF ingestion | Implemented, live test required | Auth, 20 MB cap, extraction, chunking, and persistence exist. |
| KB URL ingestion | **Blocked by security issue** | Page extraction works in code, but arbitrary server-side URL fetching permits SSRF. |
| RAG retrieval | Implemented, live test required | Voyage/pgvector and full-text fallback paths exist; relevance and model behavior require representative tests. |
| Knowledge document deletion | Implemented, live test required | RLS-scoped client deletion and chunk cascade are defined. |
| Docker deployment | Configuration present, unverified | Standalone/non-root image files exist. Build and runtime were not exercised. |

## Release blockers

### 1. Auto-reply creation omits the tenant ID

**Severity:** High functional defect  
**Files:** `src/app/(dashboard)/auto-replies/page.tsx`, `supabase/schema.sql`

The create payload contains only keyword, match type, and response. `auto_replies.org_id` is `NOT NULL`, and RLS requires it to equal `current_org_id()`. New-rule creation therefore fails; only rules seeded by onboarding or inserted with an explicit tenant ID exist.

**Required fix:** Resolve the current org in a trusted path and include `org_id`, or expose a tenant-scoped RPC/server endpoint that derives the org from the authenticated user.

### 2. Profile and organization authorization is too broad

**Severity:** Critical authorization issue  
**File:** `supabase/schema.sql` and CLI migration, policies around lines 162–170

The self-profile update policy checks only `auth.uid() = id`. It does not prevent changes to `org_id` or `role`. A user who knows another org UUID could reassign their profile; a user can also self-promote. Organization update access is granted to every member without owner/admin checks.

**Required fix:** Prevent direct client updates of `profiles.org_id` and `profiles.role`; use controlled SECURITY DEFINER functions with explicit authorization. Add owner/admin checks for organization settings and security-sensitive operations.

### 3. WhatsApp access tokens are plaintext and browser-visible

**Severity:** Critical secret-handling issue  
**Files:** `supabase/schema.sql`, `src/app/(dashboard)/settings/page.tsx`

`wa_access_token` is stored as plaintext and the settings page selects the complete organization row, then loads the token into client state. Any member with organization read access can retrieve it.

**Required fix:** Store credentials in a server-side secret store or encrypted form, never return the existing token to the browser, accept token replacement through a protected server endpoint, and restrict it to authorized roles.

### 4. Knowledge URL ingestion permits SSRF

**Severity:** Critical security issue  
**File:** `src/app/api/kb/url/route.ts`

The endpoint fetches any user-provided HTTP(S) URL, follows redirects, and reads the complete response. It does not block loopback, link-local, private, metadata, or internal addresses and does not enforce a response-size limit.

**Required fix:** Resolve and validate every redirect hop, reject non-public IP ranges and unsupported ports/schemes, cap bytes and content type, and preferably move fetching to an isolated worker with egress policy.

### 5. Webhook acknowledgement can permanently lose events

**Severity:** High reliability issue  
**File:** `src/app/api/webhook/route.ts`

Processing exceptions are logged but the route still returns `200`. Meta then treats the event as delivered and will not retry, even when persistence or sending failed. Several database writes also ignore returned errors. The dedupe pre-check is not atomic, so concurrent duplicate deliveries can both send replies even though only one message row is accepted.

**Required fix:** Persist an idempotent inbox/event record atomically before acknowledging; move processing to a durable worker; return a retryable non-2xx response until durable acceptance; make reply dispatch idempotent.

### 6. Broadcast delivery needs a background worker

**Severity:** High reliability/scalability issue  
**File:** `src/app/api/broadcasts/route.ts`

**Partly fixed 2026-07-31.** Campaign creation now stores `broadcasts` plus
`broadcast_recipients`, uses a per-org idempotency key, claims recipient rows
before sending, and updates aggregate progress from recipient state. Overlapping
dashboard requests should not double-send queued recipients.

**Required fix:** Move bounded processing to an independent worker, add
stale-processing recovery, retry transient failures, cancellation, and scheduled
execution.

### 7. Analytics silently undercounts

**Severity:** Medium correctness issue  
**Files:** `src/app/(dashboard)/analytics/page.tsx`, `supabase/config.toml`

**Fixed 2026-07-31.** The page now calls `GET /api/analytics`, which resolves the
tenant server-side and reads counts from `dashboard_analytics()` instead of
downloading raw message rows.

**Remaining work:** broader reporting windows, export, and cohort analytics are
not built.

### 8. Contact consent management is incomplete

**Severity:** High compliance/product gap  
**Files:** `supabase/schema.sql`, contacts page, broadcast API

New contacts default to `opted_in = true`, and broadcasts filter on that field.
The dashboard now provides an opt-in/opt-out control, and exact inbound
STOP/START-style commands update `opted_in` and send a confirmation. Consent
evidence, source, timestamp, and policy copy are still not tracked separately.

**Required fix:** Define the formal consent policy, capture consent evidence, and
prevent campaigns to contacts without valid consent history.

### 9. Error handling, timeouts, and abuse controls are incomplete

**Severity:** High operational issue

- Several Supabase inserts/updates ignore errors.
- Graph API fetches have no explicit timeout.
- Authenticated ingestion, AI, and broadcast endpoints have plan quotas, but no
  per-minute rate limits or spend alerts.
- AI/Voyage usage is charged to platform credentials and can be abused.

**Required fix:** Check every critical write, add bounded timeouts/retries, enforce quotas and request limits, and add structured monitoring/alerting.

### 10. Database/deployment workflow is incomplete

**Severity:** Medium deployment issue

- `supabase/config.toml` enables `./seed.sql`, but that file is absent.
- Only one CLI migration is present; the repository also maintains manual `schema.sql` and a standalone KB migration, creating multiple schema sources.
- Supabase config/migrations were untracked during the audit.
- Docker Compose uses `${NEXT_PUBLIC_*}` build arguments. Compose `env_file` supplies container runtime variables, not interpolation values for build arguments; use `docker compose --env-file .env.local ...` or export them before building.

**Required fix:** Choose migrations as the canonical schema source, remove or add the seed reference, track the deployment files, and validate a fresh reset/deploy in CI.

## Controls implemented correctly

These controls are present, although live behavior still needs testing:

- Service-role Supabase client remains in server modules.
- Manual message sending resolves the authenticated user's org and checks conversation ownership.
- KB and broadcast route handlers require a valid user session.
- Tenant data tables carry `org_id` and have RLS policies.
- Incoming events route by each organization's WhatsApp Phone Number ID.
- HMAC comparison is timing-safe when the Meta app secret is configured.
- WhatsApp message IDs are unique in the database.
- Zod validates manual-send, broadcast, URL, and text-ingestion payloads.
- PDF uploads have a 20 MB application limit.
- AI errors fall back to a static reply instead of crashing bot logic.
- `.env.local` is ignored by Git.

## Explicitly deferred / not built

- Stripe checkout and billing webhooks.
- Team invitations and membership management.
- Role-based owner/admin/agent permissions.
- Meta Embedded Signup.
- Secret-vault integration or encryption key rotation tooling for WhatsApp tokens.
- CSV contact import.
- Durable background jobs and scheduled broadcast execution.
- Automated unit, integration, security, and end-to-end tests.

## Required live test matrix

Use dedicated sandbox organizations, test phone numbers, non-production API keys, and disposable data.

### Supabase/Auth

- Sign up with email confirmation both enabled and disabled.
- Exchange callback code, persist session, sign out, and verify protected redirects.
- Create exactly one workspace and confirm seeded auto-replies.
- Attempt cross-tenant reads/writes and security-field profile updates.
- Verify Realtime INSERT/UPDATE delivery for messages and conversations.

### Meta WhatsApp

- Webhook GET with correct and incorrect verify tokens.
- POST with valid, invalid, absent, and malformed signatures.
- Text, interactive, unsupported media, status, duplicate, concurrent duplicate, and unknown-phone events.
- Keyword, fallback, help handoff, bot/human/closed transitions, manual reply, delivery/read/failed statuses.
- Expired token, invalid Phone Number ID, Graph timeout, rate limit, and 24-hour-window failures.

### Broadcasts and consent

- Empty audience, tag audience, all audience, opted-out contacts, invalid/unapproved template, partial failure, timeout, and retry/idempotency behavior.

### AI and RAG

- AI disabled/enabled, missing key, refusal, timeout, malformed/empty response, handoff, and spend-limit behavior.
- PDF/text/URL ingestion success and failure, large files, scanned/no-text PDFs, duplicate documents, delete cascade, FTS-only mode, vector mode, and irrelevant-query behavior.
- SSRF probes for loopback, private ranges, IPv6, DNS rebinding, redirects, and cloud metadata addresses after remediation.

### Deployment

- Fresh Supabase migration/reset from an empty project.
- Production build, lint, and automated tests in CI.
- Docker build/run as non-root with build-time public variables and runtime secrets.
- Vercel/serverless timeout behavior and webhook retry recovery.

## Production exit criteria

Production approval requires all of the following:

1. All critical/high blockers above are fixed or explicitly risk-accepted by the owner.
2. `npm run lint` and `npm run build` pass without application warnings that affect supported conventions.
3. A repeatable test suite covers tenant isolation, webhook idempotency, bot decisions, send APIs, broadcasts, and KB ingestion.
4. Fresh database deployment succeeds from tracked migrations.
5. Sandbox end-to-end tests pass for Supabase, Meta, Z.ai, and optional Voyage integration.
6. Secrets, consent, rate limits, quotas, retries, monitoring, and incident procedures are production-ready.
7. This audit is repeated and the verdict is updated to GO.
