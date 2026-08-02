# 02 — Architecture

> **Readiness update (2026-07-21):** This describes the current implementation, not a production approval. Reliability and security gaps are tracked in [13-feature-readiness-audit.md](13-feature-readiness-audit.md).

## System overview

```text
WhatsApp users
      │
      ▼
Meta WhatsApp Cloud API
      │ signed webhook containing metadata.phone_number_id
      ▼
Next.js POST /api/webhook
      ├─ resolve organization by Phone Number ID
      ├─ persist contact, conversation, inbound message
      ├─ keyword rule → AI/RAG fallback → static fallback
      ├─ send with that organization's WhatsApp token
      └─ process delivered/read/failed status events

Dashboard user ── Supabase Auth ── organization profile
      ├─ browser + RLS: inbox, contacts, rules, analytics, KB list
      └─ server APIs: manual sends, broadcasts, KB ingestion

Knowledge ingestion ── PDF / URL / text
      ├─ chunk content
      ├─ optional Voyage embeddings → pgvector
      └─ PostgreSQL full-text fallback
```

## Tenant model

- An `organization` is one tenant.
- `profiles.org_id` links a dashboard user to one organization.
- Tenant data rows carry `org_id`.
- Incoming webhooks route by unique `organizations.wa_phone_number_id`.
- Outbound sends use `organizations.wa_access_token` for the resolved tenant.
- Browser access uses the anon key plus RLS; server routes use a service-role client and must enforce ownership explicitly.

The schema uses tenant-scoped RLS plus column privileges for security-sensitive
profile and organization fields. Treat service-role routes as trusted boundaries:
they must keep explicit tenant and role checks because RLS is bypassed there.

## Incoming-message flow

1. Read the raw request body.
2. Verify `X-Hub-Signature-256` with the platform Meta app secret.
3. Resolve the tenant from `metadata.phone_number_id`.
4. Check whether the WhatsApp message ID already exists.
5. Upsert the tenant contact and find/create its active conversation.
5b. Skip the event when the organization is suspended by the platform operator.
6. Store the inbound message (the unique `wa_message_id` insert is the dedupe gate) and update conversation activity.
7. Mark the message as read.
8. If the conversation is not human-owned, run keyword matching, then optional AI/RAG (GLM or Gemini, with automatic failover to the other provider), then the static fallback.
9. Persist successful outbound messages.
10. Return a webhook response.

**Current reliability gap:** request processing is synchronous. Critical
database errors now fail the webhook so Meta can retry, and inbound message
dedupe is gated by the unique `wa_message_id`, but production should still move
event processing behind a durable worker.

## Agent-send flow

1. Authenticated dashboard posts a conversation UUID and text to `/api/messages/send`.
2. Server resolves the user's organization.
3. Service-role query verifies that the conversation belongs to that organization.
4. Graph API sends using the organization's credentials.
5. Outbound message is stored and the conversation enters `open` human mode.
6. Meta status webhooks update delivery state.

Ownership validation is present. Post-send database failures are surfaced as
recoverable `202` responses because WhatsApp may already have accepted the
message.

## Broadcast flow

The current route creates an idempotent campaign, enqueues up to 1,000 opted-in
tenant contacts as `broadcast_recipients`, claims queued recipient rows before
sending, and updates aggregate progress from recipient state. Processing is still
driven by dashboard `POST`/`PATCH` requests; the production target is to move
the same durable model behind a background worker with retries, cancellation,
and scheduled execution.

## Main source layout

```text
src/
├── app/
│   ├── (dashboard)/
│   │   ├── inbox/          # Realtime chat and handoff
│   │   ├── contacts/       # Search and tags
│   │   ├── auto-replies/   # Keyword-rule editor
│   │   ├── broadcasts/     # Campaign form/history
│   │   ├── analytics/      # Client-computed metrics
│   │   ├── knowledge/      # KB ingestion/list/delete
│   │   └── settings/       # Workspace, WhatsApp, AI toggle
│   ├── api/
│   │   ├── webhook/        # Meta verification/events
│   │   ├── messages/send/  # Manual reply
│   │   ├── broadcasts/     # Template fan-out
│   │   └── kb/             # PDF, URL, text ingestion
│   ├── auth/callback/      # Supabase code exchange
│   ├── login/              # Sign in/up (email + Google OAuth)
│   └── onboarding/         # Workspace creation
├── lib/
│   ├── ai.ts               # GLM/Gemini history+RAG reply, failover, daily quota
│   ├── platform.ts         # Single-operator platform guard
│   ├── bot.ts              # Reply decision tree
│   ├── kb.ts               # Chunking, embeddings, retrieval
│   ├── org.ts              # Tenant resolution
│   ├── whatsapp.ts         # Graph API helpers
│   └── supabase/           # Admin/server/browser clients
└── proxy.ts                # Session refresh and route guard
```

## Supabase client strategy

| Client | Credential | Use | RLS |
|---|---|---|---|
| Admin | service role | Webhook and trusted server routes | Bypassed |
| Server | anon + user cookies | Server components and auth checks | Enforced |
| Browser | anon + user session | Dashboard reads/writes | Enforced |

Never import the admin client into client components. Service-role operations must include explicit tenant ownership checks because RLS is bypassed.

## Security boundaries requiring continued testing

- Verify Meta signature failure, webhook retry, and duplicate-delivery behavior.
- Verify profile `org_id`/`role` and sensitive organization columns cannot be
  changed directly by browser clients.
- Confirm legacy WhatsApp tokens are re-saved after enabling encryption.
- Keep URL ingestion host allowlists tight for production tenants.
- Add rate limits, quotas, timeouts, durable jobs, monitoring, and audit logs.
