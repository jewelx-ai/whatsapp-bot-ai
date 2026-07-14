# 📚 Project Documentation — WhatsApp Bot

Documentation index for the WhatsApp bot built with **Next.js + Supabase + Meta WhatsApp Cloud API**.

| Doc | What's inside |
|---|---|
| [01-project-plan.md](01-project-plan.md) | Full project plan: stack, phases, features, timeline |
| [02-architecture.md](02-architecture.md) | System architecture, message flow, folder structure |
| [03-database.md](03-database.md) | All tables, columns, indexes, RLS policies, seed data |
| [04-api-reference.md](04-api-reference.md) | Every API endpoint: request/response, auth, errors |
| [05-bot-logic.md](05-bot-logic.md) | How auto-replies work, matching rules, human handoff |
| [06-setup-guide.md](06-setup-guide.md) | Step-by-step setup: Supabase, Meta, env vars, webhook |
| [07-deployment.md](07-deployment.md) | Deploying to Vercel, production checklist |
| [08-changelog.md](08-changelog.md) | Everything built, dated, phase by phase |
| [09-dashboard.md](09-dashboard.md) | Dashboard: login, live inbox, auto-reply builder, contacts |
| [10-phase3-growth.md](10-phase3-growth.md) | Broadcasts, analytics, AI replies via Claude |
| [11-multitenancy-saas.md](11-multitenancy-saas.md) | Multi-tenant SaaS: orgs, RLS isolation, webhook routing, onboarding |

## Rule for this project

> **Every new feature, file, or change gets documented in this folder.**
> New endpoint → update `04-api-reference.md`. New table → update `03-database.md`. New feature → update `08-changelog.md`. New subsystem → new numbered doc.
