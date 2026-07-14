# 02 — Architecture

## System Overview

```
WhatsApp user ⇄ Meta Cloud API
                    │ webhook (POST, HMAC-signed)
                    ▼
Next.js  /api/webhook ──► bot logic (keyword auto-replies, handoff)
                    │              │
                    ▼              ▼
              Supabase        Meta Graph API
        (contacts, convos,    (send replies)
            messages)
                    ▲
                    │ Realtime subscription (Phase 2)
        Dashboard (Supabase Auth login, live inbox,
        manual replies via /api/messages/send)
```

## Incoming Message Flow

1. User texts the WhatsApp number → Meta POSTs to `/api/webhook`.
2. Route verifies the `X-Hub-Signature-256` HMAC against `WHATSAPP_APP_SECRET`.
3. **Dedupe** — skip if `wa_message_id` already stored (Meta redelivers).
4. **Upsert contact** by phone number, update `last_seen_at`.
5. **Find or create conversation** (latest non-closed one for the contact).
6. **Store message** (`direction: 'in'`).
7. Mark as read (blue ticks).
8. **Run bot** — unless conversation status is `open` (human took over).
9. Always return 200 (errors are logged, never propagated to Meta).

## Outgoing Message Flow (agent)

1. Dashboard calls `POST /api/messages/send` (must be logged in via Supabase Auth).
2. Zod validates body → look up conversation's contact phone.
3. Send via Graph API → store message (`direction: 'out'`, `status: 'sent'`).
4. Conversation status → `open` (bot stays silent from now on).
5. Later, Meta posts `statuses` webhooks → message status updated to `delivered` / `read`.

## Folder Structure

```
wtsapp-bot/
├── docs/                       ← all project documentation (this folder)
├── supabase/
│   └── schema.sql              ← full DB schema, run in Supabase SQL Editor
├── src/
│   ├── app/
│   │   ├── page.tsx            ← status page (env var checklist)
│   │   └── api/
│   │       ├── webhook/route.ts        ← Meta webhook (GET verify, POST receive)
│   │       └── messages/send/route.ts  ← manual agent reply
│   └── lib/
│       ├── bot.ts              ← auto-reply engine + human handoff
│       ├── whatsapp.ts         ← Graph API helpers (sendText, sendTemplate, markAsRead)
│       └── supabase/
│           ├── admin.ts        ← service-role client (server-only, bypasses RLS)
│           ├── server.ts       ← cookie-bound client (reads logged-in user)
│           └── client.ts       ← browser client (dashboard, RLS enforced)
├── .env.local.example          ← env var template
└── README.md                   ← quickstart
```

## Supabase Client Strategy

| Client | File | Key | Where | RLS |
|---|---|---|---|---|
| Admin | `lib/supabase/admin.ts` | service_role | Webhook + API routes only | Bypassed |
| Server | `lib/supabase/server.ts` | anon + cookies | Route handlers / server components (auth checks) | Enforced |
| Browser | `lib/supabase/client.ts` | anon | Client components (dashboard) | Enforced |

**Rule:** `admin.ts` must never be imported into a client component.

## Security

- Webhook HMAC signature verified with timing-safe comparison (skipped only if `WHATSAPP_APP_SECRET` unset, for local dev).
- `SUPABASE_SERVICE_ROLE_KEY` and `WHATSAPP_TOKEN` are server-only env vars.
- `/api/messages/send` requires an authenticated Supabase session.
- RLS enabled on every table; dashboard users get access via `authenticated` policies.
