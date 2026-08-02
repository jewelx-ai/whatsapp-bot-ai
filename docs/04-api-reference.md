# 04 — API Reference

> **Update (2026-07-23):** Webhook signature verification, dedupe/retry
> behavior, and URL-ingestion SSRF protection were fixed, and settings, workspace
> admin, and platform operator endpoints were added. See
> [08-changelog.md](08-changelog.md).

All endpoints are Next.js App Router route handlers under `src/app/api/`.

## `GET /api/webhook`

Meta webhook verification handshake.

Query parameters: `hub.mode=subscribe`, `hub.verify_token`, and `hub.challenge`. The token must equal platform env `WHATSAPP_VERIFY_TOKEN`.

Responses: `200` with the challenge or `403 Forbidden`.

## `POST /api/webhook`

Receives events for every workspace. Meta's `metadata.phone_number_id` resolves the organization and its credentials.

**Authentication:** `X-Hub-Signature-256: sha256=<hmac>` against platform env `WHATSAPP_APP_SECRET` using a timing-safe comparison.

**Current behavior:**

- Handles text and interactive button/list messages.
- Stores unsupported message types with a `[type]` placeholder.
- Upserts contacts, finds/creates conversations, stores messages, marks as read, and invokes bot logic.
- Updates outgoing status events by tenant and WhatsApp message ID.
- Checks for an existing WhatsApp message ID before processing.

- Skips tenants with `organizations.suspended = true` (no storage, no reply).

**Hardened 2026-07-23:**

- Signature verification **fails closed**: a missing `WHATSAPP_APP_SECRET` rejects
  the request. Local development may opt out with `ALLOW_UNSIGNED_WEBHOOKS=true`.
- Deduplication is atomic — the unique `wa_message_id` insert is the idempotency
  gate, and a conflict (`23505`) skips the auto-reply, so redeliveries cannot
  double-send.
- Processing failures return `500` so Meta retries instead of losing the event.

Responses: `401` invalid/absent signature, `400` malformed JSON, `500` processing
error (Meta retries), otherwise `200 {"ok":true}`.

## `POST /api/messages/send`

Authenticated manual reply using the current workspace's WhatsApp credentials.

```json
{
  "conversationId": "uuid",
  "text": "1–4096 characters"
}
```

The server resolves the session's organization and verifies the conversation belongs to it before sending.

Responses:

- `200 {ok, message}` after Graph success; database persistence errors currently need stronger handling.
- `400` invalid input.
- `401` no session/workspace.
- `404` conversation not found in the workspace.
- `409` workspace has no WhatsApp credentials.
- `502` Graph API rejected the send.

A successful human send switches the conversation to `open`.

## `POST /api/broadcasts`

Authenticated template campaign for opted-in contacts in the current workspace.

```json
{
  "templateName": "approved_template",
  "languageCode": "en_US",
  "audienceTag": "vip",
  "idempotencyKey": "client-generated-key"
}
```

`languageCode` defaults to `en_US`; `audienceTag` is optional. `idempotencyKey`
is optional but should be sent by clients; reusing the same key returns the same
campaign instead of creating duplicate recipient sends.

The route checks the workspace plan/status, creates one `broadcasts` row, creates
durable `broadcast_recipients` rows for the plan-limited opted-in audience, and
processes one bounded batch.

Responses: `200 {ok, broadcast, done, processedThisBatch, idempotencyKey}`,
`400`, `401`, `403` plan inactive/limit exceeded, or `409`.

## `PATCH /api/broadcasts`

Processes the next bounded batch for an existing campaign.

```json
{
  "broadcastId": "uuid"
}
```

Responses: `200 {ok, broadcast, done, processedThisBatch}`, `400`, `401`, `403`
plan inactive, or `409`.

Recipient rows are claimed before sending so overlapping requests do not
double-send the same queued recipient. The dashboard can continue processing
manually, and the worker endpoint below can process queued campaigns
independently.

## `POST /api/worker/broadcasts`

Cron/worker endpoint for independent broadcast processing. It is protected by:

```http
Authorization: Bearer <CRON_SECRET>
```

Optional body:

```json
{
  "limit": 5
}
```

The worker loads queued/processing campaigns, recovers stale recipient rows that
have been stuck in `processing`, processes one bounded batch per campaign, and
returns per-broadcast results. `limit` defaults to 5 and is capped at 25.

