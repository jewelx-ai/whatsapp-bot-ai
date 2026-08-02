# 07 — Deployment (Vercel or Docker)

> **Production warning (updated 2026-07-25):** the security blockers from the
> 2026-07-21 audit are fixed and build/typecheck/lint pass, but do **not** deploy
> publicly yet: there is no Stripe/billing automation, the broadcast worker needs
> production scheduler/live soak testing, and the Docker image remains unverified.
> Sandbox use is fine.

## Environment model

Platform deployment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET` for `/api/worker/*` endpoints
- `AI_PROVIDER` (`glm` default, `gemini`, or `openrouter`) to pick the primary AI model
- `ZAI_API_KEY` when AI is offered, plus optional `ZAI_MODEL`
- `GEMINI_API_KEY` when Gemini is used as primary or as the failover provider
- `OPENROUTER_API_KEY` when OpenRouter is used as primary or as a failover provider
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `..._SECRET` only if enabling
  Google sign-in via `supabase config push` rather than the dashboard
- `PLATFORM_SUPER_ADMIN_EMAIL` for the platform operator portal
- `VOYAGE_API_KEY` optionally

`WHATSAPP_APP_SECRET` is mandatory in production: webhook verification fails
closed without it. Never set `ALLOW_UNSIGNED_WEBHOOKS` outside local development.
`WHATSAPP_TOKEN_ENCRYPTION_KEY` must be the same 32-byte key across all runtime
instances; losing or changing it without a migration path makes encrypted tenant
tokens unreadable.

Tenant WhatsApp Phone Number IDs and access tokens are entered per workspace in
Settings. New token saves are encrypted in the database; existing plaintext rows
should be re-saved after configuring `WHATSAPP_TOKEN_ENCRYPTION_KEY`.

## Option A — Docker

The image uses Next.js standalone output and a non-root runtime user.

`NEXT_PUBLIC_*` values are needed at build time. Compose `env_file` supplies runtime container variables but does not supply `${...}` interpolation for build arguments. Use:

```bash
docker compose --env-file .env.local up -d --build
```

Or export the two public values before `docker compose build`.

After launch, place an HTTPS reverse proxy in front of port 3000. Rebuild after changing public variables; restart after changing runtime-only secrets.

The Docker CLI was unavailable during the 2026-07-21 audit, so image build, non-root execution, networking, and signal behavior remain unverified.

## Option B — Vercel

1. Push tracked source and migrations to a private/controlled repository.
2. Import the project into Vercel.
3. Configure the platform environment variables for Production and intended Preview environments.
4. Deploy and record the HTTPS URL.
5. Register `https://<host>/api/webhook` in Meta and subscribe to `messages`.
6. `vercel.json` registers a daily Vercel Cron job for
   `/api/worker/broadcasts`, which is the maximum frequency available on Hobby
   accounts. Use Vercel Pro or an external scheduler for frequent broadcast
   processing. Keep `CRON_SECRET` configured so Vercel sends the
   `Authorization: Bearer <CRON_SECRET>` header.

Do not place tenant access tokens in Vercel variables under the current architecture.

## Database deployment

Before application deployment:

1. Use the tracked migration chain as the canonical schema source.
2. Run `supabase db reset` locally or `supabase db push` on the linked hosted project.
3. Run a fresh reset/deploy against a disposable Supabase project.
4. Verify RLS, functions, trigger, pgvector, indexes, and Realtime publication.
5. Run adversarial tenant-isolation tests.

The Supabase seed reference is disabled because the project currently has no
seed file. Validate a clean migration reset before CI/deployment.

## Required pre-production checks

- [ ] Critical profile/org authorization issue fixed and tested.
- [ ] WhatsApp tokens removed from browser reads and protected at rest.
- [ ] URL-ingestion SSRF fixed.
- [ ] Webhook durably accepts events and processes idempotently.
- [x] Broadcasts use durable recipient rows and idempotency.
- [x] Broadcast worker endpoint exists.
- [x] Consent/opt-out behavior implemented.
- [x] Analytics uses server-side aggregates.
- [x] Operator-managed plan quotas enforced for AI, broadcasts, and KB ingestion.
- [ ] Stripe/billing automation, per-minute rate limits, provider timeouts, retries, monitoring, and alerts configured.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [x] Baseline automated hardening tests pass.
- [ ] Automated tenant/webhook/bot/API/KB integration tests pass.
- [ ] Fresh database migration succeeds.
- [ ] Docker or Vercel smoke test succeeds.
- [ ] Sandbox Meta/Supabase/Z.ai/Voyage matrix passes.

## Runtime considerations

- Keep webhook request work short, but acknowledge only after durable idempotent acceptance.
- Broadcast processing can run through `/api/worker/broadcasts`; production
  should configure a scheduler and monitor queue lag before large public
  workloads.
- KB PDF/text/URL routes declare a 120-second duration, which must be supported by the selected plan/runtime.
- Add structured logs with request/event/campaign IDs without logging access tokens or message content unnecessarily.
- Configure health, error-rate, queue-lag, provider-failure, and spend alerts.
- Use a permanent Meta token with minimum required permissions and a documented rotation process.

## Rollback and incident readiness

Before production, document database migration rollback/forward-fix strategy, token revocation, webhook disablement, campaign cancellation, tenant notification, and recovery from partially processed events.
