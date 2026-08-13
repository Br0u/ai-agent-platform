#!/bin/sh

set -eu

[ "${RUN_SKILL_RUNTIME_E2E:-}" = true ] || {
  echo "set RUN_SKILL_RUNTIME_E2E=true to run the isolated Skill runtime acceptance" >&2
  exit 1
}

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

export SKILL_RUNTIME_E2E=true
export SKILL_REGISTRY_E2E_PROJECT=${SKILL_RUNTIME_E2E_PROJECT:-aap-skill-runtime-e2e-$$}
# The shared runner owns the isolated Compose/psql lifecycle and the marker-bound
# before/after Agent session count assertion.
exec docs/testing/run-skill-registry-e2e.sh
