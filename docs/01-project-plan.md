# 01 — Project Plan

> **Readiness update (2026-07-21):** The planned Phase 0–4 code paths are substantially implemented, but the product is **not production-ready**. See [13-feature-readiness-audit.md](13-feature-readiness-audit.md) for verified results and release blockers.

## Goal

Build a multi-tenant WhatsApp automation SaaS where businesses create a workspace, connect a WhatsApp number, manage deterministic and AI replies, collaborate through a live inbox, send consented template campaigns, and ground AI answers in business content.

Tenant isolation, durable messaging, secret protection, consent, and operational controls are release requirements—not optional follow-up work.

## Stack

| Layer | Choice |
|---|---|
| Web application and APIs | Next.js 16, React 19, TypeScript, App Router |
| Data/auth/realtime/vector search | Supabase Postgres, Auth, Realtime, pgvector |
| Messaging | Meta WhatsApp Cloud API |
| AI | GLM (Z.ai) |
| Optional embeddings | Voyage AI; PostgreSQL FTS fallback |
| Validation | Zod |
| Deployment | Vercel or standalone Docker |

## Delivery phases

### Phase 0 — Project setup: implemented

- Next.js, TypeScript, Tailwind, Supabase clients, Zod, and environment template
- Production build configuration and documentation structure

### Phase 1 — Core bot: implemented, hardening required

- Meta verification and signed webhook receiver
- Per-tenant routing, contact/conversation/message persistence, and status updates
- Keyword rules, fallback, human handoff, Graph API helpers, and manual send API

Open release work: durable/idempotent webhook processing, atomic dedupe, strict signature configuration, complete error handling, timeouts, and integration tests.

### Phase 2 — Dashboard: implemented, defects remain

- Authentication, callback, onboarding, dashboard guard, and settings
- Realtime inbox, manual replies, status control, contacts, tags, and rule editor

Open release work: role permissions, consent-evidence history, and any remaining
safe credential-management hardening such as key rotation.

### Phase 3 — Growth: implemented, not scale-ready

- Template broadcasts by tag
- Client analytics
- Per-workspace GLM fallback and handoff

Open release work: background campaign workers, cancellation/retry policy,
per-minute rate limits, Stripe/billing automation, and spend controls.

### Phase 4 — Knowledge base and deployment: implemented, security work required

- PDF, URL, and pasted-text ingestion
- Chunking, optional Voyage embeddings, pgvector retrieval, FTS fallback, and GLM prompt integration
- Knowledge management UI and Docker/Vercel configuration

Open release work: SSRF-safe URL fetching, ingestion quotas, representative retrieval tests, fresh migration validation, and Docker smoke testing.

## Explicitly deferred scope

- Stripe checkout and billing webhooks
- Team invitations and membership administration
- Owner/admin/agent authorization
- Meta Embedded Signup
- Vault-backed tenant tokens and encryption key rotation tooling
- CSV contact import
- Independent background job infrastructure and scheduled broadcasts
- Automated test suite

## Platform constraints

- Free-form WhatsApp replies are limited to the customer-service window; approved templates are required outside it.
- Webhooks should respond quickly, but must only acknowledge after the event is durably accepted. Returning 200 after failed processing causes data loss.
- Meta retries must be safe through atomic idempotency rather than being suppressed.
- Test-number recipient and production messaging limits are controlled by Meta.
- Platform AI/embedding keys require quotas, rate limits, monitoring, and cost controls.

## Production definition of done

The product is done only when the exit criteria in the [feature readiness audit](13-feature-readiness-audit.md#production-exit-criteria) are met and a repeat audit changes the verdict to GO.
