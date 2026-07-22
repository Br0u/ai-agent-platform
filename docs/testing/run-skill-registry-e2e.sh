#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

project=${SKILL_REGISTRY_E2E_PROJECT:-aap-skill-registry-e2e-$$}
case "$project" in
  aap-skill-registry-e2e-*) ;;
  *)
    echo "Skill Registry E2E project must use the approved prefix" >&2
    exit 1
    ;;
esac
case "$project" in
  *[!A-Za-z0-9_.-]*)
    echo "Skill Registry E2E project contains unsafe characters" >&2
    exit 1
    ;;
esac

compose_files="-f compose.yaml -f compose.e2e.yaml"
temporary_directory=
env_file=
log_file=
owns_project=false
success_message=
original_stdout=3
original_stderr=4

assert_zero_residue() {
  remaining_containers=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
  remaining_volumes=$(docker volume ls -q --filter "label=com.docker.compose.project=$project")
  remaining_networks=$(docker network ls -q --filter "label=com.docker.compose.project=$project")
  remaining_images=$(docker image ls -q "$project-*")
  if [ -n "$remaining_containers$remaining_volumes$remaining_networks$remaining_images" ]; then
    echo "Skill Registry E2E cleanup left Docker resources" >&2
    return 1
  fi
}

cleanup() {
  cleanup_status=$?
  trap '' INT TERM
  trap - EXIT
  cleanup_failed=false
  protected_output=false
  if [ "$owns_project" = true ] && command -v docker >/dev/null 2>&1 && [ -n "$env_file" ]; then
    if [ "$cleanup_status" -ne 0 ] && [ -n "$log_file" ] && [ -f "$log_file" ]; then
      compose exec -T db psql -v ON_ERROR_STOP=1 -U "$owner" -d "$database" -Atqc \
        "SELECT action || ':' || coalesce(metadata->>'result', 'none') || ':' || count(*)::text
           FROM public.audit_logs
          WHERE action IN ('assistant.skill_upload_requested', 'assistant.skill_upload_completed')
          GROUP BY action, metadata->>'result'
          ORDER BY action, metadata->>'result'" >>"$log_file" 2>&1 || true
      compose exec -T db psql -v ON_ERROR_STOP=1 -U "$owner" -d "$database" -Atqc \
        "SELECT 'registry-counts:' ||
                (SELECT count(*) FROM skill_registry.skill_revisions)::text || ':' ||
                (SELECT count(*) FROM skill_registry.skill_revision_artifacts)::text || ':' ||
                (SELECT count(*) FROM skill_registry.skill_revision_files)::text" >>"$log_file" 2>&1 || true
      docker compose -p "$project" --env-file "$env_file" $compose_files \
        logs --no-color db agent skill-registry web proxy backup >>"$log_file" 2>&1 || true
    fi
    if ! docker compose -p "$project" --env-file "$env_file" $compose_files \
      down --rmi local -v --remove-orphans >/dev/null 2>&1; then
      cleanup_failed=true
    fi
    if ! assert_zero_residue; then
      cleanup_failed=true
    fi
  fi
  if [ -n "$log_file" ] && [ -f "$log_file" ] && [ -f "$temporary_directory/protected-patterns" ]; then
    if grep -F -f "$temporary_directory/protected-patterns" "$log_file" >/dev/null 2>&1; then
      cleanup_status=1
      cleanup_failed=true
      protected_output=true
      printf '%s\n' "Skill Registry E2E output contained protected data" >&$original_stderr
    fi
  fi
  if [ "$cleanup_failed" = true ] && [ "$cleanup_status" -eq 0 ]; then
    cleanup_status=1
  fi
  if [ "$cleanup_status" -ne 0 ] && [ "$protected_output" = false ] && [ -n "$log_file" ] && [ -f "$log_file" ]; then
    cat "$log_file" >&$original_stderr
  fi
  if [ -n "$temporary_directory" ]; then
    rm -rf "$temporary_directory" >/dev/null 2>&1 || cleanup_failed=true
  fi
  if [ "$cleanup_status" -eq 0 ] && [ -n "$success_message" ]; then
    printf '%s\n' "$success_message" >&$original_stdout
  fi
  exit "$cleanup_status"
}

on_signal() {
  trap '' INT TERM
  exit "$1"
}

trap cleanup EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

