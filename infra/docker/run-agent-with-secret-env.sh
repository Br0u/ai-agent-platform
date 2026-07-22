#!/bin/sh

set -eu

skill_runtime_root=${SKILL_RUNTIME_ROOT:-/run/aap-skills}
[ "$skill_runtime_root" = /run/aap-skills ] || {
  echo "Agent Skill runtime root is invalid." >&2
  exit 1
}
runtime_filesystem=$(stat -f -c '%T' "$skill_runtime_root" 2>/dev/null || true)
runtime_metadata=$(stat -c '%F:%u:%g:%a' "$skill_runtime_root" 2>/dev/null || true)
[ "$runtime_filesystem" = tmpfs ] && \
  [ "$runtime_metadata" = "directory:10001:10001:700" ] || {
  echo "Agent Skill runtime root mount is invalid." >&2
  exit 1
}
[ -d "$skill_runtime_root" ] && [ -w "$skill_runtime_root" ] && [ -x "$skill_runtime_root" ] || {
  echo "Agent Skill runtime root is unavailable." >&2
  exit 1
}

if [ -z "${MODEL_PROVIDER-}" ] && [ -z "${MODEL_ID-}" ]; then
  unset MODEL_PROVIDER MODEL_ID MODEL_BASE_URL
  SECRET_ENV_SPECS=${SECRET_ENV_SPECS%MODEL_API_KEY=/run/secrets/model_api_key}
  export SECRET_ENV_SPECS
elif [ -z "${MODEL_BASE_URL-}" ]; then
  unset MODEL_BASE_URL
fi

exec /opt/aap/run-with-secret-env.sh "$@"
