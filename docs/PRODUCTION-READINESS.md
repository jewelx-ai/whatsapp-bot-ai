# Production Readiness — CI/CD & Containerized Deployment Audit

> Snapshot date: 2026-08-10. This is the canonical **inspection report** for the
> CI/CD + Docker deployment workstream — it records exactly how the application
> works today, with citations, and the P0–P3 findings from that inspection. It
> does not replace [13-feature-readiness-audit.md](13-feature-readiness-audit.md)
> (the feature go/no-go doc) or [07-deployment.md](07-deployment.md) (deployment
> options); see those for broader product/release status. This doc is
> intentionally unnumbered — it's a cross-cutting workstream artifact, not a
> single subsystem doc (see the numbering rule in [README.md](README.md)).

## 1. Inspection report

| Dimension | Finding | Evidence |
|---|---|---|
| Language | TypeScript | `package.json`, `tsconfig.json` |
| Framework | Next.js 16.2.12, App Router, React 19 | `package.json` (`next: 16.2.12`); pinned by `tests/hardening.test.mjs:15-23` |
| Runtime version | Node 22 | `Dockerfile:5,10,22` (`FROM node:22-alpine`); no `.nvmrc`/`engines` field for non-Docker environments — see finding P3-1 |
| Package manager | npm | `package-lock.json`, `npm ci` in `Dockerfile:8` |
| Entry point | Next.js standalone server | `Dockerfile:34` (`CMD ["node", "server.js"]`), produced by `output: "standalone"` in `next.config.ts` |
| Build command | `npm run build` (`next build`) | `package.json` |
| Start command | `node server.js` (Docker) / `npm run start` (non-Docker) | `Dockerfile:34`, `package.json` |
| Test command | `npm test` (`node --test tests/*.test.mjs`) | `package.json`; single narrow regression suite, `tests/hardening.test.mjs`, 12 assertions |
| Lint/typecheck | `npm run lint` (eslint), `npm run typecheck` (`tsc --noEmit`) | `package.json` |
| Port | 3000 | `Dockerfile:31-33`, `docker-compose.yml` |
| Health check | `GET /api/health` → `{"status":"UP"}` | `src/app/api/health/route.ts` (added by this workstream; none existed before) |
| Database | Supabase Postgres — external/hosted, RLS multi-tenant | `src/lib/supabase/{admin,client,server}.ts`, `supabase/migrations/` (11 files), `supabase/schema.sql` |
| Redis / cache | None — not used, not needed | No Redis/ioredis/BullMQ dependency in `package.json` |
| Background jobs | DB-backed durable broadcast queue, no external queue | `broadcast_recipients` table; `src/lib/broadcasts.ts`; worker at `POST /api/worker/broadcasts`, bearer-protected by `CRON_SECRET` (`src/app/api/worker/broadcasts/route.ts`); triggered by Vercel Cron on Vercel (`vercel.json`) — needs a host cron/systemd timer for non-Vercel deployments, see [DEPLOYMENT.md](DEPLOYMENT.md) |
| Session/local-fs storage | None required | No WhatsApp Web/QR session store — pure Cloud API webhook architecture; no `.wwebjs_auth`/session directories exist |
| Webhooks | `GET /api/webhook` (Meta verification handshake), `POST /api/webhook` (inbound messages/status, HMAC-SHA256 signature verified, fails closed) | `src/app/api/webhook/route.ts` |
| Message idempotency | Unique constraint on `messages.wa_message_id`; duplicate delivery hits Postgres `23505` and is skipped, no duplicate AI call/reply/DB row | `src/app/api/webhook/route.ts` (comment: "the idempotency gate"), `supabase/schema.sql:61` |
| AI provider(s) | GLM (Z.ai, default) / Gemini / OpenRouter via `AI_PROVIDER`, automatic cross-provider failover; Voyage AI for RAG embeddings (optional, FTS fallback) | `src/lib/ai.ts`, `src/lib/kb.ts` |
| WhatsApp provider | Meta WhatsApp Cloud API, Graph API v21.0 (hardcoded), multi-tenant per-org phone_number_id + AES-256-GCM-encrypted access token | `src/lib/whatsapp.ts:4`, `src/lib/secrets.ts`, `src/lib/org.ts` |
| Auth model | Supabase Auth, cookie-session (`@supabase/ssr`); tenant login at `/login`, separate platform super-admin portal at `/admin` gated by `PLATFORM_SUPER_ADMIN_EMAIL`; route protection in `src/proxy.ts` (matcher covers only dashboard/admin/login paths, **not** `/api/*`) | `src/proxy.ts`, `src/lib/platform.ts` |
| Required env vars | 21 app-relevant variables (full list below) | grep of `process.env.*` across `src/`; enumerated in `.env.local.example` |
| Secrets committed accidentally | **None found** — clean | No `.env*` files tracked by git (`git ls-files`, `git status` both confirm); no hardcoded API keys/tokens/secrets found in source (pattern search across all `.ts`/`.tsx`/`.js`/`.mjs`) |
| Production assumptions | Supabase project pre-provisioned externally; Meta WABA/app pre-configured; DNS for `bot.jewelxtech.com` points at the deployment host; `.env.local` provisioned manually on the server, never via CI | See [DEPLOYMENT.md](DEPLOYMENT.md) |

