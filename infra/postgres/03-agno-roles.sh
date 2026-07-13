#!/bin/sh
set -eu

POSTGRES_HOST=${POSTGRES_HOST:-db}
POSTGRES_PORT=${POSTGRES_PORT:-5432}

require_nonblank() {
  name=$1
  value=$2
  case "$value" in
    *[![:space:]]*) ;;
    *)
      printf '%s\n' "$name is required and must not be blank" >&2
      exit 1
      ;;
  esac
}

require_nonblank POSTGRES_HOST "$POSTGRES_HOST"
require_nonblank POSTGRES_PORT "$POSTGRES_PORT"
require_nonblank POSTGRES_USER "${POSTGRES_USER-}"
require_nonblank POSTGRES_DB "${POSTGRES_DB-}"
require_nonblank POSTGRES_PASSWORD "${POSTGRES_PASSWORD-}"
require_nonblank AGNO_MIGRATOR_DATABASE_PASSWORD \
  "${AGNO_MIGRATOR_DATABASE_PASSWORD-}"
require_nonblank AGNO_DATABASE_PASSWORD "${AGNO_DATABASE_PASSWORD-}"

export PGPASSWORD="$POSTGRES_PASSWORD"
export AGNO_MIGRATOR_DATABASE_PASSWORD
export AGNO_DATABASE_PASSWORD

psql --set=ON_ERROR_STOP=1 \
  --host="$POSTGRES_HOST" \
  --port="$POSTGRES_PORT" \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --file="${AGNO_ROLE_SQL_FILE:-/opt/postgres/03-agno-roles.sql}"
