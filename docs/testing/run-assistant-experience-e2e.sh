#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

project=${AAP_ASSISTANT_EXPERIENCE_E2E_PROJECT:-aap-assistant-e2e}
case "$project" in
  aap-assistant-e2e|aap-assistant-e2e-*) ;;
  *)
    echo "E2E project must use the aap-assistant-e2e prefix" >&2
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
temp_owner_file=
owns_project=false
project_lock_acquired=false
port_lock_acquired=false
run_token=
project_lock_dir="/tmp/$project.assistant-e2e.lock"
port_lock_dir="/tmp/aap-assistant-experience-e2e-port-8080.lock"

lock_is_owned() {
  lock_dir=$1
  [ -f "$lock_dir/token" ] || return 1
  lock_token=
  lock_token=$(cat "$lock_dir/token" 2>/dev/null) || return 1
  [ "$lock_token" = "$run_token" ]
}

release_owned_lock() {
  lock_dir=$1
  lock_acquired=$2
  if [ "$lock_acquired" != true ]; then
    return 0
  fi
  if ! lock_is_owned "$lock_dir"; then
    echo "E2E lock token changed; leaving $lock_dir for manual review" >&2
    return
  fi
  rm -f "$lock_dir/token"
  rmdir "$lock_dir" 2>/dev/null ||
    echo "E2E lock directory is not empty; leaving $lock_dir for manual review" >&2
}

