# Supabase Production Setup

Actual architecture, verified directly against `supabase/migrations/`, `src/`,
and `supabase/config.toml` — not assumed. This is the source-of-truth
inspection for provisioning the production Supabase project; see
[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) for the broader app
readiness picture.

## Capabilities actually used

| Capability | Used? | Evidence |
|---|---|---|
| PostgreSQL | Yes | All tenant/app data — see schema below |
| Supabase Auth | Yes | Email/password + Google OAuth, `@supabase/ssr` cookie sessions |
| Row Level Security | Yes | Enabled on every tenant-owned table, policies scoped by `org_id` |
| RPC / Postgres functions | Yes | `create_organization`, `dashboard_analytics`, `match_kb_chunks`, `bump_ai_usage` — all called via `.rpc(...)` in `src/` |
| Storage (buckets) | **No** | `grep -rn "\.storage\." src/` — zero matches. PDF/DOCX uploads are parsed in-memory (`unpdf`/`mammoth`) and only extracted text is persisted to `kb_chunks`; the original file is never stored |
| Realtime | Yes | One channel, `src/app/(dashboard)/inbox/page.tsx:51` — `postgres_changes` on `conversations` (all events) and `messages` (`INSERT`), backed by `alter publication supabase_realtime add table messages/conversations` in the init migration |
| Edge Functions | **No** | No `supabase/functions/` directory exists |
| Database triggers | Yes | `on_auth_user_created` (profile provisioning), `on_auth_user_email_updated` (email sync) — both on `auth.users` |
| pg_cron / DB-level cron | **No** | `grep -rn "pg_cron\|cron\." supabase/` — zero matches. Scheduling (broadcast worker) happens outside Postgres — Vercel Cron or the host systemd timer added in this deployment workstream |
| Extensions | `vector` only | `create extension if not exists vector;` — pgvector, for KB embeddings |

## Legacy files — do not apply to a fresh project

`supabase/schema.sql` and `supabase/migration-003-knowledge-base.sql` are
**historical references only**, explicitly superseded by the migration
chain:
- `schema.sql` is a point-in-time dump of what the init migration already
  contains (confirmed near-identical to `20260715000001_init_full_schema.sql`).
- `migration-003-knowledge-base.sql` was for existing projects that had
  `schema.sql` applied *without* the KB section; the init migration now
  includes that section directly (comment: "included for fresh installs").

**For a new production project, apply only the ordered chain in
`supabase/migrations/*.sql` via `supabase db push`.** Do not run `schema.sql`
or the standalone KB migration — doing so on a fresh project would either be
redundant or conflict with the init migration.

## Migration inventory (applied in filename/timestamp order)

