# 04 — API Reference

All endpoints are Next.js route handlers under `src/app/api/`.

---

## `GET /api/webhook`

**Purpose:** Meta's one-time webhook verification handshake.
**Auth:** `hub.verify_token` must equal env `WHATSAPP_VERIFY_TOKEN`.

| Query param | Value |
|---|---|
| `hub.mode` | `subscribe` |
| `hub.verify_token` | your chosen token |
| `hub.challenge` | random string from Meta |

**Responses:** `200` echoing `hub.challenge` on success · `403 Forbidden` on token mismatch.

✅ Verified working: correct token echoes the challenge; wrong token returns 403.

---

## `POST /api/webhook`

**Purpose:** Receives incoming WhatsApp messages and message status updates from Meta.
**Auth:** HMAC — `X-Hub-Signature-256: sha256=<hmac>` verified against `WHATSAPP_APP_SECRET` (timing-safe). Skipped if the secret env is unset (local dev only).

**Handles:**
- `messages[]` — text and interactive replies (button/list). Media types stored as `[type]` placeholder.
- `statuses[]` — updates message `status` (`delivered`, `read`, `failed`) by `wa_message_id`.

**Behavior guarantees:**
- Duplicate deliveries ignored (dedupe on `wa_message_id`).
- Always returns `200 {ok:true}` even if processing throws (prevents Meta retry storms); errors go to server logs.
- `401` invalid signature · `400` malformed JSON.

---

## `POST /api/messages/send`

**Purpose:** Manual reply from a logged-in dashboard agent.
**Auth:** Supabase Auth session cookie required → `401` if not logged in.

**Request body** (Zod-validated):
```json
{
  "conversationId": "uuid",
  "text": "string (1–4096 chars)"
}
```

**Responses:**

| Status | Meaning |
|---|---|
| `200` | `{ ok: true, message: {...} }` — sent and stored |
| `400` | validation error (Zod details in body) |
| `401` | not logged in |
| `404` | conversation not found |
| `502` | WhatsApp Graph API rejected the send (detail in body) |

**Side effect:** conversation status → `open` (bot stops auto-replying).

---

## Internal helpers (`src/lib/whatsapp.ts`)

| Function | Use |
|---|---|
| `sendText(to, body)` | Free-form text — only within the 24h customer-service window |
| `sendTemplate(to, name, lang?, components?)` | Pre-approved template — required outside the 24h window |
| `markAsRead(waMessageId)` | Blue ticks on the incoming message |

All call `https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` with `WHATSAPP_TOKEN` bearer auth and return `{ ok, waMessageId, error? }` — failures are logged, never thrown.