cleanup_temp_dir() {
  if [ -z "$temp_dir" ]; then
    return 0
  fi
  if [ -z "$temp_owner_file" ] || [ ! -f "$temp_owner_file" ]; then
    echo "E2E temp ownership token is missing; leaving $temp_dir for manual review" >&2
    return
  fi
  temp_owner=$(cat "$temp_owner_file" 2>/dev/null || true)
  if [ "$temp_owner" != "$run_token" ]; then
    echo "E2E temp ownership token changed; leaving $temp_dir for manual review" >&2
    return
  fi
  if [ -n "$secret_dir" ] && [ -d "$secret_dir" ]; then
    for secret_path in "$secret_dir"/*; do
      [ -f "$secret_path" ] || continue
      rm -f "$secret_path"
    done
    rmdir "$secret_dir" 2>/dev/null ||
      echo "E2E secret directory is not empty; leaving it for manual review" >&2
  fi
  rm -f "$temp_owner_file"
  rmdir "$temp_dir" 2>/dev/null ||
    echo "E2E temp directory is not empty; leaving it for manual review" >&2
}

cleanup() {
  if [ "$owns_project" = true ] && command -v docker >/dev/null 2>&1 && [ -f "$env_file" ]; then
    if lock_is_owned "$project_lock_dir" && lock_is_owned "$port_lock_dir"; then
      docker compose -p "$project" --env-file "$env_file" $compose_files \
        down --rmi local -v --remove-orphans >/dev/null 2>&1 || true
    else
      echo "E2E ownership token changed; refusing docker compose down" >&2
    fi
  fi
  cleanup_temp_dir
  release_owned_lock "$port_lock_dir" "$port_lock_acquired"
  release_owned_lock "$project_lock_dir" "$project_lock_acquired"
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
command -v lsof >/dev/null 2>&1 || {
  echo "lsof is required to reserve TCP port 8080 safely" >&2
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
run_token=$(openssl rand -hex 16)
if ! mkdir "$project_lock_dir" 2>/dev/null; then
  echo "E2E project lock exists; inspect and remove stale locks manually" >&2
  exit 1
fi
project_lock_acquired=true
printf '%s\n' "$run_token" >"$project_lock_dir/token"
chmod 600 "$project_lock_dir/token"

if ! mkdir "$port_lock_dir" 2>/dev/null; then
  echo "E2E TCP port 8080 lock exists; another isolated run owns the port" >&2
  exit 1
fi
port_lock_acquired=true
printf '%s\n' "$run_token" >"$port_lock_dir/token"
chmod 600 "$port_lock_dir/token"

existing_containers=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
existing_volumes=$(docker volume ls -q --filter "label=com.docker.compose.project=$project")
existing_networks=$(docker network ls -q --filter "label=com.docker.compose.project=$project")
existing_labeled_images=$(docker image ls -q --filter "label=com.docker.compose.project=$project")
existing_named_images=$(docker image ls -q "$project-*")
if [ -n "$existing_containers$existing_volumes$existing_networks$existing_labeled_images$existing_named_images" ]; then
  echo "E2E project resources already exist; refusing ownership" >&2
  exit 1
fi
if lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "TCP port 8080 is already in use" >&2
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
. "$env_file"
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

export HTTP_PORT=8080
export PUBLIC_HOST=127.0.0.1
export ALLOW_LOCAL_VALIDATION_HOSTS=true
export ASSISTANT_PUBLIC_ORIGIN=http://127.0.0.1:8080
export ASSISTANT_PROVIDER_MODE=placeholder
export AGENT_ENABLED=false
export PNPM_REGISTRY=${PNPM_REGISTRY:-https://registry.npmjs.org}

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/aap-assistant-e2e.XXXXXX")
temp_owner_file="$temp_dir/owner-token"
(umask 077 && printf '%s\n' "$run_token" >"$temp_owner_file")
chmod 600 "$temp_owner_file"
secret_dir="$temp_dir/secrets"
mkdir -p "$secret_dir"
chmod 700 "$temp_dir" "$secret_dir"

materialize_secret() {
  variable_name=$1
  secret_name=$2
  secret_value=$3
  secret_path="$secret_dir/$secret_name"
  (umask 077 && printf '%s' "$secret_value" >"$secret_path")
  chmod 600 "$secret_path"
  export "$variable_name=$secret_path"
}

backup_encryption_key=$(secret)
os_security_key=$(secret)
assistant_session_secret=$(secret)
assistant_rate_limit_secret=$(secret)
model_api_key=$(secret)

materialize_secret POSTGRES_PASSWORD_FILE postgres_password "$POSTGRES_PASSWORD"
materialize_secret MIGRATOR_DATABASE_PASSWORD_FILE migrator_database_password "$MIGRATOR_DATABASE_PASSWORD"
materialize_secret RUNTIME_DATABASE_PASSWORD_FILE runtime_database_password "$RUNTIME_DATABASE_PASSWORD"
materialize_secret BACKUP_DATABASE_PASSWORD_FILE backup_database_password "$BACKUP_DATABASE_PASSWORD"
materialize_secret BACKUP_ENCRYPTION_KEY_FILE backup_encryption_key "$backup_encryption_key"
materialize_secret MIGRATOR_DATABASE_URL_FILE migrator_database_url "$MIGRATOR_DATABASE_URL"
materialize_secret RUNTIME_DATABASE_URL_FILE runtime_database_url "$RUNTIME_DATABASE_URL"
materialize_secret BETTER_AUTH_SECRET_FILE better_auth_secret "$BETTER_AUTH_SECRET"
materialize_secret OS_SECURITY_KEY_FILE os_security_key "$os_security_key"
materialize_secret ASSISTANT_SESSION_SECRET_FILE assistant_session_secret "$assistant_session_secret"
materialize_secret ASSISTANT_RATE_LIMIT_SECRET_FILE assistant_rate_limit_secret "$assistant_rate_limit_secret"
materialize_secret MODEL_API_KEY_FILE model_api_key "$model_api_key"

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
owns_project=true
docker compose -p "$project" --env-file "$env_file" $compose_files build migrate web
docker compose -p "$project" --env-file "$env_file" $compose_files up -d --wait db
docker compose -p "$project" --env-file "$env_file" $compose_files run --rm migrate
docker compose -p "$project" --env-file "$env_file" $compose_files run --rm \
  -e NODE_ENV=test migrate pnpm db:seed-auth-e2e
docker compose -p "$project" --env-file "$env_file" $compose_files up -d --wait web proxy

BASE_URL=http://127.0.0.1:8080 \
  pnpm --filter @ai-agent-platform/web exec playwright test \
  e2e/assistant-experience.spec.ts \
  e2e/pricing-assistant.spec.ts \
  --workers=1
