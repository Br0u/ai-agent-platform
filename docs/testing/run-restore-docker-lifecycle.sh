#!/bin/sh

set -eu

mode=${1:-}
case "$mode" in
  timeout|controlled-failure|corruption) ;;
  *)
    echo "usage: $0 timeout|controlled-failure|corruption" >&2
    exit 64
    ;;
esac

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

base_image=aap-backup-lifecycle-base-task9
stubborn_image=aap-backup-lifecycle-stubborn-task9
copy_image=aap-backup-lifecycle-copy-task9
temporary_directory=
success_message=

cleanup() {
  cleanup_status=$?
  cleanup_failed=false
  trap '' INT TERM
  trap - EXIT
  if command -v docker >/dev/null 2>&1; then
    if ! docker image rm -f \
      "$copy_image" "$stubborn_image" "$base_image" \
      >/dev/null 2>&1; then
      cleanup_failed=true
    fi
  fi
  if [ -n "$temporary_directory" ]; then
    if rm -rf "$temporary_directory" >/dev/null 2>&1; then
      temporary_directory=
    else
      cleanup_failed=true
    fi
  fi
  if [ "$cleanup_failed" = true ]; then
    echo "restore lifecycle runner cleanup failed" >&2
    if [ "$cleanup_status" -eq 0 ]; then
      cleanup_status=1
    fi
  elif [ "$cleanup_status" -eq 0 ] && [ -n "$success_message" ]; then
    printf '%s\n' "$success_message"
  fi
  exit "$cleanup_status"
}

on_signal() {
  trap '' INT TERM
  exit "$1"
}

trap 'cleanup' EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

command -v docker >/dev/null 2>&1 || {
  echo "docker is required" >&2
  exit 1
}

