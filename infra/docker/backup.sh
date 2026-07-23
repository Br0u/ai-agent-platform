#!/bin/sh

set -eu

umask 077

interval_seconds="${BACKUP_INTERVAL_SECONDS:-86400}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
backup_directory="${BACKUP_DIRECTORY:-/backups}"
temporary_directory="${BACKUP_TMP_DIRECTORY:-/tmp}"
run_once="${BACKUP_RUN_ONCE:-false}"
dump_timeout_seconds="${BACKUP_DUMP_TIMEOUT_SECONDS:-3600}"
dump_kill_after_seconds="${BACKUP_DUMP_KILL_AFTER_SECONDS:-5}"
snapshot_timeout_seconds="${BACKUP_SNAPSHOT_TIMEOUT_SECONDS:-3665}"
process_kill_after_seconds="${BACKUP_PROCESS_KILL_AFTER_SECONDS:-5}"
encrypt_timeout_seconds="${BACKUP_ENCRYPT_TIMEOUT_SECONDS:-3600}"
encrypt_kill_after_seconds="${BACKUP_ENCRYPT_KILL_AFTER_SECONDS:-5}"
space_safety_bytes="${BACKUP_SPACE_SAFETY_BYTES:-67108864}"
timeout_command="${BACKUP_TIMEOUT_COMMAND:-/usr/bin/timeout}"
PGHOST="${PGHOST:-db}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-ai_agent_platform}"
PGUSER="${PGUSER:-ai_agent_backup}"
BACKUP_DATABASE_PASSWORD_FILE="${BACKUP_DATABASE_PASSWORD_FILE:-/run/secrets/backup_database_password}"
BACKUP_ENCRYPTION_KEY_FILE="${BACKUP_ENCRYPTION_KEY_FILE:-/run/secrets/backup_encryption_key}"
script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

for secret_file in "$BACKUP_DATABASE_PASSWORD_FILE" "$BACKUP_ENCRYPTION_KEY_FILE"; do
  if [ ! -r "$secret_file" ] || [ ! -s "$secret_file" ]; then
    echo "required backup secret file is missing or empty" >&2
    exit 78
  fi
done

"$script_directory/validate-backup-key.sh" "$BACKUP_ENCRYPTION_KEY_FILE"

valid_positive_integer() {
  value=$1
  maximum=$2
  case "$value" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "${#value}" -le 6 ] && [ "$value" -gt 0 ] && [ "$value" -le "$maximum" ]
}

if ! valid_positive_integer "$dump_timeout_seconds" 86400 || \
   ! valid_positive_integer "$dump_kill_after_seconds" 300 || \
   ! valid_positive_integer "$snapshot_timeout_seconds" 172800 || \
   ! valid_positive_integer "$process_kill_after_seconds" 300 || \
   ! valid_positive_integer "$encrypt_timeout_seconds" 86400 || \
   ! valid_positive_integer "$encrypt_kill_after_seconds" 300 || \
   [ "$snapshot_timeout_seconds" -lt "$((dump_timeout_seconds + dump_kill_after_seconds + 60))" ]; then
  echo "backup timeout configuration is invalid" >&2
  exit 64
fi
case "$space_safety_bytes" in
  ''|*[!0-9]*)
    echo "backup space budget configuration is invalid" >&2
    exit 64
    ;;
esac
if [ "${#space_safety_bytes}" -gt 13 ] || \
   [ "$space_safety_bytes" -le 0 ] || \
   [ "$space_safety_bytes" -gt 1099511627776 ]; then
  echo "backup space budget configuration is invalid" >&2
  exit 64
fi

mkdir -p "$backup_directory" "$temporary_directory"

pgpass_file=
plaintext_temporary_file=
encrypted_temporary_file=
published_backup_file=
gpg_home=
staging_directory=
snapshot_command_fifo=
snapshot_output_fifo=
snapshot_group_pid=
dump_group_pid=
encrypt_group_pid=
snapshot_command_fd_open=false

terminate_process_group() {
  process_group_pid=$1
  [ -n "$process_group_pid" ] || return 0

  if kill -0 "-$process_group_pid" >/dev/null 2>&1; then
    kill -TERM "-$process_group_pid" >/dev/null 2>&1 || true
  elif kill -0 "$process_group_pid" >/dev/null 2>&1; then
    kill -TERM "$process_group_pid" >/dev/null 2>&1 || true
  else
    wait "$process_group_pid" >/dev/null 2>&1 || true
    return 0
  fi

  # Keep the unreaped leader PID reserved throughout the grace period so a
  # later KILL cannot target an unrelated, reused process or process group.
  sleep "$process_kill_after_seconds"
  if kill -0 "-$process_group_pid" >/dev/null 2>&1; then
    kill -KILL "-$process_group_pid" >/dev/null 2>&1 || true
  elif kill -0 "$process_group_pid" >/dev/null 2>&1; then
    kill -KILL "$process_group_pid" >/dev/null 2>&1 || true
  fi
  wait "$process_group_pid" >/dev/null 2>&1 || true
}

