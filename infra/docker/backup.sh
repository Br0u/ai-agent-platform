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
script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

for secret_file in "$BACKUP_DATABASE_PASSWORD_FILE" "$BACKUP_ENCRYPTION_KEY_FILE"; do
  if [ ! -r "$secret_file" ] || [ ! -s "$secret_file" ]; then
    echo "required backup secret file is missing or empty" >&2
    exit 78
  fi
done

"$script_directory/validate-backup-key.sh" "$BACKUP_ENCRYPTION_KEY_FILE"

mkdir -p "$backup_directory" "$temporary_directory"

pgpass_file=
plaintext_temporary_file=
encrypted_temporary_file=
gpg_home=

cleanup() {
  [ -z "$pgpass_file" ] || rm -f "$pgpass_file"
  [ -z "$plaintext_temporary_file" ] || rm -f "$plaintext_temporary_file"
  [ -z "$encrypted_temporary_file" ] || rm -f "$encrypted_temporary_file"
  [ -z "$gpg_home" ] || rm -rf "$gpg_home"
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
  plaintext_temporary_file="$(mktemp "$temporary_directory/.ai-agent-platform-${timestamp}.dump.XXXXXX")"
  encrypted_temporary_file="$backup_directory/.ai-agent-platform-${timestamp}.dump.gpg.tmp"
  backup_file="$backup_directory/ai-agent-platform-${timestamp}.dump.gpg"

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

  gpg --homedir "$gpg_home" \
    --batch \
    --yes \
    --no-tty \
    --pinentry-mode loopback \
    --no-symkey-cache \
    --passphrase-file "$BACKUP_ENCRYPTION_KEY_FILE" \
    --symmetric \
    --cipher-algo AES256 \
    --s2k-mode 3 \
    --s2k-digest-algo SHA512 \
    --s2k-count 65011712 \
    --force-mdc \
    --compress-algo none \
    --output "$encrypted_temporary_file" \
    "$plaintext_temporary_file"
  chmod 600 "$encrypted_temporary_file"
  rm -f "$plaintext_temporary_file"
  plaintext_temporary_file=
  mv "$encrypted_temporary_file" "$backup_file"
  encrypted_temporary_file=
  find "$backup_directory" -type f -name "ai-agent-platform-*.dump.gpg" \
    -mtime "+${retention_days}" -exec rm -f {} +

  case "$run_once" in
    true|1) break ;;
  esac
  sleep "$interval_seconds"
done
