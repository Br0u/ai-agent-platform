#!/bin/sh
set -eu

: "${MIGRATOR_DATABASE_PASSWORD:?Set MIGRATOR_DATABASE_PASSWORD}"
: "${RUNTIME_DATABASE_PASSWORD:?Set RUNTIME_DATABASE_PASSWORD}"
: "${BACKUP_DATABASE_PASSWORD:?Set BACKUP_DATABASE_PASSWORD}"

psql --set=ON_ERROR_STOP=1 \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --set=migrator_password="$MIGRATOR_DATABASE_PASSWORD" \
  --set=runtime_password="$RUNTIME_DATABASE_PASSWORD" \
  --set=backup_password="$BACKUP_DATABASE_PASSWORD" \
  --file=/opt/postgres/01-roles.sql