| # | File | Purpose | Tables created/changed | Indexes | RLS / policies | Functions/RPCs | Triggers |
|---|---|---|---|---|---|---|---|
| 1 | `20260715000001_init_full_schema.sql` | Base multi-tenant schema | Creates `organizations`, `profiles`, `contacts`, `conversations`, `messages`, `auto_replies`, `broadcasts`, `kb_documents`, `kb_chunks` | 8 tenant-scoped btree indexes + GIN (`kb_chunks.fts`) + HNSW (`kb_chunks.embedding`, cosine) | RLS enabled on all 9 tables; one `org_id = current_org_id()` policy per table (contacts/conversations/messages/auto_replies/broadcasts/kb_documents/kb_chunks: `for all`; organizations: select+update; profiles: read own-or-same-org, update own only) | `current_org_id()` (SECURITY DEFINER helper), `create_organization(org_name)` (onboarding — creates org, sets caller as owner, seeds 4 default auto-replies), `handle_new_user()`, `match_kb_chunks(org_id, embedding, count)` | `on_auth_user_created` on `auth.users` → `handle_new_user()` |
| 2 | `20260723000001_security_hardening.sql` | Close 3 audit findings (C1/H2+M1/M3) | Adds `usage_daily` table | none new | Column-level: revokes broad `UPDATE` on `profiles`/`organizations`, grants only `full_name` / `name`+`ai_enabled` respectively; revokes client `SELECT` on `organizations.wa_access_token`; RLS enabled + select policy on `usage_daily` | `bump_ai_usage(org_id, daily_limit)` (SECURITY DEFINER, `service_role`-only execute) | none |
| 3 | `20260723000002_platform_admin.sql` | Cross-tenant operator support | Creates `platform_admins`; adds `organizations.suspended` | none new | RLS enabled on `platform_admins` with **no policies** (service-role only, by design) | `is_platform_admin(user_id)` (unused by current app code — app checks via `PLATFORM_SUPER_ADMIN_EMAIL` env instead, see Platform Admin Model below) | none |
| 4 | `20260723000003_profile_email.sql` | Denormalize email onto `profiles` (avoids flaky GoTrue admin API calls) | Adds `profiles.email`, backfills from `auth.users` | none new | `REVOKE UPDATE (email)` from anon/authenticated | Redefines `handle_new_user()` to populate email | Redefines `on_auth_user_created`; adds `on_auth_user_email_updated` → `sync_profile_email()` |
| 5 | `20260725000001_kb_docx_source.sql` | Allow `.docx` in KB | Alters `kb_documents.source_type` check constraint (`pdf,url,text` → `pdf,docx,url,text`) | none | none | none | none |
| 6 | `20260725000002_oauth_profile_names.sql` | Fix blank names for OAuth signups | none (function only) | none | none | Redefines `handle_new_user()` to fall back through `full_name`/`name`/`given_name`+`family_name`/email-local-part; backfills existing blank names | Re-creates `on_auth_user_created` |
| 7 | `20260731000001_dashboard_analytics.sql` | Server-side analytics aggregate (avoids client-side row-limit undercounting) | none | none | none | `dashboard_analytics(org_id, days)` (SECURITY DEFINER, `service_role`-only) | none |
| 8 | `20260731000002_durable_broadcasts.sql` | Durable, idempotent, resumable broadcast campaigns | Extends `broadcasts` (language_code, status, idempotency_key, audience_size, processed_count, completed_at); creates `broadcast_recipients` | unique `(org_id, idempotency_key)` partial index; `(broadcast_id, status, created_at)`; `(org_id, created_at desc)` | RLS enabled + `org_id = current_org_id()` policy on `broadcast_recipients` | none | none |
| 9 | `20260731000003_dashboard_analytics_signature_fix.sql` | PostgREST named-arg lookup compatibility | none | none | none | Re-adds canonical `dashboard_analytics(org_id, days)`; adds reversed-arg overload `dashboard_analytics(days, org_id)` wrapping the canonical one | none |
| 10 | `20260731000004_reload_postgrest_schema.sql` | Force PostgREST schema cache reload after RPC signature changes | none | none | none | none | none |
| 11 | `20260731000005_one_active_conversation_per_contact.sql` | Data-quality fix + constraint | Closes older duplicate open conversations per `(org_id, contact_id)`, then adds enforcing index | partial unique index `(org_id, contact_id) where status <> 'closed'` | none | none | none |

**Completeness for a fresh project**: Yes — this chain alone creates every table, index, function, trigger, and policy the application code references. No manual SQL outside the migration chain is required.

## Final table inventory (state after all 11 migrations)

| Table | RLS | org_id? | Policies |
|---|---|---|---|
| `organizations` | ✓ | (is the tenant) | select+update, scoped to caller's own org; `wa_access_token` not client-selectable (column revoke); client `UPDATE` limited to `name`, `ai_enabled` columns |
| `profiles` | ✓ | ✓ (nullable until onboarded) | select: own row or same org; `UPDATE` limited to `full_name` column only (not `org_id`/`role`/`email`) |
| `contacts` | ✓ | ✓ | `for all`, scoped to caller's org |
| `conversations` | ✓ | ✓ | `for all`, scoped to caller's org |
| `messages` | ✓ | ✓ | `for all`, scoped to caller's org |
| `auto_replies` | ✓ | ✓ | `for all`, scoped to caller's org |
| `broadcasts` | ✓ | ✓ | `for all`, scoped to caller's org |
| `broadcast_recipients` | ✓ | ✓ | `for all`, scoped to caller's org |
| `kb_documents` | ✓ | ✓ | `for all`, scoped to caller's org |
| `kb_chunks` | ✓ | ✓ | `for all`, scoped to caller's org |
| `usage_daily` | ✓ | ✓ | select-only, scoped to caller's org (writes are `service_role`-only via `bump_ai_usage`) |
| `platform_admins` | ✓ | n/a | **no policies at all** — inaccessible to anon/authenticated, service-role only |

