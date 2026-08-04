#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
if [ -z "${AAP_ASSISTANT_EXPERIENCE_E2E_ENV_FILE-}" ]; then
  runtime_tmp=${TMPDIR:-/tmp}
  case "$runtime_tmp" in
    /*) ;;
    *)
      echo "TMPDIR must be an absolute path" >&2
      exit 1
      ;;
  esac
  umask 077
  command -v openssl >/dev/null 2>&1 || {
    echo "openssl is required" >&2
    exit 1
  }
  private_dir=$(mktemp -d "$runtime_tmp/aap-identity-access-e2e.XXXXXX") || {
    echo "unable to create private identity E2E directory" >&2
    exit 1
  }
  private_owner_file="$private_dir/owner-token"
  private_token=
  private_ready=false

  cleanup_private_dir() {
    if [ -L "$private_dir" ] || [ ! -d "$private_dir" ]; then
      echo "Identity E2E private directory ownership changed; refusing cleanup" >&2
      return 1
    fi
    if [ "$private_ready" != true ]; then
      if [ -e "$private_owner_file" ] || [ -L "$private_owner_file" ]; then
        if [ -L "$private_owner_file" ] || [ ! -f "$private_owner_file" ] ||
          ! rm -f "$private_owner_file"; then
          echo "Identity E2E private marker is unsafe; refusing cleanup" >&2
          return 1
        fi
      fi
      if ! rmdir "$private_dir" 2>/dev/null; then
        echo "Identity E2E private directory cleanup left residue" >&2
        return 1
      fi
      return 0
    fi
    if [ -L "$private_owner_file" ] || [ ! -f "$private_owner_file" ] ||
      [ "$(cat "$private_owner_file" 2>/dev/null || true)" != "$private_token" ]; then
      echo "Identity E2E private directory ownership changed; refusing cleanup" >&2
      return 1
    fi
    if ! rm -f "$private_owner_file" || ! rmdir "$private_dir" 2>/dev/null; then
      echo "Identity E2E private directory cleanup left residue" >&2
      return 1
    fi
  }

  on_exit() {
    status=$?
    trap - EXIT
    cleanup_status=0
    cleanup_private_dir || cleanup_status=$?
    if [ "$status" -ne 0 ]; then
      exit "$status"
    fi
    exit "$cleanup_status"
  }

  trap on_exit EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  private_token=$(openssl rand -hex 16)
  (umask 077 && printf '%s\n' "$private_token" >"$private_owner_file")
  chmod 600 "$private_owner_file"
  private_ready=true
  export AAP_ASSISTANT_EXPERIENCE_E2E_ENV_FILE="$private_dir/env"
fi
export AAP_ASSISTANT_EXPERIENCE_E2E_SUITE=identity

sh "$repo_root/docs/testing/run-assistant-experience-e2e.sh"
