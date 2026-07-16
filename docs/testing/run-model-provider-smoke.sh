#!/bin/sh

set -eu

fail() {
  printf '%s\n' "provider smoke wrapper failed: $1" >&2
  exit 1
}

case "${MODEL_PROVIDER-}" in
  openai|anthropic|google|dashscope|deepseek|minimax) ;;
  *) fail configuration ;;
esac

[ -n "${MODEL_ID-}" ] || fail configuration
case "${MODEL_API_KEY_FILE-}" in
  /*) ;;
  *) fail configuration ;;
esac
[ ! -L "$MODEL_API_KEY_FILE" ] || fail configuration
[ -f "$MODEL_API_KEY_FILE" ] || fail configuration

if ! root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." 2>/dev/null && pwd); then
  fail configuration
fi
cd "$root" 2>/dev/null || fail configuration

temp_dir=
compose_log=
resource_probe=
project=
owns_project=false

compose() {
  docker compose -p "$project" -f compose.provider-smoke.yaml "$@"
}

probe_project_resources() {
  : >"$resource_probe" || return 1
  docker ps -aq --filter "label=com.docker.compose.project=$project" >>"$resource_probe" 2>>"$compose_log" || return 1
  docker volume ls -q --filter "label=com.docker.compose.project=$project" >>"$resource_probe" 2>>"$compose_log" || return 1
  docker network ls -q --filter "label=com.docker.compose.project=$project" >>"$resource_probe" 2>>"$compose_log" || return 1
  docker image ls -q --filter "label=com.docker.compose.project=$project" >>"$resource_probe" 2>>"$compose_log" || return 1
  docker image ls -q "$project-*" >>"$resource_probe" 2>>"$compose_log" || return 1
}

cleanup_project_and_verify() {
  compose down --rmi local -v --remove-orphans >>"$compose_log" 2>&1 || return 1
  probe_project_resources || return 1
  [ ! -s "$resource_probe" ] || return 1
  owns_project=false
}

cleanup() {
  if [ "$owns_project" = true ] && [ -n "$compose_log" ]; then
    compose down --rmi local -v --remove-orphans >>"$compose_log" 2>&1 || :
  fi
  if [ -n "$temp_dir" ]; then
    rm -rf "$temp_dir" 2>/dev/null || :
  fi
  return 0
}

on_signal() {
  exit "$1"
}

trap cleanup EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/aap-provider-smoke.XXXXXX" 2>/dev/null) || fail ownership
chmod 700 "$temp_dir" 2>/dev/null || fail ownership
temp_name=${temp_dir##*/}
project_suffix=${temp_name##*.}
if ! project_suffix=$(printf '%s' "$project_suffix" | tr '[:upper:]' '[:lower:]' 2>/dev/null); then
  fail ownership
fi
case "$project_suffix" in
  ''|*[!a-z0-9]*) fail ownership ;;
esac
project="aap-provider-smoke-$project_suffix"

compose_log="$temp_dir/compose.log"
resource_probe="$temp_dir/resources"
service_output="$temp_dir/service.stdout"
expected_output="$temp_dir/expected.stdout"
key_snapshot="$temp_dir/model_api_key"
: >"$compose_log"
: >"$resource_probe"
: >"$service_output"
: >"$expected_output"
chmod 600 "$compose_log" "$resource_probe" "$service_output" "$expected_output" 2>/dev/null || fail ownership

snapshot_helper='import os
import stat

source_fd = -1
target_fd = -1
try:
    no_follow = getattr(os, "O_NOFOLLOW", None)
    nonblocking = getattr(os, "O_NONBLOCK", None)
    if no_follow is None or nonblocking is None:
        raise OSError("required open flags are unavailable")
    source_fd = os.open(
        os.environ["AAP_PROVIDER_SMOKE_KEY_SOURCE"],
        os.O_RDONLY | no_follow | nonblocking,
    )
    metadata = os.fstat(source_fd)
    if not stat.S_ISREG(metadata.st_mode):
        raise OSError("invalid source")
    if stat.S_IMODE(metadata.st_mode) != 0o600:
        raise OSError("invalid mode")
    target_fd = os.open(
        os.environ["AAP_PROVIDER_SMOKE_KEY_SNAPSHOT"],
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | no_follow,
        0o600,
    )
    while True:
        chunk = os.read(source_fd, 65536)
        if not chunk:
            break
        view = memoryview(chunk)
        while view:
            written = os.write(target_fd, view)
            if written <= 0:
                raise OSError("snapshot write failed")
            view = view[written:]
finally:
    if target_fd >= 0:
        os.close(target_fd)
    if source_fd >= 0:
        os.close(source_fd)
'
export AAP_PROVIDER_SMOKE_KEY_SOURCE="$MODEL_API_KEY_FILE"
export AAP_PROVIDER_SMOKE_KEY_SNAPSHOT="$key_snapshot"
if ! TMPDIR=$temp_dir python3 -c "$snapshot_helper" >>"$compose_log" 2>&1; then
  unset AAP_PROVIDER_SMOKE_KEY_SOURCE AAP_PROVIDER_SMOKE_KEY_SNAPSHOT
  fail configuration
fi
unset AAP_PROVIDER_SMOKE_KEY_SOURCE AAP_PROVIDER_SMOKE_KEY_SNAPSHOT

MODEL_API_KEY_FILE=$key_snapshot
export MODEL_PROVIDER MODEL_ID MODEL_API_KEY_FILE
MODEL_RUN_TIMEOUT_SECONDS=${MODEL_RUN_TIMEOUT_SECONDS:-50}
export MODEL_RUN_TIMEOUT_SECONDS
if [ -z "${MODEL_BASE_URL-}" ]; then
  unset MODEL_BASE_URL
else
  export MODEL_BASE_URL
fi

if ! probe_project_resources; then
  fail lifecycle
fi
[ ! -s "$resource_probe" ] || fail ownership

owns_project=true
if ! compose config --quiet >>"$compose_log" 2>&1; then
  fail configuration
fi
if ! compose build --pull smoke >>"$compose_log" 2>&1; then
  fail lifecycle
fi
if ! compose create smoke >>"$compose_log" 2>&1; then
  fail lifecycle
fi
if ! compose run --rm smoke python -m agent_service.provider_smoke --validate-only >>"$compose_log" 2>&1; then
  fail configuration
fi
if ! compose run --rm smoke >"$service_output" 2>>"$compose_log"; then
  fail provider
fi

printf '%s\n' "$MODEL_PROVIDER/$MODEL_ID: verified" >"$expected_output"
if ! cmp -s "$expected_output" "$service_output"; then
  fail output
fi
if ! cleanup_project_and_verify; then
  fail cleanup
fi
cat "$service_output"
