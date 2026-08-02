# 16 — Manual Test Guide (Workspace Dashboard)

Step-by-step self-testing for every item in the tenant sidebar. Written
2026-07-24 against the running app.

```
WhatsApp Bot — Customer operations
  Workspace          Insights & setup
   • Inbox            • Analytics
   • Contacts         • Settings
   • Auto-replies
   • Knowledge
   • Broadcasts
```

Administration (team roles, plans, suspension) is **not** in this dashboard; it
lives in the operator portal.

For the operator portal (`/admin`) see
[14-platform-admin.md](14-platform-admin.md).

---

## 0. Before you start

```bash
npm run dev          # http://localhost:3000
```

Sign in at `/login` with your tenant account (`arunachalamk015@gmail.com`).
The operator account (`platform@jewelxtech.com`) is deliberately blocked from
the workspace app and will be redirected to `/admin`.

### Two ways to create test traffic

You need inbound messages to exercise Inbox, Contacts, Auto-replies, and AI.

**Option A — local simulation (no Meta setup, works right now)**

```bash
node scripts/simulate-inbound.mjs "hi"
node scripts/simulate-inbound.mjs "what are your prices?" 15551230002 "Priya"
node scripts/simulate-inbound.mjs "do you ship to Chennai?" 15551230003 "Arun"
```

The script builds a Meta-shaped payload, signs it with your real
`WHATSAPP_APP_SECRET`, and POSTs it to `/api/webhook`. It prints the stored
contact, conversation status, and thread. This exercises signature verification,
tenant routing, storage, dedupe, and the full bot decision tree.

**Option B — real WhatsApp round trip**

1. `ngrok http 3000` (or `cloudflared tunnel --url http://localhost:3000`)
2. Meta → your app → WhatsApp → Configuration → callback
   `https://<host>/api/webhook`, verify token = your `WHATSAPP_VERIFY_TOKEN`,
   subscribe to **messages**
3. Add your own number as a test recipient (WhatsApp → API Setup)
4. Message the test number from your phone

### ⚠ Known blocker for all *outbound* messages

Your WhatsApp access token **has expired**:

```
Session has expired on Thursday, 23-Jul-26 01:00:00 PDT   (code 190)
```

Inbound works fine, and AI replies are still generated, but every send fails
with `401`. Before testing anything that sends (Inbox replies, bot/AI replies
reaching a phone, Broadcasts):

1. Meta → WhatsApp → API Setup → generate a new access token
   (temporary tokens last 24 h; use a **System User** token for a permanent one).
2. Paste it in `/settings` → Access token → Save.

Everything below is marked **[needs valid token]** where this applies.

---

## 1. Inbox

**Goal:** conversations list, thread view, realtime, manual reply, status control.

| # | Action | Expected |
|---|---|---|
| 1 | Run `node scripts/simulate-inbound.mjs "hello"` then open `/inbox` | A conversation appears for "Local Tester" with status `bot` |
| 2 | Click the conversation | Thread shows the inbound message, newest last |
| 3 | Keep `/inbox` open and run the script again with new text | The new message appears **without refreshing** (Supabase Realtime) |
| 4 | Send from a second number: `... "hi" 15551230002 "Priya"` | Second conversation appears, ordered by most recent activity |
| 5 | Change status to **open** | Conversation is now human-owned; the bot stops replying to it |
| 6 | Run the script again for that same number | New message stored, **no automated reply** (verify in the thread and dev log) |
| 7 | Type a reply and send **[needs valid token]** | Message appears as outbound; conversation switches to `open` |
| 8 | Set status to **closed**, then simulate another inbound | A **new** conversation row is created rather than reopening the closed one |

Known rough edges: some query errors are still only surfaced lightly; a thread
renders at most 500 messages.

---

## 2. Contacts

**Goal:** contact auto-creation, search, tagging, and broadcast consent.

