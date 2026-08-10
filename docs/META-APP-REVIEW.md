# Meta App Review Preparation

Reviewer-facing information and setup instructions for submitting this app
for Meta App Review (WhatsApp Business Platform). This doc documents *how*
to prepare a reviewer account/tenant and what to submit — it never contains
real credentials. See [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) and
[DEPLOYMENT.md](DEPLOYMENT.md) for the underlying infrastructure.

> **Verification note**: every code-level claim below (routes, auth flow,
> admin APIs, webhook behavior) was checked directly against the source in
> this repo. Anything that depends on external state — DNS, a live server,
> an actual Meta app/WABA — is marked `EXTERNAL DEPENDENCY` and has not been
> and cannot be verified from this repo alone.

## Public application pages

| Page | URL | Status |
|---|---|---|
| Landing page | `https://bot.jewelxtech.com/` | Built this workstream (`src/app/page.tsx`) |
| Privacy Policy | `https://bot.jewelxtech.com/privacy` | Existed, expanded this workstream (`src/app/privacy/page.tsx`) |
| Terms of Service | `https://bot.jewelxtech.com/terms` | Existed, expanded this workstream (`src/app/terms/page.tsx`) |
| Data Deletion | `https://bot.jewelxtech.com/data-deletion` | Existed, expanded this workstream (`src/app/data-deletion/page.tsx`) |
| Sign in | `https://bot.jewelxtech.com/login` | Pre-existing |
| Webhook | `https://bot.jewelxtech.com/api/webhook` | Pre-existing (Meta Cloud API, signature-verified) |
| Health | `https://bot.jewelxtech.com/api/health` | Added in the prior production-readiness workstream |

## Reviewer login

**Reviewer login URL**: `https://bot.jewelxtech.com/login`

**Reviewer credentials**:
```
Reviewer email:    [configured separately]
Reviewer password: [configured separately]
```

> Credentials must be supplied directly in the Meta App Review submission
> form, never committed to GitHub or displayed on the public website.

### How an administrator creates this account

The platform's only administrative identity is whoever is signed in with the
email matching `PLATFORM_SUPER_ADMIN_EMAIL` — there is no separate
"reviewer bypass." An operator creates a normal tenant account for the
reviewer using the existing admin portal (`src/app/admin/(portal)/users`,
backed by `POST /api/admin/users` in `src/app/api/admin/users/route.ts`):

1. Sign in at `https://bot.jewelxtech.com/admin/login` as the platform
   operator.
