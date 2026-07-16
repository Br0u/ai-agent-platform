#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

project=${AAP_ASSISTANT_RUNTIME_E2E_PROJECT:-aap-assistant-runtime-e2e}
case "$project" in
  aap-assistant-runtime-e2e|aap-assistant-runtime-e2e-*) ;;
  *)
    echo "E2E project must use the aap-assistant-runtime-e2e prefix" >&2
    exit 1
    ;;
esac
case "$project" in
  *[!A-Za-z0-9_.-]*)
    echo "E2E project contains unsafe characters" >&2
    exit 1
    ;;
esac

compose_files="-f compose.yaml -f compose.e2e.yaml"
env_file="$repo_root/.env.e2e"
temp_dir=
secret_dir=
owns_project=false
lock_acquired=false
run_token=
lock_dir=

release_lock() {
  if [ "$lock_acquired" != true ] || [ -z "$lock_dir" ]; then
    return
  fi
  lock_token=
  if [ -f "$lock_dir/token" ]; then
    lock_token=$(cat "$lock_dir/token" 2>/dev/null || true)
  fi
  if [ "$lock_token" = "$run_token" ]; then
    rm -f "$lock_dir/token"
    rmdir "$lock_dir" 2>/dev/null || true
    lock_acquired=false
  else
    echo "E2E lock token changed; leaving lock for manual review" >&2
  fi
}

