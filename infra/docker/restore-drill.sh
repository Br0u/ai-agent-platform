#!/bin/sh

set -eu

backup_file="${1:-}"
expected_user_count="${2:-}"
expected_agno_session_count="${3:-}"
expected_user_id="${4:-}"
expected_agno_session_id="${5:-}"
if [ "$#" -ne 5 ] || [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
  echo "usage: $0 ENCRYPTED_BUNDLE EXPECTED_USERS EXPECTED_AGNO_SESSIONS USER_FIXTURE_ID AGNO_SESSION_FIXTURE_ID" >&2
  exit 64
fi
: "${BACKUP_ENCRYPTION_KEY_FILE:?Set BACKUP_ENCRYPTION_KEY_FILE to a readable secret file}"
script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
"$script_directory/validate-backup-key.sh" "$BACKUP_ENCRYPTION_KEY_FILE"
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
volume="aap-restore-drill-$run_id"
database="restore_drill"
owner="restore_owner"
crypto_image="${BACKUP_CRYPTO_IMAGE:-ai-agent-platform-backup:latest}"
expected_migrations="7"
expected_latest_migration="1784480751831"
temporary_directory=
postgres_env_file=
decrypted_bundle_candidate=
decrypted_bundle=
extraction_directory=

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  if [ -n "$temporary_directory" ]; then
    rm -rf "$temporary_directory"
  fi
}

on_signal() {
  code=$1
  cleanup
  trap - EXIT
  exit "$code"
}

trap cleanup EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

umask 077
restore_tmp_root="${RESTORE_TMP_ROOT:-${TMPDIR:-/tmp}}"
mkdir -p "$restore_tmp_root"
temporary_directory="$(mktemp -d "$restore_tmp_root/aap-restore-drill.XXXXXX")"
postgres_env_file="$temporary_directory/postgres.env"
gpg_home="$temporary_directory/gnupg"
decrypted_bundle_candidate="$temporary_directory/restored.bundle.partial"
decrypted_bundle="$temporary_directory/restored.bundle"
extraction_directory="$temporary_directory/extracted"
mkdir -p "$gpg_home"
chmod 700 "$gpg_home"
cat >"$postgres_env_file" <<EOF
POSTGRES_DB=$database
POSTGRES_USER=$owner
POSTGRES_HOST_AUTH_METHOD=trust
EOF
chmod 600 "$postgres_env_file"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --entrypoint gpg \
  -v "$(dirname "$backup_file"):/input:ro" \
  -v "$temporary_directory:/work" \
  -v "$BACKUP_ENCRYPTION_KEY_FILE:/run/secrets/backup_encryption_key:ro" \
  "$crypto_image" \
  --homedir /work/gnupg \
  --batch \
  --yes \
  --no-tty \
  --pinentry-mode loopback \
  --no-symkey-cache \
  --passphrase-file /run/secrets/backup_encryption_key \
  --output /work/restored.bundle.partial \
  --decrypt "/input/$(basename "$backup_file")"
chmod 600 "$decrypted_bundle_candidate"
mv "$decrypted_bundle_candidate" "$decrypted_bundle"

if ! docker run --rm \
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
  ' >/dev/null 2>&1; then
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
dump_digest_output="$(docker run --rm \
  --user "$(id -u):$(id -g)" \
  --entrypoint sha256sum \
  -v "$extraction_directory:/input:ro" \
  "$crypto_image" /input/database.dump 2>/dev/null)"
actual_dump_sha256=${dump_digest_output%% *}
unset dump_digest_output
if [ "$actual_dump_sha256" != "$manifest_dump_sha256" ]; then
  echo "restore drill rejected backup dump digest mismatch" >&2
  exit 1
fi

docker volume create "$volume" >/dev/null
docker run -d --name "$container" \
  --env-file "$postgres_env_file" \
  -v "$volume:/var/lib/postgresql" \
  -v "$temporary_directory:/restore:ro" \
  postgres:18.3-alpine3.23 >/dev/null

attempt=0
until docker exec "$container" pg_isready -U "$owner" -d "$database" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "restore drill database did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec "$container" pg_restore \
  --username="$owner" --dbname="$database" --clean --if-exists --no-owner --no-acl \
  /restore/extracted/database.dump

migration_count="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM drizzle.__drizzle_migrations")"
latest_migration="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT max(created_at) FROM drizzle.__drizzle_migrations")"
schema_contract="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
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
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'roles_super_admin_delete_guard' AND NOT tgisinternal)")"
user_count="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM public.users")"
agno_session_count="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM agno.agno_sessions")"
agno_schema_version_count="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM agno.agno_schema_versions")"
restored_user_fixture_count="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM public.users WHERE id = '$expected_user_id'::uuid")"
restored_agno_session_fixture_count="$(docker exec "$container" psql -U "$owner" -d "$database" -Atqc \
  "SELECT count(*) FROM agno.agno_sessions WHERE session_id = '$expected_agno_session_id'")"
skill_registry_snapshot="$(docker exec "$container" psql \
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
COMMIT;")"

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

echo "restore drill passed: migrations=$migration_count latest=$latest_migration users=$user_count agno_sessions=$agno_session_count agno_schema_versions=$agno_schema_version_count skill_registry_version=$skill_registry_schema_version revisions=$skill_revision_count artifacts=$skill_artifact_count files=$skill_file_count artifact_digests_verified=$skill_artifact_digest_count"