### Environment variables (names only — see `.env.local.example` for the authoritative, grouped list)

`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `ALLOW_UNSIGNED_WEBHOOKS`, `AI_PROVIDER`, `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_MODEL`, `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `GEMINI_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, `VOYAGE_API_KEY`, `KB_INGEST_ALLOWED_HOSTS`, `CRON_SECRET`, `PLATFORM_SUPER_ADMIN_EMAIL`.

## 2. Risk register

| ID | Severity | Finding | Status |
|---|---|---|---|
| P1-1 | P1 | No CI pipeline existed — `lint`/`typecheck`/`test`/`build` were only run manually | **Resolved** by `.github/workflows/ci.yml` (this workstream) |
| P1-2 | P1 | `.env.local.example` referenced by README/`.dockerignore`/tests did not exist, causing `npm test` to fail (11/12) | **Resolved** — file created, `.gitignore` updated, 12/12 tests now pass |
| P1-3 | P1 | Docker image build was self-flagged as "unverified" in `docs/07-deployment.md` | **Resolved** — verified via `docker build` (see §4) and gated in CI going forward |
| P1-4 | P1 | No health check endpoint | **Resolved** — `GET /api/health`, wired into `Dockerfile` `HEALTHCHECK` and `docker-compose.yml` |
| P1-5 | P1 | Broadcast worker cron (`vercel.json`) has no equivalent trigger for a non-Vercel/Docker deployment | **Documented** in [DEPLOYMENT.md](DEPLOYMENT.md) as a manual host-cron setup step; not automated in-repo per the task's "document, don't build automation" instruction |
| P2-1 | P2 | No structured/redacting logger — plain `console.*` throughout. Current call sites do not leak secrets (verified by direct review), but there is no systemic guarantee against a future accidental leak (e.g. logging a raw provider error object) | Documented, not code-changed — see rationale below |
| P3-1 | P3 | No `.nvmrc`/`engines` field pinning Node version outside `Dockerfile` | Documented; low risk since CI and Docker both pin Node 22 explicitly |
| P3-2 | P3 | `/api/health/ready` (DB-dependent readiness probe) does not exist | Deferred — no current deployment step requires it, and a DB probe risks false-negative container restarts on transient Supabase blips |

**P2-1 rationale for not changing code**: the prior audit reviewed every `console.*` call site in `src/` and found no actual token/secret/full-message leakage — errors are logged as status codes or `Error` objects, not raw headers. Retrofitting a redaction layer across the codebase is disproportionate to this workstream's scope ("harden without rewriting"). If/when a structured logger is introduced, it should redact values matching `*_API_KEY`, `*_TOKEN`, `WHATSAPP_APP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` before any sink write.

## 3. Related docs

- [07-deployment.md](07-deployment.md) — Vercel vs. Docker deployment options, environment model, pre-production checklist (Docker-unverified note now superseded — see below)
- [DEPLOYMENT.md](DEPLOYMENT.md) — step-by-step server setup, CI/CD flow, DNS/SSL, rollback (this workstream)
- [17-token-encryption.md](17-token-encryption.md) — WhatsApp token encryption details
- [13-feature-readiness-audit.md](13-feature-readiness-audit.md) — product feature go/no-go
- [19-hardening-fixes.md](19-hardening-fixes.md) — prior security hardening history

## 4. Verification performed

See [DEPLOYMENT.md](DEPLOYMENT.md#verification) for the exact commands run and their output as part of this workstream (lint/typecheck/test/build, Docker build, container boot, health check). Real WhatsApp/AI/Supabase provider calls were **not** exercised — only process boot and the health route were verified, using placeholder credentials.
