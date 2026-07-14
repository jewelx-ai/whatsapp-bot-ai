# 08 — Changelog

All notable work on this project, newest first.

## 2026-07-14 — Phase 0 + Phase 1 complete (initial build)

### Added
- **Project scaffold**: Next.js 16 (App Router, TypeScript, Tailwind, src dir), deps: `@supabase/supabase-js`, `@supabase/ssr`, `zod`.
- **Database schema** (`supabase/schema.sql`): tables `contacts`, `conversations`, `messages`, `auto_replies`, `broadcasts`, `profiles`; indexes; RLS on all tables; realtime publication for `messages`/`conversations`; signup trigger auto-creating profiles; 4 seeded auto-replies (hi, hello, price, help).
- **Webhook** (`src/app/api/webhook/route.ts`):
  - GET — Meta verification handshake against `WHATSAPP_VERIFY_TOKEN`
  - POST — HMAC signature verification (timing-safe), message dedupe by `wa_message_id`, contact upsert, conversation find-or-create, message storage, mark-as-read, status updates (`delivered`/`read`/`failed`), always-200 error containment
- **Bot engine** (`src/lib/bot.ts`): keyword matching (exact / contains / starts_with, first match wins), fallback reply, human handoff on `help` (conversation → `open`, bot goes silent).
- **WhatsApp helpers** (`src/lib/whatsapp.ts`): `sendText`, `sendTemplate`, `markAsRead` against Graph API v21.0.
- **Send API** (`src/app/api/messages/send/route.ts`): auth-protected (Supabase session), Zod-validated manual agent reply; flips conversation to `open`.
- **Supabase clients** (`src/lib/supabase/`): `admin.ts` (service-role, server-only), `server.ts` (cookie-bound), `client.ts` (browser).
- **Status page** (`src/app/page.tsx`): shows which env var groups are configured.
- **Env template** (`.env.local.example`) + `.env.local` placeholder.
- **Docs folder** (`docs/`): plan, architecture, database, API reference, bot logic, setup guide, deployment, this changelog.

### Verified
- `npm run build` — compiles clean, no type errors.
- Live server test: webhook GET returns the challenge with the correct verify token, `403` with a wrong one.

### Commits
- `1ead395` WhatsApp bot: webhook, auto-replies, Supabase schema, send API
- `128eea3` Initial commit from Create Next App

---

## Upcoming (not yet built)
- Phase 2: dashboard (login, live inbox with Realtime, contacts, auto-reply builder)
- Phase 3: broadcasts, analytics, AI replies via Claude API
