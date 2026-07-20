#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

command -v docker >/dev/null 2>&1 || {
  echo "CMS documents E2E failed: docker is required" >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  echo "CMS documents E2E failed: openssl is required" >&2
  exit 1
}
command -v curl >/dev/null 2>&1 || {
  echo "CMS documents E2E failed: curl is required" >&2
  exit 1
}

umask 077
run_token=$(openssl rand -hex 8)
project_base=${AAP_CMS_DOCUMENTS_E2E_PROJECT:-aap-cms-documents-e2e}
case "$project_base" in
  aap-cms-documents-e2e|aap-cms-documents-e2e-*) ;;
  *)
    echo "CMS documents E2E failed: unsafe project prefix" >&2
    exit 1
    ;;
esac
case "$project_base" in
  *[!A-Za-z0-9_.-]*)
    echo "CMS documents E2E failed: unsafe project characters" >&2
    exit 1
    ;;
esac
project="$project_base-$run_token"
compose_files="-f compose.yaml"
temp_dir=
secret_dir=
owner_file=
owns_project=false
cleanup_complete=false
port_lock=/tmp/aap-cms-documents-e2e-port-18080.lock
port_lock_owned=false

compose() {
  docker compose -p "$project" $compose_files "$@"
}

project_resources() {
  containers=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
  volumes=$(docker volume ls -q --filter "label=com.docker.compose.project=$project")
  networks=$(docker network ls -q --filter "label=com.docker.compose.project=$project")
  printf '%s%s%s' "$containers" "$volumes" "$networks"
}

cleanup() {
  [ "$cleanup_complete" = false ] || return 0
  cleanup_failed=false
  if [ "$owns_project" = true ]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || cleanup_failed=true
    if [ -n "$(project_resources)" ]; then
      echo "CMS documents E2E failed: Compose resources remain after cleanup" >&2
      cleanup_failed=true
    fi
  fi
  if [ -n "$temp_dir" ] && [ -d "$temp_dir" ]; then
    if [ -z "$owner_file" ] || [ ! -f "$owner_file" ] ||
      [ "$(cat "$owner_file" 2>/dev/null || true)" != "$run_token" ]; then
      echo "CMS documents E2E failed: temporary directory ownership changed" >&2
      cleanup_failed=true
    else
      rm -rf -- "$temp_dir"
    fi
  fi
  if [ "$port_lock_owned" = true ]; then
    lock_token=$(cat "$port_lock/token" 2>/dev/null || true)
    if [ "$lock_token" = "$run_token" ]; then
      rm -f "$port_lock/token"
      rmdir "$port_lock" 2>/dev/null || cleanup_failed=true
    else
      echo "CMS documents E2E failed: port lock ownership changed" >&2
      cleanup_failed=true
    fi
  fi
  [ "$cleanup_failed" = false ] || return 1
  cleanup_complete=true
}

on_exit() {
  status=$?
  trap - EXIT INT TERM
  cleanup || status=1
  exit "$status"
}

trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail() {
  echo "CMS documents E2E failed: $1" >&2
  exit 1
}