for command in docker openssl python3 node pnpm; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "$command is required" >&2
    exit 1
  }
done

runtime_tmp=${TMPDIR:-/tmp}
case "$runtime_tmp" in
  /*) ;;
  *)
    echo "TMPDIR must be absolute" >&2
    exit 1
    ;;
esac

existing=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
existing="$existing$(docker volume ls -q --filter "label=com.docker.compose.project=$project")"
existing="$existing$(docker network ls -q --filter "label=com.docker.compose.project=$project")"
existing="$existing$(docker image ls -q "$project-*")"
if [ -n "$existing" ]; then
  echo "Skill Registry E2E project resources already exist" >&2
  exit 1
fi

umask 077
temporary_directory=$(mktemp -d "$runtime_tmp/aap-skill-registry-e2e.XXXXXX")
secret_directory="$temporary_directory/secrets"
fixture_directory="$temporary_directory/fixture"
archive_file="$temporary_directory/skill-registry-e2e.zip"
state_file="$temporary_directory/skill-registry-state.json"
storage_state_file="$temporary_directory/reviewer-storage-state.json"
restore_root="$temporary_directory/restore"
dump_directory="$temporary_directory/dump"
env_file="$temporary_directory/e2e.env"
log_file="$temporary_directory/e2e.log"
mkdir -p "$secret_directory" "$fixture_directory" "$restore_root" "$dump_directory"
chmod 700 "$temporary_directory" "$secret_directory" "$fixture_directory" "$restore_root" "$dump_directory"
: >"$log_file"
chmod 600 "$log_file"
exec 3>&1 4>&2
exec >"$log_file" 2>&1

secret() {
  openssl rand -hex 32
}

postgres_password=$(secret)
migrator_password=$(secret)
runtime_password=$(secret)
backup_password=$(secret)
backup_encryption_key=$(secret)
agno_migrator_password=$(secret)
agno_runtime_password=$(secret)
control_migrator_password=$(secret)
control_runtime_password=$(secret)
registry_migrator_password=$(secret)
registry_manager_password=$(secret)
registry_runtime_password=$(secret)
better_auth_secret=$(secret)
os_security_key=$(secret)
assistant_session_secret=$(secret)
assistant_rate_limit_secret=$(secret)
model_config_encryption_key=$(secret)
agent_config_control_key=$(secret)
skill_registry_control_key=$(secret)
customer_password=$(secret)
staff_password=$(secret)
admin_password=$(secret)
pending_customer_session=$(secret)
disabled_customer_session=$(secret)
staff_session=$(secret)
role_target_session=$(secret)
admin_session=$(secret)
no_totp_admin_session=$(secret)
model_admin_session=$(secret)
model_admin_stale_session=$(secret)
revoked_session=$(secret)
replacement_password=$(secret)
database=ai_agent_platform_skill_registry_e2e
owner=ai_agent_owner
agno_fixture=skill-registry-e2e-session-v1

materialize_secret() {
  variable_name=$1
  secret_name=$2
  secret_value=$3
  secret_path="$secret_directory/$secret_name"
  printf '%s' "$secret_value" >"$secret_path"
  chmod 600 "$secret_path"
  eval "$variable_name=\$secret_path"
  export "$variable_name"
}

materialize_secret POSTGRES_PASSWORD_FILE postgres_password "$postgres_password"
materialize_secret MIGRATOR_DATABASE_PASSWORD_FILE migrator_database_password "$migrator_password"
materialize_secret RUNTIME_DATABASE_PASSWORD_FILE runtime_database_password "$runtime_password"
materialize_secret BACKUP_DATABASE_PASSWORD_FILE backup_database_password "$backup_password"
materialize_secret BACKUP_ENCRYPTION_KEY_FILE backup_encryption_key "$backup_encryption_key"
materialize_secret AGNO_MIGRATOR_DATABASE_PASSWORD_FILE agno_migrator_database_password "$agno_migrator_password"
materialize_secret AGNO_DATABASE_PASSWORD_FILE agno_database_password "$agno_runtime_password"
materialize_secret AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD_FILE agent_control_migrator_database_password "$control_migrator_password"
materialize_secret AGENT_CONTROL_DATABASE_PASSWORD_FILE agent_control_database_password "$control_runtime_password"
materialize_secret SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD_FILE skill_registry_migrator_database_password "$registry_migrator_password"
materialize_secret SKILL_REGISTRY_DATABASE_PASSWORD_FILE skill_registry_database_password "$registry_manager_password"
materialize_secret SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD_FILE skill_registry_runtime_database_password "$registry_runtime_password"
materialize_secret MIGRATOR_DATABASE_URL_FILE migrator_database_url "postgresql://ai_agent_migrator:$migrator_password@db:5432/$database"
materialize_secret RUNTIME_DATABASE_URL_FILE runtime_database_url "postgresql://ai_agent_runtime:$runtime_password@db:5432/$database"
materialize_secret AGNO_MIGRATOR_DATABASE_URL_FILE agno_migrator_database_url "postgresql+psycopg_async://ai_agent_agno_migrator:$agno_migrator_password@db:5432/$database"
materialize_secret AGNO_DATABASE_URL_FILE agno_database_url "postgresql+psycopg_async://ai_agent_agno:$agno_runtime_password@db:5432/$database"
materialize_secret AGENT_CONTROL_MIGRATOR_DATABASE_URL_FILE agent_control_migrator_database_url "postgresql+psycopg_async://ai_agent_control_migrator:$control_migrator_password@db:5432/$database"
materialize_secret AGENT_CONTROL_DATABASE_URL_FILE agent_control_database_url "postgresql+psycopg_async://ai_agent_control:$control_runtime_password@db:5432/$database"
materialize_secret SKILL_REGISTRY_MIGRATOR_DATABASE_URL_FILE skill_registry_migrator_database_url "postgresql+psycopg_async://ai_agent_skill_registry_migrator:$registry_migrator_password@db:5432/$database"
materialize_secret SKILL_REGISTRY_DATABASE_URL_FILE skill_registry_database_url "postgresql+psycopg_async://ai_agent_skill_registry_manager:$registry_manager_password@db:5432/$database"
materialize_secret BETTER_AUTH_SECRET_FILE better_auth_secret "$better_auth_secret"
materialize_secret OS_SECURITY_KEY_FILE os_security_key "$os_security_key"
materialize_secret ASSISTANT_SESSION_SECRET_FILE assistant_session_secret "$assistant_session_secret"
materialize_secret ASSISTANT_RATE_LIMIT_SECRET_FILE assistant_rate_limit_secret "$assistant_rate_limit_secret"
materialize_secret MODEL_CONFIG_ENCRYPTION_KEY_FILE model_config_encryption_key "$model_config_encryption_key"
materialize_secret AGENT_CONFIG_CONTROL_KEY_FILE agent_config_control_key "$agent_config_control_key"
materialize_secret SKILL_REGISTRY_CONTROL_KEY_FILE skill_registry_control_key "$skill_registry_control_key"

http_port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
base_url="http://127.0.0.1:$http_port"
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
AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD_FILE=$AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD_FILE
AGENT_CONTROL_DATABASE_PASSWORD_FILE=$AGENT_CONTROL_DATABASE_PASSWORD_FILE
SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD_FILE=$SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD_FILE
SKILL_REGISTRY_DATABASE_PASSWORD_FILE=$SKILL_REGISTRY_DATABASE_PASSWORD_FILE
SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD_FILE=$SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD_FILE
MIGRATOR_DATABASE_URL_FILE=$MIGRATOR_DATABASE_URL_FILE
RUNTIME_DATABASE_URL_FILE=$RUNTIME_DATABASE_URL_FILE
AGNO_MIGRATOR_DATABASE_URL_FILE=$AGNO_MIGRATOR_DATABASE_URL_FILE
AGNO_DATABASE_URL_FILE=$AGNO_DATABASE_URL_FILE
AGENT_CONTROL_MIGRATOR_DATABASE_URL_FILE=$AGENT_CONTROL_MIGRATOR_DATABASE_URL_FILE
AGENT_CONTROL_DATABASE_URL_FILE=$AGENT_CONTROL_DATABASE_URL_FILE
SKILL_REGISTRY_MIGRATOR_DATABASE_URL_FILE=$SKILL_REGISTRY_MIGRATOR_DATABASE_URL_FILE
SKILL_REGISTRY_DATABASE_URL_FILE=$SKILL_REGISTRY_DATABASE_URL_FILE
BETTER_AUTH_SECRET_FILE=$BETTER_AUTH_SECRET_FILE
OS_SECURITY_KEY_FILE=$OS_SECURITY_KEY_FILE
ASSISTANT_SESSION_SECRET_FILE=$ASSISTANT_SESSION_SECRET_FILE
ASSISTANT_RATE_LIMIT_SECRET_FILE=$ASSISTANT_RATE_LIMIT_SECRET_FILE
MODEL_CONFIG_ENCRYPTION_KEY_FILE=$MODEL_CONFIG_ENCRYPTION_KEY_FILE
AGENT_CONFIG_CONTROL_KEY_FILE=$AGENT_CONFIG_CONTROL_KEY_FILE
SKILL_REGISTRY_CONTROL_KEY_FILE=$SKILL_REGISTRY_CONTROL_KEY_FILE
BETTER_AUTH_URL=$base_url
BETTER_AUTH_TRUSTED_ORIGINS=$base_url
ASSISTANT_PUBLIC_ORIGIN=$base_url
HTTP_PORT=$http_port
PUBLIC_HOST=127.0.0.1
ALLOW_LOCAL_VALIDATION_HOSTS=true
FEATURE_EMAIL_VERIFICATION=false
AGENT_ENABLED=false
MODEL_PROVIDER=
MODEL_ID=
MODEL_BASE_URL=
BACKUP_RUN_ONCE=true
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_DAYS=14
E2E_CUSTOMER_PASSWORD=$customer_password
E2E_STAFF_PASSWORD=$staff_password
E2E_ADMIN_PASSWORD=$admin_password
E2E_PENDING_CUSTOMER_SESSION_TOKEN=$pending_customer_session
E2E_DISABLED_CUSTOMER_SESSION_TOKEN=$disabled_customer_session
E2E_STAFF_SESSION_TOKEN=$staff_session
E2E_ROLE_TARGET_SESSION_TOKEN=$role_target_session
E2E_ADMIN_SESSION_TOKEN=$admin_session
E2E_NO_TOTP_ADMIN_SESSION_TOKEN=$no_totp_admin_session
E2E_MODEL_ADMIN_SESSION_TOKEN=$model_admin_session
E2E_MODEL_ADMIN_STALE_SESSION_TOKEN=$model_admin_stale_session
E2E_REVOKED_SESSION_TOKEN=$revoked_session
E2E_REPLACEMENT_PASSWORD=$replacement_password
EOF
chmod 600 "$env_file"

slug="e2e-reviewed-$(openssl rand -hex 6)"
mkdir -p "$fixture_directory/$slug/scripts"
cat >"$fixture_directory/$slug/SKILL.md" <<EOF
---
name: $slug
description: Skill Registry E2E local fixture.
license: MIT
---
# Instructions
Use the local script only during this isolated acceptance.
EOF
cat >"$fixture_directory/$slug/scripts/hello.py" <<'EOF'
#!/usr/bin/env python3
print("hello from reviewed skill")
EOF
python3 - "$fixture_directory" "$slug" "$archive_file" <<'PY'
import pathlib
import sys
import zipfile

root = pathlib.Path(sys.argv[1])
slug = sys.argv[2]
output = pathlib.Path(sys.argv[3])
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for relative in ("SKILL.md", "scripts/hello.py"):
        archive.write(root / slug / relative, f"{slug}/{relative}")
PY
chmod 600 "$archive_file"

protected_patterns="$temporary_directory/protected-patterns"
printf '%s\n' \
  "$postgres_password" "$migrator_password" "$runtime_password" \
  "$backup_password" "$backup_encryption_key" "$agno_migrator_password" \
  "$agno_runtime_password" "$control_migrator_password" "$control_runtime_password" \
  "$registry_migrator_password" "$registry_manager_password" "$registry_runtime_password" \
  "$better_auth_secret" "$os_security_key" "$assistant_session_secret" \
  "$assistant_rate_limit_secret" "$model_config_encryption_key" \
  "$agent_config_control_key" "$skill_registry_control_key" \
  "$customer_password" "$staff_password" "$admin_password" \
  "$pending_customer_session" "$disabled_customer_session" "$staff_session" \
  "$role_target_session" "$admin_session" "$no_totp_admin_session" \
  "$model_admin_session" "$model_admin_stale_session" "$revoked_session" \
  "$replacement_password" "Skill Registry E2E local fixture." \
  'print("hello from reviewed skill")' >"$protected_patterns"
chmod 600 "$protected_patterns"

compose() {
  docker compose -p "$project" --env-file "$env_file" $compose_files "$@"
}

run_job() {
  compose run --rm "$@"
}

compose config --quiet
owns_project=true
compose build migrate agent skill-registry web backup
compose up -d --wait db
run_job migrate
run_job migrate
run_job agno-bootstrap
run_job agno-bootstrap
run_job --no-deps agent-migrate
run_job --no-deps agent-migrate
run_job --no-deps agent-control-bootstrap
run_job --no-deps agent-control-bootstrap
run_job --no-deps agent-control-migrate
run_job --no-deps agent-control-migrate
run_job --no-deps skill-registry-bootstrap
run_job --no-deps skill-registry-bootstrap
run_job --no-deps skill-registry-migrate
run_job --no-deps skill-registry-migrate
run_job --no-deps -e NODE_ENV=test migrate pnpm db:seed-auth-e2e
compose exec -T db psql -v ON_ERROR_STOP=1 -U "$owner" -d "$database" -c \
  "UPDATE public.users SET two_factor_enabled = CASE WHEN id = '10000000-0000-4000-8000-000000000003'::uuid THEN true ELSE false END WHERE id IN ('10000000-0000-4000-8000-000000000003'::uuid, '10000000-0000-4000-8000-000000000008'::uuid)" >/dev/null
uploader_permissions=$(compose exec -T db psql -v ON_ERROR_STOP=1 -U "$owner" -d "$database" -Atqc \
  "SELECT p.key
     FROM public.user_roles ur
     JOIN public.role_permissions rp ON rp.role_id = ur.role_id
     JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = '10000000-0000-4000-8000-000000000003'::uuid
      AND p.key IN ('admin:assistant', 'admin:assistant:skills', 'admin:assistant:skills:upload')
    ORDER BY p.key")
expected_uploader_permissions=$(printf '%s\n' \
  'admin:assistant' \
  'admin:assistant:skills' \
  'admin:assistant:skills:upload')
[ "$uploader_permissions" = "$expected_uploader_permissions" ] || {
  echo "workforce:admin is missing the Skill read/upload grant contract" >&2
  exit 1
}
uploader_review_permissions=$(compose exec -T db psql -v ON_ERROR_STOP=1 -U "$owner" -d "$database" -Atqc \
  "SELECT count(*)
     FROM public.user_roles ur
     JOIN public.role_permissions rp ON rp.role_id = ur.role_id
     JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = '10000000-0000-4000-8000-000000000003'::uuid
      AND p.key = 'admin:assistant:skills:review'")
[ "$uploader_review_permissions" = 0 ] || {
  echo "workforce:admin unexpectedly has the Skill review grant" >&2
  exit 1
}
compose up -d --no-deps --wait agent skill-registry
compose up -d --no-deps --wait web
compose up -d --no-deps --wait proxy

for service in db agent skill-registry web; do
  bindings=$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$(compose ps -q "$service")")
  case "$bindings" in
    '{}'|'null') ;;
    *)
      echo "$service unexpectedly publishes a host port" >&2
      exit 1
      ;;
  esac
done

export BETTER_AUTH_SECRET
BETTER_AUTH_SECRET=$better_auth_secret
export E2E_ADMIN_SESSION_TOKEN=$admin_session
export E2E_MODEL_ADMIN_SESSION_TOKEN=$model_admin_session
export E2E_CUSTOMER_PASSWORD=$customer_password
export E2E_STAFF_PASSWORD=$staff_password
export E2E_ADMIN_PASSWORD=$admin_password
export E2E_PENDING_CUSTOMER_SESSION_TOKEN=$pending_customer_session
export E2E_DISABLED_CUSTOMER_SESSION_TOKEN=$disabled_customer_session
export E2E_STAFF_SESSION_TOKEN=$staff_session
export E2E_ROLE_TARGET_SESSION_TOKEN=$role_target_session
export E2E_NO_TOTP_ADMIN_SESSION_TOKEN=$no_totp_admin_session
export E2E_MODEL_ADMIN_STALE_SESSION_TOKEN=$model_admin_stale_session
export E2E_REVOKED_SESSION_TOKEN=$revoked_session
export E2E_REPLACEMENT_PASSWORD=$replacement_password
export SKILL_REGISTRY_E2E_ARCHIVE=$archive_file
export SKILL_REGISTRY_E2E_STATE_FILE=$state_file
export SKILL_REGISTRY_E2E_STORAGE_STATE_FILE=$storage_state_file
export SKILL_REGISTRY_E2E_SLUG=$slug

BASE_URL=$base_url pnpm --filter @ai-agent-platform/web exec playwright test \
  e2e/admin-skill-registry.spec.ts --project=desktop --workers=1 --grep @lifecycle

artifact_sha=$(node -e 'const fs=require("node:fs"); const state=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(state.artifactSha256)' "$state_file")
case "$artifact_sha" in
  [0-9a-f][0-9a-f]*) ;;
  *) echo "Skill Registry E2E state digest is invalid" >&2; exit 1 ;;
esac
[ "${#artifact_sha}" -eq 64 ] || {
  echo "Skill Registry E2E state digest is invalid" >&2
  exit 1
}

compose restart skill-registry
compose up -d --no-deps --wait skill-registry
BASE_URL=$base_url pnpm --filter @ai-agent-platform/web exec playwright test \
  e2e/admin-skill-registry.spec.ts --project=desktop --workers=1 --grep @restart

compose exec -T db psql -v ON_ERROR_STOP=1 -U "$owner" -d "$database" -c \
  "INSERT INTO agno.agno_sessions (session_id, session_type, created_at) VALUES ('$agno_fixture', 'agent', 0)" >/dev/null
user_count=$(compose exec -T db psql -U "$owner" -d "$database" -Atqc "SELECT count(*) FROM public.users")
agno_count=$(compose exec -T db psql -U "$owner" -d "$database" -Atqc "SELECT count(*) FROM agno.agno_sessions")
fixture_user=$(compose exec -T db psql -U "$owner" -d "$database" -Atqc "SELECT id FROM public.users ORDER BY id LIMIT 1")
artifact_count=$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM skill_registry.skill_revision_artifacts WHERE artifact_sha256 = '$artifact_sha'")
[ "$artifact_count" = 1 ] || {
  echo "published artifact digest was not persisted" >&2
  exit 1
}

compose run --rm --no-deps backup
backup_volume="${project}_backup_data"
docker run --rm -v "$backup_volume:/backups:ro" -v "$dump_directory:/out" \
  postgres:18.3-alpine3.23 sh -c \
  'backup=$(find /backups -maxdepth 1 -type f -name "ai-agent-platform-*.dump.gpg" | sort | tail -n 1); test -n "$backup"; cp "$backup" /out/generated.dump.gpg; chmod 0600 /out/generated.dump.gpg'

restore_output="$temporary_directory/restore-output.log"
if ! BACKUP_ENCRYPTION_KEY_FILE=$BACKUP_ENCRYPTION_KEY_FILE \
  BACKUP_CRYPTO_IMAGE="${project}-backup:latest" \
  RESTORE_SKILL_REGISTRY_IMAGE="${project}-skill-registry:latest" \
  RESTORE_TMP_ROOT="$restore_root" \
    infra/docker/restore-drill.sh \
      "$dump_directory/generated.dump.gpg" \
      "$user_count" \
      "$agno_count" \
      "$fixture_user" \
      "$agno_fixture" >"$restore_output" 2>&1; then
  cat "$restore_output" >&2
  exit 1
fi
grep -E 'revisions=[1-9][0-9]* artifacts=[1-9][0-9]* files=[1-9][0-9]* artifact_digests_verified=[1-9][0-9]*' \
  "$restore_output" >/dev/null || {
  echo "restore did not verify a nonempty Skill Registry artifact" >&2
  exit 1
}
cat "$restore_output"

# Reuse the Task 9 lifecycle gate; do not duplicate its timeout and controlled
# failure container-reconciliation assertions here.
docs/testing/run-restore-docker-lifecycle.sh timeout
docs/testing/run-restore-docker-lifecycle.sh controlled-failure

audit_leaks=$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM public.audit_logs WHERE metadata::text LIKE '%Skill Registry E2E local fixture.%' OR metadata::text LIKE '%hello from reviewed skill%'")
[ "$audit_leaks" = 0 ] || {
  echo "audit metadata contains Skill source or script output" >&2
  exit 1
}

success_message="Skill Registry E2E passed"
compose logs --no-color db agent skill-registry web proxy backup
