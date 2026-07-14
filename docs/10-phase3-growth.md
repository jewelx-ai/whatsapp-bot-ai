# 10 — Phase 3: Broadcasts, Analytics & AI Replies

## 📣 Broadcasts

Send a **pre-approved template message** to many contacts at once — templates are mandatory because broadcasts go outside Meta's 24-hour customer-service window.

- **Page:** `/broadcasts` — form (template name, language code, optional audience tag) + history table with sent/failed counts.
- **API:** `POST /api/broadcasts` (auth required)
  ```json
  { "templateName": "hello_world", "languageCode": "en_US", "audienceTag": "vip" }
  ```
  Omitting `audienceTag` targets **all opted-in contacts**; with a tag, only contacts carrying that tag (tags are managed on `/contacts`). Capped at 1000 recipients per broadcast. Each result is recorded in the `broadcasts` table.
- **Prerequisite:** create + get the template approved in Meta dashboard → WhatsApp → Message Templates. The free `hello_world` template works for testing.

Responses: `200 {ok, sent, failed}` · `400` validation · `401` not logged in · `404` no matching contacts.

## 📊 Analytics

**Page:** `/analytics` — computed client-side from Supabase (RLS-protected), no extra API.

- Stat tiles: total contacts, total conversations, conversations **waiting on a human** (highlighted amber when > 0), messages in/out over 14 days.
- Stacked bar chart: incoming (blue) vs outgoing (green) messages per day, last 14 days, tooltips on hover.

## 🤖 AI Replies (Claude)

When an incoming message matches **no keyword rule**, the bot can answer with Claude instead of the static "I didn't understand" fallback.

**Flow** (in [`src/lib/bot.ts`](../src/lib/bot.ts) → [`src/lib/ai.ts`](../src/lib/ai.ts)):
1. Keyword rules are checked first — they always win (predictable, free).
2. No match + AI enabled → last 20 messages of the conversation are sent to Claude (`claude-opus-4-8`, low effort for fast/cheap replies) with a WhatsApp-tuned system prompt: short replies, plain text, never invent facts/prices.
3. **Escalation:** when Claude doesn't know something business-specific or the user wants a person, it appends a `[HANDOFF]` token → the bot strips it, sends the reply, and flips the conversation to `open` (human mode, bot goes silent).
4. Any AI failure (API error, refusal, empty reply) silently falls back to the static message — the bot never breaks because of the AI.

**Enable it** — two env vars (see `.env.local.example`):
```
AI_REPLIES_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...   # console.anthropic.com
```
Leave `AI_REPLIES_ENABLED=false` (default) to keep pure keyword behavior.

**Safety properties:**
- AI never replies when a human owns the conversation (status `open`).
- Keyword rules always take precedence, so exact flows (hi/price/help) stay deterministic.
- The system prompt forbids inventing prices or commitments; unsure → handoff.

## Reply decision tree (full bot logic after Phase 3)

```
incoming message
├─ conversation status = open?        → store only, human handles it
├─ keyword rule matches?              → send rule response
│    └─ rule is "help"?              → also hand off to human
├─ AI enabled?                        → Claude reply (last 20 msgs context)
│    └─ Claude says [HANDOFF]?       → send reply + hand off to human
└─ otherwise                          → static fallback ("reply hi for menu")
```
