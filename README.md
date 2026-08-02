# WhatsApp Bot SaaS - Next.js + Supabase

Multi-tenant WhatsApp automation platform with keyword rules, a live inbox, human handoff, broadcasts, analytics, multilingual AI replies (GLM/Z.ai with Google Gemini failover), and a per-workspace knowledge base.

> **Production readiness (updated 2026-07-31): not yet, but the earlier blockers are closed.**
> Build, typecheck, lint, tests, and production dependency audit all pass. The 2026-07-23/25 work fixed tenant
> isolation, the webhook signature bypass, URL-ingestion SSRF, webhook replay
> handling, and the auto-reply `org_id` defect, and a full WhatsApp round trip has
> been confirmed live.
>
> **Still open before public launch:** there is no Stripe/billing automation,
> the broadcast worker needs production scheduler/live soak testing, and the
> Docker *image* build is unverified (the production standalone build itself
> passes). The [readiness audit](docs/13-feature-readiness-audit.md)
> is a 2026-07-21 snapshot; see [08-changelog.md](docs/08-changelog.md) for what
> has changed since.

## Stack

- **Next.js 16 / React 19** - App Router dashboard and route handlers
- **Supabase** - Postgres, Auth, RLS, Realtime, and pgvector
- **Meta WhatsApp Cloud API** - inbound webhooks and outbound messages
- **GLM (Z.ai) + Google Gemini** - optional AI replies with automatic provider failover and handoff
- **Voyage AI** - optional knowledge-base embeddings; PostgreSQL FTS is the fallback

## Implemented scope

- Email/password **and Google** authentication, callback handling, and workspace onboarding
- Per-workspace WhatsApp credentials and AI toggle
- Shared multi-tenant webhook routed by Meta Phone Number ID
- Contact/conversation/message persistence and delivery statuses
- Keyword rules, static fallback, human handoff, and manual replies
- Realtime inbox, contacts/tags, broadcasts, and analytics
- A separate operator portal for all administration (workspaces, users, roles, plans, suspension)
- PDF, Word `.docx`, URL, and pasted-text knowledge ingestion with RAG
- Vercel and standalone Docker configuration

"Implemented" means a code path exists; it does not mean the feature has passed live integration testing. See the audit for per-feature status.

## Quick start

### 1. Install

```bash
npm ci
cp .env.local.example .env.local
```

Fill the platform values in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`
- `ZAI_API_KEY` when AI replies are required
- `PLATFORM_SUPER_ADMIN_EMAIL` for the single platform operator account
- `VOYAGE_API_KEY` optionally for semantic RAG

WhatsApp Phone Number IDs and access tokens are **tenant settings**, not platform environment variables.

### 2. Create the database

Use the tracked migration chain as the canonical database setup:

```bash
supabase db reset
```

For a hosted project, link the project and push the same migrations:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

`supabase/schema.sql` is retained as a historical reference only; do not use it for a fresh production database.

### 3. Start locally

```bash
npm run dev
```

Then:

1. Sign up at `/login`.
2. Create a workspace at `/onboarding`.
3. Enter that workspace's WhatsApp Phone Number ID and permanent access token at `/settings`.
4. Register `https://<public-host>/api/webhook` in the shared Meta app and subscribe to `messages`.

### Two sign-ins

| Area | Path | Who |
|---|---|---|
| Workspace (tenant) | `/login` | Customers - customer features only, no admin screen |
| Platform operator | `/admin/login` | The single `PLATFORM_SUPER_ADMIN_EMAIL` account |

The operator manages every workspace at `/admin` - see
[docs/14-platform-admin.md](docs/14-platform-admin.md).

### 4. Validate

```bash
npm run lint
npm test
npm run build
```

Current state: build, typecheck, lint, baseline tests, and production dependency
audit pass.

## Important limitations

Fixed on 2026-07-23 (see [changelog](docs/08-changelog.md)): the tenant-hijack
profile policy, the webhook signature bypass, URL-ingestion SSRF, webhook
event loss and non-atomic dedupe, and token exposure to the browser.

Still open:

- WhatsApp access tokens are encrypted for new saves; legacy plaintext rows should be re-saved after configuring `WHATSAPP_TOKEN_ENCRYPTION_KEY`.
- Broadcasts have durable recipient rows, idempotency, and a cron-protected
  worker endpoint, but no cancellation UI, template preflight, or scheduling.
- Plans are enforced for AI, broadcasts, and KB ingestion, but there is no
  Stripe checkout or billing webhook.
- The baseline hardening test suite exists; broader integration and live-provider
  tests are still needed.

## Explicitly not built

- Stripe billing automation
- Team invitations and self-serve team management (the operator provisions accounts and roles)
- Role enforcement for tenant data access (roles gate credential writes only)
- Meta Embedded Signup
- Vault-backed WhatsApp credentials and encryption key rotation tooling
- CSV contact import
- Scheduled broadcast execution
- Full unit, integration, and end-to-end test coverage

## Key files

| File | Purpose |
|---|---|
| `src/app/api/webhook/route.ts` | Shared Meta webhook and tenant routing |
| `src/app/api/messages/send/route.ts` | Authenticated manual reply |
| `src/app/api/broadcasts/route.ts` | Template campaign dispatch |
| `src/app/admin/` | Operator portal at `/admin` (separate login at `/admin/login`) |
| `src/app/api/admin/` | Operator APIs: workspaces, users, session |
| `src/lib/platform.ts` | Single super-admin guard |
| `src/lib/bot.ts` | Keyword/AI decision flow and handoff |
| `src/lib/ai.ts` | GLM (Z.ai) response generation |
| `src/lib/kb.ts` | Knowledge ingestion and retrieval |
| `src/lib/org.ts` | Current-user and Phone Number ID tenant resolution |
| `supabase/migrations/` | Canonical database schema and upgrades |
| `docs/13-feature-readiness-audit.md` | Current go/no-go status and release criteria |

See the [documentation index](docs/README.md) for architecture, API, database, setup, and deployment details.
