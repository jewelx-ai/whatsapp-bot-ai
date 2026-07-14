# WhatsApp Bot — Next.js + Supabase

WhatsApp bot with keyword auto-replies, message storage, and human handoff, built on the **Meta WhatsApp Cloud API**.

## Stack

- **Next.js 16** (App Router, TypeScript) — frontend + API routes (webhook, send API)
- **Supabase** — Postgres (contacts/conversations/messages), Auth, Realtime
- **Meta WhatsApp Cloud API** — official WhatsApp messaging

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy your **Project URL**, **anon key**, and **service_role key** from Project Settings → API.

### 2. Meta WhatsApp Cloud API

1. Go to [developers.facebook.com](https://developers.facebook.com) → **Create App** → type **Business**.
2. Add the **WhatsApp** product. You get a free **test number** + temporary token.
3. Copy the **Phone number ID** and generate a **permanent access token** (System User in Business Settings).
4. Copy the **App Secret** (App Settings → Basic).
5. Add your own phone as a test recipient (max 5 on the test number).

### 3. Environment

```bash
cp .env.local.example .env.local
# fill in all values
```

### 4. Run

```bash
npm run dev
```

### 5. Connect the webhook

Meta needs a public HTTPS URL:

- **Local dev:** `npx ngrok http 3000` → use `https://xxx.ngrok.io/api/webhook`
- **Production:** deploy to Vercel → `https://yourapp.vercel.app/api/webhook`

In Meta dashboard → WhatsApp → **Configuration**:

1. Callback URL: your webhook URL
2. Verify token: the same value as `WHATSAPP_VERIFY_TOKEN`
3. Click **Verify and save**
4. Subscribe to the **messages** webhook field

### 6. Test

Send **hi** to your WhatsApp test number → the bot replies with the menu. Try **price** and **help** (help hands the conversation to a human — the bot stops replying).

## How it works

```
WhatsApp user → Meta Cloud API → POST /api/webhook
  → verify HMAC signature → dedupe → upsert contact
  → find/create conversation → store message
  → keyword auto-reply (skipped if a human took over)

Dashboard agent → POST /api/messages/send (Supabase Auth required)
  → sends via Graph API → stores message → conversation becomes "open"
```

Auto-reply rules live in the `auto_replies` table — add rows to add keywords (match types: `exact`, `contains`, `starts_with`).

## Key files

| File | Purpose |
|---|---|
| `src/app/api/webhook/route.ts` | Meta webhook: verification (GET) + incoming messages/statuses (POST) |
| `src/app/api/messages/send/route.ts` | Manual agent reply (auth required) |
| `src/lib/bot.ts` | Keyword auto-reply engine + human handoff |
| `src/lib/whatsapp.ts` | Graph API send helpers (text, template, mark-as-read) |
| `src/lib/supabase/*` | Supabase clients (admin / server / browser) |
| `supabase/schema.sql` | Full database schema + RLS + seed auto-replies |

## Gotchas

- **24-hour window:** free-form text replies only work within 24h of the user's last message; outside it use `sendTemplate()` with a pre-approved template.
- Webhook always returns 200 even on processing errors — Meta retries non-200 responses and would duplicate messages.
- `SUPABASE_SERVICE_ROLE_KEY` and `WHATSAPP_TOKEN` are server-only. Never expose them to the client.

## Status

All three build phases are complete — see [docs/](docs/README.md) for full documentation.

- [x] Dashboard: login, live inbox (Supabase Realtime), manual replies
- [x] Contacts management + tags
- [x] Auto-reply rule builder UI
- [x] Broadcast template campaigns
- [x] Analytics (stat tiles + 14-day chart)
- [x] AI replies (Claude API) with human escalation

Remaining (optional, not yet built): CSV contact import, `/settings` page, per-role RLS tightening, scheduled broadcasts.
