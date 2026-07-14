# 03 — Database (Supabase / Postgres)

Schema file: [`supabase/schema.sql`](../supabase/schema.sql) — run it in the Supabase **SQL Editor**.

## Tables

### `contacts`
One row per WhatsApp user who has messaged the bot.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto |
| wa_phone | text **unique** | e.g. `919876543210` (no `+`) |
| name | text | from WhatsApp profile |
| tags | text[] | for audience segmentation, default `{}` |
| opted_in | boolean | default `true` |
| last_seen_at | timestamptz | updated on every incoming message |
| created_at | timestamptz | auto |

### `conversations`
A thread with a contact. One active (non-closed) conversation per contact at a time.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto |
| contact_id | uuid FK → contacts | cascade delete |
| status | text | `bot` (default) \| `open` (human handling) \| `closed` |
| assigned_to | uuid | agent's profiles.id (nullable) |
| last_message_at | timestamptz | for inbox sorting |
| created_at | timestamptz | auto |

**Status meaning:** `bot` = auto-replies active · `open` = human took over, bot silent · `closed` = done; the next incoming message creates a fresh conversation.

### `messages`
Every message in and out.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto |
| conversation_id | uuid FK → conversations | cascade delete |
| direction | text | `in` \| `out` |
| type | text | `text`, `image`, `interactive`, … default `text` |
| body | text | message text (or `[type]` placeholder for media) |
| media_url | text | nullable |
| wa_message_id | text **unique** | Meta's id — used for dedupe + status updates |
| status | text | `received` → (out msgs) `sent` → `delivered` → `read` / `failed` |
| created_at | timestamptz | auto |

### `auto_replies`
Keyword rules the bot matches against incoming text.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto |
| trigger_keyword | text | matched case-insensitively |
| match_type | text | `exact` \| `contains` \| `starts_with` |
| response_text | text | what the bot sends |
| active | boolean | default `true` |

### `broadcasts` (Phase 3, table ready)
| Column | Type | Notes |
|---|---|---|
| id, template_name, audience_tag, scheduled_at | | campaign definition |
| sent_count, failed_count | int | delivery stats |

### `profiles`
Dashboard users, linked 1:1 to `auth.users`. Auto-created by the `on_auth_user_created` trigger on signup.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK FK → auth.users | cascade delete |
| full_name | text | from signup metadata |
| role | text | `admin` \| `agent` (default `agent`) |

## Indexes

- `idx_messages_conversation` — `messages(conversation_id, created_at desc)` (chat history)
- `idx_conversations_contact` — `conversations(contact_id)`
- `idx_conversations_last_message` — `conversations(last_message_at desc)` (inbox sort)

## Row Level Security

RLS is **enabled on every table**.

- Server code (webhook, send API) uses the **service-role key** → bypasses RLS.
- Dashboard users (`authenticated` role) can read/write contacts, conversations, messages, auto_replies, broadcasts (broad policies for now — tighten per-role in Phase 2).
- `profiles`: users can only read/update **their own** row.

## Realtime

`messages` and `conversations` are added to the `supabase_realtime` publication → the Phase 2 inbox subscribes for live updates.

## Seed Data

Four auto-replies installed by the schema: `hi` / `hello` (exact → menu), `price` (contains → pricing), `help` (contains → human handoff, sets conversation to `open`).
