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
snapshot_timeout_seconds="${BACKUP_SNAPSHOT_TIMEOUT_SECONDS:-7330}"
process_kill_after_seconds="${BACKUP_PROCESS_KILL_AFTER_SECONDS:-5}"
encrypt_timeout_seconds="${BACKUP_ENCRYPT_TIMEOUT_SECONDS:-3600}"
encrypt_kill_after_seconds="${BACKUP_ENCRYPT_KILL_AFTER_SECONDS:-5}"
space_safety_bytes="${BACKUP_SPACE_SAFETY_BYTES:-67108864}"
download_root="${BACKUP_DOWNLOAD_ROOT:-/var/lib/ai-agent-platform/downloads}"
download_max_bytes="${BACKUP_DOWNLOAD_MAX_BYTES:-17179869184}"
download_manifest_max_bytes=4194304
download_manifest_max_entries=20000
tar_overhead_bytes=10485760
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
   [ "$snapshot_timeout_seconds" -lt "$((dump_timeout_seconds + dump_kill_after_seconds + encrypt_timeout_seconds + encrypt_kill_after_seconds + 120))" ]; then
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
case "$download_max_bytes" in
  ''|*[!0-9]*)
    echo "backup download artifact budget configuration is invalid" >&2
    exit 64
    ;;
esac
if [ "${#download_max_bytes}" -gt 13 ] || \
   [ "$download_max_bytes" -le 0 ] || \
   [ "$download_max_bytes" -gt 1099511627776 ]; then
  echo "backup download artifact budget configuration is invalid" >&2
  exit 64
fi

