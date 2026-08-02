# 18 — Plan Enforcement

## Status

Implemented in code on 2026-07-31. There is still no Stripe checkout or billing
webhook; plans are operator-managed from `/admin`.

The app now enforces `organizations.plan` and `organizations.plan_status` for
AI replies, broadcasts, and knowledge-base ingestion.

## Limits

| Plan | AI replies/day | Broadcast recipients/campaign | KB documents | KB characters/document |
|---|---:|---:|---:|---:|
| `free` | 25 | 25 | 3 | 50,000 |
| `starter` | 500 | 500 | 25 | 250,000 |
| `pro` | 2,000 | 1,000 | 100 | 500,000 |

`plan_status = active` is required for AI replies, broadcasts, and KB ingestion.
`past_due` or `canceled` blocks those features until the operator restores the
workspace to `active`.

## Enforcement Points

- `src/lib/limits.ts` is the central plan-limit definition.
- AI replies use the plan's daily cap through `bump_ai_usage()`.
- `POST /api/broadcasts` counts the selected opted-in audience before creating a
  campaign and rejects audiences above the workspace plan.
- `PATCH /api/broadcasts` also requires an active plan before processing queued
  recipients.
- `POST /api/kb/text`, `POST /api/kb/upload`, and `POST /api/kb/url` enforce
  max document count and extracted-text length.

## Operator Workflow

1. Sign in at `/admin/login`.
2. Open `/admin/organizations/[id]`.
3. Change `plan` or `plan_status`.
4. The limits apply immediately to new AI attempts, broadcast processing, and KB
   ingestion.

No payment state is synchronized automatically. The operator is responsible for
setting plan and status accurately.
