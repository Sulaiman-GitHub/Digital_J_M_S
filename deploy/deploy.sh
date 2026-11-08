#!/bin/sh
# Run on the server after the new files are unpacked: rebuild and restart what changed.
set -eu
cd "$(dirname "$0")"
docker compose --env-file .env.prod up -d --build
# The unpacked website replaces the web folder, so Caddy must re-attach to the new one.
docker compose --env-file .env.prod restart caddy
docker image prune -f >/dev/null
docker compose --env-file .env.prod ps
