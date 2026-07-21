#!/bin/sh

set -eu

backup_file="${1:-}"
expected_user_count="${2:-}"
expected_agno_session_count="${3:-}"
expected_user_id="${4:-}"
expected_agno_session_id="${5:-}"
if [ "$#" -ne 5 ] || [ -z "$backup_file" ] || [ ! -f "$backup_file" ] || \
   [ -L "$backup_file" ]; then
  echo "usage: $0 ENCRYPTED_BUNDLE EXPECTED_USERS EXPECTED_AGNO_SESSIONS USER_FIXTURE_ID AGNO_SESSION_FIXTURE_ID" >&2
  exit 64
fi
: "${BACKUP_ENCRYPTION_KEY_FILE:?Set BACKUP_ENCRYPTION_KEY_FILE to a readable secret file}"
script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
"$script_directory/validate-backup-key.sh" "$BACKUP_ENCRYPTION_KEY_FILE"
max_encrypted_bytes="${RESTORE_MAX_ENCRYPTED_BYTES:-2147483648}"
max_decrypted_bytes="${RESTORE_MAX_DECRYPTED_BYTES:-4294967296}"
decrypt_timeout_seconds="${RESTORE_DECRYPT_TIMEOUT_SECONDS:-3600}"
decrypt_kill_after_seconds="${RESTORE_DECRYPT_KILL_AFTER_SECONDS:-5}"
docker_create_timeout_seconds="${RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS:-30}"
docker_cli_timeout_seconds="${RESTORE_DOCKER_CLI_TIMEOUT_SECONDS:-10}"
docker_cli_kill_after_seconds="${RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS:-2}"
docker_reconcile_attempts="${RESTORE_DECRYPT_RECONCILE_ATTEMPTS:-3}"
docker_create_settle_seconds="${RESTORE_DOCKER_CREATE_SETTLE_SECONDS:-5}"
restore_space_safety_bytes="${RESTORE_SPACE_SAFETY_BYTES:-67108864}"
for byte_limit in "$max_encrypted_bytes" "$max_decrypted_bytes"; do
  case "$byte_limit" in
    ''|*[!0-9]*)
      echo "restore drill size limit configuration is invalid" >&2
      exit 64
      ;;
  esac
  if [ "${#byte_limit}" -gt 13 ] || [ "$byte_limit" -le 0 ]; then
    echo "restore drill size limit configuration is invalid" >&2
    exit 64
  fi
done
case "$restore_space_safety_bytes" in
  ''|*[!0-9]*)
    echo "restore drill space budget configuration is invalid" >&2
    exit 64
    ;;
esac
if [ "${#restore_space_safety_bytes}" -gt 13 ]; then
  echo "restore drill space budget configuration is invalid" >&2
  exit 64
fi
for timeout_limit in \
  "$decrypt_timeout_seconds" \
  "$decrypt_kill_after_seconds" \
  "$docker_create_timeout_seconds" \
  "$docker_cli_timeout_seconds" \
  "$docker_cli_kill_after_seconds"; do
  case "$timeout_limit" in
    ''|*[!0-9]*)
      echo "restore drill timeout configuration is invalid" >&2
      exit 64
      ;;
  esac
  if [ "${#timeout_limit}" -gt 6 ] || [ "$timeout_limit" -le 0 ] || \
     [ "$timeout_limit" -gt 86400 ]; then
    echo "restore drill timeout configuration is invalid" >&2
    exit 64
  fi
done
case "$docker_reconcile_attempts" in
  ''|*[!0-9]*)
    echo "restore drill timeout configuration is invalid" >&2
    exit 64
    ;;
esac
if [ "$docker_reconcile_attempts" -lt 2 ] || \
   [ "$docker_reconcile_attempts" -gt 10 ]; then
  echo "restore drill timeout configuration is invalid" >&2
  exit 64
fi
case "$docker_create_settle_seconds" in
  ''|*[!0-9]*)
    echo "restore drill timeout configuration is invalid" >&2
    exit 64
    ;;
esac
if [ "$docker_create_settle_seconds" -lt 1 ] || \
   [ "$docker_create_settle_seconds" -gt 300 ]; then
  echo "restore drill timeout configuration is invalid" >&2
  exit 64
fi
if ! sleep 0.1 2>/dev/null; then
  echo "restore drill host timing support is unavailable" >&2
  exit 1
fi
encrypted_size_bytes="$(wc -c <"$backup_file" | tr -d ' ')"
case "$encrypted_size_bytes" in
  ''|*[!0-9]*)
    echo "restore drill could not determine encrypted backup size" >&2
    exit 1
    ;;
esac
if [ "$encrypted_size_bytes" -gt "$max_encrypted_bytes" ]; then
  echo "restore drill rejected oversized encrypted backup" >&2
  exit 1
fi
for expected_count in "$expected_user_count" "$expected_agno_session_count"; do
  case "$expected_count" in
    ''|*[!0-9]*)
      echo "expected restored counts must be positive integers" >&2
      exit 64
      ;;
  esac
  if [ "${#expected_count}" -gt 20 ] || [ "$expected_count" -le 0 ]; then
    echo "expected restored counts must be positive integers" >&2
    exit 64
  fi
done
case "$expected_user_id" in
  ''|*[!0-9A-Fa-f-]*)
    echo "user fixture id is invalid" >&2
    exit 64
    ;;
esac
case "$expected_agno_session_id" in
  ''|*[!A-Za-z0-9._-]*)
    echo "Agno session fixture id is invalid" >&2
    exit 64
    ;;
esac

