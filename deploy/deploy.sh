#!/usr/bin/env bash
# Pulls the requested image and (re)starts the app via docker compose. If the
# new version never reports healthy, automatically rolls back to whichever
# image was running before this script touched anything.
#
# Run from the directory containing docker-compose.yml and .env.local
# (production: /opt/whatsapp-bot). Set IMAGE_TAG to pin a specific build,
# e.g. for a manual rollback: IMAGE_TAG=<previous-git-sha> ./deploy.sh
#
# Does NOT run destructive cleanup (no `docker system prune`) and does not
# touch volumes — there are none to preserve (Supabase is external, no local
# session storage).
set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-15}"
SLEEP_SECONDS="${SLEEP_SECONDS:-2}"

wait_for_health() {
  local attempt=1
  until curl -sf "$HEALTH_URL" > /dev/null; do
    if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
      return 1
    fi
    echo "  attempt ${attempt}/${MAX_ATTEMPTS}: not ready yet, retrying in ${SLEEP_SECONDS}s..."
    attempt=$((attempt + 1))
    sleep "$SLEEP_SECONDS"
  done
  return 0
}

# Capture whatever is running right now, before touching anything, so a
# failed health check below can redeploy the last known-good version
# automatically instead of leaving production down.
PREVIOUS_CONTAINER_ID="$(docker compose ps -q app 2>/dev/null || true)"
PREVIOUS_IMAGE=""
if [ -n "$PREVIOUS_CONTAINER_ID" ]; then
  PREVIOUS_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$PREVIOUS_CONTAINER_ID" 2>/dev/null || true)"
fi

echo "==> Pulling image (IMAGE_TAG=${IMAGE_TAG:-main})"
docker compose pull

echo "==> Starting/updating services"
docker compose up -d

echo "==> Waiting for ${HEALTH_URL} to report healthy"
if wait_for_health; then
  echo "==> Healthy. Current status:"
  docker compose ps
  echo "==> Running image:"
  docker compose images app
  exit 0
fi

echo "Health check failed after ${MAX_ATTEMPTS} attempts" >&2
docker compose logs --tail=100 app

if [ -z "$PREVIOUS_IMAGE" ]; then
  echo "No previous known-good image to roll back to (this looks like the first deployment). Manual intervention required." >&2
  exit 1
fi

PREVIOUS_TAG="${PREVIOUS_IMAGE##*:}"
echo "==> Rolling back automatically to previous image: ${PREVIOUS_IMAGE}" >&2
IMAGE_TAG="$PREVIOUS_TAG" docker compose up -d

if wait_for_health; then
  echo "==> Rolled back successfully to ${PREVIOUS_IMAGE}. Deployment of the new version FAILED and was reverted." >&2
  exit 1
else
  echo "==> Rollback ALSO failed to become healthy. Manual intervention required immediately." >&2
  docker compose logs --tail=100 app
  exit 1
fi
