# 06 — Setup Guide

> **Readiness warning (2026-07-21):** This setup is suitable for development/sandbox evaluation only until the blockers in [13-feature-readiness-audit.md](13-feature-readiness-audit.md) are fixed.

## 1. Install the project

```bash
npm ci
cp .env.local.example .env.local
```

## 2. Create a Supabase project

1. Create a project in Supabase.
2. Apply the tracked migration chain with `supabase db reset` locally, or `supabase link --project-ref <project-ref>` followed by `supabase db push` for a hosted project.
3. Copy the Project URL, anon key, and service-role key.
4. Confirm Auth email settings and allowed redirect URLs for your local and deployed hosts.
5. Confirm `messages` and `conversations` are in the Realtime publication.

`supabase/schema.sql` is retained only as a historical reference. Use `supabase/migrations/` for fresh setup so later tables, constraints, functions, and policy hardening are included.

## 3. Configure platform environment variables

Fill `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_TOKEN_ENCRYPTION_KEY=
ZAI_API_KEY=
VOYAGE_API_KEY=
PLATFORM_SUPER_ADMIN_EMAIL=
KB_INGEST_ALLOWED_HOSTS=
```

- The three Supabase values and both Meta webhook values are core platform configuration.
- `WHATSAPP_APP_SECRET` is **mandatory**: webhook signature verification fails closed without it. For local development only, `ALLOW_UNSIGNED_WEBHOOKS=true` skips verification explicitly.
- `WHATSAPP_TOKEN_ENCRYPTION_KEY` encrypts tenant WhatsApp access tokens at rest.
  Generate it with `openssl rand -base64 32`, keep it server-only, and set the
  same value in every app runtime that must read existing encrypted tokens.
- AI replies need a key for the active provider, selected by `AI_PROVIDER`
  (`glm` default, `gemini`, or `openrouter`). Other configured providers are used
  automatically as fallbacks.
- `KB_INGEST_ALLOWED_HOSTS` is optional. Leave it blank for sandbox testing, or
  set a comma-separated allowlist such as `example.com,www.example.com` in
  production to restrict website ingestion targets.
  - GLM: `ZAI_API_KEY`, optional `ZAI_BASE_URL` (default
    `https://api.z.ai/api/paas/v4/`) and `ZAI_MODEL` (default `glm-4.7-flashx`).
  - Gemini: `GEMINI_API_KEY`, optional `GEMINI_MODEL` (default
    `gemini-3.5-flash-lite`) and `GEMINI_BASE_URL`.
  - OpenRouter: `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL` (default
    `google/gemini-3.5-flash-lite`) and `OPENROUTER_BASE_URL`.
- Plan limits cap AI replies per tenant per UTC day; see
  [18-plan-enforcement.md](18-plan-enforcement.md).
- `PLATFORM_SUPER_ADMIN_EMAIL` names the single platform operator account; see [14-platform-admin.md](14-platform-admin.md). Changing it requires an app restart.
- `VOYAGE_API_KEY` enables semantic retrieval (`voyage-3.5-lite`, 1024 dims); without it, KB retrieval falls back to PostgreSQL FTS. Note the free tier without a payment method is limited to **3 requests/minute**, and each AI reply makes one query embedding. Documents ingested before the key was added need their embeddings backfilled, otherwise vector search matches nothing.
- `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, Z.ai, and Voyage keys are server-only.
- WhatsApp Phone Number IDs and access tokens are **not** environment variables in the current multi-tenant design.

## 4. Configure the shared Meta app

1. Create a Meta Business app and add WhatsApp.
2. Copy the app secret to `WHATSAPP_APP_SECRET`.
3. Choose a random webhook verification value for `WHATSAPP_VERIFY_TOKEN`.
4. Obtain a test or production WhatsApp number, its Phone Number ID, and an appropriate access token.
5. For test numbers, register test recipients in Meta.

## Google sign-in (optional)

`/login` shows **Sign in with Google** unconditionally, but the button only
works once the provider is enabled in Supabase. Until then Supabase answers the
authorize request with `Unsupported provider: provider is not enabled`. No
environment variable is involved: the browser derives the redirect from
`window.location.origin`.

1. In Google Cloud Console, create an OAuth 2.0 **Web application** client
   (configure the OAuth consent screen first if the project has none).
2. Set the authorized redirect URI to
   `https://<project-ref>.supabase.co/auth/v1/callback` — Google returns to
   Supabase, not to this app.
