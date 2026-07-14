# 09 — Dashboard (Phase 2)

The agent-facing web app. All routes require login (Supabase Auth); unauthenticated visits redirect to `/login`.

## Pages

### `/login`
- Email + password **sign in** and **sign up** (toggle on the page).
- Sign up captures full name → the DB trigger auto-creates a `profiles` row.
- If Supabase email confirmation is on, signup shows a "check your email" notice.
- Already-logged-in users visiting `/login` are redirected to `/inbox`.

### `/inbox` — live chat
Two-pane layout:
- **Left:** conversations sorted by `last_message_at`, showing contact name/phone + status badge (`bot` / `open` / `closed`).
- **Right:** the selected thread — incoming messages left (grey), outgoing right (green) with delivery status (`sent`/`delivered`/`read`).

**Realtime:** subscribes to Postgres changes — new `messages` rows append instantly to the open thread; any `conversations` change refreshes the list. No polling.

**Reply box:** sends via `POST /api/messages/send` (Enter key or button). Sending flips the conversation to `open` (human mode — bot goes silent).

**Status buttons** in the thread header hand control back and forth:
- 🤖 **bot** — auto-replies resume
- 👤 **human** — agent owns it, bot silent
- ✓ **closed** — done; next incoming message starts a fresh conversation

### `/auto-replies` — rule builder
Create / edit / enable / disable / delete keyword rules without SQL. Fields: keyword, match type (`contains` / `exact` / `starts with`), response text. Changes take effect on the next incoming message (no deploy needed).

### `/contacts`
Table of everyone who has messaged the bot: name, phone, tags, last seen. Search across all three. Add a tag inline (type + Enter) or remove with ×. Tags will drive broadcast audiences in Phase 3.

## Auth & security implementation

| Piece | File | Role |
|---|---|---|
| Middleware | `src/middleware.ts` | Refreshes the session cookie on every request; redirects logged-out users off `/inbox`, `/contacts`, `/auto-replies`; bounces logged-in users off `/login` |
| Server guard | `src/app/(dashboard)/layout.tsx` | Second check via `supabase.auth.getUser()` — renders sidebar + user email |
| Data access | browser Supabase client | Pages read/write directly with the **anon key** — RLS `authenticated` policies enforce access |
| Sending | `/api/messages/send` | Only WhatsApp sends go through the server (needs the secret `WHATSAPP_TOKEN`) |

## File map

```
src/
├── middleware.ts                     ← session refresh + route guard
├── lib/types.ts                      ← shared row types
└── app/
    ├── login/page.tsx                ← sign in / sign up
    └── (dashboard)/
        ├── layout.tsx                ← auth check + sidebar shell
        ├── nav.tsx                   ← nav links + sign out (client)
        ├── inbox/page.tsx            ← realtime chat
        ├── auto-replies/page.tsx     ← rule builder
        └── contacts/page.tsx         ← contact table + tags
```

## Requirements to use it

1. Supabase project created and `supabase/schema.sql` run (realtime publication included).
2. `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
3. Sign up on `/login` to create the first agent account.
   - Tip: in Supabase → Authentication → Providers → Email, you can disable "Confirm email" during development for instant login.
