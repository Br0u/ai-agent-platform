#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

project="aap-agentos-backup-restore-$$"
env_file=
temp_dir=
secret_dir=
dump_dir=

cleanup() {
  if command -v docker >/dev/null 2>&1; then
    if [ -n "$env_file" ] && [ -f "$env_file" ]; then
      docker compose -p "$project" --env-file "$env_file" \
        down --rmi local -v --remove-orphans >/dev/null 2>&1 || true
    fi
  fi
  if [ -n "$temp_dir" ]; then
    rm -rf "$temp_dir"
  fi
  if [ -n "$env_file" ]; then
    rm -f "$env_file"
  fi
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

env_file=$(mktemp "$repo_root/.env.agentos-backup-restore.XXXXXX")
temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/aap-agentos-backup-restore.XXXXXX")
secret_dir="$temp_dir/secrets"
dump_dir="$temp_dir/dump"
mkdir -p "$secret_dir" "$dump_dir"

if [ "${AAP_AGENTOS_RESTORE_TEST_FAIL_AFTER_TEMP:-false}" = "true" ]; then
  exit 86
fi

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
backup_encryption_key=$(secret)
wrong_backup_encryption_key=$(secret)
agno_migrator_password=$(secret)
agno_runtime_password=$(secret)
better_auth_secret=$(secret)
os_security_key=$(secret)
database=ai_agent_platform_agentos_restore_test
owner=ai_agent_owner
platform_user_id=00000000-0000-4000-8000-000000000001
agno_session_id=backup-restore-session-fixture-v1

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
materialize_secret BACKUP_ENCRYPTION_KEY_FILE backup_encryption_key "$backup_encryption_key"
materialize_secret WRONG_BACKUP_ENCRYPTION_KEY_FILE wrong_backup_encryption_key "$wrong_backup_encryption_key"
materialize_secret AGNO_MIGRATOR_DATABASE_PASSWORD_FILE agno_migrator_database_password "$agno_migrator_password"
materialize_secret AGNO_DATABASE_PASSWORD_FILE agno_database_password "$agno_runtime_password"
materialize_secret MIGRATOR_DATABASE_URL_FILE migrator_database_url "postgresql://ai_agent_migrator:$migrator_password@db:5432/$database"
materialize_secret RUNTIME_DATABASE_URL_FILE runtime_database_url "postgresql://ai_agent_runtime:$runtime_password@db:5432/$database"
materialize_secret AGNO_MIGRATOR_DATABASE_URL_FILE agno_migrator_database_url "postgresql+psycopg_async://ai_agent_agno_migrator:$agno_migrator_password@db:5432/$database"
materialize_secret AGNO_DATABASE_URL_FILE agno_database_url "postgresql+psycopg_async://ai_agent_agno:$agno_runtime_password@db:5432/$database"
materialize_secret BETTER_AUTH_SECRET_FILE better_auth_secret "$better_auth_secret"
materialize_secret OS_SECURITY_KEY_FILE os_security_key "$os_security_key"

umask 077
cat >"$env_file" <<EOF
POSTGRES_DB=$database
POSTGRES_USER=$owner
POSTGRES_PASSWORD_FILE=$POSTGRES_PASSWORD_FILE
MIGRATOR_DATABASE_PASSWORD_FILE=$MIGRATOR_DATABASE_PASSWORD_FILE
RUNTIME_DATABASE_PASSWORD_FILE=$RUNTIME_DATABASE_PASSWORD_FILE
BACKUP_DATABASE_PASSWORD_FILE=$BACKUP_DATABASE_PASSWORD_FILE
BACKUP_ENCRYPTION_KEY_FILE=$BACKUP_ENCRYPTION_KEY_FILE
AGNO_MIGRATOR_DATABASE_PASSWORD_FILE=$AGNO_MIGRATOR_DATABASE_PASSWORD_FILE
AGNO_DATABASE_PASSWORD_FILE=$AGNO_DATABASE_PASSWORD_FILE
MIGRATOR_DATABASE_URL_FILE=$MIGRATOR_DATABASE_URL_FILE
RUNTIME_DATABASE_URL_FILE=$RUNTIME_DATABASE_URL_FILE
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
BACKUP_RUN_ONCE=true
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
compose up -d --no-deps agent

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
    assert payload == {"ready": True, "capability": "placeholder"}
    assert type(payload["ready"]) is bool
    assert type(payload["capability"]) is str
' >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "AgentOS readiness did not become ready" >&2
    exit 1
  fi
  sleep 1
done
echo "AgentOS ready: ready=true capability=placeholder"

compose exec -T db psql -v ON_ERROR_STOP=1 -U "$owner" -d "$database" -c \
  "INSERT INTO public.users (id, name, email, identity_realm, status, email_verification_status)
   VALUES ('$platform_user_id'::uuid, 'backup restore fixture', 'backup-restore-fixture@example.invalid', 'customer', 'active', 'verified')" \
  >/dev/null
compose exec -T db psql -v ON_ERROR_STOP=1 -U "$owner" -d "$database" -c \
  "INSERT INTO agno.agno_sessions (session_id, session_type, created_at)
   VALUES ('$agno_session_id', 'agent', 0)" \
  >/dev/null

platform_user_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM public.users")"
agno_session_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM agno.agno_sessions")"
platform_fixture_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM public.users WHERE id = '$platform_user_id'::uuid")"
agno_fixture_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM agno.agno_sessions WHERE session_id = '$agno_session_id'")"

if [ "$platform_user_count" -le 0 ] || \
   [ "$agno_session_count" -le 0 ] || \
   [ "$platform_fixture_count" != "1" ] || \
   [ "$agno_fixture_count" != "1" ]; then
  echo "fixture setup failed" >&2
  exit 1
fi
echo "Backup fixture counts: users=$platform_user_count agno_sessions=$agno_session_count"

compose up -d --no-deps backup

backup_volume="${project}_backup_data"
attempt=0
until docker run --rm -v "$backup_volume:/backups:ro" \
  postgres:18.3-alpine3.23 sh -c \
  'find /backups -maxdepth 1 -type f -name "ai-agent-platform-*.dump.enc" | grep -q .' \
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
  'dump=$(find /backups -maxdepth 1 -type f -name "ai-agent-platform-*.dump.enc" | head -n 1); test -n "$dump"; cp "$dump" /out/generated.dump.enc; chmod 0600 /out/generated.dump.enc'

backup_crypto_image="$(compose images -q backup)"
[ -n "$backup_crypto_image" ] || {
  echo "backup crypto image was not built" >&2
  exit 1
}

wrong_key_output="$temp_dir/wrong-key.log"
if BACKUP_ENCRYPTION_KEY_FILE="$WRONG_BACKUP_ENCRYPTION_KEY_FILE" \
  BACKUP_CRYPTO_IMAGE="$backup_crypto_image" \
  infra/docker/restore-drill.sh \
    "$dump_dir/generated.dump.enc" \
    "$platform_user_count" \
    "$agno_session_count" \
    "$platform_user_id" \
    "$agno_session_id" >"$wrong_key_output" 2>&1; then
  echo "restore unexpectedly accepted a wrong encryption key" >&2
  exit 1
fi
for sensitive_value in \
  "$backup_password" \
  "$backup_encryption_key" \
  "$wrong_backup_encryption_key" \
  "backup restore fixture" \
  "backup-restore-fixture@example.invalid"; do
  if grep -F "$sensitive_value" "$wrong_key_output" >/dev/null 2>&1; then
    echo "wrong-key restore leaked protected data" >&2
    exit 1
  fi
done
rm -f "$wrong_key_output"
echo "wrong encryption key was rejected"

BACKUP_ENCRYPTION_KEY_FILE="$BACKUP_ENCRYPTION_KEY_FILE" \
BACKUP_CRYPTO_IMAGE="$backup_crypto_image" \
infra/docker/restore-drill.sh \
  "$dump_dir/generated.dump.enc" \
  "$platform_user_count" \
  "$agno_session_count" \
  "$platform_user_id" \
  "$agno_session_id"
echo "AgentOS backup and restore acceptance passed"
