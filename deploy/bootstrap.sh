#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production. Copy .env.production.example and fill it first." >&2
  exit 1
fi

set -a
source .env.production
set +a

: "${PUBLIC_HOST:?PUBLIC_HOST is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD is required}"
: "${CLERK_PUBLISHABLE_KEY:?CLERK_PUBLISHABLE_KEY is required}"
: "${CLERK_SECRET_KEY:?CLERK_SECRET_KEY is required}"
: "${INTERNAL_API_TOKEN:?INTERNAL_API_TOKEN is required}"

exec docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
