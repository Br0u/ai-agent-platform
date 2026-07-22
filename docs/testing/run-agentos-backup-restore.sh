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
assistant_session_secret=$(secret)
assistant_rate_limit_secret=$(secret)
model_api_key=$(secret)
model_config_encryption_key=$(secret)
agent_config_control_key=$(secret)
skill_registry_control_key=$(secret)
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
materialize_secret BETTER_AUTH_SECRET_FILE better_auth_secret "$better_auth_secret"
materialize_secret OS_SECURITY_KEY_FILE os_security_key "$os_security_key"
materialize_secret ASSISTANT_SESSION_SECRET_FILE assistant_session_secret "$assistant_session_secret"
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
BETTER_AUTH_SECRET_FILE=$BETTER_AUTH_SECRET_FILE
OS_SECURITY_KEY_FILE=$OS_SECURITY_KEY_FILE
ASSISTANT_SESSION_SECRET_FILE=$ASSISTANT_SESSION_SECRET_FILE
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
        ("scripts/hello.py", b"#!/usr/bin/env python3\nprint(1)\n"),
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
    assert result["revision"]["state"] == "pending_review"
' >/dev/null

skill_revision_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM skill_registry.skill_revisions")"
skill_artifact_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM skill_registry.skill_revision_artifacts")"
skill_file_count="$(compose exec -T db psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM skill_registry.skill_revision_files")"
if [ "$skill_revision_count" -le 0 ] || \
   [ "$skill_artifact_count" -le 0 ] || \
   [ "$skill_file_count" -le 0 ]; then
  echo "Skill Registry backup fixture is empty" >&2
  exit 1
fi
echo "Skill Registry backup fixture: revisions=$skill_revision_count artifacts=$skill_artifact_count files=$skill_file_count"

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

compose run --rm --no-deps backup

backup_volume="${project}_backup_data"
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
  -v "$backup_volume:/backups:ro" \
  -v "$dump_dir:/out" \
  postgres:18.3-alpine3.23 sh -c \
  'dump=$(find /backups -maxdepth 1 -type f -name "ai-agent-platform-*.dump.gpg" | head -n 1); test -n "$dump"; cp "$dump" /out/generated.dump.gpg; chmod 0600 /out/generated.dump.gpg'

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
cat "$restore_output"
echo "AgentOS backup and restore acceptance passed"