runtime_tmp=${TMPDIR:-/tmp}
case "$runtime_tmp" in
  /*) ;;
  *) fail "TMPDIR must be absolute" ;;
esac
temp_dir=$(mktemp -d "$runtime_tmp/aap-cms-documents-e2e.XXXXXX") ||
  fail "temporary secret directory creation"
owner_file="$temp_dir/owner-token"
printf '%s\n' "$run_token" >"$owner_file"
chmod 600 "$owner_file"
secret_dir="$temp_dir/secrets"
mkdir "$secret_dir"
chmod 700 "$temp_dir" "$secret_dir"

if ! mkdir "$port_lock" 2>/dev/null; then
  fail "TCP port 18080 is owned by another acceptance run"
fi
port_lock_owned=true
printf '%s\n' "$run_token" >"$port_lock/token"
chmod 600 "$port_lock/token"

[ -z "$(project_resources)" ] || fail "unique Compose project already has resources"

secret() {
  openssl rand -hex 32
}

materialize_secret() {
  variable_name=$1
  filename=$2
  value=$3
  path="$secret_dir/$filename"
  printf '%s' "$value" >"$path"
  chmod 600 "$path"
  export "$variable_name=$path"
}

export POSTGRES_DB=ai_agent_platform_cms_e2e
export POSTGRES_USER=ai_agent_owner
export POSTGRES_PASSWORD=$(secret)
export MIGRATOR_DATABASE_PASSWORD=$(secret)
export RUNTIME_DATABASE_PASSWORD=$(secret)
export BACKUP_DATABASE_PASSWORD=$(secret)
export BETTER_AUTH_SECRET=$(secret)
export MIGRATOR_DATABASE_URL="postgresql://ai_agent_migrator:$MIGRATOR_DATABASE_PASSWORD@db:5432/$POSTGRES_DB"
export RUNTIME_DATABASE_URL="postgresql://ai_agent_runtime:$RUNTIME_DATABASE_PASSWORD@db:5432/$POSTGRES_DB"
export BETTER_AUTH_URL=http://127.0.0.1:18080
export BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:18080
export ASSISTANT_PUBLIC_ORIGIN=http://127.0.0.1:18080
export HTTP_PORT=18080
export PUBLIC_HOST=127.0.0.1
export ALLOW_LOCAL_VALIDATION_HOSTS=true
export FEATURE_EMAIL_VERIFICATION=false
export ASSISTANT_PROVIDER_MODE=placeholder
export PNPM_REGISTRY=${PNPM_REGISTRY:-https://registry.npmjs.org}
export CMS_DOCUMENTS_E2E_RUN_ID=$run_token

materialize_secret POSTGRES_PASSWORD_FILE postgres_password "$POSTGRES_PASSWORD"
materialize_secret MIGRATOR_DATABASE_PASSWORD_FILE migrator_database_password "$MIGRATOR_DATABASE_PASSWORD"
materialize_secret RUNTIME_DATABASE_PASSWORD_FILE runtime_database_password "$RUNTIME_DATABASE_PASSWORD"
materialize_secret BACKUP_DATABASE_PASSWORD_FILE backup_database_password "$BACKUP_DATABASE_PASSWORD"
materialize_secret MIGRATOR_DATABASE_URL_FILE migrator_database_url "$MIGRATOR_DATABASE_URL"
materialize_secret RUNTIME_DATABASE_URL_FILE runtime_database_url "$RUNTIME_DATABASE_URL"
materialize_secret BETTER_AUTH_SECRET_FILE better_auth_secret "$BETTER_AUTH_SECRET"
materialize_secret OS_SECURITY_KEY_FILE os_security_key "$(secret)"
materialize_secret AGENT_CONFIG_CONTROL_KEY_FILE agent_config_control_key "$(secret)"
materialize_secret ASSISTANT_SESSION_SECRET_FILE assistant_session_secret "$(secret)"
materialize_secret ASSISTANT_RATE_LIMIT_SECRET_FILE assistant_rate_limit_secret "$(secret)"

for name in \
  E2E_CUSTOMER_PASSWORD E2E_STAFF_PASSWORD E2E_ADMIN_PASSWORD \
  E2E_PENDING_CUSTOMER_SESSION_TOKEN E2E_DISABLED_CUSTOMER_SESSION_TOKEN \
  E2E_STAFF_SESSION_TOKEN E2E_ROLE_TARGET_SESSION_TOKEN \
  E2E_ADMIN_SESSION_TOKEN E2E_NO_TOTP_ADMIN_SESSION_TOKEN \
  E2E_MODEL_ADMIN_SESSION_TOKEN E2E_MODEL_ADMIN_STALE_SESSION_TOKEN \
  E2E_REVOKED_SESSION_TOKEN E2E_REPLACEMENT_PASSWORD
do
  eval "export $name=$(secret)"
done

pnpm --filter @ai-agent-platform/document-content seed:check ||
  fail "DOCUMENT_SEED_MANIFEST verification"

manifest_values=$(pnpm --filter @ai-agent-platform/document-content exec \
  node --import tsx --input-type=module --eval '
  import { DOCUMENT_SEED_MANIFEST } from "./src/seed.ts";
  const quote = String.fromCharCode(39);
  process.stdout.write(DOCUMENT_SEED_MANIFEST.map(({ slug, bodyChecksum }) => `(${quote}${slug}${quote},${quote}${bodyChecksum}${quote})`).join(","));
') || fail "DOCUMENT_SEED_MANIFEST loading"
manifest_slugs=$(pnpm --filter @ai-agent-platform/document-content exec \
  node --import tsx --input-type=module --eval '
  import { DOCUMENT_SEED_MANIFEST } from "./src/seed.ts";
  process.stdout.write(DOCUMENT_SEED_MANIFEST.map(({ slug }) => slug).join(" "));
') || fail "DOCUMENT_SEED_MANIFEST slug loading"

owns_project=true
compose config --quiet || fail "Compose configuration"
compose build migrate web || fail "current Web and migrator image build"
compose up -d --wait db || fail "isolated PostgreSQL startup"
compose run --rm migrate || fail "migration/backfill and grant steps"
compose run --rm \
  -e NODE_ENV=test \
  -e E2E_CUSTOMER_PASSWORD -e E2E_STAFF_PASSWORD -e E2E_ADMIN_PASSWORD \
  -e E2E_PENDING_CUSTOMER_SESSION_TOKEN -e E2E_DISABLED_CUSTOMER_SESSION_TOKEN \
  -e E2E_STAFF_SESSION_TOKEN -e E2E_ROLE_TARGET_SESSION_TOKEN \
  -e E2E_ADMIN_SESSION_TOKEN -e E2E_NO_TOTP_ADMIN_SESSION_TOKEN \
  -e E2E_MODEL_ADMIN_SESSION_TOKEN -e E2E_MODEL_ADMIN_STALE_SESSION_TOKEN \
  -e E2E_REVOKED_SESSION_TOKEN -e E2E_REPLACEMENT_PASSWORD \
  migrate pnpm db:seed-auth-e2e || fail "test-only workforce fixture seed"

seed_validation=$(compose exec -T db psql \
  -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -c "
WITH manifest(slug, checksum) AS (VALUES $manifest_values),
document_content AS (
  SELECT c.*, m.checksum AS expected_checksum
  FROM content c JOIN manifest m ON m.slug = c.slug
  WHERE c.type = 'document'
), manifest_mismatches AS (
  SELECT count(*) AS count
  FROM manifest m
  LEFT JOIN content c ON c.type = 'document' AND c.slug = m.slug
  LEFT JOIN content_revisions cr ON cr.content_id = c.id AND cr.revision = 1
  WHERE c.id IS NULL OR cr.id IS NULL
    OR c.body->>'checksum' IS DISTINCT FROM m.checksum
    OR cr.body->>'checksum' IS DISTINCT FROM m.checksum
    OR c.body IS DISTINCT FROM cr.body
    OR c.body->>'source' IS NULL OR c.body->'renderModel' IS NULL
)
SELECT
  (SELECT count(*) FROM content WHERE type = 'document'),
  (SELECT count(*) FROM content_revisions cr JOIN content c ON c.id = cr.content_id WHERE c.type = 'document' AND cr.revision = 1),
  (SELECT count(*) FROM content_routes r JOIN content c ON c.id = r.content_id WHERE c.type = 'document' AND r.state = 'canonical'),
  (SELECT count(*) FROM content_routes r JOIN content c ON c.id = r.content_id WHERE c.type = 'document' AND r.state = 'alias'),
  (SELECT count(*) FROM content_routes r JOIN content c ON c.id = r.content_id WHERE c.type = 'document' AND r.state = 'reserved'),
  (SELECT count FROM manifest_mismatches),
  (SELECT count(*) FROM document_content WHERE status <> 'published' OR published_revision <> 1);
") || fail "seven-row PostgreSQL validation query"
if [ "$seed_validation" != "7|7|7|0|0|0|0" ]; then
  seed_diagnostics=$(compose exec -T db psql \
    -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -c "
WITH manifest(slug, checksum) AS (VALUES $manifest_values)
SELECT
  m.slug,
  c.id IS NOT NULL,
  cr.id IS NOT NULL,
  c.body->>'checksum' IS NOT DISTINCT FROM m.checksum,
  cr.body->>'checksum' IS NOT DISTINCT FROM m.checksum,
  c.body IS NOT DISTINCT FROM cr.body,
  c.body->>'source' IS NOT NULL,
  c.body->'renderModel' IS NOT NULL
FROM manifest m
LEFT JOIN content c ON c.type = 'document' AND c.slug = m.slug
LEFT JOIN content_revisions cr ON cr.content_id = c.id AND cr.revision = 1
WHERE c.id IS NULL OR cr.id IS NULL
  OR c.body->>'checksum' IS DISTINCT FROM m.checksum
  OR cr.body->>'checksum' IS DISTINCT FROM m.checksum
  OR c.body IS DISTINCT FROM cr.body
  OR c.body->>'source' IS NULL OR c.body->'renderModel' IS NULL;
") || fail "seven-row PostgreSQL diagnostic query"
  fail "seven-row/revision/route/source-render checksum validation ($seed_validation; $seed_diagnostics)"
fi

compose up -d --no-deps --wait web || fail "current Web image startup"
compose up -d --no-deps --wait proxy || fail "isolated proxy startup"

db_container=$(compose ps -q db)
web_container=$(compose ps -q web)
[ -n "$db_container" ] && [ -n "$web_container" ] ||
  fail "database/Web container discovery"
db_restart_baseline=$(docker inspect --format '{{.RestartCount}}' "$db_container")
web_restart_baseline=$(docker inspect --format '{{.RestartCount}}' "$web_container")
[ "$db_restart_baseline" = "0" ] && [ "$web_restart_baseline" = "0" ] ||
  fail "database/Web restarted before browser acceptance"

export BASE_URL=http://127.0.0.1:18080
pnpm --filter @ai-agent-platform/web exec playwright test e2e/cms-documents.spec.ts --project=desktop --project=mobile --workers=1 ||
  fail "Playwright CMS lifecycle at desktop/mobile viewports"

published_manifest_count() {
  compose exec -T db psql \
    -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "
WITH manifest(slug, checksum) AS (VALUES $manifest_values)
SELECT count(*)
FROM manifest m
JOIN content c ON c.type = 'document' AND c.slug = m.slug
JOIN content_revisions cr
  ON cr.content_id = c.id AND cr.revision = c.published_revision
JOIN content_routes r
  ON r.content_id = c.id AND r.slug = m.slug AND r.state = 'canonical'
WHERE c.status = 'published' AND c.deleted_at IS NULL
  AND c.body->>'checksum' = m.checksum
  AND cr.body->>'checksum' = m.checksum
  AND c.body IS NOT DISTINCT FROM cr.body
  AND cr.body->>'source' IS NOT NULL
  AND cr.body->'renderModel' IS NOT NULL;
"
}

check_http() {
  path=$1
  status=$(curl --noproxy '*' --max-time 10 -sS -o "$temp_dir/http-body" \
    -w '%{http_code}' "$BASE_URL$path") || return 1
  [ "$status" -lt 500 ]
}

SOAK_SECONDS=${CMS_DOCUMENTS_SOAK_SECONDS:-600}
SOAK_INTERVAL_SECONDS=15
case "$SOAK_SECONDS" in
  ''|*[!0-9]*) fail "invalid soak duration" ;;
esac
[ "$SOAK_SECONDS" -ge 600 ] || fail "soak duration cannot be shorter than 600 seconds"
soak_started=$(date +%s)
while :; do
  check_http /docs || fail "10-minute soak /docs response"
  for slug in $manifest_slugs; do
    check_http "/docs/$slug" || fail "10-minute soak /docs/$slug response"
  done
  [ "$(published_manifest_count)" = "7" ] ||
    fail "10-minute soak published checksum validation"
  [ "$(docker inspect --format '{{.RestartCount}}' "$db_container")" = "$db_restart_baseline" ] ||
    fail "database restart during 10-minute soak"
  [ "$(docker inspect --format '{{.RestartCount}}' "$web_container")" = "$web_restart_baseline" ] ||
    fail "Web restart during 10-minute soak"
  now=$(date +%s)
  [ $((now - soak_started)) -ge "$SOAK_SECONDS" ] && break
  sleep "$SOAK_INTERVAL_SECONDS"
done

if ! cleanup; then
  fail "final Compose/temp cleanup"
fi
trap - EXIT INT TERM
echo "CMS documents E2E passed."