cleanup() {
  if [ "$snapshot_command_fd_open" = true ]; then
    exec 3>&-
    snapshot_command_fd_open=false
  fi
  terminate_process_group "$encrypt_group_pid"
  encrypt_group_pid=
  terminate_process_group "$dump_group_pid"
  dump_group_pid=
  terminate_process_group "$snapshot_group_pid"
  snapshot_group_pid=
  [ -z "$pgpass_file" ] || rm -f "$pgpass_file"
  [ -z "$plaintext_temporary_file" ] || rm -f "$plaintext_temporary_file"
  [ -z "$encrypted_temporary_file" ] || rm -f "$encrypted_temporary_file"
  [ -z "$published_backup_file" ] || rm -f "$published_backup_file"
  [ -z "$gpg_home" ] || rm -rf "$gpg_home"
  [ -z "$staging_directory" ] || rm -rf "$staging_directory"
  [ -z "$snapshot_command_fifo" ] || rm -f "$snapshot_command_fifo"
  [ -z "$snapshot_output_fifo" ] || rm -f "$snapshot_output_fifo"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

escape_pgpass() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/:/\\:/g'
}

pgpass_file="$(mktemp "$temporary_directory/.aap-pgpass.XXXXXX")"
chmod 600 "$pgpass_file"
gpg_home="$(mktemp -d "$temporary_directory/.aap-gnupg.XXXXXX")"
chmod 700 "$gpg_home"
database_password="$(cat "$BACKUP_DATABASE_PASSWORD_FILE")"
{
  escape_pgpass "$PGHOST"
  printf ':'
  escape_pgpass "$PGPORT"
  printf ':'
  escape_pgpass "$PGDATABASE"
  printf ':'
  escape_pgpass "$PGUSER"
  printf ':'
  escape_pgpass "$database_password"
  printf '\n'
} >"$pgpass_file"
unset database_password

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  staging_directory="$(mktemp -d "$temporary_directory/.ai-agent-platform-${timestamp}.stage.XXXXXX")"
  chmod 700 "$staging_directory"
  plaintext_temporary_file="$staging_directory/database.dump"
  manifest_file="$staging_directory/skill-backup.manifest"
  snapshot_command_fifo="$staging_directory/snapshot-command.fifo"
  snapshot_output_fifo="$staging_directory/snapshot-output.fifo"
  mkfifo "$snapshot_command_fifo" "$snapshot_output_fifo"
  chmod 600 "$snapshot_command_fifo" "$snapshot_output_fifo"
  encrypted_temporary_file="$backup_directory/.ai-agent-platform-${timestamp}.dump.gpg.tmp"
  backup_file="$backup_directory/ai-agent-platform-${timestamp}.dump.gpg"

  PGPASSFILE="$pgpass_file" setsid "$timeout_command" \
    -s TERM \
    -k "$process_kill_after_seconds" \
    "$snapshot_timeout_seconds" \
    psql \
    --host="$PGHOST" \
    --port="$PGPORT" \
    --username="$PGUSER" \
    --dbname="$PGDATABASE" \
    --no-psqlrc \
    --tuples-only \
    --no-align \
    --field-separator='|' \
    --quiet \
    --set=ON_ERROR_STOP=1 \
    <"$snapshot_command_fifo" >"$snapshot_output_fifo" 2>/dev/null &
  snapshot_group_pid=$!
  exec 3>"$snapshot_command_fifo"
  snapshot_command_fd_open=true
  printf '%s\n' \
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' \
    "SET LOCAL statement_timeout = '$((snapshot_timeout_seconds * 1000))ms';" \
    "SELECT pg_export_snapshot(),
       COALESCE((SELECT MAX(version) FROM skill_registry.schema_versions), 0),
       (SELECT COUNT(*) FROM skill_registry.skill_revisions),
       (SELECT COUNT(*) FROM skill_registry.skill_revision_artifacts),
       (SELECT COUNT(*) FROM skill_registry.skill_revision_files),
       (SELECT COUNT(*) FROM skill_registry.agent_skill_sets),
       (SELECT COUNT(*) FROM skill_registry.agent_skill_set_items),
       (SELECT COUNT(*) FROM skill_registry.active_agent_skill_sets),
       (SELECT COUNT(*) FROM skill_registry.skill_set_control_events),
       pg_database_size(current_database());" >&3
  if ! IFS='|' read -r \
    snapshot_id \
    skill_registry_schema_version \
    skill_revision_count \
    skill_artifact_count \
    skill_file_count \
    skill_runtime_set_count \
    skill_runtime_item_count \
    skill_runtime_pointer_count \
    skill_runtime_event_count \
    database_size_bytes <"$snapshot_output_fifo"; then
    echo "backup snapshot acquisition failed" >&2
    exit 1
  fi
  case "$snapshot_id" in
    ''|*[!0-9A-Fa-f-]*)
      echo "backup snapshot acquisition failed" >&2
      exit 1
      ;;
  esac
  for snapshot_number in \
    "$skill_registry_schema_version" \
    "$skill_revision_count" \
    "$skill_artifact_count" \
    "$skill_file_count" \
    "$skill_runtime_set_count" \
    "$skill_runtime_item_count" \
    "$skill_runtime_pointer_count" \
    "$skill_runtime_event_count" \
    "$database_size_bytes"; do
    case "$snapshot_number" in
      ''|*[!0-9]*)
        echo "backup snapshot acquisition failed" >&2
        exit 1
        ;;
    esac
  done
  if [ "$skill_registry_schema_version" -le 0 ] || \
     ! kill -0 "$snapshot_group_pid" >/dev/null 2>&1; then
    echo "backup snapshot acquisition failed" >&2
    exit 1
  fi

  available_temporary_bytes="$(
    df -Pk "$temporary_directory" |
      awk 'NR == 2 { printf "%.0f", $4 * 1024 }'
  )"
  case "$available_temporary_bytes" in
    ''|*[!0-9]*)
      echo "backup temporary space budget check failed" >&2
      exit 1
      ;;
  esac
  if ! awk \
    -v available="$available_temporary_bytes" \
    -v database_size="$database_size_bytes" \
    -v safety="$space_safety_bytes" \
    'BEGIN { exit available >= database_size + safety ? 0 : 1 }'; then
    echo "backup temporary space budget is insufficient" >&2
    exit 1
  fi

  PGPASSFILE="$pgpass_file" setsid "$timeout_command" \
    -s TERM \
    -k "$dump_kill_after_seconds" \
    "$dump_timeout_seconds" \
    pg_dump \
      --host="$PGHOST" \
      --port="$PGPORT" \
      --username="$PGUSER" \
      --dbname="$PGDATABASE" \
      --format=custom \
      --snapshot="$snapshot_id" \
      --schema=public \
      --schema=drizzle \
      --schema=agno \
      --schema=skill_registry \
      --file="$plaintext_temporary_file" 2>/dev/null &
  dump_group_pid=$!
  if ! wait "$dump_group_pid"; then
    echo "backup database dump failed" >&2
    exit 1
  fi
  dump_group_pid=

  printf '%s\n' 'COMMIT;' '\q' >&3
  exec 3>&-
  snapshot_command_fd_open=false
  if ! wait "$snapshot_group_pid"; then
    echo "backup snapshot transaction failed" >&2
    exit 1
  fi
  snapshot_group_pid=
  rm -f "$snapshot_command_fifo" "$snapshot_output_fifo"
  snapshot_command_fifo=
  snapshot_output_fifo=

  dump_sha256="$(sha256sum "$plaintext_temporary_file" | awk '{print $1}')"
  case "$dump_sha256" in
    *[!0-9a-f]*|'')
      echo "backup dump digest failed" >&2
      exit 1
      ;;
  esac
  if [ "${#dump_sha256}" -ne 64 ]; then
    echo "backup dump digest failed" >&2
    exit 1
  fi
  {
    printf 'format_version=1\n'
    printf 'dump_sha256=%s\n' "$dump_sha256"
    printf 'skill_registry_schema_version=%s\n' "$skill_registry_schema_version"
    printf 'skill_revision_count=%s\n' "$skill_revision_count"
    printf 'skill_artifact_count=%s\n' "$skill_artifact_count"
    printf 'skill_file_count=%s\n' "$skill_file_count"
  } >"$manifest_file"
  chmod 600 "$plaintext_temporary_file" "$manifest_file"

  setsid "$timeout_command" \
    -s TERM \
    -k "$encrypt_kill_after_seconds" \
    "$encrypt_timeout_seconds" \
    sh -c '
      set -eu
      set -o pipefail
      trap "set +e; wait; exit 143" TERM INT HUP
      tar -cf - -C "$1" skill-backup.manifest database.dump |
        gpg --homedir "$2" \
          --batch \
          --yes \
          --no-tty \
          --pinentry-mode loopback \
          --no-symkey-cache \
          --passphrase-file "$3" \
          --symmetric \
          --cipher-algo AES256 \
          --s2k-mode 3 \
          --s2k-digest-algo SHA512 \
          --s2k-count 65011712 \
          --force-mdc \
          --compress-algo none \
          --output "$4"
    ' sh \
      "$staging_directory" \
      "$gpg_home" \
      "$BACKUP_ENCRYPTION_KEY_FILE" \
      "$encrypted_temporary_file" 2>/dev/null &
  encrypt_group_pid=$!
  if ! wait "$encrypt_group_pid"; then
    echo "backup encryption failed" >&2
    exit 1
  fi
  encrypt_group_pid=

  rm -rf "$staging_directory"
  staging_directory=
  plaintext_temporary_file=

  chmod 600 "$encrypted_temporary_file"
  if ! fsync "$encrypted_temporary_file"; then
    echo "backup durability sync failed" >&2
    exit 1
  fi
  mv "$encrypted_temporary_file" "$backup_file"
  encrypted_temporary_file=
  published_backup_file="$backup_file"
  if ! fsync "$backup_directory"; then
    echo "backup durability sync failed" >&2
    exit 1
  fi
  published_backup_file=
  find "$backup_directory" -type f -name "ai-agent-platform-*.dump.gpg" \
    -mtime "+${retention_days}" -exec rm -f {} +

  case "$run_once" in
    true|1) break ;;
  esac
  sleep "$interval_seconds"
done
