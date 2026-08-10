#!/usr/bin/env bash
# Triggers the broadcast worker endpoint (POST /api/worker/broadcasts).
# Intended to run on a schedule (systemd timer — see deploy/systemd/ — or
# cron) on the production host, replacing vercel.json's cron for a
# self-hosted Docker deployment.
#
# Reads CRON_SECRET from .env.local and passes it to curl via a temporary
# --config file rather than a command-line argument, so the secret does not
# appear in `ps` output.
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE="${ENV_FILE:-.env.local}"
WORKER_URL="${WORKER_URL:-http://127.0.0.1:3000/api/worker/broadcasts}"

if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE not found" >&2
  exit 1
fi

CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
if [ -z "$CRON_SECRET" ]; then
  echo "CRON_SECRET not set in $ENV_FILE" >&2
  exit 1
fi

CURL_CONFIG="$(mktemp)"
trap 'rm -f "$CURL_CONFIG"' EXIT
printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET" > "$CURL_CONFIG"
chmod 600 "$CURL_CONFIG"

curl -sf -X POST -K "$CURL_CONFIG" "$WORKER_URL" -o /dev/null -w "worker responded: %{http_code}\n"
