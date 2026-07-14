# 06 — Setup Guide (step by step)

Everything you must do manually to make the bot live. The code is already complete.

## Step 1 — Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is fine).
2. Once ready, open **SQL Editor → New query**.
3. Paste the entire contents of [`supabase/schema.sql`](../supabase/schema.sql) and **Run**. This creates all tables, security policies, realtime config, and the default auto-replies.
4. Go to **Project Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ keep secret

## Step 2 — Meta WhatsApp Cloud API

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App** → use case **Other** → type **Business**.
2. On the app dashboard, find **WhatsApp** → **Set up**. Meta gives you a free **test number**.
3. From **WhatsApp → API Setup**, copy:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - The **temporary access token** works for 24h; for a permanent one: Business Settings → **System Users** → create one → generate token with `whatsapp_business_messaging` + `whatsapp_business_management` permissions → `WHATSAPP_TOKEN`
4. **App Settings → Basic** → copy **App Secret** → `WHATSAPP_APP_SECRET`.
5. In **API Setup → To**, add your personal WhatsApp number as a recipient (verification code arrives on WhatsApp). Test numbers allow max 5 recipients.
6. Invent any random string for `WHATSAPP_VERIFY_TOKEN` (e.g. `my-secret-verify-123`) — you'll enter the same value in Meta later.

## Step 3 — Environment file

`.env.local` already exists with placeholders. Fill in all 7 values:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
```

## Step 4 — Run locally

```bash
npm run dev
```

Open http://localhost:3000 — the status page shows a green dot for every env var group that's configured.

## Step 5 — Expose the webhook

Meta can only call a public HTTPS URL.

**Option A (local testing):**
```bash
npx ngrok http 3000
```
Use `https://<random>.ngrok-free.app/api/webhook`.

**Option B (production):** deploy to Vercel first (see [07-deployment.md](07-deployment.md)) and use `https://yourapp.vercel.app/api/webhook`.

## Step 6 — Register the webhook with Meta

Meta dashboard → **WhatsApp → Configuration**:

1. **Callback URL** = your webhook URL
2. **Verify token** = your `WHATSAPP_VERIFY_TOKEN` value
3. Click **Verify and save** (Meta hits `GET /api/webhook`; must succeed)
4. Under **Webhook fields**, subscribe to **messages** ✅

## Step 7 — Test the bot

From your verified personal WhatsApp, message the test number:

| You send | Bot replies |
|---|---|
| `hi` | Welcome menu |
| `price` | Pricing message |
| `help` | "Team member will reply" → bot goes silent (human mode) |
| anything else | Fallback ("reply *hi* for menu") |

Check Supabase **Table Editor → messages** — every message should be there.

## Troubleshooting

- **Verify and save fails** → verify token mismatch, or the URL isn't public/HTTPS.
- **Messages arrive but no reply** → check server logs; usually an expired `WHATSAPP_TOKEN` (temporary tokens die after 24h) or recipient not verified.
- **`(#131030) Recipient not in allowed list`** → add the number in API Setup → To.
- **Replies fail after long silence** → 24-hour window expired; only templates work now.