Every customer-owned table has `org_id`, RLS enabled, and a policy that scopes access through `current_org_id()` (a `SECURITY DEFINER` function reading the caller's own `profiles.org_id`, avoiding self-referential RLS recursion on `profiles`). See [PHASE 3 findings](#multi-tenant-isolation) below for the explicit cross-tenant analysis.

## Multi-tenant isolation

`current_org_id()` (`20260715000001`, lines 101-103) is the single choke point every tenant-data policy uses: `select org_id from profiles where id = auth.uid()`. Since a `profiles` row has exactly one `org_id`, and every tenant-data policy requires `org_id = current_org_id()`, **Customer A's session can only ever match rows carrying Customer A's org_id** — this is enforced at the database layer via Postgres RLS, not application logic, so it applies uniformly across every REST/RPC call regardless of what the client sends.

Explicit checks:
- **Read**: every tenant table's policy has a `using (org_id = current_org_id())` clause → Customer A's `SELECT` on Customer B's rows returns zero rows (RLS silently filters, does not error).
- **Write (INSERT/UPDATE)**: every `for all` policy has a matching `with check (org_id = current_org_id())` → an INSERT/UPDATE attempting to set `org_id` to another tenant's id is rejected by Postgres, not just hidden. **A client cannot bypass this by sending a different `organization_id` in the request body** — RLS re-evaluates the check against the *actual* row's `org_id` server-side, using the authenticated session's own `current_org_id()`, not any client-supplied value.
- **Delete**: covered by the same `for all` policies (contacts/conversations/messages/auto_replies/broadcasts/broadcast_recipients/kb_documents/kb_chunks all use `for all`, which includes DELETE).
- **WhatsApp credentials**: `organizations.wa_access_token` has `SELECT` revoked entirely from `anon`/`authenticated` (`20260723000001`, line 24) — no RLS policy can leak it because PostgREST/Supabase enforces column-level grants before RLS is even evaluated. Only `supabaseAdmin()` (service-role, server-only, `src/lib/supabase/admin.ts`) can read it, and only after `decryptWaToken()` (`src/lib/secrets.ts`) using `WHATSAPP_TOKEN_ENCRYPTION_KEY`.
- **Conversations/KB/broadcasts**: same `org_id = current_org_id()` pattern as contacts — no separate analysis needed, identical mechanism.

This has not yet been tested against a *live* Supabase project (no project exists yet — see Phase 7 blocker below); the analysis above is a direct read of the enforced SQL, not a live pentest. Phase 21 of the requested workstream (live security tests: anonymous access, cross-org access attempts) requires a running project and is deferred until one exists.

## Authentication

- **Method**: Supabase Auth, email/password + Google OAuth (`src/app/login/login-form.tsx`), cookie-session via `@supabase/ssr` (`src/lib/supabase/server.ts`, `src/proxy.ts`).
- **Signup**: `supabase.auth.signUp()` with `full_name` metadata (`login-form.tsx`); `handle_new_user()` trigger auto-creates a `profiles` row (no `org_id` yet).
- **Email confirmation**: currently `enable_confirmations = false` in `supabase/config.toml` (local/dev default) — config.toml's own comment flags this as something to turn on for production once SMTP is configured, not yet done.
- **Password reset**: `resetPasswordForEmail(email, { redirectTo: origin + "/reset-password" })`.
- **OAuth (Google)**: `signInWithOAuth({ provider: "google", redirectTo: origin + "/auth/callback?next=/inbox" })`.
- **Callback handling**: `src/app/auth/callback/route.ts` — handles both `?code=` (email confirm, magic link, OAuth) via `exchangeCodeForSession`, and OAuth provider errors (`?error=access_denied` etc.) with fixed, non-reflected error copy back on `/login`.
- **Onboarding**: self-serve — any authenticated user with no `org_id` can call the `create_organization` RPC directly from `/onboarding` (`src/app/onboarding/page.tsx:18`). No invitation flow exists; the platform operator provisions additional users directly via `/api/admin/users` (see Platform Admin Model).
- **Logout**: standard `supabase.auth.signOut()` (not separately inspected here — no non-obvious behavior).

### Required production Auth configuration

| Setting | Required value | Why |
|---|---|---|
| Site URL | `https://bot.jewelxtech.com` | Base URL Supabase uses for email links; confirmed against every redirect in code, all of which are relative to `window.location.origin` / `req.nextUrl.origin` (the production app URL) |
| Redirect URLs (allow-list) | `https://bot.jewelxtech.com/auth/callback`<br>`https://bot.jewelxtech.com/reset-password` | Exact URLs actually used in code (`login-form.tsx`, `auth/callback/route.ts`) — no wildcard needed, both call sites use fixed relative paths |
| Google OAuth redirect (in Google Cloud Console, not Supabase) | `https://<project-ref>.supabase.co/auth/v1/callback` | Standard Supabase-managed OAuth callback (config.toml: "Leave blank to use Supabase's own callback") |
| `enable_confirmations` | Recommend `true` for production, **after** SMTP is configured | config.toml's own comment: "SECURITY: recommended ON in production to stop unverified/spam signups... otherwise new users cannot receive the confirmation email" — flipping it on without SMTP configured first would lock out all new signups |
| `minimum_password_length` / `password_requirements` | Keep existing (`8`, `lower_upper_letters_digits`) | Already reasonable; no code depends on a different policy |

## Platform admin model

Actual implementation (not the diagram's exact shape — see gaps below):

```
Supabase auth.users
   |
   +-- profiles.org_id = NULL, or org_id set with role owner/admin/agent
   |
   +-- whichever authenticated user's email matches PLATFORM_SUPER_ADMIN_EMAIL
       is treated as the platform super admin (src/lib/platform.ts:20,
       src/proxy.ts:63) — NOT a separate table-backed role
```

| Layer | Supported? | Evidence |
|---|---|---|
| JewelX Platform Super Admin | Yes, but single-account only | `isSuperAdminEmail()` compares the signed-in user's email to one env var — there is no `platform_admins`-table-driven multi-admin support in the app code, even though the `platform_admins` table exists (added in `20260723000002`) and has a helper function `is_platform_admin()`. **Gap**: the table/function are unused by current app code — only the env-var check is live. |
| Customer Organization Admin | Yes | `profiles.role` = `owner` or `admin` within an org; gates WhatsApp credential writes (`src/app/api/settings/route.ts:98-100`, confirmed by direct read) |
| Customer Organization Users | Yes | `profiles.role` = `agent` — full dashboard access except credential writes |

**Gaps** (documented, not fixed — matches README's "Explicitly not built" list):
- No self-serve team invitations — the operator provisions every user via `/api/admin/users`, not org owners inviting teammates.
- No role enforcement beyond the WhatsApp-credential gate — `owner`/`admin`/`agent` are otherwise functionally equivalent inside a workspace (confirmed by README: "roles gate credential writes only").
- The `platform_admins` table + `is_platform_admin()` RPC exist in the schema but are dead code relative to the actual `PLATFORM_SUPER_ADMIN_EMAIL` env-var check — worth noting if multi-operator support is ever needed, but not something this setup workstream should change (task instruction: don't redesign unless something is clearly broken; this isn't broken, just single-admin-only, which matches the "single super-admin operator" design documented in README/`docs/14-platform-admin.md`).

## Storage

Not used — no buckets to create. Confirmed by direct grep (`\.storage\.` — zero matches in `src/`). Do not create Storage buckets for this project.

## Realtime

Required publication membership (already declared by the migration chain, applied automatically when migrations run — no separate manual step): `messages` (INSERT events) and `conversations` (all events), both added to `supabase_realtime` in `20260715000001_init_full_schema.sql` lines 184-185. No additional configuration needed beyond applying the migrations.

## Setup checklist (to run once a project exists)

1. `supabase link --project-ref <ref>`
2. `supabase db push` (applies the 11-migration chain above, in order)
3. Verify via `supabase db push --dry-run` first if uncertain about remote state
4. Configure Auth Site URL + Redirect URLs (table above) — CLI-pushable via `supabase config push` reading `supabase/config.toml`, or manually in the Dashboard
5. Obtain `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API (see [Key type note](#key-type-note) below)
6. Write those three values to `/opt/whatsapp-bot/.env.local` on the production server (never committed)

### Key type note

Supabase has begun rolling out newer `publishable`/`secret` API key types alongside the legacy `anon`/`service_role` JWT keys. **The application code (`src/lib/supabase/{admin,client,server}.ts`, `src/proxy.ts`) calls `createClient`/`createBrowserClient`/`createServerClient` with the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` env var names and expects the legacy JWT-based key format.** Use the **legacy `anon` and `service_role` keys** from the project's API settings, not the newer `publishable`/`secret` keys, unless the application code is separately updated to support them — this setup workstream does not change application code, per instructions.