case "$backup_file" in
  /*) ;;
  *) backup_file="$(pwd)/$backup_file" ;;
esac
case "$BACKUP_ENCRYPTION_KEY_FILE" in
  /*) ;;
  *) BACKUP_ENCRYPTION_KEY_FILE="$(pwd)/$BACKUP_ENCRYPTION_KEY_FILE" ;;
esac

run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
container="aap-restore-drill-$run_id"
decrypt_container="aap-restore-decrypt-$run_id"
bundle_container="aap-restore-bundle-$run_id"
digest_container="aap-restore-digest-$run_id"
registry_migration_container="aap-restore-registry-$run_id"
volume="aap-restore-drill-$run_id"
database="restore_drill"
owner="restore_owner"
crypto_image="${BACKUP_CRYPTO_IMAGE:-ai-agent-platform-backup:latest}"
skill_registry_image="${RESTORE_SKILL_REGISTRY_IMAGE:-ai-agent-platform-skill-registry:latest}"
postgres_bootstrap_directory="$(CDPATH= cd -- "$script_directory/../postgres" && pwd)"
expected_migrations="8"
expected_latest_migration="1784480751832"
temporary_directory=
postgres_env_file=
decrypted_bundle_candidate=
decrypted_bundle=
decrypt_work_directory=
extraction_directory=
roles_env_file=
skill_registry_migrator_url_file=
owner_password_file=
manager_insert_check_file=
backup_insert_denied_file=
database_restore_output_file=
database_restore_diagnostic_file=
docker_stdout_file=
docker_diagnostic_file=
dump_digest_file=
resource_registry_directory=
manager_delete_error_file=
backup_insert_error_file=
runtime_select_error_file=
active_docker_pid=
active_docker_phase=
docker_command_timed_out=false
docker_command_outcome=definite_failure
cleanup_running=false
cleanup_error_reported=false
docker_query_state=unknown
container_wait_status=
docker_scalar=
restore_success_message=

terminate_active_docker() {
  [ -n "$active_docker_pid" ] || return 0
  docker_pid=$active_docker_pid
  kill -TERM "$docker_pid" >/dev/null 2>&1 || true
  docker_grace_ticks=0
  docker_grace_limit=$((docker_cli_kill_after_seconds * 10))
  while kill -0 "$docker_pid" >/dev/null 2>&1 && \
        [ "$docker_grace_ticks" -lt "$docker_grace_limit" ]; do
    sleep 0.1
    docker_grace_ticks=$((docker_grace_ticks + 1))
  done
  if kill -0 "$docker_pid" >/dev/null 2>&1; then
    kill -KILL "$docker_pid" >/dev/null 2>&1 || true
  fi
  wait "$docker_pid" >/dev/null 2>&1 || true
  active_docker_pid=
  active_docker_phase=
}

run_bounded_docker() {
  docker_timeout=$1
  docker_phase=$2
  docker_output_path=$3
  docker_diagnostic_path=$4
  shift 4
  : >"$docker_output_path"
  : >"$docker_diagnostic_path"
  chmod 600 "$docker_output_path" "$docker_diagnostic_path"
  docker_command_timed_out=false
  docker_command_outcome=ambiguous
  docker "$@" >"$docker_output_path" 2>"$docker_diagnostic_path" &
  active_docker_pid=$!
  active_docker_phase=$docker_phase
  docker_elapsed_ticks=0
  docker_timeout_limit=$((docker_timeout * 10))
  while kill -0 "$active_docker_pid" >/dev/null 2>&1; do
    if [ "$docker_elapsed_ticks" -ge "$docker_timeout_limit" ]; then
      docker_command_timed_out=true
      terminate_active_docker
      return 124
    fi
    sleep 0.1
    docker_elapsed_ticks=$((docker_elapsed_ticks + 1))
  done
  completed_docker_pid=$active_docker_pid
  if wait "$completed_docker_pid"; then
    docker_status=0
  else
    docker_status=$?
  fi
  active_docker_pid=
  active_docker_phase=
  if [ "$docker_status" -eq 0 ]; then
    docker_command_outcome=success
  else
    docker_command_outcome=definite_failure
  fi
  return "$docker_status"
}

register_docker_resource() {
  resource_key=$1
  resource_type=$2
  resource_name=$3
  resource_path="$resource_registry_directory/$resource_key"
  mkdir "$resource_path"
  chmod 700 "$resource_path"
  printf '%s\n' "$resource_type" >"$resource_path/type"
  printf '%s\n' "$resource_name" >"$resource_path/name"
  printf '%s\n' ambiguous >"$resource_path/outcome"
  chmod 600 "$resource_path/type" "$resource_path/name" "$resource_path/outcome"
}

set_docker_resource_outcome() {
  resource_key=$1
  resource_outcome=$2
  printf '%s\n' "$resource_outcome" \
    >"$resource_registry_directory/$resource_key/outcome"
}

run_registered_create() {
  resource_key=$1
  resource_type=$2
  resource_name=$3
  resource_phase=$4
  shift 4
  register_docker_resource "$resource_key" "$resource_type" "$resource_name"
  if run_bounded_docker \
    "$docker_create_timeout_seconds" "$resource_phase" \
    "$docker_stdout_file" "$docker_diagnostic_file" \
    "$@"; then
    set_docker_resource_outcome "$resource_key" success
    return 0
  else
    create_status=$?
  fi
  if [ "$docker_command_outcome" = definite_failure ]; then
    set_docker_resource_outcome "$resource_key" definite_failure
  fi
  return "$create_status"
}

run_container_start() {
  start_phase=$1
  start_container=$2
  run_bounded_docker \
    "$docker_cli_timeout_seconds" "$start_phase" \
    "$docker_stdout_file" "$docker_diagnostic_file" \
    start "$start_container"
}

run_container_wait() {
  wait_timeout=$1
  wait_phase=$2
  wait_container=$3
  container_wait_status=
  if ! run_bounded_docker \
    "$wait_timeout" "$wait_phase" \
    "$docker_stdout_file" "$docker_diagnostic_file" \
    wait "$wait_container"; then
    return 1
  fi
  wait_output="$(cat "$docker_stdout_file")"
  case "$wait_output" in
    ''|*[!0-9]*) return 1 ;;
  esac
  if [ "${#wait_output}" -gt 3 ] || [ "$wait_output" -gt 255 ]; then
    return 1
  fi
  container_wait_status=$wait_output
}

query_docker_resource() {
  query_resource_type=$1
  query_resource_name=$2
  query_phase=$3
  docker_query_state=unknown
  case "$query_resource_type" in
    container)
      if ! run_bounded_docker \
        "$docker_cli_timeout_seconds" "$query_phase" \
        "$docker_stdout_file" "$docker_diagnostic_file" \
        ps -a \
          --filter "name=^/$query_resource_name$" \
          --format '{{.Names}}'; then
        return 0
      fi
      ;;
    volume)
      if ! run_bounded_docker \
        "$docker_cli_timeout_seconds" "$query_phase" \
        "$docker_stdout_file" "$docker_diagnostic_file" \
        volume ls \
          --filter "name=^$query_resource_name$" \
          --format '{{.Name}}'; then
        return 0
      fi
      ;;
    *) return 0 ;;
  esac
  query_output="$(cat "$docker_stdout_file")"
  if [ -z "$query_output" ]; then
    docker_query_state=absent
  elif [ "$query_output" = "$query_resource_name" ]; then
    docker_query_state=exists
  fi
}

remove_docker_resource() {
  remove_resource_type=$1
  remove_resource_name=$2
  remove_phase=$3
  case "$remove_resource_type" in
    container)
      run_bounded_docker \
        "$docker_cli_timeout_seconds" "${remove_phase}_rm" \
        "$docker_stdout_file" "$docker_diagnostic_file" \
        rm -f "$remove_resource_name"
      ;;
    volume)
      run_bounded_docker \
        "$docker_cli_timeout_seconds" "${remove_phase}_rm" \
        "$docker_stdout_file" "$docker_diagnostic_file" \
        volume rm "$remove_resource_name"
      ;;
    *) return 1 ;;
  esac
}

reconcile_successful_resource() {
  reconcile_resource_type=$1
  reconcile_resource_name=$2
  reconcile_phase=$3
  reconcile_attempt=0
  absent_checks=0
  while [ "$reconcile_attempt" -lt "$docker_reconcile_attempts" ]; do
    reconcile_attempt=$((reconcile_attempt + 1))
    if remove_docker_resource \
      "$reconcile_resource_type" "$reconcile_resource_name" \
      "$reconcile_phase"; then
      return 0
    fi
    query_docker_resource \
      "$reconcile_resource_type" \
      "$reconcile_resource_name" \
      "${reconcile_phase}_query"
    case "$docker_query_state" in
      absent)
        absent_checks=$((absent_checks + 1))
        if [ "$absent_checks" -ge 2 ]; then
          return 0
        fi
        ;;
      exists|unknown) absent_checks=0 ;;
    esac
    if [ "$reconcile_attempt" -lt "$docker_reconcile_attempts" ]; then
      sleep 1
    fi
  done
  return 1
}

reconcile_ambiguous_resource() {
  reconcile_resource_type=$1
  reconcile_resource_name=$2
  reconcile_phase=$3
  settle_deadline=$(($(date +%s) + docker_create_settle_seconds))
  while :; do
    [ "$(date +%s)" -lt "$settle_deadline" ] || return 1
    if remove_docker_resource \
      "$reconcile_resource_type" "$reconcile_resource_name" \
      "$reconcile_phase"; then
      return 0
    fi
    [ "$(date +%s)" -lt "$settle_deadline" ] || return 1
    query_docker_resource \
      "$reconcile_resource_type" \
      "$reconcile_resource_name" \
      "${reconcile_phase}_query"
    sleep 0.1
  done
}

reconcile_registered_resource() {
  resource_path=$1
  resource_key=${resource_path##*/}
  resource_type="$(cat "$resource_path/type")"
  resource_name="$(cat "$resource_path/name")"
  resource_outcome="$(cat "$resource_path/outcome")"
  case "$resource_outcome" in
    definite_failure) return 0 ;;
    success)
      reconcile_successful_resource \
        "$resource_type" "$resource_name" "$resource_key"
      ;;
    ambiguous)
      reconcile_ambiguous_resource \
        "$resource_type" "$resource_name" "$resource_key"
      ;;
    *) return 1 ;;
  esac
}

