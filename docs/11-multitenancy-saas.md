# 11 — Multi-Tenancy & SaaS Model

As of 2026-07-14 the app is a **multi-tenant SaaS**: many businesses (tenants) share one deployment, one database, and one webhook — each with fully isolated data and its own WhatsApp number.

## Tenant model

- A tenant = an **organization** (row in `organizations`).
- Every dashboard user (`profiles.org_id`) belongs to exactly one org; the first user who creates a workspace becomes its `owner`.
- Every data row (`contacts`, `conversations`, `messages`, `auto_replies`, `broadcasts`) carries `org_id`.
- Plan fields (`plan`: free/starter/pro, `plan_status`) exist on the org for billing — Stripe integration is not built yet.

## Credential model (who owns what)

| Credential | Level | Where it lives |
|---|---|---|
| Supabase keys | Platform | env vars |
| Meta **app secret** + webhook **verify token** | Platform (one Meta app serves all tenants) | env vars |
| WhatsApp **Phone Number ID** + **access token** | **Per tenant** | `organizations` table, entered in `/settings` |
| Anthropic API key | Platform (billed to you) | env var; tenants toggle `ai_enabled` per workspace |

## Webhook routing (the core multi-tenant mechanic)

One endpoint (`POST /api/webhook`) receives events for **all** tenants. Meta includes `value.metadata.phone_number_id` in every payload; the webhook looks up the owning org (`organizations.wa_phone_number_id`) and processes the event with that org's id, credentials, and AI setting. Events for unknown phone numbers are logged and skipped.

```
Meta Cloud API ──► POST /api/webhook
                     │ metadata.phone_number_id
                     ▼
             organizations lookup ──► org A? org B? …
                     ▼
     store contact/conversation/message with org_id
     reply using that org's wa_access_token
```

## Tenant isolation (RLS)

- Helper `current_org_id()` (SECURITY DEFINER) returns the caller's `profiles.org_id`.
- Every table has one policy: `org_id = current_org_id()` for select/insert/update/delete — a logged-in user can never read or write another tenant's rows, even with hand-crafted queries, because Postgres enforces it.
- Server code (webhook, send/broadcast APIs) uses the service-role key (bypasses RLS) but always filters by the resolved org and verifies resource ownership (e.g. the send API checks `conversations.org_id` matches the caller's org before sending).
- `create_organization(org_name)` RPC: creates the org, promotes the caller to owner, seeds the default auto-replies. Fails if the user already has an org.

## SaaS user journey

1. **Sign up** at `/login` → profile auto-created (no org yet)
2. Dashboard layout detects no org → redirect to **`/onboarding`** → "Create your workspace"
3. Redirected to **`/settings`** → paste WhatsApp Phone Number ID + access token (from Meta), toggle AI replies
4. Incoming messages to that number now flow into this workspace's inbox

## Files changed for multi-tenancy

| File | Change |
|---|---|
| `supabase/schema.sql` | v2: `organizations`, `org_id` everywhere, org-scoped RLS, `current_org_id()`, `create_organization()` RPC, per-org seed replies |
| `src/lib/org.ts` | **New** — org lookup by phone_number_id / current user, credential extraction |
| `src/lib/whatsapp.ts` | All senders take per-org `WaCredentials` instead of env vars |
| `src/lib/bot.ts` | Org-scoped rules; per-org AI toggle |
| `src/lib/ai.ts` | Tenant toggle moved to `organizations.ai_enabled` (platform key stays env) |
| `src/app/api/webhook/route.ts` | Routes by `metadata.phone_number_id`; per-org processing |
| `src/app/api/messages/send`, `api/broadcasts` | Resolve caller's org; use org creds; `409` if WhatsApp not connected |
| `src/app/onboarding/page.tsx` | **New** — workspace creation |
| `src/app/(dashboard)/settings/page.tsx` | **New** — WhatsApp connection + AI toggle + workspace name |
| `src/app/(dashboard)/layout.tsx` | Redirects org-less users to onboarding |
| Middleware / nav / env template / status page | Extended for the new routes and credential model |

## Not built yet (SaaS roadmap)

- **Billing**: Stripe checkout + webhooks driving `plan` / `plan_status`; usage limits per plan (e.g. message caps on free)
- **Team invites**: adding agents to an existing org (currently each signup creates its own workspace)
- **Meta Embedded Signup**: OAuth-style "Connect WhatsApp" button instead of pasting credentials
- **Per-role permissions**: owner/admin/agent columns exist, but all members currently have equal access
- Token encryption at rest (tokens are plaintext in Postgres; consider Supabase Vault)
