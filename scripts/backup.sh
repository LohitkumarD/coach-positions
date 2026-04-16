#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
outfile="backup-${timestamp}.sql.gz"
pg_dump "${DATABASE_URL}" | gzip > "${outfile}"
echo "Created ${outfile}"
