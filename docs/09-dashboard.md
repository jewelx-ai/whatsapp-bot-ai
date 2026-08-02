# 09 — Dashboard

> **Readiness update (2026-07-21):** Dashboard routes are implemented, but new auto-reply creation is broken and Inbox/Analytics fail lint. See [13-feature-readiness-audit.md](13-feature-readiness-audit.md).

All dashboard pages require a Supabase session. The dashboard layout also requires `profiles.org_id`; users without a workspace are redirected to `/onboarding`. The platform operator account is redirected to `/admin` instead, so it never enters the tenant app.

Sidebar navigation: Workspace (Inbox, Contacts, Auto-replies, Knowledge, Broadcasts) and Insights & setup (Analytics, Settings).

**There is no admin screen in the client dashboard.** Team roles, plans, and
suspension are operator-only and live in the platform portal — see
[14-platform-admin.md](14-platform-admin.md).

## Authentication and onboarding

### `/login`

- Email/password sign-in and sign-up.
- **Google sign-in** (`signInWithOAuth`, PKCE) returning through
  `/auth/callback?next=/inbox`. It needs the Google provider and the callback
  redirect URL configured in Supabase — see
  [06-setup-guide.md](06-setup-guide.md#google-sign-in-optional).
- Full name is stored in auth metadata and copied to the profile trigger; for
  Google accounts it comes from the Google profile claims.
- Email-confirmation flows return through `/auth/callback`.
- Signed-in users are redirected toward `/inbox`.
- The route is a server page that maps `?error=<code>` from `/auth/callback`
  (`oauth_denied`, `oauth_failed`, `link_expired`) onto fixed copy; the form is
  the client component `login-form.tsx`. Unknown codes render nothing, so the
  screen never echoes a query-string message back to the visitor.

### `/onboarding`

Calls `create_organization(org_name)`, which creates an organization, sets the caller as owner, and inserts four default tenant rules. Existing members cannot create a second organization through the RPC.

### `/settings`

Edits workspace name, tenant Phone Number ID, tenant access token, and `ai_enabled`; displays plan fields.

Reads and writes go through `/api/settings` (server-side) rather than the browser
Supabase client.

**Hardened 2026-07-23:** the access token is never sent to the browser — the page
shows only a connected/not-connected badge and treats the token field as
write-only. Changing WhatsApp credentials requires the `owner`/`admin` role, and
the fields are disabled for agents.

**The access token is write-only by design.** It is never returned to the
browser, so the field is always blank after saving. To prove a token is stored,
the page shows a masked hint (`••••••••••••XXXX · N characters`) built from the
last four characters, and the verified connection badge. Leaving the field blank
keeps the existing token.

**Connection status is verified (2026-07-25).** The badge no longer just checks
that a token exists — the page calls `GET /api/settings/verify`, which asks Meta
about the stored credentials, and shows one of: `checking…`, `connected` (with the
display number, verified name, and quality rating), `token expired` (with the
Graph reason and how to fix it), `not connected`, or `unverified` if Meta could
not be reached. It re-checks after a save.

**Hardened 2026-07-31:** new token saves are encrypted at rest with
`WHATSAPP_TOKEN_ENCRYPTION_KEY`. Legacy plaintext rows remain readable and should
be re-saved after the key is configured.

### Team management — not in the client app

The tenant-facing admin page and `PATCH /api/admin/members` were **removed on
2026-07-25**. Tenants cannot manage their own team; the operator does it from
`/admin/organizations/[id]` via `PATCH /api/admin/users`.

**Note (2026-07-25):** `/admin` was later reused as the URL of the *operator*
portal, so it is no longer a 404. It is guarded by the single-super-admin check:
a signed-out visitor is sent to `/admin/login`, and a signed-in tenant is
redirected to `/inbox`. No tenant can reach it.

Roles still exist on `profiles` and still gate WhatsApp credential writes in
`/api/settings` (owner/admin only).

## `/inbox`

- Conversations ordered by activity with contact and status.
- Selected thread displays up to 500 messages.
- Realtime conversation changes refresh the list; message inserts append to the selected thread.
- Manual replies post to `/api/messages/send`.
- Status controls switch between `bot`, `open`, and `closed`.

Thread layout: the message column is bottom-anchored (`min-h-full` + `justify-end`
on the inner column, vertical padding on that column rather than the scroll
parent), so a short conversation sits directly above the composer instead of
hanging from the top of the pane. Opening a thread jumps to the newest message;
messages that arrive while reading animate in. Messages from the same side within
five minutes render as one run — contact name on the first bubble, avatar on the
last, `rounded-b*-md` tail on the last — separated by Today/Yesterday/date
dividers. Outbound bubbles show delivery state as ticks (sent, delivered, read,
`failed` with a warning glyph) with the raw status kept for screen readers. Both
sides use one avatar column; outbound shares a single workspace mark because the
schema does not record whether the bot or a teammate sent the reply.

The server send route verifies conversation ownership. The page currently violates React hook/ref lint rules, ignores several query/update errors, and can have selection/query races.

## `/auto-replies`

The editor supports fields for keyword, match type, response, active state, and edit/delete controls.

- Edit, toggle, and delete paths are present and tenant-scoped by RLS.
- **Create currently fails** because the insert omits required `org_id`.
- Rule evaluation has no explicit priority column/order.

## `/contacts`

- Lists up to 500 contacts.
- Searches name, phone, and tags in loaded data.
- Adds/removes normalized tags.
- Shows each contact's broadcast consent status and lets an operator toggle
  `opted_in`.

Inbound exact commands `STOP`, `STOP ALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, or
`QUIT` opt the contact out and send a confirmation. `START`, `SUBSCRIBE`, or
`UNSTOP` opt the contact back in. CSV import and consent-evidence history are not
built.

## `/broadcasts`

Provides template/language/tag inputs and campaign history with status,
processed count, sent count, and failed count. The API creates durable
per-recipient rows, uses a client idempotency key, and processes bounded batches
through repeated `POST`/`PATCH /api/broadcasts` calls. A separate background
worker, cancellation, and scheduled execution are not built.

## `/analytics`

Displays total contacts/conversations/open conversations and 14-day message
counts/chart. Counts come from `GET /api/analytics`, which calls the
`dashboard_analytics()` aggregate RPC instead of downloading capped raw message
rows.

## `/knowledge`

Provides **PDF / Word**, website, and text ingestion tabs, document status/list, and deletion. PDF/text code paths require live testing. Website ingestion now has SSRF protection (host/redirect validation and a size cap) — see [04-api-reference.md](04-api-reference.md).

## Data access and authorization

| Path | Access model |
|---|---|
| Dashboard reads/writes | Browser anon client + authenticated session + RLS |
| Manual sends/broadcasts/KB ingestion | Server routes resolve current org, then use service role |
| Dashboard layout | Server-side `auth.getUser()` plus profile check |
| Route refresh/redirect | Current `src/proxy.ts` |

RLS is now supplemented by column privileges: clients cannot change
`profiles.org_id`/`role`, cannot read `organizations.wa_access_token`, and can
update only `name`/`ai_enabled` on their organization. Sensitive changes run
through role-checked server routes.