cleanup() {
  if [ "$owns_project" = true ] && command -v docker >/dev/null 2>&1 && [ -f "$env_file" ]; then
    docker compose -p "$project" --env-file "$env_file" $compose_files \
      down --rmi local -v --remove-orphans >/dev/null 2>&1 || true
  fi
  if [ -n "$temp_dir" ]; then
    rm -rf "$temp_dir"
  fi
  release_lock
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

runtime_tmp=${TMPDIR:-/tmp}
case "$runtime_tmp" in
  /*) ;;
  *)
    echo "TMPDIR must be an absolute path" >&2
    exit 1
    ;;
esac
umask 077
lock_root="${runtime_tmp%/}/aap-assistant-runtime-e2e-locks"
mkdir -p "$lock_root"
chmod 700 "$lock_root"
lock_dir="$lock_root/$project.lock"
run_token=$(openssl rand -hex 16)
if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "E2E project lock exists; inspect and remove stale locks manually" >&2
  exit 1
fi
lock_acquired=true
printf '%s\n' "$run_token" >"$lock_dir/token"
chmod 600 "$lock_dir/token"

existing_containers=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
existing_volumes=$(docker volume ls -q --filter "label=com.docker.compose.project=$project")
existing_networks=$(docker network ls -q --filter "label=com.docker.compose.project=$project")
existing_labeled_images=$(docker image ls -q --filter "label=com.docker.compose.project=$project")
existing_named_images=$(docker image ls -q "$project-*")
if [ -n "$existing_containers$existing_volumes$existing_networks$existing_labeled_images$existing_named_images" ]; then
  echo "E2E project resources already exist; refusing ownership" >&2
  release_lock
  exit 1
fi
if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "TCP port 8080 is already in use" >&2
  release_lock
  exit 1
fi

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
POSTGRES_DB=ai_agent_platform_runtime_e2e
POSTGRES_USER=ai_agent_owner
POSTGRES_PASSWORD=$postgres_password
MIGRATOR_DATABASE_PASSWORD=$migrator_password
RUNTIME_DATABASE_PASSWORD=$runtime_password
BACKUP_DATABASE_PASSWORD=$backup_password
MIGRATOR_DATABASE_URL=postgresql://ai_agent_migrator:$migrator_password@db:5432/ai_agent_platform_runtime_e2e
RUNTIME_DATABASE_URL=postgresql://ai_agent_runtime:$runtime_password@db:5432/ai_agent_platform_runtime_e2e
DATABASE_URL=postgresql://ai_agent_migrator:$migrator_password@db:5432/ai_agent_platform_runtime_e2e
TEST_DATABASE_URL=postgresql://ai_agent_migrator:$migrator_password@db:5432/ai_agent_platform_runtime_e2e_test
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
  echo "failed to set .env.e2e permissions to 600" >&2
  exit 1
}
if env_permissions=$(stat -f %Lp "$env_file" 2>/dev/null); then
  :
elif env_permissions=$(stat -c %a "$env_file" 2>/dev/null); then
  :
else
  echo "unable to verify .env.e2e permissions" >&2
  exit 1
fi
[ "$env_permissions" = "600" ] || {
  echo ".env.e2e permissions must be 600" >&2
  exit 1
}

set -a
. "$env_file"
set +a

required_variables="
POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
MIGRATOR_DATABASE_PASSWORD RUNTIME_DATABASE_PASSWORD BACKUP_DATABASE_PASSWORD
MIGRATOR_DATABASE_URL RUNTIME_DATABASE_URL DATABASE_URL TEST_DATABASE_URL
BETTER_AUTH_SECRET BETTER_AUTH_URL BETTER_AUTH_TRUSTED_ORIGINS
E2E_CUSTOMER_PASSWORD E2E_STAFF_PASSWORD E2E_ADMIN_PASSWORD
E2E_PENDING_CUSTOMER_SESSION_TOKEN E2E_DISABLED_CUSTOMER_SESSION_TOKEN
E2E_STAFF_SESSION_TOKEN E2E_ROLE_TARGET_SESSION_TOKEN
E2E_ADMIN_SESSION_TOKEN E2E_NO_TOTP_ADMIN_SESSION_TOKEN
E2E_REVOKED_SESSION_TOKEN E2E_REPLACEMENT_PASSWORD
"
for name in $required_variables; do
  eval "value=\${$name-}"
  if [ -z "$value" ]; then
    echo "$name is required in .env.e2e" >&2
    exit 1
  fi
done

[ "$BETTER_AUTH_URL" = "http://127.0.0.1:8080" ] || {
  echo "BETTER_AUTH_URL must use the E2E proxy" >&2
  exit 1
}
[ "$BETTER_AUTH_TRUSTED_ORIGINS" = "http://127.0.0.1:8080" ] || {
  echo "BETTER_AUTH_TRUSTED_ORIGINS must use the E2E proxy" >&2
  exit 1
}

export HTTP_PORT=8080
export PUBLIC_HOST=127.0.0.1
export ALLOW_LOCAL_VALIDATION_HOSTS=true
export ASSISTANT_PUBLIC_ORIGIN=http://127.0.0.1:8080
[ "$ASSISTANT_PUBLIC_ORIGIN" = "http://127.0.0.1:8080" ] || {
  echo "ASSISTANT_PUBLIC_ORIGIN must be the exact loopback E2E proxy" >&2
  exit 1
}
export ASSISTANT_PROVIDER_MODE=placeholder
export AGENT_ENABLED=false
export ASSISTANT_AGENTOS_READINESS_TTL_MS=1000
export ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS=500
export ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD=1
export ASSISTANT_AGENTOS_CIRCUIT_RESET_MS=2000
export BACKUP_RUN_ONCE=true
# The repository default remains the China mirror; isolated acceptance can use
# the official registry when that mirror is unavailable without editing .npmrc.
export PNPM_REGISTRY=${PNPM_REGISTRY:-https://registry.npmjs.org}

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/aap-assistant-runtime-e2e.XXXXXX")
secret_dir="$temp_dir/secrets"
mkdir -p "$secret_dir"
chmod 700 "$temp_dir" "$secret_dir"

agno_migrator_password=$(secret)
agno_runtime_password=$(secret)
backup_encryption_key=$(secret)
os_security_key=$(secret)
assistant_session_secret=$(secret)
assistant_rate_limit_secret=$(secret)
model_api_key=$(secret)

materialize_secret() {
  variable_name=$1
  secret_name=$2
  secret_value=$3
  secret_path="$secret_dir/$secret_name"
  (umask 077 && printf '%s' "$secret_value" >"$secret_path")
  chmod 600 "$secret_path"
  export "$variable_name=$secret_path"
}

materialize_secret POSTGRES_PASSWORD_FILE postgres_password "$POSTGRES_PASSWORD"
materialize_secret MIGRATOR_DATABASE_PASSWORD_FILE migrator_database_password "$MIGRATOR_DATABASE_PASSWORD"
materialize_secret RUNTIME_DATABASE_PASSWORD_FILE runtime_database_password "$RUNTIME_DATABASE_PASSWORD"
materialize_secret BACKUP_DATABASE_PASSWORD_FILE backup_database_password "$BACKUP_DATABASE_PASSWORD"
materialize_secret BACKUP_ENCRYPTION_KEY_FILE backup_encryption_key "$backup_encryption_key"
materialize_secret AGNO_MIGRATOR_DATABASE_PASSWORD_FILE agno_migrator_database_password "$agno_migrator_password"
materialize_secret AGNO_DATABASE_PASSWORD_FILE agno_database_password "$agno_runtime_password"
materialize_secret MIGRATOR_DATABASE_URL_FILE migrator_database_url "$MIGRATOR_DATABASE_URL"
materialize_secret RUNTIME_DATABASE_URL_FILE runtime_database_url "$RUNTIME_DATABASE_URL"
materialize_secret AGNO_MIGRATOR_DATABASE_URL_FILE agno_migrator_database_url "postgresql+psycopg_async://ai_agent_agno_migrator:$agno_migrator_password@db:5432/$POSTGRES_DB"
materialize_secret AGNO_DATABASE_URL_FILE agno_database_url "postgresql+psycopg_async://ai_agent_agno:$agno_runtime_password@db:5432/$POSTGRES_DB"
materialize_secret BETTER_AUTH_SECRET_FILE better_auth_secret "$BETTER_AUTH_SECRET"
materialize_secret OS_SECURITY_KEY_FILE os_security_key "$os_security_key"
materialize_secret ASSISTANT_SESSION_SECRET_FILE assistant_session_secret "$assistant_session_secret"
materialize_secret ASSISTANT_RATE_LIMIT_SECRET_FILE assistant_rate_limit_secret "$assistant_rate_limit_secret"
materialize_secret MODEL_API_KEY_FILE model_api_key "$model_api_key"

compose() {
  docker compose -p "$project" --env-file "$env_file" $compose_files "$@"
}

compose config --quiet
owns_project=true
compose build migrate web agent backup
compose up -d --wait db
compose run --rm migrate
compose run --rm migrate
compose run --rm agno-bootstrap
compose run --rm agno-bootstrap
compose run --rm --no-deps agent-migrate
compose run --rm --no-deps agent-migrate
compose up -d --no-deps --wait agent
compose run --rm -e NODE_ENV=test migrate pnpm db:seed-auth-e2e
compose up -d --no-deps --wait web
compose up -d --no-deps --wait proxy
compose run --rm --no-deps -e BACKUP_RUN_ONCE=true backup

web_port_bindings=$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$(compose ps -q web)")
agent_port_bindings=$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$(compose ps -q agent)")
case "$web_port_bindings" in
  '{}'|'null') ;;
  *)
  echo "Web unexpectedly publishes a host port" >&2
  exit 1
  ;;
esac
case "$agent_port_bindings" in
  '{}'|'null') ;;
  *)
  echo "AgentOS unexpectedly publishes a host port" >&2
  exit 1
  ;;
esac

export AAP_RUNTIME_E2E_PROJECT="$project"
export AAP_RUNTIME_E2E_ENV_FILE="$env_file"
BASE_URL=http://127.0.0.1:8080 \
  pnpm --filter @ai-agent-platform/web exec playwright test \
  e2e/assistant-runtime.spec.ts --project=desktop --workers=1

logs_file="$temp_dir/sanitized-runtime.log"
compose logs --no-color web agent proxy >"$logs_file" 2>&1
for protected_value in \
  "$POSTGRES_PASSWORD" \
  "$MIGRATOR_DATABASE_PASSWORD" \
  "$RUNTIME_DATABASE_PASSWORD" \
  "$BACKUP_DATABASE_PASSWORD" \
  "$BETTER_AUTH_SECRET" \
  "$agno_migrator_password" \
  "$agno_runtime_password" \
  "$backup_encryption_key" \
  "$os_security_key" \
  "$assistant_session_secret" \
  "$assistant_rate_limit_secret" \
  "$model_api_key"; do
  if grep -F "$protected_value" "$logs_file" >/dev/null 2>&1; then
    echo "sanitized container logs contain protected runtime data" >&2
    exit 1
  fi
done

echo "Assistant runtime E2E passed; no Web/Agent host ports and cleanup is armed."
