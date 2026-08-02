# 03 — Database (Supabase/Postgres)

> **Update (2026-07-23):** The release-blocking profile authorization issue is
> fixed, and the schema gained `organizations.suspended`, `profiles.email`, and
> `usage_daily`. See [08-changelog.md](08-changelog.md) and
> [13-feature-readiness-audit.md](13-feature-readiness-audit.md).

## Schema sources

- [`supabase/migrations/`](../supabase/migrations) — canonical schema source for fresh setup and upgrades.
- [`supabase/migrations/20260715000001_init_full_schema.sql`](../supabase/migrations/20260715000001_init_full_schema.sql) — current CLI migration.
- [`supabase/migrations/20260723000001_security_hardening.sql`](../supabase/migrations/20260723000001_security_hardening.sql) — column privileges, `usage_daily`, `bump_ai_usage()`.
- [`supabase/migrations/20260723000002_platform_admin.sql`](../supabase/migrations/20260723000002_platform_admin.sql) — `organizations.suspended`, `platform_admins` (now unused).
- [`supabase/migrations/20260723000003_profile_email.sql`](../supabase/migrations/20260723000003_profile_email.sql) — `profiles.email` plus signup/email-change triggers.
- [`supabase/migrations/20260731000001_dashboard_analytics.sql`](../supabase/migrations/20260731000001_dashboard_analytics.sql) — `dashboard_analytics()` tenant aggregate RPC.
- [`supabase/migrations/20260731000002_durable_broadcasts.sql`](../supabase/migrations/20260731000002_durable_broadcasts.sql) — broadcast status/idempotency and per-recipient rows.
- [`supabase/migrations/20260731000003_dashboard_analytics_signature_fix.sql`](../supabase/migrations/20260731000003_dashboard_analytics_signature_fix.sql) — recreates analytics RPC and adds a `dashboard_analytics(p_days, p_org_id)` compatibility wrapper for Supabase schema-cache lookups.
- [`supabase/migrations/20260731000004_reload_postgrest_schema.sql`](../supabase/migrations/20260731000004_reload_postgrest_schema.sql) — notifies PostgREST to reload the schema cache after RPC changes.
- [`supabase/migration-003-knowledge-base.sql`](../supabase/migration-003-knowledge-base.sql) — legacy upgrade for databases that already had schema v2.

Apply the migration chain locally with `supabase db reset`, or to a linked hosted
project with `supabase db push`. `supabase/schema.sql` is retained only as a
historical reference and must not be used for fresh production setup.

Production uses the tracked migration chain as the single schema source.

## Tenant tables

### `organizations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Tenant ID |
| `name` | text | Workspace name |
| `wa_phone_number_id` | text unique, nullable | Routes Meta events to the tenant |
| `wa_access_token` | text, nullable | Versioned encrypted token for new saves; legacy plaintext rows remain readable until re-saved |
| `ai_enabled` | boolean | Per-workspace GLM toggle |
| `plan` | text | `free`, `starter`, or `pro`; enforced in app code |
| `plan_status` | text | `active`, `past_due`, or `canceled`; manual operator state, no billing automation |
| `suspended` | boolean | Default false. Set by the platform operator; the webhook skips all inbound processing for a suspended tenant |
| `created_at` | timestamptz | Automatic |

Client privileges are restricted: `select` on `wa_access_token` is revoked for
`anon`/`authenticated`, and client `update` is limited to `name` and
`ai_enabled`. WhatsApp credentials are written by `/api/settings` (service role,
owner/admin check), which encrypts access tokens with
`WHATSAPP_TOKEN_ENCRYPTION_KEY`; plan, billing status, and suspension by the
platform API.

### `profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK/FK → `auth.users` | One profile per auth user |
| `org_id` | uuid FK → organizations, nullable | Workspace membership |
| `full_name` | text | Signup metadata |
| `email` | text | Synced copy of `auth.users.email`; not client-writable |
| `role` | text | `owner`, `admin`, or `agent`; changed only by the operator, gates credential writes |
| `created_at` | timestamptz | Automatic |

`handle_new_user()` creates a profile after signup (including `email`).
`sync_profile_email()` keeps `email` current when the account email changes.
`create_organization(org_name)` creates a workspace, sets the caller to owner, and inserts default rules.

**Why `email` is duplicated here:** emails live in `auth.users`, so member lists
previously called the Supabase Auth admin API per row. Those admin endpoints
fail intermittently on this project (see
[14-platform-admin.md](14-platform-admin.md)), which blanked emails in the UI.
Reading the synced column is reliable and needs no admin request.

**Authorization issue — fixed 2026-07-23.** The self-update policy still matches
only on `auth.uid() = id`, but column privileges now limit client updates to
`full_name`, so `org_id` and `role` can no longer be changed from the browser.
Membership and role changes go through the operator-only service-role route
`/api/admin/users`.

## Tenant data tables

Every table below carries a required `org_id` FK to `organizations`.

### `contacts`

| Column | Notes |
|---|---|
| `id`, `org_id` | Tenant-scoped identity |
| `wa_phone` | Unique with `org_id` |
| `name` | WhatsApp profile name |
| `tags` | Audience segmentation |
| `opted_in` | Defaults true; dashboard toggle and inbound STOP/START commands update it |
| `last_seen_at`, `created_at` | Activity timestamps |

