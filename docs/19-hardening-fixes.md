# 19 — Hardening Fixes

Updates made after the client/SaaS audit:

- Upgraded Next.js packages from `16.2.10` to `16.2.12`.
- Added scoped dependency overrides for Next's transitive `postcss` and `sharp`
  packages so `npm audit --omit=dev` passes without downgrading Next.js.
- Migrated the auth guard from deprecated `src/middleware.ts` to `src/proxy.ts`.
- Made Supabase migrations the documented database source of truth.
- Disabled the missing Supabase seed file reference in `supabase/config.toml`.
- Added optional `KB_INGEST_ALLOWED_HOSTS` website-ingestion allowlisting.
- Rejected non-HTML/text URL-ingestion responses before reading the body.
- Made manual outbound message persistence errors visible to the dashboard.
- Made webhook contact, conversation, consent-reply, and status-update database
  errors fail the webhook request so Meta can retry instead of silently dropping
  data.
- Added `POST /api/worker/broadcasts`, protected by `CRON_SECRET`, for
  independent broadcast queue processing.
- Added baseline hardening tests runnable with `npm test`.
- Added an analytics fallback and Supabase RPC signature-fix migration for
  `dashboard_analytics(p_days, p_org_id)` schema-cache errors.

Open after this pass:

- Docker image build and runtime smoke test still need a Docker daemon.
- Broadcast worker scheduling and live soak testing still need deployment setup.
- Broader integration tests for tenant isolation, webhook retries, and live
  provider flows are still needed.
