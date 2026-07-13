#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

project=aap-assistant-e2e
compose_files="-f compose.yaml -f compose.e2e.yaml"
env_file=.env.e2e

cleanup() {
  docker compose -p "$project" --env-file "$env_file" $compose_files \
    down -v --remove-orphans >/dev/null 2>&1 || true
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

if [ ! -f "$env_file" ]; then
  postgres_password=$(secret)
  migrator_password=$(secret)
  runtime_password=$(secret)
  backup_password=$(secret)
  better_auth_secret=$(secret)
  customer_password=$(secret)
  staff_password=$(secret)
  admin_password=$(secret)
  pending_customer_session=$(secret)
  disabled_customer_session=$(secret)
  staff_session=$(secret)
  role_target_session=$(secret)
  admin_session=$(secret)
  no_totp_admin_session=$(secret)
  revoked_session=$(secret)
  replacement_password=$(secret)

  umask 077
  cat >"$env_file" <<EOF
POSTGRES_DB=ai_agent_platform_e2e
POSTGRES_USER=ai_agent_owner
POSTGRES_PASSWORD=$postgres_password
MIGRATOR_DATABASE_PASSWORD=$migrator_password
RUNTIME_DATABASE_PASSWORD=$runtime_password
BACKUP_DATABASE_PASSWORD=$backup_password
MIGRATOR_DATABASE_URL=postgresql://ai_agent_migrator:$migrator_password@db:5432/ai_agent_platform_e2e
RUNTIME_DATABASE_URL=postgresql://ai_agent_runtime:$runtime_password@db:5432/ai_agent_platform_e2e
BACKUP_DATABASE_URL=postgresql://ai_agent_backup:$backup_password@db:5432/ai_agent_platform_e2e
DATABASE_URL=postgresql://ai_agent_migrator:$migrator_password@db:5432/ai_agent_platform_e2e
TEST_DATABASE_URL=postgresql://ai_agent_migrator:$migrator_password@db:5432/ai_agent_platform_e2e_test
BETTER_AUTH_SECRET=$better_auth_secret
BETTER_AUTH_URL=http://127.0.0.1:8080
BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:8080
HTTP_PORT=8080
PUBLIC_HOST=127.0.0.1
ALLOW_LOCAL_VALIDATION_HOSTS=true
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_DAYS=14
FEATURE_EMAIL_VERIFICATION=false
E2E_CUSTOMER_PASSWORD=$customer_password
E2E_STAFF_PASSWORD=$staff_password
E2E_ADMIN_PASSWORD=$admin_password
E2E_PENDING_CUSTOMER_SESSION_TOKEN=$pending_customer_session
E2E_DISABLED_CUSTOMER_SESSION_TOKEN=$disabled_customer_session
E2E_STAFF_SESSION_TOKEN=$staff_session
E2E_ROLE_TARGET_SESSION_TOKEN=$role_target_session
E2E_ADMIN_SESSION_TOKEN=$admin_session
E2E_NO_TOTP_ADMIN_SESSION_TOKEN=$no_totp_admin_session
E2E_REVOKED_SESSION_TOKEN=$revoked_session
E2E_REPLACEMENT_PASSWORD=$replacement_password
EOF
fi

chmod 600 "$env_file" || {
  echo "failed to set $env_file permissions to 600" >&2
  exit 1
}

if env_permissions=$(stat -f %Lp "$env_file" 2>/dev/null); then
  :
elif env_permissions=$(stat -c %a "$env_file" 2>/dev/null); then
  :
else
  echo "unable to verify $env_file permissions" >&2
  exit 1
fi

[ "$env_permissions" = "600" ] || {
  echo "$env_file permissions must be 600" >&2
  exit 1
}

set -a
. "./$env_file"
set +a

required_variables="
POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
MIGRATOR_DATABASE_PASSWORD RUNTIME_DATABASE_PASSWORD BACKUP_DATABASE_PASSWORD
MIGRATOR_DATABASE_URL RUNTIME_DATABASE_URL BACKUP_DATABASE_URL DATABASE_URL TEST_DATABASE_URL
BETTER_AUTH_SECRET BETTER_AUTH_URL BETTER_AUTH_TRUSTED_ORIGINS
HTTP_PORT PUBLIC_HOST ALLOW_LOCAL_VALIDATION_HOSTS
BACKUP_INTERVAL_SECONDS BACKUP_RETENTION_DAYS FEATURE_EMAIL_VERIFICATION
E2E_CUSTOMER_PASSWORD E2E_STAFF_PASSWORD E2E_ADMIN_PASSWORD
E2E_PENDING_CUSTOMER_SESSION_TOKEN E2E_DISABLED_CUSTOMER_SESSION_TOKEN
E2E_STAFF_SESSION_TOKEN E2E_ROLE_TARGET_SESSION_TOKEN
E2E_ADMIN_SESSION_TOKEN E2E_NO_TOTP_ADMIN_SESSION_TOKEN
E2E_REVOKED_SESSION_TOKEN E2E_REPLACEMENT_PASSWORD
"

for name in $required_variables; do
  eval "value=\${$name-}"
  if [ -z "$value" ]; then
    echo "$name is required in $env_file" >&2
    exit 1
  fi
done

[ "$PUBLIC_HOST" = "127.0.0.1" ] || {
  echo "PUBLIC_HOST must be 127.0.0.1 for isolated E2E" >&2
  exit 1
}
[ "$BETTER_AUTH_URL" = "http://127.0.0.1:8080" ] || {
  echo "BETTER_AUTH_URL must use the E2E proxy" >&2
  exit 1
}
[ "$BETTER_AUTH_TRUSTED_ORIGINS" = "http://127.0.0.1:8080" ] || {
  echo "BETTER_AUTH_TRUSTED_ORIGINS must use the E2E proxy" >&2
  exit 1
}

docker compose -p "$project" --env-file "$env_file" $compose_files config --quiet
docker compose -p "$project" --env-file "$env_file" $compose_files build migrate web
docker compose -p "$project" --env-file "$env_file" $compose_files up -d --wait db
docker compose -p "$project" --env-file "$env_file" $compose_files run --rm migrate
docker compose -p "$project" --env-file "$env_file" $compose_files run --rm \
  -e NODE_ENV=test migrate pnpm db:seed-auth-e2e
docker compose -p "$project" --env-file "$env_file" $compose_files up -d --wait web proxy

BASE_URL=http://127.0.0.1:8080 \
  pnpm --filter @ai-agent-platform/web exec playwright test \
  e2e/assistant-experience.spec.ts