report_cleanup_failure() {
  if [ "$cleanup_error_reported" = "false" ]; then
    echo "restore drill cleanup failed" >&2
    cleanup_error_reported=true
  fi
}

cleanup() {
  [ "$cleanup_running" = "false" ] || return 0
  cleanup_running=true
  cleanup_failed=false
  terminate_active_docker
  if [ -n "$resource_registry_directory" ] && \
     [ -d "$resource_registry_directory" ]; then
    for resource_path in "$resource_registry_directory"/*; do
      [ -d "$resource_path" ] || continue
      if ! reconcile_registered_resource "$resource_path"; then
        cleanup_failed=true
      fi
    done
  fi
  if [ -n "$temporary_directory" ]; then
    if rm -rf "$temporary_directory"; then
      temporary_directory=
    else
      cleanup_failed=true
    fi
  fi
  cleanup_running=false
  if [ "$cleanup_failed" = "true" ]; then
    report_cleanup_failure
    return 1
  fi
}

on_exit() {
  trap '' INT TERM
  exit_code=$1
  trap - EXIT
  cleanup_status=0
  if ! cleanup; then
    cleanup_status=1
  fi
  if [ "$exit_code" -eq 0 ]; then
    if [ "$cleanup_status" -ne 0 ]; then
      exit_code=1
    elif [ -n "$restore_success_message" ]; then
      printf '%s\n' "$restore_success_message"
    fi
  fi
  exit "$exit_code"
}

on_signal() {
  trap '' INT TERM
  code=$1
  echo "restore drill interrupted" >&2
  exit "$code"
}

trap 'on_exit "$?"' EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

umask 077
restore_tmp_root="${RESTORE_TMP_ROOT:-${TMPDIR:-/tmp}}"
mkdir -p "$restore_tmp_root"
available_kib="$(df -Pk "$restore_tmp_root" | awk 'NR == 2 { print $4; exit }')"
case "$available_kib" in
  ''|*[!0-9]*)
    echo "restore drill temporary space budget check failed" >&2
    exit 1
    ;;
esac
if [ "${#available_kib}" -gt 15 ]; then
  echo "restore drill temporary space budget check failed" >&2
  exit 1
fi
required_peak_bytes=$((
  encrypted_size_bytes + (max_decrypted_bytes * 2) + restore_space_safety_bytes
))
available_bytes=$((available_kib * 1024))
if [ "$available_bytes" -lt "$required_peak_bytes" ]; then
  echo "restore drill temporary space budget is insufficient" >&2
  exit 1
fi
temporary_directory="$(mktemp -d "$restore_tmp_root/aap-restore-drill.XXXXXX")"
postgres_env_file="$temporary_directory/postgres.env"
roles_env_file="$temporary_directory/roles.env"
skill_registry_migrator_url_file="$temporary_directory/skill-registry-migrator-url"
owner_password_file="$temporary_directory/owner-password"
manager_insert_check_file="$temporary_directory/manager-insert-check.sql"
backup_insert_denied_file="$temporary_directory/backup-insert-denied.sql"
database_restore_output_file="$temporary_directory/database-restore.output"
database_restore_diagnostic_file="$temporary_directory/database-restore.stderr"
docker_stdout_file="$temporary_directory/docker.stdout"
docker_diagnostic_file="$temporary_directory/docker.stderr"
dump_digest_file="$temporary_directory/dump-digest"
resource_registry_directory="$temporary_directory/docker-resources"
manager_delete_error_file="$temporary_directory/manager-delete.stderr"
backup_insert_error_file="$temporary_directory/backup-insert.stderr"
runtime_select_error_file="$temporary_directory/runtime-select.stderr"
decrypt_work_directory="$temporary_directory/decrypt"
decrypted_bundle_candidate="$decrypt_work_directory/restored.bundle.partial"
decrypted_bundle="$temporary_directory/restored.bundle"
extraction_directory="$temporary_directory/extracted"
mkdir -p "$decrypt_work_directory" "$resource_registry_directory"
chmod 700 "$decrypt_work_directory" "$resource_registry_directory"
cat >"$postgres_env_file" <<EOF
POSTGRES_DB=$database
POSTGRES_USER=$owner
POSTGRES_HOST_AUTH_METHOD=trust
EOF
cat >"$roles_env_file" <<EOF
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=$owner
POSTGRES_DB=$database
MIGRATOR_DATABASE_PASSWORD=restore-platform-migrator-password
RUNTIME_DATABASE_PASSWORD=restore-platform-runtime-password
BACKUP_DATABASE_PASSWORD=restore-backup-password
AGNO_MIGRATOR_DATABASE_PASSWORD=restore-agno-migrator-password
AGNO_DATABASE_PASSWORD=restore-agno-runtime-password
AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD=restore-control-migrator-password
AGENT_CONTROL_DATABASE_PASSWORD=restore-control-runtime-password
SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD=restore-skill-migrator-password
SKILL_REGISTRY_DATABASE_PASSWORD=restore-skill-manager-password
SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD=restore-skill-runtime-password
EOF
printf '%s\n' \
  "postgresql+psycopg_async://ai_agent_skill_registry_migrator:restore-skill-migrator-password@127.0.0.1:5432/$database" \
  >"$skill_registry_migrator_url_file"
printf '%s\n' "restore-owner-password" >"$owner_password_file"
cat >"$manager_insert_check_file" <<'SQL'
BEGIN;
INSERT INTO skill_registry.skills (id, slug, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000091',
  'restore-role-check',
  '00000000-0000-0000-0000-000000000092'
);
ROLLBACK;
SQL
cat >"$backup_insert_denied_file" <<'SQL'
INSERT INTO skill_registry.skills (id, slug, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000093',
  'restore-backup-denied',
  '00000000-0000-0000-0000-000000000094'
);
SQL
: >"$database_restore_output_file"
: >"$database_restore_diagnostic_file"
: >"$docker_stdout_file"
: >"$docker_diagnostic_file"
: >"$dump_digest_file"
: >"$manager_delete_error_file"
: >"$backup_insert_error_file"
: >"$runtime_select_error_file"
chmod 600 \
  "$postgres_env_file" \
  "$roles_env_file" \
  "$skill_registry_migrator_url_file" \
  "$owner_password_file" \
  "$manager_insert_check_file" \
  "$backup_insert_denied_file" \
  "$database_restore_output_file" \
  "$database_restore_diagnostic_file" \
  "$docker_stdout_file" \
  "$docker_diagnostic_file" \
  "$dump_digest_file" \
  "$manager_delete_error_file" \
  "$backup_insert_error_file" \
  "$runtime_select_error_file"

if ! run_registered_create \
  10-decrypt container "$decrypt_container" decrypt_create \
  create --name "$decrypt_container" \
    --user "$(id -u):$(id -g)" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --entrypoint sh \
    -v "$(dirname "$backup_file"):/input:ro" \
    -v "$decrypt_work_directory:/work" \
    -v "$BACKUP_ENCRYPTION_KEY_FILE:/run/secrets/backup_encryption_key:ro" \
    "$crypto_image" -ceu '
      mkdir -m 700 /tmp/gnupg
      mkfifo /tmp/decrypted
      gpg_pid=
      head_pid=
      head_kill_pid=
      stop_children() {
        [ -z "$gpg_pid" ] || kill -TERM "$gpg_pid" >/dev/null 2>&1 || true
        [ -z "$head_pid" ] || kill -TERM "$head_pid" >/dev/null 2>&1 || true
        [ -z "$head_kill_pid" ] || kill -TERM "$head_kill_pid" >/dev/null 2>&1 || true
        [ -z "$gpg_pid" ] || wait "$gpg_pid" >/dev/null 2>&1 || true
        [ -z "$head_pid" ] || wait "$head_pid" >/dev/null 2>&1 || true
        [ -z "$head_kill_pid" ] || wait "$head_kill_pid" >/dev/null 2>&1 || true
        rm -f /tmp/decrypted
      }
      trap "stop_children; exit 143" TERM INT HUP
      gpg --homedir /tmp/gnupg \
        --batch \
        --yes \
        --no-tty \
        --pinentry-mode loopback \
        --no-symkey-cache \
        --passphrase-file /run/secrets/backup_encryption_key \
        --output /tmp/decrypted \
        --decrypt "/input/$1" &
      gpg_pid=$!
      head -c "$2" </tmp/decrypted >/work/restored.bundle.partial &
      head_pid=$!
      if wait "$gpg_pid"; then gpg_status=0; else gpg_status=$?; fi
      gpg_pid=
      if [ "$gpg_status" -ne 0 ]; then
        kill -TERM "$head_pid" >/dev/null 2>&1 || true
        (
          sleep "$3"
          kill -KILL "$head_pid" >/dev/null 2>&1 || true
        ) &
        head_kill_pid=$!
      fi
      if wait "$head_pid"; then head_status=0; else head_status=$?; fi
      head_pid=
      if [ -n "$head_kill_pid" ]; then
        kill -TERM "$head_kill_pid" >/dev/null 2>&1 || true
        wait "$head_kill_pid" >/dev/null 2>&1 || true
        head_kill_pid=
      fi
      rm -f /tmp/decrypted
      [ "$head_status" -eq 0 ] && [ "$gpg_status" -eq 0 ]
    ' sh \
      "$(basename "$backup_file")" \
      "$((max_decrypted_bytes + 1))" \
      "$decrypt_kill_after_seconds"; then
  echo "restore drill decryption failed" >&2
  exit 1
fi
query_docker_resource container "$decrypt_container" decrypt_confirm
if [ "$docker_query_state" != exists ]; then
  echo "restore drill decryption failed" >&2
  exit 1
fi

decrypt_status=1
decrypt_timed_out=false
if ! run_container_start decrypt_start "$decrypt_container"; then
  decrypt_timed_out=$docker_command_timed_out
elif ! run_container_wait \
  "$decrypt_timeout_seconds" decrypt_wait "$decrypt_container"; then
  decrypt_timed_out=$docker_command_timed_out
else
  decrypt_status=$container_wait_status
fi

if [ -f "$decrypted_bundle_candidate" ]; then
  decrypted_size_bytes="$(wc -c <"$decrypted_bundle_candidate" | tr -d ' ')"
else
  decrypted_size_bytes=0
fi
if [ "$decrypt_timed_out" = "true" ]; then
  echo "restore drill decryption timed out" >&2
  exit 1
fi
if [ "$decrypted_size_bytes" -gt "$max_decrypted_bytes" ]; then
  echo "restore drill rejected oversized decrypted bundle" >&2
  exit 1
fi
if [ "$decrypt_status" -ne 0 ] || [ ! -f "$decrypted_bundle_candidate" ]; then
  echo "restore drill decryption failed" >&2
  exit 1
fi
chmod 600 "$decrypted_bundle_candidate"
mv "$decrypted_bundle_candidate" "$decrypted_bundle"

if ! run_registered_create \
  20-bundle container "$bundle_container" bundle_create \
  create --name "$bundle_container" \
  --user "$(id -u):$(id -g)" \
  --entrypoint sh \
  -v "$temporary_directory:/work" \
  "$crypto_image" \
  -ceu '
    bundle=/work/restored.bundle
    members=$(tar -tf "$bundle")
    expected=$(printf "skill-backup.manifest\ndatabase.dump")
    [ "$members" = "$expected" ]
    tar -tvf "$bundle" | awk '\''
      substr($1, 1, 1) != "-" { exit 1 }
      END { if (NR != 2) exit 1 }
    '\''
    mkdir /work/extracted
    chmod 700 /work/extracted
    tar -xf "$bundle" -C /work/extracted
    [ -f /work/extracted/skill-backup.manifest ]
    [ ! -L /work/extracted/skill-backup.manifest ]
    [ -f /work/extracted/database.dump ]
    [ ! -L /work/extracted/database.dump ]
    manifest_size=$(wc -c </work/extracted/skill-backup.manifest)
    dump_size=$(wc -c </work/extracted/database.dump)
    bundle_size=$(wc -c <"$bundle")
    [ "$manifest_size" -gt 0 ]
    [ "$manifest_size" -le 1024 ]
    [ "$dump_size" -gt 0 ]
    [ "$dump_size" -le "$bundle_size" ]
  '; then
  echo "restore drill rejected invalid backup bundle" >&2
  exit 1
fi
if ! run_container_start bundle_start "$bundle_container" || \
   ! run_container_wait \
     "$decrypt_timeout_seconds" bundle_wait "$bundle_container" || \
   [ "$container_wait_status" -ne 0 ]; then
  echo "restore drill rejected invalid backup bundle" >&2
  exit 1
fi
rm -f "$decrypted_bundle"
decrypted_bundle=

manifest_file="$extraction_directory/skill-backup.manifest"
manifest_line_count="$(wc -l <"$manifest_file" | tr -d ' ')"
manifest_format_line="$(sed -n '1p' "$manifest_file")"
manifest_dump_line="$(sed -n '2p' "$manifest_file")"
manifest_schema_line="$(sed -n '3p' "$manifest_file")"
manifest_revision_line="$(sed -n '4p' "$manifest_file")"
manifest_artifact_line="$(sed -n '5p' "$manifest_file")"
manifest_file_line="$(sed -n '6p' "$manifest_file")"
if [ "$manifest_line_count" != "6" ] || \
   [ "$manifest_format_line" != "format_version=1" ]; then
  echo "restore drill rejected invalid backup manifest" >&2
  exit 1
fi
manifest_format_version=${manifest_format_line#format_version=}
manifest_dump_sha256=${manifest_dump_line#dump_sha256=}
manifest_skill_registry_schema_version=${manifest_schema_line#skill_registry_schema_version=}
manifest_skill_revision_count=${manifest_revision_line#skill_revision_count=}
manifest_skill_artifact_count=${manifest_artifact_line#skill_artifact_count=}
manifest_skill_file_count=${manifest_file_line#skill_file_count=}
if [ "$manifest_dump_line" != "dump_sha256=$manifest_dump_sha256" ] || \
   [ "$manifest_schema_line" != "skill_registry_schema_version=$manifest_skill_registry_schema_version" ] || \
   [ "$manifest_revision_line" != "skill_revision_count=$manifest_skill_revision_count" ] || \
   [ "$manifest_artifact_line" != "skill_artifact_count=$manifest_skill_artifact_count" ] || \
   [ "$manifest_file_line" != "skill_file_count=$manifest_skill_file_count" ]; then
  echo "restore drill rejected invalid backup manifest" >&2
  exit 1
fi
case "$manifest_dump_sha256" in
  *[!0-9a-f]*|'')
    echo "restore drill rejected invalid backup manifest" >&2
    exit 1
    ;;
esac
if [ "${#manifest_dump_sha256}" -ne 64 ]; then
  echo "restore drill rejected invalid backup manifest" >&2
  exit 1
fi
for manifest_number in \
  "$manifest_skill_registry_schema_version" \
  "$manifest_skill_revision_count" \
  "$manifest_skill_artifact_count" \
  "$manifest_skill_file_count"; do
  case "$manifest_number" in
    ''|*[!0-9]*)
      echo "restore drill rejected invalid backup manifest" >&2
      exit 1
      ;;
  esac
  if [ "${#manifest_number}" -gt 20 ]; then
    echo "restore drill rejected invalid backup manifest" >&2
    exit 1
  fi
done
if [ "$manifest_format_version" != "1" ] || \
   [ "${#manifest_skill_registry_schema_version}" -gt 5 ] || \
   [ "$manifest_skill_registry_schema_version" -le 0 ]; then
  echo "restore drill rejected invalid backup manifest" >&2
  exit 1
fi
if ! run_registered_create \
  30-digest container "$digest_container" digest_create \
  create --name "$digest_container" \
  --user "$(id -u):$(id -g)" \
  --entrypoint sh \
  -v "$extraction_directory:/input:ro" \
  -v "$temporary_directory:/work" \
  "$crypto_image" -ceu '
    digest=$(sha256sum /input/database.dump)
    digest=${digest%% *}
    case "$digest" in *[!0-9a-f]*|"") exit 1 ;; esac
    [ "${#digest}" -eq 64 ]
    printf "%s\n" "$digest" >/work/dump-digest
  '; then
  echo "restore drill rejected backup dump digest mismatch" >&2
  exit 1
fi
if ! run_container_start digest_start "$digest_container" || \
   ! run_container_wait \
     "$decrypt_timeout_seconds" digest_wait "$digest_container" || \
   [ "$container_wait_status" -ne 0 ]; then
  echo "restore drill rejected backup dump digest mismatch" >&2
  exit 1
fi
actual_dump_sha256="$(cat "$dump_digest_file")"
case "$actual_dump_sha256" in
  *[!0-9a-f]*|'') actual_dump_sha256=invalid ;;
esac
if [ "$actual_dump_sha256" != "$manifest_dump_sha256" ]; then
  echo "restore drill rejected backup dump digest mismatch" >&2
  exit 1
fi

if ! run_registered_create \
  90-volume volume "$volume" volume_create \
  volume create "$volume"; then
  echo "restore drill failed database startup" >&2
  exit 1
fi
if [ "$(cat "$docker_stdout_file")" != "$volume" ]; then
  echo "restore drill failed database startup" >&2
  exit 1
fi
if ! run_registered_create \
  40-database container "$container" database_create \
  create --name "$container" \
  --env-file "$postgres_env_file" \
  -v "$volume:/var/lib/postgresql" \
  -v "$temporary_directory:/restore:ro" \
  -v "$postgres_bootstrap_directory:/bootstrap:ro" \
  postgres:18.3-alpine3.23; then
  echo "restore drill failed database startup" >&2
  exit 1
fi
if ! run_container_start database_start "$container"; then
  echo "restore drill failed database startup" >&2
  exit 1
fi

attempt=0
until run_bounded_docker \
  "$docker_cli_timeout_seconds" database_ready \
  "$docker_stdout_file" "$docker_diagnostic_file" \
  exec "$container" pg_isready -U "$owner" -d "$database"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "restore drill database did not become ready" >&2
    exit 1
  fi
  sleep 1
done

run_role_bootstraps() {
  run_bounded_docker \
    "$docker_cli_timeout_seconds" "$1" \
    "$docker_stdout_file" "$docker_diagnostic_file" \
    exec "$container" sh -ceu '
    set -a
    . /restore/roles.env
    set +a
    IFS= read -r POSTGRES_PASSWORD </restore/owner-password
    export POSTGRES_PASSWORD
    ROLE_SQL_FILE=/bootstrap/01-roles.sql /bootstrap/01-roles.sh
    AGNO_ROLE_SQL_FILE=/bootstrap/03-agno-roles.sql /bootstrap/03-agno-roles.sh
    AGENT_CONTROL_ROLE_SQL_FILE=/bootstrap/04-agent-control-roles.sql /bootstrap/04-agent-control-roles.sh
    SKILL_REGISTRY_ROLE_SQL_FILE=/bootstrap/05-skill-registry-roles.sql /bootstrap/05-skill-registry-roles.sh
  '
}

if ! run_role_bootstraps role_bootstrap; then
  echo "restore drill failed role bootstrap" >&2
  exit 1
fi

if ! run_bounded_docker \
  "$decrypt_timeout_seconds" database_restore \
  "$database_restore_output_file" "$database_restore_diagnostic_file" \
  exec "$container" pg_restore \
  --username="$owner" --dbname="$database" --clean --if-exists \
  /restore/extracted/database.dump; then
  echo "restore drill failed database restore" >&2
  exit 1
fi
rm -f "$database_restore_output_file"
database_restore_output_file=
rm -f "$database_restore_diagnostic_file"
database_restore_diagnostic_file=

if ! run_role_bootstraps role_repair; then
  echo "restore drill failed role repair" >&2
  exit 1
fi

if ! run_registered_create \
  50-registry container "$registry_migration_container" registry_create \
  create --name "$registry_migration_container" \
  --network "container:$container" \
  --user root \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --entrypoint /opt/aap/run-with-secret-env.sh \
  --env SECRET_ENV_SPECS=SKILL_REGISTRY_MIGRATOR_DATABASE_URL=/run/secrets/skill_registry_migrator_database_url \
  --env SECRET_RUN_AS=skill-registry \
  -v "$skill_registry_migrator_url_file:/run/secrets/skill_registry_migrator_database_url:ro" \
  "$skill_registry_image" \
  python -m skill_registry.migrate; then
  echo "restore drill failed skill registry migration verification" >&2
  exit 1
fi
if ! run_container_start registry_start "$registry_migration_container" || \
   ! run_container_wait \
     "$decrypt_timeout_seconds" registry_wait \
     "$registry_migration_container" || \
   [ "$container_wait_status" -ne 0 ]; then
  echo "restore drill failed skill registry migration verification" >&2
  exit 1
fi

if ! run_bounded_docker \
  "$docker_cli_timeout_seconds" registry_role_positive \
  "$docker_stdout_file" "$docker_diagnostic_file" \
  exec "$container" sh -ceu '
  set -a
  . /restore/roles.env
  set +a
  PGHOST=$POSTGRES_HOST
  PGPORT=$POSTGRES_PORT
  PGDATABASE=$POSTGRES_DB
  export PGHOST PGPORT PGDATABASE

  PGUSER=ai_agent_skill_registry_manager
  PGPASSWORD=$SKILL_REGISTRY_DATABASE_PASSWORD
  export PGUSER PGPASSWORD
  [ "$(psql --no-psqlrc --no-password -Atqc "SELECT current_user")" = "$PGUSER" ]
  psql --no-psqlrc --no-password --set=ON_ERROR_STOP=1 \
    --file=/restore/manager-insert-check.sql >/dev/null

  PGUSER=ai_agent_backup
  PGPASSWORD=$BACKUP_DATABASE_PASSWORD
  export PGUSER PGPASSWORD
  [ "$(psql --no-psqlrc --no-password -Atqc "SELECT current_user")" = "$PGUSER" ]
  psql --no-psqlrc --no-password -Atqc \
    "SELECT count(*) FROM skill_registry.skill_revisions" >/dev/null

  PGUSER=ai_agent_skill_registry_runtime
  PGPASSWORD=$SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD
  export PGUSER PGPASSWORD
  [ "$(psql --no-psqlrc --no-password -Atqc "SELECT current_user")" = "$PGUSER" ]
'; then
  echo "restore drill failed registry role checks" >&2
  exit 1
fi

if run_bounded_docker \
  "$docker_cli_timeout_seconds" registry_manager_delete_denied \
  "$docker_stdout_file" "$manager_delete_error_file" \
  exec "$container" sh -ceu '
  set -a
  . /restore/roles.env
  set +a
  PGHOST=$POSTGRES_HOST
  PGPORT=$POSTGRES_PORT
  PGDATABASE=$POSTGRES_DB
  PGUSER=ai_agent_skill_registry_manager
  PGPASSWORD=$SKILL_REGISTRY_DATABASE_PASSWORD
  export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
  psql --no-psqlrc --no-password --set=ON_ERROR_STOP=1 \
    --set=VERBOSITY=verbose -c \
    "DELETE FROM skill_registry.skills WHERE false" >/dev/null
'; then
  echo "restore drill failed registry role checks" >&2
  exit 1
fi
if ! grep -q "42501" "$manager_delete_error_file" || \
   ! grep -q "permission denied" "$manager_delete_error_file"; then
  echo "restore drill failed registry role checks" >&2
  exit 1
fi

if run_bounded_docker \
  "$docker_cli_timeout_seconds" registry_backup_insert_denied \
  "$docker_stdout_file" "$backup_insert_error_file" \
  exec "$container" sh -ceu '
  set -a
  . /restore/roles.env
  set +a
  PGHOST=$POSTGRES_HOST
  PGPORT=$POSTGRES_PORT
  PGDATABASE=$POSTGRES_DB
  PGUSER=ai_agent_backup
  PGPASSWORD=$BACKUP_DATABASE_PASSWORD
  export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
  psql --no-psqlrc --no-password --set=ON_ERROR_STOP=1 \
    --set=VERBOSITY=verbose --file=/restore/backup-insert-denied.sql >/dev/null
'; then
  echo "restore drill failed registry role checks" >&2
  exit 1
fi
if ! grep -q "42501" "$backup_insert_error_file" || \
   ! grep -q "permission denied" "$backup_insert_error_file"; then
  echo "restore drill failed registry role checks" >&2
  exit 1
fi

if run_bounded_docker \
  "$docker_cli_timeout_seconds" registry_runtime_select_denied \
  "$docker_stdout_file" "$runtime_select_error_file" \
  exec "$container" sh -ceu '
  set -a
  . /restore/roles.env
  set +a
  PGHOST=$POSTGRES_HOST
  PGPORT=$POSTGRES_PORT
  PGDATABASE=$POSTGRES_DB
  PGUSER=ai_agent_skill_registry_runtime
  PGPASSWORD=$SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD
  export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
  psql --no-psqlrc --no-password --set=ON_ERROR_STOP=1 \
    --set=VERBOSITY=verbose -c \
    "SELECT count(*) FROM skill_registry.skills" >/dev/null
'; then
  echo "restore drill failed registry role checks" >&2
  exit 1
fi
if ! grep -q "42501" "$runtime_select_error_file" || \
   ! grep -q "permission denied" "$runtime_select_error_file"; then
  echo "restore drill failed registry role checks" >&2
  exit 1
fi

run_database_scalar() {
  scalar_phase=$1
  shift
  docker_scalar=
  if ! run_bounded_docker \
    "$docker_cli_timeout_seconds" "$scalar_phase" \
    "$docker_stdout_file" "$docker_diagnostic_file" \
    exec "$container" "$@"; then
    return 1
  fi
  docker_scalar="$(cat "$docker_stdout_file")"
  case "$docker_scalar" in
    *'
'*) return 1 ;;
  esac
}

if ! run_database_scalar migration_count psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM drizzle.__drizzle_migrations"; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi
migration_count=$docker_scalar
if ! run_database_scalar latest_migration psql -U "$owner" -d "$database" -Atqc \
  "SELECT max(created_at) FROM drizzle.__drizzle_migrations"; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi
latest_migration=$docker_scalar
if ! run_database_scalar schema_contract psql -U "$owner" -d "$database" -Atqc \
  "SELECT
     to_regclass('public.users') IS NOT NULL
     AND to_regclass('public.sessions') IS NOT NULL
     AND to_regclass('public.audit_logs') IS NOT NULL
     AND to_regclass('public.roles') IS NOT NULL
     AND to_regclass('public.content_revisions') IS NOT NULL
     AND to_regclass('public.content_routes') IS NOT NULL
     AND to_regclass('agno.agno_sessions') IS NOT NULL
     AND to_regclass('agno.agno_schema_versions') IS NOT NULL
     AND to_regclass('public.users_email_lower_unique') IS NOT NULL
     AND to_regclass('public.audit_logs_created_id_desc_idx') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_limits_key_unique')
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sessions_identity_boundary_guard' AND NOT tgisinternal)
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'content_revisions_immutable' AND NOT tgisinternal)
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'content_routes_state_machine' AND NOT tgisinternal)
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'role_permissions_admin_docs_delete_guard' AND NOT tgisinternal)
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'permissions_admin_docs_delete_key_guard' AND NOT tgisinternal)
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'permissions_admin_docs_delete_delete_guard' AND NOT tgisinternal)
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'roles_admin_docs_delete_grant_guard' AND NOT tgisinternal)
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'roles_super_admin_delete_guard' AND NOT tgisinternal)"; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi
schema_contract=$docker_scalar
if ! run_database_scalar user_count psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM public.users"; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi
user_count=$docker_scalar
if ! run_database_scalar agno_session_count psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM agno.agno_sessions"; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi
agno_session_count=$docker_scalar
if ! run_database_scalar agno_schema_version_count psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM agno.agno_schema_versions"; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi
agno_schema_version_count=$docker_scalar
if ! run_database_scalar restored_user_fixture_count psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM public.users WHERE id = '$expected_user_id'::uuid"; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi
restored_user_fixture_count=$docker_scalar
if ! run_database_scalar restored_agno_session_fixture_count psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM agno.agno_sessions WHERE session_id = '$expected_agno_session_id'"; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi
restored_agno_session_fixture_count=$docker_scalar
if ! run_database_scalar skill_registry_snapshot psql \
  --username="$owner" --dbname="$database" --no-psqlrc --tuples-only --no-align \
  --field-separator='|' --quiet --set=ON_ERROR_STOP=1 --command="
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;
WITH version_state AS (
  SELECT COALESCE(MAX(version), 0)::bigint AS schema_version,
         COUNT(*)::bigint AS version_row_count
  FROM skill_registry.schema_versions
), row_counts AS (
  SELECT
    (SELECT COUNT(*) FROM skill_registry.skill_revisions)::bigint AS revision_count,
    (SELECT COUNT(*) FROM skill_registry.skill_revision_artifacts)::bigint AS artifact_count,
    (SELECT COUNT(*) FROM skill_registry.skill_revision_files)::bigint AS file_count
), digest_state AS (
  SELECT COUNT(*)::bigint AS total_count,
         COUNT(*) FILTER (
           WHERE encode(sha256(artifact.archive_bytes), 'hex')
             <> artifact.artifact_sha256::text
         )::bigint AS mismatch_count
  FROM skill_registry.skill_revision_artifacts AS artifact
), integrity_state AS (
  SELECT (
    (SELECT COUNT(*)
     FROM skill_registry.skill_revisions AS revision
     LEFT JOIN skill_registry.skill_revision_artifacts AS artifact
       ON artifact.revision_id = revision.id
     WHERE artifact.revision_id IS NULL)
    + (SELECT COUNT(*)
       FROM skill_registry.skill_revision_artifacts AS artifact
       LEFT JOIN skill_registry.skill_revisions AS revision
         ON revision.id = artifact.revision_id
        AND revision.skill_id = artifact.skill_id
       WHERE revision.id IS NULL)
    + (SELECT COUNT(*)
       FROM skill_registry.skill_revision_files AS file
       LEFT JOIN skill_registry.skill_revisions AS revision
         ON revision.id = file.revision_id
       WHERE revision.id IS NULL)
    + (SELECT COUNT(*)
       FROM skill_registry.skill_revision_artifacts AS artifact
       WHERE artifact.file_count <> (
         SELECT COUNT(*)
         FROM skill_registry.skill_revision_files AS file
         WHERE file.revision_id = artifact.revision_id
       ))
  )::bigint AS mismatch_count
), expected_security_triggers(
  trigger_name, table_name, function_name, function_schema, trigger_type,
  is_deferrable, is_initially_deferred, enabled
) AS (
  VALUES
    ('skills_guard_update', 'skills', 'guard_skill_update', 'skill_registry', 19, false, false, 'A'),
    ('skill_revisions_guard_insert', 'skill_revisions', 'guard_revision_insert', 'skill_registry', 7, false, false, 'A'),
    ('skill_revisions_guard_update', 'skill_revisions', 'guard_revision_update', 'skill_registry', 19, false, false, 'A'),
    ('skill_revisions_require_review_event', 'skill_revisions', 'require_revision_review_event', 'skill_registry', 17, true, true, 'A'),
    ('skill_control_events_stamp_transaction', 'skill_control_events', 'stamp_control_event_transaction', 'skill_registry', 7, false, false, 'A'),
    ('skill_control_events_append_only', 'skill_control_events', 'deny_append_only_mutation', 'skill_registry', 27, false, false, 'A'),
    ('skill_revision_artifacts_append_only', 'skill_revision_artifacts', 'deny_append_only_mutation', 'skill_registry', 27, false, false, 'A'),
    ('skill_revision_files_append_only', 'skill_revision_files', 'deny_append_only_mutation', 'skill_registry', 27, false, false, 'A')
), actual_security_triggers AS (
  SELECT trigger.tgname::text,
         relation.relname::text,
         function.proname::text,
         function_namespace.nspname::text,
         trigger.tgtype::integer,
         trigger.tgdeferrable,
         trigger.tginitdeferred,
         trigger.tgenabled::text
  FROM pg_trigger AS trigger
  JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
  JOIN pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation.relnamespace
  JOIN pg_proc AS function ON function.oid = trigger.tgfoid
  JOIN pg_namespace AS function_namespace
    ON function_namespace.oid = function.pronamespace
  WHERE relation_namespace.nspname = 'skill_registry'
    AND NOT trigger.tgisinternal
), security_trigger_state AS (
  SELECT COUNT(*)::bigint AS mismatch_count
  FROM (
    (SELECT * FROM expected_security_triggers
     EXCEPT
     SELECT * FROM actual_security_triggers)
    UNION ALL
    (SELECT * FROM actual_security_triggers
     EXCEPT
     SELECT * FROM expected_security_triggers)
  ) AS mismatch
), schema_state AS (
  SELECT
    to_regclass('skill_registry.schema_versions') IS NOT NULL
    AND to_regclass('skill_registry.skill_revisions') IS NOT NULL
    AND to_regclass('skill_registry.skill_revision_artifacts') IS NOT NULL
    AND to_regclass('skill_registry.skill_revision_files') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'skill_registry.skill_revision_artifacts'::regclass
        AND confrelid = 'skill_registry.skill_revisions'::regclass
        AND contype = 'f' AND convalidated
    )
    AND EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'skill_registry.skill_revision_files'::regclass
        AND confrelid = 'skill_registry.skill_revisions'::regclass
        AND contype = 'f' AND convalidated
    ) AS contract_valid
)
SELECT version_state.schema_version,
       version_state.version_row_count,
       row_counts.revision_count,
       row_counts.artifact_count,
       row_counts.file_count,
       digest_state.total_count,
       digest_state.mismatch_count,
       integrity_state.mismatch_count,
       security_trigger_state.mismatch_count,
       schema_state.contract_valid
FROM version_state, row_counts, digest_state, integrity_state,
     security_trigger_state, schema_state;
COMMIT;"; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi
skill_registry_snapshot=$docker_scalar
case "$skill_registry_snapshot" in
  ''|*[!0-9tf|]*)
    echo "restore drill failed critical table checks" >&2
    exit 1
    ;;
esac

IFS='|' read -r \
  skill_registry_schema_version \
  skill_registry_schema_version_row_count \
  skill_revision_count \
  skill_artifact_count \
  skill_file_count \
  skill_artifact_digest_count \
  skill_artifact_digest_mismatch_count \
  skill_registry_integrity_mismatch_count \
  skill_registry_security_trigger_mismatch_count \
  skill_registry_schema_contract <<EOF
$skill_registry_snapshot
EOF
unset skill_registry_snapshot

for restored_number in \
  "$migration_count" \
  "$latest_migration" \
  "$user_count" \
  "$agno_session_count" \
  "$agno_schema_version_count" \
  "$restored_user_fixture_count" \
  "$restored_agno_session_fixture_count" \
  "$skill_registry_schema_version" \
  "$skill_registry_schema_version_row_count" \
  "$skill_revision_count" \
  "$skill_artifact_count" \
  "$skill_file_count" \
  "$skill_artifact_digest_count" \
  "$skill_artifact_digest_mismatch_count" \
  "$skill_registry_integrity_mismatch_count" \
  "$skill_registry_security_trigger_mismatch_count"; do
  case "$restored_number" in
    ''|*[!0-9]*)
      echo "restore drill failed critical table checks" >&2
      exit 1
      ;;
  esac
  if [ "${#restored_number}" -gt 20 ]; then
    echo "restore drill failed critical table checks" >&2
    exit 1
  fi
done

if [ "$migration_count" != "$expected_migrations" ] || \
   [ "$latest_migration" != "$expected_latest_migration" ] || \
   [ "$schema_contract" != "t" ] || \
   [ "$agno_schema_version_count" -lt 1 ] || \
   [ "$user_count" -le 0 ] || \
   [ "$agno_session_count" -le 0 ] || \
   [ "$user_count" != "$expected_user_count" ] || \
   [ "$agno_session_count" != "$expected_agno_session_count" ] || \
   [ "$restored_user_fixture_count" != "1" ] || \
   [ "$restored_agno_session_fixture_count" != "1" ] || \
   [ "$skill_registry_schema_version" != "$manifest_skill_registry_schema_version" ] || \
   [ "$skill_registry_schema_version_row_count" != "$manifest_skill_registry_schema_version" ] || \
   [ "$skill_revision_count" != "$manifest_skill_revision_count" ] || \
   [ "$skill_artifact_count" != "$manifest_skill_artifact_count" ] || \
   [ "$skill_file_count" != "$manifest_skill_file_count" ] || \
   [ "$skill_artifact_digest_count" != "$skill_artifact_count" ] || \
   [ "$skill_artifact_digest_mismatch_count" != "0" ] || \
   [ "$skill_registry_integrity_mismatch_count" != "0" ] || \
   [ "$skill_registry_security_trigger_mismatch_count" != "0" ] || \
   [ "$skill_registry_schema_contract" != "t" ]; then
  echo "restore drill failed critical table checks" >&2
  exit 1
fi

restore_success_message="restore drill passed: migrations=$migration_count latest=$latest_migration users=$user_count agno_sessions=$agno_session_count agno_schema_versions=$agno_schema_version_count skill_registry_version=$skill_registry_schema_version revisions=$skill_revision_count artifacts=$skill_artifact_count files=$skill_file_count artifact_digests_verified=$skill_artifact_digest_count"
