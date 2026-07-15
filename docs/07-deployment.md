# 07 — Deployment (Vercel or Docker)

## Option A — Docker (self-hosted)

The repo ships a production `Dockerfile` (multi-stage, Next.js standalone output, non-root user) and `docker-compose.yml`.

```bash
# 1. Fill .env.local with real values (see .env.local.example)
# 2. Build & run
docker compose up -d --build
# App on http://localhost:3000 — put a reverse proxy (Caddy/nginx) with HTTPS
# in front, since Meta requires an HTTPS webhook URL.
```

Notes:
- `NEXT_PUBLIC_*` vars are baked in at **build** time (compose passes them as build args from `.env.local`); server-only secrets are read at **runtime** via `env_file`.
- Rebuild the image after changing `NEXT_PUBLIC_*` values; runtime-only secret changes just need a container restart.
- Health check: `GET /` returns the status page.

## Option B — Vercel

## First deploy

1. Push the repo to GitHub (`gh repo create` or via github.com).
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Framework auto-detects as Next.js.
3. In **Environment Variables**, add all 7 vars from `.env.local` (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`
4. **Deploy** → note the URL, e.g. `https://wtsapp-bot.vercel.app`.

## Point Meta at production

Meta dashboard → WhatsApp → Configuration → change Callback URL to
`https://wtsapp-bot.vercel.app/api/webhook` → **Verify and save** again.

## Production checklist

- [ ] `WHATSAPP_APP_SECRET` set in Vercel (signature verification is **skipped** when unset — required in prod)
- [ ] Permanent access token in use (not the 24h temporary one)
- [ ] Webhook verified and **messages** field subscribed
- [ ] Test end-to-end: send `hi` → reply arrives → rows appear in Supabase
- [ ] Supabase: confirm RLS is enabled on all tables (schema does this)

## Going beyond the test number (real business number)

1. Meta dashboard → WhatsApp → **Add phone number** (a number not already on WhatsApp).
2. Complete **Business verification** in Meta Business Manager (docs: business.facebook.com).
3. Set a display name; verify via SMS/voice call.
4. Update `WHATSAPP_PHONE_NUMBER_ID` in Vercel and redeploy.
5. Messaging limits start at 250 business-initiated conversations/day and scale up with quality rating.

## Notes

- Vercel serverless functions have a 10s default timeout (Hobby) — webhook processing is designed to stay fast; if bot logic grows heavy, move to background processing (e.g. Vercel `waitUntil`, QStash, or Supabase Edge Functions).
- Logs: Vercel dashboard → Project → **Logs** shows `console.error` from the webhook.
