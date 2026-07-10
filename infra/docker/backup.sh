#!/bin/sh

set -eu

interval_seconds="${BACKUP_INTERVAL_SECONDS:-86400}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p /backups

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  temporary_file="/backups/.${PGDATABASE}-${timestamp}.dump.tmp"
  backup_file="/backups/${PGDATABASE}-${timestamp}.dump"

  pg_dump --format=custom --no-owner --no-acl --file="$temporary_file"
  mv "$temporary_file" "$backup_file"
  find /backups -type f -name "${PGDATABASE}-*.dump" -mtime "+${retention_days}" -exec rm -f {} +

  sleep "$interval_seconds"
done
