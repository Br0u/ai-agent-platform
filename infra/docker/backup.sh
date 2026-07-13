#!/bin/sh

set -eu

umask 077

interval_seconds="${BACKUP_INTERVAL_SECONDS:-86400}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
backup_directory="${BACKUP_DIRECTORY:-/backups}"
temporary_directory="${BACKUP_TMP_DIRECTORY:-/tmp}"
run_once="${BACKUP_RUN_ONCE:-false}"
PGHOST="${PGHOST:-db}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-ai_agent_platform}"
PGUSER="${PGUSER:-ai_agent_backup}"
BACKUP_DATABASE_PASSWORD_FILE="${BACKUP_DATABASE_PASSWORD_FILE:-/run/secrets/backup_database_password}"
BACKUP_ENCRYPTION_KEY_FILE="${BACKUP_ENCRYPTION_KEY_FILE:-/run/secrets/backup_encryption_key}"

for secret_file in "$BACKUP_DATABASE_PASSWORD_FILE" "$BACKUP_ENCRYPTION_KEY_FILE"; do
  if [ ! -r "$secret_file" ] || [ ! -s "$secret_file" ]; then
    echo "required backup secret file is missing or empty" >&2
    exit 78
  fi
done

if [ "$(wc -c <"$BACKUP_ENCRYPTION_KEY_FILE")" -lt 32 ]; then
  echo "backup encryption key must contain at least 32 characters" >&2
  exit 78
fi

mkdir -p "$backup_directory" "$temporary_directory"

pgpass_file=
plaintext_temporary_file=
encrypted_temporary_file=

cleanup() {
  [ -z "$pgpass_file" ] || rm -f "$pgpass_file"
  [ -z "$plaintext_temporary_file" ] || rm -f "$plaintext_temporary_file"
  [ -z "$encrypted_temporary_file" ] || rm -f "$encrypted_temporary_file"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

escape_pgpass() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/:/\\:/g'
}

pgpass_file="$(mktemp "$temporary_directory/.aap-pgpass.XXXXXX")"
chmod 600 "$pgpass_file"
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
  plaintext_temporary_file="$(mktemp "$temporary_directory/.ai-agent-platform-${timestamp}.dump.XXXXXX")"
  encrypted_temporary_file="$backup_directory/.ai-agent-platform-${timestamp}.dump.enc.tmp"
  backup_file="$backup_directory/ai-agent-platform-${timestamp}.dump.enc"

  PGPASSFILE="$pgpass_file" pg_dump \
    --host="$PGHOST" \
    --port="$PGPORT" \
    --username="$PGUSER" \
    --dbname="$PGDATABASE" \
    --format=custom \
    --no-owner \
    --no-acl \
    --schema=public \
    --schema=drizzle \
    --schema=agno \
    --file="$plaintext_temporary_file"

  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -md sha256 \
    -pass "file:$BACKUP_ENCRYPTION_KEY_FILE" \
    -in "$plaintext_temporary_file" \
    -out "$encrypted_temporary_file"
  chmod 600 "$encrypted_temporary_file"
  rm -f "$plaintext_temporary_file"
  plaintext_temporary_file=
  mv "$encrypted_temporary_file" "$backup_file"
  encrypted_temporary_file=
  find "$backup_directory" -type f -name "ai-agent-platform-*.dump.enc" \
    -mtime "+${retention_days}" -exec rm -f {} +

  case "$run_once" in
    true|1) break ;;
  esac
  sleep "$interval_seconds"
done
