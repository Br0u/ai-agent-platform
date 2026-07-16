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
[ -f "$MODEL_API_KEY_FILE" ] || fail configuration

if key_permissions=$(stat -f %Lp "$MODEL_API_KEY_FILE" 2>/dev/null); then
  :
elif key_permissions=$(stat -c %a "$MODEL_API_KEY_FILE" 2>/dev/null); then
  :
else
  fail configuration
fi
[ "$key_permissions" = 600 ] || fail configuration

if ! root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." 2>/dev/null && pwd); then
  fail configuration
fi
cd "$root" 2>/dev/null || fail configuration

project="aap-provider-smoke-$$"
lock_root="${TMPDIR:-/tmp}/aap-provider-smoke-locks"
lock_dir="$lock_root/$project.lock"
temp_dir=
compose_log=
owns_project=false
lock_acquired=false

compose() {
  docker compose -p "$project" -f compose.provider-smoke.yaml "$@"
}

cleanup() {
  if [ "$owns_project" = true ] && [ -n "$compose_log" ]; then
    compose down --rmi local -v --remove-orphans >>"$compose_log" 2>&1 || :
  fi
  if [ -n "$temp_dir" ]; then
    rm -rf "$temp_dir" 2>/dev/null || :
  fi
  if [ "$lock_acquired" = true ]; then
    rm -rf "$lock_dir" 2>/dev/null || :
    rmdir "$lock_root" 2>/dev/null || :
  fi
  return 0
}

on_signal() {
  exit "$1"
}

trap cleanup EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

mkdir -p "$lock_root" 2>/dev/null || fail ownership
chmod 700 "$lock_root" 2>/dev/null || fail ownership
if ! mkdir -m 700 "$lock_dir" 2>/dev/null; then
  fail ownership
fi
lock_acquired=true

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/aap-provider-smoke.XXXXXX" 2>/dev/null) || fail ownership
chmod 700 "$temp_dir" 2>/dev/null || fail ownership
compose_log="$temp_dir/compose.log"
resource_probe="$temp_dir/resources"
service_output="$temp_dir/service.stdout"
expected_output="$temp_dir/expected.stdout"
: >"$compose_log"
: >"$resource_probe"
: >"$service_output"
: >"$expected_output"
chmod 600 "$compose_log" "$resource_probe" "$service_output" "$expected_output" 2>/dev/null || fail ownership

if ! docker ps -aq --filter "label=com.docker.compose.project=$project" >>"$resource_probe" 2>>"$compose_log"; then
  fail lifecycle
fi
if ! docker volume ls -q --filter "label=com.docker.compose.project=$project" >>"$resource_probe" 2>>"$compose_log"; then
  fail lifecycle
fi
if ! docker network ls -q --filter "label=com.docker.compose.project=$project" >>"$resource_probe" 2>>"$compose_log"; then
  fail lifecycle
fi
if ! docker image ls -q --filter "label=com.docker.compose.project=$project" >>"$resource_probe" 2>>"$compose_log"; then
  fail lifecycle
fi
[ ! -s "$resource_probe" ] || fail ownership

export MODEL_PROVIDER MODEL_ID MODEL_API_KEY_FILE
MODEL_RUN_TIMEOUT_SECONDS=${MODEL_RUN_TIMEOUT_SECONDS:-50}
export MODEL_RUN_TIMEOUT_SECONDS
if [ -z "${MODEL_BASE_URL-}" ]; then
  unset MODEL_BASE_URL
else
  export MODEL_BASE_URL
fi

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
cat "$service_output"
