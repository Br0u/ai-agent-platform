#!/bin/sh

set -eu

mode=${1:-}
case "$mode" in
  timeout|controlled-failure) ;;
  *)
    echo "usage: $0 timeout|controlled-failure" >&2
    exit 64
    ;;
esac

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

base_image=aap-backup-lifecycle-base-task9
stubborn_image=aap-backup-lifecycle-stubborn-task9
copy_image=aap-backup-lifecycle-copy-task9
temporary_directory=
success_message=

cleanup() {
  cleanup_status=$?
  cleanup_failed=false
  trap '' INT TERM
  trap - EXIT
  if command -v docker >/dev/null 2>&1; then
    if ! docker image rm -f \
      "$copy_image" "$stubborn_image" "$base_image" \
      >/dev/null 2>&1; then
      cleanup_failed=true
    fi
  fi
  if [ -n "$temporary_directory" ]; then
    if rm -rf "$temporary_directory" >/dev/null 2>&1; then
      temporary_directory=
    else
      cleanup_failed=true
    fi
  fi
  if [ "$cleanup_failed" = true ]; then
    echo "restore lifecycle runner cleanup failed" >&2
    if [ "$cleanup_status" -eq 0 ]; then
      cleanup_status=1
    fi
  elif [ "$cleanup_status" -eq 0 ] && [ -n "$success_message" ]; then
    printf '%s\n' "$success_message"
  fi
  exit "$cleanup_status"
}

on_signal() {
  trap '' INT TERM
  exit "$1"
}

trap 'cleanup' EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

command -v docker >/dev/null 2>&1 || {
  echo "docker is required" >&2
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
temporary_directory=$(mktemp -d "$runtime_tmp/aap-restore-lifecycle.XXXXXX")
restore_root="$temporary_directory/restore"
fixture_root="$temporary_directory/fixture"
key_file="$temporary_directory/backup-encryption-key"
encrypted_file="$temporary_directory/fixture.bundle.gpg"
output_file="$temporary_directory/restore.output"
mkdir -p "$restore_root" "$fixture_root"
chmod 700 "$temporary_directory" "$restore_root" "$fixture_root"
printf '%s\n' '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' \
  >"$key_file"
chmod 600 "$key_file"

docker build \
  --tag "$base_image" \
  --file infra/docker/backup.Dockerfile \
  .

case "$mode" in
  timeout)
    docker build \
      --tag "$stubborn_image" \
      --file docs/testing/fixtures/restore-docker-lifecycle/stubborn.Dockerfile \
      .
    printf '%s\n' 'stubborn decrypt fixture' >"$encrypted_file"
    crypto_image=$stubborn_image
    decrypt_timeout=1
    docker_cli_timeout=5
    expected_output='restore drill decryption timed out'
    maximum_elapsed=30
    ;;
  controlled-failure)
    docker build \
      --tag "$copy_image" \
      --file docs/testing/fixtures/restore-docker-lifecycle/copy.Dockerfile \
      .
    printf '%s\n' 'not-a-postgresql-custom-dump' \
      >"$fixture_root/database.dump"
    if command -v sha256sum >/dev/null 2>&1; then
      dump_digest=$(sha256sum "$fixture_root/database.dump")
      dump_digest=${dump_digest%% *}
    elif command -v shasum >/dev/null 2>&1; then
      dump_digest=$(shasum -a 256 "$fixture_root/database.dump")
      dump_digest=${dump_digest%% *}
    else
      echo "sha256sum or shasum is required" >&2
      exit 1
    fi
    cat >"$fixture_root/skill-backup.manifest" <<EOF
format_version=1
dump_sha256=$dump_digest
skill_registry_schema_version=1
skill_revision_count=0
skill_artifact_count=0
skill_file_count=0
EOF
    COPYFILE_DISABLE=1 tar --no-xattrs -cf "$encrypted_file" \
      -C "$fixture_root" \
      skill-backup.manifest database.dump
    crypto_image=$copy_image
    decrypt_timeout=30
    docker_cli_timeout=10
    expected_output='restore drill failed database restore'
    maximum_elapsed=90
    ;;
esac
chmod 600 "$encrypted_file"

started_at=$(date +%s)
set +e
BACKUP_ENCRYPTION_KEY_FILE="$key_file" \
BACKUP_CRYPTO_IMAGE="$crypto_image" \
RESTORE_TMP_ROOT="$restore_root" \
RESTORE_MAX_ENCRYPTED_BYTES=1048576 \
RESTORE_MAX_DECRYPTED_BYTES=1048576 \
RESTORE_SPACE_SAFETY_BYTES=0 \
RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS=10 \
RESTORE_DOCKER_CLI_TIMEOUT_SECONDS="$docker_cli_timeout" \
RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS=2 \
RESTORE_DECRYPT_TIMEOUT_SECONDS="$decrypt_timeout" \
RESTORE_DECRYPT_KILL_AFTER_SECONDS=2 \
RESTORE_DECRYPT_RECONCILE_ATTEMPTS=3 \
RESTORE_DOCKER_CREATE_SETTLE_SECONDS=5 \
  sh infra/docker/restore-drill.sh \
    "$encrypted_file" \
    1 \
    1 \
    00000000-0000-4000-8000-000000000001 \
    backup-restore-session-fixture-v1 \
    >"$output_file" 2>&1
restore_status=$?
set -e
elapsed_seconds=$(($(date +%s) - started_at))

if [ "$restore_status" -ne 1 ]; then
  echo "$mode restore exited with status $restore_status instead of 1" >&2
  exit 1
fi
if [ "$(cat "$output_file")" != "$expected_output" ]; then
  echo "$mode restore emitted unexpected output" >&2
  exit 1
fi
if [ "$elapsed_seconds" -gt "$maximum_elapsed" ]; then
  echo "$mode restore exceeded its bounded runtime" >&2
  exit 1
fi
if find "$restore_root" -mindepth 1 -print | grep -q .; then
  echo "$mode restore left a temporary path" >&2
  exit 1
fi
if docker ps -a --filter 'name=aap-restore-' --format '{{.Names}}' | grep -q .; then
  echo "$mode restore left a container" >&2
  exit 1
fi
if docker volume ls --filter 'name=aap-restore-' --format '{{.Name}}' | grep -q .; then
  echo "$mode restore left a volume" >&2
  exit 1
fi

success_message="$mode restore lifecycle acceptance passed in ${elapsed_seconds}s"