### `conversations`

| Column | Notes |
|---|---|
| `id`, `org_id`, `contact_id` | Tenant/contact relationship |
| `status` | `bot`, `open`, or `closed` |
| `assigned_to` | Nullable agent UUID; assignment UI is not implemented |
| `last_message_at`, `created_at` | Sorting/activity timestamps |

`bot` enables automation, `open` means human-owned, and a new inbound message after `closed` starts another conversation.

### `messages`

| Column | Notes |
|---|---|
| `id`, `org_id`, `conversation_id` | Tenant/thread identity |
| `direction` | `in` or `out` |
| `type`, `body`, `media_url` | Content metadata; non-text inbound content is currently a placeholder |
| `wa_message_id` | Globally unique Meta ID for dedupe/status updates |
| `status` | `received`, `sent`, `delivered`, `read`, `failed`, etc. |
| `created_at` | Message timestamp |

### `auto_replies`

| Column | Notes |
|---|---|
| `id`, `org_id` | Tenant-scoped rule |
| `trigger_keyword` | Case-insensitive keyword |
| `match_type` | `exact`, `contains`, or `starts_with` |
| `response_text` | Outbound text |
| `active`, `created_at` | State/timestamp |

The dashboard create operation includes the current `org_id`; onboarding seeds
are also valid because the RPC supplies it.

### `broadcasts`

| Column | Notes |
|---|---|
| `id`, `org_id` | Tenant campaign |
| `template_name`, `language_code`, `audience_tag` | Meta template, language, and optional segment |
| `status` | `queued`, `processing`, `completed`, `partial_failed`, or `failed` |
| `idempotency_key` | Optional client key; unique per org when present |
| `audience_size`, `processed_count` | Campaign progress |
| `scheduled_at` | Schema field only; scheduling is not implemented |
| `sent_count`, `failed_count` | Aggregate durable-send results |
| `completed_at`, `created_at` | Timestamps |

### `broadcast_recipients`

Durable per-contact delivery rows for each broadcast.

| Column | Notes |
|---|---|
| `id`, `org_id`, `broadcast_id`, `contact_id` | Tenant/campaign/contact identity |
| `wa_phone` | Snapshot of the recipient phone at enqueue time |
| `status` | `queued`, `processing`, `sent`, or `failed` |
| `attempts` | Incremented when a row is claimed for sending |
| `wa_message_id` | Meta message ID when accepted |
| `error_kind`, `error_reason` | Classified Graph failure details |
| `sent_at`, `updated_at`, `created_at` | Delivery timestamps |

## Platform and usage tables

### `usage_daily`

Per-tenant daily counters used to cap AI spend.

| Column | Notes |
|---|---|
| `org_id`, `day` | Composite PK; `day` is UTC |
| `ai_replies` | Incremented per AI reply attempt |

`bump_ai_usage(p_org_id, p_daily_limit)` atomically increments today's counter
and returns whether the tenant is still within the limit. `generateAIReply()`
calls it before contacting the model and falls back to the static reply when the
cap is reached. Execute is granted to `service_role` only.

### `platform_admins`

Created for a multi-operator model that was replaced by the single
`PLATFORM_SUPER_ADMIN_EMAIL` operator, so this table and
`is_platform_admin(uuid)` are **currently unused**. RLS is enabled with no
policies, so no browser client can read or write them. Safe to drop.

## Knowledge-base tables

### `kb_documents`

Tenant-scoped document metadata: title, `pdf`/`docx`/`url`/`text` source type,
source, processing status, chunk count, and creation time. `docx` was added by
migration `20260725000001_kb_docx_source.sql`.

### `kb_chunks`

Tenant/document-scoped passage content, optional `vector(1024)` embedding, generated English FTS vector, and timestamp. Deleting a document cascades to its chunks.

### `match_kb_chunks`

RPC returning the nearest embedded chunks for an org. Service code supplies the tenant ID; RLS remains the browser boundary.

## RLS and privilege model

- RLS is enabled on organizations, profiles, all tenant data tables, and KB tables.
- `current_org_id()` is SECURITY DEFINER to avoid recursive profile-policy evaluation.
- Tenant table policies require `org_id = current_org_id()` for reads and writes.
- The service-role client bypasses RLS, so server routes must enforce tenant ownership explicitly.
- Column privileges supplement the policies (hardened 2026-07-23): clients may
  update only `profiles.full_name` and `organizations.name`/`ai_enabled`, and may
  not select `organizations.wa_access_token`.
- Sensitive changes (WhatsApp credentials, roles, plan, suspension) are performed
  by service-role routes that check the caller's role or platform-operator status.

## Realtime

`messages` and `conversations` are added to `supabase_realtime` for the inbox. Confirm publication setup in every deployed environment.

## Indexes

The schema includes tenant/activity indexes for contacts, conversations, messages, rules, broadcasts, and KB documents; GIN for FTS; and HNSW cosine search for embeddings.

## Seed behavior

`create_organization()` inserts four tenant-scoped rules: `hi`, `hello`, `price`, and `help`. These are function-driven seeds; the local Supabase seed step is disabled.