Responses: `200 {ok, checked, results}`, `400`, `401`, `503` when
`CRON_SECRET` is not configured, or `500`.

## `GET /api/analytics`

Tenant-scoped dashboard aggregates for the signed-in user's workspace. The route
resolves the current org, calls the service-role-only
`dashboard_analytics(p_org_id, p_days)` RPC, and falls back to direct
server-side count queries if the RPC is missing from Supabase's schema cache.

```json
{
  "totalContacts": 12,
  "totalConversations": 8,
  "openConversations": 2,
  "messagesIn": 40,
  "messagesOut": 31,
  "days": [{ "iso": "2026-07-31", "incoming": 4, "outgoing": 3 }]
}
```

Responses: `200`, `401` without a session/workspace, or `500` if both the RPC
and fallback queries fail or the aggregate response is malformed.

## `POST /api/kb/upload`

Authenticated document ingestion for **PDF and Word (`.docx`)**.

- Input: multipart form field `file`.
- Validation: `.pdf` or `.docx` extension, maximum 20 MB.
- Extraction: `unpdf` for PDF, `mammoth` (`extractRawText`) for Word — then
  chunking → optional Voyage embeddings → Supabase.
- Stored `source_type` is `pdf` or `docx` so the Knowledge list labels it
  correctly.
- Files yielding under 20 characters of text are rejected with a message about
  scanned/image-only documents needing OCR, rather than saving an empty document.
- Legacy `.doc` (binary Word 97) is rejected with a hint to save as `.docx`.
- Duration hint: 120 seconds.

Responses: `200 {ok, documentId, chunkCount}`, `400` unsupported type, `401`,
`403` plan inactive/limit exceeded, `413` too large, or `422` extraction
failure/no readable text.

## `POST /api/kb/text`

Authenticated pasted-text ingestion.

```json
{
  "title": "1–200 characters",
  "text": "20–500000 characters"
}
```

Responses: `200 {ok, documentId, chunkCount}`, `400`, `401`, `403` plan
inactive/limit exceeded, or `422`.

## `POST /api/kb/url`

Authenticated web-page ingestion.

```json
{ "url": "https://example.com/faq" }
```

The route strips non-content HTML and indexes extracted text.

**SSRF protection (added 2026-07-23):**

- Only `http`/`https` schemes.
- The hostname is DNS-resolved and rejected if any address is private, loopback,
  link-local (including `169.254.169.254` cloud metadata), CGNAT, multicast, or
  otherwise reserved — for both IPv4 and IPv4-mapped IPv6.
- Redirects are handled manually (max 3) and **every hop is re-validated**, so a
  public URL cannot redirect into an internal one.
- Responses are capped at 5 MB and the fetch times out after 20 seconds.

Responses: `200 {ok, title, documentId, chunkCount}`, `400`, `401`, `403` plan
inactive/limit exceeded, `413` too large, or `422` (includes blocked hosts and
unresolvable names).

## `GET /api/settings`

Workspace settings for the signed-in user's tenant. **Never returns the WhatsApp
access token** — only `connected: boolean` and a non-secret `tokenHint`
(`length`, `last4`) when a token is stored and decryptable.

Returns `{id, name, phoneNumberId, aiEnabled, plan, planStatus, role, connected,
tokenHint}`, `401` without a session/workspace, or `500` if stored credentials
cannot be decrypted.

## `GET /api/settings/verify`

Checks the workspace's stored WhatsApp credentials against Meta so Settings can
show a truthful status. Read-only; the token never leaves the server.

Returns `{status: "not_configured"}`, `{status: "ok", displayPhoneNumber,
verifiedName, qualityRating}`, `{status: "invalid", reason}` for an
expired/revoked token (Graph `code 190`), or `{status: "error", reason}` when Meta
is unreachable. `401` without a session/workspace.

## `POST /api/settings`

Updates workspace settings.

```json
{
  "name": "Acme Foods",
  "aiEnabled": true,
  "phoneNumberId": "1021734921030952",
  "accessToken": "EAAO…"
}
```

All fields optional. Changing `phoneNumberId` or `accessToken` requires the
`owner` or `admin` role; the token is encrypted before storage, write-only, and
never read back.

Responses: `200 {ok}`, `400` invalid/empty payload, `401` no session, `403`
insufficient role for a credential change, `500` encryption/configuration or
database error.

