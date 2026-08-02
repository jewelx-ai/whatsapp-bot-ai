# 10 — Broadcasts, Analytics, and AI Replies

> **Readiness update (2026-07-21):** All three feature areas have implementations, but none is production-approved. See [13-feature-readiness-audit.md](13-feature-readiness-audit.md).

## Broadcasts

`/broadcasts` posts an approved Meta template name, language, optional tag, and
client idempotency key to `POST /api/broadcasts`. The API:

1. Resolves the authenticated user's organization.
2. Requires tenant Phone Number ID and access token.
3. Selects up to 1,000 contacts with `opted_in = true`, optionally containing a tag.
4. Creates one campaign row and durable per-recipient rows.
5. Claims queued recipient rows before sending so overlapping requests do not
   double-send the same recipient.
6. Processes bounded batches through `POST` then `PATCH /api/broadcasts`, or
   through the cron-protected `POST /api/worker/broadcasts` endpoint.
7. Updates aggregate sent/failed/progress counts from recipient state.

### Limitations

- Worker processing exists, protected by `CRON_SECRET`, but still needs hosting
  scheduler configuration and live soak testing.
- No cancellation UI or scheduled execution.
- Stale `processing` recipients are requeued by the worker for up to three
  attempts, then marked failed.
- `scheduled_at` exists in the schema, but scheduling is not implemented.
- Consent defaults true; the dashboard toggle and STOP/START commands update
  `opted_in`. Consent-evidence history is not built.
- Template validity is only known after Meta accepts/rejects each request.

Production target: configure the worker scheduler, then add cancellation,
template preflight checks, and scheduled execution.

## Analytics

`/analytics` calls `GET /api/analytics`, which resolves the tenant server-side
and uses the `dashboard_analytics()` RPC for total contacts, total/open
conversations, and 14 days of incoming/outgoing messages.

### Current behavior

The page no longer downloads raw messages, so it is not affected by Supabase
`max_rows` for the 14-day chart. Longer reporting windows, export, and cohort
analytics are not built.

## GLM replies

AI is enabled by both:

1. Platform env `ZAI_API_KEY`.
2. The workspace `ai_enabled` toggle at `/settings`.

The obsolete global `AI_REPLIES_ENABLED` environment variable is not used.

After no keyword match, the bot:

1. Loads up to 20 recent messages.
2. Retrieves tenant KB context through vector search or FTS.
3. Calls the active AI provider (`glm-4.7-flashx` by default, or Gemini) for a
   short response, falling back to the other provider if that call fails.
4. Strips `[HANDOFF]` and changes the conversation to `open` when requested.
5. Uses the static fallback on refusal/error/empty output.

### Limitations

- Z.ai/model availability and behavior were not live-tested in the current audit.
- Per-plan daily AI quotas are enforced. Per-minute rate limits, budget controls,
  and spend alerts are not built.
- Provider calls need explicit timeout/retry policy.
- Prompt and handoff behavior need adversarial and representative evaluations.

## Decision order

```text
human owns conversation? → no automation
keyword match?            → deterministic reply
AI enabled?               → GLM + RAG, optional handoff
otherwise                 → static fallback
```
