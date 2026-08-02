# 📚 Project Documentation — WhatsApp Bot

Documentation index for the WhatsApp automation SaaS built with **Next.js + Supabase + Meta WhatsApp Cloud API**.

> **Current status (2026-07-31): not production-ready, but the main security and
> correctness blockers are closed.** Fixed since the baseline audit: the critical
> tenant-isolation defect, the webhook signature bypass, URL-ingestion SSRF,
> webhook replay handling, the auto-reply `org_id` defect, and lint (build,
> typecheck, and lint now all pass). Added: a cross-tenant operator portal,
> Google sign-in, `.docx` ingestion, AI provider failover, and grounded
> multilingual replies. A full WhatsApp round trip is confirmed live.
>
> **Remaining blockers:** no Stripe/billing automation, the broadcast worker
> still needs production scheduler/live soak testing, and the Docker *image*
> build is unverified. Dependency audit and baseline hardening tests now pass.
> Plan limits are enforced for AI,
> broadcasts, and KB ingestion. New WhatsApp token saves are encrypted;
> legacy plaintext rows need re-saving after `WHATSAPP_TOKEN_ENCRYPTION_KEY` is
> configured. See
> [08-changelog.md](08-changelog.md) for what changed;
> [13-feature-readiness-audit.md](13-feature-readiness-audit.md) is the
> 2026-07-21 snapshot and is superseded where they disagree.

| Doc | What's inside |
|---|---|
| [01-project-plan.md](01-project-plan.md) | Product scope, implemented phases, open release work |
| [02-architecture.md](02-architecture.md) | Current multi-tenant architecture and reliability boundaries |
| [03-database.md](03-database.md) | Tenant/KB tables, indexes, RLS, migrations, known policy issue |
| [04-api-reference.md](04-api-reference.md) | Every API endpoint, auth, behavior, and current limitations |
| [05-bot-logic.md](05-bot-logic.md) | Keyword/AI/RAG decisions, GLM↔Gemini failover, language mirroring, human handoff |
| [06-setup-guide.md](06-setup-guide.md) | Current per-platform and per-tenant sandbox setup, including Google sign-in |
| [07-deployment.md](07-deployment.md) | Vercel/Docker configuration and pre-production gates |
| [08-changelog.md](08-changelog.md) | Dated implementation and audit history |
| [09-dashboard.md](09-dashboard.md) | Auth, inbox, rules, contacts, settings, and known defects |
| [10-phase3-growth.md](10-phase3-growth.md) | Broadcasts, analytics, GLM, and scale limitations |
| [11-multitenancy-saas.md](11-multitenancy-saas.md) | Organizations, credentials, RLS intent, and authorization gaps |
| [12-knowledge-base-rag.md](12-knowledge-base-rag.md) | PDF/`.docx`/URL/text ingestion, staged retrieval, and SSRF guard |
| [13-feature-readiness-audit.md](13-feature-readiness-audit.md) | Canonical go/no-go verdict, feature matrix, blockers, and exit criteria |
| [14-platform-admin.md](14-platform-admin.md) | Cross-tenant operator portal: separate login, single super admin, workspace/user management, suspension |
| [15-flowcharts.md](15-flowcharts.md) | Mermaid diagrams: system overview, routing/authz, inbound message pipeline, bot decisions, RAG, outbound, lifecycles, data model, security layers |
| [16-manual-test-guide.md](16-manual-test-guide.md) | Step-by-step self-testing for every dashboard feature, with the local inbound simulator |
| [17-token-encryption.md](17-token-encryption.md) | WhatsApp token encryption, required env, migration, and rotation notes |
| [18-plan-enforcement.md](18-plan-enforcement.md) | Operator-managed plan limits for AI, broadcasts, and knowledge ingestion |
| [19-hardening-fixes.md](19-hardening-fixes.md) | Post-audit dependency, setup, proxy, URL ingestion, and webhook persistence fixes |

## Rule for this project

> **Every new feature, file, or change gets documented in this folder.**
> New endpoint → update `04-api-reference.md`. New table → update `03-database.md`. New feature → update `08-changelog.md`. New subsystem → new numbered doc.
