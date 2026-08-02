# 05 — Bot Logic

> **Readiness update:** the decision flow is implemented with tenant routing,
> atomic inbound dedupe, consent commands, keyword replies, AI/RAG fallback, and
> human handoff. Durable background processing is still future work.

Entry point: [`src/lib/bot.ts`](../src/lib/bot.ts) → `runAutoReply()`.

## Reply decision tree

```text
incoming text or interactive title
├─ conversation status = open?  → store only; human owns thread
├─ workspace suspended by platform?  → skip entirely (no storage, no reply)
├─ exact STOP/START consent command? → update opted_in, confirm, stop
├─ active keyword rule matches? → send deterministic response
│  └─ normalized keyword = help → switch conversation to open
├─ workspace AI enabled?        → AI model (GLM or Gemini) + optional KB context
│  └─ response has [HANDOFF]?   → strip token and switch to open
└─ otherwise                    → static fallback
```

A `closed` conversation is not reused; the next incoming message creates a new `bot` conversation.

## Keyword matching

1. Load active rules for the current `org_id`.
2. Trim and lowercase incoming text.
3. Iterate in database return order; first matching rule wins.
4. Match types are `exact`, `starts_with`, and `contains`.
5. Send the response using the current organization's WhatsApp credentials.
6. Store successful outbound messages.

If deterministic ordering matters, add an explicit priority/order column; the current query has no `order()` clause.

## Consent commands

Exact inbound commands are handled before keyword rules or AI:

- Opt out: `STOP`, `STOP ALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`.
- Opt in: `START`, `SUBSCRIBE`, `UNSTOP`.

The webhook stores the inbound message, updates `contacts.opted_in`, sends a
confirmation reply, stores that outbound confirmation when Meta accepts it, and
returns without running normal automation.

## Seeded rules

Workspace onboarding inserts `hi`, `hello`, `price`, and `help` rules with the new organization ID.

## Managing rules

The intended path is `/auto-replies`. Editing, enabling/disabling, and deleting existing tenant rules are implemented.

**Known defect:** creating a new rule from the dashboard omits `org_id`, while the schema requires it. Fix that flow before relying on the rule builder.

Manual SQL must always include a tenant:

```sql
insert into auto_replies
  (org_id, trigger_keyword, match_type, response_text)
values
  ('<ORGANIZATION_UUID>', 'timing', 'contains', 'We are open 9am–9pm, Mon–Sat.');
```

Do not use an organization UUID supplied by an untrusted client in service-role code; derive it from the authenticated profile.

## AI provider (GLM / Gemini / OpenRouter) and RAG

AI fallback requires the workspace's `ai_enabled` setting at `/settings` plus the
platform API key for the **active provider**. The provider is chosen by the
`AI_PROVIDER` env:

| `AI_PROVIDER` | Backend | Key | Default model |
| --- | --- | --- | --- |
| `glm` (default) | Z.ai, OpenAI-compatible | `ZAI_API_KEY` | `glm-4.7-flashx` (`ZAI_MODEL`) |
| `gemini` | Google, native `generateContent` | `GEMINI_API_KEY` | `gemini-3.5-flash-lite` (`GEMINI_MODEL`) |
| `openrouter` | OpenRouter, OpenAI-compatible | `OPENROUTER_API_KEY` | `google/gemini-3.5-flash-lite` (`OPENROUTER_MODEL`) |

Gemini/OpenRouter are useful for non-Latin and mixed local language scripts
(Tamil, Chinese, Malay, Tanglish, Singlish); GLM's `flashx` tier is the cheapest.
All providers share the same system prompt, KB retrieval,
daily-quota check, and `[HANDOFF]` handling. The current deployment runs
`AI_PROVIDER=openrouter`. The removed global `AI_REPLIES_ENABLED` environment flag
is not used.

**Automatic failover.** `AI_PROVIDER` names the *primary* model only; other
configured providers are tried automatically if the primary fails, and the static "didn't
understand" reply is sent only when every configured provider fails. This exists
because a single vendor fault (an expired key, a rate limit, or Google's new
`AQ.`-format keys being intermittently refused) otherwise downgraded live
customer replies to the static message. Providers without a configured key are
skipped, so single-provider setups behave as before.

The system prompt carries an explicit **LANGUAGE rule**: reply in the same
language *and script* the customer used (Tamil script stays Tamil script;
romanised Tamil/Singlish stays romanised; Chinese, Malay, etc. are mirrored),
while addresses, model names, prices and phone numbers stay verbatim. Without
this rule the model defaulted to English — the cause of the earlier "LANG OFF"
replies across every model.

The newer Google key format (`AQ.…`) authenticates via the `x-goog-api-key`
header rather than the `?key=` query param.

A per-plan **daily cap** is checked before each model call via
`bump_ai_usage()`. When the cap is reached, or the workspace plan status is not
`active`, the bot uses the static fallback.

`generateAIReply()`:

- Loads up to 20 recent conversation messages.
- Retrieves up to five tenant KB passages through vector search when Voyage is configured, otherwise FTS.
- Requests a short response from the active provider (`completeWithGLM` or `completeWithGemini`).
- Strips `[HANDOFF]` and switches to human mode when requested.
- Returns `null` on API refusal/error/empty output, causing the static fallback.

## Reliability limitations

- Conversation handoff can be updated before the outbound response is confirmed.
- Graph network calls lack explicit timeouts.
- Outbound database persistence errors are not consistently surfaced.
- No per-tenant AI rate limits, quotas, or spend controls exist.
- The webhook can acknowledge failed processing and prevent Meta retries.