2. Go to **Organizations** and create (or reuse) the reviewer demo
   organization — see [Reviewer tenant](#reviewer-tenant--sample-data)
   below.
3. Go to **Users** and create a user:
   - Email: an address you control for the review (not committed anywhere)
   - Password: a strong, generated password (not committed anywhere)
   - Workspace: the reviewer demo organization
   - Role: `owner` (so the reviewer can see Settings and confirm WhatsApp
     credentials are connected)
4. Supply that email/password to Meta only through the official App Review
   submission form's credential fields.

No code changes were made to support this — it uses the existing
admin-provisioning flow as-is, per the instruction not to build an
artificial auth bypass for Meta.

## Reviewer tenant / sample data

**Status: MANUAL ACTION** — no seed tooling exists in this repo
(`supabase/config.toml` explicitly disables seeding), so a reviewer tenant
must be created manually through the admin portal / dashboard UI, the same
way any other workspace is created. There is nothing to "extend safely" —
building an automated seed script was judged out of scope for this
workstream (it would need to run against a live database, which doesn't
exist yet for this deployment).

Suggested tenant name: **JewelX AI Meta Review Demo**

Manual setup steps once a server/database exists:

1. As platform operator, create the organization **JewelX AI Meta Review
   Demo** (Organizations → New).
2. Create the reviewer user as described above, scoped to this
   organization.
3. Sign in as the reviewer and, in **Settings**, connect the demo WhatsApp
   Phone Number ID and access token (see below).
4. Add one demo knowledge-base article via **Knowledge** (e.g. a short FAQ
   about a fictional product) using only fabricated/test content — never
   real customer material.
5. Add one demo contact via **Contacts** using a test phone number you
   control (e.g. your own reviewer phone), never a real customer's number.
6. Optionally create one keyword auto-reply via **Auto-replies** (e.g.
   `hello` → a canned greeting) so the reviewer sees deterministic behavior
   before relying on the AI path.

Never seed real customer messages, real customer phone numbers, or
credentials into migrations or seed files.

## Demo WhatsApp number

**Status: EXTERNAL DEPENDENCY** — this section is a template; fill in once a
Meta-provisioned test number exists.

```
Display name:      [configured separately]
WhatsApp number:    [configured separately]
Meta App:           [configured separately]
WABA:                [configured separately]
Phone Number ID:    [configured separately]
```

Do not commit the permanent access token for this number anywhere in this
repository. It is entered once, through the dashboard UI (`/settings`),
which stores it AES-256-GCM encrypted at rest (`src/lib/secrets.ts`) — never
in an env file or migration.

### Reviewer test flow

Verified against the actual webhook/bot/AI/whatsapp code paths in this repo:

1. Reviewer sends `Hello` to the demo WhatsApp number.
2. Meta delivers a webhook `POST` to `https://bot.jewelxtech.com/api/webhook`.
3. The handler verifies the `X-Hub-Signature-256` HMAC, resolves the owning
   organization by `phone_number_id`, and stores the inbound message
   (`src/app/api/webhook/route.ts`).
4. If a keyword rule matches, that fixed reply is sent
   (`src/lib/bot.ts`). Otherwise, if the workspace has AI enabled and is
   under its daily quota, the configured AI provider (GLM/Gemini/OpenRouter,
   with automatic failover) generates a response, optionally grounded in the
   workspace's knowledge base (`src/lib/ai.ts`, `src/lib/kb.ts`).
5. The bot sends the reply through the WhatsApp Cloud API
   (`src/lib/whatsapp.ts`).
6. The conversation appears in the reviewer tenant's **Inbox** in real time
   — this is current, verified product behavior (`src/app/(dashboard)/inbox/page.tsx`
   uses Supabase Realtime).

## Meta data-deletion callback

**Status: NOT CONFIGURED — not required for the current app model.**

Searched the codebase for `signed_request`, a deletion callback route, or
any Facebook/Meta deauthorization webhook handler: none exist
(`src/app/api/**` has no such route). This app only uses the WhatsApp
Business Platform (Cloud API) for messaging — it does not implement
"Facebook Login for Business" or request Graph API permissions that read a
Meta user's personal data, which is the scenario that requires a signed
Data Deletion Request callback URL. For a WhatsApp-Cloud-API-only app, Meta
App Review requires the **public data-deletion instructions URL**, which
this app has: `https://bot.jewelxtech.com/data-deletion`.

If the app's Meta configuration is later extended to use Facebook Login or
another product that reads Meta user data, a signed-request-verified
callback endpoint would need to be added at that time, implemented per
Meta's documented HMAC-signed-request validation — not before, and not as a
placeholder now, per the instruction not to invent an insecure callback.

## Review submission checklist

| Item | Value | Status |
|---|---|---|
| Public application URL | `https://bot.jewelxtech.com/` | `MANUAL ACTION` — page is built and verified locally; not yet live until DNS + server exist |
| Privacy Policy | `https://bot.jewelxtech.com/privacy` | `MANUAL ACTION` — same as above |
| Terms of Service | `https://bot.jewelxtech.com/terms` | `MANUAL ACTION` — same as above |
| Data deletion | `https://bot.jewelxtech.com/data-deletion` | `MANUAL ACTION` — same as above |
| Login | `https://bot.jewelxtech.com/login` | `MANUAL ACTION` — same as above |
| Reviewer username/email | supplied privately in Meta review | `MANUAL ACTION` — account not yet created (no server/DB) |
| Reviewer password | supplied privately in Meta review | `MANUAL ACTION` — same |
| Demo WhatsApp number | supplied in Meta review | `EXTERNAL DEPENDENCY` — requires a Meta-provisioned test number |
| Demo tenant prepared | "JewelX AI Meta Review Demo" | `MANUAL ACTION` — documented above, not yet executed |
| Demo conversation/test steps prepared | see [Reviewer test flow](#reviewer-test-flow) | `READY` — documented and verified against code |
| WhatsApp webhook reachable | `/api/webhook` | `MANUAL ACTION` — code is correct and tested locally; not reachable until deployed with DNS/TLS |
| Meta webhook verification succeeds | `GET /api/webhook` (`hub.challenge`) | `READY` — implemented and unit-testable; not yet exercised against a live Meta app |
| Meta webhook signature verification enabled | `WHATSAPP_APP_SECRET`, fails closed | `READY` — implemented, verified by direct code read (`src/app/api/webhook/route.ts`) |
| WhatsApp messaging permissions documented | `whatsapp_business_messaging`, `whatsapp_business_management` (standard Cloud API permissions this app's message-send/webhook/template flows require) | `READY` — matches what the code actually calls (`src/lib/whatsapp.ts`); exact approved permission set is still Meta's call |
| Screen recording | — | `NOT READY` — not produced; only needed if Meta's current review flow requests one for the specific permissions applied for |

Nothing above is claimed complete unless it was directly verified against
this repo. Items depending on DNS, a live server, or a real Meta
app/WABA are marked `MANUAL ACTION` or `EXTERNAL DEPENDENCY` and remain
outstanding.
