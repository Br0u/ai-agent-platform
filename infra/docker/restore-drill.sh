#!/bin/sh

set -eu

backup_file="${1:-}"
if [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
  echo "usage: $0 /absolute/path/to/ai-agent-platform-*.dump" >&2
  exit 64
fi

case "$backup_file" in
  /*) ;;
  *) backup_file="$(pwd)/$backup_file" ;;
esac

run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
container="aap-restore-drill-$run_id"
volume="aap-restore-drill-$run_id"
password="$(openssl rand -hex 32)"
database="restore_drill"
owner="restore_owner"
expected_migrations="6"
expected_latest_migration="1783854600000"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker volume create "$volume" >/dev/null
docker run -d --name "$container" \
  -e POSTGRES_DB="$database" \
  -e POSTGRES_USER="$owner" \
  -e POSTGRES_PASSWORD="$password" \
  -v "$volume:/var/lib/postgresql" \
  -v "$(dirname "$backup_file"):/restore:ro" \
  postgres:18.3-alpine3.23 >/dev/null

attempt=0
until docker exec "$container" pg_isready -U "$owner" -d "$database" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "restore drill database did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec "$container" pg_restore \
  --username="$owner" --dbname="$database" --clean --if-exists --no-owner --no-acl \
  "/restore/$(basename "$backup_file")"

migration_count="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM drizzle.__drizzle_migrations")"
latest_migration="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT max(created_at) FROM drizzle.__drizzle_migrations")"
schema_contract="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT
     to_regclass('public.users') IS NOT NULL
     AND to_regclass('public.sessions') IS NOT NULL
     AND to_regclass('public.audit_logs') IS NOT NULL
     AND to_regclass('public.roles') IS NOT NULL
     AND to_regclass('agno.agno_sessions') IS NOT NULL
     AND to_regclass('agno.agno_schema_versions') IS NOT NULL
     AND to_regclass('public.users_email_lower_unique') IS NOT NULL
     AND to_regclass('public.audit_logs_created_id_desc_idx') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_limits_key_unique')
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sessions_identity_boundary_guard' AND NOT tgisinternal)")"
user_count="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM public.users")"
agno_session_count="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM agno.agno_sessions")"
agno_schema_version_count="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM agno.agno_schema_versions")"

if [ "$migration_count" != "$expected_migrations" ] || \
   [ "$latest_migration" != "$expected_latest_migration" ] || \
   [ "$schema_contract" != "t" ] || \
   [ "$agno_schema_version_count" -lt 1 ]; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi

echo "restore drill passed: migrations=$migration_count latest=$latest_migration users=$user_count agno_sessions=$agno_session_count agno_schema_versions=$agno_schema_version_count"
