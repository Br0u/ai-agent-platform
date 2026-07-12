#!/bin/sh

set -eu

interval_seconds="${BACKUP_INTERVAL_SECONDS:-86400}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
: "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL}"

mkdir -p /backups

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  temporary_file="/backups/.ai-agent-platform-${timestamp}.dump.tmp"
  backup_file="/backups/ai-agent-platform-${timestamp}.dump"

  pg_dump --dbname="$BACKUP_DATABASE_URL" --format=custom --no-owner --no-acl --file="$temporary_file"
  mv "$temporary_file" "$backup_file"
  find /backups -type f -name "ai-agent-platform-*.dump" -mtime "+${retention_days}" -exec rm -f {} +

  sleep "$interval_seconds"
done
