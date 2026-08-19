#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

project="aap-agentos-backup-restore-$$"
env_file=
temp_dir=
secret_dir=
dump_dir=
success_message=
backup_pid=
control_reader_pid=
release_writer_pid=
mutation_pid=

cleanup() {
  cleanup_status=$?
  trap '' INT TERM
  trap - EXIT
  cleanup_failed=false
  for background_pid in \
    "${mutation_pid:-}" "${backup_pid:-}" "${control_reader_pid:-}" \
    "${release_writer_pid:-}"; do
    [ -z "$background_pid" ] || kill "$background_pid" >/dev/null 2>&1 || true
    [ -z "$background_pid" ] || wait "$background_pid" >/dev/null 2>&1 || true
  done
  if command -v docker >/dev/null 2>&1; then
    if [ -n "$env_file" ] && [ -f "$env_file" ]; then
      docker compose -p "$project" --env-file "$env_file" \
        down --rmi local -v --remove-orphans >/dev/null 2>&1 || cleanup_failed=true
    fi
  fi
  if [ -n "$temp_dir" ]; then
    if rm -rf "$temp_dir" >/dev/null 2>&1; then
      temp_dir=
    else
      cleanup_failed=true
    fi
  fi
  if [ -n "$env_file" ]; then
    if rm -f "$env_file" >/dev/null 2>&1; then
      env_file=
    else
      cleanup_failed=true
    fi
  fi
  if [ "$cleanup_failed" = true ]; then
    cleanup_status=1
    echo "AgentOS backup and restore cleanup failed" >&2
  elif [ "$cleanup_status" -eq 0 ] && [ -n "$success_message" ]; then
    printf '%s\n' "$success_message"
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

runtime_tmp=${TMPDIR:-/tmp}
case "$runtime_tmp" in
  /*) ;;
  *)
    echo "TMPDIR must be an absolute path" >&2
    exit 1
    ;;
esac
umask 077
env_file=$(mktemp "$repo_root/.env.agentos-backup-restore.XXXXXX")
temp_dir=$(mktemp -d "$runtime_tmp/aap-agentos-backup-restore.XXXXXX")
secret_dir="$temp_dir/secrets"
dump_dir="$temp_dir/dump"
mkdir -p "$secret_dir" "$dump_dir"
chmod 700 "$temp_dir" "$secret_dir" "$dump_dir"

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
command -v id >/dev/null 2>&1 || {
  echo "id is required" >&2
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
agent_control_migrator_password=$(secret)
agent_control_runtime_password=$(secret)
skill_registry_migrator_password=$(secret)
skill_registry_manager_password=$(secret)
skill_registry_runtime_password=$(secret)
better_auth_secret=$(secret)
os_security_key=$(secret)
assistant_rate_limit_secret=$(secret)
model_api_key=$(secret)
model_config_encryption_key=$(secret)
agent_config_control_key=$(secret)
skill_registry_control_key=$(secret)
database=ai_agent_platform_agentos_restore_test
owner=ai_agent_owner
platform_user_id=00000000-0000-4000-8000-000000000001
agno_session_id=backup-restore-session-fixture-v1
published_only_resource_id=019faaaa-0000-7000-8000-000000000001
draft_only_resource_id=019faaaa-0000-7000-8000-000000000002
shared_resource_id=019faaaa-0000-7000-8000-000000000003
software_resource_id=019faaaa-0000-7000-8000-000000000019
published_only_revision_id=11111111-1111-7111-8111-111111111111
draft_only_revision_id=12222222-2222-7222-8222-222222222222
shared_published_revision_id=13333333-3333-7333-8333-333333333333
shared_metadata_revision_id=13333333-3333-7333-8333-333333333334
software_revision_id=16666666-6666-7666-8666-666666666666
cleanup_revision_id=14444444-4444-7444-8444-444444444444
unreferenced_revision_id=15555555-5555-7555-8555-555555555555
published_pdf_key=objects/21111111-1111-7111-8111-111111111111/31111111-1111-7111-8111-111111111111.pdf
published_cover_key=objects/21111111-1111-7111-8111-111111111111/41111111-1111-7111-8111-111111111111.webp
draft_pdf_key=objects/22222222-2222-7222-8222-222222222222/32222222-2222-7222-8222-222222222222.pdf
draft_cover_key=objects/22222222-2222-7222-8222-222222222222/42222222-2222-7222-8222-222222222222.webp
shared_pdf_key=objects/23333333-3333-7333-8333-333333333333/33333333-3333-7333-8333-333333333333.pdf
shared_cover_key=objects/23333333-3333-7333-8333-333333333333/43333333-3333-7333-8333-333333333333.webp
cleanup_pdf_key=objects/24444444-4444-7444-8444-444444444444/34444444-4444-7444-8444-444444444444.pdf
cleanup_cover_key=objects/24444444-4444-7444-8444-444444444444/44444444-4444-7444-8444-444444444444.webp
unreferenced_pdf_key=objects/25555555-5555-7555-8555-555555555555/35555555-5555-7555-8555-555555555555.pdf
unreferenced_cover_key=objects/25555555-5555-7555-8555-555555555555/45555555-5555-7555-8555-555555555555.webp
windows_key=objects/26666666-6666-7666-8666-666666666666/36666666-6666-7666-8666-666666666666-windows.exe
macos_key=objects/26666666-6666-7666-8666-666666666666/46666666-6666-7666-8666-666666666666-macos.dmg

materialize_secret() {
  variable_name=$1
  secret_name=$2
  secret_value=$3
  secret_mode=${4:-600}
  secret_path="$secret_dir/$secret_name"
  (umask 077 && printf '%s' "$secret_value" >"$secret_path")
  chmod "$secret_mode" "$secret_path"
  eval "$variable_name=\$secret_path"
  export "$variable_name"
}

materialize_secret POSTGRES_PASSWORD_FILE postgres_password "$postgres_password"
# Docker Compose implements file-backed secrets as bind mounts on Linux. The
# Postgres and backup images read these files as their unprivileged postgres
# user, so they must remain readable after the privilege drop. Their parent
# directory stays 0700 and every Compose mount remains read-only.
materialize_secret MIGRATOR_DATABASE_PASSWORD_FILE migrator_database_password "$migrator_password" 644
materialize_secret RUNTIME_DATABASE_PASSWORD_FILE runtime_database_password "$runtime_password" 644
materialize_secret BACKUP_DATABASE_PASSWORD_FILE backup_database_password "$backup_password" 644
materialize_secret BACKUP_ENCRYPTION_KEY_FILE backup_encryption_key "$backup_encryption_key" 644
materialize_secret WRONG_BACKUP_ENCRYPTION_KEY_FILE wrong_backup_encryption_key "$wrong_backup_encryption_key"
materialize_secret AGNO_MIGRATOR_DATABASE_PASSWORD_FILE agno_migrator_database_password "$agno_migrator_password"
materialize_secret AGNO_DATABASE_PASSWORD_FILE agno_database_password "$agno_runtime_password"
materialize_secret AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD_FILE agent_control_migrator_database_password "$agent_control_migrator_password"
materialize_secret AGENT_CONTROL_DATABASE_PASSWORD_FILE agent_control_database_password "$agent_control_runtime_password"
materialize_secret SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD_FILE skill_registry_migrator_database_password "$skill_registry_migrator_password"
materialize_secret SKILL_REGISTRY_DATABASE_PASSWORD_FILE skill_registry_database_password "$skill_registry_manager_password"
materialize_secret SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD_FILE skill_registry_runtime_database_password "$skill_registry_runtime_password"
materialize_secret MIGRATOR_DATABASE_URL_FILE migrator_database_url "postgresql://ai_agent_migrator:$migrator_password@db:5432/$database"
materialize_secret RUNTIME_DATABASE_URL_FILE runtime_database_url "postgresql://ai_agent_runtime:$runtime_password@db:5432/$database"
materialize_secret AGNO_MIGRATOR_DATABASE_URL_FILE agno_migrator_database_url "postgresql+psycopg_async://ai_agent_agno_migrator:$agno_migrator_password@db:5432/$database"
materialize_secret AGNO_DATABASE_URL_FILE agno_database_url "postgresql+psycopg_async://ai_agent_agno:$agno_runtime_password@db:5432/$database"
materialize_secret AGENT_CONTROL_MIGRATOR_DATABASE_URL_FILE agent_control_migrator_database_url "postgresql+psycopg_async://ai_agent_control_migrator:$agent_control_migrator_password@db:5432/$database"
materialize_secret AGENT_CONTROL_DATABASE_URL_FILE agent_control_database_url "postgresql+psycopg_async://ai_agent_control:$agent_control_runtime_password@db:5432/$database"
materialize_secret SKILL_REGISTRY_MIGRATOR_DATABASE_URL_FILE skill_registry_migrator_database_url "postgresql+psycopg_async://ai_agent_skill_registry_migrator:$skill_registry_migrator_password@db:5432/$database"
materialize_secret SKILL_REGISTRY_DATABASE_URL_FILE skill_registry_database_url "postgresql+psycopg_async://ai_agent_skill_registry_manager:$skill_registry_manager_password@db:5432/$database"
materialize_secret SKILL_REGISTRY_RUNTIME_DATABASE_URL_FILE skill_registry_runtime_database_url "postgresql+psycopg_async://ai_agent_skill_registry_runtime:$skill_registry_runtime_password@db:5432/$database"
materialize_secret BETTER_AUTH_SECRET_FILE better_auth_secret "$better_auth_secret"
materialize_secret OS_SECURITY_KEY_FILE os_security_key "$os_security_key"
materialize_secret ASSISTANT_RATE_LIMIT_SECRET_FILE assistant_rate_limit_secret "$assistant_rate_limit_secret"
materialize_secret MODEL_API_KEY_FILE model_api_key "$model_api_key"
materialize_secret MODEL_CONFIG_ENCRYPTION_KEY_FILE model_config_encryption_key "$model_config_encryption_key"
materialize_secret AGENT_CONFIG_CONTROL_KEY_FILE agent_config_control_key "$agent_config_control_key"
materialize_secret SKILL_REGISTRY_CONTROL_KEY_FILE skill_registry_control_key "$skill_registry_control_key"
export AGENT_ENABLED=false

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
SKILL_REGISTRY_RUNTIME_DATABASE_URL_FILE=$SKILL_REGISTRY_RUNTIME_DATABASE_URL_FILE
BETTER_AUTH_SECRET_FILE=$BETTER_AUTH_SECRET_FILE
OS_SECURITY_KEY_FILE=$OS_SECURITY_KEY_FILE
ASSISTANT_RATE_LIMIT_SECRET_FILE=$ASSISTANT_RATE_LIMIT_SECRET_FILE
MODEL_CONFIG_ENCRYPTION_KEY_FILE=$MODEL_CONFIG_ENCRYPTION_KEY_FILE
AGENT_CONFIG_CONTROL_KEY_FILE=$AGENT_CONFIG_CONTROL_KEY_FILE
SKILL_REGISTRY_CONTROL_KEY_FILE=$SKILL_REGISTRY_CONTROL_KEY_FILE
BETTER_AUTH_URL=http://127.0.0.1:8080
BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:8080
ASSISTANT_PUBLIC_ORIGIN=http://127.0.0.1:8080
PUBLIC_HOST=127.0.0.1
ALLOW_LOCAL_VALIDATION_HOSTS=true
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_DAYS=14
BACKUP_RUN_ONCE=true
EOF
chmod 600 "$env_file"

# Compose gives the parent process environment precedence over --env-file.
# Replace CI-level fixture values with this run's generated values before the
# first Compose interpolation so every service uses one credential set.
set -a
. "$env_file"
set +a

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
compose build migrate agent skill-registry backup
compose up -d --wait db
compose run --rm migrate
compose run --rm agno-bootstrap
compose run --rm --no-deps agent-migrate
compose run --rm --no-deps agent-control-bootstrap
compose run --rm --no-deps agent-control-migrate
compose run --rm --no-deps skill-registry-bootstrap
compose run --rm --no-deps skill-registry-migrate
compose up -d --no-deps agent skill-registry

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

attempt=0
until compose exec -T skill-registry python -c '
import json
import urllib.request

with urllib.request.urlopen(
    "http://127.0.0.1:7788/internal/health/ready", timeout=3
) as response:
    payload = json.load(response)
    assert response.status == 200
    assert payload == {"live": True, "ready": True}
    assert type(payload["live"]) is bool
    assert type(payload["ready"]) is bool
' >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Skill Registry readiness did not become ready" >&2
    exit 1
  fi
  sleep 1
done
echo "Skill Registry ready: live=true ready=true"

compose exec -T skill-registry python -c '
import base64
import hashlib
import hmac
import io
import json
import pathlib
import stat
import time
import urllib.request
import uuid
import zipfile

slug = "backup-restore-skill-v1"
archive_buffer = io.BytesIO()
with zipfile.ZipFile(
    archive_buffer, "w", compression=zipfile.ZIP_DEFLATED
) as archive:
    for relative, content in (
        (
            "SKILL.md",
            b"---\nname: backup-restore-skill-v1\ndescription: Backup acceptance.\nlicense: MIT\n---\n# Instructions\n",
        ),
        ("references/hello.md", b"# Backup restore reference\nRead-only fixture.\n"),
    ):
        info = zipfile.ZipInfo(
            f"{slug}/{relative}", (2026, 7, 22, 0, 0, 0)
        )
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | 0o600) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, content)

control_key = pathlib.Path(
    "/run/secrets/skill_registry_control_key"
).read_text().strip()
now = int(time.time())
payload = {
    "action": "upload",
    "actor": "00000000-0000-4000-8000-000000000002",
    "assurance": "session",
    "assuredAt": None,
    "expiresAt": now + 5,
    "issuedAt": now,
    "nonce": str(uuid.uuid4()),
    "permission": "admin:assistant:skills:upload",
    "requestId": str(uuid.uuid4()),
    "target": "new",
}
raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
derived = hmac.new(
    control_key.encode(),
    b"ai-agent-platform:skill-registry-assertion:v1",
    hashlib.sha256,
).digest()
encode = lambda value: base64.urlsafe_b64encode(value).rstrip(b"=").decode()
assertion = f"{encode(raw)}.{encode(hmac.new(derived, raw, hashlib.sha256).digest())}"
request = urllib.request.Request(
    "http://127.0.0.1:7788/internal/skills/uploads",
    data=archive_buffer.getvalue(),
    method="POST",
    headers={
        "Authorization": "Bearer " + control_key,
        "Content-Type": "application/zip",
        "X-Skill-Registry-Assertion": assertion,
    },
)
with urllib.request.urlopen(request, timeout=5) as response:
    result = json.load(response)
    assert response.status == 201
    assert result["revision"]["state"] == "published"
' >/dev/null

skill_revision_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM skill_registry.skill_revisions")"
skill_artifact_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM skill_registry.skill_revision_artifacts")"
skill_file_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM skill_registry.skill_revision_files")"
skill_artifact_identity="$(compose exec -T db psql -U "$owner" -d "$database" -AtF '|' -qc \
  "SELECT artifact.revision_id, artifact.artifact_sha256
     FROM skill_registry.skill_revision_artifacts AS artifact
     JOIN skill_registry.skill_revisions AS revision ON revision.id = artifact.revision_id
     JOIN skill_registry.skills AS skill ON skill.id = revision.skill_id
    WHERE skill.slug = 'backup-restore-skill-v1'")"
IFS='|' read -r skill_artifact_revision_id skill_artifact_sha <<EOF
$skill_artifact_identity
EOF
if [ "$skill_revision_count" -le 0 ] || \
   [ "$skill_artifact_count" -le 0 ] || \
   [ "$skill_file_count" -le 0 ]; then
  echo "Skill Registry backup fixture is empty" >&2
  exit 1
fi
case "$skill_artifact_sha" in
  ''|*[!0-9a-f]*)
    echo "Skill Registry backup fixture digest is invalid" >&2
    exit 1
    ;;
esac
if [ "${#skill_artifact_sha}" -ne 64 ]; then
  echo "Skill Registry backup fixture digest is invalid" >&2
  exit 1
fi
echo "Skill Registry backup fixture: revisions=$skill_revision_count artifacts=$skill_artifact_count files=$skill_file_count"

published_pdf_content=published-pdf-fixture-v1
published_cover_content=published-cover-fixture-v1
draft_pdf_content=draft-pdf-fixture-v1
draft_cover_content=draft-cover-fixture-v1
shared_pdf_content=shared-pdf-fixture-v1
shared_cover_content=shared-cover-fixture-v1
cleanup_pdf_content=cleanup-pdf-fixture-v1
cleanup_cover_content=cleanup-cover-fixture-v1
unreferenced_pdf_content=unreferenced-pdf-fixture-v1
unreferenced_cover_content=unreferenced-cover-fixture-v1
windows_content=windows-installer-fixture-v1
macos_content=macos-installer-fixture-v1
sha256_text() {
  printf '%s' "$1" | openssl dgst -sha256 | awk '{print $2}'
}
published_pdf_sha=$(sha256_text "$published_pdf_content")
draft_pdf_sha=$(sha256_text "$draft_pdf_content")
shared_pdf_sha=$(sha256_text "$shared_pdf_content")
cleanup_pdf_sha=$(sha256_text "$cleanup_pdf_content")
unreferenced_pdf_sha=$(sha256_text "$unreferenced_pdf_content")
windows_sha=$(sha256_text "$windows_content")
macos_sha=$(sha256_text "$macos_content")

compose run --rm --no-deps --user root --entrypoint sh download-volume-init -ceu '
  root=/var/lib/ai-agent-platform/downloads
  while [ "$#" -gt 0 ]; do
    object_key=$1
    contents=$2
    shift 2
    target=$root/$object_key
    mkdir -p "${target%/*}"
    printf "%s" "$contents" >"$target"
  done
  chown -R 1000:1000 "$root"
  find "$root" -type d -exec chmod 0750 {} \;
  find "$root" -type f -exec chmod 0640 {} \;
' sh \
  "$published_pdf_key" "$published_pdf_content" \
  "$published_cover_key" "$published_cover_content" \
  "$draft_pdf_key" "$draft_pdf_content" \
  "$draft_cover_key" "$draft_cover_content" \
  "$shared_pdf_key" "$shared_pdf_content" \
  "$shared_cover_key" "$shared_cover_content" \
  "$cleanup_pdf_key" "$cleanup_pdf_content" \
  "$cleanup_cover_key" "$cleanup_cover_content" \
  "$unreferenced_pdf_key" "$unreferenced_pdf_content" \
  "$unreferenced_cover_key" "$unreferenced_cover_content" \
  "$windows_key" "$windows_content" \
  "$macos_key" "$macos_content" \
  staging/fixture.partial staging-partial-fixture

compose exec -T db psql -v ON_ERROR_STOP=1 -U "$owner" -d "$database" <<EOF >/dev/null
INSERT INTO download_resource_revisions (
  id, resource_id, name, product, category, resource_type, description,
  resource_kind, sort_order, preview_policy, download_policy, release_version,
  published_at, cleanup_pending_at
) VALUES
  ('$published_only_revision_id', '$published_only_resource_id', 'Published only', 'fixture', 'materials', 'fixture', 'published only fixture', 'document', 1, 'public', 'public', NULL, now(), NULL),
  ('$draft_only_revision_id', '$draft_only_resource_id', 'Draft only', 'fixture', 'materials', 'fixture', 'draft only fixture', 'document', 2, 'public', 'contact', NULL, NULL, NULL),
  ('$shared_published_revision_id', '$shared_resource_id', 'Published shared', 'fixture', 'materials', 'fixture', 'published with metadata draft fixture', 'document', 3, 'public', 'contact', NULL, now(), NULL),
  ('$shared_metadata_revision_id', '$shared_resource_id', 'Metadata draft', 'fixture', 'materials', 'fixture', 'metadata-only draft fixture', 'document', 3, 'public', 'contact', NULL, NULL, NULL),
  ('$cleanup_revision_id', '019faaaa-0000-7000-8000-000000000004', 'Cleanup pending', 'fixture', 'materials', 'fixture', 'cleanup-pending fixture', 'document', 4, 'public', 'contact', NULL, NULL, now()),
  ('$unreferenced_revision_id', '019faaaa-0000-7000-8000-000000000005', 'Unreferenced', 'fixture', 'materials', 'fixture', 'unreferenced fixture', 'document', 5, 'public', 'contact', NULL, NULL, NULL),
  ('$software_revision_id', '$software_resource_id', 'Installer', 'fixture', 'software', 'fixture', 'installer fixture', 'software', 1, NULL, 'public', 'v1.0.0', now(), NULL);

INSERT INTO download_resource_artifacts (
  revision_id, revision_kind, slot, object_key, original_filename, extension,
  media_type, byte_size, sha256, page_count, cover_object_key
) VALUES
  ('$published_only_revision_id', 'document', 'document', '$published_pdf_key', 'published.pdf', '.pdf', 'application/pdf', ${#published_pdf_content}, '$published_pdf_sha', 1, '$published_cover_key'),
  ('$draft_only_revision_id', 'document', 'document', '$draft_pdf_key', 'draft.pdf', '.pdf', 'application/pdf', ${#draft_pdf_content}, '$draft_pdf_sha', 1, '$draft_cover_key'),
  ('$shared_published_revision_id', 'document', 'document', '$shared_pdf_key', 'shared.pdf', '.pdf', 'application/pdf', ${#shared_pdf_content}, '$shared_pdf_sha', 1, '$shared_cover_key'),
  ('$cleanup_revision_id', 'document', 'document', '$cleanup_pdf_key', 'cleanup.pdf', '.pdf', 'application/pdf', ${#cleanup_pdf_content}, '$cleanup_pdf_sha', 1, '$cleanup_cover_key'),
  ('$unreferenced_revision_id', 'document', 'document', '$unreferenced_pdf_key', 'unreferenced.pdf', '.pdf', 'application/pdf', ${#unreferenced_pdf_content}, '$unreferenced_pdf_sha', 1, '$unreferenced_cover_key'),
  ('$software_revision_id', 'software', 'windows', '$windows_key', 'installer.exe', '.exe', 'application/vnd.microsoft.portable-executable', ${#windows_content}, '$windows_sha', NULL, NULL),
  ('$software_revision_id', 'software', 'macos', '$macos_key', 'installer.dmg', '.dmg', 'application/x-apple-diskimage', ${#macos_content}, '$macos_sha', NULL, NULL);

UPDATE download_resources
SET state = 'published', published_revision_id = '$published_only_revision_id',
    draft_revision_id = NULL, row_version = row_version + 1
WHERE id = '$published_only_resource_id';
UPDATE download_resources
SET state = 'unpublished', published_revision_id = NULL,
    draft_revision_id = '$draft_only_revision_id', row_version = row_version + 1
WHERE id = '$draft_only_resource_id';
UPDATE download_resources
SET state = 'published', published_revision_id = '$shared_published_revision_id',
    draft_revision_id = '$shared_metadata_revision_id', row_version = row_version + 1
WHERE id = '$shared_resource_id';
UPDATE download_resources
SET state = 'published', published_revision_id = '$software_revision_id',
    draft_revision_id = NULL, row_version = row_version + 1
WHERE id = '$software_resource_id';
EOF

download_fixture_key_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(DISTINCT artifact_key)
   FROM (
     SELECT artifact.object_key AS artifact_key
     FROM download_resources resource
     JOIN download_resource_revisions revision
       ON revision.id = ANY(array_remove(ARRAY[resource.published_revision_id, resource.draft_revision_id], NULL))
     JOIN download_resource_artifacts artifact ON artifact.revision_id = revision.id
     WHERE revision.cleanup_pending_at IS NULL
     UNION
     SELECT artifact.cover_object_key
     FROM download_resources resource
     JOIN download_resource_revisions revision
       ON revision.id = ANY(array_remove(ARRAY[resource.published_revision_id, resource.draft_revision_id], NULL))
     JOIN download_resource_artifacts artifact ON artifact.revision_id = revision.id
     WHERE revision.cleanup_pending_at IS NULL AND artifact.cover_object_key IS NOT NULL
   ) referenced")"
download_fixture_shape_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM download_resources
   WHERE (id = '$published_only_resource_id' AND state = 'published' AND published_revision_id = '$published_only_revision_id' AND draft_revision_id IS NULL)
      OR (id = '$draft_only_resource_id' AND state = 'unpublished' AND published_revision_id IS NULL AND draft_revision_id = '$draft_only_revision_id')
      OR (id = '$shared_resource_id' AND state = 'published' AND published_revision_id = '$shared_published_revision_id' AND draft_revision_id = '$shared_metadata_revision_id')
      OR (id = '$software_resource_id' AND kind = 'software' AND state = 'published' AND published_revision_id = '$software_revision_id' AND draft_revision_id IS NULL)")"
download_fixture_attachment_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*)
   FROM download_resources resource
   JOIN download_resource_revisions revision
     ON revision.id = ANY(array_remove(ARRAY[resource.published_revision_id, resource.draft_revision_id], NULL))
   JOIN download_resource_artifacts artifact
     ON artifact.revision_id = revision.id
    AND artifact.revision_kind = revision.resource_kind
   WHERE revision.cleanup_pending_at IS NULL
     AND artifact.sha256 ~ '^[0-9a-f]{64}$'")"
if [ "$download_fixture_key_count" != 8 ] || \
   [ "$download_fixture_shape_count" != 4 ] || \
   [ "$download_fixture_attachment_count" != 5 ]; then
  echo "download fixture setup failed" >&2
  exit 1
fi
echo "Download backup fixture: document_pdf_cover_webp_windows_macos=8 attachment_sha256=verified cleanup_pending_at=excluded unreferenced=excluded download-resources/staging=excluded"

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

backup_volume="${project}_backup_data"
compose run --rm --no-deps --entrypoint true backup
docker run --rm --user root -v "$backup_volume:/backups" \
  postgres:18.3-alpine3.23 sh -ceu '
  rm -f /backups/backup-test-control.ready /backups/backup-test-control.release
  mkfifo /backups/backup-test-control.ready /backups/backup-test-control.release
  chown postgres:postgres /backups/backup-test-control.ready /backups/backup-test-control.release
  chmod 0600 /backups/backup-test-control.ready /backups/backup-test-control.release
'
docker run --rm -v "$backup_volume:/backups" postgres:18.3-alpine3.23 sh -ceu '
  IFS= read -r marker </backups/backup-test-control.ready
  [ "$marker" = enumerated ]
' &
control_reader_pid=$!
compose run --rm --no-deps \
  -e BACKUP_TEST_CONTROL_FIFO=/backups/backup-test-control backup &
backup_pid=$!
control_wait_attempts=0
while kill -0 "$control_reader_pid" >/dev/null 2>&1; do
  if ! kill -0 "$backup_pid" >/dev/null 2>&1; then
    kill "$control_reader_pid" >/dev/null 2>&1 || true
    wait "$control_reader_pid" >/dev/null 2>&1 || true
    control_reader_pid=
    echo "backup exited before test control enumeration" >&2
    exit 1
  fi
  control_wait_attempts=$((control_wait_attempts + 1))
  if [ "$control_wait_attempts" -ge 300 ]; then
    kill "$control_reader_pid" >/dev/null 2>&1 || true
    wait "$control_reader_pid" >/dev/null 2>&1 || true
    control_reader_pid=
    echo "backup test control timed out" >&2
    exit 1
  fi
  sleep 0.1
done
if ! wait "$control_reader_pid"; then
  echo "backup test control did not reach enumeration" >&2
  exit 1
fi
control_reader_pid=

blocked_draft_pointer="$(docker exec "${project}-db-1" \
  psql -U "$owner" -d "$database" -Atqc \
  "SELECT draft_revision_id FROM download_resources WHERE id = '$draft_only_resource_id'")"
blocked_shared_pdf_sha="$(docker run --rm \
  -v "${project}_download_data:/downloads:ro" \
  postgres:18.3-alpine3.23 sh -ceu '
  digest=$(sha256sum "/downloads/$1")
  printf "%s" "${digest%% *}"
' sh "$shared_pdf_key")"
if [ "$blocked_draft_pointer" != "$draft_only_revision_id" ] ||
   [ "$blocked_shared_pdf_sha" != "$shared_pdf_sha" ]; then
  echo "blocked download mutation changed protected state" >&2
  exit 1
fi

(
  compose run --rm --no-deps \
    -e NODE_OPTIONS=--conditions=react-server \
    -e PGAPPNAME=download-fixture-pointer-mutation \
    -e DOWNLOAD_MUTATION_RESOURCE_ID="$draft_only_resource_id" \
    -e DOWNLOAD_MUTATION_DRAFT_ID=019faaaa-0000-7000-9000-000000000002 \
    -v "$repo_root/apps/web/src:/app/apps/web/src:ro" \
    migrate /app/packages/database/node_modules/.bin/tsx --eval '
      import { downloadResourceRepository } from "/app/apps/web/src/server/downloads/repository.ts";
      (async () => {
        const id = process.env.DOWNLOAD_MUTATION_RESOURCE_ID;
        const draftRevisionId = process.env.DOWNLOAD_MUTATION_DRAFT_ID;
        if (!id || !draftRevisionId) throw new Error("missing mutation fixture");
        await downloadResourceRepository.withArtifactMutationLock(async (tx) => {
          const resource = await tx.lockResource(id);
          if (!resource) throw new Error("mutation fixture not found");
          const updated = await tx.updateResourceCas({
            id,
            expectedRowVersion: resource.rowVersion,
            state: resource.state,
            publishedRevisionId: resource.publishedRevisionId,
            draftRevisionId,
          });
          if (!updated) throw new Error("mutation fixture changed");
        });
      })().then(
        () => process.exit(0),
        (error) => {
          console.error(
            error instanceof Error ? error.message : "repository mutation failed",
          );
          process.exit(1);
        },
      );
    ' >/dev/null
) &
mutation_pid=$!
mutation_poll_attempts=0
mutation_poll_count=0
until [ "$mutation_poll_count" = 1 ]; do
  mutation_poll_count="$(docker exec "${project}-db-1" \
    psql -U "$owner" -d "$database" -Atqc \
    "SELECT count(*) FROM pg_stat_activity
     WHERE application_name = 'download-fixture-pointer-mutation'
       AND state = 'idle'
       AND query LIKE '%pg_try_advisory_lock%'")"
  if ! kill -0 "$mutation_pid" >/dev/null 2>&1; then
    wait "$mutation_pid" >/dev/null 2>&1 || true
    mutation_pid=
    echo "download fixture pointer mutation did not remain pending" >&2
    exit 1
  fi
  mutation_poll_attempts=$((mutation_poll_attempts + 1))
  if [ "$mutation_poll_attempts" -ge 100 ]; then
    echo "download fixture pointer mutation did not enter lock polling" >&2
    exit 1
  fi
  sleep 0.1
done
if ! kill -0 "$mutation_pid" >/dev/null 2>&1; then
  wait "$mutation_pid" >/dev/null 2>&1 || true
  mutation_pid=
  echo "download fixture pointer mutation did not remain pending" >&2
  exit 1
fi
waiting_draft_pointer="$(docker exec "${project}-db-1" \
  psql -U "$owner" -d "$database" -Atqc \
  "SELECT draft_revision_id FROM download_resources WHERE id = '$draft_only_resource_id'")"
waiting_shared_pdf_sha="$(docker run --rm \
  -v "${project}_download_data:/downloads:ro" \
  postgres:18.3-alpine3.23 sh -ceu '
  digest=$(sha256sum "/downloads/$1")
  printf "%s" "${digest%% *}"
' sh "$shared_pdf_key")"
if [ "$waiting_draft_pointer" != "$blocked_draft_pointer" ] ||
   [ "$waiting_shared_pdf_sha" != "$blocked_shared_pdf_sha" ]; then
  echo "blocked download mutation changed protected state" >&2
  exit 1
fi
docker run --rm -v "$backup_volume:/backups" postgres:18.3-alpine3.23 sh -ceu \
  'printf "release\n" >/backups/backup-test-control.release' &
release_writer_pid=$!
release_wait_attempts=0
while kill -0 "$release_writer_pid" >/dev/null 2>&1; do
  if ! kill -0 "$backup_pid" >/dev/null 2>&1; then
    sleep 0.1
    if kill -0 "$release_writer_pid" >/dev/null 2>&1; then
      kill "$release_writer_pid" >/dev/null 2>&1 || true
      wait "$release_writer_pid" >/dev/null 2>&1 || true
      release_writer_pid=
      echo "backup exited before test control release" >&2
      exit 1
    fi
  fi
  release_wait_attempts=$((release_wait_attempts + 1))
  if [ "$release_wait_attempts" -ge 300 ]; then
    kill "$release_writer_pid" >/dev/null 2>&1 || true
    wait "$release_writer_pid" >/dev/null 2>&1 || true
    release_writer_pid=
    echo "backup test release timed out" >&2
    exit 1
  fi
  sleep 0.1
done
if ! wait "$release_writer_pid"; then
  echo "backup test release failed" >&2
  exit 1
fi
release_writer_pid=
if ! wait "$backup_pid"; then
  echo "controlled backup failed" >&2
  exit 1
fi
backup_pid=
if ! wait "$mutation_pid"; then
  echo "download fixture pointer mutation failed" >&2
  exit 1
fi
mutation_pid=
mutated_draft_pointer="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT draft_revision_id FROM download_resources WHERE id = '$draft_only_resource_id'")"
if [ "$mutated_draft_pointer" != 019faaaa-0000-7000-9000-000000000002 ]; then
  echo "download fixture pointer mutation did not complete" >&2
  exit 1
fi
docker run --rm -v "$backup_volume:/backups" postgres:18.3-alpine3.23 \
  rm -f /backups/backup-test-control.ready /backups/backup-test-control.release

attempt=0
until docker run --rm -v "$backup_volume:/backups:ro" \
  postgres:18.3-alpine3.23 sh -c \
  'find /backups -maxdepth 1 -type f -name "ai-agent-platform-*.dump.gpg" | grep -q .' \
  >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "backup dump was not generated" >&2
    exit 1
  fi
  sleep 1
done

docker run --rm \
  -e OUTPUT_UID="$(id -u)" \
  -e OUTPUT_GID="$(id -g)" \
  -v "$backup_volume:/backups:ro" \
  -v "$dump_dir:/out" \
  postgres:18.3-alpine3.23 sh -c \
  'dump=$(find /backups -maxdepth 1 -type f -name "ai-agent-platform-*.dump.gpg" | head -n 1); test -n "$dump"; cp "$dump" /out/generated.dump.gpg; chown "$OUTPUT_UID:$OUTPUT_GID" /out/generated.dump.gpg; chmod 0600 /out/generated.dump.gpg'

backup_crypto_image="${project}-backup:latest"
skill_registry_image="${project}-skill-registry:latest"
docker image inspect "$backup_crypto_image" >/dev/null 2>&1 || {
  echo "backup crypto image was not built" >&2
  exit 1
}
docker image inspect "$skill_registry_image" >/dev/null 2>&1 || {
  echo "skill registry image was not built" >&2
  exit 1
}
docker run --rm --entrypoint gpg "$backup_crypto_image" --version | sed -n '1p'

packet_output="$temp_dir/openpgp-packets.log"
packet_gpg_home="$temp_dir/openpgp-packet-home"
mkdir -p "$packet_gpg_home"
chmod 700 "$packet_gpg_home"
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --entrypoint gpg \
  -v "$dump_dir:/input:ro" \
  -v "$packet_gpg_home:/gnupg" \
  -v "$BACKUP_ENCRYPTION_KEY_FILE:/run/secrets/backup_encryption_key:ro" \
  "$backup_crypto_image" \
  --homedir /gnupg \
  --batch \
  --no-tty \
  --pinentry-mode loopback \
  --no-symkey-cache \
  --passphrase-file /run/secrets/backup_encryption_key \
  --list-packets /input/generated.dump.gpg >"$packet_output" 2>&1
for packet_contract in \
  "cipher 9" \
  "aead 0" \
  "s2k 3" \
  "hash 10" \
  "count 65011712" \
  "mdc_method: 2"; do
  grep -F "$packet_contract" "$packet_output" >/dev/null || {
    echo "OpenPGP packet contract is missing: $packet_contract" >&2
    exit 1
  }
done
grep -F "$backup_encryption_key" "$packet_output" >/dev/null 2>&1 && {
  echo "OpenPGP packet inspection leaked the encryption key" >&2
  exit 1
}
rm -rf "$packet_output" "$packet_gpg_home"
echo "OpenPGP packet contract verified: AES256 S2K3 SHA512 count=65011712 MDC"

assert_restore_rejected() {
  rejection_label=$1
  rejection_key_file=$2
  rejection_backup_file=$3
  rejection_output="$temp_dir/$rejection_label.log"
  rejection_work_root="$temp_dir/$rejection_label-work"
  mkdir -p "$rejection_work_root"

  rejection_started_at=$(date +%s)
  if BACKUP_ENCRYPTION_KEY_FILE="$rejection_key_file" \
    BACKUP_CRYPTO_IMAGE="$backup_crypto_image" \
    RESTORE_SKILL_REGISTRY_IMAGE="$skill_registry_image" \
    RESTORE_TMP_ROOT="$rejection_work_root" \
    infra/docker/restore-drill.sh \
      "$rejection_backup_file" \
      "$platform_user_count" \
      "$agno_session_count" \
      "$platform_user_id" \
      "$agno_session_id" >"$rejection_output" 2>&1; then
    echo "$rejection_label restore unexpectedly succeeded" >&2
    exit 1
  fi
  rejection_elapsed_seconds=$(($(date +%s) - rejection_started_at))
  if [ "$rejection_elapsed_seconds" -gt 30 ]; then
    echo "restore rejection exceeded its bounded runtime" >&2
    exit 1
  fi
  if find "$rejection_work_root" -type f -name '*.dump*' | grep -q .; then
    echo "$rejection_label restore left a usable plaintext dump" >&2
    exit 1
  fi
  if find "$rejection_work_root" -mindepth 1 -print | grep -q .; then
    echo "$rejection_label restore left a temporary path" >&2
    exit 1
  fi
  if docker ps -a --filter 'name=aap-restore-' --format '{{.Names}}' | grep -q .; then
    echo "$rejection_label restore left a container" >&2
    exit 1
  fi
  if docker volume ls --filter 'name=aap-restore-' --format '{{.Name}}' | grep -q .; then
    echo "$rejection_label restore left a volume" >&2
    exit 1
  fi
  for sensitive_value in \
    "$backup_password" \
    "$backup_encryption_key" \
    "$wrong_backup_encryption_key" \
    "backup restore fixture" \
    "backup-restore-fixture@example.invalid"; do
    if grep -F "$sensitive_value" "$rejection_output" >/dev/null 2>&1; then
      echo "$rejection_label restore leaked protected data" >&2
      exit 1
    fi
  done
  rm -rf "$rejection_output" "$rejection_work_root"
}

assert_restore_rejected \
  wrong-key \
  "$WRONG_BACKUP_ENCRYPTION_KEY_FILE" \
  "$dump_dir/generated.dump.gpg"
echo "wrong encryption key was rejected"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --entrypoint sh \
  -v "$dump_dir:/work" \
  "$backup_crypto_image" \
  -c '
    set -eu
    cp /work/generated.dump.gpg /work/tampered.dump.gpg
    size=$(wc -c </work/tampered.dump.gpg)
    [ "$size" -gt 64 ]
    offset=$((size - 8))
    original=$(dd if=/work/tampered.dump.gpg bs=1 skip="$offset" count=1 2>/dev/null | od -An -tu1 | tr -d " ")
    [ -n "$original" ]
    flipped=$((original ^ 1))
    LC_ALL=C awk -v byte="$flipped" "BEGIN { printf \"%c\", byte }" | dd of=/work/tampered.dump.gpg bs=1 seek="$offset" count=1 conv=notrunc 2>/dev/null
    chmod 0600 /work/tampered.dump.gpg
  '
cmp -s "$dump_dir/generated.dump.gpg" "$dump_dir/tampered.dump.gpg" && {
  echo "ciphertext tamper fixture was not modified" >&2
  exit 1
}
assert_restore_rejected \
  tampered-ciphertext \
  "$BACKUP_ENCRYPTION_KEY_FILE" \
  "$dump_dir/tampered.dump.gpg"
echo "tampered ciphertext was rejected"

restore_output="$temp_dir/restore-output.log"
if ! BACKUP_ENCRYPTION_KEY_FILE="$BACKUP_ENCRYPTION_KEY_FILE" \
  BACKUP_CRYPTO_IMAGE="$backup_crypto_image" \
  RESTORE_SKILL_REGISTRY_IMAGE="$skill_registry_image" \
  RESTORE_EXPECTED_ARTIFACT_REVISION_ID="$skill_artifact_revision_id" \
  RESTORE_EXPECTED_ARTIFACT_SHA256="$skill_artifact_sha" \
  infra/docker/restore-drill.sh \
    "$dump_dir/generated.dump.gpg" \
    "$platform_user_count" \
    "$agno_session_count" \
    "$platform_user_id" \
    "$agno_session_id" >"$restore_output" 2>&1; then
  cat "$restore_output" >&2
  exit 1
fi
grep -E 'revisions=[1-9][0-9]* artifacts=[1-9][0-9]* files=[1-9][0-9]* artifact_digests_verified=[1-9][0-9]*' \
  "$restore_output" >/dev/null || {
  echo "restore did not verify a nonempty Skill Registry artifact" >&2
  exit 1
}
grep -E 'download_artifacts=8 download_bytes=[1-9][0-9]*$' \
  "$restore_output" >/dev/null || {
  echo "restore did not verify the exact download artifact set" >&2
  exit 1
}
cat "$restore_output"

case "$skill_artifact_sha" in
  0*) different_artifact_sha="1${skill_artifact_sha#?}" ;;
  *) different_artifact_sha="0${skill_artifact_sha#?}" ;;
esac
mismatch_output="$temp_dir/restore-artifact-mismatch.log"
if BACKUP_ENCRYPTION_KEY_FILE="$BACKUP_ENCRYPTION_KEY_FILE" \
  BACKUP_CRYPTO_IMAGE="$backup_crypto_image" \
  RESTORE_SKILL_REGISTRY_IMAGE="$skill_registry_image" \
  RESTORE_EXPECTED_ARTIFACT_REVISION_ID="$skill_artifact_revision_id" \
  RESTORE_EXPECTED_ARTIFACT_SHA256="$different_artifact_sha" \
  infra/docker/restore-drill.sh \
    "$dump_dir/generated.dump.gpg" \
    "$platform_user_count" \
    "$agno_session_count" \
    "$platform_user_id" \
    "$agno_session_id" >"$mismatch_output" 2>&1; then
  echo "restore exact artifact digest mismatch unexpectedly succeeded" >&2
  exit 1
fi
grep -Fx "restore drill failed critical table checks" "$mismatch_output" >/dev/null || {
  echo "restore exact artifact digest mismatch was not rejected generically" >&2
  exit 1
}
if grep -F "$skill_artifact_sha" "$mismatch_output" >/dev/null 2>&1 || \
   grep -F "$different_artifact_sha" "$mismatch_output" >/dev/null 2>&1; then
  echo "restore exact artifact digest mismatch leaked a digest" >&2
  exit 1
fi
success_message="AgentOS backup and restore acceptance passed"
