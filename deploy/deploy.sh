#!/usr/bin/env bash
# Pulls the latest image and (re)starts the app via docker compose.
#
# Run from the directory containing docker-compose.yml and .env.local
# (production: /opt/whatsapp-bot). Set IMAGE_TAG to pin a specific build,
# e.g. for rollback: IMAGE_TAG=<previous-git-sha> ./deploy.sh
#
# Does NOT run destructive cleanup (no `docker system prune`) and does not
# touch volumes — there are none to preserve (Supabase is external, no local
# session storage).
set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-15}"
SLEEP_SECONDS="${SLEEP_SECONDS:-2}"

echo "==> Pulling image (IMAGE_TAG=${IMAGE_TAG:-main})"
docker compose pull

echo "==> Starting/updating services"
docker compose up -d

echo "==> Waiting for ${HEALTH_URL} to report healthy"
attempt=1
until curl -sf "$HEALTH_URL" > /dev/null; do
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "Health check failed after ${MAX_ATTEMPTS} attempts" >&2
    docker compose logs --tail=100 app
    exit 1
  fi
  echo "  attempt ${attempt}/${MAX_ATTEMPTS}: not ready yet, retrying in ${SLEEP_SECONDS}s..."
  attempt=$((attempt + 1))
  sleep "$SLEEP_SECONDS"
done

echo "==> Healthy. Current status:"
docker compose ps
echo "==> Running image:"
docker compose images app
