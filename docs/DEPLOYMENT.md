# Deployment — Docker + CI/CD

Step-by-step guide for self-hosted Docker deployment via GitHub Actions →
GHCR → a single Linux server. For the Vercel path, see
[07-deployment.md](07-deployment.md#option-b--vercel) — both remain
supported. For what was inspected/found before writing this guide, see
[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).

> **Status**: the CI pipeline (`.github/workflows/ci.yml`) is fully built and
> verified (see [Verification](#verification)). The deploy pipeline
> (`.github/workflows/deploy.yml`) and this guide's server-setup steps are
> written and internally consistent, but **no production server exists yet**
> — the SSH deploy step and live `bot.jewelxtech.com` health check have not
> been exercised end-to-end. The `deploy` job is gated behind a
> `DEPLOY_ENABLED` repository variable so it stays inert until a server is
> provisioned (see [Enabling deploys](#enabling-deploys) below).

## Architecture

```
GitHub  →  GitHub Actions (ci.yml)  →  GitHub Actions (deploy.yml)  →  GHCR
                                              │
                                              ▼
                                    SSH into production server
                                              │
                                              ▼
                              docker compose pull && up -d
                                              │
                                              ▼
                          host nginx (bot.jewelxtech.com, TLS) → app:3000
```

- Image registry: `ghcr.io/jewelx-ai/whatsapp-bot-ai`, **public** (no secrets
  are ever baked into the image — only the two public `NEXT_PUBLIC_*`
  values — so the server can `docker pull` with zero credentials).
- Reverse proxy: **host-level nginx + certbot**, not a container — simplest,
  most-documented Let's Encrypt renewal pattern, and keeps
  `docker-compose.yml` limited to the app service.
- No database/Redis containers — Supabase is external/hosted, and broadcasts
  use the existing DB-backed queue.

## Initial server setup

Recommended instance: **2GB RAM, amd64** (e.g. AWS Lightsail/EC2 `t3.small`).
Reasoning: this app has no Puppeteer/Chromium dependency (pure HTTP webhook
architecture — the generic "512MB may be insufficient" caution for
WhatsApp-Web-style bots does not apply here). The actual memory driver is
occasional PDF/DOCX knowledge-base upload parsing (`unpdf`/`mammoth`, up to
the app's 20MB cap) plus OS/Docker/nginx overhead; 2GB gives comfortable
headroom without needing careful tuning. A 1GB instance is workable at low
upload volume but carries real OOM risk under concurrent large-file
ingestion — only choose it with memory monitoring/alerting in place.

Open ports: **80 and 443 only**. The app's internal port (3000) should not
be exposed publicly — nginx proxies to it over `127.0.0.1`. Restrict SSH
(22) to known IPs where possible.

1. Provision the instance, point DNS (`bot.jewelxtech.com` A/AAAA record) at
   its public IP.
2. Install Docker Engine + the Compose plugin, nginx, and certbot.
3. Create the deployment directory:
   ```bash
   sudo mkdir -p /opt/whatsapp-bot
   sudo chown "$USER" /opt/whatsapp-bot
   ```
4. Copy `docker-compose.yml` and `deploy/deploy.sh` from this repo into
   `/opt/whatsapp-bot/` (the server does not need a git clone — only these
   two files plus the env file below).
   ```bash
   chmod +x /opt/whatsapp-bot/deploy.sh
   ```

## First deployment

1. Create the production env file from the tracked template:
   ```bash
   cp .env.local.example /opt/whatsapp-bot/.env.local
   chmod 600 /opt/whatsapp-bot/.env.local
   ```
   Fill in real values (see [Environment variables](#environment-variables)
   below). This file is never committed and never touched by CI/CD — it's
   provisioned once, manually, on the server.
2. Pull and start:
   ```bash
   cd /opt/whatsapp-bot
   IMAGE_TAG=main ./deploy.sh
   ```
3. Install the reverse proxy config:
   ```bash
   sudo cp deploy/nginx/bot.jewelxtech.com.conf /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/bot.jewelxtech.com.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. Issue the TLS certificate:
   ```bash
   sudo certbot --nginx -d bot.jewelxtech.com
   ```
   Certbot rewrites the `listen 443` block and sets up auto-renewal via its
   own systemd timer — no extra automation needed.
5. Verify: `curl https://bot.jewelxtech.com/api/health` → `{"status":"UP"}`.
6. Register `https://bot.jewelxtech.com/api/webhook` in the Meta app and
   subscribe to `messages`.

## Normal deployment flow

Push to `main` → `ci.yml` runs (lint/typecheck/test/build/Docker build
verification) → on success, `deploy.yml` builds and pushes the image to GHCR
tagged with both the git SHA and `main`, then (once enabled — see below)
SSHes into the server and runs `deploy.sh`.

Manual fallback (or for the first deployment before CI/CD is wired up):
```bash
ssh <user>@<server>
cd /opt/whatsapp-bot
IMAGE_TAG=main ./deploy.sh
```

### Enabling deploys

The `deploy` job in `.github/workflows/deploy.yml` is gated behind a
repository variable so it stays inert until a server exists:

1. Add repository secrets: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`
   (a private key whose matching public key is authorized on the server for
   `SERVER_USER`).
2. Add repository secrets `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used only as public Docker build args).
3. Add repository **variable** `DEPLOY_ENABLED=true`.
4. Push to `main` — the deploy job will now run.

## Environment variables

Names only — see `.env.local.example` in the repo root for the authoritative,
grouped, commented list (Core/Next, Supabase, WhatsApp, AI providers,
Knowledge base, Cron/admin). Never commit real values.

## DNS + SSL

- `bot.jewelxtech.com` A (and/or AAAA) record → server public IP.
- TLS via certbot's nginx plugin (`certbot --nginx`), see above. Renewal is
  automatic via certbot's own systemd timer — no custom automation.

## Logs

```bash
docker compose logs -f app
```

## Restart

```bash
docker compose restart app
```

## Health check

```bash
curl https://bot.jewelxtech.com/api/health
# {"status":"UP"}
```

Docker/Compose also run a `HEALTHCHECK` against the same endpoint every 30s;
`docker compose ps` shows the current health status.

## Rollback

`docker-compose.yml`'s `image:` field reads `IMAGE_TAG` (defaulting to
`main`), so rollback is a one-line env change:

```bash
cd /opt/whatsapp-bot
IMAGE_TAG=<previous-git-sha> ./deploy.sh
```

Find the previous SHA from the GHCR package's tag list or `git log` on
`main`.

## Broadcast worker (non-Vercel cron)

`vercel.json`'s daily cron only applies on Vercel. For this Docker
deployment, trigger the same endpoint from a host crontab (documentation
only — no automation is built for this, per project scope):

```cron
# Every 5 minutes; adjust to desired broadcast latency
*/5 * * * * curl -s -X POST https://bot.jewelxtech.com/api/worker/broadcasts \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/whatsapp-bot-worker.log 2>&1
```

Store `CRON_SECRET` for the cron job the same way it's stored in
`/opt/whatsapp-bot/.env.local` (e.g. read it from that file in a small
wrapper script rather than hardcoding it in the crontab).

## Backup / state handling

No application-managed Docker volumes exist — Supabase (external) owns all
durable state (messages, contacts, broadcasts, KB documents/embeddings), and
there is no local WhatsApp session store. The only server-local state
worth backing up is `/opt/whatsapp-bot/.env.local` itself. Database
backup/restore is a Supabase-side concern, not covered here.

## Verification

Commands actually run against this repo as part of this workstream (dummy
credentials — process boot and health-route checks only, not live
WhatsApp/AI/Supabase calls):

```bash
npm ci
npm run lint
npm run typecheck
npm test
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
npm run build

docker build -t whatsapp-bot-ai:local \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key .
docker compose config

docker run -d --name whatsapp-bot-ai-test -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
  -e SUPABASE_SERVICE_ROLE_KEY=placeholder \
  -e WHATSAPP_VERIFY_TOKEN=placeholder \
  -e WHATSAPP_APP_SECRET=placeholder \
  -e WHATSAPP_TOKEN_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
  -e CRON_SECRET=placeholder \
  -e AI_PROVIDER=glm \
  whatsapp-bot-ai:local
curl -sf http://localhost:3000/api/health
docker inspect --format='{{.State.Health.Status}}' whatsapp-bot-ai-test
docker stop whatsapp-bot-ai-test && docker rm whatsapp-bot-ai-test
```

Results are recorded in the final report delivered alongside this
workstream. `nginx -t` and an end-to-end `deploy.yml` run are deferred until
a real server exists — not claimed as tested.