runtime_tmp=${TMPDIR:-/tmp}
case "$runtime_tmp" in
  /*) ;;
  *)
    echo "TMPDIR must be an absolute path" >&2
    exit 1
    ;;
esac

umask 077
temporary_directory=$(mktemp -d "$runtime_tmp/aap-restore-lifecycle.XXXXXX")
restore_root="$temporary_directory/restore"
fixture_root="$temporary_directory/fixture"
key_file="$temporary_directory/backup-encryption-key"
encrypted_file="$temporary_directory/fixture.bundle.gpg"
output_file="$temporary_directory/restore.output"
mkdir -p "$restore_root" "$fixture_root"
chmod 700 "$temporary_directory" "$restore_root" "$fixture_root"
printf '%s\n' '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' \
  >"$key_file"
chmod 600 "$key_file"

docker build \
  --tag "$base_image" \
  --file infra/docker/backup.Dockerfile \
  .

case "$mode" in
  timeout)
    docker build \
      --tag "$stubborn_image" \
      --file docs/testing/fixtures/restore-docker-lifecycle/stubborn.Dockerfile \
      .
    printf '%s\n' 'stubborn decrypt fixture' >"$encrypted_file"
    crypto_image=$stubborn_image
    decrypt_timeout=1
    docker_cli_timeout=5
    expected_output='restore drill decryption timed out'
    maximum_elapsed=30
    ;;
  controlled-failure)
    docker build \
      --tag "$copy_image" \
      --file docs/testing/fixtures/restore-docker-lifecycle/copy.Dockerfile \
      .
    printf '%s\n' 'not-a-postgresql-custom-dump' \
      >"$fixture_root/database.dump"
    if command -v sha256sum >/dev/null 2>&1; then
      dump_digest=$(sha256sum "$fixture_root/database.dump")
      dump_digest=${dump_digest%% *}
    elif command -v shasum >/dev/null 2>&1; then
      dump_digest=$(shasum -a 256 "$fixture_root/database.dump")
      dump_digest=${dump_digest%% *}
    else
      echo "sha256sum or shasum is required" >&2
      exit 1
    fi
    printf '%s\n' 'format_version=1' >"$fixture_root/download-files.manifest"
    if command -v sha256sum >/dev/null 2>&1; then
      download_manifest_digest=$(sha256sum "$fixture_root/download-files.manifest")
      download_manifest_digest=${download_manifest_digest%% *}
    else
      download_manifest_digest=$(shasum -a 256 "$fixture_root/download-files.manifest")
      download_manifest_digest=${download_manifest_digest%% *}
    fi
    cat >"$fixture_root/skill-backup.manifest" <<EOF
format_version=2
dump_sha256=$dump_digest
skill_registry_schema_version=1
skill_revision_count=0
skill_artifact_count=0
skill_file_count=0
download_manifest_sha256=$download_manifest_digest
download_artifact_count=0
download_artifact_bytes=0
EOF
    COPYFILE_DISABLE=1 tar --no-xattrs -cf "$encrypted_file" \
      -C "$fixture_root" \
      skill-backup.manifest download-files.manifest database.dump
    crypto_image=$copy_image
    decrypt_timeout=30
    docker_cli_timeout=10
    expected_output='restore drill failed database restore'
    maximum_elapsed=90
    ;;
  corruption)
    command -v python3 >/dev/null 2>&1 || {
      echo "python3 is required" >&2
      exit 1
    }
    docker build \
      --tag "$copy_image" \
      --file docs/testing/fixtures/restore-docker-lifecycle/copy.Dockerfile \
      .
    corruption_root="$temporary_directory/corruption"
    mkdir -p "$corruption_root"
    python3 - "$corruption_root" <<'PY'
import hashlib
import io
import pathlib
import tarfile
import sys

root = pathlib.Path(sys.argv[1])
resource = "00000000-0000-4000-8000-000000000001"
revision = "00000000-0000-4000-8000-000000000002"
key = f"objects/{resource}/{revision}.pdf"
member = f"download-resources/{key}"
artifact = b"test"
database = b"not-a-postgresql-custom-dump"

def download_manifest(*, digest=None, size=None, object_key=None, duplicate=False, final_lf=True):
    digest = digest or hashlib.sha256(artifact).hexdigest()
    size = str(len(artifact)) if size is None else size
    object_key = object_key or key
    line = f"{digest}\t{size}\t{object_key}\n"
    manifest = "format_version=1\n" + line + (line if duplicate else "")
    return (manifest if final_lf else manifest[:-1]).encode()

def skill_manifest(download):
    count = max(0, len(download.splitlines()) - 1)
    byte_count = len(artifact) * count
    return f"""format_version=2
dump_sha256={hashlib.sha256(database).hexdigest()}
skill_registry_schema_version=1
skill_revision_count=0
skill_artifact_count=0
skill_file_count=0
download_manifest_sha256={hashlib.sha256(download).hexdigest()}
download_artifact_count={count}
download_artifact_bytes={byte_count}
""".encode()

def regular(name, data):
    info = tarfile.TarInfo(name)
    info.mode = 0o600
    info.size = len(data)
    return info, io.BytesIO(data)

def write(name, *, download=None, artifact_name=member, artifact_info=None, extra=()):
    download = download or download_manifest()
    with tarfile.open(root / f"{name}.tar", "w", format=tarfile.GNU_FORMAT) as archive:
        for entry_name, data in (
            ("skill-backup.manifest", skill_manifest(download)),
            ("download-files.manifest", download),
            ("database.dump", database),
        ):
            info, stream = regular(entry_name, data)
            archive.addfile(info, stream)
        if artifact_info is None:
            info, stream = regular(artifact_name, artifact)
        else:
            info, stream = artifact_info, None
        archive.addfile(info, stream)
        for info, stream in extra:
            archive.addfile(info, stream)

write("absolute", artifact_name="/" + member)
write("parent", artifact_name="../escape.pdf")
for name, entry_type in (
    ("symlink", tarfile.SYMTYPE),
    ("hardlink", tarfile.LNKTYPE),
    ("device", tarfile.CHRTYPE),
):
    info = tarfile.TarInfo(member)
    info.type = entry_type
    info.linkname = "database.dump"
    info.devmajor = 1
    info.devminor = 3
    write(name, artifact_info=info)
duplicate_info, duplicate_stream = regular(member, artifact)
write("duplicate-member", extra=((duplicate_info, duplicate_stream),))
write("duplicate-manifest-key", download=download_manifest(duplicate=True))
write("malformed-manifest", download=download_manifest(digest="A" * 64))
write("missing-final-lf", download=download_manifest(final_lf=False))
write("oversized-manifest", download=b"format_version=1\n" + b"x" * 4194304)
unexpected_key = key[:-4] + ".txt"
write(
    "unexpected-extension",
    download=download_manifest(object_key=unexpected_key),
    artifact_name="download-resources/" + unexpected_key,
)
write("wrong-size", download=download_manifest(size="5"))
write("wrong-digest", download=download_manifest(digest="0" * 64))
write("oversized-member")
PY

    for corruption_bundle in "$corruption_root"/*.tar; do
      corruption_name=${corruption_bundle##*/}
      corruption_name=${corruption_name%.tar}
      corruption_output="$temporary_directory/$corruption_name.output"
      corruption_max_download=17179869184
      [ "$corruption_name" != oversized-member ] || corruption_max_download=3
      set +e
      BACKUP_ENCRYPTION_KEY_FILE="$key_file" \
      BACKUP_CRYPTO_IMAGE="$copy_image" \
      RESTORE_TMP_ROOT="$restore_root" \
      RESTORE_MAX_ENCRYPTED_BYTES=8388608 \
      RESTORE_MAX_DECRYPTED_BYTES=8388608 \
      RESTORE_DOWNLOAD_MAX_BYTES="$corruption_max_download" \
      RESTORE_SPACE_SAFETY_BYTES=0 \
      RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS=10 \
      RESTORE_DOCKER_CLI_TIMEOUT_SECONDS=10 \
      RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS=2 \
      RESTORE_DECRYPT_TIMEOUT_SECONDS=30 \
      RESTORE_DECRYPT_KILL_AFTER_SECONDS=2 \
      RESTORE_DECRYPT_RECONCILE_ATTEMPTS=3 \
      RESTORE_DOCKER_CREATE_SETTLE_SECONDS=5 \
        sh infra/docker/restore-drill.sh \
          "$corruption_bundle" 1 1 \
          00000000-0000-4000-8000-000000000001 \
          backup-restore-session-fixture-v1 \
          >"$corruption_output" 2>&1
      corruption_status=$?
      set -e
      if [ "$corruption_status" -ne 1 ] || \
         ! grep -Eq '^restore drill rejected ' "$corruption_output"; then
        sed 's/^/restore-output: /' "$corruption_output" >&2
        echo "$corruption_name corruption fixture was not rejected" >&2
        exit 1
      fi
      if find "$restore_root" -mindepth 1 -print | grep -q .; then
        echo "$corruption_name corruption fixture left a temporary path" >&2
        exit 1
      fi
    done
    if docker ps -a --filter 'name=aap-restore-' --format '{{.Names}}' | grep -q . || \
       docker volume ls --filter 'name=aap-restore-' --format '{{.Name}}' | grep -q .; then
      echo "corruption restore left a Docker resource" >&2
      exit 1
    fi
    success_message="corruption restore lifecycle acceptance passed"
    exit 0
    ;;
