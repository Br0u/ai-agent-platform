#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

project="aap-agentos-backup-restore-$$"
env_file=$(mktemp "$repo_root/.env.agentos-backup-restore.XXXXXX")
temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/aap-agentos-backup-restore.XXXXXX")
secret_dir="$temp_dir/secrets"
dump_dir="$temp_dir/dump"
mkdir -p "$secret_dir" "$dump_dir"

cleanup() {
  docker compose -p "$project" --env-file "$env_file" \
    down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$temp_dir"
  rm -f "$env_file"
}

on_signal() {
  code=$1
  cleanup
  trap - EXIT
  exit "$code"
}

trap cleanup EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

command -v docker >/dev/null 2>&1 || {
  echo "docker is required" >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required" >&2
  exit 1
}

secret() {
  openssl rand -hex 32
}

postgres_password=$(secret)
migrator_password=$(secret)
runtime_password=$(secret)
backup_password=$(secret)
agno_migrator_password=$(secret)
agno_runtime_password=$(secret)
better_auth_secret=$(secret)
os_security_key=$(secret)
database=ai_agent_platform_agentos_restore_test

materialize_secret() {
  variable_name=$1
  secret_name=$2
  secret_value=$3
  secret_path="$secret_dir/$secret_name"
  (umask 077 && printf '%s' "$secret_value" >"$secret_path")
  chmod 600 "$secret_path"
  eval "$variable_name=\$secret_path"
  export "$variable_name"
}

materialize_secret POSTGRES_PASSWORD_FILE postgres_password "$postgres_password"
materialize_secret MIGRATOR_DATABASE_PASSWORD_FILE migrator_database_password "$migrator_password"
materialize_secret RUNTIME_DATABASE_PASSWORD_FILE runtime_database_password "$runtime_password"
materialize_secret BACKUP_DATABASE_PASSWORD_FILE backup_database_password "$backup_password"
materialize_secret AGNO_MIGRATOR_DATABASE_PASSWORD_FILE agno_migrator_database_password "$agno_migrator_password"
materialize_secret AGNO_DATABASE_PASSWORD_FILE agno_database_password "$agno_runtime_password"
materialize_secret MIGRATOR_DATABASE_URL_FILE migrator_database_url "postgresql://ai_agent_migrator:$migrator_password@db:5432/$database"
materialize_secret RUNTIME_DATABASE_URL_FILE runtime_database_url "postgresql://ai_agent_runtime:$runtime_password@db:5432/$database"
materialize_secret BACKUP_DATABASE_URL_FILE backup_database_url "postgresql://ai_agent_backup:$backup_password@db:5432/$database"
materialize_secret AGNO_MIGRATOR_DATABASE_URL_FILE agno_migrator_database_url "postgresql+psycopg_async://ai_agent_agno_migrator:$agno_migrator_password@db:5432/$database"
materialize_secret AGNO_DATABASE_URL_FILE agno_database_url "postgresql+psycopg_async://ai_agent_agno:$agno_runtime_password@db:5432/$database"
materialize_secret BETTER_AUTH_SECRET_FILE better_auth_secret "$better_auth_secret"
materialize_secret OS_SECURITY_KEY_FILE os_security_key "$os_security_key"

umask 077
cat >"$env_file" <<EOF
POSTGRES_DB=$database
POSTGRES_USER=ai_agent_owner
POSTGRES_PASSWORD_FILE=$POSTGRES_PASSWORD_FILE
MIGRATOR_DATABASE_PASSWORD_FILE=$MIGRATOR_DATABASE_PASSWORD_FILE
RUNTIME_DATABASE_PASSWORD_FILE=$RUNTIME_DATABASE_PASSWORD_FILE
BACKUP_DATABASE_PASSWORD_FILE=$BACKUP_DATABASE_PASSWORD_FILE
AGNO_MIGRATOR_DATABASE_PASSWORD_FILE=$AGNO_MIGRATOR_DATABASE_PASSWORD_FILE
AGNO_DATABASE_PASSWORD_FILE=$AGNO_DATABASE_PASSWORD_FILE
MIGRATOR_DATABASE_URL_FILE=$MIGRATOR_DATABASE_URL_FILE
RUNTIME_DATABASE_URL_FILE=$RUNTIME_DATABASE_URL_FILE
BACKUP_DATABASE_URL_FILE=$BACKUP_DATABASE_URL_FILE
AGNO_MIGRATOR_DATABASE_URL_FILE=$AGNO_MIGRATOR_DATABASE_URL_FILE
AGNO_DATABASE_URL_FILE=$AGNO_DATABASE_URL_FILE
BETTER_AUTH_SECRET_FILE=$BETTER_AUTH_SECRET_FILE
OS_SECURITY_KEY_FILE=$OS_SECURITY_KEY_FILE
BETTER_AUTH_URL=http://127.0.0.1:8080
BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:8080
PUBLIC_HOST=127.0.0.1
ALLOW_LOCAL_VALIDATION_HOSTS=true
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_DAYS=14
EOF
chmod 600 "$env_file"
if env_permissions=$(stat -f %Lp "$env_file" 2>/dev/null); then
  :
elif env_permissions=$(stat -c %a "$env_file" 2>/dev/null); then
  :
else
  echo "unable to verify temporary env permissions" >&2
  exit 1
fi
[ "$env_permissions" = "600" ] || {
  echo "temporary env permissions must be 600" >&2
  exit 1
}

compose() {
  docker compose -p "$project" --env-file "$env_file" "$@"
}

compose config --quiet
compose build migrate agent backup
compose up -d --wait db
compose run --rm migrate
compose run --rm agno-bootstrap
compose run --rm --no-deps agent-migrate
compose up -d --no-deps agent backup

attempt=0
until compose exec -T agent python -c '
import json
import pathlib
import urllib.request

key = pathlib.Path("/run/secrets/os_security_key").read_text().strip()
request = urllib.request.Request(
    "http://127.0.0.1:7777/internal/health/ready",
    headers={"Authorization": "Bearer " + key},
)
with urllib.request.urlopen(request, timeout=3) as response:
    payload = json.load(response)
    assert response.status == 200
    assert payload.get("ready") is True
    assert payload.get("capability") == "placeholder"
' >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "AgentOS readiness did not become ready" >&2
    exit 1
  fi
  sleep 1
done
echo "AgentOS ready: ready=true capability=placeholder"

backup_volume="${project}_backup_data"
attempt=0
until docker run --rm -v "$backup_volume:/backups:ro" \
  postgres:18.3-alpine3.23 sh -c \
  'find /backups -maxdepth 1 -type f -name "ai-agent-platform-*.dump" | grep -q .' \
  >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "backup dump was not generated" >&2
    exit 1
  fi
  sleep 1
done

docker run --rm \
  -v "$backup_volume:/backups:ro" \
  -v "$dump_dir:/out" \
  postgres:18.3-alpine3.23 sh -c \
  'dump=$(find /backups -maxdepth 1 -type f -name "ai-agent-platform-*.dump" | head -n 1); test -n "$dump"; cp "$dump" /out/generated.dump; chmod 0644 /out/generated.dump'

infra/docker/restore-drill.sh "$dump_dir/generated.dump"
echo "AgentOS backup and restore acceptance passed"
