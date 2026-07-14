# 05 — Bot Logic

File: [`src/lib/bot.ts`](../src/lib/bot.ts) — entry point `runAutoReply()`.

## When the bot replies

The webhook calls `runAutoReply()` for every incoming **text** (or interactive button/list reply) message, **except** when the conversation status is `open` — that means a human agent owns the thread and the bot stays silent.

## Matching algorithm

1. Load all `auto_replies` rows where `active = true`.
2. Lowercase + trim the incoming text.
3. Check rules in order; **first match wins**:
   - `exact` — text equals the keyword
   - `starts_with` — text starts with the keyword
   - `contains` — keyword appears anywhere in the text
4. No match → send the **fallback reply** ("Sorry, I didn't understand… reply *hi* for menu").
5. The sent reply is stored in `messages` (`direction: 'out'`, `status: 'sent'`).

## Human handoff

When the matched keyword is `help`, the bot:
1. Sends the rule's response ("A team member will reply shortly").
2. Sets the conversation status to `open`.
3. From then on, every incoming message is stored but **not** auto-replied — an agent answers via `POST /api/messages/send`.

To hand a conversation **back to the bot**, set its status to `bot` (dashboard feature in Phase 2), or `closed` — the next incoming message then opens a fresh `bot` conversation.

## Current seeded conversation flow

```
User: hi            → menu (1️⃣ price, 2️⃣ help)
User: price         → pricing message
User: help          → "team member will reply" + handoff to human
User: (anything else) → fallback ("reply hi for menu")
```

## Adding / changing replies

No code change needed — insert rows into `auto_replies`:

```sql
insert into auto_replies (trigger_keyword, match_type, response_text)
values ('timing', 'contains', 'We are open 9am–9pm, Mon–Sat.');
```

Deactivate a rule with `update auto_replies set active = false where trigger_keyword = '...'`.

## AI replies (Phase 3 — implemented)

When no keyword rule matches and AI is enabled (`AI_REPLIES_ENABLED=true` + `ANTHROPIC_API_KEY`), the bot calls Claude with the last 20 messages of the conversation and sends its answer instead of the static fallback. Claude escalates to a human by emitting a `[HANDOFF]` token (conversation → `open`). Any AI failure falls back to the static message. Full details: [10-phase3-growth.md](10-phase3-growth.md).