esac
chmod 600 "$encrypted_file"

started_at=$(date +%s)
set +e
BACKUP_ENCRYPTION_KEY_FILE="$key_file" \
BACKUP_CRYPTO_IMAGE="$crypto_image" \
RESTORE_TMP_ROOT="$restore_root" \
RESTORE_MAX_ENCRYPTED_BYTES=1048576 \
RESTORE_MAX_DECRYPTED_BYTES=1048576 \
RESTORE_SPACE_SAFETY_BYTES=0 \
RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS=10 \
RESTORE_DOCKER_CLI_TIMEOUT_SECONDS="$docker_cli_timeout" \
RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS=2 \
RESTORE_DECRYPT_TIMEOUT_SECONDS="$decrypt_timeout" \
RESTORE_DECRYPT_KILL_AFTER_SECONDS=2 \
RESTORE_DECRYPT_RECONCILE_ATTEMPTS=3 \
RESTORE_DOCKER_CREATE_SETTLE_SECONDS=5 \
  sh infra/docker/restore-drill.sh \
    "$encrypted_file" \
    1 \
    1 \
    00000000-0000-4000-8000-000000000001 \
    backup-restore-session-fixture-v1 \
    >"$output_file" 2>&1
restore_status=$?
set -e
elapsed_seconds=$(($(date +%s) - started_at))

if [ "$restore_status" -ne 1 ]; then
  echo "$mode restore exited with status $restore_status instead of 1" >&2
  exit 1
fi
if [ "$(cat "$output_file")" != "$expected_output" ]; then
  echo "$mode restore emitted unexpected output" >&2
  exit 1
fi
if [ "$elapsed_seconds" -gt "$maximum_elapsed" ]; then
  echo "$mode restore exceeded its bounded runtime" >&2
  exit 1
fi
if find "$restore_root" -mindepth 1 -print | grep -q .; then
  echo "$mode restore left a temporary path" >&2
  exit 1
fi
if docker ps -a --filter 'name=aap-restore-' --format '{{.Names}}' | grep -q .; then
  echo "$mode restore left a container" >&2
  exit 1
fi
if docker volume ls --filter 'name=aap-restore-' --format '{{.Name}}' | grep -q .; then
  echo "$mode restore left a volume" >&2
  exit 1
fi

success_message="$mode restore lifecycle acceptance passed in ${elapsed_seconds}s"
