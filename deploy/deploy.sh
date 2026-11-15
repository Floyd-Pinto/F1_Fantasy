#!/usr/bin/env bash
# Runs on the server (called by Jenkins over SSH). Pulls the latest code and rebuilds the stack.
# One-time server setup: install Docker, clone the repo to $APP_DIR, and create $APP_DIR/.env with
# JWT_SECRET, JWT_REFRESH_SECRET and (optionally) SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/F1_Fantasy}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

# Wait for the API to come up healthy.
for i in $(seq 1 30); do
    if curl -fsS http://localhost:4000/health >/dev/null; then
        echo "Deploy OK"
        exit 0
    fi
    sleep 2
done
echo "API did not become healthy" >&2
docker compose logs --tail=100 backend >&2
exit 1