| # | Action | Expected |
|---|---|---|
| 1 | Simulate messages from 2–3 different numbers, open `/contacts` | Each number appears once, with the WhatsApp profile name |
| 2 | Simulate a second message from an existing number | Still **one** row (upsert on `org_id` + phone), `last_seen_at` updated |
| 3 | Search by name, by phone, and by tag | List filters within loaded rows (client-side, max 500 loaded) |
| 4 | Add tag `vip` to one contact | Tag chip appears; reload persists it |
| 5 | Add a second tag, then remove one | Tags normalize (lowercase/trimmed) and persist |
| 6 | Click the contact's consent badge | It toggles between `Opted in` and `Opted out`; reload persists it |
| 7 | Simulate inbound `STOP` **[needs valid token for confirmation send]** | Contact becomes `Opted out`; thread stores the inbound message and an unsubscribe confirmation |
| 8 | Simulate inbound `START` **[needs valid token for confirmation send]** | Contact becomes `Opted in`; thread stores the inbound message and a resubscribe confirmation |

Not implemented: CSV import and consent-evidence history. New contacts default to
`opted_in = true`.

---

## 3. Auto-replies

**Goal:** rule CRUD and matching precedence. *(The create path was fixed on
2026-07-24 — it previously failed because the insert omitted `org_id`.)*

| # | Action | Expected |
|---|---|---|
| 1 | Open `/auto-replies` | Four seeded rules: `hi`, `hello`, `price`, `help` |
| 2 | Add a rule: keyword `hours`, match **contains**, response "We're open 10am–8pm." | Rule is created and listed — **no error** |
| 3 | `node scripts/simulate-inbound.mjs "what are your hours?"` | Dev log shows the keyword reply chosen; **[needs valid token]** to see it delivered |
| 4 | Add keyword `gold` with match **exact** and simulate `"gold"` vs `"gold chain"` | `exact` matches only the former |
| 5 | Add keyword `order` with **starts with**, simulate `"order status"` vs `"my order"` | Only the first matches |
| 6 | **Disable** a rule and simulate its keyword | Rule is skipped; falls through to AI or the static fallback |
| 7 | **Edit** a rule's response, then simulate | Updated text is used |
| 8 | **Delete** a rule | Removed from the list and no longer matches |
| 9 | Simulate `"help"` | Deterministic reply **and** the conversation flips to `open` (handoff) |

Matching is first-match-wins by creation order; there is no priority column.

---

## 4. Knowledge

**Goal:** ingestion from three sources, then RAG-grounded AI answers.

| # | Action | Expected |
|---|---|---|
| 1 | `/knowledge` → **Text** tab: title "Shipping policy", paste ≥20 characters of realistic policy text | Document listed with a chunk count |
| 2 | **PDF** tab: upload a small text-based PDF | Extracted, chunked, listed. A scanned/image-only PDF yields little or no text |
| 3 | PDF > 20 MB | Rejected with `413` |
| 4 | Non-PDF file renamed to `.pdf` | Rejected/`422` |
| 5 | **Website** tab: `https://example.com` | Page fetched, cleaned, indexed |
| 6 | Website tab: `http://localhost:3000` or `http://169.254.169.254/latest/meta-data/` | **Blocked** — "Blocked host (private or reserved address)". This is the SSRF guard |
| 7 | Delete a document | Document and its chunks disappear (cascade) |
| 8 | With `ai_enabled` on, simulate a question answerable only from your ingested text | Dev log shows a GLM call ~2–5 s; the generated answer uses your content **[needs valid token]** to be delivered |
| 9 | Simulate a question your KB cannot answer | The model should emit `[HANDOFF]`, which is stripped, and the conversation becomes `open` |

Retrieval uses pgvector when `VOYAGE_API_KEY` is set, otherwise Postgres
full-text search. Both paths are valid; vector search gives better recall.

---

## 5. Broadcasts **[needs valid token]**

**Goal:** template send to a tagged audience.

| # | Action | Expected |
|---|---|---|
| 1 | In Meta → WhatsApp → Message Templates, confirm an approved template (e.g. `hello_world`) | Required — Meta rejects unapproved names |
| 2 | Tag 1–2 contacts `vip` in `/contacts` | Audience ready |
| 3 | `/broadcasts`: template `hello_world`, language `en_US`, tag `vip` | Result line shows progress, then sent/failed counts; a history row is added |
| 4 | Leave the tag empty and send again | Targets **all** opted-in contacts |
| 5 | Use a bogus template name | Every recipient fails; `failed_count` reflects it |

