# 11 — Multi-Tenancy and SaaS Model

> **Update (2026-07-23):** The tenant-hijack policy gap is fixed, roles are
> enforced for workspace administration, and a separate single-operator platform
> tier was added ([14-platform-admin.md](14-platform-admin.md)). Billing and
> plan limits are enforced for AI, broadcasts, and KB ingestion. Billing
> automation remains unbuilt. See [08-changelog.md](08-changelog.md).

## Tenant model

- One tenant is an `organizations` row.
- A dashboard user has one `profiles` row with nullable `org_id`.
- Onboarding creates an organization, links the caller, promotes them to owner, and seeds tenant rules.
- Contacts, conversations, messages, rules, broadcasts, KB documents, and KB chunks carry `org_id`.
- `plan` and `plan_status` are operator-managed and enforced for AI replies,
  broadcasts, and KB ingestion.

## Credential model

| Credential | Scope | Current location | Readiness |
|---|---|---|---|
| Supabase URL/anon/service role | Platform | Environment | Service role must remain server-only |
| Meta app secret and webhook verify token | Platform | Environment | App secret must be mandatory in production |
| WhatsApp Phone Number ID | Tenant | `organizations` | Used for routing |
| WhatsApp access token | Tenant | `organizations` encrypted text | Write-only in browser; encrypted on new saves |
| Z.ai key | Platform | Environment | Requires tenant quotas/spend controls |
| Voyage key | Platform, optional | Environment | Requires quotas/spend controls |

## Shared webhook routing

Meta includes `value.metadata.phone_number_id`. The webhook loads the organization with that Phone Number ID, stores tenant data with its `org_id`, and sends with its token. Unknown IDs are logged and skipped.

The design supports many tenants per deployment, but webhook processing must become durable/idempotent before production.

## RLS intent and current gap

`current_org_id()` reads the caller's profile using SECURITY DEFINER. Tenant table policies compare every row's `org_id` with that value. Server routes using service role must perform explicit ownership checks.

### Isolation issues — fixed 2026-07-23

The profile self-update policy still matches only `auth.uid() = id`, but column
privileges now restrict client updates to `full_name`, so `org_id` and `role`
cannot be changed from the browser (previously a tenant-hijack path). Client
updates on `organizations` are limited to `name` and `ai_enabled`. Role changes go
through the operator-only `PATCH /api/admin/users`.

### Credential exposure

`select` on `organizations.wa_access_token` is revoked for `anon`/`authenticated`,
and Settings no longer loads the token into the browser; it is write-only through
`/api/settings` with an owner/admin check. New saves are encrypted with
`WHATSAPP_TOKEN_ENCRYPTION_KEY`; legacy plaintext rows remain readable and should
be re-saved to migrate them.

## User journey

1. Sign up at `/login`; auth trigger creates an org-less profile.
2. Dashboard redirects to `/onboarding`.
3. `create_organization()` creates the workspace and seed rules.
4. `/settings` accepts tenant WhatsApp credentials and AI toggle.
5. Shared webhook begins routing matching Phone Number ID events to the workspace.

The current “connected” label confirms only that values are present, not that Meta accepts them.

## Administration is operator-only

There is **one** admin tier. The tenant-facing admin page and
`/api/admin/members` were removed on 2026-07-25: customers get customer features
only, and all administration happens in the operator portal, which now lives at
`/admin` and is reachable only by the single configured super admin.

| Surface | Path | Sign-in | Who | Scope |
|---|---|---|---|---|
| Client dashboard | `/inbox` … `/settings` | `/login` | Tenant members | Their own workspace data |
| Platform operator | `/admin` | `/admin/login` | One account (`PLATFORM_SUPER_ADMIN_EMAIL`) | Every workspace |

The operator has a separate login page, is not a member of any workspace, is
never linked from tenant UI, and is redirected out of the tenant app by
middleware. It creates/deletes workspaces and users, assigns roles and
workspaces, changes plan and billing status, and suspends tenants. Full detail in
[14-platform-admin.md](14-platform-admin.md).

## Role model

The schema defines `owner`, `admin`, and `agent`.

- **Who can change a role:** only the platform operator, through
  `PATCH /api/admin/users`. A workspace can never be left without an owner.
- **What roles still gate inside a workspace:** WhatsApp credential writes in
  `/api/settings` require `owner`/`admin`.
- **What they do not gate:** inbox, contacts, broadcasts, and knowledge-base data
  are visible to every member of the workspace.

Team invitations (email-based self-serve onboarding) are not built; the operator
provisions accounts instead.

## User journey (operator-provisioned)

Alongside self-serve signup, the operator can provision a tenant directly:
create the workspace on `/admin/organizations`, create its owner account on
`/admin/users` with that workspace and the `owner` role, then hand over the
temporary password. The tenant connects WhatsApp in its own `/settings`.

## Deferred SaaS scope

- Stripe checkout and billing webhooks; plan/status changes are manual in the
  operator portal.
- Team invitations and membership lifecycle.
- Data-level role authorization inside a workspace.
- Meta Embedded Signup.
- Vault-backed WhatsApp tokens and encryption key rotation tooling.
- Per-minute rate limits, metering beyond the daily AI cap, audit logs, and
  spend alerts.
