#!/usr/bin/env bash
# Applies pending drizzle migrations to the production (Neon) database.
# Reads DATABASE_URL from .env.production.local without printing it.
set -euo pipefail
cd "$(dirname "$0")/.."
url="$(grep -E '^DATABASE_URL=' .env.production.local | head -1 | cut -d= -f2- | tr -d '"')"
if [ -z "$url" ]; then echo "DATABASE_URL not found in .env.production.local" >&2; exit 1; fi
DATABASE_URL="$url" pnpm db:migrate
