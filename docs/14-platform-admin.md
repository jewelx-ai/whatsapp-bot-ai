# 14 — Platform Admin (Operator Portal)

Cross-tenant control panel for the person who runs the SaaS. Added 2026-07-23.

**This is the only admin surface in the product.** The old tenant-facing admin
page was removed on 2026-07-25, so customers see customer features only and every
administrative action happens here. The portal moved from `/platform` to
`/admin` on 2026-07-25; only the single configured super admin can reach it.

| Surface | Path | Who | Scope |
|---|---|---|---|
| Client dashboard | `/inbox` … `/settings` | Tenant members | Their own workspace data |
| Platform admin | `/admin` | The single platform operator | Every workspace on the deployment |

## Separate sign-in

The operator has its own login at **`/admin/login`**, deliberately isolated
from the tenant login at `/login`:

- Sign-in only — no self-service sign-up and no social auth.
- **Password reset (added 2026-07-25):** a "Forgot password?" control swaps the
  form for a recovery request that calls
  `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`.
  The confirmation copy is identical whether or not the address exists, and
  "user not found" errors are swallowed, so the page cannot be used to enumerate
  accounts. Only genuine transport failures (for example `429` rate limiting)
  are shown.
- `/reset-password` is shared with tenants. After the password is updated it
  calls `GET /api/admin/session`: the operator is sent to `/admin`, everyone else
  to `/inbox`.
- The recovery link only works if the redirect target is allow-listed in
  Supabase → Authentication → URL Configuration (`<origin>/reset-password`).
  Otherwise Supabase falls back to the project Site URL. Default Supabase SMTP is
  also heavily rate limited, so production should configure real SMTP.
- Credentials are verified by Supabase Auth (same `auth.users` table), so there
  is no second credential store.
- After a successful password sign-in the page calls `GET /api/admin/session`
  to confirm server-side that the account is the operator. If it is not, the
  session is signed out again and the user is told to use the workspace sign-in.
- No link to `/admin` exists anywhere in the tenant UI.

## Exactly one operator

Access is granted to a single account, identified by platform env
**`PLATFORM_SUPER_ADMIN_EMAIL`**. There is no in-app screen to add more
operators; that is intentional, so cross-tenant access stays to one auditable
account.

The operator account should **not** belong to any workspace (`profiles.org_id`
is null). Middleware enforces the separation: if the operator visits `/inbox`,
`/onboarding`, or `/login` it is redirected to `/admin`, so it can never
accidentally create a workspace for itself.

Changing the operator: point `PLATFORM_SUPER_ADMIN_EMAIL` at another existing
Supabase Auth user and restart the app. Passwords are managed in Supabase Auth.

### Guard implementation

`src/lib/platform.ts`:

| Function | Used by | Behavior |
|---|---|---|
| `superAdminEmail()` | both | The configured operator email, lowercased |
| `isSuperAdminEmail(email)` | pages | Compares an email to the configured operator |
| `getPlatformAdmin()` | API routes | Returns the session or `null` (caller returns 403) |
| `requirePlatformAdmin()` | pages/layouts | Redirects signed-out users to `/admin/login` and non-operators to `/inbox` |

Every platform page and API route is guarded independently, so the portal is not
protected by navigation obscurity alone.

## Screens

Route group `src/app/admin/(portal)/` holds the guarded pages; the group
keeps `/admin/login` outside the authenticated shell. The portal reuses the
tenant dashboard's design system (same sidebar shell, `app-panel`, `data-table`,
`badge-*`, `field`, `btn-*` classes) so both areas look identical.

### Overview — `/admin`

Platform-wide counts: workspaces, users, contacts, conversations, messages, and
AI replies today; plan distribution; WhatsApp-connected and suspended counts;
the five most recent workspaces.

### Organizations — `/admin/organizations`

Searchable list (by name) of every tenant with plan, billing status, WhatsApp
connection, suspension state, and creation date.

- **New workspace** — creates a tenant from a name plus plan. The workspace
  starts empty; add its owner from the Users page, then the tenant connects
  WhatsApp in its own settings.
- **Delete** — permanent. Requires typing the exact workspace name.

### Organization detail — `/admin/organizations/[id]`

Per-tenant metrics (contacts, conversations, messages, AI replies today), the
member roster with emails and an editable **role** control, and operator controls
for:

- `plan` — `free` / `starter` / `pro` (limits apply immediately)
- `plan_status` — `active` / `past_due` / `canceled`
- **suspend / unsuspend**

Changing a member's role uses `PATCH /api/admin/users`. A workspace can never
be left without an owner: demoting or moving its last owner is refused. The
operator's own profile cannot be role-changed, since it belongs to no workspace.

### Users — `/admin/users`

Every account across all tenants with email, name, role, workspace, and join
date.

- **New user** — email, optional full name, temporary password (with a generator),
  target workspace, and role. Created pre-confirmed, so the person can sign in
  immediately and should change the password.
- **Delete** — permanent. Requires typing the exact email. The operator's own row
  shows `operator` instead of a delete control, and the API refuses to delete it
  even when called directly.

### Access — `/admin/access`

Read-only: the signed-in operator, the configured operator email, the portal
path, the user ID, and instructions for moving platform access.

## Suspension is enforced, not cosmetic

`organizations.suspended` is checked by the shared webhook. Inbound WhatsApp
events for a suspended tenant are logged and skipped — no message storage, no
keyword reply, no AI reply. See [05-bot-logic.md](05-bot-logic.md).

## Data model additions

| Object | Purpose |
|---|---|
| `organizations.suspended` | boolean, default false; blocks webhook processing |
| `profiles.email` | synced copy of `auth.users.email` for reliable member lists |
| `platform_admins` table + `is_platform_admin()` | **unused**; created before the single-operator decision. Safe to drop. |

Migrations: `20260723000002_platform_admin.sql`,
`20260723000003_profile_email.sql`.

## Known limitations

- Plans are enforced for AI replies, broadcast audience size, and KB ingestion,
  but there is no billing automation.
- No audit log of operator actions beyond server-side `console.warn` lines for
  workspace and user deletions.
- No cross-tenant message search, impersonation, or export.
- Deleting a workspace detaches its members (`profiles.org_id` → null) rather
  than deleting their accounts; they land on `/onboarding` at next sign-in.
- The operator cannot reset a tenant user's password from the portal; use
  Supabase Auth.

## Troubleshooting: Supabase auth admin ES256 errors

On this project the Supabase Auth (GoTrue) **admin** endpoints intermittently
reject valid service-role requests with:

```
invalid JWT: unable to parse or verify signature, token is unverifiable:
error while executing keyfunc: unrecognized JWT kid <nil> for algorithm ES256
```

Observed on `createUser`, `deleteUser`, `listUsers`, `getUserById`, and
`generateLink`. PostgREST (database) requests are unaffected. The project uses
the newer `sb_secret_…` API key with asymmetric ES256 JWT signing keys.

Mitigations in the codebase:

- `src/lib/supabase/retry.ts` — `withAuthRetry()` retries only this transient
  fault with backoff; routes return `503` with a "try again" message if it
  persists, instead of a misleading error.
- Member and user lists read `profiles.email` instead of calling the auth admin
  API, so page rendering never depends on it.

If it persists, try the legacy `service_role` JWT for
`SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API keys), or check
for a pending JWT signing-key rotation on the project.