if [ ! -d "$download_root" ] || [ -L "$download_root" ]; then
  echo "backup download artifact root is invalid" >&2
  exit 1
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
snapshot_output_fd_open=false

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
  if [ "$snapshot_output_fd_open" = true ]; then
    exec 4<&-
    snapshot_output_fd_open=false
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
  download_manifest_file="$staging_directory/download-files.manifest"
  download_keys_file="$staging_directory/download-artifact-keys"
  tar_input_file="$staging_directory/tar-input-files"
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
  exec 4<"$snapshot_output_fifo"
  snapshot_output_fd_open=true
  printf '%s\n' \
    "SELECT 'locked' FROM (SELECT pg_advisory_lock(4922248911538569540)) AS acquired;" \
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' \
    "SET LOCAL statement_timeout = '$((snapshot_timeout_seconds * 1000))ms';" \
    "SET LOCAL idle_in_transaction_session_timeout = '$((snapshot_timeout_seconds * 1000))ms';" \
    "SELECT pg_export_snapshot(),
       COALESCE((SELECT MAX(version) FROM skill_registry.schema_versions), 0),
       (SELECT COUNT(*) FROM skill_registry.skill_revisions),
       (SELECT COUNT(*) FROM skill_registry.skill_revision_artifacts),
       (SELECT COUNT(*) FROM skill_registry.skill_revision_files),
       (SELECT COUNT(*) FROM skill_registry.agent_skill_sets),
       (SELECT COUNT(*) FROM skill_registry.agent_skill_set_items),
       (SELECT COUNT(*) FROM skill_registry.active_agent_skill_sets),
       (SELECT COUNT(*) FROM skill_registry.skill_set_control_events),
       pg_database_size(current_database()),
       pg_backend_pid();" >&3
  if ! IFS= read -r lock_status <&4 || \
     [ "$lock_status" != "locked" ]; then
    echo "backup snapshot acquisition failed" >&2
    exit 1
  fi
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
    database_size_bytes \
    snapshot_backend_pid <&4; then
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
    "$database_size_bytes" \
    "$snapshot_backend_pid"; do
    case "$snapshot_number" in
      ''|*[!0-9]*)
        echo "backup snapshot acquisition failed" >&2
        exit 1
        ;;
    esac
  done
  if [ "$skill_registry_schema_version" -le 0 ] || \
     [ "$snapshot_backend_pid" -le 0 ] || \
     ! kill -0 "$snapshot_group_pid" >/dev/null 2>&1; then
    echo "backup snapshot acquisition failed" >&2
    exit 1
  fi

  printf '%s\n' \
    "SELECT '__AAP_DOWNLOAD_KEYS_BEGIN__';" \
    "SELECT artifact_key
       FROM (
         SELECT revision.pdf_object_key AS artifact_key
         FROM download_resources AS resource
         JOIN download_resource_revisions AS revision
           ON revision.resource_id = resource.id
          AND revision.id = ANY(array_remove(ARRAY[resource.published_revision_id, resource.draft_revision_id], NULL))
         WHERE revision.cleanup_pending_at IS NULL
           AND revision.pdf_object_key IS NOT NULL
         UNION
         SELECT revision.cover_object_key AS artifact_key
         FROM download_resources AS resource
         JOIN download_resource_revisions AS revision
           ON revision.resource_id = resource.id
          AND revision.id = ANY(array_remove(ARRAY[resource.published_revision_id, resource.draft_revision_id], NULL))
         WHERE revision.cleanup_pending_at IS NULL
           AND revision.cover_object_key IS NOT NULL
       ) AS referenced
       ORDER BY artifact_key COLLATE \"C\";" \
    "SELECT '__AAP_DOWNLOAD_KEYS_END__';" >&3
  if ! IFS= read -r download_keys_marker <&4 || \
     [ "$download_keys_marker" != "__AAP_DOWNLOAD_KEYS_BEGIN__" ]; then
    echo "backup download artifact query failed" >&2
    exit 1
  fi
  : >"$download_keys_file"
  download_key_count=0
  object_key=
  while IFS= read -r object_key <&4; do
    [ "$object_key" != "__AAP_DOWNLOAD_KEYS_END__" ] || break
    download_key_count=$((download_key_count + 1))
    if [ "$download_key_count" -gt "$download_manifest_max_entries" ] || \
       ! printf '%s\n' "$object_key" | grep -Eq '^objects/[0-9a-f]{8}-[0-9a-f]{4}-[1-57][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-57][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|webp)$'; then
      echo "backup download artifact manifest is invalid" >&2
      exit 1
    fi
    printf '%s\n' "$object_key" >>"$download_keys_file"
  done
  if [ "$object_key" != "__AAP_DOWNLOAD_KEYS_END__" ] || \
     ! LC_ALL=C sort -c -u "$download_keys_file" >/dev/null 2>&1; then
    echo "backup download artifact manifest is invalid" >&2
    exit 1
  fi

  : >"$download_manifest_file"
  download_artifact_count=0
  download_artifact_bytes=0
  while IFS= read -r object_key; do
    artifact_path="$download_root/$object_key"
    if [ ! -f "$artifact_path" ] || [ -L "$artifact_path" ]; then
      echo "backup download artifact is unavailable" >&2
      exit 1
    fi
    artifact_sha256="$(sha256sum "$artifact_path" | awk '{print $1}')"
    artifact_size="$(wc -c <"$artifact_path" | awk '{print $1}')"
    case "$artifact_sha256:$artifact_size" in
      *[!0-9a-f:]*|*:) echo "backup download artifact manifest is invalid" >&2; exit 1 ;;
    esac
    if [ "${#artifact_sha256}" -ne 64 ] || [ "$artifact_size" -le 0 ]; then
      echo "backup download artifact manifest is invalid" >&2
      exit 1
    fi
    download_artifact_count=$((download_artifact_count + 1))
    download_artifact_bytes=$((download_artifact_bytes + artifact_size))
    if [ "$download_artifact_bytes" -gt "$download_max_bytes" ]; then
      echo "backup download artifact budget exceeded" >&2
      exit 1
    fi
    printf '%s\t%s\t%s\n' "$artifact_sha256" "$artifact_size" "$object_key" >>"$download_manifest_file"
  done <"$download_keys_file"
  download_manifest_size="$(wc -c <"$download_manifest_file" | awk '{print $1}')"
  if [ "$download_artifact_count" -ne "$download_key_count" ] || \
     [ "$download_manifest_size" -gt "$download_manifest_max_bytes" ]; then
    echo "backup download artifact manifest is invalid" >&2
    exit 1
  fi
  {
    printf '%s\n' skill-backup.manifest download-files.manifest database.dump
    cat "$download_keys_file"
  } >"$tar_input_file"
  ln -s "$download_root/objects" "$staging_directory/objects"
  chmod 600 "$download_keys_file" "$download_manifest_file" "$tar_input_file"

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
    -v manifest_size="$download_manifest_max_bytes" \
    -v safety="$space_safety_bytes" \
    'BEGIN { exit available >= database_size + manifest_size + safety ? 0 : 1 }'; then
    echo "backup temporary space budget is insufficient" >&2
    exit 1
  fi

  available_backup_bytes="$(
    df -Pk "$backup_directory" |
      awk 'NR == 2 { printf "%.0f", $4 * 1024 }'
  )"
  case "$available_backup_bytes" in
    ''|*[!0-9]*)
      echo "backup download artifact space budget check failed" >&2
      exit 1
      ;;
  esac
  if ! awk \
    -v available="$available_backup_bytes" \
    -v database_size="$database_size_bytes" \
    -v artifact_size="$download_artifact_bytes" \
    -v manifest_size="$download_manifest_max_bytes" \
    -v tar_overhead="$tar_overhead_bytes" \
    -v safety="$space_safety_bytes" \
    'BEGIN { exit available >= database_size + artifact_size + manifest_size + tar_overhead + safety ? 0 : 1 }'; then
    echo "backup download artifact space budget is insufficient" >&2
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
  download_manifest_sha256="$(sha256sum "$download_manifest_file" | awk '{print $1}')"
  case "$download_manifest_sha256" in
    *[!0-9a-f]*|'')
      echo "backup download artifact manifest digest failed" >&2
      exit 1
      ;;
  esac
  if [ "${#download_manifest_sha256}" -ne 64 ]; then
    echo "backup download artifact manifest digest failed" >&2
    exit 1
  fi
  {
    printf 'format_version=2\n'
    printf 'dump_sha256=%s\n' "$dump_sha256"
    printf 'skill_registry_schema_version=%s\n' "$skill_registry_schema_version"
    printf 'skill_revision_count=%s\n' "$skill_revision_count"
    printf 'skill_artifact_count=%s\n' "$skill_artifact_count"
    printf 'skill_file_count=%s\n' "$skill_file_count"
    printf 'download_manifest_sha256=%s\n' "$download_manifest_sha256"
    printf 'download_artifact_count=%s\n' "$download_artifact_count"
    printf 'download_artifact_bytes=%s\n' "$download_artifact_bytes"
  } >"$manifest_file"
  chmod 600 "$plaintext_temporary_file" "$manifest_file" "$download_manifest_file"

  setsid "$timeout_command" \
    -s TERM \
    -k "$encrypt_kill_after_seconds" \
    "$encrypt_timeout_seconds" \
    sh -c '
      set -eu
      tar_pid=
      gpg_pid=
      encryption_fifo=$5
      stop_children() {
        [ -z "$tar_pid" ] || kill -TERM "$tar_pid" >/dev/null 2>&1 || true
        [ -z "$gpg_pid" ] || kill -TERM "$gpg_pid" >/dev/null 2>&1 || true
        [ -z "$tar_pid" ] || wait "$tar_pid" >/dev/null 2>&1 || true
        [ -z "$gpg_pid" ] || wait "$gpg_pid" >/dev/null 2>&1 || true
        rm -f "$encryption_fifo"
      }
      trap "stop_children; exit 143" TERM INT HUP
      mkfifo "$encryption_fifo"
      tar -chf - -C "$1" -T "$6" >"$encryption_fifo" &
      tar_pid=$!
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
        --output "$4" <"$encryption_fifo" &
      gpg_pid=$!
      if wait "$gpg_pid"; then gpg_status=0; else gpg_status=$?; fi
      gpg_pid=
      if wait "$tar_pid"; then tar_status=0; else tar_status=$?; fi
      tar_pid=
      rm -f "$encryption_fifo"
      [ "$tar_status" -eq 0 ] && [ "$gpg_status" -eq 0 ]
    ' sh \
      "$staging_directory" \
      "$gpg_home" \
      "$BACKUP_ENCRYPTION_KEY_FILE" \
      "$encrypted_temporary_file" \
      "$staging_directory/encryption.pipe" \
      "$tar_input_file" &
  encrypt_group_pid=$!
  if ! wait "$encrypt_group_pid"; then
    echo "backup encryption failed" >&2
    exit 1
  fi
  encrypt_group_pid=

  printf '%s\n' "SELECT pg_backend_pid() = $snapshot_backend_pid;" >&3
  if ! IFS= read -r snapshot_session_matches <&4 || \
     [ "$snapshot_session_matches" != "t" ]; then
    echo "backup snapshot session changed" >&2
    exit 1
  fi
  printf '%s\n' \
    'COMMIT;' \
    'SELECT pg_advisory_unlock(4922248911538569540);' \
    '\q' >&3
  if ! IFS= read -r advisory_unlock_status <&4 || \
     [ "$advisory_unlock_status" != "t" ]; then
    echo "backup snapshot advisory unlock failed" >&2
    exit 1
  fi
  exec 3>&-
  snapshot_command_fd_open=false
  exec 4<&-
  snapshot_output_fd_open=false
  if ! wait "$snapshot_group_pid"; then
    echo "backup snapshot transaction failed" >&2
    exit 1
  fi
  snapshot_group_pid=
  rm -f "$snapshot_command_fifo" "$snapshot_output_fifo"
  snapshot_command_fifo=
  snapshot_output_fifo=

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