3. Enable the provider with the client ID and secret, either way:
   - **Dashboard:** Supabase → Authentication → Providers → Google.
   - **Config as code:** `[auth.external.google]` is already declared in
     `supabase/config.toml` reading two env vars. Export them and push:
     ```bash
     export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
     export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
     supabase config push
     ```
     `supabase db push` warns `environment variable is unset: …GOOGLE_CLIENT_ID`
     until these are exported; that warning is harmless for migrations.
4. In Supabase → Authentication → URL Configuration, add the app callback to
   **Redirect URLs** for every host you use:
   `http://localhost:3000/auth/callback` and
   `https://<your-domain>/auth/callback`. Unlisted hosts are rejected and the
   user is bounced back to `/login` with an error.
5. Sign in once and confirm the account appears in Authentication → Users with
   provider `google`.

Google accounts follow the same provisioning path as email sign-ups: the
`handle_new_user()` trigger creates the profile, and the first sign-in lands on
`/onboarding` to create a workspace. An existing email/password account with the
same verified address is linked by Supabase rather than duplicated.

The trigger resolves the display name across the different shapes each method
produces, falling back in order: `full_name` (our email form) → `name` (Google's
OIDC claim) → `given_name` + `family_name` → the local part of the email. Before
migration `20260725000002` only `full_name` was read, so Google users were
created with a NULL name and rendered blank in member lists.

To verify the provider state without clicking through the UI:

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" | grep -o '"google":[a-z]*'
```

## 5. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`, then:

1. Sign up at `/login`.
2. Complete email confirmation if enabled.
3. Create a workspace at `/onboarding`.
4. Open `/settings` and enter that workspace's Phone Number ID and access token.
5. Optionally enable AI replies after configuring Z.ai.

## Platform operator setup

The operator is a normal Supabase Auth user that must **not** belong to any
workspace:

1. Create the account in Supabase (Authentication → Users → Add user, with email
   confirmed), or via the admin API.
2. Put its email in `PLATFORM_SUPER_ADMIN_EMAIL` and restart the app.
3. Sign in at `/admin/login` — not `/login`.

Do not reuse a tenant account: the operator is redirected out of the tenant app,
so a shared account could not use its own workspace.

The “connected” badge only checks that both fields are present; it does not verify them with Meta.

## 6. Expose and register the webhook

Meta requires public HTTPS. Use a trusted tunnel for sandbox work or deploy to an HTTPS host.

Register:

```text
https://<public-host>/api/webhook
```

In Meta WhatsApp Configuration:

1. Set the callback URL.
2. Enter the same `WHATSAPP_VERIFY_TOKEN`.
3. Verify and save.
4. Subscribe to the `messages` field.

One shared endpoint serves all workspaces and routes events by Phone Number ID.

## 7. Run local checks

```bash
npm run lint
npm run build
```

Audit result on 2026-07-21: build passed; lint failed with React ref errors in Analytics and Inbox. No automated tests are configured.

## 8. Sandbox test sequence

After using non-production credentials and disposable data:

1. Send `hi`, `price`, `help`, and unmatched text.
2. Confirm contact, conversation, inbound, and outbound rows.
3. Verify bot/human/closed transitions in Inbox.
4. Send a manual reply and observe sent/delivered/read states.
5. Test duplicate webhook delivery and failure recovery.
6. Test an approved template with a tiny consented audience.
7. Test KB text/PDF ingestion and AI grounding.
8. Do **not** expose URL ingestion until SSRF protection is implemented.

The complete required matrix is in the readiness audit.

## Troubleshooting

- Verification failure: check public HTTPS reachability and verify-token equality.
- `401` webhook POST: check Meta app secret/signature configuration.
- No tenant found: Phone Number ID in `/settings` does not match webhook metadata.
- Send failure: check permanent token, permissions, test-recipient registration, and customer-service window.
- Dashboard redirects to onboarding: authenticated profile has no organization.
- Credential decrypt error: confirm `WHATSAPP_TOKEN_ENCRYPTION_KEY` matches the
  key used when the token was saved.
- AI falls back: check workspace toggle, Z.ai key, provider logs, and KB retrieval.