> **Removed 2026-07-25:** the tenant `PATCH /api/admin/members` endpoint and the
> tenant admin page no longer exist. Tenants cannot manage their own team; role
> changes are operator-only through `PATCH /api/admin/users` below.
> The `/api/admin/*` namespace now belongs exclusively to the operator portal and
> returns `403` to anyone who is not the single super admin.

## Platform (operator) endpoints

All routes below require the single platform operator
(`PLATFORM_SUPER_ADMIN_EMAIL`) and return `403 Forbidden` otherwise. See
[14-platform-admin.md](14-platform-admin.md).

### `GET /api/admin/session`

Confirms the signed-in account is the operator. `200 {email}` or `403`.

### `POST /api/admin/orgs`

Creates a workspace.

```json
{ "name": "Acme Foods", "plan": "free" }
```

`name` is 2–200 characters; `plan` is `free` (default), `starter`, or `pro`.
Responses: `200 {ok, id}`, `400`, `403`, `500`.

### `PATCH /api/admin/orgs/[id]`

Updates `plan`, `planStatus`, and/or `suspended` for any tenant. Responses:
`200 {ok}`, `400` invalid body or nothing to update, `403`, `500`.

### `DELETE /api/admin/orgs/[id]`

Permanently deletes a workspace.

```json
{ "confirmName": "Acme Foods" }
```

`confirmName` must match the workspace name exactly. Tenant data cascades
(contacts, conversations, messages, rules, broadcasts, KB, usage); member
profiles are detached (`org_id` → null), not deleted. Responses: `200 {ok}`,
`400` name mismatch, `403`, `404`, `500`.

### `POST /api/admin/users`

Creates a pre-confirmed account and optionally assigns it to a workspace.

```json
{
  "email": "person@example.com",
  "password": "min 8 characters",
  "fullName": "Jane Doe",
  "orgId": "uuid",
  "role": "agent"
}
```

Responses: `200 {ok, id}`, `400` validation or duplicate email, `403`,
`503` transient Supabase Auth failure (retry), `500`.

### `PATCH /api/admin/users`

Changes a member's role and/or workspace. This is the **only** path for role
changes — the client dashboard has no admin surface.

```json
{ "userId": "uuid", "role": "admin", "orgId": "uuid-or-null" }
```

At least one of `role`/`orgId` is required. Guardrails: a workspace can never be
left without an owner (demoting or moving its last owner is refused), and the
platform operator's own profile cannot be role-changed since it is not a
workspace member.

Responses: `200 {ok}`, `400` invalid/nothing to update/last-owner/operator
target, `403`, `404`, `500`.

### `DELETE /api/admin/users`

Permanently deletes an account.

```json
{ "userId": "uuid", "confirmEmail": "person@example.com" }
```

`confirmEmail` must match. The platform operator account is refused. Responses:
`200 {ok}`, `400` mismatch or operator target, `403`, `404`, `503` transient auth
failure, `500`.

## Graph API helpers

Every helper receives per-organization credentials:

| Function | Purpose |
|---|---|
| `sendText(creds, to, body)` | Free-form customer-service-window reply |
| `sendTemplate(creds, to, name, language?, components?)` | Approved template message |
| `markAsRead(creds, waMessageId)` | Read receipt |

They call Graph API `v21.0`. HTTP error responses are converted to `{ok:false}`, but network exceptions can still throw and explicit request timeouts are missing.

## Authentication/authorization summary

| Route | Protection |
|---|---|
| Webhook GET | Verify token |
| Webhook POST | Meta HMAC; fails closed without the app secret |
| Manual send | Supabase session + conversation org check |
| Broadcast | Supabase session + current org audience + active plan/recipient limit |
| KB routes | Supabase session + current org ingestion + active plan/KB limits; URL route also SSRF-validated |
| `GET/POST /api/settings` | Supabase session; credential writes need `owner`/`admin` |
| `/api/admin/*` | Single platform operator (`PLATFORM_SUPER_ADMIN_EMAIL`) |

Per-plan quotas are enforced in app code for AI replies, broadcasts, and KB
ingestion. AI uses `bump_ai_usage()` for the daily per-workspace cap. Per-minute
rate limits, Stripe/billing automation, and spend alerts are still not
implemented.
