#!/bin/sh
set -eu

load_secret_file() {
  variable_name=$1
  secret_file=$2
  if [ ! -r "$secret_file" ]; then
    printf '%s\n' "$variable_name secret is unavailable" >&2
    exit 1
  fi
  secret_value=$(cat "$secret_file")
  case "$secret_value" in
    *[![:space:]]*) ;;
    *)
      printf '%s\n' "$variable_name secret must not be blank" >&2
      exit 1
      ;;
  esac
  export "$variable_name=$secret_value"
  unset secret_value
}

if [ -n "${MIGRATOR_DATABASE_PASSWORD_FILE-}" ]; then
  load_secret_file MIGRATOR_DATABASE_PASSWORD "$MIGRATOR_DATABASE_PASSWORD_FILE"
fi
if [ -n "${RUNTIME_DATABASE_PASSWORD_FILE-}" ]; then
  load_secret_file RUNTIME_DATABASE_PASSWORD "$RUNTIME_DATABASE_PASSWORD_FILE"
fi
if [ -n "${BACKUP_DATABASE_PASSWORD_FILE-}" ]; then
  load_secret_file BACKUP_DATABASE_PASSWORD "$BACKUP_DATABASE_PASSWORD_FILE"
fi

: "${MIGRATOR_DATABASE_PASSWORD:?Set MIGRATOR_DATABASE_PASSWORD}"
: "${RUNTIME_DATABASE_PASSWORD:?Set RUNTIME_DATABASE_PASSWORD}"
: "${BACKUP_DATABASE_PASSWORD:?Set BACKUP_DATABASE_PASSWORD}"

export MIGRATOR_DATABASE_PASSWORD
export RUNTIME_DATABASE_PASSWORD
export BACKUP_DATABASE_PASSWORD

psql --set=ON_ERROR_STOP=1 \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --file="${ROLE_SQL_FILE:-/opt/postgres/01-roles.sql}"
