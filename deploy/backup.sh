#!/bin/sh
# Nightly database dump, run by cron on the server. Keeps the last 7 days.
set -eu
cd "$(dirname "$0")"
mkdir -p backups
docker compose --env-file .env.prod exec -T db pg_dump -U djm_user -d djm | gzip > "backups/djm-$(date +%F).sql.gz"
find backups -name 'djm-*.sql.gz' -mtime +7 -delete
