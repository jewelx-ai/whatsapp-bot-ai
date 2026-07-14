# 01 — Project Plan

## Goal

A WhatsApp bot platform: automatic keyword replies, full message history, human agent handoff, and (later) a live dashboard, broadcasts, and AI replies.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + Backend | Next.js 16 (App Router, TypeScript) | One codebase; route handlers are the backend (webhook receiver, send API) |
| Database + Auth + Storage | Supabase (Postgres, Auth, Realtime) | Auth for dashboard login, Postgres for data, Realtime for live inbox |
| WhatsApp connection | Meta WhatsApp Cloud API (official) | Free tier, webhook-based, no ban risk (unlike Baileys), fits serverless |
| Styling | Tailwind CSS | Fast UI building |
| Validation | Zod | Validate webhook payloads and API bodies |
| Hosting | Vercel | Native Next.js, HTTPS webhooks out of the box |

## Build Phases

### ✅ Phase 0 — Setup (DONE)
- Next.js scaffolded with TypeScript + Tailwind
- Supabase + Zod installed
- Env var structure defined (`.env.local.example`)

### ✅ Phase 1 — Core bot (DONE)
- Webhook route: Meta verification + incoming messages + signature check
- Message storage with dedupe in Supabase
- Send helpers (text, template, mark-as-read)
- Keyword auto-replies from the `auto_replies` table
- Human handoff ("help" → conversation status `open`, bot goes silent)
- Manual agent reply API (auth-protected)

### ✅ Phase 2 — Dashboard (DONE)
- `/login` — Supabase Auth (sign in + sign up)
- `/inbox` — conversation list + live chat window (Supabase Realtime), manual replies, bot/human/closed handoff
- `/contacts` — list, search, inline tag management
- `/auto-replies` — full rule builder UI (create/edit/toggle/delete)
- Middleware auth guard on all dashboard routes
- Deferred to later: CSV import, `/settings` page

### ✅ Phase 3 — Growth (DONE)
- Broadcast template campaigns (`/broadcasts` + API) with sent/failed stats, audience by tag
- Analytics (`/analytics`): stat tiles + 14-day messages-per-day chart
- AI replies via Claude API (`claude-opus-4-8`) with `[HANDOFF]` human escalation — opt-in via env vars

## Key Constraints (Meta platform rules)

- **24-hour window**: free-form replies only within 24h of the user's last message; outside it, pre-approved templates only.
- **Webhook must answer fast** (<10s) and return 200 even on internal errors, or Meta retries and duplicates messages.
- Test number supports max **5 verified recipients**; production needs a real business number + business verification.