Limits by design right now: campaigns are capped at 1,000 recipients and
processing is request-driven from the dashboard, not an independent worker. Test
with a tiny audience until Meta credentials/templates are fully verified.

---

## 6. Analytics

**Goal:** tiles and the 14-day chart.

| # | Action | Expected |
|---|---|---|
| 1 | Note the current numbers on `/analytics` | Totals for contacts, conversations, open conversations |
| 2 | Simulate 3 messages from a new number, reload | Contacts +1, conversations +1, message counts increase |
| 3 | Set a conversation to `open` in Inbox, reload | "Open conversations" increases |
| 4 | Check the 14-day chart | Today's bar reflects the messages you just created |

Prerequisite: apply
`supabase/migrations/20260731000001_dashboard_analytics.sql`; the page now reads
the 14-day chart from the `dashboard_analytics()` aggregate RPC.

---

## 7. Settings

**Goal:** workspace fields, WhatsApp credentials, AI toggle, role gating.

| # | Action | Expected |
|---|---|---|
| 1 | Open `/settings` | Workspace name, plan, Phone Number ID, and a **connected/not connected** badge |
| 2 | Inspect the access-token field | Empty with placeholder "Access token set — enter a new one to replace". The token is **never** sent to the browser |
| 3 | Rename the workspace and save | Persists after reload; the new name also shows in `/admin/organizations` |
| 4 | Paste a fresh access token and save | Badge stays "connected"; sends start working |
| 5 | Toggle **AI replies** off, simulate a non-keyword message | Static fallback is used, no GLM call in the log |
| 6 | Toggle it back on and repeat | GLM call appears again |
| 7 | Sign in as an **agent** (create one in `/admin/users`) and open `/settings` | Phone Number ID and token fields are **disabled**; saving name/AI still works |
| 8 | As that agent, POST credentials directly to `/api/settings` | `403` "Only an owner or admin can change WhatsApp credentials" |

---

## 8. Team roles — tested from the operator portal

The client dashboard has **no Admin screen** (removed 2026-07-25). Roles are
managed by the operator, so test this at `/admin/organizations/[id]` after
signing in at `/admin/login`.

| # | Action | Expected |
|---|---|---|
| 1 | Check the tenant sidebar | Only Inbox, Contacts, Auto-replies, Knowledge, Broadcasts, Analytics, Settings — no Admin |
| 2 | Visit `/admin` as a tenant user | Redirected to `/inbox` — the operator portal lives at `/admin`, and `requirePlatformAdmin()` bounces any non-operator |
| 2b | Visit `/admin` signed out | Redirected to `/admin/login` |
| 2c | Call `POST /api/admin/users` as a tenant user | `403` |
| 3 | Operator → `/admin/users` → **New user**, assign your workspace, role `agent` | Account created and listed |
| 4 | Operator → workspace detail → change that member to **admin** | Role select saves; reload confirms |
| 5 | Try to demote the workspace's only **owner** | Refused: "This workspace would be left without an owner" |
| 6 | Add a second owner, then demote the first | Allowed |
| 7 | Sign in as the `agent` and open `/settings` | Phone Number ID and token fields are disabled |
| 8 | As that agent, POST credentials to `/api/settings` | `403` |

Roles gate credential writes only. They do **not** restrict access to inbox,
contacts, broadcasts, or knowledge data — any member sees all workspace data.

---

## 9. Cleaning up test data

Remove simulated contacts (conversations and messages cascade):

```sql
-- Supabase SQL editor
delete from contacts where wa_phone like '1555123%';
```

Knowledge documents and auto-reply rules are deleted from their own pages.

---

## 10. Quick pass/fail summary sheet

| Feature | Testable now | Needs a fresh WhatsApp token |
|---|---|---|
| Inbox — list, thread, realtime, status | ✅ | sending a reply |
| Contacts — creation, search, tags | ✅ | — |
| Auto-replies — CRUD, match types, handoff | ✅ (decision visible in logs) | delivery |
| Knowledge — ingestion, SSRF guard, RAG | ✅ | delivery of AI answers |
| Broadcasts | ❌ | ✅ entire feature |
| Analytics | ✅ | — |
| Settings — fields, AI toggle, role gate | ✅ | verifying "connected" against Meta |
| Team roles — via `/admin` (no client admin) | ✅ | — |
