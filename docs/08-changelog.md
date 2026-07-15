# 08 — Changelog

All notable work on this project, newest first.

## 2026-07-15 — Fixes

- Suppressed false-positive hydration warning on `<body>` (browser extensions inject attributes pre-hydration); scoped to the body element only.
- Replaced boilerplate "Create Next App" metadata with real title/description.
- Added `.claude/launch.json` for one-command dev preview.

## 2026-07-14 — Multi-tenant SaaS conversion

### Changed (breaking: schema v2 — re-run `supabase/schema.sql` on a fresh project)
- **Tenant model**: new `organizations` table (name, per-org `wa_phone_number_id` + `wa_access_token`, `ai_enabled`, `plan`/`plan_status`); `org_id` added to contacts, conversations, messages, auto_replies, broadcasts; contacts unique per `(org_id, wa_phone)`.
- **Tenant isolation**: RLS on every table scoped by `current_org_id()`; `create_organization()` RPC (creates org, makes caller owner, seeds default auto-replies per org).
- **Webhook** is now shared by all tenants — routes each event by `metadata.phone_number_id` → owning org; replies with that org's token; unknown numbers skipped.
- **Credentials**: WhatsApp token/phone-number-id moved from env vars into the org row (entered in `/settings`); platform env keeps only Supabase keys, Meta app secret, verify token, Anthropic key.
- **AI replies**: per-workspace toggle (`organizations.ai_enabled`) replacing the global `AI_REPLIES_ENABLED` env var.
- Send + broadcast APIs resolve the caller's org, verify resource ownership, and return `409` when WhatsApp isn't connected yet.

### Added
- `/onboarding` — create-your-workspace flow (dashboard redirects org-less users there).
- `/settings` — workspace name, WhatsApp connection (Phone Number ID + token, connected badge), AI replies toggle, plan display.
- `src/lib/org.ts` — tenant resolution helpers.
- Docs: new `11-multitenancy-saas.md`; index updated.

### Verified
- Clean build (13 routes); `/settings` + `/onboarding` guarded (307 → login); webhook GET handshake still works.

### Not yet built (SaaS roadmap)
- Stripe billing, team invites, Meta Embedded Signup, role-based permissions, token encryption at rest.

## 2026-07-14 — Phase 3 complete (broadcasts, analytics, AI replies)

### Added
- **Broadcasts**: `POST /api/broadcasts` (auth + Zod) sends a template message to all opted-in contacts or by tag (max 1000), records sent/failed in the `broadcasts` table; `/broadcasts` page with send form + history.
- **Analytics** (`/analytics`): stat tiles (contacts, conversations, waiting-on-human highlight, 14-day in/out counts) + stacked per-day bar chart, computed client-side via Supabase.
- **AI replies** (`src/lib/ai.ts`, wired into `src/lib/bot.ts`): when no keyword rule matches and `AI_REPLIES_ENABLED=true`, Claude (`claude-opus-4-8`, `@anthropic-ai/sdk`, effort low) answers from the last 20 messages with a WhatsApp-tuned system prompt; `[HANDOFF]` token escalates the conversation to human mode; any AI failure falls back to the static reply. Off by default.
- Nav + middleware guard extended with `/broadcasts` and `/analytics`; env template gains `AI_REPLIES_ENABLED` + `ANTHROPIC_API_KEY`.
- **Docs**: new `10-phase3-growth.md`; API reference, bot logic, plan, and index updated.

### Verified
- `npm run build` — clean; all 6 dashboard routes + 3 API routes compile.
- Live server test: `/broadcasts` and `/analytics` redirect (307) to `/login` when logged out; `POST /api/broadcasts` without a session returns `401 {"error":"Unauthorized"}`.

## 2026-07-14 — Phase 2 complete (dashboard)

### Added
- **Login page** (`src/app/login/page.tsx`): email/password sign in + sign up with full name; handles email-confirmation flows.
- **Middleware** (`src/middleware.ts`): Supabase session refresh + auth guard — logged-out users redirected off `/inbox`, `/contacts`, `/auto-replies`; logged-in users bounced off `/login`.
- **Dashboard shell** (`src/app/(dashboard)/layout.tsx`, `nav.tsx`): server-side auth check, sidebar nav, sign out.
- **Inbox** (`src/app/(dashboard)/inbox/page.tsx`): conversation list sorted by activity with status badges; chat window with in/out bubbles + delivery status; **Supabase Realtime** subscriptions (new messages append live, conversation list auto-refreshes); reply box posting to `/api/messages/send`; bot/human/closed status switcher for handoff control.
- **Auto-replies UI** (`src/app/(dashboard)/auto-replies/page.tsx`): create, edit, enable/disable, delete keyword rules — replaces SQL editing.
- **Contacts** (`src/app/(dashboard)/contacts/page.tsx`): searchable table, inline tag add/remove.
- **Shared types** (`src/lib/types.ts`) and an "Open dashboard" link on the home status page.
- **Docs**: new `09-dashboard.md`; plan + index updated.

### Verified
- `npm run build` — clean, all routes compile (`/login` static; `/inbox`, `/contacts`, `/auto-replies` dynamic; middleware active).
- Live server test: `GET /inbox` while logged out → `307` redirect to `/login`; `/login` renders `200`.

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
- Phase 3: broadcasts, analytics, AI replies via Claude API
- Deferred from Phase 2: CSV contact import, `/settings` page
